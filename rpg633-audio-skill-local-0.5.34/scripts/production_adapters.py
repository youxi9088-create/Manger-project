#!/usr/bin/env python3
"""Deterministic production adapters for the RPG audio v2 runner."""

from __future__ import annotations

import hashlib
import http.client
import ipaddress
import json
import math
from array import array
import os
import socket
import ssl
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import unicodedata
import urllib.request
from urllib.parse import unquote_plus, urlparse
import wave

import wall_budget
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Mapping

import wall_budget


MAX_PROVIDER_BYTES = 100 * 1024 * 1024
MAX_READBACK_BYTES = 100 * 1024 * 1024
LEASE_RENEW_TIMEOUT_SECONDS = 15.0
LEASE_HEARTBEAT_INTERVAL_SECONDS = 30.0
RENEW_LEASE_HELPER = Path(__file__).resolve().parent / "renew_lease_once.py"
REQUIRED_BRANCH_VIDEO_AGENT_BASE_URL = "https://bv.new.ndhy.com"
OPAQUE_HTTP_PROVIDER_SOURCE_POLICY = "opaque_http_https"
# Compatibility name for older fixtures/tests; the value is the new opaque policy.
PUBLIC_HTTPS_PROVIDER_SOURCE_POLICY = OPAQUE_HTTP_PROVIDER_SOURCE_POLICY
CS_ENDPOINT_ENV_OVERRIDES = ("CS_TOKEN_API", "CS_HOST", "CS_SERVICE_NAME", "CS_APP_ID", "CDN_HOST")
PENDING = {"queued", "running", "pending", "text_success", "first_success", "generating", "processing"}
SUCCEEDED = {"succeeded", "success", "done", "completed"}
FAILED = {"failed", "error", "canceled", "cancelled", "rejected", "expired"}
SUBMIT_TASK_ID_PATHS = (
    ("id",), ("taskId",), ("task_id",), ("runId",), ("run_id",),
    ("data", "id"), ("data", "taskId"), ("data", "task_id"),
    ("data", "runId"), ("data", "run_id"),
    ("data", "response", "id"), ("data", "response", "taskId"),
    ("data", "response", "task_id"), ("data", "response", "runId"),
    ("data", "response", "run_id"),
)
PROVIDER_TRACK_LIST_PATHS = (
    ("data", "response", "sunoData"),
)
NOISE_MARKER = re.compile(
    r"\[(?:music|instrumental|noise|silence|applause|音乐|纯音乐|噪声|静音|掌声)\]|"
    r"\((?:music|instrumental|noise|silence|applause|音乐|纯音乐|噪声|静音|掌声)\)",
    re.IGNORECASE,
)
PROVIDER_TASK_ID = re.compile(r"^[A-Za-z0-9._:-]{1,256}$")


class AdapterError(RuntimeError):
    def __init__(self, code: str, message: str, *, uncertain: bool = False, details: dict[str, Any] | None = None):
        super().__init__(message)
        self.code = code
        self.uncertain = uncertain
        self.details = details or {}


def resolve_branch_video_agent_base_url() -> str:
    base_url = os.environ.get("BRANCH_VIDEO_AGENT_BASE_URL")
    if base_url in (None, ""):
        return REQUIRED_BRANCH_VIDEO_AGENT_BASE_URL
    if base_url != REQUIRED_BRANCH_VIDEO_AGENT_BASE_URL:
        raise AdapterError(
            "branch_video_agent_base_url_invalid",
            f"BRANCH_VIDEO_AGENT_BASE_URL must exactly equal {REQUIRED_BRANCH_VIDEO_AGENT_BASE_URL}",
        )
    return REQUIRED_BRANCH_VIDEO_AGENT_BASE_URL


def validate_production_environment() -> str:
    """Fail before model, ledger boundaries, CLI calls, or paid side effects."""
    if not os.environ.get("AIHUB_AGENT_TOKEN"):
        raise AdapterError("aihub_token_missing", "AIHUB_AGENT_TOKEN is unavailable")
    return resolve_branch_video_agent_base_url()


