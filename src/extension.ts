import * as vscode from "vscode";
import { loadStoredCredentials, runSetupCommand } from "./commands/authenticate.js";
import { runSearchTableCommand } from "./commands/searchTable.js";
import { CatalogTreeProvider } from "./providers/catalogTreeProvider.js";
import { HoverProvider } from "./providers/hoverProvider.js";
import { CodeLensProvider } from "./providers/codeLensProvider.js";
import { resolveToFqn, getBaseUrl } from "./services/metadataService.js";
import { cache } from "./services/metadataCache.js";
import { errorMessage } from "./utils/helpers.js";
import { TableDetailsProvider } from "./providers/tableDetailsProvider.js";

async function openInBrowser(nameOrFqn: string, suffix = ""): Promise<void> {
  const status = vscode.window.setStatusBarMessage(
    "$(loading~spin) OpenMetadata: Resolving...",
    10_000
  );
  try {
    const { fqn } = await resolveToFqn(nameOrFqn);
    if (!fqn) {
      void vscode.window.showWarningMessage(
        `OpenMetadata: Table "${nameOrFqn}" not found in OpenMetadata`
      );
      return;
    }
    await vscode.env.openExternal(
      vscode.Uri.parse(`${getBaseUrl()}/table/${encodeURIComponent(fqn)}${suffix}`)
    );
  } finally {
    status.dispose();
  }
}

export async function activate(context: vscode.ExtensionContext) {
  // Direct cache import — intentional exception to the thin-shell rule.
  // initPersistence() needs ExtensionContext which metadataService.ts doesn't have,
  // and extension.ts is the right place for VS Code lifecycle calls anyway.
  cache.initPersistence(context);
  console.log("OpenMetadata extension activating...");

  // ---- Status bar --------------------------------------------
  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  statusBar.text = "$(error) OpenMetadata: Not connected";
  statusBar.tooltip = 'Click to run "OpenMetadata: Setup"';
  statusBar.command = "openmetadata.setup";
  context.subscriptions.push(statusBar);

  // ---- Load stored credentials on startup -------------------
  // show() is called after loading so the status bar reflects the correct state on reopen.
  const hasCredentials = await loadStoredCredentials(context);
  if (hasCredentials) {
    statusBar.text = "$(zap) OpenMetadata: Connected";
  }
  statusBar.show();

  // ---- Catalog provider (declared before commands so refresh() can be called) ----
  const catalogProvider = new CatalogTreeProvider();

  // ---- Register commands ------------------------------------

  // Auth / setup command
  context.subscriptions.push(
    vscode.commands.registerCommand("openmetadata.setup", async () => {
      await runSetupCommand(context, statusBar);
      catalogProvider.refresh(); // reload sidebar after reconnect
    })
  );

  // Search table command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "openmetadata.searchTable",
      runSearchTableCommand
    )
  );

  // Open table in browser (used by CodeLens + sidebar click)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "openmetadata.openTable",
      async (nameOrFqn: string) => {
        try {
          await openInBrowser(nameOrFqn);
        } catch (err) {
          vscode.window.showErrorMessage(`OpenMetadata: ${errorMessage(err)}`);
        }
      }
    )
  );

  // View lineage in browser (used by CodeLens)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "openmetadata.viewLineage",
      async (nameOrFqn: string) => {
        try {
          await openInBrowser(nameOrFqn, "/lineage");
        } catch (err) {
          vscode.window.showErrorMessage(`OpenMetadata: ${errorMessage(err)}`);
        }
      }
    )
  );

  // View data quality in browser (used by CodeLens)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "openmetadata.viewDataQuality",
      async (nameOrFqn: string) => {
        try {
          await openInBrowser(nameOrFqn, "/profiler/data-quality");
        } catch (err) {
          vscode.window.showErrorMessage(`OpenMetadata: ${errorMessage(err)}`);
        }
      }
    )
  );

  // Refresh sidebar catalog
  context.subscriptions.push(
    vscode.commands.registerCommand("openmetadata.refreshCatalog", () => {
      catalogProvider.refresh();
    })
  );

  // ---- Register sidebar tree view ---------------------------
  const catalogTreeView = vscode.window.createTreeView("openmetadataCatalog", {
    treeDataProvider: catalogProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(catalogTreeView);

  // ---- Register Table Details webview panel -----------------
  const detailsProvider = new TableDetailsProvider();
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(TableDetailsProvider.viewId, detailsProvider)
  );

  // Wire tree selection → details panel
  context.subscriptions.push(
    catalogTreeView.onDidChangeSelection(e => {
      const item = e.selection[0];
      if (item?.type === "table") {
        void detailsProvider.showTable(item.fqn);
      } else {
        detailsProvider.clearTable();
      }
    })
  );

  // ---- Register hover provider (SQL + Jinja-SQL) -------------
  const hoverProvider = new HoverProvider();
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      [{ language: "sql" }, { language: "jinja-sql" }],
      hoverProvider
    )
  );

  // ---- Register CodeLens provider (SQL + Jinja-SQL) ----------
  const codeLensProvider = new CodeLensProvider();
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      [{ language: "sql" }, { language: "jinja-sql" }],
      codeLensProvider
    )
  );

  console.log("OpenMetadata extension activated successfully.");
}

export function deactivate() {
  console.log("OpenMetadata extension deactivated.");
}
