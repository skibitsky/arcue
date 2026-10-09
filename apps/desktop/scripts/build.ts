import { buildProcesses, buildRenderer } from "./bundles.ts";

const started = performance.now();
await buildProcesses();
await buildRenderer();
console.log(`Built the desktop app in ${Math.round(performance.now() - started)} ms.`);