def canonical(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def utc_now() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def normalize_lexical(raw_transcript: str) -> str:
    normalized = unicodedata.normalize("NFKC", raw_transcript).casefold()
    without_markers = NOISE_MARKER.sub("", normalized)
    return "".join(char for char in without_markers if char.isalnum())

def extract_json(text: str) -> Any:
    stripped = text.strip()
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        decoder = json.JSONDecoder()
        candidates = [index for index, char in enumerate(text) if char in "[{"]
        for index in reversed(candidates):
            try:
                value, end = decoder.raw_decode(text[index:])
                if not text[index + end :].strip():
                    return value
            except json.JSONDecodeError:
                continue
    raise AdapterError("command_json_invalid", "Command stdout did not end in one JSON document", details={"stdout_tail": text[-2000:]})


def task_id_from(value: Any) -> str:
    """Extract a submit task ID from fixed structured identity fields."""
    record = value if isinstance(value, dict) else {}
    identities = {
        item.strip() for path in SUBMIT_TASK_ID_PATHS
        if isinstance((item := value_at(record, path)), str) and item.strip()
    }
    if not identities:
        raise AdapterError("provider_task_id_missing", "Provider submit response lacks a structured task identity")
    if len(identities) != 1:
        raise AdapterError("provider_task_id_ambiguous", "Provider response contains conflicting task identities")
    task_id = next(iter(identities))
    if not PROVIDER_TASK_ID.fullmatch(task_id):
        raise AdapterError("provider_task_id_invalid", "Provider task identity contains unsupported characters")
    return task_id


def status_from(value: Any) -> str:
    record = value if isinstance(value, dict) else {}
    data = record.get("data") if isinstance(record.get("data"), dict) else {}
    candidates = [data.get("status"), data.get("successFlag"), record.get("status")]
    for candidate in candidates:
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip().lower()
    return ""


def value_at(value: Any, path: tuple[str, ...]) -> Any:
    current = value
    for key in path:
        if not isinstance(current, dict) or key not in current:
            return None
        current = current[key]
    return current


def provider_track_sources_from(value: Any) -> dict[str, Any]:
    """Bind the CLI-selected audio URL to exactly one Suno item and only its fallback."""
    record = value if isinstance(value, dict) else {}
    authoritative = record.get("audioUrl")
    if not isinstance(authoritative, str) or not authoritative:
        raise AdapterError("provider_track_binding_missing", "Provider response lacks the authoritative top-level audio URL")

    track_lists = [value_at(value, path) for path in PROVIDER_TRACK_LIST_PATHS]
    present = [item for item in track_lists if item is not None]
    if not present or len(present) != 1 or not isinstance(present[0], list) or not present[0]:
        raise AdapterError("provider_track_binding_missing", "Provider response lacks the Suno track list required to bind the selected audio")
    matches = [
        (index, item)
        for index, item in enumerate(present[0])
        if isinstance(item, dict)
        and isinstance(item.get("audioUrl"), str)
        and bool(item.get("audioUrl"))
        and item.get("audioUrl") == authoritative
    ]
    if not matches:
        raise AdapterError("provider_track_binding_missing", "Provider-selected audio URL does not bind to a Suno track")
    if len(matches) != 1:
        raise AdapterError("provider_track_binding_ambiguous", "Provider-selected audio URL binds to multiple Suno tracks")
    selected_item_index, selected = matches[0]
    candidates = [{"kind": "audio", "url": authoritative}]
    stream_url = selected.get("streamAudioUrl")
    if isinstance(stream_url, str) and stream_url and stream_url != authoritative:
        candidates.append({"kind": "stream", "url": stream_url})
    return {
        "authoritative_audio_url": authoritative,
        "selected_item_index": selected_item_index,
        "candidates": candidates,
    }


def provider_source_url_from(value: Any) -> str:
    """Compatibility accessor for the authoritative provider-selected audio URL."""
    return str(provider_track_sources_from(value)["authoritative_audio_url"])


class BoundedLeaseRenewer:
    """Run each SQLite lease renewal in a timeout-killable helper process."""

    def __init__(
        self,
        store_path: Path,
        key: str,
        lease: Any,
        lease_seconds: int,
        *,
        timeout_seconds: float = LEASE_RENEW_TIMEOUT_SECONDS,
        interval_seconds: float = LEASE_HEARTBEAT_INTERVAL_SECONDS,
        helper_path: Path = RENEW_LEASE_HELPER,
    ):
        self.store_path = Path(store_path)
        self.key = key
        self.lease = lease
        self.lease_seconds = lease_seconds
        self.max_runtime_seconds = timeout_seconds
        self.interval_seconds = interval_seconds
        self.helper_path = Path(helper_path)
        self._process: subprocess.Popen[str] | None = None
        self._process_lock = threading.Lock()

    def _set_process(self, process: subprocess.Popen[str] | None) -> None:
        with self._process_lock:
            self._process = process

    def cancel(self) -> None:
        with self._process_lock:
            process = self._process
        if process is not None and process.poll() is None:
            process.kill()
            try:
                process.wait(timeout=2)
            except subprocess.TimeoutExpired as exc:
                raise AdapterError("lease_renew_termination_failed", "Timed-out lease renewal child did not terminate") from exc

    @property
    def child_is_alive(self) -> bool:
        with self._process_lock:
            process = self._process
        return process is not None and process.poll() is None

    def __call__(self) -> None:
        command = [sys.executable, str(self.helper_path)]
        request_payload = canonical({
            "schema_version": "audio-lease-renewal-request/1.0",
            "store": str(self.store_path),
            "key": self.key,
            "owner": self.lease.owner,
            "token": self.lease.token,
            "revision": self.lease.revision,
            "lease_seconds": self.lease_seconds,
        })
        try:
            process = subprocess.Popen(
                command,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
        except OSError as exc:
            raise AdapterError("lease_renew_process_failed", "Lease renewal helper could not start") from exc
        self._set_process(process)
        try:
            try:
                stdout, _ = process.communicate(input=request_payload, timeout=self.max_runtime_seconds)
            except subprocess.TimeoutExpired as exc:
                process.kill()
                try:
                    process.communicate(timeout=2)
                except subprocess.TimeoutExpired as termination_exc:
                    process.kill()
                    process.wait(timeout=2)
                    raise AdapterError("lease_renew_termination_failed", "Timed-out lease renewal child did not terminate") from termination_exc
                raise AdapterError("lease_renew_timeout", "Lease renewal exceeded its fixed process timeout") from exc
            if process.returncode != 0:
                raise AdapterError("lease_renew_failed", "Lease renewal helper rejected the fenced renewal")
            try:
                result = json.loads(stdout)
            except (json.JSONDecodeError, TypeError) as exc:
                raise AdapterError("lease_renew_result_invalid", "Lease renewal helper returned invalid authoritative JSON") from exc
            if (
                not isinstance(result, dict)
                or result.get("ok") is not True
                or result.get("revision") != self.lease.revision
                or not isinstance(result.get("expires_at"), str)
            ):
                raise AdapterError("lease_renew_result_invalid", "Lease renewal helper returned invalid authoritative JSON")
            self.lease.expires_at = result["expires_at"]
        finally:
            if process.poll() is not None:
                self._set_process(None)


class LeaseHeartbeat:
    """Renew an owned lease while a blocking operation is in flight.

    The initial synchronous renewal in __enter__ is fail-fast: nothing is in
    flight yet, so there is no reason to tolerate a hiccup before starting a
    blocking operation. Once that first renewal succeeds and the background
    loop takes over, fix-plan-audio-timeout-v20's K-tolerant lease-lost rule
    applies instead: renew_only_while now<derived_deadline (wall_budget.
    renewal_admitted), and only declare the lease lost after K consecutive
    failures or once the gap since the last successful renewal exceeds
    LEASE_TTL-2*HEARTBEAT (wall_budget.lease_lost) -- abandoning an in-flight
    operation on the first transient renewal blip is far more costly than
    tolerating up to K-1 of them.
    """

    def __init__(
        self, callback: Callable[[], None] | None, *, side_effect: bool,
        interval_seconds: float | None = None, now_monotonic: Callable[[], float] = time.monotonic,
    ):
        self.callback = callback
        self.side_effect = side_effect
        self.interval_seconds = float(
            interval_seconds if interval_seconds is not None else getattr(callback, "interval_seconds", LEASE_HEARTBEAT_INTERVAL_SECONDS)
        )
        self._now_monotonic = now_monotonic
        self.stop_event = threading.Event()
        self.lost: BaseException | None = None
        self.thread: threading.Thread | None = None
        self.join_timeout_seconds = float(getattr(callback, "max_runtime_seconds", LEASE_RENEW_TIMEOUT_SECONDS)) + 2.0
        self.consecutive_failures = 0
        self.last_renew_ok_monotonic: float | None = None
        self.derived_deadline_monotonic: float | None = None

    def _tick(self) -> None:
        """One background renewal decision step: apply the derived-deadline
        hard bound first, then attempt the call and apply the K-tolerant
        lease-lost rule to any failure."""
        now = self._now_monotonic()
        if self.derived_deadline_monotonic is not None and not wall_budget.renewal_admitted(now, self.derived_deadline_monotonic):
            self.lost = RuntimeError("lease renewal derived deadline exceeded; no further renewal attempted")
            self.stop_event.set()
            return
        try:
            assert self.callback is not None
            self.callback()
        except BaseException as exc:
            self.consecutive_failures += 1
            if wall_budget.lease_lost(
                consecutive_failures=self.consecutive_failures,
                last_renew_ok_monotonic=self.last_renew_ok_monotonic,
                now_monotonic=self._now_monotonic(),
            ):
                self.lost = exc
                self.stop_event.set()
        else:
            self.consecutive_failures = 0
            self.last_renew_ok_monotonic = self._now_monotonic()
            # The deadline rolls forward with every successful renewal: a
            # healthy, continuously-renewed session must never be killed by
            # a deadline anchored to session start.
            self.derived_deadline_monotonic = wall_budget.derive_renewal_deadline(self.last_renew_ok_monotonic)

    def _run(self) -> None:
        while not self.stop_event.wait(self.interval_seconds):
            self._tick()

    def __enter__(self) -> "LeaseHeartbeat":
        if self.callback is not None:
            try:
                self.callback()
            except BaseException as exc:
                self.lost = exc
            if self.lost is None:
                self.last_renew_ok_monotonic = self._now_monotonic()
                self.derived_deadline_monotonic = wall_budget.derive_renewal_deadline(self.last_renew_ok_monotonic)
                self.thread = threading.Thread(target=self._run, name="audio-production-lease-heartbeat", daemon=True)
                self.thread.start()
        self.raise_if_lost()
        return self

    def raise_if_lost(self) -> None:
        if self.lost is not None:
            raise AdapterError(
                "lease_ownership_lost",
                "Lease ownership was lost during a blocking operation",
                uncertain=self.side_effect,
                details={"cause": type(self.lost).__name__, "message": str(self.lost)},
            ) from self.lost

    def __exit__(self, exc_type: Any, exc: Any, traceback: Any) -> bool:
        self.stop_event.set()
        if self.thread is not None:
            self.thread.join(timeout=self.join_timeout_seconds)
            if self.thread.is_alive() and callable(getattr(self.callback, "cancel", None)):
                self.callback.cancel()  # type: ignore[union-attr]
                self.thread.join(timeout=2)
            if self.thread.is_alive():
                raise AdapterError("lease_renew_termination_failed", "Heartbeat renewer did not terminate inside its fixed bound", uncertain=self.side_effect)
            if bool(getattr(self.callback, "child_is_alive", False)):
                raise AdapterError("lease_renew_termination_failed", "Heartbeat child remained alive after context exit", uncertain=self.side_effect)
        if exc is None:
            self.raise_if_lost()
        return False


def exact_cs_url(url: str, allowed_hosts: set[str]) -> bool:
    try:
        parsed = urlparse(url)
        return (
            parsed.scheme == "https" and parsed.hostname in allowed_hosts and parsed.username is None
            and parsed.password is None and parsed.port in (None, 443) and not parsed.fragment
        )
    except ValueError:
        return False


def cs_dentry_id_from_url(url: str, allowed_hosts: set[str]) -> str:
    if not exact_cs_url(url, allowed_hosts):
        raise AdapterError("final_url_not_allowed_cs", "CS URL is outside the exact HTTPS allowlist")
    aliases: list[tuple[str, str]] = []
    for part in urlparse(url).query.split("&"):
        raw_key, separator, raw_value = part.partition("=")
        decoded_key = unquote_plus(raw_key)
        if decoded_key.lower() == "dentryid":
            aliases.append((raw_key, unquote_plus(raw_value) if separator else ""))
    if len(aliases) != 1 or aliases[0][0] != "dentryId" or not aliases[0][1]:
        raise AdapterError("cs_dentry_query_invalid", "CS URL must contain exactly one case-exact dentryId")
    return aliases[0][1]


@dataclass(frozen=True)
class ProviderSourceTarget:
    url: str
    scheme: str
    host: str
    port: int
    request_target: str
    vetted_addresses: tuple[str, ...]


def validate_provider_source_url(url: str, provider_source_policy: str) -> ProviderSourceTarget:
    if provider_source_policy != OPAQUE_HTTP_PROVIDER_SOURCE_POLICY:
        raise AdapterError("provider_source_policy_invalid", "Provider source policy must be opaque_http_https")
    try:
        parsed = urlparse(url)
        host = (parsed.hostname or "").lower()
        port = parsed.port
    except ValueError as exc:
        raise AdapterError("provider_source_url_invalid", "Provider source URL cannot be parsed") from exc
    scheme = parsed.scheme.lower()
    if scheme not in {"http", "https"} or not host or parsed.username is not None or parsed.password is not None:
        raise AdapterError("provider_source_url_forbidden", "Provider source must be an absolute HTTP(S) URL without credentials")
    effective_port = port or (443 if scheme == "https" else 80)
    try:
        answers = socket.getaddrinfo(host, effective_port, type=socket.SOCK_STREAM)
    except (socket.gaierror, OSError) as exc:
        raise AdapterError("provider_source_dns_failed", "Provider source host could not be resolved") from exc
    addresses = {item[4][0] for item in answers if item and len(item) > 4 and item[4]}
    if not addresses:
        raise AdapterError("provider_source_dns_failed", "Provider source host returned no addresses")
    for address in addresses:
        try:
            parsed_address = ipaddress.ip_address(address)
        except ValueError as exc:
            raise AdapterError("provider_source_dns_invalid", "Provider source DNS returned an invalid address") from exc
        if not parsed_address.is_global:
            raise AdapterError("provider_source_dns_forbidden", "Provider source DNS resolved to a non-global address")
    ordered = tuple(sorted(addresses, key=lambda item: (ipaddress.ip_address(item).version, ipaddress.ip_address(item).packed)))
    authority_end = url.find("://") + 3 + len(parsed.netloc)
    request_target = url[authority_end:].split("#", 1)[0]
    if not request_target:
        request_target = "/"
    elif request_target.startswith("?"):
        request_target = "/" + request_target
    return ProviderSourceTarget(url=url, scheme=scheme, host=host, port=effective_port, request_target=request_target, vetted_addresses=ordered)


class RejectRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req: Any, fp: Any, code: int, msg: str, headers: Any, newurl: str) -> Any:
        raise AdapterError("download_redirect_forbidden", "Provider sources and CS readbacks must return direct HTTP 200")


class PinnedHTTPSConnection(http.client.HTTPSConnection):
    """Connect to one vetted numeric address while authenticating the URL host."""

    def __init__(self, hostname: str, address: str, port: int, timeout: float):
        self.pinned_address = address
        context = ssl.create_default_context()
        super().__init__(hostname, port=port, timeout=timeout, context=context)

    def connect(self) -> None:
        parsed_address = ipaddress.ip_address(self.pinned_address)
        family = socket.AF_INET6 if parsed_address.version == 6 else socket.AF_INET
        endpoint: Any = (self.pinned_address, self.port, 0, 0) if family == socket.AF_INET6 else (self.pinned_address, self.port)
        raw = socket.socket(family, socket.SOCK_STREAM)
        raw.settimeout(self.timeout)
        try:
            raw.connect(endpoint)
            self.sock = self._context.wrap_socket(raw, server_hostname=self.host)
        except BaseException:
            raw.close()
            raise


class PinnedHTTPConnection(http.client.HTTPConnection):
    """Connect plain HTTP to one vetted numeric address without a second DNS lookup."""

    def __init__(self, hostname: str, address: str, port: int, timeout: float):
        self.pinned_address = address
        super().__init__(hostname, port=port, timeout=timeout)

    def connect(self) -> None:
        parsed_address = ipaddress.ip_address(self.pinned_address)
        family = socket.AF_INET6 if parsed_address.version == 6 else socket.AF_INET
        endpoint: Any = (self.pinned_address, self.port, 0, 0) if family == socket.AF_INET6 else (self.pinned_address, self.port)
        raw = socket.socket(family, socket.SOCK_STREAM)
        raw.settimeout(self.timeout)
        try:
            raw.connect(endpoint)
            self.sock = raw
        except BaseException:
            raw.close()
            raise


class PinnedProviderResponse:
    def __init__(self, connection: http.client.HTTPConnection, response: http.client.HTTPResponse):
        self.connection = connection
        self.response = response

    def __enter__(self) -> http.client.HTTPResponse:
        return self.response

    def __exit__(self, exc_type: Any, exc: Any, traceback: Any) -> bool:
        self.response.close()
        self.connection.close()
        return False


def open_pinned_provider(target: ProviderSourceTarget, timeout: float = wall_budget.IO_OP_TIMEOUT) -> PinnedProviderResponse:
    last_error: BaseException | None = None
    for address in target.vetted_addresses:
        connection_class = PinnedHTTPSConnection if target.scheme == "https" else PinnedHTTPConnection
        connection = connection_class(target.host, address, target.port, timeout)
        try:
            default_port = 443 if target.scheme == "https" else 80
            try:
                host_is_ipv6_literal = ipaddress.ip_address(target.host).version == 6
            except ValueError:
                host_is_ipv6_literal = False
            bracketed_host = f"[{target.host}]" if host_is_ipv6_literal else target.host
            host_header = bracketed_host if target.port == default_port else f"{bracketed_host}:{target.port}"
            connection.request(
                "GET",
                target.request_target,
                headers={
                    "Host": host_header,
                    "User-Agent": "rpg-audio-production-v2/1.0",
                    "Accept-Encoding": "identity",
                },
            )
            return PinnedProviderResponse(connection, connection.getresponse())
        except (OSError, ssl.SSLError, http.client.HTTPException) as exc:
            last_error = exc
            connection.close()
    raise AdapterError("provider_source_connect_failed", "No safety-vetted provider address accepted the pinned HTTP(S) connection") from last_error


def download_limited(
    url: str,
    target: Path,
    *,
    max_bytes: int,
    allowed_hosts: set[str] | None = None,
    provider_source_policy: str | None = None,
) -> tuple[Path, dict[str, Any]]:
    if allowed_hosts is not None and provider_source_policy is not None:
        raise AdapterError("download_policy_invalid", "Only one download trust policy may be selected")
    if allowed_hosts is not None:
        cs_dentry_id_from_url(url, allowed_hosts)
        opener = urllib.request.build_opener(RejectRedirectHandler())
        target_policy = None
    elif provider_source_policy is not None:
        target_policy = validate_provider_source_url(url, provider_source_policy)
        opener = None
    else:
        raise AdapterError("download_policy_missing", "A package-owned download trust policy is required")
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=target.name + ".", suffix=".part", dir=target.parent)
    os.close(fd)
    temp = Path(temp_name)
    try:
        try:
            if opener is not None:
                response_context: Any = opener.open(
                    urllib.request.Request(url, headers={"User-Agent": "rpg-audio-production-v2/1.0"}), timeout=wall_budget.IO_OP_TIMEOUT,
                )
            else:
                assert target_policy is not None
                response_context = open_pinned_provider(target_policy, timeout=wall_budget.IO_OP_TIMEOUT)
            with response_context as response, temp.open("wb") as output:
                status = int(getattr(response, "status", response.getcode()))
                content_type = str(response.headers.get("Content-Type") or "").split(";", 1)[0].strip().lower()
                declared = response.headers.get("Content-Length")
                if declared is not None and re.fullmatch(r"\d+", str(declared)) is None:
                    raise AdapterError("download_content_length_invalid", "Download returned an invalid Content-Length")
                declared_length = int(declared) if declared is not None else None
                if status not in ({200} if target_policy is None else {200, 206}):
                    raise AdapterError("download_http_status_invalid", f"Download returned HTTP {status}")
                range_total = None
                if target_policy is not None and status == 206:
                    content_range = str(response.headers.get("Content-Range") or "")
                    match = re.fullmatch(r"bytes 0-(\d+)/(\d+)", content_range)
                    if match is None:
                        raise AdapterError("download_content_range_invalid", "Provider partial response lacks an exact complete Content-Range")
                    range_end, range_total = (int(item) for item in match.groups())
                    if range_total <= 0 or range_end != range_total - 1:
                        raise AdapterError("download_content_range_incomplete", "Provider partial response is not the complete source object")
                    if range_total > max_bytes:
                        raise AdapterError("download_too_large", f"Download exceeds {max_bytes} bytes")
                    if declared_length is not None and declared_length != range_total:
                        raise AdapterError("download_content_range_invalid", "Provider partial response length differs from Content-Range")
                if declared_length is not None and declared_length > max_bytes:
                    raise AdapterError("download_too_large", f"Download exceeds {max_bytes} bytes")
                total = 0
                while True:
                    block = response.read(min(1024 * 1024, max_bytes - total + 1))
                    if not block:
                        break
                    total += len(block)
                    if total > max_bytes:
                        raise AdapterError("download_too_large", f"Download exceeds {max_bytes} bytes")
                    output.write(block)
                if range_total is not None and total != range_total:
                    raise AdapterError("download_content_range_invalid", "Provider partial response body differs from Content-Range")
                if status == 200 and declared_length is not None and total != declared_length:
                    raise AdapterError("download_content_length_mismatch", "Download body differs from Content-Length")
        except AdapterError:
            raise
        except Exception as exc:
            raise AdapterError("media_download_failed", f"Media download failed for {target.name}") from exc
        if total <= 0:
            raise AdapterError("download_empty", "Downloaded audio is empty")
        os.replace(temp, target)
        return target, {
            "http_status": status,
            "content_type": content_type,
            "content_length": total,
            "declared_content_length": declared_length,
            "sha256": sha256_file(target),
            "observed_at": utc_now(),
        }
    finally:
        temp.unlink(missing_ok=True)


