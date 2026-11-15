import "@arcue/ui/tokens.css";
import "@arcue/ui/base.css";
import "@arcue/ui/workspace.css";
import "./main.css";
import "./mcp/view.css";
import { IconButton, Store, useSelect, Workspace } from "@arcue/ui";
import { createViewport } from "@arcue/viewport";
import type { McpUiDisplayMode, McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import { App, applyDocumentTheme, applyHostFonts, applyHostStyleVariables } from "@modelcontextprotocol/ext-apps";
import type { ReactNode } from "react";
import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import type { LocalHost } from "./local-host";
import { McpView } from "./mcp/view-host";

interface Display {
  mode: McpUiDisplayMode;
  canFullscreen: boolean;
}

const display = new Store<Display>({ mode: "inline", canFullscreen: false });
const app = new App({ name: "Arcue", version: "1.0.0" }, {}, { autoResize: true });
const view = new McpView(app);
/** The app answered a request for full screen with another mode, so the view shows everything in the conversation. */
let fullscreenRefused = false;

function applyContext(context: McpUiHostContext | undefined): void {
  if (!context) return;
  if (context.theme) applyDocumentTheme(context.theme);
  if (context.styles?.variables) applyHostStyleVariables(context.styles.variables);
  if (context.styles?.css?.fonts) applyHostFonts(context.styles.css.fonts);
  const insets = context.safeAreaInsets;
  if (insets) {
    for (const side of ["top", "right", "bottom", "left"] as const) {
      document.documentElement.style.setProperty(`--safe-${side}`, `${insets[side]}px`);
    }
  }
  const mode = context.displayMode ?? display.get().mode;
  const offered = context.availableDisplayModes?.includes("fullscreen") ?? display.get().canFullscreen;
  const canFullscreen = offered && !fullscreenRefused;
  display.set({ mode, canFullscreen });
  document.documentElement.dataset.mode = mode;
  document.documentElement.toggleAttribute("data-can-fullscreen", canFullscreen);
}

app.addEventListener("toolinput", ({ arguments: args }) => view.toolInput(args));
app.addEventListener("toolresult", (result) => view.toolResult(result));
app.addEventListener("toolcancelled", () => view.toolCancelled());
app.addEventListener("hostcontextchanged", (context) => applyContext({ ...app.getHostContext(), ...context }));
app.onteardown = async () => {
  view.dispose();
  return {};
};

async function setMode(mode: McpUiDisplayMode): Promise<void> {
  const granted = await app.requestDisplayMode({ mode }).catch(() => null);
  if (mode === "fullscreen" && granted?.mode !== "fullscreen") fullscreenRefused = true;
  applyContext({ displayMode: granted?.mode ?? display.get().mode });
}

function ViewPage() {
  const phase = useSelect(view.phase, (value) => value);
  const host = view.host;
  if (phase.kind === "waiting") return <Notice text={phase.name ? `Opening ${phase.name}…` : "Opening the model…"} />;
  if (phase.kind === "opening") return <Notice text={`Opening ${phase.name}…`} />;
  if (phase.kind === "failed") return <Notice text={phase.message} />;
  if (phase.kind === "elsewhere") {
    return (
      <Notice text={phase.note ?? `${phase.name} is open in a later view.`}>
        <button type="button" className="btn" onClick={() => void view.take()}>
          Show here
        </button>
      </Notice>
    );
  }
  return host ? <Shown host={host} /> : null;
}

function Shown({ host }: { host: LocalHost }) {
  const { store, client } = host;
  const { mode, canFullscreen } = useSelect(display, (value) => value);
  useEffect(() => {
    window.arcueWindow = { client, store };
  }, [client, store]);
  const connection = useSelect(store.state, (state) => state.connection);
  const fullscreen = mode === "fullscreen";
  const toggle = canFullscreen ? (
    <IconButton
      icon={fullscreen ? "collapse" : "expand"}
      label={fullscreen ? "Show in the conversation" : "Open full screen"}
      tipSide="bottom"
      onClick={() => void setMode(fullscreen ? "inline" : "fullscreen")}
    />
  ) : null;
  return (
    <div className="mcp-view" data-connection={connection}>
      <Workspace
        store={store}
        createViewport={createViewport}
        emptyTitle="Ask your agent to show you a model"
        dropHint="Dropping files doesn't work here."
        dropRefusal="Arcue can't tell where a dropped file is. Ask your agent to open it."
        reconnectingTip="Arcue isn't answering. The view reconnects by itself; your comments are saved."
        titleBarEnd={toggle}
      />
    </div>
  );
}

function Notice({ text, children }: { text: string; children?: ReactNode }) {
  return (
    <div className="mcp-notice" role="status">
      <p>{text}</p>
      {children}
    </div>
  );
}

const root = document.getElementById("app");
if (!root) throw new Error("view.html has no #app element.");
createRoot(root).render(
  <StrictMode>
    <ViewPage />
  </StrictMode>,
);
try {
  await app.connect();
  applyContext(app.getHostContext());
} catch (error) {
  view.fail(error instanceof Error ? error.message : String(error));
}
