import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "vite";
import { appRoot, buildProcesses, DEV_SERVER_PORT, rendererConfig } from "./bundles.ts";

await buildProcesses();
const server = await createServer(rendererConfig());
await server.listen();
const electron = createRequire(import.meta.url)("electron") as string;
const child = spawn(electron, [appRoot, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, ARCUE_RENDERER_URL: `http://localhost:${DEV_SERVER_PORT}` },
});
child.on("exit", (code) => {
  void server.close().then(() => process.exit(code ?? 0));
});
