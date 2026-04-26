import * as vscode from "vscode";
import { stripHtml, formatAge, extractColumnFromEntityFqn } from "./helpers.js";
import { parseLineageNodes } from "./lineageParser.js";
import type { OmTable, OmDQResult, OmLineageResponse, OmLineageNode } from "../types/openmetadata.js";

/**
 * Builds the DQ detail block as a plain markdown string.
 * tableFqn is used to detect column-level tests and show which column is targeted.
 */
export function buildDQSection(dqResults: OmDQResult[], tableFqn: string, dqUrl: string): string {
  if (dqResults.length === 0) {
    return `**[Data Quality](${dqUrl})**: *No tests set up*\n\n`;
  }

  let success = 0;
  const nonPassing: OmDQResult[] = [];

  for (const dq of dqResults) {
    const status = dq.testCaseResult?.testCaseStatus;
    if (status === "Success") {
      success++;
    } else if (status === "Failed" || status === "Aborted") {
      nonPassing.push(dq);
    }
  }

  // Only count tests that have actually been evaluated (exclude Queued / no-result).
  const total = success + nonPassing.length;

  if (total === 0) {
    const n = dqResults.length;
    return `**[Data Quality](${dqUrl})**: *${n} test${n === 1 ? "" : "s"} set up — none run yet*\n\n`;
  }

  const unrun = dqResults.length - total;
  const unrunStr = unrun > 0 ? ` · ${unrun} not run yet` : "";
  let out = `**[Data Quality](${dqUrl})**: ${success}/${total} tests passing${unrunStr}\n\n`;

  // Detail list — failed/aborted only, capped at 5 to avoid tooltip explosion
  const toShow = nonPassing.slice(0, 5);
  for (const dq of toShow) {
    const res = dq.testCaseResult;
    const status = res?.testCaseStatus;
    const icon = status === "Aborted" ? "!" : "×";
    const label = dq.displayName ?? dq.name;
    const ageStr = res?.timestamp ? formatAge(res.timestamp) : null;
    const msg = res?.result;

    out += `${icon} **${label}**${ageStr ? ` *(${ageStr})*` : ""}${msg ? ` — ${msg}` : ""}\n\n`;

    // Column target — show which column the test is for
    const colName = extractColumnFromEntityFqn(dq.entityFQN, tableFqn);
    if (colName) {
      out += `  Column: \`${colName}\`\n\n`;
    }

    // Metric pairs — e.g. `max: 150` · `min: 0`
    const vals = res?.testResultValue ?? [];
    if (vals.length > 0) {
      const parts = vals.map(v => `\`${v.name}: ${v.value ?? "—"}\``).join(" · ");
      out += `  ${parts}\n\n`;
    }

    // Row-level counts — only shown when computePassedFailedRowCount=true on the test
    const { passedRows, failedRows } = res ?? {};
    if (passedRows !== undefined && failedRows !== undefined) {
      out += `  Rows: ${passedRows} passed, ${failedRows} failed\n\n`;
    }
  }

  if (nonPassing.length > 5) {
    out += `*+ ${nonPassing.length - 5} more tests not passing*\n\n`;
  }

  return out;
}

function buildLineageSection(lineage: OmLineageResponse, lineageUrl: string): string {
  const { upstream, downstream } = parseLineageNodes(lineage);

  if (upstream.size === 0 && downstream.size === 0) {
    return `**[Lineage](${lineageUrl})**: *No lineage recorded*\n\n`;
  }

  const renderGroup = (groups: Map<string, OmLineageNode[]>): string =>
    [...groups.entries()]
      .map(([type, nodes]) =>
        `  ${type}s: ${nodes.map(n => `\`${n.name}\``).join(" · ")}`
      )
      .join("  \n");

  const upTotal = [...upstream.values()].reduce((n, arr) => n + arr.length, 0);
  const downTotal = [...downstream.values()].reduce((n, arr) => n + arr.length, 0);
  const parts: string[] = [];
  if (upstream.size > 0) { 
    parts.push(`${upTotal} upstream`); 
  }
  if (downstream.size > 0) { 
    parts.push(`${downTotal} downstream`); 
  }
  let out = `**[Lineage](${lineageUrl})**: ${parts.join(", ")}\n\n`;
  if (upstream.size > 0) {
    out += `Sources:  \n${renderGroup(upstream)}\n\n`;
  }
  if (downstream.size > 0) {
    out += `Consumers:  \n${renderGroup(downstream)}\n\n`;
  }
  return out;
}

export function buildMarkdown(
  table: OmTable,
  dqResults: OmDQResult[],
  lineage: OmLineageResponse,
  baseUrl: string,
  cachedAt?: number,
  ambiguous = false,
): vscode.MarkdownString {
  const md = new vscode.MarkdownString("", true);
  md.isTrusted = true;
  md.supportHtml = true;

  const tableUrl = `${baseUrl}/table/${encodeURIComponent(table.fullyQualifiedName)}`;
  const lineageUrl = `${tableUrl}/lineage`;
  const dqUrl = `${tableUrl}/profiler/data-quality`;

  // Header
  md.appendMarkdown(`### [${table.fullyQualifiedName}](${tableUrl})\n\n`);

  // Description
  if (table.description) {
    const desc = stripHtml(table.description);
    md.appendMarkdown(`${desc.slice(0, 200)}${desc.length > 200 ? "..." : ""}\n\n`);
  }

  // Ambiguity warning — shown when multiple tables share the same name across services.
  if (ambiguous) {
    md.appendMarkdown(
      `**Note:** *Multiple tables share this name — use a more specific name ` +
      `(\`service.db.schema.table\`) to target the right one.*\n\n`
    );
  }

  // Cache freshness — shown here so it's immediately visible without scrolling.
  if (cachedAt === undefined) {
    md.appendMarkdown(`*Just fetched*\n\n`);
  } else {
    const ageSec = Math.floor((Date.now() - cachedAt) / 1000);
    const ageStr = ageSec < 60 ? "just now" : `${Math.floor(ageSec / 60)} min ago`;
    md.appendMarkdown(`*Table cached ${ageStr}*\n\n`);
  }

  md.appendMarkdown(`---\n\n`);

  // Owners & Tags
  if (table.owners && table.owners.length > 0) {
    const label = table.owners.length === 1 ? "Owner" : "Owners";
    const ownerNames = table.owners.map((o) => `**${o.name}**`).join(", ");
    md.appendMarkdown(`${label}: ${ownerNames}  \n`);
  }

  if (table.tags && table.tags.length > 0) {
    const tags = table.tags.map((t) => `\`${t.tagFQN}\``).join(" ");
    md.appendMarkdown(`Tags: ${tags}\n\n`);
  } else {
    md.appendMarkdown(`\n`);
  }

  // Lineage section
  md.appendMarkdown(buildLineageSection(lineage, lineageUrl));

  // DQ section
  md.appendMarkdown(buildDQSection(dqResults, table.fullyQualifiedName, dqUrl));

  // Columns (Top 20)
  if (table.columns && table.columns.length > 0) {
    md.appendMarkdown(`| Column | Type |\n`);
    md.appendMarkdown(`|---|---|\n`);
    const topColumns = table.columns.slice(0, 20);
    for (const col of topColumns) {
      md.appendMarkdown(`| \`${col.name}\` | *${col.dataType}* |\n`);
    }
    if (table.columns.length > 20) {
      md.appendMarkdown(`| _+ ${table.columns.length - 20} more_ | |\n`);
    }
  }

  return md;
}
