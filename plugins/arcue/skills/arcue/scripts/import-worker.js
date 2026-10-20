import { Ct as ArcueError, F as unshownUvSetWarnings, G as parseStoredPath, I as frameCountFor, K as fileNameOf, L as isKeyedEveryFrame, Y as topologyFingerprint, et as describeTextureUses, lt as TEXTURE_SLOTS, nt as defaultViewBounds, q as imageMimeType, rt as describeParts, st as TEXTURE_REF_KEYS, t as portEndpoint, tt as importWarning, u as serveImportWorker, ut as TEXTURE_SLOT_KEYS, w as warningId, z as mergeKeyTimes } from "./arcue-CIHJxDUj.js";
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
/**
* The most levels of nodes a scene may nest, far more than real scenes and rigs have. The viewport makes an object for
* each node and walks them with one nested call per level, so importers refuse a deeper scene.
*/
var MAX_NODE_DEPTH$1 = 1024;
/** Whether a node nests more than `MAX_NODE_DEPTH` levels deep, a root being the first level. */
function nestsTooDeep$1(nodes) {
	const levels = new Int32Array(nodes.length);
	for (let index = 0; index < nodes.length; index++) {
		const parent = nodes[index]?.parent ?? -1;
		const level = (parent >= 0 && parent < index ? levels[parent] ?? 0 : 0) + 1;
		if (level > 1024) return true;
		levels[index] = level;
	}
	return false;
}
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
//#region ../../packages/scene/src/textures.ts
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
//#region ../../packages/blend/src/blend/errors.ts
/** The bytes are not a .blend file this reader understands; the message says why. */
var BlendParseError = class extends Error {
	name = "BlendParseError";
};
/** The file is valid but nests deeper than the reader follows; the message says how deep. */
var BlendLimitError = class extends Error {
	name = "BlendLimitError";
};
/** A .blend file that `readBlend` cannot read. */
var BlendReadError = class extends Error {
	name = "BlendReadError";
	reason;
	/**
	* The particular case: why the file is unreadable, such as "its file header is damaged", the version of Blender that
	* saved a file that is too old, such as "2.79", how deep a scene nests, or the message of the error that reading the
	* scene failed with, which `cause` holds.
	*/
	detail;
	constructor(reason, message, detail, options) {
		super(message, options);
		this.reason = reason;
		this.detail = detail;
	}
};
//#endregion
//#region ../../packages/blend/src/blend/ids.ts
/** `Library.flag`: the library holds data-blocks packed into this file, as Blender 5 packs linked data. */
var LIBRARY_ARCHIVE = 1;
/** `ID.flag`: the linked data-block is packed into this file. */
var ID_LINKED_AND_PACKED = 32768;
/** The ID header of a datablock struct, which every datablock starts with. */
function idOf(datablock) {
	return datablock.typeName === "ID" ? datablock : datablock.struct("id");
}
/** A datablock's name without the two-letter type prefix Blender stores, such as "Cube" for "OBCube". */
function idName(datablock) {
	if (!datablock) return "";
	return (idOf(datablock)?.string("name") ?? "").slice(2);
}
/**
* Whether the datablock comes from another .blend file, which this one only links. Data that Blender 5 packs into this
* file with its library is this file's own: the file holds all of it.
*/
function isLinked(datablock) {
	const id = idOf(datablock);
	if (!id || id.pointer("lib") === 0n) return false;
	if (datablock.typeName === "ID") return true;
	if ((id.number("flag") & ID_LINKED_AND_PACKED) !== 0) return false;
	return ((id.deref("lib")?.number("flag") ?? 0) & LIBRARY_ARCHIVE) === 0;
}
/**
* Whether a linked datablock's library is a whole .blend file packed into this one, as Pack Linked Libraries leaves it.
* The reader does not read such a file.
*/
function isInPackedLibrary(datablock) {
	return (idOf(datablock)?.deref("lib")?.pointer("packedfile") ?? 0n) !== 0n;
}
/** The first struct of every block with `code`, such as every object for "OB". */
function datablocks(file, code) {
	return file.blocksWithCode(code).flatMap((block) => {
		const first = file.first(block);
		return first ? [first] : [];
	});
}
//#endregion
//#region ../../packages/blend/src/blend/lists.ts
/**
* The structs of a ListBase member that `seen` does not hold, by struct offset, each added to it. The walk stops at the
* first struct `seen` holds: Blender writes each struct in one list only, so lists that share structs take no longer
* to read than the structs they hold.
*/
function unseenList(owner, name, seen) {
	const base = owner.struct(name);
	const items = [];
	if (!base) return items;
	let from = base;
	for (let address = base.pointer("first"); address !== 0n; address = from.file.pointerAt(from.offset)) {
		const item = from.file.first(from.resolve(address));
		if (!item || item.type.size < item.file.pointerSize || seen.has(item.offset)) break;
		seen.add(item.offset);
		items.push(item);
		from = item;
	}
	return items;
}
/**
* Reads the ListBase member `name` of each owner once, by the owner's offset, as `unseenList` reads it with one `seen`
* for every owner. An owner read again gets the list it got the first time.
*/
function ownedLists(name) {
	const lists = /* @__PURE__ */ new Map();
	const seen = /* @__PURE__ */ new Set();
	return (owner) => {
		let items = lists.get(owner.offset);
		if (!items) {
			items = unseenList(owner, name, seen);
			lists.set(owner.offset, items);
		}
		return items;
	};
}
var fileLists = /* @__PURE__ */ new WeakMap();
/** The owner's ListBase member `name`, read as `ownedLists(name)` reads it, with one reader for each file and name. */
function ownedList(owner, name) {
	let byName = fileLists.get(owner.file);
	if (!byName) {
		byName = /* @__PURE__ */ new Map();
		fileLists.set(owner.file, byName);
	}
	let listOf = byName.get(name);
	if (!listOf) {
		listOf = ownedLists(name);
		byName.set(name, listOf);
	}
	return listOf(owner);
}
//#endregion
//#region ../../packages/blend/src/anim/fcurve.ts
var Interpolation = {
	constant: 0,
	linear: 1,
	bezier: 2,
	back: 3,
	bounce: 4,
	circ: 5,
	cubic: 6,
	elastic: 7,
	expo: 8,
	quad: 9,
	quart: 10,
	quint: 11,
	sine: 12
};
var EASE_AUTO = 0;
var EASE_IN = 1;
var EASE_OUT = 2;
var EASE_IN_OUT = 3;
var FCURVE_MUTED = 16;
var FCURVE_MODIFIERS_OFF = 64;
var ACTION_GROUP_MUTED = 16;
var FCURVE_DISCRETE_VALUES = 4096;
var FCURVE_EXTRAPOLATE_LINEAR = 1;
var FMODIFIER_RANGE_RESTRICTED = 16;
var FMODIFIER_USE_INFLUENCE = 32;
var FMODIFIER_GENERATOR = 1;
var FMODIFIER_BUILT_IN_FUNCTION = 2;
var FMODIFIER_CYCLES = 4;
var FMODIFIER_LIMITS = 8;
var FMODIFIER_STEPPED = 9;
var CYCLES_NONE = 0;
var CYCLES_REPEAT_OFFSET = 2;
var CYCLES_MIRROR = 3;
var STEPPED_NO_BEFORE = 1;
var STEPPED_NO_AFTER = 2;
var LIMIT_MIN_FRAME = 1;
var LIMIT_MAX_FRAME = 2;
var LIMIT_MIN_VALUE = 4;
var LIMIT_MAX_VALUE = 8;
/** The modifiers that give a curve without keys a value, muted or not, as Blender's `BKE_fcurve_is_empty` counts them. */
var VALUE_MODIFIERS = /* @__PURE__ */ new Set([
	FMODIFIER_GENERATOR,
	FMODIFIER_BUILT_IN_FUNCTION,
	FMODIFIER_LIMITS,
	FMODIFIER_STEPPED
]);
var MODIFIER_NAMES = {
	1: "Generator",
	2: "Built-In Function",
	3: "Envelope",
	5: "Noise",
	7: "Python"
};
function emptyKeys(count) {
	return {
		count,
		frame: new Float64Array(count),
		value: new Float64Array(count),
		leftFrame: new Float64Array(count),
		leftValue: new Float64Array(count),
		rightFrame: new Float64Array(count),
		rightValue: new Float64Array(count),
		interpolation: new Uint8Array(count),
		easing: new Uint8Array(count),
		back: new Float32Array(count),
		amplitude: new Float32Array(count),
		period: new Float32Array(count)
	};
}
/** A Cycles mode as Blender's `fcm_cycles_time` plays it, which repeats the keys for a mode it does not know. */
function cyclesMode(mode) {
	if (mode === CYCLES_NONE) return "none";
	if (mode === CYCLES_REPEAT_OFFSET) return "repeat-offset";
	return mode === CYCLES_MIRROR ? "mirror" : "repeat";
}
var sharedReads = /* @__PURE__ */ new WeakMap();
function sharedReadsOf(file) {
	let reads = sharedReads.get(file);
	if (!reads) {
		reads = {
			keys: /* @__PURE__ */ new Map(),
			samples: /* @__PURE__ */ new Map(),
			paths: /* @__PURE__ */ new Map(),
			modifierLists: /* @__PURE__ */ new Map(),
			modifiers: /* @__PURE__ */ new Map(),
			listed: /* @__PURE__ */ new Set()
		};
		sharedReads.set(file, reads);
	}
	return reads;
}
var NO_KEYS = emptyKeys(0);
var NO_MODIFIERS = {
	modifiers: [],
	unsupported: [],
	makesValues: false
};
function modifiersOf(list) {
	const modifiers = [];
	const unsupported = [];
	for (const modifier of list) {
		const flag = modifier.number("flag");
		if ((flag & 9) !== 0) continue;
		const type = modifier.number("type");
		const data = modifier.deref("data");
		const scope = {
			range: (flag & FMODIFIER_RANGE_RESTRICTED) !== 0 ? {
				start: modifier.number("sfra"),
				end: modifier.number("efra"),
				blendIn: modifier.number("blendin"),
				blendOut: modifier.number("blendout")
			} : null,
			influence: (flag & FMODIFIER_USE_INFLUENCE) !== 0 ? modifier.number("influence") : 1
		};
		if (type === FMODIFIER_CYCLES && data) modifiers.push({
			...scope,
			type: "cycles",
			before: cyclesMode(data.number("before_mode")),
			after: cyclesMode(data.number("after_mode")),
			beforeCycles: data.number("before_cycles"),
			afterCycles: data.number("after_cycles")
		});
		else if (type === FMODIFIER_STEPPED && data) {
			const steppedFlag = data.number("flag");
			modifiers.push({
				...scope,
				type: "stepped",
				step: data.number("step_size"),
				offset: data.number("offset"),
				start: data.number("start_frame"),
				end: data.number("end_frame"),
				noBefore: (steppedFlag & STEPPED_NO_BEFORE) !== 0,
				noAfter: (steppedFlag & STEPPED_NO_AFTER) !== 0
			});
		} else if (type === FMODIFIER_LIMITS && data) {
			const rect = data.struct("rect");
			const limitsFlag = data.number("flag");
			const bound = (bit, member) => (limitsFlag & bit) !== 0 ? rect?.number(member) ?? 0 : null;
			modifiers.push({
				...scope,
				type: "limits",
				minFrame: bound(LIMIT_MIN_FRAME, "xmin"),
				maxFrame: bound(LIMIT_MAX_FRAME, "xmax"),
				minValue: bound(LIMIT_MIN_VALUE, "ymin"),
				maxValue: bound(LIMIT_MAX_VALUE, "ymax")
			});
		} else unsupported.push(MODIFIER_NAMES[type] ?? modifier.string("name"));
	}
	return {
		modifiers,
		unsupported,
		makesValues: list.some((modifier) => VALUE_MODIFIERS.has(modifier.number("type")))
	};
}
/**
* The modifier list of a curve or an NLA strip, read once for each list. Blender gives each modifier to one list, so a
* list ends before a modifier that an earlier list read.
*/
function modifierList(owner, reads) {
	const first = owner.struct("modifiers")?.target("first");
	if (!first) return [];
	let list = reads.modifierLists.get(first.index);
	if (!list) {
		list = unseenList(owner, "modifiers", reads.listed);
		reads.modifierLists.set(first.index, list);
	}
	return list;
}
/** The modifiers of a curve's list, read once for each list that curves share. */
function readModifiers(curve, reads) {
	const first = curve.struct("modifiers")?.target("first");
	if (!first) return NO_MODIFIERS;
	let read = reads.modifiers.get(first.index);
	if (!read) {
		read = modifiersOf(modifierList(curve, reads));
		reads.modifiers.set(first.index, read);
	}
	return read;
}
/** Whether a curve or an NLA strip has a modifier that is neither muted nor disabled. */
function hasActiveModifiers(owner) {
	return modifierList(owner, sharedReadsOf(owner.file)).some((modifier) => (modifier.number("flag") & 9) === 0);
}
/** Where a struct holds `count` of `type` under `name`, or -1 where its member is missing or laid out otherwise. */
function memberOffset(struct, name, type, count) {
	const field = struct.field(name);
	return field?.type === type && field.pointerDepth === 0 && field.count === count ? field.offset : -1;
}
/** Reads every BezTriple of a block straight from the file through the struct's member offsets. */
function readBlockKeys(file, block) {
	const type = block.struct;
	const vec = type ? memberOffset(type, "vec", "float", 9) : -1;
	if (!type || vec < 0) return NO_KEYS;
	const { view, little } = file;
	const ipo = memberOffset(type, "ipo", "char", 1);
	const easing = memberOffset(type, "easing", "char", 1);
	const back = memberOffset(type, "back", "float", 1);
	const amplitude = memberOffset(type, "amplitude", "float", 1);
	const period = memberOffset(type, "period", "float", 1);
	const keys = emptyKeys(Math.floor(block.size / type.size));
	const float = (at) => view.getFloat32(at, little);
	for (let i = 0; i < keys.count; i++) {
		const base = block.offset + i * type.size;
		keys.leftFrame[i] = float(base + vec);
		keys.leftValue[i] = float(base + vec + 4);
		keys.frame[i] = float(base + vec + 12);
		keys.value[i] = float(base + vec + 16);
		keys.rightFrame[i] = float(base + vec + 24);
		keys.rightValue[i] = float(base + vec + 28);
		if (ipo >= 0) keys.interpolation[i] = view.getUint8(base + ipo);
		if (easing >= 0) keys.easing[i] = view.getUint8(base + easing);
		if (back >= 0) keys.back[i] = float(base + back);
		if (amplitude >= 0) keys.amplitude[i] = float(base + amplitude);
		if (period >= 0) keys.period[i] = float(base + period);
	}
	return keys;
}
/** The first `count` of `keys`, over the same arrays. */
function firstKeys(keys, count) {
	if (count >= keys.count) return keys;
	return {
		count,
		frame: keys.frame.subarray(0, count),
		value: keys.value.subarray(0, count),
		leftFrame: keys.leftFrame.subarray(0, count),
		leftValue: keys.leftValue.subarray(0, count),
		rightFrame: keys.rightFrame.subarray(0, count),
		rightValue: keys.rightValue.subarray(0, count),
		interpolation: keys.interpolation.subarray(0, count),
		easing: keys.easing.subarray(0, count),
		back: keys.back.subarray(0, count),
		amplitude: keys.amplitude.subarray(0, count),
		period: keys.period.subarray(0, count)
	};
}
/** A curve's first `count` keys, from its BezTriple block as `readBlockKeys` reads it once. */
function readKeys(curve, count, reads) {
	const block = count > 0 ? curve.target("bezt") : null;
	if (!block) return NO_KEYS;
	let keys = reads.keys.get(block.index);
	if (!keys) {
		keys = readBlockKeys(curve.file, block);
		reads.keys.set(block.index, keys);
	}
	return firstKeys(keys, count);
}
function readBlockSamples(file, block) {
	const type = block.struct;
	const vec = type ? memberOffset(type, "vec", "float", 2) : -1;
	if (!type || vec < 0) return null;
	const count = Math.floor(block.size / type.size);
	if (count === 0) return null;
	const { view, little } = file;
	const samples = new Float32Array(count);
	for (let i = 0; i < count; i++) samples[i] = view.getFloat32(block.offset + i * type.size + vec + 4, little);
	return {
		samples,
		start: view.getFloat32(block.offset + vec, little)
	};
}
/** A curve's first `count` samples, from its FPoint block as `readBlockSamples` reads it once. */
function readSamples(curve, count, reads) {
	const block = count > 0 ? curve.target("fpt") : null;
	if (!block) return null;
	let all = reads.samples.get(block.index);
	if (all === void 0) {
		all = readBlockSamples(curve.file, block);
		reads.samples.set(block.index, all);
	}
	if (!all || count >= all.samples.length) return all;
	return {
		samples: all.samples.subarray(0, count),
		start: all.start
	};
}
/** A curve's property path, from its text block as the file decodes it once. */
function readPath(curve, reads) {
	const block = curve.target("rna_path");
	if (!block) return "";
	let path = reads.paths.get(block.index);
	if (path === void 0) {
		path = curve.file.text(block.offset, block.offset + block.size);
		reads.paths.set(block.index, path);
	}
	return path;
}
/**
* Reads an FCurve struct. Curves that share a key, sample or path block, or a modifier list, share what is read from
* it, so the returned curve's arrays are for reading only.
*/
function readFCurve(curve) {
	const reads = sharedReadsOf(curve.file);
	const count = Math.max(curve.number("totvert"), 0);
	const keys = readKeys(curve, count, reads);
	const sampled = keys.count === 0 ? readSamples(curve, count, reads) : null;
	const flag = curve.number("flag");
	const { modifiers, unsupported, makesValues } = readModifiers(curve, reads);
	const modifiersOff = (flag & FCURVE_MODIFIERS_OFF) !== 0;
	return {
		path: readPath(curve, reads),
		index: curve.number("array_index"),
		keys,
		samples: sampled?.samples ?? null,
		sampleStart: sampled?.start ?? 0,
		linearExtrapolation: curve.number("extend") === FCURVE_EXTRAPOLATE_LINEAR,
		discrete: (flag & FCURVE_DISCRETE_VALUES) !== 0,
		muted: (flag & FCURVE_MUTED) !== 0 || ((curve.deref("grp")?.number("flag") ?? 0) & ACTION_GROUP_MUTED) !== 0,
		modifiers: modifiersOff ? [] : modifiers,
		unsupportedModifiers: modifiersOff ? [] : unsupported,
		empty: keys.count === 0 && sampled === null && !makesValues
	};
}
/** Key frames of the curve, or its sample frames. */
function keyFrames(curve) {
	if (curve.keys.count > 0) return Array.from(curve.keys.frame);
	if (curve.samples) return Array.from(curve.samples, (_, index) => curve.sampleStart + index);
	return [];
}
/** The real cube root, negative for negative input, as Blender's `sqrt3d`. */
function cubeRoot(d) {
	if (d === 0) return 0;
	return d < 0 ? -Math.exp(Math.log(-d) / 3) : Math.exp(Math.log(d) / 3);
}
var SMALL = -1e-10;
/** Blender's `solve_cubic`: the first parameter in [0, 1] where c0 + c1 t + c2 t² + c3 t³ = 0, or null. */
function solveCubic(c0, c1, c2, c3) {
	const valid = (value) => {
		const rounded = Math.fround(value);
		return rounded >= SMALL && rounded <= 1.000001 ? rounded : null;
	};
	if (c3 !== 0) {
		let a = c2 / c3;
		const b = c1 / c3;
		const c = c0 / c3;
		a /= 3;
		let p = b / 3 - a * a;
		let q = (2 * a * a * a - a * b + c) / 2;
		const d = q * q + p * p * p;
		if (d > 0) {
			const t = Math.sqrt(d);
			return valid(cubeRoot(-q + t) + cubeRoot(-q - t) - a);
		}
		if (d === 0) {
			const t = cubeRoot(-q);
			return valid(2 * t - a) ?? valid(-t - a);
		}
		const phi = Math.acos(-q / Math.sqrt(-(p * p * p)));
		const t = Math.sqrt(-p);
		p = Math.cos(phi / 3);
		q = Math.sqrt(3 - 3 * p * p);
		return valid(2 * t * p - a) ?? valid(-t * (p + q) - a) ?? valid(-t * (p - q) - a);
	}
	if (c2 !== 0) {
		const p = c1 * c1 - 4 * c2 * c0;
		if (p > 0) {
			const root = Math.sqrt(p);
			return valid((-c1 - root) / (2 * c2)) ?? valid((-c1 + root) / (2 * c2));
		}
		return p === 0 ? valid(-c1 / (2 * c2)) : null;
	}
	if (c1 !== 0) return valid(-c0 / c1);
	return c0 === 0 ? 0 : null;
}
/**
* The Bezier segment from key `a` to key `b` at `frame`, with Blender's `BKE_fcurve_correct_bezpart`, which shortens
* each handle that alone reaches further than the other key so the curve cannot loop. The corrected handles and the
* cubic's coefficients are rounded to single precision as Blender computes them: where handles cross, the root moves
* with that rounding.
*/
function bezierValue(keys, a, b, frame) {
	const f = Math.fround;
	const x1 = keys.frame[a] ?? 0;
	const y1 = keys.value[a] ?? 0;
	let x2 = keys.rightFrame[a] ?? 0;
	let y2 = keys.rightValue[a] ?? 0;
	let x3 = keys.leftFrame[b] ?? 0;
	let y3 = keys.leftValue[b] ?? 0;
	const x4 = keys.frame[b] ?? 0;
	const y4 = keys.value[b] ?? 0;
	const epsilon = 1.1920929e-7;
	if (Math.abs(y1 - y4) < epsilon && Math.abs(y2 - y3) < epsilon && Math.abs(y3 - y4) < epsilon) return y1;
	const h1x = f(x1 - x2);
	const h1y = f(y1 - y2);
	const h2x = f(x4 - x3);
	const h2y = f(y4 - y3);
	const length = f(x4 - x1);
	const length1 = Math.abs(h1x);
	const length2 = Math.abs(h2x);
	if (length1 > length && length1 > 0) {
		const factor = f(length / length1);
		x2 = f(x1 - f(factor * h1x));
		y2 = f(y1 - f(factor * h1y));
	}
	if (length2 > length && length2 > 0) {
		const factor = f(length / length2);
		x3 = f(x4 - f(factor * h2x));
		y3 = f(y4 - f(factor * h2y));
	}
	const t = solveCubic(f(x1 - f(frame)), f(3 * f(x2 - x1)), f(3 * f(f(x1 - 2 * x2) + x3)), f(f(x4 - x1) + f(3 * f(x2 - x3))));
	if (t === null) return 0;
	const c1 = 3 * (y2 - y1);
	const c2 = 3 * (y1 - 2 * y2 + y3);
	const c3 = y4 - y1 + 3 * (y2 - y3);
	return y1 + t * c1 + t * t * c2 + t * t * t * c3;
}
function bounceOut(time, begin, change, duration) {
	let t = time / duration;
	if (t < 1 / 2.75) return change * (7.5625 * t * t) + begin;
	if (t < 2 / 2.75) {
		t -= 1.5 / 2.75;
		return change * (7.5625 * t * t + .75) + begin;
	}
	if (t < 2.5 / 2.75) {
		t -= 2.25 / 2.75;
		return change * (7.5625 * t * t + .9375) + begin;
	}
	t -= 2.625 / 2.75;
	return change * (7.5625 * t * t + .984375) + begin;
}
function bounceIn(time, begin, change, duration) {
	return change - bounceOut(duration - time, 0, change, duration) + begin;
}
function elasticBlend(time, change, duration, amplitude, s, f) {
	if (!change) return f;
	const t = Math.abs(s);
	let factor = amplitude ? f * amplitude / Math.abs(change) : 0;
	if (Math.abs(time * duration) < t) {
		const l = Math.abs(time * duration) / t;
		factor = factor * l + (1 - l);
	}
	return factor;
}
function elastic(mode, time, begin, change, duration, amplitudeIn, periodIn) {
	if (time === 0) return begin;
	let amplitude = amplitudeIn;
	let f = 1;
	let s;
	if (mode === EASE_IN_OUT) {
		let t = time / (duration / 2);
		if (t === 2) return begin + change;
		t -= 1;
		const period = periodIn || duration * (.3 * 1.5);
		if (!amplitude || amplitude < Math.abs(change)) {
			s = period / 4;
			f = elasticBlend(t, change, duration, amplitude, s, f);
			amplitude = change;
		} else s = period / (2 * Math.PI) * Math.asin(change / amplitude);
		const wave = amplitude * 2 ** (10 * (t < 0 ? t : -t)) * Math.sin(((t < 0 ? t : -t) * duration - s) * (2 * Math.PI) / period);
		return t < 0 ? -.5 * f * wave + begin : .5 * f * wave + change + begin;
	}
	let t = time / duration;
	if (t === 1) return begin + change;
	t = mode === EASE_IN ? t - 1 : -t;
	const period = periodIn || duration * .3;
	if (!amplitude || amplitude < Math.abs(change)) {
		s = period / 4;
		f = elasticBlend(t, change, duration, amplitude, s, f);
		amplitude = change;
	} else s = period / (2 * Math.PI) * Math.asin(change / amplitude);
	const wave = amplitude * 2 ** (10 * t) * Math.sin((t * duration - s) * (2 * Math.PI) / period);
	return mode === EASE_IN ? -f * wave + begin : f * wave + change + begin;
}
var POW_MIN = .0009765625;
var POW_SCALE = 1 / .9990234375;
function expoIn(time, begin, change, duration) {
	if (time === 0) return begin;
	return change * (2 ** (10 * (time / duration - 1)) - POW_MIN) * POW_SCALE + begin;
}
function expoOut(time, begin, change, duration) {
	if (time === 0) return begin;
	return change * (1 - (2 ** (-10 * time / duration) - POW_MIN) * POW_SCALE) + begin;
}
/** The polynomial easings: quad, cubic, quart and quint. */
function power(mode, exponent, time, begin, change, duration) {
	const even = exponent % 2 === 0;
	if (mode === EASE_IN) return change * (time / duration) ** exponent + begin;
	if (mode === EASE_OUT) {
		if (exponent === 2) return -change * (time / duration) * (time / duration - 2) + begin;
		const t = time / duration - 1;
		return even ? -change * (t ** exponent - 1) + begin : change * (t ** exponent + 1) + begin;
	}
	let t = time / (duration / 2);
	if (t < 1) return change / 2 * t ** exponent + begin;
	if (exponent === 2) {
		t -= 1;
		return -change / 2 * (t * (t - 2) - 1) + begin;
	}
	t -= 2;
	return even ? -change / 2 * (t ** exponent - 2) + begin : change / 2 * (t ** exponent + 2) + begin;
}
/** Robert Penner's easing equations as Blender's `BLI_easing` implements them, for the segment starting at `key`. */
function eased(keys, key, time, begin, change, duration) {
	const easing = keys.easing[key] ?? EASE_AUTO;
	const mode = (fallback) => easing === EASE_AUTO ? fallback : easing;
	switch (keys.interpolation[key]) {
		case Interpolation.back: {
			const ease = mode(EASE_OUT);
			let overshoot = keys.back[key] ?? 0;
			if (ease === EASE_IN) {
				const t = time / duration;
				return change * t * t * ((overshoot + 1) * t - overshoot) + begin;
			}
			if (ease === EASE_OUT) {
				const t = time / duration - 1;
				return change * (t * t * ((overshoot + 1) * t + overshoot) + 1) + begin;
			}
			overshoot *= 1.525;
			let t = time / (duration / 2);
			if (t < 1) return change / 2 * (t * t * ((overshoot + 1) * t - overshoot)) + begin;
			t -= 2;
			return change / 2 * (t * t * ((overshoot + 1) * t + overshoot) + 2) + begin;
		}
		case Interpolation.bounce: {
			const ease = mode(EASE_OUT);
			if (ease === EASE_IN) return bounceIn(time, begin, change, duration);
			if (ease === EASE_OUT) return bounceOut(time, begin, change, duration);
			if (time < duration / 2) return bounceIn(time * 2, 0, change, duration) * .5 + begin;
			return bounceOut(time * 2 - duration, 0, change, duration) * .5 + change * .5 + begin;
		}
		case Interpolation.circ: {
			const ease = mode(EASE_IN);
			if (ease === EASE_IN) {
				const t = time / duration;
				return -change * (Math.sqrt(1 - t * t) - 1) + begin;
			}
			if (ease === EASE_OUT) {
				const t = time / duration - 1;
				return change * Math.sqrt(1 - t * t) + begin;
			}
			let t = time / (duration / 2);
			if (t < 1) return -change / 2 * (Math.sqrt(1 - t * t) - 1) + begin;
			t -= 2;
			return change / 2 * (Math.sqrt(1 - t * t) + 1) + begin;
		}
		case Interpolation.cubic: return power(mode(EASE_IN), 3, time, begin, change, duration);
		case Interpolation.quad: return power(mode(EASE_IN), 2, time, begin, change, duration);
		case Interpolation.quart: return power(mode(EASE_IN), 4, time, begin, change, duration);
		case Interpolation.quint: return power(mode(EASE_IN), 5, time, begin, change, duration);
		case Interpolation.elastic: return elastic(mode(EASE_OUT), time, begin, change, duration, keys.amplitude[key] ?? 0, keys.period[key] ?? 0);
		case Interpolation.expo: {
			const ease = mode(EASE_IN);
			if (ease === EASE_IN) return expoIn(time, begin, change, duration);
			if (ease === EASE_OUT) return expoOut(time, begin, change, duration);
			const half = duration * .5;
			if (time === 0) return begin;
			if (time === half) return begin + change * .5;
			return time < half ? expoIn(time, begin, change * .5, half) : expoOut(time - half, begin + change * .5, change * .5, half);
		}
		case Interpolation.sine: {
			const ease = mode(EASE_IN);
			if (ease === EASE_IN) return -change * Math.cos(time / duration * (Math.PI / 2)) + change + begin;
			if (ease === EASE_OUT) return change * Math.sin(time / duration * (Math.PI / 2)) + begin;
			return -change / 2 * (Math.cos(Math.PI * time / duration) - 1) + begin;
		}
		default: return begin;
	}
}
function isEqualWithin(a, b, threshold) {
	return a > b ? a - b <= threshold : b - a <= threshold;
}
var KEY_THRESHOLD = 1e-4;
/** Blender's `BKE_fcurve_bezt_binarysearch_index_ex` with its 0.0001 threshold. */
function searchKey(keys, frame) {
	const threshold = KEY_THRESHOLD;
	const count = keys.count;
	const first = keys.frame[0] ?? 0;
	if (isEqualWithin(frame, first, threshold)) return {
		index: 0,
		exact: true
	};
	if (frame < first) return {
		index: 0,
		exact: false
	};
	const last = keys.frame[count - 1] ?? 0;
	if (isEqualWithin(frame, last, threshold)) return {
		index: count - 1,
		exact: true
	};
	if (frame > last) return {
		index: count,
		exact: false
	};
	let start = 0;
	let end = count;
	for (let loop = 0; start <= end && loop < count * 2; loop++) {
		const middle = start + Math.floor((end - start) / 2);
		const value = keys.frame[middle] ?? 0;
		if (isEqualWithin(frame, value, threshold)) return {
			index: middle,
			exact: true
		};
		if (frame > value) start = middle + 1;
		else if (frame < value) end = middle - 1;
	}
	return {
		index: start,
		exact: false
	};
}
function extrapolate(curve, endpoint, neighbor, frame, side) {
	const keys = curve.keys;
	const value = keys.value[endpoint] ?? 0;
	const interpolation = keys.interpolation[endpoint];
	if (interpolation === Interpolation.constant || !curve.linearExtrapolation) return value;
	const dx = (keys.frame[endpoint] ?? 0) - frame;
	if (interpolation === Interpolation.linear) {
		if (keys.count === 1) return value;
		const span = (keys.frame[neighbor] ?? 0) - (keys.frame[endpoint] ?? 0);
		if (span === 0) return value;
		return value - ((keys.value[neighbor] ?? 0) - value) / span * dx;
	}
	const handleFrame = side === "left" ? keys.leftFrame[endpoint] : keys.rightFrame[endpoint];
	const handleValue = side === "left" ? keys.leftValue[endpoint] : keys.rightValue[endpoint];
	const span = (keys.frame[endpoint] ?? 0) - (handleFrame ?? 0);
	if (span === 0) return value;
	return value - (value - (handleValue ?? 0)) / span * dx;
}
/** Blender's `fcurve_eval_keyframes`. */
function evaluateKeys(curve, frame, search) {
	const keys = curve.keys;
	const last = keys.count - 1;
	if (last < 0) return 0;
	if (frame <= (keys.frame[0] ?? 0)) return extrapolate(curve, 0, 1, frame, "left");
	if ((keys.frame[last] ?? 0) <= frame) return extrapolate(curve, last, last - 1, frame, "right");
	const { index, exact } = search(keys, frame);
	if (index > last) return keys.value[last] ?? 0;
	if (exact) return keys.value[index] ?? 0;
	const previous = index > 0 ? index - 1 : index;
	if (Math.abs((keys.frame[index] ?? 0) - frame) < 1e-8) return keys.value[index] ?? 0;
	const startFrame = keys.frame[previous] ?? 0;
	const endFrame = keys.frame[index] ?? 0;
	if (frame < startFrame || endFrame < frame) return 0;
	const begin = keys.value[previous] ?? 0;
	const change = (keys.value[index] ?? 0) - begin;
	const duration = endFrame - startFrame;
	const time = frame - startFrame;
	const interpolation = keys.interpolation[previous];
	if (interpolation === Interpolation.constant || curve.discrete || duration === 0) return begin;
	if (interpolation === Interpolation.bezier) return bezierValue(keys, previous, index, frame);
	if (interpolation === Interpolation.linear) return change * time / duration + begin;
	return eased(keys, previous, time, begin, change, duration);
}
function evaluateSamples(samples, start, frame) {
	const count = samples.length;
	if (frame <= start) return samples[0] ?? 0;
	if (frame >= start + count - 1) return samples[count - 1] ?? 0;
	const fraction = Math.abs(frame - Math.floor(frame));
	const index = Math.floor(frame) - Math.floor(start);
	const value = samples[index] ?? 0;
	if (fraction !== 0 && fraction < 1) return value + ((samples[index + 1] ?? value) - value) * fraction;
	return value;
}
function rawValue(curve, frame, search = searchKey) {
	if (curve.keys.count > 0) return evaluateKeys(curve, frame, search);
	if (curve.samples) return evaluateSamples(curve.samples, curve.sampleStart, frame);
	return 0;
}
function curveRange(curve) {
	const keys = curve.keys;
	if (keys.count > 0) return [keys.frame[0] ?? 0, keys.frame[keys.count - 1] ?? 0];
	if (curve.samples && curve.samples.length > 0) return [curve.sampleStart, curve.sampleStart + curve.samples.length - 1];
	return null;
}
/** Blender's `fcm_cycles_time`: where in the keyed range a frame outside it repeats, and the value offset to add. */
function cyclesTime(curve, modifier, frame) {
	const range = curveRange(curve);
	if (!range) return {
		frame,
		offset: 0
	};
	const [startFrame, endFrame] = range;
	let side = 0;
	let mode = "none";
	let cycles = 0;
	let origin = 0;
	if (frame < startFrame && modifier.before !== "none") {
		side = -1;
		mode = modifier.before;
		cycles = modifier.beforeCycles;
		origin = startFrame;
	} else if (frame > endFrame && modifier.after !== "none") {
		side = 1;
		mode = modifier.after;
		cycles = modifier.afterCycles;
		origin = endFrame;
	}
	if (side === 0 || mode === "none") return {
		frame,
		offset: 0
	};
	const period = endFrame - startFrame;
	if (period === 0) return {
		frame,
		offset: 0
	};
	const cycle = side * (frame - origin) / period;
	const within = (frame - origin) % period;
	if (cycles !== 0 && cycle > cycles) return {
		frame,
		offset: 0
	};
	let offset = 0;
	if (mode === "repeat-offset") offset = (side < 0 ? Math.floor((frame - origin) / period) : Math.ceil((frame - origin) / period)) * (rawValue(curve, endFrame) - rawValue(curve, startFrame));
	let time;
	if (within === 0) {
		time = side === 1 ? endFrame : startFrame;
		if (mode === "mirror" && Math.trunc(cycle) % 2) time = side === 1 ? startFrame : endFrame;
	} else if (mode === "mirror" && Math.trunc(cycle + 1) % 2) time = side < 0 ? startFrame - within : endFrame - within;
	else time = startFrame + within;
	if (time < startFrame) time += period;
	return {
		frame: time,
		offset
	};
}
function inRange(modifier, frame) {
	const { range } = modifier;
	return range === null || range.start <= frame && frame <= range.end;
}
/** Blender's `eval_fmodifier_influence`: the modifier's influence, ramped over its blend frames. */
function influenceAt(modifier, frame) {
	const { range, influence } = modifier;
	if (range === null) return influence;
	if (frame < range.start || frame > range.end) return 0;
	if (range.blendIn !== 0 && frame <= range.start + range.blendIn) return influence * (frame - range.start) / range.blendIn;
	if (range.blendOut !== 0 && frame >= range.end - range.blendOut) return influence * (range.end - frame) / range.blendOut;
	return influence;
}
function mix$1(target, origin, factor) {
	return factor * target + (1 - factor) * origin;
}
/**
* The curve's value at a frame, with its Cycles, Stepped and Limits modifiers applied as Blender's
* `evaluate_fcurve_ex` does: time modifiers last to first, then the curve, then value modifiers first to last.
*/
function evaluateFCurve(curve, frame) {
	return evaluateWith(curve, frame, searchKey);
}
function evaluateWith(curve, frame, search) {
	let time = frame;
	let offset = 0;
	for (let i = curve.modifiers.length - 1; i >= 0; i--) {
		const modifier = curve.modifiers[i];
		if (!modifier || !inRange(modifier, time)) continue;
		let target = time;
		if (modifier.type === "cycles") {
			if (i !== 0) continue;
			const cycled = cyclesTime(curve, modifier, time);
			target = cycled.frame;
			offset = cycled.offset;
		} else if (modifier.type === "stepped") {
			if (modifier.step === 0) continue;
			if (modifier.noBefore && time < modifier.start || modifier.noAfter && time > modifier.end) continue;
			target = Math.trunc((time - modifier.offset) / modifier.step) * modifier.step + modifier.offset;
		} else if (modifier.minFrame !== null && time < modifier.minFrame) target = modifier.minFrame;
		else if (modifier.maxFrame !== null && time > modifier.maxFrame) target = modifier.maxFrame;
		time = mix$1(target, time, influenceAt(modifier, time));
	}
	let value = rawValue(curve, time, search);
	curve.modifiers.forEach((modifier, i) => {
		if (!inRange(modifier, time)) return;
		let target = value;
		if (modifier.type === "cycles") {
			if (i !== 0) return;
			target = value + offset;
		} else if (modifier.type === "limits") {
			if (modifier.minValue !== null) target = Math.max(target, modifier.minValue);
			if (modifier.maxValue !== null) target = Math.min(target, modifier.maxValue);
		} else return;
		value = mix$1(target, value, influenceAt(modifier, time));
	});
	return value;
}
/** The least gap between keys, and the farthest frame, for which `searchBetween` finds what `searchKey` does. */
var SPREAD_KEYS = 3 * KEY_THRESHOLD;
var FARTHEST_KEY = 1e6;
/**
* What `searchKey` finds for a frame from the key before it up to the key `index`, for keys in order and spread so
* that at most one is within its threshold of any frame; null for a frame outside them.
*/
function searchBetween(keys, frame, index) {
	if (index < 1 || index >= keys.count) return null;
	const before = keys.frame[index - 1] ?? 0;
	const after = keys.frame[index] ?? 0;
	if (!(before <= frame && frame < after)) return null;
	if (isEqualWithin(frame, before, KEY_THRESHOLD)) return {
		index: index - 1,
		exact: true
	};
	return {
		index,
		exact: isEqualWithin(frame, after, KEY_THRESHOLD)
	};
}
/**
* The curve's value at a frame as `evaluateFCurve` gives it, for frames that mostly increase: each key search starts
* at the key the last one found, when the keys are spread far enough apart for that to find the same key.
*/
function curveEvaluator(curve) {
	const { count, frame } = curve.keys;
	let spread = Math.abs(frame[0] ?? 0) < FARTHEST_KEY && Math.abs(frame[count - 1] ?? 0) < FARTHEST_KEY;
	for (let i = 1; i < count && spread; i++) spread = (frame[i] ?? 0) - (frame[i - 1] ?? 0) > SPREAD_KEYS;
	if (!spread) return (time) => evaluateFCurve(curve, time);
	let last = 1;
	const search = (keys, time) => {
		const found = searchBetween(keys, time, last) ?? searchBetween(keys, time, last + 1) ?? searchKey(keys, time);
		last = found.index;
		return found;
	};
	return (time) => evaluateWith(curve, time, search);
}
/** The Cycles modifier that repeats the curve's keys: Blender applies one only as the first modifier. */
function cyclesOf(curve) {
	const [first] = curve.modifiers;
	return first?.type === "cycles" ? first : null;
}
/**
* Whether a Stepped modifier has a step a frame or more long that starts between `start` and `end` and before its
* offset. Blender rounds toward the offset, so such a step starts just after its first frame.
*/
function stepsBeforeOffset(modifier, start, end) {
	if (!(modifier.step >= 1)) return false;
	const from = modifier.noBefore ? Math.max(start, modifier.start) : start;
	const to = Math.min(end, modifier.offset - modifier.step, modifier.noAfter ? modifier.end : end);
	const latest = modifier.offset - Math.ceil((modifier.offset - to) / modifier.step) * modifier.step;
	return to >= from && latest >= from;
}
/** The Cycles modifier's period when it repeats the keys on `side` and a cycle starts at another value than it ends. */
function jumpingPeriod(curve, side) {
	const cycles = cyclesOf(curve);
	const range = curveRange(curve);
	if (cycles?.[side] !== "repeat" || !range) return null;
	const [first, last] = range;
	const period = last - first;
	if (!(period > 0) || rawValue(curve, first) === rawValue(curve, last)) return null;
	return {
		first,
		period
	};
}
/**
* Whether a Cycles modifier repeats the keys after the last one from `start` up to `end`, with a cycle that ends at or
* after `start` and before `end` and starts again at another value. A cycle that ends where it starts does not, nor
* does repeating with an offset, which goes on from the value the cycle ends at. Mirroring turns back from that value,
* which `mirrorsHeldSegments` covers.
*/
function cycleEndsBetween(curve, start, end) {
	const cycled = jumpingPeriod(curve, "after");
	if (!cycled) return false;
	const { first, period } = cycled;
	return first + Math.max(1, Math.ceil((start - first) / period)) * period < end;
}
/**
* Whether a Cycles modifier repeats the keys before the first one from `start` up to `end`, with a cycle that starts
* after `start` and at or before `end` at another value than the one before it ends. Blender evaluates the first frame
* of such a cycle at the first key and the time just before it near the last key.
*/
function cycleStartsBetween(curve, start, end) {
	const cycled = jumpingPeriod(curve, "before");
	if (!cycled) return false;
	const { first, period } = cycled;
	return first - Math.max(0, Math.ceil((first - end) / period)) * period > start;
}
/**
* Whether the value can jump at a frame between `start` and `end`, leaving the value from before just before it: at a
* key after a constant or discrete segment, at a step of a Stepped modifier a frame or more long, where a modifier's
* frame range starts, or where a Cycles modifier starts a cycle before the first key. Steps shorter than a frame are
* left to interpolation between frames.
*/
function canJump(curve, start, end) {
	return curve.modifiers.some((modifier) => modifier.range !== null || modifier.type === "stepped" && modifier.step >= 1) || cycleStartsBetween(curve, start, end) || holdsSegments(curve);
}
/** Whether the curve holds a key's value up to the next key: it is discrete or has a constant segment. */
function holdsSegments(curve) {
	if (curve.discrete) return true;
	const { count, interpolation } = curve.keys;
	for (let i = 0; i < count - 1; i++) if (interpolation[i] === Interpolation.constant) return true;
	return false;
}
/**
* Whether a Cycles modifier mirrors keys that hold their value up to the next key, on a side that reaches between
* `start` and `end`. Mirrored, time runs back through such a segment, so the next key's value shows only at its own
* frame and the held value follows just after it.
*/
function mirrorsHeldSegments(curve, start, end) {
	const cycles = cyclesOf(curve);
	const range = curveRange(curve);
	if (!cycles || !range || !holdsSegments(curve)) return false;
	return cycles.after === "mirror" && end > range[1] || cycles.before === "mirror" && start < range[0];
}
/**
* Whether the value can jump just after a frame between `start` and `end`, keeping the value from before at that frame
* itself: at the end of a cycle of a Cycles modifier, at a key it mirrors after a held segment, at the end of a
* modifier's frame range, where a Stepped modifier stops, or at a step of a Stepped modifier before its offset.
*/
function canJumpAfter(curve, start, end) {
	if (cycleEndsBetween(curve, start, end) || mirrorsHeldSegments(curve, start, end)) return true;
	return curve.modifiers.some((modifier) => modifier.range !== null || modifier.type === "stepped" && (modifier.noAfter || stepsBeforeOffset(modifier, start, end)));
}
/**
* Adds where the frames of `within`, relative to the first key, repeat over `start` to `end` under a Cycles modifier,
* until `add` refuses one. False when it does.
*/
function addCycledFrames(curve, within, start, end, add) {
	const cycles = cyclesOf(curve);
	const range = curveRange(curve);
	if (!cycles || !range) return true;
	const [first, last] = range;
	const period = last - first;
	if (!(period >= 1)) return true;
	const offsets = /* @__PURE__ */ new Set([0, ...within.map((frame) => frame - first)]);
	if (cycles.before === "mirror" || cycles.after === "mirror") for (const offset of [...offsets]) offsets.add(period - offset);
	const lastCycle = Math.ceil((end - first) / period);
	for (let n = Math.floor((start - first) / period); n <= lastCycle; n++) for (const offset of offsets) if (!add(first + n * period + offset)) return false;
	return true;
}
/**
* Frames strictly between `start` and `end` where the curve may jump, each once: its keys after constant or discrete
* segments and where a Cycles modifier repeats them, the ends of its cycles, the steps of its Stepped modifiers that
* are at least a frame apart, and the ends of its modifiers' frame ranges. Null when there are more than `limit`. As
* each frame counts once, jumps on whole frames alone number at most the whole frames inside the range.
*/
function jumpFrames(curve, start, end, limit) {
	const frames = /* @__PURE__ */ new Set();
	const add = (frame) => {
		if (frame > start && frame < end) frames.add(frame);
		return frames.size <= limit;
	};
	const keyed = [];
	const { count, frame, interpolation } = curve.keys;
	for (let i = 1; i < count; i++) if (curve.discrete || interpolation[i - 1] === Interpolation.constant) keyed.push(frame[i] ?? 0);
	if (!keyed.every(add) || !addCycledFrames(curve, keyed, start, end, add)) return null;
	for (const modifier of curve.modifiers) {
		if (modifier.range && !(add(modifier.range.start) && add(modifier.range.end))) return null;
		if (modifier.type !== "stepped" || !(modifier.step >= 1)) continue;
		const from = modifier.noBefore ? Math.max(start, modifier.start) : start;
		const to = modifier.noAfter ? Math.min(end, modifier.end) : end;
		if (modifier.noBefore && !add(modifier.start) || modifier.noAfter && !add(modifier.end)) return null;
		const last = Math.floor((to - modifier.offset) / modifier.step);
		for (let n = Math.ceil((from - modifier.offset) / modifier.step); n <= last; n++) if (!add(modifier.offset + n * modifier.step)) return null;
	}
	return [...frames];
}
//#endregion
//#region ../../packages/blend/src/anim/actions.ts
/** Blender's two-letter ID codes as the `idtype` and `idroot` members store them. */
var IdCode = {
	object: 16975,
	shapeKey: 17739
};
var NLATRACK_SOLO = 8;
var NLATRACK_DISABLED = 1024;
var ACTION_FRAME_RANGE = 4096;
var KEYFRAME_STRIP = 0;
/**
* The structs an array of `count` pointers points at, without those `claimed` holds, each added to it. The array
* itself is claimed too, so an array that another struct also points at points at nothing the second time.
*/
function pointedStructs(owner, array, count, claimed) {
	const block = owner.target(array);
	const structs = [];
	if (!block || claimed.has(block.offset)) return structs;
	claimed.add(block.offset);
	const { file } = owner;
	const length = Math.min(Math.max(owner.number(count), 0), Math.floor(block.size / file.pointerSize));
	for (let index = 0; index < length; index++) {
		const struct = file.first(owner.resolve(file.pointerAt(block.offset + index * file.pointerSize)));
		if (!struct || claimed.has(struct.offset)) continue;
		claimed.add(struct.offset);
		structs.push(struct);
	}
	return structs;
}
/** The struct that the `index`th of an array of `count` pointers points at, or null. */
function pointedStruct(owner, array, count, index) {
	const block = owner.target(array);
	const { file } = owner;
	if (!block || index < 0 || index >= owner.number(count) || (index + 1) * file.pointerSize > block.size) return null;
	return file.first(owner.resolve(file.pointerAt(block.offset + index * file.pointerSize)));
}
/**
* The slots of a layered action, each with the curves of the channelbags its handle names, or null for a legacy one. Of
* the slots that share a handle, only the first is kept, the one Blender's `slot_for_handle` finds.
*/
function layeredSlots(action, claimed) {
	if (!action.has("layer_array") || action.number("layer_array_num") <= 0) return null;
	const slots = pointedStructs(action, "slot_array", "slot_array_num", claimed);
	const curvesBySlot = /* @__PURE__ */ new Map();
	const layer = pointedStruct(action, "layer_array", "layer_array_num", 0);
	for (const strip of layer ? pointedStructs(layer, "strip_array", "strip_array_num", claimed) : []) {
		if (strip.number("strip_type") !== KEYFRAME_STRIP) continue;
		const data = pointedStruct(action, "strip_keyframe_data_array", "strip_keyframe_data_array_num", strip.number("data_index"));
		if (!data || claimed.has(data.offset)) continue;
		claimed.add(data.offset);
		for (const bag of pointedStructs(data, "channelbag_array", "channelbag_array_num", claimed)) {
			const handle = bag.number("slot_handle");
			let curves = curvesBySlot.get(handle);
			if (!curves) {
				curves = [];
				curvesBySlot.set(handle, curves);
			}
			for (const curve of pointedStructs(bag, "fcurve_array", "fcurve_array_num", claimed)) curves.push(readFCurve(curve));
		}
	}
	const handles = /* @__PURE__ */ new Set();
	return slots.flatMap((slot) => {
		const handle = slot.number("handle");
		if (handles.has(handle)) return [];
		handles.add(handle);
		return [{
			handle,
			identifier: slot.string("name") || slot.string("identifier"),
			idType: slot.number("idtype"),
			curves: curvesBySlot.get(handle) ?? []
		}];
	});
}
/**
* Reads an action. Its slots, strips, keyframe data, channelbags and curves that `claimed` holds, as another action's,
* are left out, and the rest are added to it.
*/
function readAction(action, claimed) {
	const layered = layeredSlots(action, claimed);
	const slots = layered ?? [{
		handle: -1,
		identifier: "",
		idType: action.number("idroot"),
		curves: unseenList(action, "curves", claimed).map(readFCurve)
	}];
	const manual = (action.number("flag") & ACTION_FRAME_RANGE) !== 0;
	return {
		struct: action,
		name: idName(action),
		slots,
		manualRange: manual ? [action.number("frame_start"), action.number("frame_end")] : null,
		layers: layered ? action.number("layer_array_num") : 0
	};
}
/**
* The slot that an animation data's slot handle plays. A legacy action has no slots, so its curves play for any handle;
* a layered action plays nothing for a handle that none of its slots has.
*/
function slotFor(action, handle) {
	const [only] = action.slots;
	if (action.slots.length === 1 && only?.handle === -1) return only;
	return action.slots.find((slot) => slot.handle === handle);
}
/**
* Every action the file holds, in file order, without linked ones. Blender gives each curve, and each slot, strip,
* keyframe data and channelbag of a layered action, to one action and lists it there once, so one that the file lists
* again is read only where it is first listed.
*/
function readActions(file) {
	const claimed = /* @__PURE__ */ new Set();
	return datablocks(file, "AC").filter((action) => !isLinked(action)).map((action) => readAction(action, claimed));
}
/** Blender's `BKE_action_frame_range_get`: the manual range or the keys' range, at least one frame long. */
function actionRange(action) {
	let start;
	let end;
	if (action.manualRange) [start, end] = action.manualRange;
	else {
		start = Number.POSITIVE_INFINITY;
		end = Number.NEGATIVE_INFINITY;
		for (const slot of action.slots) for (const curve of slot.curves) {
			const frames = keyFrames(curve);
			if (frames.length === 0) continue;
			start = Math.min(start, frames[0] ?? start);
			end = Math.max(end, frames[frames.length - 1] ?? end);
		}
		if (!Number.isFinite(start) || !Number.isFinite(end)) {
			start = 0;
			end = 0;
		}
	}
	if (start >= end) end = start + 1;
	return [start, end];
}
/** The actions, slots and drivers an ID's animation data uses: its active action, stashed action and NLA strips. */
function animationUses(id) {
	const adt = id.deref("adt");
	if (!adt) return {
		id,
		uses: [],
		drivers: []
	};
	return {
		id,
		uses: usedActions(id).map(({ action, slot, played }) => ({
			action: action.offset,
			slot,
			played
		})),
		drivers: adt.list("drivers").map(readFCurve)
	};
}
/**
* Blender's `is_nlatrack_evaluatable`: whether an NLA track plays. The soloed track plays while one is, any unmuted
* track otherwise, and in tweak mode no track that it disables but the tweaked one.
*/
function trackPlays(flag, track, tweaked) {
	const trackFlag = track.number("flag");
	if ((trackFlag & 1024) !== 0 && !tweaked) return false;
	if ((flag & 1) !== 0) return (trackFlag & NLATRACK_SOLO) !== 0;
	return (trackFlag & 4) === 0;
}
/** The slot handle an animation data or NLA strip stores in `field`, or -1 where the file has none. */
function slotHandle(owner, field) {
	return owner.has(field) ? owner.number(field) : -1;
}
/**
* The actions an ID's animation data uses, as its active, stashed and NLA strip actions, with their slot handles, in
* the order Blender lets those it plays override one another: the action it plays over the NLA first, then an upper
* track before a lower one. `played` says whether Blender plays the use, as `animsys_evaluate_nla_for_flush` decides.
* With the NLA off, only the active action plays. Otherwise the active action, or in tweak mode the stashed one, plays
* over the tracks unless a track plays solo or tweak mode leaves out the tracks above the tweaked one. A strip plays
* unless it or its track is muted, a soloed track or tweak mode leaves its track out, or it shares the tweaked track
* with the tweaked strip.
*/
function usedActions(id) {
	const adt = id.deref("adt");
	const uses = [];
	if (!adt) return uses;
	const flag = adt.number("flag");
	const tracks = adt.list("nla_tracks");
	const nla = tracks.length > 0 && (flag & 2) === 0;
	const tweaking = (flag & 4) !== 0;
	const upper = !tweaking || (flag & 32) !== 0;
	const overNla = nla && (flag & 1) === 0 && upper;
	const add = (action, slot, played, strip) => {
		if (action) uses.push({
			action,
			slot,
			played,
			strip
		});
	};
	add(adt.deref("action"), slotHandle(adt, "slot_handle"), !nla || !tweaking && overNla, null);
	add(adt.deref("tmpact"), slotHandle(adt, "tmp_slot_handle"), tweaking && overNla, null);
	const seen = /* @__PURE__ */ new Set();
	const visitStrips = (top, track, played) => {
		const pending = [{
			strip: top,
			played
		}];
		for (let next = pending.pop(); next; next = pending.pop()) {
			const { strip } = next;
			const plays = next.played && (strip.number("flag") & 4096) === 0;
			add(strip.deref("act"), slotHandle(strip, "action_slot_handle"), plays, {
				strip,
				track
			});
			for (const inner of unseenList(strip, "strips", seen).reverse()) pending.push({
				strip: inner,
				played: plays
			});
		}
	};
	const tweakedTrack = tweaking ? adt.deref("act_track")?.offset : void 0;
	const tweakedStrip = adt.deref("actstrip")?.offset;
	for (const track of tracks.reverse()) {
		const tweaked = track.offset === tweakedTrack;
		const plays = nla && trackPlays(flag, track, tweaked);
		for (const strip of unseenList(track, "strips", seen)) visitStrips(strip, track, plays && (!tweaked || strip.offset === tweakedStrip));
	}
	return uses;
}
/**
* Every property path an ID's own animation animates, such as `constraints["Follow"].influence`: the unmuted curves of
* the action slots it plays, from `actions` by struct offset, and its unmuted drivers.
*/
function animatedPaths(id, actions) {
	const paths = /* @__PURE__ */ new Set();
	const { uses, drivers } = animationUses(id);
	for (const use of uses) {
		const action = use.played ? actions.get(use.action) : void 0;
		const slot = action ? slotFor(action, use.slot) : void 0;
		for (const curve of slot?.curves ?? []) if (!curve.muted && !curve.empty) paths.add(curve.path);
	}
	for (const driver of drivers) if (!driver.muted) paths.add(driver.path);
	return paths;
}
/** A bone name in a `pose.bones["Name"]` path, with Blender's escapes undone, and the property after it. */
function parsePosePath(path) {
	const match = /^pose\.bones\["((?:[^"\\]|\\.)*)"\]\.([a-z_]+)$/.exec(path);
	if (!match?.[1] || !match[2]) return null;
	return {
		bone: match[1].replace(/\\(.)/g, "$1"),
		property: match[2]
	};
}
/** A shape key name in a `key_blocks["Name"].value` path, with Blender's escapes undone. */
function parseShapeKeyPath(path) {
	const match = /^key_blocks\["((?:[^"\\]|\\.)*)"\]\.value$/.exec(path);
	return match?.[1] ? match[1].replace(/\\(.)/g, "$1") : null;
}
//#endregion
//#region ../../packages/blend/src/math.ts
function identity() {
	return Float64Array.of(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
}
/** A matrix from 16 numbers in Blender's order; anything else is the identity. */
function mat4From(values) {
	return values.length === 16 && values.every(Number.isFinite) ? Float64Array.from(values) : identity();
}
/** `a × b`, written into `out`, which must not be `a` or `b`. */
function multiply(a, b, out = /* @__PURE__ */ new Float64Array(16)) {
	for (let column = 0; column < 4; column++) for (let row = 0; row < 4; row++) {
		let sum = 0;
		for (let k = 0; k < 4; k++) sum += (a[k * 4 + row] ?? 0) * (b[column * 4 + k] ?? 0);
		out[column * 4 + row] = sum;
	}
	return out;
}
/** `a × b × c × …`, left to right. */
function multiplyAll(...matrices) {
	return matrices.reduce((product, matrix) => multiply(product, matrix), identity());
}
/** The inverse of an affine matrix; a singular one inverts to the identity. */
function invert(m) {
	const at = (index) => m[index] ?? 0;
	const [a, b, c, d, e, f, g, h, i] = [
		at(0),
		at(1),
		at(2),
		at(4),
		at(5),
		at(6),
		at(8),
		at(9),
		at(10)
	];
	const det = a * (e * i - f * h) - d * (b * i - c * h) + g * (b * f - c * e);
	if (!Number.isFinite(det) || Math.abs(det) < 1e-30) return identity();
	const r = 1 / det;
	const out = /* @__PURE__ */ new Float64Array(16);
	out[0] = (e * i - f * h) * r;
	out[1] = (c * h - b * i) * r;
	out[2] = (b * f - c * e) * r;
	out[4] = (f * g - d * i) * r;
	out[5] = (a * i - c * g) * r;
	out[6] = (c * d - a * f) * r;
	out[8] = (d * h - e * g) * r;
	out[9] = (b * g - a * h) * r;
	out[10] = (a * e - b * d) * r;
	const [tx, ty, tz] = [
		at(12),
		at(13),
		at(14)
	];
	out[12] = -((out[0] ?? 0) * tx + (out[4] ?? 0) * ty + (out[8] ?? 0) * tz);
	out[13] = -((out[1] ?? 0) * tx + (out[5] ?? 0) * ty + (out[9] ?? 0) * tz);
	out[14] = -((out[2] ?? 0) * tx + (out[6] ?? 0) * ty + (out[10] ?? 0) * tz);
	out[15] = 1;
	return out;
}
function translation(x, y, z) {
	const m = identity();
	m[12] = x;
	m[13] = y;
	m[14] = z;
	return m;
}
function determinant3(m) {
	const at = (index) => m[index] ?? 0;
	return at(0) * (at(5) * at(10) - at(6) * at(9)) - at(4) * (at(1) * at(10) - at(2) * at(9)) + at(8) * (at(1) * at(6) - at(2) * at(5));
}
function transformPoint(m, x, y, z) {
	const at = (index) => m[index] ?? 0;
	return [
		at(0) * x + at(4) * y + at(8) * z + at(12),
		at(1) * x + at(5) * y + at(9) * z + at(13),
		at(2) * x + at(6) * y + at(10) * z + at(14)
	];
}
function transformDirection(m, x, y, z) {
	const at = (index) => m[index] ?? 0;
	return [
		at(0) * x + at(4) * y + at(8) * z,
		at(1) * x + at(5) * y + at(9) * z,
		at(2) * x + at(6) * y + at(10) * z
	];
}
/** Scale of each axis column. */
function axisLengths(m) {
	const at = (index) => m[index] ?? 0;
	return [
		Math.hypot(at(0), at(1), at(2)),
		Math.hypot(at(4), at(5), at(6)),
		Math.hypot(at(8), at(9), at(10))
	];
}
function quatMultiply(a, b) {
	const [ax, ay, az, aw] = a;
	const [bx, by, bz, bw] = b;
	return [
		aw * bx + ax * bw + ay * bz - az * by,
		aw * by - ax * bz + ay * bw + az * bx,
		aw * bz + ax * by - ay * bx + az * bw,
		aw * bw - ax * bx - ay * by - az * bz
	];
}
/** A unit quaternion; a zero one becomes the identity, as Blender normalizes it. */
function quatNormalize(q) {
	const length = Math.hypot(q[0], q[1], q[2], q[3]);
	if (!(length > 1e-12) || !Number.isFinite(length)) return [
		0,
		0,
		0,
		1
	];
	return [
		q[0] / length,
		q[1] / length,
		q[2] / length,
		q[3] / length
	];
}
function quatFromAxisAngle(axis, angle) {
	const length = Math.hypot(axis[0], axis[1], axis[2]);
	if (!(length > 1e-12) || !Number.isFinite(length)) return [
		0,
		0,
		0,
		1
	];
	const s = Math.sin(angle / 2) / length;
	return [
		axis[0] * s,
		axis[1] * s,
		axis[2] * s,
		Math.cos(angle / 2)
	];
}
var EULER_ORDERS = [
	"XYZ",
	"XZY",
	"YXZ",
	"YZX",
	"ZXY",
	"ZYX"
];
/** The mode a `rotmode` member stores: 0 for quaternions, 1 to 6 for Euler orders, -1 for axis-angle. */
function rotationMode(rotmode) {
	if (rotmode === -1) return "axisAngle";
	return EULER_ORDERS[rotmode - 1] ?? "quaternion";
}
var AXES = {
	X: [
		1,
		0,
		0
	],
	Y: [
		0,
		1,
		0
	],
	Z: [
		0,
		0,
		1
	]
};
/** Euler angles in radians, applied about the axes in the order the mode names, first axis first. */
function quatFromEuler(angles, order) {
	const axes = EULER_ORDERS.includes(order) ? order : "XYZ";
	let q = [
		0,
		0,
		0,
		1
	];
	for (const axis of axes) {
		const index = axis === "X" ? 0 : axis === "Y" ? 1 : 2;
		q = quatMultiply(quatFromAxisAngle(AXES[axis] ?? [
			1,
			0,
			0
		], angles[index] ?? 0), q);
	}
	return q;
}
function rotationQuat(mode, values) {
	if (mode === "quaternion") {
		const [w = 1, x = 0, y = 0, z = 0] = values.quaternion;
		return quatNormalize([
			x,
			y,
			z,
			w
		]);
	}
	if (mode === "axisAngle") {
		const [x = 0, y = 1, z = 0] = values.axis;
		return quatFromAxisAngle([
			x,
			y,
			z
		], values.angle);
	}
	return quatFromEuler(values.euler, mode);
}
/** The matrix of a translation, rotation and scale, written into `out`. */
function compose({ translation: t, rotation, scale }, out = /* @__PURE__ */ new Float64Array(16)) {
	const [x, y, z, w] = rotation;
	const [sx, sy, sz] = scale;
	const x2 = x + x;
	const y2 = y + y;
	const z2 = z + z;
	const xx = x * x2;
	const xy = x * y2;
	const xz = x * z2;
	const yy = y * y2;
	const yz = y * z2;
	const zz = z * z2;
	const wx = w * x2;
	const wy = w * y2;
	const wz = w * z2;
	out[0] = (1 - (yy + zz)) * sx;
	out[1] = (xy + wz) * sx;
	out[2] = (xz - wy) * sx;
	out[3] = 0;
	out[4] = (xy - wz) * sy;
	out[5] = (1 - (xx + zz)) * sy;
	out[6] = (yz + wx) * sy;
	out[7] = 0;
	out[8] = (xz + wy) * sz;
	out[9] = (yz - wx) * sz;
	out[10] = (1 - (xx + yy)) * sz;
	out[11] = 0;
	out[12] = t[0];
	out[13] = t[1];
	out[14] = t[2];
	out[15] = 1;
	return out;
}
/** Scratch for `decompose`, which writes and reads only its upper 3×3. */
var DECOMPOSED_ROTATION = identity();
/** The rotation of a matrix whose axes are orthonormal. */
function quatFromRotationMatrix(m) {
	const at = (index) => m[index] ?? 0;
	const [m00, m10, m20, m01, m11, m21, m02, m12, m22] = [
		at(0),
		at(1),
		at(2),
		at(4),
		at(5),
		at(6),
		at(8),
		at(9),
		at(10)
	];
	const trace = m00 + m11 + m22;
	let q;
	if (trace > 0) {
		const s = .5 / Math.sqrt(trace + 1);
		q = [
			(m21 - m12) * s,
			(m02 - m20) * s,
			(m10 - m01) * s,
			.25 / s
		];
	} else if (m00 > m11 && m00 > m22) {
		const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
		q = [
			.25 * s,
			(m01 + m10) / s,
			(m02 + m20) / s,
			(m21 - m12) / s
		];
	} else if (m11 > m22) {
		const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
		q = [
			(m01 + m10) / s,
			.25 * s,
			(m12 + m21) / s,
			(m02 - m20) / s
		];
	} else {
		const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
		q = [
			(m02 + m20) / s,
			(m12 + m21) / s,
			.25 * s,
			(m10 - m01) / s
		];
	}
	return quatNormalize(q);
}
/** The shear below which a matrix counts as a plain translation, rotation and scale. */
var SHEAR_TOLERANCE = 1e-4;
/** How far a matrix's axes are from orthogonal, as the largest cosine between two of them. */
function shearOf(m) {
	const axis = (index) => {
		const x = m[index * 4] ?? 0;
		const y = m[index * 4 + 1] ?? 0;
		const z = m[index * 4 + 2] ?? 0;
		const length = Math.hypot(x, y, z) || 1;
		return [
			x / length,
			y / length,
			z / length
		];
	};
	const [x, y, z] = [
		axis(0),
		axis(1),
		axis(2)
	];
	const cosine = (a, b) => Math.abs(a.reduce((sum, value, k) => sum + value * (b[k] ?? 0), 0));
	return Math.max(cosine(x, y), cosine(y, z), cosine(x, z));
}
/** Splits an affine matrix into translation, rotation and scale. Shear is lost; a mirror flips the x scale. */
function decompose(m) {
	const at = (index) => m[index] ?? 0;
	let [sx, sy, sz] = axisLengths(m);
	if (determinant3(m) < 0) sx = -sx;
	const ix = sx === 0 ? 0 : 1 / sx;
	const iy = sy === 0 ? 0 : 1 / sy;
	const iz = sz === 0 ? 0 : 1 / sz;
	const rotation = DECOMPOSED_ROTATION;
	for (let row = 0; row < 3; row++) {
		rotation[row] = at(row) * ix;
		rotation[4 + row] = at(4 + row) * iy;
		rotation[8 + row] = at(8 + row) * iz;
	}
	return {
		translation: [
			at(12),
			at(13),
			at(14)
		],
		rotation: quatFromRotationMatrix(rotation),
		scale: [
			sx,
			sy,
			sz
		]
	};
}
var AXIS_SOURCE = [
	0,
	2,
	1
];
var AXIS_SIGN = [
	1,
	1,
	-1
];
/**
* `C × m × C⁻¹` for C, the conversion from Blender's Z-up axes to Y-up ones scaled by `unitScale`, which takes
* (x, y, z) to (x, z, −y): the same transform, written in the scene's axes and units, into `out`, which must not be `m`.
*/
function toSceneAxes(m, unitScale, out = /* @__PURE__ */ new Float64Array(16)) {
	for (let column = 0; column < 3; column++) {
		for (let row = 0; row < 3; row++) {
			const sign = (AXIS_SIGN[row] ?? 1) * (AXIS_SIGN[column] ?? 1);
			out[column * 4 + row] = sign * (m[(AXIS_SOURCE[column] ?? 0) * 4 + (AXIS_SOURCE[row] ?? 0)] ?? 0);
		}
		out[column * 4 + 3] = 0;
		out[12 + column] = unitScale * (AXIS_SIGN[column] ?? 1) * (m[12 + (AXIS_SOURCE[column] ?? 0)] ?? 0);
	}
	out[15] = 1;
	return out;
}
//#endregion
//#region ../../packages/blend/src/scene/transforms.ts
function three(values, fallback) {
	return [
		values[0] ?? fallback,
		values[1] ?? fallback,
		values[2] ?? fallback
	];
}
function quaternionOf(values) {
	return values.length === 4 ? [...values] : [
		1,
		0,
		0,
		0
	];
}
/** The rest values of a pose channel: no offset from the bone's rest pose. */
function restChannel() {
	return {
		location: [
			0,
			0,
			0
		],
		rotationMode: "quaternion",
		euler: [
			0,
			0,
			0
		],
		quaternion: [
			1,
			0,
			0,
			0
		],
		axisAngle: [
			0,
			0,
			1,
			0
		],
		scale: [
			1,
			1,
			1
		]
	};
}
function channelValues(channel) {
	const axis = three(channel.numbers("rotAxis"), 0);
	return {
		location: three(channel.numbers("loc"), 0),
		rotationMode: rotationMode(channel.number("rotmode")),
		euler: three(channel.numbers("eul"), 0),
		quaternion: quaternionOf(channel.numbers("quat")),
		axisAngle: [channel.number("rotAngle"), ...axis],
		scale: three(channel.numbers("size"), 1)
	};
}
function objectValues(object) {
	const deltaScale = object.has("dscale") ? three(object.numbers("dscale"), 1) : [
		1,
		1,
		1
	];
	return {
		location: three(object.numbers("loc"), 0),
		rotationMode: rotationMode(object.number("rotmode")),
		euler: three(object.numbers("rot"), 0),
		quaternion: quaternionOf(object.numbers("quat")),
		axisAngle: [object.number("rotAngle"), ...three(object.numbers("rotAxis"), 0)],
		scale: three(object.numbers("size"), 1),
		deltaLocation: three(object.numbers("dloc"), 0),
		deltaEuler: three(object.numbers("drot"), 0),
		deltaQuaternion: quaternionOf(object.numbers("dquat")),
		deltaAxisAngle: [object.number("drotAngle"), ...three(object.numbers("drotAxis"), 0)],
		deltaScale
	};
}
function cloneValues(values) {
	const copy = { ...values };
	for (const [key, value] of Object.entries(values)) if (Array.isArray(value)) copy[key] = [...value];
	return copy;
}
function rotationOf(mode, euler, quaternion, axisAngle) {
	return rotationQuat(mode, {
		euler,
		quaternion,
		axis: axisAngle.slice(1),
		angle: axisAngle[0] ?? 0
	});
}
/**
* Blender's `BKE_pchan_to_mat4`: location, then rotation, then scale, written into `out`. A connected bone ignores its
* location.
*/
function channelMatrix(values, connected, out) {
	const location = connected ? [
		0,
		0,
		0
	] : values.location;
	return compose({
		translation: [
			location[0] ?? 0,
			location[1] ?? 0,
			location[2] ?? 0
		],
		rotation: rotationOf(values.rotationMode, values.euler, values.quaternion, values.axisAngle),
		scale: [
			values.scale[0] ?? 1,
			values.scale[1] ?? 1,
			values.scale[2] ?? 1
		]
	}, out);
}
/** Blender's `BKE_object_to_mat4`: the object's own transform with its delta transform applied, written into `out`. */
function objectBasis(values, out) {
	const rotation = quatMultiply(rotationOf(values.rotationMode, values.deltaEuler, values.deltaQuaternion, values.deltaAxisAngle), rotationOf(values.rotationMode, values.euler, values.quaternion, values.axisAngle));
	return compose({
		translation: [
			(values.location[0] ?? 0) + (values.deltaLocation[0] ?? 0),
			(values.location[1] ?? 0) + (values.deltaLocation[1] ?? 0),
			(values.location[2] ?? 0) + (values.deltaLocation[2] ?? 0)
		],
		rotation,
		scale: [
			(values.scale[0] ?? 1) * (values.deltaScale[0] ?? 1),
			(values.scale[1] ?? 1) * (values.deltaScale[1] ?? 1),
			(values.scale[2] ?? 1) * (values.deltaScale[2] ?? 1)
		]
	}, out);
}
var TRANSFORM_PROPERTIES$1 = /* @__PURE__ */ new Map([
	["location", "location"],
	["rotation_euler", "euler"],
	["rotation_quaternion", "quaternion"],
	["rotation_axis_angle", "axisAngle"],
	["scale", "scale"]
]);
var DELTA_PROPERTIES = /* @__PURE__ */ new Map([
	["delta_location", "deltaLocation"],
	["delta_rotation_euler", "deltaEuler"],
	["delta_rotation_quaternion", "deltaQuaternion"],
	["delta_scale", "deltaScale"]
]);
/** Whether a property path names a transform property that animation can set, such as "rotation_euler". */
function isTransformProperty(property, object) {
	return TRANSFORM_PROPERTIES$1.has(property) || object && DELTA_PROPERTIES.has(property);
}
/** Sets one component of a transform property; returns false for a property or index it does not have. */
function setTransformProperty(values, property, index, value) {
	const key = TRANSFORM_PROPERTIES$1.get(property) ?? DELTA_PROPERTIES.get(property);
	if (!key || !Object.hasOwn(values, key)) return false;
	const target = values[key];
	if (!Array.isArray(target) || index < 0 || index >= target.length) return false;
	target[index] = value;
	return true;
}
//#endregion
//#region ../../packages/blend/src/scene/armature.ts
var BoneFlag = {
	connected: 16,
	hinge: 512,
	noDeform: 4096,
	noScaleLegacy: 32768,
	noLocalLocation: 1 << 22,
	relativeParenting: 1 << 23
};
var InheritScale = {
	full: 0,
	fixShear: 1,
	average: 2,
	none: 3,
	noneLegacy: 4,
	aligned: 5
};
/** The armature's bone lists are damaged; the scene reads the rest of the file without its bones. */
var ArmatureReadError = class extends Error {
	name = "ArmatureReadError";
};
/**
* The armature's bones, each parent before its children, in the order Blender lists them. Throws `ArmatureReadError`
* as soon as the lists reach a bone twice, so that lists sharing their tails queue each bone at most once.
*/
function readBones(armature) {
	const bones = [];
	const reached = /* @__PURE__ */ new Set();
	const pending = [];
	const queue = (list, parent) => {
		for (const bone of list) {
			if (reached.has(bone.offset)) throw new ArmatureReadError(`Armature ${idName(armature)} lists bone ${bone.string("name")} twice`);
			reached.add(bone.offset);
		}
		for (let index = list.length - 1; index >= 0; index--) {
			const bone = list[index];
			if (bone) pending.push({
				bone,
				parent
			});
		}
	};
	queue(armature.list("bonebase"), -1);
	for (let next = pending.pop(); next; next = pending.pop()) {
		const { bone, parent } = next;
		const flag = bone.number("flag");
		const index = bones.length;
		const rest = mat4From(bone.numbers("arm_mat"));
		const parentRest = bones[parent]?.rest;
		bones.push({
			name: bone.string("name"),
			parent,
			rest,
			offset: parentRest ? multiply(invert(parentRest), rest) : rest,
			length: bone.number("length"),
			flag,
			inheritScale: bone.has("inherit_scale_mode") ? bone.number("inherit_scale_mode") : (flag & BoneFlag.noScaleLegacy) !== 0 ? InheritScale.noneLegacy : InheritScale.full,
			deform: (flag & BoneFlag.noDeform) === 0,
			segments: bone.number("segments"),
			envelope: {
				head: bone.numbers("arm_head"),
				tail: bone.numbers("arm_tail"),
				headRadius: bone.number("rad_head"),
				tailRadius: bone.number("rad_tail"),
				falloff: bone.number("dist"),
				weight: bone.number("weight")
			}
		});
		queue(bone.list("childbase"), index);
	}
	return bones;
}
/**
* Whether the bone takes its parent's full transform, so that its matrix relative to the parent's pose is
* `offset × channel` whatever the parent does.
*/
function inheritsFully(bone) {
	return (bone.flag & (BoneFlag.hinge | BoneFlag.noLocalLocation)) === 0 && bone.inheritScale === InheritScale.full;
}
function axis(m, index) {
	return [
		m[index * 4] ?? 0,
		m[index * 4 + 1] ?? 0,
		m[index * 4 + 2] ?? 0
	];
}
function setAxis(m, index, value) {
	m[index * 4] = value[0];
	m[index * 4 + 1] = value[1];
	m[index * 4 + 2] = value[2];
}
function dot$2(a, b) {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function cross$2(a, b) {
	return [
		a[1] * b[2] - a[2] * b[1],
		a[2] * b[0] - a[0] * b[2],
		a[0] * b[1] - a[1] * b[0]
	];
}
function scaledAxis(a, factor) {
	return [
		a[0] * factor,
		a[1] * factor,
		a[2] * factor
	];
}
function plus(a, b) {
	return [
		a[0] + b[0],
		a[1] + b[1],
		a[2] + b[2]
	];
}
function unit$1(a) {
	const length = Math.hypot(a[0], a[1], a[2]);
	return {
		axis: length > 0 ? scaledAxis(a, 1 / length) : [
			0,
			0,
			0
		],
		length
	};
}
/**
* Blender's `orthogonalize_m4_stable`: keeps the primary axis, makes the other two orthogonal to it and then to each
* other, splitting the correction evenly between them so the result does not lean, and with `normalize` makes every
* axis unit length; without it the axes keep their area and proportion.
*/
function orthogonalized(m, primary, normalize) {
	const out = Float64Array.from(m);
	const [i, j, k] = primary === 0 ? [
		0,
		1,
		2
	] : primary === 1 ? [
		1,
		0,
		2
	] : [
		2,
		0,
		1
	];
	let v1 = axis(m, i);
	let v2 = axis(m, j);
	let v3 = axis(m, k);
	const lengthSquared = dot$2(v1, v1);
	if (lengthSquared > 0) {
		v2 = plus(v2, scaledAxis(v1, -dot$2(v2, v1) / lengthSquared));
		v3 = plus(v3, scaledAxis(v1, -dot$2(v3, v1) / lengthSquared));
		if (normalize) v1 = scaledAxis(v1, 1 / Math.sqrt(lengthSquared));
	}
	const second = unit$1(v2);
	const third = unit$1(v3);
	let norm2 = second.axis;
	let norm3 = third.axis;
	const cosine = dot$2(norm2, norm3);
	const absolute = Math.abs(cosine);
	if (absolute > 1e-4 && absolute < 1 - 1.1920929e-7) {
		const angle = Math.acos(cosine);
		const target = angle + (Math.PI / 2 - angle) / 2;
		norm2 = plus(norm2, scaledAxis(norm3, -cosine));
		norm2 = scaledAxis(norm2, Math.sin(target) / Math.hypot(...norm2));
		norm2 = plus(norm2, scaledAxis(norm3, Math.cos(target)));
		norm3 = unit$1(cross$2(cross$2(norm2, norm3), norm2)).axis;
		if (!normalize) {
			const factor = Math.sqrt(Math.sin(angle));
			v2 = scaledAxis(norm2, second.length * factor);
			v3 = scaledAxis(norm3, third.length * factor);
		}
	}
	if (normalize) {
		v2 = norm2;
		v3 = norm3;
	}
	setAxis(out, i, v1);
	setAxis(out, j, v2);
	setAxis(out, k, v3);
	return out;
}
function normalizedAxes(m) {
	const scale = axisLengths(m);
	const matrix = Float64Array.from(m);
	for (let index = 0; index < 3; index++) {
		const length = scale[index] ?? 0;
		if (length === 0) continue;
		for (let row = 0; row < 3; row++) matrix[index * 4 + row] = (matrix[index * 4 + row] ?? 0) / length;
	}
	return {
		matrix,
		scale
	};
}
function rescaled(m, scale) {
	const out = Float64Array.from(m);
	for (let index = 0; index < 3; index++) for (let row = 0; row < 3; row++) out[index * 4 + row] = (out[index * 4 + row] ?? 0) * (scale[index] ?? 1);
	return out;
}
/** Blender's `mat4_to_size_fix_shear`: axis scales corrected so their product is the matrix's volume scale. */
function sizeFixShear(m) {
	const size = axisLengths(m);
	const volume = size[0] * size[1] * size[2];
	if (volume === 0) return size;
	const factor = Math.cbrt(Math.abs(determinant3(m) / volume));
	return size.map((value) => value * factor);
}
/**
* Blender's `BKE_bone_parent_transform_calc_from_matrices` and `BKE_bone_parent_transform_apply`: the bone's pose
* matrix in armature space from its parent's pose matrix and its channel matrix, for every way a bone can inherit
* rotation, scale and location.
*/
function poseMatrix(bone, offset, parentRest, parentPose, channel) {
	let rotscale;
	let location;
	let postScale = null;
	if (parentPose && parentRest) {
		const useRotation = (bone.flag & BoneFlag.hinge) === 0;
		const mode = bone.inheritScale;
		const full = useRotation && mode === InheritScale.full;
		if (full) rotscale = multiply(parentPose, offset);
		else {
			let parent;
			if (useRotation) {
				parent = Float64Array.from(parentPose);
				if (mode === InheritScale.none || mode === InheritScale.average) parent = orthogonalized(parent, 1, true);
				else if (mode === InheritScale.aligned) {
					const normalized = normalizedAxes(orthogonalized(parent, 1, false));
					parent = normalized.matrix;
					postScale = normalized.scale;
				} else if (mode === InheritScale.noneLegacy) parent = normalizedAxes(parent).matrix;
			} else {
				parent = Float64Array.from(parentRest);
				if (mode === InheritScale.full) parent = rescaled(parent, axisLengths(parentPose));
				else if (mode === InheritScale.fixShear) parent = rescaled(parent, sizeFixShear(parentPose));
				else if (mode === InheritScale.aligned) postScale = sizeFixShear(parentPose);
			}
			if (mode === InheritScale.average) {
				const factor = Math.cbrt(Math.abs(determinant3(parentPose)));
				parent = rescaled(parent, [
					factor,
					factor,
					factor
				]);
			}
			rotscale = multiply(parent, offset);
			if (mode === InheritScale.fixShear) rotscale = orthogonalized(rotscale, 1, false);
		}
		if ((bone.flag & BoneFlag.noLocalLocation) !== 0) {
			const origin = transformPoint(parentPose, offset[12] ?? 0, offset[13] ?? 0, offset[14] ?? 0);
			location = Float64Array.from(parentPose);
			location[12] = origin[0];
			location[13] = origin[1];
			location[14] = origin[2];
		} else if (!full) location = multiply(parentPose, offset);
		else location = rotscale;
	} else {
		rotscale = offset;
		if ((bone.flag & BoneFlag.noLocalLocation) !== 0) {
			location = identity();
			location[12] = offset[12] ?? 0;
			location[13] = offset[13] ?? 0;
			location[14] = offset[14] ?? 0;
		} else location = rotscale;
	}
	const out = multiply(rotscale, channel);
	const origin = transformPoint(location, channel[12] ?? 0, channel[13] ?? 0, channel[14] ?? 0);
	out[12] = origin[0];
	out[13] = origin[1];
	out[14] = origin[2];
	return postScale ? rescaled(out, postScale) : out;
}
/** Pose matrices in armature space for the given channel values, one per bone, without constraints. */
function poseMatrices(bones, channels) {
	const result = [];
	bones.forEach((bone, index) => {
		const values = channels[index];
		const channel = values ? channelMatrix(values, (bone.flag & BoneFlag.connected) !== 0) : identity();
		const parent = bones[bone.parent];
		result.push(poseMatrix(bone, bone.offset, parent?.rest ?? null, result[bone.parent] ?? null, channel));
	});
	return result;
}
//#endregion
//#region ../../packages/blend/src/anim/nla.ts
var StripFlag = {
	userInfluence: 32,
	userTime: 64,
	userTimeCyclic: 128,
	syncLength: 512,
	reverse: 2048,
	noTimeMap: 1 << 29
};
var ADT_NLA_EDIT_NOMAP = 8;
var StripType = {
	clip: 0,
	transition: 1,
	meta: 2
};
var Extend = {
	hold: 0,
	holdForward: 1,
	nothing: 2
};
var BlendMode = {
	replace: 0,
	add: 1,
	subtract: 2,
	multiply: 3,
	combine: 4
};
var BLEND_MODES = new Set(Object.values(BlendMode));
var FLOAT_EPSILON = 2 ** -23;
/** Blender's `IS_EQF`. */
function isEqual(a, b) {
	return Math.abs(a - b) < FLOAT_EPSILON;
}
var EVERYWHERE = [[Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY]];
/** The place of the first of `spans`, which are in order, that ends at or after `time`. */
function firstReaching(spans, time) {
	let low = 0;
	let high = spans.length;
	while (low < high) {
		const middle = low + high >> 1;
		if ((spans[middle]?.[1] ?? NaN) < time) low = middle + 1;
		else high = middle;
	}
	return low;
}
/** Whether `time` lies in one of `spans`, which are in order. */
function inSpans(spans, time) {
	const span = spans[firstReaching(spans, time)];
	return span !== void 0 && time >= span[0] && time <= span[1];
}
/** The parts of `spans` from `from` to `to`. */
function clampSpans(spans, [from, to]) {
	const clamped = [];
	for (const [start, end] of spans) {
		const low = Math.max(start, from);
		const high = Math.min(end, to);
		if (low <= high) clamped.push([low, high]);
	}
	return clamped;
}
/** The stretches that `a` or `b`, each in order, cover: in order and apart. */
function joinSpans(a, b) {
	const all = [...a, ...b].sort((x, y) => x[0] - y[0]);
	const joined = [];
	for (const [from, to] of all) {
		const last = joined[joined.length - 1];
		if (last && from <= last[1]) last[1] = Math.max(last[1], to);
		else joined.push([from, to]);
	}
	return joined;
}
/** The parts of `spans` outside `cut`, both in order and apart; each part keeps its ends, which `cut` may share. */
function withoutSpans(spans, cut) {
	const left = [];
	for (const [from, to] of spans) {
		let start = from;
		for (let index = firstReaching(cut, start); index < cut.length && start <= to; index++) {
			const [cutFrom, cutTo] = cut[index] ?? [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
			if (cutFrom > to) break;
			if (cutFrom > start) left.push([start, cutFrom]);
			start = Math.max(start, cutTo);
			if (cutTo >= to) start = Number.POSITIVE_INFINITY;
		}
		if (start <= to) left.push([start, to]);
	}
	return left;
}
/**
* Blender's `BKE_action_frame_range_calc` with modifiers, which bounds the active action when NLA strips play under
* it: the frames its keys span, widened by the last modifier of each curve, and at least one frame long.
*/
function keyedRange(action) {
	let start = Number.POSITIVE_INFINITY;
	let end = Number.NEGATIVE_INFINITY;
	let found = false;
	for (const curve of action.slots.flatMap((slot) => slot.curves)) {
		const frames = keyFrames(curve);
		if (frames.length > 0) {
			start = Math.min(start, frames[0] ?? start);
			end = Math.max(end, frames[frames.length - 1] ?? end);
			found = true;
		}
		const last = curve.modifiers[curve.modifiers.length - 1];
		if (!last && curve.unsupportedModifiers.length === 0) continue;
		found = true;
		if (last?.type === "cycles") {
			if (last.before !== "none") start = Number.NEGATIVE_INFINITY;
			if (last.after !== "none") end = Number.POSITIVE_INFINITY;
		} else if (last?.type === "limits") {
			if (last.minFrame !== null) start = Math.min(start, last.minFrame);
			if (last.maxFrame !== null) end = Math.max(end, last.maxFrame);
		} else return [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY];
	}
	if (!found) return [0, 1];
	return [start, start === end ? end + 1 : end];
}
function stripSettings(strip) {
	return {
		struct: strip,
		type: strip.number("type"),
		flag: strip.number("flag"),
		start: strip.number("start"),
		end: strip.number("end"),
		actionStart: strip.number("actstart"),
		actionEnd: strip.number("actend"),
		repeat: strip.number("repeat"),
		scale: strip.number("scale"),
		blendIn: strip.number("blendin"),
		blendOut: strip.number("blendout"),
		blendMode: strip.number("blendmode"),
		extendMode: strip.number("extendmode"),
		influence: strip.number("influence"),
		time: strip.number("strip_time"),
		action: strip.deref("act"),
		slot: slotHandle(strip, "action_slot_handle")
	};
}
function emptyList() {
	return {
		strips: [],
		pieces: [],
		stretches: /* @__PURE__ */ new Map()
	};
}
/**
* Whether a strip plays the action's frame equal to the scene's time, as Blender makes the action track and a tweaked
* strip it does not remap, rather than through its range, scale and repeats.
*/
function keepsTime(strip) {
	return (strip.flag & StripFlag.noTimeMap) !== 0;
}
function stripOf(settings, parent) {
	const { flag, influence } = settings;
	const userInfluence = (flag & StripFlag.userInfluence) !== 0;
	const scale = Math.abs(settings.scale);
	const repeat = settings.repeat;
	return {
		...settings,
		scale: Number.isFinite(scale) && scale > 0 ? scale : 1,
		repeat: Math.abs(repeat) < FLOAT_EPSILON || !Number.isFinite(repeat) ? 1 : repeat,
		reverse: (flag & StripFlag.reverse) !== 0,
		silent: (flag & 4096) !== 0 || userInfluence && influence <= 0,
		blends: settings.blendMode !== BlendMode.replace || (flag & StripFlag.userTime) !== 0 && !keepsTime(settings) || (userInfluence ? influence < 1 : settings.blendIn !== 0 || settings.blendOut !== 0),
		parent,
		inner: emptyList()
	};
}
/**
* The pieces of a strip list's time, as Blender's `nlastrips_ctime_get_strip` reads the list in order: the first strip
* whose end is not yet past plays within its range, before it the strip before it holds its end unless it extends
* nothing, and past every strip the last one holds its end the same way. The first strip holds its start before itself
* only when it holds both ways. A strip that keeps the scene's time, as Blender makes for the action track and for a
* tweaked strip it does not remap, plays at the time itself as far as it extends.
*/
function piecesOf(strips) {
	const pieces = [];
	const add = (to, closed, strip, held) => {
		const last = pieces[pieces.length - 1];
		if (last && !(to > last.to || to === last.to && closed && !last.closed)) return;
		pieces.push({
			to,
			closed,
			strip,
			held
		});
	};
	strips.forEach((strip, index) => {
		const previous = strips[index - 1];
		const always = keepsTime(strip) && strip.extendMode === Extend.hold;
		const onward = always || keepsTime(strip) && strip.extendMode === Extend.holdForward;
		if (!always) {
			if (previous) add(strip.start, false, previous.extendMode !== Extend.nothing ? previous : null, previous.end);
			else add(strip.start, false, strip.extendMode === Extend.hold ? strip : null, strip.start);
		}
		add(onward ? Number.POSITIVE_INFINITY : strip.end, true, strip, null);
	});
	const last = strips[strips.length - 1];
	add(Number.POSITIVE_INFINITY, true, last && last.extendMode !== Extend.nothing ? last : null, last?.end ?? null);
	return pieces;
}
/** The stretches of a list's time where each strip plays, from its pieces. */
function stretchesOf(pieces) {
	const stretches = /* @__PURE__ */ new Map();
	let from = Number.NEGATIVE_INFINITY;
	for (const piece of pieces) {
		const span = [from, piece.to];
		from = piece.to;
		if (!piece.strip || piece.strip.silent) continue;
		const list = stretches.get(piece.strip) ?? [];
		list.push({
			span,
			held: piece.held
		});
		stretches.set(piece.strip, list);
	}
	return stretches;
}
/** Works out the pieces and stretches of a list whose strips are all read. */
function settle(list) {
	list.pieces = piecesOf(list.strips);
	list.stretches = stretchesOf(list.pieces);
}
/** One strip as a list of its own. */
function soleStrip(strip) {
	const list = {
		...emptyList(),
		strips: [strip]
	};
	settle(list);
	return list;
}
/** The strip Blender picks in a list at `time`, muted or not, and the time it plays at, clamped where it only holds. */
function stripAt(list, time) {
	const { pieces } = list;
	let low = 0;
	let high = pieces.length;
	while (low < high) {
		const middle = low + high >> 1;
		const piece = pieces[middle];
		if (piece && (time < piece.to || time === piece.to && piece.closed)) high = middle;
		else low = middle + 1;
	}
	const piece = pieces[low];
	return piece?.strip ? {
		strip: piece.strip,
		time: piece.held ?? time
	} : null;
}
/** The length of a strip's action range, and how long one repeat of it lasts in the strip. */
function cycle(strip) {
	const range = strip.actionEnd - strip.actionStart;
	const length = Math.abs(range) < FLOAT_EPSILON ? 1 : range;
	return {
		length,
		span: length * strip.scale
	};
}
/** Blender's `nlastrip_get_frame_actionclip`: the action's frame that an action strip plays at `time`. */
function actionFrame(strip, time) {
	const { span } = cycle(strip);
	const whole = isEqual(time, strip.end) && isEqual(strip.repeat, Math.floor(strip.repeat));
	const played = (time - strip.start) % span / strip.scale;
	if (strip.reverse) return whole ? strip.actionStart : strip.actionEnd - played;
	return whole ? strip.actionEnd : strip.actionStart + played;
}
/** The time inside a meta strip at `time` outside it, and the reverse: mirrored when the meta plays reversed. */
function innerTime(meta, time) {
	return meta.reverse ? meta.start + meta.end - time : time;
}
/** The action strip a track plays at `time`, through its meta strips, and the action's frame it plays there. */
function trackFrame(top, time) {
	let list = top;
	let at = time;
	for (;;) {
		const found = stripAt(list, at);
		if (!found || found.strip.silent) return null;
		const { strip } = found;
		if (strip.type === StripType.clip) return {
			strip,
			frame: keepsTime(strip) ? found.time : actionFrame(strip, found.time)
		};
		if (strip.type !== StripType.meta) return null;
		list = strip.inner;
		at = innerTime(strip, found.time);
	}
}
/**
* The clock times on a track where the frame a strip plays can jump, or a strip starts or stops playing: where every
* strip, inside meta strips too, starts, ends or starts a repeat. A strip that keeps the scene's time breaks only where
* it starts or stops playing.
*/
function trackBreaks(top) {
	return (from, to, limit) => {
		const times = [];
		const pending = [{
			list: top,
			sign: 1,
			shift: 0,
			low: from,
			high: to
		}];
		for (let entry = pending.pop(); entry; entry = pending.pop()) {
			const { sign, shift, low, high } = entry;
			const outer = (time) => sign * time + shift;
			const add = (time) => {
				const at = outer(time);
				if (at >= low && at <= high) times.push(at);
				return times.length <= limit;
			};
			const [first, last] = sign > 0 ? [low - shift, high - shift] : [shift - high, shift - low];
			for (const strip of entry.list.strips) {
				if (keepsTime(strip)) {
					if (strip.extendMode !== Extend.hold && !add(strip.start)) return null;
					if (strip.extendMode === Extend.nothing && !add(strip.end)) return null;
					continue;
				}
				if (!add(strip.start) || !add(strip.end)) return null;
				if (strip.type === StripType.meta) {
					const [start, end] = [outer(strip.start), outer(strip.end)].sort((a, b) => a - b);
					const mirrored = {
						sign: -sign,
						shift: sign * (strip.start + strip.end) + shift
					};
					const range = {
						low: Math.max(low, start ?? low),
						high: Math.min(high, end ?? high)
					};
					pending.push({
						list: strip.inner,
						...strip.reverse ? mirrored : {
							sign,
							shift
						},
						...range
					});
					continue;
				}
				const { span } = cycle(strip);
				if (strip.type !== StripType.clip || !(span > 0)) continue;
				for (let k = Math.max(1, Math.ceil((first - strip.start) / span));; k++) {
					const at = strip.start + k * span;
					if (!(at < strip.end && at <= last)) break;
					if (!add(at)) return null;
				}
			}
		}
		return times;
	};
}
/** Reads a track's strips, leaving out those `seen` holds, as another track's, and adding the rest to it. */
function readTrack(track, seen) {
	const top = emptyList();
	const byOffset = /* @__PURE__ */ new Map();
	const lists = [top];
	let tooDeep = false;
	let transition = false;
	const pending = unseenList(track, "strips", seen).map((struct) => ({
		struct,
		parent: null,
		depth: 0
	}));
	for (let next = 0; next < pending.length; next++) {
		const entry = pending[next];
		if (!entry) continue;
		const strip = stripOf(stripSettings(entry.struct), entry.parent);
		byOffset.set(entry.struct.offset, strip);
		(entry.parent?.inner ?? top).strips.push(strip);
		if (strip.type === StripType.transition) transition = true;
		const inner = unseenList(entry.struct, "strips", seen);
		if (inner.length === 0) continue;
		if (entry.depth >= 64) {
			tooDeep = true;
			continue;
		}
		lists.push(strip.inner);
		for (const struct of inner) pending.push({
			struct,
			parent: strip,
			depth: entry.depth + 1
		});
	}
	for (const list of lists) settle(list);
	return trackTiming(top, byOffset, tooDeep, transition);
}
/**
* The tweaked strip's track as Blender plays it in NLA tweak mode, `nlastrips_ctime_get_strip_single`: the strip
* alone, as `tweakStrip` makes it, so the other strips of its track neither cut it short nor play.
*/
function tweakedTrack(strip) {
	const byOffset = new Map(strip.struct ? [[strip.struct.offset, strip]] : []);
	return trackTiming(soleStrip(strip), byOffset, false, false);
}
function trackTiming(top, byOffset, tooDeep, transition) {
	let lastTime = NaN;
	let last = null;
	const at = (time) => {
		if (time !== lastTime) {
			lastTime = time;
			last = trackFrame(top, time);
		}
		return last;
	};
	const players = /* @__PURE__ */ new Map();
	return {
		top,
		byOffset,
		tooDeep,
		transition,
		breaks: trackBreaks(top),
		at,
		players,
		lane: { playing: (time) => {
			const found = at(time);
			return found ? players.get(found.strip) ?? null : null;
		} }
	};
}
/** The NLA tracks that players read, each track read once, and each strip read with the first track that lists it. */
var NlaTracks = class {
	#read = /* @__PURE__ */ new Map();
	#tweaked = /* @__PURE__ */ new Map();
	#seen = /* @__PURE__ */ new Set();
	of(track) {
		let timing = this.#read.get(track.offset);
		if (!timing) {
			timing = readTrack(track, this.#seen);
			this.#read.set(track.offset, timing);
		}
		return timing;
	}
	/**
	* The track of the strip that the animation data tweaks in NLA tweak mode, as Blender plays it: that strip alone, as
	* `tweakStrip` makes it from `action`, the strip's action. Null where the animation data names no tweaked strip.
	*/
	tweaked(adt, action) {
		let timing = this.#tweaked.get(adt.offset);
		if (timing === void 0) {
			const strip = tweakStrip(adt, action);
			timing = strip ? tweakedTrack(strip) : null;
			this.#tweaked.set(adt.offset, timing);
		}
		return timing;
	}
	/** Whether a track that players read has meta strips nested deeper than `MAX_META_DEPTH`. */
	get tooDeep() {
		return [...this.#read.values()].some((timing) => timing.tooDeep);
	}
};
/** The tracks Blender evaluates: those `trackPlays` lets play, with the track of the tweaked strip in tweak mode. */
function evaluatedTracks(adt) {
	const flag = adt.number("flag");
	const edited = (flag & 4) !== 0 ? adt.deref("act_track")?.offset : void 0;
	return adt.list("nla_tracks").filter((track) => trackPlays(flag, track, track.offset === edited));
}
/**
* Whether NLA strips play under an ID's active action, so that Blender plays it by the NLA's rules: where a track it
* evaluates has strips, or a strip is tweaked. Otherwise `animsys_evaluate_nla_for_flush` plays the active action as
* if there were no NLA.
*/
function stripsUnder(adt) {
	if (adt.list("nla_tracks").length === 0 || (adt.number("flag") & 2) !== 0) return false;
	return adt.deref("actstrip") !== null || evaluatedTracks(adt).some((track) => track.list("strips").length > 0);
}
/**
* Blender's `animsys_create_action_track_strip`: the action track's action as a strip that keeps the scene's time,
* which plays over the NLA within the frames its keys span, as far as it extends.
*/
function actionTrackStrip(adt, action, slot) {
	const [start, end] = keyedRange(action);
	return stripOf({
		struct: null,
		type: StripType.clip,
		flag: StripFlag.userInfluence | StripFlag.noTimeMap,
		start,
		end,
		actionStart: start,
		actionEnd: end,
		repeat: 1,
		scale: 1,
		blendIn: 0,
		blendOut: 0,
		blendMode: adt.number("act_blendmode"),
		extendMode: adt.number("act_extendmode"),
		influence: adt.has("act_influence") ? adt.number("act_influence") : 1,
		time: 0,
		action: action.struct,
		slot
	}, null);
}
/** A use that plays its action's frames at the same clock times. */
var DIRECT = {
	frameAt: (time) => time,
	direct: true,
	spans: EVERYWHERE,
	timesOf: framesWithin,
	breaks: () => [],
	blends: false,
	lane: null
};
var SILENT = {
	frameAt: () => null,
	direct: false,
	spans: [],
	timesOf: () => [],
	breaks: () => [],
	blends: false,
	lane: null
};
/** The `frames` that lie within `within`, sorted, at most `limit` of them. */
function framesWithin(frames, within, limit) {
	const times = [];
	for (const frame of frames) {
		if (times.length >= limit) break;
		if (inSpans(within, frame)) times.push(frame);
	}
	return times.sort((a, b) => a - b);
}
/** Where the action track plays an action over NLA strips: at the clock's own frame, as far as it extends. */
function actionTrackPlayer(adt, action, slot) {
	const strip = actionTrackStrip(adt, action, slot);
	const [stretch] = soleStrip(strip).stretches.get(strip) ?? [];
	if (!stretch) return SILENT;
	const { span } = stretch;
	const [from, to] = span;
	return {
		frameAt: (time) => time >= from && time <= to ? time : null,
		direct: from === Number.NEGATIVE_INFINITY && to === Number.POSITIVE_INFINITY,
		spans: [span],
		timesOf: (frames, within, limit) => framesWithin(frames, clampSpans(within, span), limit),
		breaks: (low, high) => [from, to].filter((time) => Number.isFinite(time) && time >= low && time <= high),
		blends: strip.blends,
		lane: null
	};
}
/** A strip and the meta strips around it, outermost first. */
function stripPath(strip) {
	const path = [];
	for (let at = strip; at; at = at.parent) path.push(at);
	return path.reverse();
}
/** The stretches of the track's clock where it plays the last strip of `path`, through the meta strips before it. */
function pathSpans(top, path) {
	let spans = [];
	for (let depth = path.length - 1; depth >= 0; depth--) {
		const strip = path[depth];
		const list = depth === 0 ? top : path[depth - 1]?.inner;
		if (!strip || !list) return [];
		const inner = spans;
		const mirror = strip.start + strip.end;
		const outward = strip.reverse ? inner.map(([a, b]) => [mirror - b, mirror - a]).reverse() : inner;
		const found = [];
		for (const { span, held } of list.stretches.get(strip) ?? []) if (depth === path.length - 1) found.push(span);
		else if (held !== null) {
			if (inSpans(inner, innerTime(strip, held))) found.push(span);
		} else for (const part of clampSpans(outward, span)) found.push(part);
		spans = joinSpans(found, []);
	}
	return spans;
}
/**
* The clock times within `within` at which an action strip, inside `metas`, plays each of `frames` in each of its
* repeats, sorted. Stops after `limit` of them. A strip that keeps the scene's time, which no meta strip holds, plays
* each frame at that time.
*/
function stripTimes(strip, metas, frames, within, limit) {
	if (keepsTime(strip)) return framesWithin(frames, within, limit);
	let spans = [...within];
	let sign = 1;
	let shift = 0;
	for (const meta of metas) {
		spans = clampSpans(spans, [meta.start, meta.end]);
		if (!meta.reverse) continue;
		const mirror = meta.start + meta.end;
		spans = spans.map(([a, b]) => [mirror - b, mirror - a]).reverse();
		shift += sign * mirror;
		sign = -sign;
	}
	spans = clampSpans(spans, [strip.start, strip.end + FLOAT_EPSILON]);
	const { length, span } = cycle(strip);
	const step = span > 0 && Number.isFinite(span) ? span : 0;
	const times = [];
	for (const frame of frames) {
		const offset = strip.reverse ? strip.actionEnd - frame : frame - strip.actionStart;
		if (!(offset >= -FLOAT_EPSILON && offset <= length + FLOAT_EPSILON)) continue;
		const first = strip.start + offset * strip.scale;
		for (const [from, to] of spans) {
			const low = step > 0 ? Math.max(0, Math.ceil((from - first) / step)) : 0;
			const high = step > 0 ? Math.floor((to - first) / step) : 0;
			for (let k = low; k <= high; k++) {
				const at = first + k * step;
				if (!(at >= from && at <= to)) continue;
				if (times.length >= limit) return times.sort((a, b) => a - b);
				times.push(sign * at + shift);
			}
		}
	}
	return times.sort((a, b) => a - b);
}
/** Whether NLA tweak mode tweaks the strip, on the track the animation data tweaks. */
function isTweaked(adt, { strip, track }) {
	if ((adt.number("flag") & 4) === 0) return false;
	return track.offset === adt.deref("act_track")?.offset && strip.offset === adt.deref("actstrip")?.offset;
}
/**
* Where a use of an action that Blender plays plays it on the scene's clock: the active or stashed action at the
* clock's own frame, within its extrapolation where NLA strips play under it, and an NLA strip through its track's
* timing, as `nlastrips_ctime_get_strip` and `nlastrip_get_frame` place it. A strip in NLA tweak mode plays alone on
* its track, as `tweakStrip` makes it. Each strip replaces what plays under it in full; `blends` says where Blender
* does otherwise. A strip nested deeper than `MAX_META_DEPTH` plays nothing.
*/
function scenePlayer(id, use, action, tracks) {
	const adt = id.deref("adt");
	if (!use.strip) return adt && stripsUnder(adt) ? actionTrackPlayer(adt, action, use.slot) : DIRECT;
	const timing = adt && isTweaked(adt, use.strip) ? tracks.tweaked(adt, action) : tracks.of(use.strip.track);
	const own = timing?.byOffset.get(use.strip.strip.offset);
	if (!timing || !own) return SILENT;
	const made = timing.players.get(own);
	if (made) return made;
	const path = stripPath(own);
	const metas = path.slice(0, -1);
	const player = {
		frameAt: (time) => {
			const found = timing.at(time);
			return found?.strip === own ? found.frame : null;
		},
		direct: false,
		spans: pathSpans(timing.top, path),
		timesOf: (frames, within, limit) => stripTimes(own, metas, frames, within, limit),
		breaks: timing.breaks,
		blends: path.some((strip) => strip.blends) || timing.transition,
		lane: timing.lane
	};
	timing.players.set(own, player);
	return player;
}
var VECTOR = {
	mix: "add",
	defaults: [
		0,
		0,
		0
	]
};
var SCALE = {
	mix: "multiply",
	defaults: [
		1,
		1,
		1
	]
};
var QUATERNION = {
	mix: "quaternion",
	defaults: [
		1,
		0,
		0,
		0
	]
};
var AXIS_ANGLE = {
	mix: "axis-angle",
	defaults: [
		0,
		0,
		0,
		0
	]
};
var SHAPE_KEY_VALUE = {
	mix: "add",
	defaults: [0]
};
var TRANSFORMS = /* @__PURE__ */ new Map([
	["location", VECTOR],
	["rotation_euler", VECTOR],
	["rotation_quaternion", QUATERNION],
	["rotation_axis_angle", AXIS_ANGLE],
	["scale", SCALE]
]);
var DELTAS = /* @__PURE__ */ new Map([
	["delta_location", VECTOR],
	["delta_rotation_euler", VECTOR],
	["delta_rotation_quaternion", QUATERNION],
	["delta_scale", SCALE]
]);
/** The animated properties the reader reads: an object's transform, a pose bone's channel and a shape key's value. */
function propertyOf(path) {
	const pose = parsePosePath(path);
	if (pose) return TRANSFORMS.get(pose.property) ?? null;
	if (parseShapeKeyPath(path) !== null) return SHAPE_KEY_VALUE;
	return TRANSFORMS.get(path) ?? DELTAS.get(path) ?? null;
}
/** What the NLA writes for one value of a property that no strip plays, 0 for a property the reader does not read. */
function nlaDefault(path, index) {
	return propertyOf(path)?.defaults[index] ?? 0;
}
/** Blender's `nlastrip_get_influence`: full influence but over the strip's blend-in and blend-out frames. */
function blendedInfluence(strip, frame) {
	const blendIn = Math.abs(strip.blendIn);
	const blendOut = Math.abs(strip.blendOut);
	if (!isEqual(blendIn, 0) && frame <= strip.start + blendIn) return Math.abs(frame - strip.start) / blendIn;
	if (!isEqual(blendOut, 0) && frame >= strip.end - blendOut) return Math.abs(strip.end - frame) / blendOut;
	return 1;
}
/**
* Blender's `nlastrip_evaluate_controls`: the strip's influence and action frame, from its curves where it animates
* them; null where such a curve has a modifier the reader does not apply.
*/
function controls(strip, frame) {
	let influence = strip.influence;
	let time = strip.time;
	for (const curve of strip.struct?.list("fcurves").map(readFCurve) ?? []) {
		if (curve.muted || curve.empty || curve.path !== "influence" && curve.path !== "strip_time") continue;
		if (curve.unsupportedModifiers.length > 0) return null;
		const value = evaluateFCurve(curve, frame);
		if (curve.path === "influence") influence = Math.min(Math.max(value, 0), 1);
		else time = value;
	}
	if ((strip.flag & StripFlag.userInfluence) === 0) influence = blendedInfluence(strip, frame);
	if (keepsTime(strip)) return {
		influence,
		time: frame
	};
	if ((strip.flag & StripFlag.userTime) === 0) time = actionFrame(strip, frame);
	else if ((strip.flag & StripFlag.userTimeCyclic) !== 0) time = (time - strip.actionStart) % (strip.actionEnd - strip.actionStart);
	return {
		influence,
		time
	};
}
/**
* The strip of a list that Blender plays at a frame, as `stripAt` finds it, with its influence and action frame.
* Undefined where none plays, and null where a meta or transition strip plays, or a curve that animates the strip has
* a modifier the reader does not apply.
*/
function playingStrip(list, frame) {
	const found = stripAt(list, frame);
	if (!found || (found.strip.flag & 4096) !== 0) return void 0;
	const chosen = found.strip;
	const settings = controls(chosen, found.time);
	if (!settings) return null;
	if (settings.influence <= 0) return void 0;
	if (chosen.type === StripType.clip) return chosen.action ? {
		strip: chosen,
		...settings
	} : void 0;
	if (chosen.type === StripType.transition) {
		const index = list.strips.indexOf(chosen);
		return index > 0 && index < list.strips.length - 1 ? null : void 0;
	}
	return chosen.type === StripType.meta ? null : {
		strip: chosen,
		...settings
	};
}
/** Blender's `nla_blend_value`. */
function blendValue(mode, lower, upper, influence) {
	if (upper === null) return null;
	if (mode === BlendMode.replace && influence === 1) return upper;
	if (lower === null) return null;
	if (mode === BlendMode.add) return lower + upper * influence;
	if (mode === BlendMode.subtract) return lower - upper * influence;
	if (mode === BlendMode.multiply) return influence * (lower * upper) + (1 - influence) * lower;
	return lower * (1 - influence) + upper * influence;
}
/** Blender's `nla_combine_value`. */
function combineValue(mix, base, lower, upper, influence) {
	if (lower === null || upper === null) return null;
	if (mix === "multiply") return lower * (upper / (isEqual(base, 0) ? 1 : base)) ** influence;
	return lower + (upper - base) * influence;
}
/** Blender's `normalize_qt_qt`, which turns a zero quaternion into a half turn about x. */
function normalized(q) {
	const length = Math.hypot(...q);
	return length === 0 ? [
		0,
		1,
		0,
		0
	] : q.map((value) => value / length);
}
/** Blender's `nla_combine_quaternion`: the lower rotation followed by the upper one raised to the influence. */
function combineQuaternion(lower, upper, influence) {
	const known = (values) => values.every((value) => value !== null);
	if (!known(lower) || !known(upper)) return [
		null,
		null,
		null,
		null
	];
	const [aw = 1, ax = 0, ay = 0, az = 0] = normalized(lower);
	const [uw = 1, ux = 0, uy = 0, uz = 0] = normalized(upper);
	const angle = influence * Math.acos(Math.min(Math.max(uw, -1), 1));
	const axisLength = Math.hypot(ux, uy, uz);
	const sine = axisLength * axisLength > 1e-35 ? Math.sin(angle) / axisLength : 0;
	const [bw, bx, by, bz] = [
		Math.cos(angle),
		ux * sine,
		uy * sine,
		uz * sine
	];
	return [
		aw * bw - ax * bx - ay * by - az * bz,
		aw * bx + ax * bw + ay * bz - az * by,
		aw * by + ay * bw + az * bx - ax * bz,
		aw * bz + az * bw + ax * by - ay * bx
	];
}
/** Blender's `nlasnapshot_blend`: blends a strip's values into those below it, by its blend mode and influence. */
function blendInto(lower, upper, mode, influence) {
	if (isEqual(influence, 0) || !BLEND_MODES.has(mode)) return;
	for (const [path, { property, values, blends }] of upper) {
		const below = lower.get(path) ?? [...property.defaults];
		let result;
		if (mode !== BlendMode.combine) result = below.map((value, i) => blends[i] ? blendValue(mode, value, values[i] ?? null, influence) : value);
		else if (property.mix === "quaternion") result = blends[0] ? combineQuaternion(below, values, influence) : below;
		else result = below.map((value, i) => blends[i] ? combineValue(property.mix, property.defaults[i] ?? 0, value, values[i] ?? null, influence) : value);
		lower.set(path, result);
	}
}
/** The curves of an action's slot that Blender plays, on properties the reader reads, with the value each one sets. */
function playedCurves(action, slot) {
	return (slotFor(action, slot)?.curves ?? []).flatMap((curve) => {
		const property = curve.muted || curve.empty ? null : propertyOf(curve.path);
		if (!property) return [];
		if (property.defaults.length === 1) return [{
			curve,
			property,
			index: 0
		}];
		return curve.index >= 0 && curve.index < property.defaults.length ? [{
			curve,
			property,
			index: curve.index
		}] : [];
	});
}
/**
* Blender's `nlasnapshot_from_action`: the values a strip's action plays at its frame. A quaternion's strip sets all
* four values, the identity's where its action keys fewer. A value is null where its curve, or the strip, has a
* modifier the reader does not apply.
*/
function stripValues(action, playing) {
	const modified = playing.strip.struct !== null && hasActiveModifiers(playing.strip.struct);
	const channels = /* @__PURE__ */ new Map();
	for (const { curve, property, index } of playedCurves(action, playing.strip.slot)) {
		let channel = channels.get(curve.path);
		if (!channel) {
			channel = {
				property,
				values: [...property.defaults],
				blends: property.defaults.map(() => false)
			};
			channels.set(curve.path, channel);
		}
		const supported = !modified && curve.unsupportedModifiers.length === 0;
		channel.values[index] = supported ? evaluateFCurve(curve, playing.time) : null;
		if (property.mix === "quaternion") channel.blends.fill(true);
		else channel.blends[index] = true;
	}
	return channels;
}
/**
* Blender's `animsys_create_tweak_strip`: the tweaked strip as Blender plays it in NLA tweak mode, given `action`, the
* strip's action, or undefined where the reader has not read it.
*/
function tweakStrip(adt, action) {
	const found = adt.deref("actstrip");
	if (!found) return null;
	const strip = stripSettings(found);
	if ((strip.flag & StripFlag.syncLength) !== 0 && strip.type === StripType.clip && action) {
		const previousStart = strip.actionStart;
		[strip.actionStart, strip.actionEnd] = actionRange(action);
		strip.start += (strip.actionStart - previousStart) * strip.scale;
		const mapping = strip.scale * strip.repeat;
		if (!isEqual(mapping, 0)) strip.end = (strip.actionEnd - strip.actionStart) * mapping + strip.start;
	}
	if ((adt.number("flag") & ADT_NLA_EDIT_NOMAP) !== 0 || (strip.flag & StripFlag.userTime) !== 0) {
		strip.extendMode = Extend.hold;
		strip.flag |= StripFlag.noTimeMap;
	}
	return stripOf(strip, null);
}
/**
* Blender's `animsys_calculate_nla`: the values the NLA writes at a frame, by property path. They include the
* defaults of the values that an action on an enabled track, or on the action track, keys and no playing strip sets.
* Undefined where Blender plays the active action as if there were no NLA. Null where an action is not in `actions`,
* as one linked from another file, or where `playingStrip` cannot tell what plays.
*/
function nlaValues(adt, frame, actions) {
	const flag = adt.number("flag");
	const tweaking = (flag & 4) !== 0;
	const active = adt.deref("action");
	if (active && !stripsUnder(adt) && (flag & 5) === 0) return void 0;
	const tracks = adt.list("nla_tracks");
	const actionOf = (struct) => struct ? actions.get(struct.offset) : void 0;
	const tweakedOffset = tracks.find((track) => (track.number("flag") & NLATRACK_DISABLED) !== 0)?.offset;
	const tweakedAction = actionOf(adt.deref("actstrip")?.deref("act") ?? null);
	const playing = [];
	const read = /* @__PURE__ */ new Set();
	for (const track of evaluatedTracks(adt)) {
		const tweaked = track.offset === tweakedOffset ? tweakStrip(adt, tweakedAction) : null;
		if (track.offset === tweakedOffset && !tweaked) return null;
		const played = playingStrip(tweaked ? soleStrip(tweaked) : readTrack(track, read).top, frame);
		if (played === null) return null;
		if (played) playing.push(played);
	}
	const upper = !tweaking || (flag & 32) !== 0;
	const trackAction = tweaking ? adt.deref("tmpact") : active;
	const trackSlot = tweaking ? slotHandle(adt, "tmp_slot_handle") : slotHandle(adt, "slot_handle");
	const playedAction = actionOf(trackAction);
	if (trackAction && upper && !playedAction) return null;
	if (playedAction && upper && (flag & 1) === 0) {
		const actionPlaying = playingStrip(soleStrip(actionTrackStrip(adt, playedAction, trackSlot)), frame);
		if (actionPlaying) playing.push(actionPlaying);
	}
	const domain = /* @__PURE__ */ new Map();
	const added = /* @__PURE__ */ new Set();
	const addToDomain = (struct, slot) => {
		const action = actionOf(struct);
		if (!action) return false;
		const key = `${struct.offset}:${slot}`;
		if (added.has(key)) return true;
		added.add(key);
		for (const { property, index, curve } of playedCurves(action, slot)) {
			const flags = domain.get(curve.path) ?? property.defaults.map(() => false);
			if (property.mix === "quaternion") flags.fill(true);
			else flags[index] = true;
			domain.set(curve.path, flags);
		}
		return true;
	};
	if (trackAction && upper && !addToDomain(trackAction, trackSlot)) return null;
	const enabled = tracks.filter((track) => trackPlays(flag, track, true));
	const visited = /* @__PURE__ */ new Set();
	const pending = enabled.flatMap((track) => unseenList(track, "strips", visited));
	for (let strip = pending.pop(); strip; strip = pending.pop()) {
		const action = strip.deref("act");
		if (action && !addToDomain(action, slotHandle(strip, "action_slot_handle"))) return null;
		for (const inner of unseenList(strip, "strips", visited)) pending.push(inner);
	}
	const values = /* @__PURE__ */ new Map();
	for (const played of playing) {
		if (played.strip.type !== StripType.clip) continue;
		const action = actionOf(played.strip.action);
		if (!action) return null;
		blendInto(values, stripValues(action, played), played.strip.blendMode, played.influence);
	}
	const written = /* @__PURE__ */ new Map();
	for (const [path, flags] of domain) {
		const current = values.get(path) ?? [...propertyOf(path)?.defaults ?? []];
		written.set(path, flags.map((on, index) => on ? current[index] ?? null : null));
	}
	return written;
}
/**
* Blender's `BKE_animsys_evaluate_animdata` at a frame without drivers: the values that an ID's active action and NLA
* write over the ones the file saves, in the order Blender writes them. It leaves out each value whose source the
* reader does not play: one a driver overrides, one from a curve or strip with a modifier the reader does not apply,
* and every value of an ID that plays an action linked from another file, a meta or transition strip.
*/
function animatedValues(id, frame, actions) {
	const adt = id.deref("adt");
	if (!adt) return [];
	const nla = adt.list("nla_tracks").length > 0 && (adt.number("flag") & 2) === 0 ? nlaValues(adt, frame, actions) : void 0;
	if (nla === null) return [];
	let written;
	if (nla) written = [...nla].flatMap(([path, values]) => values.flatMap((value, index) => value === null ? [] : [{
		path,
		index,
		value
	}]));
	else {
		const struct = adt.deref("action");
		const action = struct ? actions.get(struct.offset) : void 0;
		if (!action) return [];
		written = playedCurves(action, slotHandle(adt, "slot_handle")).flatMap(({ curve, index }) => curve.unsupportedModifiers.length > 0 ? [] : [{
			path: curve.path,
			index,
			value: evaluateFCurve(curve, frame)
		}]);
	}
	const driven = new Set(adt.list("drivers").map(readFCurve).filter((driver) => !driver.muted).map((driver) => `${driver.path}[${driver.index}]`));
	return written.filter(({ path, index }) => !driven.has(`${path}[${index}]`));
}
//#endregion
//#region ../../packages/blend/src/anim/timeline.ts
/** The scene's time remapping, which scales every frame Blender evaluates: its `framelen`, or 1 where that is unusable. */
function frameLength(render) {
	const length = render?.number("framelen") ?? 1;
	return Number.isFinite(length) && length > 0 ? length : 1;
}
function sceneTimeline(scene) {
	const render = scene?.struct("r");
	const start = render?.number("sfra") ?? 1;
	return {
		name: scene ? idName(scene) : "",
		start,
		end: render?.number("efra") ?? start,
		frameLength: frameLength(render)
	};
}
//#endregion
//#region ../../packages/blend/src/anim/opening.ts
/** The scene's start frame through its time remapping, as Blender evaluates it after going to that frame. */
function startFrame(scene) {
	const { start, frameLength } = sceneTimeline(scene);
	return start * frameLength;
}
var UNCHANGED = {
	object: (values) => values,
	channel: (_, values) => values
};
function applied(values, played) {
	if (!played) return values;
	const result = cloneValues(values);
	for (const { path, index, value } of played) setTransformProperty(result, path, index, value);
	return result;
}
function poseOf(written) {
	if (written.length === 0) return UNCHANGED;
	const own = [];
	const bones = /* @__PURE__ */ new Map();
	for (const played of written) {
		const pose = parsePosePath(played.path);
		if (pose && isTransformProperty(pose.property, false)) {
			const channel = bones.get(pose.bone);
			if (channel) channel.push({
				...played,
				path: pose.property
			});
			else bones.set(pose.bone, [{
				...played,
				path: pose.property
			}]);
		} else if (!pose && isTransformProperty(played.path, true)) own.push(played);
	}
	return {
		object: (values) => applied(values, own.length > 0 ? own : void 0),
		channel: (bone, values) => applied(values, bones.get(bone))
	};
}
function weightsOf(written) {
	const weights = /* @__PURE__ */ new Map();
	for (const { path, value } of written) {
		const name = parseShapeKeyPath(path);
		if (name !== null) weights.set(name, value);
	}
	return weights;
}
/** The scene's start poses, from the actions `readActions` read. */
function startPoses(scene, actions) {
	const frame = startFrame(scene);
	const byOffset = new Map(actions.map((action) => [action.struct.offset, action]));
	return {
		of: (object) => poseOf(animatedValues(object, frame, byOffset)),
		weights: (key) => weightsOf(animatedValues(key, frame, byOffset))
	};
}
//#endregion
//#region ../../packages/blend/src/scene/modifiers.ts
/** Blender's `eModifierType` values this importer acts on. */
var ModifierType = {
	armature: 8,
	boolean: 11,
	array: 12,
	collision: 23,
	surface: 30,
	screw: 34,
	ocean: 39,
	skin: 42,
	meshSequenceCache: 52,
	fluid: 56,
	nodes: 57,
	volumeToMesh: 60
};
/** Modifiers that change nothing a preview shows, such as physics collision settings. */
var PREVIEW_NEUTRAL = /* @__PURE__ */ new Set([ModifierType.collision, ModifierType.surface]);
var MODE_REALTIME = 1;
/** The `ModifierData` header every modifier struct starts with. */
function modifierHeader(modifier) {
	return modifier.typeName === "ModifierData" ? modifier : modifier.struct("modifier");
}
function modifierType(modifier) {
	return modifierHeader(modifier)?.number("type") ?? -1;
}
function modifierName(modifier) {
	return modifierHeader(modifier)?.string("name") ?? "";
}
/**
* The object's modifiers that are on in viewports, in stack order. Each object's list is read once. Blender gives each
* modifier to one object, so a list ends before a modifier that another object's list holds.
*/
function viewportModifiers(object) {
	return ownedList(object, "modifiers").filter((modifier) => {
		return ((modifierHeader(modifier)?.number("mode") ?? 0) & MODE_REALTIME) !== 0;
	});
}
/** Whether a modifier changes what a preview shows. */
function changesPreview(modifier) {
	return !PREVIEW_NEUTRAL.has(modifierType(modifier));
}
//#endregion
//#region ../../packages/blend/src/scene/shader-graph.ts
/** Blender's `eNodeSocketDatatype`. */
var SocketType = {
	float: 0,
	vector: 1,
	color: 2,
	shader: 3,
	boolean: 4,
	int: 6,
	geometry: 10,
	bundle: 17,
	closure: 18
};
var NODE_MUTED = 512;
var SOCK_UNAVAILABLE = 8;
var SOCK_NO_INTERNAL_LINK = 512;
var LINK_MUTED = 16;
/** Rec. 709 luminance, which Blender's default color management uses to turn a color into a value. */
var LUMINANCE = [
	.2126,
	.7152,
	.0722
];
function graphOf(tree) {
	const linksTo = /* @__PURE__ */ new Map();
	for (const link of tree.list("links")) {
		if (link.pointer("tosock") === 0n) continue;
		const target = link.deref("tosock");
		if (!target) continue;
		const links = linksTo.get(target.offset);
		if (links) links.push(link);
		else linksTo.set(target.offset, [link]);
	}
	return {
		nodes: tree.list("nodes"),
		linksTo
	};
}
function nodeType(node) {
	return node.string("idname");
}
/** The Group Output node that gives a node group its outputs: the active one, or the first. */
function groupOutput(nodes) {
	const outputs = nodes.filter((node) => nodeType(node) === "NodeGroupOutput");
	return outputs.find((node) => (node.number("flag") & 64) !== 0) ?? outputs[0] ?? null;
}
function nodeLabel(node) {
	return node.string("name") || nodeType(node);
}
function socketName(socket) {
	return socket.string("identifier") || socket.string("name");
}
function socketType(socket) {
	return socket.number("type");
}
function available(socket) {
	return (socket.number("flag") & SOCK_UNAVAILABLE) === 0;
}
function isMuted(node) {
	return (node.number("flag") & NODE_MUTED) !== 0;
}
function socketIn(sockets, names) {
	for (const name of names) {
		const found = sockets.find((socket) => socketName(socket) === name || socket.string("name") === name);
		if (found) return found;
	}
	return null;
}
function inputSocket(node, ...names) {
	return socketIn(node.list("inputs"), names);
}
function outputSocket(node, ...names) {
	return socketIn(node.list("outputs"), names);
}
/** For each output type, the input types a muted node passes to it, the best match last. */
var PASS_RANKS = {
	[SocketType.color]: [
		SocketType.boolean,
		SocketType.int,
		SocketType.float,
		SocketType.color
	],
	[SocketType.vector]: [
		SocketType.boolean,
		SocketType.int,
		SocketType.float,
		SocketType.vector
	],
	[SocketType.float]: [
		SocketType.vector,
		SocketType.color,
		SocketType.boolean,
		SocketType.int,
		SocketType.float
	]
};
/** Blender's `get_internal_link_type_priority`: how well an input of one type passes through to an output. */
function passPriority(from, to) {
	const rank = PASS_RANKS[to];
	if (!rank) return from === to ? 1 : -1;
	const index = rank.indexOf(from);
	return index < 0 ? -1 : index + 1;
}
/**
* The input a muted node passes to `output`, as Blender picks it: the best matching type, and a linked input over an
* unlinked one.
*/
function passedInput(graph, node, output) {
	if ((output.number("flag") & SOCK_NO_INTERNAL_LINK) !== 0) return null;
	let selected = null;
	let selectedPriority = -1;
	let selectedLinked = false;
	for (const input of node.list("inputs")) {
		if (!available(input) || (input.number("flag") & SOCK_NO_INTERNAL_LINK) !== 0) continue;
		const priority = passPriority(socketType(input), socketType(output));
		if (priority < 0) continue;
		const linked = graph.linksTo.has(input.offset);
		if (priority <= selectedPriority && !(linked && !selectedLinked)) continue;
		selected = input;
		selectedPriority = priority;
		selectedLinked = linked;
	}
	return selected;
}
/** For each graph, the node output each input socket reads through reroutes and muted nodes, or null, by its offset. */
var passedOutputs = /* @__PURE__ */ new WeakMap();
/**
* One step upstream from an input: the node output it reads, or the input that the reroute or muted node it reads
* passes on, or null for neither. A muted link, or a reroute or muted node that passes on no link, leaves neither.
*/
function readFrom(graph, input) {
	const link = graph.linksTo.get(input.offset)?.[0];
	if (!link || !available(input) || (link.number("flag") & LINK_MUTED) !== 0) return { passedOn: null };
	const node = link.deref("fromnode");
	const output = link.deref("fromsock");
	if (!node || !output || !available(output)) return { passedOn: null };
	if (nodeType(node) !== "NodeReroute" && !isMuted(node)) return {
		node,
		socket: output,
		name: socketName(output)
	};
	return { passedOn: (nodeType(node) === "NodeReroute" ? node.list("inputs")[0] : passedInput(graph, node, output)) ?? null };
}
/**
* The node output an input reads, looking through reroutes and muted nodes as Blender does, however many there are, or
* null where they lead to none or loop, as Blender leaves out a loop's links. Every input on the way reads the same
* output, so each is looked through once for a graph.
*/
function passedOutput(graph, socket) {
	let known = passedOutputs.get(graph);
	if (!known) {
		known = /* @__PURE__ */ new Map();
		passedOutputs.set(graph, known);
	}
	const passed = /* @__PURE__ */ new Set();
	let found = null;
	for (let input = socket; input !== null && !passed.has(input.offset);) {
		const answer = known.get(input.offset);
		if (answer !== void 0) {
			found = answer;
			break;
		}
		passed.add(input.offset);
		const step = readFrom(graph, input);
		if ("node" in step) {
			found = step;
			break;
		}
		input = step.passedOn;
	}
	for (const offset of passed) known.set(offset, found);
	return found;
}
/** Where an input's value comes from: the node output it reads, or else its own value. */
function sourceOf(graph, socket) {
	const output = passedOutput(graph, socket);
	return output ? {
		kind: "output",
		...output
	} : {
		kind: "value",
		socket
	};
}
/**
* The node outputs that a node's inputs read through every link Blender evaluates, without looking through reroutes
* or muted nodes.
*/
function feedingOutputs(graph, node) {
	return node.list("inputs").flatMap((input) => (available(input) ? graph.linksTo.get(input.offset) ?? [] : []).flatMap((link) => {
		const from = link.deref("fromnode");
		const socket = link.deref("fromsock");
		return from && socket && available(socket) && (link.number("flag") & LINK_MUTED) === 0 ? [{
			node: from,
			socket
		}] : [];
	}));
}
/** The node output an input reads, or null when the input keeps a value. */
function linkedOutput(graph, socket) {
	return socket ? passedOutput(graph, socket) : null;
}
/** The value set on a socket, as Blender stores it for the socket's type. */
function socketValue(socket) {
	const value = socket.deref("default_value");
	if (!value?.has("value")) return [];
	const type = socketType(socket);
	if (type === SocketType.vector || type === SocketType.color) return value.numbers("value");
	return [value.number("value")];
}
/** Blender's implicit conversion between socket types. */
function convertValue(values, from, to) {
	const scalar = () => {
		if (from === SocketType.color) return LUMINANCE.reduce((sum, weight, index) => sum + weight * (values[index] ?? 0), 0);
		if (from === SocketType.vector) return ((values[0] ?? 0) + (values[1] ?? 0) + (values[2] ?? 0)) / 3;
		return values[0] ?? 0;
	};
	const triple = () => {
		if (from === SocketType.color || from === SocketType.vector) return [
			values[0] ?? 0,
			values[1] ?? 0,
			values[2] ?? 0
		];
		const value = values[0] ?? 0;
		return [
			value,
			value,
			value
		];
	};
	if (to === SocketType.color) return [...triple(), from === SocketType.color ? values[3] ?? 1 : 1];
	if (to === SocketType.vector) return triple();
	return [scalar()];
}
var CONSTANT_NODES = /* @__PURE__ */ new Set(["ShaderNodeRGB", "ShaderNodeValue"]);
/** The first version whose EEVEE gives an Image Texture node without an image an alpha of 1, as Cycles does, not 0. */
var OPAQUE_EMPTY_IMAGES = 502;
/** Whether a node is an Image Texture node without an image, which EEVEE shows as black. */
function isEmptyImageNode(node) {
	return nodeType(node) === "ShaderNodeTexImage" && node.deref("id") === null;
}
/** What an output of an Image Texture node without an image gives, as EEVEE renders it. */
function emptyImageOutput(node, output) {
	if (output !== "Alpha") return [
		0,
		0,
		0,
		0
	];
	return [node.file.version >= OPAQUE_EMPTY_IMAGES ? 1 : 0];
}
/**
* The value an input takes when it is constant: its own value, an RGB or Value node's, or what an Image Texture node
* without an image gives, converted to the input's type or to `type`. Null when other nodes drive it.
*/
function constantOf(graph, socket, type = socket ? socketType(socket) : SocketType.float) {
	if (!socket) return null;
	const source = sourceOf(graph, socket);
	if (source.kind === "output" && isEmptyImageNode(source.node)) return convertValue(emptyImageOutput(source.node, source.name), socketType(source.socket), type);
	if (source.kind === "output" && !CONSTANT_NODES.has(nodeType(source.node))) return null;
	const values = socketValue(source.socket);
	if (values.length === 0) return null;
	return convertValue(values, socketType(source.socket), type);
}
/**
* The node outputs Blender evaluates for an output node, by the socket's offset: those its inputs read, directly or
* through the nodes that feed them.
*/
function readOutputs(graph, output) {
	const read = /* @__PURE__ */ new Set();
	const reached = /* @__PURE__ */ new Set([output.offset]);
	const pending = [output];
	for (let node = pending.pop(); node; node = pending.pop()) for (const input of node.list("inputs")) {
		const source = linkedOutput(graph, input);
		if (!source) continue;
		read.add(source.socket.offset);
		if (reached.has(source.node.offset)) continue;
		reached.add(source.node.offset);
		pending.push(source.node);
	}
	return read;
}
/** For each graph and node type, the first node of the type that drives each node searched, by the node's offset. */
var upstreamFound = /* @__PURE__ */ new WeakMap();
function upstreamMemo(graph, type) {
	let byType = upstreamFound.get(graph);
	if (!byType) {
		byType = /* @__PURE__ */ new Map();
		upstreamFound.set(graph, byType);
	}
	let found = byType.get(type);
	if (!found) {
		found = /* @__PURE__ */ new Map();
		byType.set(type, found);
	}
	return found;
}
/**
* The first node of `type` that drives the input, searching upstream through every input in order, depth first. Each
* node of a graph is searched once, however many inputs and searches share it.
*/
function upstreamNode(graph, socket, type) {
	const start = linkedOutput(graph, socket)?.node;
	if (!start) return null;
	const found = upstreamMemo(graph, type);
	const open = /* @__PURE__ */ new Set();
	const stack = [];
	const enter = (node) => {
		if (nodeType(node) === type) {
			found.set(node.offset, node);
			return;
		}
		open.add(node.offset);
		stack.push({
			node,
			inputs: node.list("inputs"),
			next: 0
		});
	};
	const finish = (node, result) => {
		found.set(node.offset, result);
		open.delete(node.offset);
		stack.pop();
	};
	if (!found.has(start.offset)) enter(start);
	for (let top = stack.at(-1); top; top = stack.at(-1)) {
		const input = top.inputs[top.next];
		if (!input) {
			finish(top.node, null);
			continue;
		}
		const source = linkedOutput(graph, input)?.node;
		if (source && !open.has(source.offset) && !found.has(source.offset)) {
			enter(source);
			continue;
		}
		const result = source ? found.get(source.offset) ?? null : null;
		if (result) finish(top.node, result);
		else top.next++;
	}
	return found.get(start.offset) ?? null;
}
//#endregion
//#region ../../packages/blend/src/scene/normals.ts
var PI2 = Math.PI * 2;
/** Blender's `LNOR_SPACE_TRIGO_THRESHOLD`. */
var TRIGO_THRESHOLD = .9999;
var UNSET$1 = -2147483648;
var INVALID = -1;
function at(values, index) {
	return values[index] ?? 0;
}
function vertex(positions, index) {
	return [
		at(positions, index * 3),
		at(positions, index * 3 + 1),
		at(positions, index * 3 + 2)
	];
}
function sub$1(a, b) {
	return [
		a[0] - b[0],
		a[1] - b[1],
		a[2] - b[2]
	];
}
function dot$1(a, b) {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function cross$1(a, b) {
	return [
		a[1] * b[2] - a[2] * b[1],
		a[2] * b[0] - a[0] * b[2],
		a[0] * b[1] - a[1] * b[0]
	];
}
function scaled(a, factor) {
	return [
		a[0] * factor,
		a[1] * factor,
		a[2] * factor
	];
}
function lengthOf(a) {
	return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
}
function normalize(a) {
	const length = lengthOf(a);
	return length > 0 ? [
		a[0] / length,
		a[1] / length,
		a[2] / length
	] : [
		0,
		0,
		0
	];
}
/** Blender's `safe_acos_approx`, which its normal code uses to weigh faces by corner angle. */
function acosApprox(x) {
	const f = Math.abs(x);
	const m = f < 1 ? 1 - (1 - f) : 1;
	const a = Math.sqrt(1 - m) * (1.5707963267 + m * (-.213300989 + m * (.077980478 + m * -.02164095)));
	return x < 0 ? Math.PI - a : a;
}
function store(target, index, value) {
	target[index * 3] = value[0];
	target[index * 3 + 1] = value[1];
	target[index * 3 + 2] = value[2];
}
function read(source, index) {
	return [
		at(source, index * 3),
		at(source, index * 3 + 1),
		at(source, index * 3 + 2)
	];
}
/** Face normals as Blender computes them: a cross product for triangles and quads, Newell's method otherwise. */
function faceNormals(mesh) {
	const { positions, faceOffsets, cornerVerts } = mesh;
	const normals = new Float32Array(mesh.faceCount * 3);
	for (let f = 0; f < mesh.faceCount; f++) {
		const start = at(faceOffsets, f);
		const size = at(faceOffsets, f + 1) - start;
		const v = (k) => vertex(positions, at(cornerVerts, start + k));
		let normal;
		if (size === 3) normal = cross$1(sub$1(v(0), v(1)), sub$1(v(1), v(2)));
		else if (size === 4) normal = cross$1(sub$1(v(0), v(2)), sub$1(v(1), v(3)));
		else {
			normal = [
				0,
				0,
				0
			];
			let previous = v(size - 1);
			for (let k = 0; k < size; k++) {
				const current = v(k);
				normal[0] += (previous[1] - current[1]) * (previous[2] + current[2]);
				normal[1] += (previous[2] - current[2]) * (previous[0] + current[0]);
				normal[2] += (previous[0] - current[0]) * (previous[1] + current[1]);
				previous = current;
			}
		}
		const unit = normalize(normal);
		store(normals, f, lengthOf(unit) === 0 ? [
			0,
			0,
			1
		] : unit);
	}
	return normals;
}
/**
* Vertex normals: face normals weighted by the angle of each face's corner at the vertex. As in Blender, a vertex
* without faces points away from the origin, and one whose corner angles are all zero has no normal.
*/
function vertexNormals(mesh, faces) {
	const { positions, faceOffsets, cornerVerts } = mesh;
	const sums = new Float64Array(mesh.vertexCount * 3);
	const inFace = new Uint8Array(mesh.vertexCount);
	for (let f = 0; f < mesh.faceCount; f++) {
		const start = at(faceOffsets, f);
		const end = at(faceOffsets, f + 1);
		if (end - start < 3) continue;
		const normal = read(faces, f);
		for (let c = start; c < end; c++) {
			const current = at(cornerVerts, c);
			inFace[current] = 1;
			const previous = at(cornerVerts, c === start ? end - 1 : c - 1);
			const next = at(cornerVerts, c + 1 === end ? start : c + 1);
			const here = vertex(positions, current);
			const weight = acosApprox(dot$1(normalize(sub$1(vertex(positions, previous), here)), normalize(sub$1(vertex(positions, next), here))));
			sums[current * 3] = at(sums, current * 3) + normal[0] * weight;
			sums[current * 3 + 1] = at(sums, current * 3 + 1) + normal[1] * weight;
			sums[current * 3 + 2] = at(sums, current * 3 + 2) + normal[2] * weight;
		}
	}
	const normals = new Float32Array(mesh.vertexCount * 3);
	for (let v = 0; v < mesh.vertexCount; v++) {
		let normal = normalize([
			at(sums, v * 3),
			at(sums, v * 3 + 1),
			at(sums, v * 3 + 2)
		]);
		if (!inFace[v]) normal = normalize(vertex(positions, v));
		store(normals, v, normal);
	}
	return normals;
}
/** Blender's `corner_fan_space_define`: the frame custom normal data is relative to. */
function defineSpace(lnor, vecRef, vecOther, edgeVectors) {
	const dotRef = dot$1(vecRef, lnor);
	const dotOther = dot$1(vecOther, lnor);
	if (Math.abs(dotRef) >= TRIGO_THRESHOLD || Math.abs(dotOther) >= TRIGO_THRESHOLD) return {
		lnor,
		ref: [
			0,
			0,
			0
		],
		ortho: [
			0,
			0,
			0
		],
		alpha: 0,
		beta: 0
	};
	let alpha;
	if (edgeVectors.length > 0) {
		let sum = 0;
		for (const edge of edgeVectors) sum += acosApprox(dot$1(edge, lnor));
		alpha = sum / edgeVectors.length;
	} else alpha = (acosApprox(dotRef) + acosApprox(dotOther)) / 2;
	const ref = normalize(sub$1(vecRef, scaled(lnor, dotRef)));
	const ortho = normalize(cross$1(lnor, ref));
	const other = normalize(sub$1(vecOther, scaled(lnor, dotOther)));
	const cosine = dot$1(ref, other);
	let beta = PI2;
	if (cosine < TRIGO_THRESHOLD) {
		const angle = acosApprox(cosine);
		beta = dot$1(ortho, other) < 0 ? PI2 - angle : angle;
	}
	return {
		lnor,
		ref,
		ortho,
		alpha,
		beta
	};
}
/** Blender's `corner_space_custom_data_to_normal`. */
function customNormal(space, alphaData, betaData) {
	if (alphaData === 0 || space.alpha === 0 || space.beta === 0) return space.lnor;
	const alphaFactor = alphaData / 32767;
	const alpha = (alphaFactor > 0 ? space.alpha : PI2 - space.alpha) * alphaFactor;
	const betaFactor = betaData / 32767;
	const result = scaled(space.lnor, Math.cos(alpha));
	const sinAlpha = Math.sin(alpha);
	if (betaFactor === 0) return [
		result[0] + space.ref[0] * sinAlpha,
		result[1] + space.ref[1] * sinAlpha,
		result[2] + space.ref[2] * sinAlpha
	];
	const beta = (betaFactor > 0 ? space.beta : PI2 - space.beta) * betaFactor;
	const a = sinAlpha * Math.cos(beta);
	const b = sinAlpha * Math.sin(beta);
	return [
		result[0] + space.ref[0] * a + space.ortho[0] * b,
		result[1] + space.ref[1] * a + space.ortho[1] * b,
		result[2] + space.ref[2] * a + space.ortho[2] * b
	];
}
function isSharp(edgeToCorners, edge) {
	if (edge < 0) return true;
	const second = at(edgeToCorners, edge * 2 + 1);
	return second === UNSET$1 || second === INVALID;
}
/**
* Blender's `build_edge_to_corner_map_with_flip_and_sharp`: the first two corners of each edge, with the second set to
* INVALID for a sharp edge, an edge of a flat face, an edge with more than two faces or between faces that wind
* opposite ways, and left UNSET for a boundary edge.
*/
function edgeToCorners(mesh, faceOf, sharpFace, sharpEdge) {
	const map = new Int32Array(mesh.edgeCount * 2);
	const touched = new Uint8Array(mesh.edgeCount);
	for (let corner = 0; corner < mesh.cornerCount; corner++) {
		const edge = at(mesh.cornerEdges, corner);
		if (edge < 0) continue;
		const face = at(faceOf, corner);
		const vert = at(mesh.cornerVerts, corner);
		if (!touched[edge]) {
			touched[edge] = 1;
			map[edge * 2] = corner;
			map[edge * 2 + 1] = sharpFace(face) ? INVALID : UNSET$1;
		} else if (at(map, edge * 2 + 1) === UNSET$1) {
			const first = at(map, edge * 2);
			if (sharpFace(face) || sharpEdge(edge, first, face) || vert === at(mesh.cornerVerts, first)) map[edge * 2 + 1] = INVALID;
			else map[edge * 2 + 1] = corner;
		} else if (!isSharp(map, edge)) map[edge * 2 + 1] = INVALID;
	}
	return map;
}
function facePrevious(mesh, faceOf, corner) {
	const face = at(faceOf, corner);
	return corner === at(mesh.faceOffsets, face) ? at(mesh.faceOffsets, face + 1) - 1 : corner - 1;
}
function faceNext(mesh, faceOf, corner) {
	const face = at(faceOf, corner);
	const end = at(mesh.faceOffsets, face + 1);
	return corner + 1 === end ? at(mesh.faceOffsets, face) : corner + 1;
}
/** Blender's `loop_manifold_fan_around_vert_next`: steps across `edge` to the next corner of the fan. */
function fanNext(mesh, faceOf, map, edge, pivot, state) {
	const origVert = at(mesh.cornerVerts, state.curr);
	const first = at(map, edge * 2);
	const second = at(map, edge * 2 + 1);
	const next = first === state.curr ? second : first;
	const nextVert = at(mesh.cornerVerts, next);
	if (origVert === nextVert && origVert === pivot || origVert !== nextVert && origVert !== pivot) {
		state.vert = next;
		state.curr = facePrevious(mesh, faceOf, next);
	} else {
		state.curr = faceNext(mesh, faceOf, next);
		state.vert = state.curr;
	}
}
function otherVertex(mesh, edge, vert) {
	const a = at(mesh.edges, edge * 2);
	return a === vert ? at(mesh.edges, edge * 2 + 1) : a;
}
/** Blender's `corner_split_generator_check_cyclic_smooth_fan`. */
function startsCyclicFan(mesh, faceOf, map, skip, corner, previous) {
	const pivot = at(mesh.cornerVerts, corner);
	const state = {
		curr: previous,
		vert: corner
	};
	let edge = at(mesh.cornerEdges, previous);
	if (isSharp(map, edge)) return false;
	skip[corner] = 1;
	for (;;) {
		fanNext(mesh, faceOf, map, edge, pivot, state);
		edge = at(mesh.cornerEdges, state.curr);
		if (isSharp(map, edge)) return false;
		if (skip[state.vert]) return state.vert === corner;
		skip[state.vert] = 1;
	}
}
/** Normals of each face corner, the way Blender shades the mesh. */
function cornerNormals(mesh, options) {
	const faces = faceNormals(mesh);
	const verts = vertexNormals(mesh, faces);
	const result = new Float32Array(mesh.cornerCount * 3);
	const faceOf = new Int32Array(mesh.cornerCount);
	for (let f = 0; f < mesh.faceCount; f++) faceOf.fill(f, at(mesh.faceOffsets, f), at(mesh.faceOffsets, f + 1));
	const sharpFace = (face) => options.sharpFaces ? at(options.sharpFaces, face) !== 0 : false;
	const anySharpFace = options.sharpFaces?.some((value) => value !== 0) ?? false;
	const allSharpFaces = mesh.faceCount > 0 && (options.sharpFaces?.every((value) => value !== 0) ?? false);
	const anySharpEdge = options.sharpEdges?.some((value) => value !== 0) ?? false;
	const splitAngle = options.customNormals ? null : options.autoSmoothAngle;
	if (!options.customNormals && splitAngle === null && !anySharpEdge && !anySharpFace) {
		for (let c = 0; c < mesh.cornerCount; c++) store(result, c, read(verts, at(mesh.cornerVerts, c)));
		return result;
	}
	if (!options.customNormals && allSharpFaces) {
		for (let c = 0; c < mesh.cornerCount; c++) store(result, c, read(faces, at(faceOf, c)));
		return result;
	}
	const splitCosine = splitAngle === null ? -1 : Math.cos(splitAngle);
	const map = edgeToCorners(mesh, faceOf, sharpFace, (edge, firstCorner, face) => {
		if (options.sharpEdges && at(options.sharpEdges, edge) !== 0) return true;
		if (splitAngle === null) return false;
		return dot$1(read(faces, at(faceOf, firstCorner)), read(faces, face)) < splitCosine;
	});
	for (let c = 0; c < mesh.cornerCount; c++) store(result, c, read(verts, at(mesh.cornerVerts, c)));
	const custom = options.customNormals;
	const skip = new Uint8Array(mesh.cornerCount);
	for (let face = 0; face < mesh.faceCount; face++) {
		const start = at(mesh.faceOffsets, face);
		const end = at(mesh.faceOffsets, face + 1);
		for (let corner = start; corner < end; corner++) {
			const previous = corner === start ? end - 1 : corner - 1;
			const edge = at(mesh.cornerEdges, corner);
			const previousEdge = at(mesh.cornerEdges, previous);
			if (!isSharp(map, edge) && (skip[corner] || !startsCyclicFan(mesh, faceOf, map, skip, corner, previous))) continue;
			if (isSharp(map, edge) && isSharp(map, previousEdge)) singleCorner(mesh, faces, face, corner, previous, custom, result);
			else fanCorners(mesh, faceOf, map, faces, corner, previous, custom, result);
		}
	}
	return result;
}
function singleCorner(mesh, faces, face, corner, previous, custom, result) {
	const normal = read(faces, face);
	if (!custom) {
		store(result, corner, normal);
		return;
	}
	const pivot = at(mesh.cornerVerts, corner);
	const here = vertex(mesh.positions, pivot);
	const nextVert = otherVertex(mesh, at(mesh.cornerEdges, corner), pivot);
	const previousVert = otherVertex(mesh, at(mesh.cornerEdges, previous), pivot);
	store(result, corner, normalize(customNormal(defineSpace(normal, normalize(sub$1(vertex(mesh.positions, nextVert), here)), normalize(sub$1(vertex(mesh.positions, previousVert), here)), []), at(custom, corner * 2), at(custom, corner * 2 + 1))));
}
/** Blender's `split_corner_normal_fan_do`: walks the smooth fan that starts at `corner`. */
function fanCorners(mesh, faceOf, map, faces, corner, previous, custom, result) {
	const pivot = at(mesh.cornerVerts, corner);
	const here = vertex(mesh.positions, pivot);
	const edgeOrig = at(mesh.cornerEdges, corner);
	const vecOrg = normalize(sub$1(vertex(mesh.positions, otherVertex(mesh, edgeOrig, pivot)), here));
	let vecPrev = vecOrg;
	let vecCurr = vecOrg;
	const edgeVectors = [vecOrg];
	const processed = [];
	let sum = [
		0,
		0,
		0
	];
	const state = {
		curr: previous,
		vert: corner
	};
	for (let guard = 0; guard <= mesh.cornerCount; guard++) {
		const edge = at(mesh.cornerEdges, state.curr);
		vecCurr = normalize(sub$1(vertex(mesh.positions, otherVertex(mesh, edge, pivot)), here));
		const weight = acosApprox(dot$1(vecCurr, vecPrev));
		const normal = read(faces, at(faceOf, state.curr));
		sum = [
			sum[0] + normal[0] * weight,
			sum[1] + normal[1] * weight,
			sum[2] + normal[2] * weight
		];
		processed.push(state.vert);
		if (edge !== edgeOrig) edgeVectors.push(vecCurr);
		if (isSharp(map, edge) || edge === edgeOrig) break;
		vecPrev = vecCurr;
		fanNext(mesh, faceOf, map, edge, pivot, state);
	}
	let lnor = normalize(sum);
	const valid = lengthOf(lnor) > 0;
	if (!custom) {
		if (valid) for (const member of processed) store(result, member, lnor);
		return;
	}
	if (!valid) lnor = read(result, state.vert);
	const space = defineSpace(lnor, vecOrg, vecCurr, edgeVectors);
	let alpha = at(custom, (processed[0] ?? corner) * 2);
	let beta = at(custom, (processed[0] ?? corner) * 2 + 1);
	if (processed.some((member) => at(custom, member * 2) !== alpha || at(custom, member * 2 + 1) !== beta)) {
		let alphaSum = 0;
		let betaSum = 0;
		for (const member of processed) {
			alphaSum += at(custom, member * 2);
			betaSum += at(custom, member * 2 + 1);
		}
		alpha = Math.trunc(alphaSum / processed.length);
		beta = Math.trunc(betaSum / processed.length);
	}
	const normal = normalize(customNormal(space, alpha, beta));
	for (const member of processed) store(result, member, normal);
}
/** Normals for each corner from free custom normals stored on any domain. */
function freeCornerNormals(mesh, domain, values) {
	if (domain === "edge") return null;
	const result = new Float32Array(mesh.cornerCount * 3);
	for (let f = 0; f < mesh.faceCount; f++) for (let c = at(mesh.faceOffsets, f); c < at(mesh.faceOffsets, f + 1); c++) {
		const index = domain === "corner" ? c : domain === "point" ? at(mesh.cornerVerts, c) : f;
		store(result, c, normalize(read(values, index)));
	}
	return result;
}
//#endregion
//#region ../../packages/blend/src/scene/smooth-by-angle.ts
var PROPERTY_INT = 1;
var PROPERTY_FLOAT = 2;
var PROPERTY_DOUBLE = 8;
var PROPERTY_BOOLEAN = 10;
var DEFAULT_ANGLE = Math.PI / 6;
var DOMAIN_EDGE = 1;
var DOMAIN_FACE = 2;
var BOOLEAN_AND = 0;
var BOOLEAN_OR = 1;
var COMPARE_LESS_EQUAL = 1;
/**
* The node groups Blender adds for auto smooth, the Essentials asset and the one versioning makes, by name and with
* their inputs. Only a group linked from a file this one does not hold is known by its name.
*/
var LINKED_GROUPS = [{
	name: /^Smooth by Angle(\.\d+)?$/,
	inputs: {
		angle: "Input_1",
		ignoreSharpness: "Socket_1"
	}
}, {
	name: /^Auto Smooth(\.\d+)?$/,
	inputs: {
		angle: "Socket_2",
		ignoreSharpness: null
	}
}];
/** A number in a modifier's ID property group, or null when it has no such property. */
function propertyValue(group, name) {
	for (const property of group?.struct("data")?.list("group") ?? []) {
		if (property.string("name") !== name) continue;
		const data = property.struct("data");
		const field = data?.field("val");
		if (!data || !field) return null;
		const offset = data.offset + field.offset;
		const { view, little } = property.file;
		switch (property.number("type")) {
			case PROPERTY_INT:
			case PROPERTY_BOOLEAN: return view.getInt32(offset, little);
			case PROPERTY_FLOAT: return view.getFloat32(offset, little);
			case PROPERTY_DOUBLE: return view.getFloat64(offset, little);
			default: return null;
		}
	}
	return null;
}
var SOCKET_INPUT = 1;
function panelItems(panel) {
	const items = panel.target("items_array");
	const held = items ? Math.floor(items.size / panel.file.pointerSize) : 0;
	return {
		panel,
		items,
		count: Math.min(Math.max(panel.number("items_num"), 0), held),
		next: 0
	};
}
/**
* The input sockets of a node group's interface in Blender's order, each panel's in its place. Panels are read on a
* stack of their own, however deep they nest, and each once.
*/
function groupInputs(group) {
	const root = group.struct("tree_interface")?.struct("root_panel");
	if (!root) return [];
	const inputs = [];
	const seen = /* @__PURE__ */ new Set([root.offset]);
	const panels = [panelItems(root)];
	for (let top = panels.at(-1); top; top = panels.at(-1)) {
		if (!top.items || top.next >= top.count) {
			panels.pop();
			continue;
		}
		const { file } = top.panel;
		const address = file.pointerAt(top.items.offset + top.next * file.pointerSize);
		top.next++;
		const item = file.first(top.panel.resolve(address));
		if (item?.typeName === "bNodeTreeInterfacePanel" && !seen.has(item.offset)) {
			seen.add(item.offset);
			panels.push(panelItems(item));
		} else if (item?.typeName === "bNodeTreeInterfaceSocket" && (item.number("flag") & SOCKET_INPUT) !== 0) inputs.push(item);
	}
	return inputs;
}
/** The identifier of the group input of `type` that a socket reads, or null when it reads anything else. */
function groupInput(graph, socket, type) {
	const source = linkedOutput(graph, socket);
	if (!source || nodeType(source.node) !== "NodeGroupInput" || socketType(source.socket) !== type) return null;
	return source.name;
}
/** The two inputs of the Boolean Math node with `operation` that a socket reads, in both orders, or none. */
function operands(graph, socket, operation) {
	const node = linkedOutput(graph, socket)?.node;
	if (!node || nodeType(node) !== "FunctionNodeBooleanMath" || node.number("custom1") !== operation) return [];
	const [a, b] = node.list("inputs");
	return a && b ? [[a, b], [b, a]] : [];
}
/**
* Whether a socket reads a smooth flag from a node of `type`, alone or ORed with a group input, as the auto smooth
* groups' Ignore Sharpness switch does. Null when it reads anything else.
*/
function smoothFlag(graph, socket, type) {
	const source = linkedOutput(graph, socket);
	if (source && nodeType(source.node) === type) return { ignoreSharpness: null };
	for (const [flag, other] of operands(graph, socket, BOOLEAN_OR)) {
		const read = linkedOutput(graph, flag);
		const input = groupInput(graph, other, SocketType.boolean);
		if (read && nodeType(read.node) === type && input) return { ignoreSharpness: input };
	}
	return null;
}
/** The group input that a socket compares each edge's angle with, as `angle <= input`, or null. */
function angleLimit(graph, socket) {
	const node = linkedOutput(graph, socket)?.node;
	if (!node || nodeType(node) !== "FunctionNodeCompare") return null;
	const settings = node.deref("storage");
	if (settings?.number("data_type") !== SocketType.float || settings.number("operation") !== COMPARE_LESS_EQUAL) return null;
	const angle = linkedOutput(graph, inputSocket(node, "A"));
	return angle?.name === "Unsigned Angle" && nodeType(angle.node) === "GeometryNodeInputMeshEdgeAngle" ? groupInput(graph, inputSocket(node, "B"), SocketType.float) : null;
}
function setsSmooth(node, domain) {
	return node !== void 0 && nodeType(node) === "GeometryNodeSetShadeSmooth" && node.number("custom1") === domain;
}
function alwaysOn(graph, node, ...names) {
	return names.every((name) => {
		const socket = inputSocket(node, name);
		return socket !== null && !linkedOutput(graph, socket) && socketValue(socket)[0] === 1;
	});
}
/**
* The inputs of a node group wired as Blender's auto smooth groups are, or null for any other group. The Essentials'
* Smooth by Angle and the "Auto Smooth" group that versioning makes are wired alike, the second without the Ignore
* Sharpness switch, and do what `applySmoothByAngle` does. The modifier gives the object's mesh only to a group whose
* first input is a geometry.
*/
function wiredInputs(group) {
	const nodes = group.list("nodes");
	if (nodes.length === 0) return isLinked(group) ? LINKED_GROUPS.find(({ name }) => name.test(idName(group)))?.inputs ?? null : null;
	const graph = graphOf(group);
	const result = groupOutput(nodes)?.list("inputs")[0] ?? null;
	if (!result || socketType(result) !== SocketType.geometry) return null;
	const faces = linkedOutput(graph, result)?.node;
	if (!setsSmooth(faces, DOMAIN_FACE) || !alwaysOn(graph, faces, "Selection", "Shade Smooth")) return null;
	const edges = linkedOutput(graph, inputSocket(faces, "Geometry"))?.node;
	if (!setsSmooth(edges, DOMAIN_EDGE)) return null;
	const [mesh] = groupInputs(group);
	const read = groupInput(graph, inputSocket(edges, "Geometry"), SocketType.geometry);
	const selection = smoothFlag(graph, inputSocket(edges, "Selection"), "GeometryNodeInputEdgeSmooth");
	if (mesh?.text("socket_type") !== "NodeSocketGeometry" || read !== mesh.text("identifier") || !selection) return null;
	for (const [within, smooth] of operands(graph, inputSocket(edges, "Shade Smooth"), BOOLEAN_AND)) {
		const angle = angleLimit(graph, within);
		const faceFlag = smoothFlag(graph, smooth, "GeometryNodeInputShadeSmooth");
		if (angle && faceFlag?.ignoreSharpness === selection.ignoreSharpness) return {
			angle,
			...selection
		};
	}
	return null;
}
var smoothingGroups = /* @__PURE__ */ new WeakMap();
/** `wiredInputs` of a group, read once for all the objects that share it. */
function smoothingInputs(group) {
	let known = smoothingGroups.get(group.file);
	if (!known) {
		known = /* @__PURE__ */ new Map();
		smoothingGroups.set(group.file, known);
	}
	const found = known.get(group.offset);
	if (found !== void 0) return found;
	const inputs = wiredInputs(group);
	known.set(group.offset, inputs);
	return inputs;
}
/** Whether the modifier is Blender's Smooth by Angle, which changes only how the mesh shades. */
function isSmoothByAngle(modifier) {
	const group = modifierType(modifier) === ModifierType.nodes ? modifier.deref("node_group") : null;
	return group !== null && smoothingInputs(group) !== null;
}
/** An input's value on the modifier, stored under the socket's identifier, or else the socket's default. */
function inputValue$1(properties, group, identifier) {
	if (identifier === null) return null;
	const socket = groupInputs(group).find((input) => input.text("identifier") === identifier);
	return propertyValue(properties, identifier) ?? socket?.deref("socket_data")?.number("value") ?? null;
}
/**
* The object's Smooth by Angle modifier when it is on in viewports, with its settings: the values of the group inputs
* that its nodes compare edge angles with and that ignore sharpness.
*/
function smoothByAngle(object) {
	for (const modifier of viewportModifiers(object)) {
		const group = modifierType(modifier) === ModifierType.nodes ? modifier.deref("node_group") : null;
		const inputs = group ? smoothingInputs(group) : null;
		if (!group || !inputs) continue;
		const properties = modifier.struct("settings")?.deref("properties") ?? null;
		return {
			modifier,
			angle: inputValue$1(properties, group, inputs.angle) ?? DEFAULT_ANGLE,
			ignoreSharpness: (inputValue$1(properties, group, inputs.ignoreSharpness) ?? 0) !== 0
		};
	}
	return null;
}
/**
* What the Smooth by Angle node group does: every face shades smooth, and an edge turns sharp where its faces meet
* at more than the angle. Unless it ignores sharpness, sharp edges stay sharp and edges next to a flat face turn sharp
* too.
*/
function applySmoothByAngle(mesh, settings) {
	const normals = faceNormals(mesh);
	const faceCounts = new Int32Array(mesh.edgeCount);
	const firstFaces = new Int32Array(mesh.edgeCount);
	const secondFaces = new Int32Array(mesh.edgeCount);
	const nextToFlatFace = new Uint8Array(mesh.edgeCount);
	for (let face = 0; face < mesh.faceCount; face++) {
		const flat = (mesh.sharpFaces?.[face] ?? 0) !== 0;
		for (let corner = mesh.faceOffsets[face] ?? 0; corner < (mesh.faceOffsets[face + 1] ?? 0); corner++) {
			const edge = mesh.cornerEdges[corner] ?? -1;
			if (edge < 0 || edge >= mesh.edgeCount) continue;
			const count = faceCounts[edge] ?? 0;
			if (count === 0) firstFaces[edge] = face;
			else if (count === 1) secondFaces[edge] = face;
			faceCounts[edge] = count + 1;
			if (flat) nextToFlatFace[edge] = 1;
		}
	}
	const sharpEdges = new Uint8Array(mesh.edgeCount);
	for (let edge = 0; edge < mesh.edgeCount; edge++) {
		if ((mesh.sharpEdges?.[edge] ?? 0) !== 0 && !settings.ignoreSharpness) {
			sharpEdges[edge] = 1;
			continue;
		}
		const small = faceCounts[edge] !== 2 || edgeAngle(normals, firstFaces[edge] ?? 0, secondFaces[edge] ?? 0) <= settings.angle;
		const smoothFaces = settings.ignoreSharpness || nextToFlatFace[edge] === 0;
		sharpEdges[edge] = small && smoothFaces ? 0 : 1;
	}
	return {
		...mesh,
		sharpEdges,
		sharpFaces: null,
		autoSmoothAngle: null
	};
}
/** The angle between two faces' unit normals, as Blender's `angle_normalized_v3v3` measures it for Edge Angle. */
function edgeAngle(normals, a, b) {
	const ax = normals[a * 3] ?? 0;
	const ay = normals[a * 3 + 1] ?? 0;
	const az = normals[a * 3 + 2] ?? 0;
	const bx = normals[b * 3] ?? 0;
	const by = normals[b * 3 + 1] ?? 0;
	const bz = normals[b * 3 + 2] ?? 0;
	const [dx, dy, dz] = ax * bx + ay * by + az * bz >= 0 ? [
		ax - bx,
		ay - by,
		az - bz
	] : [
		ax + bx,
		ay + by,
		az + bz
	];
	const half = 2 * Math.asin(Math.min(Math.sqrt(dx * dx + dy * dy + dz * dz) / 2, 1));
	return ax * bx + ay * by + az * bz >= 0 ? half : Math.PI - half;
}
//#endregion
//#region ../../packages/blend/src/scene/objects.ts
var ObjectType = {
	empty: 0,
	mesh: 1,
	curve: 2,
	surface: 3,
	text: 4,
	metaball: 5,
	light: 10,
	camera: 11,
	speaker: 12,
	lightProbe: 13,
	lattice: 22,
	armature: 25,
	greasePencilLegacy: 26,
	curves: 27,
	pointCloud: 28,
	volume: 29,
	greasePencil: 30
};
/** Object types whose geometry the reader does not show; their objects come along as empty nodes. */
var UNSHOWN_GEOMETRY = /* @__PURE__ */ new Map([
	[ObjectType.curve, "curve"],
	[ObjectType.surface, "surface"],
	[ObjectType.text, "text"],
	[ObjectType.metaball, "metaball"],
	[ObjectType.greasePencilLegacy, "grease pencil"],
	[ObjectType.curves, "hair curves"],
	[ObjectType.pointCloud, "point cloud"],
	[ObjectType.volume, "volume"],
	[ObjectType.greasePencil, "grease pencil"]
]);
var ParentType = {
	object: 0,
	armatureDeform: 4,
	vertex: 5,
	vertices: 6,
	bone: 7
};
var PARENT_TYPE_MASK = 15;
/** The flags of an Armature modifier's and an armature's `deformflag`. */
var ArmatureDeformFlag = {
	vertexGroups: 1,
	envelope: 2,
	preserveVolume: 4,
	invertMask: 16
};
var OBJECT_HIDE_VIEWPORT = 1;
var OBJECT_INSTANCES_VERTICES = 16;
var OBJECT_INSTANCES_COLLECTION = 256;
var OBJECT_INSTANCES_FACES = 512;
var OBJECT_INSTANCES = 2832;
var INSTANCER_SHOWN_IN_VIEWPORT = 1;
var COLLECTION_HIDE_VIEWPORT = 1;
var LAYER_COLLECTION_EXCLUDE = 16;
var LAYER_COLLECTION_HIDE = 128;
var BASE_HIDDEN = 256;
var VIEW_LAYER_RENDER = 1;
/** How an object follows its parent, one of `ParentType`. */
function parentTypeOf(object) {
	return object.number("partype") & PARENT_TYPE_MASK;
}
/** Kinds of data a file links from other .blend files, in the order a warning lists them. */
var LINKED_KINDS = [
	"scenes",
	"collections",
	"objects",
	"materials",
	"actions",
	"images"
];
/** `name` for data linked from `datablock`'s file. */
function linkedName(kind, name, datablock) {
	return {
		kind,
		name,
		packed: isInPackedLibrary(datablock)
	};
}
function activeScene(file) {
	const current = datablocks(file, "GLOB")[0]?.deref("curscene");
	if (current && !isLinked(current)) return current;
	return datablocks(file, "SC").find((scene) => !isLinked(scene)) ?? null;
}
function activeViewLayer(file, scene) {
	const layers = scene.list("view_layers");
	const current = datablocks(file, "GLOB")[0]?.pointer("cur_view_layer") ?? 0n;
	return layers.find((layer) => layer.offset === scene.resolve(current)?.offset) ?? layers[0] ?? null;
}
/** Objects the view layer hides with the eye, by struct offset in the file. */
function eyeHiddenObjects(viewLayer) {
	const hidden = /* @__PURE__ */ new Set();
	for (const base of viewLayer?.list("object_bases") ?? []) {
		const object = base.deref("object");
		if (object && (base.number("flag") & BASE_HIDDEN) !== 0) hidden.add(object.offset);
	}
	return hidden;
}
/** The collection an object instances, such as one linked in from an asset library, or null. */
function instancedCollection(object) {
	return (object.number("transflag") & OBJECT_INSTANCES_COLLECTION) !== 0 ? object.deref("dup_group") : null;
}
/** Modifiers that can give a mesh with no vertices some, such as an Array's caps or a Boolean's union. */
var MAKES_MESH = /* @__PURE__ */ new Set([
	ModifierType.array,
	ModifierType.boolean,
	ModifierType.ocean,
	ModifierType.meshSequenceCache,
	ModifierType.fluid,
	ModifierType.volumeToMesh
]);
/** Modifiers that can give a mesh with vertices and no faces some faces. */
var MAKES_FACES = /* @__PURE__ */ new Set([ModifierType.screw, ModifierType.skin]);
/**
* Geometry Nodes whose output Blender draws instead of an instancer's children: the nodes of Blender 4.2 to 5.2 that
* make instances from geometry without any, and Curves to Grease Pencil. That is the one node that makes grease
* pencil, which Blender also draws instead of the children, and whose layers other nodes output as instances.
*/
var INSTANCING_NODES = /* @__PURE__ */ new Set([
	"GeometryNodeCollectionInfo",
	"GeometryNodeGeometryToInstance",
	"GeometryNodeImportOBJ",
	"GeometryNodeInstanceOnPoints",
	"GeometryNodeObjectInfo",
	"GeometryNodeSplitToInstances",
	"GeometryNodeStringToCurves",
	"GeometryNodeCurvesToGreasePencil"
]);
/** Instancing nodes whose instances, once realized, hold the geometry the node reads, or the meshes of an OBJ file. */
var REALIZED_TO_INPUTS = /* @__PURE__ */ new Set([
	"GeometryNodeGeometryToInstance",
	"GeometryNodeImportOBJ",
	"GeometryNodeInstanceOnPoints",
	"GeometryNodeSplitToInstances"
]);
/** Nodes that output what the modifier baked, which may hold instances that no node makes any longer. */
var BAKING_NODES = /* @__PURE__ */ new Set(["GeometryNodeBake", "GeometryNodeSimulationOutput"]);
/** Socket types whose links can carry geometry, which bundles and closures can hold. */
var CARRIES_GEOMETRY = /* @__PURE__ */ new Set([
	SocketType.geometry,
	SocketType.bundle,
	SocketType.closure
]);
/** A node's type, or none for a muted node, which only passes its inputs on. */
function activeType(node) {
	return isMuted(node) ? "" : nodeType(node);
}
/** Whether a Realize Instances node realizes every instance at every level. */
function realizesAll(graph, node) {
	return ["Selection", "Realize All"].every((name) => {
		const socket = inputSocket(node, name);
		return socket === null || !linkedOutput(graph, socket) && socketValue(socket)[0] === 1;
	});
}
/**
* Whether the modifier holds baked data packed into the file, which Blender outputs in place of what it baked. Only
* the bakes it counts are read, each where its block's struct lays out the pointer to the packed data.
*/
function holdsPackedBake(modifier) {
	const block = modifier.target("bakes");
	const type = block?.struct;
	const packed = type?.field("packed");
	if (!block || !type || !packed || packed.pointerDepth === 0) return false;
	const count = Math.min(Math.max(modifier.number("bakes_num"), 0), block.count, Math.floor(block.size / type.size));
	for (let bake = 0; bake < count; bake++) if (modifier.file.pointedBlock(block.offset + bake * type.size + packed.offset, block.owner) >= 0) return true;
	return false;
}
var outputsInstances = /* @__PURE__ */ new WeakMap();
/**
* Whether a node group may output instances or grease pencil, through the nodes that feed its output. Below a Realize
* Instances node that realizes them all, an instancing node counts as the geometry its instances hold: what it reads,
* or an OBJ file's meshes. A group from another file may output them. Groups that Group nodes run are searched on a
* stack of their own, however deep they nest, and a group that runs itself adds nothing.
*/
function mayOutputInstances(group, realized, baked) {
	if (!group) return false;
	let known = outputsInstances.get(group.file);
	if (!known) {
		known = /* @__PURE__ */ new Map();
		outputsInstances.set(group.file, known);
	}
	const answers = known;
	const searching = /* @__PURE__ */ new Set();
	const searches = [];
	const answer = (group, realized) => {
		if (!group) return false;
		if (isLinked(group)) return true;
		const key = `${group.offset} ${realized} ${baked}`;
		const found = answers.get(key);
		if (found !== void 0) return found;
		if (searching.has(key)) return false;
		searching.add(key);
		const graph = graphOf(group);
		const output = groupOutput(graph.nodes);
		searches.push({
			key,
			graph,
			pending: output ? [[output, realized]] : [],
			reached: /* @__PURE__ */ new Set()
		});
		return null;
	};
	const first = answer(group, realized);
	if (first !== null) return first;
	let last = false;
	const finish = (search, result) => {
		answers.set(search.key, result);
		searches.pop();
		last = result;
	};
	for (let search = searches.at(-1); search; search = searches.at(-1)) {
		const next = search.pending.pop();
		if (!next) {
			finish(search, false);
			continue;
		}
		const [node, under] = next;
		const type = activeType(node);
		let found = INSTANCING_NODES.has(type) && !(under && REALIZED_TO_INPUTS.has(type));
		found ||= baked && BAKING_NODES.has(type);
		if (!found && type === "GeometryNodeGroup") {
			const inner = answer(node.deref("id"), under);
			if (inner === null) {
				search.pending.push(next);
				continue;
			}
			found = inner;
		}
		if (found) {
			finish(search, true);
			continue;
		}
		const realizing = under || type === "GeometryNodeRealizeInstances" && realizesAll(search.graph, node);
		for (const source of feedingOutputs(search.graph, node)) {
			const reached = `${source.node.offset} ${realizing}`;
			if (!CARRIES_GEOMETRY.has(socketType(source.socket)) || search.reached.has(reached)) continue;
			search.reached.add(reached);
			search.pending.push([source.node, realizing]);
		}
	}
	return last;
}
/**
* Where a mesh object places a copy of each of its children, as Blender's instancing on vertices or faces does. A mesh
* without such elements places none, unless a modifier may add them. Geometry Nodes may add them too, or output
* instances or grease pencil that Blender draws instead of the children, so an object whose nodes may do that is left
* out.
*/
function childInstancing(object) {
	const mesh = object.number("type") === ObjectType.mesh ? object.deref("data") : null;
	if (!mesh) return null;
	const modifiers = viewportModifiers(object).filter((modifier) => !isSmoothByAngle(modifier));
	const groups = modifiers.flatMap((modifier) => {
		const group = modifierType(modifier) === ModifierType.nodes ? modifier.deref("node_group") : null;
		return group ? [{
			group,
			baked: holdsPackedBake(modifier)
		}] : [];
	});
	if (groups.some(({ group, baked }) => mayOutputInstances(group, false, baked))) return null;
	const types = modifiers.map(modifierType);
	const flag = object.number("transflag");
	const hasVertices = mesh.number("totvert") > 0;
	const makesMesh = groups.length > 0 || types.some((type) => MAKES_MESH.has(type));
	const makesFaces = hasVertices && (groups.length > 0 || types.some((type) => MAKES_FACES.has(type)));
	if ((flag & OBJECT_INSTANCES_VERTICES) !== 0 && (hasVertices || makesMesh)) return "vertex";
	if ((flag & OBJECT_INSTANCES_FACES) !== 0 && (mesh.number("totpoly") > 0 || makesMesh || makesFaces)) return "face";
	return null;
}
/** Whether the object has a particle system, read from the first item of its list only. */
function hasParticles(object) {
	const list = object.struct("particlesystem");
	const first = list && list.pointer("first") !== 0n ? list.deref("first") : null;
	return first !== null && first.type.size >= object.file.pointerSize;
}
/** Whether Blender hides the object in viewports to draw only the instances or particles it makes. */
function hidesInstancer(object) {
	const instances = (object.number("transflag") & OBJECT_INSTANCES) !== 0 || hasParticles(object);
	const shown = object.number("duplicator_visibility_flag") & INSTANCER_SHOWN_IN_VIEWPORT;
	return instances && object.has("duplicator_visibility_flag") && shown === 0;
}
/** The object's mesh or armature data when it is linked from another file, or null. */
function linkedData(object) {
	const type = object.number("type");
	if (type !== ObjectType.mesh && type !== ObjectType.armature) return null;
	const data = object.deref("data");
	return data !== null && isLinked(data) ? data : null;
}
function describe$1(struct, shown, hidden) {
	const data = struct.deref("data");
	return {
		struct,
		name: idName(struct),
		type: struct.number("type"),
		data: data && !isLinked(data) ? data : null,
		parent: struct.deref("parent"),
		parentType: parentTypeOf(struct),
		parentBone: struct.string("parsubstr"),
		shown,
		hidden,
		instancerHidden: shown && hidesInstancer(struct)
	};
}
/**
* The armatures that deform an object through Armature modifiers on in viewports or an armature-deform parent. A
* linked target, whose type this file does not hold, counts as one.
*/
function deformingArmatures(object) {
	const result = [];
	for (const modifier of viewportModifiers(object)) {
		if (modifierType(modifier) !== ModifierType.armature) continue;
		const target = modifier.deref("object");
		const armature = target && (isLinked(target) || target.number("type") === ObjectType.armature);
		if (target && armature) result.push({
			target,
			flags: modifier.number("deformflag"),
			maskGroup: modifier.string("defgrp_name")
		});
	}
	const parent = object.deref("parent");
	if (parent?.number("type") === ObjectType.armature && parentTypeOf(object) === ParentType.armatureDeform) {
		const flags = parent.deref("data")?.number("deformflag") ?? ArmatureDeformFlag.vertexGroups;
		result.push({
			target: parent,
			flags,
			maskGroup: ""
		});
	}
	return result;
}
/** The view layer Blender draws a background set with: the first that renders, or else the first. */
function setViewLayer(scene) {
	const layers = scene.list("view_layers");
	return layers.find((layer) => (layer.number("flag") & VIEW_LAYER_RENDER) !== 0) ?? layers[0] ?? null;
}
/**
* The objects of the file's active scene and of its background sets, which Blender draws with it, in the order their
* collections list them, with every object's parent before it. Collections the view layer excludes or that are
* disabled in viewports are left out with their children, as are objects disabled in viewports. Objects the shown ones
* need come along unshown. Objects hidden with the eye, a per-view-layer state that exporters keep, stay in and are
* marked hidden.
*/
function collectSceneObjects(file) {
	const scene = activeScene(file);
	if (!scene) return {
		scene: null,
		objects: [],
		linked: []
	};
	const ordered = [];
	const shown = /* @__PURE__ */ new Set();
	const unhidden = /* @__PURE__ */ new Set();
	const linked = /* @__PURE__ */ new Map();
	const addLinked = (kind, name, datablock) => {
		const entry = linkedName(kind, name, datablock);
		linked.set(`${entry.kind} ${entry.packed} ${entry.name}`, entry);
	};
	const childEntries = ownedLists("children");
	const objectEntries = ownedLists("gobject");
	const layerCollections = ownedLists("layer_collections");
	const childCollections = /* @__PURE__ */ new Map();
	const childrenOf = (collection) => {
		let children = childCollections.get(collection.offset);
		if (!children) {
			children = childEntries(collection).flatMap((child) => child.deref("collection") ?? []);
			childCollections.set(collection.offset, children);
		}
		return children;
	};
	/**
	* Walks a scene's collection tree once per place a collection has in it, which a layer collection of the view layer
	* stands for. A place queued before adds nothing, and nor do a collection's objects listed before as hidden alike.
	*/
	const walk = (master, viewLayer) => {
		const eyeHidden = eyeHiddenObjects(viewLayer);
		const queued = /* @__PURE__ */ new Set();
		const listed = /* @__PURE__ */ new Set();
		const pending = [];
		const queue = (places) => {
			const unqueued = places.filter(({ collection, layer, parentHidden }) => {
				const key = `${collection.offset} ${layer?.offset ?? -1} ${parentHidden}`;
				if (queued.has(key)) return false;
				queued.add(key);
				return true;
			});
			pushReversed(pending, unqueued);
		};
		queue([{
			collection: master,
			layer: viewLayer ? layerCollections(viewLayer)[0] ?? null : null,
			parentHidden: false
		}]);
		for (let place = pending.pop(); place; place = pending.pop()) {
			const { collection, layer, parentHidden } = place;
			const flag = layer?.number("flag") ?? 0;
			if ((flag & LAYER_COLLECTION_EXCLUDE) !== 0 || (collection.number("flag") & COLLECTION_HIDE_VIEWPORT) !== 0) continue;
			const collectionHidden = parentHidden || (flag & LAYER_COLLECTION_HIDE) !== 0;
			const objects = `${collection.offset} ${collectionHidden}`;
			for (const entry of listed.has(objects) ? [] : objectEntries(collection)) {
				const object = entry.deref("ob");
				if (!object) continue;
				if (isLinked(object)) {
					addLinked("objects", idName(object), object);
					continue;
				}
				if ((object.number("restrictflag") & OBJECT_HIDE_VIEWPORT) !== 0) continue;
				if (!collectionHidden && !eyeHidden.has(object.offset)) unhidden.add(object.offset);
				if (shown.has(object.offset)) continue;
				shown.add(object.offset);
				ordered.push(object);
				const data = linkedData(object);
				if (data) addLinked("objects", idName(object), data);
			}
			listed.add(objects);
			const childLayers = /* @__PURE__ */ new Map();
			for (const child of layer ? layerCollections(layer) : []) {
				const offset = child.deref("collection")?.offset;
				if (offset !== void 0 && !childLayers.has(offset)) childLayers.set(offset, child);
			}
			const children = [];
			for (const nested of childrenOf(collection)) {
				const nestedLayer = childLayers.get(nested.offset) ?? null;
				if (isLinked(nested)) {
					if (!(((nestedLayer?.number("flag") ?? 0) & LAYER_COLLECTION_EXCLUDE) !== 0)) addLinked("collections", idName(nested), nested);
					continue;
				}
				children.push({
					collection: nested,
					layer: nestedLayer,
					parentHidden: collectionHidden
				});
			}
			queue(children);
		}
	};
	const master = scene.deref("master_collection");
	if (master) walk(master, activeViewLayer(file, scene));
	const sets = /* @__PURE__ */ new Set([scene.offset]);
	for (let set = scene.deref("set"); set && !sets.has(set.offset); set = set.deref("set")) {
		sets.add(set.offset);
		if (isLinked(set)) {
			addLinked("scenes", idName(set), set);
			break;
		}
		const setMaster = set.deref("master_collection");
		if (setMaster) walk(setMaster, setViewLayer(set));
	}
	const needed = /* @__PURE__ */ new Map();
	const need = (first) => {
		const pending = new ObjectStack();
		const queue = (objects) => {
			for (let index = objects.length - 1; index >= 0; index--) {
				const object = objects[index];
				if (object && !shown.has(object.offset) && !needed.has(object.offset)) pending.push(object);
			}
		};
		queue([first]);
		for (let object = pending.pop(); object; object = pending.pop()) {
			if (isLinked(object)) {
				addLinked("objects", idName(object), object);
				continue;
			}
			const data = linkedData(object);
			if (data) addLinked("objects", idName(object), data);
			needed.set(object.offset, object);
			queue([object.deref("parent"), ...deformingArmatures(object).map(({ target }) => target)]);
		}
	};
	for (const object of ordered) {
		need(object.deref("parent"));
		for (const { target } of deformingArmatures(object)) need(target);
	}
	return {
		scene,
		objects: parentsFirst([...ordered.map((object) => describe$1(object, true, !unhidden.has(object.offset))), ...[...needed.values()].map((object) => describe$1(object, false, false))]),
		linked: [...linked.values()]
	};
}
/**
* A stack of objects that holds each object once: pushing an object it already holds moves it to the top. It pops
* objects in the order a stack holding every push would first pop them, while holding no more entries than about
* twice the objects it holds.
*/
var ObjectStack = class {
	#entries = [];
	#held = /* @__PURE__ */ new Map();
	push(object) {
		const held = this.#held.get(object.offset);
		if (held) held.live = false;
		const entry = {
			object,
			live: true
		};
		this.#entries.push(entry);
		this.#held.set(object.offset, entry);
		if (this.#entries.length > 2 * this.#held.size + 16) this.#entries = this.#entries.filter((kept) => kept.live);
	}
	pop() {
		for (let entry = this.#entries.pop(); entry; entry = this.#entries.pop()) {
			if (!entry.live) continue;
			this.#held.delete(entry.object.offset);
			return entry.object;
		}
	}
};
/** Pushes items onto a stack last first, so that it pops them in order, without spreading them into arguments. */
function pushReversed(stack, items) {
	for (let index = items.length - 1; index >= 0; index--) {
		const item = items[index];
		if (item !== void 0) stack.push(item);
	}
}
/** Orders objects so each comes after its parent, keeping the given order among roots and among siblings. */
function parentsFirst(objects) {
	const byOffset = new Map(objects.map((object) => [object.struct.offset, object]));
	const children = /* @__PURE__ */ new Map();
	const roots = [];
	for (const object of objects) {
		const parent = object.parent ? byOffset.get(object.parent.offset) : void 0;
		if (parent && parent !== object) {
			const list = children.get(parent.struct.offset) ?? [];
			list.push(object);
			children.set(parent.struct.offset, list);
		} else roots.push(object);
	}
	const result = [];
	const placed = /* @__PURE__ */ new Set();
	const place = (first) => {
		const pending = [first];
		for (let object = pending.pop(); object; object = pending.pop()) {
			if (placed.has(object.struct.offset)) continue;
			placed.add(object.struct.offset);
			result.push(object);
			pushReversed(pending, children.get(object.struct.offset) ?? []);
		}
	};
	for (const root of roots) place(root);
	for (const object of objects) place(object);
	return result;
}
//#endregion
//#region ../../packages/blend/src/scene/envelopes.ts
var BONE_MULTIPLY_ENVELOPE = 2048;
/** Blender leaves a vertex in place when the weights that reach it add up to no more than this. */
var MIN_CONTRIBUTION = 1e-4;
var WEIGHT_TOLERANCE = 1e-4;
/** How much of a bone's weight its envelope keeps at a point in armature space, as Blender's `distfactor_to_bone`. */
function envelopeFactor(point, envelope) {
	return factorAt(point[0] ?? 0, point[1] ?? 0, point[2] ?? 0, envelope);
}
function factorAt(x, y, z, envelope) {
	const { head, tail, headRadius, tailRadius, falloff } = envelope;
	const headX = head[0] ?? 0;
	const headY = head[1] ?? 0;
	const headZ = head[2] ?? 0;
	const axisX = (tail[0] ?? 0) - headX;
	const axisY = (tail[1] ?? 0) - headY;
	const axisZ = (tail[2] ?? 0) - headZ;
	const toX = x - headX;
	const toY = y - headY;
	const toZ = z - headZ;
	const length = Math.sqrt(axisX * axisX + axisY * axisY + axisZ * axisZ);
	const along = length > 0 ? (axisX * toX + axisY * toY + axisZ * toZ) / length : 0;
	const fromHead = toX * toX + toY * toY + toZ * toZ;
	let distanceSquared;
	let radius;
	if (along < 0) {
		distanceSquared = fromHead;
		radius = headRadius;
	} else if (along > length) {
		distanceSquared = (toX - axisX) ** 2 + (toY - axisY) ** 2 + (toZ - axisZ) ** 2;
		radius = tailRadius;
	} else {
		distanceSquared = fromHead - along * along;
		const share = length > 0 ? along / length : 0;
		radius = share * tailRadius + (1 - share) * headRadius;
	}
	if (distanceSquared < radius * radius) return 1;
	if (falloff === 0 || distanceSquared >= (radius + falloff) ** 2) return 0;
	const beyond = Math.sqrt(distanceSquared) - radius;
	return 1 - beyond * beyond / (falloff * falloff);
}
function reachOf(envelope) {
	const { head, tail } = envelope;
	const reach = Math.max(Math.abs(envelope.headRadius), Math.abs(envelope.tailRadius)) + Math.abs(envelope.falloff);
	const low = (axis) => Math.min(head[axis] ?? 0, tail[axis] ?? 0) - reach;
	const high = (axis) => Math.max(head[axis] ?? 0, tail[axis] ?? 0) + reach;
	return {
		envelope,
		low: [
			low(0),
			low(1),
			low(2)
		],
		high: [
			high(0),
			high(1),
			high(2)
		]
	};
}
function inReach(x, y, z, { low, high }) {
	return !(x < low[0] || x > high[0] || y < low[1] || y > high[1] || z < low[2] || z > high[2]);
}
/**
* How an armature's envelopes act on a mesh, as Blender's armature deform uses them. A vertex that the modifier's mask
* group leaves out does not move. A vertex in no vertex group of a deform bone moves with the envelopes of the deform
* bones that reach it, when envelopes are on. A bone that multiplies by its envelope scales its weight by how far inside
* the envelope the vertex lies, which matters only where it changes the blend of the vertex's weights. `toArmature` takes
* the mesh's coordinates into the armature object's.
*/
function envelopeUse(data, deform, bones, toArmature) {
	const weights = data.deformWeights;
	const usesGroups = (deform.flags & ArmatureDeformFlag.vertexGroups) !== 0 && weights !== null;
	const usesEnvelopes = (deform.flags & ArmatureDeformFlag.envelope) !== 0;
	const multiplies = (bone) => (bone.flag & BONE_MULTIPLY_ENVELOPE) !== 0;
	const deformBones = new Map(bones.flatMap((bone) => bone.deform ? [[bone.name, bone]] : []));
	const canMultiply = usesGroups && [...deformBones.values()].some(multiplies);
	if (!usesEnvelopes && !canMultiply) return {
		enveloped: false,
		multiplying: []
	};
	const mask = weights && deform.maskGroup !== "" ? data.vertexGroupNames.indexOf(deform.maskGroup) : -1;
	const inverted = (deform.flags & ArmatureDeformFlag.invertMask) !== 0;
	const groupBones = data.vertexGroupNames.map((name) => deformBones.get(name));
	const reaches = [...deformBones.values()].map((bone) => reachOf(bone.envelope));
	const pointAt = (v) => {
		const [x = 0, y = 0, z = 0] = data.positions.subarray(v * 3, v * 3 + 3);
		return transformPoint(toArmature, x, y, z);
	};
	const reached = (v) => {
		const [x, y, z] = pointAt(v);
		let sum = 0;
		for (const reach of reaches) if (inReach(x, y, z, reach)) sum += factorAt(x, y, z, reach.envelope) * reach.envelope.weight;
		return sum > MIN_CONTRIBUTION;
	};
	let enveloped = false;
	const multiplying = /* @__PURE__ */ new Set();
	for (let v = 0; v < data.vertexCount && !(enveloped && !canMultiply); v++) {
		const from = weights?.offsets[v] ?? 0;
		const to = weights?.offsets[v + 1] ?? 0;
		let maskWeight = 0;
		let grouped = false;
		for (let i = from; i < to; i++) {
			const group = weights?.groups[i] ?? -1;
			if (group === mask) maskWeight = weights?.weights[i] ?? 0;
			if (groupBones[group]) grouped = true;
		}
		if (mask >= 0 && (inverted ? 1 - maskWeight : maskWeight) <= 0) continue;
		if (!usesGroups || !grouped) {
			enveloped ||= usesEnvelopes && reached(v);
			continue;
		}
		if (!canMultiply) continue;
		const entries = [];
		for (let i = from; i < to; i++) {
			const bone = groupBones[weights?.groups[i] ?? -1];
			if (bone) entries.push({
				bone,
				weight: weights?.weights[i] ?? 0
			});
		}
		const total = entries.reduce((sum, { weight }) => sum + weight, 0);
		if (total <= MIN_CONTRIBUTION || !entries.some(({ bone, weight }) => weight > 0 && multiplies(bone))) continue;
		const point = pointAt(v);
		const kept = entries.map(({ bone, weight }) => multiplies(bone) ? weight * envelopeFactor(point, bone.envelope) : weight);
		const scaled = kept.reduce((sum, weight) => sum + weight, 0);
		if (!(scaled <= MIN_CONTRIBUTION || entries.some(({ weight }, i) => Math.abs((kept[i] ?? 0) / scaled - weight / total) > WEIGHT_TOLERANCE))) continue;
		entries.forEach(({ bone, weight }, i) => {
			if (multiplies(bone) && (kept[i] ?? 0) < weight) multiplying.add(bone.name);
		});
	}
	return {
		enveloped,
		multiplying: [...multiplying]
	};
}
//#endregion
//#region ../../packages/blend/src/scene/mapping.ts
/** Blender's Mapping node types, `node.vector_type`. */
var MappingType = {
	point: 0,
	texture: 1,
	vector: 2,
	normal: 3
};
var IDENTITY$1 = [
	1,
	0,
	0,
	0,
	0,
	1,
	0,
	0,
	0,
	0,
	1,
	0
];
/** Blender's `euler_to_mat` for XYZ Euler angles: X turns first, then Y, then Z. */
function eulerMatrix([x, y, z]) {
	const [cx, sx, cy, sy, cz, sz] = [
		Math.cos(x),
		Math.sin(x),
		Math.cos(y),
		Math.sin(y),
		Math.cos(z),
		Math.sin(z)
	];
	return [
		cy * cz,
		sx * sy * cz - cx * sz,
		cx * sy * cz + sx * sz,
		cy * sz,
		sx * sy * sz + cx * cz,
		cx * sy * sz - sx * cz,
		-sy,
		sx * cy,
		cx * cy
	];
}
function safeInverse(value) {
	return value === 0 ? 0 : 1 / value;
}
/**
* What a Mapping node does to the vectors it reads, as `node_shader_mapping` computes it, or null for the Normal type,
* which normalizes and so is not affine.
*/
function mappingAffine(type, location, rotation, scale) {
	const r = eulerMatrix(rotation);
	const at = (row, column) => r[row * 3 + column] ?? 0;
	if (type === MappingType.point || type === MappingType.vector) {
		const offset = type === MappingType.point ? location : [
			0,
			0,
			0
		];
		return [
			0,
			1,
			2
		].flatMap((row) => [
			at(row, 0) * scale[0],
			at(row, 1) * scale[1],
			at(row, 2) * scale[2],
			offset[row] ?? 0
		]);
	}
	if (type === MappingType.texture) return [
		0,
		1,
		2
	].flatMap((row) => {
		const inverse = safeInverse(scale[row] ?? 1);
		const [a, b, c] = [
			at(0, row) * inverse,
			at(1, row) * inverse,
			at(2, row) * inverse
		];
		return [
			a,
			b,
			c,
			-(a * location[0] + b * location[1] + c * location[2])
		];
	});
	return null;
}
/** `outer` after `inner`: the map that applies `inner` to a vector, then `outer`. */
function composeAffine(outer, inner) {
	const at = (m, row, column) => m[row * 4 + column] ?? 0;
	return [
		0,
		1,
		2
	].flatMap((row) => [...[
		0,
		1,
		2
	].map((column) => at(outer, row, 0) * at(inner, 0, column) + at(outer, row, 1) * at(inner, 1, column) + at(outer, row, 2) * at(inner, 2, column)), at(outer, row, 0) * at(inner, 0, 3) + at(outer, row, 1) * at(inner, 1, 3) + at(outer, row, 2) * at(inner, 2, 3) + at(outer, row, 3)]);
}
var EPSILON = 1e-9;
/**
* The UV transform an affine map makes of UV coordinates, which Blender reads as (u, v, 0) and samples an image at x
* and y of. `skewed` is true when the map shears UVs, which a transform of scale, rotation and offset cannot do, and
* the transform then keeps its scale and turn along U.
*/
function uvTransformOf(affine) {
	const [a = 1, b = 0, , tu = 0, c = 0, d = 1, , tv = 0] = affine;
	let rotation = Math.atan2(c, a);
	let scaleU = Math.hypot(a, c);
	let scaleV = -Math.sin(rotation) * b + Math.cos(rotation) * d;
	let along = Math.cos(rotation) * b + Math.sin(rotation) * d;
	if (scaleU < EPSILON) {
		rotation = Math.atan2(-b, d);
		scaleU = 0;
		scaleV = Math.hypot(b, d);
		along = 0;
	}
	const skewed = Math.abs(along) > 1e-6 * Math.max(1, Math.abs(scaleU), Math.abs(scaleV));
	return {
		transform: transformOrNull([tu, tv], [scaleU, scaleV], rotation),
		skewed
	};
}
/** A transform, or null when it leaves UVs as they are. */
function transformOrNull(offset, scale, rotation) {
	return Math.abs(offset[0]) < EPSILON && Math.abs(offset[1]) < EPSILON && Math.abs(scale[0] - 1) < EPSILON && Math.abs(scale[1] - 1) < EPSILON && Math.abs(rotation) < EPSILON ? null : {
		offset,
		scale,
		rotation
	};
}
var IMAGE_SOURCES = {
	3: "a movie",
	4: "a generated image",
	5: "a viewer image"
};
var TANGENT_SPACE = 0;
var NORMAL_SPACES = {
	1: "object",
	2: "world",
	3: "object",
	4: "world"
};
/** The image's packed file, from the list newer files keep or the single pointer older ones do. */
function packedFile(image) {
	return image.deref("packedfile") ?? image.list("packedfiles")[0]?.deref("packedfile") ?? null;
}
var OUTPUT_FOR_ALL = 0;
var OUTPUT_FOR_EEVEE = 1;
var OUTPUT_FOR_CYCLES = 2;
var BACKFACE_CULLING = 4;
var BLEND_METHOD_CLIP = 3;
var BLEND_METHOD_HASHED = 4;
var RENDER_METHOD_DITHERED = 0;
/** The first version whose EEVEE draws transparency by the material's render method rather than its blend mode. */
var RENDER_METHOD_VERSION = 402;
var MIX_MULTIPLY = 2;
var MATH_SUBTRACT = 1;
var MATH_MULTIPLY = 2;
var MATH_ROUND = 14;
var MATH_LESS_THAN = 15;
var MATH_GREATER_THAN = 16;
/** What a strict comparison adds to its cutoff, as the preview keeps alpha that equals the cutoff. */
var STRICT = 1e-6;
/** The Metallic BSDF's Fresnel type that takes its color from IOR and Extinction instead of Base Color. */
var PHYSICAL_CONDUCTOR = 0;
var SEPARATE_RGB = 0;
var SEPARATED_CHANNELS = {
	1: [
		"Hue",
		"Saturation",
		"Value"
	],
	2: [
		"Hue",
		"Saturation",
		"Lightness"
	]
};
/** The color channel each output of a Separate node reads, from a color or from the vector a color converts to. */
var CHANNEL_INDEX = /* @__PURE__ */ new Map([
	["Red", 0],
	["R", 0],
	["X", 0],
	["Green", 1],
	["G", 1],
	["Y", 1],
	["Blue", 2],
	["B", 2],
	["Z", 2]
]);
var CHANNEL_NAMES = [
	"red",
	"green",
	"blue"
];
/** The channels of a Separate node in HSV or HSL mode that equal a gray color. */
var GRAY_CHANNELS = /* @__PURE__ */ new Set(["Value", "Lightness"]);
var GREEN = 1;
var BLUE = 2;
var ALPHA_STRAIGHT = 0;
var ALPHA_PREMULTIPLIED = 1;
var ALPHA_IGNORE = 3;
/** The color spaces Blender reads as data, which it never multiplies by their alpha. */
var DATA_SPACES = /* @__PURE__ */ new Set([
	"Non-Color",
	"Raw",
	"Generic Data"
]);
/** The color spaces the preview decodes exactly, as sRGB or as the values they store. */
var EXACT_DECODINGS = /* @__PURE__ */ new Map([
	["sRGB", "srgb"],
	["Non-Color", "linear"],
	["Raw", "linear"],
	["Generic Data", "linear"],
	["Linear", "linear"],
	["Linear Rec.709", "linear"],
	["scene_linear", "linear"]
]);
/** Color spaces with sRGB's curve but other primaries, which the preview decodes as sRGB. */
var SRGB_CURVES = /* @__PURE__ */ new Set([
	"Display P3",
	"sRGB Encoded AP1",
	"sRGB Encoded P3-D65"
]);
/** Linear color spaces whose names do not start with "Linear", which the preview decodes as Linear Rec.709. */
var LINEAR_SPACES = /* @__PURE__ */ new Set([
	"ACEScg",
	"ACES2065-1",
	"XYZ"
]);
var WRAPS = [
	"repeat",
	"clamp",
	"clamp",
	"mirror"
];
var EXTENSION_CLIP = 2;
var PROJECTIONS = {
	1: "Box",
	2: "Sphere",
	3: "Tube"
};
/** The most nodes the preview follows up an image's vector input. */
var MAX_VECTOR_NODES = 16;
/** The most nodes the preview looks through from an input to the image that feeds it. */
var MAX_FEEDING_NODES = 16;
/** The most mix, add and Shader to RGB nodes the preview looks through from the surface to a shader. */
var MAX_SURFACE_DEPTH = 16;
var INTERPOLATIONS = {
	1: "Closest",
	2: "Cubic",
	3: "Smart"
};
var SIMPLE_SHADERS = /* @__PURE__ */ new Set([
	"ShaderNodeEmission",
	"ShaderNodeBsdfDiffuse",
	"ShaderNodeBsdfGlossy",
	"ShaderNodeBsdfAnisotropic"
]);
var METAL_SHADERS = /* @__PURE__ */ new Set([
	"ShaderNodeBsdfGlossy",
	"ShaderNodeBsdfAnisotropic",
	"ShaderNodeBsdfMetallic"
]);
/** The images a material samples. */
function imageUses(draft) {
	return [
		draft.baseColorImage,
		draft.metallicRoughnessImage,
		draft.roughnessImage,
		draft.metalnessImage,
		draft.normalImage,
		draft.emissiveImage
	].filter((use) => use !== null);
}
/** The material Blender shows for an empty slot. */
function defaultMaterial(name = "Default") {
	return {
		name,
		baseColor: [
			.8,
			.8,
			.8,
			1
		],
		baseColorImage: null,
		baseColorAttribute: null,
		metallic: 0,
		roughness: .5,
		metallicRoughnessImage: null,
		roughnessImage: null,
		metalnessImage: null,
		normalImage: null,
		normalScale: 1,
		normalTangentUv: null,
		emissive: [
			0,
			0,
			0
		],
		emissiveImage: null,
		emissiveAttribute: null,
		alphaMode: "opaque",
		alphaCutoff: .5,
		doubleSided: true,
		approximations: []
	};
}
function clamp01(value) {
	return Math.min(Math.max(value, 0), 1);
}
/** The input's value where it is constant, else the value set on it, which Blender ignores while nodes drive it. */
function inputValue(graph, socket, fallback) {
	const values = socket ? constantOf(graph, socket) ?? socketValue(socket) : [];
	return fallback.map((value, index) => values[index] ?? value);
}
function scalarOf(graph, socket, fallback) {
	return inputValue(graph, socket, [fallback])[0] ?? fallback;
}
var PASS_THROUGH = /* @__PURE__ */ new Set([
	"ShaderNodeMix",
	"ShaderNodeMixRGB",
	"ShaderNodeHueSaturation",
	"ShaderNodeBrightContrast",
	"ShaderNodeGamma",
	"ShaderNodeInvert",
	"ShaderNodeRGBCurve",
	"ShaderNodeSeparateColor",
	"ShaderNodeSeparateRGB",
	"ShaderNodeSeparateXYZ",
	"ShaderNodeMath",
	"ShaderNodeMapRange",
	"ShaderNodeValToRGB",
	"ShaderNodeRGBToBW"
]);
/** Pass-through nodes that only pick or convert channels, which leave an image's values as the preview reads them. */
var KEEPS_VALUES = /* @__PURE__ */ new Set([
	"ShaderNodeSeparateColor",
	"ShaderNodeSeparateRGB",
	"ShaderNodeSeparateXYZ",
	"ShaderNodeRGBToBW"
]);
var SEPARATES = /* @__PURE__ */ new Set([
	"ShaderNodeSeparateColor",
	"ShaderNodeSeparateRGB",
	"ShaderNodeSeparateXYZ"
]);
var SCALAR_SOCKETS = /* @__PURE__ */ new Set([
	SocketType.float,
	SocketType.int,
	SocketType.boolean
]);
var NOT_FED = {
	found: null,
	cut: false
};
var CUT = {
	found: null,
	cut: true
};
/** For each graph, the searches from each input, by the input's offset, whether they keep to color and their depth. */
var feedings = /* @__PURE__ */ new WeakMap();
function feedingMemo(graph) {
	let memo = feedings.get(graph);
	if (!memo) {
		memo = /* @__PURE__ */ new Map();
		feedings.set(graph, memo);
	}
	return memo;
}
/**
* Follows a socket upstream through color adjustments to the Image Texture node that feeds it, with `colorOnly` only
* along links that carry a color. Each input of a graph is searched once at each depth, however many inputs and
* searches share it.
*/
function feeding(graph, socket, colorOnly, depth = 0) {
	const source = linkedOutput(graph, socket);
	if (!socket || !source) return NOT_FED;
	const color = !SCALAR_SOCKETS.has(socketType(socket)) && !SCALAR_SOCKETS.has(socketType(source.socket));
	if (colorOnly && !color) return NOT_FED;
	const type = nodeType(source.node);
	if (type !== "ShaderNodeTexImage" && !PASS_THROUGH.has(type)) return NOT_FED;
	if (depth > MAX_FEEDING_NODES) return CUT;
	if (type === "ShaderNodeTexImage") {
		if (isEmptyImageNode(source.node)) return NOT_FED;
		return {
			found: {
				node: source.node,
				output: source.name,
				via: [],
				changes: [],
				color
			},
			cut: false
		};
	}
	const memo = feedingMemo(graph);
	const key = `${socket.offset} ${colorOnly} ${depth}`;
	const known = memo.get(key);
	if (known) return known;
	let result = NOT_FED;
	for (const input of source.node.list("inputs")) {
		const fed = feeding(graph, input, colorOnly, depth + 1);
		if (!fed.found) {
			if (fed.cut) result = CUT;
			continue;
		}
		const change = KEEPS_VALUES.has(type) ? [] : [nodeLabel(source.node)];
		result = {
			found: {
				...fed.found,
				via: [{
					node: source.node,
					output: source.name
				}, ...fed.found.via],
				changes: [...change, ...fed.found.changes],
				color: color && fed.found.color
			},
			cut: false
		};
		break;
	}
	memo.set(key, result);
	return result;
}
function imageFeeding(graph, socket) {
	return feeding(graph, socket, false).found;
}
/** Whether the search from an input up to the image that feeds it stops at `MAX_FEEDING_NODES` before it ends. */
function passesFeedingLimit(graph, socket) {
	return feeding(graph, socket, false).cut;
}
/**
* The Image Texture node a color input reads: by a way whose links all carry its color where there is one, else by a
* way that carries one value of it.
*/
function colorFeeding(graph, socket) {
	return feeding(graph, socket, true).found ?? imageFeeding(graph, socket);
}
function imageName(found) {
	const image = found.node.deref("id");
	return image ? idName(image) : "an image";
}
/** Notes an input that nodes other than an image or a constant drive, which the preview shows at its own value. */
function noteNodeInput(graph, draft, input, socket, found) {
	if (found || !socket || constantOf(graph, socket)) return;
	const source = linkedOutput(graph, socket);
	if (!source) return;
	const through = passesFeedingLimit(graph, socket) ? ` through more than ${MAX_FEEDING_NODES} nodes` : "";
	draft.approximations.push(`${input} comes from ${nodeLabel(source.node)}${through}, shown at the value set on the input`);
}
/** The image an input samples, noting on the draft any nodes between that change its values. */
function imageInput(graph, draft, input, found) {
	if (!found) return null;
	noteChanges(draft, input, found);
	return imageUse(graph, draft, found.node);
}
/** One Mapping node's map, or null with a note on the draft when the preview cannot follow it. */
function mappingStep(graph, draft, image, mapping) {
	const values = {
		location: [
			0,
			0,
			0
		],
		rotation: [
			0,
			0,
			0
		],
		scale: [
			1,
			1,
			1
		]
	};
	const sockets = {
		location: "Location",
		rotation: "Rotation",
		scale: "Scale"
	};
	for (const key of [
		"location",
		"rotation",
		"scale"
	]) {
		const socket = inputSocket(mapping, sockets[key]);
		if (!socket) continue;
		const constant = constantOf(graph, socket);
		if (!constant) {
			const from = nodeLabel(linkedOutput(graph, socket)?.node ?? mapping);
			draft.approximations.push(`${image}'s Mapping takes its ${key} from ${from}, shown without the Mapping`);
			return null;
		}
		values[key] = values[key].map((value, index) => constant[index] ?? value);
	}
	const [x = 0, y = 0, z = 0] = values.location;
	const [turnX = 0, turnY = 0, turnZ = 0] = values.rotation;
	const [scaleX = 1, scaleY = 1, scaleZ = 1] = values.scale;
	const affine = mappingAffine(mapping.number("custom1"), [
		x,
		y,
		z
	], [
		turnX,
		turnY,
		turnZ
	], [
		scaleX,
		scaleY,
		scaleZ
	]);
	if (!affine) draft.approximations.push(`${image}'s Mapping is of the Normal type, shown without the Mapping`);
	return affine;
}
function imageUse(graph, draft, node) {
	const image = node.deref("id");
	if (!image) return null;
	const name = idName(image);
	const storage = node.deref("storage");
	const extension = storage?.number("extension") ?? 0;
	const wrap = WRAPS[extension] ?? "repeat";
	let uvMap = null;
	let coordinates = null;
	let affine = IDENTITY$1;
	let mappings = 0;
	let followed = true;
	let source = linkedOutput(graph, inputSocket(node, "Vector"));
	let depth = 0;
	for (; source && depth < MAX_VECTOR_NODES; depth++) {
		const type = nodeType(source.node);
		if (type === "ShaderNodeUVMap") {
			uvMap = source.node.deref("storage")?.string("uv_map") || null;
			break;
		}
		if (type === "ShaderNodeMapping") {
			const step = mappingStep(graph, draft, name, source.node);
			mappings++;
			if (step) affine = composeAffine(affine, step);
			else followed = false;
			source = linkedOutput(graph, inputSocket(source.node, "Vector"));
			if (!source) {
				draft.approximations.push(`${name}'s Mapping has no vector input, shown with the UV map`);
				followed = false;
			}
			continue;
		}
		if (type !== "ShaderNodeTexCoord") coordinates = nodeLabel(source.node);
		else if (source.name !== "UV") coordinates = source.name;
		break;
	}
	if (source && depth === MAX_VECTOR_NODES) {
		draft.approximations.push(`${name}'s vector passes ${MAX_VECTOR_NODES} Mapping nodes or more, shown with the UV map`);
		followed = false;
	}
	let transform = null;
	if (mappings > 0 && followed) {
		const mapped = uvTransformOf(affine);
		transform = mapped.transform;
		if (mapped.skewed) draft.approximations.push(`${name}'s Mapping shears it, which the preview leaves out`);
	}
	const projection = PROJECTIONS[storage?.number("projection") ?? 0] ?? null;
	const interpolation = INTERPOLATIONS[storage?.number("interpolation") ?? 0] ?? null;
	return {
		node,
		image,
		uvMap,
		wrap,
		transform,
		coordinates,
		clipped: extension === EXTENSION_CLIP,
		projection,
		interpolation,
		alpha: "none",
		colorSpace: decodingOf(colorSpaceName(image))?.colorSpace ?? null,
		frame: null
	};
}
function colorSpaceName(image) {
	return image.struct("colorspace_settings")?.string("name") ?? "";
}
/**
* How the preview decodes an image of a Blender color space, and whether that shows its colors as Blender does rather
* than only its curve; null for a space it cannot decode, and exact for no space, which leaves the slot's own way.
*/
function decodingOf(space) {
	if (space === "") return {
		colorSpace: null,
		exact: true
	};
	const exact = EXACT_DECODINGS.get(space);
	if (exact) return {
		colorSpace: exact,
		exact: true
	};
	if (SRGB_CURVES.has(space)) return {
		colorSpace: "srgb",
		exact: false
	};
	if (LINEAR_SPACES.has(space) || space.startsWith("Linear ")) return {
		colorSpace: "linear",
		exact: false
	};
	return null;
}
function isOutput(node) {
	return nodeType(node) === "ShaderNodeOutputMaterial";
}
/** Blender's `ntreeShaderOutputNode` for EEVEE: an output for EEVEE over one for all engines, the active one first. */
function outputNode(graph) {
	let chosen = null;
	const active = (node) => (node.number("flag") & 64) !== 0;
	for (const node of graph.nodes) {
		if (!isOutput(node)) continue;
		const target = node.number("custom1");
		if (target !== OUTPUT_FOR_ALL && target !== OUTPUT_FOR_EEVEE) continue;
		if (chosen === null || target === OUTPUT_FOR_EEVEE && chosen.number("custom1") === OUTPUT_FOR_ALL || target === chosen.number("custom1") && active(node) && !active(chosen)) chosen = node;
	}
	return chosen;
}
/** Whether a shader only gives light: an Emission shader, or a color or value where a shader is expected. */
function onlyLight(leaf) {
	return leaf.emitted !== null || nodeType(leaf.node) === "ShaderNodeEmission";
}
function strongest(leaves) {
	return leaves.reduce((best, leaf) => best === null || leaf.weight > best.weight ? leaf : best, null);
}
function isTransparent(graph, socket) {
	const source = linkedOutput(graph, socket);
	return source !== null && nodeType(source.node) === "ShaderNodeBsdfTransparent";
}
/** How the surface reads the node whose output `socket` reads, with the inputs it passes its share to. */
function surfaceStep(graph, socket, source) {
	const node = source.node;
	const type = nodeType(node);
	const [first = null, second = null, third = null] = node.list("inputs");
	const emitted = socketType(source.socket) !== SocketType.shader;
	if (emitted || type === "ShaderNodeEmission") {
		const toon = toonSource(graph, emitted ? socket : inputSocket(node, "Color"));
		if (!toon) return {
			role: {
				kind: "shader",
				emitted: emitted ? socket : null
			},
			notes: [],
			inputs: []
		};
		return {
			role: {
				kind: "passes",
				alpha: null
			},
			notes: [`${emitted ? "Its surface" : nodeLabel(node)} takes its color from ${nodeLabel(toon)}, shown as the shader it reads`],
			inputs: [[inputSocket(toon, "Shader"), 1]]
		};
	}
	if (type === "ShaderNodeMixShader") {
		const mix = first ? alphaSource(graph, first) : {
			kind: "constant",
			value: .5
		};
		if (mix.kind === "image" && isTransparent(graph, second)) return {
			role: {
				kind: "passes",
				alpha: mix
			},
			notes: [],
			inputs: [[third, 1]]
		};
		const notes = mix.kind === "constant" ? [] : [`${nodeLabel(node)} mixes by nodes, shown half and half`];
		const factor = mix.kind === "constant" ? mix.value : .5;
		return {
			role: {
				kind: "passes",
				alpha: null
			},
			notes,
			inputs: [[second, 1 - factor], [third, factor]]
		};
	}
	if (type === "ShaderNodeAddShader") {
		const shaders = [first, second];
		const clear = shaders.filter((shader) => isTransparent(graph, shader));
		const lit = shaders.filter((shader) => linkedOutput(graph, shader) && !isTransparent(graph, shader));
		return {
			role: {
				kind: "passes",
				alpha: null
			},
			notes: clear.length > 0 && lit.length > 0 ? [`${nodeLabel(node)} adds a Transparent BSDF, which the preview leaves out`] : [],
			inputs: (lit.length > 0 ? lit : shaders).map((shader) => [shader, 1])
		};
	}
	if (type === "ShaderNodeBsdfTransparent") return {
		role: { kind: "clear" },
		notes: [],
		inputs: []
	};
	if (type === "ShaderNodeHoldout") return {
		role: { kind: "clear" },
		notes: [`${nodeLabel(node)} hides what is behind it too, shown see-through`],
		inputs: []
	};
	return {
		role: {
			kind: "shader",
			emitted: null
		},
		notes: [],
		inputs: []
	};
}
/**
* The nodes the surface reaches through mix and add shaders, by the offset of the output each is read from, and the
* key of the surface's own. Each node is read once, at the depth of the shortest way to it, and only along ways that
* give it a share.
*/
function surfaceNodes(graph, surface) {
	const nodes = /* @__PURE__ */ new Map();
	const queue = [];
	const reach = (socket, depth) => {
		const source = linkedOutput(graph, socket);
		if (!source) return null;
		const key = source.socket.offset;
		if (nodes.has(key)) return key;
		const node = {
			source,
			depth,
			...depth > MAX_SURFACE_DEPTH ? {
				role: { kind: "deep" },
				notes: [],
				inputs: []
			} : surfaceStep(graph, socket, source),
			reads: []
		};
		nodes.set(key, node);
		queue.push(node);
		return key;
	};
	const root = surface ? reach(surface, 0) : null;
	for (let index = 0; index < queue.length; index++) {
		const node = queue[index];
		if (!node) break;
		for (const [input, part] of node.inputs) {
			const key = input && part > 0 ? reach(input, node.depth + 1) : null;
			if (key !== null) node.reads.push({
				key,
				part
			});
		}
	}
	return {
		nodes,
		root
	};
}
/**
* Each node's share of the surface, passed from the surface down through the nodes in an order where each comes before
* those it reads, and the nodes in the order a depth-first walk first reaches them. A read back into a way the walk is
* on, which only a damaged file has, passes nothing.
*/
function surfaceShares(nodes, root) {
	if (root === null) return {
		shares: /* @__PURE__ */ new Map(),
		reached: []
	};
	const reached = [];
	const finished = [];
	const visited = /* @__PURE__ */ new Set();
	const open = /* @__PURE__ */ new Set();
	const back = /* @__PURE__ */ new Set();
	const stack = [];
	const enter = (key) => {
		visited.add(key);
		open.add(key);
		reached.push(key);
		stack.push({
			key,
			next: 0
		});
	};
	enter(root);
	for (let top = stack.at(-1); top; top = stack.at(-1)) {
		const read = nodes.get(top.key)?.reads[top.next++];
		if (!read) {
			open.delete(top.key);
			finished.push(top.key);
			stack.pop();
		} else if (open.has(read.key)) back.add(read);
		else if (!visited.has(read.key)) enter(read.key);
	}
	const shares = /* @__PURE__ */ new Map([[root, 1]]);
	for (const key of finished.reverse()) {
		const share = shares.get(key) ?? 0;
		for (const read of nodes.get(key)?.reads ?? []) if (!back.has(read)) shares.set(read.key, (shares.get(read.key) ?? 0) + share * read.part);
	}
	return {
		shares,
		reached
	};
}
/**
* The shader the output's surface shows most of, looking through mix and add shaders, which weigh their inputs, and
* the others, which add their light. A Transparent BSDF in the mix makes the surface see-through rather than becoming
* the shader. A node that several ways reach is read once, with the shares of all of them.
*/
function surfaceShader(graph, output) {
	const leaves = [];
	const notes = [];
	const alphaImages = [];
	let transparent = 0;
	let deep = false;
	const { nodes, root } = surfaceNodes(graph, inputSocket(output, "Surface"));
	const { shares, reached } = surfaceShares(nodes, root);
	for (const key of reached) {
		const node = nodes.get(key);
		const weight = shares.get(key) ?? 0;
		if (!node || weight <= 0) continue;
		notes.push(...node.notes);
		const role = node.role;
		if (role.kind === "shader") leaves.push({
			node: node.source.node,
			weight,
			emitted: role.emitted
		});
		else if (role.kind === "clear") transparent += weight;
		else if (role.kind === "passes" && role.alpha) alphaImages.push(role.alpha);
		else if (role.kind === "deep") deep = true;
	}
	if (deep) notes.push(`Its surface nests shaders more than ${MAX_SURFACE_DEPTH} deep, which the preview leaves out`);
	const alpha = clamp01(1 - transparent);
	const shaders = leaves.filter((leaf) => !onlyLight(leaf));
	const shown = strongest(shaders) ?? strongest(leaves);
	if (shaders.length > 1 && shown) notes.push(`${leaves.length} shaders mix, shown as ${shown.node.string("name") || "the strongest"}`);
	return {
		shown,
		others: leaves.filter((leaf) => leaf !== shown),
		alpha,
		alphaImages,
		notes
	};
}
/**
* The light a shader adds to the surface: an Emission shader's, a color's or value's where a shader is expected, or a
* Principled BSDF's emission. Other shaders give none.
*/
function lightOf(graph, leaf, isGray) {
	const light = defaultMaterial(nodeLabel(leaf.node));
	const type = nodeType(leaf.node);
	if (leaf.emitted) readEmitted(graph, leaf.emitted, leaf.node, light, isGray);
	else if (type === "ShaderNodeEmission") readSimpleShader(graph, leaf.node, light, isGray);
	else if (type === "ShaderNodeBsdfPrincipled") readPrincipledEmission(graph, leaf.node, light, isGray);
	return light;
}
function emits(draft) {
	return draft.emissive.some((channel) => channel !== 0);
}
/**
* Adds a shader's light, at `scale` of its strength, to the material's: to its constant light, or in place of none,
* as an image or a color attribute. Light the material cannot add to its own it notes.
*/
function addLight(draft, light, scale) {
	draft.approximations.push(...light.approximations);
	if (!emits(light)) return;
	const scaled = light.emissive.map((channel) => channel * scale);
	const plain = (material) => material.emissiveImage === null && material.emissiveAttribute === null;
	if (plain(draft) && plain(light)) draft.emissive = draft.emissive.map((channel, index) => channel + (scaled[index] ?? 0));
	else if (!emits(draft)) {
		draft.emissive = scaled;
		draft.emissiveImage = light.emissiveImage;
		draft.emissiveAttribute = light.emissiveAttribute;
	} else draft.approximations.push(`${light.name} adds light the preview leaves out`);
}
/**
* Gives the material the light of the surface's shaders by their share of its opaque part: the shown shader's own, and
* the others' added to it.
*/
function applySurfaceLight(graph, draft, surface, isGray) {
	const opaque = surface.alpha > 0 ? surface.alpha : 1;
	const share = (surface.shown?.weight ?? opaque) / opaque;
	draft.emissive = draft.emissive.map((channel) => channel * share);
	if (surface.others.every(onlyLight)) {
		const [r, g, b, a] = draft.baseColor;
		draft.baseColor = [
			r * share,
			g * share,
			b * share,
			a
		];
	}
	for (const leaf of surface.others) addLight(draft, lightOf(graph, leaf, isGray), leaf.weight / opaque);
}
/** The Shader to RGB node a color comes from without an image, as toon shading does. */
function toonSource(graph, color) {
	if (!color || imageFeeding(graph, color)) return null;
	return upstreamNode(graph, color, "ShaderNodeShaderToRGB");
}
function alphaClip(graph, socket) {
	const source = linkedOutput(graph, socket);
	if (!source || nodeType(source.node) !== "ShaderNodeMath") return null;
	const operation = source.node.number("custom1");
	const [a, b] = source.node.list("inputs");
	if (!a || !b) return null;
	const constantA = constantOf(graph, a)?.[0];
	const constantB = constantOf(graph, b)?.[0];
	if (operation === MATH_GREATER_THAN && constantA === void 0 && constantB !== void 0) return {
		input: a,
		cutoff: constantB,
		strict: true
	};
	if (operation === MATH_LESS_THAN && constantA !== void 0 && constantB === void 0) return {
		input: b,
		cutoff: constantA,
		strict: true
	};
	if (operation === MATH_ROUND && constantA === void 0) return {
		input: a,
		cutoff: .5,
		strict: false
	};
	if (operation !== MATH_SUBTRACT || constantA !== 1 || constantB !== void 0) return null;
	const inner = linkedOutput(graph, b);
	if (!inner || nodeType(inner.node) !== "ShaderNodeMath") return null;
	const [x, y] = inner.node.list("inputs");
	if (!x || !y) return null;
	const constantX = constantOf(graph, x)?.[0];
	const constantY = constantOf(graph, y)?.[0];
	const innerOperation = inner.node.number("custom1");
	if (innerOperation === MATH_LESS_THAN && constantX === void 0 && constantY !== void 0) return {
		input: x,
		cutoff: constantY,
		strict: false
	};
	if (innerOperation === MATH_GREATER_THAN && constantX !== void 0 && constantY === void 0) return {
		input: y,
		cutoff: constantX,
		strict: false
	};
	return null;
}
/** A Math node that multiplies an input by a constant, as glTF's alpha factor does. */
function scaledBy(graph, socket) {
	const source = linkedOutput(graph, socket);
	if (!source || nodeType(source.node) !== "ShaderNodeMath" || source.node.number("custom1") !== MATH_MULTIPLY) return null;
	const [a, b] = source.node.list("inputs");
	if (!a || !b) return null;
	const constantA = constantOf(graph, a)?.[0];
	const constantB = constantOf(graph, b)?.[0];
	if (constantA !== void 0 && constantB === void 0) return {
		input: b,
		factor: constantA
	};
	if (constantB !== void 0 && constantA === void 0) return {
		input: a,
		factor: constantB
	};
	return null;
}
/** A Math node that multiplies an input by a constant from 0 to 1, as glTF's importer builds its factors. */
function unitScaledBy(graph, socket) {
	const scaled = scaledBy(graph, socket);
	return scaled && scaled.factor >= 0 && scaled.factor <= 1 ? scaled : null;
}
/** A Mix node that multiplies a color by a constant color at full factor, as glTF's importer builds a color factor. */
function colorScaledBy(graph, socket) {
	const source = linkedOutput(graph, socket);
	if (!source) return null;
	const node = source.node;
	const type = nodeType(node);
	const mix = type === "ShaderNodeMix" ? node.deref("storage") : null;
	if (mix && mix.number("data_type") !== SocketType.color) return null;
	const [factor = null, a = null, b = null] = type === "ShaderNodeMix" ? [
		inputSocket(node, "Factor_Float"),
		inputSocket(node, "A_Color"),
		inputSocket(node, "B_Color")
	] : type === "ShaderNodeMixRGB" ? [
		inputSocket(node, "Fac"),
		inputSocket(node, "Color1"),
		inputSocket(node, "Color2")
	] : [];
	const blend = mix ? mix.number("blend_type") : node.number("custom1");
	if (!a || !b || blend !== MIX_MULTIPLY || constantOf(graph, factor)?.[0] !== 1) return null;
	const constantA = constantOf(graph, a);
	const constantB = constantOf(graph, b);
	if (constantA && !constantB) return {
		input: b,
		factor: constantA
	};
	if (constantB && !constantA) return {
		input: a,
		factor: constantB
	};
	return null;
}
function sameImageNode(a, b) {
	return a !== null && b !== null && a.node.offset === b.node.offset;
}
/**
* Where an alpha input or a Mix Shader's factor comes from: a constant, or an image's alpha, scaled by a constant and
* clipped at a cutoff as glTF's importer builds them, or else other nodes. A clip of the alpha times a factor keeps the
* texels whose alpha reaches the cutoff divided by the factor, and a clip that keeps every texel is a constant, as is
* the alpha of an image Blender loads opaque.
*/
function alphaSource(graph, socket) {
	const constant = constantOf(graph, socket);
	if (constant) return {
		kind: "constant",
		value: clamp01(constant[0] ?? 1)
	};
	const clip = alphaClip(graph, socket);
	const compared = clip?.input ?? socket;
	const scaled = clip ? scaledBy(graph, compared) : unitScaledBy(graph, compared);
	const factor = scaled && (!clip || scaled.factor > 0) ? scaled : null;
	const found = imageFeeding(graph, factor?.input ?? compared);
	const source = linkedOutput(graph, socket);
	const other = {
		kind: "nodes",
		from: found ? imageName(found) : source ? nodeLabel(source.node) : "nodes"
	};
	if (found?.output !== "Alpha") return other;
	const scale = factor?.factor ?? 1;
	const image = found.node.deref("id");
	const opaque = image !== null && loadsOpaque(image);
	if (opaque && found.changes.length > 0) return other;
	if (!clip && opaque) return {
		kind: "constant",
		value: clamp01(scale)
	};
	if (!clip) return {
		kind: "image",
		found,
		factor: scale,
		cutoff: null
	};
	if (found.changes.length > 0) return other;
	const cutoff = clip.cutoff / scale + (clip.strict ? STRICT : 0);
	if (cutoff <= 0) return {
		kind: "constant",
		value: 1
	};
	if (opaque) return {
		kind: "constant",
		value: cutoff <= 1 ? 1 : 0
	};
	return {
		kind: "image",
		found,
		factor: 1,
		cutoff
	};
}
/** Whether Blender loads an image with an alpha of 1: its Alpha Mode is None and it does not hold data. */
function loadsOpaque(image) {
	return alphaMode(image) === ALPHA_IGNORE && !DATA_SPACES.has(colorSpaceName(image));
}
function samplingOf$1(use) {
	return JSON.stringify([
		use.uvMap,
		use.wrap,
		use.transform,
		use.coordinates,
		use.clipped,
		use.projection,
		use.interpolation
	]);
}
/** Whether an Image Texture node samples the base color's image where the base color does, as the preview's alpha. */
function samplesBase(graph, draft, found) {
	const base = draft.baseColorImage;
	const use = base ? imageUse(graph, defaultMaterial(), found.node) : null;
	return base !== null && use !== null && use.image.offset === base.image.offset && samplingOf$1(use) === samplingOf$1(base);
}
/**
* Takes the material's alpha from its base color image's alpha, scaled or clipped as `alpha` says. A cutout shows the
* texels it keeps opaque.
*/
function useImageAlpha(draft, alpha) {
	if (alpha.found.changes.length > 0) {
		const nodes = [...new Set(alpha.found.changes)].join(", ");
		const image = imageName(alpha.found);
		draft.approximations.push(`Alpha passes ${image}'s alpha through ${nodes}, which the preview leaves out`);
	}
	if (draft.baseColorImage) draft.baseColorImage.alpha = "opacity";
	if (alpha.cutoff === null) {
		draft.baseColor[3] *= alpha.factor;
		draft.alphaMode = "blend";
		return;
	}
	const kept = draft.baseColor[3];
	if (kept < 1) draft.approximations.push(`Alpha is ${Math.round(kept * 100) / 100} inside the cutout, shown opaque`);
	draft.baseColor[3] = 1;
	draft.alphaMode = "mask";
	draft.alphaCutoff = alpha.cutoff;
}
/** The Principled BSDF's alpha, or a note where the preview cannot show it. */
function readAlpha(graph, draft, socket) {
	const source = socket ? alphaSource(graph, socket) : {
		kind: "constant",
		value: 1
	};
	if (source.kind === "constant") {
		draft.baseColor[3] = source.value;
		if (source.value < 1) draft.alphaMode = "blend";
	} else if (source.kind === "image" && samplesBase(graph, draft, source.found)) useImageAlpha(draft, source);
	else {
		const from = source.kind === "image" ? imageName(source.found) : source.from;
		draft.approximations.push(`Alpha comes from ${from}, which the preview leaves out`);
	}
}
/** An image the input reads times a constant color, as glTF's importer builds a base color or emissive factor. */
function factoredImage(graph, socket) {
	const scaled = socket ? colorScaledBy(graph, socket) : null;
	const found = colorFeeding(graph, scaled?.input ?? socket);
	return found ? {
		found,
		factor: scaled?.factor ?? [
			1,
			1,
			1
		]
	} : null;
}
/**
* The color attribute an input reads from a Color Attribute node, as the node names it with "" for the mesh's default,
* times a constant color as glTF's importer builds a factor.
*/
function factoredAttribute(graph, socket) {
	const scaled = socket ? colorScaledBy(graph, socket) : null;
	const source = linkedOutput(graph, scaled?.input ?? socket);
	if (!source || nodeType(source.node) !== "ShaderNodeVertexColor" || source.name !== "Color") return null;
	return {
		attribute: source.node.deref("storage")?.string("layer_name") ?? "",
		factor: scaled?.factor ?? [
			1,
			1,
			1
		]
	};
}
/**
* The image a color input samples, unless every way from it to the input carries one value, such as one channel, the
* brightness or the alpha, which it notes on the draft instead. One value that equals the color of a gray image, as
* its red channel or its brightness do, shows the image where `isGray` says it is gray.
*/
function colorImage(graph, draft, input, found, isGray) {
	if (!found) return null;
	const image = found.node.deref("id");
	if (found.color || image && valueOfGray(found) && isGray(image, "whole") === true) return imageInput(graph, draft, input, found);
	const channel = channelOf(found);
	const what = channel ? channelName(channel) : "the brightness";
	const through = found.changes.length > 0 ? ` through ${[...new Set(found.changes)].join(", ")}` : "";
	draft.approximations.push(`${input} comes from ${what} of ${imageName(found)}${through}, which the preview leaves out`);
	return null;
}
function noteChanges(draft, input, found) {
	if (found.changes.length === 0) return;
	const nodes = [...new Set(found.changes)].join(", ");
	draft.approximations.push(`${input} passes ${imageName(found)} through ${nodes}, which the preview leaves out`);
}
/**
* Roughness in green and metalness in blue of one image, each times a constant as glTF's importer builds its factors,
* which the preview reads as a packed image.
*/
function readPacked(graph, draft, metallicSocket, roughnessSocket) {
	const metallicScaled = metallicSocket ? unitScaledBy(graph, metallicSocket) : null;
	const roughnessScaled = roughnessSocket ? unitScaledBy(graph, roughnessSocket) : null;
	const metallic = imageFeeding(graph, metallicScaled?.input ?? metallicSocket);
	const roughness = imageFeeding(graph, roughnessScaled?.input ?? roughnessSocket);
	if (!(metallic !== null && roughness !== null && sameImageNode(metallic, roughness) && channelOf(metallic)?.index === BLUE && channelOf(roughness)?.index === GREEN)) return false;
	noteChanges(draft, "Roughness", roughness);
	noteChanges(draft, "Metallic", metallic);
	draft.metallicRoughnessImage = imageUse(graph, draft, metallic.node);
	draft.metallic = metallicScaled?.factor ?? 1;
	draft.roughness = roughnessScaled?.factor ?? 1;
	return true;
}
function readPrincipled(graph, node, draft, isGray) {
	const baseSocket = inputSocket(node, "Base Color");
	const attribute = factoredAttribute(graph, baseSocket);
	const base = factoredImage(graph, baseSocket);
	draft.baseColorImage = colorImage(graph, draft, "Base color", base?.found ?? null, isGray);
	draft.baseColorAttribute = attribute?.attribute ?? null;
	const color = attribute?.factor ?? (draft.baseColorImage ? base?.factor ?? [
		1,
		1,
		1
	] : inputValue(graph, baseSocket, [
		.8,
		.8,
		.8,
		1
	]));
	draft.baseColor = [
		color[0] ?? .8,
		color[1] ?? .8,
		color[2] ?? .8,
		1
	];
	if (!attribute) noteNodeInput(graph, draft, "Base color", baseSocket, base?.found ?? null);
	const metallicSocket = inputSocket(node, "Metallic");
	const roughnessSocket = inputSocket(node, "Roughness");
	draft.metallic = clamp01(scalarOf(graph, metallicSocket, 0));
	draft.roughness = clamp01(scalarOf(graph, roughnessSocket, .5));
	const metallicImage = imageFeeding(graph, metallicSocket);
	const roughnessImage = imageFeeding(graph, roughnessSocket);
	if (!readPacked(graph, draft, metallicSocket, roughnessSocket)) {
		draft.roughnessImage = channelImage(graph, draft, "Roughness", roughnessImage, GREEN, isGray);
		draft.metalnessImage = channelImage(graph, draft, "Metallic", metallicImage, BLUE, isGray);
		noteNodeInput(graph, draft, "Roughness", roughnessSocket, roughnessImage);
		noteNodeInput(graph, draft, "Metallic", metallicSocket, metallicImage);
	}
	noteTransmission(graph, draft, inputSocket(node, "Transmission Weight", "Transmission"), metallicSocket);
	const normal = linkedOutput(graph, inputSocket(node, "Normal"));
	const normalSpace = normal?.node.deref("storage")?.number("space") ?? TANGENT_SPACE;
	if (normal && nodeType(normal.node) === "ShaderNodeNormalMap" && normalSpace !== TANGENT_SPACE) {
		const space = NORMAL_SPACES[normalSpace] ?? "non-tangent";
		draft.approximations.push(`Its normal map is in ${space} space, which the preview leaves out`);
	} else if (normal && nodeType(normal.node) === "ShaderNodeNormalMap") {
		const colorSocket = inputSocket(normal.node, "Color");
		const image = colorFeeding(graph, colorSocket);
		draft.normalImage = colorImage(graph, draft, "Normal", image, isGray);
		const strength = inputSocket(normal.node, "Strength");
		if (draft.normalImage) {
			draft.normalScale = scalarOf(graph, strength, 1);
			draft.normalTangentUv = normal.node.deref("storage")?.string("uv_map") || null;
			noteNodeInput(graph, draft, "Normal map strength", strength, null);
		}
		noteNodeInput(graph, draft, "Normal map color", colorSocket, image);
	} else if (normal) draft.approximations.push(`Normal comes from ${nodeLabel(normal.node)}, which the preview leaves out`);
	readPrincipledEmission(graph, node, draft, isGray);
	readAlpha(graph, draft, inputSocket(node, "Alpha"));
}
/** The light of a Principled BSDF: its emission color times its strength. */
function readPrincipledEmission(graph, node, draft, isGray) {
	const emissionSocket = inputSocket(node, "Emission Color", "Emission");
	const strengthSocket = inputSocket(node, "Emission Strength");
	const strength = strengthSocket ? scalarOf(graph, strengthSocket, 1) : 1;
	const attribute = strength !== 0 ? factoredAttribute(graph, emissionSocket) : null;
	const emission = factoredImage(graph, emissionSocket);
	draft.emissiveImage = strength > 0 ? colorImage(graph, draft, "Emission", emission?.found ?? null, isGray) : null;
	draft.emissiveAttribute = attribute?.attribute ?? null;
	const emissionColor = attribute?.factor ?? (draft.emissiveImage ? emission?.factor ?? [
		1,
		1,
		1
	] : emission ? [
		0,
		0,
		0
	] : inputValue(graph, emissionSocket, [
		0,
		0,
		0,
		1
	]));
	draft.emissive = [
		0,
		1,
		2
	].map((index) => (emissionColor[index] ?? 0) * strength);
	if (strength !== 0 && !attribute) noteNodeInput(graph, draft, "Emission", emissionSocket, emission?.found ?? null);
	noteNodeInput(graph, draft, "Emission strength", strengthSocket, null);
}
/** Notes the transmission of a Principled BSDF, which shows only where it is not metallic. */
function noteTransmission(graph, draft, socket, metallic) {
	const dielectric = 1 - clamp01(constantOf(graph, metallic)?.[0] ?? 0);
	if (dielectric <= 0) return;
	const source = constantOf(graph, socket) ? null : linkedOutput(graph, socket);
	if (source) {
		const found = imageFeeding(graph, socket);
		const from = found ? imageName(found) : nodeLabel(source.node);
		draft.approximations.push(`Transmission comes from ${from}, which the preview leaves out`);
		return;
	}
	const shown = Math.round(clamp01(scalarOf(graph, socket, 0)) * dielectric * 100) / 100;
	if (shown > 0) draft.approximations.push(`Transmission is ${shown}, which the preview leaves out`);
}
/** The channel a Separate node's output picks, with the index of the color channel it is; no index for HSV or HSL. */
function separatedChannel(separate) {
	const named = SEPARATED_CHANNELS[(nodeType(separate.node) === "ShaderNodeSeparateColor" ? separate.node.deref("storage")?.number("mode") : SEPARATE_RGB) ?? SEPARATE_RGB];
	const index = CHANNEL_INDEX.get(separate.output) ?? null;
	if (named) return {
		name: named[index ?? -1] ?? separate.output,
		index: null
	};
	return {
		name: separate.output,
		index
	};
}
/**
* The channel of an image a scalar input reads: a Separate node's output, with the index of the color channel it is,
* or the image's alpha, with no index; null for its color.
*/
function channelOf(found) {
	if (!found) return null;
	const separate = found.via.find((step) => SEPARATES.has(nodeType(step.node)));
	if (separate) return separatedChannel(separate);
	return found.output === "Alpha" ? {
		name: "Alpha",
		index: null
	} : null;
}
/** Whether the value an image gives an input is its color where the image is gray: not its alpha, hue or saturation. */
function valueOfGray(found) {
	if (found.output === "Alpha") return false;
	return found.via.every((step) => {
		if (!SEPARATES.has(nodeType(step.node))) return true;
		const channel = separatedChannel(step);
		return channel.index !== null || GRAY_CHANNELS.has(channel.name);
	});
}
/**
* The image a scalar input samples, unless it picks a channel other than the one the preview reads, green for
* roughness and blue for metallic, which it notes on the draft instead. Where the input takes the image's color, which
* Blender turns into its brightness, it notes an image that a sample `isGray` reads shows is not gray.
*/
function channelImage(graph, draft, input, found, readable, isGray) {
	if (!found) return null;
	const channel = channelOf(found);
	if (channel !== null && channel.index !== readable) {
		const what = channelName(channel);
		draft.approximations.push(`${input} comes from ${what} of ${imageName(found)}, which the preview leaves out`);
		return null;
	}
	const image = found.node.deref("id");
	if (channel === null && image && isGray(image, "sample") === false) draft.approximations.push(`${input} comes from the brightness of ${imageName(found)}, shown as its ${CHANNEL_NAMES[readable]} channel`);
	return imageInput(graph, draft, input, found);
}
function channelName(channel) {
	return channel.name === "Alpha" ? "the alpha" : `the ${channel.name} channel`;
}
/** The color of a metal from its complex index of refraction: its reflectance seen head-on. */
function conductorColor(graph, node, draft) {
	const iorSocket = inputSocket(node, "IOR");
	const extinctionSocket = inputSocket(node, "Extinction");
	noteNodeInput(graph, draft, "IOR", iorSocket, null);
	noteNodeInput(graph, draft, "Extinction", extinctionSocket, null);
	const ior = inputValue(graph, iorSocket, [
		1,
		1,
		1
	]);
	const extinction = inputValue(graph, extinctionSocket, [
		0,
		0,
		0
	]);
	return [
		0,
		1,
		2
	].map((index) => {
		const n = ior[index] ?? 1;
		const k = extinction[index] ?? 0;
		return ((n - 1) ** 2 + k ** 2) / ((n + 1) ** 2 + k ** 2);
	});
}
/** A shader other than the Principled BSDF, by its color, which the Specular and Metallic BSDFs call Base Color. */
function readSimpleShader(graph, node, draft, isGray) {
	const type = nodeType(node);
	const glows = type === "ShaderNodeEmission";
	const conductor = type === "ShaderNodeBsdfMetallic" && node.number("custom2") === PHYSICAL_CONDUCTOR;
	const colorSocket = conductor ? null : inputSocket(node, "Color", "Base Color");
	const attribute = factoredAttribute(graph, colorSocket);
	const fed = factoredImage(graph, colorSocket);
	const image = colorImage(graph, draft, glows ? "Emission" : "Base color", fed?.found ?? null, isGray);
	const color = attribute?.factor ?? (image ? fed?.factor ?? [
		1,
		1,
		1
	] : fed && glows ? [
		0,
		0,
		0
	] : conductor ? conductorColor(graph, node, draft) : inputValue(graph, colorSocket, [
		.8,
		.8,
		.8,
		1
	]));
	if (!attribute) noteNodeInput(graph, draft, "Color", colorSocket, fed?.found ?? null);
	if (glows) {
		const strengthSocket = inputSocket(node, "Strength");
		const strength = scalarOf(graph, strengthSocket, 1);
		noteNodeInput(graph, draft, "Strength", strengthSocket, null);
		draft.baseColor = [
			0,
			0,
			0,
			1
		];
		draft.emissiveImage = image;
		draft.emissiveAttribute = attribute?.attribute ?? null;
		draft.emissive = [
			0,
			1,
			2
		].map((index) => (color[index] ?? 0) * strength);
		return;
	}
	draft.baseColor = [
		color[0] ?? .8,
		color[1] ?? .8,
		color[2] ?? .8,
		1
	];
	draft.baseColorImage = image;
	draft.baseColorAttribute = attribute?.attribute ?? null;
	const roughness = inputSocket(node, "Roughness");
	if (type === "ShaderNodeBsdfDiffuse") draft.roughness = 1;
	else if (roughness) {
		draft.roughness = clamp01(scalarOf(graph, roughness, .5));
		noteNodeInput(graph, draft, "Roughness", roughness, null);
	}
	draft.metallic = METAL_SHADERS.has(type) ? 1 : 0;
}
/**
* A color or a value that `node` puts where a shader is expected, which Blender shows as the light of an Emission
* shader of strength 1. Other nodes that drive it leave the material's own color, with a note on the draft. An image
* the preview leaves out leaves the surface black, since Blender shows only the light there.
*/
function readEmitted(graph, socket, node, draft, isGray) {
	const attribute = factoredAttribute(graph, socket);
	const found = colorFeeding(graph, socket);
	const image = colorImage(graph, draft, "Emission", found, isGray);
	const constant = constantOf(graph, socket, SocketType.color);
	if (attribute || found || constant) {
		draft.baseColor = [
			0,
			0,
			0,
			1
		];
		draft.metallic = 0;
		draft.emissiveImage = image;
		draft.emissiveAttribute = attribute?.attribute ?? null;
		const color = attribute?.factor ?? (image ? [
			1,
			1,
			1
		] : constant ?? []);
		draft.emissive = [
			color[0] ?? 0,
			color[1] ?? 0,
			color[2] ?? 0
		];
	} else draft.approximations.push(`Its surface emits the output of ${nodeLabel(node)}, which the preview leaves out`);
}
/** What EEVEE shows of a material whose output has no surface: black, or nothing where a volume fills it. */
function readNoSurface(draft, volume) {
	draft.baseColor = [
		0,
		0,
		0,
		volume ? 0 : 1
	];
	draft.metallic = 0;
	draft.roughness = 1;
	if (volume) draft.alphaMode = "blend";
}
function imageSource(image) {
	return image.has("source") ? image.number("source") : 1;
}
/**
* Blender's `BKE_image_user_frame_get`: the frame of an image sequence that an Image Texture node shows at a scene
* frame, from the node's start frame, frame count, offset and whether it cycles.
*/
function sequenceFrame(node, sceneFrame) {
	const user = node.deref("storage")?.struct("iuser");
	const length = user?.number("frames") ?? 0;
	if (!user || length <= 0) return 0;
	let frame = sceneFrame - user.number("sfra") + 1;
	if (user.number("cycl") !== 0) {
		frame %= length;
		if (frame <= 0) frame += length;
	}
	return Math.min(Math.max(frame, 0), length) + user.number("offset");
}
/** Notes what the preview shows differently of the images, the sequences' at `sceneFrame`. */
function noteImages(draft, sceneFrame) {
	const colorImages = /* @__PURE__ */ new Set([draft.baseColorImage, draft.emissiveImage]);
	for (const use of imageUses(draft)) {
		const name = idName(use.image);
		const source = imageSource(use.image);
		const packed = packedFile(use.image) !== null;
		if (source === 6) {
			if ((packed ? use.image.list("packedfiles") : use.image.list("tiles")).length > 1) draft.approximations.push(`${name} is a UDIM tiled image, shown with its first tile`);
		} else if (source === 2 && !packed) draft.approximations.push(`${name} is an image sequence, shown as it is at frame ${sceneFrame}`);
		else if (source !== 1 && !packed) {
			const kind = IMAGE_SOURCES[source] ?? "not an image file";
			draft.approximations.push(`${name} is ${kind}, which the preview leaves out`);
		}
		if (use.coordinates) draft.approximations.push(`${name} uses ${use.coordinates} coordinates, shown with the UV map`);
		if (use.clipped) draft.approximations.push(`${name} is clipped at its edges, shown extended`);
		if (use.projection) draft.approximations.push(`${name} uses ${use.projection} projection, shown flat`);
		if (use.interpolation) draft.approximations.push(`${name} uses ${use.interpolation} interpolation, shown Linear`);
		const space = colorSpaceName(use.image);
		const decoding = decodingOf(space);
		const color = colorImages.has(use);
		if (!decoding) draft.approximations.push(`${name} is ${space}, shown as ${color ? "sRGB" : "Non-Color"}`);
		else if (!decoding.exact && color) {
			const shown = decoding.colorSpace === "srgb" ? "sRGB" : "Linear Rec.709";
			draft.approximations.push(`${name} is ${space}, shown as ${shown}`);
		}
	}
}
/**
* A metallic-roughness approximation of a Blender material from its node tree, with its image sequences as they are at
* `sceneFrame`. A material without nodes takes its color, metallic and roughness, opaque, as EEVEE renders it.
* `isGray` reads the whole of images that reach a color input as one value, and a sample of those whose color reaches
* roughness or metallic.
*/
function readMaterial(material, version, isGray, sceneFrame) {
	const draft = defaultMaterial(idName(material));
	draft.baseColor = [
		material.number("r"),
		material.number("g"),
		material.number("b"),
		1
	];
	draft.metallic = clamp01(material.number("metallic"));
	draft.roughness = clamp01(material.number("roughness"));
	draft.doubleSided = (material.number("blend_flag") & BACKFACE_CULLING) === 0;
	const tree = material.deref("nodetree");
	const usesNodes = version >= 500 || !material.has("use_nodes") || material.number("use_nodes") !== 0;
	const graph = tree && usesNodes ? graphOf(tree) : null;
	if (graph) {
		const output = outputNode(graph);
		if (!output && graph.nodes.some((node) => node.number("custom1") === OUTPUT_FOR_CYCLES && isOutput(node))) draft.approximations.push("Its output is for Cycles only, shown black as EEVEE renders it");
		const surface = output ? surfaceShader(graph, output) : null;
		const shown = surface?.shown ?? null;
		const volume = output ? linkedOutput(graph, inputSocket(output, "Volume")) : null;
		if (!shown) readNoSurface(draft, volume !== null);
		else if (shown.emitted) readEmitted(graph, shown.emitted, shown.node, draft, isGray);
		else if (nodeType(shown.node) === "ShaderNodeBsdfPrincipled") readPrincipled(graph, shown.node, draft, isGray);
		else {
			readSimpleShader(graph, shown.node, draft, isGray);
			if (!SIMPLE_SHADERS.has(nodeType(shown.node))) draft.approximations.push(`Its surface is ${nodeLabel(shown.node)}, shown as a plain shader of its color`);
		}
		if (surface) applySurfaceLight(graph, draft, surface, isGray);
		if (volume) draft.approximations.push(`Its volume comes from ${nodeLabel(volume.node)}, which the preview leaves out`);
		const displacement = output ? linkedOutput(graph, inputSocket(output, "Displacement")) : null;
		if (displacement) draft.approximations.push(`Displacement comes from ${nodeLabel(displacement.node)}, which the preview leaves out`);
		if (surface) applySurfaceAlpha(graph, draft, surface);
		const read = output ? readOutputs(graph, output) : /* @__PURE__ */ new Set();
		for (const use of [draft.baseColorImage, draft.emissiveImage]) {
			if (!use) continue;
			if (use.alpha !== "opacity") use.alpha = colorAlpha(use, read);
			notePremultiplied(draft, use, read);
		}
	}
	for (const use of imageUses(draft)) if (imageSource(use.image) === 2) use.frame = sequenceFrame(use.node, sceneFrame);
	noteImages(draft, sceneFrame);
	if (material.number("blend_method") === BLEND_METHOD_CLIP && draft.alphaMode === "blend") {
		draft.alphaMode = "mask";
		draft.alphaCutoff = (material.has("alpha_threshold") ? material.number("alpha_threshold") : .5) + STRICT;
	} else if (draft.alphaMode === "blend" && dithers(material, version)) draft.alphaMode = "hash";
	draft.approximations = [...new Set(draft.approximations)];
	return draft;
}
/**
* Whether Blender draws the material's transparency dithered, as its Dithered render method or older Hashed blend mode
* does, rather than blended in sorted order.
*/
function dithers(material, version) {
	if (version >= RENDER_METHOD_VERSION && material.has("surface_render_method")) return material.number("surface_render_method") === RENDER_METHOD_DITHERED;
	return material.number("blend_method") === BLEND_METHOD_HASHED;
}
/**
* What a material does with the alpha of an image whose color it shows, where the alpha is not the material's: Blender
* multiplies the color by it where no node reads it, unless the image already stores its color that way, its alpha is
* packed data or ignored, or it holds data.
*/
function colorAlpha(use, read) {
	const space = colorSpaceName(use.image);
	const alpha = outputSocket(use.node, "Alpha");
	return alphaMode(use.image) === ALPHA_STRAIGHT && !DATA_SPACES.has(space) && !(alpha && read.has(alpha.offset)) ? "premultiply" : "none";
}
function alphaMode(image) {
	return image.has("alpha_mode") ? image.number("alpha_mode") : ALPHA_STRAIGHT;
}
/**
* Notes a premultiplied image whose color the material shows while a node reads its alpha: Blender then divides the
* color by the alpha, which the preview leaves out.
*/
function notePremultiplied(draft, use, read) {
	const space = colorSpaceName(use.image);
	const alpha = outputSocket(use.node, "Alpha");
	if (alphaMode(use.image) !== ALPHA_PREMULTIPLIED || DATA_SPACES.has(space) || !(alpha && read.has(alpha.offset))) return;
	draft.approximations.push(`${idName(use.image)} has premultiplied alpha, shown as straight`);
}
/** Applies the transparency the surface's shader mix adds, from mix factors and the images whose alpha mixes it. */
function applySurfaceAlpha(graph, draft, surface) {
	for (const note of surface.notes) draft.approximations.push(note);
	for (const alpha of surface.alphaImages) if (samplesBase(graph, draft, alpha.found)) useImageAlpha(draft, alpha);
	else draft.approximations.push(`Alpha comes from ${imageName(alpha.found)}, which the preview leaves out`);
	if (surface.alpha >= 1) return;
	if (draft.alphaMode === "mask") {
		const kept = Math.round(surface.alpha * 100) / 100;
		draft.approximations.push(`Alpha is ${kept} inside the cutout, shown opaque`);
		return;
	}
	draft.baseColor[3] *= surface.alpha;
	draft.alphaMode = "blend";
}
//#endregion
//#region ../../packages/blend/src/blend/sdna.ts
/** The longest member or type name the reader takes; Blender's own are under 64 bytes. */
var MAX_NAME_BYTES = 1024;
/**
* The most names, types or structs the SDNA may list: members name their name and type by 16-bit index, and each
* struct has a type of its own. Blender's own list under 10,000 of each.
*/
var MAX_ENTRIES = 2 ** 16;
/** The most members all structs may have together; Blender's own have under 10,000. */
var MAX_MEMBERS = 2 ** 18;
var Cursor = class {
	#offset;
	#view;
	#bytes;
	#little;
	constructor(bytes, little) {
		this.#bytes = bytes;
		this.#view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
		this.#little = little;
		this.#offset = 0;
	}
	#need(bytes) {
		if (this.#offset + bytes > this.#bytes.byteLength) throw new BlendParseError("its SDNA block is cut short");
	}
	tag(expected) {
		this.#need(4);
		const tag = String.fromCharCode(...this.#bytes.subarray(this.#offset, this.#offset + 4));
		if (tag !== expected) throw new BlendParseError(`its SDNA block has "${tag}" where "${expected}" belongs`);
		this.#offset += 4;
	}
	int32() {
		this.#need(4);
		const value = this.#view.getInt32(this.#offset, this.#little);
		this.#offset += 4;
		return value;
	}
	int16() {
		this.#need(2);
		const value = this.#view.getInt16(this.#offset, this.#little);
		this.#offset += 2;
		return value;
	}
	uint16() {
		this.#need(2);
		const value = this.#view.getUint16(this.#offset, this.#little);
		this.#offset += 2;
		return value;
	}
	string() {
		const end = this.#bytes.indexOf(0, this.#offset);
		if (end === -1) throw new BlendParseError("its SDNA block has an unterminated name");
		if (end - this.#offset > MAX_NAME_BYTES) throw new BlendParseError(`its SDNA block has a name longer than ${MAX_NAME_BYTES} bytes`);
		const value = String.fromCharCode(...this.#bytes.subarray(this.#offset, end));
		this.#offset = end + 1;
		return value;
	}
	align() {
		this.#offset = this.#offset + 3 & -4;
	}
};
function count(cursor, what) {
	const value = cursor.int32();
	if (value < 0 || value > MAX_ENTRIES) throw new BlendParseError(`its SDNA block lists ${value} ${what}`);
	return value;
}
function parseName(raw) {
	const isFunction = raw.startsWith("(*");
	let pointerDepth = 0;
	let start = isFunction ? 2 : 0;
	if (isFunction) pointerDepth = 1;
	while (raw[start] === "*") {
		pointerDepth++;
		start++;
	}
	let end = start;
	while (end < raw.length && raw[end] !== "[" && raw[end] !== ")") end++;
	const dims = [];
	for (const match of raw.slice(end).matchAll(/\[(\d+)\]/g)) dims.push(Number(match[1]));
	return {
		name: raw.slice(start, end),
		pointerDepth,
		dims
	};
}
/** Parses the "SDNA" data of a DNA1 block. */
function parseSdna(bytes, little, pointerSize) {
	const cursor = new Cursor(bytes, little);
	cursor.tag("SDNA");
	cursor.tag("NAME");
	const names = [];
	for (let i = count(cursor, "names"); i > 0; i--) names.push(parseName(cursor.string()));
	cursor.align();
	cursor.tag("TYPE");
	const types = [];
	for (let i = count(cursor, "types"); i > 0; i--) types.push(cursor.string());
	cursor.align();
	cursor.tag("TLEN");
	const lengths = types.map(() => cursor.uint16());
	cursor.align();
	cursor.tag("STRC");
	const sizes = /* @__PURE__ */ new Map();
	types.forEach((type, index) => {
		sizes.set(type, lengths[index] ?? 0);
	});
	const structs = [];
	let members = 0;
	for (let i = count(cursor, "structs"), index = 0; i > 0; i--, index++) {
		const typeIndex = cursor.uint16();
		const fieldCount = cursor.uint16();
		const type = types[typeIndex];
		if (type === void 0) throw new BlendParseError(`its SDNA struct ${index} has an unknown type`);
		members += fieldCount;
		if (members > MAX_MEMBERS) throw new BlendParseError(`its SDNA structs have over ${MAX_MEMBERS} members`);
		const fields = [];
		let offset = 0;
		for (let f = 0; f < fieldCount; f++) {
			const fieldType = cursor.uint16();
			const parsed = names[cursor.uint16()];
			const typeName = types[fieldType];
			if (parsed === void 0 || typeName === void 0) throw new BlendParseError(`its SDNA struct ${type} has a member with an unknown name or type`);
			const elements = parsed.dims.reduce((product, dim) => product * dim, 1);
			const elementSize = parsed.pointerDepth > 0 ? pointerSize : lengths[fieldType] ?? 0;
			if (elementSize === 0) throw new BlendParseError(`its SDNA struct ${type} has a member of no size`);
			fields.push({
				name: parsed.name,
				type: typeName,
				typeIndex: fieldType,
				offset,
				size: elementSize * elements,
				pointerDepth: parsed.pointerDepth,
				dims: parsed.dims,
				count: elements
			});
			offset += elementSize * elements;
			const declared = lengths[typeIndex] ?? 0;
			if (!(offset <= declared)) throw new BlendParseError(`its SDNA struct ${type} has members past its ${declared} bytes`);
		}
		const byName = /* @__PURE__ */ new Map();
		for (const field of fields) if (!byName.has(field.name)) byName.set(field.name, field);
		structs.push({
			index,
			type,
			size: lengths[typeIndex] ?? offset,
			fields,
			field: (name) => byName.get(name)
		});
	}
	const structsByType = new Map(structs.map((struct) => [struct.type, struct]));
	return {
		structs,
		typeSize: (type) => sizes.get(type),
		struct: (type) => structsByType.get(type)
	};
}
//#endregion
//#region ../../packages/blend/src/blend/file.ts
/** The bytes every uncompressed .blend file starts with. */
var HEADER_MAGIC = "BLENDER";
var textDecoder = new TextDecoder("utf-8");
function ascii(bytes, start, end) {
	return String.fromCharCode(...bytes.subarray(start, end));
}
/**
* A block's code without trailing zero bytes. Blender writes the code as an int, so a big-endian file holds a
* two-letter ID code such as "OB" after two zero bytes, and Blender's reader shifts it into place.
*/
function blockCode(bytes, offset, little) {
	return ascii(bytes, !little && bytes[offset] === 0 && bytes[offset + 1] === 0 ? offset + 2 : offset, offset + 4).replace(/\0+$/, "");
}
function digits(text) {
	return /^\d+$/.test(text) ? Number(text) : null;
}
/** Refuses bytes that are shorter than `length` or do not start with `HEADER_MAGIC`. */
function checkHeaderMagic(bytes, length = 7) {
	if (bytes.byteLength < length || ascii(bytes, 0, 7) !== "BLENDER") throw new BlendParseError("it does not start with a Blender file header");
}
function readHeader(bytes) {
	checkHeaderMagic(bytes, 12);
	const headerSize = digits(ascii(bytes, 7, 9));
	if (headerSize !== null) {
		const format = digits(ascii(bytes, 10, 12));
		const version = digits(ascii(bytes, 13, 17));
		if (bytes[9] !== 45 || format === null || version === null || headerSize < 17) throw new BlendParseError("its file header is damaged");
		if (format !== 1) throw new BlendParseError(`its file format ${format} is newer than this reader`);
		const endian = bytes[12];
		if (endian !== 118 && endian !== 86) throw new BlendParseError("its file header is damaged");
		return {
			headerSize,
			pointerSize: 8,
			little: endian === 118,
			version,
			blockHeaderSize: 32
		};
	}
	const pointer = bytes[7];
	const endian = bytes[8];
	const version = digits(ascii(bytes, 9, 12));
	if (pointer !== 95 && pointer !== 45 || endian !== 118 && endian !== 86 || version === null) throw new BlendParseError("its file header is damaged");
	const pointerSize = pointer === 95 ? 4 : 8;
	return {
		headerSize: 12,
		pointerSize,
		little: endian === 118,
		version,
		blockHeaderSize: pointerSize === 4 ? 20 : 24
	};
}
var FLOAT32 = {
	create: (length) => new Float32Array(length),
	over: (buffer, offset, length) => new Float32Array(buffer, offset, length)
};
var INT32 = {
	create: (length) => new Int32Array(length),
	over: (buffer, offset, length) => new Int32Array(buffer, offset, length)
};
var INT16 = {
	create: (length) => new Int16Array(length),
	over: (buffer, offset, length) => new Int16Array(buffer, offset, length)
};
/** A block code as the four bytes Blender writes, such as "OB\0\0", read as one big-endian number. */
function codeWord(code) {
	let word = 0;
	for (let index = 0; index < 4; index++) word = word * 256 + (code.charCodeAt(index) || 0);
	return word;
}
var DATA = codeWord("DATA");
var ENDB = codeWord("ENDB");
var DNA1 = codeWord("DNA1");
var EMPTY_SLOT = 0;
/** MurmurHash3's finalizer: each bit of the value flips about half of the result's bits. */
function mix(value) {
	let hash = Math.imul(value ^ value >>> 16, 2246822507);
	hash = Math.imul(hash ^ hash >>> 13, 3266489909);
	return hash ^ hash >>> 16;
}
/**
* A hash table slot's starting point for an address and the datablock that owns it or -1. The key is random for each
* file, so a file cannot choose addresses that all start at one slot.
*/
function hashAddress(key, low, high, owner) {
	return mix(mix(mix(low ^ key) ^ high) ^ owner);
}
/** A random 32-bit key for a hash table, so that a file cannot choose keys that all start at one slot. */
function randomKey() {
	return new DataView(crypto.getRandomValues(/* @__PURE__ */ new Uint8Array(4)).buffer).getInt32(0);
}
/** Past this many blocks a file must average `MIN_BLOCK_BYTES` a block, as Blender's own files average hundreds. */
var MANY_BLOCKS = 2 ** 20;
var MIN_BLOCK_BYTES = 64;
/** Slots for an open-addressed table of `count` entries, a power of two at most two thirds full. */
function tableSlots(count) {
	let size = 8;
	while (size < count * 1.5) size *= 2;
	return new Int32Array(size);
}
/**
* A .blend file's blocks and SDNA over its uncompressed bytes. Pointers in the file are addresses from the session
* that saved it; `block` finds the block that starts at one. The block index keeps a few numbers per block in typed
* arrays and makes a block's object when it is first asked for, so a file of many small blocks takes memory in
* proportion to its size.
*/
var BlendFile = class {
	bytes;
	view;
	little;
	pointerSize;
	/** Major × 100 + minor, such as 502 for Blender 5.2. */
	version;
	sdna;
	blockCount;
	#blockHeaderSize;
	/** Where each block's header starts in the bytes. */
	#starts;
	#codes;
	/** The index of the datablock each block belongs to, or -1 for data before the first datablock. */
	#owners;
	/** Every block with an address, by address: the last ID block with it, or else the first data block. */
	#global;
	/** Data blocks by their datablock and address, the first of each. */
	#owned;
	#hashKey = randomKey();
	#made = /* @__PURE__ */ new Map();
	constructor(bytes) {
		this.bytes = bytes;
		this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
		const header = readHeader(bytes);
		this.little = header.little;
		this.pointerSize = header.pointerSize;
		this.version = header.version;
		this.#blockHeaderSize = header.blockHeaderSize;
		let count = 0;
		const found = { sdna: null };
		this.#walk(header.headerSize, (start, code, size) => {
			const data = start + header.blockHeaderSize;
			if (code === DNA1) found.sdna = bytes.subarray(data, data + size);
			count++;
		});
		if (!found.sdna) throw new BlendParseError("it has no SDNA block");
		if (count > MANY_BLOCKS && count * MIN_BLOCK_BYTES > bytes.byteLength) throw new BlendParseError(`it has ${count} blocks in ${bytes.byteLength} bytes, far more than Blender writes`);
		this.sdna = parseSdna(found.sdna, this.little, this.pointerSize);
		this.blockCount = count;
		this.#starts = new Float64Array(count);
		this.#codes = new Uint32Array(count);
		this.#owners = new Int32Array(count);
		let index = 0;
		let owner = -1;
		let dataCount = 0;
		this.#walk(header.headerSize, (start, code) => {
			if (code === DATA) dataCount++;
			else owner = index;
			this.#starts[index] = start;
			this.#codes[index] = code;
			this.#owners[index] = owner;
			index++;
		});
		this.#global = tableSlots(count);
		this.#owned = tableSlots(dataCount);
		for (let block = 0; block < count; block++) this.#addToTables(block);
	}
	/** Calls `visit` with each block's header offset, code and data size, up to the "ENDB" block, checking each. */
	#walk(from, visit) {
		const bytes = this.bytes;
		const headerSize = this.#blockHeaderSize;
		let offset = from;
		while (offset + headerSize <= bytes.byteLength) {
			const code = this.#codeAt(offset);
			if (code === ENDB) return;
			if (code === 0) throw new BlendParseError(`its block at byte ${offset} has no code`);
			const fields = this.#blockHeader(offset, headerSize);
			const dataOffset = offset + headerSize;
			if (fields.size < 0 || dataOffset + fields.size > bytes.byteLength || fields.count < 0) throw new BlendParseError(`its "${blockCode(bytes, offset, this.little)}" block at byte ${offset} runs past the end of the file`);
			visit(offset, code, fields.size);
			offset = dataOffset + fields.size;
		}
		throw new BlendParseError("it is cut short: its last block is missing");
	}
	/** The block's code as `codeWord` gives it, with a big-endian file's two-letter ID codes shifted into place. */
	#codeAt(start) {
		const word = this.view.getUint32(start, false);
		return !this.little && word < 65536 ? word * 65536 : word;
	}
	#addressHalves(block) {
		const at = (this.#starts[block] ?? 0) + 8;
		if (this.pointerSize === 4) return [this.view.getUint32(at, this.little), 0];
		const first = this.view.getUint32(at, this.little);
		const second = this.view.getUint32(at + 4, this.little);
		return this.little ? [first, second] : [second, first];
	}
	/** The slot that holds the block with this address, and for `owner` 0 or more that datablock, or an empty one. */
	#slot(slots, low, high, owner) {
		const mask = slots.length - 1;
		for (let slot = hashAddress(this.#hashKey, low, high, owner) & mask;; slot = slot + 1 & mask) {
			const entry = slots[slot] ?? EMPTY_SLOT;
			if (entry === EMPTY_SLOT) return slot;
			const block = entry - 1;
			if (owner >= 0 && this.#owners[block] !== owner) continue;
			const [blockLow, blockHigh] = this.#addressHalves(block);
			if (blockLow === low && blockHigh === high) return slot;
		}
	}
	#addToTables(block) {
		const [low, high] = this.#addressHalves(block);
		if (low === 0 && high === 0) return;
		const data = this.#codes[block] === DATA;
		const owner = this.#owners[block] ?? -1;
		if (data && owner >= 0) {
			const slot = this.#slot(this.#owned, low, high, owner);
			if (this.#owned[slot] === EMPTY_SLOT) this.#owned[slot] = block + 1;
		}
		const slot = this.#slot(this.#global, low, high, -1);
		if (this.#global[slot] === EMPTY_SLOT || !data) this.#global[slot] = block + 1;
	}
	#blockHeader(offset, size) {
		const view = this.view;
		const little = this.little;
		if (size === 32) return {
			sdnaIndex: view.getInt32(offset + 4, little),
			address: view.getBigUint64(offset + 8, little),
			size: Number(view.getBigInt64(offset + 16, little)),
			count: Number(view.getBigInt64(offset + 24, little))
		};
		const pointerSize = size - 16;
		return {
			size: view.getInt32(offset + 4, little),
			address: pointerSize === 8 ? view.getBigUint64(offset + 8, little) : BigInt(view.getUint32(offset + 8, little)),
			sdnaIndex: view.getInt32(offset + 8 + pointerSize, little),
			count: view.getInt32(offset + 12 + pointerSize, little)
		};
	}
	/** The block at `index` in file order, or null past the last. */
	blockAt(index) {
		const made = this.#made.get(index);
		if (made) return made;
		const start = this.#starts[index];
		if (start === void 0) return null;
		const fields = this.#blockHeader(start, this.#blockHeaderSize);
		const block = {
			index,
			code: blockCode(this.bytes, start, this.little),
			struct: fields.sdnaIndex > 0 ? this.sdna.structs[fields.sdnaIndex] : void 0,
			address: fields.address,
			offset: start + this.#blockHeaderSize,
			size: fields.size,
			count: fields.count,
			owner: this.#owners[index] ?? -1
		};
		this.#made.set(index, block);
		return block;
	}
	/**
	* The block that starts at `address`, or null for a null or dangling pointer. A pointer read from the data of the
	* datablock at block index `owner` resolves among that datablock's blocks first.
	*/
	block(address, owner = -1) {
		if (address === 0n) return null;
		const index = this.#find(Number(address & 4294967295n), Number(address >> 32n & 4294967295n), owner);
		return index < 0 ? null : this.blockAt(index);
	}
	#find(low, high, owner) {
		if (low === 0 && high === 0) return -1;
		const owned = owner >= 0 ? this.#owned[this.#slot(this.#owned, low, high, owner)] ?? EMPTY_SLOT : EMPTY_SLOT;
		return (owned !== EMPTY_SLOT ? owned : this.#global[this.#slot(this.#global, low, high, -1)] ?? EMPTY_SLOT) - 1;
	}
	/**
	* The index of the block that the pointer stored at byte `offset` points at, resolved as `block` resolves it, or -1.
	* Unlike `block`, it makes no block object, for data with one block per element such as each vertex's weights.
	*/
	pointedBlock(offset, owner = -1) {
		if (this.pointerSize === 4) return this.#find(this.view.getUint32(offset, this.little), 0, owner);
		const first = this.view.getUint32(offset, this.little);
		const second = this.view.getUint32(offset + 4, this.little);
		return this.little ? this.#find(first, second, owner) : this.#find(second, first, owner);
	}
	/** Where the data of the block at `index` starts in the bytes. */
	blockOffset(index) {
		return (this.#starts[index] ?? 0) + this.#blockHeaderSize;
	}
	/** The data size of the block at `index`, without making the block's object. */
	blockSize(index) {
		const start = this.#starts[index];
		if (start === void 0) return 0;
		if (this.#blockHeaderSize !== 32) return this.view.getInt32(start + 4, this.little);
		const first = this.view.getUint32(start + 16, this.little);
		const second = this.view.getUint32(start + 20, this.little);
		return this.little ? second * 2 ** 32 + first : first * 2 ** 32 + second;
	}
	/** Every block with `code`, such as all "OB" blocks, in file order. */
	blocksWithCode(code) {
		const word = codeWord(code);
		const found = [];
		this.#codes.forEach((candidate, index) => {
			const block = candidate === word ? this.blockAt(index) : null;
			if (block) found.push(block);
		});
		return found;
	}
	/** The element structs of a block whose struct is known. */
	elements(block) {
		const struct = block.struct;
		if (!struct || struct.size === 0) return [];
		const count = Math.min(block.count, Math.floor(block.size / struct.size));
		return Array.from({ length: count }, (_, index) => new BlendStruct(this, struct, block, index * struct.size));
	}
	/** The first element of a block whose struct is known, or null. */
	first(block) {
		if (!block?.struct || block.size < block.struct.size) return null;
		return new BlendStruct(this, block.struct, block, 0);
	}
	pointerAt(offset) {
		if (this.pointerSize === 8) return this.view.getBigUint64(offset, this.little);
		return BigInt(this.view.getUint32(offset, this.little));
	}
	/** The block's raw bytes. */
	bytesOf(block) {
		return this.bytes.subarray(block.offset, block.offset + block.size);
	}
	float32(block, count) {
		return this.#numbers(block, count, 4, (offset) => this.view.getFloat32(offset, this.little), FLOAT32);
	}
	int32(block, count) {
		return this.#numbers(block, count, 4, (offset) => this.view.getInt32(offset, this.little), INT32);
	}
	int16(block, count) {
		return this.#numbers(block, count, 2, (offset) => this.view.getInt16(offset, this.little), INT16);
	}
	/** Copies up to `wanted` numbers from the start of a block, or all that fit. */
	#numbers(block, wanted, elementSize, read, arrays) {
		const available = Math.floor(block.size / elementSize);
		const count = wanted === void 0 ? available : Math.max(0, Math.min(wanted, available));
		const values = arrays.create(count);
		const start = this.bytes.byteOffset + block.offset;
		if (this.little && start % elementSize === 0) {
			values.set(arrays.over(this.bytes.buffer, start, count));
			return values;
		}
		for (let i = 0; i < count; i++) values[i] = read(block.offset + i * elementSize);
		return values;
	}
	/** Decodes UTF-8 text that ends at the first zero byte or at `end`. */
	text(start, end) {
		const slice = this.bytes.subarray(start, end);
		const zero = slice.indexOf(0);
		return textDecoder.decode(zero === -1 ? slice : slice.subarray(0, zero));
	}
};
var NUMBER_READERS = /* @__PURE__ */ new Map([
	["char", (view, offset) => view.getUint8(offset)],
	["uchar", (view, offset) => view.getUint8(offset)],
	["int8_t", (view, offset) => view.getInt8(offset)],
	["uint8_t", (view, offset) => view.getUint8(offset)],
	["bool", (view, offset) => view.getUint8(offset)],
	["short", (view, offset, little) => view.getInt16(offset, little)],
	["ushort", (view, offset, little) => view.getUint16(offset, little)],
	["int16_t", (view, offset, little) => view.getInt16(offset, little)],
	["uint16_t", (view, offset, little) => view.getUint16(offset, little)],
	["int", (view, offset, little) => view.getInt32(offset, little)],
	["int32_t", (view, offset, little) => view.getInt32(offset, little)],
	["uint", (view, offset, little) => view.getUint32(offset, little)],
	["uint32_t", (view, offset, little) => view.getUint32(offset, little)],
	["long", (view, offset, little) => view.getInt32(offset, little)],
	["ulong", (view, offset, little) => view.getUint32(offset, little)],
	["float", (view, offset, little) => view.getFloat32(offset, little)],
	["double", (view, offset, little) => view.getFloat64(offset, little)],
	["int64_t", (view, offset, little) => Number(view.getBigInt64(offset, little))],
	["uint64_t", (view, offset, little) => Number(view.getBigUint64(offset, little))]
]);
/** How to read a number member of an SDNA type, or undefined for a type that is not a number. */
function numberReader(type) {
	return NUMBER_READERS.get(type);
}
/**
* One struct in the file, read by member name through the file's SDNA. Members the struct does not have, as in files
* from other Blender versions, read as their zero value: 0, an empty string, a null pointer or an empty list.
*/
var BlendStruct = class BlendStruct {
	file;
	type;
	block;
	/** Offset of the struct in the file's bytes. */
	offset;
	constructor(file, type, block, offsetInBlock) {
		this.file = file;
		this.type = type;
		this.block = block;
		this.offset = block.offset + offsetInBlock;
	}
	get typeName() {
		return this.type.type;
	}
	has(name) {
		return this.type.field(name) !== void 0;
	}
	field(name) {
		return this.type.field(name);
	}
	/** The member as a number, or the `index`th element of an array member; 0 when the struct has no such member. */
	number(name, index = 0) {
		const field = this.type.field(name);
		if (!field || field.pointerDepth > 0 || index >= field.count) return 0;
		const read = NUMBER_READERS.get(field.type);
		if (!read) return 0;
		const elementSize = field.size / field.count;
		return read(this.file.view, this.offset + field.offset + index * elementSize, this.file.little);
	}
	/** Every element of an array member, or the one value of a single member; empty when there is no such member. */
	numbers(name) {
		const field = this.type.field(name);
		if (!field || field.pointerDepth > 0 || !NUMBER_READERS.has(field.type)) return [];
		return Array.from({ length: field.count }, (_, index) => this.number(name, index));
	}
	/** A char array member as text. */
	string(name) {
		const field = this.type.field(name);
		if (!field || field.pointerDepth > 0) return "";
		const start = this.offset + field.offset;
		return this.file.text(start, start + field.size);
	}
	/** The address a pointer member holds, or 0n. */
	pointer(name, index = 0) {
		const field = this.type.field(name);
		if (!field || field.pointerDepth === 0 || index >= field.count) return 0n;
		return this.file.pointerAt(this.offset + field.offset + index * this.file.pointerSize);
	}
	/** A struct member embedded in this one, or null when there is none. */
	struct(name, index = 0) {
		const field = this.type.field(name);
		if (!field || field.pointerDepth > 0 || index >= field.count) return null;
		const type = this.file.sdna.struct(field.type);
		if (!type) return null;
		return new BlendStruct(this.file, type, this.block, this.offset - this.block.offset + field.offset + index * type.size);
	}
	/** The block an address read from this struct points at, resolved among its datablock's blocks first. */
	resolve(address) {
		return this.file.block(address, this.block.owner);
	}
	/** The block a pointer member points at, or null. */
	target(name, index = 0) {
		return this.resolve(this.pointer(name, index));
	}
	/** The struct a pointer member points at, typed by its block, or null. */
	deref(name, index = 0) {
		return this.file.first(this.target(name, index));
	}
	/** Every struct in the block a pointer member points at. */
	derefAll(name) {
		const block = this.target(name);
		return block ? this.file.elements(block) : [];
	}
	/** The pointers in the block a pointer-to-pointer member points at, such as a material array. */
	pointers(name, count) {
		const block = this.target(name);
		if (!block) return [];
		const available = Math.floor(block.size / this.file.pointerSize);
		const length = count === void 0 ? available : Math.max(0, Math.min(count, available));
		return Array.from({ length }, (_, index) => this.file.pointerAt(block.offset + index * this.file.pointerSize));
	}
	/**
	* The structs of a ListBase member, at most once each. Every element starts with its `next` pointer, also when its
	* block's struct embeds the link in a header, as each modifier struct embeds `ModifierData`.
	*/
	list(name) {
		const base = this.struct(name);
		if (!base) return [];
		const items = [];
		const seen = /* @__PURE__ */ new Set();
		let address = base.pointer("first");
		let from = base;
		while (address !== 0n && !seen.has(address)) {
			seen.add(address);
			const item = this.file.first(from.resolve(address));
			if (!item || item.type.size < this.file.pointerSize) break;
			items.push(item);
			from = item;
			address = this.file.pointerAt(item.offset);
		}
		return items;
	}
	/** A char pointer member as text, or an empty string. */
	text(name) {
		const block = this.target(name);
		return block ? this.file.text(block.offset, block.offset + block.size) : "";
	}
};
/** Reads the blocks and SDNA of uncompressed .blend bytes. */
function readBlendFile(bytes) {
	return new BlendFile(bytes);
}
//#endregion
//#region ../../packages/blend/src/scene/mesh-data.ts
/** Blender 5's attribute types, in the order of its `AttrType` enum. */
var STORAGE_TYPES = [
	"bool",
	"int8",
	"int16_2d",
	"int32",
	"int32_2d",
	"float",
	"float2",
	"float3",
	"float4x4",
	"byteColor",
	"floatColor",
	"quaternion",
	"string"
];
var CustomDataType = {
	vertex: 0,
	deformVertex: 2,
	edge: 3,
	loopUv: 16,
	byteColor: 17,
	face: 25,
	loop: 26,
	shapeKeyIndex: 27,
	customLoopNormal: 41,
	floatColor: 47,
	float2: 49
};
/** Generic CustomData layer types of Blender 4 and earlier. */
var CUSTOM_DATA_TYPES = /* @__PURE__ */ new Map([
	[10, "float"],
	[11, "int32"],
	[CustomDataType.byteColor, "byteColor"],
	[20, "float4x4"],
	[45, "int8"],
	[46, "int32_2d"],
	[CustomDataType.floatColor, "floatColor"],
	[48, "float3"],
	[CustomDataType.float2, "float2"],
	[50, "bool"],
	[52, "quaternion"]
]);
var DOMAINS = [
	"point",
	"edge",
	"face",
	"corner"
];
var COMPONENTS = {
	bool: 1,
	int8: 1,
	int16_2d: 2,
	int32: 1,
	int32_2d: 2,
	float: 1,
	float2: 2,
	float3: 3,
	float4x4: 16,
	byteColor: 4,
	floatColor: 4,
	quaternion: 4,
	string: 1
};
var BYTES = {
	bool: 1,
	int8: 1,
	int16_2d: 4,
	int32: 4,
	int32_2d: 8,
	float: 4,
	float2: 8,
	float3: 12,
	float4x4: 64,
	byteColor: 4,
	floatColor: 16,
	quaternion: 16,
	string: 1
};
var MeshReadError = class extends Error {
	name = "MeshReadError";
};
/**
* Far more layers of data than Blender's own meshes have, each attribute or array of elements a layer. A mesh that
* lists more is refused, and no more of them are read.
*/
var MAX_LAYERS = 2 ** 16;
/** How many layers the array's block holds, up to its count: none when the block holds another struct. */
function heldStructs({ block, count, struct }) {
	const type = block?.struct;
	if (!block || type?.type !== struct || type.size === 0) return 0;
	return Math.max(0, Math.min(count, block.count, Math.floor(block.size / type.size)));
}
/** The layers of the array, as many as its block holds up to `MAX_LAYERS`, without making the others. */
function structsOf(file, array) {
	const { block } = array;
	const type = block?.struct;
	if (!block || !type) return [];
	const count = Math.min(heldStructs(array), MAX_LAYERS);
	return Array.from({ length: count }, (_, index) => new BlendStruct(file, type, block, index * type.size));
}
/** The attributes of a mesh from Blender 5 and on. */
function storageArray(mesh) {
	const storage = mesh.struct("attribute_storage");
	return {
		block: storage?.target("dna_attributes") ?? null,
		count: storage?.number("dna_attributes_num") ?? 0,
		struct: "Attribute"
	};
}
/** The layers of one of a mesh's CustomData. */
function layerArray(mesh, field) {
	const data = mesh.struct(field);
	return {
		block: data?.target("layers") ?? null,
		count: data?.number("totlayer") ?? 0,
		struct: "CustomDataLayer"
	};
}
/** Refuses a mesh that lists more layers of data than `MAX_LAYERS` in its attributes or in one CustomData. */
function checkLayerCounts(mesh) {
	const counts = [storageArray(mesh), ...LAYER_DOMAINS.map(([field]) => layerArray(mesh, field))].map(heldStructs);
	const most = Math.max(...counts);
	if (most > MAX_LAYERS) throw new MeshReadError(`Mesh ${idName(mesh)} has ${most} layers of data, far more than Blender writes`);
}
function storageAttributes(mesh) {
	return structsOf(mesh.file, storageArray(mesh)).flatMap((attribute) => {
		const type = STORAGE_TYPES[attribute.number("data_type")];
		const domain = DOMAINS[attribute.number("domain")];
		if (!type || !domain) return [];
		const holder = attribute.deref("data");
		const single = attribute.number("storage_type") === 1;
		return [{
			name: attribute.text("name"),
			type,
			domain,
			block: holder?.target("data") ?? null,
			single
		}];
	});
}
var LAYER_DOMAINS = [
	["vdata", "point"],
	["edata", "edge"],
	["pdata", "face"],
	["ldata", "corner"]
];
function layersOf(mesh, field) {
	return structsOf(mesh.file, layerArray(mesh, field));
}
function readLayers(mesh) {
	return {
		vdata: layersOf(mesh, "vdata"),
		edata: layersOf(mesh, "edata"),
		pdata: layersOf(mesh, "pdata"),
		ldata: layersOf(mesh, "ldata")
	};
}
function customDataAttributes(layers) {
	const result = [];
	for (const [field, domain] of LAYER_DOMAINS) for (const layer of layers[field]) {
		const type = CUSTOM_DATA_TYPES.get(layer.number("type"));
		if (!type) continue;
		result.push({
			name: layer.string("name"),
			type,
			domain,
			block: layer.target("data"),
			single: false
		});
	}
	return result;
}
function ofType(layers, type) {
	return layers.filter((layer) => layer.number("type") === type);
}
/** The layer that `member`, such as "active_rnd", picks among layers of one type: every one holds the same index. */
function pickedLayer(sameType, member) {
	return sameType[sameType[0]?.number(member) ?? 0];
}
var AttributeReader = class {
	#file;
	#sizes;
	attributes;
	constructor(file, attributes, sizes) {
		this.#file = file;
		this.#sizes = sizes;
		this.attributes = attributes;
	}
	find(name, types, domain) {
		return this.attributes.find((attribute) => attribute.name === name && (types === void 0 || types.includes(attribute.type)) && (domain === void 0 || attribute.domain === domain));
	}
	#elements(attribute) {
		return this.#sizes[attribute.domain];
	}
	/** The values of an attribute as numbers, components per element by type; a single value repeats. */
	float32(attribute) {
		const count = this.#elements(attribute) * COMPONENTS[attribute.type];
		if (!attribute.block) return new Float32Array(count);
		if (attribute.single) {
			const one = this.#file.float32(attribute.block, COMPONENTS[attribute.type]);
			const values = new Float32Array(count);
			for (let i = 0; i < count; i++) values[i] = one[i % one.length] ?? 0;
			return values;
		}
		return padded(this.#file.float32(attribute.block, count), count);
	}
	int32(attribute) {
		const count = this.#elements(attribute) * COMPONENTS[attribute.type];
		if (!attribute.block) return new Int32Array(count);
		if (attribute.single) {
			const one = this.#file.int32(attribute.block, COMPONENTS[attribute.type]);
			const values = new Int32Array(count);
			for (let i = 0; i < count; i++) values[i] = one[i % one.length] ?? 0;
			return values;
		}
		return padded(this.#file.int32(attribute.block, count), count);
	}
	int16(attribute) {
		const count = this.#elements(attribute) * COMPONENTS[attribute.type];
		if (!attribute.block) return new Int16Array(count);
		if (attribute.single) {
			const one = this.#file.int16(attribute.block, COMPONENTS[attribute.type]);
			const values = new Int16Array(count);
			for (let i = 0; i < count; i++) values[i] = one[i % one.length] ?? 0;
			return values;
		}
		return padded(this.#file.int16(attribute.block, count), count);
	}
	bytes(attribute) {
		const count = this.#elements(attribute) * BYTES[attribute.type];
		const values = new Uint8Array(count);
		if (!attribute.block) return values;
		const source = this.#file.bytesOf(attribute.block);
		if (attribute.single) {
			for (let i = 0; i < count; i++) values[i] = source[i % Math.max(BYTES[attribute.type], 1)] ?? 0;
			return values;
		}
		values.set(source.subarray(0, Math.min(count, source.byteLength)));
		return values;
	}
};
function padded(values, count) {
	if (values.length >= count) return values;
	const result = new values.constructor(count);
	result.set(values);
	return result;
}
function srgbToLinear(value) {
	return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
}
function colorAttributes(reader) {
	const colorTypes = ["byteColor", "floatColor"];
	return reader.attributes.filter((attribute) => colorTypes.includes(attribute.type) && (attribute.domain === "point" || attribute.domain === "corner") && !attribute.name.startsWith("."));
}
var LEGACY_COLOR_RENDER = 64;
/**
* The color attribute that a Color Attribute node without a name reads: the mesh's default. Files from before Blender
* 3.5 mark it as Blender converts them: a layer flag, else the render layer of float and then byte colors, points
* first. Empty when the mesh names none, where Blender reads black.
*/
function defaultColorAttribute(mesh) {
	if (mesh.has("default_color_attribute")) return mesh.text("default_color_attribute");
	const fields = [layersOf(mesh, "vdata"), layersOf(mesh, "ldata")];
	for (const layers of fields) {
		const flagged = layers.find((layer) => layer.has("flag") && (layer.number("flag") & LEGACY_COLOR_RENDER) !== 0);
		if (flagged) return flagged.string("name");
	}
	for (const layers of fields) for (const type of [CustomDataType.floatColor, CustomDataType.byteColor]) {
		const render = pickedLayer(ofType(layers, type), "active_rnd");
		if (render) return render.string("name");
	}
	return "";
}
function readColors(reader, mesh, wanted) {
	const candidates = colorAttributes(reader);
	const fallback = defaultColorAttribute(mesh) || mesh.text("active_color_attribute");
	const attribute = wanted.map((name) => candidates.find((candidate) => candidate.name === name)).find((found) => found) ?? candidates.find((candidate) => candidate.name === fallback) ?? candidates[0];
	if (!attribute || attribute.domain !== "point" && attribute.domain !== "corner") return null;
	const { name, domain } = attribute;
	if (attribute.type === "floatColor") return {
		name,
		domain,
		values: reader.float32(attribute)
	};
	const bytes = reader.bytes(attribute);
	const values = new Float32Array(bytes.length);
	for (let i = 0; i < bytes.length; i++) {
		const unit = (bytes[i] ?? 0) / 255;
		values[i] = i % 4 === 3 ? unit : srgbToLinear(unit);
	}
	return {
		name,
		domain,
		values
	};
}
/** The names each slot wants, those of the slots that faces use first, as Blender clamps a face's slot to the last. */
function usedFirst(wanted, materialIndices) {
	const last = wanted.length - 1;
	const used = /* @__PURE__ */ new Set();
	for (const index of materialIndices ?? [0]) used.add(Math.min(Math.max(index, 0), last));
	return [...wanted.filter((_, slot) => used.has(slot)), ...wanted.filter((_, slot) => !used.has(slot))].flat();
}
/**
* The structs of the arrays meshes before Blender 4.0 hold, each with the bytes of the members read from it, which the
* struct holds in every version Blender writes.
*/
var LEGACY_SIZES = {
	MVert: 12,
	MEdge: 8,
	MPoly: 8,
	MLoop: 8,
	MLoopUV: 8,
	MDeformVert: 8
};
/**
* An array of structs read member by member at the offsets its SDNA gives, without an object per element, as meshes
* before Blender 4.0 store their vertices, edges, faces, corners and UV maps.
*/
var StructArray = class {
	#file;
	#block;
	#stride;
	/**
	* How many elements the block holds: none unless its struct is `struct`, the one Blender writes such arrays of, and
	* the file's SDNA makes it large enough for the members read from it, so that elements take no more memory than the
	* file's bytes.
	*/
	length;
	constructor(file, block, struct) {
		this.#file = file;
		this.#block = block;
		const type = block?.struct;
		this.#stride = type?.size ?? 0;
		const held = block && type?.type === struct && type.size >= LEGACY_SIZES[struct];
		this.length = held ? Math.min(block.count, Math.floor(block.size / type.size)) : 0;
	}
	/**
	* Reads one number member of every element: `read(element, index)` is element's value at array index `index`. A
	* member the struct lacks, or holds in a type this reader does not take, reads as 0, as `BlendStruct.number` does.
	*/
	member(name) {
		const field = this.#block?.struct?.field(name);
		const reader = field && field.pointerDepth === 0 ? numberReader(field.type) : void 0;
		if (!this.#block || !field || !reader) return () => 0;
		const { view, little } = this.#file;
		const base = this.#block.offset + field.offset;
		const stride = this.#stride;
		const elementSize = field.size / field.count;
		const count = field.count;
		return (element, index = 0) => index < count ? reader(view, base + element * stride + index * elementSize, little) : 0;
	}
	/** The offset of a pointer member of every element, or -1 when the struct has none. */
	pointer(name) {
		const field = this.#block?.struct?.field(name);
		if (!this.#block || !field || field.pointerDepth === 0) return () => -1;
		const base = this.#block.offset + field.offset;
		const stride = this.#stride;
		return (element) => base + element * stride;
	}
	get owner() {
		return this.#block?.owner ?? -1;
	}
};
/** The struct of each element of the legacy layers that hold a mesh's topology. */
var LEGACY_STRUCTS = {
	[CustomDataType.vertex]: "MVert",
	[CustomDataType.edge]: "MEdge",
	[CustomDataType.face]: "MPoly",
	[CustomDataType.loop]: "MLoop"
};
function legacyArray(file, layers, type) {
	return new StructArray(file, ofType(layers, type)[0]?.target("data") ?? null, LEGACY_STRUCTS[type]);
}
var LEGACY_FACE_SMOOTH = 1;
var LEGACY_EDGE_SHARP = 512;
var LEGACY_AUTO_SMOOTH = 32;
function readTopology(file, mesh, reader, layers, sizes) {
	const position = reader.find("position", ["float3"], "point");
	let positions;
	if (position) positions = reader.float32(position);
	else {
		const vertices = legacyArray(file, layers.vdata, CustomDataType.vertex);
		const co = vertices.member("co");
		positions = new Float32Array(sizes.point * 3);
		for (let v = 0; v < Math.min(sizes.point, vertices.length); v++) for (let k = 0; k < 3; k++) positions[v * 3 + k] = co(v, k);
	}
	const edgeVerts = reader.find(".edge_verts", ["int32_2d"], "edge");
	let edges;
	let legacyEdges = null;
	if (edgeVerts) edges = reader.int32(edgeVerts);
	else {
		legacyEdges = legacyArray(file, layers.edata, CustomDataType.edge);
		const [v1, v2] = [legacyEdges.member("v1"), legacyEdges.member("v2")];
		edges = new Int32Array(sizes.edge * 2);
		for (let e = 0; e < Math.min(sizes.edge, legacyEdges.length); e++) {
			edges[e * 2] = v1(e);
			edges[e * 2 + 1] = v2(e);
		}
	}
	let faceOffsets;
	let legacyFaces = null;
	const offsetsBlock = mesh.target("poly_offset_indices");
	if (offsetsBlock) faceOffsets = padded(file.int32(offsetsBlock, sizes.face + 1), sizes.face + 1);
	else {
		legacyFaces = legacyArray(file, layers.pdata, CustomDataType.face);
		const loopStart = legacyFaces.member("loopstart");
		faceOffsets = new Int32Array(sizes.face + 1);
		for (let f = 0; f < Math.min(sizes.face, legacyFaces.length); f++) faceOffsets[f] = loopStart(f);
		faceOffsets[sizes.face] = sizes.corner;
	}
	if (sizes.face === 0) faceOffsets = Int32Array.of(0);
	const cornerVert = reader.find(".corner_vert", ["int32"], "corner");
	const cornerEdge = reader.find(".corner_edge", ["int32"], "corner");
	let cornerVerts;
	let cornerEdges;
	if (cornerVert) {
		cornerVerts = reader.int32(cornerVert);
		cornerEdges = cornerEdge ? reader.int32(cornerEdge) : new Int32Array(sizes.corner).fill(-1);
	} else {
		const loops = legacyArray(file, layers.ldata, CustomDataType.loop);
		const [vertex, edge] = [loops.member("v"), loops.member("e")];
		cornerVerts = new Int32Array(sizes.corner);
		cornerEdges = new Int32Array(sizes.corner);
		for (let c = 0; c < Math.min(sizes.corner, loops.length); c++) {
			cornerVerts[c] = vertex(c);
			cornerEdges[c] = edge(c);
		}
	}
	const faceCount = Math.min(sizes.face, legacyFaces?.length ?? 0);
	let materialIndices = null;
	const material = reader.find("material_index", ["int32"], "face");
	if (material) materialIndices = reader.int32(material);
	else if (legacyFaces && legacyFaces.length > 0) {
		const slot = legacyFaces.member("mat_nr");
		materialIndices = Int32Array.from({ length: faceCount }, (_, f) => slot(f));
	}
	let sharpFaces = null;
	const sharpFace = reader.find("sharp_face", ["bool"], "face");
	if (sharpFace) sharpFaces = reader.bytes(sharpFace);
	else if (legacyFaces && legacyFaces.length > 0) {
		const flag = legacyFaces.member("flag");
		sharpFaces = Uint8Array.from({ length: faceCount }, (_, f) => (flag(f) & LEGACY_FACE_SMOOTH) === 0 ? 1 : 0);
	}
	let sharpEdges = null;
	const sharpEdge = reader.find("sharp_edge", ["bool"], "edge");
	const edgeCount = Math.min(sizes.edge, legacyEdges?.length ?? 0);
	if (sharpEdge) sharpEdges = reader.bytes(sharpEdge);
	else if (legacyEdges && legacyEdges.length > 0) {
		const flag = legacyEdges.member("flag");
		sharpEdges = Uint8Array.from({ length: edgeCount }, (_, e) => (flag(e) & LEGACY_EDGE_SHARP) !== 0 ? 1 : 0);
	}
	return {
		positions,
		edges,
		faceOffsets,
		cornerVerts,
		cornerEdges,
		materialIndices,
		sharpFaces,
		sharpEdges
	};
}
var UNSHOWN_UVS = /* @__PURE__ */ new Float32Array(0);
/**
* The UV maps: the float vector corner attributes, then the MLoopUV layers of files from before Blender 4.0, as Blender
* converts those after the attributes. The default is the render layer of the MLoopUV layers when there are any. Only
* the maps the preview shows have values.
*/
function readUvMaps(file, mesh, reader, layers, sizes) {
	const maps = [];
	const add = (name, read) => {
		maps.push({
			name,
			values: maps.length < 8 ? read() : UNSHOWN_UVS
		});
	};
	for (const attribute of reader.attributes) {
		if (attribute.type !== "float2" || attribute.domain !== "corner" || attribute.name.startsWith(".")) continue;
		add(attribute.name, () => reader.float32(attribute));
	}
	const legacy = ofType(layers.ldata, CustomDataType.loopUv);
	for (const layer of legacy) add(layer.string("name"), () => {
		const corners = new StructArray(file, layer.target("data"), "MLoopUV");
		const uv = corners.member("uv");
		const values = new Float32Array(sizes.corner * 2);
		for (let c = 0; c < Math.min(sizes.corner, corners.length); c++) {
			values[c * 2] = uv(c, 0);
			values[c * 2 + 1] = uv(c, 1);
		}
		return values;
	});
	const render = pickedLayer(legacy.length > 0 ? legacy : ofType(layers.ldata, CustomDataType.float2), "active_rnd");
	const wanted = mesh.text("default_uv_map_attribute") || render?.string("name") || mesh.text("active_uv_map_attribute");
	const index = maps.findIndex((map) => map.name === wanted);
	return {
		maps,
		default: Math.max(index, 0)
	};
}
function readCustomNormals(reader, file, layers, sizes) {
	const named = reader.find("custom_normal");
	if (named?.type === "int16_2d" && named.domain === "corner") return {
		kind: "encoded",
		values: reader.int16(named)
	};
	if (named?.type === "float3" && file.version >= FREE_NORMALS_VERSION) return {
		kind: "free",
		domain: named.domain,
		values: reader.float32(named)
	};
	const block = ofType(layers.ldata, CustomDataType.customLoopNormal)[0]?.target("data");
	if (block) return {
		kind: "encoded",
		values: padded(file.int16(block, sizes.corner * 2), sizes.corner * 2)
	};
	return null;
}
/**
* Reads each vertex's MDeformWeight array straight from its block, in two passes that size typed arrays first. Blender
* writes one block per vertex, so the pointers resolve to block indices without making a block object for each. A
* block that an earlier vertex points at gives a later one no weights, so that the weights read are at most those the
* file holds.
*/
function readDeformWeights(file, mesh, layers, sizes) {
	const layer = ofType(layers.vdata, CustomDataType.deformVertex)[0];
	const vertices = new StructArray(file, layer ? layer.target("data") : mesh.target("dvert"), "MDeformVert");
	if (vertices.length === 0) return null;
	const count = Math.min(sizes.point, vertices.length);
	const pointerAt = vertices.pointer("dw");
	const totalOf = vertices.member("totweight");
	const weightType = file.sdna.struct("MDeformWeight");
	const groupField = weightType?.field("def_nr");
	const weightField = weightType?.field("weight");
	const readGroup = groupField?.pointerDepth === 0 ? numberReader(groupField.type) : void 0;
	const readWeight = weightField?.pointerDepth === 0 ? numberReader(weightField.type) : void 0;
	const stride = weightType?.size ?? 0;
	const offsets = new Uint32Array(sizes.point + 1);
	const blocks = new Int32Array(count).fill(-1);
	const claimed = /* @__PURE__ */ new Set();
	let total = 0;
	for (let v = 0; v < count; v++) {
		offsets[v] = total;
		const at = pointerAt(v);
		const wanted = totalOf(v);
		if (at < 0 || wanted <= 0 || stride === 0) continue;
		const block = file.pointedBlock(at, vertices.owner);
		if (block < 0 || claimed.has(block)) continue;
		claimed.add(block);
		blocks[v] = block;
		total += Math.min(wanted, Math.floor(file.blockSize(block) / stride));
	}
	offsets.fill(total, count);
	const groups = new Int32Array(total);
	const weights = new Float32Array(total);
	const { view, little } = file;
	for (let v = 0; v < count; v++) {
		const block = blocks[v] ?? -1;
		if (block < 0) continue;
		const start = file.blockOffset(block);
		for (let i = offsets[v] ?? 0, element = 0; i < (offsets[v + 1] ?? 0); i++, element++) {
			const base = start + element * stride;
			if (groupField && readGroup) groups[i] = readGroup(view, base + groupField.offset, little);
			if (weightField && readWeight) weights[i] = readWeight(view, base + weightField.offset, little);
		}
	}
	return {
		offsets,
		groups,
		weights
	};
}
var KEY_BLOCK_MUTE = 1;
var KEY_RELATIVE = 1;
/** Blender 4.5 made a float vector "custom_normal" attribute on faces, points or corners the mesh's normals. */
var FREE_NORMALS_VERSION = 405;
/**
* The mesh's shape keys. Each reads its positions from a data block that holds one for every vertex and that no earlier
* key reads, as Blender writes them; a key without one shares `vertices` and is left out, so that the keys read take
* memory only for the positions the file holds. A mesh with more than `MAX_CORNERS_PER_KEYED_VERTEX` face corners for
* each vertex keeps only its basis, since the preview would build every key for every corner.
*/
function readShapeKeys(mesh, file, sizes, vertices) {
	const key = mesh.deref("key");
	if (!key) return {
		keys: [],
		reference: -1,
		absolute: false,
		basis: null,
		leftOut: false
	};
	const blocks = key.list("block");
	const reference = blocks.findIndex((block) => block.offset === file.first(key.target("refkey"))?.offset);
	const claimed = /* @__PURE__ */ new Set();
	const owned = blocks.map((block) => {
		const data = block.target("data");
		if (!data || claimed.has(data.index) || Math.floor(data.size / 4) < sizes.point * 3) return null;
		claimed.add(data.index);
		return file.float32(data, sizes.point * 3);
	});
	const keys = blocks.map((block, index) => ({
		name: block.string("name"),
		positions: owned[index] ?? vertices,
		relative: block.number("relative"),
		value: block.number("curval"),
		min: block.number("slidermin"),
		max: block.number("slidermax"),
		muted: !owned[index] || (block.number("flag") & KEY_BLOCK_MUTE) !== 0,
		vertexGroup: block.string("vgroup")
	}));
	const basisIndex = reference === -1 && keys.length > 0 ? 0 : reference;
	const basis = blocks[basisIndex]?.number("totelem") === sizes.point ? owned[basisIndex] ?? null : null;
	if (key.number("type") !== KEY_RELATIVE) return {
		keys: [],
		reference: -1,
		absolute: true,
		basis,
		leftOut: false
	};
	if (sizes.corner > 32 * sizes.point) return {
		keys: [],
		reference: -1,
		absolute: false,
		basis,
		leftOut: keys.some((shapeKey, index) => index !== basisIndex && !shapeKey.muted)
	};
	return {
		keys,
		reference: basisIndex,
		absolute: false,
		basis,
		leftOut: false
	};
}
/**
* How many elements a topology attribute's values hold. One value for the whole domain counts as one element: Blender
* writes positions, edges and face corners as arrays, and repeating one value would let a count take any memory.
*/
function heldElements(attribute) {
	if (!attribute.block) return 0;
	return attribute.single ? 1 : Math.floor(attribute.block.size / BYTES[attribute.type]);
}
var DOMAIN_NAMES = {
	point: "vertices",
	edge: "edges",
	face: "faces",
	corner: "face corners"
};
/** Refuses a mesh that counts more elements than the data that defines them holds, as a damaged file can. */
function checkCounts(mesh, reader, layers, sizes) {
	const position = reader.find("position", ["float3"], "point");
	const edgeVerts = reader.find(".edge_verts", ["int32_2d"], "edge");
	const cornerVert = reader.find(".corner_vert", ["int32"], "corner");
	const offsets = mesh.target("poly_offset_indices");
	const legacy = (field, type) => legacyArray(mesh.file, layers[field], type).length;
	const held = {
		point: position ? heldElements(position) : legacy("vdata", CustomDataType.vertex),
		edge: edgeVerts ? heldElements(edgeVerts) : legacy("edata", CustomDataType.edge),
		face: offsets ? Math.max(Math.floor(offsets.size / 4) - 1, 0) : legacy("pdata", CustomDataType.face),
		corner: cornerVert ? heldElements(cornerVert) : legacy("ldata", CustomDataType.loop)
	};
	for (const domain of [
		"point",
		"edge",
		"face",
		"corner"
	]) {
		if (sizes[domain] <= held[domain]) continue;
		const what = DOMAIN_NAMES[domain];
		throw new MeshReadError(`Mesh ${idName(mesh)} counts ${sizes[domain]} ${what} but holds ${held[domain]}`);
	}
}
/**
* Reads a mesh datablock. `objectGroups` are the vertex group names an object stores in files before Blender 3.0, and
* `wantedColors` name, for each material slot, the color attributes to read in place of the default one.
*/
function readMeshData(file, mesh, objectGroups = [], wantedColors = []) {
	const sizes = {
		point: Math.max(mesh.number("totvert"), 0),
		edge: Math.max(mesh.number("totedge"), 0),
		face: Math.max(mesh.number("totpoly"), 0),
		corner: Math.max(mesh.number("totloop"), 0)
	};
	checkLayerCounts(mesh);
	const layers = readLayers(mesh);
	const reader = new AttributeReader(file, [...storageAttributes(mesh), ...customDataAttributes(layers)], sizes);
	checkCounts(mesh, reader, layers, sizes);
	const topology = readTopology(file, mesh, reader, layers, sizes);
	validateTopology(topology, sizes, idName(mesh));
	const uvs = readUvMaps(file, mesh, reader, layers, sizes);
	const groupNames = mesh.has("vertex_group_names") ? mesh.list("vertex_group_names").map((group) => group.string("name")) : [...objectGroups];
	const shapeKeys = readShapeKeys(mesh, file, sizes, topology.positions);
	const autoSmooth = (mesh.number("flag") & LEGACY_AUTO_SMOOTH) !== 0 && mesh.has("smoothresh") && file.version < 401;
	return {
		name: idName(mesh),
		vertexCount: sizes.point,
		edgeCount: sizes.edge,
		faceCount: sizes.face,
		cornerCount: sizes.corner,
		...topology,
		positions: shapeKeys.basis ?? topology.positions,
		autoSmoothAngle: autoSmooth ? mesh.number("smoothresh") : null,
		uvMaps: uvs.maps,
		defaultUv: uvs.default,
		colors: readColors(reader, mesh, usedFirst(wantedColors, topology.materialIndices)),
		attributeNames: reader.attributes.map((attribute) => attribute.name).filter((name) => !name.startsWith(".")),
		customNormals: readCustomNormals(reader, file, layers, sizes),
		deformWeights: readDeformWeights(file, mesh, layers, sizes),
		vertexGroupNames: groupNames,
		shapeKeys: shapeKeys.keys,
		referenceKey: shapeKeys.reference,
		absoluteKeys: shapeKeys.absolute,
		shapeKeysLeftOut: shapeKeys.leftOut
	};
}
function validateTopology(topology, sizes, name) {
	const { faceOffsets, cornerVerts, cornerEdges, edges } = topology;
	for (let f = 0; f < sizes.face; f++) {
		const start = faceOffsets[f] ?? 0;
		const end = faceOffsets[f + 1] ?? 0;
		if (start < 0 || end > sizes.corner || end - start < 0) throw new MeshReadError(`Mesh ${name} has a face outside its corners`);
	}
	for (let c = 0; c < sizes.corner; c++) {
		const vertex = cornerVerts[c] ?? -1;
		if (vertex < 0 || vertex >= sizes.point) throw new MeshReadError(`Mesh ${name} has a corner without a vertex`);
		if ((cornerEdges[c] ?? -1) >= sizes.edge) cornerEdges[c] = -1;
	}
	for (let e = 0; e < sizes.edge * 2; e++) {
		const vertex = edges[e] ?? -1;
		if (vertex < 0 || vertex >= sizes.point) throw new MeshReadError(`Mesh ${name} has an edge without a vertex`);
	}
	if (cornerEdges.some((edge) => edge < 0)) linkCornerEdges(topology, sizes);
}
/** Finds the edge from each corner's vertex to the next corner's vertex, for corners that do not name one. */
function linkCornerEdges(topology, sizes) {
	const { faceOffsets, cornerVerts, cornerEdges, edges } = topology;
	const key = (a, b) => a < b ? a * sizes.point + b : b * sizes.point + a;
	const byVertices = /* @__PURE__ */ new Map();
	for (let e = 0; e < sizes.edge; e++) byVertices.set(key(edges[e * 2] ?? 0, edges[e * 2 + 1] ?? 0), e);
	for (let f = 0; f < sizes.face; f++) {
		const start = faceOffsets[f] ?? 0;
		const end = faceOffsets[f + 1] ?? start;
		for (let c = start; c < end; c++) {
			if ((cornerEdges[c] ?? -1) >= 0) continue;
			const next = c + 1 < end ? c + 1 : start;
			cornerEdges[c] = byVertices.get(key(cornerVerts[c] ?? 0, cornerVerts[next] ?? 0)) ?? -1;
		}
	}
}
//#endregion
//#region ../../packages/blend/src/scene/shape-keys.ts
var OBJECT_SHAPE_LOCK = 1;
/** The mesh's vertex group a shape key's offsets are limited to, or -1 for none or one the mesh lacks. */
function keyGroup(mesh, key) {
	return key.vertexGroup === "" ? -1 : mesh.vertexGroupNames.lastIndexOf(key.vertexGroup);
}
/** The key a shape key's offsets are measured from: its relative key, or the reference key for one out of range. */
function relativeIndex(mesh, key) {
	return mesh.shapeKeys[key.relative] ? key.relative : mesh.referenceKey;
}
/** Whether a shape key gives the mesh a morph target: every key but the reference key and muted ones. */
function isTarget(mesh, index) {
	return index !== mesh.referenceKey && mesh.shapeKeys[index]?.muted === false;
}
/** The shape keys that give the mesh morph targets, in order. */
function targetKeys(mesh) {
	return mesh.shapeKeys.flatMap((key, index) => {
		const base = mesh.shapeKeys[relativeIndex(mesh, key)];
		return isTarget(mesh, index) && base ? [{
			key,
			base,
			group: keyGroup(mesh, key)
		}] : [];
	});
}
function shapeTarget({ key }) {
	const range = key.max > key.min ? [key.min, key.max] : [0, 1];
	return {
		name: key.name,
		defaultWeight: Math.min(Math.max(key.value, range[0]), range[1]),
		range
	};
}
/** The shape keys that the mesh's morph targets come from, in order. */
function shapeTargets(mesh) {
	return targetKeys(mesh).map(shapeTarget);
}
/** The shape keys that the mesh's morph targets come from, in order, each with every vertex's offset at full weight. */
function shapeOffsets(mesh) {
	return targetKeys(mesh).map((target) => {
		const offsets = new Float32Array(mesh.vertexCount * 3);
		for (let vertex = 0; vertex < mesh.vertexCount; vertex++) {
			const factor = groupFactor(mesh, target, vertex);
			for (let k = 0; k < 3; k++) offsets[vertex * 3 + k] = keyOffset(target, vertex * 3 + k) * factor;
		}
		return {
			...shapeTarget(target),
			offsets
		};
	});
}
/** The index of the active shape key that an object pins with Shape Key Lock, or null without the lock. */
function lockedShapeKey(object) {
	return (object.number("shapeflag") & OBJECT_SHAPE_LOCK) !== 0 ? object.number("shapenr") - 1 : null;
}
/**
* The shape an object that pins the shape key at `locked` shows, or null without the lock. Blender's
* `BKE_key_evaluate_object_ex` shows the pinned key's own positions, the reference key's for a muted pinned key, and the
* first key's when the pinned one is missing. Morph targets hold each key's offsets from the key it is relative to, so
* the pinned key's whole chain of relative keys at full weight makes its shape.
*/
function pinnedShape(mesh, locked) {
	if (locked === null || mesh.shapeKeys.length === 0) return null;
	let pinned = locked;
	if (mesh.shapeKeys[pinned]?.muted) pinned = mesh.referenceKey;
	if (!mesh.shapeKeys[pinned]) pinned = 0;
	const keys = /* @__PURE__ */ new Set();
	const chain = /* @__PURE__ */ new Set();
	let rough = null;
	let grouped = false;
	for (let at = pinned; at !== mesh.referenceKey;) {
		const key = mesh.shapeKeys[at];
		if (!key) break;
		if (chain.has(at)) {
			rough = "the keys it builds on never reach the basis";
			break;
		}
		if (!isTarget(mesh, at)) {
			rough = "a key it builds on is muted";
			break;
		}
		chain.add(at);
		keys.add(key.name);
		grouped ||= keyGroup(mesh, key) >= 0;
		at = relativeIndex(mesh, key);
	}
	if (rough === null && grouped && chain.size > 1) rough = "vertex groups limit the keys it builds on";
	return {
		name: pinned === mesh.referenceKey ? null : mesh.shapeKeys[pinned]?.name ?? null,
		keys,
		rough
	};
}
/**
* Each target's weight by name as an object shows it at the scene's start frame: 1 for the keys a pinned shape needs
* and 0 for the rest, or else each key's value that its animation plays there, kept to its range.
*/
function shapeWeights(targets, played, pinned) {
	return new Map(targets.map(({ name, defaultWeight, range: [min, max] }) => {
		if (pinned) return [name, pinned.keys.has(name) ? 1 : 0];
		const weight = played.get(name);
		return [name, weight === void 0 ? defaultWeight : Math.min(Math.max(weight, min), max)];
	}));
}
/**
* A vertex's local position with each shape key at its weight, as the morph targets add the keys' offsets to the
* reference shape: each offset runs from the key it is relative to, limited by the key's vertex group.
*/
function shapedVertex(mesh, vertex, weights) {
	const at = vertex * 3;
	let [x, y, z] = [
		mesh.positions[at] ?? 0,
		mesh.positions[at + 1] ?? 0,
		mesh.positions[at + 2] ?? 0
	];
	for (const target of targetKeys(mesh)) {
		const weight = weights.get(target.key.name) ?? 0;
		if (weight === 0) continue;
		const factor = groupFactor(mesh, target, vertex) * weight;
		x += keyOffset(target, at) * factor;
		y += keyOffset(target, at + 1) * factor;
		z += keyOffset(target, at + 2) * factor;
	}
	return [
		x,
		y,
		z
	];
}
/** A key's full offset in one coordinate from the key it is relative to. */
function keyOffset({ key, base }, coordinate) {
	return (key.positions[coordinate] ?? 0) - (base.positions[coordinate] ?? 0);
}
/** How much of a key's offset a vertex takes: its weight in the key's vertex group, all of it without one. */
function groupFactor(mesh, { group }, vertex) {
	return group < 0 ? 1 : groupWeight(mesh, group, vertex);
}
/** A vertex's weight in a vertex group: the last the vertex lists for the group, or 0. */
function groupWeight(mesh, group, vertex) {
	const weights = mesh.deformWeights;
	let found = 0;
	if (!weights) return found;
	for (let i = weights.offsets[vertex] ?? 0; i < (weights.offsets[vertex + 1] ?? 0); i++) if (weights.groups[i] === group) found = weights.weights[i] ?? 0;
	return found;
}
//#endregion
//#region ../../packages/blend/src/scene/triangulate.ts
var CONCAVE = -1;
var TANGENTIAL = 0;
var CONVEX = 1;
var FLT_EPSILON = 1.1920928955078125e-7;
var UNSET = -1;
var f = Math.fround;
function point(positions, vertex) {
	return [
		positions[vertex * 3] ?? 0,
		positions[vertex * 3 + 1] ?? 0,
		positions[vertex * 3 + 2] ?? 0
	];
}
function sub(a, b) {
	return [
		f(a[0] - b[0]),
		f(a[1] - b[1]),
		f(a[2] - b[2])
	];
}
function cross(a, b) {
	return [
		f(f(a[1] * b[2]) - f(a[2] * b[1])),
		f(f(a[2] * b[0]) - f(a[0] * b[2])),
		f(f(a[0] * b[1]) - f(a[1] * b[0]))
	];
}
function dot(a, b) {
	return f(f(f(a[0] * b[0]) + f(a[1] * b[1])) + f(a[2] * b[2]));
}
/** Blender's `is_quad_flip_v3_first_third_fast`: whether splitting along 0–2 would fold the quad. */
function quadFlips(a, b, c, d) {
	const ac = sub(c, a);
	return dot(cross(sub(b, a), ac), cross(sub(d, a), ac)) > 0;
}
/** The face normal Blender's tessellation projects a polygon along: Newell's method, `(0, 0, 1)` when it has no area. */
function newellNormal(points) {
	let [x, y, z] = [
		0,
		0,
		0
	];
	let previous = points[points.length - 1] ?? [
		0,
		0,
		0
	];
	for (const current of points) {
		x = f(x + f(f(previous[1] - current[1]) * f(previous[2] + current[2])));
		y = f(y + f(f(previous[2] - current[2]) * f(previous[0] + current[0])));
		z = f(z + f(f(previous[0] - current[0]) * f(previous[1] + current[1])));
		previous = current;
	}
	const lengthSquared = dot([
		x,
		y,
		z
	], [
		x,
		y,
		z
	]);
	if (!(lengthSquared > f(1e-35))) return [
		0,
		0,
		1
	];
	const scale = f(1 / f(Math.sqrt(lengthSquared)));
	return [
		f(x * scale),
		f(y * scale),
		f(z * scale)
	];
}
/**
* Corner positions in the plane of the face normal, through Blender's `axis_dominant_v3_to_m3_negate`, which turns a
* polygon that winds counterclockwise around its normal clockwise in 2D, the order polyfill expects.
*/
function project(points) {
	const normal = newellNormal(points);
	const [x, y, z] = [
		-normal[0],
		-normal[1],
		-normal[2]
	];
	const lengthSquared = f(f(x * x) + f(y * y));
	let u;
	let v;
	if (lengthSquared > FLT_EPSILON) {
		const d = f(1 / f(Math.sqrt(lengthSquared)));
		u = [
			f(y * d),
			f(-x * d),
			0
		];
		v = [
			f(-z * u[1]),
			f(z * u[0]),
			f(f(x * u[1]) - f(y * u[0]))
		];
	} else {
		u = [
			z < 0 ? -1 : 1,
			0,
			0
		];
		v = [
			0,
			1,
			0
		];
	}
	return points.map((p) => [dot(u, p), dot(v, p)]);
}
/** Blender's `span_tri_v2_sign`: 1 where a, b, c turn clockwise, -1 counterclockwise, 0 when they are in line. */
function spanSign(ax, ay, bx, by, cx, cy) {
	const area = f(f(f(bx - cx) * f(ay - cy)) - f(f(ax - cx) * f(by - cy)));
	return area > 0 ? CONVEX : area === 0 ? TANGENTIAL : CONCAVE;
}
/** The first Blender version whose polyfill tests corners against an ear by its edges alone, without bounds. */
var EDGE_TEST_VERSION = 501;
var ACCEPTED_TIPS = [CONVEX, TANGENTIAL];
var THIRD = f(1 / 3);
/**
* Blender's polyfill k-d tree over the corners that are not convex: split at medians on alternating axes, with a
* removed corner flagged and bypassed where it has one branch. `aim` sets the ear that `blocks` and `search` test.
*
* A corner blocks an ear when it lies inside it or on its border. Before Blender 5.1 that means inside the ear's bounds
* with no edge turning away from it. Since 5.1 each edge's line function is evaluated from precomputed terms with no
* bounds, so a corner on the line of a flat ear blocks it even beyond its ends, when the search reaches it.
*/
function cornerTree(xs, ys, corners, byEdges) {
	const count = corners.length;
	const cornerOf = Int32Array.from(corners);
	const nodeX = Float64Array.from(corners, (corner) => xs[corner] ?? 0);
	const nodeY = Float64Array.from(corners, (corner) => ys[corner] ?? 0);
	const negative = new Int32Array(count).fill(UNSET);
	const positive = new Int32Array(count).fill(UNSET);
	const parent = new Int32Array(count).fill(UNSET);
	const vertical = new Uint8Array(count);
	const removed = new Uint8Array(count);
	const nodeOf = new Int32Array(xs.length).fill(UNSET);
	const swap = (a, b) => {
		for (const values of [
			cornerOf,
			nodeX,
			nodeY
		]) {
			const value = values[a] ?? 0;
			values[a] = values[b] ?? 0;
			values[b] = value;
		}
	};
	const balance = (offset, size, along) => {
		if (size <= 0) return UNSET;
		if (size === 1) return offset;
		const values = along ? nodeY : nodeX;
		const median = size >> 1;
		let low = 0;
		let high = size - 1;
		while (high > low) {
			const pivot = values[offset + high] ?? 0;
			let i = low - 1;
			let j = high;
			for (;;) {
				do
					i++;
				while ((values[offset + i] ?? 0) < pivot);
				do
					j--;
				while ((values[offset + j] ?? 0) > pivot && j > low);
				if (i >= j) break;
				swap(offset + i, offset + j);
			}
			swap(offset + i, offset + high);
			if (i >= median) high = i - 1;
			if (i <= median) low = i + 1;
		}
		const node = offset + median;
		vertical[node] = along;
		negative[node] = balance(offset, median, 1 - along);
		positive[node] = balance(node + 1, size - median - 1, 1 - along);
		return node;
	};
	const root = balance(0, count, 0);
	for (let node = 0; node < count; node++) {
		const below = negative[node] ?? UNSET;
		const above = positive[node] ?? UNSET;
		if (below !== UNSET) parent[below] = node;
		if (above !== UNSET) parent[above] = node;
		nodeOf[cornerOf[node] ?? 0] = node;
	}
	const remove = (corner) => {
		let node = nodeOf[corner] ?? UNSET;
		if (node === UNSET) return;
		nodeOf[corner] = UNSET;
		removed[node] = 1;
		for (let above = parent[node] ?? UNSET; above !== UNSET; above = parent[node] ?? UNSET) {
			const below = negative[node] ?? UNSET;
			const beyond = positive[node] ?? UNSET;
			if (below !== UNSET && beyond !== UNSET) break;
			const only = below === UNSET ? beyond : below;
			if (negative[above] === node) negative[above] = only;
			else positive[above] = only;
			if (only !== UNSET) parent[only] = above;
			if (!removed[above]) break;
			node = above;
		}
	};
	let [tip, after, before] = [
		0,
		0,
		0
	];
	let [ax, ay, bx, by, cx, cy] = [
		0,
		0,
		0,
		0,
		0,
		0
	];
	let [minX, minY, maxX, maxY, centerX, centerY] = [
		0,
		0,
		0,
		0,
		0,
		0
	];
	let [abX, abY, abC, bcX, bcY, bcC, caX, caY, caC] = [
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0
	];
	const aim = (ear, next, previous) => {
		tip = ear;
		after = next;
		before = previous;
		[ax, ay, bx, by, cx, cy] = [
			xs[tip] ?? 0,
			ys[tip] ?? 0,
			xs[after] ?? 0,
			ys[after] ?? 0,
			xs[before] ?? 0,
			ys[before] ?? 0
		];
		minX = Math.min(ax, bx, cx);
		maxX = Math.max(ax, bx, cx);
		minY = Math.min(ay, by, cy);
		maxY = Math.max(ay, by, cy);
		centerX = f(f(f(ax + bx) + cx) * THIRD);
		centerY = f(f(f(ay + by) + cy) * THIRD);
		[abX, abY, bcX, bcY, caX, caY] = [
			f(bx - ax),
			f(by - ay),
			f(cx - bx),
			f(cy - by),
			f(ax - cx),
			f(ay - cy)
		];
		abC = f(f(abX * ay) - f(ax * abY));
		bcC = f(f(bcX * by) - f(bx * bcY));
		caC = f(f(caX * cy) - f(cx * caY));
	};
	const contains = (x, y) => {
		if (byEdges) return f(f(f(bcY * x) - f(bcX * y)) + bcC) >= 0 && f(f(f(caY * x) - f(caX * y)) + caC) >= 0 && f(f(f(abY * x) - f(abX * y)) + abC) >= 0;
		return x >= minX && x <= maxX && y >= minY && y <= maxY && spanSign(ax, ay, bx, by, x, y) !== CONCAVE && spanSign(bx, by, cx, cy, x, y) !== CONCAVE && spanSign(cx, cy, ax, ay, x, y) !== CONCAVE;
	};
	const blocks = (corner) => corner !== tip && corner !== after && corner !== before && contains(xs[corner] ?? 0, ys[corner] ?? 0);
	const pending = new Int32Array(count + 1);
	const search = () => {
		if (root === UNSET) return UNSET;
		let top = 0;
		pending[top++] = root;
		while (top > 0) {
			const node = pending[--top] ?? 0;
			const x = nodeX[node] ?? 0;
			const y = nodeY[node] ?? 0;
			if (!removed[node] && contains(x, y)) {
				const corner = cornerOf[node] ?? 0;
				if (corner !== tip && corner !== after && corner !== before) return corner;
			}
			const across = vertical[node] === 1;
			const value = across ? y : x;
			const below = negative[node] ?? UNSET;
			const above = positive[node] ?? UNSET;
			const intoBelow = below !== UNSET && value >= (across ? minY : minX);
			const intoAbove = above !== UNSET && value <= (across ? maxY : maxX);
			if ((across ? centerY : centerX) > value) {
				if (intoBelow) pending[top++] = below;
				if (intoAbove) pending[top++] = above;
			} else {
				if (intoAbove) pending[top++] = above;
				if (intoBelow) pending[top++] = below;
			}
		}
		return UNSET;
	};
	return {
		remove,
		aim,
		blocks,
		holds: (corner) => nodeOf[corner] !== UNSET,
		search
	};
}
/**
* Blender's `BLI_polyfill_calc` for a clockwise polygon: ear clipping that sweeps around the polygon clipping every
* other corner. It looks for a convex ear first and accepts a corner in line with its neighbors only when there is
* none, searches the corners that are not convex for one that blocks an ear, first trying the corner that last blocked
* it, and when no ear is left clips a corner that is not concave. Returns `count - 2` triangles as indices into
* `coords`, three each. `byEdges` picks the ear test of Blender 5.1 and later.
*/
function polyfill(coords, byEdges) {
	const count = coords.length;
	const triangles = [];
	if (count < 3) return triangles;
	const xs = Float64Array.from(coords, (p) => p[0]);
	const ys = Float64Array.from(coords, (p) => p[1]);
	const next = Int32Array.from({ length: count }, (_, index) => (index + 1) % count);
	const previous = Int32Array.from({ length: count }, (_, index) => (index + count - 1) % count);
	const signOf = (index) => {
		const [b, a] = [previous[index] ?? 0, next[index] ?? 0];
		return spanSign(xs[b] ?? 0, ys[b] ?? 0, xs[index] ?? 0, ys[index] ?? 0, xs[a] ?? 0, ys[a] ?? 0);
	};
	const sign = Int8Array.from({ length: count }, (_, index) => signOf(index));
	const notConvex = Array.from(sign.keys()).filter((index) => sign[index] !== CONVEX);
	let concave = notConvex.length;
	const tree = concave > 0 ? cornerTree(xs, ys, notConvex, byEdges) : null;
	const lastHit = new Int32Array(count).fill(UNSET);
	const changed = new Uint8Array(count);
	const isEar = (tip, accept) => {
		if (concave === 0 || !tree) return true;
		if (sign[tip] !== accept) return false;
		const cached = lastHit[tip] ?? UNSET;
		const known = cached !== UNSET && tree.holds(cached);
		if (known && !changed[tip]) return false;
		tree.aim(tip, next[tip] ?? 0, previous[tip] ?? 0);
		if (known && tree.blocks(cached)) {
			changed[tip] = 0;
			return false;
		}
		const hit = tree.search();
		if (hit === UNSET) return true;
		lastHit[tip] = hit;
		changed[tip] = 0;
		return false;
	};
	const findEar = (start, reverse, remaining) => {
		for (const accept of ACCEPTED_TIPS) {
			let ear = start;
			for (let i = 0; i < remaining; i++) {
				if (isEar(ear, accept)) return ear;
				ear = (reverse ? previous[ear] : next[ear]) ?? 0;
			}
		}
		let ear = start;
		for (let i = 0; i < remaining; i++) {
			if (sign[ear] !== CONCAVE) return ear;
			ear = next[ear] ?? 0;
		}
		return ear;
	};
	let head = 0;
	let start = 0;
	let reverse = false;
	for (let remaining = count; remaining > 3; remaining--) {
		const ear = findEar(start, reverse, remaining);
		const before = previous[ear] ?? 0;
		const after = next[ear] ?? 0;
		if (sign[ear] !== CONVEX) concave--;
		triangles.push(before, ear, after);
		tree?.remove(ear);
		next[before] = after;
		previous[after] = before;
		if (head === ear) head = after;
		for (const neighbor of [before, after]) {
			changed[neighbor] = 1;
			if (sign[neighbor] === CONVEX) continue;
			sign[neighbor] = signOf(neighbor);
			if (sign[neighbor] === CONVEX) {
				concave--;
				tree?.remove(neighbor);
			}
		}
		start = (reverse ? previous[before] : next[after]) ?? 0;
		if (sign[start] !== CONVEX) {
			start = (reverse ? previous[start] : next[start]) ?? 0;
			reverse = !reverse;
		}
	}
	const second = next[head] ?? 0;
	triangles.push(head, second, next[second] ?? 0);
	return triangles;
}
/**
* Triangles of each face as corner indices, three per triangle, in face order, as Blender's mesh tessellation makes
* them in 32-bit floats: quads split along the 0–2 diagonal unless that folds them, larger polygons by polyfill in the
* plane of their normal, the way the given Blender version does. `faceTriangles[f]` is the first triangle of face f.
*/
function triangulate(mesh, blenderVersion) {
	const { positions, faceOffsets, cornerVerts } = mesh;
	let total = 0;
	for (let face = 0; face < mesh.faceCount; face++) total += Math.max((faceOffsets[face + 1] ?? 0) - (faceOffsets[face] ?? 0) - 2, 0);
	const corners = new Uint32Array(total * 3);
	const faceTriangles = new Uint32Array(mesh.faceCount + 1);
	let written = 0;
	for (let face = 0; face < mesh.faceCount; face++) {
		faceTriangles[face] = written / 3;
		const start = faceOffsets[face] ?? 0;
		const size = (faceOffsets[face + 1] ?? 0) - start;
		if (size < 3) continue;
		const at = (k) => point(positions, cornerVerts[start + k] ?? 0);
		if (size === 3) corners.set([
			start,
			start + 1,
			start + 2
		], written);
		else if (size === 4) {
			if (quadFlips(at(0), at(1), at(2), at(3))) corners.set([
				start,
				start + 1,
				start + 3,
				start + 1,
				start + 2,
				start + 3
			], written);
			else corners.set([
				start,
				start + 1,
				start + 2,
				start,
				start + 2,
				start + 3
			], written);
		} else {
			const local = polyfill(project(Array.from({ length: size }, (_, k) => at(k))), blenderVersion >= EDGE_TEST_VERSION);
			corners.set(local.map((k) => start + k), written);
		}
		written += (size - 2) * 3;
	}
	faceTriangles[mesh.faceCount] = written / 3;
	return {
		corners,
		faceTriangles
	};
}
//#endregion
//#region ../../packages/blend/src/scene/mesh-build.ts
var MAX_JOINTS = 65534;
/** Blender's armature deform leaves a vertex in place unless its weights add up to more than this. */
var MIN_DEFORM_WEIGHT = 1e-4;
/** Influences per vertex that sort by insertion; a vertex with more sorts through an index array. */
var INSERTION_SORT_LIMIT = 16;
/** Whether an influence goes before another: the stronger first, and the lower joint among equal weights. */
function before(weight, otherWeight, joint, otherJoint) {
	return weight > otherWeight || weight === otherWeight && joint < otherJoint;
}
/** The influences of one vertex, joined by joint and sorted strongest first, in arrays reused for every vertex. */
var Influences = class {
	joints = /* @__PURE__ */ new Int32Array(8);
	weights = /* @__PURE__ */ new Float64Array(8);
	#count = 0;
	#slotOfJoint;
	constructor(jointCount) {
		this.#slotOfJoint = new Int32Array(jointCount).fill(-1);
	}
	get count() {
		return this.#count;
	}
	/** Forgets the previous vertex's influences. */
	clear() {
		for (let k = 0; k < this.#count; k++) this.#slotOfJoint[this.joints[k] ?? 0] = -1;
		this.#count = 0;
	}
	add(joint, weight) {
		const slot = this.#slotOfJoint[joint] ?? -1;
		if (slot >= 0) {
			this.weights[slot] = (this.weights[slot] ?? 0) + weight;
			return;
		}
		if (this.#count === this.joints.length) {
			const joints = new Int32Array(this.#count * 2);
			const weights = new Float64Array(this.#count * 2);
			joints.set(this.joints);
			weights.set(this.weights);
			this.joints = joints;
			this.weights = weights;
		}
		this.#slotOfJoint[joint] = this.#count;
		this.joints[this.#count] = joint;
		this.weights[this.#count] = weight;
		this.#count++;
	}
	/** Sorts by weight, strongest first, and by joint among equal weights. */
	sort() {
		if (this.#count <= INSERTION_SORT_LIMIT) {
			for (let i = 1; i < this.#count; i++) {
				const joint = this.joints[i] ?? 0;
				const weight = this.weights[i] ?? 0;
				let j = i - 1;
				while (j >= 0 && before(weight, this.weights[j] ?? 0, joint, this.joints[j] ?? 0)) {
					this.joints[j + 1] = this.joints[j] ?? 0;
					this.weights[j + 1] = this.weights[j] ?? 0;
					j--;
				}
				this.joints[j + 1] = joint;
				this.weights[j + 1] = weight;
			}
			return;
		}
		const order = Array.from({ length: this.#count }, (_, index) => index);
		order.sort((a, b) => (this.weights[b] ?? 0) - (this.weights[a] ?? 0) || (this.joints[a] ?? 0) - (this.joints[b] ?? 0));
		const joints = Int32Array.from(order, (index) => this.joints[index] ?? 0);
		const weights = Float64Array.from(order, (index) => this.weights[index] ?? 0);
		this.joints.set(joints);
		this.weights.set(weights);
	}
};
function buildSkin(mesh, bones, meshNode) {
	const byName = new Map(bones.map((bone) => [bone.name, bone]));
	const groupBone = mesh.vertexGroupNames.map((name) => byName.get(name) ?? null);
	const used = /* @__PURE__ */ new Set();
	const weights = mesh.deformWeights;
	if (weights) for (let i = 0; i < weights.groups.length; i++) {
		const bone = groupBone[weights.groups[i] ?? -1];
		if (bone && (weights.weights[i] ?? 0) > 0) used.add(bone);
	}
	let ordered = bones.filter((bone) => used.has(bone));
	const droppedBones = ordered.length > MAX_JOINTS;
	if (droppedBones) ordered = ordered.slice(0, MAX_JOINTS);
	const jointOf = new Map(ordered.map((bone, index) => [bone, index]));
	const groupJoint = Int32Array.from(groupBone, (bone) => bone ? jointOf.get(bone) ?? -1 : -1);
	const extraJoint = ordered.length;
	const offsets = new Uint32Array(mesh.vertexCount + 1);
	const sourceJoints = new Uint16Array(weights?.groups.length ?? 0);
	const sourceWeights = new Float32Array(weights?.groups.length ?? 0);
	let written = 0;
	const strongestJoints = new Uint16Array(mesh.vertexCount * 4);
	const strongestWeights = new Float32Array(mesh.vertexCount * 4);
	let unweighted = false;
	const limited = {
		vertices: 0,
		largestDroppedShare: 0
	};
	const influences = new Influences(ordered.length);
	for (let v = 0; v < mesh.vertexCount; v++) {
		offsets[v] = written;
		influences.clear();
		if (weights) for (let i = weights.offsets[v] ?? 0; i < (weights.offsets[v + 1] ?? 0); i++) {
			const group = weights.groups[i] ?? -1;
			const joint = group >= 0 && group < groupJoint.length ? groupJoint[group] ?? -1 : -1;
			const weight = weights.weights[i] ?? 0;
			if (joint >= 0 && weight > 0) influences.add(joint, weight);
		}
		influences.sort();
		let total = 0;
		for (let k = 0; k < influences.count; k++) total += influences.weights[k] ?? 0;
		const count = total > MIN_DEFORM_WEIGHT ? influences.count : 0;
		let sum = 0;
		for (let k = 0; k < count; k++) {
			sourceJoints[written] = influences.joints[k] ?? 0;
			sourceWeights[written] = influences.weights[k] ?? 0;
			written++;
			if (k < 4) sum += influences.weights[k] ?? 0;
		}
		if (count > 4) {
			limited.vertices++;
			limited.largestDroppedShare = Math.max(limited.largestDroppedShare, (total - sum) / total);
		}
		if (sum > 0) for (let k = 0; k < Math.min(4, count); k++) {
			strongestJoints[v * 4 + k] = influences.joints[k] ?? 0;
			strongestWeights[v * 4 + k] = (influences.weights[k] ?? 0) / sum;
		}
		else {
			unweighted = true;
			strongestJoints[v * 4] = extraJoint;
			strongestWeights[v * 4] = 1;
		}
	}
	offsets[mesh.vertexCount] = written;
	const jointNodes = ordered.map((bone) => bone.node);
	if (unweighted) jointNodes.push(meshNode);
	return {
		joints: jointNodes,
		strongestJoints,
		strongestWeights,
		source: {
			offsets,
			joints: sourceJoints.slice(0, written),
			weights: sourceWeights.slice(0, written)
		},
		unweighted,
		droppedBones,
		limited
	};
}
/** A Blender-space normal, rounded to 32 bits as a vertex stores it, in the scene's axes at unit length. */
function sceneNormal(conversion, normal, at = 0) {
	const [x, y, z] = transformDirection(conversion, Math.fround(normal[at] ?? 0), Math.fround(normal[at + 1] ?? 0), Math.fround(normal[at + 2] ?? 0));
	const length = Math.hypot(x, y, z) || 1;
	return [
		x / length,
		y / length,
		z / length
	];
}
function sameNumber(a, b) {
	return a === b || Number.isNaN(a) && Number.isNaN(b);
}
function cornerNormalsOf(source, smoothing) {
	const mesh = smoothing ? applySmoothByAngle(source, smoothing) : source;
	const custom = mesh.customNormals;
	if (custom?.kind === "free") {
		const free = freeCornerNormals(mesh, custom.domain, custom.values);
		if (free) return free;
	}
	return cornerNormals(mesh, {
		sharpFaces: mesh.sharpFaces,
		sharpEdges: mesh.sharpEdges,
		autoSmoothAngle: mesh.autoSmoothAngle,
		customNormals: custom?.kind === "encoded" ? custom.values : null
	});
}
/**
* The triangles in the file's face order, with a group for each run of faces in one slot, so that assigning a face
* another material keeps every triangle's number and face. A mesh with more runs than
* `MAX_MATERIAL_GROUPS` gets its triangles sorted by slot instead.
*/
function drawOrder(mesh, faceTriangles, slotCount) {
	const slotOf = (face) => Math.min(Math.max(mesh.materialIndices?.[face] ?? 0, 0), slotCount - 1);
	const groups = [];
	for (let f = 0; f < mesh.faceCount; f++) {
		const start = faceTriangles[f] ?? 0;
		const triangleCount = (faceTriangles[f + 1] ?? 0) - start;
		if (triangleCount === 0) continue;
		const slot = slotOf(f);
		const last = groups[groups.length - 1];
		if (last?.material === slot) last.triangleCount += triangleCount;
		else if (groups.length === 256) return sortBySlot(mesh, faceTriangles, slotOf, slotCount);
		else groups.push({
			start,
			triangleCount,
			material: slot
		});
	}
	const triangleCount = faceTriangles[mesh.faceCount] ?? 0;
	const order = new Uint32Array(triangleCount);
	for (let triangle = 0; triangle < triangleCount; triangle++) order[triangle] = triangle;
	const faceAt = new Uint32Array(triangleCount);
	for (let f = 0; f < mesh.faceCount; f++) faceAt.fill(f, faceTriangles[f] ?? 0, faceTriangles[f + 1] ?? 0);
	return {
		order,
		faceAt,
		groups
	};
}
/** The triangles in material slot order, each slot's in face order, and the group of each slot that has any. */
function sortBySlot(mesh, faceTriangles, slotOf, slotCount) {
	const counts = new Uint32Array(slotCount);
	for (let f = 0; f < mesh.faceCount; f++) {
		const slot = slotOf(f);
		counts[slot] = (counts[slot] ?? 0) + (faceTriangles[f + 1] ?? 0) - (faceTriangles[f] ?? 0);
	}
	const next = new Uint32Array(slotCount);
	const groups = [];
	let start = 0;
	for (let slot = 0; slot < slotCount; slot++) {
		next[slot] = start;
		const triangleCount = counts[slot] ?? 0;
		if (triangleCount > 0) groups.push({
			start,
			triangleCount,
			material: slot
		});
		start += triangleCount;
	}
	const order = new Uint32Array(start);
	const faceAt = new Uint32Array(start);
	for (let f = 0; f < mesh.faceCount; f++) {
		const slot = slotOf(f);
		for (let triangle = faceTriangles[f] ?? 0; triangle < (faceTriangles[f + 1] ?? 0); triangle++) {
			const position = next[slot] ?? 0;
			order[position] = triangle;
			faceAt[position] = f;
			next[slot] = position + 1;
		}
	}
	return {
		order,
		faceAt,
		groups
	};
}
/** The bits of 32-bit floats, for hashing them. */
function floatBits(values) {
	return new Uint32Array(values.buffer, values.byteOffset, values.length);
}
/** Adds a 32-bit float's bits to a hash, zero and negative zero alike since they compare equal. */
function mixBits(hash, bits) {
	return mix(hash ^ ((bits & 2147483647) === 0 ? 0 : bits));
}
function isNaNBits(bits) {
	return (bits & 2139095040) === 2139095040 && (bits & 8388607) !== 0;
}
/**
* The rendered vertices of a mesh's face corners: one for each corner whose vertex, normal, UVs and color no earlier
* corner shares, found through a hash table over the vertex and the attribute values' bits, in typed arrays that grow
* as vertices are added.
*/
var RenderedVertices = class {
	/** The source vertex of each rendered vertex. */
	sourceVertex;
	/** The corner each rendered vertex takes its attributes from. */
	cornerOf;
	count = 0;
	#mesh;
	#normals;
	#uvMaps;
	#colors;
	#normalBits;
	#uvBits;
	#colorBits;
	#seed = randomKey();
	#table;
	constructor(mesh, normals, uvMaps) {
		this.#mesh = mesh;
		this.#normals = normals;
		this.#uvMaps = uvMaps;
		this.#colors = mesh.colors;
		this.#normalBits = floatBits(normals);
		this.#uvBits = uvMaps.map(floatBits);
		this.#colorBits = mesh.colors ? floatBits(mesh.colors.values) : null;
		const capacity = Math.max(Math.min(mesh.vertexCount, mesh.cornerCount), 16);
		this.sourceVertex = new Uint32Array(capacity);
		this.cornerOf = new Int32Array(capacity);
		this.#table = new Int32Array(tableSize(capacity));
	}
	#colorElement(corner) {
		return this.#colors?.domain === "corner" ? corner : this.#mesh.cornerVerts[corner] ?? 0;
	}
	/** A hash of the corner's vertex and attributes, or null when one is NaN, which no other corner's equals. */
	#hash(corner) {
		let hash = mix(this.#seed ^ (this.#mesh.cornerVerts[corner] ?? 0));
		let nan = false;
		for (let k = 0; k < 3; k++) {
			const bits = this.#normalBits[corner * 3 + k] ?? 0;
			nan ||= isNaNBits(bits);
			hash = mixBits(hash, bits);
		}
		for (const values of this.#uvBits) for (let k = 0; k < 2; k++) {
			const bits = values[corner * 2 + k] ?? 0;
			nan ||= isNaNBits(bits);
			hash = mixBits(hash, bits);
		}
		if (this.#colorBits) {
			const element = this.#colorElement(corner);
			for (let k = 0; k < 4; k++) {
				const bits = this.#colorBits[element * 4 + k] ?? 0;
				nan ||= isNaNBits(bits);
				hash = mixBits(hash, bits);
			}
		}
		return nan ? null : hash;
	}
	/** Whether two corners have the same normal, UVs and color, as 32-bit floats compare. */
	#alike(a, b) {
		const normals = this.#normals;
		for (let k = 0; k < 3; k++) if ((normals[a * 3 + k] ?? 0) !== (normals[b * 3 + k] ?? 0)) return false;
		for (const values of this.#uvMaps) for (let k = 0; k < 2; k++) if ((values[a * 2 + k] ?? 0) !== (values[b * 2 + k] ?? 0)) return false;
		if (this.#colors) {
			const [first, second] = [this.#colorElement(a), this.#colorElement(b)];
			const colors = this.#colors.values;
			for (let k = 0; k < 4; k++) if ((colors[first * 4 + k] ?? 0) !== (colors[second * 4 + k] ?? 0)) return false;
		}
		return true;
	}
	/** The rendered vertex of a corner: an earlier one with the same vertex and attributes, or a new one. */
	of(corner) {
		const vertex = this.#mesh.cornerVerts[corner] ?? 0;
		const hash = this.#hash(corner);
		if (hash === null) return this.add(vertex, corner);
		const mask = this.#table.length - 1;
		for (let slot = hash & mask;; slot = slot + 1 & mask) {
			const entry = this.#table[slot] ?? 0;
			if (entry === 0) {
				const index = this.add(vertex, corner);
				this.#table[slot] = index + 1;
				if (this.count * 3 > this.#table.length * 2) this.#rehash();
				return index;
			}
			const known = entry - 1;
			if (this.sourceVertex[known] === vertex && this.#alike(this.cornerOf[known] ?? 0, corner)) return known;
		}
	}
	/** Adds a rendered vertex of `vertex` with the attributes of `corner`, outside the table. */
	add(vertex, corner) {
		if (this.count === this.sourceVertex.length) {
			const capacity = Math.max(this.count * 2, 16);
			const sourceVertex = new Uint32Array(capacity);
			const cornerOf = new Int32Array(capacity);
			sourceVertex.set(this.sourceVertex);
			cornerOf.set(this.cornerOf);
			this.sourceVertex = sourceVertex;
			this.cornerOf = cornerOf;
		}
		const index = this.count++;
		this.sourceVertex[index] = vertex;
		this.cornerOf[index] = corner;
		return index;
	}
	#rehash() {
		this.#table = new Int32Array(this.#table.length * 2);
		const mask = this.#table.length - 1;
		for (let index = 0; index < this.count; index++) {
			const hash = this.#hash(this.cornerOf[index] ?? 0);
			if (hash === null) continue;
			let slot = hash & mask;
			while ((this.#table[slot] ?? 0) !== 0) slot = slot + 1 & mask;
			this.#table[slot] = index + 1;
		}
	}
};
/** Slots for an open-addressed table of `count` entries, a power of two at most two thirds full. */
function tableSize(count) {
	let size = 16;
	while (size * 2 < count * 3) size *= 2;
	return size;
}
/**
* Turns mesh data into a triangle mesh: corners become rendered vertices, shared where the vertex, normal, UVs
* and color all match, and where every shape key shades them alike, and triangles keep the file's face order in a group
* for each run of faces in one material slot. Positions and normals go through `conversion`.
*/
function buildMesh$1(mesh, options) {
	const normals = cornerNormalsOf(mesh, options.smoothing);
	const { corners, faceTriangles } = triangulate(mesh, options.blenderVersion);
	const drawn = drawOrder(mesh, faceTriangles, Math.max(options.slotCount, 1));
	const { order, groups } = drawn;
	const triangleCount = order.length;
	const uvMaps = mesh.uvMaps.slice(0, 8);
	const colorValues = mesh.colors;
	const rendered = new RenderedVertices(mesh, normals, uvMaps.map((map) => map.values));
	const renderedOfCorner = new Int32Array(mesh.cornerCount).fill(-1);
	for (let position = 0; position < triangleCount; position++) {
		const triangle = order[position] ?? 0;
		for (let k = 0; k < 3; k++) {
			const corner = corners[triangle * 3 + k] ?? 0;
			if ((renderedOfCorner[corner] ?? -1) < 0) renderedOfCorner[corner] = rendered.of(corner);
		}
	}
	/** The vertex each split is made from, and the vertex of the basis whose attributes it copies. */
	const splitFrom = /* @__PURE__ */ new Map();
	const roots = /* @__PURE__ */ new Map();
	const rootOf = (index) => roots.get(index) ?? index;
	const split = (from, corner) => {
		const index = rendered.add(rendered.sourceVertex[from] ?? 0, corner);
		splitFrom.set(index, from);
		roots.set(index, rootOf(from));
		return index;
	};
	const basisNormal = (index) => sceneNormal(options.conversion, normals, (rendered.cornerOf[rootOf(index)] ?? 0) * 3);
	const splitWhereShadingDiffers = (shaded) => {
		const shadedAlike = (a, b) => sameNumber(shaded[a * 3] ?? 0, shaded[b * 3]) && sameNumber(shaded[a * 3 + 1] ?? 0, shaded[b * 3 + 1]) && sameNumber(shaded[a * 3 + 2] ?? 0, shaded[b * 3 + 2]);
		const made = /* @__PURE__ */ new Map();
		for (let corner = 0; corner < mesh.cornerCount; corner++) {
			const from = renderedOfCorner[corner] ?? -1;
			const first = rendered.cornerOf[from] ?? corner;
			if (from < 0 || first === corner || shadedAlike(corner, first)) continue;
			const splits = made.get(from) ?? [];
			let index = splits.find((candidate) => shadedAlike(corner, rendered.cornerOf[candidate] ?? corner));
			if (index === void 0) {
				index = split(from, corner);
				splits.push(index);
				made.set(from, splits);
			}
			renderedOfCorner[corner] = index;
		}
	};
	const morphs = shapeOffsets(mesh);
	const shapedNormalOffsets = morphs.map((target) => {
		if (!target.offsets.some((value) => value !== 0)) return null;
		const shaped = new Float32Array(mesh.positions.length);
		for (let i = 0; i < shaped.length; i++) shaped[i] = (mesh.positions[i] ?? 0) + (target.offsets[i] ?? 0);
		const shaded = cornerNormalsOf({
			...mesh,
			positions: shaped
		}, options.smoothing);
		splitWhereShadingDiffers(shaded);
		const offsets = new Float32Array(rendered.count * 3);
		for (let r = 0; r < rendered.count; r++) {
			const normal = sceneNormal(options.conversion, shaded, (rendered.cornerOf[r] ?? 0) * 3);
			const basis = basisNormal(r);
			for (let k = 0; k < 3; k++) offsets[r * 3 + k] = (normal[k] ?? 0) - (basis[k] ?? 0);
		}
		return offsets;
	});
	const count = rendered.count;
	const source = rendered.sourceVertex.slice(0, count);
	const positions = new Float32Array(count * 3);
	const outNormals = new Float32Array(count * 3);
	const uvValues = uvMaps.map(() => new Float32Array(count * 2));
	const colors = colorValues ? new Float32Array(count * 4) : null;
	const conversion = options.conversion;
	for (let r = 0; r < count; r++) {
		const vertex = source[r] ?? 0;
		const corner = rendered.cornerOf[rootOf(r)] ?? 0;
		const x = mesh.positions[vertex * 3] ?? 0;
		const y = mesh.positions[vertex * 3 + 1] ?? 0;
		const z = mesh.positions[vertex * 3 + 2] ?? 0;
		for (let k = 0; k < 3; k++) positions[r * 3 + k] = (conversion[k] ?? 0) * x + (conversion[4 + k] ?? 0) * y + (conversion[8 + k] ?? 0) * z;
		outNormals.set(basisNormal(r), r * 3);
		for (let m = 0; m < uvMaps.length; m++) {
			const [from, to] = [uvMaps[m]?.values, uvValues[m]];
			if (!from || !to) continue;
			to[r * 2] = from[corner * 2] ?? 0;
			to[r * 2 + 1] = from[corner * 2 + 1] ?? 0;
		}
		if (colors && colorValues) {
			const element = colorValues.domain === "corner" ? corner : mesh.cornerVerts[corner] ?? 0;
			for (let k = 0; k < 4; k++) colors[r * 4 + k] = colorValues.values[element * 4 + k] ?? 0;
		}
	}
	const indices = new Uint32Array(triangleCount * 3);
	for (let position = 0; position < triangleCount; position++) {
		const triangle = order[position] ?? 0;
		for (let k = 0; k < 3; k++) indices[position * 3 + k] = renderedOfCorner[corners[triangle * 3 + k] ?? 0] ?? 0;
	}
	const morphTargets = morphs.map((target, index) => {
		const values = new Float32Array(count * 3);
		const normalOffsets = new Float32Array(count * 3);
		const shading = shapedNormalOffsets[index];
		if (shading) normalOffsets.set(shading);
		const { offsets } = target;
		for (let r = 0; r < count; r++) {
			const v = (source[r] ?? 0) * 3;
			const moved = transformDirection(conversion, offsets[v] ?? 0, offsets[v + 1] ?? 0, offsets[v + 2] ?? 0);
			values.set(moved, r * 3);
			const from = shading && r * 3 >= shading.length ? splitFrom.get(r) : void 0;
			if (from !== void 0) normalOffsets.copyWithin(r * 3, from * 3, from * 3 + 3);
		}
		const [min, max] = target.range;
		return {
			name: target.name,
			defaultWeight: target.defaultWeight,
			range: [min, max],
			positions: values,
			normals: normalOffsets
		};
	});
	let skin = null;
	if (options.skinBones) {
		const built = buildSkin(mesh, options.skinBones, options.meshNode);
		const renderedJoints = new Uint16Array(count * 4);
		const renderedWeights = new Float32Array(count * 4);
		for (let r = 0; r < count; r++) {
			const v = source[r] ?? 0;
			for (let k = 0; k < 4; k++) {
				renderedJoints[r * 4 + k] = built.strongestJoints[v * 4 + k] ?? 0;
				renderedWeights[r * 4 + k] = built.strongestWeights[v * 4 + k] ?? 0;
			}
		}
		skin = {
			joints: built.joints,
			rendered: {
				joints: renderedJoints,
				weights: renderedWeights
			},
			source: built.source,
			unweighted: built.unweighted,
			droppedBones: built.droppedBones,
			limited: built.limited
		};
	}
	return {
		positions,
		normals: outNormals,
		uvs: uvMaps.map((map, m) => ({
			name: map.name,
			values: uvValues[m] ?? /* @__PURE__ */ new Float32Array(0)
		})),
		colors,
		indices,
		sourceVertex: source,
		sourceVertexCount: mesh.vertexCount,
		faces: {
			offsets: Uint32Array.from(mesh.faceOffsets),
			vertices: Uint32Array.from(mesh.cornerVerts)
		},
		triangleFaces: drawn.faceAt,
		groups,
		morphTargets,
		morphKeys: morphs.map((target) => target.name),
		morphRanges: morphs.map((target) => target.range),
		skin,
		droppedUvSets: Math.max(mesh.uvMaps.length - 8, 0)
	};
}
//#endregion
//#region ../../packages/blend/src/scene/parents.ts
function headTailFactor(object) {
	return object.has("parent_bone_head_tail_factor") ? object.number("parent_bone_head_tail_factor") : 1;
}
/** Whether a child of the bone follows only its channel transform, which is identity at rest, as Blender's option. */
function relativeParent(bone) {
	return (bone.flag & BoneFlag.relativeParenting) !== 0;
}
/** The armature's bones, or none when its bone lists are damaged. */
function readableBones(data) {
	try {
		return readBones(data);
	} catch (error) {
		if (error instanceof ArmatureReadError) return [];
		throw error;
	}
}
/** The rest matrix of the bone an object is parented to, moved to the bone's tail, in armature space. */
function boneParentMatrix(object, armature) {
	const data = armature.deref("data");
	const name = object.string("parsubstr");
	const bone = data ? readableBones(data).find((candidate) => candidate.name === name) : void 0;
	if (!bone || relativeParent(bone)) return identity();
	return multiply(bone.rest, translation(0, bone.length * headTailFactor(object), 0));
}
/** Whether the object follows one vertex or three of its parent. */
function isVertexParented(object) {
	const type = parentTypeOf(object);
	return type === ParentType.vertex || type === ParentType.vertices;
}
/** Parent types whose points Blender's vertex parenting follows, of which the reader reads only a mesh's. */
var HAS_POINTS = /* @__PURE__ */ new Set([
	ObjectType.mesh,
	ObjectType.curve,
	ObjectType.surface,
	ObjectType.lattice
]);
/** Whether Blender places a vertex-parented child by points of the parent that the reader does not read. */
function readsNoParentPoints(parent) {
	const type = parent.number("type");
	return HAS_POINTS.has(type) && type !== ObjectType.mesh;
}
/**
* The points a vertex-parented object follows, as Blender's `give_parvert` finds them in a mesh it shows: each vertex's
* local position, or the origin for a vertex the mesh does not have. Null for a parent whose points the reader does
* not know.
*/
function parentPoints(object, parent, vertices) {
	if (parent.number("type") !== ObjectType.mesh) return null;
	const shown = vertices(parent);
	if (!shown) return null;
	return [
		"par1",
		"par2",
		"par3"
	].map((field) => {
		const index = object.number(field);
		return index >= 0 && index < shown.count ? shown.at(index) : [
			0,
			0,
			0
		];
	});
}
function subtract(a, b) {
	return [
		a[0] - b[0],
		a[1] - b[1],
		a[2] - b[2]
	];
}
/** A unit vector, or zero for a vector too short to normalize, as Blender's `normalize_v3`. */
function unit(v) {
	const squared = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
	if (!(squared > 1e-35)) return [
		0,
		0,
		0
	];
	const length = Math.sqrt(squared);
	return [
		v[0] / length,
		v[1] / length,
		v[2] / length
	];
}
/**
* Blender's `ob_parvert3`: the frame of three points, turned by `tri_to_quat` so Z is the triangle's normal and X runs
* along its first edge, at the points' centroid.
*/
function triangleFrame(a, b, c) {
	const ab = subtract(a, b);
	const bc = subtract(b, c);
	const normal = unit([
		ab[1] * bc[2] - ab[2] * bc[1],
		ab[2] * bc[0] - ab[0] * bc[2],
		ab[0] * bc[1] - ab[1] * bc[0]
	]);
	const axis = unit([
		normal[1],
		-normal[0],
		0
	]);
	if (axis[0] === 0 && axis[1] === 0) axis[0] = 1;
	const tilt = -.5 * Math.acos(Math.min(Math.max(normal[2], -1), 1));
	const toNormal = [
		axis[0] * Math.sin(tilt),
		axis[1] * Math.sin(tilt),
		0,
		Math.cos(tilt)
	];
	const edge = transformDirection(invert(compose({
		translation: [
			0,
			0,
			0
		],
		rotation: toNormal,
		scale: [
			1,
			1,
			1
		]
	})), ...subtract(b, a));
	const along = unit([
		edge[0],
		edge[1],
		0
	]);
	const turn = .5 * Math.atan2(along[1], along[0]);
	return compose({
		translation: [
			(a[0] + b[0] + c[0]) / 3,
			(a[1] + b[1] + c[1]) / 3,
			(a[2] + b[2] + c[2]) / 3
		],
		rotation: quatMultiply(toNormal, [
			0,
			0,
			Math.sin(turn),
			Math.cos(turn)
		]),
		scale: [
			1,
			1,
			1
		]
	});
}
/**
* The matrix between a vertex-parented object's parent and its parent inverse, from Blender's
* `BKE_object_get_parent_matrix`: a move to the vertex for one vertex, which drops the parent's rotation and scale,
* or the frame of three. Without the points, the parent's origin and its frame.
*/
function vertexParentPart(object, points, parentWorld) {
	const [a = [
		0,
		0,
		0
	], b = [
		0,
		0,
		0
	], c = [
		0,
		0,
		0
	]] = points ?? [];
	if (parentTypeOf(object) === ParentType.vertex) {
		const [x, y, z] = transformPoint(parentWorld, ...a);
		return multiply(invert(parentWorld), translation(x, y, z));
	}
	return points ? triangleFrame(a, b, c) : identity();
}
/** Rest world matrices in Blender's space of any object, shown or not, with every bone at rest. */
var WorldMatrices = class {
	#cache = /* @__PURE__ */ new Map();
	#vertices;
	constructor(vertices) {
		this.#vertices = vertices;
	}
	/** The object's world matrix, worked out up its parent chain without recursion; a parent cycle stops at the start. */
	of(object) {
		const chain = [];
		const onChain = /* @__PURE__ */ new Set();
		let above = identity();
		for (let next = object; next; next = parentOf(next)) {
			const cached = this.#cache.get(next.offset);
			if (cached) {
				above = cached;
				break;
			}
			if (onChain.has(next.offset)) break;
			onChain.add(next.offset);
			chain.push(next);
		}
		for (const current of chain.reverse()) {
			const parent = parentOf(current);
			above = multiplyAll(parent ? this.#parentMatrix(current, parent, above) : identity(), mat4From(current.numbers("parentinv")), objectBasis(objectValues(current)));
			this.#cache.set(current.offset, above);
		}
		return above;
	}
	/** The world matrix of what the object is parented to: a bone's tail for a bone parent, its vertices for a vertex one. */
	parentOf(object) {
		const parent = parentOf(object);
		return parent ? this.#parentMatrix(object, parent, this.of(parent)) : identity();
	}
	#parentMatrix(object, parent, parentWorld) {
		if (parentTypeOf(object) === ParentType.bone) return multiply(parentWorld, boneParentMatrix(object, parent));
		if (!isVertexParented(object)) return parentWorld;
		const points = parentPoints(object, parent, this.#vertices);
		if (parentTypeOf(object) === ParentType.vertex) {
			const [x, y, z] = transformPoint(parentWorld, ...points?.[0] ?? [
				0,
				0,
				0
			]);
			return translation(x, y, z);
		}
		return multiply(parentWorld, vertexParentPart(object, points, parentWorld));
	}
};
/** The object's parent, or null for none or one that another file holds. */
function parentOf(object) {
	const parent = object.deref("parent");
	return parent && !isLinked(parent) ? parent : null;
}
//#endregion
//#region ../../packages/blend/src/scene/build.ts
var CONSTRAINT_DISABLE = 4;
var CONSTRAINT_OFF = 512;
function sceneSettings(scene) {
	const render = scene?.struct("r");
	const base = render?.number("frs_sec_base") || 1;
	const fps = (render?.number("frs_sec") ?? 0) / base;
	const unitScale = scene?.struct("unit")?.number("scale_length") ?? 1;
	return {
		fps: Number.isFinite(fps) && fps > 0 ? fps : 24,
		unitScale: Number.isFinite(unitScale) && unitScale > 0 ? unitScale : 1
	};
}
/** Blender's Z-up axes into the scene's Y-up axes: (x, y, z) becomes (x, z, −y), times the unit scale. */
function conversionMatrix(unitScale) {
	const s = unitScale;
	return Float64Array.of(s, 0, 0, 0, 0, 0, -s, 0, 0, s, 0, 0, 0, 0, 0, 1);
}
/**
* The constraints Blender evaluates: on, valid, and with some influence now or an influence among `animated`, the paths
* that animation plays on the object. `path` is the object's path to the owner's constraints, such as
* `pose.bones["Arm"].` for a bone or empty for the object itself.
*/
function activeConstraints(owner, path, animated) {
	return ownedList(owner, "constraints").filter((constraint) => {
		const flag = constraint.number("flag");
		if ((flag & CONSTRAINT_OFF) !== 0 || (flag & CONSTRAINT_DISABLE) !== 0) return false;
		const influence = `${path}constraints["${quoted(constraint.string("name"))}"].influence`;
		return constraint.number("enforce") > 0 || animated.has(influence);
	});
}
/** A name as Blender quotes it inside a property path. */
function quoted(name) {
	return name.replace(/["\\]/g, "\\$&");
}
/**
* Warnings about the constraints Blender evaluates on each object and its bones, which the preview does not, given the
* property paths that animation plays on each object.
*/
function constraintWarnings(objects, animated) {
	const warnings = [];
	for (const record of objects) {
		const { object } = record;
		const paths = animated.get(record) ?? /* @__PURE__ */ new Set();
		const subject = {
			kind: "node",
			name: object.name
		};
		const channels = new Map(object.struct.deref("pose")?.list("chanbase").map((channel) => [channel.string("name"), channel]));
		const constrained = (record.armature?.bones ?? []).filter((bone) => {
			const channel = channels.get(bone.name);
			return channel !== void 0 && activeConstraints(channel, `pose.bones["${quoted(bone.name)}"].`, paths).length > 0;
		});
		if (constrained.length > 0) {
			const message = `Bone constraints not evaluated: ${object.name}`;
			const detail = `Bones: ${constrained.map((bone) => bone.name).join(", ")}`;
			warnings.push({
				code: "constraint-not-evaluated",
				subject,
				message,
				detail
			});
		}
		if (activeConstraints(object.struct, "", paths).length > 0) warnings.push({
			code: "constraint-not-evaluated",
			subject,
			message: `Constraints not evaluated: ${object.name}`
		});
	}
	return warnings;
}
/** Rest world matrices of nodes in Blender's space, each worked out once. */
var NodeWorlds = class {
	#nodes;
	#worlds = [];
	constructor(nodes) {
		this.#nodes = nodes;
	}
	/** The world matrix of a node whose ancestors, which come before it, keep their rest matrices from now on. */
	of(index) {
		const chain = [];
		for (let at = index; at >= 0 && this.#worlds[at] === void 0;) {
			chain.push(at);
			const parent = this.#nodes[at]?.parent ?? -1;
			at = parent < at ? parent : -1;
		}
		for (const at of chain.reverse()) {
			const node = this.#nodes[at];
			if (!node) continue;
			const parent = node.parent >= 0 && node.parent < at ? this.#worlds[node.parent] : void 0;
			this.#worlds[at] = parent ? multiply(parent, node.rest) : node.rest;
		}
		return this.#worlds[index] ?? identity();
	}
};
function addArmature(record, data, nodes, warn, startPose) {
	const { object, node } = record;
	let bones;
	try {
		bones = readBones(data);
	} catch (error) {
		if (!(error instanceof ArmatureReadError)) throw error;
		warn("invalid-data", object.name, `Armature not read: ${object.name}`, error.message);
		return;
	}
	const channels = /* @__PURE__ */ new Map();
	for (const channel of object.struct.deref("pose")?.list("chanbase") ?? []) channels.set(channel.string("name"), channel);
	const boneNodes = [];
	const pose = bones.map((bone) => {
		const channel = channels.get(bone.name);
		boneNodes.push(nodes.length);
		nodes.push({
			name: bone.name,
			parent: boneNodes[bone.parent] ?? node,
			kind: "bone",
			rest: bone.offset,
			mesh: null
		});
		return startPose.channel(bone.name, channel ? channelValues(channel) : restChannel());
	});
	record.armature = {
		bones,
		nodes: boneNodes,
		pose
	};
	if (bones.some((bone) => bone.deform && bone.segments > 1)) warn("deform-approximated", object.name, `B-Bones bend as straight bones: ${object.name}`);
}
/** Whether Blender draws geometry for the object, which instancing on vertices or faces would copy. */
function drawsGeometry(object) {
	if (object.type === ObjectType.mesh || UNSHOWN_GEOMETRY.has(object.type)) return true;
	return instancedCollection(object.struct) !== null;
}
/** Offsets of the objects that a shown object with geometry descends from. */
function geometryAncestors(objects) {
	const ancestors = /* @__PURE__ */ new Set();
	for (const object of objects) {
		if (!object.shown || !drawsGeometry(object)) continue;
		for (let parent = object.parent; parent && !ancestors.has(parent.offset); parent = parent.deref("parent")) ancestors.add(parent.offset);
	}
	return ancestors;
}
/** A node for every object, each armature's bones under it, and an object parented to a bone under that bone. */
function objectNodes(contents, poses, warn, vertices) {
	const worlds = new WorldMatrices(vertices);
	const nodes = [];
	const nodeWorlds = new NodeWorlds(nodes);
	const objects = [];
	const byOffset = /* @__PURE__ */ new Map();
	const ancestors = geometryAncestors(contents.objects);
	for (const object of contents.objects) {
		const parentRecord = object.parent ? byOffset.get(object.parent.offset) : void 0;
		let parentNode = parentRecord?.node ?? -1;
		let parentPart = parentRecord ? identity() : worlds.parentOf(object.struct);
		const parentInverse = mat4From(object.struct.numbers("parentinv"));
		const startPose = poses.of(object.struct);
		const values = startPose.object(objectValues(object.struct));
		const below = multiply(parentInverse, objectBasis(values));
		const parentBones = parentRecord?.armature;
		if (parentBones && object.parentType === ParentType.bone) {
			const index = parentBones.bones.findIndex((bone) => bone.name === object.parentBone);
			const bone = parentBones.bones[index];
			if (bone && relativeParent(bone)) {
				const detail = `It stays with ${parentRecord?.object.name} at rest instead of following bone ${bone.name}`;
				warn("deform-approximated", object.name, `Relative bone parent not followed: ${object.name}`, detail);
			} else if (bone) {
				parentNode = parentBones.nodes[index] ?? parentNode;
				parentPart = translation(0, bone.length * headTailFactor(object.struct), 0);
			}
		}
		if (parentRecord && isVertexParented(object.struct)) ({node: parentNode, parentPart} = vertexParentPlace(object, parentRecord, below, nodeWorlds, vertices));
		const record = {
			object,
			node: nodes.length,
			parentPart,
			parentInverse,
			values,
			armature: null
		};
		const rest = multiply(parentPart, below);
		nodes.push({
			name: object.name,
			parent: parentNode,
			kind: "empty",
			rest,
			mesh: null
		});
		if (shearOf(rest) > 1e-4) warn("deform-approximated", object.name, `Shear not shown: ${object.name}`, "Its parent's scale shears it, which the preview drops");
		if (object.type === ObjectType.armature && object.data) addArmature(record, object.data, nodes, warn, startPose);
		if (object.shown && UNSHOWN_GEOMETRY.has(object.type)) {
			const kind = UNSHOWN_GEOMETRY.get(object.type);
			warn("object-not-shown", object.name, `Not shown: ${object.name}`, `Only meshes are read; this is ${kind} data`);
		}
		const instanced = object.shown ? instancedCollection(object.struct) : null;
		if (instanced) {
			const detail = `Instances of ${idName(instanced)} are not expanded`;
			warn("object-not-shown", object.name, `Collection instance not shown: ${object.name}`, detail);
		}
		const instancing = object.shown && !object.hidden && ancestors.has(object.struct.offset) ? childInstancing(object.struct) : null;
		if (instancing) {
			const kind = instancing === "vertex" ? "Vertex" : "Face";
			const detail = `Its children are shown once instead of at each ${instancing}`;
			warn("object-not-shown", object.name, `${kind} instances not shown: ${object.name}`, detail);
		}
		if (object.parent && isVertexParented(object.struct)) vertexParentWarning(object, object.parent, parentNode >= 0 && parentNode === parentRecord?.node, warn);
		objects.push(record);
		byOffset.set(object.struct.offset, record);
	}
	return {
		nodes,
		nodeWorlds,
		objects,
		byOffset
	};
}
/**
* The node a vertex-parented object hangs from, and the matrix between that node and the object's parent inverse: its
* parent's node, or the scene's root where the parent node's scale would shear it. Blender's vertex parent leaves out
* the parent's scale, so the object itself has none of that shear. `below` is the object's matrix under its parent
* inverse.
*/
function vertexParentPlace(object, parent, below, nodeWorlds, vertices) {
	const parentWorld = nodeWorlds.of(parent.node);
	const points = parentPoints(object.struct, parent.object.struct, vertices);
	const parentPart = vertexParentPart(object.struct, points, parentWorld);
	const placed = multiply(parentWorld, parentPart);
	const shears = (above) => shearOf(multiply(above, below)) > SHEAR_TOLERANCE;
	return shears(parentPart) && !shears(placed) ? {
		node: -1,
		parentPart: placed
	} : {
		node: parent.node,
		parentPart
	};
}
/** What the preview leaves out of a vertex parent, which places the object at its parent's vertices only at rest. */
function vertexParentWarning(object, parent, underParent, warn) {
	const name = idName(parent);
	let detail;
	if (readsNoParentPoints(parent)) detail = `The points of ${name} are not read, so it is placed by the origin of ${name} and ${underParent ? "follows it as a whole" : "does not follow it"}`;
	else detail = underParent ? `It keeps its rest offset from ${name} instead of following its vertices` : `It stays where it is at rest instead of following the vertices of ${name}`;
	warn("deform-approximated", object.name, `Vertex parent not followed: ${object.name}`, detail);
}
/**
* The scene's materials, read once each, with the default material for empty slots. A material gets a copy for each
* mesh whose UV maps put its textures on other UV sets, since Blender finds a texture's UV map by name in each mesh,
* and for each mesh that shows the color attributes it reads differently.
*/
var MaterialTable = class {
	drafts = [];
	uvMaps = [];
	colors = [];
	/** Materials linked from other files, which show as the default material. */
	linked = [];
	#read = /* @__PURE__ */ new Map();
	#index = /* @__PURE__ */ new Map();
	#version;
	#isGray;
	#frame;
	constructor(version, isGray, frame) {
		this.#version = version;
		this.#isGray = isGray;
		this.#frame = frame;
	}
	#draftOf(material) {
		if (!material || isLinked(material)) return null;
		let draft = this.#read.get(material.offset);
		if (!draft) {
			draft = readMaterial(material, this.#version, this.#isGray, this.#frame);
			this.#read.set(material.offset, draft);
		}
		return draft;
	}
	/** The color attributes the material's inputs read, as its Color Attribute nodes name them. */
	attributesOf(material) {
		const draft = this.#draftOf(material);
		return [draft?.baseColorAttribute ?? null, draft?.emissiveAttribute ?? null].filter((name) => name !== null);
	}
	indexOf(material, uvMaps, meshColors) {
		if (material && isLinked(material)) this.linked.push(linkedName("materials", idName(material), material));
		const draft = this.#draftOf(material);
		const note = (text) => {
			if (!draft?.approximations.includes(text)) draft?.approximations.push(text);
		};
		for (const use of draft ? imageUses(draft) : []) {
			if (use.uvMap === null || uvMaps.names.includes(use.uvMap)) continue;
			note(`${uvMaps.mesh} has no UV map ${use.uvMap}, shown with its first`);
		}
		if (draft?.normalImage) {
			const tangents = uvSetFor(uvMaps, draft.normalTangentUv);
			const sampled = uvSetFor(uvMaps, draft.normalImage.uvMap);
			const [from, shown] = [uvMaps.names[tangents], uvMaps.names[sampled]];
			if (tangents !== sampled && from && shown) note(`Its normal map takes tangents from UV map ${from}, shown with those of ${shown}`);
		}
		const shown = (input, attribute) => {
			if (attribute === null) return null;
			const name = attribute || meshColors.defaultName;
			if (name !== "" && name === meshColors.read) return "colors";
			if (!meshColors.names.includes(name)) return "black";
			note(`${input} comes from color attribute ${name} of ${uvMaps.mesh}, which the preview leaves out`);
			return null;
		};
		const colors = {
			baseColor: shown("Base color", draft?.baseColorAttribute ?? null),
			emissive: shown("Emission", draft?.emissiveAttribute ?? null)
		};
		const sets = draft ? imageUses(draft).map((use) => uvSetFor(uvMaps, use.uvMap)) : [];
		const key = `${material && draft ? material.offset : "default"}:${sets.join(",")}:${colors.baseColor}:${colors.emissive}`;
		const known = this.#index.get(key);
		if (known !== void 0) return known;
		this.#index.set(key, this.drafts.length);
		this.drafts.push(draft ?? defaultMaterial());
		this.uvMaps.push(uvMaps);
		this.colors.push(colors);
		return this.drafts.length - 1;
	}
};
/**
* The most levels of objects and bones a scene may nest, far more than real scenes and rigs have. Deeper scenes are
* refused, since walking them takes a nested call per level.
*/
var MAX_NODE_DEPTH = 1024;
/** Whether a node nests more than `MAX_NODE_DEPTH` levels deep, a root being the first level. */
function nestsTooDeep(nodes) {
	const levels = new Int32Array(nodes.length);
	for (let index = 0; index < nodes.length; index++) {
		const parent = nodes[index]?.parent ?? -1;
		const level = (parent >= 0 && parent < index ? levels[parent] ?? 0 : 0) + 1;
		if (level > 1024) return true;
		levels[index] = level;
	}
	return false;
}
/** Blender's `MAXMAT`: the most material slots it gives an object or a mesh. */
var MAX_MATERIAL_SLOTS = 32767;
/**
* Reads the material in each slot of the scene's meshes and objects. A mesh's slots are read once and shared by the
* objects that link none of their own. An array of materials or links serves only the first mesh or object that points
* at it, as Blender writes one for each, so an object's or mesh's slots are bounded by the bytes of its own arrays.
*/
var SlotReader = class {
	#file;
	#claimed = /* @__PURE__ */ new Set();
	#meshes = /* @__PURE__ */ new Map();
	#materials = /* @__PURE__ */ new Map();
	constructor(file) {
		this.#file = file;
	}
	/** The material in each of the mesh's own slots, as many as its count and its array of materials both hold. */
	mesh(mesh) {
		let slots = this.#meshes.get(mesh.offset);
		if (!slots) {
			slots = this.#pointers(mesh, "mat").map((address) => this.#material(mesh, address));
			this.#meshes.set(mesh.offset, slots);
		}
		return slots;
	}
	/**
	* The material in each of the object's slots: its own where the slot links to the object, else the mesh's. The
	* object has as many slots as its count and its arrays of materials and links hold, and at least the mesh's.
	*/
	object(object, meshSlots) {
		const materials = this.#pointers(object, "mat");
		const linksBlock = this.#own(object, "matbits");
		const links = linksBlock ? this.#file.bytesOf(linksBlock).subarray(0, this.#counted(object)) : /* @__PURE__ */ new Uint8Array(0);
		const count = Math.max(materials.length, links.length, meshSlots.length);
		if (count === meshSlots.length && links.every((link) => link === 0)) return meshSlots;
		return Array.from({ length: count }, (_, slot) => (links[slot] ?? 0) === 0 ? meshSlots[slot] ?? null : this.#material(object, materials[slot] ?? 0n));
	}
	#counted(owner) {
		return Math.min(Math.max(owner.number("totcol"), 0), MAX_MATERIAL_SLOTS);
	}
	/** The block a pointer member points at, unless a mesh or object read before points at it too. */
	#own(owner, name) {
		const block = owner.target(name);
		if (!block || this.#claimed.has(block.index)) return null;
		this.#claimed.add(block.index);
		return block;
	}
	/** The material pointers in the owner's own array, as many as its count and the array both hold. */
	#pointers(owner, name) {
		return this.#own(owner, name) ? owner.pointers(name, this.#counted(owner)) : [];
	}
	#material(owner, address) {
		const block = owner.resolve(address);
		if (!block) return null;
		let material = this.#materials.get(block.index);
		if (material === void 0) {
			material = this.#file.first(block);
			this.#materials.set(block.index, material);
		}
		return material;
	}
};
/**
* The scene's shown mesh objects with the materials in their slots, which both the gray check and the build read.
* Objects that link no slot of their own share their mesh's slots.
*/
function* shownMeshSlots(file, contents) {
	const reader = new SlotReader(file);
	const read = /* @__PURE__ */ new Map();
	for (const object of contents.objects) {
		if (object.type !== ObjectType.mesh || !object.data || !object.shown) continue;
		let slots = read.get(object.struct.offset);
		if (!slots) {
			slots = reader.object(object.struct, reader.mesh(object.data));
			read.set(object.struct.offset, slots);
		}
		yield {
			object,
			mesh: object.data,
			slots
		};
	}
}
/**
* The images that the materials in the slots of the scene's shown meshes ask `buildScene`'s `isGray` about, so that
* the caller can find which are gray before building the scene, each read whole where any material asks so. It reads
* only the materials, not the meshes.
*/
function grayCandidates(file, contents) {
	const asked = /* @__PURE__ */ new Map();
	const ask = (image, read) => {
		const whole = read === "whole" || asked.get(image.offset)?.read === "whole";
		asked.set(image.offset, {
			image,
			read: whole ? "whole" : "sample"
		});
		return null;
	};
	const read = /* @__PURE__ */ new Set();
	const frame = imageFrame(contents.scene);
	const scanned = /* @__PURE__ */ new Set();
	for (const { slots } of shownMeshSlots(file, contents)) {
		if (scanned.has(slots)) continue;
		scanned.add(slots);
		for (const material of slots) {
			if (!material || isLinked(material) || read.has(material.offset)) continue;
			read.add(material.offset);
			readMaterial(material, file.version, ask, frame);
		}
	}
	return [...asked.values()];
}
/** The scene frame at which an image sequence shows its frame: the start frame, whole, as for poses and shape keys. */
function imageFrame(scene) {
	return Math.trunc(startFrame(scene));
}
/** The deform bones that skin the object, from its first Armature modifier, with warnings about what is left out. */
function skinBones(object, byOffset, warn) {
	const deforms = deformingArmatures(object.struct);
	const [first] = deforms;
	const armature = first ? byOffset.get(first.target.offset)?.armature : void 0;
	if (!first || !armature) return null;
	if (deforms.length > 1) warn("extra-skins", object.name, `Several skins: ${object.name}`, "Only the first Armature modifier deforms it");
	if ((first.flags & ArmatureDeformFlag.preserveVolume) !== 0) warn("deform-approximated", object.name, `Preserve volume shown as linear skinning: ${object.name}`);
	if (first.maskGroup !== "") {
		const detail = `Vertex group ${first.maskGroup} limits the Armature modifier; the preview deforms vertices fully`;
		warn("deform-approximated", object.name, `Armature mask not applied: ${object.name}`, detail);
	}
	if ((first.flags & ArmatureDeformFlag.vertexGroups) === 0) return null;
	return armature.bones.flatMap((bone, index) => bone.deform ? [{
		name: bone.name,
		node: armature.nodes[index] ?? -1
	}] : []);
}
/** Warnings about the envelopes of the armature that skins the mesh object at `node`, which the preview leaves out. */
function envelopeWarnings(object, node, data, byOffset, restWorld, warn) {
	const [first] = deformingArmatures(object.struct);
	const target = first ? byOffset.get(first.target.offset) : void 0;
	if (!first || !target?.armature) return;
	const toArmature = multiply(invert(restWorld[target.node] ?? identity()), restWorld[node] ?? identity());
	const use = envelopeUse(data, first, target.armature.bones, toArmature);
	if (use.enveloped) warn("deform-approximated", object.name, `Envelopes not used: ${object.name}`, "Only vertex groups deform it");
	if (use.multiplying.length > 0) {
		const detail = `Bones that multiply vertex group weights by their envelopes: ${use.multiplying.join(", ")}`;
		warn("deform-approximated", object.name, `Envelope multiply not applied: ${object.name}`, detail);
	}
}
function modifierWarnings(object, smoothing, warn) {
	const ignored = viewportModifiers(object.struct).filter((modifier) => changesPreview(modifier) && modifierType(modifier) !== ModifierType.armature && modifier.offset !== smoothing?.modifier.offset);
	if (ignored.length > 0) warn("modifier-not-applied", object.name, `Modifiers not applied: ${object.name}`, `Shown without ${ignored.map(modifierName).join(", ")}`);
}
function meshWarnings(object, built, warn) {
	if (built.droppedUvSets > 0) warn("too-many-uv-sets", object.name, `Too many UV sets: ${object.name}`, `Only the first 8 are kept`);
	if (built.skin?.unweighted) warn("unweighted-vertices", object.name, `Unweighted vertices: ${object.name}`, "Some vertices have no skin weights");
	if (built.skin?.droppedBones) warn("too-many-bones", object.name, `Too many bones: ${object.name}`, "Bones past the first 65534 are dropped");
	const limited = built.skin?.limited;
	if (limited && limited.vertices > 0) {
		const percent = Math.round(limited.largestDroppedShare * 100);
		const loss = percent < 1 ? "less than 1%" : `up to ${percent}%`;
		warn("deform-approximated", object.name, `Skin weights limited to four bones: ${object.name}`, limited.vertices === 1 ? `1 vertex keeps its four strongest bones and loses ${loss} of its weight` : `${limited.vertices} vertices keep their four strongest bones and lose ${loss} of their weight`);
	}
}
function sameValues(a, b) {
	return a.length === b.length && a.every((value, index) => value === b[index]);
}
/**
* Mesh data and built meshes, read and built once for all the shown objects that share a mesh with the same settings.
* A mesh's entries go once its last shown object is built.
*/
var MeshCache = class {
	#file;
	#users = /* @__PURE__ */ new Map();
	#entries = /* @__PURE__ */ new Map();
	#vertices = /* @__PURE__ */ new Map();
	#shapes = /* @__PURE__ */ new Map();
	constructor(file, shown) {
		this.#file = file;
		for (const { mesh } of shown) this.#users.set(mesh.offset, (this.#users.get(mesh.offset) ?? 0) + 1);
	}
	/** The mesh's data with an object's vertex group names and the color attributes each of its slots wants. */
	read(mesh, groups, colors) {
		const wanted = colors.some((names) => names.length > 0) ? colors : [];
		const key = JSON.stringify([groups, wanted]);
		const entries = this.#entriesOf(mesh.offset);
		let found = entries.read.get(key);
		if (!found) {
			try {
				found = {
					mesh: mesh.offset,
					key,
					data: readMeshData(this.#file, mesh, groups, wanted)
				};
			} catch (error) {
				if (!(error instanceof MeshReadError)) throw error;
				found = error;
			}
			entries.read.set(key, found);
		}
		return found;
	}
	/** The mesh built from read data with an object's options, which name the object's node only for a skinned mesh. */
	build(read, options) {
		const smoothing = options.smoothing && [options.smoothing.angle, options.smoothing.ignoreSharpness];
		const skin = options.skinBones && [options.skinBones, options.meshNode];
		const key = JSON.stringify([
			read.key,
			options.slotCount,
			smoothing,
			skin
		]);
		const entries = this.#entriesOf(read.mesh);
		let built = entries.built.get(key);
		if (!built) {
			built = buildMesh$1(read.data, options);
			entries.built.set(key, built);
		}
		return built;
	}
	/** A mesh object's vertices as the reader shows them at rest, or null for a mesh the reader cannot read. */
	vertices(object, poses) {
		const known = this.#vertices.get(object.offset);
		if (known !== void 0) return known;
		const mesh = object.deref("data");
		const source = mesh && !isLinked(mesh) ? this.#shapeOf(mesh, vertexGroupNames(object)) : null;
		let shown = null;
		if (mesh && source) {
			const weights = restShapeWeights(object, mesh, source, poses);
			shown = {
				count: source.vertexCount,
				at: (index) => shapedVertex(source, index, weights)
			};
		}
		this.#vertices.set(object.offset, shown);
		return shown;
	}
	/** What the mesh's shape keys move its vertices by, keeping only that of a mesh that no shown object builds. */
	#shapeOf(mesh, groups) {
		const key = JSON.stringify([mesh.offset, groups]);
		let found = this.#shapes.get(key);
		if (found === void 0) {
			const read = this.read(mesh, groups, []);
			if (read instanceof MeshReadError) found = null;
			else {
				const { vertexCount, positions, shapeKeys, referenceKey, vertexGroupNames, deformWeights } = read.data;
				found = {
					vertexCount,
					positions,
					shapeKeys,
					referenceKey,
					vertexGroupNames,
					deformWeights
				};
			}
			this.#shapes.set(key, found);
			if (!this.#users.has(mesh.offset)) this.#entries.delete(mesh.offset);
		}
		return found;
	}
	/** Marks one shown object of the mesh built, which lets the mesh's entries go after the last. */
	done(mesh) {
		const left = (this.#users.get(mesh.offset) ?? 0) - 1;
		this.#users.set(mesh.offset, left);
		if (left <= 0) this.#entries.delete(mesh.offset);
	}
	#entriesOf(mesh) {
		let entries = this.#entries.get(mesh);
		if (!entries) {
			entries = {
				read: /* @__PURE__ */ new Map(),
				built: /* @__PURE__ */ new Map()
			};
			this.#entries.set(mesh, entries);
		}
		return entries;
	}
};
/** The vertex group names an object stores, which files before Blender 3.0 keep on the object. */
function vertexGroupNames(object) {
	return ownedList(object, "defbase").map((group) => group.string("name"));
}
/** Each shape key's weight by name, as the object shows its mesh at the scene's start frame. */
function restShapeWeights(object, mesh, data, poses) {
	const pinned = pinnedShape(data, lockedShapeKey(object));
	const key = mesh.deref("key");
	return shapeWeights(shapeTargets(data), !pinned && key ? poses.weights(key) : /* @__PURE__ */ new Map(), pinned);
}
function pinnedDetail(pinned) {
	const unchanged = "key values and their animation change nothing";
	if (pinned.name === null) return `Shows its basis shape, as Blender does, so ${unchanged}`;
	if (pinned.rough === null) return `Shows ${pinned.name} alone, as Blender does, so ${unchanged}`;
	return `Shows ${pinned.name} alone, roughly, since ${pinned.rough}; ${unchanged}`;
}
/** Each morph target's weight as Blender shows the object at the scene's start frame, and whether Shape Key Lock pins it. */
function startMorphTargets(object, mesh, data, built, poses, warn) {
	const pinned = pinnedShape(data, lockedShapeKey(object.struct));
	if (pinned && built.morphTargets.length > 0) warn("deform-approximated", object.name, `Shape key pinned: ${object.name}`, pinnedDetail(pinned));
	const key = mesh.deref("key");
	const weights = shapeWeights(shapeTargets(data), !pinned && key ? poses.weights(key) : /* @__PURE__ */ new Map(), pinned);
	return {
		targets: built.morphTargets.map((target) => {
			const weight = weights.get(target.name) ?? target.defaultWeight;
			return weight === target.defaultWeight ? target : {
				...target,
				defaultWeight: weight
			};
		}),
		locked: pinned !== null
	};
}
/** The meshes of the scene's shown mesh objects, with their skeletons and what animation needs to move them. */
var SceneMeshes = class {
	meshes = [];
	skeletons = [];
	records = [];
	#context;
	constructor(context) {
		this.#context = context;
	}
	add(record, shown) {
		try {
			this.#add(record, shown);
		} finally {
			this.#context.cache.done(shown.mesh);
		}
	}
	#add(record, { object, mesh, slots }) {
		const { file, poses, conversion, nodes, restWorld, byOffset, materials, cache, warn } = this.#context;
		const defaultColor = defaultColorAttribute(mesh);
		const wantedColors = slots.map((material) => materials.attributesOf(material).map((name) => name || defaultColor).filter((name) => name !== ""));
		const read = cache.read(mesh, vertexGroupNames(object.struct), wantedColors);
		if (read instanceof MeshReadError) {
			warn("invalid-data", object.name, `Mesh not read: ${object.name}`, read.message);
			return;
		}
		const { data } = read;
		const smoothing = smoothByAngle(object.struct);
		modifierWarnings(object, smoothing, warn);
		if (data.faceCount === 0) {
			if (data.edgeCount > 0) warn("object-not-shown", object.name, `Not shown: ${object.name}`, "Its mesh has no faces");
			return;
		}
		if (data.absoluteKeys) warn("deform-approximated", object.name, `Absolute shape keys not shown: ${object.name}`, "Shown in its basis shape");
		if (data.shapeKeysLeftOut) {
			const detail = `Its mesh has ${data.cornerCount} face corners for ${data.vertexCount} vertices; shown in its basis shape`;
			warn("deform-approximated", object.name, `Shape keys not shown: ${object.name}`, detail);
		}
		const built = cache.build(read, {
			conversion,
			slotCount: slots.length,
			skinBones: skinBones(object, byOffset, warn),
			meshNode: record.node,
			smoothing,
			blenderVersion: file.version
		});
		meshWarnings(object, built, warn);
		const toScene = invert(conversion);
		const sceneWorld = (node) => multiplyAll(conversion, restWorld[node] ?? identity(), toScene);
		const bind = sceneWorld(record.node);
		let skin = null;
		if (built.skin) {
			const inverseBind = new Float32Array(built.skin.joints.length * 16);
			built.skin.joints.forEach((joint, index) => {
				inverseBind.set(invert(sceneWorld(joint)), index * 16);
			});
			skin = {
				skeleton: this.#skeletonIndex(built.skin.joints, inverseBind),
				bindMatrix: Float32Array.from(bind),
				joints: built.skin.rendered.joints,
				weights: built.skin.rendered.weights,
				sourceWeights: built.skin.source
			};
		}
		envelopeWarnings(object, record.node, data, byOffset, restWorld, warn);
		const restPositions = new Float32Array(data.vertexCount * 3);
		const placement = multiply(bind, conversion);
		for (let v = 0; v < data.vertexCount; v++) {
			const [x = 0, y = 0, z = 0] = data.positions.subarray(v * 3, v * 3 + 3);
			restPositions.set(transformPoint(placement, x, y, z), v * 3);
		}
		const uvMaps = {
			mesh: object.name,
			names: built.uvs.map((uv) => uv.name),
			defaultIndex: data.defaultUv < built.uvs.length ? data.defaultUv : 0
		};
		const meshColors = {
			read: data.colors?.name ?? null,
			names: data.attributeNames,
			defaultName: defaultColor
		};
		const usedSlots = [...new Set(built.groups.map((group) => group.material))].sort((a, b) => a - b);
		const materialOfSlot = new Map(usedSlots.map((slot) => [slot, materials.indexOf(slots[slot] ?? null, uvMaps, meshColors)]));
		const groups = built.groups.map((group) => ({
			...group,
			material: materialOfSlot.get(group.material) ?? 0
		}));
		const morphs = startMorphTargets(object, mesh, data, built, poses, warn);
		const node = nodes[record.node];
		if (node) {
			node.kind = "mesh";
			node.mesh = this.meshes.length;
		}
		this.meshes.push({
			name: object.name,
			dataName: data.name,
			positions: built.positions,
			normals: built.normals,
			uvs: built.uvs,
			colors: built.colors,
			indices: built.indices,
			groups,
			morphTargets: morphs.targets,
			skin,
			sourceVertex: built.sourceVertex,
			sourceVertexCount: built.sourceVertexCount,
			restPositions,
			faces: built.faces,
			triangleFaces: built.triangleFaces
		});
		this.records.push({
			node: record.node,
			object,
			morphKeys: built.morphKeys,
			morphDefaults: morphs.targets.map((target) => target.defaultWeight),
			morphRanges: built.morphRanges,
			shapeKeyLock: morphs.locked
		});
	}
	#skeletonIndex(joints, inverseBind) {
		const found = this.skeletons.findIndex((skeleton) => skeleton.joints.length === joints.length && skeleton.joints.every((joint, index) => joint === joints[index]) && sameValues(skeleton.inverseBindMatrices, inverseBind));
		if (found >= 0) return found;
		this.skeletons.push({
			joints,
			inverseBindMatrices: inverseBind
		});
		return this.skeletons.length - 1;
	}
};
/** One warning for each material the preview approximates. */
function materialWarnings(drafts) {
	return [...new Set(drafts)].filter((draft) => draft.approximations.length > 0).map((draft) => ({
		code: "material-approximated",
		subject: {
			kind: "material",
			name: draft.name
		},
		message: `Material approximated: ${draft.name}`,
		detail: draft.approximations.join("; ")
	}));
}
/** Data the scene needs from other files: the scene's own, and the materials, actions and images its objects use. */
function linkedNames(contents, materials) {
	const actions = contents.objects.flatMap((object) => {
		const key = object.type === ObjectType.mesh ? object.data?.deref("key") : null;
		return key ? [object.struct, key] : [object.struct];
	}).flatMap((id) => usedActions(id).flatMap(({ action }) => isLinked(action) ? [linkedName("actions", idName(action), action)] : []));
	const images = materials.drafts.flatMap((draft) => imageUses(draft).flatMap((use) => use.image.typeName === "Image" ? [] : [linkedName("images", idName(use.image), use.image)]));
	return [
		...contents.linked,
		...materials.linked,
		...actions,
		...images
	];
}
/**
* The warning about data that the scene links from other .blend files, which the reader does not load, or null for
* none.
* Files that Pack Linked Libraries packed into this one are named apart: the data is in the file, unread.
*/
function linkedDataWarning(linked) {
	const listed = (packed) => LINKED_KINDS.flatMap((kind) => {
		const names = new Set(linked.flatMap((entry) => entry.kind === kind && entry.packed === packed ? [entry.name] : []));
		return names.size > 0 ? [`${kind} ${[...names].join(", ")}`] : [];
	}).join("; ");
	const external = listed(false);
	const packed = listed(true);
	const detail = [external === "" ? "" : `From other .blend files: ${external}`, packed === "" ? "" : `From .blend files packed in this one, which are not read: ${packed}`].filter((part) => part !== "").join(". ");
	if (detail === "") return null;
	return {
		code: "library-not-loaded",
		subject: {
			kind: "file",
			name: ""
		},
		message: "Linked data not shown",
		detail
	};
}
/**
* Reads the active scene of a .blend file into nodes, meshes, skeletons and material drafts. `isGray` says which images
* are gray, where materials show one value of an image as a color. `contents` are the scene's objects and `actions` the
* file's actions, when the caller has read them already.
*/
function buildScene$1(file, isGray = () => null, contents = collectSceneObjects(file), actions = readActions(file)) {
	const warnings = [];
	const warn = (code, name, message, detail) => {
		const subject = {
			kind: "node",
			name
		};
		warnings.push(detail === void 0 ? {
			code,
			subject,
			message
		} : {
			code,
			subject,
			message,
			detail
		});
	};
	const { fps, unitScale } = sceneSettings(contents.scene);
	const conversion = conversionMatrix(unitScale);
	const shown = [...shownMeshSlots(file, contents)];
	const cache = new MeshCache(file, shown);
	const poses = startPoses(contents.scene, actions);
	const { nodes, nodeWorlds, objects, byOffset } = objectNodes(contents, poses, warn, (parent) => cache.vertices(parent, poses));
	if (nestsTooDeep(nodes)) throw new BlendLimitError(`nests objects and bones more than ${MAX_NODE_DEPTH} levels deep`);
	const restWorld = nodes.map((_, index) => nodeWorlds.of(index));
	const materials = new MaterialTable(file.version, isGray, imageFrame(contents.scene));
	const meshes = new SceneMeshes({
		file,
		poses,
		conversion,
		nodes,
		restWorld,
		byOffset,
		materials,
		cache,
		warn
	});
	for (const mesh of shown) {
		const record = byOffset.get(mesh.object.struct.offset);
		if (record) meshes.add(record, mesh);
	}
	for (const warning of materialWarnings(materials.drafts)) warnings.push(warning);
	const linked = linkedDataWarning(linkedNames(contents, materials));
	if (linked) warnings.push(linked);
	return {
		nodes,
		meshes: meshes.meshes,
		skeletons: meshes.skeletons,
		materials: materials.drafts,
		materialUvs: materials.uvMaps,
		materialColors: materials.colors,
		objects,
		meshRecords: meshes.records,
		conversion,
		fps,
		unitScale,
		timeline: sceneTimeline(contents.scene),
		warnings
	};
}
/** The UV set index a texture samples in a mesh: its UV Map node's map, or else the mesh's default map. */
function uvSetFor(mesh, uvMap) {
	if (!mesh) return 0;
	const found = uvMap === null ? mesh.defaultIndex : mesh.names.indexOf(uvMap);
	return found >= 0 ? found : 0;
}
//#endregion
//#region ../../packages/blend/src/anim/rest-position.ts
var ARMATURE_REST_POSITION = 1;
/** Whether an armature is set to Blender's rest position, which shows it at rest whatever its pose. */
function inRestPosition(record) {
	return ((record.object.data?.number("flag") ?? 0) & ARMATURE_REST_POSITION) !== 0;
}
/**
* Warnings for armatures set to Blender's rest position that a clip poses. Blender keeps such an armature at rest
* whatever its action does; the preview plays the clip.
*/
function restPositionWarnings(scene, clips) {
	return scene.objects.flatMap((record) => {
		const { object, armature } = record;
		if (!armature || !inRestPosition(record)) return [];
		const bones = new Set(armature.nodes);
		const posing = clips.filter((clip) => clip.tracks.some((track) => bones.has(track.node)));
		if (posing.length === 0) return [];
		return [{
			code: "deform-approximated",
			subject: {
				kind: "node",
				name: object.name
			},
			message: `Rest position not followed: ${object.name}`,
			detail: `Blender shows this armature in its rest position; the preview poses it in ${posing.map((clip) => clip.name).join(", ")}`
		}];
	});
}
//#endregion
//#region ../../packages/blend/src/anim/clips.ts
var SNAP_FRAMES = .001;
/** The most whole frames a clip spans, and the most it samples with the frames between them where a curve jumps. */
var MAX_FRAMES = 1e5;
/**
* One clip samples at most a gigabyte of doubles, a file's clips sample at most four times that between them, and
* they keep at most half a gigabyte of floats.
*/
var CLIP_LIMITS = {
	clip: 2 ** 27,
	sampled: 2 ** 29,
	kept: 2 ** 27
};
/** How long before or after a jump, in frames, a track still holds the value on the other side of it. */
var HOLD_FRAMES = .001;
/** Scales are sampled at least this far from zero, so a flattened transform keeps its rotation. */
var MIN_SCALE = 1e-6;
/** A value jumps at the end of a segment when its change over the last `HOLD_FRAMES` is this share of the rest. */
var JUMP_SHARE = .05;
var JUMP_MINIMUM = 1e-6;
var HOLD_TOLERANCE = 1e-9;
var TRANSFORM_PROPERTIES = [
	"translation",
	"rotation",
	"scale"
];
var LEAD_KEY = 1;
var HOLD_KEY = 2;
function shapeKeyOwner(mesh) {
	return mesh.object.data?.deref("key") ?? null;
}
function relevantObjectCurve(curve, record) {
	if (curve.muted) return false;
	if (isTransformProperty(curve.path, true)) return true;
	const pose = parsePosePath(curve.path);
	return pose !== null && record.armature !== null && isTransformProperty(pose.property, false);
}
function keysRotationMode(curve) {
	return !curve.muted && (curve.path === "rotation_mode" || parsePosePath(curve.path)?.property === "rotation_mode");
}
function keysHideViewport(curve) {
	return !curve.muted && !curve.empty && curve.path === "hide_viewport";
}
function relevantKeyCurve(curve) {
	return !curve.muted && parseShapeKeyPath(curve.path) !== null;
}
/** Whether a curve moves what the preview shows: an object's or bone's transform, or a shape key's weight. */
function shownCurve(curve) {
	if (curve.muted || curve.empty) return false;
	const pose = parsePosePath(curve.path);
	return isTransformProperty(pose ? pose.property : curve.path, !pose) || parseShapeKeyPath(curve.path) !== null;
}
/** The object transform values that curves key, such as "location[0]". */
function objectTransformValues(curves) {
	const values = /* @__PURE__ */ new Set();
	for (const curve of curves) if (!curve.muted && !curve.empty && isTransformProperty(curve.path, true)) values.add(`${curve.path}[${curve.index}]`);
	return values;
}
/** Which bones of an armature an action slot's pose curves name. */
function matchingBones(slot, record) {
	const names = new Set(record.armature?.bones.map((bone) => bone.name) ?? []);
	let count = 0;
	for (const curve of slot.curves) {
		const pose = parsePosePath(curve.path);
		if (pose && names.has(pose.bone)) count++;
	}
	return count;
}
function shapeKeysOf(scene) {
	return scene.meshRecords.flatMap((mesh) => {
		const key = shapeKeyOwner(mesh);
		return key ? [{
			mesh,
			key
		}] : [];
	});
}
function outsideScene(file, scene, shapeKeys) {
	const outside = {
		actions: /* @__PURE__ */ new Set(),
		objects: /* @__PURE__ */ new Set(),
		keys: /* @__PURE__ */ new Set()
	};
	if (!file) return outside;
	const inside = /* @__PURE__ */ new Set([...scene.objects.map((record) => record.object.struct.offset), ...shapeKeys.map(({ key }) => key.offset)]);
	for (const [code, names] of [["OB", outside.objects], ["KE", outside.keys]]) for (const id of datablocks(file, code)) {
		if (inside.has(id.offset)) continue;
		names.add(idName(id));
		for (const use of usedActions(id)) outside.actions.add(use.action.offset);
	}
	return outside;
}
/** The one object whose actions key every object transform value a slot keys, for a slot that keys nothing else. */
function guessedObject(slot, { scene, objectKeys }) {
	const values = objectTransformValues(slot.curves);
	if (values.size === 0 || slot.curves.some((curve) => parsePosePath(curve.path))) return void 0;
	const keying = scene.objects.filter((record) => {
		const keys = objectKeys.get(record);
		return keys !== void 0 && [...values].every((value) => keys.has(value));
	});
	return keying.length === 1 ? keying[0] : void 0;
}
/**
* What a slot of an action nothing uses animates: the shape keys or the object its name names, or failing that, the
* meshes with the shape keys its curves name or the armatures with the most bones they name. A slot that keys only
* object transforms falls back to the one object whose actions key them all. Shape keys the name names count only when
* they have a key its curves name. A slot that names shape keys or an object outside the scene animates nothing.
*/
function guessedTargets(slot, context) {
	const { scene, shapeKeys, outside } = context;
	const prefix = slot.identifier.slice(0, 2);
	const name = slot.identifier.slice(2);
	const keyCurves = slot.curves.some(relevantKeyCurve);
	if (slot.idType === IdCode.shapeKey || prefix === "KE" || slot.idType === 0 && prefix === "" && keyCurves && !slot.curves.some((curve) => parsePosePath(curve.path))) {
		if (outside.keys.has(name) && !shapeKeys.some(({ key }) => idName(key) === name)) return {
			targets: [],
			named: false,
			outside: true
		};
		const names = new Set(slot.curves.flatMap((curve) => parseShapeKeyPath(curve.path) ?? []));
		const keyed = shapeKeys.filter(({ mesh }) => mesh.morphKeys.some((morph) => names.has(morph)));
		const named = name === "" ? [] : keyed.filter(({ key }) => idName(key) === name);
		const matched = named.length > 0 ? named : keyed;
		return {
			targets: matched.length > 0 ? [{
				kind: "shapeKeys",
				meshes: matched.map(({ mesh }) => mesh)
			}] : [],
			named: named.length > 0,
			outside: false
		};
	}
	if (slot.idType !== 0 && slot.idType !== IdCode.object) return {
		targets: [],
		named: false,
		outside: false
	};
	const named = name === "" ? void 0 : scene.objects.find((record) => record.object.name === name);
	if (named) return {
		targets: [{
			kind: "object",
			record: named
		}],
		named: true,
		outside: false
	};
	if (outside.objects.has(name)) return {
		targets: [],
		named: false,
		outside: true
	};
	const scored = scene.objects.filter((record) => record.object.type === ObjectType.armature && record.armature).map((record) => ({
		record,
		score: matchingBones(slot, record)
	}));
	const best = scored.reduce((most, entry) => Math.max(most, entry.score), 0);
	if (best > 0) return {
		targets: scored.flatMap((entry) => entry.score === best ? [{
			kind: "object",
			record: entry.record
		}] : []),
		named: false,
		outside: false
	};
	const guessed = guessedObject(slot, context);
	return {
		targets: guessed ? [{
			kind: "object",
			record: guessed
		}] : [],
		named: false,
		outside: false
	};
}
/**
* What each slot of each action animates: the objects and shape keys whose animation data plays it, each with every
* slot it plays. Where Blender plays the action through a slot, only the uses it plays count; an action it plays
* through none, such as one on muted tracks only, counts with every use. For an action that no animation data in the
* scene uses through a slot, and none outside it uses at all, what `guessedTargets` finds, one slot to an object or
* mesh: a slot named after it before one that only names its bones or keys. An object or mesh that uses the action
* without a slot stays still. An action that nothing in the file uses, that moves what the preview shows and that no
* guess places is lost.
*/
function assignTargets(actions, scene) {
	const assigned = /* @__PURE__ */ new Map();
	const lost = /* @__PURE__ */ new Set();
	const shapeKeys = shapeKeysOf(scene);
	const outside = outsideScene(actions[0]?.struct.file, scene, shapeKeys);
	const uses = [];
	for (const record of scene.objects) for (const use of animationUses(record.object.struct).uses) uses.push({
		...use,
		target: {
			kind: "object",
			record
		}
	});
	for (const { mesh, key } of shapeKeys) for (const use of animationUses(key).uses) uses.push({
		...use,
		target: {
			kind: "shapeKeys",
			meshes: [mesh]
		}
	});
	const byOffset = new Map(actions.map((action) => [action.struct.offset, action]));
	const objectKeys = /* @__PURE__ */ new Map();
	for (const use of uses) {
		const action = byOffset.get(use.action);
		const slot = action ? slotFor(action, use.slot) : void 0;
		if (use.target.kind !== "object" || !slot) continue;
		const values = objectTransformValues(slot.curves);
		if (values.size === 0) continue;
		const keys = objectKeys.get(use.target.record) ?? /* @__PURE__ */ new Set();
		for (const value of values) keys.add(value);
		objectKeys.set(use.target.record, keys);
	}
	const context = {
		scene,
		shapeKeys,
		objectKeys,
		outside
	};
	for (const action of actions) {
		const assignments = [];
		const claimed = /* @__PURE__ */ new Set();
		const claim = (target) => {
			if (target.kind === "object") {
				if (claimed.has(target.record)) return null;
				claimed.add(target.record);
				return target;
			}
			const meshes = target.meshes.filter((mesh) => !claimed.has(mesh));
			for (const mesh of meshes) claimed.add(mesh);
			return meshes.length > 0 ? {
				kind: "shapeKeys",
				meshes
			} : null;
		};
		const own = uses.flatMap((use) => use.action === action.struct.offset ? [{
			...use,
			slot: slotFor(action, use.slot)
		}] : []);
		const plays = own.some((use) => use.played && use.slot);
		for (const { slot, played, target } of own) {
			if (plays && !played) continue;
			if (slot) assignments.push({
				slot,
				target
			});
			else claim(target);
		}
		let elsewhere = outside.actions.has(action.struct.offset);
		if (assignments.length === 0 && !elsewhere) {
			const guesses = action.slots.map((slot) => ({
				slot,
				...guessedTargets(slot, context)
			}));
			elsewhere = guesses.some((guess) => guess.outside);
			for (const named of [true, false]) for (const guess of guesses) {
				if (guess.named !== named) continue;
				for (const target of guess.targets) {
					const free = claim(target);
					if (free) assignments.push({
						slot: guess.slot,
						target: free
					});
				}
			}
		}
		if (assignments.length > 0) assigned.set(action, assignments);
		else if (own.length === 0 && !elsewhere && action.slots.some((slot) => slot.curves.some(shownCurve))) lost.add(action);
	}
	return {
		assigned,
		lost
	};
}
/**
* The property paths that animation plays on each object: those Blender plays now, as `animatedPaths` finds them, and
* the unmuted curves of the slots that `clipped`, the assignments of the clips the reader makes, give the object.
*/
function playedPaths(scene, actions, clipped) {
	const byOffset = new Map(actions.map((action) => [action.struct.offset, action]));
	const paths = new Map(scene.objects.map((record) => [record, animatedPaths(record.object.struct, byOffset)]));
	for (const { slot, target } of clipped.flat()) {
		const played = target.kind === "object" ? paths.get(target.record) : void 0;
		if (!played) continue;
		for (const curve of slot.curves) if (!curve.muted && !curve.empty) played.add(curve.path);
	}
	return paths;
}
function snapTime(seconds, fps) {
	const frames = seconds * fps;
	const whole = Math.round(frames);
	return Math.abs(frames - whole) < SNAP_FRAMES ? whole / fps : seconds;
}
/** The numbers `writeTrs` writes for a transform: its translation, then its rotation, then its scale. */
var TRS_SIZE = 10;
function writeTrs(out, offset, trs) {
	out.set(trs.translation, offset);
	out.set(trs.rotation, offset + 3);
	out.set(trs.scale, offset + 7);
}
/**
* Whether the transform `writeTrs` wrote at `base` of `values` matches `b`: translations and scales within 1e-6, and
* rotations within a dot of 1e-9.
*/
function sameTrsAt(values, base, b) {
	for (let c = 0; c < 3; c++) {
		if (!(Math.abs((values[base + c] ?? 0) - (b.translation[c] ?? 0)) <= 1e-6)) return false;
		if (!(Math.abs((values[base + 7 + c] ?? 0) - (b.scale[c] ?? 0)) <= 1e-6)) return false;
	}
	let dot = 0;
	for (let c = 0; c < 4; c++) dot += (values[base + 3 + c] ?? 0) * (b.rotation[c] ?? 0);
	return Math.abs(dot) > 1 - 1e-9;
}
function sameTrs(a, b) {
	const written = new Float64Array(TRS_SIZE);
	writeTrs(written, 0, a);
	return sameTrsAt(written, 0, b);
}
function near$1(values, a, b, components) {
	for (let c = 0; c < components; c++) if (!(Math.abs((values[a + c] ?? 0) - (values[b + c] ?? 0)) <= HOLD_TOLERANCE)) return false;
	return true;
}
/**
* Whether a value jumps between the one at `probe` and the one at `after`, a sample a moment away, given the one at
* `before` on the other side of the probe: by more than `JUMP_SHARE` of its change over the rest of the segment.
*/
function jumps(values, before, probe, after, components) {
	for (let c = 0; c < components; c++) {
		const at = values[probe + c] ?? 0;
		const last = Math.abs((values[after + c] ?? 0) - at);
		if (last > JUMP_MINIMUM && last > JUMP_SHARE * Math.abs(at - (values[before + c] ?? 0))) return true;
	}
	return false;
}
/** Negates the quaternion at `q` when its negation is nearer the one at `reference`. */
function align(values, q, reference) {
	let dot = 0;
	for (let c = 0; c < 4; c++) dot += (values[q + c] ?? 0) * (values[reference + c] ?? 0);
	if (dot < 0) for (let c = 0; c < 4; c++) values[q + c] = -(values[q + c] ?? 0);
}
function keepScale(values) {
	values.forEach((value, index) => {
		if (Math.abs(value) < MIN_SCALE) values[index] = value < 0 ? -1e-6 : MIN_SCALE;
	});
}
function scratchMatrices() {
	return {
		basis: /* @__PURE__ */ new Float64Array(16),
		local: /* @__PURE__ */ new Float64Array(16),
		scene: /* @__PURE__ */ new Float64Array(16)
	};
}
/**
* A bone's matrix relative to its parent bone's pose: its channel after its rest offset, or, for a bone that does not
* inherit fully, from the armature's poses. It may be `scratch.local`, which the next call overwrites.
*/
function boneLocal(bones, index, channel, poses, scratch) {
	const bone = bones[index];
	if (!bone) return identity();
	if (poses && !inheritsFully(bone)) {
		const pose = poses[index] ?? bone.rest;
		const parentPose = poses[bone.parent];
		return parentPose ? multiply(invert(parentPose), pose) : pose;
	}
	if (!channel) return bone.offset;
	const connected = (bone.flag & BoneFlag.connected) !== 0;
	return multiply(bone.offset, channelMatrix(channel, connected, scratch.basis), scratch.local);
}
/**
* The pose an armature's actions start from: the pose Blender shows at the scene's start frame, or, for an armature set
* to its rest position, the rest pose in each channel's rotation mode.
*/
function savedPose(armature, atRest, restTrs, unitScale) {
	const channels = armature.pose.map((values) => {
		const copy = atRest ? {
			...restChannel(),
			rotationMode: values.rotationMode
		} : cloneValues(values);
		keepScale(copy.scale);
		return copy;
	});
	const poses = armature.bones.some((bone) => !inheritsFully(bone)) ? poseMatrices(armature.bones, channels) : null;
	const moved = /* @__PURE__ */ new Map();
	const sheared = /* @__PURE__ */ new Map();
	const scratch = scratchMatrices();
	armature.bones.forEach((bone, index) => {
		const node = armature.nodes[index];
		const rest = node === void 0 ? void 0 : restTrs[node];
		if (node === void 0 || !rest) return;
		const local = boneLocal(armature.bones, index, channels[index], poses, scratch);
		const trs = decompose(toSceneAxes(local, unitScale, scratch.scene));
		if (sameTrs(trs, rest)) return;
		moved.set(node, trs);
		if (poses && !inheritsFully(bone) && shearOf(local) > 1e-4) sheared.set(node, bone.name);
	});
	return {
		channels,
		moved,
		sheared
	};
}
/**
* Every whole frame of a clip from its start, its end, and the frames between where a curve or a use may jump. `late`
* when a curve may jump too soon after one of those frames to sample on its own. Only the whole frames and the end,
* with `dropped`, when the frames between would take the clip past `MAX_FRAMES`. `curves` play at the clip's clock,
* which runs from `origin` to `end` at `rate` a frame, and `breaks` are the clock times where uses may jump.
*/
function samplePoints({ origin, end, rate }, span, whole, curves, breaks) {
	const points = [];
	for (let k = 0; k <= whole; k++) points.push({
		frame: k,
		clock: origin + k * rate
	});
	if (span - whole > 1e-6) points.push({
		frame: span,
		clock: end
	});
	const between = /* @__PURE__ */ new Map();
	let late = false;
	const addWithinLimit = (clocks) => {
		if (clocks === null) return false;
		for (const clock of clocks) {
			const frame = (clock - origin) / rate;
			const fraction = frame - Math.round(frame);
			if (Math.abs(fraction) >= SNAP_FRAMES && Math.abs(span - frame) >= SNAP_FRAMES) between.set(clock, {
				frame,
				clock
			});
			else if (fraction > 0 && fraction < SNAP_FRAMES) late = true;
		}
		return whole + between.size <= MAX_FRAMES;
	};
	if (!(curves.every((curve) => addWithinLimit(jumpFrames(curve, origin, end, MAX_FRAMES))) && addWithinLimit(breaks))) return {
		points,
		late: false,
		dropped: true
	};
	if (between.size === 0) return {
		points,
		late,
		dropped: false
	};
	const all = [...points, ...between.values()].sort((a, b) => a.frame - b.frame);
	const kept = all.filter((point, index) => index === 0 || point.frame - (all[index - 1]?.frame ?? 0) >= SNAP_FRAMES);
	return {
		points: kept,
		late: late || kept.length < all.length,
		dropped: false
	};
}
/**
* For each segment between two samples, a time just after its first sample when a value can jump right after a
* frame, and a time just before its last when one can jump at a frame; null where the samples are too close. Both
* in the segments of `nearBreaks`, where a use may jump.
*/
function edgeTimes(times, fps, leads, holds, nearBreaks) {
	const gap = (time) => Math.max(HOLD_FRAMES / fps, 1e-5, Math.abs(time) * 2 ** -20);
	const edges = [];
	if (!leads && !holds && nearBreaks.size === 0) return edges;
	for (let k = 0; k + 1 < times.length; k++) {
		const from = times[k] ?? 0;
		const to = times[k + 1] ?? 0;
		const both = nearBreaks.has(k);
		const holdTime = Math.fround(to - gap(to));
		const hold = (holds || both) && holdTime > from ? holdTime : null;
		const leadTime = Math.fround(from + gap(from));
		const lead = (leads || both) && leadTime < (hold ?? to) ? leadTime : null;
		edges.push({
			lead,
			hold
		});
	}
	return edges;
}
/** The segments between sample points next to each of the clock times `breaks`: the one around it and its neighbors. */
function segmentsNear(points, breaks, { origin, rate }) {
	const segments = /* @__PURE__ */ new Set();
	for (const clock of breaks) {
		const frame = (clock - origin) / rate;
		let low = 0;
		let high = points.length - 1;
		while (low < high) {
			const middle = low + high + 1 >> 1;
			if ((points[middle]?.frame ?? 0) <= frame) low = middle;
			else high = middle - 1;
		}
		for (const segment of [
			low - 1,
			low,
			low + 1
		]) if (segment >= 0 && segment + 1 < points.length) segments.add(segment);
	}
	return segments;
}
/** The values a clip sets, by owner, each value once, in the order the owners' animation data lists their sources. */
var Channels = class {
	objects = /* @__PURE__ */ new Map();
	meshes = /* @__PURE__ */ new Map();
	/** Adds the curves of a slot that its target shows, played by `player`; whether there were any. */
	addSlot(slot, target, player) {
		let added = false;
		const curves = slot.curves.filter((curve) => !curve.empty);
		if (target.kind === "object") {
			for (const curve of curves) if (relevantObjectCurve(curve, target.record)) added = this.#add(this.objects, target.record, curve, player);
			return added;
		}
		const keyCurves = curves.filter(relevantKeyCurve);
		for (const mesh of target.meshes) {
			if (mesh.shapeKeyLock) continue;
			for (const curve of keyCurves) if (mesh.morphKeys.includes(parseShapeKeyPath(curve.path) ?? "")) added = this.#add(this.meshes, mesh, curve, player);
		}
		return added;
	}
	#add(owners, owner, curve, player) {
		let channels = owners.get(owner);
		if (!channels) {
			channels = /* @__PURE__ */ new Map();
			owners.set(owner, channels);
		}
		const key = `${curve.path}[${curve.index}]`;
		let channel = channels.get(key);
		if (!channel) {
			channel = {
				path: curve.path,
				index: curve.index,
				sources: [],
				fallback: nlaDefault(curve.path, curve.index)
			};
			channels.set(key, channel);
		}
		if (channel.sources[channel.sources.length - 1]?.player !== player) channel.sources.push({
			curve,
			player
		});
		return true;
	}
};
/**
* The clip of an action: its slots on what they animate, over the action's frame range, a frame of the scene to each
* `framelen` of the action's frames, as the scene's time remapping plays it.
*/
function actionPlan(action, assignments, scene) {
	const channels = new Channels();
	for (const { slot, target } of assignments) channels.addSlot(slot, target, 0);
	const [start, end] = actionRange(action);
	const rate = scene.timeline.frameLength;
	return {
		name: action.name,
		players: [DIRECT],
		channels,
		played: [...assignments],
		actions: [action],
		origin: start,
		end,
		rate,
		fileFrames: {
			start,
			step: rate
		}
	};
}
/**
* The clip of the scene's timeline: every use of an action that Blender plays, together, over the scene's frame range,
* each where its NLA strip or extrapolation puts it. Null unless uses of more than one action move what it shows, and
* null with a warning where NLA meta strips nest deeper than the players follow.
*/
function scenePlan(scene, actions, warnings) {
	const byOffset = new Map(actions.map((action) => [action.struct.offset, action]));
	const tracks = new NlaTracks();
	const players = [DIRECT];
	const channels = new Channels();
	const played = [];
	const playing = /* @__PURE__ */ new Set();
	const play = (id, target) => {
		for (const use of usedActions(id)) {
			const action = use.played ? byOffset.get(use.action.offset) : void 0;
			const slot = action ? slotFor(action, use.slot) : void 0;
			if (!action || !slot) continue;
			const player = scenePlayer(id, use, action, tracks);
			const index = player === DIRECT ? 0 : players.push(player) - 1;
			if (channels.addSlot(slot, target, index)) playing.add(action);
			played.push({
				slot,
				target
			});
		}
	};
	for (const record of scene.objects) play(record.object.struct, {
		kind: "object",
		record
	});
	for (const { mesh, key } of shapeKeysOf(scene)) play(key, {
		kind: "shapeKeys",
		meshes: [mesh]
	});
	if (playing.size < 2) return null;
	const { name, start, end, frameLength } = scene.timeline;
	if (tracks.tooDeep) {
		warnings.push({
			code: "clip-not-sampled",
			subject: {
				kind: "clip",
				name
			},
			message: `Clip not sampled: ${name}`,
			detail: `Its NLA meta strips nest more than 64 deep`
		});
		return null;
	}
	return {
		name,
		players,
		channels,
		played,
		actions: [...playing],
		origin: start * frameLength,
		end: (end > start ? end : start + 1) * frameLength,
		rate: frameLength,
		fileFrames: {
			start,
			step: 1
		}
	};
}
/** The first `needed` values of the clip scene's sample buffer, which grows to hold them. */
function sampleBuffer(clipScene, needed) {
	if (clipScene.buffer.length < needed) {
		clipScene.buffer = /* @__PURE__ */ new Float64Array(0);
		const grown = Math.min(clipScene.clipLimit, 2 ** Math.ceil(Math.log2(needed)));
		clipScene.buffer = new Float64Array(Math.max(needed, grown));
	}
	return clipScene.buffer.subarray(0, needed);
}
function bind(record, channels, slots) {
	const boneIndex = new Map(record.armature?.bones.map((bone, index) => [bone.name, index]) ?? []);
	const boneSettings = /* @__PURE__ */ new Map();
	const objectSettings = [];
	for (const channel of channels) {
		const setting = {
			path: channel.path,
			index: channel.index,
			slot: slots.get(channel) ?? -1
		};
		const pose = parsePosePath(channel.path);
		if (!pose) {
			objectSettings.push(setting);
			continue;
		}
		const index = boneIndex.get(pose.bone);
		if (index === void 0) continue;
		const list = boneSettings.get(index) ?? [];
		list.push({
			...setting,
			property: pose.property
		});
		boneSettings.set(index, list);
	}
	const bones = record.armature?.bones ?? [];
	const sampled = bones.flatMap((bone, index) => boneSettings.has(index) || !inheritsFully(bone) ? [index] : []);
	return {
		record,
		objectSettings,
		boneSettings,
		sampled,
		needsPoses: sampled.some((index) => {
			const bone = bones[index];
			return bone !== void 0 && !inheritsFully(bone);
		})
	};
}
/** A copy of transform values that each sample changes, after `reset` copies the values' arrays into it again. */
function scratchValues(values) {
	const copy = cloneValues(values);
	const arrays = Object.entries(values).flatMap(([key, from]) => {
		const to = copy[key];
		return Array.isArray(from) && Array.isArray(to) ? [{
			from,
			to
		}] : [];
	});
	const reset = () => {
		for (const { from, to } of arrays) for (let i = 0; i < from.length; i++) to[i] = from[i] ?? 0;
	};
	return {
		copy,
		reset
	};
}
/**
* The bones whose poses a bone that does not inherit fully needs, its ancestors and itself, as a bone list of their
* own with each bone's parent among them, and their places in the armature.
*/
function poseChain(bones, sampled) {
	const needed = /* @__PURE__ */ new Set();
	for (const index of sampled) {
		const bone = bones[index];
		if (!bone || inheritsFully(bone)) continue;
		for (let at = index; at >= 0 && !needed.has(at); at = bones[at]?.parent ?? -1) needed.add(at);
	}
	const indices = [...needed].sort((a, b) => a - b);
	const place = new Map(indices.map((index, position) => [index, position]));
	return {
		bones: indices.flatMap((index) => {
			const bone = bones[index];
			return bone ? [{
				...bone,
				parent: place.get(bone.parent) ?? -1
			}] : [];
		}),
		indices
	};
}
function sampler(bindings, keyTargets, clipScene) {
	const { scene, saved } = clipScene;
	const scratch = scratchMatrices();
	const layout = {
		nodes: [],
		meshes: [],
		size: 0
	};
	const place = (node) => {
		layout.nodes.push({
			node,
			offset: layout.size
		});
		layout.size += TRS_SIZE;
		return layout.size - TRS_SIZE;
	};
	const objects = bindings.map((binding) => {
		const { record, objectSettings, boneSettings, sampled, needsPoses } = binding;
		const own = objectSettings.length > 0 ? {
			offset: place(record.node),
			transform: scratchValues(record.values),
			parent: multiply(record.parentPart, record.parentInverse)
		} : null;
		const armature = record.armature;
		const pose = saved.get(record);
		if (!armature || !pose || boneSettings.size === 0) return {
			binding,
			own,
			posed: null
		};
		const channels = [...pose.channels];
		const keyed = [...boneSettings].map(([index, list]) => {
			const values = scratchValues(pose.channels[index] ?? restChannel());
			channels[index] = values.copy;
			return {
				values,
				list
			};
		});
		const bones = sampled.flatMap((index) => {
			const bone = armature.bones[index];
			const node = armature.nodes[index];
			return bone && node !== void 0 ? [{
				index,
				bone,
				offset: place(node)
			}] : [];
		});
		const chain = needsPoses ? poseChain(armature.bones, sampled) : null;
		return {
			binding,
			own,
			posed: {
				armature,
				channels,
				keyed,
				bones,
				chain,
				chainChannels: chain?.indices.map((index) => channels[index] ?? restChannel()) ?? [],
				poses: []
			}
		};
	});
	const meshes = keyTargets.map(({ mesh, settings }) => {
		const offset = layout.size;
		const components = mesh.morphDefaults.length;
		layout.meshes.push({
			mesh,
			offset,
			components
		});
		layout.size += components;
		return {
			mesh,
			offset,
			keyed: settings.map(({ path, slot }) => {
				const index = mesh.morphKeys.indexOf(parseShapeKeyPath(path) ?? "");
				return {
					index,
					range: mesh.morphRanges[index] ?? [0, 1],
					slot
				};
			})
		};
	});
	const sample = (values, out, base, sheared) => {
		for (const { binding, own, posed } of objects) {
			const { record, objectSettings } = binding;
			if (own) {
				own.transform.reset();
				const transform = own.transform.copy;
				for (const { path, index, slot } of objectSettings) setTransformProperty(transform, path, index, values[slot] ?? 0);
				keepScale(transform.scale);
				keepScale(transform.deltaScale);
				const local = multiply(own.parent, objectBasis(transform, scratch.basis), scratch.local);
				if (shearOf(local) > 1e-4) sheared.objects.add(record.object.name);
				writeTrs(out, base + own.offset, decompose(toSceneAxes(local, scene.unitScale, scratch.scene)));
			}
			if (!posed) continue;
			const { armature, channels, keyed, bones, chain, chainChannels, poses } = posed;
			for (const { values: channel, list } of keyed) {
				channel.reset();
				for (const { property, index, slot } of list) setTransformProperty(channel.copy, property, index, values[slot] ?? 0);
				keepScale(channel.copy.scale);
			}
			if (chain) {
				const chainPoses = poseMatrices(chain.bones, chainChannels);
				chain.indices.forEach((index, position) => {
					poses[index] = chainPoses[position];
				});
			}
			for (const { index, bone, offset } of bones) {
				const local = boneLocal(armature.bones, index, channels[index], chain ? poses : null, scratch);
				if (chain && !inheritsFully(bone) && shearOf(local) > 1e-4) sheared.bones.add(bone.name);
				writeTrs(out, base + offset, decompose(toSceneAxes(local, scene.unitScale, scratch.scene)));
			}
		}
		for (const { mesh, offset, keyed } of meshes) {
			out.set(mesh.morphDefaults, base + offset);
			for (const { index, range, slot } of keyed) if (index >= 0) out[base + offset + index] = Math.min(Math.max(values[slot] ?? 0, range[0]), range[1]);
		}
	};
	return {
		layout,
		sample
	};
}
/** Whether every sample of the node at `offset`, at each time and edge time, is its rest transform. */
function resting(samples, edges, offset, rest) {
	const { values, count, after, before } = samples;
	const at = (row) => row * samples.layout.size + offset;
	for (let k = 0; k < count; k++) if (!sameTrsAt(values, at(k), rest)) return false;
	return edges.every((edge, k) => (edge.lead === null || sameTrsAt(values, at(after[k] ?? k), rest)) && (edge.hold === null || sameTrsAt(values, at(before[k] ?? k), rest)));
}
/**
* A track from the `components` numbers at `offset` of each sample, keyed at `times`. A track whose every segment
* holds its first value until its end steps; any other keeps the values on either side of each jump. A track whose
* keys all hold one value has one key at `zero`. Times are `times` itself wherever the track keys only them. Null
* when its values and its own times would pass `room`.
*/
function sampledTrack(node, property, times, edges, samples, offset, components, zero, room) {
	if (components === 0) return null;
	const { values, count, after, before } = samples;
	const at = (row) => row * samples.layout.size + offset;
	const leadRow = (k) => at(after[k] ?? k);
	const holdRow = (k) => at(before[k] ?? k);
	if (property === "rotation") {
		for (let k = 1; k < count; k++) align(values, at(k), at(k - 1));
		edges.forEach((edge, k) => {
			if (edge.lead !== null) align(values, leadRow(k), at(k));
			if (edge.hold !== null) align(values, holdRow(k), at(k));
		});
	}
	const steps = edges.length > 0 && edges.every((edge, k) => edge.hold !== null && near$1(values, holdRow(k), at(k), components) && (edge.lead === null || near$1(values, leadRow(k), at(k), components)));
	const flags = new Uint8Array(steps ? 0 : edges.length);
	let keys = count;
	for (let k = 0; k < flags.length && k + 1 < count; k++) {
		const edge = edges[k];
		if (!edge) continue;
		let from = at(k);
		if (edge.lead !== null && jumps(values, at(k + 1), leadRow(k), at(k), components)) {
			flags[k] = LEAD_KEY;
			from = leadRow(k);
			keys++;
		}
		if (edge.hold !== null && jumps(values, from, holdRow(k), at(k + 1), components)) {
			flags[k] = (flags[k] ?? 0) | HOLD_KEY;
			keys++;
		}
	}
	const eachKey = (visit) => {
		for (let k = 0; k < count; k++) {
			visit(at(k), times[k] ?? 0);
			const flag = flags[k] ?? 0;
			const edge = edges[k];
			if (!edge) continue;
			if (flag & LEAD_KEY && edge.lead !== null) visit(leadRow(k), edge.lead);
			if (flag & HOLD_KEY && edge.hold !== null) visit(holdRow(k), edge.hold);
		}
	};
	const first = at(0);
	let constant = true;
	eachKey((base) => {
		for (let c = 0; c < components && constant; c++) constant = Math.fround(values[base + c] ?? 0) === Math.fround(values[first + c] ?? 0);
	});
	if (constant) {
		if (components > room) return null;
		return {
			node,
			property,
			interpolation: "linear",
			times: zero,
			values: Float32Array.from({ length: components }, (_, c) => values[first + c] ?? 0)
		};
	}
	if (keys * components + (keys === count ? 0 : keys) > room) return null;
	const keyTimes = keys === count ? times : new Float32Array(keys);
	const stored = new Float32Array(keys * components);
	let key = 0;
	eachKey((base, time) => {
		if (keyTimes !== times) keyTimes[key] = time;
		for (let c = 0; c < components; c++) stored[key * components + c] = values[base + c] ?? 0;
		key++;
	});
	return {
		node,
		property,
		interpolation: steps ? "step" : "linear",
		times: keyTimes,
		values: stored
	};
}
/**
* The tracks of the sampled nodes that move from rest and of the sampled morph weights, then one-key tracks for the
* bones that the saved pose of an armature the clip animates moves and that the clip does not sample, and the values
* they keep: their values and times, each array of times once. Null once those pass `room`.
*/
function clipTracks(samples, edges, times, clipScene, armatures, sheared, room) {
	const { restTrs, saved } = clipScene;
	const zero = Float32Array.of(0);
	const tracks = [];
	const keptTimes = /* @__PURE__ */ new Set();
	let kept = 0;
	const keep = (track) => {
		if (!track) return false;
		tracks.push(track);
		kept += track.values.length;
		if (!keptTimes.has(track.times)) {
			keptTimes.add(track.times);
			kept += track.times.length;
		}
		return kept <= room;
	};
	const sampledNodes = /* @__PURE__ */ new Set();
	for (const { node, offset } of samples.layout.nodes) {
		sampledNodes.add(node);
		const rest = restTrs[node];
		if (rest && resting(samples, edges, offset, rest)) continue;
		for (const [property, at, components] of [
			[
				"translation",
				0,
				3
			],
			[
				"rotation",
				3,
				4
			],
			[
				"scale",
				7,
				3
			]
		]) if (!keep(sampledTrack(node, property, times, edges, samples, offset + at, components, zero, room - kept))) return null;
	}
	for (const record of armatures) {
		const pose = saved.get(record);
		for (const [node, trs] of pose?.moved ?? []) {
			if (sampledNodes.has(node)) continue;
			const name = pose?.sheared.get(node);
			if (name !== void 0) sheared.bones.add(name);
			for (const property of TRANSFORM_PROPERTIES) if (!keep({
				node,
				property,
				interpolation: "linear",
				times: zero,
				values: Float32Array.from(trs[property]),
				held: true
			})) return null;
		}
	}
	for (const { mesh, offset, components } of samples.layout.meshes) {
		if (components === 0) continue;
		if (!keep(sampledTrack(mesh.node, "weights", times, edges, samples, offset, components, zero, room - kept))) return null;
	}
	return {
		tracks: tracks.sort((a, b) => a.node - b.node),
		kept
	};
}
/** The detail of a clip's warning about what shears, naming the bones and objects. */
function shearDetail({ bones, objects }) {
	const parts = [];
	if (bones.size > 0) parts.push(`These bones shear under their parents' scale, which the preview drops: ${[...bones].join(", ")}`);
	if (objects.size > 0) {
		const names = [...objects].join(", ");
		parts.push(`These objects shear under the scale they were parented with, which the preview drops: ${names}`);
	}
	return parts.join("; ");
}
/** Warnings for what a clip plays other than Blender does. */
function approximationWarnings(plan, curves, warn) {
	const keysRotationModes = plan.actions.some((action) => action.slots.some((slot) => slot.curves.some(keysRotationMode)));
	if (plan.channels.objects.size > 0 && keysRotationModes) warn("deform-approximated", "Rotation mode changes not followed", "Keys on rotation mode are left out; each object and bone keeps the mode it was saved with");
	const unsupported = new Set(curves.flatMap((curve) => curve.unsupportedModifiers));
	if (unsupported.size > 0) warn("curve-modifier-not-applied", "Curve modifiers not applied", [...unsupported].join(", "));
	const layered = plan.actions.filter((action) => action.layers > 1);
	const [only] = layered;
	if (only) warn("action-layer-not-played", "Only the first layer played", plan.actions.length === 1 ? `The action has ${only.layers} layers` : `These actions have more than one layer: ${layered.map((action) => action.name).join(", ")}`);
	if (plan.players.some((player) => player.blends)) warn("deform-approximated", "NLA blending not followed", "The preview plays each NLA strip and action in full over what plays under it");
}
/**
* When a clip samples its sources: one time per frame, the times between where a curve or a use jumps, and the edge
* times around jumps. Null, with a warning, for a clip longer than `MAX_FRAMES`.
*/
function clipTiming(plan, sources, fps, warn) {
	const { players, origin, end, rate } = plan;
	const span = (end - origin) / rate;
	const whole = Math.floor(span + 1e-6);
	if (whole > MAX_FRAMES) {
		warn("clip-not-sampled", "Clip not sampled", `It spans ${whole} frames, more than ${MAX_FRAMES}`);
		return null;
	}
	const direct = (source) => players[source.player]?.direct ?? false;
	const directCurves = [...new Set(sources.filter(direct).map((source) => source.curve))];
	const nlaCurves = [...new Set(sources.filter((source) => !direct(source)).map((source) => source.curve))];
	const found = /* @__PURE__ */ new Set();
	let breaksEverywhere = false;
	for (const breaksOf of new Set(players.map((player) => player.breaks))) {
		if (found.size > MAX_FRAMES) break;
		const times = breaksOf(origin, end, MAX_FRAMES);
		if (times) for (const time of times) found.add(time);
		else breaksEverywhere = true;
	}
	const breaks = [...found];
	const { points, late, dropped } = samplePoints(plan, span, whole, directCurves, breaks);
	if (dropped) warn("deform-approximated", "Jumps between frames not shown", `Sampling them would take more than ${MAX_FRAMES} frames, so the preview samples whole frames`);
	const times = Float32Array.from(points, (point) => snapTime(point.frame / fps, fps));
	const duration = snapTime(span / fps, fps);
	const anywhere = (jumpsWithin) => breaksEverywhere || directCurves.some((curve) => jumpsWithin(curve, origin, end)) || nlaCurves.some((curve) => jumpsWithin(curve, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY));
	const nearBreaks = segmentsNear(points, breaks, plan);
	return {
		points,
		times,
		edges: edgeTimes(times, fps, late || anywhere(canJumpAfter), anywhere(canJump), nearBreaks),
		duration
	};
}
/** A channel's sources in order, in runs: those whose players share a lane, and so never play at once, together. */
function sourceRuns(sources, players) {
	const runs = [];
	for (const source of sources) {
		const lane = players[source.player]?.lane ?? null;
		const last = runs[runs.length - 1];
		if (lane && last?.lane === lane) last.sources.push(source);
		else runs.push({
			lane,
			sources: [source]
		});
	}
	return runs;
}
/**
* The key times of each of `channels` in seconds from the clip's start: where each of its sources has a key while no
* source before it plays, each time once. Null when there are more than `limit` of them together.
*/
function channelKeyTimes(plan, channels, duration, fps, limit) {
	const { players, origin, end, rate } = plan;
	const tolerance = .25 / fps;
	const clip = [Math.min(origin, end) - rate, Math.max(origin, end) + rate];
	const all = [];
	let left = limit;
	for (const channel of channels) {
		let times = [];
		let covered = [];
		for (const run of sourceRuns(channel.sources, players)) {
			const played = [];
			for (const { curve, player: index } of run.sources) {
				const player = players[index];
				if (!player) continue;
				for (const span of player.spans) played.push(span);
				const within = withoutSpans(clampSpans(player.spans, clip), covered);
				if (within.length === 0) continue;
				for (const clock of player.timesOf(keyFrames(curve), within, left - times.length + 1)) {
					const time = snapTime((clock - origin) / rate / fps, fps);
					if (time >= -tolerance && time <= duration + tolerance) times.push(time);
				}
				if (times.length > left) return null;
			}
			covered = joinSpans(covered, played);
		}
		if (channel.sources.length > 1) times = times.sort((a, b) => a - b).filter((time, index, sorted) => index === 0 || time !== sorted[index - 1]);
		if (times.length === 0) continue;
		all.push(Float32Array.from(times));
		left -= times.length;
	}
	return all;
}
/**
* Writes the values of `channels` at a clock time into an array: each from the first of its sources whose use plays
* then, or else its fallback. A run of sources on one NLA track asks the track once which of them plays.
*/
function channelEvaluator(channels, players) {
	const evaluators = /* @__PURE__ */ new Map();
	const evaluator = (curve) => {
		let valueAt = evaluators.get(curve);
		if (!valueAt) {
			valueAt = curveEvaluator(curve);
			evaluators.set(curve, valueAt);
		}
		return valueAt;
	};
	const compiled = channels.map((channel) => ({
		fallback: channel.fallback,
		runs: sourceRuns(channel.sources, players).map(({ lane, sources }) => {
			const evaluated = sources.map(({ curve, player }) => ({
				player,
				valueAt: evaluator(curve)
			}));
			const byPlayer = /* @__PURE__ */ new Map();
			for (const source of evaluated) {
				const player = players[source.player];
				if (player) byPlayer.set(player, source);
			}
			return {
				lane,
				first: evaluated[0],
				byPlayer
			};
		})
	}));
	const playerFrames = new Float64Array(players.length);
	const askedAt = new Uint32Array(players.length);
	let asking = 0;
	const frameOf = (player, clock) => {
		if (askedAt[player] !== asking) {
			askedAt[player] = asking;
			playerFrames[player] = players[player]?.frameAt(clock) ?? NaN;
		}
		return playerFrames[player] ?? NaN;
	};
	return (clock, values) => {
		asking = asking % 4294967295 + 1;
		for (let index = 0; index < compiled.length; index++) {
			const channel = compiled[index];
			if (!channel) continue;
			let value = channel.fallback;
			for (const { lane, first, byPlayer } of channel.runs) {
				const playing = lane?.playing(clock);
				const source = lane ? playing ? byPlayer.get(playing) : void 0 : first;
				const frame = source ? frameOf(source.player, clock) : NaN;
				if (source && !Number.isNaN(frame)) {
					value = source.valueAt(frame);
					break;
				}
			}
			values[index] = value;
		}
	};
}
/**
* Samples a clip, one key per frame, with keys on either side of the jumps of stepped and cycled curves and of NLA
* strips. Bones start from the pose Blender shows at the scene's start frame, and a clip that animates an armature
* shows that pose on the bones it does not key, as Blender does with only that clip's uses playing. Null, with a
* warning, for a clip whose samples would pass the clip limit or what the file's clips have left to sample, or whose
* tracks and key times would pass what they have left to keep.
*/
function buildClip(plan, clipScene) {
	const { scene, warnings } = clipScene;
	const warn = (code, message, detail) => warnings.push({
		code,
		subject: {
			kind: "clip",
			name: plan.name
		},
		message: `${message}: ${plan.name}`,
		detail
	});
	if (plan.played.some(({ slot, target }) => target.kind === "object" && slot.curves.some(keysHideViewport))) warn("deform-approximated", "Visibility changes not shown", "Keys on Disable in Viewports are left out; each object stays as the file saves it");
	const { objects, meshes } = plan.channels;
	if (objects.size === 0 && meshes.size === 0) return null;
	const channels = [...[...objects.values()], ...[...meshes.values()]].flatMap((owned) => [...owned.values()]);
	const sources = channels.flatMap((channel) => channel.sources);
	approximationWarnings(plan, [...new Set(sources.map((source) => source.curve))], warn);
	const fps = scene.fps;
	const timing = clipTiming(plan, sources, fps, warn);
	if (!timing) return null;
	const { points, times, edges } = timing;
	const { clipLimit, left } = clipScene;
	const curveTimes = channelKeyTimes(plan, channels, timing.duration, fps, left.kept);
	if (!curveTimes) {
		warn("clip-not-sampled", "Clip not sampled", `Its keys take more than the ${left.kept} values left for this file's clips`);
		return null;
	}
	const slots = new Map(channels.map((channel, index) => [channel, index]));
	const bindings = [...objects].map(([record, owned]) => bind(record, owned.values(), slots));
	const { layout, sample } = sampler(bindings, [...meshes].map(([mesh, owned]) => ({
		mesh,
		settings: [...owned.values()].map((channel) => ({
			path: channel.path,
			index: channel.index,
			slot: slots.get(channel) ?? -1
		}))
	})), clipScene);
	const count = points.length;
	const needed = edges.reduce((total, edge) => total + (edge.lead === null ? 0 : 1) + (edge.hold === null ? 0 : 1), count) * layout.size;
	if (needed > clipLimit || needed > left.sampled) {
		warn("clip-not-sampled", "Clip not sampled", needed > clipLimit ? `Sampling it takes ${needed} values, more than ${clipLimit}` : `Sampling it takes ${needed} values, more than the ${left.sampled} left for this file's clips`);
		return null;
	}
	left.sampled -= needed;
	const evaluate = channelEvaluator(channels, plan.players);
	const size = layout.size;
	const samples = {
		layout,
		count,
		values: sampleBuffer(clipScene, needed),
		after: new Int32Array(edges.length).fill(-1),
		before: new Int32Array(edges.length).fill(-1)
	};
	const frameValues = new Float64Array(channels.length);
	const edgeValues = new Float64Array(channels.length);
	const sheared = {
		bones: /* @__PURE__ */ new Set(),
		objects: /* @__PURE__ */ new Set()
	};
	let nextRow = count;
	const edgeRow = (time, k) => {
		if (time === null) return -1;
		evaluate(plan.origin + time * fps * plan.rate, edgeValues);
		if (edgeValues.every((value, index) => value === frameValues[index])) return k;
		const row = nextRow++;
		sample(edgeValues, samples.values, row * size, sheared);
		return row;
	};
	points.forEach((point, k) => {
		evaluate(point.clock, frameValues);
		sample(frameValues, samples.values, k * size, sheared);
		const edge = edges[k];
		if (!edge) return;
		samples.after[k] = edgeRow(edge.lead, k);
		samples.before[k] = edgeRow(edge.hold, k);
	});
	const armatures = bindings.flatMap(({ record }) => record.armature ? [record] : []);
	const keys = curveTimes.reduce((total, array) => total + array.length, 0);
	const made = clipTracks(samples, edges, times, clipScene, armatures, sheared, left.kept - keys);
	if (!made) {
		warn("clip-not-sampled", "Clip not sampled", `It keeps more than the ${left.kept} values left for this file's clips`);
		return null;
	}
	const { tracks } = made;
	left.kept -= keys + made.kept;
	if (sheared.bones.size > 0 || sheared.objects.size > 0) warn("deform-approximated", "Shear not shown", shearDetail(sheared));
	return {
		name: plan.name,
		duration: timing.duration,
		curveTimes,
		tracks,
		fileFrames: plan.fileFrames
	};
}
/**
* The clips of the actions that animate the scene, then, where the scene plays more than one action, a clip named
* after the scene that plays them together over its frame range. A clip that would pass `limits` is left out with a
* warning, as is an action that nothing plays and that `assignTargets` places nowhere. It also warns about the
* constraints Blender evaluates where the scene's animation or one of these clips plays, which the preview does not.
*/
function buildClips$1(scene, actions, warnings, limits = {}) {
	const { assigned, lost } = assignTargets(actions, scene);
	const restTrs = scene.nodes.map((node) => decompose(toSceneAxes(node.rest, scene.unitScale)));
	const saved = /* @__PURE__ */ new Map();
	for (const record of scene.objects) if (record.armature) saved.set(record, savedPose(record.armature, inRestPosition(record), restTrs, scene.unitScale));
	const { clip: clipLimit, sampled, kept } = {
		...CLIP_LIMITS,
		...limits
	};
	const clipScene = {
		scene,
		restTrs,
		saved,
		warnings,
		clipLimit,
		left: {
			sampled,
			kept
		},
		buffer: /* @__PURE__ */ new Float64Array(0)
	};
	const clips = [];
	const clipped = [];
	for (const action of actions) {
		const assignments = assigned.get(action);
		const clip = assignments ? buildClip(actionPlan(action, assignments, scene), clipScene) : null;
		if (clip) clips.push(clip);
		if (clip && assignments) clipped.push(assignments);
		if (lost.has(action)) warnings.push({
			code: "clip-not-sampled",
			subject: {
				kind: "clip",
				name: action.name
			},
			message: `Clip not shown: ${action.name}`,
			detail: "Nothing in the scene plays this action, and its curves do not say which object they move"
		});
	}
	for (const warning of constraintWarnings(scene.objects, playedPaths(scene, actions, clipped))) warnings.push(warning);
	const together = scenePlan(scene, actions, warnings);
	const clip = together ? buildClip(together, clipScene) : null;
	if (clip) clips.push(clip);
	return clips;
}
/** Warnings for drivers that move what the scene shows: object and bone transforms and shape key values. */
function driverWarnings(scene) {
	const warnings = [];
	for (const record of scene.objects) {
		const drivers = animationUses(record.object.struct).drivers.filter((curve) => relevantObjectCurve(curve, record));
		if (drivers.length > 0) warnings.push({
			code: "driver-not-evaluated",
			subject: {
				kind: "node",
				name: record.object.name
			},
			message: `Drivers not evaluated: ${record.object.name}`,
			detail: [...new Set(drivers.map((curve) => curve.path))].join(", ")
		});
	}
	for (const mesh of scene.meshRecords) {
		const key = shapeKeyOwner(mesh);
		if (!key || mesh.shapeKeyLock) continue;
		const drivers = animationUses(key).drivers.filter(relevantKeyCurve);
		if (drivers.length > 0) warnings.push({
			code: "driver-not-evaluated",
			subject: {
				kind: "node",
				name: mesh.object.name
			},
			message: `Shape key drivers not evaluated: ${mesh.object.name}`,
			detail: drivers.map((curve) => parseShapeKeyPath(curve.path) ?? curve.path).join(", ")
		});
	}
	return warnings;
}
//#endregion
//#region ../../packages/blend/src/anim/skin-motion.ts
var TOLERANCE = 1e-4;
/** Float32 rounding relative to a value's size, which far from the origin exceeds `TOLERANCE`. */
var FLOAT32_ROUNDING = 2 ** -23;
var IDENTITY = identity();
/** The node and its ancestors, the node first. */
function lineage(scene, node) {
	const result = [];
	for (let at = node; at >= 0 && !result.includes(at); at = scene.nodes[at]?.parent ?? -1) result.push(at);
	return result;
}
/** The node of the armature object whose bones are the skeleton's joints. */
function armatureNode(scene, joints) {
	let node = joints.find((joint) => scene.nodes[joint]?.kind === "bone");
	if (node === void 0) return null;
	while (scene.nodes[node]?.kind === "bone") node = scene.nodes[node]?.parent ?? -1;
	return node >= 0 ? node : null;
}
/** The nodes below `ancestor` on the way down to the chain's first node, top first; all of them for no ancestor. */
function pathBelow(chain, ancestor) {
	const end = ancestor < 0 ? chain.length : chain.indexOf(ancestor);
	return chain.slice(0, end).reverse();
}
/** The value a track holds at one of its clip's sample times: its last key at or before the time. */
function valueAt(track, time) {
	let key = 0;
	let last = track.times.length - 1;
	while (key < last) {
		const middle = key + last + 1 >> 1;
		if ((track.times[middle] ?? 0) <= time) key = middle;
		else last = middle - 1;
	}
	const width = track.values.length / Math.max(track.times.length, 1);
	const value = [];
	for (let c = 0; c < width; c++) value.push(track.values[key * width + c] ?? 0);
	return value;
}
/**
* The times at which a track's value changes from the key before, and its first time. At any other of its clip's
* sample times the track holds a value it holds at one of these.
*/
function changeTimes(track) {
	const width = track.values.length / Math.max(track.times.length, 1);
	const times = [];
	for (let k = 0; k < track.times.length; k++) {
		let changed = k === 0;
		for (let c = 0; c < width && !changed; c++) changed = track.values[k * width + c] !== track.values[(k - 1) * width + c];
		if (changed) times.push(track.times[k] ?? 0);
	}
	return times;
}
/** Local matrices in scene space, at rest or at a time of a clip. */
var Locals = class {
	#rest;
	#restTrs;
	constructor(scene) {
		this.#rest = scene.nodes.map((node) => toSceneAxes(node.rest, scene.unitScale));
		this.#restTrs = this.#rest.map(decompose);
	}
	/** `path`'s locals multiplied top first, with the tracks' values at `time`, or at rest without a time. */
	place(path, tracks, time) {
		let world = null;
		for (const node of path) {
			const local = this.#local(node, tracks.get(node) ?? [], time);
			world = world ? multiply(world, local) : local;
		}
		return world ?? IDENTITY;
	}
	#local(node, own, time) {
		const rest = this.#restTrs[node];
		if (own.length === 0 || !rest) return this.#rest[node] ?? identity();
		const trs = { ...rest };
		if (time === null) return compose(trs);
		for (const track of own) {
			const value = valueAt(track, time);
			if (track.property === "translation") trs.translation = value;
			if (track.property === "rotation") trs.rotation = value;
			if (track.property === "scale") trs.scale = value;
		}
		return compose(trs);
	}
};
function placement(matrix) {
	return {
		matrix,
		reach: Math.max(Math.abs(matrix[12] ?? 0), Math.abs(matrix[13] ?? 0), Math.abs(matrix[14] ?? 0))
	};
}
/** A clip's tracks other than shape key weights, by node. */
function tracksByNode(clip) {
	const byNode = /* @__PURE__ */ new Map();
	for (const track of clip.tracks) {
		if (track.property === "weights") continue;
		const own = byNode.get(track.node);
		if (own) own.push(track);
		else byNode.set(track.node, [track]);
	}
	return byNode;
}
/**
* Whether the clip changes where the mesh's path puts it relative to the armature's path, below their common node, by
* more than float32 rounding in the armature's space. `changesOf` gives the times at which a track's value changes, and
* `armatureAt` the inverse of where the armature's path places it at a time, or at rest without one. The mesh's
* placement is worked out again only at the times its own tracks change.
*/
function movesApart(locals, byNode, meshPath, armaturePath, changesOf, armatureAt) {
	const meshTracks = meshPath.flatMap((node) => byNode.get(node) ?? []);
	const tracks = [...meshTracks, ...armaturePath.flatMap((node) => byNode.get(node) ?? [])];
	if (tracks.length === 0) return false;
	const relative = (armature, mesh) => ({
		matrix: multiply(armature.matrix, mesh.matrix),
		reach: Math.max(armature.reach, mesh.reach)
	});
	const rest = relative(armatureAt(null), placement(locals.place(meshPath, byNode, null)));
	const meshChanges = new Set(meshTracks.flatMap(changesOf));
	const times = [...new Set(tracks.flatMap(changesOf))].sort((a, b) => a - b);
	let mesh = null;
	return times.some((time) => {
		if (!mesh || meshChanges.has(time)) mesh = placement(locals.place(meshPath, byNode, time));
		const { matrix, reach } = relative(armatureAt(time), mesh);
		const translationTolerance = TOLERANCE + 8 * FLOAT32_ROUNDING * Math.max(reach, rest.reach);
		return matrix.some((value, element) => {
			const tolerance = element >= 12 && element < 15 ? translationTolerance : TOLERANCE;
			return Math.abs(value - (rest.matrix[element] ?? 0)) > tolerance;
		});
	});
}
/**
* Warnings for skinned meshes that a clip moves relative to the armature object that deforms them. Blender deforms a
* mesh in its armature's space and then places it with the mesh object's transform at that frame; the scene's skin
* follows the joints alone, so it keeps the mesh where it sits relative to the armature at rest.
*/
function skinMotionWarnings(scene, clips) {
	const locals = new Locals(scene);
	const changes = /* @__PURE__ */ new Map();
	const changesOf = (track) => {
		let times = changes.get(track);
		if (!times) {
			times = changeTimes(track);
			changes.set(track, times);
		}
		return times;
	};
	const skinned = scene.meshes.flatMap((mesh, index) => {
		const skeleton = mesh.skin ? scene.skeletons[mesh.skin.skeleton] : void 0;
		const meshNode = scene.meshRecords[index]?.node;
		const armature = skeleton ? armatureNode(scene, skeleton.joints) : null;
		if (meshNode === void 0 || armature === null) return [];
		const meshChain = lineage(scene, meshNode);
		const armatureChain = lineage(scene, armature);
		const common = meshChain.find((node) => armatureChain.includes(node)) ?? -1;
		const armaturePath = pathBelow(armatureChain, common);
		return [{
			mesh,
			armature,
			meshPath: pathBelow(meshChain, common),
			armaturePath,
			key: armaturePath.join(" ")
		}];
	});
	const moving = skinned.map(() => []);
	for (const clip of clips) {
		const byNode = tracksByNode(clip);
		const armaturePlacements = /* @__PURE__ */ new Map();
		skinned.forEach(({ meshPath, armaturePath, key }, index) => {
			let placed = armaturePlacements.get(key);
			if (!placed) {
				placed = /* @__PURE__ */ new Map();
				armaturePlacements.set(key, placed);
			}
			const cache = placed;
			const armatureAt = (time) => {
				let found = cache.get(time);
				if (!found) {
					found = placement(invert(locals.place(armaturePath, byNode, time)));
					cache.set(time, found);
				}
				return found;
			};
			if (movesApart(locals, byNode, meshPath, armaturePath, changesOf, armatureAt)) moving[index]?.push(clip.name);
		});
	}
	return skinned.flatMap(({ mesh, armature }, index) => {
		const names = moving[index] ?? [];
		if (names.length === 0) return [];
		const armatureName = scene.nodes[armature]?.name ?? "";
		return [{
			code: "deform-approximated",
			subject: {
				kind: "node",
				name: mesh.name
			},
			message: `Motion relative to armature not followed: ${mesh.name}`,
			detail: `The preview keeps its rest offset from ${armatureName} in ${names.join(", ")}`
		}];
	});
}
//#endregion
//#region ../../packages/blend/vendor/fzstd/index.js
var ab = ArrayBuffer;
var u8 = Uint8Array;
var u16 = Uint16Array;
var i16 = Int16Array;
var i32 = Int32Array;
var slc = function(v, s, e) {
	if (u8.prototype.slice) return u8.prototype.slice.call(v, s, e);
	if (s == null || s < 0) s = 0;
	if (e == null || e > v.length) e = v.length;
	var n = new u8(e - s);
	n.set(v.subarray(s, e));
	return n;
};
var fill = function(v, n, s, e) {
	if (u8.prototype.fill) return u8.prototype.fill.call(v, n, s, e);
	if (s == null || s < 0) s = 0;
	if (e == null || e > v.length) e = v.length;
	for (; s < e; ++s) v[s] = n;
	return v;
};
var cpw = function(v, t, s, e) {
	if (u8.prototype.copyWithin) return u8.prototype.copyWithin.call(v, t, s, e);
	if (s == null || s < 0) s = 0;
	if (e == null || e > v.length) e = v.length;
	while (s < e) v[t++] = v[s++];
};
var ec = [
	"invalid zstd data",
	"window size too large (>2046MB)",
	"invalid block type",
	"FSE accuracy too high",
	"match distance too far back",
	"unexpected EOF"
];
var err = function(ind, msg, nt) {
	var e = new Error(msg || ec[ind]);
	e.code = ind;
	if (Error.captureStackTrace) Error.captureStackTrace(e, err);
	if (!nt) throw e;
	return e;
};
var rb = function(d, b, n) {
	var i = 0, o = 0;
	for (; i < n; ++i) o |= d[b++] << (i << 3);
	return o;
};
var b4 = function(d, b) {
	return (d[b] | d[b + 1] << 8 | d[b + 2] << 16 | d[b + 3] << 24) >>> 0;
};
var rzfh = function(dat, w) {
	var n3 = dat[0] | dat[1] << 8 | dat[2] << 16;
	if (n3 == 3126568 && dat[3] == 253) {
		var flg = dat[4];
		var ss = flg >> 5 & 1, cc = flg >> 2 & 1, df = flg & 3, fcf = flg >> 6;
		if (flg & 8) err(0);
		var bt = 6 - ss;
		var db = df == 3 ? 4 : df;
		var di = rb(dat, bt, db);
		bt += db;
		var fsb = fcf ? 1 << fcf : ss;
		var fss = rb(dat, bt, fsb) + (fcf == 1 && 256);
		var ws = fss;
		if (!ss) {
			var wb = 1 << 10 + (dat[5] >> 3);
			ws = wb + (wb >> 3) * (dat[5] & 7);
		}
		if (ws > 2145386496) err(1);
		var buf = new u8((w == 1 ? fss || ws * 2 : w ? 0 : ws * 2) + 12);
		buf[0] = 1, buf[4] = 4, buf[8] = 8;
		return {
			b: bt + fsb,
			y: 0,
			l: 0,
			d: di,
			w: w && w != 1 ? w : buf.subarray(12),
			e: ws,
			o: new i32(buf.buffer, 0, 3),
			u: fss,
			c: cc,
			m: Math.min(131072, ws)
		};
	} else if ((n3 >> 4 | dat[3] << 20) == 25481893) return b4(dat, 4) + 8;
	err(0);
};
var msb = function(val) {
	var bits = 0;
	for (; 1 << bits <= val; ++bits);
	return bits - 1;
};
var rfse = function(dat, bt, mal) {
	var tpos = (bt << 3) + 4;
	var al = (dat[bt] & 15) + 5;
	if (al > mal) err(3);
	var sz = 1 << al;
	var probs = sz, sym = -1, re = -1, i = -1, ht = sz;
	var buf = new ab(512 + (sz << 2));
	var freq = new i16(buf, 0, 256);
	var dstate = new u16(buf, 0, 256);
	var nstate = new u16(buf, 512, sz);
	var bb1 = 512 + (sz << 1);
	var syms = new u8(buf, bb1, sz);
	var nbits = new u8(buf, bb1 + sz);
	while (sym < 255 && probs > 0) {
		var bits = msb(probs + 1);
		var cbt = tpos >> 3;
		var msk = (1 << bits + 1) - 1;
		var val = (dat[cbt] | dat[cbt + 1] << 8 | dat[cbt + 2] << 16) >> (tpos & 7) & msk;
		var msk1fb = (1 << bits) - 1;
		var msv = msk - probs - 1;
		var sval = val & msk1fb;
		if (sval < msv) tpos += bits, val = sval;
		else {
			tpos += bits + 1;
			if (val > msk1fb) val -= msv;
		}
		freq[++sym] = --val;
		if (val == -1) {
			probs += val;
			syms[--ht] = sym;
		} else probs -= val;
		if (!val) do {
			var rbt = tpos >> 3;
			re = (dat[rbt] | dat[rbt + 1] << 8) >> (tpos & 7) & 3;
			tpos += 2;
			sym += re;
		} while (re == 3);
	}
	if (sym > 255 || probs) err(0);
	var sympos = 0;
	var sstep = (sz >> 1) + (sz >> 3) + 3;
	var smask = sz - 1;
	for (var s = 0; s <= sym; ++s) {
		var sf = freq[s];
		if (sf < 1) {
			dstate[s] = -sf;
			continue;
		}
		for (i = 0; i < sf; ++i) {
			syms[sympos] = s;
			do
				sympos = sympos + sstep & smask;
			while (sympos >= ht);
		}
	}
	if (sympos) err(0);
	for (i = 0; i < sz; ++i) {
		var ns = dstate[syms[i]]++;
		var nb = nbits[i] = al - msb(ns);
		nstate[i] = (ns << nb) - sz;
	}
	return [tpos + 7 >> 3, {
		b: al,
		s: syms,
		n: nbits,
		t: nstate
	}];
};
var rhu = function(dat, bt) {
	var i = 0, wc = -1;
	var buf = new u8(292), hb = dat[bt];
	var hw = buf.subarray(0, 256);
	var rc = buf.subarray(256, 268);
	var ri = new u16(buf.buffer, 268);
	if (hb < 128) {
		var _a = rfse(dat, bt + 1, 6), ebt = _a[0], fdt = _a[1];
		bt += hb;
		var epos = ebt << 3;
		var lb = dat[bt];
		if (!lb) err(0);
		var st1 = 0, st2 = 0, btr1 = fdt.b, btr2 = btr1;
		var fpos = (++bt << 3) - 8 + msb(lb);
		while (wc < 255) {
			fpos -= btr1;
			if (fpos < epos) break;
			var cbt = fpos >> 3;
			st1 += (dat[cbt] | dat[cbt + 1] << 8) >> (fpos & 7) & (1 << btr1) - 1;
			hw[++wc] = fdt.s[st1];
			fpos -= btr2;
			if (fpos < epos) break;
			cbt = fpos >> 3;
			st2 += (dat[cbt] | dat[cbt + 1] << 8) >> (fpos & 7) & (1 << btr2) - 1;
			hw[++wc] = fdt.s[st2];
			btr1 = fdt.n[st1];
			st1 = fdt.t[st1];
			btr2 = fdt.n[st2];
			st2 = fdt.t[st2];
		}
		if (++wc > 255) err(0);
	} else {
		wc = hb - 127;
		for (; i < wc; i += 2) {
			var byte = dat[++bt];
			hw[i] = byte >> 4;
			hw[i + 1] = byte & 15;
		}
		++bt;
	}
	var wes = 0;
	for (i = 0; i < wc; ++i) {
		var wt = hw[i];
		if (wt > 11) err(0);
		wes += wt && 1 << wt - 1;
	}
	var mb = msb(wes) + 1;
	var ts = 1 << mb;
	var rem = ts - wes;
	if (rem & rem - 1) err(0);
	hw[wc++] = msb(rem) + 1;
	for (i = 0; i < wc; ++i) {
		var wt = hw[i];
		++rc[hw[i] = wt && mb + 1 - wt];
	}
	var hbuf = new u8(ts << 1);
	var syms = hbuf.subarray(0, ts), nb = hbuf.subarray(ts);
	ri[mb] = 0;
	for (i = mb; i > 0; --i) {
		var pv = ri[i];
		fill(nb, i, pv, ri[i - 1] = pv + rc[i] * (1 << mb - i));
	}
	if (ri[0] != ts) err(0);
	for (i = 0; i < wc; ++i) {
		var bits = hw[i];
		if (bits) {
			var code = ri[bits];
			fill(syms, i, code, ri[bits] = code + (1 << mb - bits));
		}
	}
	return [bt, {
		n: nb,
		b: mb,
		s: syms
	}];
};
var dllt = (/*#__PURE__*/ rfse(/*#__PURE__*/ new u8([
	81,
	16,
	99,
	140,
	49,
	198,
	24,
	99,
	12,
	33,
	196,
	24,
	99,
	102,
	102,
	134,
	70,
	146,
	4
]), 0, 6))[1];
var dmlt = (/*#__PURE__*/ rfse(/*#__PURE__*/ new u8([
	33,
	20,
	196,
	24,
	99,
	140,
	33,
	132,
	16,
	66,
	8,
	33,
	132,
	16,
	66,
	8,
	33,
	68,
	68,
	68,
	68,
	68,
	68,
	68,
	68,
	36,
	9
]), 0, 6))[1];
var doct = (/*#__PURE__ */ rfse(/*#__PURE__*/ new u8([
	32,
	132,
	16,
	66,
	102,
	70,
	68,
	68,
	68,
	68,
	36,
	73,
	2
]), 0, 5))[1];
var b2bl = function(b, s) {
	var len = b.length, bl = new i32(len);
	for (var i = 0; i < len; ++i) {
		bl[i] = s;
		s += 1 << b[i];
	}
	return bl;
};
var llb = /*#__PURE__ */ new u8((/*#__PURE__ */ new i32([
	0,
	0,
	0,
	0,
	16843009,
	50528770,
	134678020,
	202050057,
	269422093
])).buffer, 0, 36);
var llbl = /*#__PURE__ */ b2bl(llb, 0);
var mlb = /*#__PURE__ */ new u8((/*#__PURE__ */ new i32([
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	16843009,
	50528770,
	117769220,
	185207048,
	252579084,
	16
])).buffer, 0, 53);
var mlbl = /*#__PURE__ */ b2bl(mlb, 3);
var dhu = function(dat, out, hu) {
	var len = dat.length, ss = out.length, lb = dat[len - 1], msk = (1 << hu.b) - 1, eb = -hu.b;
	if (!lb) err(0);
	var st = 0, btr = hu.b, pos = (len << 3) - 8 + msb(lb) - btr, i = -1;
	for (; pos > eb && i < ss;) {
		var cbt = pos >> 3;
		var val = (dat[cbt] | dat[cbt + 1] << 8 | dat[cbt + 2] << 16) >> (pos & 7);
		st = (st << btr | val) & msk;
		out[++i] = hu.s[st];
		pos -= btr = hu.n[st];
	}
	if (pos != eb || i + 1 != ss) err(0);
};
var dhu4 = function(dat, out, hu) {
	var bt = 6;
	var sz1 = out.length + 3 >> 2, sz2 = sz1 << 1, sz3 = sz1 + sz2;
	dhu(dat.subarray(bt, bt += dat[0] | dat[1] << 8), out.subarray(0, sz1), hu);
	dhu(dat.subarray(bt, bt += dat[2] | dat[3] << 8), out.subarray(sz1, sz2), hu);
	dhu(dat.subarray(bt, bt += dat[4] | dat[5] << 8), out.subarray(sz2, sz3), hu);
	dhu(dat.subarray(bt), out.subarray(sz3), hu);
};
var rzb = function(dat, st, out) {
	var _a;
	var bt = st.b;
	var b0 = dat[bt], btype = b0 >> 1 & 3;
	st.l = b0 & 1;
	var sz = b0 >> 3 | dat[bt + 1] << 5 | dat[bt + 2] << 13;
	var ebt = (bt += 3) + sz;
	if (btype == 1) {
		if (bt >= dat.length) return;
		st.b = bt + 1;
		if (out) {
			if (st.y + sz > out.length) err(0);
			fill(out, dat[bt], st.y, st.y += sz);
			return out;
		}
		return fill(new u8(sz), dat[bt]);
	}
	if (ebt > dat.length) return;
	if (btype == 0) {
		st.b = ebt;
		if (out) {
			if (st.y + sz > out.length) err(0);
			out.set(dat.subarray(bt, ebt), st.y);
			st.y += sz;
			return out;
		}
		return slc(dat, bt, ebt);
	}
	if (btype == 2) {
		var b3 = dat[bt], lbt = b3 & 3, sf = b3 >> 2 & 3;
		var lss = b3 >> 4, lcs = 0, s4 = 0;
		if (lbt < 2) {
			if (sf & 1) lss |= dat[++bt] << 4 | (sf & 2 && dat[++bt] << 12);
			else lss = b3 >> 3;
		} else {
			s4 = sf;
			if (sf < 2) lss |= (dat[++bt] & 63) << 4, lcs = dat[bt] >> 6 | dat[++bt] << 2;
			else if (sf == 2) lss |= dat[++bt] << 4 | (dat[++bt] & 3) << 12, lcs = dat[bt] >> 2 | dat[++bt] << 6;
			else lss |= dat[++bt] << 4 | (dat[++bt] & 63) << 12, lcs = dat[bt] >> 6 | dat[++bt] << 2 | dat[++bt] << 10;
		}
		++bt;
		var buf = out ? out.subarray(st.y, st.y + st.m) : new u8(st.m);
		var spl = buf.length - lss;
		if (spl < 0) err(0);
		if (lbt == 0) buf.set(dat.subarray(bt, bt += lss), spl);
		else if (lbt == 1) fill(buf, dat[bt++], spl);
		else {
			var hu = st.h;
			if (lbt == 2) {
				var hud = rhu(dat, bt);
				lcs += bt - (bt = hud[0]);
				st.h = hu = hud[1];
			} else if (!hu) err(0);
			(s4 ? dhu4 : dhu)(dat.subarray(bt, bt += lcs), buf.subarray(spl), hu);
		}
		var ns = dat[bt++];
		if (ns) {
			if (ns == 255) ns = (dat[bt++] | dat[bt++] << 8) + 32512;
			else if (ns > 127) ns = ns - 128 << 8 | dat[bt++];
			var scm = dat[bt++];
			if (scm & 3) err(0);
			var dts = [
				dmlt,
				doct,
				dllt
			];
			for (var i = 2; i > -1; --i) {
				var md = scm >> (i << 1) + 2 & 3;
				if (md == 1) {
					var rbuf = new u8([
						0,
						0,
						dat[bt++]
					]);
					dts[i] = {
						s: rbuf.subarray(2, 3),
						n: rbuf.subarray(0, 1),
						t: new u16(rbuf.buffer, 0, 1),
						b: 0
					};
				} else if (md == 2) _a = rfse(dat, bt, 9 - (i & 1)), bt = _a[0], dts[i] = _a[1];
				else if (md == 3) {
					if (!st.t) err(0);
					dts[i] = st.t[i];
				}
			}
			var _b = st.t = dts, mlt = _b[0], oct = _b[1], llt = _b[2];
			var lb = dat[ebt - 1];
			if (!lb) err(0);
			var spos = (ebt << 3) - 8 + msb(lb) - llt.b, cbt = spos >> 3, oubt = 0;
			var lst = (dat[cbt] | dat[cbt + 1] << 8) >> (spos & 7) & (1 << llt.b) - 1;
			cbt = (spos -= oct.b) >> 3;
			var ost = (dat[cbt] | dat[cbt + 1] << 8) >> (spos & 7) & (1 << oct.b) - 1;
			cbt = (spos -= mlt.b) >> 3;
			var mst = (dat[cbt] | dat[cbt + 1] << 8) >> (spos & 7) & (1 << mlt.b) - 1;
			for (++ns; --ns;) {
				var llc = llt.s[lst];
				var lbtr = llt.n[lst];
				var mlc = mlt.s[mst];
				var mbtr = mlt.n[mst];
				var ofc = oct.s[ost];
				var obtr = oct.n[ost];
				cbt = (spos -= ofc) >> 3;
				var ofp = 1 << ofc;
				var ofs = spos & 7;
				var off = ofp + (((dat[cbt] | dat[cbt + 1] << 8 | dat[cbt + 2] << 16 | dat[cbt + 3] << 24) >>> ofs | (ofc > 24 && ofs && dat[cbt + 4] << 32 - ofs)) & ofp - 1);
				cbt = (spos -= mlb[mlc]) >> 3;
				var ml = mlbl[mlc] + ((dat[cbt] | dat[cbt + 1] << 8 | dat[cbt + 2] << 16) >> (spos & 7) & (1 << mlb[mlc]) - 1);
				cbt = (spos -= llb[llc]) >> 3;
				var ll = llbl[llc] + ((dat[cbt] | dat[cbt + 1] << 8 | dat[cbt + 2] << 16) >> (spos & 7) & (1 << llb[llc]) - 1);
				cbt = (spos -= lbtr) >> 3;
				lst = llt.t[lst] + ((dat[cbt] | dat[cbt + 1] << 8) >> (spos & 7) & (1 << lbtr) - 1);
				cbt = (spos -= mbtr) >> 3;
				mst = mlt.t[mst] + ((dat[cbt] | dat[cbt + 1] << 8) >> (spos & 7) & (1 << mbtr) - 1);
				cbt = (spos -= obtr) >> 3;
				ost = oct.t[ost] + ((dat[cbt] | dat[cbt + 1] << 8) >> (spos & 7) & (1 << obtr) - 1);
				if (off > 3) {
					st.o[2] = st.o[1];
					st.o[1] = st.o[0];
					st.o[0] = off -= 3;
				} else {
					var idx = off - (ll != 0);
					if (idx) {
						off = idx == 3 ? st.o[0] - 1 : st.o[idx];
						if (idx > 1) st.o[2] = st.o[1];
						st.o[1] = st.o[0];
						st.o[0] = off;
					} else off = st.o[0];
				}
				if (ll > buf.length - spl || oubt + ml > spl) err(0);
				for (var i = 0; i < ll; ++i) buf[oubt + i] = buf[spl + i];
				oubt += ll, spl += ll;
				var stin = oubt - off;
				if (stin < 0) {
					var len = -stin;
					var bs = st.e + stin;
					if (len > ml) len = ml;
					for (var i = 0; i < len; ++i) buf[oubt + i] = st.w[bs + i];
					oubt += len, ml -= len, stin = 0;
				}
				for (var i = 0; i < ml; ++i) buf[oubt + i] = buf[stin + i];
				oubt += ml;
			}
			if (oubt != spl) while (spl < buf.length) buf[oubt++] = buf[spl++];
			else oubt = buf.length;
			if (out) st.y += oubt;
			else buf = slc(buf, 0, oubt);
		} else if (out) {
			st.y += lss;
			if (spl) for (var i = 0; i < lss; ++i) buf[i] = buf[spl + i];
		} else if (spl) buf = slc(buf, spl);
		st.b = ebt;
		return buf;
	}
	err(2);
};
var wapp = function(st, blk) {
	var w = st.w, ws = w.length >>> 1, n = blk.length;
	if (n >= ws) {
		w.set(blk.subarray(n - ws));
		st.e = ws;
		return;
	}
	if (st.e + n > w.length) {
		cpw(w, 0, st.e + n - ws, st.e);
		st.e = ws - n;
	}
	w.set(blk, st.e);
	st.e += n;
};
var cct = function(bufs, ol) {
	if (bufs.length == 1) return bufs[0];
	var buf = new u8(ol);
	for (var i = 0, b = 0; i < bufs.length; ++i) {
		var chk = bufs[i];
		buf.set(chk, b);
		b += chk.length;
	}
	return buf;
};
/**
* Decompresses Zstandard data
* @param dat The input data
* @param buf The output buffer. If unspecified, the function will allocate
*            exactly enough memory to fit the decompressed data. If your
*            data has multiple frames and you know the output size, specifying
*            it will yield better performance.
* @returns The decompressed data
*/
function decompress(dat, buf) {
	var bufs = [], nb = +!buf;
	var bt = 0, ol = 0;
	for (; dat.length;) {
		var st = rzfh(dat, nb || buf);
		if (typeof st == "object") {
			if (nb) {
				buf = null;
				if (st.w.length == st.u) {
					bufs.push(buf = st.w);
					ol += st.u;
				}
			} else {
				bufs.push(buf);
				st.e = 0;
			}
			for (; !st.l;) {
				var blk = rzb(dat, st, buf);
				if (!blk) err(5);
				if (buf) st.e = st.y;
				else {
					bufs.push(blk);
					ol += blk.length;
					wapp(st, blk);
				}
			}
			bt = st.b + st.c * 4;
		} else bt = st;
		dat = dat.subarray(bt);
	}
	return cct(bufs, ol);
}
/**
* Decompressor for Zstandard streamed data
*/
var Decompress = /* @__PURE__ */ function() {
	/**
	* Creates a Zstandard decompressor
	* @param ondata The handler for stream data
	*/
	function Decompress(ondata) {
		this.ondata = ondata;
		this.c = [];
		this.l = 0;
		this.z = 0;
	}
	/**
	* Pushes data to be decompressed
	* @param chunk The chunk of data to push
	* @param final Whether or not this is the last chunk in the stream
	*/
	Decompress.prototype.push = function(chunk, final) {
		if (typeof this.s == "number") {
			var sub = Math.min(chunk.length, this.s);
			chunk = chunk.subarray(sub);
			this.s -= sub;
		}
		var ncs = chunk.length + this.l;
		if (!this.s) {
			if (final) {
				if (!ncs) {
					this.ondata(new u8(0), true);
					return;
				}
				if (ncs < 5) err(5);
			} else if (ncs < 18) {
				this.c.push(chunk);
				this.l = ncs;
				return;
			}
			if (this.l) {
				this.c.push(chunk);
				chunk = cct(this.c, ncs);
				this.c = [];
				this.l = 0;
			}
			if (typeof (this.s = rzfh(chunk)) == "number") return this.push(chunk, final);
		}
		if (typeof this.s != "number") {
			if (ncs < (this.z || 3)) {
				if (final) err(5);
				this.c.push(chunk);
				this.l = ncs;
				return;
			}
			if (this.l) {
				this.c.push(chunk);
				chunk = cct(this.c, ncs);
				this.c = [];
				this.l = 0;
			}
			if (!this.z && ncs < (this.z = chunk[this.s.b] & 2 ? 4 : 3 + (chunk[this.s.b] >> 3 | chunk[this.s.b + 1] << 5 | chunk[this.s.b + 2] << 13))) {
				if (final) err(5);
				this.c.push(chunk);
				this.l = ncs;
				return;
			} else this.z = 0;
			for (;;) {
				var blk = rzb(chunk, this.s);
				if (!blk) {
					if (final) err(5);
					var adc = chunk.subarray(this.s.b);
					this.s.b = 0;
					this.c.push(adc), this.l += adc.length;
					return;
				} else {
					this.ondata(blk, false);
					wapp(this.s, blk);
				}
				if (this.s.l) {
					var rest = chunk.subarray(this.s.b);
					this.s = this.s.c * 4;
					this.push(rest, final);
					return;
				}
			}
		} else if (final) err(5);
	};
	return Decompress;
}();
//#endregion
//#region ../../packages/blend/src/blend/decompress.ts
var ZSTD_MAGIC = 4247762216;
var ZSTD_SKIPPABLE_MAGIC = 407710288;
var ZSTD_BLOCK_RLE = 1;
/** Blender refuses a frame whose window is larger, as the Zstandard library does by default. */
var ZSTD_MAX_WINDOW = 2 ** 27 + 1;
/** The blocks the header check decodes at most, for a header split over short or empty blocks and frames. */
var HEADER_BLOCKS = 8;
var GZIP_MAGIC = [31, 139];
/** Deflate codes at most 258 bytes in 2 bits, so data expands at most this many times. */
var DEFLATE_MAX_RATIO = 1032;
/**
* The most a compressed file may expand to. Data that declares more is refused before its bytes are allocated. Its
* ratio to the file's size is no guide: Multires data that was never sculpted compresses over 600 times.
*/
var MAX_EXPANDED_BYTES = 2 ** 30;
/** Compressed data goes to a decompressor in slices this large, as a browser expands each slice it is given at once. */
var COMPRESSED_SLICE = 16384;
/** The runtime's decompressor for gzip files or zlib data, as a PNG stores its pixels, or null where it has none. */
function decompressor(format) {
	const Stream = globalThis.DecompressionStream;
	return Stream ? new Stream(format) : null;
}
/** Writes compressed data to a decompressor in slices, then closes it. */
async function writeInSlices(writer, data) {
	for (const part of data) for (let start = 0; start < part.byteLength; start += COMPRESSED_SLICE) await writer.write(part.subarray(start, start + COMPRESSED_SLICE));
	await writer.close();
}
function startsWith(bytes, magic) {
	return magic.every((byte, index) => bytes[index] === byte);
}
function concat(chunks) {
	const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
	const result = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return result;
}
function tooLarge(limit) {
	return new BlendParseError(`it expands to more than ${limit % 2 ** 30 === 0 ? `${limit / 2 ** 30} GiB` : `${limit} bytes`}`);
}
function littleEndian(bytes, start, length) {
	let value = 0;
	for (let index = length - 1; index >= 0; index--) value = value * 256 + (bytes[start + index] ?? 0);
	return value;
}
/**
* The buffer with room for `needed` bytes and its first `length` bytes kept: itself when it has the room, or else a new
* one of the `expected` bytes where they are enough, or of twice its size, at most `limit` bytes.
*/
function withRoom(buffer, length, needed, expected, limit) {
	if (needed <= buffer.byteLength) return buffer;
	const size = needed <= expected ? expected : Math.max(needed, buffer.byteLength * 2);
	const grown = new Uint8Array(Math.min(limit, size));
	grown.set(buffer.subarray(0, length));
	return grown;
}
/**
* Calls `visit` with each Zstandard frame of the data other than skippable ones, read from its frame and block headers
* alone, and returns where the frames end: before a damaged frame header, or with the data when a frame is cut short.
*/
function forEachZstdFrame(bytes, visit) {
	let offset = 0;
	while (offset + 8 <= bytes.byteLength) {
		const magic = littleEndian(bytes, offset, 4);
		if ((magic & 4294967280) >>> 0 === ZSTD_SKIPPABLE_MAGIC) {
			offset += 8 + littleEndian(bytes, offset + 4, 4);
			continue;
		}
		if (magic !== ZSTD_MAGIC) break;
		const descriptor = bytes[offset + 4] ?? 0;
		const singleSegment = (descriptor & 32) !== 0;
		let position = offset + 5;
		let window = 0;
		if (!singleSegment) {
			const windowDescriptor = bytes[position] ?? 0;
			const base = 2 ** (10 + (windowDescriptor >> 3));
			window = base + base / 8 * (windowDescriptor & 7);
			position += 1;
		}
		position += [
			0,
			1,
			2,
			4
		][descriptor & 3] ?? 0;
		const contentBytes = [
			singleSegment ? 1 : 0,
			2,
			4,
			8
		][descriptor >> 6] ?? 0;
		const content = littleEndian(bytes, position, contentBytes) + (contentBytes === 2 ? 256 : 0);
		position += contentBytes;
		let last = false;
		while (!last && position + 3 <= bytes.byteLength) {
			const header = littleEndian(bytes, position, 3);
			last = (header & 1) === 1;
			position += 3 + ((header >> 1 & 3) === ZSTD_BLOCK_RLE ? 1 : header >>> 3);
		}
		position += (descriptor & 4) !== 0 ? 4 : 0;
		const end = last ? Math.min(position, bytes.byteLength) : bytes.byteLength;
		visit({
			start: offset,
			end,
			content,
			window: singleSegment ? content : window
		});
		offset = end;
	}
	return offset;
}
/**
* Refuses Zstandard data that Blender does not read, or that takes more than `limit` bytes up front: the bytes its
* frames declare, and the window the decompressor sets up for each frame that does not declare its size. Gives the
* bytes the frames declare and where they end.
*/
function checkZstdFrames(bytes, limit) {
	let declared = 0;
	let windows = 0;
	let window = 0;
	const end = forEachZstdFrame(bytes, (frame) => {
		declared += frame.content;
		if (frame.content === 0) windows += frame.window;
		window = Math.max(window, frame.window);
	});
	if (declared + windows > limit) throw tooLarge(limit);
	if (window > ZSTD_MAX_WINDOW) throw new BlendParseError("its compressed data needs a window over 128 MiB, which Blender refuses too");
	return {
		declared,
		end
	};
}
/**
* Expands each frame: a frame that declares its size into a buffer of that size, and a frame that does not block by
* block, refusing data that expands past `limit` bytes. The vendored decompressor refuses a block expanding past the
* most its frame allows or coding more Huffman weights than a table holds, so that a block takes work in proportion to
* its size, its output and the largest block a frame allows. A first part
* that holds all the declared bytes becomes the result without a copy. Data after the frames is left to the
* decompressor, which refuses it.
*/
function unzstd(bytes, declared, end, limit) {
	let output = /* @__PURE__ */ new Uint8Array(0);
	let length = 0;
	let expanded = declared;
	const append = (part) => {
		if (length === 0 && part.byteLength >= declared) {
			output = part;
			length = part.byteLength;
			return;
		}
		output = withRoom(output, length, length + part.byteLength, declared, limit);
		output.set(part, length);
		length += part.byteLength;
	};
	forEachZstdFrame(bytes, (frame) => {
		const data = bytes.subarray(frame.start, frame.end);
		if (frame.content > 0) {
			append(decompress(data));
			return;
		}
		new Decompress((block) => {
			expanded += block.byteLength;
			if (expanded > limit) throw tooLarge(limit);
			append(block);
		}).push(data, true);
	});
	if (end < bytes.byteLength) append(decompress(bytes.subarray(end)));
	return output.subarray(0, length);
}
/**
* The size gzip data says it expands to, from the trailer of its last member, or 0 where that is past `limit` or more
* than the data could expand to. The trailer holds the size modulo 4 GiB, and a file of several members holds only the
* last one's.
*/
function gzipSize(bytes, limit) {
	const size = bytes.byteLength >= 4 ? littleEndian(bytes, bytes.byteLength - 4, 4) : 0;
	return size <= Math.min(limit, bytes.byteLength * DEFLATE_MAX_RATIO) ? size : 0;
}
/**
* Expands gzip data into one buffer of the size it says it expands to, allocated once its first bytes are a Blender file
* header, and grows the buffer for data that expands to more, refusing data that expands past `limit` bytes.
*/
async function gunzip(bytes, limit) {
	const stream = decompressor("gzip");
	if (!stream) throw new BlendParseError("this runtime cannot read gzip-compressed files");
	const written = writeInSlices(stream.writable.getWriter(), [bytes]);
	written.catch(() => void 0);
	const reader = stream.readable.getReader();
	const expected = gzipSize(bytes, limit);
	let output = /* @__PURE__ */ new Uint8Array(0);
	let length = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		if (!value) continue;
		try {
			if (length + value.byteLength > limit) throw tooLarge(limit);
			const checked = length >= HEADER_MAGIC.length;
			output = withRoom(output, length, length + value.byteLength, checked ? expected : 0, limit);
			output.set(value, length);
			length += value.byteLength;
			if (!checked && length >= 7) checkHeaderMagic(output.subarray(0, length));
		} catch (error) {
			await reader.cancel();
			throw error;
		}
	}
	await written;
	return output.subarray(0, length);
}
/**
* The first bytes of Zstandard data, decoded until they hold a Blender file header's magic or `HEADER_BLOCKS` blocks
* have been decoded, so that data that is not a Blender file is refused before the rest is expanded.
*/
function zstdStart(bytes) {
	const blocks = [];
	let length = 0;
	const stop = /* @__PURE__ */ new Error("start decoded");
	try {
		new Decompress((block) => {
			blocks.push(block);
			length += block.byteLength;
			if (length >= 7 || blocks.length >= HEADER_BLOCKS) throw stop;
		}).push(bytes, true);
	} catch (error) {
		if (error !== stop) throw error;
	}
	return concat(blocks);
}
/** An error's message, or its cause's when it has none, as with the empty TypeError a gzip stream throws. */
function reasonOf(error) {
	if (!(error instanceof Error)) return String(error);
	return error.message || (error.cause === void 0 ? "" : reasonOf(error.cause));
}
/**
* The file's uncompressed bytes. Blender 3.0 and later compress with Zstandard when "Compress" is on, and earlier
* versions with gzip; an uncompressed file comes back as it is. A compressed file that Blender would refuse, that
* expands past `limit` bytes, or whose first bytes are not a Blender file header, is refused before the rest is
* expanded.
*/
async function decompressBlend(bytes, limit = MAX_EXPANDED_BYTES) {
	try {
		if (littleEndian(bytes, 0, 4) === ZSTD_MAGIC) {
			const { declared, end } = checkZstdFrames(bytes, limit);
			checkHeaderMagic(zstdStart(bytes));
			return unzstd(bytes, declared, end, limit);
		}
		if (startsWith(bytes, GZIP_MAGIC)) return await gunzip(bytes, limit);
	} catch (error) {
		if (error instanceof BlendParseError) throw error;
		const reason = reasonOf(error);
		const damaged = "its compressed data is damaged";
		throw new BlendParseError(reason === "" ? damaged : `${damaged} (${reason})`, { cause: error });
	}
	return bytes;
}
//#endregion
//#region ../../packages/blend/src/gray-images.ts
var PNG_GRAY = 0;
var PNG_RGB = 2;
var PNG_PALETTE = 3;
var PNG_GRAY_ALPHA = 4;
var PNG_RGBA = 6;
var PNG_INTERLACED = 1;
/** Where each Adam7 pass of an interlaced PNG starts, column then row, and its steps across and down. */
var ADAM7 = [
	[
		0,
		0,
		8,
		8
	],
	[
		4,
		0,
		8,
		8
	],
	[
		0,
		4,
		4,
		8
	],
	[
		2,
		0,
		4,
		4
	],
	[
		0,
		2,
		2,
		4
	],
	[
		1,
		0,
		2,
		2
	],
	[
		0,
		1,
		1,
		2
	]
];
/** The longest row the check reads, that of a 16-bit RGBA image 8 million pixels wide. */
var MAX_ROW_BYTES = 2 ** 26;
/** The most pixel bytes the checks of one import read, those of an 8-bit RGBA image 16384 pixels square. */
var GRAY_CHECK_BYTES = 2 ** 30;
/** The most pixel bytes a check reads of an image where it looks only for a pixel that is not gray. */
var GRAY_SAMPLE_BYTES = 2 ** 20;
var LAST_FILTER = 4;
/** The JPEG markers that start a frame, which gives its number of components: 0xc0 to 0xcf but 0xc4, 0xc8 and 0xcc. */
var JPEG_FRAMES = /* @__PURE__ */ new Set([
	192,
	193,
	194,
	195,
	197,
	198,
	199,
	201,
	202,
	203,
	205,
	206,
	207
]);
var JPEG_MARKER = 255;
var JPEG_SCAN = 218;
function pngChunks(bytes) {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const chunks = [];
	for (let offset = 8; offset + 8 <= bytes.byteLength;) {
		const end = offset + 8 + view.getUint32(offset);
		if (end > bytes.byteLength) break;
		const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
		chunks.push({
			type,
			data: bytes.subarray(offset + 8, end)
		});
		if (type === "IEND") break;
		offset = end + 4;
	}
	return chunks;
}
/** Whether each pixel of a row has equal red, green and blue samples. */
function isGrayRow(row, pixel, sample) {
	for (let start = 0; start < row.byteLength; start += pixel) for (let byte = start; byte < start + sample; byte++) {
		const red = row[byte];
		if (row[byte + sample] !== red || row[byte + 2 * sample] !== red) return false;
	}
	return true;
}
/**
* Reads a PNG's rows as they inflate, until a pixel is not gray, every row is read, or the next row would pass the
* limit. PNG's filters predict each byte from the same channel of the pixels to its left and above, so an image's
* filtered rows are gray exactly when its pixels are, and they are read without undoing the filters.
*/
var GrayRows = class {
	#passes;
	#pixel;
	#sample;
	#pass = 0;
	#row = 0;
	#filled = 0;
	#line;
	#color = false;
	#damaged = false;
	#left;
	constructor(passes, pixel, sample, limit) {
		this.#passes = passes;
		this.#pixel = pixel;
		this.#sample = sample;
		this.#line = new Uint8Array(1 + (passes[0]?.bytes ?? 0));
		this.#left = limit;
	}
	/** Whether every pixel is gray: false once one is not, and null where the rows end early, stop or are damaged. */
	get gray() {
		if (this.#color) return false;
		return !this.#damaged && this.#pass === this.#passes.length ? true : null;
	}
	/** Reads the next inflated bytes; false once there is nothing more to read. */
	take(bytes) {
		for (let offset = 0; offset < bytes.byteLength && this.#reading();) {
			const copied = Math.min(this.#line.byteLength - this.#filled, bytes.byteLength - offset);
			this.#line.set(bytes.subarray(offset, offset + copied), this.#filled);
			this.#filled += copied;
			offset += copied;
			if (this.#filled === this.#line.byteLength) this.#endRow();
		}
		return this.#reading();
	}
	#reading() {
		return this.#pass < this.#passes.length && this.#line.byteLength - 1 <= this.#left && !this.#color && !this.#damaged;
	}
	#endRow() {
		this.#filled = 0;
		if ((this.#line[0] ?? 0) > LAST_FILTER) {
			this.#damaged = true;
			return;
		}
		if (!isGrayRow(this.#line.subarray(1), this.#pixel, this.#sample)) {
			this.#color = true;
			return;
		}
		this.#left -= this.#line.byteLength - 1;
		this.#row++;
		if (this.#row < (this.#passes[this.#pass]?.rows ?? 0)) return;
		this.#pass++;
		this.#row = 0;
		this.#line = new Uint8Array(1 + (this.#passes[this.#pass]?.bytes ?? 0));
	}
};
/** Inflates zlib data, passing each piece to `take` until it returns false; it stops where the data is damaged. */
async function inflate(data, take) {
	const stream = decompressor("deflate");
	if (!stream) return;
	writeInSlices(stream.writable.getWriter(), data).catch(() => void 0);
	const reader = stream.readable.getReader();
	try {
		for (let next = await reader.read(); !next.done; next = await reader.read()) if (next.value && !take(next.value)) {
			await reader.cancel();
			return;
		}
	} catch {
		return;
	}
}
function isGrayPalette(palette) {
	for (let entry = 0; entry + 2 < palette.byteLength; entry += 3) if (palette[entry + 1] !== palette[entry] || palette[entry + 2] !== palette[entry]) return false;
	return true;
}
async function isGrayPng(bytes, budget, limit) {
	const chunks = pngChunks(bytes);
	const header = chunks[0]?.type === "IHDR" ? chunks[0].data : null;
	if (!header || header.byteLength < 13) return null;
	const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
	const [width, height, depth, colorType] = [
		view.getUint32(0),
		view.getUint32(4),
		header[8],
		header[9]
	];
	if (colorType === PNG_GRAY || colorType === PNG_GRAY_ALPHA) return true;
	if (colorType === PNG_PALETTE) {
		const palette = chunks.find((chunk) => chunk.type === "PLTE")?.data;
		return palette !== void 0 && isGrayPalette(palette) ? true : null;
	}
	if (colorType !== PNG_RGB && colorType !== PNG_RGBA || depth !== 8 && depth !== 16) return null;
	const sample = depth / 8;
	const pixel = (colorType === PNG_RGBA ? 4 : 3) * sample;
	const passes = (header[12] === PNG_INTERLACED ? ADAM7.map(([column, row, across, down]) => [Math.ceil((width - column) / across), Math.ceil((height - row) / down)]) : [[width, height]]).flatMap(([across = 0, down = 0]) => across > 0 && down > 0 ? [{
		rows: down,
		bytes: across * pixel
	}] : []);
	if (passes.length === 0 || passes.some((pass) => pass.bytes > MAX_ROW_BYTES)) return null;
	const scanned = Math.min(passes.reduce((total, pass) => total + pass.rows * pass.bytes, 0), limit);
	if (scanned > budget.bytes) return null;
	budget.bytes -= scanned;
	const rows = new GrayRows(passes, pixel, sample, limit);
	await inflate(chunks.filter((chunk) => chunk.type === "IDAT").map((chunk) => chunk.data), (piece) => rows.take(piece));
	return rows.gray;
}
/** The number of components a JPEG's frame holds, or null where no frame comes before its data. */
function jpegComponents(bytes) {
	for (let offset = 2; offset + 4 <= bytes.byteLength && bytes[offset] === JPEG_MARKER;) {
		const marker = bytes[offset + 1] ?? 0;
		if (marker === JPEG_MARKER) {
			offset++;
			continue;
		}
		if (JPEG_FRAMES.has(marker)) return bytes[offset + 9] ?? null;
		if (marker === JPEG_SCAN) return null;
		offset += 2 + ((bytes[offset + 2] ?? 0) << 8 | (bytes[offset + 3] ?? 0));
	}
	return null;
}
var PNG_SIGNATURE = [
	137,
	80,
	78,
	71,
	13,
	10,
	26,
	10
];
var JPEG_SIGNATURE = [
	255,
	216,
	255
];
/**
* Whether every pixel of an image is gray, so that each of its color channels and its brightness equal its color:
* false where a pixel is known not to be, and null where the check cannot tell. A PNG is read to its last pixel, or to
* the last whole row within `limit` bytes of pixels, unless it stores gray or a gray palette. It is not read where the
* pixels it would read take more than the budget has left, which they use up. A JPEG is gray where it stores one
* component, and other formats are not read.
*/
async function isGrayImage(bytes, budget = { bytes: GRAY_CHECK_BYTES }, limit = Number.POSITIVE_INFINITY) {
	if (startsWith(bytes, PNG_SIGNATURE)) return isGrayPng(bytes, budget, limit);
	return startsWith(bytes, JPEG_SIGNATURE) && jpegComponents(bytes) === 1 ? true : null;
}
//#endregion
//#region ../../packages/blend/src/image-paths.ts
/**
* The path of one tile of a UDIM image, from the <UDIM> or <UVTILE> token that Blender keeps in the image's path. A
* path without a token is the tile's own.
*/
function tilePath(path, tile) {
	const u = (tile - 1001) % 10 + 1;
	const v = Math.floor((tile - 1001) / 10) + 1;
	if (path.includes("<UDIM>")) return path.replace("<UDIM>", String(tile));
	return path.replace("<UVTILE>", `u${u}_v${v}`);
}
/**
* Blender's `BLI_path_sequence_decode` and `BLI_path_sequence_encode`: the path of one frame of an image sequence. The
* last number in the file name, before its extension, becomes the frame, padded with zeros to as many digits; a name
* without a number gets the frame before its extension.
*/
function sequencePath(path, frame) {
	const start = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1;
	const name = path.slice(start);
	const dot = name.lastIndexOf(".");
	const end = dot > 0 && /[^.]/.test(name.slice(0, dot)) ? start + dot : path.length;
	const shown = Math.max(0, Math.trunc(frame));
	const digits = /(\d+)\D*$/.exec(path.slice(start, end));
	const number = digits?.[1];
	if (!digits || number === void 0) return `${path.slice(0, end)}${shown === 0 ? "" : shown}${path.slice(end)}`;
	const from = start + digits.index;
	return `${path.slice(0, from)}${String(shown).padStart(number.length, "0")}${path.slice(from + number.length)}`;
}
//#endregion
//#region ../../packages/blend/src/read-blend.ts
/** Blender 2.80 brought collections and view layers, which the scene is read from. */
var OLDEST_VERSION = 280;
/** Blender's object display types that draw no surface: Bounds, a box around the object, and Wire, its edges. */
var DISPLAY_BOUNDS = 1;
var DISPLAY_WIRE = 2;
/**
* Whether Blender hides the object or draws no surface for it: hidden with the eye in the view layer, an instancer that
* shows only its instances, or an object displayed as bounds or wire, as cages and cutters often are.
*/
function hiddenInBlender(object) {
	const display = object.struct.number("dt");
	return object.hidden || object.instancerHidden || display === DISPLAY_BOUNDS || display === DISPLAY_WIRE;
}
function buildNodes$2(scene) {
	const fromScene = invert(scene.conversion);
	const hidden = /* @__PURE__ */ new Set();
	for (const record of [...scene.objects, ...scene.meshRecords]) if (hiddenInBlender(record.object)) hidden.add(record.node);
	return scene.nodes.map((node, index) => {
		const trs = decompose(multiplyAll(scene.conversion, node.rest, fromScene));
		return {
			name: node.name,
			parent: node.parent,
			kind: node.kind,
			translation: trs.translation,
			rotation: trs.rotation,
			scale: trs.scale,
			mesh: node.mesh,
			hidden: hidden.has(index)
		};
	});
}
/** The folder a "//" path of the datablock starts at: this file's, or for data packed from a library, the library's. */
function relativePathFolder(datablock) {
	const library = idOf(datablock)?.deref("lib");
	const path = library ? library.string("name") || library.string("filepath") : "";
	return path.slice(0, path.replaceAll("\\", "/").lastIndexOf("/") + 1) || "//";
}
/**
* Whether the scene shows the file an image stores, rather than its packed bytes or nothing: an image file's, a UDIM
* image's first tile, or the frame `frame` of a sequence.
*/
function readsFile(image, frame) {
	const source = imageSource(image);
	return source === 1 || source === 6 || source === 2 && frame !== null;
}
/** The file Blender reads for an image at `path`: a UDIM image's first tile, or the frame `frame` of a sequence. */
function shownFile(image, path, frame) {
	if (packedFile(image)) return path;
	const source = imageSource(image);
	if (source === 6) return tilePath(path, image.list("tiles")[0]?.number("tile_number") ?? 1001);
	if (source === 2 && frame !== null) return sequencePath(path, frame);
	return path;
}
/**
* The stored path of the file the scene shows for an image, at `frame` for a sequence, with Blender's "//" relative
* prefix removed, or the image's name when it has no path.
*/
function imagePath(image, frame) {
	const own = image.string("name") || image.string("filepath");
	const stored = shownFile(image, own.startsWith("//") ? `${relativePathFolder(image)}${own.slice(2)}` : own, frame);
	if (stored.startsWith("//")) return {
		path: stored.slice(2),
		relative: true
	};
	if (stored === "") return {
		path: idName(image),
		relative: true
	};
	return {
		path: stored,
		relative: false
	};
}
/** The bytes of the file packed into an image, as a view of the file's bytes, and the block that holds them. */
function packedData(file, image) {
	const packed = packedFile(image);
	if (!packed) return null;
	const block = packed.target("data");
	if (!block) return null;
	const size = Math.min(Math.max(packed.number("size"), 0), block.size);
	return {
		block,
		bytes: file.bytes.subarray(block.offset, block.offset + size)
	};
}
/**
* An image's bytes: packed in the file, or read by the paths it stores, its first tile's for a UDIM image. Null for an
* image that is not one file, such as a sequence, whose frame each Image Texture node picks.
*/
async function imageBytes(file, image, readImage) {
	if (image.typeName !== "Image") return null;
	const packed = packedData(file, image);
	if (packed) return packed.bytes;
	if (!readsFile(image, null)) return null;
	const { path } = imagePath(image, null);
	return path === "" ? null : readImage(path);
}
/**
* Whether every pixel of each image is gray, by the image's offset, for the images the check can tell. The images read
* whole come first, so that samples never take the budget they need.
*/
async function grayImages(file, candidates, readImage) {
	const gray = /* @__PURE__ */ new Map();
	const budget = { bytes: GRAY_CHECK_BYTES };
	const whole = candidates.filter((candidate) => candidate.read === "whole");
	const sampled = candidates.filter((candidate) => candidate.read === "sample");
	for (const { image, read } of [...whole, ...sampled]) {
		const bytes = await imageBytes(file, image, readImage);
		const known = bytes ? await isGrayImage(bytes, budget, read === "sample" ? GRAY_SAMPLE_BYTES : void 0) : null;
		if (known !== null) gray.set(image.offset, known);
	}
	return gray;
}
/**
* The images the materials sample: one for each block of packed bytes, however many Image datablocks point at it, one
* for each stored path, and one for each image no file holds. An image linked from another .blend file has no file,
* since this file holds only its name, unless the image was packed with its library.
*/
var SceneImages = class {
	images = [];
	#index = /* @__PURE__ */ new Map();
	#file;
	constructor(file) {
		this.#file = file;
	}
	indexOf({ image, frame }) {
		const name = idName(image);
		if (image.typeName !== "Image") return this.#add(`none ${image.offset}`, () => none(name));
		const packed = packedFile(image);
		if (!packed && !readsFile(image, frame)) return this.#add(`none ${image.offset}`, () => none(name));
		const path = imagePath(image, frame);
		if (packed) {
			const data = packedData(this.#file, image);
			const key = data ? `packed block ${data.block.index}` : `packed image ${image.offset}`;
			return this.#add(key, () => ({
				name,
				source: "packed",
				...path,
				packed: data?.bytes.slice() ?? null
			}));
		}
		return this.#add(JSON.stringify([path.path, path.relative]), () => ({
			name,
			source: "file",
			...path,
			packed: null
		}));
	}
	#add(key, image) {
		const known = this.#index.get(key);
		if (known !== void 0) return known;
		this.images.push(image());
		this.#index.set(key, this.images.length - 1);
		return this.images.length - 1;
	}
};
function none(name) {
	return {
		name,
		source: "none",
		path: "",
		relative: true,
		packed: null
	};
}
/** The color space a texture slot decodes its image in when the material does not say. */
function slotColorSpace(slot) {
	return slot === "color" ? "srgb" : "linear";
}
function vertexColorUse(shown) {
	if (shown === "colors") return "multiply";
	return shown === "black" ? "black" : "none";
}
function buildMaterials$2(scene, images) {
	return scene.materials.map((draft, index) => {
		const uvMaps = scene.materialUvs[index];
		const ref = (use, slot) => use ? {
			image: images.indexOf(use),
			uvSet: uvSetFor(uvMaps, use.uvMap),
			wrapU: use.wrap,
			wrapV: use.wrap,
			transform: use.transform,
			alpha: use.alpha,
			colorSpace: use.colorSpace ?? slotColorSpace(slot)
		} : null;
		const baseColorTexture = ref(draft.baseColorImage, "color");
		const metallicRoughnessTexture = ref(draft.metallicRoughnessImage, "data");
		const emissiveTexture = ref(draft.emissiveImage, "color");
		const colors = scene.materialColors[index];
		const baseColorUse = vertexColorUse(colors?.baseColor ?? null);
		const emissiveUse = vertexColorUse(colors?.emissive ?? null);
		const [red, green, blue, alpha] = draft.baseColor;
		return {
			name: draft.name,
			baseColor: baseColorUse === "black" ? [
				0,
				0,
				0,
				alpha
			] : [
				red,
				green,
				blue,
				alpha
			],
			baseColorTexture,
			metallic: draft.metallic,
			roughness: draft.roughness,
			metallicRoughnessTexture,
			roughnessTexture: ref(draft.roughnessImage, "data"),
			metalnessTexture: ref(draft.metalnessImage, "data"),
			normalTexture: ref(draft.normalImage, "data"),
			normalScale: draft.normalScale,
			emissive: emissiveUse === "black" ? [
				0,
				0,
				0
			] : draft.emissive,
			emissiveTexture,
			alphaMode: draft.alphaMode,
			alphaCutoff: draft.alphaCutoff,
			doubleSided: draft.doubleSided,
			vertexColors: {
				baseColor: baseColorUse,
				emissive: emissiveUse
			}
		};
	});
}
function buildClipList$1(clips) {
	return clips.map((clip) => ({
		name: clip.name,
		duration: clip.duration,
		tracks: clip.tracks,
		curveKeyTimes: clip.curveTimes,
		fileFrames: clip.fileFrames
	}));
}
function versionOf(file) {
	return `${Math.floor(file.version / 100)}.${file.version % 100}`;
}
function unreadable(error) {
	return new BlendReadError("unreadable", `Not a readable Blender file: ${error.message}`, error.message, { cause: error });
}
async function parse(bytes) {
	try {
		return readBlendFile(await decompressBlend(bytes));
	} catch (error) {
		if (error instanceof BlendParseError) throw unreadable(error);
		throw error;
	}
}
/** What `read` gives, with the errors of reading the file's scene as read errors. */
function readingScene(read) {
	try {
		return read();
	} catch (error) {
		if (error instanceof BlendParseError) throw unreadable(error);
		if (error instanceof BlendLimitError) throw new BlendReadError("too-deep", `The scene ${error.message}`, error.message, { cause: error });
		const reason = error instanceof Error ? error.message : String(error);
		throw new BlendReadError("failed", `Could not read the scene: ${reason}`, reason, { cause: error });
	}
}
function readScene$1(file, contents, isGray) {
	const actions = readActions(file);
	const scene = buildScene$1(file, isGray, contents, actions);
	return {
		scene,
		clips: buildClips$1(scene, actions, scene.warnings)
	};
}
/**
* Reads the scene of a .blend file: its meshes, armatures, materials and actions, as Blender shows them at the scene's
* start frame. Throws a `BlendReadError` for a file it cannot read.
*/
async function readBlend(bytes, options = {}) {
	const file = await parse(bytes);
	const blenderVersion = versionOf(file);
	if (file.version < OLDEST_VERSION) throw new BlendReadError("too-old", `Saved by Blender ${blenderVersion}; files from Blender 2.80 on can be read`, blenderVersion);
	const readImage = options.readImage ?? (() => Promise.resolve(null));
	const contents = readingScene(() => collectSceneObjects(file));
	const gray = await grayImages(file, readingScene(() => grayCandidates(file, contents)), readImage);
	const { scene, clips } = readingScene(() => readScene$1(file, contents, (image) => gray.get(image.offset) ?? null));
	const images = new SceneImages(file);
	const materials = buildMaterials$2(scene, images);
	return {
		blenderVersion,
		fps: scene.fps,
		unitScale: scene.unitScale,
		nodes: buildNodes$2(scene),
		meshes: scene.meshes,
		skeletons: scene.skeletons,
		materials,
		images: images.images,
		clips: buildClipList$1(clips),
		warnings: [
			...scene.warnings,
			...skinMotionWarnings(scene, clips),
			...restPositionWarnings(scene, clips),
			...driverWarnings(scene)
		]
	};
}
//#endregion
//#region ../../packages/import-blend/src/texture-files.ts
/** A stored path with "/" separators and its "." and ".." segments resolved, so that spellings of one path match. */
function normalizedPath(path) {
	const segments = [];
	for (const segment of path.replaceAll("\\", "/").split("/")) {
		if (segment === "." || segment === "" && segments.length > 0) continue;
		const last = segments.at(-1);
		if (segment === ".." && last !== void 0 && last !== "" && last !== "..") segments.pop();
		else segments.push(segment);
	}
	return segments.join("/");
}
/**
* Keeps one texture for each image file found, however many stored paths lead to it, as a relative and an absolute
* path to one file do, and points the materials at the textures kept.
*/
function shareFoundTextures(textures, materials) {
	const kept = [];
	const byFoundPath = /* @__PURE__ */ new Map();
	const moved = textures.map((texture) => {
		const known = texture.foundPath === null ? void 0 : byFoundPath.get(texture.foundPath);
		if (known !== void 0) return known;
		kept.push(texture);
		if (texture.foundPath !== null) byFoundPath.set(texture.foundPath, kept.length - 1);
		return kept.length - 1;
	});
	if (kept.length === textures.length) return {
		textures: kept,
		materials: [...materials]
	};
	const remap = (ref) => ref && {
		...ref,
		texture: moved[ref.texture] ?? ref.texture
	};
	return {
		textures: kept,
		materials: materials.map((material) => {
			const shared = { ...material };
			for (const key of TEXTURE_REF_KEYS) shared[key] = remap(material[key]);
			return shared;
		})
	};
}
function joinWarning(first, next) {
	const joined = { ...first };
	const details = [...new Set([first.detail, next.detail].flatMap((detail) => detail === void 0 ? [] : [detail]))];
	if (details.length > 0) joined.detail = details.join("; ");
	const materials = [.../* @__PURE__ */ new Set([...first.materials ?? [], ...next.materials ?? []])];
	if (materials.length > 0) joined.materials = materials;
	const uses = [...first.uses ?? []];
	for (const use of next.uses ?? []) if (!uses.some((known) => known.material === use.material && known.slot === use.slot)) uses.push(use);
	if (uses.length > 0) joined.uses = uses;
	return joined;
}
/**
* One warning for each id, since a review keeps only the first warning with an id: the texture warnings for files of
* one name in different folders, which share an id, join their details, materials and uses.
*/
function joinWarningsById(warnings) {
	const joined = /* @__PURE__ */ new Map();
	for (const warning of warnings) {
		const id = warningId(warning);
		const first = joined.get(id);
		joined.set(id, first ? joinWarning(first, warning) : warning);
	}
	return [...joined.values()];
}
//#endregion
//#region ../../packages/import-blend/src/topology.ts
/**
* The fingerprint of a mesh's faces: each face fanned from its first corner, in the triangles' order, so that it does
* not change with the positions that pick Blender's split, and triangle n stays in the face it is in.
*/
function fanFingerprint(mesh) {
	const { offsets, vertices } = mesh.faces;
	const indices = new Uint32Array(mesh.triangleFaces.length * 3);
	let fan = 0;
	for (let position = 0; position < mesh.triangleFaces.length; position++) {
		const face = mesh.triangleFaces[position] ?? 0;
		fan = position > 0 && mesh.triangleFaces[position - 1] === face ? fan + 1 : 0;
		const start = offsets[face] ?? 0;
		indices[position * 3] = vertices[start] ?? 0;
		indices[position * 3 + 1] = vertices[start + fan + 1] ?? 0;
		indices[position * 3 + 2] = vertices[start + fan + 2] ?? 0;
	}
	return topologyFingerprint({
		indices,
		sourceVertex: Uint32Array.from({ length: mesh.sourceVertexCount }, (_, vertex) => vertex),
		sourceVertexCount: mesh.sourceVertexCount
	});
}
//#endregion
//#region ../../packages/import-blend/src/importer.ts
/** Blender's own rotation for Z-up content in a Y-up scene: −90° about X. */
var MINUS_90_ABOUT_X$1 = [
	-Math.SQRT1_2,
	0,
	0,
	Math.SQRT1_2
];
/** The gray Blender's default material shows, for a base color whose image is missing. */
var UNTEXTURED = .8;
/** The roughness Blender's default material shows, for a packed metallic-roughness image that is missing. */
var UNTEXTURED_ROUGHNESS = .5;
function buildNodes$1(scene) {
	const paths = buildNodePaths(scene.nodes);
	return scene.nodes.map((node, index) => ({
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
function buildMesh(mesh) {
	return {
		name: mesh.name,
		geometryName: mesh.dataName,
		positions: mesh.positions,
		normals: mesh.normals,
		uvs: mesh.uvs,
		colors: mesh.colors,
		skeleton: mesh.skin?.skeleton ?? null,
		bindMatrix: mesh.skin?.bindMatrix ?? null,
		joints: mesh.skin?.joints ?? null,
		weights: mesh.skin?.weights ?? null,
		indices: mesh.indices,
		groups: mesh.groups,
		morphTargets: mesh.morphTargets.map(({ name, defaultWeight, positions, normals }) => ({
			name,
			defaultWeight,
			positions,
			normals
		})),
		sourceVertex: mesh.sourceVertex,
		sourceVertexCount: mesh.sourceVertexCount,
		topology: fanFingerprint(mesh),
		restPositions: mesh.restPositions,
		skinWeights: mesh.skin?.sourceWeights ?? null
	};
}
function cached(cache, key, load) {
	let value = cache.get(key);
	if (!value) {
		value = load();
		cache.set(key, value);
	}
	return value;
}
/**
* `findFile` and `locateFile` that look each stored path up once and read each file found once, however many stored
* paths lead to it: the gray check and the textures both read some images, and Image datablocks may store many paths
* to one file.
*/
function searchingOnce(request) {
	const located = /* @__PURE__ */ new Map();
	const read = /* @__PURE__ */ new Map();
	const locateFile = (storedPath) => cached(located, storedPath, () => request.locateFile(storedPath));
	const findFile = async (storedPath) => {
		const path = await locateFile(storedPath);
		return path === null ? null : cached(read, path, () => request.findFile(storedPath));
	};
	return {
		findFile,
		locateFile
	};
}
function storedPaths(image) {
	return {
		relative: image.path,
		absolute: image.relative ? "" : image.path
	};
}
/**
* The texture files the materials use: one for each image file found through a relative path, however many images
* store a path to it and however they spell it, one for each other stored path, however it is spelled, and one for each
* image of packed bytes. Absolute paths keep their own texture files, so the textures note each of them.
*/
var ImageFiles = class {
	files = [];
	#index = /* @__PURE__ */ new Map();
	#images;
	#locateFile;
	constructor(images, locateFile) {
		this.#images = images;
		this.#locateFile = locateFile;
	}
	async indexOf(index) {
		const image = this.#images[index];
		if (!image || image.source === "none") return null;
		const paths = storedPaths(image);
		if (image.source === "packed") return this.#add(`packed image ${index}`, paths, image.packed);
		const spelled = `path ${normalizedPath(paths.relative)}`;
		const known = this.#index.get(spelled);
		if (known !== void 0) return known;
		const located = parseStoredPath(paths.relative).relative === null ? null : await this.#locateFile(paths.relative);
		const file = this.#add(located === null ? spelled : `found ${located}`, paths, null);
		this.#index.set(spelled, file);
		return file;
	}
	#add(key, paths, content) {
		const known = this.#index.get(key);
		if (known !== void 0) return known;
		this.files.push({
			...paths,
			linked: true,
			content
		});
		this.#index.set(key, this.files.length - 1);
		return this.files.length - 1;
	}
};
/** What a texture reference of a key means when it leaves out its alpha or its color space. */
function unsetSampling(key) {
	return {
		alpha: key === "baseColorTexture" ? "opacity" : "none",
		colorSpace: key === "baseColorTexture" || key === "emissiveTexture" ? "srgb" : "linear"
	};
}
/** How a material samples an image for a key: its UV set and wrap, with its alpha and color space where not the key's. */
function samplingOf(ref, key) {
	const sampling = {
		uvSet: ref.uvSet,
		wrapU: ref.wrapU,
		wrapV: ref.wrapV,
		transform: ref.transform
	};
	const unset = unsetSampling(key);
	if (ref.alpha !== unset.alpha) sampling.alpha = ref.alpha;
	if (ref.colorSpace !== unset.colorSpace) sampling.colorSpace = ref.colorSpace;
	return sampling;
}
async function buildMaterials$1(materials, images, textures) {
	const result = [];
	for (const source of materials) {
		const missingTextures = {};
		const missingTextureSampling = {};
		const ref = async (blendRef, key) => {
			if (!blendRef) return null;
			const file = await images.indexOf(blendRef.image);
			if (file === null) return null;
			const slot = TEXTURE_SLOTS.find((candidate) => TEXTURE_SLOT_KEYS[candidate] === key);
			const sampling = samplingOf(blendRef, key);
			const texture = await textures.resolve(file, source.name, slot);
			if (texture !== null) return {
				texture,
				...sampling
			};
			if (slot) {
				missingTextures[slot] = textures.storedPath(file);
				missingTextureSampling[slot] = sampling;
			}
			return null;
		};
		const baseColorTexture = await ref(source.baseColorTexture, "baseColorTexture");
		const metallicRoughnessTexture = await ref(source.metallicRoughnessTexture, "metallicRoughnessTexture");
		const emissiveTexture = await ref(source.emissiveTexture, "emissiveTexture");
		const missingPacked = source.metallicRoughnessTexture !== null && !metallicRoughnessTexture;
		const { baseColor: baseColorUse, emissive: emissiveUse } = source.vertexColors;
		const [red, green, blue, alpha] = source.baseColor;
		const material = {
			name: source.name,
			baseColor: baseColorUse === "black" || baseColorTexture || !source.baseColorTexture ? [
				red,
				green,
				blue,
				alpha
			] : [
				UNTEXTURED,
				UNTEXTURED,
				UNTEXTURED,
				alpha
			],
			baseColorTexture,
			metallic: missingPacked ? 0 : source.metallic,
			roughness: missingPacked ? UNTEXTURED_ROUGHNESS : source.roughness,
			metallicRoughnessTexture,
			roughnessTexture: await ref(source.roughnessTexture, "roughnessTexture"),
			metalnessTexture: await ref(source.metalnessTexture, "metalnessTexture"),
			normalTexture: await ref(source.normalTexture, "normalTexture"),
			normalScale: source.normalScale,
			occlusionTexture: null,
			emissive: !emissiveTexture && source.emissiveTexture ? [
				0,
				0,
				0
			] : source.emissive,
			emissiveTexture,
			alphaMode: source.alphaMode,
			alphaCutoff: source.alphaCutoff,
			doubleSided: source.doubleSided
		};
		if (baseColorUse === "multiply" || emissiveUse === "multiply") material.vertexColors = {
			baseColor: baseColorUse === "multiply",
			emissive: emissiveUse === "multiply"
		};
		if (Object.keys(missingTextures).length > 0) {
			material.missingTextures = missingTextures;
			material.missingTextureSampling = missingTextureSampling;
		}
		result.push(material);
	}
	return result;
}
/** The scene's clips, each with the file's frame at its frame 0 where the file's frames step one to a clip frame. */
function buildClipList(clips, fps) {
	const names = clipNames(clips.map((clip) => clip.name));
	const display = displayNames(names);
	return clips.map((clip, index) => {
		const frameCount = frameCountFor(clip.duration, fps);
		const { start, step } = clip.fileFrames;
		return {
			name: names[index] ?? clip.name,
			displayName: display[index] ?? clip.name,
			fps,
			duration: clip.duration,
			frameCount,
			tracks: clip.tracks,
			keyTimes: mergeKeyTimes(clip.curveKeyTimes),
			keyedEveryFrame: isKeyedEveryFrame(clip.curveKeyTimes, fps, frameCount),
			...step === 1 ? { sourceStartFrame: start } : {}
		};
	});
}
function unique(texts) {
	return [...new Set(texts)];
}
/**
* One warning for each code and subject, since a review keeps one warning per id: several, such as two ways a mesh
* deforms differently, join their distinct messages and details.
*/
function mergeWarnings(warnings) {
	const groups = /* @__PURE__ */ new Map();
	for (const warning of warnings) {
		const key = JSON.stringify([
			warning.code,
			warning.subject.kind,
			warning.subject.name
		]);
		groups.set(key, [...groups.get(key) ?? [], warning]);
	}
	return [...groups.values()].flatMap((group) => {
		const [first, ...rest] = group;
		if (!first) return [];
		if (rest.length === 0) return [first];
		const details = group.flatMap((warning) => warning.detail === void 0 ? [] : [warning.detail]);
		const merged = {
			...first,
			message: unique(group.map((warning) => warning.message)).join("; ")
		};
		if (details.length > 0) merged.detail = unique(details).join("; ");
		return [merged];
	});
}
function toImportWarning(warning, fileName) {
	const subject = warning.subject.kind === "file" && warning.subject.name === "" ? {
		kind: "file",
		name: fileName
	} : warning.subject;
	const message = warning.subject.kind === "file" && warning.subject.name === "" ? `${warning.message}: ${fileName}` : warning.message;
	return importWarning(warning.code, subject, message, void 0, warning.detail === void 0 ? {} : { detail: warning.detail });
}
/** Arcue's error for a file the reader refuses. */
function arcueError(request, error) {
	const { fileName } = request;
	const cause = error.cause ?? error;
	switch (error.reason) {
		case "unreadable": return new ArcueError("invalid-input", `${fileName} is not a readable Blender file: ${error.detail}`, { cause });
		case "too-old": return new ArcueError("invalid-input", `${fileName} was saved by Blender ${error.detail}. Arcue opens files from Blender 2.80 on; save it in a newer Blender.`);
		case "too-deep": return new ArcueError("invalid-input", `${fileName} ${error.detail}, more than Arcue can show.`, { cause });
		case "failed": return new ArcueError("internal", `Arcue could not read the scene in ${fileName}: ${error.detail}`, { cause });
	}
}
async function readScene(request, findFile) {
	try {
		return await readBlend(request.bytes, { readImage: async (path) => (await findFile(path))?.bytes ?? null });
	} catch (error) {
		if (error instanceof BlendReadError) throw arcueError(request, error);
		throw error;
	}
}
/** Parts whose every mesh Blender hides start hidden, so the view matches Blender's. */
function hideBlenderHiddenParts(parts, scene) {
	const hiddenMeshes = new Set(scene.nodes.flatMap((node) => node.hidden && node.mesh !== null ? [node.mesh] : []));
	return parts.map((part) => {
		const meshes = part.levels.flatMap((level) => level.meshes);
		return meshes.length > 0 && meshes.every((mesh) => hiddenMeshes.has(mesh)) ? {
			...part,
			hiddenByDefault: true
		} : part;
	});
}
async function importBlend(request) {
	const { findFile, locateFile } = searchingOnce(request);
	const scene = await readScene(request, findFile);
	const images = new ImageFiles(scene.images, locateFile);
	const textures = createTextureResolver(images.files, findFile, locateFile);
	const materials = await buildMaterials$1(scene.materials, images, textures);
	const nodes = buildNodes$1(scene);
	const meshes = scene.meshes.map(buildMesh);
	const parts = hideBlenderHiddenParts(describeParts(nodes), scene);
	const warnings = mergeWarnings([...scene.warnings, ...unshownUvSetWarnings(materials)]).map((warning) => toImportWarning(warning, request.fileName));
	const shared = shareFoundTextures(textures.textures, materials);
	return {
		source: {
			format: "blend",
			exporter: {
				name: "Blender",
				version: scene.blenderVersion
			},
			fps: scene.fps,
			originalSpace: {
				axes: {
					right: "+X",
					up: "+Z",
					front: "-Y"
				},
				unitMeters: scene.unitScale
			},
			conversion: {
				scale: scene.unitScale,
				rotation: MINUS_90_ABOUT_X$1
			},
			warnings: [...warnings, ...joinWarningsById(await textures.warnings())]
		},
		nodes,
		meshes,
		skeletons: scene.skeletons,
		materials: shared.materials,
		textures: shared.textures,
		clips: buildClipList(scene.clips, scene.fps),
		parts,
		bounds: defaultViewBounds(meshes, parts)
	};
}
var blendImporter = {
	format: "blend",
	extensions: [".blend"],
	import: importBlend
};
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
		const missingTextureSampling = {};
		const ref = async (wire, slot) => {
			if (!wire) return null;
			const sampling = {
				uvSet: uvSetIndex(meshes, index, wire.uvSet),
				wrapU: wire.wrapU,
				wrapV: wire.wrapV,
				transform: wire.transform
			};
			const texture = await textures.resolve(wire.file, material.name, slot);
			if (texture === null) {
				if (slot) {
					missingTextures[slot] = textures.storedPath(wire.file);
					missingTextureSampling[slot] = sampling;
				}
				return null;
			}
			return {
				texture,
				...sampling
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
		if (Object.keys(missingTextures).length > 0) {
			built.missingTextures = missingTextures;
			built.missingTextureSampling = missingTextureSampling;
		}
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
	const nodes = buildNodes(parsed);
	if (nestsTooDeep$1(nodes)) throw new ArcueError("invalid-input", `${request.fileName} nests objects and bones more than ${MAX_NODE_DEPTH$1} levels deep, more than Arcue can show.`);
	const meshes = parsed.meshes.map((mesh) => ({
		...mesh,
		topology: topologyFingerprint(mesh)
	}));
	const textures = createTextureResolver(parsed.textureFiles, request.findFile, request.locateFile);
	const materials = await buildMaterials(parsed.materials, meshes, textures);
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
				...await textures.warnings(),
				...unshownUvSetWarnings(materials)
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
//#region ../../packages/platform-node/src/import-worker.ts
parentPort?.once("message", (port) => {
	serveImportWorker(portEndpoint(port), [fbxImporter, blendImporter]);
});
//#endregion
export {};
