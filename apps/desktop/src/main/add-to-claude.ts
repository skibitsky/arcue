import { access, constants } from "node:fs/promises";
import { homedir } from "node:os";
import { dialog } from "electron";
import type { AddOutcome } from "./claude-config";
import { addToConfig, appCommand, arcueServer, ClaudeConfigError, claudeConfigFolders } from "./claude-config";
import { appBundle, moveFirst } from "./command-line";

let adding: Promise<void> | null = null;

/** Adds the app's `arcue mcp` to the Claude desktop app's MCP servers, which its chat and Cowork both start. */
export function addToClaude(): Promise<void> {
  adding ??= add().finally(() => {
    adding = null;
  });
  return adding;
}

async function add(): Promise<void> {
  if (process.platform === "darwin") {
    const bundle = appBundle(process.execPath);
    const readOnly = await access(bundle, constants.W_OK).then(
      () => false,
      () => true,
    );
    const reason = moveFirst(bundle, readOnly, "add it to Claude");
    if (reason) {
      await dialog.showMessageBox({ type: "warning", message: "Move Arcue to Applications first", detail: reason });
      return;
    }
  }
  const folders = await claudeConfigFolders({ platform: process.platform, home: homedir(), env: process.env });
  if (folders.length === 0) {
    await dialog.showMessageBox({
      type: "warning",
      message: "Open Claude first",
      detail: "Arcue adds itself to the Claude desktop app's settings, which Claude creates when it first opens.",
    });
    return;
  }
  const server = arcueServer(appCommand(process.execPath, process.platform));
  const outcomes: AddOutcome[] = [];
  const failures: string[] = [];
  for (const folder of folders) {
    try {
      outcomes.push(await addToConfig(folder, server));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(
        error instanceof ClaudeConfigError ? `${message} Fix it in a text editor, then try again.` : message,
      );
    }
  }
  if (outcomes.length === 0) {
    await dialog.showMessageBox({
      type: "error",
      message: "Arcue was not added to Claude",
      detail: failures.join("\n\n"),
    });
    return;
  }
  const ask = "ask Claude, in a chat or in Cowork, to show you a model or read its comments.";
  const detail = outcomes.includes("added") ? `Quit Claude and open it again. Then ${ask}` : `To use it, ${ask}`;
  await dialog.showMessageBox({
    type: failures.length > 0 ? "warning" : "info",
    message: outcomes.includes("added") ? "Arcue is added to Claude" : "Arcue is already in Claude",
    detail: [detail, ...failures].join("\n\n"),
  });
}
