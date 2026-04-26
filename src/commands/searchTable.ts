import * as vscode from "vscode";
import { search, getBaseUrl } from "../services/metadataService.js";
import { stripHtml } from "../utils/helpers.js";

/**
 * Prompt user for a search query, show top 5 results in QuickPick,
 * open selected table in the OpenMetadata browser UI.
 */
export async function runSearchTableCommand(): Promise<void> {
  const query = await vscode.window.showInputBox({
    title: "OpenMetadata: Search Table",
    prompt: 'Type a table name to search (e.g. "dim_customer", "orders")',
    ignoreFocusOut: true,
  });

  if (!query || query.trim().length === 0) {
    return;
  }

  const statusMessage = vscode.window.setStatusBarMessage(
    "$(loading~spin) Searching OpenMetadata...",
    5000
  );

  let results: Awaited<ReturnType<typeof search>>;
  try {
    results = await search(query.trim(), 5);
  } catch (err) {
    statusMessage.dispose();
    const message =
      err instanceof Error ? err.message : "Search failed — unknown error";
    vscode.window.showErrorMessage(`OpenMetadata Search: ${message}`);
    return;
  }

  statusMessage.dispose();

  if (results.length === 0) {
    vscode.window.showInformationMessage(
      `OpenMetadata: No tables found for "${query}"`
    );
    return;
  }

  // Build QuickPick items from search results
  const items = results.map((r) => ({
    label: r.name,
    description: r.fullyQualifiedName,
    detail: r.description ? stripHtml(r.description) : "",
    fqn: r.fullyQualifiedName,
  }));

  const picked = await vscode.window.showQuickPick(items, {
    title: `OpenMetadata: Results for "${query}"`,
    placeHolder: "Select a table to open in OpenMetadata",
    matchOnDescription: true,
  });

  if (!picked) {
    return;
  }

  const url = vscode.Uri.parse(
    `${getBaseUrl()}/table/${encodeURIComponent(picked.fqn)}`
  );
  await vscode.env.openExternal(url);
}
