---
name: migrate-to-openspec
description: >
  Brownfield migration skill. Scans an existing project and automatically
  generates a complete OpenSpec baseline: config.yaml, architecture specs,
  feature specs, and active changes from TODOs. Also optimizes CLAUDE.md by
  removing references to docs now absorbed into OpenSpec. Invoke manually for
  brownfield projects only. NOT for greenfield.
disable-model-invocation: true
allowed-tools: Bash, Glob, Grep, Read, Write, Task
---

# /migrate-to-openspec — Brownfield Migration to OpenSpec

You are performing a **one-time brownfield migration** of an existing project into
OpenSpec format. Your job is to scan the codebase automatically and generate all
OpenSpec files from scratch. The user will review and adjust the results afterward.

## Pre-flight checks

Before doing anything else, verify the environment:

```bash
# 1. OpenSpec must be initialized
openspec status --json 2>&1 || echo "NOT_INITIALIZED"

# 2. Check what already exists
ls openspec/specs/ 2>/dev/null | wc -l
ls openspec/changes/ 2>/dev/null | wc -l
```

If OpenSpec is not initialized, stop and tell the user:
> OpenSpec is not initialized. Run `openspec init --tools claude --profile expanded --force` first, then run `/migrate-to-openspec` again.

If `openspec/specs/` already contains files, warn the user:
> ⚠️  OpenSpec specs already exist. This migration will ADD to existing specs, not overwrite them. Proceed? (y/N)

Wait for confirmation before continuing.

---

## Migration Strategy: Multi-Agent Phases

This migration uses **4 parallel scout agents** (via Task tool) to scan the
codebase simultaneously, then a synthesis phase to write all OpenSpec files.

**Do not start synthesis until all 4 scout agents have returned results.**

Announce to the user:
> Starting brownfield migration. Spawning 4 scout agents to analyze the project in parallel. This may take a few minutes...

---

## Phase 1: Spawn Scout Agents (parallel, via Task tool)

Spawn all 4 agents simultaneously using the Task tool:

> **GLOBAL RULE FOR ALL SCOUT AGENTS — DIRECTORY EXCLUSIONS**
>
> Before scanning anything, read `.gitignore` (and `.git/info/exclude` if present):
>
> ```bash
> cat .gitignore 2>/dev/null
> cat .git/info/exclude 2>/dev/null
> ```
>
> Every pattern listed in `.gitignore` must be respected — never read files or
> descend into ignored directories. This automatically covers `node_modules/`,
> `Library/`, `Temp/`, `dist/`, `__pycache__/`, `.env`, and anything else
> the project owner has already decided to exclude.
>
> Additionally, always exclude regardless of `.gitignore` content:
> - `.git/` — version control internals
> - `openspec/` — being written by this migration right now
> - `.beads/` `.beads-cache/` `.claude-mem/` — tool data
>
> When building `grep` exclude flags, parse `.gitignore` to extract directory
> patterns and convert them to `--exclude-dir=<name>` flags dynamically.
> Always include `--exclude-dir=.git` as a baseline.


### Scout Agent 1 — Project Structure & Tech Stack

Task prompt:
```
You are a read-only scout agent. Scan this project and return a structured report.
Do NOT modify any files.

Collect ALL of the following:

1. PROJECT OVERVIEW
   - Primary language(s) and versions (check *.csproj, package.json, go.mod, Cargo.toml, etc.)
   - Framework/engine (Unity, React, Django, etc.) and version
   - Project type (game, web app, library, CLI, etc.)
   - Top-level folder structure (2 levels deep)
   - Entry points (main files, startup scenes, index files)
   - Build system (Makefile, cmake, gradle, Unity build settings, etc.)

2. ARCHITECTURE PATTERNS
   - Identify dominant patterns: MVC, MVVM, HMVC, ECS, layered, microservices, etc.
   - Key abstractions: what are the main classes/modules/systems?
   - Dependency direction: what depends on what?
   - Data flow: how does data move through the system?
   - Read up to 20 key source files to understand the architecture.
     Focus on: base classes, interfaces, managers, controllers, core systems.

3. EXTERNAL DEPENDENCIES
   - Third-party libraries/packages (from lock files and manifests)
   - External APIs or services used
   - Database or persistence layer

4. TEST COVERAGE
   - Does a test folder exist? What framework?
   - Rough estimate: are there many, some, or no tests?

5. BUILD & CI
   - CI config files (.github/workflows, .gitlab-ci.yml, etc.)
   - Scripts in package.json or Makefile

Return your findings as a structured markdown report under these exact headings:
## TECH_STACK
## ARCHITECTURE
## DEPENDENCIES
## TESTING
## BUILD_CI
```

