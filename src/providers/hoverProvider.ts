import * as vscode from "vscode";
import { scanDocumentCached } from "../utils/documentScanner.js";
import { resolveToFqn, getTable, getDQResults, getLineage, getBaseUrl, getTableCachedAt } from "../services/metadataService.js";
import { errorMessage } from "../utils/helpers.js";
import { buildMarkdown } from "../utils/tooltipBuilder.js";
import type { OmTable, OmDQResult, OmLineageResponse } from "../types/openmetadata.js";

export class HoverProvider implements vscode.HoverProvider {
  private hasShownAuthError = false;

  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.Hover | null> {
    const refs = scanDocumentCached(document);
    const ref = refs.find(r => r.range.contains(position));
    if (!ref) {
      return null;
    }

    try {
      // Resolve table name → FQN via cached service (singleflight + 10 min TTL).
      // Ambiguous names (multiple tables share the same bare name) are not cached —
      // they re-resolve on every hover so the warning is always shown.
      const { fqn, ambiguous } = await resolveToFqn(ref.name);

      if (!fqn) {
        vscode.window.setStatusBarMessage(
          `$(warning) OpenMetadata: "${ref.name}" not found`,
          4_000
        );
        return null;
      }

      // Check cache age BEFORE fetching — undefined means not yet cached (fresh fetch).
      // Reading after would always return a value since getTable() caches immediately,
      // making the "Just fetched" branch in buildMarkdown unreachable.
      const cachedAt = getTableCachedAt(fqn);

      // Fetch full table metadata, DQ tests, and lineage in parallel.
      // metadataService caches each independently (table: 5 min, dq: 2 min, lineage: 10 min).
      const [table, dqResults, lineage] = await Promise.all([
        getTable(fqn),
        getDQResults(fqn),
        getLineage(fqn),
      ]);

      this.hasShownAuthError = false;

      return this.createHover(table, dqResults, lineage, cachedAt, ambiguous);
    } catch (err) {
      const msg = errorMessage(err);

      // Auth token invalid — show a one-time warning.
      if (msg.includes("token invalid") || msg.includes("Not authenticated")) {
        if (!this.hasShownAuthError) {
          vscode.window.showWarningMessage(
            "OpenMetadata: Token invalid or expired. Run 'OpenMetadata: Setup'."
          );
          this.hasShownAuthError = true;
        }
        return null;
      }

      // Network failure — show an error tooltip instead of silently disappearing.
      if (msg.includes("Cannot reach")) {
        return new vscode.Hover(
          new vscode.MarkdownString(
            "**OpenMetadata:** Cannot reach server — check your network connection."
          )
        );
      }

      // Fail silently for any other errors so we don't break typing.
      return null;
    }
  }

  private createHover(table: OmTable, dqResults: OmDQResult[], lineage: OmLineageResponse, cachedAt?: number, ambiguous = false): vscode.Hover {
    const baseUrl = getBaseUrl();
    const md = buildMarkdown(table, dqResults, lineage, baseUrl, cachedAt, ambiguous);
    return new vscode.Hover(md);
  }
}

