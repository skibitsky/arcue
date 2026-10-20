export interface RunningCore {
  pid: number;
  /** Where a browser shows the running core's window, when `arcue serve` runs it. */
  url: string | null;
}

export interface AlreadyRunningNotice {
  message: string;
  detail: string;
  buttons: string[];
  /** The address the first button opens in the default browser. */
  open: string | null;
}

/** What the app says before it quits because another Arcue runs on the same reviews. */
export function alreadyRunningNotice(running: RunningCore): AlreadyRunningNotice {
  const message = "Arcue is already running";
  const url = webAddress(running.url);
  if (!url) return { message, detail: "Only one Arcue can run at a time.", buttons: ["Quit"], open: null };
  return { message, detail: `It runs at ${url}.`, buttons: ["Open in browser", "Quit"], open: url };
}

/** `bridge.json` could name any URL, and only a web address goes to the browser. */
function webAddress(url: string | null): string | null {
  const parsed = url ? URL.parse(url) : null;
  return parsed && (parsed.protocol === "http:" || parsed.protocol === "https:") ? url : null;
}
