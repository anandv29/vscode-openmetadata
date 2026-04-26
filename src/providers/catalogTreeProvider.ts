import * as vscode from "vscode";
import {
  listServices,
  listDatabases,
  listSchemas,
  listTables,
  clearCache,
} from "../services/metadataService.js";
import { errorMessage } from "../utils/helpers.js";

// -----------------------------------------------------------
// Node types for the tree
// -----------------------------------------------------------

type NodeType = "service" | "database" | "schema" | "table" | "info" | "error";

export class CatalogItem extends vscode.TreeItem {
  constructor(
    override readonly label: string,
    public readonly type: NodeType,
    public readonly fqn: string,
    collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(label, collapsibleState);

    switch (type) {
      case "service":
        this.iconPath = new vscode.ThemeIcon("cloud");
        this.tooltip = `Service: ${fqn}`;
        break;
      case "database":
        this.iconPath = new vscode.ThemeIcon("server");
        this.tooltip = `Database: ${fqn}`;
        break;
      case "schema":
        this.iconPath = new vscode.ThemeIcon("folder");
        this.tooltip = `Schema: ${fqn}`;
        break;
      case "table":
        this.iconPath = new vscode.ThemeIcon("table");
        this.tooltip = `Table: ${fqn}`;
        break;
      case "info":
        this.iconPath = new vscode.ThemeIcon("info");
        break;
      case "error":
        this.iconPath = new vscode.ThemeIcon("error");
        this.tooltip = fqn; // for error nodes, the fqn field carries the error message
        break;
    }
  }
}

// -----------------------------------------------------------
// Tree data provider
// -----------------------------------------------------------

export class CatalogTreeProvider
  implements vscode.TreeDataProvider<CatalogItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    CatalogItem | undefined | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  /** Call this to force the tree to reload from the API. */
  refresh(): void {
    clearCache(); // wipes all cache — next hover + next expand both fetch fresh
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: CatalogItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: CatalogItem): Promise<CatalogItem[]> {
    if (!element)                    { return this._getServices(); }
    if (element.type === "service")  { return this._getDatabases(element.fqn); }
    if (element.type === "database") { return this._getSchemas(element.fqn); }
    if (element.type === "schema")   { return this._getTables(element.fqn); }
    return [];
  }

  // ---- Private helpers ----------------------------------------

  private _statusItem(label: string, type: "info" | "error", detail = ""): CatalogItem {
    return new CatalogItem(label, type, detail, vscode.TreeItemCollapsibleState.None);
  }

  private async _getServices(): Promise<CatalogItem[]> {
    try {
      const services = await listServices();
      if (services.length === 0) {
        return [this._statusItem("No services found", "info", "Run Setup to connect")];
      }
      return services.map(
        (s) => new CatalogItem(s.name, "service", s.fullyQualifiedName, vscode.TreeItemCollapsibleState.Collapsed)
      );
    } catch (err) {
      const msg = errorMessage(err);
      return [this._statusItem(`Error: ${msg}`, "error", msg)];
    }
  }

  private async _getDatabases(serviceFqn: string): Promise<CatalogItem[]> {
    try {
      const dbs = await listDatabases(serviceFqn);
      if (dbs.length === 0) {
        return [this._statusItem("No databases", "info")];
      }
      return dbs.map(
        (db) => new CatalogItem(db.name, "database", db.fullyQualifiedName, vscode.TreeItemCollapsibleState.Collapsed)
      );
    } catch (err) {
      const msg = errorMessage(err);
      return [this._statusItem(`Error: ${msg}`, "error", msg)];
    }
  }

  private async _getSchemas(dbFqn: string): Promise<CatalogItem[]> {
    try {
      const schemas = await listSchemas(dbFqn);
      if (schemas.length === 0) {
        return [this._statusItem("No schemas", "info")];
      }
      return schemas.map(
        (s) => new CatalogItem(s.name, "schema", s.fullyQualifiedName, vscode.TreeItemCollapsibleState.Collapsed)
      );
    } catch (err) {
      const msg = errorMessage(err);
      return [this._statusItem(`Error: ${msg}`, "error", msg)];
    }
  }

  private async _getTables(schemaFqn: string): Promise<CatalogItem[]> {
    try {
      const tables = await listTables(schemaFqn);
      if (tables.length === 0) {
        return [this._statusItem("No tables", "info")];
      }
      return tables.map(
        (t) => new CatalogItem(t.name, "table", t.fullyQualifiedName, vscode.TreeItemCollapsibleState.None)
      );
    } catch (err) {
      const msg = errorMessage(err);
      return [this._statusItem(`Error: ${msg}`, "error", msg)];
    }
  }
}
