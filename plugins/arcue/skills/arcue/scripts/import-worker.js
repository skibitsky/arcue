import { $ as ArcueError, D as parseStoredPath, F as describeParts, M as describeTextureUses, N as importWarning, O as fileNameOf, P as defaultViewBounds, S as mergeKeyTimes, b as isKeyedEveryFrame, j as topologyFingerprint, k as imageMimeType, l as serveImportWorker, n as portEndpoint, y as frameCountFor } from "./arcue-BZ6H3Roo.js";
import { parentPort } from "node:worker_threads";
//#region ../../packages/scene/src/clip.ts
var UNTITLED_CLIP = "Untitled clip";
/** The name a clip without one gets as its identity. */
var UNNAMED_CLIP = "(unnamed)";
/**
* Identities for a file's clips, in the same order. Every clip keeps its name in the file when it is the first to
* use it. An empty name becomes "(unnamed)", and a repeated or empty name gets the lowest "#2", "#3" suffix that no
* clip in the file uses, so no clip loses its own name to a generated one.
*/
function clipNames(rawNames) {
	const reserved = new Set(rawNames.filter((raw) => raw !== ""));
	const taken = /* @__PURE__ */ new Set();
	return rawNames.map((raw) => {
		const base = raw === "" ? UNNAMED_CLIP : raw;
		let candidate = base;
		if (raw === "" || taken.has(raw)) for (let suffix = 2; taken.has(candidate) || reserved.has(candidate); suffix++) candidate = `${base}#${suffix}`;
		taken.add(candidate);
		return candidate;
	});
}
function cleanClipName(name) {
	const separator = name.lastIndexOf("|");
	const cleaned = (separator === -1 ? name : name.slice(separator + 1)).trim();
	if (cleaned !== "") return cleaned;
	return name.trim() === "" ? UNTITLED_CLIP : name.trim();
}
/**
* Display names for a file's clips, in the same order. Clips whose cleaned names collide keep their full names,
* and any names still equal get " (2)", " (3)" and so on.
*/
function displayNames(names) {
	const cleaned = names.map(cleanClipName);
	const counts = /* @__PURE__ */ new Map();
	for (const name of cleaned) counts.set(name, (counts.get(name) ?? 0) + 1);
	const taken = /* @__PURE__ */ new Set();
	return names.map((name, index) => {
		const clean = cleaned[index] ?? UNTITLED_CLIP;
		const preferred = (counts.get(clean) ?? 0) > 1 && name.trim() !== "" ? name.trim() : clean;
		let candidate = preferred;
		for (let suffix = 2; taken.has(candidate); suffix++) candidate = `${preferred} (${suffix})`;
		taken.add(candidate);
		return candidate;
	});
}
//#endregion
//#region ../../packages/scene/src/node.ts
var ESCAPED = /[\\/#]/g;
/** The name a node without one gets in its path. */
var UNNAMED_NODE = "(unnamed)";
function escapeSegment(name) {
	return (name === "" ? UNNAMED_NODE : name).replace(ESCAPED, (char) => `\\${char}`);
}
/**
* Builds a path for each node from the root names down, joined by "/".
* A node without a name is called "(unnamed)". "\", "/" and "#" in names are escaped with "\".
* When siblings share a name, the second and later ones get "#2", "#3" and so on, in file order.
*/
function buildNodePaths(nodes) {
	const paths = [];
	const seen = /* @__PURE__ */ new Map();
	nodes.forEach((node, index) => {
		if (node.parent >= index || node.parent < -1) throw new RangeError(`Node ${index} ("${node.name}") must come after its parent ${node.parent}.`);
		const parentPath = node.parent === -1 ? null : paths[node.parent];
		const segment = escapeSegment(node.name);
		const key = `${node.parent}/${segment}`;
		const occurrence = (seen.get(key) ?? 0) + 1;
		seen.set(key, occurrence);
		const unique = occurrence === 1 ? segment : `${segment}#${occurrence}`;
		paths.push(parentPath === null ? unique : `${parentPath}/${unique}`);
	});
	return paths;
}
//#endregion
//#region ../../packages/import-fbx/src/decode.ts
var RESULT_MAGIC = 1430475329;
var RESULT_VERSION = 1;
var PREAMBLE_BYTES = 16;
/** The parser rejected the file; the message is ufbx's reason. */
var FbxParseError = class extends Error {
	name = "FbxParseError";
};
var BlobReader = class {
	#heap;
	#base;
	#end;
	constructor(heap, base, size) {
		this.#heap = heap;
		this.#base = base;
		this.#end = base + size;
	}
	#start(ref, elementBytes) {
		const start = this.#base + ref[0];
		if (start % elementBytes !== 0 || start + ref[1] * elementBytes > this.#end) throw new RangeError(`Blob [${ref[0]}, ${ref[1]}] lies outside the parser's result.`);
		return start;
	}
	f32(ref) {
		const copy = new Float32Array(ref[1]);
		copy.set(new Float32Array(this.#heap.buffer, this.#start(ref, 4), ref[1]));
		return copy;
	}
	u32(ref) {
		const copy = new Uint32Array(ref[1]);
		copy.set(new Uint32Array(this.#heap.buffer, this.#start(ref, 4), ref[1]));
		return copy;
	}
	u16(ref) {
		const copy = new Uint16Array(ref[1]);
		copy.set(new Uint16Array(this.#heap.buffer, this.#start(ref, 2), ref[1]));
		return copy;
	}
	u8(ref) {
		const copy = new Uint8Array(ref[1]);
		copy.set(this.#heap.subarray(this.#start(ref, 1), this.#start(ref, 1) + ref[1]));
		return copy;
	}
};
function readMesh(mesh, blobs) {
	return {
		name: mesh.name,
		geometryName: mesh.geometryName,
		positions: blobs.f32(mesh.positions),
		normals: blobs.f32(mesh.normals),
		uvs: mesh.uvs.map((uv) => ({
			name: uv.name,
			values: blobs.f32(uv.values)
		})),
		colors: mesh.colors ? blobs.f32(mesh.colors) : null,
		skeleton: mesh.skeleton,
		bindMatrix: mesh.bindMatrix ? Float32Array.from(mesh.bindMatrix) : null,
		joints: mesh.joints ? blobs.u16(mesh.joints) : null,
		weights: mesh.weights ? blobs.f32(mesh.weights) : null,
		indices: blobs.u32(mesh.indices),
		groups: mesh.groups,
		morphTargets: mesh.morphTargets.map((target) => ({
			name: target.name,
			defaultWeight: target.defaultWeight,
			positions: blobs.f32(target.positions),
			normals: target.normals ? blobs.f32(target.normals) : null
		})),
		sourceVertex: blobs.u32(mesh.sourceVertex),
		sourceVertexCount: mesh.sourceVertexCount,
		restPositions: blobs.f32(mesh.restPositions),
		skinWeights: mesh.skinWeights ? {
			offsets: blobs.u32(mesh.skinWeights.offsets),
			joints: blobs.u16(mesh.skinWeights.joints),
			weights: blobs.f32(mesh.skinWeights.weights)
		} : null
	};
}
function readClip(clip, blobs) {
	const times = blobs.f32(clip.curveTimes);
	const offsets = blobs.u32(clip.curveOffsets);
	const curveTimes = [];
	for (let i = 0; i + 1 < offsets.length; i++) curveTimes.push(times.subarray(offsets[i], offsets[i + 1]));
	return {
		name: clip.name,
		duration: clip.duration,
		curveTimes,
		tracks: clip.tracks.map((track) => ({
			node: track.node,
			property: track.property,
			interpolation: track.interpolation,
			times: blobs.f32(track.times),
			values: blobs.f32(track.values)
		}))
	};
}
/**
* Reads the parser's result at `pointer` in `heap`: a 16-byte preamble (magic, version, JSON length, blob length),
* the JSON header, padding to 8 bytes, then the blobs the header points into. Every array is copied out of `heap`.
*/
function readResult(heap, pointer) {
	const view = new DataView(heap.buffer, heap.byteOffset + pointer, PREAMBLE_BYTES);
	if (view.getUint32(0, true) !== RESULT_MAGIC || view.getUint32(4, true) !== RESULT_VERSION) throw new RangeError("The FBX parser returned a result in an unknown format.");
	const jsonBytes = view.getUint32(8, true);
	const blobBytes = view.getUint32(12, true);
	const jsonStart = pointer + PREAMBLE_BYTES;
	const header = JSON.parse(new TextDecoder().decode(heap.subarray(jsonStart, jsonStart + jsonBytes)));
	if (typeof header === "object" && header !== null && "error" in header) throw new FbxParseError(String(header.error));
	const scene = header;
	const blobs = new BlobReader(heap, jsonStart + jsonBytes + (8 - (PREAMBLE_BYTES + jsonBytes) % 8) % 8, blobBytes);
	return {
		nodes: scene.nodes,
		meshes: scene.meshes.map((mesh) => readMesh(mesh, blobs)),
		skeletons: scene.skeletons.map((skeleton) => ({
			joints: skeleton.joints,
			inverseBindMatrices: blobs.f32(skeleton.inverseBindMatrices)
		})),
		materials: scene.materials,
		textureFiles: scene.textureFiles.map((file) => ({
			relative: file.relative,
			absolute: file.absolute,
			linked: file.linked,
			content: file.content ? blobs.u8(file.content) : null
		})),
		clips: scene.clips.map((clip) => readClip(clip, blobs)),
		exporter: scene.exporter,
		fps: scene.fps,
		originalSpace: scene.originalSpace,
		conversion: scene.conversion,
		warnings: scene.warnings
	};
}
//#endregion
//#region ../../packages/import-fbx/wasm/arcue-ufbx.js
async function createArcueUfbx(moduleArg = {}) {
	var Module = moduleArg;
	var ENVIRONMENT_IS_WEB = !!globalThis.window;
	var ENVIRONMENT_IS_WORKER = !!globalThis.WorkerGlobalScope;
	var ENVIRONMENT_IS_NODE = globalThis.process?.versions?.node && globalThis.process?.type != "renderer";
	if (ENVIRONMENT_IS_NODE) {
		const { createRequire } = await import(
			/* @vite-ignore */
			String("node:module")
);
		var require = createRequire(import.meta.url);
	}
	var _scriptName = import.meta.url;
	var scriptDirectory = "";
	function locateFile(path) {
		return scriptDirectory + path;
	}
	var readAsync, readBinary;
	if (ENVIRONMENT_IS_NODE) {
		var fs = require("node:fs");
		if (_scriptName.startsWith("file:")) scriptDirectory = require("node:path").dirname(require("node:url").fileURLToPath(_scriptName)) + "/";
		readBinary = (filename) => {
			filename = isFileURI(filename) ? new URL(filename) : filename;
			return fs.readFileSync(filename);
		};
		readAsync = async (filename, binary = true) => {
			filename = isFileURI(filename) ? new URL(filename) : filename;
			return fs.readFileSync(filename, binary ? void 0 : "utf8");
		};
		if (process.argv.length > 1) process.argv[1].replace(/\\/g, "/");
		process.argv.slice(2);
	} else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
		try {
			scriptDirectory = new URL(".", _scriptName).href;
		} catch {}
		if (ENVIRONMENT_IS_WORKER) readBinary = (url) => {
			var xhr = new XMLHttpRequest();
			xhr.open("GET", url, false);
			xhr.responseType = "arraybuffer";
			xhr.send(null);
			return new Uint8Array(xhr.response);
		};
		readAsync = async (url) => {
			var response = await fetch(url, { credentials: "same-origin" });
			if (response.ok) return response.arrayBuffer();
			throw new Error(response.status + " : " + response.url);
		};
	}
	console.log.bind(console);
	var err = console.error.bind(console);
	var wasmBinary;
	var ABORT = false;
	var isFileURI = (filename) => filename.startsWith("file://");
	function getMemoryBuffer() {
		return wasmMemory.buffer;
	}
	function updateMemoryViews() {
		if (HEAP8?.buffer?.resizable) return;
		var b = getMemoryBuffer();
		HEAP8 = new Int8Array(b);
		Module["HEAPU8"] = HEAPU8 = new Uint8Array(b);
	}
	function initRuntime() {
		wasmExports["d"]();
	}
	function abort(what) {
		what = `Aborted(${what})`;
		err(what);
		ABORT = true;
		what += ". Build with -sASSERTIONS for more info.";
		throw new WebAssembly.RuntimeError(what);
	}
	var wasmBinaryFile;
	function findWasmBinary() {
		if (Module["locateFile"]) return locateFile("arcue-ufbx.wasm");
		return new URL("arcue-ufbx.wasm", import.meta.url).href;
	}
	function getBinarySync(file) {
		if (readBinary) return readBinary(file);
		throw "both async and sync fetching of the wasm failed";
	}
	async function getWasmBinary(binaryFile) {
		if (!wasmBinary) try {
			var response = await readAsync(binaryFile);
			return new Uint8Array(response);
		} catch {}
		return getBinarySync(binaryFile);
	}
	async function instantiateArrayBuffer(binaryFile, imports) {
		try {
			var binary = await getWasmBinary(binaryFile);
			return await WebAssembly.instantiate(binary, imports);
		} catch (reason) {
			err(`failed to asynchronously prepare wasm: ${reason}`);
			abort(reason);
		}
	}
	async function instantiateAsync(binary, binaryFile, imports) {
		if (!binary && !ENVIRONMENT_IS_NODE) try {
			var response = fetch(binaryFile, { credentials: "same-origin" });
			return await WebAssembly.instantiateStreaming(response, imports);
		} catch (reason) {
			err(`wasm streaming compile failed: ${reason}`);
			err("falling back to ArrayBuffer instantiation");
		}
		return instantiateArrayBuffer(binaryFile, imports);
	}
	function getWasmImports() {
		return { a: wasmImports };
	}
	async function createWasm() {
		function receiveInstance(instance) {
			wasmExports = instance.exports;
			wasmExports = applySignatureConversions(wasmExports);
			assignWasmExports(wasmExports);
			updateMemoryViews();
			return wasmExports;
		}
		function receiveInstantiationResult(result) {
			return receiveInstance(result["instance"]);
		}
		var info = getWasmImports();
		wasmBinaryFile ??= findWasmBinary();
		return receiveInstantiationResult(await instantiateAsync(wasmBinary, wasmBinaryFile, info));
	}
	var HEAP8;
	var __abort_js = () => abort("");
	var getHeapMax = () => 4294901760;
	var alignMemory = (size, alignment) => Math.ceil(size / alignment) * alignment;
	var growMemory = (size) => {
		var pages = (size - wasmMemory.buffer.byteLength + 65535) / 65536 | 0;
		try {
			wasmMemory.grow(pages);
			updateMemoryViews();
			return 1;
		} catch (e) {}
	};
	var HEAPU8;
	function _emscripten_resize_heap(requestedSize) {
		requestedSize >>>= 0;
		var oldSize = HEAPU8.length;
		var maxHeapSize = getHeapMax();
		if (requestedSize > maxHeapSize) return false;
		for (var cutDown = 1; cutDown <= 4; cutDown *= 2) {
			var overGrownHeapSize = oldSize * (1 + .2 / cutDown);
			overGrownHeapSize = Math.min(overGrownHeapSize, requestedSize + 100663296);
			if (growMemory(Math.min(maxHeapSize, alignMemory(Math.max(requestedSize, overGrownHeapSize), 65536)))) return true;
		}
		return false;
	}
	var wasmMemory;
	function assignWasmExports(wasmExports) {
		Module["_arcue_import"] = wasmExports["e"];
		Module["_malloc"] = wasmExports["f"];
		Module["_free"] = wasmExports["g"];
		Module["_arcue_free"] = wasmExports["h"];
		wasmMemory = wasmExports["c"];
		wasmExports["__indirect_function_table"];
	}
	var wasmImports = {
		b: __abort_js,
		a: _emscripten_resize_heap
	};
	function applySignatureConversions(wasmExports) {
		wasmExports = Object.assign({}, wasmExports);
		var makeWrapper_pp = (f) => (a0) => f(a0) >>> 0;
		var makeWrapper_p = (f) => () => f() >>> 0;
		wasmExports["f"] = makeWrapper_pp(wasmExports["f"]);
		wasmExports["_emscripten_stack_alloc"] = makeWrapper_pp(wasmExports["_emscripten_stack_alloc"]);
		wasmExports["emscripten_stack_get_current"] = makeWrapper_p(wasmExports["emscripten_stack_get_current"]);
		return wasmExports;
	}
	async function run() {
		if (ABORT) return;
		initRuntime();
	}
	var wasmExports = await createWasm();
	await run();
	return Module;
}
//#endregion
//#region ../../packages/import-fbx/src/parser.ts
var loading = null;
function loadParser() {
	loading ??= createArcueUfbx().catch((error) => {
		loading = null;
		throw error;
	});
	return loading;
}
/**
* Parses FBX bytes with ufbx in WebAssembly and copies the result out of its memory. Rejects with `FbxParseError` when
* ufbx rejects the file, including when it exceeds the parser's memory limit. Any other failure, such as the module
* running out of memory, discards the module so the next call starts a fresh one.
*/
async function parseFbx(bytes) {
	const parser = await loadParser();
	try {
		const input = parser._malloc(Math.max(bytes.byteLength, 1)) >>> 0;
		if (input === 0) throw new RangeError(`it could not allocate ${bytes.byteLength} bytes for the file`);
		parser.HEAPU8.set(bytes, input);
		const output = parser._arcue_import(input, bytes.byteLength) >>> 0;
		parser._free(input);
		try {
			return readResult(parser.HEAPU8, output);
		} finally {
			parser._arcue_free(output);
		}
	} catch (error) {
		if (error instanceof FbxParseError) throw error;
		loading = null;
		if (error instanceof Error && error.message.startsWith("Aborted")) throw new Error("it ran out of memory", { cause: error });
		throw error;
	}
}
//#endregion
//#region ../../packages/import-fbx/src/textures.ts
function textureName(path) {
	const name = fileNameOf(path);
	const dot = name.lastIndexOf(".");
	return dot > 0 ? name.slice(0, dot) : name;
}
function storedPathOf(file) {
	return parseStoredPath(file.relative).relative ?? file.absolute;
}
function subjectOf(file) {
	return {
		kind: "texture",
		name: fileNameOf(storedPathOf(file)) || fileNameOf(file.relative)
	};
}
/**
* Turns the file's texture paths into scene textures on first use. Embedded images are used as they are; the core
* finds the others through `findFile`. A missing image adds "texture-not-found", and a file that stores only an
* absolute path from the exporting machine adds "texture-path-absolute" even when the image is found by name. A
* texture file that no material links adds "texture-not-used".
*/
function createTextureResolver(files, findFile, locateFile) {
	const textures = [];
	const problems = [];
	const users = /* @__PURE__ */ new Map();
	const uses = /* @__PURE__ */ new Map();
	const resolved = /* @__PURE__ */ new Map();
	const firstOf = async (file, lookUp) => {
		for (const candidate of /* @__PURE__ */ new Set([file.relative, file.absolute])) {
			if (candidate === "") continue;
			const found = await lookUp(candidate);
			if (found !== null) return found;
		}
		return null;
	};
	const load = async (file, index) => {
		const relative = parseStoredPath(file.relative);
		const storedPath = storedPathOf(file);
		const subject = subjectOf(file);
		let bytes = file.content;
		let foundPath = null;
		if (!bytes) {
			if (relative.relative === null && parseStoredPath(file.absolute).absolute) problems.push({
				code: "texture-path-absolute",
				subject,
				message: `Absolute texture path: ${subject.name}`,
				detail: `Stored path: ${file.absolute}`,
				file: index
			});
			const found = await firstOf(file, findFile);
			if (found) {
				bytes = found.bytes;
				foundPath = found.path;
			}
		}
		if (!bytes) {
			problems.push({
				code: "texture-not-found",
				subject,
				message: `Texture not found: ${subject.name}`,
				detail: `Stored path: ${storedPath}`,
				file: index
			});
			return null;
		}
		textures.push({
			name: textureName(storedPath),
			mimeType: imageMimeType(bytes, foundPath ?? storedPath),
			bytes,
			storedPath,
			foundPath
		});
		return textures.length - 1;
	};
	const unusedWarning = async (file) => {
		const subject = subjectOf(file);
		const found = file.content ? null : await firstOf(file, locateFile);
		const stored = `Stored path: ${storedPathOf(file)}`;
		return importWarning("texture-not-used", subject, `Texture not used: ${subject.name}`, void 0, found ? {
			detail: `${stored}, found at ${found}`,
			foundPath: found
		} : { detail: stored });
	};
	return {
		textures,
		storedPath(index) {
			const file = files[index];
			return file ? storedPathOf(file) : "";
		},
		resolve(index, material, slot) {
			const file = files[index];
			if (!file) return Promise.resolve(null);
			const materials = users.get(index) ?? /* @__PURE__ */ new Set();
			materials.add(material);
			users.set(index, materials);
			const slots = uses.get(index) ?? [];
			if (slot && !slots.some((use) => use.material === material && use.slot === slot)) slots.push({
				material,
				slot
			});
			uses.set(index, slots);
			let texture = resolved.get(index);
			if (!texture) {
				texture = load(file, index);
				resolved.set(index, texture);
			}
			return texture;
		},
		async warnings() {
			const warnings = problems.map((problem) => {
				const used = uses.get(problem.file) ?? [];
				return importWarning(problem.code, problem.subject, problem.message, void 0, {
					detail: used.length > 0 ? `${problem.detail}, used as ${describeTextureUses(used)}` : problem.detail,
					materials: [...users.get(problem.file) ?? []],
					uses: used
				});
			});
			for (const [index, file] of files.entries()) if (!file.linked && !resolved.has(index)) warnings.push(await unusedWarning(file));
			return warnings;
		}
	};
}
//#endregion
//#region ../../packages/import-fbx/src/warnings.ts
/** The warning's problem, written before its subject as "problem: subject", and what it means for the preview. */
function describe(warning) {
	switch (warning.code) {
		case "too-many-uv-sets": return {
			problem: "Too many UV sets",
			detail: "Only the first 8 UV sets are kept"
		};
		case "too-many-bones": return {
			problem: "Too many bones",
			detail: "Bones past the first 65534 are dropped"
		};
		case "extra-skins": return {
			problem: "Several skins",
			detail: "Only the first skin is used"
		};
		case "unweighted-vertices": return {
			problem: "Unweighted vertices",
			detail: "Some vertices have no skin weights"
		};
		case "inbetween-shapes": return {
			problem: "In-between shape keys",
			detail: "They show their final shape"
		};
		case "bind-pose-mismatch": return {
			problem: "Bind poses differ",
			detail: "Meshes are bound in different poses; the first one is used"
		};
		case "clip-not-sampled": return warning.detail ? {
			problem: "Clip not sampled",
			detail: warning.detail
		} : { problem: "Clip not sampled" };
		case "left-handed-axes": return {
			problem: "Left-handed axes",
			detail: "The scene is mirrored along X"
		};
		case "invalid-data": return warning.detail ? {
			problem: "Invalid data",
			detail: warning.detail
		} : { problem: "Invalid data" };
	}
}
/** Turns the parser's warnings into import warnings; file-level ones name the asset's file. */
function parserWarnings(warnings, fileName) {
	return warnings.map((warning) => {
		const subject = {
			kind: warning.subjectKind,
			name: warning.subjectKind === "file" ? fileName : warning.subject ?? ""
		};
		const { problem, detail } = describe(warning);
		const message = `${problem}: ${subject.name}`;
		return importWarning(warning.code, subject, message, void 0, detail === void 0 ? {} : { detail });
	});
}
var SCALE_TOLERANCE = .01;
var ROTATION_TOLERANCE_DEGREES = 1;
var MINUS_90_ABOUT_X = [
	-Math.SQRT1_2,
	0,
	0,
	Math.SQRT1_2
];
function near(value, target) {
	return Math.abs(value / target - 1) < SCALE_TOLERANCE;
}
function uniformScale(scale) {
	for (const target of [100, .01]) if (scale.every((component) => near(Math.abs(component), target))) return target;
	return null;
}
function nearRotation(a, b) {
	return Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]) > Math.cos(ROTATION_TOLERANCE_DEGREES * Math.PI / 360);
}
function isRootOrArmature(nodes, index) {
	const node = nodes[index];
	if (!node) return false;
	if (node.parent === -1) return true;
	return node.kind !== "bone" && nodes.some((child) => child.parent === index && child.kind === "bone");
}
/**
* Checks the root and armature nodes' own transforms, before Arcue's unit and axis conversion, for the export bugs
* engines show as a ×100 scale or a −90° rotation about X. A transform that only undoes the file's declared space is
* correct and passes: a scale of 100 in a centimeter file with meter-sized content, or −90° about X that stands Z-up
* content up in a Y-up file, as Blender writes it.
*/
function rootTransformWarnings(nodes, space) {
	const warnings = [];
	for (const [index, node] of nodes.entries()) {
		if (!isRootOrArmature(nodes, index)) continue;
		const subject = {
			kind: "node",
			name: node.name
		};
		const scale = uniformScale(node.fileScale);
		if (scale !== null && !near(scale * space.unitMeters, 1)) warnings.push(importWarning("root-scale", subject, `Root scale x${scale}: ${node.name}`));
		if (space.axes.up !== "+Y" && nearRotation(node.fileRotation, MINUS_90_ABOUT_X)) warnings.push(importWarning("root-rotation", subject, `Root rotated -90° on X: ${node.name}`));
	}
	return warnings;
}
//#endregion
//#region ../../packages/import-fbx/src/importer.ts
function buildNodes(parsed) {
	const paths = buildNodePaths(parsed.nodes);
	return parsed.nodes.map((node, index) => ({
		name: node.name,
		path: paths[index] ?? node.name,
		parent: node.parent,
		kind: node.kind,
		translation: node.translation,
		rotation: node.rotation,
		scale: node.scale,
		mesh: node.mesh
	}));
}
function uvSetIndex(meshes, material, uvSet) {
	if (uvSet === "") return 0;
	for (const mesh of meshes) {
		if (!mesh.groups.some((group) => group.material === material)) continue;
		const index = mesh.uvs.findIndex((uv) => uv.name === uvSet);
		if (index !== -1) return index;
	}
	return 0;
}
async function buildMaterials(materials, meshes, textures) {
	const result = [];
	for (const [index, material] of materials.entries()) {
		const missingTextures = {};
		const ref = async (wire, slot) => {
			if (!wire) return null;
			const texture = await textures.resolve(wire.file, material.name, slot);
			if (texture === null) {
				if (slot) missingTextures[slot] = textures.storedPath(wire.file);
				return null;
			}
			return {
				texture,
				uvSet: uvSetIndex(meshes, index, wire.uvSet),
				wrapU: wire.wrapU,
				wrapV: wire.wrapV,
				transform: wire.transform
			};
		};
		const built = {
			name: material.name,
			baseColor: material.baseColor,
			baseColorTexture: await ref(material.baseColorTexture, "baseColor"),
			metallic: material.metallic,
			roughness: material.roughness,
			metallicRoughnessTexture: null,
			roughnessTexture: await ref(material.roughnessTexture, "roughness"),
			metalnessTexture: await ref(material.metalnessTexture, "metalness"),
			normalTexture: await ref(material.normalTexture, "normal"),
			normalScale: 1,
			occlusionTexture: await ref(material.occlusionTexture),
			emissive: material.emissive,
			emissiveTexture: await ref(material.emissiveTexture, "emissive"),
			alphaMode: material.alphaMode,
			alphaCutoff: .5,
			doubleSided: material.doubleSided
		};
		if (Object.keys(missingTextures).length > 0) built.missingTextures = missingTextures;
		result.push(built);
	}
	return result;
}
function buildClips(clips, fps) {
	const names = clipNames(clips.map((clip) => clip.name));
	const display = displayNames(names);
	return clips.map((clip, index) => {
		const frameCount = frameCountFor(clip.duration, fps);
		return {
			name: names[index] ?? clip.name,
			displayName: display[index] ?? clip.name,
			fps,
			duration: clip.duration,
			frameCount,
			tracks: clip.tracks,
			keyTimes: mergeKeyTimes(clip.curveTimes),
			keyedEveryFrame: isKeyedEveryFrame(clip.curveTimes, fps, frameCount)
		};
	});
}
async function buildScene(parsed, request) {
	const meshes = parsed.meshes.map((mesh) => ({
		...mesh,
		topology: topologyFingerprint(mesh)
	}));
	const textures = createTextureResolver(parsed.textureFiles, request.findFile, request.locateFile);
	const materials = await buildMaterials(parsed.materials, meshes, textures);
	const nodes = buildNodes(parsed);
	const lodGroups = new Set(parsed.nodes.flatMap((node, index) => node.lodGroup ? [index] : []));
	const parts = describeParts(nodes, lodGroups);
	return {
		source: {
			format: "fbx",
			exporter: parsed.exporter,
			fps: parsed.fps,
			originalSpace: parsed.originalSpace,
			conversion: parsed.conversion,
			warnings: [
				...parserWarnings(parsed.warnings, request.fileName),
				...rootTransformWarnings(parsed.nodes, parsed.originalSpace),
				...await textures.warnings()
			]
		},
		nodes,
		meshes,
		skeletons: parsed.skeletons,
		materials,
		textures: textures.textures,
		clips: buildClips(parsed.clips, parsed.fps),
		parts,
		bounds: defaultViewBounds(meshes, parts)
	};
}
async function importFbx(request) {
	let parsed;
	try {
		parsed = await parseFbx(request.bytes);
	} catch (error) {
		if (error instanceof FbxParseError) throw new ArcueError("invalid-input", `${request.fileName} is not a readable FBX file: ${error.message}`, { cause: error });
		const reason = error instanceof Error ? error.message : String(error);
		throw new ArcueError("internal", `The FBX parser failed on ${request.fileName}: ${reason}`, { cause: error });
	}
	return buildScene(parsed, request);
}
var fbxImporter = {
	format: "fbx",
	extensions: [".fbx"],
	import: importFbx
};
//#endregion
//#region ../../packages/import-fbx/src/worker.ts
/**
* The import worker's entry: answers "import.run" for FBX files over `endpoint`. In a browser worker, pass
* `portEndpoint(self)`. In Node, a worker_threads Worker is an EventEmitter whose "message" listener receives the
* value itself rather than an event with `data`, so the host sends the worker one port of a MessageChannel, and both
* sides wrap their port with `portEndpoint`.
*/
function startFbxImportWorker(endpoint) {
	return serveImportWorker(endpoint, [fbxImporter]);
}
//#endregion
//#region ../../packages/platform-node/src/import-worker.ts
parentPort?.once("message", (port) => {
	startFbxImportWorker(portEndpoint(port));
});
//#endregion
export {};
