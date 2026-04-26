// HTML builder for the Table Details webview panel.
// Mirrors the content of buildMarkdown() in tooltipBuilder.ts but returns a plain
// HTML string instead of a vscode.MarkdownString. No vscode import.
// Sections: description, cache freshness, owners, tags, lineage, DQ results, columns table.

import { stripHtml, formatAge, extractColumnFromEntityFqn } from "./helpers.js";
import { parseLineageNodes } from "./lineageParser.js";
import type { OmTable, OmDQResult, OmLineageResponse, OmLineageNode } from "../types/openmetadata.js";

// ── Private helpers ────────────────────────────────────────────────────────────

/** Escape user-controlled strings before inserting into HTML. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Build the inner HTML content for the Table Details panel.
 * Same sections and data as buildMarkdown() — description, cache freshness,
 * owners, tags, lineage, DQ results, columns table.
 */
export function buildHtmlPanel(
  table: OmTable,
  dqResults: OmDQResult[],
  lineage: OmLineageResponse,
  baseUrl: string,
  cachedAt?: number,
): string {
  const tableUrl = `${baseUrl}/table/${encodeURIComponent(table.fullyQualifiedName)}`;
  const lineageUrl = `${tableUrl}/lineage`;
  const dqUrl = `${tableUrl}/profiler/data-quality`;
  let html = "";

  // ── Header ──────────────────────────────────────────────────────────────────
  html += `<h2><a href="${esc(tableUrl)}">${esc(table.fullyQualifiedName)}</a></h2>\n`;

  // ── Description ─────────────────────────────────────────────────────────────
  if (table.description) {
    const desc = stripHtml(table.description);
    const truncated = desc.length > 300 ? desc.slice(0, 300) + "…" : desc;
    html += `<p>${esc(truncated)}</p>\n`;
  }

  // ── Cache freshness ──────────────────────────────────────────────────────────
  if (cachedAt === undefined) {
    html += `<p class="meta">Just fetched</p>\n`;
  } else {
    html += `<p class="meta">Cached ${formatAge(cachedAt)}</p>\n`;
  }

  html += `<hr>\n`;

  // ── Owners ───────────────────────────────────────────────────────────────────
  if (table.owners && table.owners.length > 0) {
    const label = table.owners.length === 1 ? "Owner" : "Owners";
    const ownerHtml = table.owners.map(o => `<strong>${esc(o.name)}</strong>`).join(", ");
    html += `<p>${label}: ${ownerHtml}</p>\n`;
  }

  // ── Tags ─────────────────────────────────────────────────────────────────────
  if (table.tags && table.tags.length > 0) {
    const tagHtml = table.tags.map(t => `<span class="tag">${esc(t.tagFQN)}</span>`).join(" ");
    html += `<p>Tags: ${tagHtml}</p>\n`;
  }

  // ── Lineage section ──────────────────────────────────────────────────────────
  html += buildLineageHtml(lineage, lineageUrl);

  // ── DQ section ───────────────────────────────────────────────────────────────
  html += buildDQHtml(dqResults, table.fullyQualifiedName, dqUrl);

  // ── Columns table ─────────────────────────────────────────────────────────────
  if (table.columns && table.columns.length > 0) {
    html += `<table>\n<tr><th style="width:65%">Column</th><th style="width:35%">Type</th></tr>\n`;
    const topCols = table.columns.slice(0, 20);
    for (const col of topCols) {
      html += `<tr><td><code>${esc(col.name)}</code></td><td><em>${esc(col.dataType)}</em></td></tr>\n`;
    }
    if (table.columns.length > 20) {
      html += `<tr><td colspan="2" class="meta">+ ${table.columns.length - 20} more columns</td></tr>\n`;
    }
    html += `</table>\n`;
  }

  return html;
}

// ── Lineage section builder ───────────────────────────────────────────────────

