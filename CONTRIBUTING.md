# Contributing

## Prerequisites

- [Node.js](https://nodejs.org) v18 or later
- [VS Code](https://code.visualstudio.com) v1.100.0 or later
- A Personal Access Token from [sandbox.open-metadata.org](https://sandbox.open-metadata.org) — needed for live integration tests

---

## Setup

```bash
git clone https://github.com/anandv29/vscode-openmetadata.git
cd vscode-openmetadata
npm install
```

---

## Running the Extension Locally

Open the repo folder in VS Code, then press **F5**.

This compiles the extension and opens a new **Extension Development Host** window with the `test/` folder pre-loaded and the extension active. Any `.sql` or `.jinja` file in that window will have hover tooltips, CodeLens actions, and the sidebar active.

To connect to OpenMetadata in the dev window: `Ctrl+Shift+P` → **OpenMetadata: Setup (Connect)** → enter `https://sandbox.open-metadata.org` and your Personal Access Token.

---

## Project Structure

```
├── src/
│   ├── extension.ts              # Entry point — registers all commands and providers
│   ├── types/
│   │   ├── openmetadata.ts       # API response shapes (OmTable, OmDQResult, OmLineageResponse, etc.)
│   │   └── editor.ts             # VS Code editor types (TableRef — used by scanner and providers)
│   ├── services/
│   │   ├── metadataService.ts    # Data layer — API calls, FQN resolution, singleflight dedup, clearCache()
│   │   ├── metadataCache.ts      # TTL cache with per-type TTLs + globalState persistence across restarts
│   │   └── documentCache.ts      # document.version cache for scan results — invalidated per keystroke
│   ├── utils/
│   │   ├── documentScanner.ts    # Full-document scanner — SQL refs + dbt ref/source, cached by version
│   │   ├── sqlParser.ts          # Regex patterns + keyword blocklist (TABLE_REF, DBT_REF, DBT_SOURCE)
│   │   ├── tooltipBuilder.ts     # Hover tooltip Markdown builder
│   │   ├── tableDetailsHtml.ts   # Sidebar Table Details panel HTML builder
│   │   ├── lineageParser.ts      # Transforms OmLineageResponse → upstream/downstream Maps grouped by entity type
│   │   └── helpers.ts            # Shared helpers (errorMessage, stripHtml, formatAge, extractColumnFromEntityFqn)
│   ├── providers/
│   │   ├── hoverProvider.ts        # Hover tooltip provider (SQL + Jinja-SQL)
│   │   ├── codeLensProvider.ts     # CodeLens inline actions — Open, Lineage, Data Quality
│   │   ├── catalogTreeProvider.ts  # Data Catalog sidebar tree (Service → DB → Schema → Table)
│   │   └── tableDetailsProvider.ts # Table Details webview panel (shown on sidebar table click)
│   └── commands/
│       ├── authenticate.ts       # Setup command — prompts for URL + token, validates, persists to SecretStorage
│       └── searchTable.ts        # Search Catalog command — QuickPick over top 5 API results
└── test/
    ├── run-tests.ts              # Unit tests (parser, dbt patterns, cache, tooltip formatting) — no VS Code or API needed
    ├── api-live.mjs              # Live integration tests against the sandbox API
    └── manual.sql                # Open in Extension Development Host to manually test hover, CodeLens, dbt ref/source
```

---

## How Commands Wire Together

All six commands are registered in `extension.ts`. The table below shows where the handler logic lives and what calls each command:

| Command | Handler logic in | Called by |
|---------|-----------------|-----------|
| `openmetadata.setup` | `authenticate.ts` | Status bar click, Command Palette |
| `openmetadata.searchTable` | `searchTable.ts` | Sidebar search icon, Command Palette |
| `openmetadata.openTable` | `extension.ts` | CodeLens `Table '{name}'`, sidebar table click |
| `openmetadata.viewLineage` | `extension.ts` | CodeLens `Lineage '{name}'` |
| `openmetadata.viewDataQuality` | `extension.ts` | CodeLens `Data Quality '{name}'` |
| `openmetadata.refreshCatalog` | `extension.ts` | Sidebar "Refresh" button |

---

## Caching

The extension has two separate caches:

- **`metadataCache.ts`** — API response cache with per-type TTLs (table: 5 min, DQ: 2 min, lineage: 10 min, FQN: 10 min). Table metadata and FQN lookups are persisted to `globalState` across VS Code restarts. DQ, lineage, and list results are in-memory only.
- **`documentCache.ts`** — scan result cache keyed by `uri + document.version`. Invalidated automatically on every keystroke. Completely separate from API cache — `clearCache()` does not touch it.

Ambiguous FQN resolutions (names matching more than one table in the catalog) are never cached and re-resolve on every hover.

---

## npm Scripts

| Script | What it does |
|--------|-------------|
| `npm run compile` | Type-check and build to `dist/` |
| `npm run check-types` | TypeScript type check only, no output |
| `npm run watch` | Rebuild automatically on file changes |
| `npm run test:unit` | Run unit tests (no VS Code or API needed) |
| `npm run lint` | Run ESLint |
| `npm run build:prod` | Production build (minified, runs before .vsix packaging) |

---

## Testing

> **Note:** The current test setup in `test/` is temporary — unit tests, live API tests, and the manual SQL file are a lightweight scaffold put together during initial development. A proper test framework with broader coverage is planned.

**Unit tests** — run locally, no API token needed:
```bash
npm run test:unit
```

**Live integration tests** — requires a token from [sandbox.open-metadata.org](https://sandbox.open-metadata.org):
```bash
node test/api-live.mjs YOUR_TOKEN_HERE
```

**Manual testing** — press F5 to open the Extension Development Host with `test/manual.sql` pre-loaded. Hover over table names, `ref()` calls, or `source()` calls and check for CodeLens links above FROM/JOIN/dbt lines.

**Before committing:** run `npm run check-types && npm run test:unit && npm run lint`.

---

## Building and Installing a .vsix

To install the extension in your regular VS Code (not the dev host), package it as a `.vsix` first:

```bash
npx @vscode/vsce package
```

Use the scoped `@vscode/vsce` — the unscoped `vsce` package is deprecated.

This produces `openmetadata-0.1.0.vsix`. To install it:

1. Open VS Code
2. `Ctrl+Shift+P` → **Extensions: Install from VSIX...**
3. Select the `.vsix` file
4. Reload when prompted

To update, repackage and reinstall — VS Code replaces the old version automatically.
