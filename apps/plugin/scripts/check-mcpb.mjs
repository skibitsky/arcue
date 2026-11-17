/**
 * Runs the unpacked extension's `arcue mcp` as the Claude desktop app runs a node extension: in an Electron utility
 * process, whose program can't run as Node, with the MCP messages on its stdin. It shows a model, which starts Arcue in
 * the browser in that process, inspects it there, and checks that it stops with the server.
 *
 *     electron check-mcpb.mjs <unpacked extension> <model>
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";

if (process.type === "utility") {
  const input = new Readable({ read() {} });
  process.parentPort.on("message", ({ data }) => input.push(data === null ? null : `${data}\n`));
  Object.defineProperty(process, "stdin", { value: input, configurable: true });
  const script = process.env.ARCUE_CHECK_SCRIPT ?? "";
  process.argv = [process.argv[0] ?? "", script, "mcp"];
  await import(pathToFileURL(script).href);
} else {
  const { app, utilityProcess } = await import("electron");
  app.whenReady().then(() => check(app, utilityProcess));
}

/** Electron emits ready only once the main module has run, so the check waits for it outside the module's own run. */
async function check(app, utilityProcess) {
  const [extension, model] = process.argv.slice(-2).map((path) => resolve(path));
  const fail = (message) => {
    console.error(message);
    app.exit(1);
  };
  setTimeout(() => fail("The check took longer than 2 minutes."), 120_000).unref();
  const data = mkdtempSync(join(tmpdir(), "arcue-mcpb-check-"));
  const env = { ...process.env, ARCUE_USER_DATA: data, ARCUE_CHECK_SCRIPT: join(extension, "server", "arcue.js") };
  for (const name of ["ELECTRON_RUN_AS_NODE", "NODE_OPTIONS", "ARCUE_VIEW", "CLAUDE_CODE_SESSION_ID"]) delete env[name];
  for (const name of ["CODEX_SESSION_ID", "CODEX_THREAD_ID"]) delete env[name];
  const child = utilityProcess.fork(fileURLToPath(import.meta.url), [], { stdio: "pipe", env, cwd: dirname(model) });
  child.stderr?.on("data", (chunk) => process.stderr.write(chunk));
  const exited = new Promise((resolveExit) => child.once("exit", resolveExit));

  const pending = new Map();
  let buffered = "";
  child.stdout?.on("data", (chunk) => {
    buffered += chunk;
    for (let end = buffered.indexOf("\n"); end >= 0; end = buffered.indexOf("\n")) {
      const message = JSON.parse(buffered.slice(0, end));
      buffered = buffered.slice(end + 1);
      pending.get(message.id)?.(message);
      pending.delete(message.id);
    }
  });
  let next = 1;
  const send = (message) => child.postMessage(JSON.stringify({ jsonrpc: "2.0", ...message }));
  const call = (method, params) =>
    new Promise((resolveCall) => {
      const id = next++;
      pending.set(id, resolveCall);
      send({ id, method, params });
    });
  const tool = async (name, args) => {
    const { result, error } = await call("tools/call", { name, arguments: args });
    const text = (result?.content ?? []).map((part) => part.text ?? "").join("\n");
    if (error || result?.isError) throw new Error(`${name} failed: ${error?.message ?? text}`);
    return text;
  };

  try {
    await call("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "check-mcpb", version: "1.0.0" },
    });
    send({ method: "notifications/initialized" });
    const { result } = await call("tools/list", {});
    if (!result?.tools.some((listed) => listed.name === "open_model"))
      throw new Error("arcue mcp lists no open_model.");

    await tool("open_model", { path: basename(model) });
    const serve = JSON.parse(readFileSync(join(data, "serve.json"), "utf8"));
    if (serve.pid !== child.pid || serve.hosted !== true) {
      throw new Error(
        `serve.json names process ${serve.pid}, not the utility process ${child.pid} that runs arcue mcp.`,
      );
    }
    const inspected = await tool("inspect_model", { path: basename(model) });
    if (!inspected.includes("Clips")) throw new Error(`inspect_model shows no clips:\n${inspected}`);

    child.postMessage(null);
    const timer = setTimeout(() => fail("arcue mcp still runs 15 seconds after its stdin closed."), 15_000);
    await exited;
    clearTimeout(timer);
    if (existsSync(join(data, "serve.json"))) throw new Error("arcue mcp left serve.json behind.");
    console.log("arcue mcp ran Arcue in the browser in its Electron utility process and stopped with it.");
    rmSync(data, { recursive: true, force: true });
    app.exit(0);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}
