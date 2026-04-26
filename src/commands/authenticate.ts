import * as vscode from "vscode";
import { setCredentials, search, getBaseUrl, clearCache } from "../services/metadataService.js";

const SECRET_TOKEN_KEY = "openmetadata.token";
const SECRET_URL_KEY = "openmetadata.serverUrl";

/**
 * Load stored credentials from SecretStorage and apply them to metadataService.
 * Call this in extension.ts activate() on startup.
 */
export async function loadStoredCredentials(
  context: vscode.ExtensionContext
): Promise<boolean> {
  const storedUrl = await context.secrets.get(SECRET_URL_KEY);
  const storedToken = await context.secrets.get(SECRET_TOKEN_KEY);
  if (storedUrl && storedToken) {
    setCredentials(storedUrl, storedToken);
    return true;
  }
  return false;
}

/**
 * The "OpenMetadata: Setup" command handler.
 * Prompts for server URL + token, validates, stores, updates status bar.
 */
export async function runSetupCommand(
  context: vscode.ExtensionContext,
  statusBarItem: vscode.StatusBarItem
): Promise<void> {
  // Step 1: Ask for server URL
  const serverUrl = await vscode.window.showInputBox({
    title: "OpenMetadata Setup (1/2) — Server URL",
    prompt:
      "Enter your OpenMetadata server URL (e.g. https://sandbox.open-metadata.org)",
    value: getBaseUrl(),
    ignoreFocusOut: true,
    validateInput: (val) => {
      if (!val.startsWith("http")) {
        return "URL must start with http:// or https://";
      }
      return null;
    },
  });

  if (!serverUrl) {
    return; // User cancelled
  }

  // Step 2: Ask for API token (masked)
  const token = await vscode.window.showInputBox({
    title: "OpenMetadata Setup (2/2) — Personal Access Token",
    prompt:
      "Paste your OpenMetadata Personal Access Token (Profile → View Profile → Access Tokens)",
    password: true,
    ignoreFocusOut: true,
    validateInput: (val) => {
      if (!val || val.trim().length === 0) {
        return "Token cannot be empty";
      }
      return null;
    },
  });

  if (!token) {
    return; // User cancelled
  }

  const trimmedToken = token.trim();

  // Step 3: Apply credentials immediately and validate with a test API call
  setCredentials(serverUrl, trimmedToken);

  statusBarItem.text = "$(loading~spin) OpenMetadata: Connecting...";
  statusBarItem.show();

  try {
    await search("*"); // lightweight validation call
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error connecting";
    vscode.window.showErrorMessage(`OpenMetadata: ${message}`);
    statusBarItem.text = "$(error) OpenMetadata: Not connected";
    return;
  }

  // Credentials confirmed good — now clear stale cache from the previous session.
  // Placed after validation so a failed attempt doesn't wipe a working session's cache.
  clearCache();

  // Step 4: Persist to SecretStorage
  await context.secrets.store(SECRET_URL_KEY, serverUrl);
  await context.secrets.store(SECRET_TOKEN_KEY, trimmedToken);

  // Step 5: Update status bar
  statusBarItem.text = "$(zap) OpenMetadata: Connected";
  statusBarItem.tooltip = `Connected to ${serverUrl}`;
  statusBarItem.command = "openmetadata.setup";

  vscode.window.showInformationMessage(
    `OpenMetadata connected to ${serverUrl}`
  );
}
