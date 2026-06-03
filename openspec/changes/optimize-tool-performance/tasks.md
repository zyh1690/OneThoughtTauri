## 1. Backend Data Shapes and Queries

- [x] 1.1 Add lightweight tag metadata structs and repository methods that return tag names and active/archived counts without cloning full thoughts.
- [x] 1.2 Add Tauri commands and TypeScript-facing payloads for tag metadata, keeping existing full thought list commands available during migration.
- [x] 1.3 Refactor `ThoughtRepository::query_grouped` to filter borrowed thoughts, parse timestamps once per candidate item, apply limit/offset, and clone only returned items.
- [x] 1.4 Preserve day/month grouping order and item ordering with focused Rust tests or fixture checks.

## 2. Frontend Reload and Suggestion Flow

- [x] 2.1 Replace main-window tag chip derivation from `listAllThoughts()` with the lightweight tag metadata API.
- [x] 2.2 Replace quick-capture tag refresh from `listAllThoughts()` with the lightweight tag metadata API.
- [x] 2.3 Memoize shared tag suggestion calculation for main input, quick modal, and quick-capture window so keyboard handlers and render paths do not duplicate filtering work.
- [x] 2.4 Update timeline reload calls to pass bounded `limit` and `offset` options while preserving current visible ordering and filters.

## 3. Batch Mutation and Write Amplification

- [x] 3.1 Add a repository batch delete method that removes multiple ids and compacts persistent storage once.
- [x] 3.2 Add a Tauri command and frontend API wrapper for batch delete.
- [x] 3.3 Update archive "delete all" to call the batch delete API instead of issuing one delete command per thought.
- [x] 3.4 Confirm tag removal still compacts no more than once for multi-thought updates.

## 4. Validation

- [x] 4.1 Add deterministic large-dataset validation for tag metadata, grouped queries, create, archive/update, and batch delete paths.
- [x] 4.2 Run TypeScript checks and Rust checks/tests for the changed code.
- [x] 4.3 Verify existing JSONL stores load without migration and existing capture/archive/tag workflows still behave the same.
- [x] 4.4 Remove unused full-history frontend fetches from production UI paths after replacement coverage is in place.
