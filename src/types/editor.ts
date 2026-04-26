import type * as vscode from "vscode";

/** A detected table/model reference in a document, with its position. */
export interface TableRef {
  name: string;        // clean name for API lookup
  range: vscode.Range; // full ref(...) call for dbt; name token only for SQL
}
