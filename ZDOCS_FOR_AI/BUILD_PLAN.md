# OpenMetadata Hackathon — Build Plan
## VS Code Extension (#26650) | April 17–26, 2026

---

## What We're Building

A VS Code extension that surfaces OpenMetadata context inside the IDE. Hover over a table name in SQL or dbt Jinja → see metadata, columns, owners, tags, data quality status, and lineage — without leaving the editor.

---

## Issue vs. Current Status

| Issue requirement (#26650) | Status |
|---|---|
| Table descriptions from OpenMetadata | ✅ Done — shown in hover tooltip |
| Column types from OpenMetadata | ✅ Done — shown in hover tooltip |
| Tags from OpenMetadata | ✅ Done — shown in hover tooltip |
| Lineage information | ✅ Done |   
| Data quality status | ⚠️ Done — not properly tested (sandbox has barely any DQ data) |
| Recent DQ test results | ⚠️ Done — not properly tested (sandbox has barely any DQ data) |
| Owner information | ✅ Done — shown in hover tooltip |
| Links to OpenMetadata UI | ✅ Done — CodeLens "Open in OM" + clickable link in tooltip |
| dbt model support | ✅ Done |

---

## Completed Features ✅

| Feature | Done |
|---------|------|
| Scaffold + auth setup (SecretStorage) | ✅ |
| API client + types | ✅ |

---

## Remaining Work

Features (in execution order) → Tests → Docs/Submission

---

## New Features

Priority: 🔴 Must Do → 🟡 Should Do → 🟢 Nice to Have

---

### 🟡 L. Additional DQ Signal Sources (research + implement)

**What it is:** Test cases are not the only DQ signal in OpenMetadata. Research and surface other available signals in the tooltip.

**Known candidates:**
- **Table Profiler** — column-level statistics from the ingestion pipeline: row count, null %, unique %, min, max, mean, std dev. Available via `fields=profile` on `GET /v1/tables/name/{fqn}` or a dedicated profile endpoint. No test configuration required — populated automatically by the profiler.
- **Data Observability / Anomaly Detection** — monitors that watch metrics over time and flag anomalies. Likely enterprise-tier only; needs investigation.

**Tasks:**
- [ ] Check if sandbox tables have profiler data (`fields=profile` on a known table)
- [ ] Find the correct profiler endpoint and document it in `openmetadata-api.md`
- [ ] Research what other DQ-adjacent signals exist (observability, anomaly, SLAs)
- [ ] Decide which signals are worth surfacing in the tooltip vs out of scope
- [ ] Implement whichever signals are available and add value

---

### 🟢 A. DQ Diagnostics — Yellow squiggles on tables with failing tests

**What it is:** On file open/save, the extension checks DQ status for every table in the file. Any table with `Failed` or `Aborted` test results gets a yellow `Warning` squiggle underlined in the editor. Hovering the squiggle shows which test(s) failed.

**Tasks:**
- [ ] Create `src/providers/diagnosticsProvider.ts`
  - [ ] Uses `vscode.languages.createDiagnosticCollection('openmetadata')`
  - [ ] On document open + save: extract all table refs via `extractTableRefs()`, fetch DQ for each, map `Failed`/`Aborted` → `Warning` diagnostics at the exact character range of the table name
  - [ ] Hover message on squiggle: show failed test name(s) + timestamp
  - [ ] Clear diagnostics for a file when the file is closed
- [ ] Register `diagnosticsProvider` in `src/extension.ts`
  - [ ] Push to `context.subscriptions`
  - [ ] Listen to `vscode.workspace.onDidOpenTextDocument` and `onDidSaveTextDocument`

---

### 🟢 D. Column-Level Hover

**What it is:** When hovering on a column reference like `c.customer_id`, show that column's description, data type, and tags from OpenMetadata. The column data is already fetched in `getTable()` — this just needs to detect the column reference and match it.

**Tasks:**
- [ ] Detect `alias.columnName` pattern at cursor in `src/utils/tableParser.ts`
  - [ ] Resolve the alias to its source table (from the same SQL query context, ±5 lines)
  - [ ] Match column name against `columns[]` from that table's cached metadata
- [ ] Add column detail section to `src/utils/markdown.ts` — show data type + description + column tags
- [ ] Return column-level hover (instead of or in addition to table-level hover) when cursor is on a column

---

### 🟡 K. Retry with Exponential Backoff

- [ ] In `src/services/metadataService.ts`: wrap `apiFetch` with max 2 retries on network errors only (not 401/404)
- [ ] Delays: 500ms, 1000ms
- [ ] look for other such improvements in other areas too.

---

### 🟢 M. Expand Sidebar Search to All Entity Types

**What it is:** The current placeholderr sidebar search icon (and command palette "Search Table") only searches tables via `table_search_index` (with clunky search fn.). Expand it to search all entity types — services, databases, schemas, tables, columns, etc. with additional features.

**Tasks:**
- [ ] Verify which search index covers databases, schemas, and services on sandbox
- [ ] Update `src/commands/searchTable.ts` — broaden index, handle mixed result types, build correct URL per entity type
- [ ] Show entity type label in QuickPick (e.g. `$(table) dim_customer`, `$(folder) shopify`)
- [ ] Rename command title from "Search Table" to "Search Catalog" (`package.json` + `searchTable.ts`)

---

## Test Pipeline

### Current State
- ✅ `test/run-tests.ts` — 40+ unit tests (sqlParser, cache, URL construction)
- ✅ `test/api-live.mjs` — 7 live endpoint tests against sandbox
- ✅ `test/manual.sql` — 12-section manual smoke test with ✅/⚠️/❌ markers
- ❌ `test/manual.jinja` — missing
- ❌ Unit tests for new features (A, B, C, D)
- ❌ Live API test for lineage endpoint

### What to Add

**Unit tests — extend `test/run-tests.ts`:**
- [ ] dbt ref() parsing: `{{ ref('orders') }}` → extracts `"orders"`
- [ ] dbt ref() with double quotes: `{{ ref("dim_customer") }}` → extracts `"dim_customer"`
- [ ] Column cursor detection: `c.customer_id` at cursor char 2 → resolves to column name `customer_id`
- [ ] Column cursor detection: alias not in scope → returns null
- [ ] Lineage response parsing: given mock lineage JSON → extracts correct upstream/downstream names

**Live API tests — extend `test/api-live.mjs`:**
- [ ] `GET /lineage/table/name/{fqn}?upstreamDepth=1&downstreamDepth=1` — confirm response has expected fields (verify field names on sandbox first)

**`TESTS.md` updates:**
- [ ] Add Phase 1 static checklist items for new features (diagnostics registration, lineage method, ref() regex)
- [ ] Add Phase 4 manual test sections for DQ squiggles, column hover, dbt ref(), lineage in tooltip
- [ ] Add Phase 4h section for Jinja-SQL file tests

### When to Run What

| Situation | Command |
|---|---|
| After every code change | `npm run check-types` + `npm run test:unit` |
| After adding a new API call | `node test/api-live.mjs YOUR_TOKEN` |
| Before committing | All of above + `npm run lint` |
| Final submission check | Full TESTS.md phases 1–5 |

---

## Architecture Notes — Parsing Evolution

The current parser (`TABLE_REF_PATTERN` regex on full document text) is approach 4 from PARSING_GUIDE.md. It works well for the hackathon but has a known long-term ceiling.

The natural evolution path is toward a **position-aware tokenizer** (approach 2 refined):
- Strip comments → tokenize into `{token, type, offset}` pairs → scan token stream for SQL keywords → collect candidates
- This is the same idea as the current approach but structured: instead of one dense regex doing everything at once, you have readable token-scanning logic
- Handles `FROM a, b, c` naturally (collect all tokens after FROM until next keyword)
- Handles schema-qualified functions naturally (`(` is its own token type, so `get_active_users` followed by `(` token is obviously a function)
- Each new SQL construct is a new scanning rule, not a regex modification
- This is what j-clemons' dbt-language-server does in Go — a full lexer is just a mature version of this same tokenizer approach

For post-hackathon: if the extension gets real use and edge cases accumulate, replace `documentScanner.ts` internals with a position-aware tokenizer. The external interface (`TableRef[]`, `scanDocumentCached`) stays identical — it's a drop-in swap.

The same evolution applies to dbt parsing. The current combined regex handles all common `ref()`/`source()` forms correctly. The long-term ceiling is the Fivetran two-step approach: a `CALL_FINDER` regex grabs each `ref(...)` / `source(...)` call boundary, then `EXTRACT_QUOTED` (`/'[^']*'|"[^"]*"/g`) pulls all quoted strings from that call and takes the last one as the model name. This reads naturally ("last quoted arg = model") and handles edge cases cleanly — but accurate call boundary detection requires paren-depth tracking, which needs a tokenizer. Same upgrade path, same drop-in swap.

Beyond the tokenizer, the reference ceiling is dbt-extractor (dbt Labs, Rust) — a 3-stage tree-sitter pipeline that produces a proper CST and only emits results it's 100% certain about. Worth knowing: even that ceiling only statically resolves ~60% of real-world dbt models; the other ~40% use dynamic Jinja that requires full rendering and are intentionally skipped. The tokenizer is likely the practical stopping point for this extension.

---

## README.md (Submission Requirement)

README doesn't exist yet. Required for Presentation Quality judging dimension.

**Sections required:**
- [ ] What it does — feature overview with screenshots for every major feature
- [ ] Screenshots: hover tooltip, DQ diagnostics squiggle, column hover, dbt ref() tooltip, lineage in hover, sidebar, CodeLens, status bar, search
- [ ] Requirements — VS Code 1.80+, any OpenMetadata server
- [ ] Install — drag `.vsix` or use "Extensions: Install from VSIX"
- [ ] Setup — run "OpenMetadata: Setup" → enter server URL + personal access token
- [ ] How to get a token — profile icon → View Profile → Access Tokens → Generate
- [ ] Supported file types — `.sql`, `.py`, `.jinja`, `.sql.jinja` (dbt models)
- [ ] Feature details — hover, CodeLens, DQ diagnostics, lineage, sidebar, search
- [ ] Limitations — CTE alias ambiguity (hover may show real table tooltip for a CTE that shadows it)
- [ ] Link to CONTRIBUTING.md

---

## Demo Video Script

3 minutes. Record after all features are implemented and tested.

1. Open fresh VS Code with `.vsix` installed
2. Run "OpenMetadata: Setup" → enter `https://sandbox.open-metadata.org` + token → status bar shows "⚡ Connected"
3. Open `query.sql` with `SELECT * FROM orders JOIN dim_customer ON ...`
4. **Hover over `orders`** → tooltip: description, columns, Owner, Tags, DQ pass/fail, lineage upstream/downstream
5. **Show DQ squiggle** — a table with a failing test is underlined yellow; hover the squiggle → see which test failed
6. **Show CodeLens** — "🔗 Open orders | 📊 View Lineage" above the FROM line; click lineage → browser
7. **Hover on `c.customer_id`** → column tooltip: data type + description
8. Open a `.jinja` dbt model file → **hover on `{{ ref('dim_customer') }}`** → same tooltip as table hover
9. Open sidebar → expand `sample_data` → `ecommerce_db` → `shopify` → tables list
10. Ctrl+Shift+P → "OpenMetadata: Search Table" → type "cust" → select → browser opens

---

## Packaging and Submission

- [ ] `npm run build:prod` → confirms `dist/extension.js` builds
- [ ] `npx @vscode/vsce package` → produces `openmetadata-0.1.0.vsix`
- [ ] Clean install test: new VS Code window → Install from VSIX → full smoke test (TESTS.md Phase 5)
- [ ] Record demo video (follow script above)
- [ ] Submit via hackathon form with: GitHub repo link, demo video link, .vsix file, README
