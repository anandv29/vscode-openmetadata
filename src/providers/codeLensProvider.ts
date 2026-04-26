import * as vscode from "vscode";
import { scanDocumentCached } from "../utils/documentScanner.js";

// TRAILING_JOIN_RE and the split-line lookahead block are gone —
// documentScanner runs TABLE_REF_PATTERN on the full document text,
// where \s+ already matches newlines, so split-line JOINs are handled naturally.

export class CodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const refs = scanDocumentCached(document);
    const lenses: vscode.CodeLens[] = [];

    for (const ref of refs) {
      // Pin the lens to the start of the line containing the reference.
      const lineRange = new vscode.Range(ref.range.start.line, 0, ref.range.start.line, 0);

      lenses.push(new vscode.CodeLens(lineRange, {
        title: `Table '${ref.name}'`,
        command: "openmetadata.openTable",
        arguments: [ref.name],
      }));

      lenses.push(new vscode.CodeLens(lineRange, {
        title: `Lineage '${ref.name}'`,
        command: "openmetadata.viewLineage",
        arguments: [ref.name],
      }));

      lenses.push(new vscode.CodeLens(lineRange, {
        title: `Data Quality '${ref.name}'`,
        command: "openmetadata.viewDataQuality",
        arguments: [ref.name],
      }));
    }

    return lenses;
  }
}
