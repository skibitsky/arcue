import "../src/fonts.css";
import "../src/tokens.css";
import "../src/base.css";
import "../src/workspace.css";
import "./dev.css";
import type { ViewportOptions } from "@arcue/viewport";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createWorkspaceStore, Workspace } from "../src";
import { SAMPLES, sampleCatalog } from "./catalog";
import { FakeCoreClient } from "./fake-core";
import { FakeViewport } from "./fake-viewport";
import { STONE_RESONATOR_PATH } from "./sample-data";

const params = new URLSearchParams(location.search);
const client = new FakeCoreClient({ catalog: sampleCatalog, loadDelayMs: 250 });
const store = createWorkspaceStore({ client });
client.connectWindow(store.handleRequest);

const createViewport = (options: ViewportOptions) => new FakeViewport(options);

function WindowLights() {
  return (
    <div className="dev-lights" aria-hidden="true">
      <i />
      <i />
      <i />
    </div>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("The harness page has no #root element.");
createRoot(root).render(
  <StrictMode>
    <div className="dev-desk">
      <div className="dev-window">
        <Workspace
          store={store}
          createViewport={createViewport}
          samples={SAMPLES}
          windowControls={<WindowLights />}
          onOpenFile={() => store.notify({ message: "The harness has no file picker. Open a sample.", kind: "info" })}
          onDropFiles={(files) =>
            store.notify({ message: `Dropped ${files.map((file) => file.name).join(", ")}`, kind: "info" })
          }
        />
      </div>
    </div>
  </StrictMode>,
);

declare global {
  interface Window {
    arcue: { store: typeof store; client: FakeCoreClient };
  }
}
window.arcue = { store, client };

async function start() {
  if (params.has("empty")) return;
  await client.execute("asset.open", { path: SAMPLES[1].path });
  await client.execute("asset.open", { path: SAMPLES[2].path });
  const { assetId } = await client.execute("asset.open", {
    path: STONE_RESONATOR_PATH,
    clip: params.get("clip") ?? "Armature|Charge",
    frame: Number(params.get("frame") ?? 34),
  });
  const select = params.get("select");
  if (!select) return;
  const session = store.session(assetId);
  const wait = () => new Promise((resolve) => setTimeout(resolve, 50));
  for (let tries = 0; tries < 100 && !session?.state.get().viewportReady; tries++) await wait();
  session?.selectComment(select);
}
void start();
