import type { CoreConnection } from "@arcue/platform-node";
import { connectToCore, readBridgeInfo, readLastCore, waitForStarts } from "@arcue/platform-node";
import type { BridgeInfo, CoreKind } from "@arcue/protocol";
import { ArcueError, coreKindOf, sharesReviews } from "@arcue/protocol";
import type { ConnectOrLaunchOptions } from "./app-connection";
import { connectOrLaunch, launchApp, launchFailed, NOT_STARTED, waitForApp } from "./app-connection";

/** The core an open goes to. */
export interface Routed {
  connection: CoreConnection;
  /** "serve" for Arcue in the browser, also an older `arcue serve` that wrote `bridge.json`. */
  kind: CoreKind;
  /** It takes no review locks, so it comes from a build from before cores ran side by side. */
  older: boolean;
}

/** What `arcue open` says when nothing runs and Arcue ran in a browser last. */
export const BROWSER_STOPPED =
  "Arcue in the browser has stopped. Run arcue serve --detach, then arcue open again; an open page reconnects by itself.";

/**
 * Picks the core an open goes to, launching the desktop app when the rules say so. An open for an agent session's view
 * goes to Arcue in the browser, else to the desktop app; any other open goes to the desktop app, which starts if
 * needed, and to Arcue in the browser only where the app cannot start. While nothing answers, it waits for a core that
 * is starting. When nothing answers and Arcue ran in a browser last, an open for a view never starts the app and
 * throws `BROWSER_STOPPED`; an open outside views starts the app whenever launch.json names one that spawns, and throws
 * `BROWSER_STOPPED` only when it does not, and goes to Arcue in the browser when the app it started does not answer in
 * time. It also throws when the app does not start or has never started on this computer, and when a core listens but
 * does not answer.
 */
export async function connectForOpen(
  userData: string,
  view: string | null,
  options: ConnectOrLaunchOptions = {},
): Promise<Routed> {
  return view === null ? routeOutsideViews(userData, options) : routeForView(userData, options);
}

async function routeForView(userData: string, options: ConnectOrLaunchOptions): Promise<Routed> {
  const running =
    (await answering(userData, ["serve", "desktop"])) ?? (await afterStarts(userData, ["serve", "desktop"]));
  if (running) return running;
  if ((await readLastCore(userData))?.kind === "serve") throw new Error(BROWSER_STOPPED);
  return routed(await connectOrLaunch(userData, options), "desktop");
}

async function routeOutsideViews(userData: string, options: ConnectOrLaunchOptions): Promise<Routed> {
  const desktop = await answering(userData, ["desktop"]);
  if (desktop) return desktop;
  const launch = await launchApp(userData, options.app);
  if (launch?.launched) {
    try {
      return routed(await waitForApp(userData, options, null, launch), "desktop");
    } catch (error) {
      const served = await answering(userData, ["serve"]).catch(() => null);
      if (served) return served;
      throw error;
    }
  }
  const running = (await answering(userData, ["serve"])) ?? (await afterStarts(userData, ["desktop", "serve"]));
  if (running) return running;
  if ((await readLastCore(userData))?.kind === "serve") throw new Error(BROWSER_STOPPED);
  throw new Error(launch === null ? NOT_STARTED : launchFailed(launch));
}

/** The first core of the kinds, in order, that answers. Rejects, naming it, when one listens but does not answer. */
async function answering(userData: string, kinds: readonly CoreKind[]): Promise<Routed | null> {
  for (const kind of kinds) {
    const connection = await connectToCore(userData, kind).catch(async (error: unknown) => {
      const message = `${doesNotAnswer(await readBridgeInfo(userData, kind), kind)}: ${messageOf(error)}`;
      throw new ArcueError(error instanceof ArcueError ? error.code : "unavailable", message, { cause: error });
    });
    if (connection) return routed(connection, kind);
  }
  return null;
}

/** Waits for a core that is starting, then looks again. */
async function afterStarts(userData: string, kinds: readonly CoreKind[]): Promise<Routed | null> {
  await waitForStarts(userData);
  return answering(userData, kinds);
}

function routed(connection: CoreConnection, file: CoreKind): Routed {
  const { info } = connection;
  return { connection, kind: file === "serve" ? "serve" : coreKindOf(info), older: !sharesReviews(info) };
}

/** Whether the core a bridge file names is Arcue in the browser: in `serve.json`, or an older `arcue serve`. */
export function inBrowser(info: BridgeInfo, file: CoreKind): info is BridgeInfo & { url: string } {
  return (file === "serve" || coreKindOf(info) === "serve") && info.url !== undefined;
}

/** Names the core a bridge file names, for a core that listens but does not answer. */
export function doesNotAnswer(info: BridgeInfo | null, file: CoreKind): string {
  if (!info) return file === "serve" ? "Arcue in the browser does not answer" : "The Arcue app does not answer";
  if (inBrowser(info, file)) return `Arcue in the browser at ${info.url} (process ${info.pid}) does not answer`;
  return `The Arcue app (process ${info.pid}) does not answer`;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
