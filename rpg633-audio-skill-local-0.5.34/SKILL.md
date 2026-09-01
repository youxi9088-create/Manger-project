---
name: rpg-audio-asset-production-v2
description: Produce governed RPG2 BGM and bounded-batch Doubao Seed Audio TTS from an approved audio_tasks JSON artifact. Local temporary patch for Stage08 audio production where the worker runtime lacks numpy; preserves deterministic PCM loop rendering and seam evidence with the Python standard library.
---

# RPG Audio Asset Production v2 — local Stage08 patch

Use the injected package's normal Stage08 entry and all existing task, binding,
provider, upload, and validation gates. This temporary overlay changes only
`scripts/production_adapters.py`: BGM PCM circular-crossfade rendering and seam
analysis use the Python standard library rather than `numpy`.

Do not alter the approved task manifest, the typed Stage08 binding, provider
boundary handling, upload behavior, or quality thresholds.