### Scout Agent 2 — Existing Documentation & CLAUDE.md Audit

Task prompt:
```
You are a read-only scout agent. Find and extract ALL existing documentation,
and perform a full audit of CLAUDE.md. Do NOT modify any files.

PART A — DOCUMENTATION HARVEST

Search for and read:
1. README.md, README.*, CONTRIBUTING.md, ARCHITECTURE.md, DESIGN.md
2. Any /docs, /documentation, /wiki, /specs, /.notes folder
3. Any existing proposals, design docs, ADRs (Architecture Decision Records)
4. CHANGELOG.md or HISTORY.md
5. Any .md files in root or subdirectories (sample up to 30 files)
6. Comments at the top of key source files that describe the module purpose
7. Any openspec/ folder content that already exists
8. **Implementation plan files** (search multiple common locations):
   - Search directories: docs/implementation-plans/, docs/plans/, plans/, docs/design/, design/
   - Search for files matching patterns: *-PLAN.md, *-IMPLEMENTATION.md, *-DESIGN.md, IMPLEMENTATION-*.md
   - For each plan file found:
     * Read FULL CONTENT (not just summary)
     * Extract: scope, detailed tasks, library/technology choices, presets/patterns, integration approach
     * Summarize each plan in 200-300 words
     * Note which planned work item (phase/milestone) this plan supports

For each document found, extract:
- Its PURPOSE (what does it describe?)
- Key REQUIREMENTS or CONSTRAINTS mentioned
- DECISIONS already made
- FUTURE PLANS mentioned

PART B — CLAUDE.md AUDIT

Read CLAUDE.md carefully (if it exists). For every file reference, link, or
"read this document" instruction found inside CLAUDE.md:

1. Note the referenced file path
2. Check if that file actually exists on disk
3. Estimate the token cost: is it a large doc (>200 lines) or small?
4. Classify the reference as one of:
   - ESSENTIAL: Claude genuinely needs this every session (e.g. project conventions,
     critical architecture rules, active task lists)
   - REDUNDANT_AFTER_MIGRATION: this doc's knowledge will be fully covered by
     OpenSpec specs and config.yaml after migration
   - STALE: file does not exist on disk or is clearly outdated
   - UNCLEAR: cannot determine without more context

Return your findings as a structured markdown report under these exact headings:
## EXISTING_DOCS (list of files found with one-line summary each)
## EXTRACTED_REQUIREMENTS (bulleted list of concrete requirements found)
## ARCHITECTURAL_DECISIONS (decisions already made, from ADRs or docs)
## FUTURE_PLANS (things mentioned as planned/upcoming/TODO in documentation)
## IMPLEMENTATION_PLANS (full summaries of each plan file with scope, tasks, library choices, presets)
## RAW_EXCERPTS (paste the most important 3-5 paragraphs from docs verbatim)
## CLAUDE_MD_AUDIT
### Current references in CLAUDE.md:
- <file path> | <classification> | <token cost estimate> | <reason>
### Estimated token waste per session (sum of REDUNDANT + STALE docs):
<N> lines / approx <N> tokens loaded unnecessarily every session
```

### Scout Agent 3 — Technical Debt & Active Work

