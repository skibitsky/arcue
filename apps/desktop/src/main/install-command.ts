import { execFile } from "node:child_process";
import { access, constants } from "node:fs/promises";
import { dirname } from "node:path";
import { promisify } from "node:util";
import { dialog } from "electron";
import {
  administratorScript,
  appBundle,
  COMMAND_LINK,
  commandInApp,
  linkCommand,
  linkState,
  moveFirst,
} from "./command-line";

const run = promisify(execFile);

/** AppleScript's error number when the user cancels the password prompt. */
const USER_CANCELED = "(-128)";

/** Links /usr/local/bin/arcue to the macOS app's command, asking for an administrator's password when macOS needs one. */
export async function installCommand(): Promise<void> {
  const command = commandInApp(process.execPath);
  const bundle = appBundle(process.execPath);
  const readOnly = await access(bundle, constants.W_OK).then(
    () => false,
    () => true,
  );
  const reason = moveFirst(bundle, readOnly);
  if (reason) {
    await dialog.showMessageBox({ type: "warning", message: "Move Arcue to Applications first", detail: reason });
    return;
  }
  const state = await linkState(COMMAND_LINK, command);
  if (state === "other") {
    const { response } = await dialog.showMessageBox({
      type: "question",
      message: `Replace ${COMMAND_LINK}?`,
      detail: `Another program is installed as ${COMMAND_LINK}. Arcue's command takes its place.`,
      buttons: ["Replace", "Cancel"],
      defaultId: 0,
      cancelId: 1,
    });
    if (response !== 0) return;
  }
  if (state !== "ours") {
    try {
      await linkCommand(COMMAND_LINK, command).catch(async (error: NodeJS.ErrnoException) => {
        if (error.code !== "EACCES" && error.code !== "EPERM") throw error;
        await run("/usr/bin/osascript", ["-e", administratorScript(COMMAND_LINK, command)]);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes(USER_CANCELED)) return;
      await dialog.showMessageBox({ type: "error", message: "The arcue command was not installed", detail: message });
      return;
    }
  }
  await dialog.showMessageBox({
    message: "The arcue command is installed",
    detail: `New terminals and agents find it in ${dirname(COMMAND_LINK)}. To remove it, delete ${COMMAND_LINK}.`,
  });
}
