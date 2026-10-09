import { createPeer, importRequests, portEndpoint } from "@arcue/protocol";
import { fbxImporter } from "../../src/index.ts";

function summary(scene) {
  return {
    meshes: scene.meshes.map((mesh) => ({ name: mesh.name, triangles: mesh.indices.length / 3 })),
    clips: scene.clips.map((clip) => clip.name),
  };
}

async function run() {
  const response = await fetch(new URL("./sample.fbx", document.baseURI));
  const bytes = new Uint8Array(await response.arrayBuffer());
  const readFile = () => Promise.resolve(null);
  const page = await fbxImporter.import({ fileName: "sample.fbx", bytes: bytes.slice(), readFile });

  const worker = new Worker(new URL("./web-worker.js", import.meta.url), { type: "module" });
  const peer = createPeer(portEndpoint(worker), { handleRequest: () => null });
  const inWorker = await peer.request("command", importRequests.run, { fileName: "sample.fbx", bytes });
  return { page: summary(page), worker: summary(inWorker) };
}

const output = document.getElementById("result");
run().then(
  (result) => {
    output.textContent = JSON.stringify(result);
    output.dataset.status = "done";
  },
  (error) => {
    output.textContent = String(error);
    output.dataset.status = "failed";
  },
);
