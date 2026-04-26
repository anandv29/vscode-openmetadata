/** Human-readable age string for a Unix ms timestamp. */
export function formatAge(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60)    { return "just now"; }
  if (diff < 3600)  { return `${Math.floor(diff / 60)}m ago`; }
  if (diff < 86400) { return `${Math.floor(diff / 3600)}h ago`; }
  return `${Math.floor(diff / 86400)}d ago`;
}

/**
 * If entityFqn is exactly one segment deeper than tableFqn, returns the column name.
 * e.g. tableFqn="a.b.c.d", entityFqn="a.b.c.d.col" → "col"
 */
export function extractColumnFromEntityFqn(entityFqn: string | undefined, tableFqn: string): string | null {
  if (!entityFqn) { return null; }
  const prefix = `${tableFqn}.`;
  if (!entityFqn.startsWith(prefix)) { return null; }
  const remainder = entityFqn.slice(prefix.length);
  return remainder.includes(".") ? null : remainder;
}

/** Extract a human-readable message from an unknown error. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Strip HTML tags and decode common entities.
 * Safe for plain-text display in VS Code QuickPick, tooltips, etc.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
