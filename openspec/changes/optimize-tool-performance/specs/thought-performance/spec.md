## ADDED Requirements

### Requirement: Lightweight tag metadata
The system SHALL provide tag metadata for tag chips and tag suggestions without returning full thought content or full thought records.

#### Scenario: Main view loads tag chips
- **WHEN** the main window refreshes tag chips
- **THEN** the renderer receives tag names and counts without receiving thought content fields

#### Scenario: Quick capture loads tag suggestions
- **WHEN** the quick capture window opens or regains focus
- **THEN** it refreshes tag suggestions through the lightweight tag metadata path

### Requirement: Bounded thought list queries
The system SHALL honor query limit and offset options for thought list requests and SHALL avoid returning unbounded full-history payloads for normal timeline refreshes.

#### Scenario: Timeline refresh with limit
- **WHEN** the renderer requests a thought timeline with a limit
- **THEN** the backend returns no more than the requested number of matching thoughts across the grouped response

#### Scenario: Archive view filtering
- **WHEN** the renderer requests archived thoughts with a limit and optional offset
- **THEN** the backend applies archived filtering before pagination and preserves descending created-time order

### Requirement: Efficient grouped query execution
The system SHALL compute grouped thought query results without unnecessary full-result cloning, repeated timestamp parsing for the same item, or duplicate sorting passes.

#### Scenario: Query groups thoughts by day
- **WHEN** thoughts are queried with day grouping
- **THEN** each returned group is ordered newest first and each group item is ordered newest first

#### Scenario: Query filters by tag and date
- **WHEN** thoughts are queried with tag and date filters
- **THEN** the backend evaluates filters and grouping in a single query flow before cloning returned records

### Requirement: Reduced write amplification for batch workflows
The system SHALL avoid repeated full-store compaction when a user action mutates multiple thoughts as one workflow.

#### Scenario: Delete all archived thoughts
- **WHEN** the user deletes all archived thoughts from the archive view
- **THEN** the backend processes the affected ids in one repository operation and rewrites persistent storage no more than once

#### Scenario: Remove a tag from many thoughts
- **WHEN** the user removes a tag that appears on multiple thoughts
- **THEN** the backend updates all affected in-memory records and rewrites persistent storage no more than once

### Requirement: Performance regression validation
The system SHALL include a repeatable local validation path for large thought histories that exercises list refresh, tag metadata, create, update/archive, and batch mutation flows.

#### Scenario: Large dataset validation
- **WHEN** the validation runs against a deterministic large local dataset
- **THEN** it reports successful operation counts and basic timing or memory observations for the optimized paths

#### Scenario: Compatibility validation
- **WHEN** the optimized repository loads an existing JSONL thought store
- **THEN** existing thought records remain readable without migration
