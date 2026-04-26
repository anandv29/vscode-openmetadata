THIS IS A TEMPORARY TESTING SYSTEM, IGNORE

# Test Checklist — OpenMetadata VS Code Extension

Run these phases in order. Stop after each phase and confirm before proceeding.

---

## Phase 1 — Static Code Review

- [ ] Search endpoint matches `/search/query?q={name}&index=table_search_index&size=5`
- [ ] Table endpoint matches `/tables/name/{fqn}?fields=name,description,columns,owners,tags`
- [ ] DQ endpoint matches `/dataQuality/testCases/search/list?entityFQN={fqn}&size=10`
- [ ] Databases endpoint matches `/databases?limit=25`
- [ ] Schemas endpoint matches `/databaseSchemas?database={fqn}&limit=25`
- [ ] Tables endpoint matches `/tables?databaseSchema={fqn}&limit=25`
- [ ] Default base URL is `https://sandbox.open-metadata.org`
- [ ] Auth header is `Authorization: Bearer {token}` on every request
- [ ] Owners field uses `owners[]` (plural array), not `owner`
- [ ] DQ status casing is `Success/Failed/Aborted/Queued` (title case)
- [ ] Lineage URL is `{baseUrl}/table/{fqn}/lineage`
- [ ] 401 response → readable message mentioning "token" and "Setup"
- [ ] Network failure → mentions server URL in message
- [ ] No token → mentions "Setup" command
- [ ] 404 response → handled without crashing
- [ ] All 5 commands in `package.json` match exactly what's registered in `extension.ts`
- [ ] HoverProvider registered for `sql` and `jinja-sql`
- [ ] CodeLensProvider registered for `sql` and `jinja-sql`
- [ ] `loadStoredCredentials()` called on startup
- [ ] Status bar initial text = disconnected state
- [ ] All registered items pushed to `context.subscriptions`
- [ ] `provideCodeLenses()` is not async — no await, no API calls
- [ ] CodeLens returns `CodeLens[]` synchronously
- [ ] CodeLens command IDs: `openmetadata.openTable` and `openmetadata.viewLineage`
- [ ] Hover: table not found → returns `null` silently
- [ ] Hover: 401 → one-time warning, returns `null`
- [ ] Hover: network error → returns `null` silently
- [ ] Hover: empty DQ → shows "No DQ tests configured"
- [ ] Auth error shown only once (flag pattern)
- [ ] Cache TTL is `30_000` ms
- [ ] Cache has `clear()` method
- [ ] Cache is a singleton shared across providers
- [ ] Missing spinner in `openTable` and `viewLineage` commands
- [ ] Inconsistent search limits (`openTable`/`viewLineage` use 10, `searchTable` uses 5)
- [ ] `showWarningMessage` vs `showErrorMessage` inconsistency

---

## Phase 2 — Automated Tests

Run from the repo root:

- [ ] `npm run check-types` — zero errors
- [ ] `npm run lint` — zero warnings/errors
- [ ] `npm run test:unit` — all tests pass
  - [ ] `getTableAtPosition()` returns `"dim_customer"` on that word
  - [ ] `getTableAtPosition()` returns `null` on `SELECT`, `WHERE`, `FROM`
  - [ ] `getTableAtPosition()` returns `"orders"` not `"o"` for aliased table
  - [ ] Cache TTL expiry works (200ms test)
  - [ ] Cache `clear()` empties entries
  - [ ] Search URL encodes FQN correctly
  - [ ] Lineage URL format correct
- [ ] Block comments: `FROM /* comment */ orders` — parser handles correctly
- [ ] Backtick identifiers: `` FROM `mysql`.`ecommerce`.`orders` `` — detected
- [ ] Bracket identifiers: `FROM [TESTDB].[sales].[staffs]` — detected
- [ ] CTE name collision: `orders` as CTE and real table — correct one shown
- [ ] Underscore-prefixed tables: `FROM _airbyte_raw_customers` — detected

---

## Phase 3 — Live API Validation

Run from the repo root with sandbox token:

