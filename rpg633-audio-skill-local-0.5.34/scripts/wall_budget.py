#!/usr/bin/env python3
"""Wall-clock budget constants and pure admission/derivation helpers.

Provenance: fix-plan-audio-timeout-v20 (approved). All constants here are the
reproducible values from that plan's constants table; this module intentionally
holds no I/O, subprocess, or signal handling so every rule can be tested as a
pure function.
"""

from __future__ import annotations

from typing import Any


BASH_MAX_TIMEOUT_MS = 600000
OUTER_DEFAULT_MS = 600000

WALL_SAFETY = 35
RESERVE = 35
MARGIN = 30
STARTUP = 5
SIGNAL_DELAY = 1
SHUTDOWN_IO = 1
SHUTDOWN_PATH_BUDGET = 1
SHUTDOWN_CLOSE_RESERVE = 2
GRACE = 1.438
GRACE_MARGIN = 0.3
LEASE_TTL = 120
HEARTBEAT = 30
K = 2
SCHED_RESERVE = 60
MAX_ASSETS = 4
ASSET_GEN_NOMINAL = 900
REQUIRED_EFFECTIVE = 10
MAX_TOTAL = 20
MAX_WAVE = 31200
SUBMIT_DEADLINE = 45
PROVIDER_TOTAL_DEADLINE = 1800
IO_OP_TIMEOUT = 30
MIN_USEFUL = 120

DEFAULT = OUTER_DEFAULT_MS // 1000 - RESERVE - MARGIN - WALL_SAFETY
USABLE = DEFAULT - SCHED_RESERVE - STARTUP


class WallBudgetError(Exception):
    """Fail-closed wall-budget violation; always maps to exit code 64."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.exit_code = 64

    def as_dict(self) -> dict[str, Any]:
        return {"code": self.code, "message": str(self), "exit_code": self.exit_code}


def parse_outer_timeout_ms(raw: str | None) -> int:
    """Parse --outer-timeout-ms; missing/unparseable/out-of-range is fail-closed."""
    if raw is None:
        raise WallBudgetError("outer_timeout_ms_missing", "--outer-timeout-ms is required from the calling wrapper")
    if isinstance(raw, bool) or not isinstance(raw, (str, int)):
        raise WallBudgetError("outer_timeout_ms_unparseable", "--outer-timeout-ms must be an integer number of milliseconds")
    try:
        value = int(str(raw).strip())
    except (ValueError, TypeError) as exc:
        raise WallBudgetError("outer_timeout_ms_unparseable", "--outer-timeout-ms could not be parsed as an integer") from exc
    if value <= 0:
        raise WallBudgetError("outer_timeout_ms_invalid", "--outer-timeout-ms must be a positive integer")
    if value > BASH_MAX_TIMEOUT_MS:
        raise WallBudgetError(
            "outer_timeout_ms_exceeds_bash_max",
            f"--outer-timeout-ms {value} exceeds BASH_MAX_TIMEOUT_MS {BASH_MAX_TIMEOUT_MS}",
        )
    return value


def assert_runtime_budget(outer_seconds: float, *, startup_elapsed: float, max_wall: float) -> None:
    """startup_elapsed + max_wall + SIGNAL_DELAY + RESERVE + MARGIN <= outer, else fail-closed."""
    if outer_seconds > BASH_MAX_TIMEOUT_MS / 1000.0:
        raise WallBudgetError(
            "outer_exceeds_bash_max",
            f"outer {outer_seconds}s exceeds BASH_MAX_TIMEOUT_MS {BASH_MAX_TIMEOUT_MS}ms",
        )
    required = startup_elapsed + max_wall + SIGNAL_DELAY + RESERVE + MARGIN
    if required > outer_seconds:
        raise WallBudgetError(
            "wall_budget_infeasible",
            f"startup+max_wall+SIGNAL_DELAY+RESERVE+MARGIN ({required}s) exceeds outer ({outer_seconds}s)",
        )


def derive_deadline(start_monotonic: float, outer_seconds: float) -> float:
    """The actual monotonic instant admission must stop by: start plus the
    smaller of USABLE (the provenance-tested worst-case allotment) and
    whatever headroom this particular outer_seconds actually leaves after
    RESERVE/MARGIN/WALL_SAFETY. Always <= start_monotonic + USABLE, so a
    short outer never lets a run believe it has more time than USABLE
    permits, and a long outer never gets more than USABLE regardless.
    Negative/invalid outer_seconds must be rejected by the caller via
    parse_outer_timeout_ms before this is ever called."""
    return start_monotonic + min(USABLE, outer_seconds - RESERVE - MARGIN - WALL_SAFETY)


def derived_child_budget_ms(outer_ms: int) -> int:
    """A nested child process must receive a strictly smaller budget than its
    parent, or the parent has zero headroom left to observe a child timeout
    and still write its own run.final. RESERVE and MARGIN belong to the child
    runner's admission contract and must not be charged again by the parent.
    Subtract only the wrapper-owned signal and shutdown-path costs; floor at
    1ms so the forwarded value remains a valid positive --outer-timeout-ms."""
    reserved_seconds = SIGNAL_DELAY + SHUTDOWN_IO + SHUTDOWN_PATH_BUDGET + SHUTDOWN_CLOSE_RESERVE
    return max(1, outer_ms - reserved_seconds * 1000)


def remaining_seconds(outer_seconds: float, elapsed_seconds: float) -> float:
    """Raw remaining budget; never clamped up to a floor."""
    return outer_seconds - elapsed_seconds


def should_admit_new_work(remaining: float, min_useful: float = MIN_USEFUL) -> bool:
    return remaining >= min_useful


def busy_wait_decision(remaining: float, ttl_remaining: float, min_useful: float = MIN_USEFUL) -> bool:
    """True = wait out the busy reservation; False = immediate exit2, no wait."""
    return remaining >= (ttl_remaining + min_useful)


def submit_admission_ok(remaining: float) -> bool:
    return remaining >= (SUBMIT_DEADLINE + SHUTDOWN_PATH_BUDGET + GRACE_MARGIN)


def derive_renewal_deadline(started_monotonic: float, *, lease_ttl: float = LEASE_TTL, heartbeat: float = HEARTBEAT) -> float:
    """Last moment a lease renewal is even worth attempting: the safety
    margin before the lease itself would naturally expire if no further
    renewal ever succeeds."""
    return started_monotonic + lease_ttl - 2 * heartbeat


def renewal_admitted(now_monotonic: float, derived_deadline_monotonic: float) -> bool:
    """Renew only while now < derived_deadline; past it, do not even attempt
    another renewal call -- it cannot land before the lease is gone."""
    return now_monotonic < derived_deadline_monotonic


def lease_lost(
    *, consecutive_failures: int, last_renew_ok_monotonic: float | None, now_monotonic: float,
    k: int = K, lease_ttl: float = LEASE_TTL, heartbeat: float = HEARTBEAT,
) -> bool:
    """True once the lease must be treated as lost: K consecutive renewal
    failures, OR the gap since the last successful renewal already exceeds
    LEASE_TTL - 2*HEARTBEAT (the same safety margin as derive_renewal_deadline),
    whichever comes first."""
    if consecutive_failures >= k:
        return True
    if last_renew_ok_monotonic is None:
        return False
    return now_monotonic > last_renew_ok_monotonic + lease_ttl - 2 * heartbeat
