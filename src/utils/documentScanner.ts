// Full-document scanner — single entry point for all providers.
// Replaces the old per-line tableParser.ts approach.
//
// Key architectural properties:
//   - Runs all patterns (SQL + dbt) on document.getText() in one pass
//   - Uses document.positionAt(offset) for native vscode.Range objects
//   - Caches by document.version — invalidated automatically on every keystroke
//   - \s+ in TABLE_REF_PATTERN matches newlines, so split-line JOINs work naturally

import * as vscode from "vscode";
import {
  TABLE_REF_PATTERN, DBT_REF_PATTERN, DBT_SOURCE_PATTERN,
  SQL_KEYWORDS, cleanTableName,
} from "./sqlParser.js";
import { getScan, setScan } from "../services/documentCache.js";
import type { TableRef } from "../types/editor.js";

// Re-export so callers only need one import for both the function and the type.
export type { TableRef };

/** Return cached scan results, or run a fresh scan and cache it. */
export function scanDocumentCached(document: vscode.TextDocument): TableRef[] {
  const key = document.uri.toString();
  const cached = getScan(key, document.version);
  if (cached) { return cached; }
  const refs = scanDocument(document);
  setScan(key, document.version, refs);
  return refs;
}

function scanDocument(document: vscode.TextDocument): TableRef[] {
  const refs: TableRef[] = [];

  // Strip comments — replace with equal-length spaces to preserve character offsets.
  // document.positionAt(offset) must see the same offsets as the original text.
  let text = document.getText();
  text = text.replace(/\/\*[\s\S]*?\*\//g, (m) => " ".repeat(m.length)); // /* block */
  text = text.replace(/\{#[\s\S]*?#\}/g,   (m) => " ".repeat(m.length)); // {# jinja #}
  text = text.replace(/--[^\n]*/g,          (m) => " ".repeat(m.length)); // -- line

  // ── SQL: FROM / JOIN / UPDATE / INTO ──────────────────────────────────────
  //
  // Known gap: CTE aliases are not excluded.
  //   WITH orders AS (...) SELECT * FROM orders
  //   → 'orders' is returned as a ref; OpenMetadata finds nothing → silent no-tooltip.
  // Acceptable for now; fixing requires extracting CTE names before scanning.
  TABLE_REF_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(TABLE_REF_PATTERN)) {
    const raw = match[1];
    if (!raw) { continue; }
    const name = cleanTableName(raw);
    if (SQL_KEYWORDS.has(name.toLowerCase())) { continue; }

    const nameOffset = (match.index ?? 0) + match[0].indexOf(raw);

    // Skip table-valued functions in FROM/JOIN: ( after the name = function call.
    // Not applied to INTO — INSERT INTO orders (col1, col2) has a column list, not a TVF.
    if (/^(?:from|join)\b/i.test(match[0]) &&
        text.slice(nameOffset + raw.length).trimStart().startsWith("(")) { continue; }

    refs.push({ name, range: new vscode.Range(
      document.positionAt(nameOffset),
      document.positionAt(nameOffset + raw.length),
    )});

    // FROM a, b, c — TABLE_REF_PATTERN only captures the first name after FROM.
    // Scan forward for comma-separated continuations in the same pass.
    if (/\bfrom\b/i.test(match[0])) {
      let scanPos = (match.index ?? 0) + match[0].length;
      while (true) {
        const commaMatch = text.slice(scanPos).match(/^\s*,\s*([\w.[\]"'`]+)/);
        if (!commaMatch) { break; }
        const commaRaw = commaMatch[1] ?? "";
        const commaName = cleanTableName(commaRaw);
        if (SQL_KEYWORDS.has(commaName.toLowerCase())) { break; }
        const commaOffset = scanPos + (commaMatch[0].length - commaRaw.length);
        refs.push({ name: commaName, range: new vscode.Range(
          document.positionAt(commaOffset),
          document.positionAt(commaOffset + commaRaw.length),
        )});
        scanPos += commaMatch[0].length;
      }
    }
  }

  // ── dbt ref() / source() ─────────────────────────────────────────────────
  //
  // Intentionally matches ref() inside {% if %} blocks and macros — not a bug.
  // Same behaviour as dbt Power User, Fivetran LSP, and dbt Core.
  // Both patterns share the same group layout (group 4 = lookup name),
  // so a single helper covers both. Add more dbt patterns here as needed.
  pushDbtRefs(text, DBT_REF_PATTERN, refs, document);
  pushDbtRefs(text, DBT_SOURCE_PATTERN, refs, document);

  return refs;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Push all matches of a dbt-style pattern into refs.
 * Assumes group 4 = the lookup name and the whole match = the hover/lens range.
 */
function pushDbtRefs(
  text: string,
  pattern: RegExp,
  refs: TableRef[],
  document: vscode.TextDocument,
): void {
  pattern.lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    const name = match[4];
    if (!name) { continue; }
    const start = match.index ?? 0;
    refs.push({ name, range: new vscode.Range(
      document.positionAt(start),
      document.positionAt(start + (match[0]?.length ?? 0)),
    )});
  }
}
