#!/usr/bin/env node
import { C as readLastCore, D as readBridgeInfo, E as connectToCore, O as runningCore, S as waitForStarts, T as blockingCore, a as inBrowser, b as claimStart, d as WindowPresence, f as NodePlatform, g as ArcueCore, h as fromNativePath, i as doesNotAnswer, l as inspectFile, m as startNodeImportWorker, n as import_websocket_server, o as bundledImportWorker, p as systemClock, r as connectForOpen, s as formatInspection, u as userDataDir, v as startBridgeServer, w as isRunning, x as recordLastCore, y as CoreRunningError } from "./arcue-CEDIKIYu.js";
import { A as viewNameSchema, Bt as ArcueError, Et as bridgeAuthorization, It as framedEndpoint, Lt as messageChannel, Nt as sharesReviews, Pt as MAX_FRAME_BYTES, St as LOCAL_PAGE_OWNER, k as viewAddress, n as binaryFrameCodec, wt as SERVE_STOPPED_CLOSE_CODE } from "./arcue-QGFQvDM0.js";
import { mkdir, readFile, realpath, rename, stat } from "node:fs/promises";
import { connect, createServer } from "node:net";
import { dirname, extname, join, parse, resolve, sep } from "node:path";
import { createHash, timingSafeEqual } from "node:crypto";
import { userInfo } from "node:os";
import { closeSync, createReadStream, fstatSync, openSync } from "node:fs";
import { setTimeout as setTimeout$1 } from "node:timers/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createServer as createServer$1 } from "node:http";
//#region src/exit-after-run.ts
var EXIT_AFTER_MS = 5e3;
var exitProcess = (code) => process.exit(code);
var unrefTimer = (ms, run) => setTimeout(run, ms);
/** Sets the exit code and makes sure the process ends within 5 seconds, whatever handles stay open. */
function exitAfterRun(code, { exit = exitProcess, setTimer = unrefTimer } = {}) {
	process.exitCode = code;
	setTimer(EXIT_AFTER_MS, () => exit(code)).unref();
}
/** Ends the process with 1 after `ms` unless it ended first, saying so on stderr. */
function armHardExit(ms, { exit = exitProcess, setTimer = unrefTimer, err = (text) => process.stderr.write(text) } = {}) {
	setTimer(ms, () => {
		err(`Arcue did not stop within ${Math.round(ms / 1e3)} seconds, so it exits now.\n`);
		exit(1);
	}).unref();
}
var USAGE = `Usage:
  arcue open <file> [--clip <name>] [--frame <number>] [--view <name>] [--move]
      Opens a model in Arcue. The model loads with the files its composition lists. Run by an agent, it shows the
      model in that agent session's view: the page of Arcue in the browser whose address "arcue status" prints, which
      holds the model until that page is open. Without Arcue in the browser, the desktop app shows it in its window,
      starting when it is not running, unless Arcue last ran in a browser: then it says to run "arcue serve --detach".
      Run by a person, it shows the model in the desktop app, starting the app when it is not running, or, where the
      app has never run or cannot start, in Arcue in the browser.
      --clip names a clip by its name in the file, such as "Armature|Walk" in an FBX or "Walk" in a .blend.
      --frame is a whole frame number from 0.
      --view names the session, in place of ARCUE_VIEW, CLAUDE_CODE_SESSION_ID, CODEX_SESSION_ID or CODEX_THREAD_ID,
      the first of which that is set names it otherwise.
      --move takes the model into this session's view when another view shows it. Unsaved comment text keeps it there.
  arcue inspect <file> [--json]
      Imports a model without the app and summarizes its meshes, parts, bones, materials, clips and warnings,
      composed with the files its composition lists, as opening it would.
      --json prints the full result for scripts and agents. Exits with 1 when the file cannot be read or parsed.
  arcue serve [--detach] [--port <number>]
      Runs Arcue in a browser beside the desktop app, serving its pages at http://localhost:4530, or at the given
      port, to this computer only. Agents' "arcue open" shows their models there. It runs until stopped, and exits
      with 1 when Arcue already runs in a browser or an Arcue that can't share reviews runs.
      --detach runs it in the background: it returns once Arcue answers and prints its address, and Arcue stops by
      itself after 30 minutes with no page open. When Arcue already runs in a browser, it prints that address
      instead. Without --port it uses the port Arcue in the browser ran on last, when that port is free.
  arcue stop
      Stops Arcue in the browser for every agent session, once its changes in flight are saved. The desktop app
      keeps running. Exits with 1 when it does not stop.
  arcue status [--view <name>]
      Reports whether Arcue runs in a browser and in the desktop app, this session's view, and which assets each has
      open. Exits with 1 when neither runs.
  arcue mcp [--view <name>]
      Runs an MCP server on stdin and stdout. Its tools list the open models, read and send a model's comments,
      resolve or reopen them, show models, render screenshots and inspect files. They show models where "arcue open"
      does, and start Arcue in the browser when "arcue open" finds no Arcue to use.
      --view names the session, as for "arcue open"; without it or a session variable, the view is "mcp".
  arcue setup
      Through the agent plugin's launcher, on a computer without Node 24 or later: downloads the Node build the
      plugin pins from nodejs.org once, checks its SHA-256 checksum, and keeps it in this user's cache. No other
      command downloads anything. Exits with 3 when arcue runs on a Node older than 24.
  arcue help
      Shows this text.

A model's composition is composition.json in its review folder: .arcue/reviews/<path from the repository root>/
inside a git repository, otherwise reviews/<absolute path>/ in Arcue's data folder. Its paths are relative to the
model's folder.
`;
var UsageError = class extends Error {
	name = "UsageError";
};
/** Parses the arguments after the program name. Throws a `UsageError` for anything it does not understand. */
function parseArgs(args) {
	const [command, ...rest] = args;
	if (command === void 0 || command === "help" || command === "--help" || command === "-h") return { command: "help" };
	if (command === "status") return parseStatus(rest);
	if (command === "mcp") return parseMcp(rest);
	if (command === "stop") {
		if (rest.length > 0) throw new UsageError(`"arcue stop" takes no arguments, got "${rest.join(" ")}".`);
		return { command: "stop" };
	}
	if (command === "setup") {
		if (rest.length > 0) throw new UsageError(`"arcue setup" takes no arguments, got "${rest.join(" ")}".`);
		return { command: "setup" };
	}
	if (command === "inspect") return parseInspect(rest);
	if (command === "serve") return parseServe(rest);
	if (command !== "open") throw new UsageError(`Unknown command "${command}".`);
	let path;
	let clip;
	let frame;
	let view;
	let move = false;
	for (let index = 0; index < rest.length; index++) {
		const arg = rest[index] ?? "";
		const [flag, inline] = arg.startsWith("--") && arg.includes("=") ? splitOnce(arg, "=") : [arg, void 0];
		if (flag === "--clip" || flag === "--frame" || flag === "--view") {
			const value = inline ?? rest[++index];
			if (value === void 0 || value === "") throw new UsageError(`${flag} needs a value.`);
			if (flag === "--clip") clip = value;
			else if (flag === "--view") view = value;
			else frame = parseFrame(value);
		} else if (arg === "--move") move = true;
		else if (arg.startsWith("--")) throw new UsageError(`Unknown option "${arg}".`);
		else if (path === void 0) path = arg;
		else throw new UsageError(`"arcue open" takes one file, got "${path}" and "${arg}".`);
	}
	if (path === void 0) throw new UsageError("\"arcue open\" needs a file.");
	return {
		command: "open",
		path,
		...clip !== void 0 ? { clip } : {},
		...frame !== void 0 ? { frame } : {},
		...view !== void 0 ? { view } : {},
		...move ? { move } : {}
	};
}
function parseStatus(args) {
	const view = parseViewOnly("status", args);
	return {
		command: "status",
		...view !== void 0 ? { view } : {}
	};
}
function parseMcp(args) {
	const view = parseViewOnly("mcp", args);
	return {
		command: "mcp",
		...view !== void 0 ? { view } : {}
	};
}
function parseViewOnly(command, args) {
	let view;
	for (let index = 0; index < args.length; index++) {
		const arg = args[index] ?? "";
		const [flag, inline] = arg.startsWith("--") && arg.includes("=") ? splitOnce(arg, "=") : [arg, void 0];
		if (flag !== "--view") throw new UsageError(arg.startsWith("--") ? `Unknown option "${arg}".` : `"arcue ${command}" takes no arguments but --view, got "${args.join(" ")}".`);
		const value = inline ?? args[++index];
		if (value === void 0 || value === "") throw new UsageError("--view needs a value.");
		view = value;
	}
	return view;
}
function parseInspect(args) {
	let path;
	let json = false;
	for (const arg of args) if (arg === "--json") json = true;
	else if (arg.startsWith("--")) throw new UsageError(`Unknown option "${arg}".`);
	else if (path === void 0) path = arg;
	else throw new UsageError(`"arcue inspect" takes one file, got "${path}" and "${arg}".`);
	if (path === void 0) throw new UsageError("\"arcue inspect\" needs a file.");
	return {
		command: "inspect",
		path,
		json
	};
}
function parseServe(args) {
	let port;
	let detach = false;
	let idleStopMs;
	for (let index = 0; index < args.length; index++) {
		const arg = args[index] ?? "";
		const [flag, inline] = arg.startsWith("--") && arg.includes("=") ? splitOnce(arg, "=") : [arg, void 0];
		if (flag === "--detach") {
			if (inline !== void 0) throw new UsageError("--detach takes no value.");
			detach = true;
			continue;
		}
		if (flag !== "--port" && flag !== "--idle-stop-ms") throw new UsageError(arg.startsWith("--") ? `Unknown option "${arg}".` : `"arcue serve" takes no file, got "${arg}".`);
		const value = inline ?? args[++index];
		if (value === void 0 || value === "") throw new UsageError(`${flag} needs a value.`);
		if (flag === "--port") port = parsePort(value);
		else idleStopMs = parseIdleStop(value);
	}
	if (detach && idleStopMs !== void 0) throw new UsageError("--idle-stop-ms is set by --detach.");
	return {
		command: "serve",
		...port !== void 0 ? { port } : {},
		...detach ? { detach } : {},
		...idleStopMs !== void 0 ? { idleStopMs } : {}
	};
}
function parsePort(value) {
	const port = /^\d+$/.test(value) ? Number(value) : NaN;
	if (!(port >= 1 && port <= 65535)) throw new UsageError(`--port takes a port from 1 to 65535, got "${value}".`);
	return port;
}
/** The longest delay a Node timer keeps; a longer one fires at once. */
var MAX_TIMER_MS = 2147483647;
function parseIdleStop(value) {
	const ms = /^\d+$/.test(value) ? Number(value) : NaN;
	if (!(ms >= 1)) throw new UsageError(`--idle-stop-ms takes a whole number of milliseconds from 1, got "${value}".`);
	if (ms > MAX_TIMER_MS) throw new UsageError(`--idle-stop-ms takes at most ${MAX_TIMER_MS} milliseconds, got "${value}".`);
	return ms;
}
function parseFrame(value) {
	if (!/^\d+$/.test(value)) throw new UsageError(`--frame takes a whole number from 0, got "${value}".`);
	const frame = Number(value);
	if (!Number.isSafeInteger(frame)) throw new UsageError(`--frame ${value} is too large.`);
	return frame;
}
function splitOnce(value, separator) {
	const index = value.indexOf(separator);
	return [value.slice(0, index), value.slice(index + 1)];
}
//#endregion
//#region src/build-id.ts
/** Which arcue.js this is: the first 16 hex digits of the SHA-256 of the file, or null when it cannot be read. */
async function buildId(script) {
	try {
		return createHash("sha256").update(await readFile(script)).digest("hex").slice(0, 16);
	} catch {
		return null;
	}
}
//#endregion
//#region src/session-view.ts
/**
* The environment variables that name the agent session a command runs for, in the order they are taken. Codex sets
* CODEX_SESSION_ID to its conversation's root thread, which the conversation's subagents share; releases before it set
* only CODEX_THREAD_ID, which differs for each subagent.
*/
var SESSION_VARIABLES = [
	"ARCUE_VIEW",
	"CLAUDE_CODE_SESSION_ID",
	"CODEX_SESSION_ID",
	"CODEX_THREAD_ID"
];
/**
* The view of the agent session a command runs for: the first of `--view` and the session variables that is set,
* hashed into a short name. Subagents inherit the variables, so they reach their session's view. Null when none is set,
* as for a person at a terminal.
*/
function sessionView(env, given) {
	const identity = [given, ...SESSION_VARIABLES.map((name) => env[name])].find((value) => value !== void 0 && value !== "");
	if (identity === void 0) return null;
	return createHash("sha256").update(identity).digest("hex").slice(0, 12);
}
/** A copy of the environment without the variables that name an agent session, for a process that belongs to none. */
function outsideSessions(env) {
	const copy = { ...env };
	for (const name of SESSION_VARIABLES) delete copy[name];
	return copy;
}
//#endregion
//#region src/detach.ts
/** The arcue.js the build writes, which `arcue serve --detach` runs in the background. */
var bundledEntry = fileURLToPath(new URL("./arcue.js", import.meta.url));
/** How long Arcue in the browser that `--detach` starts runs with no page open. */
var IDLE_STOP_MS = 18e5;
var DETACH_TIMEOUT_MS = 3e4;
var LOG_LIMIT_BYTES = 1048576;
var POLL_MS$1 = 100;
var PROBE_MS = 1e3;
var AFTER_EXIT_MS = 2e3;
var LOSER_EXIT_MS = 5e3;
/** What `status` and `serve --detach` say about Arcue in the browser that runs from another arcue.js. */
var OTHER_BUILD = "It runs from another arcue build: run arcue stop, then arcue serve --detach to use this one.";
/** The Node and the arcue.js this command runs on, which `--detach` starts again in the background. */
function selfOf(options) {
	return options.self ?? {
		execPath: process.execPath,
		script: bundledEntry
	};
}
/** Which arcue.js this command is, or null when it cannot tell. */
async function buildOf(options) {
	return options.build !== void 0 ? options.build : buildId(selfOf(options).script);
}
/** Whether Arcue in the browser that the bridge file names runs from another arcue.js than `build`, when both are known. */
function otherBuild(info, build) {
	return build !== null && info.build !== void 0 && info.build !== build;
}
/** The port of an address, as a browser takes it. */
function portOf(url) {
	return url === void 0 ? void 0 : Number(new URL(url).port || 80);
}
/**
* Runs `arcue serve` in the background and returns once it answers, printing its address and this session's view. When
* Arcue in the browser already runs and shares reviews, it prints that one's address instead, and never stops it. The
* child belongs to no agent session, so it gets none of their variables, and runs in the root of the data folder's
* drive, so on Windows it keeps no folder someone may remove, such as the data folder, whose removal stops it. It
* records Arcue in the browser as the last core before the child starts, so an open for an agent session's view
* meanwhile never starts the desktop app, and puts the earlier record back when the child fails to start.
*/
async function detachServe(command, env, output, options) {
	const userData = userDataDir(env);
	const view = sessionView(env);
	const self = selfOf(options);
	const build = await buildOf(options);
	const viewLine = (url) => view !== null && url !== void 0 ? [`This session's view: ${viewAddress(url, view)}`] : [];
	const already = (info) => {
		const lines = [`Arcue already runs in a browser at ${info.url} (process ${info.pid}).`];
		if (otherBuild(info, build)) lines.push(OTHER_BUILD);
		output.out(`${[...lines, ...viewLine(info.url)].join("\n")}\n`);
		return 0;
	};
	const blocking = await blockingCore(userData, "serve");
	if (blocking?.reason === "unshared") {
		const platform = options.platform ?? process.platform;
		output.err(`${new CoreRunningError(blocking.info, "unshared", "serve", platform).message}\n`);
		return 1;
	}
	if (blocking) {
		let connection;
		try {
			connection = await connectToCore(userData, "serve");
		} catch (error) {
			const { url, pid } = blocking.info;
			output.err(`Arcue in the browser at ${url} (process ${pid}) does not answer: ${messageOf$1(error)}\n`);
			return 1;
		}
		connection?.close();
		if (connection) {
			const { info } = connection;
			if (command.port !== void 0 && command.port !== portOf(info.url)) {
				output.out(`Arcue already runs in a browser at ${info.url} (process ${info.pid}). Run arcue stop first to run it on port ${command.port}.\n`);
				return 1;
			}
			return already(info);
		}
	}
	const port = command.port ?? await servePort(userData);
	if (!(await stat(self.script).catch(() => null))?.isFile()) {
		output.out(`This arcue has no arcue.js in ${dirname(self.script)}.\n`);
		return 1;
	}
	const logs = join(userData, "logs");
	await mkdir(logs, {
		recursive: true,
		mode: 448
	});
	const log = join(logs, "serve.log");
	if (((await stat(log).catch(() => null))?.size ?? 0) > LOG_LIMIT_BYTES) await rename(log, join(logs, "serve.old.log")).catch(() => void 0);
	let descriptor = null;
	let offset;
	try {
		descriptor = openSync(log, "a", 384);
		offset = fstatSync(descriptor).size;
	} catch (error) {
		if (descriptor !== null) closeSync(descriptor);
		output.out(`Could not write Arcue's log at ${log}: ${messageOf$1(error)}\n`);
		return 1;
	}
	const putBackLastCore = await recordLastCore(userData, "serve");
	let child;
	try {
		child = spawn(self.execPath, [
			self.script,
			"serve",
			"--port",
			String(port),
			"--idle-stop-ms",
			String(IDLE_STOP_MS)
		], {
			detached: true,
			stdio: [
				"ignore",
				descriptor,
				descriptor
			],
			windowsHide: true,
			cwd: parse(userData).root,
			env: {
				...outsideSessions(env),
				ARCUE_USER_DATA: userData
			}
		});
	} catch (error) {
		await putBackLastCore();
		output.out(`Could not start Arcue in the browser: ${messageOf$1(error)}\n`);
		return 1;
	} finally {
		closeSync(descriptor);
	}
	const timeoutMs = options.detachTimeoutMs ?? DETACH_TIMEOUT_MS;
	const outcome = await watchStart(child, userData, timeoutMs);
	if (outcome.kind !== "started" && outcome.kind !== "other") await putBackLastCore();
	switch (outcome.kind) {
		case "started":
			output.out(`${[`Arcue runs in a browser at ${outcome.info.url} (process ${outcome.info.pid}). It stops by itself after 30 minutes with no page open.`, ...viewLine(outcome.info.url)].join("\n")}\n`);
			return 0;
		case "other": return already(outcome.info);
		case "error":
			output.out(`Could not start Arcue in the browser: ${outcome.error.message}\n`);
			return 1;
		case "exited": {
			const said = (await readFile(log).catch(() => Buffer.alloc(0))).subarray(offset).toString("utf8").trim();
			output.err(`${said || `arcue serve exited with code ${outcome.code} before it answered. Its log is ${log}.`}\n`);
			return 1;
		}
		case "timeout":
			output.out(`Arcue in the browser did not answer within ${Math.round(timeoutMs / 1e3)} seconds, so it was stopped. Its log is ${log}.\n`);
			return 1;
	}
}
/**
* Waits until the child answers at `serve.json`, another start wins, the child fails to spawn or exits, or the time is
* up, which kills it. Lets go of the child once it runs, so this process can exit.
*/
async function watchStart(child, userData, timeoutMs) {
	let failed = null;
	let exitCode = null;
	const { promise: changed, resolve: change } = Promise.withResolvers();
	const onError = (error) => {
		failed ??= error;
		change();
	};
	const onExit = (code, signal) => {
		exitCode = code ?? signal ?? 1;
		change();
	};
	child.on("error", onError);
	child.once("exit", onExit);
	const exited = new Promise((resolvePromise) => {
		if (child.exitCode !== null || child.signalCode !== null) resolvePromise();
		else child.once("exit", () => resolvePromise());
	});
	const deadline = Date.now() + timeoutMs;
	try {
		for (;;) {
			if (failed) return {
				kind: "error",
				error: failed
			};
			if (exitCode !== null) {
				const winner = await answeringWithin(userData, AFTER_EXIT_MS);
				return winner ? {
					kind: "other",
					info: winner
				} : {
					kind: "exited",
					code: exitCode
				};
			}
			const info = await answering(userData);
			if (info && info.pid === child.pid) {
				child.unref();
				return {
					kind: "started",
					info
				};
			}
			if (info) {
				await Promise.race([exited, setTimeout$1(LOSER_EXIT_MS, void 0, { ref: false })]);
				if (child.exitCode === null && child.signalCode === null) child.kill();
				return {
					kind: "other",
					info
				};
			}
			if (Date.now() >= deadline) {
				child.kill();
				return { kind: "timeout" };
			}
			await Promise.race([changed, setTimeout$1(Math.min(POLL_MS$1, Math.max(0, deadline - Date.now())), void 0, { ref: false })]);
		}
	} finally {
		child.off("error", onError);
		child.off("exit", onExit);
		child.on("error", () => void 0);
	}
}
/** What the core at `serve.json` says of itself when it answers. */
async function answering(userData) {
	const connection = await connectToCore(userData, "serve", PROBE_MS).catch(() => null);
	connection?.close();
	return connection?.info ?? null;
}
async function answeringWithin(userData, ms) {
	const deadline = Date.now() + ms;
	for (;;) {
		const info = await answering(userData);
		if (info || Date.now() >= deadline) return info;
		await setTimeout$1(POLL_MS$1);
	}
}
/** The port Arcue in the browser ran on last when it is free, so its open pages find it again, or else the default. */
async function servePort(userData) {
	return await freePort(portOf((await readLastCore(userData))?.serveUrl)) ?? 4530;
}
/** The port when nothing listens on it on 127.0.0.1 or ::1, the addresses `arcue serve` takes it on, or undefined. */
async function freePort(port) {
	if (port === void 0 || !await listensOn(port, "127.0.0.1")) return void 0;
	return await listensOn(port, "::1", { lacking: true }) ? port : void 0;
}
/** Whether a server can listen on the port at the address, or, with `lacking`, the computer has no such address. */
function listensOn(port, host, { lacking = false } = {}) {
	return new Promise((resolvePromise) => {
		const server = createServer();
		server.once("error", (error) => resolvePromise(lacking && (error.code === "EADDRNOTAVAIL" || error.code === "EAFNOSUPPORT")));
		server.listen(port, host, () => server.close(() => resolvePromise(true)));
	});
}
function messageOf$1(error) {
	return error instanceof Error ? error.message : String(error);
}
//#endregion
//#region src/serve.ts
/** The web UI the build writes beside `arcue.js`. */
var bundledWebUi = fileURLToPath(new URL("./web/", import.meta.url));
var CONTENT_TYPES = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json",
	".wasm": "application/wasm",
	".woff2": "font/woff2",
	".woff": "font/woff",
	".svg": "image/svg+xml",
	".png": "image/png",
	".ico": "image/x-icon"
};
/** Sent with every response: no website may show these pages in a frame, and links from them reveal no address. */
var PAGE_HEADERS = {
	"Content-Security-Policy": "frame-ancestors 'none'",
	"X-Frame-Options": "DENY",
	"Referrer-Policy": "no-referrer",
	"X-Content-Type-Options": "nosniff"
};
/** The addresses of the page itself, whose load counts the idle time again, as its socket connects only once it runs. */
var PAGE_PATHS = /* @__PURE__ */ new Set(["/", "/index.html"]);
/**
* Whether a request loads the page into a tab. A fetch of the page from a script, as an open page's probe of its
* address is, does not, so a page left open on another Arcue in the browser keeps no idle serve running.
*/
function loadsPage(request, address) {
	const destination = request.headers["sec-fetch-dest"];
	return PAGE_PATHS.has(address?.pathname ?? "") && (destination === void 0 || destination === "document");
}
var HEARTBEAT_MS = 3e4;
var CHECK_MS = 5e3;
var PAGE_CLOSE_MS = 1e3;
/**
* Runs a core on this computer's files beside the desktop app's, on the same reviews, which both change only under
* `Platform.lock`. It answers the command line at `serve.json`, refuses to start beside another `arcue serve` or a
* core that takes no review locks, and stops itself when one starts or its files are removed. A detached one stops
* after `idleStopMs` with no page connected. It serves its window to a browser on localhost, as the desktop app shows
* it in its own window.
*
* A page whose address names an agent session's view, `/?view=<name>`, connects as that view's page and shows the
* models that session opens. While that page is not open, the core holds them for the page rather than show them in a
* page outside views, which may be another session's, so an open for a view never waits for a browser.
*
* Only pages from this server's own origin can connect to the core, and only through a localhost address, so other
* websites and DNS rebinding cannot reach it. A program that presents the token from `serve.json` and no origin, as
* `arcue mcp` does for the view an app shows, connects as a page too. No website may show its pages in a frame, where the user could not see a
* model the command line opens and clicks could be hijacked. Like any local web server, it is open to other programs on
* this computer while it runs.
*/
async function startServer(options) {
	const webUi = await realpath(options.webUi).catch(() => null);
	if (!webUi || !await isFile(resolve(webUi, "index.html"))) throw new Error(`This arcue has no web UI in ${options.webUi}.`);
	const { userData } = options;
	const setTimer = options.setTimer ?? systemClock.setTimer;
	const claim = await claimStart(userData, "serve");
	const dataFolder = await folderIdentity(userData);
	const owner = await pageOwner(userData);
	let url = "";
	const windows = new WindowPresence({
		requestWindow: () => options.onWaitingForWindow?.(url),
		setTimer: systemClock.setTimer
	});
	const stopped = Promise.withResolvers();
	let stopping = null;
	let closing = null;
	let pages = 0;
	let cancelIdle = () => void 0;
	let cancelHeartbeat = () => void 0;
	const armIdle = () => {
		cancelIdle();
		const idleStopMs = options.idleStopMs;
		if (idleStopMs === void 0 || closing) return;
		cancelIdle = setTimer(idleStopMs, () => stop("idle", `Arcue stops: no page was open for ${Number((idleStopMs / 6e4).toFixed(2))} minutes.`));
	};
	const stop = (reason, message) => {
		if (stopping || closing) return;
		stopping = {
			reason,
			message
		};
		cancelHeartbeat();
		stopped.resolve(stopping);
	};
	const removed = (folder) => stop("removed", `Arcue stops: its files in ${folder} were removed. Run arcue serve --detach to start the current one.`);
	let http = [];
	let core = null;
	let port;
	let bridge;
	let unregisterStop = () => void 0;
	try {
		const listening = await listenLocally(options.port);
		http = listening.servers;
		port = listening.port;
		url = `http://localhost:${port}`;
		const platform = new NodePlatform({
			appDataDir: fromNativePath(userData),
			startImportWorker: () => startNodeImportWorker(options.importWorkerEntry, options.onError),
			lockTimeoutMs: options.lockTimeoutMs
		});
		core = await ArcueCore.start({
			platform,
			onError: options.onError
		});
		unregisterStop = core.registry.handleCommand("serve.stop", (_input, context) => {
			if (context.caller !== "bridge") throw new ArcueError("forbidden", "Only the arcue command can stop Arcue in the browser.");
			setImmediate(() => stop("requested", "Arcue stops: arcue stop asked it to."));
		});
		bridge = await startBridgeServer({
			core,
			userData,
			kind: "serve",
			ensureWindow: (view) => {
				if (pages === 0) armIdle();
				return view === null ? windows.ensure(null) : Promise.resolve();
			},
			onConnection: () => {
				if (pages === 0) armIdle();
			},
			onError: options.onError,
			url,
			build: options.build,
			hosted: options.hosted,
			claim
		});
	} catch (error) {
		await claim.release();
		core?.dispose();
		await Promise.all(http.map((server) => closeServer(server)));
		throw error;
	}
	const started = core;
	const hosts = localHosts(port);
	const allowed = (request) => hosts.has(request.headers.host?.toLowerCase() ?? "");
	const sockets = new import_websocket_server.default({
		noServer: true,
		maxPayload: MAX_FRAME_BYTES
	});
	const answered = /* @__PURE__ */ new WeakMap();
	let next = 1;
	sockets.on("connection", (socket, request) => {
		pages++;
		cancelIdle();
		answered.set(socket, true);
		socket.on("pong", () => answered.set(socket, true));
		socket.once("close", () => {
			pages--;
			if (pages === 0) armIdle();
		});
		const view = socketView(URL.parse(request.url ?? "/", url)) ?? null;
		const channel = messageChannel(webSocketStream(socket), binaryFrameCodec);
		const peer = started.connect(framedEndpoint(channel), {
			connection: `browser-${next++}`,
			caller: "window",
			view: view ?? void 0,
			browser: true,
			onListenerError: options.onError
		});
		windows.added(view);
		peer.onClose(() => {
			windows.removed(view);
			channel.close();
		});
	});
	for (const server of http) {
		server.removeAllListeners("request");
		server.removeAllListeners("upgrade");
		server.on("request", (request, response) => {
			for (const [name, value] of Object.entries(PAGE_HEADERS)) response.setHeader(name, value);
			if (!allowed(request)) return refuse(response, 403);
			if (request.method !== "GET" && request.method !== "HEAD") return refuse(response, 405);
			if (pages === 0 && loadsPage(request, URL.parse(request.url ?? "/", url))) armIdle();
			sendFile(webUi, owner, request, response, () => removed(webUi)).catch((error) => {
				options.onError(error);
				if (!response.headersSent) refuse(response, 500);
				else response.destroy();
			});
		});
		server.on("upgrade", (request, socket, head) => {
			const address = URL.parse(request.url ?? "/", url);
			if (!allowed(request) || address?.pathname !== "/core/2" || !fromPageOrBridge(request, bridge.info.token)) {
				socket.end(`HTTP/1.1 403 Forbidden\r\n${rawHeaders(PAGE_HEADERS)}Connection: close\r\n\r\n`);
				return;
			}
			if (socketView(address) === void 0) {
				socket.end(`HTTP/1.1 400 Bad Request\r\n${rawHeaders(PAGE_HEADERS)}Connection: close\r\n\r\n`);
				return;
			}
			if (closing || stopping) {
				socket.end(`HTTP/1.1 503 Service Unavailable\r\n${rawHeaders(PAGE_HEADERS)}Connection: close\r\n\r\n`);
				return;
			}
			sockets.handleUpgrade(request, socket, head, (connected) => sockets.emit("connection", connected, request));
		});
	}
	const heartbeat = () => {
		for (const client of sockets.clients) {
			if (answered.get(client) === false) {
				client.terminate();
				continue;
			}
			answered.set(client, false);
			client.ping();
		}
		cancelHeartbeat = setTimer(options.heartbeatMs ?? HEARTBEAT_MS, heartbeat);
	};
	cancelHeartbeat = setTimer(options.heartbeatMs ?? HEARTBEAT_MS, heartbeat);
	const check = async () => {
		const workerFolder = dirname(options.importWorkerEntry);
		if (!await isFile(resolve(webUi, "index.html"))) return removed(webUi);
		if (!await isFile(options.importWorkerEntry)) return removed(workerFolder);
		const folder = await folderIdentity(userData);
		if (folder === null || dataFolder !== null && folder !== dataFolder) return stop("data-gone", `Arcue stops: its data folder ${userData} was removed.`);
		const held = await bridge.holdsInfo();
		const other = held === "other-live" ? await readBridgeInfo(userData, "serve") : null;
		if (other) return stop("replaced", `Arcue stops: another Arcue in the browser took its place (process ${other.pid}).`);
		if (held === "missing") await bridge.rewriteInfo();
		const desktop = await readBridgeInfo(userData, "desktop");
		if (desktop && !sharesReviews(desktop)) {
			const live = await runningCore(userData, "desktop");
			if (live?.token === desktop.token) stop("unshared", `Arcue stops: an Arcue that can't share reviews started beside it (process ${live.pid}).`);
		}
	};
	let cancelChecks = () => void 0;
	const checkLater = () => {
		cancelChecks = setTimer(options.checkMs ?? CHECK_MS, () => {
			check().catch((error) => options.onError(error)).finally(() => {
				if (!closing && !stopping) checkLater();
			});
		});
	};
	checkLater();
	armIdle();
	return {
		url,
		pid: process.pid,
		stopped: stopped.promise,
		close(code = SERVE_STOPPED_CLOSE_CODE) {
			stop("closed", "Arcue stops.");
			closing ??= (async () => {
				cancelIdle();
				cancelHeartbeat();
				cancelChecks();
				unregisterStop();
				await recordLastCore(userData, "serve", url);
				await bridge.close().catch((error) => options.onError(error));
				await closePages(sockets, code);
				await Promise.all(http.map((server) => closeServer(server)));
				windows.dispose();
				await started.shutdown().catch((error) => options.onError(error));
			})();
			return closing;
		}
	};
}
/** Closes every page's socket with the code, and ends those still open a second later. */
async function closePages(sockets, code) {
	const open = [...sockets.clients];
	const closed = Promise.all(open.map((client) => new Promise((resolvePromise) => {
		if (client.readyState === client.CLOSED) resolvePromise();
		else client.once("close", () => resolvePromise());
	})));
	for (const client of open) client.close(code);
	let timer;
	await Promise.race([closed, new Promise((resolvePromise) => timer = setTimeout(resolvePromise, PAGE_CLOSE_MS))]);
	clearTimeout(timer);
	for (const client of sockets.clients) client.terminate();
	sockets.close();
}
/**
* Whether a socket comes from the server's own page, or from a program that presents the bridge token, which no
* browser can send.
*/
function fromPageOrBridge(request, token) {
	const { origin, authorization } = request.headers;
	if (origin !== void 0) return origin === `http://${request.headers.host}`;
	const given = Buffer.from(authorization ?? "");
	const expected = Buffer.from(bridgeAuthorization(token));
	return given.length === expected.length && timingSafeEqual(given, expected);
}
/** The agent session's view a page's socket address names, null for none, or undefined for a name that is not one. */
function socketView(address) {
	const given = address?.searchParams.getAll("view") ?? [];
	if (given.length === 0) return null;
	const view = viewNameSchema.safeParse(given[0]);
	return given.length === 1 && view.success ? view.data : void 0;
}
/** The Host headers a browser sends for this computer's own addresses, which leave out the default port 80. */
function localHosts(port) {
	const names = [
		"localhost",
		"127.0.0.1",
		"[::1]"
	];
	return new Set(port === 80 ? names : names.map((name) => `${name}:${port}`));
}
/**
* Listens on the port on 127.0.0.1 and, where the computer has it, on ::1 too, since "localhost" may resolve to either.
* Until the caller takes their requests over, the servers answer 503, since a request that arrives while a server has
* no listener is never answered.
*/
async function listenLocally(port) {
	const first = startingServer();
	try {
		await listen(first, port, "127.0.0.1");
	} catch (error) {
		if (isCode(error, "EADDRINUSE")) throw new Error(`Port ${port} is in use. Choose another with --port.`);
		throw error;
	}
	const bound = first.address().port;
	const second = startingServer();
	try {
		await listen(second, bound, "::1");
		return {
			servers: [first, second],
			port: bound
		};
	} catch (error) {
		if (isCode(error, "EADDRNOTAVAIL") || isCode(error, "EAFNOSUPPORT")) return {
			servers: [first],
			port: bound
		};
		first.close();
		if (isCode(error, "EADDRINUSE")) throw new Error(`Port ${bound} is in use. Choose another with --port.`);
		throw error;
	}
}
/**
* The folder's device and inode, which a folder made again in its place does not share, as when a lock or a save in
* flight makes a removed data folder again. Null when it is gone.
*/
async function folderIdentity(path) {
	const found = await stat(path, { bigint: true }).catch(() => null);
	return found ? `${found.dev}:${found.ino}` : null;
}
/** Names the data folder and user, the same on every start, so the page tells this Arcue in the browser from another. */
async function pageOwner(userData) {
	const folder = await realpath(userData).catch(() => resolve(userData));
	const user = process.getuid?.() ?? userInfo().username;
	return createHash("sha256").update(`${user}\0${folder}`).digest("hex").slice(0, 16);
}
/** The page with the meta tag that names its owner, first in its head. */
function withOwner(html, owner) {
	const meta = `<meta name="${LOCAL_PAGE_OWNER}" content="${owner}" />`;
	const head = /<head(\s[^>]*)?>/i.exec(html);
	if (!head) return `${meta}${html}`;
	const at = head.index + head[0].length;
	return `${html.slice(0, at)}${meta}${html.slice(at)}`;
}
function startingServer() {
	const server = createServer$1((_request, response) => {
		for (const [name, value] of Object.entries(PAGE_HEADERS)) response.setHeader(name, value);
		refuse(response, 503);
	});
	server.on("upgrade", (_request, socket) => {
		socket.end(`HTTP/1.1 503 Service Unavailable\r\n${rawHeaders(PAGE_HEADERS)}Connection: close\r\n\r\n`);
	});
	return server;
}
function listen(server, port, host) {
	return new Promise((resolvePromise, reject) => {
		server.once("error", reject);
		server.listen(port, host, () => {
			server.off("error", reject);
			resolvePromise();
		});
	});
}
function closeServer(server) {
	return new Promise((resolvePromise) => {
		server.close(() => resolvePromise());
		server.closeAllConnections();
	});
}
async function isFile(path) {
	return (await stat(path).catch(() => null))?.isFile() ?? false;
}
function isCode(error, code) {
	return error instanceof Error && error.code === code;
}
function refuse(response, status) {
	response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
	response.end(`${status}\n`);
}
function rawHeaders(headers) {
	return Object.entries(headers).map(([name, value]) => `${name}: ${value}\r\n`).join("");
}
/**
* Sends a file from the web UI's folder, `index.html` for "/". Anything outside the folder is not found. Calls
* `onPageMissing` when `index.html` is gone.
*/
async function sendFile(webUi, owner, request, response, onPageMissing) {
	let path;
	try {
		path = decodeURIComponent(URL.parse(request.url ?? "/", "http://localhost")?.pathname ?? "");
	} catch {
		return refuse(response, 404);
	}
	const relative = path === "/" ? "index.html" : path.slice(1);
	const file = resolve(webUi, relative);
	if (path.includes("\0") || !file.startsWith(`${webUi}${sep}`)) return refuse(response, 404);
	const found = await stat(file).catch(() => null);
	if (!found?.isFile()) {
		if (relative === "index.html") onPageMissing();
		return refuse(response, 404);
	}
	if (relative === "index.html") {
		const page = Buffer.from(withOwner(await readFile(file, "utf8"), owner));
		response.writeHead(200, {
			"Content-Type": CONTENT_TYPES[".html"],
			"Content-Length": page.length,
			"Cache-Control": "no-cache"
		});
		response.end(request.method === "HEAD" ? void 0 : page);
		return;
	}
	response.writeHead(200, {
		"Content-Type": CONTENT_TYPES[extname(file).toLowerCase()] ?? "application/octet-stream",
		"Content-Length": found.size,
		"Cache-Control": relative.startsWith("assets/") ? "public, max-age=31536000, immutable" : "no-cache"
	});
	if (request.method === "HEAD") {
		response.end();
		return;
	}
	await new Promise((resolvePromise, reject) => {
		const stream = createReadStream(file);
		stream.once("error", reject);
		response.once("close", () => resolvePromise());
		stream.pipe(response);
	});
}
/** A WebSocket carries one frame per message, so it keeps message boundaries; an error ends the stream, as its "close" event follows. */
function webSocketStream(socket) {
	socket.on("error", () => socket.terminate());
	return {
		write: (bytes) => socket.send(bytes),
		onData(listener) {
			const onMessage = (data) => {
				if (data instanceof Uint8Array) listener(data);
				else socket.terminate();
			};
			socket.on("message", onMessage);
			return () => socket.off("message", onMessage);
		},
		onClose(listener) {
			const once = () => listener();
			socket.once("close", once);
			return () => socket.off("close", once);
		},
		close: () => socket.close()
	};
}
//#endregion
//#region src/serve-here.ts
/**
* Whether this process can run `arcue serve --detach`, which starts its own program again as Node. An Electron utility
* process, where the Claude desktop app runs its extensions' servers on its own Node, can't: its program is Electron's
* helper, which may not run as Node.
*/
function startsItself(proc = process) {
	return Reflect.get(proc, "type") === void 0;
}
/**
* Arcue in the browser in this process, for an `arcue mcp` that can't start it in the background. It runs until it stops
* by itself or `arcue stop` asks it to, and `start` starts it again after that, until `close`.
*/
var ServeHere = class {
	#options;
	#server = null;
	#starting = null;
	#closing = null;
	#closed = false;
	constructor(options) {
		this.#options = options;
	}
	/** Starts Arcue in the browser here, unless it runs already, here or in another process. */
	start() {
		this.#starting ??= this.#start().finally(() => {
			this.#starting = null;
		});
		return this.#starting;
	}
	async close() {
		this.#closed = true;
		await this.#starting?.catch(() => void 0);
		const server = this.#server;
		this.#server = null;
		await Promise.all([this.#closing, server?.close(SERVE_STOPPED_CLOSE_CODE)]);
	}
	async #start() {
		await this.#closing;
		if (this.#closed) throw new Error("Arcue's MCP server is closing.");
		if (this.#server) return;
		const { userData } = this.#options;
		const blocking = await blockingCore(userData, "serve");
		if (blocking?.reason === "unshared") throw new CoreRunningError(blocking.info, "unshared", "serve", this.#options.platform ?? process.platform);
		if (blocking) {
			const connection = await connectToCore(userData, "serve");
			connection?.close();
			if (connection) return;
		}
		const { importWorkerEntry, webUi, build, onError } = this.#options;
		const serve = (port) => startServer({
			userData,
			importWorkerEntry,
			webUi,
			port,
			idleStopMs: this.#options.idleStopMs ?? 18e5,
			onError,
			hosted: true,
			...build === void 0 ? {} : { build }
		});
		const server = await serve(this.#options.port ?? await servePort(userData)).catch((error) => {
			if (error instanceof Error && error.message.includes(" is in use.")) return serve(0);
			throw error;
		}).catch((error) => {
			if (error instanceof CoreRunningError && error.reason === "same") return null;
			throw error;
		});
		if (!server) return;
		this.#server = server;
		server.stopped.then((stop) => {
			if (this.#server !== server) return;
			this.#server = null;
			this.#options.onStopped?.(stop.message);
			this.#closing = server.close(SERVE_STOPPED_CLOSE_CODE).finally(() => {
				this.#closing = null;
			});
		});
	}
};
//#endregion
//#region src/stop.ts
var STOP_TIMEOUT_MS = 3e4;
var POLL_MS = 100;
/** How long a process may linger once its bridge file and socket are gone, as a zombie or a reused pid. */
var LINGER_MS = 1e4;
var NOTHING_LISTENS = /* @__PURE__ */ new Set([
	"ENOENT",
	"ECONNREFUSED",
	"ENOTSOCK"
]);
/**
* Stops Arcue in the browser: asks the core at `serve.json` to stop and waits until it has, or stops an older
* `arcue serve` at `bridge.json` with SIGTERM where the system allows it. It never stops the desktop app.
*/
async function stopServe(env, output, options) {
	const userData = userDataDir(env);
	const stopped = await stopRunning(userData, output, options);
	if (stopped !== null) return stopped;
	await waitForStarts(userData);
	const afterStart = await stopRunning(userData, output, options);
	if (afterStart !== null) return afterStart;
	output.out("Arcue is not running in a browser.\n");
	return 0;
}
/** Stops the Arcue in the browser that runs and returns the exit code, or null when none runs. */
async function stopRunning(userData, output, options) {
	const timeoutMs = options.stopTimeoutMs ?? STOP_TIMEOUT_MS;
	const connection = await connectOrRefuse(userData, "serve", output);
	if (connection === "refused") return 1;
	if (connection) {
		const { info } = connection;
		try {
			await connection.client.execute("serve.stop", {});
		} catch (error) {
			if (!(error instanceof ArcueError && error.code === "disconnected")) throw error;
		} finally {
			connection.close();
		}
		if (await waitStopped(userData, "serve", info, timeoutMs)) {
			output.out(`Stopped Arcue in the browser at ${info.url} (process ${info.pid}).\n`);
			return 0;
		}
		output.out(`Arcue in the browser (process ${info.pid}) did not stop within ${seconds(timeoutMs)} seconds.\n`);
		return 1;
	}
	const older = await readBridgeInfo(userData, "desktop");
	if (!older || !isOlderServe(older)) return null;
	const olderConnection = await connectOrRefuse(userData, "desktop", output);
	if (olderConnection === "refused") return 1;
	if (!olderConnection) return null;
	olderConnection.close();
	const { info } = olderConnection;
	if (!isOlderServe(info)) return null;
	if ((options.platform ?? process.platform) === "win32") {
		output.out(`The arcue serve at ${info.url} (process ${info.pid}) is older than this arcue command and cannot be stopped by it. Stop it where it runs.\n`);
		return 1;
	}
	const signal = options.signal ?? ((pid, name) => process.kill(pid, name));
	try {
		signal(info.pid, "SIGTERM");
	} catch (error) {
		if (error.code !== "ESRCH") throw error;
	}
	if (await waitStopped(userData, "desktop", info, timeoutMs)) {
		output.out(`Stopped the older arcue serve at ${info.url} (process ${info.pid}).\n`);
		return 0;
	}
	output.out(`Arcue in the browser (process ${info.pid}) did not stop within ${seconds(timeoutMs)} seconds.\n`);
	return 1;
}
/** An `arcue serve` from before cores ran side by side, which wrote `bridge.json` with its address and no kind. */
function isOlderServe(info) {
	return info.url !== void 0 && info.kind === void 0;
}
/** Connects to the core in the bridge file of `kind`, or says that it does not answer. */
async function connectOrRefuse(userData, kind, output) {
	try {
		return await connectToCore(userData, kind);
	} catch (error) {
		const info = await readBridgeInfo(userData, kind);
		const where = info ? ` at ${info.url} (process ${info.pid})` : "";
		const message = error instanceof Error ? error.message : String(error);
		output.out(`Arcue in the browser${where} does not answer, so it was not stopped: ${message}\n`);
		return "refused";
	}
}
/**
* Waits until the core's process has ended. Once its bridge file no longer names it and nothing listens on its socket,
* a hosted core has stopped, and a process that lingers with its pid, as a zombie or a pid used again, counts as
* stopped after a while.
*/
async function waitStopped(userData, kind, info, timeoutMs) {
	const deadline = Date.now() + timeoutMs;
	let goneSince = null;
	for (;;) {
		if (!isRunning(info.pid)) return true;
		if (goneSince === null) {
			if ((await readBridgeInfo(userData, kind))?.token !== info.token && !await listens(info.socket)) {
				if (info.hosted) return true;
				goneSince = Date.now();
			}
		} else if (Date.now() - goneSince >= LINGER_MS) return true;
		if (Date.now() >= deadline) return false;
		await setTimeout$1(POLL_MS);
	}
}
/** Whether something accepts connections on the socket. */
function listens(socket) {
	return new Promise((resolve) => {
		const connection = connect(socket);
		connection.once("connect", () => {
			connection.destroy();
			resolve(true);
		});
		connection.once("error", (error) => {
			connection.destroy();
			resolve(!NOTHING_LISTENS.has(error.code ?? ""));
		});
	});
}
function seconds(ms) {
	return Math.round(ms / 1e3);
}
//#endregion
//#region src/run.ts
var NODE_MAJOR = 24;
var ANOTHER_VERSION = "It runs another version of Arcue, which can't share reviews with this arcue command.";
/**
* Runs the command line in an environment, which names the data folder and the agent session, and returns its exit
* code: 0 on success, 1 on failure, 2 for a usage error, and 3 when `setup` runs on a Node older than 24.
*/
async function run(args, output, env, cwd = process.cwd(), options = {}) {
	let command;
	try {
		command = parseArgs(args);
	} catch (error) {
		if (!(error instanceof UsageError)) throw error;
		output.err(`${error.message}\n\n${USAGE}`);
		return 2;
	}
	try {
		switch (command.command) {
			case "help":
				output.out(USAGE);
				return 0;
			case "status": return await status(command, env, output, options);
			case "open": return await open(command, env, cwd, output, options.platform ?? process.platform);
			case "inspect": return await inspect(command, env, cwd, output, options.importWorkerEntry ?? bundledImportWorker);
			case "serve": return await serve(command, env, output, options);
			case "mcp": return await mcp(command, env, cwd, options);
			case "stop": return await stopServe(env, output, options);
			case "setup": return setup(output, options.node ?? {
				version: process.versions.node,
				execPath: process.execPath
			});
		}
	} catch (error) {
		output.err(`${error instanceof Error ? error.message : String(error)}\n`);
		return 1;
	}
}
function setup(output, node) {
	if (Number(node.version.split(".")[0]) >= NODE_MAJOR) {
		output.out(`Arcue runs on Node ${node.version} at ${node.execPath}, so there is nothing to set up.\n`);
		return 0;
	}
	output.err(`Arcue needs Node ${NODE_MAJOR} or later, and runs on Node ${node.version} at ${node.execPath}. Install Node ${NODE_MAJOR} or later and put it on PATH; with the agent plugin, run setup through the launcher in the skill's scripts folder.\n`);
	return 3;
}
async function status(command, env, output, options) {
	const userData = userDataDir(env);
	const view = sessionView(env, command.view);
	const cores = await Promise.all(["serve", "desktop"].map((file) => connectToCore(userData, file).then((connection) => ({
		file,
		connection,
		error: null
	}), (error) => ({
		file,
		connection: null,
		error
	}))));
	try {
		const build = cores.some(({ connection }) => connection?.info.build !== void 0) ? await buildOf(options) : null;
		const blocks = [];
		const platform = options.platform ?? process.platform;
		for (const { file, connection, error } of cores) if (connection) blocks.push(await describeCore(connection, file, view, build, platform));
		else if (error !== null) {
			const info = await readBridgeInfo(userData, file);
			output.err(`${doesNotAnswer(info, file)}: ${messageOf(error)}\n`);
		}
		if (blocks.length > 0) output.out(`${blocks.join("\n\n")}\n`);
		else if (cores.every(({ error }) => error === null)) output.out("Arcue is not running.\n");
		return blocks.length > 0 ? 0 : 1;
	} finally {
		for (const { connection } of cores) connection?.close();
	}
}
/** One core's lines in `status`: where it runs, this session's view in a browser, and its assets. */
async function describeCore(connection, file, view, build, platform) {
	const { info } = connection;
	const { assets } = await connection.client.query("asset.list", {});
	const lines = [];
	if (inBrowser(info, file)) {
		lines.push(`Arcue is running in a browser at ${info.url} (process ${info.pid}).`);
		if (info.kind === void 0) lines.push(`It is older than this arcue command: ${stopOlderServe(platform)}, then arcue serve --detach.`);
		else if (!sharesReviews(info)) lines.push(ANOTHER_VERSION);
		else if (otherBuild(info, build)) lines.push(OTHER_BUILD);
		if (view !== null) lines.push(`This session's view: ${viewAddress(info.url, view)}`);
	} else if (info.kind === void 0) lines.push(`An older Arcue app is running (process ${info.pid}).`);
	else {
		lines.push(`The Arcue app is running (process ${info.pid}).`);
		if (!sharesReviews(info)) lines.push(ANOTHER_VERSION);
	}
	if (assets.length === 0) lines.push("No assets are open.");
	else lines.push("Open assets:", ...assets.map((asset) => `  ${asset.assetId}  ${asset.status.padEnd(7)}  ${asset.path}`));
	return lines.join("\n");
}
/** How to stop an older `arcue serve`, which `arcue stop` can't do on Windows. */
function stopOlderServe(platform) {
	return platform === "win32" ? "stop it where it runs" : "run arcue stop";
}
function messageOf(error) {
	return error instanceof Error ? error.message : String(error);
}
async function existingFile(cwd, relative) {
	const given = resolve(cwd, relative);
	if (!(await stat(given).catch(() => null))?.isFile()) throw new Error(`${given} is not a file.`);
	return realpath(given);
}
async function inspect(command, env, cwd, output, importWorkerEntry) {
	const path = await existingFile(cwd, command.path);
	let workerError = null;
	const inspection = await inspectFile(path, {
		importWorkerEntry,
		userData: userDataDir(env),
		onError: (error) => {
			workerError ??= error;
		}
	}).catch((error) => {
		throw workerError ?? error;
	});
	output.out(command.json ? `${JSON.stringify(inspection, null, 2)}\n` : formatInspection(inspection));
	return 0;
}
async function open(command, env, cwd, output, platform) {
	const view = sessionView(env, command.view);
	if (command.move && view === null) throw new Error("--move takes a model into an agent session's view, and no session names one. Give --view <name>.");
	const path = await existingFile(cwd, command.path);
	const { connection, kind } = await connectForOpen(userDataDir(env), view);
	const url = kind === "serve" ? connection.info.url : void 0;
	const at = {
		path,
		...command.clip !== void 0 ? { clip: command.clip } : {},
		...command.frame !== void 0 ? { frame: command.frame } : {}
	};
	try {
		if (view === null) {
			const { assetId } = await connection.client.execute("asset.open", at);
			output.out(`Opened ${path} in Arcue as ${assetId}.\n`);
			return 0;
		}
		const { text, shown } = openedInView(path, await connection.client.execute("asset.openInView", {
			...at,
			view,
			move: command.move ?? false
		}), url ? viewAddress(url, view) : null, url);
		output.out(`${text}\n`);
		return shown ? 0 : 1;
	} catch (error) {
		if (!(error instanceof ArcueError)) throw error;
		if (view !== null && error.code === "unknown-command") throw new Error(olderCore(connection.info, kind, platform));
		if (kind === "serve" && error.code === "disconnected") throw new Error(`Arcue in the browser stopped while opening ${path}. Run arcue serve --detach, then arcue open again.`);
		if (url && error.code === "unavailable") throw new Error(`${error.message} Arcue runs in a browser: open ${url} first.`);
		if (view !== null && error.code === "conflict" && !command.move) throw new Error(`${error.message} Add --move to show it in this session's view instead.`);
		throw error;
	} finally {
		connection.close();
	}
}
/** What `arcue open` says when the running core predates agent sessions' views. */
function olderCore({ url, pid }, kind, platform) {
	const [running, restart] = kind === "serve" ? [`The Arcue at ${url}`, `${stopOlderServe(platform)}, then arcue serve --detach`] : ["The Arcue app", "quit the app and run arcue open again"];
	return `${running} (process ${pid}) is older than this arcue command and cannot show models in a session's view. Restart it: ${restart}.`;
}
/**
* What `arcue open` says about a model it opened for a session's view, and whether a window shows it or will. It names
* the view's address only when the page is not open.
*/
function openedInView(path, { assetId, shown }, address, url) {
	if (shown === "view") return {
		text: `Opened ${path} in this session's view as ${assetId}.`,
		shown: true
	};
	if (shown === "window") return {
		text: url ? `Opened ${path} as ${assetId} in the Arcue page at ${url}, since this session's page is not open. Open ${address} in the built-in browser and keep it open.` : `Opened ${path} in Arcue as ${assetId}.`,
		shown: true
	};
	if (address) return {
		text: `Arcue holds ${path} as ${assetId} until this session's page opens. Open ${address} in the built-in browser and keep it open.`,
		shown: true
	};
	return {
		text: `No Arcue window opened in time to show ${path}. Arcue holds it as ${assetId}; run arcue open again once its window is open.`,
		shown: false
	};
}
/** Runs the MCP server. When the port Arcue in the browser would use is taken, it starts it on another. */
async function mcp(command, env, cwd, options) {
	const detach = async (port) => {
		const lines = [];
		const capture = {
			out: (text) => lines.push(text),
			err: (text) => lines.push(text)
		};
		return await detachServe({
			command: "serve",
			detach: true,
			...port ? { port } : {}
		}, env, capture, options) === 0 ? null : lines.join("").trim();
	};
	const here = startsItself() ? null : new ServeHere({
		userData: userDataDir(env),
		importWorkerEntry: options.importWorkerEntry ?? bundledImportWorker,
		webUi: options.webUi ?? bundledWebUi,
		build: await buildOf(options) ?? void 0,
		onError: (error) => process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`),
		onStopped: (message) => process.stderr.write(`${message}\n`)
	});
	const startServe = async () => {
		if (here) return here.start();
		let failure = await detach();
		if (failure?.includes(" is in use.")) failure = await detach(await anyFreePort());
		if (failure !== null) throw new Error(failure);
	};
	const { bundledCardPage, bundledViewPage, serveMcp } = await import("./arcue-D27dGPBc.js");
	const page = (path, name) => readFile(path, "utf8").catch((error) => {
		if (!isMissing(error)) throw error;
		throw new Error(`Arcue's ${name} page is missing from ${path}. Reinstall Arcue.`);
	});
	const served = serveMcp({
		userData: userDataDir(env),
		view: sessionView(env, command.view),
		cwd,
		importWorkerEntry: options.importWorkerEntry ?? bundledImportWorker,
		startServe,
		version: await buildOf(options) ?? "dev",
		cardHtml: () => page(bundledCardPage, "card"),
		viewHtml: () => page(bundledViewPage, "view")
	});
	if (!here) {
		await served;
		return 0;
	}
	const signals = stopSignal(options.stop);
	try {
		await Promise.race([served, signals.stopped]);
	} finally {
		signals.dispose();
		options.onStopping?.();
		await here.close();
	}
	return 0;
}
function isMissing(error) {
	return error instanceof Error && "code" in error && error.code === "ENOENT";
}
function anyFreePort() {
	return new Promise((resolvePromise, reject) => {
		const server = createServer();
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			server.close(() => typeof address === "object" && address ? resolvePromise(address.port) : reject(/* @__PURE__ */ new Error("No port is free.")));
		});
	});
}
async function serve(command, env, output, options) {
	if (command.detach) return detachServe(command, env, output, options);
	const view = sessionView(env);
	const build = await buildOf(options);
	const server = await startServer({
		userData: userDataDir(env),
		importWorkerEntry: options.importWorkerEntry ?? bundledImportWorker,
		webUi: options.webUi ?? bundledWebUi,
		port: command.port ?? 4530,
		idleStopMs: command.idleStopMs,
		build: build ?? void 0,
		onError: (error) => output.err(`${error instanceof Error ? error.message : String(error)}\n`),
		onWaitingForWindow: (url) => output.err(`Waiting for a browser to open ${url}.\n`)
	});
	output.out(`Arcue runs at ${server.url}. Open it in a browser; agents' "arcue open" shows their models there.\n`);
	if (view !== null) output.out(`This session's view: ${viewAddress(server.url, view)}\n`);
	const signals = stopSignal(options.stop);
	const stop = await Promise.race([signals.stopped.then(() => null), server.stopped]);
	signals.dispose();
	options.onStopping?.();
	if (stop) output.out(`${stop.message}\n`);
	await server.close(SERVE_STOPPED_CLOSE_CODE);
	return 0;
}
/** The stop a caller gives, or else one that resolves when the process receives SIGINT, SIGTERM or SIGHUP. */
function stopSignal(given) {
	if (given) return {
		stopped: given,
		dispose: () => void 0
	};
	const signals = [
		"SIGINT",
		"SIGTERM",
		"SIGHUP"
	];
	const { promise, resolve: stopped } = Promise.withResolvers();
	const dispose = () => {
		for (const signal of signals) process.off(signal, stop);
	};
	const stop = () => {
		dispose();
		stopped();
	};
	for (const signal of signals) process.on(signal, stop);
	return {
		stopped: promise,
		dispose
	};
}
//#endregion
//#region src/bin.ts
exitAfterRun(await run(process.argv.slice(2), {
	out: (text) => process.stdout.write(text),
	err: (text) => process.stderr.write(text)
}, process.env, process.cwd(), { onStopping: () => armHardExit(3e4) }));
//#endregion
export {};
