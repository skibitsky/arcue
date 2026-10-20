#!/usr/bin/env node
import { A as memberRoles, B as rangesWithin, C as COMPOSITION_FILE_NAME, D as compositionFileSchema, E as animatesModel, F as lastFrame, G as sameTopology, H as parseStoredPath, J as findNode, L as countInRanges, O as joinsByName, Q as importWarning, R as decodeRanges, S as screenshotOwner, T as MODEL_FILE_EXTENSIONS, U as fileNameOf, V as materialSlots, W as imageMimeType, X as splitMemberPath, Y as memberPath, Z as describeTextureUses, _ as reviewFormat, _t as framedChannel, a as isQueryName, at as TEXTURE_REF_NAMES, b as settingsSchema, bt as ArcueError, c as importReadFileInputSchema, ct as BRIDGE_INFO_FILE, d as createPeer, f as withTransfer, ft as acceptBridge, g as reviewFileSchema, gt as MAX_FRAME_BYTES, h as reportListenerError, ht as launchInfoSchema, i as roundDataSchema, it as TEXTURE_REF_KEYS, j as viewStateSchema, k as keysModelBones, l as importRequests, lt as HANDSHAKE_MAX_FRAME_BYTES, m as callEach, mt as connectBridge, n as binaryFrameCodec, nt as knownPartView, o as queries, ot as TEXTURE_SLOTS, p as isEnvelope, pt as bridgeInfoSchema, q as composeScene, r as jsonFrameCodec, rt as shownByDefault, s as importFindFileInputSchema, t as portEndpoint, tt as isDefaultPartView, ut as LAUNCH_INFO_FILE, v as commands, vt as framedEndpoint, w as IMAGE_FILE_EXTENSIONS, x as warningId, xt as COMMENT_ID_PATTERN, y as isCommandName, yt as messageChannel, z as encodeRanges } from "./arcue-Cwht77Mb.js";
import { createRequire } from "node:module";
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, rmdir, stat, writeFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { spawn } from "node:child_process";
import { connect, createServer } from "node:net";
import { homedir, tmpdir } from "node:os";
import { randomBytes, randomUUID } from "node:crypto";
import { MessageChannel, Worker } from "node:worker_threads";
import { createReadStream, unwatchFile, watch, watchFile } from "node:fs";
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
//#region ../../packages/scene/src/geometry.ts
/** A mesh's triangles in source vertex numbers, three per triangle, for queries against `restPositions`. */
function sourceIndices(indices, sourceVertex) {
	return indices.map((rendered) => {
		const source = sourceVertex[rendered];
		if (source === void 0) throw new RangeError(`Rendered vertex ${rendered} has no source vertex.`);
		return source;
	});
}
/**
* The point on a mesh's surface closest to `point`, checking every triangle. `positions` holds xyz per vertex and
* `indices` three vertex numbers per triangle. Null when the mesh has no triangles.
*/
function closestSurfacePoint(positions, indices, point) {
	const vertexCount = Math.floor(positions.length / 3);
	for (const index of indices) if (index >= vertexCount) throw new RangeError(`Vertex ${index} is out of range.`);
	const [px, py, pz] = point;
	const weights = [
		0,
		0,
		0
	];
	let bestTriangle = -1;
	let bestSquared = Infinity;
	let best = [
		0,
		0,
		0
	];
	for (let triangle = 0; triangle * 3 + 2 < indices.length; triangle++) {
		const a = (indices[triangle * 3] ?? 0) * 3;
		const b = (indices[triangle * 3 + 1] ?? 0) * 3;
		const c = (indices[triangle * 3 + 2] ?? 0) * 3;
		const ax = positions[a] ?? 0;
		const ay = positions[a + 1] ?? 0;
		const az = positions[a + 2] ?? 0;
		const bx = positions[b] ?? 0;
		const by = positions[b + 1] ?? 0;
		const bz = positions[b + 2] ?? 0;
		const cx = positions[c] ?? 0;
		const cy = positions[c + 1] ?? 0;
		const cz = positions[c + 2] ?? 0;
		closestWeights(px, py, pz, ax, ay, az, bx, by, bz, cx, cy, cz, weights);
		const [u, v, w] = weights;
		const dx = u * ax + v * bx + w * cx - px;
		const dy = u * ay + v * by + w * cy - py;
		const dz = u * az + v * bz + w * cz - pz;
		const squared = dx * dx + dy * dy + dz * dz;
		if (squared < bestSquared) {
			bestSquared = squared;
			bestTriangle = triangle;
			best = [
				u,
				v,
				w
			];
		}
	}
	if (bestTriangle < 0) return null;
	const corner = (k, axis) => positions[(indices[bestTriangle * 3 + k] ?? 0) * 3 + axis] ?? 0;
	const mix = (axis) => best[0] * corner(0, axis) + best[1] * corner(1, axis) + best[2] * corner(2, axis);
	return {
		triangle: bestTriangle,
		weights: best,
		point: [
			mix(0),
			mix(1),
			mix(2)
		],
		distance: Math.sqrt(bestSquared)
	};
}
/** The vertex nearest to `point`. Null when there are no vertices. */
function nearestVertex(positions, point) {
	const [px, py, pz] = point;
	let bestVertex = -1;
	let bestSquared = Infinity;
	for (let vertex = 0; vertex * 3 + 2 < positions.length; vertex++) {
		const dx = (positions[vertex * 3] ?? 0) - px;
		const dy = (positions[vertex * 3 + 1] ?? 0) - py;
		const dz = (positions[vertex * 3 + 2] ?? 0) - pz;
		const squared = dx * dx + dy * dy + dz * dz;
		if (squared < bestSquared) {
			bestSquared = squared;
			bestVertex = vertex;
		}
	}
	return bestVertex < 0 ? null : {
		vertex: bestVertex,
		distance: Math.sqrt(bestSquared)
	};
}
function assign(out, u, v, w) {
	out[0] = u;
	out[1] = v;
	out[2] = w;
	return out;
}
function closestWeights(px, py, pz, ax, ay, az, bx, by, bz, cx, cy, cz, out) {
	const abx = bx - ax;
	const aby = by - ay;
	const abz = bz - az;
	const acx = cx - ax;
	const acy = cy - ay;
	const acz = cz - az;
	const dot = (x, y, z, ux, uy, uz) => x * ux + y * uy + z * uz;
	const d1 = dot(abx, aby, abz, px - ax, py - ay, pz - az);
	const d2 = dot(acx, acy, acz, px - ax, py - ay, pz - az);
	if (d1 <= 0 && d2 <= 0) return assign(out, 1, 0, 0);
	const d3 = dot(abx, aby, abz, px - bx, py - by, pz - bz);
	const d4 = dot(acx, acy, acz, px - bx, py - by, pz - bz);
	if (d3 >= 0 && d4 <= d3) return assign(out, 0, 1, 0);
	const vc = d1 * d4 - d3 * d2;
	if (vc <= 0 && d1 >= 0 && d3 <= 0) {
		const v = d1 / (d1 - d3);
		return assign(out, 1 - v, v, 0);
	}
	const d5 = dot(abx, aby, abz, px - cx, py - cy, pz - cz);
	const d6 = dot(acx, acy, acz, px - cx, py - cy, pz - cz);
	if (d6 >= 0 && d5 <= d6) return assign(out, 0, 0, 1);
	const vb = d5 * d2 - d1 * d6;
	if (vb <= 0 && d2 >= 0 && d6 <= 0) {
		const w = d2 / (d2 - d6);
		return assign(out, 1 - w, 0, w);
	}
	const va = d3 * d6 - d5 * d4;
	if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
		const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
		return assign(out, 0, 1 - w, w);
	}
	const sum = va + vb + vc;
	if (sum === 0) return assign(out, 1, 0, 0);
	const v = vb / sum;
	const w = vc / sum;
	return assign(out, 1 - v - w, v, w);
}
//#endregion
//#region ../../packages/scene/src/vertex-index.ts
var LEAF_SIZE = 16;
/** Exact nearest vertices of fixed positions, preserving source indices and choosing the lowest index on ties. */
var VertexIndex = class {
	#positions;
	#vertices;
	#root;
	constructor(positions) {
		this.#positions = positions;
		const vertices = [];
		for (let vertex = 0; vertex * 3 + 2 < positions.length; vertex++) if ([
			0,
			1,
			2
		].every((axis) => Number.isFinite(positions[vertex * 3 + axis]))) vertices.push(vertex);
		this.#vertices = Uint32Array.from(vertices);
		this.#root = vertices.length > 0 ? this.#build(0, vertices.length) : null;
	}
	nearest(point) {
		if (!this.#root || !point.every(Number.isFinite)) return null;
		let bestVertex = -1;
		let bestSquared = Infinity;
		const accept = (vertex, squared) => {
			if (squared < bestSquared || squared === bestSquared && vertex < bestVertex) {
				bestVertex = vertex;
				bestSquared = squared;
			}
		};
		const visit = (node, distance) => {
			if (distance > bestSquared || distance === bestSquared && node.first >= bestVertex) return;
			if (node.min.every((value, axis) => value === node.max[axis])) {
				accept(node.first, distance);
				return;
			}
			if (!node.left || !node.right) {
				for (let index = node.start; index < node.end; index++) {
					const vertex = this.#vertices[index] ?? 0;
					const dx = (this.#positions[vertex * 3] ?? 0) - point[0];
					const dy = (this.#positions[vertex * 3 + 1] ?? 0) - point[1];
					const dz = (this.#positions[vertex * 3 + 2] ?? 0) - point[2];
					accept(vertex, dx * dx + dy * dy + dz * dz);
				}
				return;
			}
			const leftDistance = boxDistance(node.left, point);
			const rightDistance = boxDistance(node.right, point);
			if (leftDistance <= rightDistance) {
				visit(node.left, leftDistance);
				visit(node.right, rightDistance);
			} else {
				visit(node.right, rightDistance);
				visit(node.left, leftDistance);
			}
		};
		visit(this.#root, boxDistance(this.#root, point));
		return bestVertex < 0 ? null : {
			vertex: bestVertex,
			distance: Math.sqrt(bestSquared)
		};
	}
	#build(start, end) {
		const min = [
			Infinity,
			Infinity,
			Infinity
		];
		const max = [
			-Infinity,
			-Infinity,
			-Infinity
		];
		let first = Infinity;
		for (let index = start; index < end; index++) {
			const vertex = this.#vertices[index] ?? 0;
			first = Math.min(first, vertex);
			for (let axis = 0; axis < 3; axis++) {
				const value = this.#positions[vertex * 3 + axis] ?? 0;
				min[axis] = Math.min(min[axis] ?? Infinity, value);
				max[axis] = Math.max(max[axis] ?? -Infinity, value);
			}
		}
		const node = {
			min,
			max,
			first,
			start,
			end,
			left: null,
			right: null
		};
		if (end - start <= LEAF_SIZE) return node;
		let axis = 0;
		for (let candidate = 1; candidate < 3; candidate++) if ((max[candidate] ?? 0) - (min[candidate] ?? 0) > (max[axis] ?? 0) - (min[axis] ?? 0)) axis = candidate;
		if (max[axis] === min[axis]) return node;
		this.#vertices.subarray(start, end).sort((a, b) => (this.#positions[a * 3 + axis] ?? 0) - (this.#positions[b * 3 + axis] ?? 0) || a - b);
		const middle = start + end >>> 1;
		node.left = this.#build(start, middle);
		node.right = this.#build(middle, end);
		return node;
	}
};
function boxDistance(node, point) {
	let squared = 0;
	for (let axis = 0; axis < 3; axis++) {
		const value = point[axis] ?? 0;
		const delta = Math.max((node.min[axis] ?? 0) - value, 0, value - (node.max[axis] ?? 0));
		squared += delta * delta;
	}
	return squared;
}
//#endregion
//#region ../../packages/protocol/src/transport/remote-client.ts
/**
* A `CoreClient` that sends every call through a peer to the core on the other side. It is "connected" until the
* peer closes, then "closed"; a host that reconnects wraps it to report "reconnecting".
*/
function createRemoteClient(peer, options = {}) {
	const onListenerError = options.onListenerError ?? reportListenerError;
	const listeners = /* @__PURE__ */ new Map();
	const connectionListeners = /* @__PURE__ */ new Set();
	let connectionState = "connected";
	peer.onEvent((name, payload) => {
		callEach(listeners.get(name) ?? [], [payload], onListenerError);
	});
	peer.onClose(() => {
		connectionState = "closed";
		callEach(connectionListeners, ["closed"], onListenerError);
	});
	return {
		get connectionState() {
			return connectionState;
		},
		onConnectionChange(listener) {
			connectionListeners.add(listener);
			return () => {
				connectionListeners.delete(listener);
			};
		},
		execute(name, input) {
			return peer.request("command", name, input);
		},
		query(name, input) {
			return peer.request("query", name, input);
		},
		subscribe(name, listener) {
			const forName = listeners.get(name) ?? /* @__PURE__ */ new Set();
			listeners.set(name, forName);
			const entry = (payload) => listener(payload);
			forName.add(entry);
			return () => {
				forName.delete(entry);
			};
		}
	};
}
//#endregion
//#region ../../packages/platform-node/src/node-socket.ts
/** A socket error ends the stream, as its "close" event follows. */
function socketStream(socket) {
	socket.on("error", () => socket.destroy());
	return {
		write: (bytes) => {
			socket.write(bytes);
		},
		onData(listener) {
			socket.on("data", listener);
			return () => socket.off("data", listener);
		},
		onClose(listener) {
			const once = () => listener();
			socket.once("close", once);
			return () => socket.off("close", once);
		},
		close: () => socket.destroy()
	};
}
//#endregion
//#region ../../packages/platform-node/src/bridge-server.ts
/** macOS limits a Unix socket path to 104 bytes, Linux to 108. */
var MAX_SOCKET_PATH = 100;
var SOCKET_NAME = /^arcue-(\d+)-[0-9a-f]+\.sock$/;
/**
* Where the core listens, reachable only by this user: a Unix domain socket in a folder only the user can enter, or a
* named pipe with a new random name on each start, since any user can see pipe names. `bridge.json` names it.
*
* Each server gets its own socket, since a closing server removes its socket by path: a core that stops after another
* one took over `bridge.json`, as `arcue serve` does when the desktop app starts beside it, removes only its own.
* Sockets of processes that have ended are removed.
*/
async function bridgeAddress(userData, platform = process.platform, pid = process.pid) {
	if (platform === "win32") return {
		socket: `\\\\.\\pipe\\arcue-${randomBytes(16).toString("hex")}`,
		remove: async () => void 0
	};
	const name = `arcue-${pid}-${randomBytes(3).toString("hex")}.sock`;
	const inside = join(userData, "bridge");
	if (Buffer.byteLength(join(inside, name)) <= MAX_SOCKET_PATH) {
		await privateFolder(inside);
		await removeEndedSockets(inside);
		const socket = join(inside, name);
		await rm(socket, { force: true });
		return {
			socket,
			remove: () => rm(socket, { force: true })
		};
	}
	const folder = await mkdtemp(join(process.env.XDG_RUNTIME_DIR || tmpdir(), "arcue-"));
	return {
		socket: join(folder, name),
		remove: () => rm(folder, {
			recursive: true,
			force: true
		})
	};
}
async function removeEndedSockets(folder) {
	for (const entry of await readdir(folder)) {
		const pid = Number(SOCKET_NAME.exec(entry)?.[1]);
		if (pid > 0 && !isRunning(pid)) await rm(join(folder, entry), { force: true });
	}
}
function isRunning(pid) {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return error.code === "EPERM";
	}
}
async function privateFolder(path) {
	await mkdir(path, {
		recursive: true,
		mode: 448
	});
	const stats = await lstat(path);
	if (!stats.isDirectory() || stats.uid !== process.getuid?.()) throw new Error(`${path} is not a folder this user owns.`);
	await chmod(path, 448);
}
/**
* Listens for the command line on a local socket. Each connection must present the token from `bridge.json`, which
* only the user can read, and is then served with the caller "bridge", so internal commands are refused. A hello
* that names a user makes that user the author of what the connection does.
*/
async function startBridgeServer(options) {
	const infoPath = join(options.userData, BRIDGE_INFO_FILE);
	await mkdir(options.userData, {
		recursive: true,
		mode: 448
	});
	await rm(infoPath, { force: true });
	const address = await bridgeAddress(options.userData);
	const token = randomBytes(32).toString("base64url");
	let next = 1;
	const open = /* @__PURE__ */ new Set();
	const server = createServer((connection) => {
		open.add(connection);
		connection.once("close", () => open.delete(connection));
		const channel = framedChannel(socketStream(connection), jsonFrameCodec, { firstFrameMaxBytes: HANDSHAKE_MAX_FRAME_BYTES });
		acceptBridge(channel, {
			token,
			timeout: {
				ms: options.handshakeTimeoutMs ?? 5e3,
				setTimer: unrefTimer
			}
		}).then(({ endpoint, user }) => {
			options.core.connect(windowFirst(endpoint, options.ensureWindow), {
				connection: `bridge-${next++}`,
				caller: "bridge",
				user: () => user,
				onListenerError: options.onError
			});
		}, (error) => options.onError(error));
	});
	server.on("error", options.onError);
	const stopListening = async () => {
		const closed = new Promise((resolve) => server.close(() => resolve()));
		for (const connection of open) connection.destroy();
		await closed;
	};
	try {
		await listen$1(server, address.socket);
	} catch (error) {
		await address.remove();
		throw error;
	}
	const info = {
		version: 1,
		socket: address.socket,
		token,
		pid: process.pid,
		...options.url !== void 0 ? { url: options.url } : {}
	};
	const temporary = `${infoPath}.${process.pid}.tmp`;
	try {
		await writeFile(temporary, `${JSON.stringify(info)}\n`, { mode: 384 });
		await rename(temporary, infoPath);
	} catch (error) {
		await stopListening();
		await address.remove();
		await rm(temporary, { force: true }).catch(() => void 0);
		throw error;
	}
	return {
		info,
		async close() {
			await stopListening();
			if ((await readBridgeFile(infoPath))?.token === token) await rm(infoPath, { force: true });
			await address.remove();
		}
	};
}
/** What `bridge.json` holds now. Another core may have written it since. */
async function readBridgeFile(path) {
	try {
		const parsed = bridgeInfoSchema.safeParse(JSON.parse(await readFile(path, "utf8")));
		return parsed.success ? parsed.data : null;
	} catch {
		return null;
	}
}
function listen$1(server, path) {
	return new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(path, () => {
			server.off("error", reject);
			resolve();
		});
	});
}
function unrefTimer(delayMs, callback) {
	const handle = setTimeout(callback, delayMs);
	handle.unref();
	return () => clearTimeout(handle);
}
/** Holds back an "asset.open" request until a window is open, keeping every message in order. */
function windowFirst(endpoint, ensureWindow) {
	return {
		post: (message, transfer) => endpoint.post(message, transfer),
		onClose: (listener) => endpoint.onClose(listener),
		listen(listener) {
			let queue = Promise.resolve();
			return endpoint.listen((message) => {
				queue = queue.then(async () => {
					if (isEnvelope(message) && message.type === "request" && message.name === "asset.open") await ensureWindow().catch(() => void 0);
					listener(message);
				});
			});
		}
	};
}
//#endregion
//#region ../../packages/core/src/comment-ids.ts
var DIGITS = "0123456789abcdefghjkmnpqrstvwxyz";
var TIME_DIGITS = 10;
var RANDOM_DIGITS = 16;
var RANDOM_BYTES = 10;
var RANDOM_LIMIT = 1n << 80n;
/**
* Makes comment ids that two people working apart never both make: "c" and a lowercase ULID, such as
* "c01m4gp93004tff59tdwh9edd1r". The first ten digits are the time in milliseconds and the other sixteen are random.
* An id made in the same millisecond as the one before, or while the clock goes back, counts up from that one instead,
* so the ids of one source sort in the order it made them.
*/
var CommentIds = class {
	#fill;
	#time = -1;
	#random = 0n;
	constructor(fill = (bytes) => crypto.getRandomValues(bytes)) {
		this.#fill = fill;
	}
	next(nowMs) {
		const now = Math.max(0, Math.floor(nowMs));
		if (now > this.#time) {
			this.#time = now;
			this.#random = this.#randomValue();
		} else {
			this.#random += 1n;
			if (this.#random >= RANDOM_LIMIT) {
				this.#time += 1;
				this.#random = this.#randomValue();
			}
		}
		return `c${encode(BigInt(this.#time), TIME_DIGITS)}${encode(this.#random, RANDOM_DIGITS)}`;
	}
	#randomValue() {
		const bytes = new Uint8Array(RANDOM_BYTES);
		this.#fill(bytes);
		return bytes.reduce((value, byte) => value << 8n | BigInt(byte), 0n);
	}
};
function encode(value, digits) {
	let text = "";
	let rest = value;
	for (let index = 0; index < digits; index++) {
		text = DIGITS.charAt(Number(rest & 31n)) + text;
		rest >>= 5n;
	}
	return text;
}
/** Orders comments by when they were made, then by id, so every copy of a review puts them in the same order. */
function byCreation(a, b) {
	const time = Date.parse(a.createdAt) - Date.parse(b.createdAt);
	if (time !== 0) return time;
	return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
//#endregion
//#region ../../packages/core/src/paths.ts
var DRIVE = /^([A-Za-z]):\//;
var UNC = /^\/\/([^/]+)\/([^/]+)/;
function split(path) {
	const slashed = path.replaceAll("\\", "/");
	let root;
	let rest;
	const unc = UNC.exec(slashed);
	const drive = DRIVE.exec(slashed);
	if (unc) {
		root = `//${unc[1]}/${unc[2]}/`;
		rest = slashed.slice(unc[0].length);
	} else if (slashed.startsWith("//")) throw new ArcueError("invalid-input", `A network path needs a server and a share, got "${path}".`);
	else if (drive) {
		root = `${drive[1]?.toUpperCase()}:/`;
		rest = slashed.slice(drive[0].length);
	} else if (slashed.startsWith("/")) {
		root = "/";
		rest = slashed;
	} else throw new ArcueError("invalid-input", `Expected an absolute path, got "${path}".`);
	const parts = [];
	for (const part of rest.split("/")) {
		if (part === "" || part === ".") continue;
		if (part === "..") parts.pop();
		else parts.push(part);
	}
	return {
		root,
		parts
	};
}
/**
* Converts "\" to "/", resolves "." and "..", and removes repeated and trailing slashes. Paths must be absolute:
* "/work", a drive such as "C:/work" (the letter becomes uppercase), or a network share such as "//server/share/work".
*/
function normalizePath(path) {
	const { root, parts } = split(path);
	return root + parts.join("/");
}
function joinPath(base, ...segments) {
	const { root, parts } = split(base);
	return normalizePath(root + [...parts, ...segments].join("/").replace(/^\/+/, ""));
}
/** The parent folder; a root is its own parent. */
function dirname(path) {
	const { root, parts } = split(path);
	return root + parts.slice(0, -1).join("/");
}
function basename(path) {
	return split(path).parts.at(-1) ?? "";
}
/** The path relative to `root`, "" for the root itself, or null when the path is outside it. */
function pathInside(root, path) {
	const base = normalizePath(root);
	const target = normalizePath(path);
	if (target === base) return "";
	const prefix = base.endsWith("/") ? base : `${base}/`;
	return target.startsWith(prefix) ? target.slice(prefix.length) : null;
}
/**
* The path of `path` seen from the folder `from`, with ".." where it leaves that folder, such as "../Textures/Rock.png".
* Null when the two have different roots.
*/
function relativePath(from, path) {
	const base = split(from);
	const target = split(path);
	if (base.root !== target.root) return null;
	let common = 0;
	while (common < base.parts.length && base.parts[common] === target.parts[common]) common++;
	return [...base.parts.slice(common).map(() => ".."), ...target.parts.slice(common)].join("/");
}
/** The file name without its last extension: "Hero" for "/work/Hero.fbx". */
function stemOf(path) {
	const name = basename(path);
	const dot = name.lastIndexOf(".");
	return dot > 0 ? name.slice(0, dot) : name;
}
/** Walks up from `path` to the nearest folder that contains ".git", a folder or a worktree's file. */
async function findGitRoot(path, exists) {
	let current = normalizePath(path);
	for (;;) {
		if (await exists(joinPath(current, ".git"))) return current;
		const parent = dirname(current);
		if (parent === current) return null;
		current = parent;
	}
}
//#endregion
//#region ../../packages/core/src/composition-file.ts
/** Extensions of the model files a composition may load. */
var MODEL_EXTENSIONS = [
	...MODEL_FILE_EXTENSIONS,
	".glb",
	".gltf"
];
function hasExtension(path, extensions) {
	const lower = path.toLowerCase();
	return extensions.some((extension) => lower.endsWith(extension));
}
/**
* Model files named "<model stem>@<anything>", such as "Hero@Walk.fbx" or "Hero@Walk.blend", join the model as
* animation files, as in Unity.
*/
function isConventionAnimation(modelPath, name) {
	return joinsByName(basename(modelPath), name);
}
/** Parses a composition file. Broken JSON, a newer version and content that breaks the schema reject with `code`. */
function parseComposition(text, path, code) {
	let raw;
	try {
		raw = JSON.parse(text);
	} catch (error) {
		throw new ArcueError(code, `${path} is not valid JSON.`, { cause: error });
	}
	const version = typeof raw === "object" && raw !== null && "version" in raw ? raw.version : void 0;
	if (typeof version === "number" && version > 1) throw new ArcueError(code, `${path} has version ${version}, made by a newer Arcue.`);
	const parsed = compositionFileSchema.safeParse(raw);
	if (!parsed.success) {
		const summary = parsed.error.issues.map((issue) => `${issue.path.join(".") || "file"}: ${issue.message}`).join("; ");
		throw new ArcueError(code, `${path} is not a valid composition. ${summary}`);
	}
	return parsed.data;
}
/** The file's text, without empty lists, after checking it against the schema. */
function serializeComposition(composition) {
	const tidy = { version: composition.version };
	if (composition.animations?.length) tidy.animations = composition.animations;
	if (composition.attach?.length) tidy.attach = composition.attach;
	if (composition.materials && Object.keys(composition.materials).length > 0) tidy.materials = composition.materials;
	if (composition.hidden?.length) tidy.hidden = composition.hidden;
	const checked = compositionFileSchema.safeParse(tidy);
	if (!checked.success) {
		const summary = checked.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
		throw new ArcueError("internal", `The change would break the composition file. ${summary}`);
	}
	return `${JSON.stringify(tidy, null, 2)}\n`;
}
/**
* The composition file's text and content, or null when there is none. A link or a folder at the path, and a file
* that cannot be parsed, reject with `code` and a message that names the file by its path.
*/
async function readComposition(platform, path, code) {
	const stat = await platform.stat(path);
	if (stat === null) return null;
	if (stat.kind !== "file") throw new ArcueError(code, `${path} is not a plain file.`);
	const text = await platform.readText(path);
	return {
		text,
		composition: parseComposition(text, path, code)
	};
}
/** The composition with a file added, or its entry with the same file and node replaced. */
function withMember(composition, entry, same) {
	if (entry.role === "animation") {
		const animations = composition.animations ?? [];
		return animations.some(same) ? composition : {
			...composition,
			animations: [...animations, entry.file]
		};
	}
	const attach = { file: entry.file };
	if (entry.node !== void 0) attach.node = entry.node;
	if (entry.role === "attach" && entry.bone !== void 0) attach.bone = entry.bone;
	const list = composition.attach ?? [];
	const at = list.findIndex((existing) => same(existing.file) && existing.node === entry.node);
	const next = at === -1 ? [...list, attach] : list.map((existing, index) => index === at ? attach : existing);
	return {
		...composition,
		attach: next
	};
}
/**
* The composition with the bone of a file's attached entries changed, or removed for undefined, which leaves them in
* place as set pieces. `node` picks the entries by their node; null when no entry of the file matches.
*/
function withAttachBone(composition, same, node, bone) {
	let matched = false;
	const attach = (composition.attach ?? []).map((entry) => {
		if (!same(entry.file) || !node(entry.node)) return entry;
		matched = true;
		const moved = { file: entry.file };
		if (entry.node !== void 0) moved.node = entry.node;
		if (bone !== void 0) moved.bone = bone;
		return moved;
	});
	return matched ? {
		...composition,
		attach
	} : null;
}
/** The composition without a file, and without the hidden parts that came from it. */
function withoutMember(composition, same, hiddenFromFile) {
	return {
		...composition,
		animations: (composition.animations ?? []).filter((entry) => !same(entry)),
		attach: (composition.attach ?? []).filter((entry) => !same(entry.file)),
		hidden: (composition.hidden ?? []).filter((id) => !hiddenFromFile(id))
	};
}
function listsMember(composition, same) {
	return (composition.animations ?? []).some(same) || (composition.attach ?? []).some((entry) => same(entry.file));
}
/** The composition with a material slot's texture set, or removed for null. */
function withTexture(composition, material, slot, file) {
	const materials = new Map(Object.entries(composition.materials ?? {}));
	const slots = { ...materials.get(material) };
	if (file === null) delete slots[slot];
	else slots[slot] = file;
	if (Object.keys(slots).length > 0) materials.set(material, slots);
	else materials.delete(material);
	return {
		...composition,
		materials: Object.fromEntries(materials)
	};
}
/** Every file path a composition writes: animation files, attached files and textures, as written. */
function writtenPaths(composition) {
	const textures = Object.values(composition.materials ?? {}).flatMap((slots) => TEXTURE_SLOTS.flatMap((slot) => slots[slot] ?? []));
	return [
		...composition.animations ?? [],
		...(composition.attach ?? []).map((entry) => entry.file),
		...textures
	];
}
/** The composition with each written file path replaced by `rewrite(path)`, and each hidden part id by `relabel(id)`. */
function withRewrittenPaths(composition, rewrite, relabel) {
	const next = { ...composition };
	if (composition.animations) next.animations = composition.animations.map(rewrite);
	if (composition.attach) next.attach = composition.attach.map((entry) => ({
		...entry,
		file: rewrite(entry.file)
	}));
	if (composition.materials) {
		const materials = {};
		for (const [material, slots] of Object.entries(composition.materials)) {
			const rewritten = {};
			for (const slot of TEXTURE_SLOTS) {
				const written = slots[slot];
				if (written !== void 0) rewritten[slot] = rewrite(written);
			}
			materials[material] = rewritten;
		}
		next.materials = materials;
	}
	if (composition.hidden) next.hidden = composition.hidden.map(relabel);
	return next;
}
//#endregion
//#region ../../packages/core/src/links.ts
/**
* True when `path` is inside `root` and no folder or file between them is a symbolic link. The root itself may be a
* link, such as a repository checked out through one; everything the core reads below it may not.
*/
async function insideWithoutLinks(platform, root, path) {
	return createLinkCheck(platform, root)(path);
}
/**
* `insideWithoutLinks` for many paths below one root, such as one search for files, checking each folder and file at
* most once. It keeps what it found, so a link created after a check goes unnoticed; make a new one for each search.
*/
function createLinkCheck(platform, root) {
	const base = normalizePath(root);
	const checked = /* @__PURE__ */ new Map([[base, Promise.resolve(true)]]);
	const check = (path) => {
		let result = checked.get(path);
		if (!result) {
			result = check(dirname(path)).then(async (parentInside) => parentInside && (await platform.stat(path))?.kind !== "symlink");
			checked.set(path, result);
		}
		return result;
	};
	return async (path) => {
		const target = normalizePath(path);
		return pathInside(base, target) !== null && check(target);
	};
}
//#endregion
//#region ../../packages/core/src/file-search.ts
/** Extensions of the files an import worker may read, such as external textures. */
var readableImageExtensions = IMAGE_FILE_EXTENSIONS;
function isReadableImage(name) {
	const lower = name.toLowerCase();
	return readableImageExtensions.some((extension) => lower.endsWith(extension));
}
/**
* Finds the images an asset references for one import, answering "import.findFile". Folders are listed at most once
* and at most `MAX_SEARCHED_FOLDERS` of them; names match regardless of case, an exact match first. The search stays
* inside `readRoot`, skips folders reached through a symbolic link and files that are links, and reads only images.
*/
function createFileSearch(platform, assetPath, readRoot, onCandidate) {
	const root = normalizePath(readRoot);
	const assetFolder = dirname(assetPath);
	const stem = stemOf(assetPath);
	const insideWithoutLinks = createLinkCheck(platform, root);
	const listings = /* @__PURE__ */ new Map();
	const found = /* @__PURE__ */ new Map();
	const list = (folder) => {
		let listing = listings.get(folder);
		if (!listing) {
			listing = listings.size >= 256 ? Promise.resolve([]) : listFolder(platform, insideWithoutLinks, folder, isReadableImage);
			listings.set(folder, listing);
		}
		return listing;
	};
	const entry = async (folder, name, kind) => {
		if (onCandidate && kind === "file" && await insideWithoutLinks(joinPath(folder, name))) onCandidate?.(joinPath(folder, name));
		const lower = name.toLowerCase();
		const matches = (await list(folder)).filter((candidate) => candidate.kind === kind && candidate.name.toLowerCase() === lower);
		const match = matches.find((candidate) => candidate.name === name) ?? matches[0];
		if (!match) return null;
		const path = joinPath(folder, match.name);
		if (kind === "file") onCandidate?.(path);
		return path;
	};
	function* folders(relative) {
		if (relative !== null) {
			const target = joinPath(assetFolder, relative);
			if (pathInside(root, target) !== null) yield Promise.resolve(dirname(target));
		}
		yield Promise.resolve(assetFolder);
		yield entry(assetFolder, `${stem}.fbm`, "directory").then((path) => path ?? joinPath(assetFolder, `${stem}.fbm`));
		yield entry(assetFolder, "Textures", "directory").then((path) => path ?? joinPath(assetFolder, "Textures"));
		for (let folder = assetFolder; folder !== root && pathInside(root, folder) !== null;) {
			folder = dirname(folder);
			yield Promise.resolve(folder);
			const textures = joinPath(folder, "Textures");
			yield entry(folder, "Textures", "directory").then((path) => path ?? textures);
		}
	}
	const search = async (storedPath) => {
		const stored = parseStoredPath(storedPath);
		if (!isReadableImage(stored.name)) return null;
		const tried = /* @__PURE__ */ new Set();
		for (const next of folders(stored.relative)) {
			const folder = await next;
			if (folder === null || tried.has(folder)) continue;
			tried.add(folder);
			const file = await entry(folder, stored.name, "file");
			if (file) return file;
		}
		return null;
	};
	const locate = (storedPath) => {
		let path = found.get(storedPath);
		if (!path) {
			path = search(storedPath);
			found.set(storedPath, path);
		}
		return path;
	};
	return {
		async find(storedPath) {
			const file = await locate(storedPath);
			if (file === null) return null;
			const relative = relativePath(assetFolder, file);
			const bytes = relative === null ? null : await platform.readFile(file).catch(() => null);
			return relative !== null && bytes ? {
				path: relative,
				bytes
			} : null;
		},
		async locate(storedPath) {
			const file = await locate(storedPath);
			return file === null ? null : relativePath(assetFolder, file);
		}
	};
}
/**
* The files with one of the extensions in the given folders and every folder below them, breadth first, for finding a
* file that was renamed. It follows the same rules as the search for images: inside `readRoot`, never through links,
* and at most `MAX_SEARCHED_FOLDERS` folders listed. It skips folders whose names start with a dot, such as ".git" and
* ".arcue", and stops at `MAX_FOUND_FILES` files.
*/
async function findFilesByExtension(platform, readRoot, folders, extensions) {
	const root = normalizePath(readRoot);
	const insideWithoutLinks = createLinkCheck(platform, root);
	const matches = (name) => extensions.some((extension) => name.toLowerCase().endsWith(extension));
	const queue = folders.filter((folder) => pathInside(root, folder) !== null);
	const listed = /* @__PURE__ */ new Set();
	const files = [];
	while (queue.length > 0 && listed.size < 256 && files.length < 256) {
		const folder = queue.shift();
		if (folder === void 0 || listed.has(folder)) continue;
		listed.add(folder);
		for (const entry of await listFolder(platform, insideWithoutLinks, folder, matches)) {
			const path = joinPath(folder, entry.name);
			if (entry.kind === "directory") {
				if (!entry.name.startsWith(".")) queue.push(path);
			} else if (files.length < 256) files.push(path);
		}
	}
	return files;
}
/** A folder's subfolders and the plain files whose names `keep` accepts; nothing outside the root or through a link. */
async function listFolder(platform, insideWithoutLinks, folder, keep) {
	try {
		if (!await insideWithoutLinks(folder)) return [];
		if ((await platform.stat(folder))?.kind !== "directory") return [];
		return (await platform.list(folder)).filter((entry) => entry.kind === "directory" || entry.kind === "file" && keep(entry.name));
	} catch {
		return [];
	}
}
//#endregion
//#region ../../packages/core/src/hash.ts
/** A 64-bit hash of the bytes as 16 hex digits. Not cryptographic; it tells file versions apart. */
function contentHash(bytes) {
	let h1 = 2654435769 ^ bytes.length;
	let h2 = 2246822507 ^ bytes.length;
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const wordEnd = bytes.length - bytes.length % 4;
	for (let offset = 0; offset < wordEnd; offset += 4) {
		const word = view.getUint32(offset, true);
		h1 = Math.imul(h1 ^ word, 2654435761);
		h2 = Math.imul(h2 ^ word, 1597334677);
		h1 = h1 << 13 | h1 >>> 19;
		h2 = h2 << 17 | h2 >>> 15;
	}
	for (let offset = wordEnd; offset < bytes.length; offset++) {
		const byte = bytes[offset] ?? 0;
		h1 = Math.imul(h1 ^ byte, 2654435761);
		h2 = Math.imul(h2 ^ byte, 1597334677);
	}
	h1 = Math.imul(h1 ^ h1 >>> 16, 2246822507) ^ Math.imul(h2 ^ h2 >>> 13, 3266489909);
	h2 = Math.imul(h2 ^ h2 >>> 16, 2246822507) ^ Math.imul(h1 ^ h1 >>> 13, 3266489909);
	return hex32(h1) + hex32(h2);
}
function versionIdOf(bytes) {
	return versionIdOfHash(contentHash(bytes));
}
function versionIdOfHash(hash) {
	return hash;
}
function hex32(value) {
	return (value >>> 0).toString(16).padStart(8, "0");
}
//#endregion
//#region ../../packages/core/src/identity.ts
/** The largest `.meta` file the core reads a GUID from. Unity writes a few kilobytes even for models with many clips. */
var MAX_META_BYTES = 1 << 20;
var GUID_LINE = /^guid:[ \t]*([0-9a-fA-F]{32})[ \t]*\r?$/m;
/** The GUID on the "guid:" line of a Unity `.meta` file, in lowercase, or null when it has none. */
function parseUnityGuid(text) {
	return GUID_LINE.exec(text)?.[1]?.toLowerCase() ?? null;
}
/**
* The GUID in the Unity `.meta` file beside a file, or null when there is none. A link, a folder or an oversized file
* at that path counts as none.
*/
async function readUnityGuid(platform, path) {
	const meta = `${path}.meta`;
	try {
		const stat = await platform.stat(meta);
		if (stat?.kind !== "file" || stat.size > MAX_META_BYTES) return null;
		return parseUnityGuid(await platform.readText(meta));
	} catch {
		return null;
	}
}
function fileIdentity(platform, path, size) {
	let hash = null;
	let guid = null;
	return {
		size,
		hash: () => {
			hash ??= platform.readFile(path).then(contentHash);
			return hash;
		},
		guid: () => {
			guid ??= readUnityGuid(platform, path);
			return guid;
		}
	};
}
/**
* Whether a file is one that was recorded before: "content" when it has the size and full hash of one of `recorded`,
* otherwise "guid" when it has the recorded Unity GUID, otherwise null. The file is hashed only when a size matches.
*/
async function matchIdentity(file, recorded, guid) {
	const sized = recorded.filter((entry) => entry.size === file.size && entry.hash !== void 0);
	if (sized.length > 0) {
		const hash = await file.hash();
		if (sized.some((entry) => entry.hash === hash)) return "content";
	}
	return guid !== null && guid !== void 0 && await file.guid() === guid ? "guid" : null;
}
/**
* The files among `paths` that `matchIdentity` matches with what was recorded. It reads the size of every file before
* it hashes any or reads any `.meta` file, and skips paths that are not plain files.
*/
async function filesMatching(platform, paths, recorded, guid) {
	const sized = [];
	for (const path of paths) {
		const stat = await platform.stat(path);
		if (stat?.kind === "file") sized.push({
			path,
			size: stat.size
		});
	}
	const found = [];
	for (const { path, size } of sized) if (await matchIdentity(fileIdentity(platform, path, size), recorded, guid) !== null) found.push(path);
	return found;
}
//#endregion
//#region ../../packages/core/src/serial.ts
/** Runs tasks one at a time, in the order they were queued. A failed task does not stop the ones after it. */
var Serial = class {
	#tail = Promise.resolve();
	run(task) {
		const result = this.#tail.then(task, task);
		this.#tail = result.catch(() => void 0);
		return result;
	}
};
/** Runs at most `limit` tasks at once; the rest wait their turn in the order they were queued. */
var Limit = class {
	#limit;
	#waiting = [];
	#running = 0;
	constructor(limit) {
		this.#limit = Math.max(1, limit);
	}
	async run(task) {
		if (this.#running >= this.#limit) await new Promise((resolve) => this.#waiting.push(resolve));
		else this.#running++;
		try {
			return await task();
		} finally {
			const next = this.#waiting.shift();
			if (next) next();
			else this.#running--;
		}
	}
};
//#endregion
//#region ../../packages/core/src/composition-load.ts
var encoder$2 = new TextEncoder();
/**
* Reads the model, its composition file and every file the composition names, plus the "<stem>@<clip>" model files
* beside the model. The composition's paths are relative to the model's folder. Member files must be model files
* inside `readRoot` reached without symbolic links. Textures are searched for like an importer's stale paths, starting
* from the path the composition writes, and each image is read once however many slots use it. A missing model
* rejects; a missing member or texture is recorded with its problem.
*/
async function readAssetFiles(platform, modelPath, compositionPath, readRoot, options) {
	const stat = await platform.stat(modelPath);
	if (stat?.kind !== "file") throw new ArcueError("not-found", `${modelPath} does not exist.`);
	const folder = dirname(modelPath);
	const label = (path) => relativePath(folder, path) ?? path;
	const model = {
		path: modelPath,
		label: basename(modelPath),
		...await readIdentified(platform, modelPath),
		modifiedMs: stat.modifiedMs,
		problem: null
	};
	let found = null;
	let unreadComposition = null;
	try {
		found = await readComposition(platform, compositionPath, "invalid-input");
	} catch (error) {
		if (!(error instanceof ArcueError && error.code === "invalid-input") || options.brokenComposition === "reject") throw error;
		unreadComposition = {
			label: COMPOSITION_FILE_NAME,
			reason: error.message
		};
	}
	const content = found?.composition ?? null;
	const composition = found ? {
		file: {
			path: compositionPath,
			label: COMPOSITION_FILE_NAME,
			bytes: null,
			id: versionIdOf(encoder$2.encode(found.text)),
			problem: null
		},
		content: found.composition
	} : null;
	const fromModel = (file) => joinPath(folder, file);
	const animations = (content?.animations ?? []).map(fromModel);
	const siblings = (await platform.list(folder)).filter((entry) => entry.kind === "file").map((entry) => entry.name);
	for (const name of siblings) {
		const path = joinPath(folder, name);
		if (isConventionAnimation(modelPath, name) && !animations.includes(path)) animations.push(path);
	}
	const attach = (content?.attach ?? []).map((entry) => ({
		path: fromModel(entry.file),
		node: entry.node ?? null,
		bone: entry.bone ?? null
	}));
	const members = /* @__PURE__ */ new Map();
	for (const path of [...animations, ...attach.map((entry) => entry.path)]) {
		if (path === modelPath || members.has(path)) continue;
		members.set(path, await readMember(platform, path, label(path), readRoot));
	}
	const textures = [];
	const search = createFileSearch(platform, modelPath, readRoot);
	const images = /* @__PURE__ */ new Map();
	const readImage = (path) => {
		let image = images.get(path);
		if (!image) {
			image = readIdentified(platform, path).catch(() => null);
			images.set(path, image);
		}
		return image;
	};
	for (const [material, slots] of Object.entries(content?.materials ?? {})) for (const slot of TEXTURE_SLOTS) {
		const written = slots[slot];
		if (written === void 0) continue;
		const located = await search.locate(written);
		const path = fromModel(located ?? written);
		const image = located === null ? null : await readImage(path);
		textures.push({
			material,
			slot,
			written,
			path,
			label: label(path),
			...image ?? {
				bytes: null,
				id: null
			},
			problem: image ? null : "Texture not found"
		});
	}
	const unread = unreadComposition ? [{
		path: compositionPath,
		label: unreadComposition.label,
		bytes: null,
		id: versionIdOf(encoder$2.encode(unreadComposition.reason)),
		problem: "Could not load"
	}] : [];
	const listed = /* @__PURE__ */ new Map([[model.label, model]]);
	for (const file of [
		...composition ? [composition.file] : [],
		...unread,
		...members.values(),
		...textures
	]) if (!listed.has(file.label)) listed.set(file.label, file);
	const composed = listed.size > 1;
	const versionFiles = composed ? [...listed.values()].flatMap((file) => file.id === null ? [] : [versionFile(file, file.id)]) : void 0;
	const versionId = composed ? versionIdOf(encoder$2.encode([...listed.values()].map((file) => `${file.label}\n${file.id ?? "-"}`).join("\n"))) : model.id;
	return {
		model,
		composition,
		unreadComposition,
		members,
		animations: animations.filter((path) => path !== modelPath),
		attach: attach.filter((entry) => entry.path !== modelPath),
		textures,
		hidden: content?.hidden ?? [],
		versionId,
		versionFiles,
		watch: [
			compositionPath,
			...members.keys(),
			...textures.map((texture) => texture.path)
		],
		siblings
	};
}
/** The problem of a member file that is not where the composition says, which a rename may explain. */
var MEMBER_NOT_FOUND = "File not found";
async function readMember(platform, path, label, readRoot) {
	const missing = (problem) => ({
		path,
		label,
		bytes: null,
		id: null,
		problem
	});
	if (pathInside(readRoot, path) === null) return missing("File outside the workspace");
	if (!hasExtension(path, MODEL_EXTENSIONS)) return missing("Not a model file");
	if (!await insideWithoutLinks(platform, readRoot, path)) return missing("File reached through a link");
	if ((await platform.stat(path))?.kind !== "file") return missing(MEMBER_NOT_FOUND);
	return {
		path,
		label,
		...await readIdentified(platform, path),
		problem: null
	};
}
/** A file's bytes with their short id, their full hash and the Unity GUID beside the file. */
async function readIdentified(platform, path) {
	const bytes = await platform.readFile(path);
	const hash = contentHash(bytes);
	const guid = await readUnityGuid(platform, path);
	return {
		bytes,
		id: versionIdOfHash(hash),
		hash,
		size: bytes.byteLength,
		...guid === null ? {} : { guid }
	};
}
function versionFile(file, id) {
	const entry = {
		file: file.label,
		id
	};
	if (file.hash !== void 0 && file.size !== void 0) {
		entry.hash = file.hash;
		entry.size = file.size;
	}
	if (file.guid !== void 0) entry.guid = file.guid;
	return entry;
}
/**
* The warnings of an animation file's own parser that matter for its clips, besides every warning about a clip: why
* clips are missing or differ from the file. The rest are about meshes and rest poses.
*/
var CLIP_WARNINGS = /* @__PURE__ */ new Set([
	"clip-not-sampled",
	"invalid-data",
	"left-handed-axes",
	"library-not-loaded"
]);
/**
* The warnings about an object that constraints or drivers move beyond its keys, which matter only where the object
* reaches the model.
*/
var MOTION_WARNINGS = /* @__PURE__ */ new Set(["constraint-not-evaluated", "driver-not-evaluated"]);
function mattersForClips(warning, member, model) {
	if (warning.subject.kind === "clip" || CLIP_WARNINGS.has(warning.code)) return true;
	if (!MOTION_WARNINGS.has(warning.code) || warning.subject.kind !== "node") return false;
	return reachesModel(member, warning.subject.name, model);
}
/**
* Whether an animation file's object moves something of the model, whose nodes the file's clips bind to by name: it is
* an armature with a bone the model has, or the model has an object of its name. A mesh with shape keys counts only
* when the model's mesh of its name has shape keys too, as its warnings may be about drivers of those shape keys.
*/
function reachesModel(member, name, model) {
	const index = findNode(member.nodes, name, false);
	if (index === null) return false;
	const modelBones = new Set(model.nodes.flatMap((node) => node.kind === "bone" ? [node.name] : []));
	if (bonesUnder(member.nodes, index).some((bone) => modelBones.has(bone))) return true;
	const match = findNode(model.nodes, member.nodes[index]?.name ?? name, false);
	return match !== null && (!hasShapeKeys(member, index) || hasShapeKeys(model, match));
}
function bonesUnder(nodes, root) {
	const under = /* @__PURE__ */ new Set([root]);
	const bones = [];
	nodes.forEach((node, index) => {
		if (index <= root || !under.has(node.parent)) return;
		under.add(index);
		if (node.kind === "bone") bones.push(node.name);
	});
	return bones;
}
function hasShapeKeys(scene, node) {
	return (scene.meshes[scene.nodes[node]?.mesh ?? -1]?.morphTargets.length ?? 0) > 0;
}
/**
* The scene of a version: the model's scene alone, or composed with the other files. `importScene` parses one file,
* at most `MEMBER_IMPORTS_AT_ONCE` at a time; a member that fails to parse becomes a warning, and a member's own
* warnings join the scene's with the member's file. An animation file keeps only the warnings about its clips.
*/
async function buildAssetScene(files, importScene, options = {}) {
	const model = await importScene(files.model);
	if (files.versionFiles === void 0) return model;
	const warnings = [];
	if (files.unreadComposition) {
		const { label, reason } = files.unreadComposition;
		warnings.push(importWarning("composition-not-loaded", {
			kind: "file",
			name: label
		}, `Could not load: ${label}`, label, { detail: reason }));
	}
	const imports = new Limit(4);
	const parsed = await Promise.all([...files.members.values()].map(async (file) => {
		if (file.bytes === null || file.id === null) return {
			file,
			scene: null,
			error: null
		};
		const loadable = {
			...file,
			bytes: file.bytes,
			id: file.id
		};
		const known = options.parsed?.(loadable) ?? null;
		if (known) return {
			file,
			scene: known,
			error: null
		};
		try {
			return {
				file,
				scene: await imports.run(() => importScene(loadable)),
				error: null
			};
		} catch (error) {
			return {
				file,
				scene: null,
				error: error instanceof Error ? error.message : String(error)
			};
		}
	}));
	const attached = new Set(files.attach.map((entry) => entry.path));
	const scenes = /* @__PURE__ */ new Map();
	for (const { file, scene, error } of parsed) {
		if (scene) {
			scenes.set(file.path, {
				file: file.label,
				scene
			});
			const animationOnly = !attached.has(file.path);
			for (const warning of scene.source.warnings) if (!animationOnly || mattersForClips(warning, scene, model)) warnings.push({
				...warning,
				file: file.label
			});
			continue;
		}
		const subject = {
			kind: "file",
			name: file.label
		};
		warnings.push(error === null ? importWarning("file-not-found", subject, `${file.problem ?? "File not found"}: ${file.label}`, file.label) : importWarning("invalid-data", subject, `File could not be parsed: ${file.label}`, file.label, { detail: error }));
	}
	const materials = /* @__PURE__ */ new Map();
	const images = /* @__PURE__ */ new Map();
	for (const texture of files.textures) {
		const slots = materials.get(texture.material) ?? {};
		materials.set(texture.material, slots);
		if (texture.bytes === null) {
			slots[texture.slot] = {
				path: texture.written,
				texture: null
			};
			const use = {
				material: texture.material,
				slot: texture.slot
			};
			const name = fileNameOf(texture.written);
			warnings.push(importWarning("texture-not-found", {
				kind: "texture",
				name
			}, `Texture not found: ${name}`, files.composition?.file.label, {
				detail: `Stored path: ${texture.written}, used as ${describeTextureUses([use])}`,
				materials: [texture.material],
				uses: [use]
			}));
			continue;
		}
		let image = images.get(texture.path);
		if (!image) {
			image = {
				name: stemOf(texture.path),
				mimeType: imageMimeType(texture.bytes, texture.path),
				bytes: texture.bytes,
				storedPath: texture.written,
				foundPath: texture.label
			};
			images.set(texture.path, image);
		}
		slots[texture.slot] = {
			path: texture.written,
			texture: image
		};
	}
	const member = (path) => scenes.get(path);
	const unloaded = new Set([...files.members.values()].flatMap((file) => scenes.has(file.path) ? [] : [file.label]));
	return withoutOverriddenTextures(composeScene(model, {
		animations: files.animations.flatMap((path) => member(path) ?? []),
		attach: files.attach.flatMap(({ path, node, bone }) => {
			const found = member(path);
			return found ? [{
				member: found,
				node,
				bone
			}] : [];
		}),
		materials: Object.fromEntries(materials),
		hidden: files.hidden.filter((id) => !unloaded.has(splitMemberPath(id).file ?? "")),
		warnings
	}), files.textures);
}
/**
* Drops the texture warnings that the composition already fixes: the model's "texture-not-used" for a texture whose
* image it puts into a material slot, and any file's "texture-not-found" or "texture-path-absolute" for a texture
* whose every slot it fills with an image that was found.
*/
function withoutOverriddenTextures(scene, textures) {
	const found = textures.filter((texture) => texture.bytes !== null);
	const shown = new Set(found.map((texture) => texture.label));
	const filled = new Set(found.map((texture) => `${texture.material}\n${texture.slot}`));
	const fixed = (warning) => {
		if (warning.code === "texture-not-used") return warning.file === void 0 && warning.foundPath !== void 0 && shown.has(warning.foundPath);
		if (warning.code !== "texture-not-found" && warning.code !== "texture-path-absolute") return false;
		const uses = warning.uses ?? [];
		return uses.length > 0 && uses.every((use) => filled.has(`${use.material}\n${use.slot}`));
	};
	const kept = scene.source.warnings.filter((warning) => !fixed(warning));
	if (kept.length === scene.source.warnings.length) return scene;
	return {
		...scene,
		source: {
			...scene.source,
			warnings: kept
		}
	};
}
//#endregion
//#region ../../packages/core/src/history.ts
/** Records the edit that turns `before` into `after` for what it touched. */
function editBetween(before, after, touched) {
	const comments = touched.comments ?? [];
	const warnings = touched.warnings ?? [];
	const snapshot = (review) => {
		const queue = /* @__PURE__ */ new Map();
		for (let index = review.queue.length - 1; index >= 0; index--) {
			const id = review.queue[index];
			if (id !== void 0 && comments.includes(id)) queue.set(id, { before: review.queue[index + 1] ?? null });
		}
		for (const id of comments) if (!queue.has(id)) queue.set(id, null);
		const dismissed = new Set(review.dismissedWarnings ?? []);
		return {
			comments: new Map(comments.map((id) => [id, review.comments.find((comment) => comment.id === id) ?? null])),
			queue,
			dismissedWarnings: new Map(warnings.map((id) => [id, dismissed.has(id)]))
		};
	};
	return {
		kind: "comments",
		before: snapshot(before),
		after: snapshot(after)
	};
}
/**
* Puts the snapshot's comments, queue entries and dismissed warnings into the review and leaves the rest as it is.
* A comment that comes back goes before the first comment made after it. A queue entry goes back before the comment
* it stood before, or last when that comment is no longer queued.
*/
function applySnapshot(review, snapshot) {
	const comments = review.comments.flatMap((comment) => {
		const restored = snapshot.comments.get(comment.id);
		return restored === void 0 ? [comment] : restored === null ? [] : [restored];
	});
	for (const [id, comment] of snapshot.comments) {
		if (comment === null || comments.some((entry) => entry.id === id)) continue;
		const at = comments.findIndex((entry) => byCreation(entry, comment) > 0);
		comments.splice(at < 0 ? comments.length : at, 0, comment);
	}
	const queue = review.queue.filter((id) => !snapshot.queue.has(id));
	for (const [id, spot] of snapshot.queue) {
		if (spot === null) continue;
		const at = spot.before === null ? -1 : queue.indexOf(spot.before);
		queue.splice(at < 0 ? queue.length : at, 0, id);
	}
	const dismissed = (review.dismissedWarnings ?? []).filter((id) => snapshot.dismissedWarnings.get(id) !== false);
	for (const [id, wasDismissed] of snapshot.dismissedWarnings) if (wasDismissed && !dismissed.includes(id)) dismissed.push(id);
	return withDismissedWarnings({
		...review,
		comments,
		queue
	}, dismissed);
}
/** The review with these dismissed warnings; none leaves the field out of `review.json`. */
function withDismissedWarnings(review, ids) {
	const { dismissedWarnings: _previous, ...rest } = review;
	return ids.length === 0 ? rest : {
		...rest,
		dismissedWarnings: [...ids]
	};
}
/** One asset's undo and redo stacks, for comment and composition edits alike. They live in memory only. */
var ReviewHistory = class {
	#undo = [];
	#redo = [];
	record(edit) {
		this.#undo.push(edit);
		this.#redo = [];
	}
	peekUndo() {
		return this.#undo.at(-1) ?? null;
	}
	peekRedo() {
		return this.#redo.at(-1) ?? null;
	}
	/** Moves the latest edit to the redo stack once its undo is saved. */
	undone() {
		const edit = this.#undo.pop();
		if (edit) this.#redo.push(edit);
	}
	redone() {
		const edit = this.#redo.pop();
		if (edit) this.#undo.push(edit);
	}
	/** Forgets the latest edit to undo or redo, which can no longer be applied, so the edits behind it stay reachable. */
	drop(direction) {
		(direction === "undo" ? this.#undo : this.#redo).pop();
	}
	clear() {
		this.#undo = [];
		this.#redo = [];
	}
	/** Screenshot paths that undo or redo could bring back. */
	screenshots() {
		const paths = /* @__PURE__ */ new Set();
		for (const edit of [...this.#undo, ...this.#redo]) {
			if (edit.kind !== "comments") continue;
			for (const snapshot of [edit.before, edit.after]) for (const comment of snapshot.comments.values()) if (comment?.context.screenshot) paths.add(comment.context.screenshot);
		}
		return paths;
	}
	/** Rewrites every recorded comment, as re-anchoring does, so undo never restores an anchor of an older version. */
	mapComments(map) {
		const mapSnapshot = (snapshot) => ({
			queue: snapshot.queue,
			dismissedWarnings: snapshot.dismissedWarnings,
			comments: new Map([...snapshot.comments].map(([id, comment]) => [id, comment && map(comment)]))
		});
		const mapEdit = (edit) => edit.kind === "comments" ? {
			...edit,
			before: mapSnapshot(edit.before),
			after: mapSnapshot(edit.after)
		} : edit;
		this.#undo = this.#undo.map(mapEdit);
		this.#redo = this.#redo.map(mapEdit);
	}
};
//#endregion
//#region ../../packages/core/src/import-files.ts
async function readReferencedFile(platform, assetPath, relativePath, readRoot = dirname(assetPath)) {
	const resolved = referencedPath(assetPath, relativePath, readRoot);
	if (resolved === null || !await insideWithoutLinks(platform, readRoot, resolved)) return null;
	return (await platform.stat(resolved))?.kind === "file" ? platform.readFile(resolved) : null;
}
function referencedPath(assetPath, relativePath, readRoot) {
	const slashed = relativePath.replaceAll("\\", "/");
	if (slashed === "" || slashed.startsWith("/") || /^[A-Za-z]:/.test(slashed)) return null;
	const resolved = joinPath(dirname(assetPath), slashed);
	return pathInside(readRoot, resolved) && isReadableImage(basename(resolved)) ? resolved : null;
}
var ImportFiles = class ImportFiles {
	watch = /* @__PURE__ */ new Set();
	#platform;
	#assetPath;
	#readRoot;
	#search;
	#records = /* @__PURE__ */ new Map();
	constructor(platform, assetPath, readRoot) {
		this.#platform = platform;
		this.#assetPath = assetPath;
		this.#readRoot = readRoot;
		this.#search = createFileSearch(platform, assetPath, readRoot, (path) => this.watch.add(path));
	}
	get identity() {
		if (this.#records.size === 0) return null;
		const entries = [...this.#records].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, { result }]) => [key, result]);
		return contentHash(new TextEncoder().encode(JSON.stringify(entries)));
	}
	async read(path) {
		const resolved = referencedPath(this.#assetPath, path, this.#readRoot);
		if (resolved !== null && await insideWithoutLinks(this.#platform, this.#readRoot, resolved)) this.watch.add(resolved);
		const bytes = await readReferencedFile(this.#platform, this.#assetPath, path, this.#readRoot);
		this.#record({
			kind: "read",
			path
		}, bytes === null ? null : contentHash(bytes));
		return bytes;
	}
	async find(path) {
		const found = await this.#search.find(path);
		this.#record({
			kind: "find",
			path
		}, found === null ? null : JSON.stringify([found.path, contentHash(found.bytes)]));
		return found;
	}
	async locate(path) {
		const found = await this.#search.locate(path);
		this.#record({
			kind: "locate",
			path
		}, found);
		return found;
	}
	async refresh(assetPath, readRoot) {
		const next = new ImportFiles(this.#platform, assetPath, readRoot);
		for (const { request } of this.#records.values()) await next[request.kind](request.path);
		return next;
	}
	#record(request, result) {
		this.#records.set(JSON.stringify(request), {
			request,
			result
		});
	}
};
//#endregion
//#region ../../packages/core/src/import.ts
/**
* Parses an asset's bytes in a fresh import worker. The caller reads the file once and passes the bytes, so the
* version it hashes is the version that gets parsed. The bytes' buffer may move to the worker. The worker reaches
* other files only through `readReferencedFile` and a `createFileSearch` that lives as long as the import.
*/
async function importAsset(platform, assetPath, bytes, options = {}) {
	const readRoot = options.readRoot ?? await platform.findWorkspaceRoot(assetPath) ?? dirname(assetPath);
	const files = options.files ?? new ImportFiles(platform, assetPath, readRoot);
	const worker = platform.startImportWorker();
	const peer = createPeer(worker.endpoint, {
		requestTimeout: options.timeoutMs === void 0 ? void 0 : {
			ms: options.timeoutMs,
			setTimer: (delay, callback) => platform.clock.setTimer(delay, callback)
		},
		handleRequest: ({ name, input }) => {
			if (name === importRequests.readFile) {
				const { relativePath } = importReadFileInputSchema.parse(input);
				return files.read(relativePath);
			}
			if (name === importRequests.findFile) return files.find(importFindFileInputSchema.parse(input).storedPath);
			if (name === importRequests.locateFile) return files.locate(importFindFileInputSchema.parse(input).storedPath);
			throw new ArcueError("unknown-command", `The core has no "${name}".`);
		}
	});
	try {
		const input = {
			fileName: basename(assetPath),
			bytes
		};
		const ownsBuffer = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength;
		return await peer.request("command", importRequests.run, input, ownsBuffer ? [bytes.buffer] : []);
	} finally {
		peer.close();
		worker.terminate();
	}
}
//#endregion
//#region ../../packages/core/src/coordinates.ts
/** Converts a scene-space position or direction, rounded to 0.00001. Z up keeps the handedness: (x, -z, y). */
function toConvention(vector, convention) {
	const [x, y, z] = vector;
	return convention === "y-up" ? [
		round5(x),
		round5(y),
		round5(z)
	] : [
		round5(x),
		round5(-z),
		round5(y)
	];
}
function upAxisOf(convention) {
	return convention === "y-up" ? "+Y" : "+Z";
}
function round5(value) {
	return Math.round(value * 1e5) / 1e5 || 0;
}
//#endregion
//#region ../../packages/core/src/scene-lookup.ts
function meshesOf(scene) {
	const meshes = [];
	for (const node of scene.nodes) {
		const mesh = node.mesh === null ? void 0 : scene.meshes[node.mesh];
		if (node.mesh !== null && mesh) meshes.push({
			index: node.mesh,
			name: node.name,
			path: node.path,
			mesh
		});
	}
	return meshes;
}
function meshAtPath(scene, path) {
	return meshesOf(scene).find((entry) => entry.path === path) ?? null;
}
function findClip(scene, name) {
	return scene.clips.find((clip) => clip.name === name) ?? null;
}
/** Checks a time against the scene's clips and adds the clip's display name. */
function resolveTime(scene, time) {
	if (time.kind === "none") return { kind: "none" };
	const clip = findClip(scene, time.clip);
	if (!clip) throw new ArcueError("invalid-input", `The asset has no clip named "${time.clip}".`);
	const last = lastFrame(clip);
	const end = time.kind === "frame" ? time.frame : time.end;
	if (end > last) throw new ArcueError("invalid-input", `Clip "${clip.name}" ends at frame ${last}, not ${end}.`);
	if (time.kind === "frame") return {
		kind: "frame",
		clip: clip.name,
		clipDisplayName: clip.displayName,
		frame: time.frame
	};
	return {
		kind: "range",
		clip: clip.name,
		clipDisplayName: clip.displayName,
		start: time.start,
		end: time.end
	};
}
/** Checks that a target names a mesh of the scene and only its vertices and triangles. */
function checkTarget(scene, target) {
	const entry = meshAtPath(scene, target.mesh);
	if (!entry) throw new ArcueError("invalid-input", `The asset has no mesh at "${target.mesh}".`);
	const { mesh } = entry;
	if (target.kind === "surface") {
		if (target.vertices.some((vertex) => vertex >= mesh.sourceVertexCount)) throw new ArcueError("invalid-input", `"${target.mesh}" has ${mesh.sourceVertexCount} vertices.`);
		if (target.weights.some((weight) => !Number.isFinite(weight))) throw new ArcueError("invalid-input", "The pin's weights must be finite numbers.");
		return entry;
	}
	if (!rangesWithin(target.vertices, mesh.sourceVertexCount)) throw new ArcueError("invalid-input", `"${target.mesh}" has ${mesh.sourceVertexCount} vertices.`);
	if (!rangesWithin(target.triangles, mesh.indices.length / 3)) throw new ArcueError("invalid-input", `"${target.mesh}" has ${mesh.indices.length / 3} triangles.`);
	return entry;
}
/** The target's anchored source vertices, in its own order: a pin's three corners, or a region's decoded ranges. */
function anchoredVertices(target) {
	return target.kind === "surface" ? [...target.vertices] : Array.from(decodeRanges(target.vertices));
}
function restPosition(mesh, vertex) {
	const at = vertex * 3;
	return [
		mesh.restPositions[at] ?? 0,
		mesh.restPositions[at + 1] ?? 0,
		mesh.restPositions[at + 2] ?? 0
	];
}
/** Rest positions of the anchored vertices, rounded to 0.00001 m. */
function anchorRestPositions(mesh, target) {
	if (target === null) return [];
	return anchoredVertices(target).map((vertex) => {
		const [x, y, z] = restPosition(mesh, vertex);
		return [
			round5(x),
			round5(y),
			round5(z)
		];
	});
}
/** Length of the diagonal of the scene's rest-pose bounds. */
function modelSize(scene) {
	const { min, max } = scene.bounds;
	return Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
}
/** The point at barycentric `weights` between three positions. */
function weightedPoint(positions, weights) {
	const point = [
		0,
		0,
		0
	];
	positions.forEach((position, corner) => {
		const weight = weights[corner] ?? 0;
		point[0] += position[0] * weight;
		point[1] += position[1] * weight;
		point[2] += position[2] * weight;
	});
	return point;
}
/** The last name in a node path, without escapes or a "#n" repeat number. */
function nameInPath(path) {
	return (path.split(/(?<!\\)\//).at(-1) ?? path).replace(/#\d+$/, "").replace(/\\(.)/g, "$1");
}
/**
* A parts view as a comment stores it: parts the scene does not have dropped, ids sorted once each, and the LOD no
* higher than the scene's highest level. Undefined for the default view.
*/
function storedPartView(scene, view) {
	if (!view) return void 0;
	const stored = knownPartView(scene.parts, view);
	return isDefaultPartView(stored) ? void 0 : stored;
}
/** The scene's parts with the node path and triangle count of each level, as `scene.parts` answers. */
function partsOf(scene) {
	const paths = new Map(meshesOf(scene).map((entry) => [entry.index, entry]));
	return scene.parts.map((part) => ({
		id: part.id,
		name: part.name,
		role: part.role,
		shownByDefault: shownByDefault(part),
		levels: part.levels.map(({ level, meshes }) => ({
			level,
			meshes: meshes.flatMap((index) => paths.get(index)?.path ?? []),
			triangles: meshes.reduce((sum, index) => sum + (paths.get(index)?.mesh.indices.length ?? 0) / 3, 0)
		}))
	}));
}
//#endregion
//#region ../../packages/core/src/inspect.ts
function exporterName(scene) {
	const exporter = scene.source.exporter;
	if (!exporter) return null;
	return [exporter.name, exporter.version].filter((part) => part !== null && part !== "").join(" ");
}
/** A plain JSON summary of an imported file, for `asset.inspect`. */
function inspectScene(scene, file) {
	const { source } = scene;
	const meshes = meshesOf(scene).map(({ name, path, mesh }) => ({
		name,
		path,
		triangles: mesh.indices.length / 3,
		vertices: mesh.sourceVertexCount,
		skinned: mesh.skeleton !== null
	}));
	return {
		file: {
			path: file.path,
			name: basename(file.path),
			bytes: file.bytes
		},
		format: source.format,
		exporter: exporterName(scene),
		fps: source.fps,
		upAxis: source.originalSpace.axes.up,
		unitMeters: source.originalSpace.unitMeters,
		height: round5(scene.bounds.max[1] - scene.bounds.min[1]),
		meshes,
		parts: partsOf(scene),
		triangles: meshes.reduce((sum, mesh) => sum + mesh.triangles, 0),
		bones: scene.nodes.flatMap(({ name, path, kind }) => kind === "bone" ? [{
			name,
			path
		}] : []),
		materials: inspectMaterials(scene),
		textures: inspectTextures(scene),
		clips: scene.clips.map((clip) => ({
			name: clip.name,
			displayName: clip.displayName,
			frames: clip.frameCount,
			fps: clip.fps,
			duration: round5(clip.duration)
		})),
		composition: file.composition,
		members: file.members,
		warnings: source.warnings
	};
}
/**
* One entry per material name with the textures of all its copies, since an importer makes a copy of a material for
* each way a mesh reads it, such as another UV map or vertex colors.
*/
function inspectMaterials(scene) {
	const byName = /* @__PURE__ */ new Map();
	for (const material of scene.materials) {
		const inspected = inspectMaterial(scene, material);
		const known = byName.get(inspected.name);
		if (!known) {
			byName.set(inspected.name, inspected);
			continue;
		}
		for (const texture of inspected.textures) if (!known.textures.some((entry) => entry.slot === texture.slot && entry.texture === texture.texture)) known.textures.push(texture);
	}
	return [...byName.values()];
}
function inspectMaterial(scene, material) {
	const textures = [];
	for (const key of TEXTURE_REF_KEYS) {
		const ref = material[key];
		const texture = ref ? scene.textures[ref.texture] : void 0;
		if (texture) textures.push({
			slot: TEXTURE_REF_NAMES[key],
			texture: texture.name
		});
	}
	return {
		name: material.name,
		textures
	};
}
/** The textures the importer found, then the ones its "texture-not-found" warnings name. */
function inspectTextures(scene) {
	const found = scene.textures.map((texture) => ({
		name: texture.name,
		found: true,
		mimeType: texture.mimeType
	}));
	const missing = /* @__PURE__ */ new Set();
	for (const warning of scene.source.warnings) if (warning.code === "texture-not-found") missing.add(warning.subject.name);
	return [...found, ...[...missing].map((name) => ({
		name,
		found: false,
		mimeType: null
	}))];
}
/** The files besides the model that a version was read from, once per file and role. */
function inspectMembers(files) {
	const members = /* @__PURE__ */ new Map();
	const add = (label, role, found) => {
		const key = `${role}\n${label}`;
		if (!members.has(key)) members.set(key, {
			file: label,
			role,
			found
		});
	};
	const member = (path) => files.members.get(path);
	for (const path of files.animations) {
		const read = member(path);
		if (read) add(read.label, "animation", read.bytes !== null);
	}
	for (const { path, bone } of files.attach) {
		const read = member(path);
		if (read) add(read.label, bone === null ? "set" : "attach", read.bytes !== null);
	}
	for (const texture of files.textures) add(texture.label, "texture", texture.bytes !== null);
	return [...members.values()];
}
/** The folder at a repository's root that holds Arcue's review data. */
var ARCUE_FOLDER = ".arcue";
/**
* The review folder is `.arcue/reviews/<path relative to the repository root>/` at the repository root. Outside a
* repository it is `reviews/<absolute path without its root marks>/` under the app data folder.
*/
async function locateReview(platform, assetPath) {
	const path = normalizePath(assetPath);
	const workspaceRoot = await platform.findWorkspaceRoot(path);
	return (workspaceRoot === null ? null : reviewLocationIn(platform.appDataDir, workspaceRoot, path)) ?? reviewLocationIn(platform.appDataDir, null, path);
}
function reviewLocationIn(appDataDir, workspaceRoot, modelPath) {
	const path = normalizePath(modelPath);
	if (workspaceRoot === null) {
		const root = joinPath(appDataDir, "reviews");
		return {
			workspaceRoot: null,
			root,
			folder: joinPath(root, rootless(path)),
			assetPath: path
		};
	}
	const relative = pathInside(workspaceRoot, path);
	if (!relative) return null;
	const root = joinPath(workspaceRoot, ARCUE_FOLDER, "reviews");
	return {
		workspaceRoot,
		root,
		folder: joinPath(root, relative),
		assetPath: relative
	};
}
function rootless(path) {
	if (path.startsWith("//")) return path.slice(2);
	const drive = /^([A-Z]):\//.exec(path);
	if (drive) return `${drive[1]}/${path.slice(3)}`;
	return path.slice(1);
}
function reviewFilePath(location) {
	return joinPath(location.folder, "review.json");
}
async function checkReviewPath(platform, location, path) {
	const root = location.workspaceRoot ?? platform.appDataDir;
	if (pathInside(location.folder, path) === null || !await insideWithoutLinks(platform, root, path)) throw new ArcueError("conflict", `${path} is outside the review folder or reached through a symbolic link.`);
}
async function writeReviewFile(platform, location, path, data) {
	await checkReviewPath(platform, location, path);
	await platform.writeFileAtomic(path, data);
}
async function removeReviewFile(platform, location, path) {
	await checkReviewPath(platform, location, path);
	await platform.remove(path);
}
/**
* Call before writing into a review folder. When the repository has no `.arcue/` folder yet, or only an empty one that
* a failed first write left behind, it writes `.arcue/.gitignore` containing `*`, so git ignores the reviews until
* someone deletes that file to share them. An `.arcue/` folder with anything in it, or a link, is left as it is, the
* repository's own `.gitignore` is never touched, and outside a repository nothing happens.
*/
async function prepareArcueFolder(platform, location) {
	if (location.workspaceRoot === null) return;
	const folder = joinPath(location.workspaceRoot, ARCUE_FOLDER);
	const stat = await platform.stat(folder);
	if (stat !== null && (stat.kind !== "directory" || (await platform.list(folder)).length > 0)) return;
	await platform.writeFileAtomic(joinPath(folder, ".gitignore"), "*\n");
}
/** The asset's composition file, which the review folder keeps beside `review.json`, so nothing lands beside the model. */
function compositionFilePath(location) {
	return joinPath(location.folder, COMPOSITION_FILE_NAME);
}
function emptyReview(assetPath) {
	return {
		schemaVersion: 1,
		asset: { path: assetPath },
		versions: [],
		comments: [],
		queue: [],
		rounds: [],
		revision: 0
	};
}
/**
* Parses `review.json`. A file from a newer Arcue, broken JSON and content that breaks the schema reject as "conflict",
* so the core never overwrites a file it cannot read.
*/
function parseReview(text, path) {
	let raw;
	try {
		raw = JSON.parse(text);
	} catch (error) {
		throw new ArcueError("conflict", `${path} is not valid JSON.`, { cause: error });
	}
	const version = typeof raw === "object" && raw !== null && "schemaVersion" in raw ? raw.schemaVersion : void 0;
	if (typeof version === "number" && version > 1) throw new ArcueError("conflict", `${path} has schema version ${version}, made by a newer Arcue.`);
	const parsed = reviewFileSchema.safeParse(raw);
	if (!parsed.success) {
		const issues = parsed.error.issues.map((issue) => ({
			path: issue.path.map((key) => typeof key === "number" ? key : String(key)),
			message: issue.message
		}));
		const summary = issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
		throw new ArcueError("conflict", `${path} does not match the review schema. ${summary}`, { issues });
	}
	return parsed.data;
}
/**
* The asset's saved review and the file's text, or an empty review and null when there is no file. The asset path is
* taken from the location. A file that cannot be read rejects as "conflict".
*/
async function loadReview(platform, location) {
	const path = reviewFilePath(location);
	await checkReviewPath(platform, location, path);
	const stat = await platform.stat(path);
	if (stat === null) return {
		review: emptyReview(location.assetPath),
		text: null
	};
	if (stat.kind !== "file") throw new ArcueError("conflict", `${path} is not a plain file.`);
	const text = await platform.readText(path);
	const review = parseReview(text, path);
	return {
		review: {
			...review,
			asset: {
				...review.asset,
				path: location.assetPath
			}
		},
		text
	};
}
/** Whether a newer Arcue saved the review, which may then hold fields that this build drops as it reads the file. */
function isNewerFormat(review) {
	return reviewFormat(review) > 1;
}
/** Refuses to save over a review a newer Arcue saved, since that would delete the fields this build does not know. */
function checkSavable(review, location) {
	if (isNewerFormat(review)) throw new ArcueError("forbidden", `The review of ${basename(location.folder)} was saved by a newer version of Arcue. Update Arcue to change it.`);
}
/** The review as this build saves it: at `revision`, and in this build's format, recorded beside the schema version. */
function savedReview(review, revision) {
	const { schemaVersion, format: _format, ...rest } = review;
	return {
		schemaVersion,
		format: 1,
		...rest,
		revision
	};
}
/** The file text of a review, after checking it against the schema. */
function serializeReview(review) {
	const checked = reviewFileSchema.safeParse(review);
	if (!checked.success) {
		const summary = checked.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
		throw new ArcueError("internal", `The review change would break review.json. ${summary}`);
	}
	return `${JSON.stringify(review, null, 2)}\n`;
}
//#endregion
//#region ../../packages/core/src/review-move.ts
/**
* Moves a model's review folder, with its `review.json`, `composition.json`, screenshots and rounds, to the review
* folder of the model's new path in one rename, then writes the new path into `review.json`. It never overwrites or
* merges: a review or anything else at the new place refuses the move with "conflict", except an empty folder or, with
* `replaceUntouched`, an untouched review. A `review.json` it cannot read or a newer Arcue saved refuses the move
* before anything changes, and a failure after the rename moves the folder back. When the model moved to another
* folder or took another name, the composition's paths are rewritten so they still find the same files, and the ids
* `review.json` keeps for those files follow them.
*/
async function moveReview(platform, move) {
	const { from, to } = move;
	const source = reviewFilePath(from);
	await checkReviewPath(platform, from, source);
	await checkReviewPath(platform, to, to.folder);
	if ((await platform.stat(source))?.kind !== "file") throw new ArcueError("not-found", `${basename(move.fromModel)} has no review to move.`);
	const review = parseReview(await platform.readText(source), source);
	checkSavable(review, from);
	const composition = await movedComposition(platform, move, review);
	await clearTarget(platform, move);
	await prepareArcueFolder(platform, to);
	await platform.rename(from.folder, to.folder);
	const compositionPath = compositionFilePath(to);
	try {
		if (composition.text !== null) await writeReviewFile(platform, to, compositionPath, composition.text);
		const moved = relabelMembers({
			...review,
			asset: {
				...review.asset,
				path: to.assetPath
			}
		}, composition.labels);
		await writeReviewFile(platform, to, reviewFilePath(to), serializeReview(savedReview(moved, review.revision + 1)));
	} catch (error) {
		const undo = async () => {
			if (composition.text !== null) {
				if (composition.original === null) await removeReviewFile(platform, to, compositionPath);
				else await writeReviewFile(platform, to, compositionPath, composition.original);
			}
			await checkReviewPath(platform, to, to.folder);
			await checkReviewPath(platform, from, from.folder);
			await platform.rename(to.folder, from.folder);
		};
		await undo().catch(() => void 0);
		throw error;
	}
	await removeEmptyFolders(platform, from);
}
/**
* Whether a review holds nothing but versions: no comments, rounds or dismissed warnings. A review a newer Arcue saved
* may hold what this build cannot read, so it never counts as untouched.
*/
function isUntouched(review) {
	return !isNewerFormat(review) && review.comments.length === 0 && review.rounds.length === 0 && (review.dismissedWarnings ?? []).length === 0;
}
async function clearTarget(platform, move) {
	const { folder } = move.to;
	const stat = await platform.stat(folder);
	if (stat === null) return;
	const name = basename(move.toModel);
	if (stat.kind !== "directory") throw new ArcueError("conflict", `${folder} is in the way of ${name}'s review.`);
	const entries = await platform.list(folder);
	if (entries.length > 0) {
		const hasReview = entries.some((entry) => entry.name === "review.json");
		const onlyReview = hasReview && entries.length === 1;
		const untouched = hasReview && await untouchedReview(platform, move.to);
		if (!(move.replaceUntouched === true && onlyReview && untouched)) throw new ArcueError("conflict", hasReview && (onlyReview || !untouched) ? `${name} already has a review, so the review of ${basename(move.fromModel)} stays where it is.` : `${folder} already holds files, so the review of ${basename(move.fromModel)} stays where it is.`);
	}
	await removeReviewFile(platform, move.to, folder);
}
async function untouchedReview(platform, location) {
	const file = reviewFilePath(location);
	try {
		return isUntouched(parseReview(await platform.readText(file), file));
	} catch {
		return false;
	}
}
/**
* The composition file's text after a move, or null when it stays as it is, with its text before, null where there was
* no file, and the old and new labels of the files whose paths changed. A broken composition file is left as it is.
*/
async function movedComposition(platform, move, review) {
	const fromFolder = dirname(move.fromModel);
	const toFolder = dirname(move.toModel);
	let found;
	try {
		found = await readComposition(platform, compositionFilePath(move.from), "conflict");
	} catch {
		return {
			text: null,
			original: null,
			labels: /* @__PURE__ */ new Map()
		};
	}
	const before = found?.composition ?? { version: 1 };
	const rebased = fromFolder === toFolder ? {
		composition: before,
		labels: /* @__PURE__ */ new Map()
	} : await rebaseComposition(platform, before, fromFolder, toFolder);
	const joined = await joinedByName(platform, move, review, before);
	const animations = [...rebased.composition.animations ?? [], ...joined.animations];
	const text = serializeComposition({
		...rebased.composition,
		animations
	});
	const labels = new Map([...rebased.labels, ...joined.labels]);
	if (text === serializeComposition(before)) return {
		text: null,
		original: null,
		labels
	};
	return {
		text,
		original: found?.text ?? null,
		labels
	};
}
/**
* The composition for a model that moved from `fromFolder` to `toFolder`. A path that still finds a file from the old
* folder is rewritten to point at that file, so a file of the same name beside the new folder never takes its place.
* A path whose old file is gone stays as written, as when the files moved along with the model. `labels` maps each
* rewritten file's label, its path relative to the model's folder, from the old to the new one.
*/
async function rebaseComposition(platform, composition, fromFolder, toFolder) {
	const labels = /* @__PURE__ */ new Map();
	const rewritten = /* @__PURE__ */ new Map();
	for (const written of new Set(writtenPaths(composition))) {
		const file = joinPath(fromFolder, written);
		const moved = relativePath(toFolder, file);
		const label = relativePath(fromFolder, file);
		if (moved === null || label === null || (await platform.stat(file))?.kind !== "file") continue;
		rewritten.set(written, moved);
		if (label !== moved) labels.set(label, moved);
	}
	return {
		composition: withRewrittenPaths(composition, (written) => rewritten.get(written) ?? written, (id) => relabelId(id, labels)),
		labels
	};
}
/**
* The old model's "<stem>@<clip>" model files that the review names and that would no longer join the model by name.
* Each maps to the new model's file of the same clip when there is one beside it. Otherwise, while it still exists, it
* joins as an animation file written from the new model's folder, labelled as that path, as any member file is.
*/
async function joinedByName(platform, move, review, composition) {
	const fromFolder = dirname(move.fromModel);
	const toFolder = dirname(move.toModel);
	const listed = new Set(writtenPaths(composition).map((written) => relativePath(fromFolder, joinPath(fromFolder, written))));
	const animations = [];
	const labels = /* @__PURE__ */ new Map();
	for (const label of namedFiles(review)) {
		if (!joinsByName(basename(move.fromModel), label) || listed.has(label)) continue;
		const renamed = `${stemOf(move.toModel)}${label.slice(stemOf(move.fromModel).length)}`;
		if ((await platform.stat(joinPath(toFolder, renamed)))?.kind === "file") {
			if (renamed !== label) labels.set(label, renamed);
			continue;
		}
		const old = joinPath(fromFolder, label);
		const written = relativePath(toFolder, old);
		if (written === null || (await platform.stat(old))?.kind !== "file") continue;
		animations.push(written);
		if (written !== label) labels.set(label, written);
	}
	return {
		animations,
		labels
	};
}
/**
* The review with the ids it keeps for a composition's files renamed: node, mesh, part and clip ids written as
* `<file>//<path>`, warning ids and files, and the files of each version. `labels` maps old file labels to new ones.
*/
function relabelMembers(review, labels) {
	if (labels.size === 0) return review;
	return renameFiles(review, (label) => labels.get(label) ?? label);
}
/** The file labels the review's ids name, such as "Hero@Run.fbx" for a comment on the clip "Hero@Run.fbx//Run". */
function namedFiles(review) {
	const named = /* @__PURE__ */ new Set();
	renameFiles(review, (label) => {
		named.add(label);
		return label;
	});
	return named;
}
function renameFiles(review, rename) {
	const id = (value) => renameMember(value, rename);
	const dismissed = review.dismissedWarnings?.map((value) => renameWarningId(value, rename));
	return {
		...review,
		...dismissed ? { dismissedWarnings: dismissed } : {},
		versions: review.versions.map((version) => ({
			...version,
			meshes: version.meshes.map((entry) => ({
				...entry,
				mesh: id(entry.mesh)
			})),
			...version.files ? { files: version.files.map((file) => ({
				...file,
				file: rename(file.file)
			})) } : {}
		})),
		comments: review.comments.map((comment) => ({
			...comment,
			time: comment.time.kind === "none" ? comment.time : {
				...comment.time,
				clip: id(comment.time.clip)
			},
			target: comment.target && {
				...comment.target,
				mesh: id(comment.target.mesh)
			},
			context: {
				...comment.context,
				joints: comment.context.joints.map((joint) => ({
					...joint,
					path: id(joint.path)
				}))
			},
			...comment.parts ? { parts: {
				...comment.parts,
				hidden: comment.parts.hidden.map(id),
				shown: comment.parts.shown.map(id),
				isolated: comment.parts.isolated && id(comment.parts.isolated)
			} } : {},
			...comment.warning ? { warning: {
				...comment.warning,
				id: renameWarningId(comment.warning.id, rename),
				...comment.warning.file === void 0 ? {} : { file: rename(comment.warning.file) }
			} } : {}
		}))
	};
}
/** A node, mesh, part or clip id with its file renamed, when it comes from a file in `labels`. */
function relabelId(id, labels) {
	return renameMember(id, (label) => labels.get(label) ?? label);
}
function renameMember(id, rename) {
	const { file, path } = splitMemberPath(id);
	if (file === null) return id;
	const renamed = rename(file);
	return renamed === file ? id : memberPath(renamed, path);
}
/** A warning id is "<code>:<kind>:<name>", where the name of a composition file's subject starts with "<file>//". */
function renameWarningId(id, rename) {
	const match = /^([^:]*:[^:]*:)(.*)$/s.exec(id);
	return match ? `${match[1]}${renameMember(match[2] ?? "", rename)}` : id;
}
/** Removes the folders above `folder` that the move left empty, up to the reviews root, one empty folder at a time. */
async function removeEmptyFolders(platform, location) {
	try {
		for (let current = dirname(location.folder); pathInside(location.root, current); current = dirname(current)) {
			if (!await insideWithoutLinks(platform, location.workspaceRoot ?? platform.appDataDir, current)) return;
			await platform.removeEmptyFolder(current);
		}
	} catch {
		return;
	}
}
//#endregion
//#region ../../packages/core/src/lost-files.ts
/**
* The composition's member files and override textures that are gone, each with the identity the newest version that
* read it recorded: its hash and size, or its Unity GUID. Files no version identified are left out.
*/
function lostFiles(files, review) {
	const gone = [...[...files.members.values()].filter((file) => file.problem === MEMBER_NOT_FOUND), ...files.textures.filter((texture) => texture.bytes === null)];
	const lost = /* @__PURE__ */ new Map();
	for (const file of gone) {
		const identity = recorded(review, file.label);
		if (identity && !lost.has(file.path)) lost.set(file.path, {
			path: file.path,
			identity
		});
	}
	return [...lost.values()];
}
function recorded(review, label) {
	for (const version of [...review.versions].reverse()) {
		const file = version.files?.find((entry) => entry.file === label);
		if (file && (file.hash !== void 0 || file.guid !== void 0)) return file;
	}
}
/**
* Where each lost file went: the one file with its extension, in its own folder, the model's folder or a folder below
* either, that has its size and full hash or its Unity GUID. The search is the file search's, bounded and link-free
* inside `readRoot`; it compares sizes first and hashes only files of the same size. A file with no match or several
* stays lost, and paths in `taken`, which the model and its composition already use, never match.
*/
async function findLostFiles(platform, modelPath, readRoot, lost, taken) {
	const found = /* @__PURE__ */ new Map();
	for (const file of lost) {
		const name = basename(file.path);
		const dot = name.lastIndexOf(".");
		if (dot <= 0) continue;
		const extension = name.slice(dot).toLowerCase();
		const matches = await filesMatching(platform, (await findFilesByExtension(platform, readRoot, [dirname(file.path), dirname(modelPath)], [extension])).filter((candidate) => !taken.has(candidate)), [file.identity], file.identity.guid);
		const [only] = matches;
		if (only !== void 0 && matches.length === 1) found.set(file.path, only);
	}
	return found;
}
/**
* The composition with each file in `moved`, by absolute path, written at its new path relative to the model's
* folder, and the old and new labels of those files, for the ids that name them.
*/
function withMovedFiles(composition, modelFolder, moved) {
	const labels = /* @__PURE__ */ new Map();
	const rewritten = /* @__PURE__ */ new Map();
	for (const written of writtenPaths(composition)) {
		const target = moved.get(joinPath(modelFolder, written));
		const label = relativePath(modelFolder, joinPath(modelFolder, written));
		const next = target === void 0 ? null : relativePath(modelFolder, target);
		if (next === null || label === null) continue;
		rewritten.set(written, next);
		labels.set(label, next);
	}
	return {
		composition: withRewrittenPaths(composition, (written) => rewritten.get(written) ?? written, (id) => relabelId(id, labels)),
		labels
	};
}
//#endregion
//#region ../../packages/core/src/open-asset.ts
/** Everything the core holds for one open asset. */
var OpenAsset = class {
	id;
	/** Normalized absolute path of the asset file. It changes only when the asset follows its file to a new path. */
	path;
	/** The model's composition file, `composition.json` in its review folder. */
	compositionPath;
	location;
	session;
	/** Earlier reviews that may belong to the asset, best first, as `review.candidates` lists them. */
	candidates = [];
	/** Earlier reviews to compare the meshes of the first version with, until it loads. */
	earlier = [];
	/** The full hash and size of the model file the version on screen was read from. */
	identity = null;
	/**
	* The names of the files with the model's extension in its folder when the model last loaded, so a rename shows as a
	* name not among them. Null before the first load, and when there were more than the core checks for a rename.
	*/
	siblings = null;
	/** The model file stayed missing after a change, and no file in its folder could be followed. */
	missing = false;
	/** Lost composition files already looked for under a new name, by path, until the next `asset.reload`. */
	searched = /* @__PURE__ */ new Set();
	/** The composition file applied to the version on screen, or null for a plain model. */
	composition = null;
	status = "loading";
	version = null;
	scene = null;
	error = null;
	viewState = null;
	/** The connection of the window that shows the asset. */
	window = null;
	closed = false;
	/** Set while `asset.close` waits for the edits in flight. */
	closing = null;
	/** Serializes parses of the file. */
	loads = new Serial();
	stopWatching = [];
	/** Watchers of the composition file and the files it names, by path. */
	compositionWatchers = /* @__PURE__ */ new Map();
	/** Parsed files by path with the id of the bytes they came from, so a reload parses only what changed. */
	imported = /* @__PURE__ */ new Map();
	/** The model and the files of its composition, by path, as the version on screen loaded them. */
	loadedFiles = /* @__PURE__ */ new Set();
	/** The file `composition.fileRoles` read last, whose parse stays until the next question so adding it reads it once. */
	asked = null;
	/** Serializes edits of the composition file. */
	compositionEdits = new Serial();
	cancelStabilityCheck = () => void 0;
	stabilityCheck = 0;
	constructor(id, path, location, session) {
		this.id = id;
		this.path = path;
		this.location = location;
		this.session = session;
		this.compositionPath = compositionFilePath(location);
	}
	/** Points the asset at its model's new path and review folder, keeping its id and the model's parsed scene. */
	relocate(path, location) {
		const parsed = this.imported.get(this.path);
		this.imported.delete(this.path);
		if (parsed) this.imported.set(path, parsed);
		this.path = path;
		this.location = location;
		this.compositionPath = compositionFilePath(location);
	}
	/** The folder the asset's files may be read from; see `readRootFor`. */
	get readRoot() {
		return readRootFor(this.location.workspaceRoot, this.path);
	}
	/** The scene parsed from these bytes of the file before, if any. */
	parsed(path, id) {
		const cached = this.imported.get(path);
		return cached?.id === id ? cached.scene : null;
	}
	get name() {
		return basename(this.path);
	}
	get summary() {
		const summary = {
			assetId: this.id,
			path: this.path,
			name: this.name,
			status: this.status,
			version: this.version,
			error: this.error
		};
		if (this.composition !== null) summary.composition = this.composition;
		return summary;
	}
	loaded() {
		if (!this.scene || this.version === null) throw new ArcueError("unavailable", `${this.name} has not loaded yet.`);
		return {
			scene: this.scene,
			version: this.version
		};
	}
	/** The loaded scene, after checking that a target or time was picked on the version on screen. */
	pickedOn(version) {
		const loaded = this.loaded();
		if (version !== loaded.version) throw new ArcueError("conflict", `The target was picked on version ${version}, but ${this.name} now shows ${loaded.version}. Pick it again.`);
		return loaded;
	}
};
/** The folder an asset's files may be read from: its git repository, or outside one the model's own folder. */
function readRootFor(workspaceRoot, modelPath) {
	return workspaceRoot ?? dirname(modelPath);
}
function findComment(review, commentId) {
	const comment = review.comments.find((entry) => entry.id === commentId);
	if (!comment) throw new ArcueError("not-found", `There is no comment ${commentId}.`);
	return comment;
}
//#endregion
//#region ../../packages/core/src/warnings.ts
/**
* The scene's import warnings with their ids, errors first. Each says whether the review dismissed it, the newest
* comment made from it, and the command that fixes it. A warning listed twice is listed once.
*/
function listWarnings(scene, review, assetPath) {
	const seen = /* @__PURE__ */ new Set();
	const warnings = [];
	for (const warning of scene.source.warnings) {
		const id = warningId(warning);
		if (seen.has(id)) continue;
		seen.add(id);
		warnings.push(withReview(warning, review, fixFor(warning, scene, assetPath)));
	}
	return [...warnings.filter((entry) => entry.severity === "error"), ...warnings.filter((e) => e.severity !== "error")];
}
/**
* The error for a model whose file is gone while it is open, when no file in its folder could be followed. Retry
* loads it once it is back; the fix relinks the asset to a file the person chooses.
*/
function modelNotFound(review, assetPath) {
	const name = basename(assetPath);
	return withReview(importWarning("model-not-found", {
		kind: "file",
		name
	}, `Model not found: ${name}`, void 0, { detail: `${assetPath} was removed or renamed.` }), review, { kind: "choose-model" });
}
function withReview(warning, review, fix) {
	const id = warningId(warning);
	return {
		id,
		...warning,
		dismissed: (review.dismissedWarnings ?? []).includes(id),
		commentId: newestComment(review, id)?.id ?? null,
		fix
	};
}
function findWarning(warnings, id) {
	const warning = warnings.find((entry) => entry.id === id);
	if (!warning) throw new ArcueError("not-found", `The asset has no import warning "${id}".`);
	return warning;
}
function newestComment(review, id) {
	let newest = null;
	for (const comment of review.comments) {
		if (comment.warning?.id !== id) continue;
		if (!newest || byCreation(comment, newest) > 0) newest = comment;
	}
	return newest;
}
/**
* The name of the clip a clip warning is about: its name in the file, with the file as a prefix for a composition's
* file, as the composed scene names that file's clips. Null for a warning about something else.
*/
function warningClip(warning) {
	if (warning.subject.kind !== "clip") return null;
	return warning.file === void 0 ? warning.subject.name : memberPath(warning.file, warning.subject.name);
}
function fixFor(warning, scene, assetPath) {
	const { subject } = warning;
	const clip = warningClip(warning);
	if (clip !== null && scene.clips.some((entry) => entry.name === clip)) return {
		kind: "show-clip",
		clip
	};
	if (subject.kind === "file" && warning.file !== void 0 && (warning.code === "file-not-found" || warning.code === "invalid-data" || warning.code === "composition-not-loaded")) return { kind: "retry" };
	const use = (warning.uses ?? []).find((candidate) => scene.materials.some((material) => material.name === candidate.material && material.textureOverrides?.[candidate.slot]?.found !== true));
	if ((warning.code === "texture-not-found" || warning.code === "texture-path-absolute") && use) return {
		kind: "choose-texture",
		material: use.material,
		slot: use.slot
	};
	if (warning.code === "texture-not-used" && warning.foundPath !== void 0 && warning.file === void 0) {
		const untextured = scene.materials.filter((material) => material.baseColorTexture === null);
		const [material] = untextured;
		if (untextured.length === 1 && material) return {
			kind: "use-as-base-color",
			material: material.name,
			file: joinPath(dirname(assetPath), warning.foundPath)
		};
	}
	return null;
}
/** What a comment keeps of the warning it was made from. */
function commentWarning(warning) {
	const kept = {
		id: warning.id,
		code: warning.code,
		subject: {
			kind: warning.subject.kind,
			name: warning.subject.name
		}
	};
	if (warning.file !== void 0) kept.file = warning.file;
	if (warning.detail !== void 0) kept.detail = warning.detail;
	return kept;
}
/** The text the copy button puts on the clipboard: one instruction for an agent, then each warning not dismissed. */
function warningPrompt(assetPath, warnings) {
	const listed = warnings.filter((warning) => !warning.dismissed);
	if (listed.length === 0) return `${assetPath} has no import warnings.`;
	const lines = [`Fix these import warnings for ${assetPath}.`];
	listed.forEach((warning, index) => {
		const parts = [warning.message, subjectLabel(warning)];
		if (warning.detail !== void 0) parts.push(warning.detail);
		lines.push(`${index + 1}. ${parts.join(" · ")}`);
	});
	return lines.join("\n");
}
/** The warning's subject for a prompt, such as `texture "Rock.png"` or `clip "Turn" in beetle-turn.fbx`. */
function subjectLabel(warning) {
	const label = `${warning.subject.kind} "${warning.subject.name}"`;
	return warning.file === void 0 || warning.file === warning.subject.name ? label : `${label} in ${warning.file}`;
}
var DEFAULT_FOV = 30;
/** A camera that frames the scene from the front, for a comment made without a view. */
function frontCamera(scene) {
	const { min, max } = scene.bounds;
	const center = [
		(min[0] + max[0]) / 2,
		(min[1] + max[1]) / 2,
		(min[2] + max[2]) / 2
	];
	const distance = Math.max(.01, Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2) / Math.sin(DEFAULT_FOV * Math.PI / 360);
	return {
		position: [
			center[0],
			center[1],
			center[2] + distance
		],
		target: center,
		up: [
			0,
			1,
			0
		],
		fov: DEFAULT_FOV
	};
}
//#endregion
//#region ../../packages/core/src/prompt.ts
/** A region lists its bones down to this share of its skin weight. */
var LISTED_BONE_SHARE = .05;
var LISTED_BONES = 4;
var LISTED_PARTS = 3;
/** Renders a round as the Markdown prompt for coding agents, in the format of the example in the spec. */
function renderPrompt({ data, assetPath, roundFolder, exportedAt, partNames = /* @__PURE__ */ new Map() }) {
	const count = data.comments.length;
	const up = data.asset.space.up === "+Z" ? "Z up as in Blender" : "Y up";
	return [[
		`3D review · round ${data.round} · ${count} ${count === 1 ? "comment" : "comments"}`,
		`Asset: ${assetPath}`,
		`Version ${data.asset.version.slice(0, 7)}, saved ${exportedAt}`,
		...compositionLine(data),
		`Data and screenshots: ${roundFolder.endsWith("/") ? roundFolder : `${roundFolder}/`}`,
		`Meters, right-handed, ${up}. Frames count from each clip's first frame (0) at ${formatNumber$1(data.asset.fps)} fps.`,
		"Vertex numbers follow the file's vertex order, which is Blender's order for files from Blender."
	].join("\n"), ...data.comments.map((comment) => renderComment(comment, partNames))].join("\n\n");
}
/**
* The other files of a composition, which the prompt names once so their prefixed mesh paths make sense. The
* composition file itself lives in the review folder, not the model's, so it is left out.
*/
function compositionLine(data) {
	const others = (data.asset.files ?? []).slice(1).map((file) => file.file).filter((file) => file !== COMPOSITION_FILE_NAME);
	if (others.length === 0) return [];
	return [`Also loaded, relative to the model's folder: ${others.join(", ")}. Meshes from those files are named "<file>//<node path>".`];
}
function renderComment(comment, partNames) {
	if (comment.warning) return renderWarningComment(comment, comment.warning);
	const headline = [timeLabel(comment), targetLabel(comment)];
	const parts = comment.parts ? partsLabel(comment.parts, partNames) : null;
	if (parts) headline.push(parts);
	if (comment.anchorState === "detached" && comment.anchorVersion !== null) headline.push(`detached: its vertex numbers refer to version ${comment.anchorVersion}, so match it by its rest positions`);
	const firstRound = comment.earlierMessages[0]?.round;
	if (firstRound !== void 0) headline.push(`follow-up, first sent in round ${firstRound}`);
	const lines = [`${comment.number}. ${headline.join(" · ")}`];
	const bones = comment.target?.kind === "region" ? listedBones(comment.target.bones) : [];
	if (bones.length > 0) lines.push(`   Bones: ${bones.map((bone) => `${bone.name} ${percent(bone.share)}`).join(", ")}`);
	const view = viewLine(comment);
	if (view) lines.push(`   ${view}`);
	for (const earlier of comment.earlierMessages) lines.push(`   Round ${earlier.round}: ${quote(earlier.text)}`);
	lines.push(`   ${quote(comment.text)}`);
	return lines.join("\n");
}
/** A comment made from an import warning: the warning's code and subject, its detail, then the comment's text. */
function renderWarningComment(comment, warning) {
	const lines = [`${comment.number}. Import warning "${warning.code}" · ${subjectLabel(warning)}`];
	if (warning.detail !== void 0) lines.push(`   ${warning.detail}`);
	for (const earlier of comment.earlierMessages) lines.push(`   Round ${earlier.round}: ${quote(earlier.text)}`);
	lines.push(`   ${quote(comment.text)}`);
	return lines.join("\n");
}
function timeLabel({ time }) {
	if (time === null) return "Rest pose";
	if ("frame" in time) {
		const { sourceFrame } = time;
		const source = sourceFrame === void 0 || sourceFrame === time.frame ? "" : ` (file frame ${formatNumber$1(sourceFrame)})`;
		return `Clip "${time.clipDisplayName}", frame ${time.frame}${source}`;
	}
	const [first, last] = time.sourceFrames ?? [];
	const same = first === time.frames[0] && last === time.frames[1];
	const source = first === void 0 || last === void 0 || same ? "" : ` (file frames ${formatNumber$1(first)}–${formatNumber$1(last)})`;
	return `Clip "${time.clipDisplayName}", frames ${time.frames[0]}–${time.frames[1]}${source}`;
}
function targetLabel({ target }) {
	if (target === null) return "no surface target";
	if (target.kind === "region") return `region on "${target.mesh}", ${target.vertexCount} ${target.vertexCount === 1 ? "vertex" : "vertices"}`;
	const bone = strongest(target.bones);
	return bone ? `point on "${target.mesh}", near bone "${bone.name}"` : `point on "${target.mesh}"`;
}
function viewLine(comment) {
	if (comment.target === null && comment.screenshot === null) return null;
	const parts = [];
	if (comment.camera.label !== "") parts.push(`View: ${comment.camera.label}`);
	if (comment.screenshot !== null) parts.push(parts.length > 0 ? `screenshot: ${comment.screenshot}` : `Screenshot: ${comment.screenshot}`);
	return parts.length > 0 ? parts.join(" · ") : null;
}
/** One short clause for a view that differs from the default, such as "LOD1, Boulder2 hidden". */
function partsLabel(view, names) {
	const name = (id) => names.get(id) ?? nameInPath(id);
	const list = (ids) => {
		const listed = ids.slice(0, LISTED_PARTS).map(name).join(", ");
		return ids.length > LISTED_PARTS ? `${listed} and ${ids.length - LISTED_PARTS} more` : listed;
	};
	const clauses = [];
	if (view.lod > 0) clauses.push(`LOD${view.lod}`);
	if (view.isolated !== null) clauses.push(`${name(view.isolated)} isolated`);
	else {
		if (view.hidden.length > 0) clauses.push(`${list(view.hidden)} hidden`);
		if (view.shown.length > 0) clauses.push(`${list(view.shown)} shown`);
	}
	return clauses.length > 0 ? clauses.join(", ") : null;
}
function strongest(bones) {
	return bones.reduce((best, bone) => best === null || bone.share > best.share ? bone : best, null);
}
function listedBones(bones) {
	return [...bones].sort((a, b) => b.share - a.share).filter((bone) => Math.round(bone.share * 100) >= LISTED_BONE_SHARE * 100).slice(0, LISTED_BONES);
}
function percent(share) {
	return `${Math.round(share * 100)}%`;
}
function quote(text) {
	return `"${text.replaceAll("\n", "\n   ")}"`;
}
function formatNumber$1(value) {
	return String(Math.round(value * 1e3) / 1e3);
}
//#endregion
//#region ../../packages/core/src/reanchor.ts
/** A target farther than this share of the model's size from every surface is detached. */
var DETACH_SHARE = .02;
var INDEX_MIN_QUERIES = 128;
/**
* Moves comment anchors onto a new version of the asset. A mesh whose topology fingerprint matches the one in the
* comment's `anchorVersion` keeps its vertex and triangle numbers exactly. So does a mesh whose path alone changed, as
* when its parent object was renamed: the one mesh of the same file with the same name and topology at a path the
* anchor version did not have. Otherwise the stored rest positions are mapped onto the new rest pose: a pin to the
* closest surface point, and a region vertex by vertex to the nearest vertices, tinting the new triangles whose
* corners all mapped, or failing that the triangles that touch them. A target with no surface within `DETACH_SHARE`
* of the model's size is detached and keeps its old anchor. In a composition a target moves only onto meshes of its
* own file, so each file re-anchors on its own, and a target on a file the version does not load stays as it is until
* the file loads again. The part ids a comment's parts view stores follow their meshes' paths the same way, and the
* ids of LOD group nodes and sockets follow an ancestor whose path changed with its meshes.
*/
var Reanchorer = class {
	#versions;
	/** The versions before this one, newest first. */
	#earlier;
	#versionId;
	#meshes;
	#paths;
	/** The meshes by file and name, as a renamed mesh is looked up. */
	#named = /* @__PURE__ */ new Map();
	#partIds;
	/** The files that brought meshes to the version, null for the model's own. */
	#files;
	#threshold;
	#triangles = /* @__PURE__ */ new Map();
	#vertices = /* @__PURE__ */ new Map();
	#versionPaths = /* @__PURE__ */ new Map();
	#movedAncestors = /* @__PURE__ */ new Map();
	constructor(versions, versionId, scene) {
		this.#versions = new Map(versions.map((version) => [version.id, version]));
		this.#earlier = versions.filter((version) => version.id !== versionId).reverse();
		this.#versionId = versionId;
		this.#meshes = meshesOf(scene);
		this.#paths = new Set(this.#meshes.map((entry) => entry.path));
		for (const entry of this.#meshes) {
			const key = namedKey(entry.path);
			const named = this.#named.get(key);
			if (named) named.push(entry);
			else this.#named.set(key, [entry]);
		}
		this.#partIds = new Set(scene.parts.map((part) => part.id));
		this.#files = new Set(this.#meshes.map((entry) => splitMemberPath(entry.path).file));
		this.#threshold = DETACH_SHARE * modelSize(scene);
	}
	reanchor(comment) {
		if (comment.anchorVersion === this.#versionId) return comment;
		const anchored = this.#reanchorTarget(comment);
		const parts = comment.parts && this.#renamedParts(comment.parts, comment.anchorVersion);
		return parts === comment.parts ? anchored : {
			...anchored,
			parts
		};
	}
	#reanchorTarget(comment) {
		const target = comment.target;
		if (target === null) return comment;
		const samePath = this.#meshes.find((entry) => entry.path === target.mesh) ?? null;
		const anchorVersion = this.#versions.get(comment.anchorVersion);
		const previous = anchorVersion?.meshes.find((mesh) => mesh.mesh === target.mesh);
		if (samePath && previous && sameTopology(previous.topology, samePath.mesh.topology)) return this.#anchored(comment, samePath, target, "exact");
		const renamed = anchorVersion ? this.#renamed(target.mesh, anchorVersion) : null;
		if (renamed) return this.#anchored(comment, renamed, {
			...target,
			mesh: renamed.path
		}, "exact");
		const file = splitMemberPath(target.mesh).file;
		if (file !== null && !this.#files.has(file)) return comment;
		const candidates = samePath ? [samePath] : this.#meshes.filter((entry) => splitMemberPath(entry.path).file === file);
		const moved = target.kind === "surface" ? this.#movePin(comment, target, candidates) : this.#moveRegion(comment, candidates);
		if (!moved) return {
			...comment,
			anchorState: "detached"
		};
		return this.#anchored(comment, moved.entry, moved.target, "moved");
	}
	/**
	* The mesh that a mesh of an earlier version became when only its path changed: the one mesh of the same file with
	* the same name and topology at a path that version did not have. Null while a mesh still has the path.
	*/
	#renamed(path, version) {
		if (this.#paths.has(path)) return null;
		const before = version.meshes.find((mesh) => mesh.mesh === path);
		if (!before) return null;
		const earlier = this.#pathsOf(version);
		const found = (this.#named.get(namedKey(path)) ?? []).filter((entry) => !earlier.has(entry.path) && sameTopology(before.topology, entry.mesh.topology));
		return found.length === 1 ? found[0] ?? null : null;
	}
	#pathsOf(version) {
		let paths = this.#versionPaths.get(version.id);
		if (!paths) {
			paths = new Set(version.meshes.map((mesh) => mesh.mesh));
			this.#versionPaths.set(version.id, paths);
		}
		return paths;
	}
	/**
	* The ancestors whose path changed since an earlier version, old path to new, as the paths of its renamed meshes
	* show. An ancestor counts when its meshes agree on its new path, no mesh of that version was under the new path,
	* and no mesh of this version is under the old one.
	*/
	#ancestorsMovedSince(version) {
		const known = this.#movedAncestors.get(version.id);
		if (known) return known;
		const found = /* @__PURE__ */ new Map();
		for (const { mesh: path } of version.meshes) {
			const renamed = this.#renamed(path, version);
			const moved = renamed && movedAncestor(path, renamed.path);
			if (!moved) continue;
			const seen = found.get(moved.from);
			found.set(moved.from, seen === void 0 || seen === moved.to ? moved.to : null);
		}
		const under = (paths, ancestor) => [...paths].some((path) => path.startsWith(`${ancestor}/`));
		const moved = /* @__PURE__ */ new Map();
		for (const [from, to] of found) if (to !== null && !under(this.#pathsOf(version), to) && !under(this.#paths, from)) moved.set(from, to);
		this.#movedAncestors.set(version.id, moved);
		return moved;
	}
	/**
	* The part id an id of an earlier version became: the path its mesh moved to, as a target moves, or else its path
	* under the new path of an ancestor that moved. Null when the version gives no part of this one.
	*/
	#renamedPart(id, version) {
		const mesh = this.#renamed(id, version)?.path;
		if (mesh !== void 0 && this.#partIds.has(mesh)) return mesh;
		let best = null;
		let longest = -1;
		for (const [from, to] of this.#ancestorsMovedSince(version)) {
			if (from.length <= longest || !id.startsWith(`${from}/`)) continue;
			const renamed = to + id.slice(from.length);
			if (!this.#partIds.has(renamed)) continue;
			best = renamed;
			longest = from.length;
		}
		return best;
	}
	/**
	* A stored parts view with each part id this version lacks moved to the part it became, looked up in the anchor
	* version and then in each earlier version, newest first. The view itself when nothing moved.
	*/
	#renamedParts(view, anchorVersion) {
		const anchor = this.#versions.get(anchorVersion);
		const versions = anchor ? [anchor, ...this.#earlier.filter((version) => version !== anchor)] : this.#earlier;
		let changed = false;
		const rename = (id) => {
			if (this.#partIds.has(id)) return id;
			for (const version of versions) {
				const renamed = this.#renamedPart(id, version);
				if (renamed === null) continue;
				changed = true;
				return renamed;
			}
			return id;
		};
		const renameAll = (ids) => [...new Set(ids.map(rename))].sort();
		const next = {
			...view,
			hidden: renameAll(view.hidden),
			shown: renameAll(view.shown),
			isolated: view.isolated === null ? null : rename(view.isolated)
		};
		return changed ? next : view;
	}
	#anchored(comment, entry, target, state) {
		return {
			...comment,
			target,
			anchorVersion: this.#versionId,
			anchorRestPositions: anchorRestPositions(entry.mesh, target),
			anchorState: state
		};
	}
	#sourceTriangles(entry) {
		let triangles = this.#triangles.get(entry.index);
		if (!triangles) {
			triangles = sourceIndices(entry.mesh.indices, entry.mesh.sourceVertex);
			this.#triangles.set(entry.index, triangles);
		}
		return triangles;
	}
	#movePin(comment, target, candidates) {
		const point = weightedPoint(comment.anchorRestPositions, target.weights);
		let best = null;
		for (const entry of candidates) {
			const triangles = this.#sourceTriangles(entry);
			const found = closestSurfacePoint(entry.mesh.restPositions, triangles, point);
			if (!found || best && found.distance >= best.distance) continue;
			const corner = (k) => triangles[found.triangle * 3 + k] ?? 0;
			best = {
				entry,
				distance: found.distance,
				target: {
					kind: "surface",
					mesh: entry.path,
					vertices: [
						corner(0),
						corner(1),
						corner(2)
					],
					weights: found.weights
				}
			};
		}
		return best && best.distance <= this.#threshold ? best : null;
	}
	#moveRegion(comment, candidates) {
		let best = null;
		for (const entry of candidates) {
			let vertices = this.#vertices.get(entry.index);
			if (!vertices && comment.anchorRestPositions.length >= INDEX_MIN_QUERIES) {
				vertices = new VertexIndex(entry.mesh.restPositions);
				this.#vertices.set(entry.index, vertices);
			}
			const kept = /* @__PURE__ */ new Set();
			let total = 0;
			for (const position of comment.anchorRestPositions) {
				const found = vertices ? vertices.nearest(position) : nearestVertex(entry.mesh.restPositions, position);
				if (!found || found.distance > this.#threshold) continue;
				kept.add(found.vertex);
				total += found.distance;
			}
			if (kept.size === 0) continue;
			if (!best || kept.size > best.kept.size || kept.size === best.kept.size && total < best.total) best = {
				entry,
				kept,
				total
			};
		}
		if (!best) return null;
		const { entry, kept } = best;
		const triangles = this.#sourceTriangles(entry);
		const covered = (every) => {
			const chosen = [];
			for (let triangle = 0; triangle * 3 + 2 < triangles.length; triangle++) {
				const corners = [
					0,
					1,
					2
				].map((k) => kept.has(triangles[triangle * 3 + k] ?? -1));
				if (every ? corners.every(Boolean) : corners.some(Boolean)) chosen.push(triangle);
			}
			return chosen;
		};
		const fullyInside = covered(true);
		const chosen = fullyInside.length > 0 ? fullyInside : covered(false);
		if (chosen.length === 0) return null;
		return {
			entry,
			target: {
				kind: "region",
				mesh: entry.path,
				triangles: encodeRanges(chosen),
				vertices: encodeRanges(kept)
			}
		};
	}
};
var SEPARATOR = /(?<!\\)\//;
function namedKey(path) {
	return `${splitMemberPath(path).file ?? ""}\n${nameInPath(path)}`;
}
/**
* The ancestor whose path changed between two paths of one mesh: what is left of each once the segments they end in
* alike are taken off. Null when they end in nothing alike, or when one has nothing left.
*/
function movedAncestor(before, after) {
	const from = before.split(SEPARATOR);
	const to = after.split(SEPARATOR);
	let same = 0;
	while (same < from.length && same < to.length && from[from.length - 1 - same] === to[to.length - 1 - same]) same++;
	if (same === 0 || same === from.length || same === to.length) return null;
	return {
		from: from.slice(0, -same).join("/"),
		to: to.slice(0, -same).join("/")
	};
}
//#endregion
//#region ../../packages/core/src/registry.ts
var IN_PROCESS = {
	connection: null,
	caller: "core"
};
/**
* Holds a handler for each command and query in the protocol, validates every call against the protocol's schema
* before the handler sees it, and broadcasts events. It is also the in-process `CoreClient`, which is always connected.
*/
var CommandRegistry = class {
	connectionState = "connected";
	#commandHandlers = /* @__PURE__ */ new Map();
	#queryHandlers = /* @__PURE__ */ new Map();
	#listeners = /* @__PURE__ */ new Map();
	#anyListeners = /* @__PURE__ */ new Set();
	#onListenerError;
	constructor(options = {}) {
		this.#onListenerError = options.onListenerError ?? ((error) => reportListenerError(error));
	}
	onConnectionChange(_listener) {
		return () => void 0;
	}
	handleCommand(name, handler) {
		return register(this.#commandHandlers, "command", name, (args, context) => handler(args, context));
	}
	handleQuery(name, handler) {
		return register(this.#queryHandlers, "query", name, (args, context) => handler(args, context));
	}
	async execute(name, input) {
		return await this.dispatch("command", name, input);
	}
	async query(name, input) {
		return await this.dispatch("query", name, input);
	}
	/** The untyped entry point for transports: runs whatever arrived on the wire, or rejects with an `ArcueError`. */
	async dispatch(kind, name, input, context = IN_PROCESS) {
		const definition = definitionOf(kind, name);
		if (!definition) throw new ArcueError("unknown-command", `There is no ${kind} named "${name}".`);
		if ("internal" in definition && definition.internal && context.caller === "bridge") throw new ArcueError("forbidden", `"${name}" passes only between the core and its windows.`);
		const handler = (kind === "command" ? this.#commandHandlers : this.#queryHandlers).get(name);
		if (!handler) throw new ArcueError("unavailable", `No handler is registered for the ${kind} "${name}".`);
		const parsed = definition.input.safeParse(input);
		if (!parsed.success) {
			const issues = parsed.error.issues.map((issue) => ({
				path: issue.path.map((key) => typeof key === "number" ? key : String(key)),
				message: issue.message
			}));
			const summary = issues.map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`).join("; ");
			throw new ArcueError("invalid-input", `Invalid input for "${name}". ${summary}`, { issues });
		}
		try {
			return await handler(parsed.data, context);
		} catch (error) {
			if (error instanceof ArcueError) throw error;
			const message = error instanceof Error ? error.message : String(error);
			throw new ArcueError("internal", `"${name}" failed: ${message}`, { cause: error });
		}
	}
	/** Calls every listener. It never throws: a listener's error goes to `onListenerError`, and the rest still run. */
	emit(name, payload) {
		for (const listener of [...this.#listeners.get(name) ?? []]) try {
			listener(payload);
		} catch (error) {
			this.#onListenerError(error, name);
		}
		for (const listener of [...this.#anyListeners]) try {
			listener(name, payload);
		} catch (error) {
			this.#onListenerError(error, name);
		}
	}
	subscribe(name, listener) {
		const forName = this.#listeners.get(name) ?? /* @__PURE__ */ new Set();
		this.#listeners.set(name, forName);
		const entry = (payload) => listener(payload);
		forName.add(entry);
		return () => {
			forName.delete(entry);
		};
	}
	/** Hears every event, for transports that forward events to another process. */
	subscribeAll(listener) {
		this.#anyListeners.add(listener);
		return () => {
			this.#anyListeners.delete(listener);
		};
	}
};
function definitionOf(kind, name) {
	if (kind === "command") return isCommandName(name) ? commands[name] : void 0;
	return isQueryName(name) ? queries[name] : void 0;
}
function register(handlers, kind, name, handler) {
	if (handlers.has(name)) throw new ArcueError("conflict", `The ${kind} "${name}" already has a handler.`);
	handlers.set(name, handler);
	return () => {
		if (handlers.get(name) === handler) handlers.delete(name);
	};
}
/**
* Rule 3 offers an earlier review whose latest version has exactly the model's own mesh paths, and in which more than
* this share of those meshes keep their topology hash or their source vertex count. A re-export that edits a few
* meshes still matches; a different model that happens to use the same mesh names does not.
*/
var STRUCTURE_MATCH_SHARE = .5;
/**
* The reviews under the location's reviews root whose model file is gone. A review whose model still exists belongs to
* that model, as with a copy, and is never listed. It lists at most `MAX_SCANNED_FOLDERS` folders breadth first, reads
* at most `MAX_EARLIER_REVIEWS` reviews, never follows links, and skips the folders in `skip`, such as the reviews of
* open assets, and files it cannot read. `complete` is false when a bound stopped it before it saw every folder.
*/
async function findEarlierReviews(platform, location, skip) {
	const { root, workspaceRoot } = location;
	if (!await insideWithoutLinks(platform, workspaceRoot ?? platform.appDataDir, root)) return {
		reviews: [],
		complete: true
	};
	const reviews = [];
	const queue = [root];
	for (let listed = 0; listed < 2048 && reviews.length < 64; listed++) {
		const folder = queue.shift();
		if (folder === void 0) break;
		const entries = await platform.list(folder).catch(() => []);
		if (entries.some((entry) => entry.name === "review.json" && entry.kind === "file")) {
			const earlier = skip.has(folder) ? null : await readEarlierReview(platform, location, folder);
			if (earlier) reviews.push(earlier);
			continue;
		}
		for (const entry of entries) if (entry.kind === "directory") queue.push(joinPath(folder, entry.name));
	}
	return {
		reviews,
		complete: queue.length === 0
	};
}
async function readEarlierReview(platform, location, folder) {
	const relative = pathInside(location.root, folder);
	if (!relative || !await modelPathsGone(platform, location.workspaceRoot, relative)) return null;
	try {
		const path = joinPath(folder, "review.json");
		const review = parseReview(await platform.readText(path), path);
		const model = location.workspaceRoot === null ? normalizePath(review.asset.path) : joinPath(location.workspaceRoot, relative);
		const expected = reviewLocationIn(platform.appDataDir, location.workspaceRoot, model);
		if (expected?.folder !== folder || !await volumeThere(platform, expected, model)) return null;
		return {
			model,
			location: expected,
			review
		};
	} catch {
		return null;
	}
}
/**
* Whether `model`, whose review is at `location`, is gone: each path its review folder stands for is definitely not
* found, and outside a repository the drive, network share or mounted volume of `model` is there, so a review never
* leaves a model on an ejected drive. Any other error means the model may exist.
*/
async function reviewedModelGone(platform, location, model) {
	const relative = pathInside(location.root, location.folder);
	return !!relative && await volumeThere(platform, location, model) && await modelPathsGone(platform, location.workspaceRoot, relative);
}
async function modelPathsGone(platform, workspaceRoot, relative) {
	try {
		for (const model of modelPathsFor(workspaceRoot, relative)) if (await platform.stat(model) !== null) return false;
		return true;
	} catch {
		return false;
	}
}
/** Whether the drive, network share or mounted volume of `model` is there; always true inside a repository. */
async function volumeThere(platform, location, model) {
	const volume = location.workspaceRoot === null ? volumeOf(model) : null;
	return volume === null || (await platform.stat(volume).catch(() => null))?.kind === "directory";
}
/**
* The model paths whose review folder is `relative` under the reviews root. In a repository there is one. In the app
* data folder the root marks were dropped, so "C/Art/Hero.fbx" may come from "/C/Art/Hero.fbx" or "C:/Art/Hero.fbx",
* and "server/share/Hero.fbx" from "/server/share/Hero.fbx" or the network share "//server/share/Hero.fbx". A single
* letter is taken for a drive, never a server, so no path makes the system look for a server named "C".
*/
function modelPathsFor(workspaceRoot, relative) {
	if (workspaceRoot !== null) return [joinPath(workspaceRoot, relative)];
	const [first = "", ...rest] = relative.split("/");
	const paths = [`/${relative}`];
	const drive = /^[A-Za-z]$/.test(first);
	if (drive && rest.length > 0) paths.push(`${first.toUpperCase()}:/${rest.join("/")}`);
	if (!drive && rest.length > 1) paths.push(`//${relative}`);
	return paths;
}
/** The drive, network share or mounted volume an absolute path is on, or null for the system's own root. */
function volumeOf(path) {
	return /^\/\/[^/]+\/[^/]+/.exec(path)?.[0] ?? /^[A-Z]:\//.exec(path)?.[0] ?? /^\/Volumes\/[^/]+(?=\/)/.exec(path)?.[0] ?? null;
}
/**
* Rules 1 and 2: the earlier reviews with a version of the same size and full hash as the file, or with the file's
* Unity GUID. The file is hashed only when a size matches.
*/
async function matchByIdentity(earlier, file) {
	const matches = [];
	for (const entry of earlier) {
		const match = await matchIdentity(file, entry.review.versions, entry.review.asset.guid);
		if (match !== null) matches.push({
			earlier: entry,
			match
		});
	}
	return matches;
}
/** Rule 3: the earlier reviews whose latest version has the same meshes as the model's version; see `STRUCTURE_MATCH_SHARE`. */
function matchByStructure(earlier, meshes) {
	return earlier.flatMap((entry) => sameStructure(entry.review.versions.at(-1), meshes) ? [{
		earlier: entry,
		match: "structure"
	}] : []);
}
function sameStructure(version, meshes) {
	const own = (list) => list.filter((entry) => splitMemberPath(entry.mesh).file === null);
	const current = own(meshes);
	const before = new Map(own(version?.meshes ?? []).map((entry) => [entry.mesh, entry.topology]));
	if (current.length === 0 || current.length !== before.size) return false;
	let kept = 0;
	for (const { mesh, topology } of current) {
		const earlier = before.get(mesh);
		if (!earlier) return false;
		if (earlier.hash === topology.hash || earlier.sourceVertexCount === topology.sourceVertexCount) kept++;
	}
	return kept > current.length * STRUCTURE_MATCH_SHARE;
}
var MATCH_ORDER = [
	"content",
	"guid",
	"structure"
];
/** The matches as candidates, best first: by how they match, then the review used last, then the most comments. */
function rankCandidates(matches) {
	return matches.map(({ earlier, match }) => ({
		path: earlier.model,
		comments: earlier.review.comments.length,
		lastLoadedAt: lastLoadedAt(earlier.review),
		match
	})).sort((a, b) => MATCH_ORDER.indexOf(a.match) - MATCH_ORDER.indexOf(b.match) || (b.lastLoadedAt ?? "").localeCompare(a.lastLoadedAt ?? "") || b.comments - a.comments);
}
function lastLoadedAt(review) {
	let latest = null;
	for (const version of review.versions) if (latest === null || version.loadedAt > latest) latest = version.loadedAt;
	return latest;
}
//#endregion
//#region ../../packages/core/src/review-session.ts
var ATTEMPTS = 3;
var encoder$1 = new TextEncoder();
/**
* One asset's `review.json` while the asset is open. Changes run one at a time. Each starts from the file on disk:
* when another program changed it, the session adopts that content, drops the undo history, and computes the change
* from it. Just before saving it checks the file again and starts over if it moved. Each save adds one to the
* review's `revision` and records this build's format. A change that would write the text the file already holds,
* and no other file, is not saved. A review a newer Arcue saved can be read but not changed: a change that would save
* it is refused, so the fields this build does not know stay in the file.
*/
var ReviewSession = class {
	history = new ReviewHistory();
	#platform;
	#location;
	#path;
	#changed;
	#edits = new Serial();
	#review;
	/** Hash of the file's text as this session last read or wrote it; null when there is no file. */
	#diskHash;
	#closed = false;
	/** Why the session no longer saves: its review folder moved away and could not be moved back. */
	#stranded = null;
	constructor(platform, location, loaded, changed) {
		this.#platform = platform;
		this.#location = location;
		this.#path = reviewFilePath(location);
		this.#review = loaded.review;
		this.#diskHash = loaded.text === null ? null : textHash(loaded.text);
		this.#changed = changed;
	}
	get review() {
		return this.#review;
	}
	run(compute) {
		return this.#edits.run(async () => {
			for (let attempt = 1;; attempt++) {
				this.#checkUsable();
				await this.#sync();
				const current = this.#review;
				const change = await compute(current);
				if (change.next === null || !change.prepare && !change.clearHistory && this.#unchanged(change.next, current)) {
					change.apply?.();
					if (change.edit) this.history.record(change.edit);
					return change.result;
				}
				const next = savedReview(change.next, current.revision + 1);
				const text = serializeReview(next);
				if ((await this.#readDisk()).hash !== this.#diskHash) {
					if (attempt < ATTEMPTS) continue;
					throw new ArcueError("conflict", "review.json keeps changing on disk; try again.");
				}
				checkSavable(current, this.#location);
				await prepareArcueFolder(this.#platform, this.#location);
				try {
					await change.prepare?.();
					await checkReviewPath(this.#platform, this.#location, this.#path);
					await this.#platform.writeFileAtomic(this.#path, text);
				} catch (error) {
					await checkReviewPath(this.#platform, this.#location, this.#location.folder).then(() => change.rollback?.()).catch(() => void 0);
					throw error;
				}
				this.#diskHash = textHash(text);
				this.#review = next;
				if (change.clearHistory) this.history.clear();
				change.apply?.();
				if (change.edit) this.history.record(change.edit);
				this.#changed(next);
				return change.result;
			}
		});
	}
	/** Takes in a change another program made to `review.json`, as a watcher reports it. */
	refresh() {
		return this.#edits.run(async () => {
			if (!this.#closed) await this.#sync();
		});
	}
	/**
	* Runs `move`, which moves or replaces the review folder on disk, between two changes, then takes in the review at
	* `location`, where it lives from now on. The undo history ends, because its steps name files by their old paths.
	* When `move` fails and leaves the review at `location` rather than in its old place, the session stops saving, so
	* it never writes a second copy of the review into the old folder.
	*/
	moveTo(location, move) {
		return this.#edits.run(async () => {
			this.#checkUsable();
			try {
				await move();
			} catch (error) {
				if (await this.#movedAway(reviewFilePath(location))) this.#stranded = `The review moved to ${location.folder} but could not be finished, so this tab no longer saves it. Close it and open the model again.`;
				throw error;
			}
			this.#location = location;
			this.#path = reviewFilePath(location);
			this.history.clear();
			await this.#sync();
		});
	}
	/** Waits for the changes in flight, then refuses new ones. */
	close() {
		return this.#edits.run(async () => {
			this.#closed = true;
		});
	}
	#checkUsable() {
		if (this.#closed) throw new ArcueError("not-found", "The asset was closed.");
		if (this.#stranded !== null) throw new ArcueError("conflict", this.#stranded);
	}
	/** Whether the review is at `path` now and no longer where the session keeps it. */
	async #movedAway(path) {
		if (path === this.#path) return false;
		try {
			return !await this.#platform.exists(this.#path) && await this.#platform.exists(path);
		} catch {
			return true;
		}
	}
	/**
	* Whether saving the review would change nothing: it would write the text the file already holds, or, for a review a
	* newer Arcue saved, which reads without the fields this build does not know, the review as it was read.
	*/
	#unchanged(review, current) {
		const text = serializeReview({
			...review,
			revision: current.revision
		});
		if (isNewerFormat(current)) return text === serializeReview(current);
		return this.#diskHash !== null && textHash(text) === this.#diskHash;
	}
	async #sync() {
		const disk = await this.#readDisk();
		if (disk.hash === this.#diskHash) return;
		if (disk.text === null) {
			this.#diskHash = null;
			return;
		}
		const external = parseReview(disk.text, this.#path);
		this.#diskHash = disk.hash;
		this.#review = {
			...external,
			asset: {
				...external.asset,
				path: this.#location.assetPath
			}
		};
		this.history.clear();
		this.#changed(this.#review);
	}
	async #readDisk() {
		await checkReviewPath(this.#platform, this.#location, this.#path);
		const stat = await this.#platform.stat(this.#path);
		if (stat === null) return {
			text: null,
			hash: null
		};
		if (stat.kind !== "file") throw new ArcueError("conflict", `${this.#path} is not a plain file.`);
		const text = await this.#platform.readText(this.#path);
		return {
			text,
			hash: textHash(text)
		};
	}
};
function textHash(text) {
	return contentHash(encoder$1.encode(text));
}
//#endregion
//#region ../../packages/core/src/round-data.ts
/** Builds `round.json` for the queued comments. Positions follow the coordinate convention. */
function buildRoundData({ round, review, version, scene, comments, convention }) {
	const record = review.versions.find((entry) => entry.id === version);
	const data = {
		round,
		asset: {
			path: review.asset.path,
			version,
			exporter: record?.exporter ?? null,
			fps: scene.source.fps,
			space: {
				units: "m",
				up: upAxisOf(convention),
				handedness: "right"
			},
			...record?.files ? { files: record.files } : {}
		},
		comments: comments.map((comment, index) => roundComment(comment, index + 1, scene, convention))
	};
	return roundDataSchema.parse(data);
}
/** The text a round sends: the newest follow-up of a reopened comment, otherwise the comment's text. */
function currentMessage(comment) {
	return comment.followUps.at(-1)?.text ?? comment.text;
}
function roundComment(comment, number, scene, convention) {
	const convert = (vector) => toConvention(vector, convention);
	const { context } = comment;
	const earlierMessages = [comment.text, ...comment.followUps.map((followUp) => followUp.text)].slice(0, -1).map((text, index) => ({
		round: comment.rounds[index] ?? comment.followUps[index]?.afterRound ?? 1,
		text
	}));
	const restAndPosed = (target) => {
		if (context.centroid) return {
			rest: convert(context.centroid.rest),
			posed: convert(context.centroid.posed)
		};
		const rest = target.kind === "surface" ? weightedPoint(comment.anchorRestPositions, target.weights) : mean(comment.anchorRestPositions);
		return {
			rest: convert(rest),
			posed: null
		};
	};
	let target = null;
	if (comment.target) {
		const meshRef = {
			mesh: meshAtPath(scene, comment.target.mesh)?.name ?? nameInPath(comment.target.mesh),
			meshPath: comment.target.mesh
		};
		target = comment.target.kind === "surface" ? {
			kind: "point",
			...meshRef,
			vertices: comment.target.vertices,
			weights: comment.target.weights,
			position: restAndPosed(comment.target),
			bones: context.bones
		} : {
			kind: "region",
			...meshRef,
			vertices: comment.target.vertices,
			vertexCount: countInRanges(comment.target.vertices),
			centroid: restAndPosed(comment.target),
			bones: context.bones
		};
	}
	return {
		id: comment.id,
		number,
		text: currentMessage(comment),
		time: roundTime(comment, scene),
		target,
		pose: context.joints.length === 0 ? null : { joints: context.joints.map((joint) => ({
			...joint,
			position: convert(joint.position)
		})) },
		camera: {
			position: convert(comment.camera.position),
			target: convert(comment.camera.target),
			up: convert(comment.camera.up),
			fov: comment.camera.fov,
			label: context.viewLabel
		},
		screenshot: context.screenshot === null ? null : `${comment.id}.png`,
		madeOnVersion: comment.madeOnVersion,
		anchorState: comment.target ? comment.anchorState : null,
		anchorVersion: comment.target ? comment.anchorVersion : null,
		earlierMessages,
		...comment.parts ? { parts: comment.parts } : {},
		...comment.warning ? { warning: comment.warning } : {}
	};
}
function roundTime(comment, scene) {
	const time = comment.time;
	if (time.kind === "none") return null;
	const found = findClip(scene, time.clip);
	const fps = found?.fps ?? scene.source.fps;
	const seconds = (frame) => Math.round(frame / fps * 1e3) / 1e3;
	const start = found?.sourceStartFrame;
	const clip = {
		clip: time.clip,
		clipDisplayName: time.clipDisplayName
	};
	if (time.kind === "frame") return {
		...clip,
		frame: time.frame,
		seconds: seconds(time.frame),
		...start === void 0 ? {} : { sourceFrame: start + time.frame }
	};
	return {
		...clip,
		frames: [time.start, time.end],
		seconds: [seconds(time.start), seconds(time.end)],
		...start === void 0 ? {} : { sourceFrames: [start + time.start, start + time.end] }
	};
}
function mean(points) {
	const sum = [
		0,
		0,
		0
	];
	for (const point of points) {
		sum[0] += point[0];
		sum[1] += point[1];
		sum[2] += point[2];
	}
	const count = Math.max(1, points.length);
	return [
		sum[0] / count,
		sum[1] / count,
		sum[2] / count
	];
}
//#endregion
//#region ../../packages/core/src/screenshots.ts
/** Names of unsent screenshots in the review folder's `screenshots/` folder. Cleanup removes nothing else. */
var UNSENT_SCREENSHOT_NAME = new RegExp(`^${COMMENT_ID_PATTERN}(?:-[1-9]\\d*)?\\.png$`);
/**
* The absolute path of a comment's stored screenshot, or null when the stored value is not one of the layouts the
* core writes for that comment: `screenshots/<id>.png`, `screenshots/<id>-<n>.png` or `rounds/round-<n>/<id>.png`.
* `review.json` can be edited by hand or come from an untrusted repository, so nothing else is ever read.
*/
function screenshotFile(reviewFolder, commentId, stored) {
	if (stored === null || screenshotOwner(stored) !== commentId) return null;
	const resolved = joinPath(reviewFolder, stored);
	return pathInside(reviewFolder, resolved) === stored ? resolved : null;
}
/** A comment's screenshot bytes, or null when it has none, its path is not allowed, or a link is in the way. */
async function readScreenshot(platform, reviewFolder, commentId, stored) {
	const path = screenshotFile(reviewFolder, commentId, stored);
	if (path === null || !await insideWithoutLinks(platform, reviewFolder, path)) return null;
	return (await platform.stat(path))?.kind === "file" ? platform.readFile(path) : null;
}
//#endregion
//#region ../../packages/core/src/serve.ts
/**
* Connects a window or a bridge to the registry: answers its requests and forwards every event to it. Handlers see
* the options as `context.connection`, `context.caller` and `context.user`. Forwarding stops when the peer closes,
* including when the channel closes from the other side. The returned peer also lets the core send requests the other
* way, such as view commands to a window.
*/
function serveEndpoint(registry, endpoint, { connection, caller, user, onListenerError }) {
	const peer = createPeer(endpoint, {
		handleRequest: ({ kind, name, input }) => registry.dispatch(kind, name, input, {
			connection,
			caller,
			user: user?.()
		}),
		...onListenerError ? { onListenerError } : {}
	});
	const unsubscribe = registry.subscribeAll((name, payload) => peer.emit(name, payload));
	peer.onClose(unsubscribe);
	return peer;
}
//#endregion
//#region ../../packages/core/src/settings.ts
var storedSettingsSchema = settingsSchema.extend({
	coordinates: settingsSchema.shape.coordinates.catch("y-up"),
	authorName: settingsSchema.shape.authorName.catch(void 0)
});
var defaultSettings = { coordinates: "y-up" };
/** App settings in `settings.json` in the app data folder. A missing or unreadable file gives the defaults. */
var SettingsStore = class {
	#platform;
	#settings = defaultSettings;
	constructor(platform) {
		this.#platform = platform;
	}
	get path() {
		return joinPath(this.#platform.appDataDir, "settings.json");
	}
	get current() {
		return this.#settings;
	}
	async load() {
		try {
			if ((await this.#platform.stat(this.path))?.kind === "file") {
				const parsed = storedSettingsSchema.safeParse(JSON.parse(await this.#platform.readText(this.path)));
				if (parsed.success) this.#settings = parsed.data;
			}
		} catch {
			this.#settings = defaultSettings;
		}
		return this.#settings;
	}
	/** Saves the settings with the change applied. The registry has already validated the change. */
	async update(change) {
		const next = {
			...this.#settings,
			...change
		};
		await this.#platform.writeFileAtomic(this.path, `${JSON.stringify(next, null, 2)}\n`);
		this.#settings = next;
		return next;
	}
};
//#endregion
//#region ../../packages/core/src/windows.ts
/** The windows connected to the core, and which one gained focus last. */
var WindowRegistry = class {
	#peers = /* @__PURE__ */ new Map();
	#lastFocused = null;
	add(connection, peer) {
		this.#peers.set(connection, peer);
	}
	remove(connection) {
		this.#peers.delete(connection);
		if (this.#lastFocused === connection) this.#lastFocused = null;
	}
	has(connection) {
		return connection !== null && this.#peers.has(connection);
	}
	focus(connection) {
		if (this.#peers.has(connection)) this.#lastFocused = connection;
	}
	/**
	* The window for a newly shown asset: the caller's own window when a window asked, otherwise the window focused
	* last, otherwise the window that connected last. Null when no window is connected.
	*/
	choose(context) {
		if (context.caller === "window" && this.has(context.connection)) return context.connection;
		if (this.has(this.#lastFocused)) return this.#lastFocused;
		return [...this.#peers.keys()].at(-1) ?? null;
	}
	/** Sends a command to a window. With a timeout, a window that does not answer in time rejects as "unavailable". */
	request(connection, name, input, timeout) {
		const peer = this.#peers.get(connection);
		if (!peer) return Promise.reject(new ArcueError("unavailable", "The window that shows this asset is closed."));
		const answer = peer.request("command", name, input);
		if (!timeout) return answer;
		return new Promise((resolve, reject) => {
			const cancel = timeout.clock.setTimer(timeout.ms, () => reject(new ArcueError("unavailable", `The window did not answer "${name}" within ${timeout.ms} ms.`)));
			answer.then((output) => {
				cancel();
				resolve(output);
			}, (error) => {
				cancel();
				reject(error);
			});
		});
	}
};
//#endregion
//#region ../../packages/core/src/core.ts
var VIEW_SHOW_ASSET = "view.showAsset";
var VIEW_RELEASE_ASSET = "view.releaseAsset";
/** The most files in a missing model's folder that the core checks for the model under a new name. */
var MAX_RENAME_CANDIDATES = 256;
/**
* How long a model's file must stay missing before the core looks for it under a new name or says it is not found,
* so a slow export that removes the file before writing it again is never taken for a rename.
*/
var MISSING_MODEL_MS = 2e3;
/**
* All review state, behind the command registry. Hosts start it with a platform and connect each window and bridge
* with `connect`; calls inside the host's own process go through `client`.
*/
var ArcueCore = class ArcueCore {
	registry;
	#platform;
	#settings;
	#windows = new WindowRegistry();
	#connections = /* @__PURE__ */ new Set();
	/** Opens run one at a time, so two opens of one file share a tab. */
	#opening = new Serial();
	#assets = /* @__PURE__ */ new Map();
	#pending = /* @__PURE__ */ new Set();
	#unregister = [];
	#stabilityIntervalMs;
	#importTimeoutMs;
	#showAssetTimeoutMs;
	#formatClockTime;
	#onError;
	#commentIds = new CommentIds();
	#nextAssetNumber = 1;
	/** Creates the core and reads its settings. */
	static async start(options) {
		const core = new ArcueCore(options);
		await core.#settings.load();
		return core;
	}
	constructor(options) {
		this.#platform = options.platform;
		this.registry = options.registry ?? new CommandRegistry();
		this.#settings = new SettingsStore(options.platform);
		this.#stabilityIntervalMs = options.stabilityIntervalMs ?? 300;
		this.#importTimeoutMs = options.importTimeoutMs ?? 12e4;
		this.#showAssetTimeoutMs = options.showAssetTimeoutMs ?? 1e4;
		this.#formatClockTime = options.formatClockTime ?? localClockTime;
		this.#onError = options.onError ?? reportListenerError;
		this.#registerHandlers();
	}
	/** The in-process client, which runs the same validation as every other caller. */
	get client() {
		return this.registry;
	}
	/**
	* Serves a window or a bridge on the endpoint. The core sends view commands to windows over the returned peer.
	* Connection names must be unique among the open connections. Without a `user`, a window acts as the person the
	* `authorName` setting names, and a bridge as nobody.
	*/
	connect(endpoint, options) {
		if (this.#connections.has(options.connection)) throw new ArcueError("conflict", `A connection named "${options.connection}" is already open.`);
		const user = options.user ?? (options.caller === "window" ? () => this.#localUser() : void 0);
		const peer = serveEndpoint(this.registry, endpoint, {
			...options,
			user
		});
		this.#connections.add(options.connection);
		peer.onClose(() => this.#connections.delete(options.connection));
		if (options.caller === "window") {
			this.#windows.add(options.connection, peer);
			peer.onClose(() => {
				this.#windows.remove(options.connection);
				for (const asset of this.#assets.values()) if (asset.window === options.connection) asset.window = null;
			});
		}
		return peer;
	}
	/** Resolves once no parse, file check or background save is running. Waiting timers do not count. */
	async idle() {
		while (this.#pending.size > 0) await Promise.allSettled([...this.#pending]);
	}
	/** Stops watching files and removes the handlers. Open assets are dropped without events. */
	dispose() {
		for (const asset of this.#assets.values()) this.#stop(asset);
		this.#assets.clear();
		for (const unregister of this.#unregister.splice(0)) unregister();
	}
	#registerHandlers() {
		const registry = this.registry;
		this.#unregister.push(registry.handleCommand("asset.open", (args, context) => this.#opening.run(() => this.#open(args, context))), registry.handleCommand("asset.close", (args) => this.#close(args.assetId)), registry.handleCommand("asset.relink", (args) => this.#relinkAsset(args.assetId, args.path)), registry.handleCommand("asset.reload", async (args) => {
			const asset = this.#asset(args.assetId);
			asset.searched.clear();
			return { version: await this.#load(asset) };
		}), registry.handleCommand("comment.create", (args, context) => this.#createComment(args, context.user)), registry.handleCommand("comment.update", (args) => this.#updateComment(args)), registry.handleCommand("comment.delete", (args) => this.#deleteComment(args)), registry.handleCommand("comment.resolve", (args) => this.#resolveComment(args)), registry.handleCommand("comment.reopen", (args, context) => this.#reopenComment(args, context.user)), registry.handleCommand("comment.createFromWarning", (args, context) => this.#createFromWarning(args, context.user)), registry.handleCommand("warning.dismiss", (args) => this.#dismissWarnings(args.assetId, [args.warningId])), registry.handleCommand("warning.dismissAll", (args) => this.#dismissWarnings(args.assetId, null)), registry.handleCommand("round.copy", (args, context) => this.#inCompositionLine(this.#asset(args.assetId), () => this.#copyRound(args.assetId, context.user))), registry.handleCommand("review.undo", (args) => this.#undo(args.assetId, "undo")), registry.handleCommand("review.redo", (args) => this.#undo(args.assetId, "redo")), registry.handleCommand("review.relink", (args) => this.#relinkReview(args.assetId, args.from)), registry.handleCommand("composition.addFile", (args) => this.#addCompositionFile(args)), registry.handleCommand("composition.removeFile", (args) => this.#removeCompositionFile(args)), registry.handleCommand("composition.attachFile", (args) => this.#attachCompositionFile(args)), registry.handleCommand("material.setTexture", (args) => this.#setMaterialTexture(args)), registry.handleCommand("settings.set", (args) => this.#settings.update(args)), registry.handleCommand("view.reportState", (args, context) => {
			const asset = this.#asset(args.assetId);
			asset.viewState = args.state;
			if (context.caller === "window" && this.#windows.has(context.connection)) asset.window = context.connection;
		}), registry.handleCommand("view.moveAsset", (args, context) => this.#opening.run(() => this.#move(args.assetId, context, args.unlessShown ?? false))), registry.handleCommand("view.reportFocus", (_args, context) => {
			if (context.caller === "window" && context.connection !== null) this.#windows.focus(context.connection);
		}), registry.handleCommand(VIEW_SHOW_ASSET, async (args, context) => {
			const asset = this.#asset(args.assetId);
			const window = context.caller === "window" && this.#windows.has(context.connection) ? context.connection : this.#windowFor(asset, context);
			await this.#showAsset(asset, window, args);
		}), registry.handleQuery("asset.list", () => ({ assets: [...this.#assets.values()].map((asset) => asset.summary) })), registry.handleQuery("review.get", (args) => this.#asset(args.assetId).session.review), registry.handleQuery("review.candidates", (args) => ({ candidates: this.#asset(args.assetId).candidates })), registry.handleQuery("viewState.get", (args) => this.#asset(args.assetId).viewState), registry.handleQuery("scene.get", (args) => this.#asset(args.assetId).loaded()), registry.handleQuery("scene.parts", (args) => ({ parts: partsOf(this.#asset(args.assetId).loaded().scene) })), registry.handleQuery("scene.materials", (args) => ({ materials: materialSlots(this.#asset(args.assetId).loaded().scene).map(({ material, slots }) => ({
			material,
			slots: slots.map(({ slot, state, path, overridden }) => ({
				slot,
				state,
				path,
				overridden
			}))
		})) })), registry.handleQuery("settings.get", () => this.#settings.current), registry.handleQuery("warning.list", (args) => ({ warnings: this.#warnings(this.#asset(args.assetId)) })), registry.handleQuery("warning.prompt", (args) => {
			const asset = this.#asset(args.assetId);
			return { prompt: warningPrompt(asset.path, this.#warnings(asset)) };
		}), registry.handleQuery("asset.inspect", (args) => this.#track(this.#inspect(args.path))), registry.handleQuery("composition.fileRoles", (args) => this.#compositionFileRoles(args)), registry.handleQuery("comment.screenshot", async (args) => {
			const asset = this.#asset(args.assetId);
			await checkReviewPath(this.#platform, asset.location, asset.location.folder);
			const comment = findComment(asset.session.review, args.commentId);
			return readScreenshot(this.#platform, asset.location.folder, comment.id, comment.context.screenshot);
		}));
		for (const name of Object.keys(commands)) {
			if (!isCommandName(name)) continue;
			const definition = commands[name];
			if (definition.runsIn === "view" && !definition.internal) this.#forwardView(name);
		}
	}
	#forwardView(name) {
		this.#unregister.push(this.registry.handleCommand(name, async (args) => {
			const asset = this.#asset(assetIdOf(args));
			if (!this.#windows.has(asset.window)) throw new ArcueError("unavailable", `No window shows ${asset.name}.`);
			const output = await this.#windows.request(asset.window, name, args);
			if (output === void 0) return output;
			const checked = commands[name].output.safeParse(output);
			if (!checked.success) throw new ArcueError("internal", `The window answered "${name}" with an invalid result.`);
			return withTransfer(checked.data, buffersIn(checked.data));
		}));
	}
	#asset(assetId) {
		const asset = this.#assets.get(assetId);
		if (!asset) throw new ArcueError("not-found", `No asset with id "${assetId}" is open.`);
		return asset;
	}
	#track(promise) {
		this.#pending.add(promise);
		promise.then(() => this.#pending.delete(promise), () => this.#pending.delete(promise));
		return promise;
	}
	#now() {
		return new Date(this.#platform.clock.now()).toISOString();
	}
	#newCommentId() {
		return this.#commentIds.next(this.#platform.clock.now());
	}
	/** The person the `authorName` setting names, who acts through the windows. */
	#localUser() {
		const name = this.#settings.current.authorName;
		return name === void 0 ? void 0 : { name };
	}
	#windowFor(asset, context) {
		const window = this.#windows.has(asset.window) ? asset.window : this.#windows.choose(context);
		if (window === null) throw new ArcueError("unavailable", "No window is open to show the asset.");
		return window;
	}
	async #showAsset(asset, window, { clip, frame }) {
		const input = { assetId: asset.id };
		if (clip !== void 0) input.clip = clip;
		if (frame !== void 0) input.frame = frame;
		await this.#windows.request(window, VIEW_SHOW_ASSET, input, {
			ms: this.#showAssetTimeoutMs,
			clock: this.#platform.clock
		});
		asset.window = window;
	}
	/**
	* Moves an asset's tab to the calling window. The window that shows it releases the tab first and returns its view
	* state, so the receiving window starts from the same camera, clip and frame.
	*/
	async #move(assetId, context, unlessShown) {
		if (context.caller !== "window" || !this.#windows.has(context.connection)) throw new ArcueError("forbidden", "Only a window can take an asset's tab.");
		const asset = this.#asset(assetId);
		if (asset.closing) throw new ArcueError("conflict", `${asset.name} is closing, so its tab cannot move.`);
		const target = context.connection;
		const source = asset.window;
		if (unlessShown && source !== target && this.#windows.has(source)) return;
		if (source !== target && this.#windows.has(source)) {
			const released = await this.#windows.request(source, VIEW_RELEASE_ASSET, { assetId }, {
				ms: this.#showAssetTimeoutMs,
				clock: this.#platform.clock
			});
			const state = viewStateSchema.nullable().safeParse(released);
			if (state.success && state.data) asset.viewState = state.data;
			asset.window = null;
		}
		try {
			await this.#showAsset(asset, target, {});
		} catch (error) {
			if (source !== target && this.#windows.has(source)) await this.#showAsset(asset, source, {}).catch(() => void 0);
			throw error;
		}
	}
	async #open(args, context) {
		const path = normalizePath(args.path);
		const existing = [...this.#assets.values()].find((asset) => asset.path === path && !asset.closing);
		if (existing) {
			await this.#showAsset(existing, this.#windowFor(existing, context), args);
			return { assetId: existing.id };
		}
		const stat = await this.#platform.stat(path);
		if (!stat) throw new ArcueError("not-found", `${path} does not exist.`);
		if (stat.kind !== "file") throw new ArcueError("invalid-input", `${path} is not an asset file.`);
		const window = this.#windows.choose(context);
		if (window === null) throw new ArcueError("unavailable", "No window is open to show the asset.");
		const location = await locateReview(this.#platform, path);
		const reviewPath = reviewFilePath(location);
		await checkReviewPath(this.#platform, location, reviewPath);
		const earlier = await this.#earlierReview(location, path, stat.size);
		const loaded = await loadReview(this.#platform, location);
		const id = `a${this.#nextAssetNumber++}`;
		const asset = new OpenAsset(id, path, location, new ReviewSession(this.#platform, location, loaded, (review) => this.registry.emit("review.changed", {
			assetId: id,
			review
		})));
		if (args.viewState) asset.viewState = args.viewState;
		asset.candidates = earlier.candidates;
		asset.earlier = earlier.unmatched;
		this.#assets.set(asset.id, asset);
		try {
			await this.#showAsset(asset, window, args);
		} catch (error) {
			this.#assets.delete(asset.id);
			throw error;
		}
		this.registry.emit("asset.opened", { asset: asset.summary });
		if (earlier.moved !== null) this.registry.emit("review.relinked", {
			assetId: asset.id,
			from: earlier.moved,
			automatic: true
		});
		this.#offer(asset);
		this.#watchAsset(asset);
		this.#load(asset).catch(() => void 0);
		return { assetId: asset.id };
	}
	/**
	* For a file without a review: finds the reviews whose model is gone and, when exactly one has a version with the
	* file's bytes or the file's Unity GUID, moves it to the file's review folder. Several such reviews become candidates
	* to offer, and so does a single one when the search stopped at a bound or the move was refused; with none, the
	* reviews are kept to compare meshes with once the file loads. A failure leaves the file without a review rather
	* than failing the open.
	*/
	async #earlierReview(location, path, size) {
		const none = {
			moved: null,
			candidates: [],
			unmatched: []
		};
		try {
			if (await this.#platform.stat(reviewFilePath(location)) !== null) return none;
			const open = new Set([...this.#assets.values()].map((asset) => asset.location.folder));
			const { reviews: earlier, complete } = await findEarlierReviews(this.#platform, location, open);
			if (earlier.length === 0) return none;
			const matches = await matchByIdentity(earlier, fileIdentity(this.#platform, path, size));
			const [only] = matches;
			if (only && matches.length === 1 && complete) {
				const { location: from, model } = only.earlier;
				try {
					await moveReview(this.#platform, {
						from,
						fromModel: model,
						to: location,
						toModel: path
					});
					return {
						...none,
						moved: model
					};
				} catch (error) {
					if (!(error instanceof ArcueError && error.code === "conflict")) this.#onError(error);
				}
			}
			return {
				...none,
				candidates: offered(matches),
				unmatched: matches.length === 0 ? earlier : []
			};
		} catch (error) {
			this.#onError(error);
			return none;
		}
	}
	/** Compares the first version's meshes with the earlier reviews no file identity matched, rule 3, and offers the best. */
	#matchStructure(asset, meshes) {
		if (asset.earlier.length === 0) return;
		asset.candidates = offered(matchByStructure(asset.earlier, meshes));
		asset.earlier = [];
		this.#offer(asset);
	}
	#offer(asset) {
		const [candidate] = asset.candidates;
		if (candidate) this.registry.emit("review.offered", {
			assetId: asset.id,
			candidate
		});
	}
	/**
	* Moves the review of an earlier path of the asset's model onto the asset, as `review.relink` asks, replacing the
	* review that opening the asset wrote while that holds nothing but versions. The earlier model must be gone under
	* every path its review folder stands for, and its review folder inside the asset's reviews root. The checks and
	* the move run with the opens, so no tab opens that review meanwhile, and the asset reloads to re-anchor the comments.
	*/
	#relinkReview(assetId, given) {
		const asset = this.#asset(assetId);
		return this.#inCompositionLine(asset, async () => {
			const from = normalizePath(given);
			await this.#opening.run(async () => {
				const earlier = reviewLocationIn(this.#platform.appDataDir, asset.location.workspaceRoot, from);
				if (earlier === null || earlier.folder === asset.location.folder) throw new ArcueError("invalid-input", `${given} is not an earlier path of ${asset.name} in the same reviews.`);
				if (!await volumeThere(this.#platform, earlier, from)) throw new ArcueError("unavailable", `The drive of ${basename(from)} is not connected, so its review stays where it is.`);
				if (!await reviewedModelGone(this.#platform, earlier, from)) throw new ArcueError("conflict", `${basename(from)} still exists, so its review stays with it.`);
				if ([...this.#assets.values()].some((open) => open.location.folder === earlier.folder)) throw new ArcueError("conflict", `The review of ${basename(from)} is open in a tab.`);
				await asset.session.moveTo(asset.location, () => moveReview(this.#platform, {
					from: earlier,
					fromModel: from,
					to: asset.location,
					toModel: asset.path,
					replaceUntouched: true
				}));
			});
			asset.candidates = [];
			asset.earlier = [];
			this.registry.emit("review.relinked", {
				assetId: asset.id,
				from,
				automatic: false
			});
			await this.#load(asset, true).catch(() => void 0);
		});
	}
	/** Watches the model file, its review file, and its composition file until it loads the files that one names. */
	#watchAsset(asset) {
		if (asset.closed) return;
		for (const stop of asset.stopWatching.splice(0)) stop();
		asset.stopWatching.push(this.#platform.watch(asset.path, () => this.#fileChanged(asset)), this.#platform.watch(reviewFilePath(asset.location), () => {
			this.#track(asset.session.refresh().catch((error) => this.#onError(error)));
		}));
		this.#watchComposition(asset, [asset.compositionPath]);
	}
	/** Watches the composition file and the files it names, and stops watching files it no longer names. */
	#watchComposition(asset, paths) {
		if (asset.closed) return;
		const wanted = new Set(paths);
		for (const [path, stop] of asset.compositionWatchers) {
			if (wanted.has(path)) continue;
			stop();
			asset.compositionWatchers.delete(path);
		}
		for (const path of wanted) if (!asset.compositionWatchers.has(path)) asset.compositionWatchers.set(path, this.#platform.watch(path, () => this.#fileChanged(asset)));
	}
	/**
	* Parses a file in its own import worker, composed with its composition's files as opening it would be, without
	* opening a tab or touching review data.
	*/
	async #inspect(given) {
		const path = normalizePath(given);
		const stat = await this.#platform.stat(path);
		if (!stat) throw new ArcueError("not-found", `${path} does not exist.`);
		if (stat.kind !== "file") throw new ArcueError("invalid-input", `${path} is not an asset file.`);
		const location = await locateReview(this.#platform, path);
		const readRoot = readRootFor(location.workspaceRoot, path);
		const files = await readAssetFiles(this.#platform, path, compositionFilePath(location), readRoot, { brokenComposition: "warn" });
		const bytes = files.model.bytes.byteLength;
		return inspectScene(await buildAssetScene(files, (file) => importAsset(this.#platform, file.path, file.bytes, {
			readRoot,
			timeoutMs: this.#importTimeoutMs
		})), {
			path,
			bytes,
			composition: files.composition?.file.path ?? null,
			members: inspectMembers(files)
		});
	}
	#close(assetId) {
		const asset = this.#asset(assetId);
		asset.closing ??= (async () => {
			await asset.session.close();
			this.#stop(asset);
			this.#assets.delete(assetId);
			this.registry.emit("asset.closed", { assetId });
		})();
		return asset.closing;
	}
	#stop(asset) {
		asset.closed = true;
		for (const stop of asset.stopWatching.splice(0)) stop();
		for (const stop of asset.compositionWatchers.values()) stop();
		asset.compositionWatchers.clear();
		asset.cancelStabilityCheck();
	}
	#fileChanged(asset) {
		if (asset.closed) return;
		asset.cancelStabilityCheck();
		const check = ++asset.stabilityCheck;
		this.#track(this.#checkStable(asset, check, void 0));
	}
	/**
	* Parses the files once two checks a short interval apart see the same size and modification time for the model
	* and every file of its composition, so an export that writes several files reloads once. A model that stays
	* missing for `MISSING_MODEL_MS` is looked for under a new name.
	*/
	async #checkStable(asset, check, previous, missingSince = null) {
		const paths = [asset.path, ...asset.compositionWatchers.keys()];
		const stats = await Promise.all(paths.map((path) => this.#platform.stat(path)));
		const current = new Map(paths.map((path, index) => [path, stats[index] ?? null]));
		if (asset.closed || check !== asset.stabilityCheck) return;
		const model = current.get(asset.path) ?? null;
		const now = this.#platform.clock.now();
		const missing = model === null ? missingSince ?? now : null;
		if (missing !== null && now - missing >= MISSING_MODEL_MS) {
			this.#track(this.#modelGone(asset));
			return;
		}
		if (previous !== void 0) {
			const settled = paths.every((path) => previous.has(path) && sameStat(current.get(path) ?? null, previous.get(path) ?? null));
			if (model?.kind === "file" && settled) {
				this.#load(asset).catch(() => void 0);
				return;
			}
		}
		asset.cancelStabilityCheck = this.#platform.clock.setTimer(this.#stabilityIntervalMs, () => {
			this.#track(this.#checkStable(asset, check, current, missing));
		});
	}
	/**
	* Starts looking for the composition's lost files under new names, each once until the next `asset.reload`. It runs
	* beside the load, since writing the composition file waits for the asset's edits, and those may wait for loads.
	*/
	#searchLostFiles(asset, files) {
		const lost = lostFiles(files, asset.session.review).filter((file) => !asset.searched.has(file.path));
		if (lost.length === 0) return;
		for (const file of lost) asset.searched.add(file.path);
		const taken = /* @__PURE__ */ new Set([
			asset.path,
			...files.members.keys(),
			...files.textures.map((texture) => texture.path)
		]);
		const relinked = this.#relinkLostFiles(asset, lost, taken).catch((error) => {
			if (!(error instanceof ArcueError && error.code === "conflict")) this.#onError(error);
		});
		this.#track(relinked);
	}
	/**
	* Writes each lost file found under a new name into the composition file at its new path, renames the review's ids
	* for it, and reloads. A composition file that changed meanwhile keeps any entry that no longer names the old path.
	* The composition file is written as the review is saved, so a retry after another program changed the review
	* computes both again.
	*/
	async #relinkLostFiles(asset, lost, taken) {
		const moved = await findLostFiles(this.#platform, asset.path, asset.readRoot, lost, taken);
		if (moved.size === 0) return;
		if (await this.#inCompositionLine(asset, () => asset.session.run(async (review) => {
			await this.#checkCompositionPath(asset);
			const path = asset.compositionPath;
			const found = await readComposition(this.#platform, path, "conflict");
			if (!found) return {
				next: null,
				result: false
			};
			const { composition, labels } = withMovedFiles(found.composition, dirname(asset.path), moved);
			const text = serializeComposition(composition);
			if (text === serializeComposition(found.composition)) return {
				next: null,
				result: false
			};
			return {
				next: relabelMembers(review, labels),
				result: true,
				clearHistory: true,
				prepare: () => writeReviewFile(this.#platform, asset.location, path, text),
				rollback: () => writeReviewFile(this.#platform, asset.location, path, found.text)
			};
		}))) await this.#load(asset).catch(() => void 0);
	}
	/**
	* The model stayed missing for `MISSING_MODEL_MS`, so an export did not replace it. When exactly one file in its
	* folder has the bytes of the version on screen or the model's Unity GUID, the asset follows that file; otherwise
	* the asset reports "model-not-found". A folder that is gone, a tab that closed meanwhile and a refused move are
	* expected, so they only end the search.
	*/
	async #modelGone(asset) {
		try {
			const renamed = await this.#findRenamed(asset);
			if (renamed !== null) {
				await this.#follow(asset, renamed, true);
				return;
			}
		} catch (error) {
			if (!(error instanceof ArcueError && (error.code === "conflict" || error.code === "not-found"))) this.#onError(error);
		}
		if (asset.closed || asset.missing || await this.#platform.exists(asset.path)) return;
		asset.missing = true;
		this.#failed(asset, /* @__PURE__ */ new Error(`Model not found: ${asset.name}`));
	}
	/**
	* The one file in the model's folder with the model's extension and a name the folder did not have when the model
	* last loaded, that has the size and full hash of the file the version on screen was read from, or the model's
	* Unity GUID in its `.meta` file. A rename makes a new name, while a backup copy that was already there never
	* matches. Null when there is none or more than one, or before the folder's names are known. It checks at most
	* `MAX_RENAME_CANDIDATES` files, compares sizes before it hashes, and skips files other tabs show.
	*/
	async #findRenamed(asset) {
		const { identity, siblings } = asset;
		const guid = asset.session.review.asset.guid ?? null;
		if (siblings === null || identity === null && guid === null) return null;
		const folder = dirname(asset.path);
		const extension = extensionOf(asset.name);
		const open = new Set([...this.#assets.values()].map((other) => other.path));
		const candidates = (await this.#platform.list(folder)).filter((entry) => entry.kind === "file" && hasExtension(entry.name, [extension]) && !siblings.has(entry.name)).map((entry) => joinPath(folder, entry.name)).filter((path) => !open.has(path)).slice(0, MAX_RENAME_CANDIDATES);
		const found = await filesMatching(this.#platform, candidates, identity === null ? [] : [identity], guid);
		const [only] = found;
		return found.length === 1 && only !== void 0 ? only : null;
	}
	/** Points an asset whose model is gone at a model file the caller chose, as `asset.relink` asks. */
	#relinkAsset(assetId, given) {
		const asset = this.#asset(assetId);
		const path = normalizePath(given);
		if (path === asset.path) throw new ArcueError("invalid-input", `${asset.name} is already at ${path}.`);
		if (!hasExtension(path, MODEL_EXTENSIONS)) throw new ArcueError("invalid-input", `${basename(path)} is not one of ${MODEL_EXTENSIONS.join(", ")}.`);
		return this.#follow(asset, path, false);
	}
	/**
	* Points the asset at its model's new path, which must be in the same reviews root. The checks and the move of the
	* review folder run with the opens, so no other tab opens the new path meanwhile. The move refuses a file that has
	* a review of its own, except, when the person chose the file, a review that holds nothing but versions. The asset
	* keeps its id, watches the new files and reloads. Windows retitle the tab on "asset.updated" and learn of the move
	* from "review.relinked". An automatic follow stops when the old file is back.
	*/
	#follow(asset, path, automatic) {
		return this.#inCompositionLine(asset, async () => {
			const from = asset.path;
			if (!await this.#opening.run(async () => {
				if (await this.#platform.exists(from)) {
					if (automatic) return false;
					throw new ArcueError("conflict", `${asset.name} still exists, so its review stays with it.`);
				}
				if ((await this.#platform.stat(path))?.kind !== "file") throw new ArcueError("not-found", `${path} does not exist.`);
				if ([...this.#assets.values()].some((other) => other.path === path && !other.closing)) throw new ArcueError("conflict", `${basename(path)} is open in another tab. Close it, then choose the file again.`);
				const location = await locateReview(this.#platform, path);
				if (location.root !== asset.location.root) throw new ArcueError("invalid-input", `${basename(path)} is not in the same repository as ${asset.name}, so the review cannot move to it.`);
				await checkReviewPath(this.#platform, location, location.folder);
				await asset.session.moveTo(location, async () => {
					if (!await this.#platform.exists(reviewFilePath(asset.location))) return;
					await moveReview(this.#platform, {
						from: asset.location,
						fromModel: from,
						to: location,
						toModel: path,
						replaceUntouched: !automatic
					});
				});
				if (asset.closed) return false;
				asset.cancelStabilityCheck();
				asset.stabilityCheck++;
				asset.relocate(path, location);
				asset.missing = false;
				asset.status = "loading";
				asset.error = null;
				asset.candidates = [];
				asset.earlier = [];
				this.#watchAsset(asset);
				return true;
			})) return;
			this.registry.emit("asset.updated", { asset: asset.summary });
			this.registry.emit("review.relinked", {
				assetId: asset.id,
				from,
				automatic
			});
			await this.#load(asset, true).catch(() => void 0);
		});
	}
	/** Loads the asset's files, and with `force` records and re-anchors even a version that is already on screen. */
	#load(asset, force = false) {
		return this.#track(asset.loads.run(() => this.#loadVersion(asset, force)));
	}
	async #loadVersion(asset, force) {
		if (asset.closed) throw new ArcueError("not-found", `${asset.name} is closed.`);
		let files;
		try {
			files = await readAssetFiles(this.#platform, asset.path, asset.compositionPath, asset.readRoot, { brokenComposition: asset.composition === null ? "warn" : "reject" });
			await this.#refreshImports(asset, files);
		} catch (error) {
			this.#failed(asset, error);
			throw error;
		}
		asset.missing = false;
		const named = files.siblings.filter((name) => hasExtension(name, [extensionOf(asset.name)]));
		asset.siblings = named.length <= MAX_RENAME_CANDIDATES ? new Set(named) : null;
		this.#watchComposition(asset, [...files.watch, ...asset.compositionWatchers.keys()]);
		this.#searchLostFiles(asset, files);
		let versionId = this.#versionWithDependencies(asset, files);
		if (versionId === asset.version && !force) {
			this.#watchImportedFiles(asset, files);
			if (asset.status !== "ready") {
				asset.status = "ready";
				asset.error = null;
				this.registry.emit("asset.updated", { asset: asset.summary });
			}
			return versionId;
		}
		asset.status = "loading";
		this.registry.emit("asset.updated", { asset: asset.summary });
		let meshes = [];
		try {
			const scene = await buildAssetScene(files, (file) => this.#importFile(asset, file), { parsed: (file) => asset.parsed(file.path, file.id) });
			versionId = this.#versionWithDependencies(asset, files);
			this.#watchImportedFiles(asset, files);
			meshes = meshesOf(scene).map((entry) => ({
				mesh: entry.path,
				topology: entry.mesh.topology
			}));
			await asset.session.run((review) => {
				const record = {
					id: versionId,
					fileModifiedAt: new Date(files.model.modifiedMs).toISOString(),
					loadedAt: this.#now(),
					exporter: exporterName(scene),
					meshes,
					hash: files.model.hash,
					size: files.model.size
				};
				if (files.versionFiles) record.files = files.versionFiles;
				const versions = withVersion(review.versions, record);
				const guid = files.model.guid;
				const reanchorer = new Reanchorer(versions, versionId, scene);
				return {
					next: {
						...review,
						asset: guid === void 0 ? review.asset : {
							...review.asset,
							guid
						},
						versions,
						comments: review.comments.map((comment) => reanchorer.reanchor(comment))
					},
					result: void 0,
					apply: () => {
						asset.session.history.mapComments((comment) => reanchorer.reanchor(comment));
						asset.scene = scene;
						asset.version = versionId;
						asset.identity = {
							hash: files.model.hash,
							size: files.model.size
						};
						asset.composition = files.composition?.file.path ?? null;
						asset.status = "ready";
						asset.error = null;
						const kept = /* @__PURE__ */ new Set([asset.path, ...files.members.keys()]);
						for (const path of asset.imported.keys()) if (!kept.has(path)) asset.imported.delete(path);
						asset.loadedFiles = kept;
					}
				};
			});
		} catch (error) {
			this.#failed(asset, error);
			throw error;
		}
		this.registry.emit("asset.updated", { asset: asset.summary });
		this.#matchStructure(asset, meshes);
		return versionId;
	}
	/** Parses one file of the asset, or takes the scene parsed from the same bytes before. */
	async #importFile(asset, file) {
		const cached = asset.parsed(file.path, file.id);
		if (cached) return cached;
		const dependencies = new ImportFiles(this.#platform, file.path, asset.readRoot);
		const scene = await importAsset(this.#platform, file.path, file.bytes, {
			files: dependencies,
			readRoot: asset.readRoot,
			timeoutMs: this.#importTimeoutMs
		});
		asset.imported.set(file.path, {
			id: file.id,
			scene,
			files: dependencies
		});
		return scene;
	}
	async #refreshImports(asset, files) {
		for (const file of [files.model, ...files.members.values()]) {
			const cached = asset.imported.get(file.path);
			if (!cached || cached.id !== file.id) continue;
			const current = await cached.files.refresh(file.path, asset.readRoot);
			if (current.identity !== cached.files.identity) asset.imported.delete(file.path);
			else cached.files = current;
		}
	}
	#versionWithDependencies(asset, files) {
		const dependencies = [files.model, ...files.members.values()].flatMap((file) => {
			const cached = asset.imported.get(file.path);
			const identity = cached?.id === file.id ? cached.files.identity : null;
			return identity === null ? [] : [[file.label, identity]];
		});
		return dependencies.length === 0 ? files.versionId : versionIdOf(new TextEncoder().encode(JSON.stringify([files.versionId, dependencies])));
	}
	#watchImportedFiles(asset, files) {
		const imported = [files.model, ...files.members.values()].flatMap((file) => {
			const cached = asset.imported.get(file.path);
			return cached?.id === file.id ? [...cached.files.watch] : [];
		});
		this.#watchComposition(asset, [...files.watch, ...imported]);
	}
	#failed(asset, error) {
		if (asset.closed) return;
		asset.status = "failed";
		asset.error = error instanceof Error ? error.message : String(error);
		this.registry.emit("asset.updated", { asset: asset.summary });
	}
	/** A free screenshot path for the comment, refusing a review folder reached through a link. */
	async #screenshotSlot(asset, commentId) {
		const folder = asset.location.folder;
		let relative = `screenshots/${commentId}.png`;
		for (let copy = 2; await this.#platform.exists(joinPath(folder, relative)); copy++) relative = `screenshots/${commentId}-${copy}.png`;
		const path = joinPath(folder, relative);
		await checkReviewPath(this.#platform, asset.location, path);
		return {
			relative,
			path
		};
	}
	#screenshotWrite(asset, slot, png) {
		if (!slot || !png) return {};
		return {
			prepare: () => writeReviewFile(this.#platform, asset.location, slot.path, png),
			rollback: () => removeReviewFile(this.#platform, asset.location, slot.path)
		};
	}
	/**
	* Runs a composition command after the asset's earlier composition edits and undo steps, and before later ones, so
	* each checks its input against the version the edit before it loaded.
	*/
	#inCompositionLine(asset, task) {
		return asset.compositionEdits.run(async () => {
			if (asset.closing) throw new ArcueError("conflict", `${asset.name} is closing.`);
			return task();
		});
	}
	/**
	* Changes the asset's composition file, creating it in the review folder on the first change, records the change in
	* the asset's undo history and reloads the asset. It works on the file as it is on disk, and never overwrites a file
	* it cannot read. Call it inside `#inCompositionLine`.
	*/
	async #editComposition(asset, change) {
		const path = asset.compositionPath;
		const folder = dirname(asset.path);
		if (await asset.session.run(async () => {
			await this.#checkCompositionPath(asset);
			const found = await readComposition(this.#platform, path, "conflict");
			const current = found?.composition ?? { version: 1 };
			const same = (target) => (written) => joinPath(folder, written) === target;
			const text = serializeComposition(change(current, same));
			if (text === serializeComposition(current)) return {
				next: null,
				result: false
			};
			await prepareArcueFolder(this.#platform, asset.location);
			await writeReviewFile(this.#platform, asset.location, path, text);
			return {
				next: null,
				result: true,
				edit: {
					kind: "composition",
					path,
					before: found?.text ?? null,
					after: text
				}
			};
		})) await this.#load(asset).catch(() => void 0);
		return { path };
	}
	/** Refuses a composition file reached through a link, as opening refuses a review folder reached through one. */
	async #checkCompositionPath(asset) {
		await checkReviewPath(this.#platform, asset.location, asset.compositionPath);
	}
	/**
	* Puts back the composition file's text from one side of an edit, or removes the file where it did not exist. It
	* writes only when the file still holds the other side's text, so a change made since then is never lost.
	*/
	async #restoreComposition(asset, edit, direction) {
		const expected = direction === "undo" ? edit.after : edit.before;
		const restored = direction === "undo" ? edit.before : edit.after;
		await this.#checkCompositionPath(asset);
		const stat = await this.#platform.stat(edit.path);
		if (stat !== null && stat.kind !== "file") throw new ArcueError("conflict", `${edit.path} is not a plain file.`);
		if ((stat === null ? null : await this.#platform.readText(edit.path)) !== expected) throw new ArcueError("conflict", `${basename(edit.path)} changed since then, so it was left as it is.`);
		if (restored === null) await removeReviewFile(this.#platform, asset.location, edit.path);
		else {
			await prepareArcueFolder(this.#platform, asset.location);
			await writeReviewFile(this.#platform, asset.location, edit.path, restored);
		}
	}
	/** A path a composition command names: absolute, or relative to the model's folder. */
	#resolveCompositionPath(asset, file) {
		const slashed = file.replaceAll("\\", "/");
		return /^(?:[A-Za-z]:)?\//.test(slashed) ? normalizePath(slashed) : joinPath(dirname(asset.path), slashed);
	}
	/**
	* A file to add to the composition: inside the asset's workspace, reached without symbolic links, and an existing
	* file of one of the `extensions`. Returns its path and how the composition file writes it.
	*/
	async #newCompositionFile(asset, file, extensions) {
		const path = this.#resolveCompositionPath(asset, file);
		const name = basename(path);
		const written = relativePath(dirname(asset.path), path);
		if (written === null || pathInside(asset.readRoot, path) === null) throw new ArcueError("invalid-input", `${name} is outside the asset's workspace.`);
		if (!hasExtension(path, extensions)) throw new ArcueError("invalid-input", `${name} is not one of ${extensions.join(", ")}.`);
		if (!await insideWithoutLinks(this.#platform, asset.readRoot, path)) throw new ArcueError("invalid-input", `${name} is reached through a symbolic link.`);
		if ((await this.#platform.stat(path))?.kind !== "file") throw new ArcueError("not-found", `${path} does not exist.`);
		return {
			path,
			written
		};
	}
	#addCompositionFile(args) {
		const asset = this.#asset(args.assetId);
		return this.#inCompositionLine(asset, async () => {
			const { path, written } = await this.#newCompositionFile(asset, args.file, MODEL_EXTENSIONS);
			if (path === asset.path) throw new ArcueError("invalid-input", `${asset.name} is the model itself.`);
			const bone = args.bone;
			const model = asset.imported.get(asset.path)?.scene;
			if (bone !== void 0 && model && !model.nodes.some((node) => node.name === bone || node.path === bone)) throw new ArcueError("invalid-input", `${asset.name} has no bone "${bone}".`);
			const role = args.role ?? (await this.#rolesOf(asset, path)).role;
			return {
				...await this.#editComposition(asset, (composition, same) => withMember(composition, {
					file: written,
					role,
					node: args.node,
					bone
				}, same(path))),
				role
			};
		});
	}
	#compositionFileRoles(args) {
		const asset = this.#asset(args.assetId);
		return this.#inCompositionLine(asset, async () => {
			const { path } = await this.#newCompositionFile(asset, args.file, MODEL_EXTENSIONS);
			if (path === asset.path) throw new ArcueError("invalid-input", `${asset.name} is the model itself.`);
			const earlier = asset.asked;
			if (earlier !== null && earlier !== path && earlier !== asset.path) await asset.loads.run(async () => {
				if (!asset.loadedFiles.has(earlier)) asset.imported.delete(earlier);
			});
			asset.asked = path;
			return this.#rolesOf(asset, path);
		});
	}
	/** How a file joins the view when the caller names no role, and the roles a caller may name for it. */
	async #rolesOf(asset, path) {
		const bytes = await this.#platform.readFile(path);
		const scene = await this.#importFile(asset, {
			path,
			label: basename(path),
			bytes,
			id: versionIdOf(bytes),
			problem: null
		});
		const model = asset.imported.get(asset.path)?.scene ?? asset.scene ?? {
			nodes: [],
			meshes: [],
			parts: []
		};
		const roles = memberRoles({
			meshes: scene.meshes.length,
			clips: scene.clips.length,
			keysModelBones: keysModelBones(scene, model),
			animatesModel: animatesModel(scene, model)
		});
		if (roles === null) throw new ArcueError("invalid-input", `${basename(path)} has no meshes or clips.`);
		return roles;
	}
	#removeCompositionFile(args) {
		const asset = this.#asset(args.assetId);
		const path = this.#resolveCompositionPath(asset, args.file);
		const label = relativePath(dirname(asset.path), path);
		return this.#inCompositionLine(asset, () => this.#editComposition(asset, (composition, same) => {
			if (!listsMember(composition, same(path))) {
				if (dirname(path) === dirname(asset.path) && isConventionAnimation(asset.path, basename(path))) throw new ArcueError("invalid-input", `${basename(path)} joins by its name. Rename or move it to take it out of the view.`);
				throw new ArcueError("not-found", `${args.file} is not in the composition.`);
			}
			return withoutMember(composition, same(path), (id) => label !== null && splitMemberPath(id).file === label);
		}));
	}
	/**
	* Moves an added file's attached entries onto a bone of the model, written by its name when the name finds it, or
	* off their bone, in one edit. `nodes` picks the entries whose node names one of those nodes of the file.
	*/
	#attachCompositionFile(args) {
		const asset = this.#asset(args.assetId);
		return this.#inCompositionLine(asset, () => {
			const path = this.#resolveCompositionPath(asset, args.file);
			const model = asset.imported.get(asset.path)?.scene;
			let bone;
			if (args.bone !== null) {
				bone = model ? boneReference(model.nodes, args.bone) : args.bone;
				if (bone === void 0) throw new ArcueError("invalid-input", `${asset.name} has no bone "${args.bone}".`);
			}
			const member = asset.imported.get(path)?.scene;
			const sameNode = (wanted, written) => {
				if (written === void 0) return false;
				if (written === wanted) return true;
				if (!member) return false;
				const index = findNode(member.nodes, written, false);
				return index !== null && index === findNode(member.nodes, wanted, false);
			};
			const wanted = args.nodes;
			const picked = (written) => wanted === void 0 || wanted.some((node) => sameNode(node, written));
			return this.#editComposition(asset, (composition, same) => {
				const entries = (composition.attach ?? []).filter((entry) => same(path)(entry.file));
				if (entries.length === 0 && (composition.animations ?? []).some(same(path))) throw new ArcueError("invalid-input", `${args.file} is an animation file, so it has nothing to attach.`);
				const lost = (wanted ?? []).find((node) => !entries.some((entry) => sameNode(node, entry.node)));
				if (lost !== void 0) throw new ArcueError("not-found", `Node ${lost} of ${args.file} is not attached or set in the composition.`);
				const moved = withAttachBone(composition, same(path), picked, bone);
				if (moved) return moved;
				throw new ArcueError("not-found", `${args.file} is not attached or set in the composition.`);
			});
		});
	}
	#setMaterialTexture(args) {
		const asset = this.#asset(args.assetId);
		return this.#inCompositionLine(asset, async () => {
			if (!asset.loaded().scene.materials.some((material) => material.name === args.material)) throw new ArcueError("not-found", `${asset.name} has no material "${args.material}".`);
			const written = args.file === null ? null : (await this.#newCompositionFile(asset, args.file, readableImageExtensions)).written;
			return this.#editComposition(asset, (composition) => withTexture(composition, args.material, args.slot, written));
		});
	}
	#createComment(args, author) {
		const asset = this.#asset(args.assetId);
		return asset.session.run(async (review) => {
			const { scene, version } = asset.pickedOn(args.version);
			const time = resolveTime(scene, args.time);
			const entry = args.target ? checkTarget(scene, args.target) : null;
			const id = this.#newCommentId();
			const slot = args.screenshot ? await this.#screenshotSlot(asset, id) : null;
			const now = this.#now();
			const comment = {
				id,
				text: args.text,
				status: "draft",
				createdAt: now,
				updatedAt: now,
				madeOnVersion: version,
				time,
				target: args.target,
				anchorVersion: version,
				anchorRestPositions: entry ? anchorRestPositions(entry.mesh, args.target) : [],
				camera: args.camera,
				context: {
					...args.context,
					screenshot: slot?.relative ?? null
				},
				anchorState: "exact",
				followUps: [],
				rounds: [],
				reopenedFrom: null
			};
			const parts = storedPartView(scene, args.parts);
			if (parts) comment.parts = parts;
			if (author) comment.author = author;
			const next = {
				...review,
				comments: [...review.comments, comment],
				queue: [...review.queue, id]
			};
			return {
				next,
				result: { commentId: id },
				edit: editBetween(review, next, { comments: [id] }),
				...this.#screenshotWrite(asset, slot, args.screenshot)
			};
		});
	}
	#updateComment(args) {
		const asset = this.#asset(args.assetId);
		return asset.session.run(async (review) => {
			const comment = findComment(review, args.commentId);
			if (comment.status !== "draft") throw new ArcueError("conflict", `${comment.id} was sent; reopen it with a follow-up instead.`);
			const updated = {
				...comment,
				updatedAt: this.#now()
			};
			if (args.text !== void 0) {
				const pending = comment.reopenedFrom === null ? void 0 : comment.followUps.at(-1);
				if (pending) updated.followUps = [...comment.followUps.slice(0, -1), {
					...pending,
					text: args.text
				}];
				else updated.text = args.text;
			}
			if (args.camera !== void 0) updated.camera = args.camera;
			if (args.time !== void 0 || args.target !== void 0) {
				if (args.version === void 0) throw new ArcueError("invalid-input", "A new time or target needs its version.");
				const { scene, version } = asset.pickedOn(args.version);
				if (args.time !== void 0) updated.time = resolveTime(scene, args.time);
				if (args.target !== void 0) {
					const entry = args.target ? checkTarget(scene, args.target) : null;
					updated.target = args.target;
					updated.anchorVersion = version;
					updated.anchorRestPositions = entry ? anchorRestPositions(entry.mesh, args.target) : [];
					updated.anchorState = "exact";
				}
			}
			if (args.parts !== void 0) {
				const parts = storedPartView(asset.loaded().scene, args.parts);
				if (parts) updated.parts = parts;
				else delete updated.parts;
			}
			const slot = args.screenshot ? await this.#screenshotSlot(asset, comment.id) : null;
			const screenshot = args.screenshot === void 0 ? comment.context.screenshot : slot?.relative ?? null;
			updated.context = {
				...args.context ?? comment.context,
				screenshot
			};
			const next = replaceComment(review, updated);
			return {
				next,
				result: void 0,
				edit: editBetween(review, next, { comments: [comment.id] }),
				...this.#screenshotWrite(asset, slot, args.screenshot)
			};
		});
	}
	/** Deletes a draft. A reopened draft loses only its pending follow-up and returns to the status it had. */
	#deleteComment(args) {
		return this.#asset(args.assetId).session.run((review) => {
			const comment = findComment(review, args.commentId);
			if (comment.status !== "draft") throw new ArcueError("conflict", "Only draft comments can be deleted.");
			const queue = review.queue.filter((id) => id !== comment.id);
			const next = comment.reopenedFrom === null ? {
				...review,
				queue,
				comments: review.comments.filter((entry) => entry.id !== comment.id)
			} : {
				...replaceComment(review, {
					...comment,
					status: comment.reopenedFrom,
					reopenedFrom: null,
					followUps: comment.followUps.slice(0, -1),
					updatedAt: this.#now()
				}),
				queue
			};
			return {
				next,
				result: void 0,
				edit: editBetween(review, next, { comments: [comment.id] })
			};
		});
	}
	#resolveComment(args) {
		return this.#asset(args.assetId).session.run((review) => {
			const comment = findComment(review, args.commentId);
			if (comment.status !== "sent") throw new ArcueError("conflict", "Only sent comments can be resolved.");
			const next = replaceComment(review, {
				...comment,
				status: "resolved",
				updatedAt: this.#now()
			});
			return {
				next,
				result: void 0,
				edit: editBetween(review, next, { comments: [comment.id] })
			};
		});
	}
	#reopenComment(args, author) {
		return this.#asset(args.assetId).session.run((review) => {
			const comment = findComment(review, args.commentId);
			const afterRound = comment.rounds.at(-1);
			if (comment.status === "draft" || afterRound === void 0) throw new ArcueError("conflict", "Only sent or resolved comments can be reopened.");
			const now = this.#now();
			const reopened = replaceComment(review, {
				...comment,
				status: "draft",
				reopenedFrom: comment.status,
				updatedAt: now,
				followUps: [...comment.followUps, {
					text: args.text,
					createdAt: now,
					afterRound,
					...author ? { author } : {}
				}]
			});
			const next = {
				...reopened,
				queue: [...reopened.queue, comment.id]
			};
			return {
				next,
				result: void 0,
				edit: editBetween(review, next, { comments: [comment.id] })
			};
		});
	}
	/** The import warnings of the version on screen; none before the first version loads. */
	#warnings(asset, review = asset.session.review) {
		const listed = asset.scene ? listWarnings(asset.scene, review, asset.path) : [];
		return asset.missing ? [modelNotFound(review, asset.path), ...listed] : listed;
	}
	/** Dismisses the listed warnings, or every warning not dismissed yet for null, as one undoable edit. */
	#dismissWarnings(assetId, ids) {
		const asset = this.#asset(assetId);
		return asset.session.run((review) => {
			const warnings = this.#warnings(asset, review);
			const chosen = ids === null ? warnings.filter((warning) => !warning.dismissed).map((warning) => warning.id) : ids.map((id) => findWarning(warnings, id).id);
			const current = review.dismissedWarnings ?? [];
			const added = chosen.filter((id) => !current.includes(id));
			if (added.length === 0) return {
				next: null,
				result: void 0
			};
			const next = withDismissedWarnings(review, [...current, ...added]);
			return {
				next,
				result: void 0,
				edit: editBetween(review, next, { warnings: added })
			};
		});
	}
	/**
	* Adds a draft about an import warning, without a surface target, from the view the window last reported. A clip's
	* warning is made at the clip's first frame. While a draft made from the warning is queued, returns that draft.
	*/
	#createFromWarning(args, author) {
		const asset = this.#asset(args.assetId);
		return asset.session.run((review) => {
			const { scene, version } = asset.loaded();
			const warning = findWarning(this.#warnings(asset, review), args.warningId);
			const queued = review.comments.find((comment) => comment.id === warning.commentId && comment.status === "draft");
			if (queued) return {
				next: null,
				result: { commentId: queued.id }
			};
			const id = this.#newCommentId();
			const now = this.#now();
			const clipName = warningClip(warning);
			const clip = clipName === null ? null : findClip(scene, clipName);
			const comment = {
				id,
				text: warning.message,
				status: "draft",
				createdAt: now,
				updatedAt: now,
				madeOnVersion: version,
				time: clip ? {
					kind: "frame",
					clip: clip.name,
					clipDisplayName: clip.displayName,
					frame: 0
				} : { kind: "none" },
				target: null,
				anchorVersion: version,
				anchorRestPositions: [],
				camera: asset.viewState?.camera ?? frontCamera(scene),
				context: {
					vertexCount: 0,
					bones: [],
					centroid: null,
					joints: [],
					viewLabel: "",
					screenshot: null
				},
				anchorState: "exact",
				followUps: [],
				rounds: [],
				reopenedFrom: null,
				warning: commentWarning(warning)
			};
			if (author) comment.author = author;
			const next = {
				...review,
				comments: [...review.comments, comment],
				queue: [...review.queue, id]
			};
			return {
				next,
				result: { commentId: id },
				edit: editBetween(review, next, { comments: [id] })
			};
		});
	}
	/**
	* Steps the asset's history back or forward. It runs in line with composition edits, so a composition step and an
	* edit never interleave, and reloads the asset after a composition step. A composition step whose file changed since
	* then rejects with conflict and leaves the history, so the next step reaches the edits behind it.
	*/
	#undo(assetId, direction) {
		const asset = this.#asset(assetId);
		const history = asset.session.history;
		return asset.compositionEdits.run(async () => {
			const step = await asset.session.run(async (review) => {
				const edit = direction === "undo" ? history.peekUndo() : history.peekRedo();
				if (!edit) return {
					next: null,
					result: {
						changed: false,
						reload: false
					}
				};
				const apply = () => direction === "undo" ? history.undone() : history.redone();
				if (edit.kind === "composition") {
					try {
						await this.#restoreComposition(asset, edit, direction);
					} catch (error) {
						if (error instanceof ArcueError && error.code === "conflict") history.drop(direction);
						throw error;
					}
					return {
						next: null,
						result: {
							changed: true,
							reload: true
						},
						apply
					};
				}
				return {
					next: applySnapshot(review, direction === "undo" ? edit.before : edit.after),
					result: {
						changed: true,
						reload: false
					},
					apply
				};
			});
			if (step.reload) await this.#load(asset).catch(() => void 0);
			return { changed: step.changed };
		});
	}
	async #copyRound(assetId, author) {
		const asset = this.#asset(assetId);
		const reviewFolder = asset.location.folder;
		const { round, prompt } = await asset.session.run(async (review) => {
			const { scene, version } = asset.loaded();
			if (review.queue.length === 0) throw new ArcueError("conflict", "The queue has no comments to copy.");
			const folderOf = (number) => joinPath(reviewFolder, "rounds", `round-${number}`);
			let round = Math.max(0, ...review.rounds.map((entry) => entry.number)) + 1;
			while (await this.#platform.exists(folderOf(round))) round++;
			const folder = folderOf(round);
			await checkReviewPath(this.#platform, asset.location, joinPath(folder, "round.json"));
			const screenshots = /* @__PURE__ */ new Map();
			const queued = [];
			for (const id of review.queue) {
				const comment = findComment(review, id);
				const bytes = await readScreenshot(this.#platform, reviewFolder, id, comment.context.screenshot);
				if (bytes) screenshots.set(id, bytes);
				queued.push(bytes ? comment : {
					...comment,
					context: {
						...comment.context,
						screenshot: null
					}
				});
			}
			const convention = this.#settings.current.coordinates;
			const data = buildRoundData({
				round,
				review,
				version,
				scene,
				comments: queued,
				convention
			});
			const fileModifiedAt = review.versions.find((entry) => entry.id === version)?.fileModifiedAt;
			const prompt = renderPrompt({
				data,
				assetPath: asset.path,
				roundFolder: folder,
				exportedAt: fileModifiedAt ? this.#formatClockTime(Date.parse(fileModifiedAt)) : "at an unknown time",
				partNames: new Map(scene.parts.map((part) => [part.id, part.name]))
			});
			const now = this.#now();
			const sent = new Set(review.queue);
			const comments = review.comments.map((comment) => {
				if (!sent.has(comment.id)) return comment;
				return {
					...comment,
					status: "sent",
					reopenedFrom: null,
					updatedAt: now,
					rounds: [...comment.rounds, round],
					context: {
						...comment.context,
						screenshot: screenshots.has(comment.id) ? `rounds/round-${round}/${comment.id}.png` : null
					}
				};
			});
			const summary = {
				number: round,
				createdAt: now,
				version,
				comments: [...review.queue]
			};
			if (author) summary.author = author;
			return {
				next: {
					...review,
					comments,
					queue: [],
					rounds: [...review.rounds, summary]
				},
				result: {
					round,
					prompt
				},
				clearHistory: true,
				prepare: async () => {
					for (const [id, bytes] of screenshots) await writeReviewFile(this.#platform, asset.location, joinPath(folder, `${id}.png`), bytes);
					await writeReviewFile(this.#platform, asset.location, joinPath(folder, "round.json"), `${JSON.stringify(data, null, 2)}\n`);
					await writeReviewFile(this.#platform, asset.location, joinPath(folder, "prompt.md"), prompt);
				},
				rollback: () => removeReviewFile(this.#platform, asset.location, folder)
			};
		});
		let copiedToClipboard = false;
		try {
			await this.#platform.writeClipboard(prompt);
			copiedToClipboard = true;
		} catch {
			copiedToClipboard = false;
		}
		this.registry.emit("round.copied", {
			assetId: asset.id,
			round
		});
		try {
			await this.#removeUnusedScreenshots(asset);
		} catch (error) {
			this.#onError(error);
		}
		return {
			round,
			prompt,
			copiedToClipboard
		};
	}
	/**
	* Removes unsent screenshots that no comment uses and undo cannot bring back. It runs inside the asset's review
	* changes, so no comment can be saving a screenshot meanwhile, and it removes only files named like screenshots.
	*/
	#removeUnusedScreenshots(asset) {
		return asset.session.run(async (review) => {
			const folder = joinPath(asset.location.folder, "screenshots");
			await checkReviewPath(this.#platform, asset.location, folder);
			if ((await this.#platform.stat(folder))?.kind !== "directory" || !await insideWithoutLinks(this.#platform, asset.location.folder, folder)) return {
				next: null,
				result: void 0
			};
			const kept = asset.session.history.screenshots();
			for (const comment of review.comments) if (comment.context.screenshot) kept.add(comment.context.screenshot);
			for (const entry of await this.#platform.list(folder)) {
				if (entry.kind !== "file" || !UNSENT_SCREENSHOT_NAME.test(entry.name)) continue;
				if (!kept.has(`screenshots/${entry.name}`)) await removeReviewFile(this.#platform, asset.location, joinPath(folder, entry.name));
			}
			return {
				next: null,
				result: void 0
			};
		});
	}
};
/** A file name's extension in lowercase, such as ".fbx". */
function extensionOf(name) {
	return name.slice(name.lastIndexOf(".")).toLowerCase();
}
/** The matches worth offering, best first: reviews that hold comments, rounds or dismissed warnings. */
function offered(matches) {
	return rankCandidates(matches.filter(({ earlier }) => !isUntouched(earlier.review)));
}
function replaceComment(review, updated) {
	return {
		...review,
		comments: review.comments.map((comment) => comment.id === updated.id ? updated : comment)
	};
}
/**
* The versions with the record added, or with the file identity filled in when an older build recorded the same
* version without it.
*/
function withVersion(versions, record) {
	const known = versions.find((version) => version.id === record.id);
	if (!known) return [...versions, record];
	if (known.hash !== void 0) return [...versions];
	const filled = {
		...known,
		hash: record.hash,
		size: record.size
	};
	if (record.files) filled.files = record.files;
	return versions.map((version) => version === known ? filled : version);
}
/** How a composition names a model bone: by its name when the name finds it, else by its path. */
function boneReference(nodes, given) {
	const index = findNode(nodes, given, true);
	const node = index === null ? void 0 : nodes[index];
	if (!node) return void 0;
	return findNode(nodes, node.name, true) === index ? node.name : node.path;
}
function sameStat(a, b) {
	if (a === null || b === null) return a === b;
	return a.kind === b.kind && a.size === b.size && a.modifiedMs === b.modifiedMs;
}
function assetIdOf(args) {
	const assetId = typeof args === "object" && args !== null && "assetId" in args ? args.assetId : void 0;
	if (typeof assetId !== "string") throw new ArcueError("invalid-input", "The command needs an assetId.");
	return assetId;
}
function buffersIn(value) {
	if (typeof value !== "object" || value === null) return [];
	return Object.values(value).flatMap((entry) => entry instanceof Uint8Array && entry.buffer instanceof ArrayBuffer ? [entry.buffer] : []);
}
function localClockTime(epochMs) {
	const date = new Date(epochMs);
	return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
new TextEncoder();
new TextDecoder();
//#endregion
//#region ../../packages/platform-node/src/native-paths.ts
var hostPathStyle = process.platform === "win32" ? "win32" : "posix";
/** A `Platform` path, with "/" separators, as the operating system writes it. */
function toNativePath(path, style = hostPathStyle) {
	const normalized = normalizePath(path);
	if (style === "posix") return normalized;
	const native = normalized.replaceAll("/", "\\");
	return /^[A-Z]:\\?$/.test(native) ? `${native.slice(0, 2)}\\` : native;
}
/** An absolute operating system path as a `Platform` path: "/" separators and an uppercase drive letter. */
function fromNativePath(path, style = hostPathStyle) {
	return normalizePath(style === "win32" ? path.replaceAll("\\", "/") : path);
}
//#endregion
//#region ../../packages/platform-node/src/node-import-worker.ts
/**
* Starts the import worker in a worker_threads Worker. `entry` is the host's bundle of
* `@arcue/platform-node/import-worker`, with `arcue-ufbx.wasm` copied beside it. A Node Worker is not a port, so the
* worker gets one port of a MessageChannel and the core keeps the other. When the worker exits, its requests reject.
*/
function startNodeImportWorker(entry, onError) {
	const worker = new Worker(entry, { name: "arcue-import" });
	const channel = new MessageChannel();
	worker.on("error", onError);
	worker.once("exit", () => channel.port1.close());
	worker.postMessage(channel.port2, [channel.port2]);
	return {
		endpoint: portEndpoint(channel.port1),
		terminate() {
			channel.port1.close();
			worker.terminate();
		}
	};
}
//#endregion
//#region ../../packages/platform-node/src/folder-watchers.ts
var watchWithNode = (folder, onChange, onError) => {
	const watcher = watch(folder, { persistent: false }, (_event, changed) => onChange(changed === null ? null : changed.toString()));
	watcher.on("error", onError);
	return watcher;
};
async function isFolder(path) {
	try {
		return (await lstat(path)).isDirectory();
	} catch {
		return false;
	}
}
/**
* One system watch per folder, shared by every file watched in it. A change reaches only the listeners of that file
* name and those that hear everything. Each change also checks once whether the folder is gone, since Linux ends the
* watch of a removed folder without an error, and then ends every listener's watch.
*/
var FolderWatchers = class {
	#folders = /* @__PURE__ */ new Map();
	#watch;
	#isFolder;
	constructor(watchFolder = watchWithNode, folderExists = isFolder) {
		this.#watch = watchFolder;
		this.#isFolder = folderExists;
	}
	/** Starts hearing about a folder's changes; throws when the system cannot watch it. Returns the way to stop. */
	listen(folder, listener) {
		const watched = this.#folders.get(folder) ?? this.#open(folder);
		if (listener.name === null) watched.everything.add(listener);
		else {
			const named = watched.named.get(listener.name) ?? /* @__PURE__ */ new Set();
			named.add(listener);
			watched.named.set(listener.name, named);
		}
		return () => {
			if (listener.name === null) watched.everything.delete(listener);
			else {
				const named = watched.named.get(listener.name);
				named?.delete(listener);
				if (named?.size === 0) watched.named.delete(listener.name);
			}
			if (watched.everything.size === 0 && watched.named.size === 0) this.#close(folder, watched);
		};
	}
	#open(folder) {
		const watched = {
			stop: () => void 0,
			named: /* @__PURE__ */ new Map(),
			everything: /* @__PURE__ */ new Set()
		};
		const handle = this.#watch(folder, (name) => this.#changed(folder, watched, name), () => this.#end(folder, watched));
		watched.stop = () => handle.close();
		this.#folders.set(folder, watched);
		return watched;
	}
	#changed(folder, watched, name) {
		if (this.#folders.get(folder) !== watched) return;
		for (const listener of [...watched.everything]) listener.changed();
		const named = name === null ? [...watched.named.values()].flatMap((set) => [...set]) : watched.named.get(name);
		for (const listener of [...named ?? []]) listener.changed();
		this.#endIfGone(folder, watched);
	}
	async #endIfGone(folder, watched) {
		if (!await this.#isFolder(folder)) this.#end(folder, watched);
	}
	#end(folder, watched) {
		if (this.#folders.get(folder) !== watched) return;
		this.#close(folder, watched);
		const listeners = [...watched.everything, ...[...watched.named.values()].flatMap((set) => [...set])];
		watched.everything.clear();
		watched.named.clear();
		for (const listener of listeners) listener.ended();
	}
	#close(folder, watched) {
		if (this.#folders.get(folder) === watched) this.#folders.delete(folder);
		watched.stop();
	}
};
//#endregion
//#region ../../packages/platform-node/src/node-platform.ts
var systemClock = {
	now: () => Date.now(),
	setTimer(delayMs, callback) {
		const handle = setTimeout(callback, delayMs);
		return () => clearTimeout(handle);
	}
};
var RENAME_ATTEMPTS = 5;
var POLL_INTERVAL_MS = 1e3;
/** The `Platform` on Node's file system. Paths use "/" separators on every system and are converted at the edge. */
var NodePlatform = class {
	appDataDir;
	clock;
	#startImportWorker;
	#writeClipboard;
	#style;
	#folders = new FolderWatchers();
	constructor(options) {
		this.#style = options.pathStyle ?? hostPathStyle;
		this.appDataDir = normalizePath(options.appDataDir);
		this.clock = options.clock ?? systemClock;
		this.#startImportWorker = options.startImportWorker;
		this.#writeClipboard = options.writeClipboard ?? null;
	}
	async readFile(path) {
		const bytes = await this.#call(path, (native) => readFile(native));
		return new Uint8Array(bytes);
	}
	readText(path) {
		return this.#call(path, (native) => readFile(native, "utf8"));
	}
	async writeFile(path, data) {
		await this.mkdir(dirname(path));
		await this.#call(path, (native) => writeFile(native, data));
	}
	async writeFileAtomic(path, data) {
		await this.mkdir(dirname(path));
		const temporary = joinPath(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
		try {
			await this.#call(temporary, (native) => writeFile(native, data, { flush: true }));
			await this.#call(path, (native) => renameWithRetry(this.#native(temporary), native));
		} catch (error) {
			await rm(this.#native(temporary), { force: true }).catch(() => void 0);
			throw error;
		}
	}
	async exists(path) {
		return await this.stat(path) !== null;
	}
	async stat(path) {
		const stats = await this.#lstat(path);
		if (!stats) return null;
		const kind = kindOf(stats);
		return {
			kind,
			size: kind === "file" ? stats.size : 0,
			modifiedMs: stats.mtimeMs
		};
	}
	async mkdir(path) {
		await this.#call(path, (native) => mkdir(native, { recursive: true }));
	}
	async list(path) {
		return (await this.#call(path, (native) => readdir(native, { withFileTypes: true }))).map((entry) => ({
			name: entry.name,
			kind: kindOf(entry)
		})).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
	}
	async remove(path) {
		const target = normalizePath(path);
		if (dirname(target) === target) throw new ArcueError("invalid-input", "The root folder cannot be removed.");
		await this.#call(target, (native) => rm(native, {
			recursive: true,
			force: true
		}));
	}
	async removeEmptyFolder(path) {
		await this.#call(path, (native) => rmdir(native));
	}
	async rename(from, to) {
		if (await this.#lstat(to)) throw new ArcueError("conflict", `${to} already exists.`);
		await this.mkdir(dirname(to));
		await this.#call(from, (native) => renameWithRetry(native, this.#native(to)));
	}
	watch(path, listener) {
		return watchPath(normalizePath(path), (native) => this.#native(native), this.#folders, listener);
	}
	findWorkspaceRoot(path) {
		return findGitRoot(path, (candidate) => this.exists(candidate));
	}
	startImportWorker() {
		return this.#startImportWorker();
	}
	async writeClipboard(text) {
		if (!this.#writeClipboard) throw new ArcueError("unavailable", "This host has no clipboard; the window writes it.");
		await this.#writeClipboard(text);
	}
	#native(path) {
		return toNativePath(path, this.#style);
	}
	async #lstat(path) {
		try {
			return await lstat(this.#native(path));
		} catch (error) {
			if (isMissing(error)) return null;
			throw toArcueError(error, path);
		}
	}
	async #call(path, action) {
		try {
			return await action(this.#native(path));
		} catch (error) {
			throw toArcueError(error, path);
		}
	}
};
function kindOf(entry) {
	if (entry.isSymbolicLink()) return "symlink";
	return entry.isDirectory() ? "directory" : "file";
}
function codeOf(error) {
	return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : void 0;
}
function isMissing(error) {
	const code = codeOf(error);
	return code === "ENOENT" || code === "ENOTDIR";
}
function toArcueError(error, path) {
	if (error instanceof ArcueError) return error;
	const code = codeOf(error);
	const message = error instanceof Error ? error.message : String(error);
	if (isMissing(error)) return new ArcueError("not-found", `${path} does not exist.`, { cause: error });
	if (code === "EISDIR" || code === "EEXIST" || code === "ENOTEMPTY") return new ArcueError("conflict", `${path}: ${message}`, { cause: error });
	if (code === "EACCES" || code === "EPERM") return new ArcueError("forbidden", `${path}: ${message}`, { cause: error });
	return new ArcueError("internal", `${path}: ${message}`, { cause: error });
}
/** Windows refuses a rename while another program, such as a virus scanner, holds the target open; it retries. */
async function renameWithRetry(from, to) {
	for (let attempt = 1;; attempt++) try {
		await rename(from, to);
		return;
	} catch (error) {
		const code = codeOf(error);
		if (attempt >= RENAME_ATTEMPTS || code !== "EPERM" && code !== "EACCES" && code !== "EBUSY") throw error;
		await new Promise((resolve) => setTimeout(resolve, attempt * 20));
	}
}
/**
* Watches the folder that holds `path`, which also sees an atomic replace, as a removal and creation or as a rename.
* While that folder does not exist yet, it watches the nearest folder above it and moves down as folders appear.
* Files in one folder share its watch. When the system cannot watch at all, it polls.
*/
function watchPath(path, native, folders, listener) {
	const name = basename(path);
	const parent = dirname(path);
	let unlisten = null;
	let watching = null;
	let polling = false;
	let stopped = false;
	let existed = null;
	let checking = Promise.resolve();
	const report = () => {
		checking = checking.then(async () => {
			const present = await lstat(native(path)).then(() => true, () => false);
			if (stopped) return;
			if (!present) arm();
			const before = existed;
			existed = present;
			if (!present && before === false) return;
			listener({
				path,
				kind: !present ? "removed" : before ? "changed" : "created"
			});
		});
	};
	const poll = () => {
		if (polling) return;
		polling = true;
		watchFile(native(path), { interval: POLL_INTERVAL_MS }, report);
	};
	/** The folder's watch ended, as when Linux drops the watch of a removed folder, so watching moves up. */
	const ended = () => {
		unlisten = null;
		watching = null;
		if (!stopped) arm().then(report);
	};
	const arm = async () => {
		let folder = parent;
		while (!await isFolder(native(folder))) {
			const up = dirname(folder);
			if (up === folder) return poll();
			folder = up;
		}
		if (stopped || folder === watching) return;
		unlisten?.();
		unlisten = null;
		watching = folder;
		const changed = folder === parent ? report : () => void arm().then(report);
		try {
			unlisten = folders.listen(native(folder), {
				name: folder === parent ? name : null,
				changed,
				ended
			});
		} catch {
			watching = null;
			poll();
			return;
		}
		if (folder !== parent) arm().then(report);
	};
	lstat(native(path)).then(() => {
		existed ??= true;
	}, () => {
		existed ??= false;
	});
	arm();
	return () => {
		stopped = true;
		unlisten?.();
		if (polling) unwatchFile(native(path), report);
	};
}
//#endregion
//#region ../../packages/platform-node/src/window-presence.ts
/**
* Counts the windows connected to the core, so an open from the command line can wait for a window. On macOS the app
* keeps running with every window closed; `requestWindow` then asks the main process to open one.
*/
var WindowPresence = class {
	#count = 0;
	#waiters = [];
	#requestWindow;
	#setTimer;
	#timeoutMs;
	constructor(options) {
		this.#requestWindow = options.requestWindow;
		this.#setTimer = options.setTimer;
		this.#timeoutMs = options.timeoutMs ?? 15e3;
	}
	get count() {
		return this.#count;
	}
	added() {
		this.#count++;
		for (const resolve of this.#waiters.splice(0)) resolve();
	}
	removed() {
		this.#count = Math.max(0, this.#count - 1);
	}
	/** Resolves once a window is connected, asking for one when none is; rejects as "unavailable" after the timeout. */
	ensure() {
		if (this.#count > 0) return Promise.resolve();
		return new Promise((resolve, reject) => {
			const waiter = () => {
				cancel();
				resolve();
			};
			const cancel = this.#setTimer(this.#timeoutMs, () => {
				this.#waiters = this.#waiters.filter((entry) => entry !== waiter);
				reject(new ArcueError("unavailable", "No window opened in time to show the asset."));
			});
			this.#waiters.push(waiter);
			if (this.#waiters.length === 1) this.#requestWindow();
		});
	}
};
//#endregion
//#region src/app-connection.ts
/** The app's data folder: `ARCUE_USER_DATA` when set, otherwise where Electron keeps an app named "Arcue". */
function userDataDir(env = process.env, platform = process.platform, home = homedir()) {
	if (env.ARCUE_USER_DATA) return env.ARCUE_USER_DATA;
	if (platform === "darwin") return join(home, "Library", "Application Support", "Arcue");
	if (platform === "win32") return join(env.APPDATA ?? join(home, "AppData", "Roaming"), "Arcue");
	return join(env.XDG_CONFIG_HOME ?? join(home, ".config"), "Arcue");
}
var timer = (delayMs, callback) => {
	const handle = setTimeout(callback, delayMs);
	return () => clearTimeout(handle);
};
async function readJson(path) {
	try {
		return JSON.parse(await readFile(path, "utf8"));
	} catch {
		return null;
	}
}
async function readBridgeInfo(userData) {
	const parsed = bridgeInfoSchema.safeParse(await readJson(join(userData, BRIDGE_INFO_FILE)));
	return parsed.success ? parsed.data : null;
}
async function readLaunchInfo(userData) {
	const parsed = launchInfoSchema.safeParse(await readJson(join(userData, LAUNCH_INFO_FILE)));
	return parsed.success ? parsed.data : null;
}
/** Connects to the running app's core and presents the token; null when nothing listens on the socket. */
async function connectToApp(userData, handshakeMs = 5e3) {
	const info = await readBridgeInfo(userData);
	if (!info) return null;
	const socket = connect(info.socket);
	if (!await new Promise((resolve) => {
		socket.once("connect", () => resolve(true));
		socket.once("error", () => resolve(false));
	})) {
		socket.destroy();
		return null;
	}
	const channel = framedChannel(socketStream(socket), jsonFrameCodec, { firstFrameMaxBytes: HANDSHAKE_MAX_FRAME_BYTES });
	const endpoint = await connectBridge(channel, {
		token: info.token,
		timeout: {
			ms: handshakeMs,
			setTimer: timer
		}
	});
	const peer = createPeer(endpoint);
	return {
		client: createRemoteClient(peer),
		info,
		close: () => {
			peer.close();
			socket.destroy();
		}
	};
}
/** Starts the app the way `launch.json` recorded, detached from this process. */
async function launchApp(userData) {
	const launch = await readLaunchInfo(userData);
	if (!launch) return false;
	const child = spawn(launch.command, launch.args, {
		detached: true,
		stdio: "ignore"
	});
	child.on("error", () => void 0);
	child.unref();
	return true;
}
/**
* Connects to the app, starting it first when nothing listens, and waits up to `timeoutMs` for its socket. A refused
* handshake is retried too, since a starting core writes its new `bridge.json` only after it listens.
*/
async function connectOrLaunch(userData, { timeoutMs = 3e4, pollMs = 200 } = {}) {
	const deadline = Date.now() + timeoutMs;
	let lastError = null;
	const attempt = () => connectToApp(userData).catch((error) => {
		lastError = error;
		return null;
	});
	const first = await attempt();
	if (first) return first;
	if (lastError === null && !await launchApp(userData)) throw new Error("Arcue is not running, and it has not been started on this computer yet. Start it once first, or run \"arcue serve\" to use it in a browser.");
	while (Date.now() < deadline) {
		await new Promise((resolve) => setTimeout(resolve, pollMs));
		const connection = await attempt();
		if (connection) return connection;
	}
	if (lastError instanceof Error) throw lastError;
	throw new Error(`Arcue did not start within ${Math.round(timeoutMs / 1e3)} seconds.`);
}
var USAGE = `Usage:
  arcue open <file> [--clip <name>] [--frame <number>]
      Opens a model in the running Arcue app, starting the app when it is not running. The model loads with the
      files its composition lists.
      --clip names a clip by its name in the file, such as "Armature|Walk" in an FBX or "Walk" in a .blend.
      --frame is a whole frame number from 0.
  arcue inspect <file> [--json]
      Imports a model without the app and summarizes its meshes, parts, bones, materials, clips and warnings,
      composed with the files its composition lists, as opening it would.
      --json prints the full result for scripts and agents. Exits with 1 when the file cannot be read or parsed.
  arcue serve [--port <number>]
      Runs Arcue in a browser instead of the desktop app, until stopped: serves its window at
      http://localhost:4530, or at the given port, to this computer only. "arcue open" then shows models
      there. Exits with 1 when Arcue already runs.
  arcue status
      Reports whether Arcue is running, where a browser shows it, and which assets it has open. Exits with 1 when it is
      not running.
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
	if (command === "status") {
		if (rest.length > 0) throw new UsageError(`"arcue status" takes no arguments, got "${rest.join(" ")}".`);
		return { command: "status" };
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
	for (let index = 0; index < rest.length; index++) {
		const arg = rest[index] ?? "";
		const [flag, inline] = arg.startsWith("--") && arg.includes("=") ? splitOnce(arg, "=") : [arg, void 0];
		if (flag === "--clip" || flag === "--frame") {
			const value = inline ?? rest[++index];
			if (value === void 0 || value === "") throw new UsageError(`${flag} needs a value.`);
			if (flag === "--clip") clip = value;
			else frame = parseFrame(value);
		} else if (arg.startsWith("--")) throw new UsageError(`Unknown option "${arg}".`);
		else if (path === void 0) path = arg;
		else throw new UsageError(`"arcue open" takes one file, got "${path}" and "${arg}".`);
	}
	if (path === void 0) throw new UsageError("\"arcue open\" needs a file.");
	return {
		command: "open",
		path,
		...clip !== void 0 ? { clip } : {},
		...frame !== void 0 ? { frame } : {}
	};
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
	for (let index = 0; index < args.length; index++) {
		const arg = args[index] ?? "";
		const [flag, inline] = arg.startsWith("--") && arg.includes("=") ? splitOnce(arg, "=") : [arg, void 0];
		if (flag !== "--port") throw new UsageError(arg.startsWith("--") ? `Unknown option "${arg}".` : `"arcue serve" takes no file, got "${arg}".`);
		const value = inline ?? args[++index];
		if (value === void 0 || value === "") throw new UsageError("--port needs a value.");
		port = parsePort(value);
	}
	return {
		command: "serve",
		...port !== void 0 ? { port } : {}
	};
}
function parsePort(value) {
	const port = /^\d+$/.test(value) ? Number(value) : NaN;
	if (!(port >= 1 && port <= 65535)) throw new UsageError(`--port takes a port from 1 to 65535, got "${value}".`);
	return port;
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
//#region src/inspect.ts
/** The import worker the build writes beside `arcue.js`. */
var bundledImportWorker = fileURLToPath(new URL("./import-worker.js", import.meta.url));
/** Runs a core in this process on the Node platform and asks it for `asset.inspect`; no app needs to run. */
async function inspectFile(nativePath, options) {
	const platform = new NodePlatform({
		appDataDir: fromNativePath(options.userData),
		startImportWorker: () => startNodeImportWorker(options.importWorkerEntry, options.onError)
	});
	const core = await ArcueCore.start({
		platform,
		onError: options.onError
	});
	try {
		return await core.client.query("asset.inspect", { path: fromNativePath(nativePath) });
	} finally {
		core.dispose();
	}
}
var FORMAT_NAMES = {
	fbx: "FBX",
	blend: ".blend",
	gltf: "glTF",
	glb: "GLB"
};
/** A few aligned lines for people. Empty sections are left out. */
function formatInspection(inspection) {
	const rows = [];
	const add = (label, lines) => {
		if (lines.length > 0) rows.push([label, lines]);
	};
	const format = FORMAT_NAMES[inspection.format] ?? inspection.format;
	add("File", [inspection.file.path]);
	add("Format", [inspection.exporter ? `${format} from ${inspection.exporter}` : format]);
	if (inspection.clips.length > 0) add("Frame rate", [`${formatNumber(inspection.fps)} fps`]);
	add("Up axis", [inspection.upAxis]);
	if (inspection.unitMeters !== 1) add("Unit", [`${formatNumber(inspection.unitMeters)} m`]);
	add("Height", [`${formatNumber(inspection.height)} m`]);
	add("Meshes", columns(inspection.meshes.map((mesh) => [mesh.name, `${count(mesh.triangles, "triangle")}${mesh.skinned ? ", skinned" : ""}`])));
	add("Parts", columns(inspection.parts.flatMap((part) => partDetail(part) === "" ? [] : [[part.name, partDetail(part)]])));
	if (inspection.bones.length > 0) add("Bones", [String(inspection.bones.length)]);
	add("Materials", columns(inspection.materials.map((material) => [material.name, material.textures.map((ref) => `${slotName(ref.slot)} ${ref.texture}`).join(", ")])));
	add("Clips", columns(inspection.clips.map((clip) => [clip.name, `${count(clip.frames, "frame")}${clip.fps === inspection.fps ? "" : ` at ${formatNumber(clip.fps)} fps`}`])));
	if (inspection.composition !== null) add("Composition", [inspection.composition]);
	add("Files", columns(inspection.members.map((member) => [member.file, member.role])));
	const problems = (severity) => inspection.warnings.flatMap((warning) => warning.severity !== severity ? [] : [warning.file && warning.file !== warning.subject.name ? `${warning.message} (${warning.file})` : warning.message]);
	add("Errors", problems("error"));
	add("Warnings", problems("warning"));
	const width = Math.max(...rows.map(([label]) => label.length)) + 2;
	return `${rows.flatMap(([label, lines]) => lines.map((line, index) => `${(index === 0 ? label : "").padEnd(width)}${line}`)).map((line) => line.trimEnd()).join("\n")}\n`;
}
/** What sets a part apart from a plain mesh: its LOD levels, its role, or being hidden by default. */
function partDetail(part) {
	const details = [];
	if (part.levels.length > 1) details.push(`LOD ${part.levels.map((entry) => entry.level).join(", ")}`);
	if (part.role !== "model") details.push(part.role);
	else if (!part.shownByDefault) details.push("hidden");
	return details.join(", ");
}
function columns(rows) {
	const width = Math.max(0, ...rows.map(([name]) => name.length)) + 2;
	return rows.map(([name, detail]) => detail === "" ? name : `${name.padEnd(width)}${detail}`);
}
function count(value, noun) {
	return `${value.toLocaleString("en-US")} ${noun}${value === 1 ? "" : "s"}`;
}
function formatNumber(value) {
	return String(Number(value.toPrecision(4)));
}
function slotName(slot) {
	return slot.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`);
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
	var { randomBytes: randomBytes$1, createHash: createHash$1 } = __require("crypto");
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
			const digest = createHash$1("sha1").update(key + GUID).digest("base64");
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
	var { createHash } = __require("crypto");
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
				`Sec-WebSocket-Accept: ${createHash("sha1").update(key + GUID).digest("base64")}`
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
/**
* Runs a core on this computer's files and serves its window to a browser on localhost, as the desktop app shows it in
* its own window. The core takes the desktop app's place: it writes `bridge.json`, so `arcue open` and `arcue status`
* reach it, and it refuses to start while another core runs.
*
* Only pages from this server's own origin can connect to the core, and only through a localhost address, so other
* websites and DNS rebinding cannot reach it. No website may show its pages in a frame, where the user could not see a
* model the command line opens and clicks could be hijacked. Like any local web server, it is open to other programs on
* this computer while it runs.
*/
async function startServer(options) {
	const webUi = await realpath(options.webUi).catch(() => null);
	if (!webUi || !(await stat(resolve(webUi, "index.html")).catch(() => null))?.isFile()) throw new Error(`This arcue has no web UI in ${options.webUi}.`);
	const running = await connectToApp(options.userData).catch(() => null);
	if (running) {
		running.close();
		const where = running.info.url ? ` at ${running.info.url}` : "";
		throw new Error(`Arcue is already running${where} (process ${running.info.pid}). "arcue open" shows models there.`);
	}
	const { servers: http, port } = await listenLocally(options.port);
	const url = `http://localhost:${port}`;
	const hosts = localHosts(port);
	const allowed = (request) => hosts.has(request.headers.host?.toLowerCase() ?? "");
	const windows = new WindowPresence({
		requestWindow: () => options.onWaitingForWindow?.(),
		setTimer: systemClock.setTimer
	});
	let core = null;
	let bridge;
	try {
		const platform = new NodePlatform({
			appDataDir: fromNativePath(options.userData),
			startImportWorker: () => startNodeImportWorker(options.importWorkerEntry, options.onError)
		});
		core = await ArcueCore.start({
			platform,
			onError: options.onError
		});
		bridge = await startBridgeServer({
			core,
			userData: options.userData,
			ensureWindow: () => windows.ensure(),
			onError: options.onError,
			url
		});
	} catch (error) {
		core?.dispose();
		await Promise.all(http.map((server) => closeServer(server)));
		throw error;
	}
	const started = core;
	const sockets = new import_websocket_server.default({
		noServer: true,
		maxPayload: MAX_FRAME_BYTES
	});
	let next = 1;
	sockets.on("connection", (socket) => {
		const channel = messageChannel(webSocketStream(socket), binaryFrameCodec);
		const peer = started.connect(framedEndpoint(channel), {
			connection: `browser-${next++}`,
			caller: "window",
			onListenerError: options.onError
		});
		windows.added();
		peer.onClose(() => {
			windows.removed();
			channel.close();
		});
	});
	for (const server of http) {
		server.on("request", (request, response) => {
			for (const [name, value] of Object.entries(PAGE_HEADERS)) response.setHeader(name, value);
			if (!allowed(request)) return refuse(response, 403);
			if (request.method !== "GET" && request.method !== "HEAD") return refuse(response, 405);
			sendFile(webUi, request, response).catch((error) => {
				options.onError(error);
				if (!response.headersSent) refuse(response, 500);
				else response.destroy();
			});
		});
		server.on("upgrade", (request, socket, head) => {
			const path = URL.parse(request.url ?? "/", url)?.pathname;
			if (!allowed(request) || path !== "/core/2" || request.headers.origin !== `http://${request.headers.host}`) {
				socket.end(`HTTP/1.1 403 Forbidden\r\n${rawHeaders(PAGE_HEADERS)}Connection: close\r\n\r\n`);
				return;
			}
			sockets.handleUpgrade(request, socket, head, (connected) => sockets.emit("connection", connected, request));
		});
	}
	return {
		url,
		async close() {
			for (const client of sockets.clients) client.terminate();
			await Promise.all(http.map((server) => closeServer(server)));
			await bridge.close();
			await started.idle();
			started.dispose();
		}
	};
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
/** Listens on 127.0.0.1 and, where the computer has it, on ::1 too, since "localhost" may resolve to either. */
async function listenLocally(port) {
	const first = createServer$1();
	try {
		await listen(first, port, "127.0.0.1");
	} catch (error) {
		if (isCode(error, "EADDRINUSE")) throw new Error(`Port ${port} is in use. Choose another with --port.`);
		throw error;
	}
	const bound = first.address().port;
	const second = createServer$1();
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
/** Sends a file from the web UI's folder, `index.html` for "/". Anything outside the folder is not found. */
async function sendFile(webUi, request, response) {
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
	if (!found?.isFile()) return refuse(response, 404);
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
//#region src/run.ts
var NODE_MAJOR = 24;
/**
* Runs the command line and returns its exit code: 0 on success, 1 on failure, 2 for a usage error, and 3 when `setup`
* runs on a Node older than 24.
*/
async function run(args, output, cwd = process.cwd(), options = {}) {
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
			case "status": return await status(output);
			case "open": return await open(command, cwd, output);
			case "inspect": return await inspect(command, cwd, output, options.importWorkerEntry ?? bundledImportWorker);
			case "serve": return await serve(command, output, options);
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
async function status(output) {
	const connection = await connectToApp(userDataDir());
	if (!connection) {
		output.out("Arcue is not running.\n");
		return 1;
	}
	try {
		const { assets } = await connection.client.query("asset.list", {});
		const { url, pid } = connection.info;
		const lines = [url ? `Arcue is running in a browser at ${url} (process ${pid}).` : `Arcue is running (process ${pid}).`];
		if (assets.length === 0) lines.push("No assets are open.");
		else lines.push(`Open assets:`, ...assets.map((asset) => `  ${asset.assetId}  ${asset.status.padEnd(7)}  ${asset.path}`));
		output.out(`${lines.join("\n")}\n`);
		return 0;
	} finally {
		connection.close();
	}
}
async function existingFile(cwd, relative) {
	const given = resolve(cwd, relative);
	if (!(await stat(given).catch(() => null))?.isFile()) throw new Error(`${given} is not a file.`);
	return realpath(given);
}
async function inspect(command, cwd, output, importWorkerEntry) {
	const path = await existingFile(cwd, command.path);
	let workerError = null;
	const inspection = await inspectFile(path, {
		importWorkerEntry,
		userData: userDataDir(),
		onError: (error) => {
			workerError ??= error;
		}
	}).catch((error) => {
		throw workerError ?? error;
	});
	output.out(command.json ? `${JSON.stringify(inspection, null, 2)}\n` : formatInspection(inspection));
	return 0;
}
async function open(command, cwd, output) {
	const path = await existingFile(cwd, command.path);
	const connection = await connectOrLaunch(userDataDir());
	try {
		const { assetId } = await connection.client.execute("asset.open", {
			path,
			...command.clip !== void 0 ? { clip: command.clip } : {},
			...command.frame !== void 0 ? { frame: command.frame } : {}
		});
		output.out(`Opened ${path} in Arcue as ${assetId}.\n`);
		return 0;
	} catch (error) {
		const { url } = connection.info;
		if (url && error instanceof ArcueError && error.code === "unavailable") throw new Error(`${error.message} Arcue runs in a browser: open ${url} first.`);
		throw error;
	} finally {
		connection.close();
	}
}
async function serve(command, output, options) {
	const server = await startServer({
		userData: userDataDir(),
		importWorkerEntry: options.importWorkerEntry ?? bundledImportWorker,
		webUi: options.webUi ?? bundledWebUi,
		port: command.port ?? 4530,
		onError: (error) => output.err(`${error instanceof Error ? error.message : String(error)}\n`),
		onWaitingForWindow: () => output.err(`Waiting for a browser to open ${server.url}.\n`)
	});
	output.out(`Arcue runs at ${server.url}. Open it in a browser; "arcue open" shows models there.\n`);
	await (options.stop ?? signalled());
	await server.close();
	return 0;
}
function signalled() {
	return new Promise((resolve) => {
		const signals = [
			"SIGINT",
			"SIGTERM",
			"SIGHUP"
		];
		const stop = () => {
			for (const signal of signals) process.off(signal, stop);
			resolve();
		};
		for (const signal of signals) process.on(signal, stop);
	});
}
//#endregion
//#region src/bin.ts
process.exitCode = await run(process.argv.slice(2), {
	out: (text) => process.stdout.write(text),
	err: (text) => process.stderr.write(text)
});
//#endregion
export {};