function buildLineageHtml(lineage: OmLineageResponse, lineageUrl: string): string {
  const { upstream, downstream } = parseLineageNodes(lineage);

  if (upstream.size === 0 && downstream.size === 0) {
    return `<p><strong><a href="${esc(lineageUrl)}">Lineage</a>:</strong> <em>No lineage recorded</em></p>\n`;
  }

  const renderGroup = (groups: Map<string, OmLineageNode[]>): string =>
    [...groups.entries()]
      .map(([type, nodes]) =>
        `<p class="lineage-group"><span class="meta">${esc(type)}s:</span> ${nodes.map(n => `<code>${esc(n.name)}</code>`).join(" · ")}</p>`
      )
      .join("\n");

  const upTotal = [...upstream.values()].reduce((n, arr) => n + arr.length, 0);
  const downTotal = [...downstream.values()].reduce((n, arr) => n + arr.length, 0);
  const parts: string[] = [];
  if (upstream.size > 0) { parts.push(`${upTotal} upstream`); }
  if (downstream.size > 0) { parts.push(`${downTotal} downstream`); }
  let out = `<p><strong><a href="${esc(lineageUrl)}">Lineage</a>:</strong> ${parts.join(", ")}</p>\n`;
  if (upstream.size > 0) {
    out += `<p>Sources:</p>\n${renderGroup(upstream)}\n`;
  }
  if (downstream.size > 0) {
    out += `<p>Consumers:</p>\n${renderGroup(downstream)}\n`;
  }
  return out;
}

// ── DQ section builder ────────────────────────────────────────────────────────

/**
 * Mirrors the logic of buildDQSection() in tooltipBuilder.ts but outputs HTML.
 * Queued tests and tests with no result are excluded from the evaluated total.
 */
function buildDQHtml(dqResults: OmDQResult[], tableFqn: string, dqUrl: string): string {
  if (dqResults.length === 0) {
    return `<p><strong><a href="${esc(dqUrl)}">Data Quality</a>:</strong> <em>No tests set up</em></p>\n`;
  }

  let success = 0;
  const nonPassing: OmDQResult[] = [];

  for (const dq of dqResults) {
    const status = dq.testCaseResult?.testCaseStatus;
    if (status === "Success")                        { success++; }
    else if (status === "Failed" || status === "Aborted") { nonPassing.push(dq); }
  }

  const total = success + nonPassing.length;

  if (total === 0) {
    const n = dqResults.length;
    return `<p><strong><a href="${esc(dqUrl)}">Data Quality</a>:</strong> <em>${n} test${n === 1 ? "" : "s"} set up — none run yet</em></p>\n`;
  }

  const unrun = dqResults.length - total;
  const unrunStr = unrun > 0 ? ` · ${unrun} not run yet` : "";
  let out = `<p><strong><a href="${esc(dqUrl)}">Data Quality</a>:</strong> ${success}/${total} tests passing${unrunStr}</p>\n`;

  const toShow = nonPassing.slice(0, 5);
  for (const dq of toShow) {
    const res = dq.testCaseResult;
    const icon = res?.testCaseStatus === "Aborted" ? "!" : "×";
    const label = esc(dq.displayName ?? dq.name);
    const ageStr = res?.timestamp ? ` <em>(${formatAge(res.timestamp)})</em>` : "";
    const msg = res?.result ? ` — ${esc(res.result)}` : "";
    out += `<p class="dq-item">${icon} <strong>${label}</strong>${ageStr}${msg}</p>\n`;

    const colName = extractColumnFromEntityFqn(dq.entityFQN, tableFqn);
    if (colName) {
      out += `<p class="dq-sub">Column: <code>${esc(colName)}</code></p>\n`;
    }

    const vals = res?.testResultValue ?? [];
    if (vals.length > 0) {
      const parts = vals.map(v => `<code>${esc(v.name)}: ${esc(v.value ?? "—")}</code>`).join(" · ");
      out += `<p class="dq-sub">${parts}</p>\n`;
    }

    if (res?.passedRows !== undefined && res.failedRows !== undefined) {
      out += `<p class="dq-sub">Rows: ${res.passedRows} passed, ${res.failedRows} failed</p>\n`;
    }
  }

  if (nonPassing.length > 5) {
    out += `<p class="meta"><em>+ ${nonPassing.length - 5} more tests not passing</em></p>\n`;
  }

  return out;
}