Task prompt:
```
You are a read-only scout agent. Find ALL signals of active work and technical debt.
Do NOT modify any files.

PART A — PLANNED WORK DISCOVERY (Generic across projects)

1. SEARCH FOR PLANNING DOCUMENTS
   Try multiple common file names (check in order, use first found):
   ```bash
   for file in docs/ROADMAP.md ROADMAP.md docs/TODO.md TODO.md docs/PLAN.md PLAN.md docs/TASKS.md TASKS.md docs/BACKLOG.md BACKLOG.md; do
     if [ -f "$file" ]; then
       echo "FOUND: $file"
       cat "$file"
       break
     fi
   done
   ```

2. EXTRACT PLANNED WORK
   Look for patterns indicating planned/future work:
   - Sections with headers containing: "Planned", "Not Started", "Future", "Upcoming", "TODO", "Backlog"
   - Unchecked task lists: `[ ]` or `- [ ]`
   - Phase/milestone markers: "Phase N:", "Milestone:", "Sprint:"
   - Status markers: "Status: Planned", "Status: Not started"

3. FOR EACH PLANNED ITEM, document:
   - Item identifier (phase number, milestone name, or section title)
   - Title/description
   - Goal (1 sentence if available)
   - Status (Planned / Not started / Future)
   - Implementation plan reference (if mentioned, e.g., "See [PLAN.md]")
   - Task count (how many unchecked tasks `[ ]`)

4. FIND FUTURE/EXPLORATORY SECTIONS
   Search for section headers containing any of these keywords:
   - "Future", "Exploratory", "Backlog", "Ideas", "Future Work", "Wishlist", "Nice to Have", "Someday", "Research"

   Extract all items listed under these sections (bullets, numbered lists, paragraphs)

PART B — CODE DEBT MARKERS

1. SEARCH FOR DEBT MARKERS
   Run these searches across all source files:
   First, build exclusion flags from .gitignore:
   ```bash
   EXCLUDE="--exclude-dir=.git --exclude-dir=openspec"
   while IFS= read -r line; do
     # skip comments and empty lines, extract directory patterns
     [[ "$line" =~ ^#.*$ || -z "$line" ]] && continue
     dir="${line%/}"  # strip trailing slash
     [[ -d "$dir" ]] && EXCLUDE="$EXCLUDE --exclude-dir=$dir"
   done < .gitignore
   ```

   Then run searches using $EXCLUDE:
   - grep -rn "TODO" $EXCLUDE --include="*.cs" --include="*.ts" --include="*.js" --include="*.py" --include="*.dart" --include="*.go" --include="*.rs" --include="*.lua" . | head -200
   - grep -rn "FIXME\|HACK\|BUG\|BROKEN\|WORKAROUND\|TEMPORARY\|TEMP\b" $EXCLUDE --include="*.cs" --include="*.ts" --include="*.js" --include="*.py" --include="*.dart" --include="*.go" --include="*.rs" --include="*.lua" . | head -200
   - grep -rn "DEPRECATED\|OBSOLETE\|REMOVE\|DELETE ME\|REFACTOR" $EXCLUDE --include="*.cs" --include="*.ts" --include="*.js" --include="*.py" --include="*.dart" --include="*.go" --include="*.rs" --include="*.lua" . | head -100
   - Adapt file extensions to the actual tech stack of this project.

2. CLASSIFY EACH ITEM into one of:
   - FEATURE: something new to build
   - BUG: known bug
   - DEBT: refactoring needed
   - QUESTION: unresolved design question
   - PERF: performance issue
   - DEPRECATION: legacy code to remove

3. FIND GIT SIGNALS
   - git log --oneline -50 (recent commits to understand current focus)
   - git diff --name-only HEAD~10 (recently changed files)
   - git stash list (any stashed work?)

4. FIND INCOMPLETE WORK
   - Partially implemented features (stub files, empty methods, "not implemented" exceptions)
   - Files with many commented-out blocks

Return your findings as a structured markdown report under these headings:
## PLANNED_WORK (list all planned items from planning documents)
### Item: <identifier> - <title>
- Goal: ...
- Status: ...
- Source: <file path>
- Implementation plan: <file path if referenced>
- Task count: <N unchecked tasks>

## FUTURE_EXPLORATORY (list all items from Future/Exploratory sections)
- Source: <file path and section name>
- Items:
  - <item 1>
  - <item 2>
  [...]

## DEBT_SUMMARY (count by category: X features, Y bugs, Z debt items, etc.)
## FEATURES (list: "filename:line - description")
## BUGS (list: "filename:line - description")
## DEBT (list: "filename:line - description")
## QUESTIONS (list: "filename:line - description")
## PERF (list: "filename:line - description")
## DEPRECATIONS (list: "filename:line - description")
## GIT_SIGNALS (what recent commits reveal about current priorities)
```

### Scout Agent 4 — Module Boundaries & Feature Map

Task prompt:
```
You are a read-only scout agent. Map the features and modules of this project.
Do NOT modify any files.

1. IDENTIFY ALL FEATURES/SYSTEMS
   Walk through the entire source code and identify discrete features, systems,
   or capabilities. A "feature" is something a user or another system can do.
   Examples for a game: "card combat", "deck building", "matchmaking", "save system"
   Examples for a web app: "user auth", "payment processing", "notifications"

   Read enough files in each module to understand what it does.

2. FOR EACH FEATURE/SYSTEM, document:
   - Name (short, kebab-case)
   - Purpose (1 sentence)
   - Key files (list main files)
   - Status: COMPLETE | IN_PROGRESS | BROKEN | PARTIAL | PLANNED
   - Stability: STABLE | UNSTABLE | LEGACY | EXPERIMENTAL
   - Dependencies on other features

3. IDENTIFY CROSS-CUTTING CONCERNS
   - Logging, error handling, configuration, authentication patterns
   - Any shared utilities or base classes used everywhere

Return your findings as a structured markdown report under these headings:
## FEATURE_MAP (one entry per feature in format below)
### Feature: <n>
- Purpose: ...
- Files: ...
- Status: ...
- Stability: ...
- Depends on: ...

## CROSS_CUTTING_CONCERNS
## SUGGESTED_SPEC_GROUPS (how to group features into spec files)
```

---

## Phase 2: Synthesize Results

After all 4 agents return, you now have complete information about the project.
Proceed to write all OpenSpec files. **Do not ask the user for input during this phase.**
Write everything based on what the agents discovered.

---

## Phase 3: Write `openspec/config.yaml`

Generate `openspec/config.yaml` from the combined scout reports.

Use this structure (fill in all fields from discovered data — do NOT leave placeholders):

```yaml
# OpenSpec Project Config — auto-generated by /migrate-to-openspec
# Review and adjust as needed.

schema: spec-driven

context: |
  Project: <name from structure scan>
  Type: <game / web app / library / etc.>

  Tech stack:
  <list discovered languages, frameworks, versions>

  Architecture: <describe the pattern found, e.g. "HMVC with ECS for combat systems">

  Key systems:
  <bullet list of major features/systems found>

  External dependencies:
  <key libraries/services found>

  Testing: <what was found — none / unit tests / integration tests / etc.>

  Conventions discovered:
  <naming patterns, folder conventions, coding style observed in codebase>

  Known constraints:
  <things the agents discovered that constrain development>

rules:
  proposal:
    - Always describe impact on existing systems
    - Reference the spec file(s) being modified
  specs:
    - Use Given/When/Then format for all scenarios
    - Each Requirement must have at least one Scenario
  design:
    - Must reference at least one existing file by path
    - Must describe impact on other systems
  tasks:
    - Keep each task scoped to 1-3 files maximum
    - Order tasks so earlier ones never depend on later ones
```

Write to `openspec/config.yaml`.

---

## Phase 4: Write Architecture Spec

Based on Scout Agent 1 and 4 findings, write `openspec/specs/architecture/spec.md`.

Use the template from `templates/architecture-spec.md` (in this skill's folder).
Adapt it fully — use real names, real file paths, real patterns found by the agents.

---

## Phase 5: Write Feature Specs

For each feature/system identified by Scout Agent 4 with status COMPLETE or STABLE,
write a spec file at `openspec/specs/<feature-name>/spec.md`.

Use the template from `templates/feature-spec.md` (in this skill's folder).

**Priority order for writing specs:**
1. Core/foundational systems first (things many other features depend on)
2. User-facing features second
3. Infrastructure/tooling last

Limit to the **10 most important** features on first pass.
Note at the top of each spec file: `# Auto-generated — review for accuracy`

---

## Phase 6: Create OpenSpec Changes for Active Work

### Part A: Changes from Planned Work (Planning Documents)

For each item in Scout Agent 3's **PLANNED_WORK** list:

1. **Read the implementation plan file** (if referenced):
   - Use Read tool to get full content of the implementation plan
   - Extract detailed task list, library/technology choices, presets/patterns, integration approach
   - If no implementation plan file exists, use the item description from the planning document

2. Create `openspec/changes/<kebab-name>/`

3. Write `proposal.md`:

```markdown
# Proposal: <Item Title>
# Auto-generated from: <source file> <item identifier> — review and refine as needed.

## Why
<Extract goal and rationale from planning document>

Discovered in: `<source file>` <item identifier>
<If implementation plan exists: "Detailed plan: `<path to implementation plan>`">

## What Changes
<List the systems/files affected from implementation plan or item description>

## Impact
**If not done**: <Describe consequences of not implementing>

**If done**: <Describe benefits of implementing>

**Breaking changes**: <None / describe any breaking changes>

**Systems affected**:
<List affected systems from implementation plan or item description>

## Rollback
If this feature causes issues:
1. Remove the tool/feature from affected files
2. Delete generated files
3. Remove tests
4. <Any data migration rollback steps>
```

4. Write `tasks.md`:
   - If implementation plan exists: Extract detailed tasks from the plan
   - If no implementation plan: Create tasks from the planning document's task list
   - Break into atomic steps (1-3 files per task)
   - Include library evaluation tasks if plan mentions alternatives
   - Include preset implementation tasks if plan lists presets
   - Include testing and documentation tasks

### Part B: Changes from Code TODOs/FIXMEs

For each item in Scout Agent 3's FEATURES and BUGS lists that represents
**unfinished or planned work** from code comments:

1. Create `openspec/changes/<kebab-name>/`
2. Write `proposal.md`:

```markdown
# Proposal: <title>
# Auto-generated from: <filename>:<line> — review and refine as needed.

## Why
<Describe what the TODO/FIXME says needs to be done>

Discovered in: `<file path>:<line number>`
Original comment: `<exact text of the TODO/FIXME>`

## What Changes
<List the files or systems likely affected>

## Impact
<What breaks or changes if this isn't done vs. if it is done>

## Rollback
<How to undo this change if it goes wrong>
```

3. Write `tasks.md` with a single starter task:

```markdown
# Tasks

## 1. Implementation
- [ ] 1.1 Implement: <short description>
  - Files: `<filename>`
  - Details: <from the TODO comment>
```

**Limit**: Create at most **20 changes** on first pass. If there are more,
create a summary file at `openspec/changes/_backlog.md` listing all remaining items.

### Part C: Future/Exploratory Backlog

If Scout Agent 3 found **FUTURE_EXPLORATORY** items:

1. Create `openspec/changes/_future-ideas.md`:

```markdown
# Future Ideas & Exploratory Work

Items from <source file> and other exploratory notes.
These are not committed work but ideas for future consideration.

Source: <file path and section name>

<Organize items by category if possible, otherwise list as-is>

## <Category 1>
- <item 1>
- <item 2>

## <Category 2>
- <item 3>
- <item 4>

## Uncategorized
- <remaining items>
```

2. Do NOT create full OpenSpec changes for exploratory items (they're not planned work)
3. Note in migration report: "X exploratory ideas captured in openspec/changes/_future-ideas.md"

> **Note on Beads sync:** Do NOT create Beads issues manually here.
> After migration is complete, Phase 9 will automatically create Beads issues
> from all OpenSpec changes.

---

## Phase 7: Optimize CLAUDE.md

This phase eliminates token waste in future sessions. Every doc reference in
CLAUDE.md that is now covered by OpenSpec gets loaded into context on every
single session start — even though the knowledge already lives in openspec/specs/
and openspec/config.yaml. This phase removes that redundancy.

### Step 1 — Read CLAUDE.md

```bash
cat CLAUDE.md 2>/dev/null || echo "NO_CLAUDE_MD"
```

If CLAUDE.md does not exist, skip this phase and note it in the report.

### Step 2 — Determine what to remove

Using the `## CLAUDE_MD_AUDIT` from Scout Agent 2, build two lists:

**REMOVE** (references that are now redundant):
- All references classified as **REDUNDANT_AFTER_MIGRATION**
  — their knowledge is now in `openspec/specs/` and `openspec/config.yaml`
- All references classified as **STALE**
  — files that do not exist on disk

**KEEP** (do not touch):
- All references classified as **ESSENTIAL**
- All references classified as **UNCLEAR** (when in doubt, keep)
- Any content that is NOT a doc reference (inline conventions, tool config, etc.)
- Any blocks marked with OpenSpec's own managed markers

### Step 3 — Back up and rewrite

```bash
cp CLAUDE.md CLAUDE.md.pre-migration
```

Rewrite CLAUDE.md: keep all ESSENTIAL content intact, remove REDUNDANT and STALE
doc references, and add this single replacement block where the removed references
were:

```markdown
## Project Knowledge Base

Architecture, requirements, and active work are maintained in OpenSpec.
See: openspec/specs/ (source of truth) and openspec/changes/ (active work).
Project context is injected automatically via openspec/config.yaml.
```

### Step 4 — Safety rules

- Do NOT delete CLAUDE.md — only edit it
- Do NOT remove OpenSpec managed blocks (marked with OpenSpec markers)
- Do NOT remove git hooks, tool configurations, or coding conventions
- If uncertain about any reference — keep it

---

## Phase 8: Write Migration Report

Write `openspec/MIGRATION_REPORT.md`:

```markdown
# OpenSpec Migration Report
Generated: <date>
By: /migrate-to-openspec skill

## What Was Created

### config.yaml
<one-line summary of what was put in context>

### Specs Created (<N> total)
<list of specs/*/spec.md with one-line description each>

### Changes Created (<N> total)
<list of changes/*/proposal.md with source location each>

### Future Ideas
<N exploratory ideas in changes/_future-ideas.md (if found)>

### Backlog
<N remaining items in changes/_backlog.md — review manually>

---

## CLAUDE.md Optimization

### Token savings
Before: ~<N> tokens loaded per session (all referenced docs)
After:  ~<N> tokens loaded per session (essential only)
Saved:  ~<N> tokens per session

### References removed (<N> total)
| File | Classification | Reason |
|---|---|---|
| <path> | REDUNDANT_AFTER_MIGRATION | Covered by openspec/specs/<n>/spec.md |
| <path> | STALE | File does not exist on disk |

### Docs now covered by OpenSpec (safe to archive)
These files were removed from CLAUDE.md because their knowledge is now in OpenSpec.
The files themselves have NOT been deleted. You may archive or delete them at
your discretion once you have verified the corresponding specs are accurate.

| File | Was used for | Now covered by |
|---|---|---|
| <path> | <original purpose> | openspec/specs/<n>/spec.md |

Original CLAUDE.md backed up to: `CLAUDE.md.pre-migration`

---

## What Needs Human Review

1. **config.yaml** — Verify the `context:` block is accurate.
   Check: architecture description, tech stack versions, key constraints.

2. **Architecture spec** — Verify patterns match your intent, not just current code.

3. **Feature specs** — Describe current behavior. Use OpenSpec changes for
   anything that should change in the future.

4. **Changes from TODOs** — Some may be outdated or already fixed.
   Review openspec/changes/ and delete irrelevant ones.

5. **CLAUDE.md** — Review the optimized version. Restore from
   `CLAUDE.md.pre-migration` if anything essential was removed by mistake.

---

## Items NOT Migrated (require manual work)

<list anything the agents found but could not classify automatically>

---

## Suggested Next Steps

1. Review this report carefully, especially the CLAUDE.md optimization section
2. Review Beads issues with `bd list --status=open` (<N> issues created automatically)
3. Validate the migration baseline with `/opsx:explore` (already executed)
4. Pick one change from openspec/changes/ and run `/opsx:apply <change-name>` to start implementation
```

---

## Phase 9: Create Beads Issues from OpenSpec Changes

This phase converts all OpenSpec changes into Beads issues for task tracking.

### Step 1 — Verify Beads is initialized

```bash
bd list --json 2>&1 || echo "BEADS_NOT_INITIALIZED"
```

If Beads is not initialized, skip this phase and note in the final announcement:
"⚠️ Beads not initialized. Run `bd init` then manually create issues from openspec/changes/"

### Step 2 — Loop through all OpenSpec changes

```bash
ls openspec/changes/ | grep -v "^_" | grep -v "archive"
```

For each change directory (excluding _backlog.md, _future-ideas.md, and archive/):

1. Read `openspec/changes/<change>/proposal.md` to extract:
   - Title (from first # heading)
   - Goal/Why section (for description)

2. Create Beads issue:
   ```bash
   bd create \
     --title="<Title from proposal>" \
     --type=feature \
     --priority=2 \
     --description="<Goal from proposal>. See openspec/changes/<change>/"
   ```

3. Capture the issue ID from output (format: `<project>-<id>`)

### Step 3 — Report created issues

Count total issues created and list them in format:
```
Created <N> Beads issues from OpenSpec changes:
- <issue-id-1>: <title>
- <issue-id-2>: <title>
[...]
```

### Step 4 — Run opsx:explore for validation

After all Beads issues are created, automatically invoke the opsx:explore skill:

```bash
# This will be handled by Skill tool invocation
```

Use the Skill tool to invoke `opsx:explore` with no arguments. This validates the migration baseline and explores the OpenSpec structure.

If the skill invocation fails or the skill doesn't exist, note in the final announcement:
"⚠️ Could not run /opsx:explore automatically. Run it manually to validate the migration."

---

## Final Announcement

Tell the user:

> ✅ Migration complete! Here's what was done:
>
> - `openspec/config.yaml` — project context injected into every future spec
> - `openspec/specs/` — <N> architecture and feature specs
> - `openspec/changes/` — <N> active changes from planned work and code TODOs
> - `openspec/changes/_future-ideas.md` — <N> exploratory ideas captured (if found)
> - `CLAUDE.md` — optimized: <N> redundant doc references removed (~<N> tokens saved per session)
> - `CLAUDE.md.pre-migration` — backup of original
> - `openspec/MIGRATION_REPORT.md` — full summary, token savings, docs to archive
> - **Beads issues**: <N> issues created from OpenSpec changes (or note if Beads not initialized)
> - **Validation**: /opsx:explore executed (or note if failed)
>
> **Next steps:**
> 1. Read `openspec/MIGRATION_REPORT.md` for detailed analysis
> 2. Review Beads issues with `bd list --status=open`
> 3. Pick a change and run `/opsx:apply <change-name>` to start implementation

---

## Error Handling

If any phase fails, do NOT stop the migration. Log the error to
`openspec/MIGRATION_REPORT.md` under a `## Errors` section and continue
with remaining phases. Partial output is better than no output.

If a scout agent returns empty or incomplete results, proceed with
whatever data is available and note the gap in the report.

**Phase 7 (CLAUDE.md) is the most sensitive phase** — it modifies a file
that affects every future Claude Code session. If anything goes wrong:

```bash
cp CLAUDE.md.pre-migration CLAUDE.md
```

Note the failure in the report and ask the user to optimize CLAUDE.md manually
using the `## CLAUDE_MD_AUDIT` section as a guide.
