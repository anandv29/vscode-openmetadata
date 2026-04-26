// Regex patterns and keyword blocklist used by documentScanner.ts.
// Per-line helpers (extractTableRefs, wordAtOffset, etc.) were removed —
// the scanner works on full document text, making line-by-line parsing obsolete.

// ── SQL keyword blocklist ────────────────────────────────────
export const SQL_KEYWORDS = new Set([
  "select","from","where","join","inner","outer","left","right","full",
  "cross","on","and","or","not","in","is","null","as","by","group","order",
  "having","limit","offset","union","all","distinct","insert","into","values",
  "update","set","delete","create","drop","alter","table","view","index","with",
  "case","when","then","else","end","between","like","exists","any","some",
  "asc","desc","true","false","if","using","lateral","natural","except",
  "intersect","recursive","returning","conflict","do","nothing","only",
  "tablesample","bernoulli","system","rows","fetch","next","first","ties",
  "percent","over","partition","window","filter","within","preceding",
  "following","unbounded","current","row","range","groups",
]);

// ── SQL table reference pattern ──────────────────────────────
//
// Matches: FROM [ONLY] <name> [AS alias]
//          JOIN  <name> [AS alias]
//          UPDATE <name> [AS alias]
//          INTO  <name>
//
// Group 1 = table name token (schema-qualified OK; backticks/brackets/quotes OK)
// Group 2 = alias — captured so the regex consumes it, but always ignored by callers.
//
// \s+ matches any whitespace including newlines, so "INNER JOIN\n  orders" is handled
// in a single pass without any line-splitting or context-window hacks.

export const TABLE_REF_PATTERN =
  /\b(?:from|join|update|into)\s+(?:only\s+)?([\[\]"'`a-zA-Z_][\[\]"'`a-zA-Z0-9_]*(?:\.[\[\]"'`a-zA-Z_][\[\]"'`a-zA-Z0-9_]*)*)(?:\s+(?:as\s+)?([a-zA-Z_][a-zA-Z0-9_]*))?/gi;

// ── dbt ref() / source() patterns ───────────────────────────
//
// Both patterns are designed so that group 4 is ALWAYS the lookup name,
// regardless of which optional arguments are present.
//
// DBT_REF_PATTERN handles all three ref() call forms:
//   ref('model')                  → groups 1,2 unused; group 3=quote, 4=model
//   ref('package', 'model')       → groups 1=quote, 2=package; group 3=quote, 4=model
//   ref('model', version=2)       → groups 1,2 unused; group 3=quote, 4=model; version consumed
// The optional version suffix (v= or version=) is consumed but not captured.

export const DBT_REF_PATTERN =
  /\bref\s*\(\s*(?:(['"])([^'"]+)\1\s*,\s*)?(['"])([^'"]+)\3(?:\s*,\s*v(?:ersion)?\s*=\s*\d+)?\s*\)/gi;

// DBT_SOURCE_PATTERN:
//   source('source_name', 'table_name') → group 1=quote, 2=source_name, group 3=quote, 4=table_name
// Group 4 = table name (what gets looked up in OpenMetadata).

export const DBT_SOURCE_PATTERN =
  /\bsource\s*\(\s*(['"])([^'"]+)\1\s*,\s*(['"])([^'"]+)\3\s*\)/gi;

// ── Helpers ──────────────────────────────────────────────────

/** Strip brackets, quotes, and backticks from a raw table name token. */
export function cleanTableName(name: string): string {
  return name.replace(/[\[\]"'`]/g, "");
}
