import type { BlockingCore } from "@arcue/platform-node";
import type { BridgeInfo } from "@arcue/protocol";

/** The core that keeps this app from starting: another Arcue app, or a core that takes no review locks. */
export interface RunningCore {
  info: Pick<BridgeInfo, "pid" | "url">;
  reason: BlockingCore["reason"];
}

export interface AlreadyRunningNotice {
  message: string;
  detail: string;
  buttons: string[];
  /** The address the first button opens in the default browser. */
  open: string | null;
}

/** What the app says before it quits because a core runs that it cannot run beside. */
export function alreadyRunningNotice({ info, reason }: RunningCore): AlreadyRunningNotice {
  const message = "Arcue is already running";
  if (reason === "same") {
    return { message, detail: "Only one Arcue app can run at a time.", buttons: ["Quit"], open: null };
  }
  const url = webAddress(info.url);
  if (!url) {
    return {
      message,
      detail: `Another version of Arcue runs (process ${info.pid}) and can't share reviews with this app. Quit it, then open Arcue again.`,
      buttons: ["Quit"],
      open: null,
    };
  }
  return {
    message,
    detail: `An older arcue serve runs at ${url} and can't share reviews with this app. Run arcue stop in a terminal, then open Arcue again.`,
    buttons: ["Open in browser", "Quit"],
    open: url,
  };
}

/** The line main.log gets when the app quits beside such a core. */
export function alreadyRunningLogLine({ info }: RunningCore): string {
  const at = info.url ? ` at ${info.url}` : "";
  return `Another Arcue runs (process ${info.pid}${at}) and can't share reviews with this one, so this one quits`;
}

/** A bridge file could name any URL, and only a web address goes to the browser. */
function webAddress(url: string | undefined): string | null {
  if (!url) return null;
  const protocol = URL.parse(url)?.protocol;
  return protocol === "http:" || protocol === "https:" ? url : null;
}
