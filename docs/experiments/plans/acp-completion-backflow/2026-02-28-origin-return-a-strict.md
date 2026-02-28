# ACP Completion Origin-Return Design (A-Strict)

Date: 2026-02-28
Owner: codex-dev (orchestrated)
Status: Draft Approved (brainstorm complete)

## 1) Problem Statement

Current ACP runs can finish without notifying the originating Discord context (thread/channel), causing silent completion and poor operator awareness.

## 2) Goals (v1)

1. Auto-notify on ACP task end.
2. Route by a single source of truth: **origin at spawn time**.
   - Spawned from thread -> notify that thread.
   - Spawned from channel -> notify that channel.
3. Scope statuses to: **done / failed**.
4. If origin is invalid/missing, **fail-closed** (no misrouted delivery), while emitting explicit error telemetry.

## 3) Non-Goals (v1)

- No full lifecycle broadcast (start/milestones/blocked).
- No multi-destination fanout.
- No new global completion bus.

## 4) Principles Alignment

- First principles: fix completion backflow root cause directly.
- Occam’s razor: reuse existing announce + delivery stack.
- Single source of truth: requesterOrigin captured once, then read-only.
- No backward compatibility: remove ambiguous fallback routing for completion.

## 5) Proposed Approach: A-Strict

### 5.1 Components

1. **Origin Capture** (spawn time)
   - Persist `requesterOrigin = {channel, to, accountId, threadId}`.
2. **Outcome Normalize** (completion time)
   - `ok => done`
   - `error|timeout => failed` (v1 simplification)
3. **Strict Completion Router**
   - If origin valid: deliver exactly to origin.
   - If origin invalid/missing: fail-closed + telemetry.
4. **Delivery Sender**
   - Reuse existing announce/direct-send + idempotency.

### 5.2 Route Decision

1. ACP task created -> capture origin.
2. ACP task ended -> normalize outcome.
3. Route:
   - `threadId` present -> thread target
   - else -> channel target
4. Send once with idempotency.
5. On error -> no fallback to other destination; emit structured failure event.

## 6) Error Handling (Strict)

1. `missing_origin` -> no user delivery, emit error event.
2. `delivery_failed` (permission/not-found/etc.) -> no reroute to parent/other channel.
3. duplicate completion callbacks -> dedupe by idempotency key.
4. unknown outcome enum -> normalize to `failed`, mark `normalize_fallback=true`.

## 7) Acceptance Criteria (Given/When/Then)

1. Thread-origin success -> completion appears only in that thread as done.
2. Channel-origin failure -> completion appears only in that channel as failed.
3. Missing origin -> no user message + `missing_origin` event.
4. Duplicate callbacks -> exactly one visible completion message.
5. Stale/invalid thread target -> no fallback reroute + `delivery_failed` event.

## 8) Observability

Required fields:

- `run_id`
- `route_mode` (bound/fallback/hook/strict-failclosed)
- `origin_valid`
- `delivery_result` (sent/deduped/failed/skipped)
- `failure_reason`

Core counters:

- `acp_completion_total`
- `acp_completion_done_total`
- `acp_completion_failed_total`
- `acp_completion_missing_origin_total`
- `acp_completion_delivery_failed_total`
- `acp_completion_deduped_total`

## 9) Rollout Plan

1. Test replay (thread/channel mixed sample set).
2. Small-scope Discord thread rollout.
3. Full ACP rollout (run + session completion).
4. 24h watch window with rollback trigger on abnormal `missing_origin` / `delivery_failed` spikes.

## 10) Implementation Notes

- Reuse existing `requesterOrigin` capture path and completion announce path where possible.
- For completion routing, enforce strict origin requirement and disable ambiguous fallback behavior.
- Keep v1 minimal; evaluate a unified completion bus only after origin-return is stable.

## 11) Decision Log

- Routing fact: notify back to the origin context only.
- v1 status scope: done/failed.
- Strategy: A-Strict (minimal change + strict semantics).
