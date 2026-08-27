# Project persistence & local-first sync H3B

Status: implemented; mechanism only — list/delete/switching UX is deferred to H4.

## Decision

1. **requireSession() is the only project-owner authority.** `workers/app-api` derives `user_id` from the first-party session cookie for every project operation. Client-supplied `userId`/`ownerId` fields are rejected as unknown; the frontend identity snapshot never travels as ownership.
2. **Client-generated project ID supports idempotent create but confers no ownership.** The browser mints `crypto.randomUUID()` so a lost create response can be retried safely: same UUID + same owner + identical canonical content resolves to the stored project (`idempotent`); any other collision is an opaque `409 project_id_conflict`.
3. **RoomProject v1 remains unchanged.** The cloud stores exactly the editor document; no schema migration of the domain model.
4. **schema_version mirrors the validated document version** derived from `parseRoomProjectDocument`, never a trusted client field.
5. **revision is the concurrency authority**, starting at 1 and incrementing exactly once per committed update.
6. **Updates use owner-scoped optimistic CAS**: one `db.batch([UPDATE … WHERE id=? AND user_id=? AND revision=?, owner-scoped SELECT])`. Classification relies on documented D1 semantics (`meta.changes`; sequential transactional batch): `changes===1 → updated`; zero changes with no row → `not_found`; row present with `revision === expected+1` and byte-identical canonical JSON → `already_applied` (lost-response retry); otherwise `stale_revision`. Foreign and missing ids are indistinguishable externally (no ownership oracle).
7. **stale_revision never triggers silent overwrite.** A conflict freezes automatic sends; recovery runs only through explicit Save, which re-reconciles.
8. **Editor commits locally before any cloud synchronization.** Every accepted mutation (add/move/rotate/remove/duplicate/variant/finish/planner Apply/undo/redo/reset/hydration) persists through a single store seam immediately after the editor state commit.
9. **Cloud/network/local-storage failures never roll back local edits.** Storage errors surface as `unsynced(local-storage)` while the edit stands.
10. **The queue is single-flight with one latest-snapshot slot** (10 rapid mutations → first PUT + coalesced latest against the adopted revision). Guards: per-mutation generation counter, epoch invalidation on account change, sent-snapshot hash, late-response drop. No debounce timers, no unbounded retries; network/5xx → `unsynced` with natural retry via next edit or explicit Save.
11. **Sync metadata lives outside RoomProject and planner output**: runtime `ProjectSyncState` and persisted `ProjectSyncCheckpointV1` (partition key = full SHA-256 of internal user id). Dirty is always derived as `hash(current) !== lastSyncedHash`, crash-safe across write windows.
12. **Existing Save performs the first explicit cloud attachment** with the fixed order: owner-partition copy → pending-create checkpoint → clear shared draft → POST. Authentication alone uploads nothing.
13. **Account mismatch never auto-opens or uploads:** a cached attached document hydrates only when its checkpoint partition hash matches the authenticated user; otherwise the app stays local-only.
14. **Cookie contract/topology inherit H3A** (`docs/adr/first-party-session-h3a.md`): exact-Origin mutating requests, credentialed CORS limited to the configured origin, 512 KiB independent project body bound (auth keeps 16 KiB), strict `application/json` media type.
15. **Project list/delete/browser/conflict-resolution UX is H4.**
16. **Multiple active sessions remain allowed**; last-writer-wins is not silently applied — stale writers land in conflict state.
17. **Telegram bootstrap rate limiting is outside H3B.**

## Non-goals honored

No projects list/delete UI, no multi-project tabs/rename/sharing/collaboration, no server-side merge, no background retry timers, no Service Worker, no cloud persistence of session/undo, no RoomProject v2, no Contract v2 / planner / PlanProposal changes, no catalog asset facts.

## References

- D1 return objects & batch semantics: developers.cloudflare.com/d1/worker-api
- D1 limits (2 MB row bound ⇒ 512 KiB wire cap keeps headroom): developers.cloudflare.com/d1/platform/limits
- Workers best practices: developers.cloudflare.com/workers/best-practices/workers-best-practices
