import * as vscode from "vscode";
import {
  getTable,
  getDQResults,
  getLineage,
  getBaseUrl,
  getTableCachedAt,
} from "../services/metadataService.js";
import { buildHtmlPanel } from "../utils/tableDetailsHtml.js";
import { errorMessage } from "../utils/helpers.js";

// ── TableDetailsProvider ───────────────────────────────────────────────────────
//
// WebviewView panel that shows table metadata in the sidebar whenever a table
// node is clicked in the Data Catalog tree. Uses postMessage to update content
// without re-rendering the iframe — the HTML scaffold is set once in
// resolveWebviewView and never touched again.

export class TableDetailsProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = "openmetadataDetails";

  private _view?: vscode.WebviewView;
  private _currentFqn?: string;

  constructor() {} // no extensionUri needed — all CSS/JS is inline

  resolveWebviewView(
    webviewView: vscode.WebviewView,
  ): void {
    this._view = webviewView;

    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this._scaffold();

    // Re-send current data when the panel is revealed after being collapsed.
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible && this._currentFqn) {
        void this.showTable(this._currentFqn);
      }
    });
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  /** Fetch and display metadata for a table FQN. */
  async showTable(fqn: string): Promise<void> {
    this._currentFqn = fqn;
    this._post({ command: "loading" });

    // Read cachedAt BEFORE the fetch — if it's undefined, the table wasn't in cache
    // and the panel shows "Just fetched". Reading after would always show "Cached just now".
    const preFetchCachedAt = getTableCachedAt(fqn);

    let table, dqResults, lineage;
    try {
      [table, dqResults, lineage] = await Promise.all([
        getTable(fqn),
        getDQResults(fqn),
        getLineage(fqn),
      ]);
    } catch (err) {
      // Discard if the user clicked a different table while this one was loading.
      if (this._currentFqn !== fqn) { return; }
      this._post({ command: "error", message: errorMessage(err) });
      return;
    }

    // Stale-fetch guard — discard if superseded by a newer click.
    if (this._currentFqn !== fqn) { return; }

    const html = buildHtmlPanel(
      table,
      dqResults,
      lineage,
      getBaseUrl(),
      preFetchCachedAt,
    );
    this._post({ command: "update", html });
  }

  /** Clear the panel (called when a non-table node is selected). */
  clearTable(): void {
    this._currentFqn = undefined;
    this._post({ command: "clear" });
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private _post(message: Record<string, unknown>): void {
    this._view?.webview.postMessage(message);
  }

  /** One-time HTML scaffold. Content is updated exclusively via postMessage. */
  private _scaffold(): string {
    // Nonce for the inline script.
    const nonce = Array.from(
      { length: 32 },
      () => Math.random().toString(36)[2] ?? "a",
    ).join("");

    const csp = [
      `default-src 'none'`,
      `style-src 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`,
    ].join("; ");

    // NOTE: content is set exclusively via postMessage from tableDetailsProvider.ts.
    // The HTML inserted into #content is produced by buildHtmlPanel() which escapes
    // all API-returned strings with esc() before HTML insertion — XSS-safe.
    const scriptBody = [
      "const content = document.getElementById('content');",
      "window.addEventListener('message', ({ data }) => {",
      "  switch (data.command) {",
      "    case 'update': content['innerHTML'] = data.html; break;",
      "    case 'loading': content['innerHTML'] = '<p class=\"meta\">Loading\u2026</p>'; break;",
      "    case 'clear': content['innerHTML'] = '<p id=\"placeholder\">Click a table in the Data Catalog to see its details.</p>'; break;",
      "    case 'error': content['innerHTML'] = '<p class=\"error\">\u26A0\uFE0F ' + data.message + '</p>'; break;",
      "  }",
      "});",
    ].join("\n");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    *, *::before, *::after { box-sizing: border-box; }

    :root { --gap: 8px; }

    body {
      margin: 0;
      padding: var(--gap) calc(var(--gap) * 1.5);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      line-height: 1.5;
    }

    a { color: var(--vscode-textLink-foreground); text-decoration: none; }
    a:hover { text-decoration: underline; }

    h2 {
      font-size: 1em;
      font-weight: 600;
      margin: 0 0 var(--gap) 0;
      word-break: break-all;
    }

    p { margin: 0 0 var(--gap) 0; }

    hr {
      border: none;
      border-top: 1px solid var(--vscode-widget-border, transparent);
      margin: var(--gap) 0;
    }

    .meta { color: var(--vscode-descriptionForeground); font-size: 0.9em; }
    .error { color: var(--vscode-errorForeground); }

    .tag {
      display: inline-block;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      border-radius: 3px;
      padding: 1px 5px;
      font-size: 0.85em;
      margin: 1px 2px 1px 0;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.9em;
      margin-top: var(--gap);
      table-layout: fixed;
    }
    th, td {
      text-align: left;
      padding: 3px 6px;
      border-bottom: 1px solid var(--vscode-widget-border, transparent);
      overflow-wrap: break-word;
    }
    th { font-weight: 600; }

    code {
      font-family: var(--vscode-editor-font-family, monospace);
      background: var(--vscode-textCodeBlock-background);
      border-radius: 3px;
      padding: 0 3px;
    }

    .lineage-group { margin: 2px 0 0 12px; }

    .dq-item { margin: 4px 0 0 0; }
    .dq-sub {
      margin: 2px 0 0 16px;
      color: var(--vscode-descriptionForeground);
      font-size: 0.9em;
    }

    #placeholder {
      color: var(--vscode-descriptionForeground);
      font-style: italic;
      padding-top: 8px;
    }
  </style>
</head>
<body>
  <div id="content">
    <p id="placeholder">Click a table in the Data Catalog to see its details.</p>
  </div>
  <script nonce="${nonce}">${scriptBody}</script>
</body>
</html>`;
  }
}
