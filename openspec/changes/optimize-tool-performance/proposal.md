## Why

OneThought currently reloads and clones more thought data than most interactions need, and write operations can rewrite the full JSONL store. As the local thought history grows, this makes capture, list refresh, tag suggestions, and archive/tag edits slower while increasing renderer and backend memory pressure.

## What Changes

- Optimize thought read paths so list views, tag metadata, and AI-visible summaries fetch only the data each workflow needs.
- Reduce backend cloning, repeated timestamp parsing, and repeated sorting/grouping during query execution.
- Reduce expensive write amplification by avoiding full-store compaction for simple creates and batching or scoping rewrites for operations that must rewrite data.
- Reduce frontend memory pressure by avoiding unconditional full thought fetches on every reload and by memoizing tag suggestion inputs.
- Add lightweight performance validation for large local datasets so regressions are visible.

## Capabilities

### New Capabilities
- `thought-performance`: Performance and memory expectations for thought listing, capture, tag metadata, and store mutation workflows.

### Modified Capabilities

## Impact

- Affected backend code: `src-tauri/src/store.rs`, `src-tauri/src/main.rs`, and Tauri command payloads where new lightweight query endpoints are introduced.
- Affected frontend code: `src/api.ts`, `src/App.tsx`, `src/QuickCapture.tsx`, and type definitions for any lean response shapes.
- Data format should remain compatible with the existing JSONL thought store; no migration should be required.
- No breaking UI behavior changes are expected.