def validate_runtime_command(
    command: list[str] | None,
    capability_id: str,
    *,
    probe_arg: str,
    required_markers: tuple[str, ...],
) -> list[str]:
    if (
        not isinstance(command, list)
        or not command
        or any(not isinstance(item, str) or not item.strip() for item in command)
    ):
        raise AdapterError(
            "runtime_capability_missing",
            f"Runtime command for {capability_id} must be a non-empty string array",
        )
    executable = command[0]
    if not Path(executable).is_file() and shutil.which(executable) is None:
        raise AdapterError(
            "runtime_capability_missing",
            f"Runtime command for {capability_id} is unavailable",
        )
    try:
        probe = subprocess.run(
            [*command, probe_arg],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=15,
        )
    except (subprocess.TimeoutExpired, OSError) as exc:
        raise AdapterError(
            "runtime_capability_probe_failed",
            f"Runtime command for {capability_id} could not be probed",
        ) from exc
    probe_text = f"{probe.stdout or ''}\n{probe.stderr or ''}"
    if probe.returncode != 0 or any(marker not in probe_text for marker in required_markers):
        raise AdapterError(
            "runtime_capability_probe_failed",
            f"Runtime command does not expose {capability_id}",
        )
    return list(command)


def branch_video_agent_runtime_env(base_env: Mapping[str, str], work_root: Path) -> dict[str, str]:
    """Give the CLI auto-updater a writable npm prefix without disabling updates."""
    prefix = work_root.resolve() / ".runtime-tools" / "npm"
    cache = work_root.resolve() / ".runtime-tools" / "npm-cache"
    prefix.mkdir(parents=True, exist_ok=True)
    cache.mkdir(parents=True, exist_ok=True)
    env = dict(base_env)
    env["NPM_CONFIG_PREFIX"] = str(prefix)
    env["npm_config_prefix"] = str(prefix)
    env["NPM_CONFIG_CACHE"] = str(cache)
    path_entries = [str(prefix), str(prefix / "bin")]
    inherited_path = str(env.get("PATH") or "")
    if inherited_path:
        path_entries.append(inherited_path)
    env["PATH"] = os.pathsep.join(path_entries)
    return env


