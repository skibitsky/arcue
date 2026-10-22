import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { startFakeCore } from "@arcue/platform-node/test";
import { LAST_CORE_FILE, SERVE_INFO_FILE } from "@arcue/protocol";

/**
 * Stands in for the `arcue serve` that `arcue serve --detach` starts: it records how it was started in `detach-child.json`
 * in its data folder, with what `last-core.json` said then, and behaves as `ARCUE_FIXTURE` says: "serve" answers as
 * Arcue in the browser at `serve.json` until `serve.stop`, "port-taken" says its port is in use, "quiet-exit" exits
 * with 3 and says nothing, "crash" records itself in `last-core.json` as a serve that starts does and then exits with
 * 1, and "sleep" never answers. It ends by itself once its data folder is gone.
 */
const mode = process.env.ARCUE_FIXTURE ?? "serve";
const userData = process.env.ARCUE_USER_DATA ?? process.cwd();
const args = process.argv.slice(2);
const port = Number(args[args.indexOf("--port") + 1]);

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

const record = {
  argv: process.argv.slice(1),
  cwd: process.cwd(),
  pid: process.pid,
  userData: process.env.ARCUE_USER_DATA,
  view: process.env.ARCUE_VIEW,
  lastCore: readJson(join(userData, LAST_CORE_FILE)),
};
writeFileSync(join(userData, "detach-child.json"), JSON.stringify(record));
setInterval(() => {
  if (!existsSync(userData)) process.exit(0);
}, 200);

switch (mode) {
  case "port-taken":
    process.stderr.write(`Port ${port} is in use. Choose another with --port.\n`);
    process.exit(1);
    break;
  case "quiet-exit":
    process.exit(3);
    break;
  case "crash": {
    const file = join(userData, LAST_CORE_FILE);
    writeFileSync(`${file}.tmp`, JSON.stringify({ version: 1, kind: "serve", serveUrl: `http://localhost:${port}` }));
    renameSync(`${file}.tmp`, file);
    process.stderr.write("arcue serve stopped before it answered.\n");
    process.exit(1);
    break;
  }
  case "sleep":
    break;
  case "serve":
    await startFakeCore(userData, {
      file: SERVE_INFO_FILE,
      kind: "serve",
      locks: 1,
      url: `http://localhost:${port}`,
      answers: {
        "asset.list": () => ({ assets: [] }),
        "serve.stop": (_input, fake) => {
          setImmediate(() => void fake.close().then(() => process.exit(0)));
        },
      },
    });
    break;
}
