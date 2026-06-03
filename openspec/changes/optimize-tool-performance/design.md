## Context

OneThought stores thoughts in a JSONL file and keeps an in-memory `HashMap<String, Thought>` in the Tauri backend. The renderer currently refreshes both visible timeline data and tag metadata through thought-list APIs; in several paths it calls `thought_list_all`, which transfers every full thought to the frontend only to derive tag names and counts.

The current backend query path clones matching thoughts, sorts them, reparses timestamps for grouping, and returns full `Thought` payloads. Mutating operations that update, archive, delete, or remove a tag call `compact`, which rewrites the full JSONL store. This is acceptable for small histories but becomes expensive when users keep long-running local records.

## Goals / Non-Goals

**Goals:**

- Keep the existing JSONL data format and UI behavior compatible.
- Reduce renderer memory usage by replacing full-history fetches with lightweight metadata responses.
- Reduce backend CPU and allocation cost on list queries by avoiding duplicate clones, duplicate timestamp parsing, and unnecessary intermediate collections.
- Reduce write amplification where possible while preserving durable local writes.
- Add repeatable large-dataset validation so the optimization is measurable.

**Non-Goals:**

- Replace JSONL storage with SQLite or another database in this change.
- Add cloud sync, remote indexing, or multi-device conflict resolution.
- Redesign the UI or alter existing capture, archive, tag, and AI summary workflows.
- Guarantee hard real-time latency budgets across all machines; validation should provide practical local regression coverage.

## Decisions

1. Add lean backend query shapes instead of reusing full `Thought` everywhere.

   The backend should expose a tag metadata command that returns tag name, active count, archived count or total count, and stable color/index input as needed by the renderer. This avoids transferring content, timestamps, and metadata for tag chips and tag suggestions.

   Alternative considered: keep `thought_list_all` and memoize harder in React. That still sends and stores the full history in the renderer, so it does not address IPC payload size or renderer memory pressure.

2. Optimize `ThoughtRepository::query_grouped` around references and single-pass derivation.

   The query should filter over borrowed thoughts, parse each timestamp at most once per query item, derive its group key while filtering, then clone only the page or grouped items that must be returned to the renderer. Sorting should operate on lightweight keys or borrowed records before final cloning.

   Alternative considered: maintain multiple permanent secondary indexes immediately. That can improve large histories further, but it increases mutation complexity. A scoped query rewrite is lower risk and preserves the current repository model.

3. Use pagination or limits for list and AI-summary data paths.

   `QueryOptions.limit` and `offset` already exist but are not used by the renderer. The optimized flow should honor them in backend queries and make the renderer request bounded list data where a full list is not required. AI summary should summarize the current visible or explicitly bounded set rather than forcing a full-history fetch.

   Alternative considered: virtualize only the React timeline. Virtualization helps rendering, but backend and IPC costs remain high unless query results are bounded.

4. Keep append-only create fast and make rewrite-heavy operations explicit.

   Creates should continue to append one JSONL record and update memory. Operations that need removal or in-place mutation may still compact initially, but they should avoid repeated compaction in batch flows such as deleting all archived thoughts. Add a batch delete or batch mutation command for workflows that currently loop over many single-item commands.

   Alternative considered: write tombstone/update records and rebuild state on load. That reduces immediate rewrite costs but changes log semantics and requires compaction policy design. It can be deferred unless current scoped changes are insufficient.

5. Add measurement through deterministic local fixtures and lightweight timing assertions.

   Add a backend test or script that seeds a large in-memory/file-backed repository and exercises tag metadata, grouped list, create, update/archive, and batch delete paths. The test should focus on relative regression guardrails and output basic counts/timing rather than machine-specific absolute promises.

   Alternative considered: add a full profiling harness first. That is useful later, but a small fixture-based check is enough to guide this implementation and prevent obvious regressions.

## Risks / Trade-offs

- New lean response types can drift from UI needs -> Keep types in `src/types.ts` and `src/api.ts` explicit, and remove `thought_list_all` usage from production UI paths only after replacement endpoints exist.
- Query refactoring can change ordering or grouping -> Preserve descending group order and descending item order with targeted tests over mixed dates, archive flags, and tags.
- Batch mutation can hide per-item failures -> Return affected counts and keep the operation atomic at the repository level.
- Performance tests can be flaky on different machines -> Treat them as smoke/regression checks with generous thresholds and deterministic dataset sizes, not strict benchmarks.
- Avoiding full compaction for updates can complicate storage semantics -> Keep existing compact-on-update behavior unless tombstone/update-log semantics are explicitly implemented and tested.

## Migration Plan

1. Add lean response types and backend commands while keeping existing commands available.
2. Update frontend reload and quick-capture tag refresh paths to use lean metadata commands.
3. Update list queries to honor `limit` and `offset`, then request bounded data from the renderer.
4. Add batch mutation command for delete/archive-heavy workflows that currently loop and compact repeatedly.
5. Add fixture-based tests or scripts, run TypeScript and Rust checks, then remove any now-unused full-history frontend fetch path.

Rollback is straightforward because the JSONL format remains unchanged and the old commands can remain available during the transition.