class ProductionAdapter:
    def __init__(
        self,
        work_root: Path,
        command_timeout: int = 120,
        allowed_cs_hosts: list[str] | None = None,
        provider_source_policy: str | None = None,
        upload_command: list[str] | None = None,
        asr_command: list[str] | None = None,
    ):
        canonical_base_url = validate_production_environment()
        self.work_root = work_root
        self.command_timeout = command_timeout
        self.branch_video_agent = shutil.which("branch-video-agent")
        self.ffmpeg = shutil.which("ffmpeg")
        self.allowed_cs_hosts = set(allowed_cs_hosts or [])
        self.provider_source_policy = provider_source_policy
        self.branch_video_agent_env = branch_video_agent_runtime_env(os.environ, work_root)
        self.branch_video_agent_env["BRANCH_VIDEO_AGENT_BASE_URL"] = canonical_base_url
        self.attempt_id = str(uuid.uuid4())
        if not self.branch_video_agent:
            raise AdapterError("branch_video_agent_missing", "branch-video-agent is unavailable")
        if not self.ffmpeg:
            raise AdapterError("ffmpeg_unavailable", "ffmpeg is unavailable; production does not download or install tools")
        if not self.allowed_cs_hosts:
            raise AdapterError("cs_allowlist_missing", "Production requires a package-owned CS host allowlist")
        if self.provider_source_policy != OPAQUE_HTTP_PROVIDER_SOURCE_POLICY:
            raise AdapterError("provider_source_policy_invalid", "Production requires provider_source_policy=opaque_http_https")
        overrides = sorted(key for key in CS_ENDPOINT_ENV_OVERRIDES if os.environ.get(key))
        if overrides:
            raise AdapterError("cs_endpoint_override_forbidden", f"Unapproved CS endpoint override variables are set: {overrides}")
        self.upload_command = validate_runtime_command(
            upload_command,
            "upload.cs-json.v1",
            probe_arg="--help",
            required_markers=("--json", "<file-or-dir>"),
        )
        self.asr_command = list(asr_command) if asr_command else None
        try:
            probe = subprocess.run([self.ffmpeg, "-version"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=15)
        except (subprocess.TimeoutExpired, OSError) as exc:
            raise AdapterError("ffmpeg_unavailable", "ffmpeg version probe failed") from exc
        if probe.returncode != 0 or "ffmpeg version" not in probe.stdout:
            raise AdapterError("ffmpeg_unavailable", "ffmpeg failed its version probe")
        self.ffmpeg_version = probe.stdout.splitlines()[0].strip()
        self.provider_submit_calls = 0
        self.work_root.mkdir(parents=True, exist_ok=True)

    def run_json(
        self,
        command: list[str],
        payload: dict[str, Any],
        *,
        side_effect: bool = False,
        heartbeat: Callable[[], None] | None = None,
    ) -> tuple[dict[str, Any], str]:
        try:
            with LeaseHeartbeat(heartbeat, side_effect=side_effect):
                process = subprocess.run(
                    command,
                    input=canonical(payload),
                    text=True,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    timeout=self.command_timeout,
                    env=self.branch_video_agent_env,
                )
        except OSError as exc:
            raise AdapterError(
                "side_effect_not_sent" if side_effect else "command_failed",
                f"Command could not be started: {Path(command[0]).name}",
                uncertain=False,
                details={
                    "side_effect_state": "not_executed",
                    "command_executed": False,
                } if side_effect else {},
            ) from exc
        except subprocess.TimeoutExpired as exc:
            raise AdapterError(
                "side_effect_response_lost" if side_effect else "command_failed",
                f"Command did not return safely: {Path(command[0]).name}",
                uncertain=side_effect,
                details={"side_effect_state": "executed_outcome_unknown"} if side_effect else {},
            ) from exc
        if process.returncode != 0:
            machine_result: dict[str, Any] | None = None
            if side_effect:
                try:
                    parsed = extract_json(process.stdout)
                    if isinstance(parsed, dict):
                        machine_result = parsed
                except AdapterError:
                    pass
            has_task_identity = bool(
                machine_result is not None
                and any(
                    isinstance(value_at(machine_result, path), str)
                    and bool(value_at(machine_result, path).strip())
                    for path in SUBMIT_TASK_ID_PATHS
                )
            )
            if (
                machine_result is not None
                and machine_result.get("command_executed") is False
                and not has_task_identity
            ):
                raise AdapterError(
                    "side_effect_not_sent",
                    f"Command exited before the provider operation was executed: {Path(command[0]).name}",
                    uncertain=False,
                    details={
                        "side_effect_state": "not_executed",
                        "command_executed": False,
                        "returncode": process.returncode,
                        "result": machine_result,
                    },
                )
            if side_effect and has_task_identity:
                return machine_result, process.stderr
            raise AdapterError(
                "side_effect_response_lost" if side_effect else "command_failed",
                f"Command exited {process.returncode}: {Path(command[0]).name}",
                uncertain=side_effect,
                details={
                    "returncode": process.returncode,
                    "stderr": process.stderr[-4000:],
                    "stdout": process.stdout[-4000:],
                    **({"side_effect_state": "executed_outcome_unknown"} if side_effect else {}),
                },
            )
        try:
            value = extract_json(process.stdout)
            if not isinstance(value, dict):
                raise AdapterError("command_json_invalid", "Command JSON result must be an object")
        except AdapterError as exc:
            if side_effect:
                raise AdapterError(exc.code, str(exc), uncertain=True, details=exc.details) from exc
            raise
        return value, process.stderr

    def submit_music(self, payload: dict[str, Any], heartbeat: Callable[[], None] | None = None) -> dict[str, Any]:
        command = [self.branch_video_agent, "ai-gateway", "music-submit", "--raw"]
        # Durable evidence must be committed before crossing the paid boundary.
        next_count = self.provider_submit_calls + 1
        sink = getattr(self, "provider_submit_counter_sink", None)
        if sink is not None:
            sink(next_count)
        self.provider_submit_calls = next_count
        value, _ = self.run_json(command, payload, side_effect=True, heartbeat=heartbeat)
        try:
            task_id = task_id_from(value)
        except AdapterError as exc:
            raise AdapterError(exc.code, str(exc), uncertain=True, details=exc.details) from exc
        return {"task_id": task_id, "response": value, "response_sha256": sha256_text(canonical(value)), "observed_at": utc_now()}

    def poll_music(self, task_id: str, timeout_seconds: int, heartbeat: Callable[[], None]) -> dict[str, Any]:
        config = {
            "provider_poll_initial_seconds": 5.0,
            "provider_poll_mid_seconds": 10.0,
            "provider_poll_max_seconds": 30.0,
            "provider_poll_mid_after_seconds": 60.0,
            "provider_poll_max_after_seconds": 300.0,
            "provider_binding_stable_observations": 2,
            "provider_query_read_failure_limit": 3,
        }
        configured = getattr(self, "provider_poll_policy", None)
        if isinstance(configured, dict):
            config.update({key: configured[key] for key in config if key in configured})
        observer = getattr(self, "provider_poll_observer", None)
        started = time.monotonic()
        deadline = started + float(timeout_seconds)
        poll_count = 0
        query_failure_count = 0
        consecutive_query_failure_count = 0
        stable_count = 0
        stable_fingerprint: str | None = None
        previous_marker: tuple[str, str] | None = None
        last_snapshot: dict[str, Any] = {
            "task_id": task_id,
            "poll_count": 0,
            "query_failure_count": 0,
            "consecutive_query_failure_count": 0,
            "last_status": "missing",
            "last_status_sha256": None,
            "classification": "polling_pending",
            "top_audio_url_sha256": None,
            "suno_item_count": 0,
            "exact_match_count": 0,
            "binding_fingerprint_sha256": None,
            "stable_observation_count": 0,
            "observed_at": utc_now(),
        }

        def emit(force: bool = False) -> None:
            if not callable(observer):
                return
            try:
                observer(dict(last_snapshot), force=force)
            except AdapterError:
                raise
            except Exception as exc:
                raise AdapterError("attempt_evidence_write_failed", "Provider poll evidence could not be persisted") from exc

        def finish_error(code: str, message: str) -> AdapterError:
            emit(force=True)
            return AdapterError(code, message, details={"task_id": task_id, "provider_poll": dict(last_snapshot)})

        while True:
            now = time.monotonic()
            remaining = deadline - now
            if remaining <= 0:
                code = "provider_binding_not_stable" if last_snapshot["classification"] in {"binding_not_ready", "binding_candidate"} else "provider_timeout"
                raise finish_error(code, "Provider task did not reach a stable track binding before timeout")
            heartbeat()
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                code = "provider_binding_not_stable" if last_snapshot["classification"] in {"binding_not_ready", "binding_candidate"} else "provider_timeout"
                raise finish_error(code, "Provider task did not reach a stable track binding before timeout")
            poll_count += 1
            original_timeout = getattr(self, "command_timeout", 120)
            lease_safe_query_timeout = float(getattr(heartbeat, "interval_seconds", original_timeout))
            self.command_timeout = max(0.001, min(float(original_timeout), lease_safe_query_timeout, remaining))
            try:
                try:
                    value, _ = self.run_json(
                        [self.branch_video_agent, "ai-gateway", "music-get", "--raw"],
                        {"id": task_id, "operation": "query"},
                        # The outer renewal immediately above is authoritative.
                        # Read-only music-get is capped to one heartbeat interval,
                        # so run_json must not perform a second synchronous renew.
                        heartbeat=None,
                    )
                except AdapterError as exc:
                    if exc.code not in {"command_failed", "command_json_invalid"}:
                        raise
                    query_failure_count += 1
                    consecutive_query_failure_count += 1
                    last_snapshot.update({
                        "poll_count": poll_count,
                        "query_failure_count": query_failure_count,
                        "consecutive_query_failure_count": consecutive_query_failure_count,
                        "classification": "query_unavailable",
                        "observed_at": utc_now(),
                    })
                    emit()
                    if consecutive_query_failure_count >= int(config["provider_query_read_failure_limit"]):
                        raise finish_error("provider_query_unavailable", "Provider task query was consecutively unavailable")
                    value = None
            finally:
                self.command_timeout = original_timeout

            classification = "query_unavailable"
            status = str(last_snapshot["last_status"])
            if isinstance(value, dict):
                consecutive_query_failure_count = 0
                status = status_from(value)
                known_status = status if status in (PENDING | SUCCEEDED | FAILED) else ("unknown" if status else "missing")
                track_list = value_at(value, PROVIDER_TRACK_LIST_PATHS[0])
                valid_items = [item for item in track_list if isinstance(item, dict) and isinstance(item.get("audioUrl"), str) and item.get("audioUrl")] if isinstance(track_list, list) else []
                authoritative = value.get("audioUrl") if isinstance(value.get("audioUrl"), str) and value.get("audioUrl") else ""
                matches = [item for item in valid_items if item["audioUrl"] == authoritative] if authoritative else []
                last_snapshot.update({
                    "poll_count": poll_count,
                    "query_failure_count": query_failure_count,
                    "consecutive_query_failure_count": 0,
                    "last_status": known_status,
                    "last_status_sha256": sha256_text(status) if status and known_status == "unknown" else None,
                    "top_audio_url_sha256": sha256_text(authoritative) if authoritative else None,
                    "suno_item_count": len(track_list) if isinstance(track_list, list) else 0,
                    "exact_match_count": len(matches),
                    "observed_at": utc_now(),
                })
                if status in FAILED:
                    stable_count = 0
                    classification = "failed"
                    last_snapshot.update({"classification": classification, "stable_observation_count": 0})
                    raise finish_error("provider_failed", f"Provider task entered explicit failure status {status!r}")
                if status not in SUCCEEDED:
                    stable_count = 0
                    stable_fingerprint = None
                    classification = "polling_pending"
                    last_snapshot.update({
                        "classification": classification,
                        "binding_fingerprint_sha256": None,
                        "stable_observation_count": 0,
                    })
                    emit()
                else:
                    try:
                        track_binding = provider_track_sources_from(value)
                    except AdapterError as exc:
                        if exc.code == "provider_track_binding_ambiguous":
                            last_snapshot.update({"classification": "binding_ambiguous", "stable_observation_count": 0})
                            raise finish_error(exc.code, str(exc))
                        if exc.code != "provider_track_binding_missing":
                            raise
                        stable_count = 0
                        stable_fingerprint = None
                        classification = "binding_not_ready"
                        last_snapshot.update({
                            "classification": classification,
                            "binding_fingerprint_sha256": None,
                            "stable_observation_count": 0,
                        })
                        emit()
                    else:
                        source_url = str(track_binding["authoritative_audio_url"])
                        fingerprint = sha256_text(canonical({
                            "authoritative_audio_url_sha256": sha256_text(source_url),
                            "matched_audio_url_sha256": sha256_text(source_url),
                        }))
                        stable_count = stable_count + 1 if fingerprint == stable_fingerprint else 1
                        stable_fingerprint = fingerprint
                        classification = "binding_stable" if stable_count >= int(config["provider_binding_stable_observations"]) else "binding_candidate"
                        last_snapshot.update({
                            "classification": classification,
                            "binding_fingerprint_sha256": fingerprint,
                            "stable_observation_count": stable_count,
                        })
                        if classification == "binding_stable":
                            emit(force=True)
                            return {
                                "status": "succeeded",
                                "task_id": task_id,
                                "source_url": source_url,
                                "source_candidates": track_binding["candidates"],
                                "track_binding": {
                                    "selected_item_index": track_binding["selected_item_index"],
                                    "authoritative_audio_url_sha256": sha256_text(source_url),
                                    "binding_fingerprint_sha256": fingerprint,
                                    "candidates": [
                                        {"kind": item["kind"], "url_sha256": sha256_text(item["url"])}
                                        for item in track_binding["candidates"]
                                    ],
                                },
                                "response": value,
                                "response_sha256": sha256_text(canonical(value)),
                                "observed_at": utc_now(),
                                "provider_poll": dict(last_snapshot),
                            }
                        emit()

            marker = (status, classification)
            elapsed = time.monotonic() - started
            if marker != previous_marker:
                interval = float(config["provider_poll_initial_seconds"])
            elif elapsed >= float(config["provider_poll_max_after_seconds"]):
                interval = float(config["provider_poll_max_seconds"])
            elif elapsed >= float(config["provider_poll_mid_after_seconds"]):
                interval = float(config["provider_poll_mid_seconds"])
            else:
                interval = float(config["provider_poll_initial_seconds"])
            previous_marker = marker
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                continue
            time.sleep(min(interval, remaining))

    def download_provider_source_candidates(
        self,
        candidates: list[dict[str, Any]],
        target: Path,
    ) -> tuple[Path, dict[str, Any], dict[str, Any]]:
        expected_kinds = ["audio"] if len(candidates) == 1 else ["audio", "stream"]
        if (
            len(candidates) not in {1, 2}
            or not all(isinstance(item, dict) and set(item) == {"kind", "url"} for item in candidates)
            or [item["kind"] for item in candidates] != expected_kinds
            or not all(isinstance(item["url"], str) and bool(item["url"]) for item in candidates)
            or (len(candidates) == 2 and candidates[0]["url"] == candidates[1]["url"])
        ):
            raise AdapterError("provider_source_candidates_invalid", "Provider source candidates must be one exact audio URL and at most its distinct stream URL")
        failures: list[dict[str, Any]] = []
        for ordinal, item in enumerate(candidates, start=1):
            kind = item["kind"]
            url = item["url"]
            try:
                path, measured = download_limited(
                    url,
                    target,
                    max_bytes=MAX_PROVIDER_BYTES,
                    provider_source_policy=self.provider_source_policy,
                )
                return path, measured, {"kind": kind, "url_sha256": sha256_text(url)}
            except AdapterError as exc:
                failures.append({
                    "ordinal": ordinal,
                    "kind": kind,
                    "outcome": "failed",
                    "machine_code": exc.code,
                    "phase": "provider_download",
                    "url_sha256": sha256_text(url),
                })
        raise AdapterError(
            "provider_track_sources_unreachable",
            "No URL for the provider-selected track yielded a complete source file",
            details={"attempts": failures},
        )

    def _run_ffmpeg(self, args: list[str]) -> None:
        try:
            process = subprocess.run([self.ffmpeg, "-hide_banner", "-loglevel", "error", "-y", *args], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=self.command_timeout)
        except (subprocess.TimeoutExpired, OSError) as exc:
            raise AdapterError("ffmpeg_failed", "ffmpeg did not return safely") from exc
        if process.returncode != 0:
            raise AdapterError("ffmpeg_failed", "ffmpeg transform failed", details={"stderr": process.stderr[-4000:]})

    def download_transform_analyze(
        self,
        asset_id: str,
        source_candidates: list[dict[str, Any]],
        minimum: float,
        maximum: float,
        *,
        run_asr: bool,
        heartbeat: Callable[[], None] | None = None,
    ) -> tuple[dict[str, Any], dict[str, Any], Path]:
        with LeaseHeartbeat(heartbeat, side_effect=False):
            try:
                target_seconds = min(29.5, float(maximum) - 0.1)
                if target_seconds < float(minimum):
                    raise AdapterError("duration_contract_invalid", "No safe transform duration exists inside the requested bounds")
                crossfade_seconds = min(0.5, target_seconds / 8)
                directory = self.work_root / asset_id
                directory.mkdir(parents=True, exist_ok=True)
                source, source_http, selected_source = self.download_provider_source_candidates(
                    source_candidates,
                    directory / "provider-source.bin",
                )
                source_pcm = directory / "source.circular-input.wav"
                loop_pcm = directory / "loop.circular.wav"
                output = directory / f"{asset_id}.mp3"
                # Decode one bounded codec-frame margin before the existing
                # fail-closed length gate. MP3 encoder priming can otherwise
                # make an exact-duration decode short by one codec frame.
                decode_margin_seconds = 0.25
                self._run_ffmpeg([
                    "-stream_loop", "-1", "-i", str(source), "-t", f"{target_seconds + crossfade_seconds + decode_margin_seconds:.3f}",
                    "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", str(source_pcm),
                ])
                self._render_circular_loop(source_pcm, loop_pcm, target_seconds, crossfade_seconds)
                self._run_ffmpeg(["-i", str(loop_pcm), "-ar", "48000", "-ac", "2", "-b:a", "192k", str(output)])
                seam_wav = directory / "seam.wav"
                self._run_ffmpeg(["-i", str(output), "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", str(seam_wav)])
                with wave.open(str(seam_wav), "rb") as media_wave:
                    duration = media_wave.getnframes() / media_wave.getframerate()
                media_hash = sha256_file(output)
                media = {
                    "sha256": media_hash,
                    "mime_type": "audio/mpeg",
                    "size_bytes": output.stat().st_size,
                    "duration_seconds": duration,
                    "observed_at": utc_now(),
                    "local_file": str(output),
                    "source_sha256": sha256_file(source),
                    "source_http": source_http,
                    "provider_source": {
                        "chosen_kind": selected_source["kind"],
                        "chosen_url_sha256": selected_source["url_sha256"],
                        "source_sha256": source_http["sha256"],
                        "http_status": source_http["http_status"],
                    },
                    "transform": {
                        "tool": "ffmpeg+numpy-circular-crossfade",
                        "version": self.ffmpeg_version,
                        "target_seconds": target_seconds,
                        "crossfade_seconds": crossfade_seconds,
                        "two_cycle_validation": True,
                    },
                }
                quality = {"loop_seam": self._loop_evidence(seam_wav, media_hash)}
                if run_asr:
                    asr_wav = directory / "asr.wav"
                    quality["tts_asr_report"] = self._prepare_tts_asr_report(output, asr_wav, media_hash)
                return media, quality, output
            except AdapterError:
                raise
            except Exception as exc:
                raise AdapterError("media_analysis_failed", "Media transform or analysis failed") from exc

    def _prepare_tts_asr_report(self, output: Path, asr_wav: Path, media_hash: str) -> dict[str, Any]:
        try:
            self._run_ffmpeg([
                "-i", str(output), "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", str(asr_wav),
            ])
        except Exception:
            return {
                "status": "warning",
                "machine_code": "tts_asr_derivative_failed",
                "message": "TTS ASR derivative generation failed",
                "media_sha256": media_hash,
                "raw_transcript": None,
                "raw_language": None,
                "analyzed_at": utc_now(),
            }
        return self._asr_report(asr_wav, media_hash)

    def _render_circular_loop(self, source_wav: Path, output_wav: Path, target_seconds: float, crossfade_seconds: float) -> None:
        try:
            with wave.open(str(source_wav), "rb") as media_wave:
                rate = media_wave.getframerate()
                channels = media_wave.getnchannels()
                width = media_wave.getsampwidth()
                raw = media_wave.readframes(media_wave.getnframes())
            if width != 2 or rate != 48000 or channels != 2:
                raise AdapterError("loop_pcm_contract_invalid", "Circular loop input must be 48 kHz stereo PCM16")
            samples = array("h")
            samples.frombytes(raw)
            if sys.byteorder != "little":
                samples.byteswap()
            frames = len(samples) // channels
            target_frames = int(round(target_seconds * rate))
            crossfade_frames = int(round(crossfade_seconds * rate))
            if crossfade_frames < 2 or frames < target_frames + crossfade_frames:
                raise AdapterError("loop_source_too_short", "Decoded source is too short for circular crossfade")
            loop = array("h", [0]) * (target_frames * channels)
            for frame in range(target_frames):
                for channel in range(channels):
                    output_index = frame * channels + channel
                    if frame < crossfade_frames:
                        head = samples[output_index]
                        wrap = samples[(target_frames + frame) * channels + channel]
                        weight = frame / crossfade_frames
                        loop[output_index] = max(
                            -32768,
                            min(32767, int(round(wrap * (1.0 - weight) + head * weight))),
                        )
                    else:
                        loop[output_index] = samples[output_index]
            if len(loop) != target_frames * channels:
                raise AdapterError("loop_render_length_invalid", "Circular loop render length is not deterministic")
            output_wav.parent.mkdir(parents=True, exist_ok=True)
            with wave.open(str(output_wav), "wb") as media_wave:
                media_wave.setnchannels(channels)
                media_wave.setsampwidth(2)
                media_wave.setframerate(rate)
                if sys.byteorder != "little":
                    loop.byteswap()
                media_wave.writeframes(loop.tobytes())
        except AdapterError:
            raise
        except (OSError, wave.Error, ValueError) as exc:
            raise AdapterError("loop_render_failed", "Circular loop render failed") from exc

    def _asr_evidence(self, wav_path: Path, media_hash: str) -> dict[str, Any]:
        if not self.asr_command:
            raise AdapterError(
                "runtime_capability_missing",
                "Runtime ASR command is required only when transcript evidence is requested",
            )
        try:
            completed = subprocess.run(
                [*self.asr_command, "--media", str(wav_path)],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=self.command_timeout,
            )
        except (subprocess.TimeoutExpired, OSError) as exc:
            raise AdapterError(
                "runtime_asr_failed",
                "Runtime ASR command did not return safely",
            ) from exc
        if completed.returncode != 0:
            raise AdapterError("runtime_asr_failed", "Runtime ASR command failed")
        value = extract_json(completed.stdout)
        if not isinstance(value, dict):
            raise AdapterError("runtime_asr_result_invalid", "Runtime ASR result must be an object")
        raw_transcript = str(
            value.get("raw_transcript")
            or value.get("recognized_text")
            or value.get("transcript")
            or ""
        ).strip()
        raw_language = str(value.get("raw_language") or value.get("language") or "")
        lexical = normalize_lexical(raw_transcript)
        has_lexical = bool(lexical)
        return {
            "status": "observed" if has_lexical else "warning",
            "acceptance_claim": "tts_transcript_observation_only",
            "method": str(value.get("method") or "runtime-asr-command"),
            "media_sha256": media_hash,
            "audio_sha256": sha256_file(wav_path),
            "analyzer_id": str(value.get("tool_id") or value.get("analyzer_id") or ""),
            "model": str(value.get("model") or "runtime-resolved"),
            "version": str(value.get("tool_version") or value.get("version") or ""),
            "config_sha256": sha256_text(canonical({
                "capability": "audio.asr-json.v1",
                "command": self.asr_command,
            })),
            "attempt_id": self.attempt_id,
            "tool_run_id": str(value.get("run_id") or value.get("tool_run_id") or ""),
            "analyzed_at": utc_now(),
            "transcript": lexical,
            "raw_transcript": raw_transcript,
            "raw_language": raw_language,
            "lexical_speech": lexical,
            "normalized_lexical_decision": {
                "text": lexical,
                "has_non_noise_lexical_text": has_lexical,
                "decision": "observed_lexical_transcript" if has_lexical else "warning_empty_or_marker_only_transcript",
            },
            "limitations": ["asr_transcript_is_advisory_and_not_delivery_acceptance"],
            "residual_risk": "asr_may_hallucinate_or_miss_tts_content",
        }

    def _asr_report(self, wav_path: Path, media_hash: str) -> dict[str, Any]:
        try:
            return self._asr_evidence(wav_path, media_hash)
        except AdapterError as exc:
            return {
                "status": "warning", "machine_code": exc.code, "message": str(exc),
                "media_sha256": media_hash, "raw_transcript": None, "raw_language": None,
                "analyzed_at": utc_now(),
            }
        except Exception:
            return {
                "status": "warning",
                "machine_code": "runtime_asr_unexpected_failure",
                "message": "Unexpected TTS ASR failure",
                "media_sha256": media_hash,
                "raw_transcript": None,
                "raw_language": None,
                "analyzed_at": utc_now(),
            }

    def _loop_evidence(self, wav_path: Path, media_hash: str) -> dict[str, Any]:
        try:
            with wave.open(str(wav_path), "rb") as media_wave:
                rate = media_wave.getframerate()
                channels = media_wave.getnchannels()
                raw = media_wave.readframes(media_wave.getnframes())
            pcm = array("h")
            pcm.frombytes(raw)
            if sys.byteorder != "little":
                pcm.byteswap()
            if channels != 2 or len(pcm) % channels:
                raise AdapterError("loop_pcm_contract_invalid", "Loop evidence requires interleaved stereo PCM16")
            samples = [
                (pcm[index] + pcm[index + 1]) / 65536.0
                for index in range(0, len(pcm), channels)
            ]
            window_ms = 250
            count = max(64, int(rate * window_ms / 1000))
            if len(samples) < count * 4:
                raise AdapterError("loop_analysis_too_short", "Loop media is too short for edge and middle analysis")
            start, end = samples[:count], samples[-count:]
            middle_index = len(samples) // 2
            middle = samples[middle_index - count // 2 : middle_index + count // 2]
            def rms(values: list[float]) -> float:
                return math.sqrt(sum(value * value for value in values) / len(values))

            def spectrum(values: list[float]) -> list[float]:
                # A bounded deterministic DFT keeps the seam check available in
                # the stock Python runtime used by Stage08 workers.
                size = len(values)
                output = []
                for bin_index in range(1, 33):
                    real = imaginary = 0.0
                    for index, value in enumerate(values):
                        window = 0.5 - 0.5 * math.cos(2.0 * math.pi * index / (size - 1))
                        angle = 2.0 * math.pi * bin_index * index / size
                        weighted = value * window
                        real += weighted * math.cos(angle)
                        imaginary -= weighted * math.sin(angle)
                    output.append(math.hypot(real, imaginary))
                return output

            def percentile_95(values: list[float]) -> float:
                ordered = sorted(values)
                return ordered[min(len(ordered) - 1, math.ceil(len(ordered) * 0.95) - 1)]

            rms_start = rms(start)
            rms_end = rms(end)
            middle_rms = rms(middle)
            edge_rms = rms(end + start)
            rms_delta = abs(20 * math.log10(max(rms_start, 1e-9)) - 20 * math.log10(max(rms_end, 1e-9)))
            start_spectrum = spectrum(start)
            end_spectrum = spectrum(end)
            denominator = math.sqrt(sum(value * value for value in start_spectrum)) * math.sqrt(sum(value * value for value in end_spectrum))
            spectral = 0.0 if denominator <= 1e-12 else 1.0 - sum(left * right for left, right in zip(start_spectrum, end_spectrum)) / denominator
            joined = samples + samples
            join_index = len(samples)
            boundary_jump = float(abs(joined[join_index] - joined[join_index - 1]))
            normalized_jump = boundary_jump / max(middle_rms, 1e-9)
            edge_middle_ratio = edge_rms / max(middle_rms, 1e-9)
            boundary_context_ms = 50
            boundary_context_count = max(64, int(rate * boundary_context_ms / 1000))
            tail_context, head_context = samples[-boundary_context_count:], samples[:boundary_context_count]
            local_steps = [abs(values[index] - values[index - 1]) for values in (tail_context, head_context) for index in range(1, len(values))]
            local_curvature = [abs(values[index] - 2 * values[index - 1] + values[index - 2]) for values in (tail_context, head_context) for index in range(2, len(values))]
            step_reference = max(percentile_95(local_steps), 1e-9)
            curvature_reference = max(percentile_95(local_curvature), 1e-9)
            left_slope = float(samples[-1] - samples[-2])
            right_slope = float(samples[1] - samples[0])
            slope_mismatch = abs(right_slope - left_slope)
            boundary_jump_score = boundary_jump / step_reference
            boundary_slope_score = slope_mismatch / curvature_reference
            config = {
                "window_ms": window_ms,
                "boundary_context_ms": boundary_context_ms,
                "boundary_step_reference": "p95_abs_first_difference_per_side",
                "boundary_slope_reference": "p95_abs_second_difference_per_side",
                "fft": "dft-32+hann",
                "pcm": "48k-stereo-to-mono",
                "cycles": 2,
            }
            return {
                "status": "passed",
                "method": "two-cycle-boundary-continuity-seam",
                "media_sha256": media_hash,
                "analyzer_id": "rpg-audio-seam-analyzer",
                "model": "deterministic-pcm",
                "version": "2.1.0",
                "config_sha256": sha256_text(canonical(config)),
                "analyzed_at": utc_now(),
                "metrics": {
                    "start_end_rms_delta_db": rms_delta,
                    "spectral_distance": max(0.0, min(1.0, spectral)),
                    "boundary_jump": boundary_jump,
                    "normalized_boundary_jump": normalized_jump,
                    "boundary_context_ms": boundary_context_ms,
                    "boundary_step_p95": step_reference,
                    "boundary_jump_score": boundary_jump_score,
                    "slope_mismatch": slope_mismatch,
                    "local_curvature_p95": curvature_reference,
                    "boundary_slope_score": boundary_slope_score,
                    "edge_rms": edge_rms,
                    "middle_rms": middle_rms,
                    "edge_to_middle_energy_ratio": edge_middle_ratio,
                    "window_ms": window_ms,
                    "rendered_cycles": 2,
                    "join_sample_index": join_index,
                },
            }
        except AdapterError:
            raise
        except (OSError, wave.Error, ValueError) as exc:
            raise AdapterError("loop_analysis_failed", "Two-cycle loop analysis failed") from exc

    def upload(
        self,
        local_file: Path,
        operation_id: str,
        media_hash: str,
        heartbeat: Callable[[], None] | None = None,
    ) -> dict[str, Any]:
        command = [*self.upload_command, str(local_file), "--json"]
        try:
            with LeaseHeartbeat(heartbeat, side_effect=True):
                try:
                    process = subprocess.run(command, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=self.command_timeout)
                except (subprocess.TimeoutExpired, OSError) as exc:
                    raise AdapterError("upload_response_lost", "CS upload command did not return safely", uncertain=True) from exc
                if process.returncode != 0:
                    raise AdapterError("upload_response_lost", "CS upload command failed after reservation", uncertain=True, details={"stdout": process.stdout[-4000:], "stderr": process.stderr[-4000:]})
                value = extract_json(process.stdout)
                items = value if isinstance(value, list) else [value]
                if len(items) != 1 or not isinstance(items[0], dict) or items[0].get("status") != "ok":
                    raise AdapterError("upload_result_invalid", "CS upload did not return exactly one successful result")
                item = items[0]
                dentry_id = str(item.get("dentryId") or "").strip()
                final_url = str(item.get("cdnUrl") or "").strip()
                if not dentry_id or not final_url:
                    raise AdapterError("upload_identity_missing", "CS upload result lacks dentryId/cdnUrl")
                if not exact_cs_url(final_url, self.allowed_cs_hosts):
                    raise AdapterError("final_url_not_allowed_cs", "CS upload returned a URL outside the exact allowlist")
                if cs_dentry_id_from_url(final_url, self.allowed_cs_hosts) != dentry_id:
                    raise AdapterError("cs_dentry_url_mismatch", "CS upload URL dentryId differs from the returned dentry")
                readback_path, readback_http = download_limited(
                    final_url,
                    self.work_root / "readback" / f"{dentry_id}.mp3",
                    max_bytes=MAX_READBACK_BYTES,
                    allowed_hosts=self.allowed_cs_hosts,
                )
                if not readback_http["content_type"].startswith("audio/"):
                    raise AdapterError("upload_readback_mime_invalid", "CS readback Content-Type is not audio/*")
                return {
                    "status": "succeeded",
                    "client_operation_id": operation_id,
                    "media_sha256": media_hash,
                    "dentry_id": dentry_id,
                    "final_url": final_url,
                    "response_sha256": sha256_text(canonical(value)),
                    "observed_at": utc_now(),
                    "readback": {**readback_http, "dentry_id": dentry_id, "local_path": str(readback_path)},
                }
        except AdapterError as exc:
            if exc.uncertain:
                raise
            raise AdapterError(exc.code, str(exc), uncertain=True, details=exc.details) from exc
        except Exception as exc:
            raise AdapterError("upload_unexpected_failure", "Unexpected failure after CS upload reservation", uncertain=True) from exc
