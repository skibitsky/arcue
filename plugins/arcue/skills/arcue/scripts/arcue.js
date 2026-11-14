#!/usr/bin/env node
import { At as messageChannel, C as viewAddress, Dt as MAX_FRAME_BYTES, Et as sharesReviews, Nt as ArcueError, gt as LOCAL_PAGE_OWNER, kt as framedEndpoint, n as binaryFrameCodec, vt as SERVE_STOPPED_CLOSE_CODE, w as viewNameSchema } from "./arcue-CacpvMqY.js";
import { C as readBridgeInfo, S as connectToCore, _ as recordLastCore, a as formatInspection, b as isRunning, c as WindowPresence, d as startNodeImportWorker, f as fromNativePath, g as claimStart, h as CoreRunningError, i as bundledImportWorker, l as NodePlatform, m as startBridgeServer, n as doesNotAnswer, o as inspectFile, p as ArcueCore, r as inBrowser, s as userDataDir, t as connectForOpen, u as systemClock, v as waitForStarts, w as runningCore, x as blockingCore, y as readLastCore } from "./arcue-v_YL1v9P.js";
import { createRequire } from "node:module";
import { mkdir, readFile, realpath, rename, stat } from "node:fs/promises";
import { connect, createServer } from "node:net";
import { dirname, extname, join, parse, resolve, sep } from "node:path";
import { createHash } from "node:crypto";
import { userInfo } from "node:os";
import { closeSync, createReadStream, fstatSync, openSync } from "node:fs";
import { setTimeout as setTimeout$1 } from "node:timers/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createServer as createServer$1 } from "node:http";
//#region \0rolldown/runtime.js
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esmMin = (fn, res, err) => () => {
	if (err) throw err[0];
	try {
		return fn && (res = fn(fn = 0)), res;
	} catch (e) {
		throw err = [e], e;
	}
};
var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod), cb = null), mod.exports);
var __exportAll = (all, no_symbols) => {
	let target = {};
	for (var name in all) __defProp(target, name, {
		get: all[name],
		enumerable: true
	});
	if (!no_symbols) __defProp(target, Symbol.toStringTag, { value: "Module" });
	return target;
};
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));
var __toCommonJS = (mod) => __hasOwnProp.call(mod, "module.exports") ? mod["module.exports"] : __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __require = /* #__PURE__ */ (() => createRequire(import.meta.url))();
//#endregion
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
	const port = command.port ?? await freePort(portOf((await readLastCore(userData))?.serveUrl)) ?? 4530;
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
//#region ../../node_modules/.pnpm/ws@8.22.0/node_modules/ws/lib/constants.js
var require_constants = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var BINARY_TYPES = [
		"nodebuffer",
		"arraybuffer",
		"fragments"
	];
	var hasBlob = typeof Blob !== "undefined";
	if (hasBlob) BINARY_TYPES.push("blob");
	module.exports = {
		BINARY_TYPES,
		CLOSE_TIMEOUT: 3e4,
		EMPTY_BUFFER: Buffer.alloc(0),
		GUID: "258EAFA5-E914-47DA-95CA-C5AB0DC85B11",
		hasBlob,
		kForOnEventAttribute: Symbol("kIsForOnEventAttribute"),
		kListener: Symbol("kListener"),
		kStatusCode: Symbol("status-code"),
		kWebSocket: Symbol("websocket"),
		NOOP: () => {}
	};
}));
//#endregion
//#region __vite-optional-peer-dep:bufferutil:ws
var __vite_optional_peer_dep_bufferutil_ws_exports = /* @__PURE__ */ __exportAll({ default: () => __vite_optional_peer_dep_bufferutil_ws_default });
var __vite_optional_peer_dep_bufferutil_ws_default;
var init___vite_optional_peer_dep_bufferutil_ws = __esmMin((() => {
	__vite_optional_peer_dep_bufferutil_ws_default = {};
	throw new Error(`Could not resolve "bufferutil" imported by "ws". Is it installed?`);
}));
//#endregion
//#region ../../node_modules/.pnpm/ws@8.22.0/node_modules/ws/lib/buffer-util.js
var require_buffer_util = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var { EMPTY_BUFFER } = require_constants();
	var FastBuffer = Buffer[Symbol.species];
	/**
	* Merges an array of buffers into a new buffer.
	*
	* @param {Buffer[]} list The array of buffers to concat
	* @param {Number} totalLength The total length of buffers in the list
	* @return {Buffer} The resulting buffer
	* @public
	*/
	function concat(list, totalLength) {
		if (list.length === 0) return EMPTY_BUFFER;
		if (list.length === 1) return list[0];
		const target = Buffer.allocUnsafe(totalLength);
		let offset = 0;
		for (let i = 0; i < list.length; i++) {
			const buf = list[i];
			target.set(buf, offset);
			offset += buf.length;
		}
		if (offset < totalLength) return new FastBuffer(target.buffer, target.byteOffset, offset);
		return target;
	}
	/**
	* Masks a buffer using the given mask.
	*
	* @param {Buffer} source The buffer to mask
	* @param {Buffer} mask The mask to use
	* @param {Buffer} output The buffer where to store the result
	* @param {Number} offset The offset at which to start writing
	* @param {Number} length The number of bytes to mask.
	* @public
	*/
	function _mask(source, mask, output, offset, length) {
		for (let i = 0; i < length; i++) output[offset + i] = source[i] ^ mask[i & 3];
	}
	/**
	* Unmasks a buffer using the given mask.
	*
	* @param {Buffer} buffer The buffer to unmask
	* @param {Buffer} mask The mask to use
	* @public
	*/
	function _unmask(buffer, mask) {
		for (let i = 0; i < buffer.length; i++) buffer[i] ^= mask[i & 3];
	}
	/**
	* Converts a buffer to an `ArrayBuffer`.
	*
	* @param {Buffer} buf The buffer to convert
	* @return {ArrayBuffer} Converted buffer
	* @public
	*/
	function toArrayBuffer(buf) {
		if (buf.length === buf.buffer.byteLength) return buf.buffer;
		return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
	}
	/**
	* Converts `data` to a `Buffer`.
	*
	* @param {*} data The data to convert
	* @return {Buffer} The buffer
	* @throws {TypeError}
	* @public
	*/
	function toBuffer(data) {
		toBuffer.readOnly = true;
		if (Buffer.isBuffer(data)) return data;
		let buf;
		if (data instanceof ArrayBuffer) buf = new FastBuffer(data);
		else if (ArrayBuffer.isView(data)) buf = new FastBuffer(data.buffer, data.byteOffset, data.byteLength);
		else {
			buf = Buffer.from(data);
			toBuffer.readOnly = false;
		}
		return buf;
	}
	module.exports = {
		concat,
		mask: _mask,
		toArrayBuffer,
		toBuffer,
		unmask: _unmask
	};
	/* istanbul ignore else  */
	if (!process.env.WS_NO_BUFFER_UTIL) try {
		const bufferUtil = (init___vite_optional_peer_dep_bufferutil_ws(), __toCommonJS(__vite_optional_peer_dep_bufferutil_ws_exports));
		module.exports.mask = function(source, mask, output, offset, length) {
			if (length < 48) _mask(source, mask, output, offset, length);
			else bufferUtil.mask(source, mask, output, offset, length);
		};
		module.exports.unmask = function(buffer, mask) {
			if (buffer.length < 32) _unmask(buffer, mask);
			else bufferUtil.unmask(buffer, mask);
		};
	} catch (e) {}
}));
//#endregion
//#region ../../node_modules/.pnpm/ws@8.22.0/node_modules/ws/lib/limiter.js
var require_limiter = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var kDone = Symbol("kDone");
	var kRun = Symbol("kRun");
	/**
	* A very simple job queue with adjustable concurrency. Adapted from
	* https://github.com/STRML/async-limiter
	*/
	var Limiter = class {
		/**
		* Creates a new `Limiter`.
		*
		* @param {Number} [concurrency=Infinity] The maximum number of jobs allowed
		*     to run concurrently
		*/
		constructor(concurrency) {
			this[kDone] = () => {
				this.pending--;
				this[kRun]();
			};
			this.concurrency = concurrency || Infinity;
			this.jobs = [];
			this.pending = 0;
		}
		/**
		* Adds a job to the queue.
		*
		* @param {Function} job The job to run
		* @public
		*/
		add(job) {
			this.jobs.push(job);
			this[kRun]();
		}
		/**
		* Removes a job from the queue and runs it if possible.
		*
		* @private
		*/
		[kRun]() {
			if (this.pending === this.concurrency) return;
			if (this.jobs.length) {
				const job = this.jobs.shift();
				this.pending++;
				job(this[kDone]);
			}
		}
	};
	module.exports = Limiter;
}));
//#endregion
//#region ../../node_modules/.pnpm/ws@8.22.0/node_modules/ws/lib/permessage-deflate.js
var require_permessage_deflate = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var zlib = __require("zlib");
	var bufferUtil = require_buffer_util();
	var Limiter = require_limiter();
	var { kStatusCode } = require_constants();
	var FastBuffer = Buffer[Symbol.species];
	var TRAILER = Buffer.from([
		0,
		0,
		255,
		255
	]);
	var kPerMessageDeflate = Symbol("permessage-deflate");
	var kTotalLength = Symbol("total-length");
	var kCallback = Symbol("callback");
	var kBuffers = Symbol("buffers");
	var kError = Symbol("error");
	var zlibLimiter;
	/**
	* permessage-deflate implementation.
	*/
	var PerMessageDeflate = class {
		/**
		* Creates a PerMessageDeflate instance.
		*
		* @param {Object} [options] Configuration options
		* @param {(Boolean|Number)} [options.clientMaxWindowBits] Advertise support
		*     for, or request, a custom client window size
		* @param {Boolean} [options.clientNoContextTakeover=false] Advertise/
		*     acknowledge disabling of client context takeover
		* @param {Number} [options.concurrencyLimit=10] The number of concurrent
		*     calls to zlib
		* @param {Boolean} [options.isServer=false] Create the instance in either
		*     server or client mode
		* @param {Number} [options.maxPayload=0] The maximum allowed message length
		* @param {(Boolean|Number)} [options.serverMaxWindowBits] Request/confirm the
		*     use of a custom server window size
		* @param {Boolean} [options.serverNoContextTakeover=false] Request/accept
		*     disabling of server context takeover
		* @param {Number} [options.threshold=1024] Size (in bytes) below which
		*     messages should not be compressed if context takeover is disabled
		* @param {Object} [options.zlibDeflateOptions] Options to pass to zlib on
		*     deflate
		* @param {Object} [options.zlibInflateOptions] Options to pass to zlib on
		*     inflate
		*/
		constructor(options) {
			this._options = options || {};
			this._threshold = this._options.threshold !== void 0 ? this._options.threshold : 1024;
			this._maxPayload = this._options.maxPayload | 0;
			this._isServer = !!this._options.isServer;
			this._deflate = null;
			this._inflate = null;
			this.params = null;
			if (!zlibLimiter) zlibLimiter = new Limiter(this._options.concurrencyLimit !== void 0 ? this._options.concurrencyLimit : 10);
		}
		/**
		* @type {String}
		*/
		static get extensionName() {
			return "permessage-deflate";
		}
		/**
		* Create an extension negotiation offer.
		*
		* @return {Object} Extension parameters
		* @public
		*/
		offer() {
			const params = {};
			if (this._options.serverNoContextTakeover) params.server_no_context_takeover = true;
			if (this._options.clientNoContextTakeover) params.client_no_context_takeover = true;
			if (this._options.serverMaxWindowBits) params.server_max_window_bits = this._options.serverMaxWindowBits;
			if (this._options.clientMaxWindowBits) params.client_max_window_bits = this._options.clientMaxWindowBits;
			else if (this._options.clientMaxWindowBits == null) params.client_max_window_bits = true;
			return params;
		}
		/**
		* Accept an extension negotiation offer/response.
		*
		* @param {Array} configurations The extension negotiation offers/reponse
		* @return {Object} Accepted configuration
		* @public
		*/
		accept(configurations) {
			configurations = this.normalizeParams(configurations);
			this.params = this._isServer ? this.acceptAsServer(configurations) : this.acceptAsClient(configurations);
			return this.params;
		}
		/**
		* Releases all resources used by the extension.
		*
		* @public
		*/
		cleanup() {
			if (this._inflate) {
				this._inflate.close();
				this._inflate = null;
			}
			if (this._deflate) {
				const callback = this._deflate[kCallback];
				this._deflate.close();
				this._deflate = null;
				if (callback) callback(/* @__PURE__ */ new Error("The deflate stream was closed while data was being processed"));
			}
		}
		/**
		*  Accept an extension negotiation offer.
		*
		* @param {Array} offers The extension negotiation offers
		* @return {Object} Accepted configuration
		* @private
		*/
		acceptAsServer(offers) {
			const opts = this._options;
			const accepted = offers.find((params) => {
				if (opts.serverNoContextTakeover === false && params.server_no_context_takeover || params.server_max_window_bits && (opts.serverMaxWindowBits === false || typeof opts.serverMaxWindowBits === "number" && opts.serverMaxWindowBits > params.server_max_window_bits) || typeof opts.clientMaxWindowBits === "number" && (typeof params.client_max_window_bits === "number" ? opts.clientMaxWindowBits > params.client_max_window_bits : !params.client_max_window_bits)) return false;
				return true;
			});
			if (!accepted) throw new Error("None of the extension offers can be accepted");
			if (opts.serverNoContextTakeover) accepted.server_no_context_takeover = true;
			if (opts.clientNoContextTakeover) accepted.client_no_context_takeover = true;
			if (typeof opts.serverMaxWindowBits === "number") accepted.server_max_window_bits = opts.serverMaxWindowBits;
			if (typeof opts.clientMaxWindowBits === "number") accepted.client_max_window_bits = opts.clientMaxWindowBits;
			else if (accepted.client_max_window_bits === true || opts.clientMaxWindowBits === false) delete accepted.client_max_window_bits;
			return accepted;
		}
		/**
		* Accept the extension negotiation response.
		*
		* @param {Array} response The extension negotiation response
		* @return {Object} Accepted configuration
		* @private
		*/
		acceptAsClient(response) {
			const params = response[0];
			if (this._options.clientNoContextTakeover === false && params.client_no_context_takeover) throw new Error("Unexpected parameter \"client_no_context_takeover\"");
			if (!params.client_max_window_bits) {
				if (typeof this._options.clientMaxWindowBits === "number") params.client_max_window_bits = this._options.clientMaxWindowBits;
			} else if (this._options.clientMaxWindowBits === false || typeof this._options.clientMaxWindowBits === "number" && params.client_max_window_bits > this._options.clientMaxWindowBits) throw new Error("Unexpected or invalid parameter \"client_max_window_bits\"");
			return params;
		}
		/**
		* Normalize parameters.
		*
		* @param {Array} configurations The extension negotiation offers/reponse
		* @return {Array} The offers/response with normalized parameters
		* @private
		*/
		normalizeParams(configurations) {
			configurations.forEach((params) => {
				Object.keys(params).forEach((key) => {
					let value = params[key];
					if (value.length > 1) throw new Error(`Parameter "${key}" must have only a single value`);
					value = value[0];
					if (key === "client_max_window_bits") {
						if (value !== true) {
							const num = +value;
							if (!Number.isInteger(num) || num < 8 || num > 15) throw new TypeError(`Invalid value for parameter "${key}": ${value}`);
							value = num;
						} else if (!this._isServer) throw new TypeError(`Invalid value for parameter "${key}": ${value}`);
					} else if (key === "server_max_window_bits") {
						const num = +value;
						if (!Number.isInteger(num) || num < 8 || num > 15) throw new TypeError(`Invalid value for parameter "${key}": ${value}`);
						value = num;
					} else if (key === "client_no_context_takeover" || key === "server_no_context_takeover") {
						if (value !== true) throw new TypeError(`Invalid value for parameter "${key}": ${value}`);
					} else throw new Error(`Unknown parameter "${key}"`);
					params[key] = value;
				});
			});
			return configurations;
		}
		/**
		* Decompress data. Concurrency limited.
		*
		* @param {Buffer} data Compressed data
		* @param {Boolean} fin Specifies whether or not this is the last fragment
		* @param {Function} callback Callback
		* @public
		*/
		decompress(data, fin, callback) {
			zlibLimiter.add((done) => {
				this._decompress(data, fin, (err, result) => {
					done();
					callback(err, result);
				});
			});
		}
		/**
		* Compress data. Concurrency limited.
		*
		* @param {(Buffer|String)} data Data to compress
		* @param {Boolean} fin Specifies whether or not this is the last fragment
		* @param {Function} callback Callback
		* @public
		*/
		compress(data, fin, callback) {
			zlibLimiter.add((done) => {
				this._compress(data, fin, (err, result) => {
					done();
					callback(err, result);
				});
			});
		}
		/**
		* Decompress data.
		*
		* @param {Buffer} data Compressed data
		* @param {Boolean} fin Specifies whether or not this is the last fragment
		* @param {Function} callback Callback
		* @private
		*/
		_decompress(data, fin, callback) {
			const endpoint = this._isServer ? "client" : "server";
			if (!this._inflate) {
				const key = `${endpoint}_max_window_bits`;
				const windowBits = typeof this.params[key] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
				this._inflate = zlib.createInflateRaw({
					...this._options.zlibInflateOptions,
					windowBits
				});
				this._inflate[kPerMessageDeflate] = this;
				this._inflate[kTotalLength] = 0;
				this._inflate[kBuffers] = [];
				this._inflate.on("error", inflateOnError);
				this._inflate.on("data", inflateOnData);
			}
			this._inflate[kCallback] = callback;
			this._inflate.write(data);
			if (fin) this._inflate.write(TRAILER);
			this._inflate.flush(() => {
				const err = this._inflate[kError];
				if (err) {
					this._inflate.close();
					this._inflate = null;
					callback(err);
					return;
				}
				const data = bufferUtil.concat(this._inflate[kBuffers], this._inflate[kTotalLength]);
				if (this._inflate._readableState.endEmitted) {
					this._inflate.close();
					this._inflate = null;
				} else {
					this._inflate[kTotalLength] = 0;
					this._inflate[kBuffers] = [];
					if (fin && this.params[`${endpoint}_no_context_takeover`]) this._inflate.reset();
				}
				callback(null, data);
			});
		}
		/**
		* Compress data.
		*
		* @param {(Buffer|String)} data Data to compress
		* @param {Boolean} fin Specifies whether or not this is the last fragment
		* @param {Function} callback Callback
		* @private
		*/
		_compress(data, fin, callback) {
			const endpoint = this._isServer ? "server" : "client";
			if (!this._deflate) {
				const key = `${endpoint}_max_window_bits`;
				const windowBits = typeof this.params[key] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
				this._deflate = zlib.createDeflateRaw({
					...this._options.zlibDeflateOptions,
					windowBits
				});
				this._deflate[kTotalLength] = 0;
				this._deflate[kBuffers] = [];
				this._deflate.on("data", deflateOnData);
			}
			this._deflate[kCallback] = callback;
			this._deflate.write(data);
			this._deflate.flush(zlib.Z_SYNC_FLUSH, () => {
				if (!this._deflate) return;
				let data = bufferUtil.concat(this._deflate[kBuffers], this._deflate[kTotalLength]);
				if (fin) data = new FastBuffer(data.buffer, data.byteOffset, data.length - 4);
				this._deflate[kCallback] = null;
				this._deflate[kTotalLength] = 0;
				this._deflate[kBuffers] = [];
				if (fin && this.params[`${endpoint}_no_context_takeover`]) this._deflate.reset();
				callback(null, data);
			});
		}
	};
	module.exports = PerMessageDeflate;
	/**
	* The listener of the `zlib.DeflateRaw` stream `'data'` event.
	*
	* @param {Buffer} chunk A chunk of data
	* @private
	*/
	function deflateOnData(chunk) {
		this[kBuffers].push(chunk);
		this[kTotalLength] += chunk.length;
	}
	/**
	* The listener of the `zlib.InflateRaw` stream `'data'` event.
	*
	* @param {Buffer} chunk A chunk of data
	* @private
	*/
	function inflateOnData(chunk) {
		this[kTotalLength] += chunk.length;
		if (this[kPerMessageDeflate]._maxPayload < 1 || this[kTotalLength] <= this[kPerMessageDeflate]._maxPayload) {
			this[kBuffers].push(chunk);
			return;
		}
		this[kError] = /* @__PURE__ */ new RangeError("Max payload size exceeded");
		this[kError].code = "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH";
		this[kError][kStatusCode] = 1009;
		this.removeListener("data", inflateOnData);
		this.reset();
	}
	/**
	* The listener of the `zlib.InflateRaw` stream `'error'` event.
	*
	* @param {Error} err The emitted error
	* @private
	*/
	function inflateOnError(err) {
		this[kPerMessageDeflate]._inflate = null;
		if (this[kError]) {
			this[kCallback](this[kError]);
			return;
		}
		err[kStatusCode] = 1007;
		this[kCallback](err);
	}
}));
//#endregion
//#region __vite-optional-peer-dep:utf-8-validate:ws
var __vite_optional_peer_dep_utf_8_validate_ws_exports = /* @__PURE__ */ __exportAll({ default: () => __vite_optional_peer_dep_utf_8_validate_ws_default });
var __vite_optional_peer_dep_utf_8_validate_ws_default;
var init___vite_optional_peer_dep_utf_8_validate_ws = __esmMin((() => {
	__vite_optional_peer_dep_utf_8_validate_ws_default = {};
	throw new Error(`Could not resolve "utf-8-validate" imported by "ws". Is it installed?`);
}));
//#endregion
//#region ../../node_modules/.pnpm/ws@8.22.0/node_modules/ws/lib/validation.js
var require_validation = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var { isUtf8 } = __require("buffer");
	var { hasBlob } = require_constants();
	var tokenChars = [
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		1,
		0,
		1,
		1,
		1,
		1,
		1,
		0,
		0,
		1,
		1,
		0,
		1,
		1,
		0,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		0,
		0,
		0,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		0,
		1,
		0,
		1,
		0
	];
	/**
	* Checks if a status code is allowed in a close frame.
	*
	* @param {Number} code The status code
	* @return {Boolean} `true` if the status code is valid, else `false`
	* @public
	*/
	function isValidStatusCode(code) {
		return code >= 1e3 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006 || code >= 3e3 && code <= 4999;
	}
	/**
	* Checks if a given buffer contains only correct UTF-8.
	* Ported from https://www.cl.cam.ac.uk/%7Emgk25/ucs/utf8_check.c by
	* Markus Kuhn.
	*
	* @param {Buffer} buf The buffer to check
	* @return {Boolean} `true` if `buf` contains only correct UTF-8, else `false`
	* @public
	*/
	function _isValidUTF8(buf) {
		const len = buf.length;
		let i = 0;
		while (i < len) if ((buf[i] & 128) === 0) i++;
		else if ((buf[i] & 224) === 192) {
			if (i + 1 === len || (buf[i + 1] & 192) !== 128 || (buf[i] & 254) === 192) return false;
			i += 2;
		} else if ((buf[i] & 240) === 224) {
			if (i + 2 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || buf[i] === 224 && (buf[i + 1] & 224) === 128 || buf[i] === 237 && (buf[i + 1] & 224) === 160) return false;
			i += 3;
		} else if ((buf[i] & 248) === 240) {
			if (i + 3 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || (buf[i + 3] & 192) !== 128 || buf[i] === 240 && (buf[i + 1] & 240) === 128 || buf[i] === 244 && buf[i + 1] > 143 || buf[i] > 244) return false;
			i += 4;
		} else return false;
		return true;
	}
	/**
	* Determines whether a value is a `Blob`.
	*
	* @param {*} value The value to be tested
	* @return {Boolean} `true` if `value` is a `Blob`, else `false`
	* @private
	*/
	function isBlob(value) {
		return hasBlob && typeof value === "object" && typeof value.arrayBuffer === "function" && typeof value.type === "string" && typeof value.stream === "function" && (value[Symbol.toStringTag] === "Blob" || value[Symbol.toStringTag] === "File");
	}
	module.exports = {
		isBlob,
		isValidStatusCode,
		isValidUTF8: _isValidUTF8,
		tokenChars
	};
	if (isUtf8) module.exports.isValidUTF8 = function(buf) {
		return buf.length < 24 ? _isValidUTF8(buf) : isUtf8(buf);
	};
	else if (!process.env.WS_NO_UTF_8_VALIDATE) try {
		const isValidUTF8 = (init___vite_optional_peer_dep_utf_8_validate_ws(), __toCommonJS(__vite_optional_peer_dep_utf_8_validate_ws_exports));
		module.exports.isValidUTF8 = function(buf) {
			return buf.length < 32 ? _isValidUTF8(buf) : isValidUTF8(buf);
		};
	} catch (e) {}
}));
//#endregion
//#region ../../node_modules/.pnpm/ws@8.22.0/node_modules/ws/lib/receiver.js
var require_receiver = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var { Writable } = __require("stream");
	var PerMessageDeflate = require_permessage_deflate();
	var { BINARY_TYPES, EMPTY_BUFFER, kStatusCode, kWebSocket } = require_constants();
	var { concat, toArrayBuffer, unmask } = require_buffer_util();
	var { isValidStatusCode, isValidUTF8 } = require_validation();
	var FastBuffer = Buffer[Symbol.species];
	var GET_INFO = 0;
	var GET_PAYLOAD_LENGTH_16 = 1;
	var GET_PAYLOAD_LENGTH_64 = 2;
	var GET_MASK = 3;
	var GET_DATA = 4;
	var INFLATING = 5;
	var DEFER_EVENT = 6;
	/**
	* HyBi Receiver implementation.
	*
	* @extends Writable
	*/
	var Receiver = class extends Writable {
		/**
		* Creates a Receiver instance.
		*
		* @param {Object} [options] Options object
		* @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
		*     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
		*     multiple times in the same tick
		* @param {String} [options.binaryType=nodebuffer] The type for binary data
		* @param {Object} [options.extensions] An object containing the negotiated
		*     extensions
		* @param {Boolean} [options.isServer=false] Specifies whether to operate in
		*     client or server mode
		* @param {Number} [options.maxBufferedChunks=0] The maximum number of
		*     buffered data chunks
		* @param {Number} [options.maxFragments=0] The maximum number of message
		*     fragments
		* @param {Number} [options.maxPayload=0] The maximum allowed message length
		* @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
		*     not to skip UTF-8 validation for text and close messages
		*/
		constructor(options = {}) {
			super();
			this._allowSynchronousEvents = options.allowSynchronousEvents !== void 0 ? options.allowSynchronousEvents : true;
			this._binaryType = options.binaryType || BINARY_TYPES[0];
			this._extensions = options.extensions || {};
			this._isServer = !!options.isServer;
			this._maxBufferedChunks = options.maxBufferedChunks | 0;
			this._maxFragments = options.maxFragments | 0;
			this._maxPayload = options.maxPayload | 0;
			this._skipUTF8Validation = !!options.skipUTF8Validation;
			this[kWebSocket] = void 0;
			this._bufferedBytes = 0;
			this._buffers = [];
			this._compressed = false;
			this._payloadLength = 0;
			this._mask = void 0;
			this._fragmented = 0;
			this._masked = false;
			this._fin = false;
			this._opcode = 0;
			this._totalPayloadLength = 0;
			this._messageLength = 0;
			this._numFragments = 0;
			this._fragments = [];
			this._errored = false;
			this._loop = false;
			this._state = GET_INFO;
		}
		/**
		* Implements `Writable.prototype._write()`.
		*
		* @param {Buffer} chunk The chunk of data to write
		* @param {String} encoding The character encoding of `chunk`
		* @param {Function} cb Callback
		* @private
		*/
		_write(chunk, encoding, cb) {
			if (this._opcode === 8 && this._state == GET_INFO) return cb();
			if (this._maxBufferedChunks > 0 && this._buffers.length >= this._maxBufferedChunks) {
				cb(this.createError(RangeError, "Too many buffered chunks", false, 1008, "WS_ERR_TOO_MANY_BUFFERED_PARTS"));
				return;
			}
			this._bufferedBytes += chunk.length;
			this._buffers.push(chunk);
			this.startLoop(cb);
		}
		/**
		* Consumes `n` bytes from the buffered data.
		*
		* @param {Number} n The number of bytes to consume
		* @return {Buffer} The consumed bytes
		* @private
		*/
		consume(n) {
			this._bufferedBytes -= n;
			if (n === this._buffers[0].length) return this._buffers.shift();
			if (n < this._buffers[0].length) {
				const buf = this._buffers[0];
				this._buffers[0] = new FastBuffer(buf.buffer, buf.byteOffset + n, buf.length - n);
				return new FastBuffer(buf.buffer, buf.byteOffset, n);
			}
			const dst = Buffer.allocUnsafe(n);
			do {
				const buf = this._buffers[0];
				const offset = dst.length - n;
				if (n >= buf.length) dst.set(this._buffers.shift(), offset);
				else {
					dst.set(new Uint8Array(buf.buffer, buf.byteOffset, n), offset);
					this._buffers[0] = new FastBuffer(buf.buffer, buf.byteOffset + n, buf.length - n);
				}
				n -= buf.length;
			} while (n > 0);
			return dst;
		}
		/**
		* Starts the parsing loop.
		*
		* @param {Function} cb Callback
		* @private
		*/
		startLoop(cb) {
			this._loop = true;
			do
				switch (this._state) {
					case GET_INFO:
						this.getInfo(cb);
						break;
					case GET_PAYLOAD_LENGTH_16:
						this.getPayloadLength16(cb);
						break;
					case GET_PAYLOAD_LENGTH_64:
						this.getPayloadLength64(cb);
						break;
					case GET_MASK:
						this.getMask();
						break;
					case GET_DATA:
						this.getData(cb);
						break;
					case INFLATING:
					case DEFER_EVENT:
						this._loop = false;
						return;
				}
			while (this._loop);
			if (!this._errored) cb();
		}
		/**
		* Reads the first two bytes of a frame.
		*
		* @param {Function} cb Callback
		* @private
		*/
		getInfo(cb) {
			if (this._bufferedBytes < 2) {
				this._loop = false;
				return;
			}
			const buf = this.consume(2);
			if ((buf[0] & 48) !== 0) {
				cb(this.createError(RangeError, "RSV2 and RSV3 must be clear", true, 1002, "WS_ERR_UNEXPECTED_RSV_2_3"));
				return;
			}
			const compressed = (buf[0] & 64) === 64;
			if (compressed && !this._extensions[PerMessageDeflate.extensionName]) {
				cb(this.createError(RangeError, "RSV1 must be clear", true, 1002, "WS_ERR_UNEXPECTED_RSV_1"));
				return;
			}
			this._fin = (buf[0] & 128) === 128;
			this._opcode = buf[0] & 15;
			this._payloadLength = buf[1] & 127;
			if (this._opcode === 0) {
				if (compressed) {
					cb(this.createError(RangeError, "RSV1 must be clear", true, 1002, "WS_ERR_UNEXPECTED_RSV_1"));
					return;
				}
				if (!this._fragmented) {
					cb(this.createError(RangeError, "invalid opcode 0", true, 1002, "WS_ERR_INVALID_OPCODE"));
					return;
				}
				this._opcode = this._fragmented;
			} else if (this._opcode === 1 || this._opcode === 2) {
				if (this._fragmented) {
					cb(this.createError(RangeError, `invalid opcode ${this._opcode}`, true, 1002, "WS_ERR_INVALID_OPCODE"));
					return;
				}
				this._compressed = compressed;
			} else if (this._opcode > 7 && this._opcode < 11) {
				if (!this._fin) {
					cb(this.createError(RangeError, "FIN must be set", true, 1002, "WS_ERR_EXPECTED_FIN"));
					return;
				}
				if (compressed) {
					cb(this.createError(RangeError, "RSV1 must be clear", true, 1002, "WS_ERR_UNEXPECTED_RSV_1"));
					return;
				}
				if (this._payloadLength > 125 || this._opcode === 8 && this._payloadLength === 1) {
					cb(this.createError(RangeError, `invalid payload length ${this._payloadLength}`, true, 1002, "WS_ERR_INVALID_CONTROL_PAYLOAD_LENGTH"));
					return;
				}
			} else {
				cb(this.createError(RangeError, `invalid opcode ${this._opcode}`, true, 1002, "WS_ERR_INVALID_OPCODE"));
				return;
			}
			if (!this._fin && !this._fragmented) this._fragmented = this._opcode;
			this._masked = (buf[1] & 128) === 128;
			if (this._isServer) {
				if (!this._masked) {
					cb(this.createError(RangeError, "MASK must be set", true, 1002, "WS_ERR_EXPECTED_MASK"));
					return;
				}
			} else if (this._masked) {
				cb(this.createError(RangeError, "MASK must be clear", true, 1002, "WS_ERR_UNEXPECTED_MASK"));
				return;
			}
			if (this._payloadLength === 126) this._state = GET_PAYLOAD_LENGTH_16;
			else if (this._payloadLength === 127) this._state = GET_PAYLOAD_LENGTH_64;
			else this.haveLength(cb);
		}
		/**
		* Gets extended payload length (7+16).
		*
		* @param {Function} cb Callback
		* @private
		*/
		getPayloadLength16(cb) {
			if (this._bufferedBytes < 2) {
				this._loop = false;
				return;
			}
			this._payloadLength = this.consume(2).readUInt16BE(0);
			this.haveLength(cb);
		}
		/**
		* Gets extended payload length (7+64).
		*
		* @param {Function} cb Callback
		* @private
		*/
		getPayloadLength64(cb) {
			if (this._bufferedBytes < 8) {
				this._loop = false;
				return;
			}
			const buf = this.consume(8);
			const num = buf.readUInt32BE(0);
			if (num > Math.pow(2, 21) - 1) {
				cb(this.createError(RangeError, "Unsupported WebSocket frame: payload length > 2^53 - 1", false, 1009, "WS_ERR_UNSUPPORTED_DATA_PAYLOAD_LENGTH"));
				return;
			}
			this._payloadLength = num * Math.pow(2, 32) + buf.readUInt32BE(4);
			this.haveLength(cb);
		}
		/**
		* Payload length has been read.
		*
		* @param {Function} cb Callback
		* @private
		*/
		haveLength(cb) {
			if (this._payloadLength && this._opcode < 8) {
				this._totalPayloadLength += this._payloadLength;
				if (this._totalPayloadLength > this._maxPayload && this._maxPayload > 0) {
					cb(this.createError(RangeError, "Max payload size exceeded", false, 1009, "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"));
					return;
				}
			}
			if (this._masked) this._state = GET_MASK;
			else this._state = GET_DATA;
		}
		/**
		* Reads mask bytes.
		*
		* @private
		*/
		getMask() {
			if (this._bufferedBytes < 4) {
				this._loop = false;
				return;
			}
			this._mask = this.consume(4);
			this._state = GET_DATA;
		}
		/**
		* Reads data bytes.
		*
		* @param {Function} cb Callback
		* @private
		*/
		getData(cb) {
			let data = EMPTY_BUFFER;
			if (this._payloadLength) {
				if (this._bufferedBytes < this._payloadLength) {
					this._loop = false;
					return;
				}
				data = this.consume(this._payloadLength);
				if (this._masked && (this._mask[0] | this._mask[1] | this._mask[2] | this._mask[3]) !== 0) unmask(data, this._mask);
			}
			if (this._opcode > 7) {
				this.controlMessage(data, cb);
				return;
			}
			if (this._maxFragments > 0 && ++this._numFragments > this._maxFragments) {
				cb(this.createError(RangeError, "Too many message fragments", false, 1008, "WS_ERR_TOO_MANY_BUFFERED_PARTS"));
				return;
			}
			if (this._compressed) {
				this._state = INFLATING;
				this.decompress(data, cb);
				return;
			}
			if (data.length) {
				this._messageLength = this._totalPayloadLength;
				this._fragments.push(data);
			}
			this.dataMessage(cb);
		}
		/**
		* Decompresses data.
		*
		* @param {Buffer} data Compressed data
		* @param {Function} cb Callback
		* @private
		*/
		decompress(data, cb) {
			this._extensions[PerMessageDeflate.extensionName].decompress(data, this._fin, (err, buf) => {
				if (err) return cb(err);
				if (buf.length) {
					this._messageLength += buf.length;
					if (this._messageLength > this._maxPayload && this._maxPayload > 0) {
						cb(this.createError(RangeError, "Max payload size exceeded", false, 1009, "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"));
						return;
					}
					this._fragments.push(buf);
				}
				this.dataMessage(cb);
				if (this._state === GET_INFO) this.startLoop(cb);
			});
		}
		/**
		* Handles a data message.
		*
		* @param {Function} cb Callback
		* @private
		*/
		dataMessage(cb) {
			if (!this._fin) {
				this._state = GET_INFO;
				return;
			}
			const messageLength = this._messageLength;
			const fragments = this._fragments;
			this._totalPayloadLength = 0;
			this._messageLength = 0;
			this._fragmented = 0;
			this._numFragments = 0;
			this._fragments = [];
			if (this._opcode === 2) {
				let data;
				if (this._binaryType === "nodebuffer") data = concat(fragments, messageLength);
				else if (this._binaryType === "arraybuffer") data = toArrayBuffer(concat(fragments, messageLength));
				else if (this._binaryType === "blob") data = new Blob(fragments);
				else data = fragments;
				if (this._allowSynchronousEvents) {
					this.emit("message", data, true);
					this._state = GET_INFO;
				} else {
					this._state = DEFER_EVENT;
					setImmediate(() => {
						this.emit("message", data, true);
						this._state = GET_INFO;
						this.startLoop(cb);
					});
				}
			} else {
				const buf = concat(fragments, messageLength);
				if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
					cb(this.createError(Error, "invalid UTF-8 sequence", true, 1007, "WS_ERR_INVALID_UTF8"));
					return;
				}
				if (this._state === INFLATING || this._allowSynchronousEvents) {
					this.emit("message", buf, false);
					this._state = GET_INFO;
				} else {
					this._state = DEFER_EVENT;
					setImmediate(() => {
						this.emit("message", buf, false);
						this._state = GET_INFO;
						this.startLoop(cb);
					});
				}
			}
		}
		/**
		* Handles a control message.
		*
		* @param {Buffer} data Data to handle
		* @return {(Error|RangeError|undefined)} A possible error
		* @private
		*/
		controlMessage(data, cb) {
			if (this._opcode === 8) {
				if (data.length === 0) {
					this._loop = false;
					this.emit("conclude", 1005, EMPTY_BUFFER);
					this.end();
				} else {
					const code = data.readUInt16BE(0);
					if (!isValidStatusCode(code)) {
						cb(this.createError(RangeError, `invalid status code ${code}`, true, 1002, "WS_ERR_INVALID_CLOSE_CODE"));
						return;
					}
					const buf = new FastBuffer(data.buffer, data.byteOffset + 2, data.length - 2);
					if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
						cb(this.createError(Error, "invalid UTF-8 sequence", true, 1007, "WS_ERR_INVALID_UTF8"));
						return;
					}
					this._loop = false;
					this.emit("conclude", code, buf);
					this.end();
				}
				this._state = GET_INFO;
				return;
			}
			if (this._allowSynchronousEvents) {
				this.emit(this._opcode === 9 ? "ping" : "pong", data);
				this._state = GET_INFO;
			} else {
				this._state = DEFER_EVENT;
				setImmediate(() => {
					this.emit(this._opcode === 9 ? "ping" : "pong", data);
					this._state = GET_INFO;
					this.startLoop(cb);
				});
			}
		}
		/**
		* Builds an error object.
		*
		* @param {function(new:Error|RangeError)} ErrorCtor The error constructor
		* @param {String} message The error message
		* @param {Boolean} prefix Specifies whether or not to add a default prefix to
		*     `message`
		* @param {Number} statusCode The status code
		* @param {String} errorCode The exposed error code
		* @return {(Error|RangeError)} The error
		* @private
		*/
		createError(ErrorCtor, message, prefix, statusCode, errorCode) {
			this._loop = false;
			this._errored = true;
			const err = new ErrorCtor(prefix ? `Invalid WebSocket frame: ${message}` : message);
			Error.captureStackTrace(err, this.createError);
			err.code = errorCode;
			err[kStatusCode] = statusCode;
			return err;
		}
	};
	module.exports = Receiver;
}));
//#endregion
//#region ../../node_modules/.pnpm/ws@8.22.0/node_modules/ws/lib/sender.js
var require_sender = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var { Duplex: Duplex$3 } = __require("stream");
	var { randomFillSync } = __require("crypto");
	var { types: { isUint8Array } } = __require("util");
	var PerMessageDeflate = require_permessage_deflate();
	var { EMPTY_BUFFER, kWebSocket, NOOP } = require_constants();
	var { isBlob, isValidStatusCode } = require_validation();
	var { mask: applyMask, toBuffer } = require_buffer_util();
	var kByteLength = Symbol("kByteLength");
	var maskBuffer = Buffer.alloc(4);
	var RANDOM_POOL_SIZE = 8192;
	var randomPool;
	var randomPoolPointer = RANDOM_POOL_SIZE;
	var DEFAULT = 0;
	var DEFLATING = 1;
	var GET_BLOB_DATA = 2;
	module.exports = class Sender {
		/**
		* Creates a Sender instance.
		*
		* @param {Duplex} socket The connection socket
		* @param {Object} [extensions] An object containing the negotiated extensions
		* @param {Function} [generateMask] The function used to generate the masking
		*     key
		*/
		constructor(socket, extensions, generateMask) {
			this._extensions = extensions || {};
			if (generateMask) {
				this._generateMask = generateMask;
				this._maskBuffer = Buffer.alloc(4);
			}
			this._socket = socket;
			this._firstFragment = true;
			this._compress = false;
			this._bufferedBytes = 0;
			this._queue = [];
			this._state = DEFAULT;
			this.onerror = NOOP;
			this[kWebSocket] = void 0;
		}
		/**
		* Frames a piece of data according to the HyBi WebSocket protocol.
		*
		* @param {(Buffer|String)} data The data to frame
		* @param {Object} options Options object
		* @param {Boolean} [options.fin=false] Specifies whether or not to set the
		*     FIN bit
		* @param {Function} [options.generateMask] The function used to generate the
		*     masking key
		* @param {Boolean} [options.mask=false] Specifies whether or not to mask
		*     `data`
		* @param {Buffer} [options.maskBuffer] The buffer used to store the masking
		*     key
		* @param {Number} options.opcode The opcode
		* @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
		*     modified
		* @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
		*     RSV1 bit
		* @return {(Buffer|String)[]} The framed data
		* @public
		*/
		static frame(data, options) {
			let mask;
			let merge = false;
			let offset = 2;
			let skipMasking = false;
			if (options.mask) {
				mask = options.maskBuffer || maskBuffer;
				if (options.generateMask) options.generateMask(mask);
				else {
					if (randomPoolPointer === RANDOM_POOL_SIZE) {
						/* istanbul ignore else  */
						if (randomPool === void 0) randomPool = Buffer.alloc(RANDOM_POOL_SIZE);
						randomFillSync(randomPool, 0, RANDOM_POOL_SIZE);
						randomPoolPointer = 0;
					}
					mask[0] = randomPool[randomPoolPointer++];
					mask[1] = randomPool[randomPoolPointer++];
					mask[2] = randomPool[randomPoolPointer++];
					mask[3] = randomPool[randomPoolPointer++];
				}
				skipMasking = (mask[0] | mask[1] | mask[2] | mask[3]) === 0;
				offset = 6;
			}
			let dataLength;
			if (typeof data === "string") {
				if ((!options.mask || skipMasking) && options[kByteLength] !== void 0) dataLength = options[kByteLength];
				else {
					data = Buffer.from(data);
					dataLength = data.length;
				}
			} else {
				dataLength = data.length;
				merge = options.mask && options.readOnly && !skipMasking;
			}
			let payloadLength = dataLength;
			if (dataLength >= 65536) {
				offset += 8;
				payloadLength = 127;
			} else if (dataLength > 125) {
				offset += 2;
				payloadLength = 126;
			}
			const target = Buffer.allocUnsafe(merge ? dataLength + offset : offset);
			target[0] = options.fin ? options.opcode | 128 : options.opcode;
			if (options.rsv1) target[0] |= 64;
			target[1] = payloadLength;
			if (payloadLength === 126) target.writeUInt16BE(dataLength, 2);
			else if (payloadLength === 127) {
				target[2] = target[3] = 0;
				target.writeUIntBE(dataLength, 4, 6);
			}
			if (!options.mask) return [target, data];
			target[1] |= 128;
			target[offset - 4] = mask[0];
			target[offset - 3] = mask[1];
			target[offset - 2] = mask[2];
			target[offset - 1] = mask[3];
			if (skipMasking) return [target, data];
			if (merge) {
				applyMask(data, mask, target, offset, dataLength);
				return [target];
			}
			applyMask(data, mask, data, 0, dataLength);
			return [target, data];
		}
		/**
		* Sends a close message to the other peer.
		*
		* @param {Number} [code] The status code component of the body
		* @param {(String|Buffer)} [data] The message component of the body
		* @param {Boolean} [mask=false] Specifies whether or not to mask the message
		* @param {Function} [cb] Callback
		* @public
		*/
		close(code, data, mask, cb) {
			let buf;
			if (code === void 0) buf = EMPTY_BUFFER;
			else if (typeof code !== "number" || !isValidStatusCode(code)) throw new TypeError("First argument must be a valid error code number");
			else if (data === void 0 || !data.length) {
				buf = Buffer.allocUnsafe(2);
				buf.writeUInt16BE(code, 0);
			} else {
				const length = Buffer.byteLength(data);
				if (length > 123) throw new RangeError("The message must not be greater than 123 bytes");
				buf = Buffer.allocUnsafe(2 + length);
				buf.writeUInt16BE(code, 0);
				if (typeof data === "string") buf.write(data, 2);
				else if (isUint8Array(data)) buf.set(data, 2);
				else throw new TypeError("Second argument must be a string or a Uint8Array");
			}
			const options = {
				[kByteLength]: buf.length,
				fin: true,
				generateMask: this._generateMask,
				mask,
				maskBuffer: this._maskBuffer,
				opcode: 8,
				readOnly: false,
				rsv1: false
			};
			if (this._state !== DEFAULT) this.enqueue([
				this.dispatch,
				buf,
				false,
				options,
				cb
			]);
			else this.sendFrame(Sender.frame(buf, options), cb);
		}
		/**
		* Sends a ping message to the other peer.
		*
		* @param {*} data The message to send
		* @param {Boolean} [mask=false] Specifies whether or not to mask `data`
		* @param {Function} [cb] Callback
		* @public
		*/
		ping(data, mask, cb) {
			let byteLength;
			let readOnly;
			if (typeof data === "string") {
				byteLength = Buffer.byteLength(data);
				readOnly = false;
			} else if (isBlob(data)) {
				byteLength = data.size;
				readOnly = false;
			} else {
				data = toBuffer(data);
				byteLength = data.length;
				readOnly = toBuffer.readOnly;
			}
			if (byteLength > 125) throw new RangeError("The data size must not be greater than 125 bytes");
			const options = {
				[kByteLength]: byteLength,
				fin: true,
				generateMask: this._generateMask,
				mask,
				maskBuffer: this._maskBuffer,
				opcode: 9,
				readOnly,
				rsv1: false
			};
			if (isBlob(data)) {
				if (this._state !== DEFAULT) this.enqueue([
					this.getBlobData,
					data,
					false,
					options,
					cb
				]);
				else this.getBlobData(data, false, options, cb);
			} else if (this._state !== DEFAULT) this.enqueue([
				this.dispatch,
				data,
				false,
				options,
				cb
			]);
			else this.sendFrame(Sender.frame(data, options), cb);
		}
		/**
		* Sends a pong message to the other peer.
		*
		* @param {*} data The message to send
		* @param {Boolean} [mask=false] Specifies whether or not to mask `data`
		* @param {Function} [cb] Callback
		* @public
		*/
		pong(data, mask, cb) {
			let byteLength;
			let readOnly;
			if (typeof data === "string") {
				byteLength = Buffer.byteLength(data);
				readOnly = false;
			} else if (isBlob(data)) {
				byteLength = data.size;
				readOnly = false;
			} else {
				data = toBuffer(data);
				byteLength = data.length;
				readOnly = toBuffer.readOnly;
			}
			if (byteLength > 125) throw new RangeError("The data size must not be greater than 125 bytes");
			const options = {
				[kByteLength]: byteLength,
				fin: true,
				generateMask: this._generateMask,
				mask,
				maskBuffer: this._maskBuffer,
				opcode: 10,
				readOnly,
				rsv1: false
			};
			if (isBlob(data)) {
				if (this._state !== DEFAULT) this.enqueue([
					this.getBlobData,
					data,
					false,
					options,
					cb
				]);
				else this.getBlobData(data, false, options, cb);
			} else if (this._state !== DEFAULT) this.enqueue([
				this.dispatch,
				data,
				false,
				options,
				cb
			]);
			else this.sendFrame(Sender.frame(data, options), cb);
		}
		/**
		* Sends a data message to the other peer.
		*
		* @param {*} data The message to send
		* @param {Object} options Options object
		* @param {Boolean} [options.binary=false] Specifies whether `data` is binary
		*     or text
		* @param {Boolean} [options.compress=false] Specifies whether or not to
		*     compress `data`
		* @param {Boolean} [options.fin=false] Specifies whether the fragment is the
		*     last one
		* @param {Boolean} [options.mask=false] Specifies whether or not to mask
		*     `data`
		* @param {Function} [cb] Callback
		* @public
		*/
		send(data, options, cb) {
			const perMessageDeflate = this._extensions[PerMessageDeflate.extensionName];
			let opcode = options.binary ? 2 : 1;
			let rsv1 = options.compress;
			let byteLength;
			let readOnly;
			if (typeof data === "string") {
				byteLength = Buffer.byteLength(data);
				readOnly = false;
			} else if (isBlob(data)) {
				byteLength = data.size;
				readOnly = false;
			} else {
				data = toBuffer(data);
				byteLength = data.length;
				readOnly = toBuffer.readOnly;
			}
			if (this._firstFragment) {
				this._firstFragment = false;
				if (rsv1 && perMessageDeflate && perMessageDeflate.params[perMessageDeflate._isServer ? "server_no_context_takeover" : "client_no_context_takeover"]) rsv1 = byteLength >= perMessageDeflate._threshold;
				this._compress = rsv1;
			} else {
				rsv1 = false;
				opcode = 0;
			}
			if (options.fin) this._firstFragment = true;
			const opts = {
				[kByteLength]: byteLength,
				fin: options.fin,
				generateMask: this._generateMask,
				mask: options.mask,
				maskBuffer: this._maskBuffer,
				opcode,
				readOnly,
				rsv1
			};
			if (isBlob(data)) {
				if (this._state !== DEFAULT) this.enqueue([
					this.getBlobData,
					data,
					this._compress,
					opts,
					cb
				]);
				else this.getBlobData(data, this._compress, opts, cb);
			} else if (this._state !== DEFAULT) this.enqueue([
				this.dispatch,
				data,
				this._compress,
				opts,
				cb
			]);
			else this.dispatch(data, this._compress, opts, cb);
		}
		/**
		* Gets the contents of a blob as binary data.
		*
		* @param {Blob} blob The blob
		* @param {Boolean} [compress=false] Specifies whether or not to compress
		*     the data
		* @param {Object} options Options object
		* @param {Boolean} [options.fin=false] Specifies whether or not to set the
		*     FIN bit
		* @param {Function} [options.generateMask] The function used to generate the
		*     masking key
		* @param {Boolean} [options.mask=false] Specifies whether or not to mask
		*     `data`
		* @param {Buffer} [options.maskBuffer] The buffer used to store the masking
		*     key
		* @param {Number} options.opcode The opcode
		* @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
		*     modified
		* @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
		*     RSV1 bit
		* @param {Function} [cb] Callback
		* @private
		*/
		getBlobData(blob, compress, options, cb) {
			this._bufferedBytes += options[kByteLength];
			this._state = GET_BLOB_DATA;
			blob.arrayBuffer().then((arrayBuffer) => {
				if (this._socket.destroyed) {
					const err = /* @__PURE__ */ new Error("The socket was closed while the blob was being read");
					process.nextTick(callCallbacks, this, err, cb);
					return;
				}
				this._bufferedBytes -= options[kByteLength];
				const data = toBuffer(arrayBuffer);
				if (!compress) {
					this._state = DEFAULT;
					this.sendFrame(Sender.frame(data, options), cb);
					this.dequeue();
				} else this.dispatch(data, compress, options, cb);
			}).catch((err) => {
				process.nextTick(onError, this, err, cb);
			});
		}
		/**
		* Dispatches a message.
		*
		* @param {(Buffer|String)} data The message to send
		* @param {Boolean} [compress=false] Specifies whether or not to compress
		*     `data`
		* @param {Object} options Options object
		* @param {Boolean} [options.fin=false] Specifies whether or not to set the
		*     FIN bit
		* @param {Function} [options.generateMask] The function used to generate the
		*     masking key
		* @param {Boolean} [options.mask=false] Specifies whether or not to mask
		*     `data`
		* @param {Buffer} [options.maskBuffer] The buffer used to store the masking
		*     key
		* @param {Number} options.opcode The opcode
		* @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
		*     modified
		* @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
		*     RSV1 bit
		* @param {Function} [cb] Callback
		* @private
		*/
		dispatch(data, compress, options, cb) {
			if (!compress) {
				this.sendFrame(Sender.frame(data, options), cb);
				return;
			}
			const perMessageDeflate = this._extensions[PerMessageDeflate.extensionName];
			this._bufferedBytes += options[kByteLength];
			this._state = DEFLATING;
			perMessageDeflate.compress(data, options.fin, (_, buf) => {
				if (this._socket.destroyed) {
					const err = /* @__PURE__ */ new Error("The socket was closed while data was being compressed");
					callCallbacks(this, err, cb);
					return;
				}
				this._bufferedBytes -= options[kByteLength];
				this._state = DEFAULT;
				options.readOnly = false;
				this.sendFrame(Sender.frame(buf, options), cb);
				this.dequeue();
			});
		}
		/**
		* Executes queued send operations.
		*
		* @private
		*/
		dequeue() {
			while (this._state === DEFAULT && this._queue.length) {
				const params = this._queue.shift();
				this._bufferedBytes -= params[3][kByteLength];
				Reflect.apply(params[0], this, params.slice(1));
			}
		}
		/**
		* Enqueues a send operation.
		*
		* @param {Array} params Send operation parameters.
		* @private
		*/
		enqueue(params) {
			this._bufferedBytes += params[3][kByteLength];
			this._queue.push(params);
		}
		/**
		* Sends a frame.
		*
		* @param {(Buffer | String)[]} list The frame to send
		* @param {Function} [cb] Callback
		* @private
		*/
		sendFrame(list, cb) {
			if (list.length === 2) {
				this._socket.cork();
				this._socket.write(list[0]);
				this._socket.write(list[1], cb);
				this._socket.uncork();
			} else this._socket.write(list[0], cb);
		}
	};
	/**
	* Calls queued callbacks with an error.
	*
	* @param {Sender} sender The `Sender` instance
	* @param {Error} err The error to call the callbacks with
	* @param {Function} [cb] The first callback
	* @private
	*/
	function callCallbacks(sender, err, cb) {
		if (typeof cb === "function") cb(err);
		for (let i = 0; i < sender._queue.length; i++) {
			const params = sender._queue[i];
			const callback = params[params.length - 1];
			if (typeof callback === "function") callback(err);
		}
	}
	/**
	* Handles a `Sender` error.
	*
	* @param {Sender} sender The `Sender` instance
	* @param {Error} err The error
	* @param {Function} [cb] The first pending callback
	* @private
	*/
	function onError(sender, err, cb) {
		callCallbacks(sender, err, cb);
		sender.onerror(err);
	}
}));
//#endregion
//#region ../../node_modules/.pnpm/ws@8.22.0/node_modules/ws/lib/event-target.js
var require_event_target = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var { kForOnEventAttribute, kListener } = require_constants();
	var kCode = Symbol("kCode");
	var kData = Symbol("kData");
	var kError = Symbol("kError");
	var kMessage = Symbol("kMessage");
	var kReason = Symbol("kReason");
	var kTarget = Symbol("kTarget");
	var kType = Symbol("kType");
	var kWasClean = Symbol("kWasClean");
	/**
	* Class representing an event.
	*/
	var Event = class {
		/**
		* Create a new `Event`.
		*
		* @param {String} type The name of the event
		* @throws {TypeError} If the `type` argument is not specified
		*/
		constructor(type) {
			this[kTarget] = null;
			this[kType] = type;
		}
		/**
		* @type {*}
		*/
		get target() {
			return this[kTarget];
		}
		/**
		* @type {String}
		*/
		get type() {
			return this[kType];
		}
	};
	Object.defineProperty(Event.prototype, "target", { enumerable: true });
	Object.defineProperty(Event.prototype, "type", { enumerable: true });
	/**
	* Class representing a close event.
	*
	* @extends Event
	*/
	var CloseEvent = class extends Event {
		/**
		* Create a new `CloseEvent`.
		*
		* @param {String} type The name of the event
		* @param {Object} [options] A dictionary object that allows for setting
		*     attributes via object members of the same name
		* @param {Number} [options.code=0] The status code explaining why the
		*     connection was closed
		* @param {String} [options.reason=''] A human-readable string explaining why
		*     the connection was closed
		* @param {Boolean} [options.wasClean=false] Indicates whether or not the
		*     connection was cleanly closed
		*/
		constructor(type, options = {}) {
			super(type);
			this[kCode] = options.code === void 0 ? 0 : options.code;
			this[kReason] = options.reason === void 0 ? "" : options.reason;
			this[kWasClean] = options.wasClean === void 0 ? false : options.wasClean;
		}
		/**
		* @type {Number}
		*/
		get code() {
			return this[kCode];
		}
		/**
		* @type {String}
		*/
		get reason() {
			return this[kReason];
		}
		/**
		* @type {Boolean}
		*/
		get wasClean() {
			return this[kWasClean];
		}
	};
	Object.defineProperty(CloseEvent.prototype, "code", { enumerable: true });
	Object.defineProperty(CloseEvent.prototype, "reason", { enumerable: true });
	Object.defineProperty(CloseEvent.prototype, "wasClean", { enumerable: true });
	/**
	* Class representing an error event.
	*
	* @extends Event
	*/
	var ErrorEvent = class extends Event {
		/**
		* Create a new `ErrorEvent`.
		*
		* @param {String} type The name of the event
		* @param {Object} [options] A dictionary object that allows for setting
		*     attributes via object members of the same name
		* @param {*} [options.error=null] The error that generated this event
		* @param {String} [options.message=''] The error message
		*/
		constructor(type, options = {}) {
			super(type);
			this[kError] = options.error === void 0 ? null : options.error;
			this[kMessage] = options.message === void 0 ? "" : options.message;
		}
		/**
		* @type {*}
		*/
		get error() {
			return this[kError];
		}
		/**
		* @type {String}
		*/
		get message() {
			return this[kMessage];
		}
	};
	Object.defineProperty(ErrorEvent.prototype, "error", { enumerable: true });
	Object.defineProperty(ErrorEvent.prototype, "message", { enumerable: true });
	/**
	* Class representing a message event.
	*
	* @extends Event
	*/
	var MessageEvent = class extends Event {
		/**
		* Create a new `MessageEvent`.
		*
		* @param {String} type The name of the event
		* @param {Object} [options] A dictionary object that allows for setting
		*     attributes via object members of the same name
		* @param {*} [options.data=null] The message content
		*/
		constructor(type, options = {}) {
			super(type);
			this[kData] = options.data === void 0 ? null : options.data;
		}
		/**
		* @type {*}
		*/
		get data() {
			return this[kData];
		}
	};
	Object.defineProperty(MessageEvent.prototype, "data", { enumerable: true });
	module.exports = {
		CloseEvent,
		ErrorEvent,
		Event,
		EventTarget: {
			/**
			* Register an event listener.
			*
			* @param {String} type A string representing the event type to listen for
			* @param {(Function|Object)} handler The listener to add
			* @param {Object} [options] An options object specifies characteristics about
			*     the event listener
			* @param {Boolean} [options.once=false] A `Boolean` indicating that the
			*     listener should be invoked at most once after being added. If `true`,
			*     the listener would be automatically removed when invoked.
			* @public
			*/
			addEventListener(type, handler, options = {}) {
				for (const listener of this.listeners(type)) if (!options[kForOnEventAttribute] && listener[kListener] === handler && !listener[kForOnEventAttribute]) return;
				let wrapper;
				if (type === "message") wrapper = function onMessage(data, isBinary) {
					const event = new MessageEvent("message", { data: isBinary ? data : data.toString() });
					event[kTarget] = this;
					callListener(handler, this, event);
				};
				else if (type === "close") wrapper = function onClose(code, message) {
					const event = new CloseEvent("close", {
						code,
						reason: message.toString(),
						wasClean: this._closeFrameReceived && this._closeFrameSent
					});
					event[kTarget] = this;
					callListener(handler, this, event);
				};
				else if (type === "error") wrapper = function onError(error) {
					const event = new ErrorEvent("error", {
						error,
						message: error.message
					});
					event[kTarget] = this;
					callListener(handler, this, event);
				};
				else if (type === "open") wrapper = function onOpen() {
					const event = new Event("open");
					event[kTarget] = this;
					callListener(handler, this, event);
				};
				else return;
				wrapper[kForOnEventAttribute] = !!options[kForOnEventAttribute];
				wrapper[kListener] = handler;
				if (options.once) this.once(type, wrapper);
				else this.on(type, wrapper);
			},
			/**
			* Remove an event listener.
			*
			* @param {String} type A string representing the event type to remove
			* @param {(Function|Object)} handler The listener to remove
			* @public
			*/
			removeEventListener(type, handler) {
				for (const listener of this.listeners(type)) if (listener[kListener] === handler && !listener[kForOnEventAttribute]) {
					this.removeListener(type, listener);
					break;
				}
			}
		},
		MessageEvent
	};
	/**
	* Call an event listener
	*
	* @param {(Function|Object)} listener The listener to call
	* @param {*} thisArg The value to use as `this`` when calling the listener
	* @param {Event} event The event to pass to the listener
	* @private
	*/
	function callListener(listener, thisArg, event) {
		if (typeof listener === "object" && listener.handleEvent) listener.handleEvent.call(listener, event);
		else listener.call(thisArg, event);
	}
}));
//#endregion
//#region ../../node_modules/.pnpm/ws@8.22.0/node_modules/ws/lib/extension.js
var require_extension = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var { tokenChars } = require_validation();
	/**
	* Adds an offer to the map of extension offers or a parameter to the map of
	* parameters.
	*
	* @param {Object} dest The map of extension offers or parameters
	* @param {String} name The extension or parameter name
	* @param {(Object|Boolean|String)} elem The extension parameters or the
	*     parameter value
	* @private
	*/
	function push(dest, name, elem) {
		if (dest[name] === void 0) dest[name] = [elem];
		else dest[name].push(elem);
	}
	/**
	* Parses the `Sec-WebSocket-Extensions` header into an object.
	*
	* @param {String} header The field value of the header
	* @return {Object} The parsed object
	* @public
	*/
	function parse(header) {
		const offers = Object.create(null);
		let params = Object.create(null);
		let mustUnescape = false;
		let isEscaping = false;
		let inQuotes = false;
		let extensionName;
		let paramName;
		let start = -1;
		let code = -1;
		let end = -1;
		let i = 0;
		for (; i < header.length; i++) {
			code = header.charCodeAt(i);
			if (extensionName === void 0) {
				if (end === -1 && tokenChars[code] === 1) {
					if (start === -1) start = i;
				} else if (i !== 0 && (code === 32 || code === 9)) {
					if (end === -1 && start !== -1) end = i;
				} else if (code === 59 || code === 44) {
					if (start === -1) throw new SyntaxError(`Unexpected character at index ${i}`);
					if (end === -1) end = i;
					const name = header.slice(start, end);
					if (code === 44) {
						push(offers, name, params);
						params = Object.create(null);
					} else extensionName = name;
					start = end = -1;
				} else throw new SyntaxError(`Unexpected character at index ${i}`);
			} else if (paramName === void 0) {
				if (end === -1 && tokenChars[code] === 1) {
					if (start === -1) start = i;
				} else if (code === 32 || code === 9) {
					if (end === -1 && start !== -1) end = i;
				} else if (code === 59 || code === 44) {
					if (start === -1) throw new SyntaxError(`Unexpected character at index ${i}`);
					if (end === -1) end = i;
					push(params, header.slice(start, end), true);
					if (code === 44) {
						push(offers, extensionName, params);
						params = Object.create(null);
						extensionName = void 0;
					}
					start = end = -1;
				} else if (code === 61 && start !== -1 && end === -1) {
					paramName = header.slice(start, i);
					start = end = -1;
				} else throw new SyntaxError(`Unexpected character at index ${i}`);
			} else if (isEscaping) {
				if (tokenChars[code] !== 1) throw new SyntaxError(`Unexpected character at index ${i}`);
				if (start === -1) start = i;
				else if (!mustUnescape) mustUnescape = true;
				isEscaping = false;
			} else if (inQuotes) {
				if (tokenChars[code] === 1) {
					if (start === -1) start = i;
				} else if (code === 34 && start !== -1) {
					inQuotes = false;
					end = i;
				} else if (code === 92) isEscaping = true;
				else throw new SyntaxError(`Unexpected character at index ${i}`);
			} else if (code === 34 && header.charCodeAt(i - 1) === 61) inQuotes = true;
			else if (end === -1 && tokenChars[code] === 1) {
				if (start === -1) start = i;
			} else if (start !== -1 && (code === 32 || code === 9)) {
				if (end === -1) end = i;
			} else if (code === 59 || code === 44) {
				if (start === -1) throw new SyntaxError(`Unexpected character at index ${i}`);
				if (end === -1) end = i;
				let value = header.slice(start, end);
				if (mustUnescape) {
					value = value.replace(/\\/g, "");
					mustUnescape = false;
				}
				push(params, paramName, value);
				if (code === 44) {
					push(offers, extensionName, params);
					params = Object.create(null);
					extensionName = void 0;
				}
				paramName = void 0;
				start = end = -1;
			} else throw new SyntaxError(`Unexpected character at index ${i}`);
		}
		if (start === -1 || inQuotes || code === 32 || code === 9) throw new SyntaxError("Unexpected end of input");
		if (end === -1) end = i;
		const token = header.slice(start, end);
		if (extensionName === void 0) push(offers, token, params);
		else {
			if (paramName === void 0) push(params, token, true);
			else if (mustUnescape) push(params, paramName, token.replace(/\\/g, ""));
			else push(params, paramName, token);
			push(offers, extensionName, params);
		}
		return offers;
	}
	/**
	* Builds the `Sec-WebSocket-Extensions` header field value.
	*
	* @param {Object} extensions The map of extensions and parameters to format
	* @return {String} A string representing the given object
	* @public
	*/
	function format(extensions) {
		return Object.keys(extensions).map((extension) => {
			let configurations = extensions[extension];
			if (!Array.isArray(configurations)) configurations = [configurations];
			return configurations.map((params) => {
				return [extension].concat(Object.keys(params).map((k) => {
					let values = params[k];
					if (!Array.isArray(values)) values = [values];
					return values.map((v) => v === true ? k : `${k}=${v}`).join("; ");
				})).join("; ");
			}).join(", ");
		}).join(", ");
	}
	module.exports = {
		format,
		parse
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/ws@8.22.0/node_modules/ws/lib/websocket.js
var require_websocket = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var EventEmitter$1 = __require("events");
	var https = __require("https");
	var http$1 = __require("http");
	var net = __require("net");
	var tls = __require("tls");
	var { randomBytes: randomBytes$1, createHash: createHash$2 } = __require("crypto");
	var { Duplex: Duplex$2, Readable } = __require("stream");
	var { URL: URL$1 } = __require("url");
	var PerMessageDeflate = require_permessage_deflate();
	var Receiver = require_receiver();
	var Sender = require_sender();
	var { isBlob } = require_validation();
	var { BINARY_TYPES, CLOSE_TIMEOUT, EMPTY_BUFFER, GUID, kForOnEventAttribute, kListener, kStatusCode, kWebSocket, NOOP } = require_constants();
	var { EventTarget: { addEventListener, removeEventListener } } = require_event_target();
	var { format, parse } = require_extension();
	var { toBuffer } = require_buffer_util();
	var kAborted = Symbol("kAborted");
	var protocolVersions = [8, 13];
	var readyStates = [
		"CONNECTING",
		"OPEN",
		"CLOSING",
		"CLOSED"
	];
	var subprotocolRegex = /^[!#$%&'*+\-.0-9A-Z^_`|a-z~]+$/;
	/**
	* Class representing a WebSocket.
	*
	* @extends EventEmitter
	*/
	var WebSocket = class WebSocket extends EventEmitter$1 {
		/**
		* Create a new `WebSocket`.
		*
		* @param {(String|URL)} address The URL to which to connect
		* @param {(String|String[])} [protocols] The subprotocols
		* @param {Object} [options] Connection options
		*/
		constructor(address, protocols, options) {
			super();
			this._binaryType = BINARY_TYPES[0];
			this._closeCode = 1006;
			this._closeFrameReceived = false;
			this._closeFrameSent = false;
			this._closeMessage = EMPTY_BUFFER;
			this._closeTimer = null;
			this._errorEmitted = false;
			this._extensions = {};
			this._paused = false;
			this._protocol = "";
			this._readyState = WebSocket.CONNECTING;
			this._receiver = null;
			this._sender = null;
			this._socket = null;
			if (address !== null) {
				this._bufferedAmount = 0;
				this._isServer = false;
				this._redirects = 0;
				if (protocols === void 0) {
					if (!options || options.protocols === void 0) protocols = [];
					else if (Array.isArray(options.protocols)) protocols = options.protocols;
					else protocols = [options.protocols];
				} else if (!Array.isArray(protocols)) {
					if (typeof protocols === "object" && protocols !== null) {
						options = protocols;
						if (options.protocols === void 0) protocols = [];
						else if (Array.isArray(options.protocols)) protocols = options.protocols;
						else protocols = [options.protocols];
					} else protocols = [protocols];
				}
				initAsClient(this, address, protocols, options);
			} else {
				this._autoPong = options.autoPong;
				this._closeTimeout = options.closeTimeout;
				this._isServer = true;
			}
		}
		/**
		* For historical reasons, the custom "nodebuffer" type is used by the default
		* instead of "blob".
		*
		* @type {String}
		*/
		get binaryType() {
			return this._binaryType;
		}
		set binaryType(type) {
			if (!BINARY_TYPES.includes(type)) return;
			this._binaryType = type;
			if (this._receiver) this._receiver._binaryType = type;
		}
		/**
		* @type {Number}
		*/
		get bufferedAmount() {
			if (!this._socket) return this._bufferedAmount;
			return this._socket._writableState.length + this._sender._bufferedBytes;
		}
		/**
		* @type {String}
		*/
		get extensions() {
			return Object.keys(this._extensions).join();
		}
		/**
		* @type {Boolean}
		*/
		get isPaused() {
			return this._paused;
		}
		/**
		* @type {Function}
		*/
		/* istanbul ignore next */
		get onclose() {
			return null;
		}
		/**
		* @type {Function}
		*/
		/* istanbul ignore next */
		get onerror() {
			return null;
		}
		/**
		* @type {Function}
		*/
		/* istanbul ignore next */
		get onopen() {
			return null;
		}
		/**
		* @type {Function}
		*/
		/* istanbul ignore next */
		get onmessage() {
			return null;
		}
		/**
		* @type {String}
		*/
		get protocol() {
			return this._protocol;
		}
		/**
		* @type {Number}
		*/
		get readyState() {
			return this._readyState;
		}
		/**
		* @type {String}
		*/
		get url() {
			return this._url;
		}
		/**
		* Set up the socket and the internal resources.
		*
		* @param {Duplex} socket The network socket between the server and client
		* @param {Buffer} head The first packet of the upgraded stream
		* @param {Object} options Options object
		* @param {Boolean} [options.allowSynchronousEvents=false] Specifies whether
		*     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
		*     multiple times in the same tick
		* @param {Function} [options.generateMask] The function used to generate the
		*     masking key
		* @param {Number} [options.maxBufferedChunks=0] The maximum number of
		*     buffered data chunks
		* @param {Number} [options.maxFragments=0] The maximum number of message
		*     fragments
		* @param {Number} [options.maxPayload=0] The maximum allowed message size
		* @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
		*     not to skip UTF-8 validation for text and close messages
		* @private
		*/
		setSocket(socket, head, options) {
			const receiver = new Receiver({
				allowSynchronousEvents: options.allowSynchronousEvents,
				binaryType: this.binaryType,
				extensions: this._extensions,
				isServer: this._isServer,
				maxBufferedChunks: options.maxBufferedChunks,
				maxFragments: options.maxFragments,
				maxPayload: options.maxPayload,
				skipUTF8Validation: options.skipUTF8Validation
			});
			const sender = new Sender(socket, this._extensions, options.generateMask);
			this._receiver = receiver;
			this._sender = sender;
			this._socket = socket;
			receiver[kWebSocket] = this;
			sender[kWebSocket] = this;
			socket[kWebSocket] = this;
			receiver.on("conclude", receiverOnConclude);
			receiver.on("drain", receiverOnDrain);
			receiver.on("error", receiverOnError);
			receiver.on("message", receiverOnMessage);
			receiver.on("ping", receiverOnPing);
			receiver.on("pong", receiverOnPong);
			sender.onerror = senderOnError;
			if (socket.setTimeout) socket.setTimeout(0);
			if (socket.setNoDelay) socket.setNoDelay();
			if (head.length > 0) socket.unshift(head);
			socket.on("close", socketOnClose);
			socket.on("data", socketOnData);
			socket.on("end", socketOnEnd);
			socket.on("error", socketOnError);
			this._readyState = WebSocket.OPEN;
			this.emit("open");
		}
		/**
		* Emit the `'close'` event.
		*
		* @private
		*/
		emitClose() {
			if (!this._socket) {
				this._readyState = WebSocket.CLOSED;
				this.emit("close", this._closeCode, this._closeMessage);
				return;
			}
			if (this._extensions[PerMessageDeflate.extensionName]) this._extensions[PerMessageDeflate.extensionName].cleanup();
			this._receiver.removeAllListeners();
			this._readyState = WebSocket.CLOSED;
			this.emit("close", this._closeCode, this._closeMessage);
		}
		/**
		* Start a closing handshake.
		*
		*          +----------+   +-----------+   +----------+
		*     - - -|ws.close()|-->|close frame|-->|ws.close()|- - -
		*    |     +----------+   +-----------+   +----------+     |
		*          +----------+   +-----------+         |
		* CLOSING  |ws.close()|<--|close frame|<--+-----+       CLOSING
		*          +----------+   +-----------+   |
		*    |           |                        |   +---+        |
		*                +------------------------+-->|fin| - - - -
		*    |         +---+                      |   +---+
		*     - - - - -|fin|<---------------------+
		*              +---+
		*
		* @param {Number} [code] Status code explaining why the connection is closing
		* @param {(String|Buffer)} [data] The reason why the connection is
		*     closing
		* @public
		*/
		close(code, data) {
			if (this.readyState === WebSocket.CLOSED) return;
			if (this.readyState === WebSocket.CONNECTING) {
				abortHandshake(this, this._req, "WebSocket was closed before the connection was established");
				return;
			}
			if (this.readyState === WebSocket.CLOSING) {
				if (this._closeFrameSent && (this._closeFrameReceived || this._receiver._writableState.errorEmitted)) this._socket.end();
				return;
			}
			this._sender.close(code, data, !this._isServer, (err) => {
				if (err) return;
				this._closeFrameSent = true;
				if (this._closeFrameReceived || this._receiver._writableState.errorEmitted) this._socket.end();
			});
			this._readyState = WebSocket.CLOSING;
			setCloseTimer(this);
		}
		/**
		* Pause the socket.
		*
		* @public
		*/
		pause() {
			if (this.readyState === WebSocket.CONNECTING || this.readyState === WebSocket.CLOSED) return;
			this._paused = true;
			this._socket.pause();
		}
		/**
		* Send a ping.
		*
		* @param {*} [data] The data to send
		* @param {Boolean} [mask] Indicates whether or not to mask `data`
		* @param {Function} [cb] Callback which is executed when the ping is sent
		* @public
		*/
		ping(data, mask, cb) {
			if (this.readyState === WebSocket.CONNECTING) throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
			if (typeof data === "function") {
				cb = data;
				data = mask = void 0;
			} else if (typeof mask === "function") {
				cb = mask;
				mask = void 0;
			}
			if (typeof data === "number") data = data.toString();
			if (this.readyState !== WebSocket.OPEN) {
				sendAfterClose(this, data, cb);
				return;
			}
			if (mask === void 0) mask = !this._isServer;
			this._sender.ping(data || EMPTY_BUFFER, mask, cb);
		}
		/**
		* Send a pong.
		*
		* @param {*} [data] The data to send
		* @param {Boolean} [mask] Indicates whether or not to mask `data`
		* @param {Function} [cb] Callback which is executed when the pong is sent
		* @public
		*/
		pong(data, mask, cb) {
			if (this.readyState === WebSocket.CONNECTING) throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
			if (typeof data === "function") {
				cb = data;
				data = mask = void 0;
			} else if (typeof mask === "function") {
				cb = mask;
				mask = void 0;
			}
			if (typeof data === "number") data = data.toString();
			if (this.readyState !== WebSocket.OPEN) {
				sendAfterClose(this, data, cb);
				return;
			}
			if (mask === void 0) mask = !this._isServer;
			this._sender.pong(data || EMPTY_BUFFER, mask, cb);
		}
		/**
		* Resume the socket.
		*
		* @public
		*/
		resume() {
			if (this.readyState === WebSocket.CONNECTING || this.readyState === WebSocket.CLOSED) return;
			this._paused = false;
			if (!this._receiver._writableState.needDrain) this._socket.resume();
		}
		/**
		* Send a data message.
		*
		* @param {*} data The message to send
		* @param {Object} [options] Options object
		* @param {Boolean} [options.binary] Specifies whether `data` is binary or
		*     text
		* @param {Boolean} [options.compress] Specifies whether or not to compress
		*     `data`
		* @param {Boolean} [options.fin=true] Specifies whether the fragment is the
		*     last one
		* @param {Boolean} [options.mask] Specifies whether or not to mask `data`
		* @param {Function} [cb] Callback which is executed when data is written out
		* @public
		*/
		send(data, options, cb) {
			if (this.readyState === WebSocket.CONNECTING) throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
			if (typeof options === "function") {
				cb = options;
				options = {};
			}
			if (typeof data === "number") data = data.toString();
			if (this.readyState !== WebSocket.OPEN) {
				sendAfterClose(this, data, cb);
				return;
			}
			const opts = {
				binary: typeof data !== "string",
				mask: !this._isServer,
				compress: true,
				fin: true,
				...options
			};
			if (!this._extensions[PerMessageDeflate.extensionName]) opts.compress = false;
			this._sender.send(data || EMPTY_BUFFER, opts, cb);
		}
		/**
		* Forcibly close the connection.
		*
		* @public
		*/
		terminate() {
			if (this.readyState === WebSocket.CLOSED) return;
			if (this.readyState === WebSocket.CONNECTING) {
				abortHandshake(this, this._req, "WebSocket was closed before the connection was established");
				return;
			}
			if (this._socket) {
				this._readyState = WebSocket.CLOSING;
				this._socket.destroy();
			}
		}
	};
	/**
	* @constant {Number} CONNECTING
	* @memberof WebSocket
	*/
	Object.defineProperty(WebSocket, "CONNECTING", {
		enumerable: true,
		value: readyStates.indexOf("CONNECTING")
	});
	/**
	* @constant {Number} CONNECTING
	* @memberof WebSocket.prototype
	*/
	Object.defineProperty(WebSocket.prototype, "CONNECTING", {
		enumerable: true,
		value: readyStates.indexOf("CONNECTING")
	});
	/**
	* @constant {Number} OPEN
	* @memberof WebSocket
	*/
	Object.defineProperty(WebSocket, "OPEN", {
		enumerable: true,
		value: readyStates.indexOf("OPEN")
	});
	/**
	* @constant {Number} OPEN
	* @memberof WebSocket.prototype
	*/
	Object.defineProperty(WebSocket.prototype, "OPEN", {
		enumerable: true,
		value: readyStates.indexOf("OPEN")
	});
	/**
	* @constant {Number} CLOSING
	* @memberof WebSocket
	*/
	Object.defineProperty(WebSocket, "CLOSING", {
		enumerable: true,
		value: readyStates.indexOf("CLOSING")
	});
	/**
	* @constant {Number} CLOSING
	* @memberof WebSocket.prototype
	*/
	Object.defineProperty(WebSocket.prototype, "CLOSING", {
		enumerable: true,
		value: readyStates.indexOf("CLOSING")
	});
	/**
	* @constant {Number} CLOSED
	* @memberof WebSocket
	*/
	Object.defineProperty(WebSocket, "CLOSED", {
		enumerable: true,
		value: readyStates.indexOf("CLOSED")
	});
	/**
	* @constant {Number} CLOSED
	* @memberof WebSocket.prototype
	*/
	Object.defineProperty(WebSocket.prototype, "CLOSED", {
		enumerable: true,
		value: readyStates.indexOf("CLOSED")
	});
	[
		"binaryType",
		"bufferedAmount",
		"extensions",
		"isPaused",
		"protocol",
		"readyState",
		"url"
	].forEach((property) => {
		Object.defineProperty(WebSocket.prototype, property, { enumerable: true });
	});
	[
		"open",
		"error",
		"close",
		"message"
	].forEach((method) => {
		Object.defineProperty(WebSocket.prototype, `on${method}`, {
			enumerable: true,
			get() {
				for (const listener of this.listeners(method)) if (listener[kForOnEventAttribute]) return listener[kListener];
				return null;
			},
			set(handler) {
				for (const listener of this.listeners(method)) if (listener[kForOnEventAttribute]) {
					this.removeListener(method, listener);
					break;
				}
				if (typeof handler !== "function") return;
				this.addEventListener(method, handler, { [kForOnEventAttribute]: true });
			}
		});
	});
	WebSocket.prototype.addEventListener = addEventListener;
	WebSocket.prototype.removeEventListener = removeEventListener;
	module.exports = WebSocket;
	/**
	* Initialize a WebSocket client.
	*
	* @param {WebSocket} websocket The client to initialize
	* @param {(String|URL)} address The URL to which to connect
	* @param {Array} protocols The subprotocols
	* @param {Object} [options] Connection options
	* @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether any
	*     of the `'message'`, `'ping'`, and `'pong'` events can be emitted multiple
	*     times in the same tick
	* @param {Boolean} [options.autoPong=true] Specifies whether or not to
	*     automatically send a pong in response to a ping
	* @param {Number} [options.closeTimeout=30000] Duration in milliseconds to wait
	*     for the closing handshake to finish after `websocket.close()` is called
	* @param {Function} [options.finishRequest] A function which can be used to
	*     customize the headers of each http request before it is sent
	* @param {Boolean} [options.followRedirects=false] Whether or not to follow
	*     redirects
	* @param {Function} [options.generateMask] The function used to generate the
	*     masking key
	* @param {Number} [options.handshakeTimeout] Timeout in milliseconds for the
	*     handshake request
	* @param {Number} [options.maxBufferedChunks=262144] The maximum number of
	*     buffered data chunks
	* @param {Number} [options.maxFragments=16384] The maximum number of message
	*     fragments
	* @param {Number} [options.maxPayload=104857600] The maximum allowed message
	*     size
	* @param {Number} [options.maxRedirects=10] The maximum number of redirects
	*     allowed
	* @param {String} [options.origin] Value of the `Origin` or
	*     `Sec-WebSocket-Origin` header
	* @param {(Boolean|Object)} [options.perMessageDeflate=true] Enable/disable
	*     permessage-deflate
	* @param {Number} [options.protocolVersion=13] Value of the
	*     `Sec-WebSocket-Version` header
	* @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
	*     not to skip UTF-8 validation for text and close messages
	* @private
	*/
	function initAsClient(websocket, address, protocols, options) {
		const opts = {
			allowSynchronousEvents: true,
			autoPong: true,
			closeTimeout: CLOSE_TIMEOUT,
			protocolVersion: protocolVersions[1],
			maxBufferedChunks: 262144,
			maxFragments: 16384,
			maxPayload: 104857600,
			skipUTF8Validation: false,
			perMessageDeflate: true,
			followRedirects: false,
			maxRedirects: 10,
			...options,
			socketPath: void 0,
			hostname: void 0,
			protocol: void 0,
			protocols: void 0,
			timeout: void 0,
			method: "GET",
			host: void 0,
			path: void 0,
			port: void 0
		};
		websocket._autoPong = opts.autoPong;
		websocket._closeTimeout = opts.closeTimeout;
		if (!protocolVersions.includes(opts.protocolVersion)) throw new RangeError(`Unsupported protocol version: ${opts.protocolVersion} (supported versions: ${protocolVersions.join(", ")})`);
		let parsedUrl;
		if (address instanceof URL$1) parsedUrl = address;
		else try {
			parsedUrl = new URL$1(address);
		} catch {
			throw new SyntaxError(`Invalid URL: ${address}`);
		}
		if (parsedUrl.protocol === "http:") parsedUrl.protocol = "ws:";
		else if (parsedUrl.protocol === "https:") parsedUrl.protocol = "wss:";
		websocket._url = parsedUrl.href;
		const isSecure = parsedUrl.protocol === "wss:";
		const isIpcUrl = parsedUrl.protocol === "ws+unix:";
		let invalidUrlMessage;
		if (parsedUrl.protocol !== "ws:" && !isSecure && !isIpcUrl) invalidUrlMessage = "The URL's protocol must be one of \"ws:\", \"wss:\", \"http:\", \"https:\", or \"ws+unix:\"";
		else if (isIpcUrl && !parsedUrl.pathname) invalidUrlMessage = "The URL's pathname is empty";
		else if (parsedUrl.hash) invalidUrlMessage = "The URL contains a fragment identifier";
		if (invalidUrlMessage) {
			const err = new SyntaxError(invalidUrlMessage);
			if (websocket._redirects === 0) throw err;
			else {
				emitErrorAndClose(websocket, err);
				return;
			}
		}
		const defaultPort = isSecure ? 443 : 80;
		const key = randomBytes$1(16).toString("base64");
		const request = isSecure ? https.request : http$1.request;
		const protocolSet = /* @__PURE__ */ new Set();
		let perMessageDeflate;
		opts.createConnection = opts.createConnection || (isSecure ? tlsConnect : netConnect);
		opts.defaultPort = opts.defaultPort || defaultPort;
		opts.port = parsedUrl.port || defaultPort;
		opts.host = parsedUrl.hostname.startsWith("[") ? parsedUrl.hostname.slice(1, -1) : parsedUrl.hostname;
		opts.headers = {
			...opts.headers,
			"Sec-WebSocket-Version": opts.protocolVersion,
			"Sec-WebSocket-Key": key,
			Connection: "Upgrade",
			Upgrade: "websocket"
		};
		opts.path = parsedUrl.pathname + parsedUrl.search;
		opts.timeout = opts.handshakeTimeout;
		if (opts.perMessageDeflate) {
			perMessageDeflate = new PerMessageDeflate({
				...opts.perMessageDeflate,
				isServer: false,
				maxPayload: opts.maxPayload
			});
			opts.headers["Sec-WebSocket-Extensions"] = format({ [PerMessageDeflate.extensionName]: perMessageDeflate.offer() });
		}
		if (protocols.length) {
			for (const protocol of protocols) {
				if (typeof protocol !== "string" || !subprotocolRegex.test(protocol) || protocolSet.has(protocol)) throw new SyntaxError("An invalid or duplicated subprotocol was specified");
				protocolSet.add(protocol);
			}
			opts.headers["Sec-WebSocket-Protocol"] = protocols.join(",");
		}
		if (opts.origin) {
			if (opts.protocolVersion < 13) opts.headers["Sec-WebSocket-Origin"] = opts.origin;
			else opts.headers.Origin = opts.origin;
		}
		if (parsedUrl.username || parsedUrl.password) opts.auth = `${parsedUrl.username}:${parsedUrl.password}`;
		if (isIpcUrl) {
			const parts = opts.path.split(":");
			opts.socketPath = parts[0];
			opts.path = parts[1];
		}
		let req;
		if (opts.followRedirects) {
			if (websocket._redirects === 0) {
				websocket._originalIpc = isIpcUrl;
				websocket._originalSecure = isSecure;
				websocket._originalHostOrSocketPath = isIpcUrl ? opts.socketPath : parsedUrl.host;
				const headers = options && options.headers;
				options = {
					...options,
					headers: {}
				};
				if (headers) for (const [key, value] of Object.entries(headers)) options.headers[key.toLowerCase()] = value;
			} else if (websocket.listenerCount("redirect") === 0) {
				const isSameHost = isIpcUrl ? websocket._originalIpc ? opts.socketPath === websocket._originalHostOrSocketPath : false : websocket._originalIpc ? false : parsedUrl.host === websocket._originalHostOrSocketPath;
				if (!isSameHost || websocket._originalSecure && !isSecure) {
					delete opts.headers.authorization;
					delete opts.headers.cookie;
					if (!isSameHost) delete opts.headers.host;
					opts.auth = void 0;
				}
			}
			if (opts.auth && !options.headers.authorization) options.headers.authorization = "Basic " + Buffer.from(opts.auth).toString("base64");
			req = websocket._req = request(opts);
			if (websocket._redirects) websocket.emit("redirect", websocket.url, req);
		} else req = websocket._req = request(opts);
		if (opts.timeout) req.on("timeout", () => {
			abortHandshake(websocket, req, "Opening handshake has timed out");
		});
		req.on("error", (err) => {
			if (req === null || req[kAborted]) return;
			req = websocket._req = null;
			emitErrorAndClose(websocket, err);
		});
		req.on("response", (res) => {
			const location = res.headers.location;
			const statusCode = res.statusCode;
			if (location && opts.followRedirects && statusCode >= 300 && statusCode < 400) {
				if (++websocket._redirects > opts.maxRedirects) {
					abortHandshake(websocket, req, "Maximum redirects exceeded");
					return;
				}
				req.abort();
				let addr;
				try {
					addr = new URL$1(location, address);
				} catch (e) {
					emitErrorAndClose(websocket, /* @__PURE__ */ new SyntaxError(`Invalid URL: ${location}`));
					return;
				}
				initAsClient(websocket, addr, protocols, options);
			} else if (!websocket.emit("unexpected-response", req, res)) abortHandshake(websocket, req, `Unexpected server response: ${res.statusCode}`);
		});
		req.on("upgrade", (res, socket, head) => {
			websocket.emit("upgrade", res);
			if (websocket.readyState !== WebSocket.CONNECTING) return;
			req = websocket._req = null;
			const upgrade = res.headers.upgrade;
			if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
				abortHandshake(websocket, socket, "Invalid Upgrade header");
				return;
			}
			const digest = createHash$2("sha1").update(key + GUID).digest("base64");
			if (res.headers["sec-websocket-accept"] !== digest) {
				abortHandshake(websocket, socket, "Invalid Sec-WebSocket-Accept header");
				return;
			}
			const serverProt = res.headers["sec-websocket-protocol"];
			let protError;
			if (serverProt !== void 0) {
				if (!protocolSet.size) protError = "Server sent a subprotocol but none was requested";
				else if (!protocolSet.has(serverProt)) protError = "Server sent an invalid subprotocol";
			} else if (protocolSet.size) protError = "Server sent no subprotocol";
			if (protError) {
				abortHandshake(websocket, socket, protError);
				return;
			}
			if (serverProt) websocket._protocol = serverProt;
			const secWebSocketExtensions = res.headers["sec-websocket-extensions"];
			if (secWebSocketExtensions !== void 0) {
				if (!perMessageDeflate) {
					abortHandshake(websocket, socket, "Server sent a Sec-WebSocket-Extensions header but no extension was requested");
					return;
				}
				let extensions;
				try {
					extensions = parse(secWebSocketExtensions);
				} catch (err) {
					abortHandshake(websocket, socket, "Invalid Sec-WebSocket-Extensions header");
					return;
				}
				const extensionNames = Object.keys(extensions);
				if (extensionNames.length !== 1 || extensionNames[0] !== PerMessageDeflate.extensionName) {
					abortHandshake(websocket, socket, "Server indicated an extension that was not requested");
					return;
				}
				try {
					perMessageDeflate.accept(extensions[PerMessageDeflate.extensionName]);
				} catch (err) {
					abortHandshake(websocket, socket, "Invalid Sec-WebSocket-Extensions header");
					return;
				}
				websocket._extensions[PerMessageDeflate.extensionName] = perMessageDeflate;
			}
			websocket.setSocket(socket, head, {
				allowSynchronousEvents: opts.allowSynchronousEvents,
				generateMask: opts.generateMask,
				maxBufferedChunks: opts.maxBufferedChunks,
				maxFragments: opts.maxFragments,
				maxPayload: opts.maxPayload,
				skipUTF8Validation: opts.skipUTF8Validation
			});
		});
		if (opts.finishRequest) opts.finishRequest(req, websocket);
		else req.end();
	}
	/**
	* Emit the `'error'` and `'close'` events.
	*
	* @param {WebSocket} websocket The WebSocket instance
	* @param {Error} The error to emit
	* @private
	*/
	function emitErrorAndClose(websocket, err) {
		websocket._readyState = WebSocket.CLOSING;
		websocket._errorEmitted = true;
		websocket.emit("error", err);
		websocket.emitClose();
	}
	/**
	* Create a `net.Socket` and initiate a connection.
	*
	* @param {Object} options Connection options
	* @return {net.Socket} The newly created socket used to start the connection
	* @private
	*/
	function netConnect(options) {
		options.path = options.socketPath;
		return net.connect(options);
	}
	/**
	* Create a `tls.TLSSocket` and initiate a connection.
	*
	* @param {Object} options Connection options
	* @return {tls.TLSSocket} The newly created socket used to start the connection
	* @private
	*/
	function tlsConnect(options) {
		options.path = void 0;
		if (!options.servername && options.servername !== "") options.servername = net.isIP(options.host) ? "" : options.host;
		return tls.connect(options);
	}
	/**
	* Abort the handshake and emit an error.
	*
	* @param {WebSocket} websocket The WebSocket instance
	* @param {(http.ClientRequest|net.Socket|tls.Socket)} stream The request to
	*     abort or the socket to destroy
	* @param {String} message The error message
	* @private
	*/
	function abortHandshake(websocket, stream, message) {
		websocket._readyState = WebSocket.CLOSING;
		const err = new Error(message);
		Error.captureStackTrace(err, abortHandshake);
		if (stream.setHeader) {
			stream[kAborted] = true;
			stream.abort();
			if (stream.socket && !stream.socket.destroyed) stream.socket.destroy();
			process.nextTick(emitErrorAndClose, websocket, err);
		} else {
			stream.destroy(err);
			stream.once("error", websocket.emit.bind(websocket, "error"));
			stream.once("close", websocket.emitClose.bind(websocket));
		}
	}
	/**
	* Handle cases where the `ping()`, `pong()`, or `send()` methods are called
	* when the `readyState` attribute is `CLOSING` or `CLOSED`.
	*
	* @param {WebSocket} websocket The WebSocket instance
	* @param {*} [data] The data to send
	* @param {Function} [cb] Callback
	* @private
	*/
	function sendAfterClose(websocket, data, cb) {
		if (data) {
			const length = isBlob(data) ? data.size : toBuffer(data).length;
			if (websocket._socket) websocket._sender._bufferedBytes += length;
			else websocket._bufferedAmount += length;
		}
		if (cb) {
			const err = /* @__PURE__ */ new Error(`WebSocket is not open: readyState ${websocket.readyState} (${readyStates[websocket.readyState]})`);
			process.nextTick(cb, err);
		}
	}
	/**
	* The listener of the `Receiver` `'conclude'` event.
	*
	* @param {Number} code The status code
	* @param {Buffer} reason The reason for closing
	* @private
	*/
	function receiverOnConclude(code, reason) {
		const websocket = this[kWebSocket];
		websocket._closeFrameReceived = true;
		websocket._closeMessage = reason;
		websocket._closeCode = code;
		if (websocket._socket[kWebSocket] === void 0) return;
		websocket._socket.removeListener("data", socketOnData);
		process.nextTick(resume, websocket._socket);
		if (code === 1005) websocket.close();
		else websocket.close(code, reason);
	}
	/**
	* The listener of the `Receiver` `'drain'` event.
	*
	* @private
	*/
	function receiverOnDrain() {
		const websocket = this[kWebSocket];
		if (!websocket.isPaused) websocket._socket.resume();
	}
	/**
	* The listener of the `Receiver` `'error'` event.
	*
	* @param {(RangeError|Error)} err The emitted error
	* @private
	*/
	function receiverOnError(err) {
		const websocket = this[kWebSocket];
		if (websocket._socket[kWebSocket] !== void 0) {
			websocket._socket.removeListener("data", socketOnData);
			process.nextTick(resume, websocket._socket);
			websocket.close(err[kStatusCode]);
		}
		if (!websocket._errorEmitted) {
			websocket._errorEmitted = true;
			websocket.emit("error", err);
		}
	}
	/**
	* The listener of the `Receiver` `'finish'` event.
	*
	* @private
	*/
	function receiverOnFinish() {
		this[kWebSocket].emitClose();
	}
	/**
	* The listener of the `Receiver` `'message'` event.
	*
	* @param {Buffer|ArrayBuffer|Buffer[])} data The message
	* @param {Boolean} isBinary Specifies whether the message is binary or not
	* @private
	*/
	function receiverOnMessage(data, isBinary) {
		this[kWebSocket].emit("message", data, isBinary);
	}
	/**
	* The listener of the `Receiver` `'ping'` event.
	*
	* @param {Buffer} data The data included in the ping frame
	* @private
	*/
	function receiverOnPing(data) {
		const websocket = this[kWebSocket];
		if (websocket._autoPong) websocket.pong(data, !this._isServer, NOOP);
		websocket.emit("ping", data);
	}
	/**
	* The listener of the `Receiver` `'pong'` event.
	*
	* @param {Buffer} data The data included in the pong frame
	* @private
	*/
	function receiverOnPong(data) {
		this[kWebSocket].emit("pong", data);
	}
	/**
	* Resume a readable stream
	*
	* @param {Readable} stream The readable stream
	* @private
	*/
	function resume(stream) {
		stream.resume();
	}
	/**
	* The `Sender` error event handler.
	*
	* @param {Error} The error
	* @private
	*/
	function senderOnError(err) {
		const websocket = this[kWebSocket];
		if (websocket.readyState === WebSocket.CLOSED) return;
		if (websocket.readyState === WebSocket.OPEN) {
			websocket._readyState = WebSocket.CLOSING;
			setCloseTimer(websocket);
		}
		this._socket.end();
		if (!websocket._errorEmitted) {
			websocket._errorEmitted = true;
			websocket.emit("error", err);
		}
	}
	/**
	* Set a timer to destroy the underlying raw socket of a WebSocket.
	*
	* @param {WebSocket} websocket The WebSocket instance
	* @private
	*/
	function setCloseTimer(websocket) {
		websocket._closeTimer = setTimeout(websocket._socket.destroy.bind(websocket._socket), websocket._closeTimeout);
	}
	/**
	* The listener of the socket `'close'` event.
	*
	* @private
	*/
	function socketOnClose() {
		const websocket = this[kWebSocket];
		this.removeListener("close", socketOnClose);
		this.removeListener("data", socketOnData);
		this.removeListener("end", socketOnEnd);
		websocket._readyState = WebSocket.CLOSING;
		if (!this._readableState.endEmitted && !websocket._closeFrameReceived && !websocket._receiver._writableState.errorEmitted && this._readableState.length !== 0) {
			const chunk = this.read(this._readableState.length);
			websocket._receiver.write(chunk);
		}
		websocket._receiver.end();
		this[kWebSocket] = void 0;
		clearTimeout(websocket._closeTimer);
		if (websocket._receiver._writableState.finished || websocket._receiver._writableState.errorEmitted) websocket.emitClose();
		else {
			websocket._receiver.on("error", receiverOnFinish);
			websocket._receiver.on("finish", receiverOnFinish);
		}
	}
	/**
	* The listener of the socket `'data'` event.
	*
	* @param {Buffer} chunk A chunk of data
	* @private
	*/
	function socketOnData(chunk) {
		if (!this[kWebSocket]._receiver.write(chunk)) this.pause();
	}
	/**
	* The listener of the socket `'end'` event.
	*
	* @private
	*/
	function socketOnEnd() {
		const websocket = this[kWebSocket];
		websocket._readyState = WebSocket.CLOSING;
		websocket._receiver.end();
		this.end();
	}
	/**
	* The listener of the socket `'error'` event.
	*
	* @private
	*/
	function socketOnError() {
		const websocket = this[kWebSocket];
		this.removeListener("error", socketOnError);
		this.on("error", NOOP);
		if (websocket) {
			websocket._readyState = WebSocket.CLOSING;
			this.destroy();
		}
	}
}));
//#endregion
//#region ../../node_modules/.pnpm/ws@8.22.0/node_modules/ws/lib/stream.js
var require_stream = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	require_websocket();
	var { Duplex: Duplex$1 } = __require("stream");
	/**
	* Emits the `'close'` event on a stream.
	*
	* @param {Duplex} stream The stream.
	* @private
	*/
	function emitClose(stream) {
		stream.emit("close");
	}
	/**
	* The listener of the `'end'` event.
	*
	* @private
	*/
	function duplexOnEnd() {
		if (!this.destroyed && this._writableState.finished) this.destroy();
	}
	/**
	* The listener of the `'error'` event.
	*
	* @param {Error} err The error
	* @private
	*/
	function duplexOnError(err) {
		this.removeListener("error", duplexOnError);
		this.destroy();
		if (this.listenerCount("error") === 0) this.emit("error", err);
	}
	/**
	* Wraps a `WebSocket` in a duplex stream.
	*
	* @param {WebSocket} ws The `WebSocket` to wrap
	* @param {Object} [options] The options for the `Duplex` constructor
	* @return {Duplex} The duplex stream
	* @public
	*/
	function createWebSocketStream(ws, options) {
		let terminateOnDestroy = true;
		const duplex = new Duplex$1({
			...options,
			autoDestroy: false,
			emitClose: false,
			objectMode: false,
			writableObjectMode: false
		});
		ws.on("message", function message(msg, isBinary) {
			const data = !isBinary && duplex._readableState.objectMode ? msg.toString() : msg;
			if (!duplex.push(data)) ws.pause();
		});
		ws.once("error", function error(err) {
			if (duplex.destroyed) return;
			terminateOnDestroy = false;
			duplex.destroy(err);
		});
		ws.once("close", function close() {
			if (duplex.destroyed) return;
			duplex.push(null);
		});
		duplex._destroy = function(err, callback) {
			if (ws.readyState === ws.CLOSED) {
				callback(err);
				process.nextTick(emitClose, duplex);
				return;
			}
			let called = false;
			ws.once("error", function error(err) {
				called = true;
				callback(err);
			});
			ws.once("close", function close() {
				if (!called) callback(err);
				process.nextTick(emitClose, duplex);
			});
			if (terminateOnDestroy) ws.terminate();
		};
		duplex._final = function(callback) {
			if (ws.readyState === ws.CONNECTING) {
				ws.once("open", function open() {
					duplex._final(callback);
				});
				return;
			}
			if (ws._socket === null) return;
			if (ws._socket._writableState.finished) {
				callback();
				if (duplex._readableState.endEmitted) duplex.destroy();
			} else {
				ws._socket.once("finish", function finish() {
					callback();
				});
				ws.close();
			}
		};
		duplex._read = function() {
			if (ws.isPaused) ws.resume();
		};
		duplex._write = function(chunk, encoding, callback) {
			if (ws.readyState === ws.CONNECTING) {
				ws.once("open", function open() {
					duplex._write(chunk, encoding, callback);
				});
				return;
			}
			ws.send(chunk, callback);
		};
		duplex.on("end", duplexOnEnd);
		duplex.on("error", duplexOnError);
		return duplex;
	}
	module.exports = createWebSocketStream;
}));
//#endregion
//#region ../../node_modules/.pnpm/ws@8.22.0/node_modules/ws/lib/subprotocol.js
var require_subprotocol = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var { tokenChars } = require_validation();
	/**
	* Parses the `Sec-WebSocket-Protocol` header into a set of subprotocol names.
	*
	* @param {String} header The field value of the header
	* @return {Set} The subprotocol names
	* @public
	*/
	function parse(header) {
		const protocols = /* @__PURE__ */ new Set();
		let start = -1;
		let end = -1;
		let i = 0;
		for (; i < header.length; i++) {
			const code = header.charCodeAt(i);
			if (end === -1 && tokenChars[code] === 1) {
				if (start === -1) start = i;
			} else if (i !== 0 && (code === 32 || code === 9)) {
				if (end === -1 && start !== -1) end = i;
			} else if (code === 44) {
				if (start === -1) throw new SyntaxError(`Unexpected character at index ${i}`);
				if (end === -1) end = i;
				const protocol = header.slice(start, end);
				if (protocols.has(protocol)) throw new SyntaxError(`The "${protocol}" subprotocol is duplicated`);
				protocols.add(protocol);
				start = end = -1;
			} else throw new SyntaxError(`Unexpected character at index ${i}`);
		}
		if (start === -1 || end !== -1) throw new SyntaxError("Unexpected end of input");
		const protocol = header.slice(start, i);
		if (protocols.has(protocol)) throw new SyntaxError(`The "${protocol}" subprotocol is duplicated`);
		protocols.add(protocol);
		return protocols;
	}
	module.exports = { parse };
}));
//#endregion
//#region ../../node_modules/.pnpm/ws@8.22.0/node_modules/ws/lib/websocket-server.js
var require_websocket_server = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var EventEmitter = __require("events");
	var http = __require("http");
	var { Duplex } = __require("stream");
	var { createHash: createHash$1 } = __require("crypto");
	var extension = require_extension();
	var PerMessageDeflate = require_permessage_deflate();
	var subprotocol = require_subprotocol();
	var WebSocket = require_websocket();
	var { CLOSE_TIMEOUT, GUID, kWebSocket } = require_constants();
	var keyRegex = /^[+/0-9A-Za-z]{22}==$/;
	var RUNNING = 0;
	var CLOSING = 1;
	var CLOSED = 2;
	/**
	* Class representing a WebSocket server.
	*
	* @extends EventEmitter
	*/
	var WebSocketServer = class extends EventEmitter {
		/**
		* Create a `WebSocketServer` instance.
		*
		* @param {Object} options Configuration options
		* @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
		*     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
		*     multiple times in the same tick
		* @param {Boolean} [options.autoPong=true] Specifies whether or not to
		*     automatically send a pong in response to a ping
		* @param {Number} [options.backlog=511] The maximum length of the queue of
		*     pending connections
		* @param {Boolean} [options.clientTracking=true] Specifies whether or not to
		*     track clients
		* @param {Number} [options.closeTimeout=30000] Duration in milliseconds to
		*     wait for the closing handshake to finish after `websocket.close()` is
		*     called
		* @param {Function} [options.handleProtocols] A hook to handle protocols
		* @param {String} [options.host] The hostname where to bind the server
		* @param {Number} [options.maxBufferedChunks=262144] The maximum number of
		*     buffered data chunks
		* @param {Number} [options.maxFragments=16384] The maximum number of message
		*     fragments
		* @param {Number} [options.maxPayload=104857600] The maximum allowed message
		*     size
		* @param {Boolean} [options.noServer=false] Enable no server mode
		* @param {String} [options.path] Accept only connections matching this path
		* @param {(Boolean|Object)} [options.perMessageDeflate=false] Enable/disable
		*     permessage-deflate
		* @param {Number} [options.port] The port where to bind the server
		* @param {(http.Server|https.Server)} [options.server] A pre-created HTTP/S
		*     server to use
		* @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
		*     not to skip UTF-8 validation for text and close messages
		* @param {Function} [options.verifyClient] A hook to reject connections
		* @param {Function} [options.WebSocket=WebSocket] Specifies the `WebSocket`
		*     class to use. It must be the `WebSocket` class or class that extends it
		* @param {Function} [callback] A listener for the `listening` event
		*/
		constructor(options, callback) {
			super();
			options = {
				allowSynchronousEvents: true,
				autoPong: true,
				maxBufferedChunks: 262144,
				maxFragments: 16384,
				maxPayload: 104857600,
				skipUTF8Validation: false,
				perMessageDeflate: false,
				handleProtocols: null,
				clientTracking: true,
				closeTimeout: CLOSE_TIMEOUT,
				verifyClient: null,
				noServer: false,
				backlog: null,
				server: null,
				host: null,
				path: null,
				port: null,
				WebSocket,
				...options
			};
			if (options.port == null && !options.server && !options.noServer || options.port != null && (options.server || options.noServer) || options.server && options.noServer) throw new TypeError("One and only one of the \"port\", \"server\", or \"noServer\" options must be specified");
			if (options.port != null) {
				this._server = http.createServer((req, res) => {
					const body = http.STATUS_CODES[426];
					res.writeHead(426, {
						"Content-Length": body.length,
						"Content-Type": "text/plain"
					});
					res.end(body);
				});
				this._server.listen(options.port, options.host, options.backlog, callback);
			} else if (options.server) this._server = options.server;
			if (this._server) {
				const emitConnection = this.emit.bind(this, "connection");
				this._removeListeners = addListeners(this._server, {
					listening: this.emit.bind(this, "listening"),
					error: this.emit.bind(this, "error"),
					upgrade: (req, socket, head) => {
						this.handleUpgrade(req, socket, head, emitConnection);
					}
				});
			}
			if (options.perMessageDeflate === true) options.perMessageDeflate = {};
			if (options.clientTracking) {
				this.clients = /* @__PURE__ */ new Set();
				this._shouldEmitClose = false;
			}
			this.options = options;
			this._state = RUNNING;
		}
		/**
		* Returns the bound address, the address family name, and port of the server
		* as reported by the operating system if listening on an IP socket.
		* If the server is listening on a pipe or UNIX domain socket, the name is
		* returned as a string.
		*
		* @return {(Object|String|null)} The address of the server
		* @public
		*/
		address() {
			if (this.options.noServer) throw new Error("The server is operating in \"noServer\" mode");
			if (!this._server) return null;
			return this._server.address();
		}
		/**
		* Stop the server from accepting new connections and emit the `'close'` event
		* when all existing connections are closed.
		*
		* @param {Function} [cb] A one-time listener for the `'close'` event
		* @public
		*/
		close(cb) {
			if (this._state === CLOSED) {
				if (cb) this.once("close", () => {
					cb(/* @__PURE__ */ new Error("The server is not running"));
				});
				process.nextTick(emitClose, this);
				return;
			}
			if (cb) this.once("close", cb);
			if (this._state === CLOSING) return;
			this._state = CLOSING;
			if (this.options.noServer || this.options.server) {
				if (this._server) {
					this._removeListeners();
					this._removeListeners = this._server = null;
				}
				if (this.clients) {
					if (!this.clients.size) process.nextTick(emitClose, this);
					else this._shouldEmitClose = true;
				} else process.nextTick(emitClose, this);
			} else {
				const server = this._server;
				this._removeListeners();
				this._removeListeners = this._server = null;
				server.close(() => {
					emitClose(this);
				});
			}
		}
		/**
		* See if a given request should be handled by this server instance.
		*
		* @param {http.IncomingMessage} req Request object to inspect
		* @return {Boolean} `true` if the request is valid, else `false`
		* @public
		*/
		shouldHandle(req) {
			if (this.options.path) {
				const index = req.url.indexOf("?");
				if ((index !== -1 ? req.url.slice(0, index) : req.url) !== this.options.path) return false;
			}
			return true;
		}
		/**
		* Handle a HTTP Upgrade request.
		*
		* @param {http.IncomingMessage} req The request object
		* @param {Duplex} socket The network socket between the server and client
		* @param {Buffer} head The first packet of the upgraded stream
		* @param {Function} cb Callback
		* @public
		*/
		handleUpgrade(req, socket, head, cb) {
			socket.on("error", socketOnError);
			const key = req.headers["sec-websocket-key"];
			const upgrade = req.headers.upgrade;
			const version = +req.headers["sec-websocket-version"];
			if (req.method !== "GET") {
				abortHandshakeOrEmitwsClientError(this, req, socket, 405, "Invalid HTTP method");
				return;
			}
			if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
				abortHandshakeOrEmitwsClientError(this, req, socket, 400, "Invalid Upgrade header");
				return;
			}
			if (key === void 0 || !keyRegex.test(key)) {
				abortHandshakeOrEmitwsClientError(this, req, socket, 400, "Missing or invalid Sec-WebSocket-Key header");
				return;
			}
			if (version !== 13 && version !== 8) {
				abortHandshakeOrEmitwsClientError(this, req, socket, 400, "Missing or invalid Sec-WebSocket-Version header", { "Sec-WebSocket-Version": "13, 8" });
				return;
			}
			if (!this.shouldHandle(req)) {
				abortHandshake(socket, 400);
				return;
			}
			const secWebSocketProtocol = req.headers["sec-websocket-protocol"];
			let protocols = /* @__PURE__ */ new Set();
			if (secWebSocketProtocol !== void 0) try {
				protocols = subprotocol.parse(secWebSocketProtocol);
			} catch (err) {
				abortHandshakeOrEmitwsClientError(this, req, socket, 400, "Invalid Sec-WebSocket-Protocol header");
				return;
			}
			const secWebSocketExtensions = req.headers["sec-websocket-extensions"];
			const extensions = {};
			if (this.options.perMessageDeflate && secWebSocketExtensions !== void 0) {
				const perMessageDeflate = new PerMessageDeflate({
					...this.options.perMessageDeflate,
					isServer: true,
					maxPayload: this.options.maxPayload
				});
				try {
					const offers = extension.parse(secWebSocketExtensions);
					if (offers[PerMessageDeflate.extensionName]) {
						perMessageDeflate.accept(offers[PerMessageDeflate.extensionName]);
						extensions[PerMessageDeflate.extensionName] = perMessageDeflate;
					}
				} catch (err) {
					abortHandshakeOrEmitwsClientError(this, req, socket, 400, "Invalid or unacceptable Sec-WebSocket-Extensions header");
					return;
				}
			}
			if (this.options.verifyClient) {
				const info = {
					origin: req.headers[`${version === 8 ? "sec-websocket-origin" : "origin"}`],
					secure: !!(req.socket.authorized || req.socket.encrypted),
					req
				};
				if (this.options.verifyClient.length === 2) {
					this.options.verifyClient(info, (verified, code, message, headers) => {
						if (!verified) return abortHandshake(socket, code || 401, message, headers);
						this.completeUpgrade(extensions, key, protocols, req, socket, head, cb);
					});
					return;
				}
				if (!this.options.verifyClient(info)) return abortHandshake(socket, 401);
			}
			this.completeUpgrade(extensions, key, protocols, req, socket, head, cb);
		}
		/**
		* Upgrade the connection to WebSocket.
		*
		* @param {Object} extensions The accepted extensions
		* @param {String} key The value of the `Sec-WebSocket-Key` header
		* @param {Set} protocols The subprotocols
		* @param {http.IncomingMessage} req The request object
		* @param {Duplex} socket The network socket between the server and client
		* @param {Buffer} head The first packet of the upgraded stream
		* @param {Function} cb Callback
		* @throws {Error} If called more than once with the same socket
		* @private
		*/
		completeUpgrade(extensions, key, protocols, req, socket, head, cb) {
			if (!socket.readable || !socket.writable) return socket.destroy();
			if (socket[kWebSocket]) throw new Error("server.handleUpgrade() was called more than once with the same socket, possibly due to a misconfiguration");
			if (this._state > RUNNING) return abortHandshake(socket, 503);
			const headers = [
				"HTTP/1.1 101 Switching Protocols",
				"Upgrade: websocket",
				"Connection: Upgrade",
				`Sec-WebSocket-Accept: ${createHash$1("sha1").update(key + GUID).digest("base64")}`
			];
			const ws = new this.options.WebSocket(null, void 0, this.options);
			if (protocols.size) {
				const protocol = this.options.handleProtocols ? this.options.handleProtocols(protocols, req) : protocols.values().next().value;
				if (protocol) {
					headers.push(`Sec-WebSocket-Protocol: ${protocol}`);
					ws._protocol = protocol;
				}
			}
			if (extensions[PerMessageDeflate.extensionName]) {
				const params = extensions[PerMessageDeflate.extensionName].params;
				const value = extension.format({ [PerMessageDeflate.extensionName]: [params] });
				headers.push(`Sec-WebSocket-Extensions: ${value}`);
				ws._extensions = extensions;
			}
			this.emit("headers", headers, req);
			socket.write(headers.concat("\r\n").join("\r\n"));
			socket.removeListener("error", socketOnError);
			ws.setSocket(socket, head, {
				allowSynchronousEvents: this.options.allowSynchronousEvents,
				maxBufferedChunks: this.options.maxBufferedChunks,
				maxFragments: this.options.maxFragments,
				maxPayload: this.options.maxPayload,
				skipUTF8Validation: this.options.skipUTF8Validation
			});
			if (this.clients) {
				this.clients.add(ws);
				ws.on("close", () => {
					this.clients.delete(ws);
					if (this._shouldEmitClose && !this.clients.size) process.nextTick(emitClose, this);
				});
			}
			cb(ws, req);
		}
	};
	module.exports = WebSocketServer;
	/**
	* Add event listeners on an `EventEmitter` using a map of <event, listener>
	* pairs.
	*
	* @param {EventEmitter} server The event emitter
	* @param {Object.<String, Function>} map The listeners to add
	* @return {Function} A function that will remove the added listeners when
	*     called
	* @private
	*/
	function addListeners(server, map) {
		for (const event of Object.keys(map)) server.on(event, map[event]);
		return function removeListeners() {
			for (const event of Object.keys(map)) server.removeListener(event, map[event]);
		};
	}
	/**
	* Emit a `'close'` event on an `EventEmitter`.
	*
	* @param {EventEmitter} server The event emitter
	* @private
	*/
	function emitClose(server) {
		server._state = CLOSED;
		server.emit("close");
	}
	/**
	* Handle socket errors.
	*
	* @private
	*/
	function socketOnError() {
		this.destroy();
	}
	/**
	* Close the connection when preconditions are not fulfilled.
	*
	* @param {Duplex} socket The socket of the upgrade request
	* @param {Number} code The HTTP response status code
	* @param {String} [message] The HTTP response body
	* @param {Object} [headers] Additional HTTP response headers
	* @private
	*/
	function abortHandshake(socket, code, message, headers) {
		message = message || http.STATUS_CODES[code];
		headers = {
			Connection: "close",
			"Content-Type": "text/html",
			"Content-Length": Buffer.byteLength(message),
			...headers
		};
		socket.once("finish", socket.destroy);
		socket.end(`HTTP/1.1 ${code} ${http.STATUS_CODES[code]}\r\n` + Object.keys(headers).map((h) => `${h}: ${headers[h]}`).join("\r\n") + "\r\n\r\n" + message);
	}
	/**
	* Emit a `'wsClientError'` event on a `WebSocketServer` if there is at least
	* one listener for it, otherwise call `abortHandshake()`.
	*
	* @param {WebSocketServer} server The WebSocket server
	* @param {http.IncomingMessage} req The request object
	* @param {Duplex} socket The socket of the upgrade request
	* @param {Number} code The HTTP response status code
	* @param {String} message The HTTP response body
	* @param {Object} [headers] The HTTP response headers
	* @private
	*/
	function abortHandshakeOrEmitwsClientError(server, req, socket, code, message, headers) {
		if (server.listenerCount("wsClientError")) {
			const err = new Error(message);
			Error.captureStackTrace(err, abortHandshakeOrEmitwsClientError);
			server.emit("wsClientError", err, socket, req);
		} else abortHandshake(socket, code, message, headers);
	}
}));
require_stream();
require_extension();
require_permessage_deflate();
require_receiver();
require_sender();
require_subprotocol();
require_websocket();
var import_websocket_server = /* @__PURE__ */ __toESM(require_websocket_server(), 1);
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
* websites and DNS rebinding cannot reach it. No website may show its pages in a frame, where the user could not see a
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
			if (!allowed(request) || address?.pathname !== "/core/2" || request.headers.origin !== `http://${request.headers.host}`) {
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
* a process that lingers with its pid, as a zombie or a pid used again, counts as stopped after a while.
*/
async function waitStopped(userData, kind, info, timeoutMs) {
	const deadline = Date.now() + timeoutMs;
	let goneSince = null;
	for (;;) {
		if (!isRunning(info.pid)) return true;
		if (goneSince === null) {
			if ((await readBridgeInfo(userData, kind))?.token !== info.token && !await listens(info.socket)) goneSince = Date.now();
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
	const startServe = async () => {
		let failure = await detach();
		if (failure?.includes(" is in use.")) failure = await detach(await anyFreePort());
		if (failure !== null) throw new Error(failure);
	};
	const { serveMcp } = await import("./arcue-BrTBxSiV.js");
	await serveMcp({
		userData: userDataDir(env),
		view: sessionView(env, command.view),
		cwd,
		importWorkerEntry: options.importWorkerEntry ?? bundledImportWorker,
		startServe,
		version: await buildOf(options) ?? "dev"
	});
	return 0;
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