- [ ] `node test/api-live.mjs YOUR_TOKEN` — all endpoints pass
  - [ ] Sandbox reachable, 200 response
  - [ ] Unauthenticated request → 401
  - [ ] `GET /databases` → array with at least 1 database
  - [ ] `GET /search/query?q=dim_customer` → hits with `fullyQualifiedName` and `name`
  - [ ] `GET /tables/name/{fqn}` → object with `columns`, `owners`, `tags`, `description`
  - [ ] `GET /dataQuality/testCases` → data array or graceful 404
  - [ ] `GET /databaseSchemas` → array with at least 1 schema
- [ ] `listTables()` manual call → returns array of table names for a known schema
- [ ] DQ status casing confirmed (title case `Success/Failed` matches code)

---

## Phase 4 — Manual Testing in VS Code (F5 debug)

Press F5 in the repo root to open Extension Development Host.

### 4a. Auth
- [ ] Setup command → enter URL + token → status bar shows Connected
- [ ] Info notification appears on connect
- [ ] Close and reopen → status bar still shows Connected
- [ ] Wrong token → status bar shows error state
- [ ] Wrong token → readable error message (not stack trace)

### 4b. Hover — Happy Path
File: `query.sql` with `SELECT * FROM orders JOIN dim_customer ON ...`
- [ ] Hover over `orders` → tooltip appears
- [ ] Tooltip has: table name link, description, 3+ columns, owner, 1+ tag
- [ ] DQ section shows test count or "No DQ tests configured"
- [ ] Hover over `dim_customer` → tooltip appears
- [ ] Click table name link in tooltip → correct sandbox URL opens

### 4c. Hover — Edge Cases
- [ ] Hover over `SELECT` → no tooltip
- [ ] Hover over `FROM` → no tooltip
- [ ] Hover over `ON` → no tooltip
- [ ] Hover over whitespace → no tooltip
- [ ] Hover over `orders.customer_id` → no tooltip or tooltip for `orders`
- [ ] Hover over `FROM fake_table_xyz` → no tooltip, no error popup

### 4d. CodeLens
- [ ] Open `query.sql` → CodeLens links appear above FROM/JOIN line
- [ ] Lines with only `WHERE`, `SELECT`, `GROUP BY` → no CodeLens
- [ ] Click "Open `orders`" → correct sandbox URL opens
- [ ] Click "Lineage (`orders`)" → lineage URL opens
- [ ] Both links resolve to correct FQN

### 4e. Sidebar Catalog
- [ ] OpenMetadata icon visible in activity bar
- [ ] Click icon → databases appear in tree
- [ ] Expand database → schemas appear
- [ ] Expand schema → tables appear
- [ ] Click table → correct sandbox URL opens
- [ ] Refresh button → reloads without crash

### 4f. Search Command
- [ ] `Ctrl+Shift+P` → "OpenMetadata: Search Table" → input box appears
- [ ] Type `cust` → quick pick results appear
- [ ] Select result → correct sandbox URL opens
- [ ] Type `xyznonexistentabcdef` → info message shown, no crash
- [ ] Press Escape → nothing happens, no crash

### 4g. Error Handling
- [ ] Disconnect wifi → hover over table → no crash, no popup spam
- [ ] Reconnect wifi → hover works again
- [ ] Output panel (View → Output → "OpenMetadata") → no unhandled promise rejections

### 4h. Jinja-SQL files
- [ ] Create `.jinja` dbt model file with SQL → hover works on table names
- [ ] CodeLens appears above FROM/JOIN lines in `.jinja` file

---

## Phase 5 — Package & Clean Install

### 5a. Build
```bash
npm run build:prod
```
- [ ] Succeeds, produces `dist/extension.js`

### 5b. Package
```bash
npx @vscode/vsce package
```
- [ ] `openmetadata-0.1.0.vsix` produced
- [ ] Type `y` when prompted about missing LICENSE

### 5c. Install
- [ ] File → New Window
- [ ] Extensions → `...` → Install from VSIX → select `.vsix` → Reload

### 5d. Verify Clean Install
- [ ] Status bar visible on fresh open
- [ ] Setup → Connected state works
- [ ] Hover tooltip works on `dim_customer`
- [ ] CodeLens appears on SQL file
- [ ] Sidebar shows real databases
- [ ] Search returns results
- [ ] No unhandled errors in Output panel
