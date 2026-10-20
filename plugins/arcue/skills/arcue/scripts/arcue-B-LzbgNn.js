//#region ../../node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js
function getEnumValues(entries) {
	const numericValues = Object.values(entries).filter((v) => typeof v === "number");
	return Object.entries(entries).filter(([k, _]) => numericValues.indexOf(+k) === -1).map(([_, v]) => v);
}
function joinValues(array, separator = "|") {
	return array.map((val) => stringifyPrimitive(val)).join(separator);
}
function jsonStringifyReplacer(_, value) {
	if (typeof value === "bigint") return value.toString();
	return value;
}
var Cached = class {
	constructor(getter) {
		this._getter = getter;
		this._value = void 0;
	}
	get value() {
		const getter = this._getter;
		if (getter !== void 0) {
			this._value = getter();
			this._getter = void 0;
		}
		return this._value;
	}
};
function cached(getter) {
	return new Cached(getter);
}
function nullish(input) {
	return input === null || input === void 0;
}
function cleanRegex(source) {
	const start = source.startsWith("^") ? 1 : 0;
	const end = source.endsWith("$") ? source.length - 1 : source.length;
	return source.slice(start, end);
}
function floatSafeRemainder(val, step) {
	const ratio = val / step;
	const roundedRatio = Math.round(ratio);
	const tolerance = 4 * Number.EPSILON * Math.max(Math.abs(ratio), 1);
	if (Math.abs(ratio - roundedRatio) < tolerance) return 0;
	return ratio - roundedRatio;
}
function assignProp(target, prop, value) {
	Object.defineProperty(target, prop, {
		value,
		writable: true,
		enumerable: true,
		configurable: true
	});
}
/**
* Whichever object a def's `shape` currently answers from: the one the caller passed until the first read, the frozen copy after it.
*
* Its keys and descriptors read without invoking anything, which is what lets a discriminated union check its discriminator, and the cycle walk read a shape, without resolving a getter that references the schema being constructed. A def that answers `shape` from an accessor of its own has none.
*/
function rawShape(def) {
	const desc = Object.getOwnPropertyDescriptor(def, "shape");
	return desc?.get ? desc.get.raw : desc?.value;
}
function sourceShape(schema) {
	return rawShape(schema._zod.def) ?? schema._zod.def.shape;
}
function deferProp(target, key, getter) {
	Object.defineProperty(target, key, {
		get() {
			const value = getter();
			assignProp(this, key, value);
			return value;
		},
		enumerable: true,
		configurable: true
	});
}
function putProp(target, key, value) {
	if (key in target) assignProp(target, key, value);
	else target[key] = value;
}
/**
* Copies `keys` of `source`'s shape onto `target`, each value passed through `wrap`.
*
* A key the source has resolved is copied through now, so the derived shape states it outright and nothing has to resolve it to learn what it holds. A key the source still defers stays deferred, and reads back through the source's own `shape`, so it resolves once and both shapes get that one schema.
*/
function mirrorShape(target, source, keys, wrap) {
	const raw = sourceShape(source);
	for (const key of keys) {
		const desc = Object.getOwnPropertyDescriptor(raw, key);
		if (!desc.enumerable) continue;
		if (desc.get) deferProp(target, key, () => {
			const value = source._zod.def.shape[key];
			return wrap ? wrap(value, key) : value;
		});
		else putProp(target, key, wrap ? wrap(desc.value, key) : desc.value);
	}
}
function mirrorProps(target, source) {
	for (const key of Reflect.ownKeys(source)) {
		const desc = Object.getOwnPropertyDescriptor(source, key);
		if (!desc.enumerable) continue;
		if (desc.get) deferProp(target, key, () => source[key]);
		else putProp(target, key, desc.value);
	}
}
function mergeDefs(...defs) {
	const mergedDescriptors = {};
	for (const def of defs) {
		const descriptors = Object.getOwnPropertyDescriptors(def);
		Object.assign(mergedDescriptors, descriptors);
	}
	return Object.defineProperties({}, mergedDescriptors);
}
function esc(str) {
	return JSON.stringify(str);
}
function slugify(input) {
	return input.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");
}
var captureStackTrace = "captureStackTrace" in Error ? Error.captureStackTrace : (..._args) => {};
function isObject(data) {
	return typeof data === "object" && data !== null && !Array.isArray(data);
}
var allowsEval = /* @__PURE__*/ cached(() => {
	if (globalConfig.jitless) return false;
	if (typeof navigator !== "undefined" && navigator?.userAgent?.includes("Cloudflare")) return false;
	try {
		new Function("");
		return true;
	} catch (_) {
		return false;
	}
});
function isPlainObject(o) {
	if (isObject(o) === false) return false;
	const ctor = o.constructor;
	if (ctor === void 0) return true;
	if (typeof ctor !== "function") return true;
	const prot = ctor.prototype;
	if (isObject(prot) === false) return false;
	if (Object.prototype.hasOwnProperty.call(prot, "isPrototypeOf") === false) return false;
	return true;
}
function shallowClone(o) {
	if (isPlainObject(o)) return { ...o };
	if (Array.isArray(o)) return [...o];
	if (o instanceof Map) return new Map(o);
	if (o instanceof Set) return new Set(o);
	return o;
}
var propertyKeyTypes = /* @__PURE__*/ new Set([
	"string",
	"number",
	"symbol"
]);
function escapeRegex(str) {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function clone(inst, def, params) {
	const cl = new inst._zod.constr(def ?? inst._zod.def);
	if (!def || params?.parent) cl._zod.parent = inst;
	return cl;
}
function normalizeParams(_params) {
	const params = _params;
	if (!params) return {};
	if (typeof params === "string") return { error: () => params };
	if (params?.message !== void 0) {
		if (params?.error !== void 0) throw new Error("Cannot specify both `message` and `error` params");
		params.error = params.message;
	}
	delete params.message;
	if (typeof params.error === "string") return {
		...params,
		error: () => params.error
	};
	return params;
}
function stringifyPrimitive(value) {
	if (typeof value === "bigint") return value.toString() + "n";
	if (typeof value === "string") return `"${value}"`;
	return `${value}`;
}
function optionalKeys(shape) {
	return Object.keys(shape).filter((k) => {
		return shape[k]._zod.optin !== void 0 && shape[k]._zod.optout === "optional";
	});
}
var NUMBER_FORMAT_RANGES = /*@__PURE__*/ (() => ({
	safeint: [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
	int32: [-2147483648, 2147483647],
	uint32: [0, 4294967295],
	float32: [-34028234663852886e22, 34028234663852886e22],
	float64: [-Number.MAX_VALUE, Number.MAX_VALUE]
}))();
var BIGINT_FORMAT_RANGES = {
	int64: [/* @__PURE__*/ BigInt("-9223372036854775808"), /* @__PURE__*/ BigInt("9223372036854775807")],
	uint64: [/* @__PURE__*/ BigInt(0), /* @__PURE__*/ BigInt("18446744073709551615")]
};
function pick(schema, mask) {
	const currDef = schema._zod.def;
	const checks = currDef.checks;
	if (checks && checks.length > 0) throw new Error(".pick() cannot be used on object schemas containing refinements");
	const newShape = {};
	mirrorShape(newShape, schema, maskedKeys(schema, mask));
	return clone(schema, mergeDefs(currDef, {
		shape: newShape,
		checks: []
	}));
}
function maskedKeys(schema, mask) {
	const raw = sourceShape(schema);
	const keys = [];
	for (const key of Reflect.ownKeys(mask)) {
		if (!Object.getOwnPropertyDescriptor(raw, key)?.enumerable) throw new Error(`Unrecognized key: "${String(key)}"`);
		if (mask[key]) keys.push(key);
	}
	return keys;
}
function omit(schema, mask) {
	const currDef = schema._zod.def;
	const checks = currDef.checks;
	if (checks && checks.length > 0) throw new Error(".omit() cannot be used on object schemas containing refinements");
	const omitted = new Set(maskedKeys(schema, mask));
	const newShape = {};
	mirrorShape(newShape, schema, Reflect.ownKeys(sourceShape(schema)).filter((key) => !omitted.has(key)));
	return clone(schema, mergeDefs(currDef, {
		shape: newShape,
		checks: []
	}));
}
function extend(schema, shape) {
	if (!isPlainObject(shape)) throw new Error("Invalid input to extend: expected a plain object");
	const checks = schema._zod.def.checks;
	if (checks && checks.length > 0) {
		const existingShape = sourceShape(schema);
		for (const key of Reflect.ownKeys(shape)) if (Object.getOwnPropertyDescriptor(existingShape, key) !== void 0) throw new Error("Cannot overwrite keys on object schemas containing refinements. Use `.safeExtend()` instead.");
	}
	return clone(schema, mergeDefs(schema._zod.def, { shape: extended(schema, shape) }));
}
function extended(schema, shape) {
	const newShape = {};
	mirrorShape(newShape, schema, Reflect.ownKeys(sourceShape(schema)));
	mirrorProps(newShape, shape);
	return newShape;
}
function safeExtend(schema, shape) {
	if (!isPlainObject(shape)) throw new Error("Invalid input to safeExtend: expected a plain object");
	return clone(schema, mergeDefs(schema._zod.def, { shape: extended(schema, shape) }));
}
function merge(a, b) {
	if (!b?._zod?.def) throw new Error("Invalid input to merge: expected an object schema. To merge a plain shape, use `.extend()`.");
	if (a._zod.def.checks?.length) throw new Error(".merge() cannot be used on object schemas containing refinements. Use .safeExtend() instead.");
	const newShape = {};
	mirrorShape(newShape, a, Reflect.ownKeys(sourceShape(a)));
	mirrorShape(newShape, b, Reflect.ownKeys(sourceShape(b)));
	return clone(a, mergeDefs(a._zod.def, {
		shape: newShape,
		get catchall() {
			return b._zod.def.catchall;
		},
		checks: b._zod.def.checks ?? []
	}));
}
function partial(Class, schema, mask, name = "partial") {
	const checks = schema._zod.def.checks;
	if (checks && checks.length > 0) throw new Error(`.${name}() cannot be used on object schemas containing refinements`);
	const selected = mask ? new Set(maskedKeys(schema, mask)) : void 0;
	const newShape = {};
	mirrorShape(newShape, schema, Reflect.ownKeys(sourceShape(schema)), Class && ((value, key) => selected && !selected.has(key) ? value : new Class({
		type: "optional",
		innerType: value
	})));
	return clone(schema, mergeDefs(schema._zod.def, {
		shape: newShape,
		checks: []
	}));
}
function required(Class, schema, mask) {
	const selected = mask ? new Set(maskedKeys(schema, mask)) : void 0;
	const newShape = {};
	mirrorShape(newShape, schema, Reflect.ownKeys(sourceShape(schema)), (value, key) => selected && !selected.has(key) ? value : new Class({
		type: "nonoptional",
		innerType: value
	}));
	return clone(schema, mergeDefs(schema._zod.def, { shape: newShape }));
}
function aborted(x, startIndex = 0) {
	if (x.aborted === true) return true;
	for (let i = startIndex; i < x.issues.length; i++) if (x.issues[i]?.continue !== true) return true;
	return false;
}
function explicitlyAborted(x, startIndex = 0) {
	if (x.aborted === true) return true;
	for (let i = startIndex; i < x.issues.length; i++) if (x.issues[i]?.continue === false) return true;
	return false;
}
function prefixIssues(path, issues) {
	return issues.map((iss) => {
		var _a;
		(_a = iss).path ?? (_a.path = []);
		iss.path.unshift(path);
		return iss;
	});
}
function unwrapMessage(message) {
	return typeof message === "string" ? message : message?.message;
}
function attachSchema(issues, start, inst) {
	var _a;
	for (let i = start; i < issues.length; i++) (_a = issues[i]).schema ?? (_a.schema = inst);
}
function finalizeIssue(iss, ctx, config) {
	var _a;
	const traits = iss.inst?._zod?.traits;
	if (traits?.has("$ZodType")) {
		if (traits.has("$ZodCheck")) (_a = iss).schema ?? (_a.schema = iss.inst);
		else iss.schema = iss.inst;
	}
	const schemaError = iss.schema !== iss.inst ? iss.schema?._zod.def?.error : void 0;
	const message = iss.message ? iss.message : unwrapMessage(iss.inst?._zod.def?.error?.(iss)) ?? unwrapMessage(schemaError?.(iss)) ?? unwrapMessage(ctx?.error?.(iss)) ?? unwrapMessage(config.customError?.(iss)) ?? unwrapMessage(config.localeError?.(iss)) ?? "Invalid input";
	const full = {};
	for (const k of Object.keys(iss)) {
		if (k === "inst" || k === "schema" || k === "continue" || k === "input" || k === "__proto__") continue;
		full[k] = iss[k];
	}
	full.path ?? (full.path = []);
	full.message = message;
	if (ctx?.reportInput) full.input = iss.input;
	return full;
}
var highSurrogate = /[\uD800-\uDBFF]/;
function codePointLength(str) {
	const units = str.length;
	if (!highSurrogate.test(str)) return units;
	let count = units;
	for (let i = 0; i < units - 1; i++) if ((str.charCodeAt(i) & 64512) === 55296 && (str.charCodeAt(i + 1) & 64512) === 56320) {
		count--;
		i++;
	}
	return count;
}
function getLengthableOrigin(input) {
	if (Array.isArray(input)) return "array";
	if (typeof input === "string") return "string";
	return "unknown";
}
function parsedType(data) {
	const t = typeof data;
	switch (t) {
		case "number": return Number.isNaN(data) ? "nan" : "number";
		case "object": {
			if (data === null) return "null";
			if (Array.isArray(data)) return "array";
			const obj = data;
			if (obj && Object.getPrototypeOf(obj) !== Object.prototype && "constructor" in obj && obj.constructor) return obj.constructor.name;
		}
	}
	return t;
}
function issue(...args) {
	const [iss, input, inst] = args;
	if (typeof iss === "string") return {
		message: iss,
		code: "custom",
		input,
		inst
	};
	return { ...iss };
}
/**
* Installs a trait's members on its prototype. Each value builds that member for the instance on first read; the built value shadows the accessor as an own property, so a detached `const { parse } = schema` keeps working.
*
* Call this from a `proto` initializer, which runs once per prototype — never per instance.
*/
function members(proto, table) {
	for (const key in table) {
		const desc = Object.getOwnPropertyDescriptor(table, key);
		if (desc.get) Object.defineProperty(proto, key, {
			...desc,
			enumerable: false
		});
		else defineBound(proto, key, desc.value);
	}
}
/** Shadows a prototype member with an own value, so a getter that builds from the instance runs once. */
function own(inst, key, value, enumerable = true) {
	Object.defineProperty(inst, key, {
		configurable: true,
		writable: true,
		enumerable,
		value
	});
	return value;
}
/** Like {@link own}, for a member that was never an own data property and has to stay out of `Object.keys`. */
function hide(inst, key, value) {
	return own(inst, key, value, false);
}
/** Adds members a table derives from the instance: each builds on first read and shadows as own data, and assignment shadows the same way, as when these were own properties. */
function derived(computes, table) {
	for (const key in computes) {
		const compute = computes[key];
		Object.defineProperty(table, key, {
			configurable: true,
			enumerable: true,
			get() {
				return own(this, key, compute(this));
			},
			set(value) {
				own(this, key, value);
			}
		});
	}
	return table;
}
function defineBound(proto, key, fn) {
	Object.defineProperty(proto, key, {
		configurable: true,
		get() {
			return this == null ? fn : own(this, key, fn.bind(this));
		},
		set(value) {
			own(this, key, value);
		}
	});
}
/** Returns the prototype to install on, or `undefined` if this group is already installed on it. */
function claim(inst, sentinel) {
	const proto = Object.getPrototypeOf(inst);
	return sentinel in proto ? void 0 : proto;
}
var installing;
var broke = false;
var breaker = {
	configurable: true,
	get() {
		broke = true;
	}
};
/**
* Installs a lazily-derived internal on the `_zod` prototype of `inst`'s
* constructor, computed from the internals object itself and cached there on
* first read. One accessor per constructor rather than one per instance.
*/
function defineLazyInternal(inst, key, compute) {
	const proto = Object.getPrototypeOf(inst._zod);
	if (key in proto && installing !== inst._zod) {
		installing = void 0;
		return;
	}
	installing = inst._zod;
	Object.defineProperty(proto, key, {
		configurable: true,
		get() {
			Object.defineProperty(this, key, breaker);
			const outer = broke;
			broke = false;
			try {
				const value = compute(this);
				if (broke) delete this[key];
				else Object.defineProperty(this, key, {
					configurable: true,
					writable: true,
					value
				});
				broke = broke || outer;
				return value;
			} catch (err) {
				delete this[key];
				broke = broke || outer;
				throw err;
			}
		},
		set(value) {
			Object.defineProperty(this, key, {
				configurable: true,
				writable: true,
				value
			});
		}
	});
}
/**
* Installs `key` on `inst`'s prototype, computed by `make` on first read and cached there as an own
* data property. One accessor per constructor rather than one per instance, because an own accessor
* puts every instance after the first into v8 dictionary mode. The key doubles as the sentinel.
*/
function installLazyProp(inst, key, make, enumerable) {
	const proto = claim(inst, key);
	if (!proto) return;
	Object.defineProperty(proto, key, {
		configurable: true,
		get() {
			const desc = {
				configurable: true,
				writable: true,
				enumerable,
				value: void 0
			};
			Object.defineProperty(this, key, desc);
			desc.value = make(this);
			Object.defineProperty(this, key, desc);
			return desc.value;
		},
		set(value) {
			Object.defineProperty(this, key, {
				configurable: true,
				writable: true,
				enumerable,
				value
			});
		}
	});
}
/** Marks the thunk `_catch` synthesises for a constant catch value. `Function.length` cannot tell that thunk from a user callback — rest and defaulted parameters both report arity 0 — and a user callback reads `ctx.error`, whose issues only finalize correctly against the caller's per-parse error map. Provenance can say what arity cannot. A plain string key rather than `Symbol.for`, whose call at module scope no bundler can prove pure — the same shape that anchored `urlCanParse` into every build. */
var CONSTANT_CATCH = "~constantCatch";
/** Wraps a constant catch value in a thunk tagged with {@link CONSTANT_CATCH}. */
function constantCatch(value) {
	const fn = () => value;
	fn[CONSTANT_CATCH] = true;
	return fn;
}
//#endregion
//#region ../../node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/core.js
var _a$1;
var _zodDesc = {
	value: void 0,
	enumerable: false
};
var _E = "captureStackTrace" in Error ? Error : null;
function newError(Definition) {
	const E = _E;
	if (E) {
		const saved = E.stackTraceLimit;
		if (typeof saved === "number") {
			try {
				E.stackTraceLimit = 0;
			} catch {
				_E = null;
				return new Definition();
			}
			try {
				return new Definition();
			} finally {
				E.stackTraceLimit = saved;
			}
		}
	}
	return new Definition();
}
function $constructor(name, initializer, proto, params) {
	const zodProto = {};
	function Internals(def) {
		this.def = def;
		this.constr = _;
		this.traits = /* @__PURE__ */ new Set();
	}
	Internals.prototype = zodProto;
	const protoMembers = proto;
	const initialized = protoMembers && /* @__PURE__ */ new WeakSet();
	function init(inst, def) {
		if (!inst._zod) {
			_zodDesc.value = new Internals(def);
			try {
				Object.defineProperty(inst, "_zod", _zodDesc);
			} finally {
				_zodDesc.value = void 0;
			}
		} else if (inst._zod.traits.has(name)) return;
		inst._zod.traits.add(name);
		initializer(inst, def);
		if (initialized) {
			const own = Object.getPrototypeOf(inst);
			const ctorProto = inst._zod.constr.prototype;
			let up = own;
			while (up && up !== ctorProto) up = Object.getPrototypeOf(up);
			const target = up ?? own;
			if (!initialized.has(target)) {
				initialized.add(target);
				members(target, protoMembers);
			}
		}
		const proto = _.prototype;
		for (const k in proto) {
			if (!Object.prototype.hasOwnProperty.call(proto, k)) continue;
			if (!(k in inst)) inst[k] = proto[k].bind(inst);
		}
	}
	const Parent = params?.Parent ?? Object;
	class Definition extends Parent {}
	Object.defineProperty(Definition, "name", { value: name });
	function _(def) {
		const inst = params?.Parent ? newError(Definition) : this;
		init(inst, def);
		const deferred = inst._zod.deferred;
		if (deferred) {
			for (const fn of deferred) fn();
			inst._zod.deferred = void 0;
		}
		const pp = globalThis.__zod_globalConfig?.postProcessor;
		if (pp) pp(inst);
		return inst;
	}
	Object.defineProperty(_, "init", { value: init });
	Object.defineProperty(_, Symbol.hasInstance, { value: (inst) => {
		if (params?.Parent && inst instanceof params.Parent) return true;
		return inst?._zod?.traits?.has(name);
	} });
	Object.defineProperty(_, "name", { value: name });
	return _;
}
var $ZodAsyncError = class extends Error {
	constructor() {
		super(`Encountered Promise during synchronous parse. Use .parseAsync() instead.`);
	}
};
var $ZodEncodeError = class extends Error {
	constructor(name) {
		super(`Encountered unidirectional transform during encode: ${name}`);
		this.name = "ZodEncodeError";
	}
};
(_a$1 = globalThis).__zod_globalConfig ?? (_a$1.__zod_globalConfig = {});
var globalConfig = globalThis.__zod_globalConfig;
function config(newConfig) {
	if (newConfig) Object.assign(globalConfig, newConfig);
	return globalConfig;
}
//#endregion
//#region ../../node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/errors.js
function _getMessage() {
	const internals = this._zod;
	internals.message ?? (internals.message = JSON.stringify(internals.def, jsonStringifyReplacer, 2));
	return internals.message;
}
function _setMessage(value) {
	this._zod.message = value;
}
var _messageDesc = {
	get: _getMessage,
	set: _setMessage,
	enumerable: true,
	configurable: true
};
var _issuesDesc = {
	value: void 0,
	enumerable: false
};
var _installedToString = /* @__PURE__ */ new WeakSet([Object.prototype, Error.prototype]);
var initializer$1 = (inst, def) => {
	inst.name = "$ZodError";
	_issuesDesc.value = def;
	Object.defineProperty(inst, "issues", _issuesDesc);
	_issuesDesc.value = void 0;
	Object.defineProperty(inst, "message", _messageDesc);
	const proto = Object.getPrototypeOf(inst);
	if (!_installedToString.has(proto)) {
		_installedToString.add(proto);
		Object.defineProperty(proto, "toString", {
			configurable: true,
			enumerable: false,
			get() {
				const value = () => this.message;
				Object.defineProperty(this, "toString", {
					value,
					configurable: true,
					writable: true
				});
				return value;
			},
			set(value) {
				Object.defineProperty(this, "toString", {
					value,
					configurable: true,
					writable: true
				});
			}
		});
	}
};
var $ZodError = $constructor("$ZodError", initializer$1);
$constructor("$ZodError", initializer$1, void 0, { Parent: Error });
/** Get-or-create `obj[key]` as an own data property. A path segment naming an inherited member
* ("toString", "constructor") would otherwise read through to the prototype, and assigning
* "__proto__" would hit the setter instead of creating a key. */
function node(obj, key, make) {
	if (!Object.prototype.hasOwnProperty.call(obj, key)) {
		if (key === "__proto__") Object.defineProperty(obj, key, {
			value: make(),
			writable: true,
			enumerable: true,
			configurable: true
		});
		else obj[key] = make();
	}
	return obj[key];
}
function flattenError(error, mapper = (issue) => issue.message) {
	const fieldErrors = {};
	const formErrors = [];
	for (const sub of error.issues) if (sub.path.length > 0) node(fieldErrors, sub.path[0], () => []).push(mapper(sub));
	else formErrors.push(mapper(sub));
	return {
		formErrors,
		fieldErrors
	};
}
function formatError(error, mapper = (issue) => issue.message) {
	const fieldErrors = { _errors: [] };
	const processError = (error, path = []) => {
		for (const issue of error.issues) if (issue.code === "invalid_union" && issue.errors.length) issue.errors.map((issues) => processError({ issues }, [...path, ...issue.path]));
		else if (issue.code === "invalid_key") processError({ issues: issue.issues }, [...path, ...issue.path]);
		else if (issue.code === "invalid_element") processError({ issues: issue.issues }, [...path, ...issue.path]);
		else {
			const fullpath = [...path, ...issue.path];
			if (fullpath.length === 0) fieldErrors._errors.push(mapper(issue));
			else {
				let curr = fieldErrors;
				let i = 0;
				while (i < fullpath.length) {
					const el = fullpath[i];
					const terminal = i === fullpath.length - 1;
					if (el === "_errors") {
						if (terminal) curr._errors.push(mapper(issue));
						i++;
						continue;
					}
					if (!Object.prototype.hasOwnProperty.call(curr, el)) Object.defineProperty(curr, el, {
						value: { _errors: [] },
						enumerable: true,
						writable: true,
						configurable: true
					});
					const node = curr[el];
					if (terminal) node._errors.push(mapper(issue));
					curr = node;
					i++;
				}
			}
		}
	};
	processError(error);
	return fieldErrors;
}
//#endregion
//#region ../../node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/parse.js
function finalizeParams(callee, params) {
	return {
		callee: params?.callee ?? callee,
		Err: params?.Err
	};
}
var _parse = (_Err) => {
	const fn = (schema, value, _ctx, _params) => {
		const ctx = _ctx ? {
			..._ctx,
			async: false
		} : { async: false };
		const result = schema._zod.run({
			value,
			issues: []
		}, ctx);
		if (result instanceof Promise) throw new $ZodAsyncError();
		if (result.issues.length) {
			const e = new ((_params?.Err) ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
			captureStackTrace(e, _params?.callee ?? fn);
			throw e;
		}
		return result.value;
	};
	return fn;
};
var _parseAsync = (_Err) => {
	const fn = async (schema, value, _ctx, params) => {
		const ctx = _ctx ? {
			..._ctx,
			async: true
		} : { async: true };
		let result = schema._zod.run({
			value,
			issues: []
		}, ctx);
		if (result instanceof Promise) result = await result;
		if (result.issues.length) {
			const e = new ((params?.Err) ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
			captureStackTrace(e, params?.callee ?? fn);
			throw e;
		}
		return result.value;
	};
	return fn;
};
var _safeParse = (_Err) => (schema, value, _ctx) => {
	const ctx = _ctx ? {
		..._ctx,
		async: false
	} : { async: false };
	const result = schema._zod.run({
		value,
		issues: []
	}, ctx);
	if (result instanceof Promise) throw new $ZodAsyncError();
	return result.issues.length ? failure(_Err, result.issues, ctx) : {
		success: true,
		data: result.value
	};
};
function failure(Err, issues, ctx) {
	let error;
	return {
		success: false,
		get error() {
			if (!error) {
				error = new Err(issues.map((iss) => finalizeIssue(iss, ctx, config())));
				issues = void 0;
				ctx = void 0;
			}
			return error;
		},
		set error(e) {
			error = e;
			issues = void 0;
			ctx = void 0;
		}
	};
}
var _safeParseAsync = (_Err) => async (schema, value, _ctx) => {
	const ctx = _ctx ? {
		..._ctx,
		async: true
	} : { async: true };
	let result = schema._zod.run({
		value,
		issues: []
	}, ctx);
	if (result instanceof Promise) result = await result;
	return result.issues.length ? failure(_Err, result.issues, ctx) : {
		success: true,
		data: result.value
	};
};
var COMPILE_INVALID = /* @__PURE__ */ Symbol.for("zod.compile.invalid");
var COMPILE_FALLBACK = /* @__PURE__ */ Symbol.for("zod.compile.fallback");
var validate = ((schema, value, _ctx) => {
	const validator = schema._zod.bag.validator;
	if (validator !== void 0) {
		if (validator(value) !== COMPILE_INVALID) return true;
		if (validator.definite === true && _ctx === void 0) return false;
	}
	return validateFallback(schema, value, _ctx);
});
function validateFallback(schema, value, _ctx) {
	const ctx = _ctx ? {
		..._ctx,
		async: false,
		abortEarly: true
	} : {
		async: false,
		abortEarly: true
	};
	const fallbackRun = schema._zod.bag.fallbackRun;
	let result;
	if (fallbackRun) {
		ctx[COMPILE_FALLBACK] = true;
		result = fallbackRun({
			value,
			issues: []
		}, ctx);
	} else result = schema._zod.run({
		value,
		issues: []
	}, ctx);
	if (result instanceof Promise) throw new $ZodAsyncError();
	return result.issues.length === 0;
}
var validateAsync$1 = async (schema, value, _ctx) => {
	const ctx = _ctx ? {
		..._ctx,
		async: true,
		abortEarly: true
	} : {
		async: true,
		abortEarly: true
	};
	let result = schema._zod.run({
		value,
		issues: []
	}, ctx);
	if (result instanceof Promise) result = await result;
	return result.issues.length === 0;
};
var _encode = (_Err) => {
	const parse = _parse(_Err);
	const fn = (schema, value, _ctx, _params) => {
		const ctx = _ctx ? {
			..._ctx,
			direction: "backward"
		} : { direction: "backward" };
		return parse(schema, value, ctx, finalizeParams(fn, _params));
	};
	return fn;
};
var _decode = (_Err) => {
	const parse = _parse(_Err);
	const fn = (schema, value, _ctx, _params) => {
		return parse(schema, value, _ctx, finalizeParams(fn, _params));
	};
	return fn;
};
var _encodeAsync = (_Err) => {
	const parseAsync = _parseAsync(_Err);
	const fn = async (schema, value, _ctx, _params) => {
		const ctx = _ctx ? {
			..._ctx,
			direction: "backward"
		} : { direction: "backward" };
		return await parseAsync(schema, value, ctx, finalizeParams(fn, _params));
	};
	return fn;
};
var _decodeAsync = (_Err) => {
	const parseAsync = _parseAsync(_Err);
	const fn = async (schema, value, _ctx, _params) => {
		return await parseAsync(schema, value, _ctx, finalizeParams(fn, _params));
	};
	return fn;
};
var _safeEncode = (_Err) => (schema, value, _ctx) => {
	const ctx = _ctx ? {
		..._ctx,
		direction: "backward"
	} : { direction: "backward" };
	return _safeParse(_Err)(schema, value, ctx);
};
var _safeDecode = (_Err) => (schema, value, _ctx) => {
	return _safeParse(_Err)(schema, value, _ctx);
};
var _safeEncodeAsync = (_Err) => async (schema, value, _ctx) => {
	const ctx = _ctx ? {
		..._ctx,
		direction: "backward"
	} : { direction: "backward" };
	return _safeParseAsync(_Err)(schema, value, ctx);
};
var _safeDecodeAsync = (_Err) => async (schema, value, _ctx) => {
	return _safeParseAsync(_Err)(schema, value, _ctx);
};
//#endregion
//#region ../../node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js
/**
* @deprecated CUID v1 is deprecated by its authors due to information leakage
* (timestamps embedded in the id). Use {@link cuid2} instead.
* See https://github.com/paralleldrive/cuid.
*/
var cuid = /^[cC][0-9a-z]{6,}$/;
var cuid2 = /^[0-9a-z]+$/;
var ulid = /^[0-7][0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{25}$/;
var xid = /^[0-9a-vA-V]{20}$/;
var ksuid = /^[A-Za-z0-9]{27}$/;
var nanoid = /^[a-zA-Z0-9_-]{21}$/;
function nanoidOfLength(length) {
	return new RegExp(`^[a-zA-Z0-9_-]{${length}}$`);
}
/** ISO 8601-1 duration regex. Does not support the 8601-2 extensions like negative durations or fractional/negative components. */
var duration = /^P(?:(\d+W)|(?!.*W)(?=\d|T\d)(\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+([.,]\d+)?S)?)?)$/;
/** A regex for any UUID-like identifier: 8-4-4-4-12 hex pattern */
var guid = /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;
/** Returns a regex for validating an RFC 9562/4122 UUID.
*
* @param version Optionally specify a version 1-8. If no version is specified, all versions are supported. */
var uuid = (version) => {
	if (!version) return /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/;
	return new RegExp(`^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-${version}[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$`);
};
/** Practical email validation */
var email = /^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;
var _emoji$1 = `^(?=[\\s\\S]*[\\p{Extended_Pictographic}\\p{Regional_Indicator}\\u20E3])[\\p{Extended_Pictographic}\\p{Emoji_Component}]+$`;
function emoji() {
	return new RegExp(_emoji$1, "u");
}
var ipv4 = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
var ipv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))$/;
var cidrv4 = /^((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/([0-9]|[1-2][0-9]|3[0-2])$/;
var cidrv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
var base64 = /^$|^(?:[0-9a-zA-Z+/]{4})*(?:(?:[0-9a-zA-Z+/]{2}==)|(?:[0-9a-zA-Z+/]{3}=))?$/;
var base64url = /^(?:[A-Za-z0-9_-]{4})*(?:[A-Za-z0-9_-]{2,3})?$/;
var httpProtocol = /^https?$/;
var e164 = /^\+[1-9]\d{6,14}$/;
var dateSource = `(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))`;
/** Anchors a pattern source. The interpolation lives here rather than at the call site because
* esbuild will not drop a `@__PURE__` call whose own argument interpolates a variable, but it
* will drop `anchor(dateSource)`. Keeping it inline pinned `date` into every bundle. */
function anchor(source) {
	return new RegExp(`^${source}$`);
}
var date = /*@__PURE__*/ anchor(dateSource);
function timeSource(args) {
	const hhmm = `(?:[01]\\d|2[0-3]):[0-5]\\d`;
	return typeof args.precision === "number" ? args.precision === -1 ? `${hhmm}` : args.precision === 0 ? `${hhmm}:[0-5]\\d` : `${hhmm}:[0-5]\\d\\.\\d{${args.precision}}` : args.seconds ? `${hhmm}:[0-5]\\d(?:\\.\\d+)?` : `${hhmm}(?::[0-5]\\d(?:\\.\\d+)?)?`;
}
function time(args) {
	return new RegExp(`^${timeSource(args)}$`);
}
function datetime$1(args) {
	const opts = ["Z"];
	if (args.offset) opts.push(`([+-](?:[01]\\d|2[0-3]):[0-5]\\d)`);
	const qualified = `${timeSource({
		precision: args.precision,
		seconds: true
	})}(?:${opts.join("|")})`;
	const timeRegex = args.local ? `${qualified}|${timeSource({ precision: args.precision })}` : qualified;
	return new RegExp(`^${dateSource}T(?:${timeRegex})$`);
}
var anyString = /^[\s\S]{0,}$/;
var integer = /^-?\d+$/;
var number$1 = /^-?\d+(?:\.\d+)?$/;
var boolean$1 = /^(?:true|false)$/i;
var lowercase = /^[^A-Z]*$/;
var uppercase = /^[^a-z]*$/;
//#endregion
//#region ../../node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/checks.js
var $ZodCheck = /*@__PURE__*/ $constructor("$ZodCheck", (inst, def) => {
	var _a;
	inst._zod ?? (inst._zod = {});
	inst._zod.def = def;
	(_a = inst._zod).onattach ?? (_a.onattach = []);
});
/** Default `when` for length-based checks: run only on non-nullish values with a `length`. */
var _whenHasLength = (payload) => {
	const val = payload.value;
	return !nullish(val) && val.length !== void 0;
};
var numericOriginMap = {
	number: "number",
	bigint: "bigint",
	object: "date"
};
var $ZodCheckLessThan = /*@__PURE__*/ $constructor("$ZodCheckLessThan", (inst, def) => {
	$ZodCheck.init(inst, def);
	const origin = numericOriginMap[typeof def.value];
	inst._zod.check = (payload) => {
		if (def.inclusive ? payload.value <= def.value : payload.value < def.value) return;
		payload.issues.push({
			origin: numericOriginMap[typeof payload.value] ?? origin,
			code: "too_big",
			maximum: typeof def.value === "object" ? def.value.getTime() : def.value,
			input: payload.value,
			inclusive: def.inclusive,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodCheckGreaterThan = /*@__PURE__*/ $constructor("$ZodCheckGreaterThan", (inst, def) => {
	$ZodCheck.init(inst, def);
	const origin = numericOriginMap[typeof def.value];
	inst._zod.check = (payload) => {
		if (def.inclusive ? payload.value >= def.value : payload.value > def.value) return;
		payload.issues.push({
			origin: numericOriginMap[typeof payload.value] ?? origin,
			code: "too_small",
			minimum: typeof def.value === "object" ? def.value.getTime() : def.value,
			input: payload.value,
			inclusive: def.inclusive,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodCheckMultipleOf = /*@__PURE__*/ $constructor("$ZodCheckMultipleOf", (inst, def) => {
	$ZodCheck.init(inst, def);
	inst._zod.check = (payload) => {
		if (typeof payload.value !== typeof def.value) throw new Error("Cannot mix number and bigint in multiple_of check.");
		if (typeof payload.value === "bigint" ? def.value !== BigInt(0) && payload.value % def.value === BigInt(0) : floatSafeRemainder(payload.value, def.value) === 0) return;
		payload.issues.push({
			origin: typeof payload.value,
			code: "not_multiple_of",
			divisor: def.value,
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodCheckNumberFormat = /*@__PURE__*/ $constructor("$ZodCheckNumberFormat", (inst, def) => {
	$ZodCheck.init(inst, def);
	def.format = def.format || "float64";
	const isInt = def.format?.includes("int");
	const origin = isInt ? "int" : "number";
	const [minimum, maximum] = NUMBER_FORMAT_RANGES[def.format];
	inst._zod.check = (payload) => {
		const input = payload.value;
		if (isInt) {
			if (!Number.isInteger(input)) {
				payload.issues.push({
					expected: origin,
					format: def.format,
					code: "invalid_type",
					continue: false,
					input,
					inst
				});
				return;
			}
			if (!Number.isSafeInteger(input)) {
				if (input > 0) payload.issues.push({
					input,
					code: "too_big",
					maximum: Number.MAX_SAFE_INTEGER,
					note: "Integers must be within the safe integer range.",
					inst,
					origin,
					inclusive: true,
					continue: !def.abort
				});
				else payload.issues.push({
					input,
					code: "too_small",
					minimum: Number.MIN_SAFE_INTEGER,
					note: "Integers must be within the safe integer range.",
					inst,
					origin,
					inclusive: true,
					continue: !def.abort
				});
				return;
			}
		}
		if (input < minimum) payload.issues.push({
			origin: "number",
			input,
			code: "too_small",
			minimum,
			inclusive: true,
			inst,
			continue: !def.abort
		});
		if (input > maximum) payload.issues.push({
			origin: "number",
			input,
			code: "too_big",
			maximum,
			inclusive: true,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodCheckMaxLength = /*@__PURE__*/ $constructor("$ZodCheckMaxLength", (inst, def) => {
	var _a;
	$ZodCheck.init(inst, def);
	(_a = inst._zod.def).when ?? (_a.when = _whenHasLength);
	inst._zod.check = (payload) => {
		const input = payload.value;
		const units = input.length;
		if ((typeof input === "string" && units > def.maximum ? codePointLength(input) : units) <= def.maximum) return;
		const origin = getLengthableOrigin(input);
		payload.issues.push({
			origin,
			code: "too_big",
			maximum: def.maximum,
			inclusive: true,
			input,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodCheckMinLength = /*@__PURE__*/ $constructor("$ZodCheckMinLength", (inst, def) => {
	var _a;
	$ZodCheck.init(inst, def);
	(_a = inst._zod.def).when ?? (_a.when = _whenHasLength);
	inst._zod.check = (payload) => {
		const input = payload.value;
		const units = input.length;
		if ((typeof input === "string" && units >= def.minimum && units < def.minimum * 2 ? codePointLength(input) : units) >= def.minimum) return;
		const origin = getLengthableOrigin(input);
		payload.issues.push({
			origin,
			code: "too_small",
			minimum: def.minimum,
			inclusive: true,
			input,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodCheckLengthEquals = /*@__PURE__*/ $constructor("$ZodCheckLengthEquals", (inst, def) => {
	var _a;
	$ZodCheck.init(inst, def);
	(_a = inst._zod.def).when ?? (_a.when = _whenHasLength);
	inst._zod.check = (payload) => {
		const input = payload.value;
		const units = input.length;
		const length = typeof input === "string" && units >= def.length && units <= def.length * 2 ? codePointLength(input) : units;
		if (length === def.length) return;
		const origin = getLengthableOrigin(input);
		const tooBig = length > def.length;
		payload.issues.push({
			origin,
			...tooBig ? {
				code: "too_big",
				maximum: def.length
			} : {
				code: "too_small",
				minimum: def.length
			},
			inclusive: true,
			exact: true,
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodCheckStringFormat = /*@__PURE__*/ $constructor("$ZodCheckStringFormat", (inst, def) => {
	var _a, _b;
	$ZodCheck.init(inst, def);
	if (def.pattern) (_a = inst._zod).check ?? (_a.check = (payload) => {
		def.pattern.lastIndex = 0;
		if (def.pattern.test(payload.value)) return;
		payload.issues.push({
			origin: "string",
			code: "invalid_format",
			format: def.format,
			input: payload.value,
			...def.pattern ? { pattern: def.pattern.toString() } : {},
			inst,
			continue: !def.abort
		});
	});
	else (_b = inst._zod).check ?? (_b.check = () => {});
});
var $ZodCheckRegex = /*@__PURE__*/ $constructor("$ZodCheckRegex", (inst, def) => {
	$ZodCheckStringFormat.init(inst, def);
	inst._zod.check = (payload) => {
		def.pattern.lastIndex = 0;
		if (def.pattern.test(payload.value)) return;
		payload.issues.push({
			origin: "string",
			code: "invalid_format",
			format: "regex",
			input: payload.value,
			pattern: def.pattern.toString(),
			inst,
			continue: !def.abort
		});
	};
});
var $ZodCheckLowerCase = /*@__PURE__*/ $constructor("$ZodCheckLowerCase", (inst, def) => {
	def.pattern ?? (def.pattern = lowercase);
	$ZodCheckStringFormat.init(inst, def);
});
var $ZodCheckUpperCase = /*@__PURE__*/ $constructor("$ZodCheckUpperCase", (inst, def) => {
	def.pattern ?? (def.pattern = uppercase);
	$ZodCheckStringFormat.init(inst, def);
});
var $ZodCheckIncludes = /*@__PURE__*/ $constructor("$ZodCheckIncludes", (inst, def) => {
	$ZodCheck.init(inst, def);
	const escapedRegex = escapeRegex(def.includes);
	def.pattern = new RegExp(typeof def.position === "number" ? `^.{${def.position},}${escapedRegex}` : escapedRegex);
	inst._zod.check = (payload) => {
		if (payload.value.includes(def.includes, def.position)) return;
		payload.issues.push({
			origin: "string",
			code: "invalid_format",
			format: "includes",
			includes: def.includes,
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodCheckStartsWith = /*@__PURE__*/ $constructor("$ZodCheckStartsWith", (inst, def) => {
	$ZodCheck.init(inst, def);
	const pattern = new RegExp(`^${escapeRegex(def.prefix)}.*`);
	def.pattern ?? (def.pattern = pattern);
	inst._zod.check = (payload) => {
		if (payload.value.startsWith(def.prefix)) return;
		payload.issues.push({
			origin: "string",
			code: "invalid_format",
			format: "starts_with",
			prefix: def.prefix,
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodCheckEndsWith = /*@__PURE__*/ $constructor("$ZodCheckEndsWith", (inst, def) => {
	$ZodCheck.init(inst, def);
	const pattern = new RegExp(`.*${escapeRegex(def.suffix)}$`);
	def.pattern ?? (def.pattern = pattern);
	inst._zod.check = (payload) => {
		if (payload.value.endsWith(def.suffix)) return;
		payload.issues.push({
			origin: "string",
			code: "invalid_format",
			format: "ends_with",
			suffix: def.suffix,
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodCheckOverwrite = /*@__PURE__*/ $constructor("$ZodCheckOverwrite", (inst, def) => {
	$ZodCheck.init(inst, def);
	inst._zod.check = (payload) => {
		payload.value = def.tx(payload.value);
	};
});
//#endregion
//#region ../../node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/doc.js
var Doc = class {
	constructor(args = [], closed = {}) {
		this.content = [];
		this.indent = 0;
		this.args = args;
		this.closed = closed;
	}
	indented(fn) {
		this.indent += 1;
		try {
			fn(this);
		} finally {
			this.indent -= 1;
		}
	}
	write(arg) {
		if (typeof arg === "function") {
			arg(this, { execution: "sync" });
			arg(this, { execution: "async" });
			return;
		}
		const lines = arg.split("\n").filter((x) => x);
		const minIndent = Math.min(...lines.map((x) => x.length - x.trimStart().length));
		const dedented = lines.map((x) => x.slice(minIndent)).map((x) => " ".repeat(this.indent * 2) + x);
		for (const line of dedented) this.content.push(line);
	}
	compile() {
		const F = Function;
		const content = this?.content ?? [``];
		return new F(...Object.keys(this.closed), `return function (${this.args.join(", ")}) {\n${content.join("\n")}\n};`)(...Object.values(this.closed));
	}
};
//#endregion
//#region ../../node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/versions.js
var version = {
	major: 4,
	minor: 6,
	patch: 5
};
//#endregion
//#region ../../node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/schemas.js
var $ZodType = /*@__PURE__*/ $constructor("$ZodType", (inst, def) => {
	var _a;
	inst ?? (inst = {});
	inst._zod.def = def;
	inst._zod.bag = inst._zod.bag || {};
	inst._zod.version = version;
	const defChecks = inst._zod.def.checks;
	const checks = inst._zod.traits.has("$ZodCheck") ? [inst, ...defChecks ?? []] : defChecks?.length ? [...defChecks] : [];
	for (const ch of checks) for (const fn of ch._zod.onattach) fn(inst);
	if (checks.length === 0) {
		(_a = inst._zod).deferred ?? (_a.deferred = []);
		inst._zod.deferred?.push(() => {
			inst._zod.run = inst._zod.parse;
		});
	} else {
		const runChecks = (payload, checks, ctx) => {
			if (payload.memo) return payload;
			let isAborted = aborted(payload);
			let asyncResult;
			for (const ch of checks) {
				if (ch._zod.def.when) {
					if (explicitlyAborted(payload)) continue;
					if (!ch._zod.def.when(payload)) continue;
				} else if (isAborted) continue;
				const currLen = payload.issues.length;
				const _ = ch._zod.check(payload);
				if (_ instanceof Promise && ctx?.async === false) throw new $ZodAsyncError();
				if (asyncResult || _ instanceof Promise) asyncResult = (asyncResult ?? Promise.resolve()).then(async () => {
					await _;
					if (payload.issues.length === currLen) return;
					attachSchema(payload.issues, currLen, inst);
					if (!isAborted) isAborted = aborted(payload, currLen);
				});
				else {
					if (payload.issues.length === currLen) continue;
					attachSchema(payload.issues, currLen, inst);
					if (!isAborted) isAborted = aborted(payload, currLen);
				}
			}
			if (asyncResult) return asyncResult.then(() => {
				return payload;
			});
			return payload;
		};
		const handleCanaryResult = (canary, payload, ctx) => {
			if (aborted(canary)) {
				canary.aborted = true;
				return canary;
			}
			const checkResult = runChecks(payload, checks, ctx);
			if (checkResult instanceof Promise) {
				if (ctx.async === false) throw new $ZodAsyncError();
				return checkResult.then((checkResult) => inst._zod.parse(checkResult, ctx));
			}
			return inst._zod.parse(checkResult, ctx);
		};
		inst._zod.run = (payload, ctx) => {
			if (ctx.skipChecks) return inst._zod.parse(payload, ctx);
			if (ctx.direction === "backward") {
				const canary = inst._zod.parse({
					value: payload.value,
					issues: []
				}, {
					...ctx,
					skipChecks: true
				});
				if (canary instanceof Promise) return canary.then((canary) => {
					return handleCanaryResult(canary, payload, ctx);
				});
				return handleCanaryResult(canary, payload, ctx);
			}
			const result = inst._zod.parse(payload, ctx);
			if (result instanceof Promise) {
				if (ctx.async === false) throw new $ZodAsyncError();
				return result.then((result) => runChecks(result, checks, ctx));
			}
			return runChecks(result, checks, ctx);
		};
	}
}, {
	get "~standard"() {
		return hide(this, "~standard", standardProps(this));
	},
	set "~standard"(value) {
		own(this, "~standard", value);
	}
});
/** The Standard Schema surface for `inst`. Shared so wrappers can extend it without forcing it. */
var toStandardResult = (r, ctx) => r.issues.length ? { issues: r.issues.map((iss) => finalizeIssue(iss, ctx, config())) } : { value: r.value };
async function validateAsync(inst, value) {
	const ctx = { async: true };
	return toStandardResult(await inst._zod.run({
		value,
		issues: []
	}, ctx), ctx);
}
function standardProps(inst) {
	return {
		validate: (value) => {
			const ctx = { async: false };
			try {
				const r = inst._zod.run({
					value,
					issues: []
				}, ctx);
				if (!(r instanceof Promise)) return toStandardResult(r, ctx);
			} catch (_) {}
			return validateAsync(inst, value);
		},
		vendor: "zod",
		version: 1
	};
}
var $ZodString = /*@__PURE__*/ $constructor("$ZodString", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.pattern = def.pattern ?? anyString;
	inst._zod.parse = (payload, _) => {
		if (def.coerce) try {
			payload.value = String(payload.value);
		} catch (_) {}
		if (typeof payload.value === "string") return payload;
		payload.issues.push({
			expected: "string",
			code: "invalid_type",
			input: payload.value,
			inst
		});
		return payload;
	};
});
var $ZodStringFormat = /*@__PURE__*/ $constructor("$ZodStringFormat", (inst, def) => {
	$ZodCheckStringFormat.init(inst, def);
	$ZodString.init(inst, def);
});
var $ZodGUID = /*@__PURE__*/ $constructor("$ZodGUID", (inst, def) => {
	def.pattern ?? (def.pattern = guid);
	$ZodStringFormat.init(inst, def);
});
var $ZodUUID = /*@__PURE__*/ $constructor("$ZodUUID", (inst, def) => {
	if (def.version) {
		const v = {
			v1: 1,
			v2: 2,
			v3: 3,
			v4: 4,
			v5: 5,
			v6: 6,
			v7: 7,
			v8: 8
		}[def.version];
		if (v === void 0) throw new Error(`Invalid UUID version: "${def.version}"`);
		def.pattern ?? (def.pattern = uuid(v));
	} else def.pattern ?? (def.pattern = uuid());
	$ZodStringFormat.init(inst, def);
});
var $ZodEmail = /*@__PURE__*/ $constructor("$ZodEmail", (inst, def) => {
	def.pattern ?? (def.pattern = email);
	$ZodStringFormat.init(inst, def);
});
function canParseURL(input) {
	try {
		if (typeof URL !== "undefined" && typeof URL.canParse === "function") return URL.canParse(input);
		new URL(input);
		return true;
	} catch {
		return false;
	}
}
function validateURL(trimmed, def) {
	if (!("normalize" in def) && !("hostname" in def) && !("protocol" in def)) return canParseURL(trimmed) || 2;
	return parseURLObject(trimmed, def);
}
/** Parses a URL while preserving the non-normalizing HTTP guard. */
function parseURLObject(trimmed, def) {
	if (!def.normalize && def.protocol?.source === httpProtocol.source && !/^https?:\/\//i.test(trimmed)) return 1;
	try {
		if (typeof URL !== "undefined") {
			const URLStatic = URL;
			if (typeof URLStatic.parse === "function") return URLStatic.parse(trimmed) ?? 2;
		}
		return new URL(trimmed);
	} catch {
		return 2;
	}
}
var asciiTabOrNewline = /[\t\n\r]/g;
/** The URL parser deletes every ASCII tab, LF and CR from its input before it parses, so `new URL("https://exa\nmple.com")` reports on `example.com`. Applying the same deletion to the returned value closes the half of that divergence which can move the host; the parser's other rewrite, stripping C0 controls at the edges, cannot. */
function stripTabAndNewline(value) {
	return value.replace(asciiTabOrNewline, "");
}
function urlHostnameOk(url, hostname) {
	hostname.lastIndex = 0;
	return hostname.test(url.hostname);
}
function urlProtocolOk(url, protocol) {
	protocol.lastIndex = 0;
	return protocol.test(url.protocol.endsWith(":") ? url.protocol.slice(0, -1) : url.protocol);
}
var $ZodURL = /*@__PURE__*/ $constructor("$ZodURL", (inst, def) => {
	$ZodStringFormat.init(inst, def);
	inst._zod.check = (payload) => {
		try {
			const trimmed = payload.value.trim();
			const url = validateURL(trimmed, def);
			if (url === 1) {
				payload.issues.push({
					code: "invalid_format",
					format: "url",
					note: "Invalid URL format",
					input: payload.value,
					inst,
					continue: !def.abort
				});
				return;
			}
			if (url === 2) {
				payload.issues.push({
					code: "invalid_format",
					format: "url",
					input: payload.value,
					inst,
					continue: !def.abort
				});
				return;
			}
			if (url === true) {
				payload.value = stripTabAndNewline(trimmed);
				return;
			}
			if (def.hostname && !urlHostnameOk(url, def.hostname)) payload.issues.push({
				code: "invalid_format",
				format: "url",
				note: "Invalid hostname",
				pattern: def.hostname.source,
				input: payload.value,
				inst,
				continue: !def.abort
			});
			if (def.protocol && !urlProtocolOk(url, def.protocol)) payload.issues.push({
				code: "invalid_format",
				format: "url",
				note: "Invalid protocol",
				pattern: def.protocol.source,
				input: payload.value,
				inst,
				continue: !def.abort
			});
			payload.value = def.normalize ? url.href : stripTabAndNewline(trimmed);
			return;
		} catch (_) {
			payload.issues.push({
				code: "invalid_format",
				format: "url",
				input: payload.value,
				inst,
				continue: !def.abort
			});
		}
	};
});
var $ZodEmoji = /*@__PURE__*/ $constructor("$ZodEmoji", (inst, def) => {
	def.pattern ?? (def.pattern = emoji());
	$ZodStringFormat.init(inst, def);
});
var $ZodNanoID = /*@__PURE__*/ $constructor("$ZodNanoID", (inst, def) => {
	if (def.length !== void 0 && (!Number.isInteger(def.length) || def.length < 1)) throw new Error(`Invalid nanoid length: ${def.length}`);
	def.pattern ?? (def.pattern = def.length === void 0 ? nanoid : nanoidOfLength(def.length));
	$ZodStringFormat.init(inst, def);
});
/**
* @deprecated CUID v1 is deprecated by its authors due to information leakage
* (timestamps embedded in the id). Use {@link $ZodCUID2} instead.
* See https://github.com/paralleldrive/cuid.
*/
var $ZodCUID = /*@__PURE__*/ $constructor("$ZodCUID", (inst, def) => {
	def.pattern ?? (def.pattern = cuid);
	$ZodStringFormat.init(inst, def);
});
var $ZodCUID2 = /*@__PURE__*/ $constructor("$ZodCUID2", (inst, def) => {
	def.pattern ?? (def.pattern = cuid2);
	$ZodStringFormat.init(inst, def);
});
var $ZodULID = /*@__PURE__*/ $constructor("$ZodULID", (inst, def) => {
	def.pattern ?? (def.pattern = ulid);
	$ZodStringFormat.init(inst, def);
});
var $ZodXID = /*@__PURE__*/ $constructor("$ZodXID", (inst, def) => {
	def.pattern ?? (def.pattern = xid);
	$ZodStringFormat.init(inst, def);
});
var $ZodKSUID = /*@__PURE__*/ $constructor("$ZodKSUID", (inst, def) => {
	def.pattern ?? (def.pattern = ksuid);
	$ZodStringFormat.init(inst, def);
});
var $ZodISODateTime = /*@__PURE__*/ $constructor("$ZodISODateTime", (inst, def) => {
	def.pattern ?? (def.pattern = datetime$1(def));
	$ZodStringFormat.init(inst, def);
});
var $ZodISODate = /*@__PURE__*/ $constructor("$ZodISODate", (inst, def) => {
	def.pattern ?? (def.pattern = date);
	$ZodStringFormat.init(inst, def);
});
var $ZodISOTime = /*@__PURE__*/ $constructor("$ZodISOTime", (inst, def) => {
	def.pattern ?? (def.pattern = time(def));
	$ZodStringFormat.init(inst, def);
});
var $ZodISODuration = /*@__PURE__*/ $constructor("$ZodISODuration", (inst, def) => {
	def.pattern ?? (def.pattern = duration);
	$ZodStringFormat.init(inst, def);
});
var $ZodIPv4 = /*@__PURE__*/ $constructor("$ZodIPv4", (inst, def) => {
	def.pattern ?? (def.pattern = ipv4);
	$ZodStringFormat.init(inst, def);
});
/** An IPv6 address is written with hex digits, colons and dots, and nothing else. The guard is what makes the check below an IPv6 check: `new URL("http://[...]")` parses an authority, not an address, so `@` and `\` re-delimit it and `"::@1\\"` validates against the host `0.0.0.1`. The URL parser also deletes ASCII tab, LF and CR rather than failing, which is how `"::1\n"` validated as `::1`. */
var ipv6Alphabet = /^[0-9a-fA-F:.]+$/;
function isValidIPv6(value) {
	if (!ipv6Alphabet.test(value)) return false;
	return canParseURL(`http://[${value}]`);
}
var $ZodIPv6 = /*@__PURE__*/ $constructor("$ZodIPv6", (inst, def) => {
	def.pattern ?? (def.pattern = ipv6);
	$ZodStringFormat.init(inst, def);
	inst._zod.check = (payload) => {
		if (!isValidIPv6(payload.value)) payload.issues.push({
			code: "invalid_format",
			format: "ipv6",
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodCIDRv4 = /*@__PURE__*/ $constructor("$ZodCIDRv4", (inst, def) => {
	def.pattern ?? (def.pattern = cidrv4);
	$ZodStringFormat.init(inst, def);
});
function isValidCIDRv6(value) {
	const parts = value.split("/");
	if (parts.length !== 2) return false;
	const [address, prefix] = parts;
	if (!prefix) return false;
	const prefixNum = Number(prefix);
	if (`${prefixNum}` !== prefix) return false;
	if (prefixNum < 0 || prefixNum > 128) return false;
	return isValidIPv6(address);
}
var $ZodCIDRv6 = /*@__PURE__*/ $constructor("$ZodCIDRv6", (inst, def) => {
	def.pattern ?? (def.pattern = cidrv6);
	$ZodStringFormat.init(inst, def);
	inst._zod.check = (payload) => {
		if (!isValidCIDRv6(payload.value)) payload.issues.push({
			code: "invalid_format",
			format: "cidrv6",
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
function isValidBase64(data) {
	if (data === "") return true;
	if (/\s/.test(data)) return false;
	if (data.length % 4 !== 0) return false;
	try {
		atob(data);
		return true;
	} catch {
		return false;
	}
}
var base64Charset = /^[0-9a-zA-Z+/]*={0,2}$/;
var $ZodBase64 = /*@__PURE__*/ $constructor("$ZodBase64", (inst, def) => {
	def.pattern ?? (def.pattern = base64Charset);
	$ZodStringFormat.init(inst, def);
	inst._zod.check = (payload) => {
		if (isValidBase64(payload.value)) return;
		payload.issues.push({
			code: "invalid_format",
			format: "base64",
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
var base64urlCharset = /^[A-Za-z0-9_-]*$/;
function isValidBase64URL(data) {
	if (!base64urlCharset.test(data)) return false;
	const base64 = data.replace(/[-_]/g, (c) => c === "-" ? "+" : "/");
	return isValidBase64(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
}
var $ZodBase64URL = /*@__PURE__*/ $constructor("$ZodBase64URL", (inst, def) => {
	def.pattern ?? (def.pattern = base64urlCharset);
	$ZodStringFormat.init(inst, def);
	inst._zod.check = (payload) => {
		if (isValidBase64URL(payload.value)) return;
		payload.issues.push({
			code: "invalid_format",
			format: "base64url",
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodE164 = /*@__PURE__*/ $constructor("$ZodE164", (inst, def) => {
	def.pattern ?? (def.pattern = e164);
	$ZodStringFormat.init(inst, def);
});
function isValidJWT(token, algorithm = null) {
	try {
		const tokensParts = token.split(".");
		if (tokensParts.length !== 3) return false;
		const [header] = tokensParts;
		if (!header) return false;
		const parsedHeader = JSON.parse(atob(header));
		if ("typ" in parsedHeader && parsedHeader?.typ !== "JWT") return false;
		if (!parsedHeader.alg) return false;
		if (algorithm && (!("alg" in parsedHeader) || parsedHeader.alg !== algorithm)) return false;
		return true;
	} catch {
		return false;
	}
}
var $ZodJWT = /*@__PURE__*/ $constructor("$ZodJWT", (inst, def) => {
	$ZodStringFormat.init(inst, def);
	inst._zod.check = (payload) => {
		if (isValidJWT(payload.value, def.alg)) return;
		payload.issues.push({
			code: "invalid_format",
			format: "jwt",
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodNumber = /*@__PURE__*/ $constructor("$ZodNumber", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.pattern = number$1;
	inst._zod.parse = (payload, _ctx) => {
		if (def.coerce) try {
			payload.value = Number(payload.value);
		} catch (_) {}
		const input = payload.value;
		if (typeof input === "number" && !Number.isNaN(input) && Number.isFinite(input)) return payload;
		const received = typeof input === "number" ? Number.isNaN(input) ? "NaN" : !Number.isFinite(input) ? String(input) : void 0 : void 0;
		payload.issues.push({
			expected: "number",
			code: "invalid_type",
			input,
			inst,
			...received ? { received } : {}
		});
		return payload;
	};
});
var $ZodNumberFormat = /*@__PURE__*/ $constructor("$ZodNumberFormat", (inst, def) => {
	$ZodCheckNumberFormat.init(inst, def);
	$ZodNumber.init(inst, def);
});
var $ZodBoolean = /*@__PURE__*/ $constructor("$ZodBoolean", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.pattern = boolean$1;
	inst._zod.parse = (payload, _ctx) => {
		if (def.coerce) try {
			payload.value = Boolean(payload.value);
		} catch (_) {}
		const input = payload.value;
		if (typeof input === "boolean") return payload;
		payload.issues.push({
			expected: "boolean",
			code: "invalid_type",
			input,
			inst
		});
		return payload;
	};
});
var $ZodUnknown = /*@__PURE__*/ $constructor("$ZodUnknown", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.parse = (payload) => payload;
});
var $ZodNever = /*@__PURE__*/ $constructor("$ZodNever", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.parse = (payload, _ctx) => {
		payload.issues.push({
			expected: "never",
			code: "invalid_type",
			input: payload.value,
			inst
		});
		return payload;
	};
});
var $ZodVoid = /*@__PURE__*/ $constructor("$ZodVoid", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.parse = (payload, _ctx) => {
		const input = payload.value;
		if (typeof input === "undefined") return payload;
		payload.issues.push({
			expected: "void",
			code: "invalid_type",
			input,
			inst
		});
		return payload;
	};
});
function handleArrayResult(result, final, index) {
	if (result.issues.length) final.issues.push(...prefixIssues(index, result.issues));
	final.value[index] = result.value;
}
var $ZodArray = /*@__PURE__*/ $constructor("$ZodArray", (inst, def) => {
	$ZodType.init(inst, def);
	const memo = globalConfig.memoizer;
	memo?.attach(inst);
	inst._zod.parse = (payload, ctx) => {
		const input = payload.value;
		if (!Array.isArray(input)) {
			payload.issues.push({
				expected: "array",
				code: "invalid_type",
				input,
				inst
			});
			return payload;
		}
		payload.value = memo ? memo.alloc(inst, payload, Array(input.length), ctx) : Array(input.length);
		const proms = [];
		const abortEarly = ctx?.abortEarly;
		for (let i = 0; i < input.length; i++) {
			const item = input[i];
			const result = def.element._zod.run({
				value: item,
				issues: []
			}, ctx);
			if (result instanceof Promise) proms.push(result.then((result) => handleArrayResult(result, payload, i)));
			else {
				handleArrayResult(result, payload, i);
				if (abortEarly && result.issues.length !== 0 && aborted(result)) break;
			}
		}
		if (proms.length) return Promise.all(proms).then(() => payload);
		return payload;
	};
});
function handlePropertyResult(result, final, key, input, optin, optout) {
	const isPresent = key in input;
	const isOptionalOut = optout === "optional";
	if (!isPresent && isOptionalOut && optin === "optional") return;
	if (result.issues.length) {
		if (optin !== void 0 && isOptionalOut && !isPresent) return;
		final.issues.push(...prefixIssues(key, result.issues));
	}
	if (!isPresent && optin === void 0) {
		if (!result.issues.length) final.issues.push({
			code: "invalid_type",
			expected: "nonoptional",
			input: void 0,
			path: [key]
		});
		return;
	}
	if (result.value === void 0) {
		if (isPresent || optin === "defaulted" && !isOptionalOut) final.value[key] = void 0;
	} else final.value[key] = result.value;
}
var NO_SYMBOL_KEYS = [];
function normalizeDef(def) {
	const keys = Object.keys(def.shape);
	const ownSymbols = Object.getOwnPropertySymbols(def.shape);
	const symbolKeys = ownSymbols.length ? ownSymbols : NO_SYMBOL_KEYS;
	const allKeys = symbolKeys.length ? [...keys, ...symbolKeys] : keys;
	for (const k of allKeys) if (!def.shape?.[k]?._zod?.traits?.has("$ZodType")) throw new Error(`Invalid element at key "${String(k)}": expected a Zod schema`);
	const okeys = optionalKeys(def.shape);
	return {
		...def,
		allKeys,
		symbolKeys,
		keySet: new Set(keys),
		numKeys: keys.length,
		optionalKeys: new Set(okeys)
	};
}
function handleCatchall(proms, input, payload, ctx, def, inst, abortEarly) {
	const unrecognized = [];
	const keySet = def.keySet;
	const _catchall = def.catchall._zod;
	const t = _catchall.def.type;
	const optin = _catchall.optin;
	const optout = _catchall.optout;
	let seen = 0;
	for (const key in input) {
		if (abortEarly && payload.issues.length !== seen) {
			if (aborted(payload, seen)) break;
			seen = payload.issues.length;
		}
		if (keySet.has(key)) continue;
		if (key === "__proto__") {
			if (t === "never") unrecognized.push(key);
			continue;
		}
		if (t === "never") {
			unrecognized.push(key);
			continue;
		}
		const r = _catchall.run({
			value: input[key],
			issues: []
		}, ctx);
		if (r instanceof Promise) proms.push(r.then((r) => handlePropertyResult(r, payload, key, input, optin, optout)));
		else handlePropertyResult(r, payload, key, input, optin, optout);
	}
	if (unrecognized.length) payload.issues.push({
		code: "unrecognized_keys",
		keys: unrecognized,
		input,
		inst,
		continue: true
	});
	if (!proms.length) return payload;
	return Promise.all(proms).then(() => {
		return payload;
	});
}
var $ZodObject = /*@__PURE__*/ $constructor("$ZodObject", (inst, def) => {
	$ZodType.init(inst, def);
	const desc = Object.getOwnPropertyDescriptor(def, "shape");
	const sh = desc?.get ? desc.get.raw : def.shape ?? {};
	if (sh) {
		const get = () => {
			const newSh = { ...sh };
			Object.defineProperty(def, "shape", { value: newSh });
			get.raw = newSh;
			return newSh;
		};
		get.raw = sh;
		Object.defineProperty(def, "shape", { get });
	}
	const _normalized = cached(() => normalizeDef(def));
	defineLazyInternal(inst, "propValues", (zod) => {
		const shape = zod.def.shape;
		const propValues = {};
		for (const key in shape) {
			const field = shape[key]._zod;
			if (field.values) {
				if (!Object.prototype.hasOwnProperty.call(propValues, key)) assignProp(propValues, key, /* @__PURE__ */ new Set());
				for (const v of field.values) propValues[key].add(v);
				if (field.optin !== void 0) propValues[key].add(void 0);
			}
		}
		return propValues;
	});
	const isObject$2 = isObject;
	const catchall = def.catchall;
	let value;
	const memo = globalConfig.memoizer;
	memo?.attach(inst);
	inst._zod.parse = (payload, ctx) => {
		value ?? (value = _normalized.value);
		const input = payload.value;
		if (!isObject$2(input)) {
			payload.issues.push({
				expected: "object",
				code: "invalid_type",
				input,
				inst
			});
			return payload;
		}
		payload.value = memo ? memo.alloc(inst, payload, {}, ctx) : {};
		const proms = [];
		const shape = value.shape;
		const abortEarly = ctx?.abortEarly;
		let seen = payload.issues.length;
		for (const key of value.allKeys) {
			if (abortEarly && payload.issues.length !== seen) {
				if (aborted(payload, seen)) break;
				seen = payload.issues.length;
			}
			if (key === "__proto__") continue;
			const el = shape[key];
			const optin = el._zod.optin;
			const optout = el._zod.optout;
			const r = el._zod.run({
				value: input[key],
				issues: []
			}, ctx);
			if (r instanceof Promise) proms.push(r.then((r) => handlePropertyResult(r, payload, key, input, optin, optout)));
			else handlePropertyResult(r, payload, key, input, optin, optout);
		}
		if (!catchall) return proms.length ? Promise.all(proms).then(() => payload) : payload;
		return handleCatchall(proms, input, payload, ctx, _normalized.value, inst, abortEarly === true);
	};
});
var $ZodObjectJIT = /*@__PURE__*/ $constructor("$ZodObjectJIT", (inst, def) => {
	$ZodObject.init(inst, def);
	const superParse = inst._zod.parse;
	const _normalized = cached(() => normalizeDef(def));
	const memo = globalConfig.memoizer;
	const generateFastpass = (shape) => {
		const normalized = _normalized.value;
		const syms = normalized.symbolKeys;
		const doc = new Doc(["payload", "ctx"], {
			shape,
			inst,
			memo,
			syms
		});
		const parseStr = (k) => `shape[${k}]._zod.run({ value: input[${k}], issues: [] }, ctx)`;
		const prefixStr = (id, k) => `
          let ${id}_ab = false;
          for (let i = 0; i < ${id}.issues.length; i++) {
            const iss = ${id}.issues[i];
            iss.path = iss.path ? [${k}, ...iss.path] : [${k}];
            payload.issues.push(iss);
            if (iss.continue !== true) ${id}_ab = true;
          }
          if (${id}_ab && ctx && ctx.abortEarly) {
            payload.value = newResult;
            return payload;
          }`;
		doc.write(`const input = payload.value;`);
		const ids = Object.create(null);
		let counter = 0;
		for (const key of normalized.allKeys) ids[key] = `key_${counter++}`;
		doc.write(memo ? `const newResult = memo.alloc(inst, payload, {}, ctx);` : `const newResult = {};`);
		for (const key of normalized.allKeys) {
			if (key === "__proto__") continue;
			const id = ids[key];
			const k = typeof key === "symbol" ? `syms[${syms.indexOf(key)}]` : esc(key);
			const isPresent = `${k} in input`;
			const schema = shape[key];
			const optin = schema?._zod?.optin;
			const isOptionalIn = optin !== void 0;
			const isOptionalOut = schema?._zod?.optout === "optional";
			doc.write(`const ${id} = ${parseStr(k)};`);
			if (isOptionalIn && isOptionalOut) {
				const assign = optin === "optional" ? `${id}_present` : `${id}.value !== undefined || ${id}_present`;
				doc.write(`
        const ${id}_present = ${isPresent};
        if (!${id}.issues.length || ${id}_present) {
          if (${id}.issues.length) {${prefixStr(id, k)}
          }

          if (${assign}) {
            newResult[${k}] = ${id}.value;
          }
        }

      `);
			} else if (!isOptionalIn) doc.write(`
        const ${id}_present = ${isPresent};
        if (${id}.issues.length) {${prefixStr(id, k)}
        }
        if (!${id}_present && !${id}.issues.length) {
          payload.issues.push({
            code: "invalid_type",
            expected: "nonoptional",
            input: undefined,
            path: [${k}]
          });
          if (ctx && ctx.abortEarly) {
            payload.value = newResult;
            return payload;
          }
        }

        if (${id}_present) {
          newResult[${k}] = ${id}.value;
        }

      `);
			else {
				doc.write(`
        if (${id}.issues.length) {${prefixStr(id, k)}
        }
      `);
				if (optin === "defaulted") doc.write(`newResult[${k}] = ${id}.value;`);
				else doc.write(`
        if (${id}.value !== undefined || ${isPresent}) {
          newResult[${k}] = ${id}.value;
        }
      `);
			}
		}
		doc.write(`payload.value = newResult;`);
		doc.write(`return payload;`);
		return doc.compile();
	};
	let fastpass;
	const isObject$1 = isObject;
	const jit = !globalConfig.jitless;
	const fastEnabled = jit && allowsEval.value;
	const catchall = def.catchall;
	let value;
	inst._zod.parse = (payload, ctx) => {
		value ?? (value = _normalized.value);
		const input = payload.value;
		if (!isObject$1(input)) {
			payload.issues.push({
				expected: "object",
				code: "invalid_type",
				input,
				inst
			});
			return payload;
		}
		if (jit && fastEnabled && ctx?.async === false && ctx.jitless !== true) {
			if (!fastpass) fastpass = generateFastpass(def.shape);
			payload = fastpass(payload, ctx);
			if (!catchall) return payload;
			return handleCatchall([], input, payload, ctx, value, inst, ctx?.abortEarly === true);
		}
		return superParse(payload, ctx);
	};
});
function handleUnionResults(results, final, inst, ctx) {
	for (const result of results) if (result.issues.length === 0) {
		final.value = result.value;
		return final;
	}
	const nonaborted = results.filter((r) => !aborted(r));
	if (nonaborted.length === 1) {
		final.value = nonaborted[0].value;
		return nonaborted[0];
	}
	final.issues.push({
		code: "invalid_union",
		input: final.value,
		inst,
		errors: results.map((result) => result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
	});
	return final;
}
var $ZodUnion = /*@__PURE__*/ $constructor("$ZodUnion", (inst, def) => {
	$ZodType.init(inst, def);
	defineLazyInternal(inst, "optin", (zod) => zod.def.options.some((o) => o._zod.optin === "defaulted") ? "defaulted" : zod.def.options.some((o) => o._zod.optin !== void 0) ? "optional" : void 0);
	defineLazyInternal(inst, "optout", (zod) => zod.def.options.some((o) => o._zod.optout === "optional") ? "optional" : void 0);
	defineLazyInternal(inst, "values", (zod) => {
		if (zod.def.options.every((o) => o._zod.values)) return new Set(zod.def.options.flatMap((option) => Array.from(option._zod.values)));
	});
	defineLazyInternal(inst, "pattern", (zod) => {
		if (zod.def.options.every((o) => o._zod.pattern)) {
			const patterns = zod.def.options.map((o) => o._zod.pattern);
			return new RegExp(`^(${patterns.map((p) => cleanRegex(p.source)).join("|")})$`);
		}
	});
	const first = def.options.length === 1 ? def.options[0]._zod.run : null;
	inst._zod.parse = (payload, ctx) => {
		if (first) return first(payload, ctx);
		let async = false;
		const results = [];
		for (const option of def.options) {
			const result = option._zod.run({
				value: payload.value,
				issues: []
			}, ctx);
			if (result instanceof Promise) {
				results.push(result);
				async = true;
			} else {
				if (result.issues.length === 0) return result;
				results.push(result);
			}
		}
		if (!async) return handleUnionResults(results, payload, inst, ctx);
		return Promise.all(results).then((results) => {
			return handleUnionResults(results, payload, inst, ctx);
		});
	};
});
function discriminatorMap(def) {
	const map = /* @__PURE__ */ new Map();
	for (const option of def.options) {
		const values = option._zod.propValues?.[def.discriminator];
		if (!values || values.size === 0) throw new Error(`Invalid discriminated union option at index "${def.options.indexOf(option)}"`);
		for (const value of values) if (map.has(value)) {
			if (value !== void 0) throw new Error(`Duplicate discriminator value "${String(value)}"`);
			map.set(value, null);
		} else map.set(value, option);
	}
	return map;
}
var $ZodDiscriminatedUnion = /*@__PURE__*/ $constructor("$ZodDiscriminatedUnion", (inst, def) => {
	def.inclusive = false;
	$ZodUnion.init(inst, def);
	const _super = inst._zod.parse;
	defineLazyInternal(inst, "propValues", (zod) => {
		const propValues = {};
		let undefinedCount = 0;
		for (const option of zod.def.options) {
			const pv = option._zod.propValues;
			if (!pv || Object.keys(pv).length === 0) throw new Error(`Invalid discriminated union option at index "${zod.def.options.indexOf(option)}"`);
			if (pv[zod.def.discriminator]?.has(void 0)) undefinedCount++;
			for (const [k, v] of Object.entries(pv)) {
				if (!Object.prototype.hasOwnProperty.call(propValues, k)) assignProp(propValues, k, /* @__PURE__ */ new Set());
				for (const val of v) propValues[k].add(val);
			}
		}
		if (!zod.def.unionFallback && undefinedCount > 1) propValues[zod.def.discriminator]?.delete(void 0);
		return propValues;
	});
	def.options.forEach((option, i) => {
		const propShape = rawShape(option._zod.def);
		if (propShape && !Object.prototype.hasOwnProperty.call(propShape, def.discriminator)) throw new Error(`Invalid discriminated union option at index "${i}"`);
	});
	const disc = cached(() => discriminatorMap(def));
	inst._zod.parse = (payload, ctx) => {
		const input = payload.value;
		if (!isObject(input)) {
			payload.issues.push({
				code: "invalid_type",
				expected: "object",
				input,
				inst
			});
			return payload;
		}
		const value = input?.[def.discriminator];
		const opt = disc.value.get(value);
		if (opt && (value !== void 0 || ctx.direction !== "backward")) return opt._zod.run(payload, ctx);
		if (def.unionFallback || ctx.direction === "backward") return _super(payload, ctx);
		payload.issues.push({
			code: "invalid_union",
			errors: [],
			note: "No matching discriminator",
			discriminator: def.discriminator,
			options: Array.from(disc.value.keys()).filter((value) => disc.value.get(value) !== null),
			input,
			path: [def.discriminator],
			inst
		});
		return payload;
	};
});
var $ZodIntersection = /*@__PURE__*/ $constructor("$ZodIntersection", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.parse = (payload, ctx) => {
		const input = payload.value;
		const left = def.left._zod.run({
			value: input,
			issues: []
		}, ctx);
		const right = def.right._zod.run({
			value: input,
			issues: []
		}, ctx);
		if (left instanceof Promise || right instanceof Promise) return Promise.all([left, right]).then(([left, right]) => {
			return handleIntersectionResults(payload, left, right);
		});
		return handleIntersectionResults(payload, left, right);
	};
});
function mergeValues(a, b) {
	if (a === b) return {
		valid: true,
		data: a
	};
	if (a instanceof Date && b instanceof Date && +a === +b) return {
		valid: true,
		data: a
	};
	if (isPlainObject(a) && isPlainObject(b)) {
		const bKeys = Object.keys(b);
		const sharedKeys = Object.keys(a).filter((key) => bKeys.indexOf(key) !== -1);
		const newObj = {
			...a,
			...b
		};
		if (Object.prototype.hasOwnProperty.call(newObj, "__proto__")) delete newObj.__proto__;
		for (const key of sharedKeys) {
			if (key === "__proto__") continue;
			const sharedValue = mergeValues(a[key], b[key]);
			if (!sharedValue.valid) return {
				valid: false,
				mergeErrorPath: [key, ...sharedValue.mergeErrorPath]
			};
			newObj[key] = sharedValue.data;
		}
		return {
			valid: true,
			data: newObj
		};
	}
	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) return {
			valid: false,
			mergeErrorPath: []
		};
		const newArray = [];
		for (let index = 0; index < a.length; index++) {
			const itemA = a[index];
			const itemB = b[index];
			const sharedValue = mergeValues(itemA, itemB);
			if (!sharedValue.valid) return {
				valid: false,
				mergeErrorPath: [index, ...sharedValue.mergeErrorPath]
			};
			newArray.push(sharedValue.data);
		}
		return {
			valid: true,
			data: newArray
		};
	}
	return {
		valid: false,
		mergeErrorPath: []
	};
}
function handleIntersectionResults(result, left, right) {
	const unrecKeys = /* @__PURE__ */ new Map();
	let unrecIssue;
	const keyIssues = /* @__PURE__ */ new Map();
	const collect = (iss, side) => {
		let keys;
		if (iss.code === "unrecognized_keys" && !iss.path?.length) {
			unrecIssue ?? (unrecIssue = iss);
			keys = iss.keys;
		} else if (iss.code === "invalid_key" && iss.origin === "record" && iss.path?.length === 1) {
			const k = String(iss.path[0]);
			if (!keyIssues.has(k)) keyIssues.set(k, iss);
			keys = [k];
		} else return false;
		for (const k of keys) {
			if (!unrecKeys.has(k)) unrecKeys.set(k, {});
			unrecKeys.get(k)[side] = true;
		}
		return true;
	};
	for (const iss of left.issues) if (!collect(iss, "l")) result.issues.push(iss);
	for (const iss of right.issues) if (!collect(iss, "r")) result.issues.push(iss);
	const bothKeys = [...unrecKeys].filter(([, f]) => f.l && f.r).map(([k]) => k);
	if (bothKeys.length) {
		const aggregated = unrecIssue ? bothKeys.filter((k) => unrecIssue.keys.includes(k)) : [];
		if (aggregated.length) result.issues.push({
			...unrecIssue,
			keys: aggregated
		});
		for (const k of bothKeys) if (!aggregated.includes(k) && keyIssues.has(k)) result.issues.push(keyIssues.get(k));
	}
	const merged = mergeValues(left.value, right.value);
	if (!merged.valid) {
		if (aborted(result)) return result;
		throw new Error(`Unmergable intersection. Error path: ${JSON.stringify(merged.mergeErrorPath)}`);
	}
	result.value = merged.data;
	return result;
}
var $ZodTuple = /*@__PURE__*/ $constructor("$ZodTuple", (inst, def) => {
	$ZodType.init(inst, def);
	const items = def.items;
	const memo = globalConfig.memoizer;
	memo?.attach(inst);
	inst._zod.parse = (payload, ctx) => {
		const input = payload.value;
		if (!Array.isArray(input)) {
			payload.issues.push({
				input,
				inst,
				expected: "tuple",
				code: "invalid_type"
			});
			return payload;
		}
		payload.value = memo ? memo.alloc(inst, payload, [], ctx) : [];
		const proms = [];
		const optinStart = getTupleOptStart(items, "optin");
		const optoutStart = getTupleOptStart(items, "optout");
		if (!def.rest) {
			if (input.length < optinStart) {
				payload.issues.push({
					code: "too_small",
					minimum: optinStart,
					inclusive: true,
					input,
					inst,
					origin: "array"
				});
				return payload;
			}
			if (input.length > items.length) payload.issues.push({
				code: "too_big",
				maximum: items.length,
				inclusive: true,
				input,
				inst,
				origin: "array"
			});
		}
		const itemResults = new Array(items.length);
		const abortEarly = def.rest ? ctx?.abortEarly : void 0;
		let itemAborted = false;
		for (let i = 0; i < items.length; i++) {
			const r = items[i]._zod.run({
				value: input[i],
				issues: []
			}, ctx);
			if (r instanceof Promise) proms.push(r.then((rr) => {
				itemResults[i] = rr;
			}));
			else {
				itemResults[i] = r;
				if (abortEarly && !itemAborted && r.issues.length) itemAborted = aborted(r);
			}
		}
		if (def.rest && !itemAborted) {
			let i = items.length - 1;
			const rest = input.slice(items.length);
			let seen = payload.issues.length;
			for (const el of rest) {
				if (abortEarly && payload.issues.length !== seen) {
					if (aborted(payload, seen)) break;
					seen = payload.issues.length;
				}
				i++;
				const result = def.rest._zod.run({
					value: el,
					issues: []
				}, ctx);
				if (result instanceof Promise) proms.push(result.then((r) => handleTupleResult(r, payload, i)));
				else handleTupleResult(result, payload, i);
			}
		}
		if (proms.length) return Promise.all(proms).then(() => handleTupleResults(itemResults, payload, items, input, optoutStart));
		return handleTupleResults(itemResults, payload, items, input, optoutStart);
	};
});
function getTupleOptStart(items, key) {
	for (let i = items.length - 1; i >= 0; i--) if (!(key === "optin" ? items[i]._zod.optin !== void 0 : items[i]._zod.optout === "optional")) return i + 1;
	return 0;
}
function handleTupleResult(result, final, index) {
	if (result.issues.length) final.issues.push(...prefixIssues(index, result.issues));
	final.value[index] = result.value;
}
function handleTupleResults(itemResults, final, items, input, optoutStart) {
	for (let i = 0; i < items.length; i++) {
		const r = itemResults[i];
		const isPresent = i < input.length;
		if (!isPresent && i >= optoutStart && items[i]._zod.optin === "optional") {
			final.value.length = i;
			break;
		}
		if (r.issues.length) {
			if (!isPresent && i >= optoutStart) {
				final.value.length = i;
				break;
			}
			final.issues.push(...prefixIssues(i, r.issues));
		}
		final.value[i] = r.value;
	}
	for (let i = final.value.length - 1; i >= input.length; i--) if (items[i]._zod.optout === "optional" && final.value[i] === void 0) final.value.length = i;
	else break;
	return final;
}
var $ZodRecord = /*@__PURE__*/ $constructor("$ZodRecord", (inst, def) => {
	$ZodType.init(inst, def);
	const memo = globalConfig.memoizer;
	memo?.attach(inst);
	inst._zod.parse = (payload, ctx) => {
		const input = payload.value;
		if (!isPlainObject(input)) {
			payload.issues.push({
				expected: "record",
				code: "invalid_type",
				input,
				inst
			});
			return payload;
		}
		const proms = [];
		const values = def.keyType._zod.values;
		if (values && !def.partial) {
			payload.value = memo ? memo.alloc(inst, payload, {}, ctx) : {};
			const recordKeys = /* @__PURE__ */ new Set();
			for (const key of values) if (typeof key === "string" || typeof key === "number" || typeof key === "symbol") {
				recordKeys.add(typeof key === "number" ? key.toString() : key);
				if (key === "__proto__") continue;
				const keyResult = def.keyType._zod.run({
					value: key,
					issues: []
				}, ctx);
				if (keyResult instanceof Promise) throw new Error("Async schemas not supported in object keys currently");
				if (keyResult.issues.length) {
					payload.issues.push({
						code: "invalid_key",
						origin: "record",
						issues: keyResult.issues.map((iss) => finalizeIssue(iss, ctx, config())),
						input: key,
						path: [key],
						inst
					});
					continue;
				}
				const outKey = keyResult.value;
				if (outKey === "__proto__") continue;
				const result = def.valueType._zod.run({
					value: input[key],
					issues: []
				}, ctx);
				if (result instanceof Promise) proms.push(result.then((result) => {
					if (result.issues.length) payload.issues.push(...prefixIssues(key, result.issues));
					payload.value[outKey] = result.value;
				}));
				else {
					if (result.issues.length) payload.issues.push(...prefixIssues(key, result.issues));
					payload.value[outKey] = result.value;
				}
			}
			let unrecognized;
			for (const key in input) if (!recordKeys.has(key)) {
				if (def.mode === "loose") {
					if (key === "__proto__") continue;
					payload.value[key] = input[key];
				} else {
					unrecognized = unrecognized ?? [];
					unrecognized.push(key);
				}
			}
			if (unrecognized && unrecognized.length > 0) payload.issues.push({
				code: "unrecognized_keys",
				input,
				inst,
				keys: unrecognized,
				continue: true
			});
		} else {
			payload.value = memo ? memo.alloc(inst, payload, {}, ctx) : {};
			let unrecognized;
			for (const key of Reflect.ownKeys(input)) {
				if (key === "__proto__") continue;
				if (!Object.prototype.propertyIsEnumerable.call(input, key)) continue;
				let keyResult = def.keyType._zod.run({
					value: key,
					issues: []
				}, ctx);
				if (keyResult instanceof Promise) throw new Error("Async schemas not supported in object keys currently");
				if (typeof key === "string" && number$1.test(key) && keyResult.issues.length) {
					const retryResult = def.keyType._zod.run({
						value: Number(key),
						issues: []
					}, ctx);
					if (retryResult instanceof Promise) throw new Error("Async schemas not supported in object keys currently");
					if (retryResult.issues.length === 0) keyResult = retryResult;
				}
				if (keyResult.issues.length) {
					if (def.mode === "loose") payload.value[key] = input[key];
					else if (values) {
						unrecognized = unrecognized ?? [];
						unrecognized.push(key);
					} else payload.issues.push({
						code: "invalid_key",
						origin: "record",
						issues: keyResult.issues.map((iss) => finalizeIssue(iss, ctx, config())),
						input: key,
						path: [key],
						inst
					});
					continue;
				}
				const outKey = keyResult.value;
				if (outKey === "__proto__") continue;
				const result = def.valueType._zod.run({
					value: input[key],
					issues: []
				}, ctx);
				if (result instanceof Promise) proms.push(result.then((result) => {
					if (result.issues.length) payload.issues.push(...prefixIssues(key, result.issues));
					payload.value[outKey] = result.value;
				}));
				else {
					if (result.issues.length) payload.issues.push(...prefixIssues(key, result.issues));
					payload.value[outKey] = result.value;
				}
			}
			if (unrecognized && unrecognized.length > 0) payload.issues.push({
				code: "unrecognized_keys",
				input,
				inst,
				keys: unrecognized,
				continue: true
			});
		}
		if (proms.length) return Promise.all(proms).then(() => payload);
		return payload;
	};
});
var $ZodEnum = /*@__PURE__*/ $constructor("$ZodEnum", (inst, def) => {
	$ZodType.init(inst, def);
	const values = getEnumValues(def.entries);
	const valuesSet = new Set(values);
	inst._zod.values = valuesSet;
	defineLazyInternal(inst, "pattern", (zod) => {
		const patternValues = getEnumValues(zod.def.entries).filter((k) => propertyKeyTypes.has(typeof k));
		return new RegExp(patternValues.length ? `^(${patternValues.map((o) => escapeRegex(o.toString())).join("|")})$` : "^[^\\s\\S]$");
	});
	inst._zod.parse = (payload, _ctx) => {
		const input = payload.value;
		if (valuesSet.has(input)) return payload;
		payload.issues.push({
			code: "invalid_value",
			values,
			input,
			inst
		});
		return payload;
	};
});
var $ZodLiteral = /*@__PURE__*/ $constructor("$ZodLiteral", (inst, def) => {
	$ZodType.init(inst, def);
	const values = new Set(def.values);
	inst._zod.values = values;
	defineLazyInternal(inst, "pattern", (zod) => {
		const vals = zod.def.values;
		return new RegExp(vals.length ? `^(${vals.map((o) => typeof o === "string" ? escapeRegex(o) : o ? escapeRegex(o.toString()) : String(o)).join("|")})$` : "^[^\\s\\S]$");
	});
	inst._zod.parse = (payload, _ctx) => {
		const input = payload.value;
		if (values.has(input)) return payload;
		payload.issues.push({
			code: "invalid_value",
			values: def.values,
			input,
			inst
		});
		return payload;
	};
});
var $ZodTransform = /*@__PURE__*/ $constructor("$ZodTransform", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.optin = "optional";
	globalConfig.memoizer?.guard(inst);
	inst._zod.parse = (payload, ctx) => {
		if (ctx.direction === "backward") throw new $ZodEncodeError(inst.constructor.name);
		const _out = def.transform(payload.value, payload);
		if (ctx.async) return (_out instanceof Promise ? _out : Promise.resolve(_out)).then((output) => {
			payload.value = output;
			return payload;
		});
		if (_out instanceof Promise) throw new $ZodAsyncError();
		payload.value = _out;
		return payload;
	};
});
function handleOptionalResult(payload, result) {
	payload.value = result.issues.length ? void 0 : result.value;
	return payload;
}
var $ZodOptional = /*@__PURE__*/ $constructor("$ZodOptional", (inst, def) => {
	$ZodType.init(inst, def);
	defineLazyInternal(inst, "optin", (zod) => zod.def.innerType._zod.optin === "defaulted" ? "defaulted" : "optional");
	inst._zod.optout = "optional";
	defineLazyInternal(inst, "values", (zod) => {
		const values = zod.def.innerType._zod.values;
		return values ? /* @__PURE__ */ new Set([...values, void 0]) : void 0;
	});
	defineLazyInternal(inst, "pattern", (zod) => {
		const pattern = zod.def.innerType._zod.pattern;
		return pattern ? new RegExp(`^(${cleanRegex(pattern.source)})?$`) : void 0;
	});
	inst._zod.parse = (payload, ctx) => {
		if (payload.value === void 0) {
			if (def.innerType._zod.optin !== "defaulted") return payload;
			const result = def.innerType._zod.run({
				value: payload.value,
				issues: []
			}, ctx);
			if (result instanceof Promise) return result.then((result) => handleOptionalResult(payload, result));
			return handleOptionalResult(payload, result);
		}
		return def.innerType._zod.run(payload, ctx);
	};
});
var $ZodExactOptional = /*@__PURE__*/ $constructor("$ZodExactOptional", (inst, def) => {
	$ZodOptional.init(inst, def);
	defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
	defineLazyInternal(inst, "pattern", (zod) => zod.def.innerType._zod.pattern);
	inst._zod.parse = (payload, ctx) => {
		return def.innerType._zod.run(payload, ctx);
	};
});
var $ZodNullable = /*@__PURE__*/ $constructor("$ZodNullable", (inst, def) => {
	$ZodType.init(inst, def);
	defineLazyInternal(inst, "optin", (zod) => zod.def.innerType._zod.optin);
	defineLazyInternal(inst, "optout", (zod) => zod.def.innerType._zod.optout);
	defineLazyInternal(inst, "pattern", (zod) => {
		const pattern = zod.def.innerType._zod.pattern;
		return pattern ? new RegExp(`^(${cleanRegex(pattern.source)}|null)$`) : void 0;
	});
	defineLazyInternal(inst, "values", (zod) => {
		return zod.def.innerType._zod.values ? /* @__PURE__ */ new Set([...zod.def.innerType._zod.values, null]) : void 0;
	});
	inst._zod.parse = (payload, ctx) => {
		if (payload.value === null) return payload;
		return def.innerType._zod.run(payload, ctx);
	};
});
var $ZodDefault = /*@__PURE__*/ $constructor("$ZodDefault", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.optin = "defaulted";
	defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
	inst._zod.parse = (payload, ctx) => {
		if (ctx.direction === "backward") return def.innerType._zod.run(payload, ctx);
		if (payload.value === void 0) {
			payload.value = def.defaultValue;
			/**
			* $ZodDefault returns the default value immediately in forward direction.
			* It doesn't pass the default value into the validator ("prefault"). There's no reason to pass the default value through validation. The validity of the default is enforced by TypeScript statically. Otherwise, it's the responsibility of the user to ensure the default is valid. In the case of pipes with divergent in/out types, you can specify the default on the `in` schema of your ZodPipe to set a "prefault" for the pipe.   */
			return payload;
		}
		const result = def.innerType._zod.run(payload, ctx);
		if (result instanceof Promise) return result.then((result) => handleDefaultResult(result, def));
		return handleDefaultResult(result, def);
	};
});
function handleDefaultResult(payload, def) {
	if (payload.value === void 0) payload.value = def.defaultValue;
	return payload;
}
var $ZodPrefault = /*@__PURE__*/ $constructor("$ZodPrefault", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.optin = "defaulted";
	defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
	inst._zod.parse = (payload, ctx) => {
		if (ctx.direction === "backward") return def.innerType._zod.run(payload, ctx);
		if (payload.value === void 0) payload.value = def.defaultValue;
		return def.innerType._zod.run(payload, ctx);
	};
});
var $ZodNonOptional = /*@__PURE__*/ $constructor("$ZodNonOptional", (inst, def) => {
	$ZodType.init(inst, def);
	defineLazyInternal(inst, "values", (zod) => {
		const v = zod.def.innerType._zod.values;
		return v ? new Set([...v].filter((x) => x !== void 0)) : void 0;
	});
	inst._zod.parse = (payload, ctx) => {
		const result = def.innerType._zod.run(payload, ctx);
		if (result instanceof Promise) return result.then((result) => handleNonOptionalResult(result, inst));
		return handleNonOptionalResult(result, inst);
	};
});
function handleNonOptionalResult(payload, inst) {
	if (!payload.issues.length && payload.value === void 0) payload.issues.push({
		code: "invalid_type",
		expected: "nonoptional",
		input: payload.value,
		inst
	});
	return payload;
}
function handleCatchResult(payload, result, def, ctx) {
	if (!result.issues.length) {
		payload.value = result.value;
		if (result.memo) payload.memo = true;
		return payload;
	}
	payload.value = def.catchValue({
		...result,
		value: payload.value,
		error: { issues: result.issues.map((iss) => finalizeIssue(iss, ctx, config())) },
		input: payload.value
	});
	return payload;
}
var $ZodCatch = /*@__PURE__*/ $constructor("$ZodCatch", (inst, def) => {
	$ZodType.init(inst, def);
	defineLazyInternal(inst, "optin", (zod) => zod.def.innerType._zod.optin === "defaulted" ? "defaulted" : "optional");
	defineLazyInternal(inst, "optout", (zod) => zod.def.innerType._zod.optout);
	defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
	inst._zod.parse = (payload, ctx) => {
		if (ctx.direction === "backward") return def.innerType._zod.run(payload, ctx);
		const result = def.innerType._zod.run({
			value: payload.value,
			issues: []
		}, ctx);
		if (result instanceof Promise) return result.then((result) => handleCatchResult(payload, result, def, ctx));
		return handleCatchResult(payload, result, def, ctx);
	};
});
var $ZodPipe = /*@__PURE__*/ $constructor("$ZodPipe", (inst, def) => {
	$ZodType.init(inst, def);
	defineLazyInternal(inst, "values", (zod) => zod.def.in._zod.values);
	defineLazyInternal(inst, "optin", (zod) => zod.def.in._zod.optin);
	defineLazyInternal(inst, "optout", (zod) => zod.def.out._zod.optout);
	defineLazyInternal(inst, "propValues", (zod) => zod.def.in._zod.propValues);
	inst._zod.parse = (payload, ctx) => {
		if (ctx.direction === "backward") {
			const right = def.out._zod.run(payload, ctx);
			if (right instanceof Promise) return right.then((right) => handlePipeResult(right, def.in, ctx));
			return handlePipeResult(right, def.in, ctx);
		}
		const left = def.in._zod.run(payload, ctx);
		if (left instanceof Promise) return left.then((left) => handlePipeResult(left, def.out, ctx));
		return handlePipeResult(left, def.out, ctx);
	};
});
function handlePipeResult(left, next, ctx) {
	if (left.issues.some((iss) => iss.code !== "unrecognized_keys")) {
		left.aborted = true;
		return left;
	}
	return next._zod.run({
		value: left.value,
		issues: left.issues
	}, ctx);
}
var $ZodReadonly = /*@__PURE__*/ $constructor("$ZodReadonly", (inst, def) => {
	$ZodType.init(inst, def);
	defineLazyInternal(inst, "propValues", (zod) => zod.def.innerType._zod.propValues);
	defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
	defineLazyInternal(inst, "optin", (zod) => zod.def.innerType?._zod?.optin);
	defineLazyInternal(inst, "optout", (zod) => zod.def.innerType?._zod?.optout);
	inst._zod.parse = (payload, ctx) => {
		if (ctx.direction === "backward") return def.innerType._zod.run(payload, ctx);
		const result = def.innerType._zod.run(payload, ctx);
		if (result instanceof Promise) return result.then(handleReadonlyResult);
		return handleReadonlyResult(result);
	};
});
function handleReadonlyResult(payload) {
	if (!payload.memo) payload.value = Object.freeze(payload.value);
	return payload;
}
var $ZodCustom = /*@__PURE__*/ $constructor("$ZodCustom", (inst, def) => {
	$ZodCheck.init(inst, def);
	$ZodType.init(inst, def);
	inst._zod.parse = (payload, _) => {
		return payload;
	};
	inst._zod.check = (payload) => {
		const input = payload.value;
		const r = def.fn(input);
		if (r instanceof Promise) return r.then((r) => handleRefineResult(r, payload, input, inst));
		handleRefineResult(r, payload, input, inst);
	};
});
function handleRefineResult(result, payload, input, inst) {
	if (!result) {
		const _iss = {
			code: "custom",
			input,
			inst,
			path: [...inst._zod.def.path ?? []],
			continue: !inst._zod.def.abort
		};
		if (inst._zod.def.params) _iss.params = inst._zod.def.params;
		payload.issues.push(issue(_iss));
	}
}
//#endregion
//#region ../../node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/memoizer.js
var $ZodCyclicError = class extends Error {
	constructor() {
		super(`Cannot parse a reference cycle that closes through a transform`);
		this.name = "ZodCyclicError";
	}
};
/** Keyed off the context object every schema in one parse call already shares. */
var STATE = "~memo";
var NO_ISSUES = [];
function isRef(value) {
	return value !== null && typeof value === "object";
}
function cloneIssues(issues) {
	return issues.map((iss) => iss.path ? {
		...iss,
		path: iss.path.slice()
	} : { ...iss });
}
var recursive = /*@__PURE__*/ new WeakMap();
/** What the walk established, in order of certainty: ordered so the strongest answer among children wins. */
var NONE = 0;
var ASSUMED = 1;
var PROVEN = 2;
/** Whether this schema's subtree contains a cycle, so one parse can re-enter it. */
function isRecursive(inst, stack, resolve) {
	const cached = recursive.get(inst);
	if (cached !== void 0) return cached ? PROVEN : NONE;
	if (stack.has(inst)) return PROVEN;
	stack.add(inst);
	let result = NONE;
	const check = (child) => {
		if (result !== PROVEN && child?._zod) {
			const answer = isRecursive(child, stack, resolve);
			if (answer > result) result = answer;
		}
	};
	const shape = (sh, spread) => {
		let answer = NONE;
		for (const key of Reflect.ownKeys(sh)) {
			const desc = Object.getOwnPropertyDescriptor(sh, key);
			if (spread && !desc.enumerable) continue;
			const child = desc.get ? ASSUMED : desc.value?._zod ? isRecursive(desc.value, stack, resolve) : NONE;
			if (child > answer) answer = child;
		}
		return answer;
	};
	const merge = (answer) => {
		if (answer > result) result = answer;
	};
	const def = inst._zod.def;
	switch (def.type) {
		case "object": {
			const raw = rawShape(def);
			merge(raw ? shape(raw, true) : ASSUMED);
			check(def.catchall);
			break;
		}
		case "array":
			check(def.element);
			break;
		case "tuple":
			for (const el of def.items) check(el);
			check(def.rest);
			break;
		case "record":
		case "map":
			check(def.keyType);
			check(def.valueType);
			break;
		case "set":
			check(def.valueType);
			break;
		case "union":
			for (const el of def.options) check(el);
			break;
		case "intersection":
			check(def.left);
			check(def.right);
			break;
		case "optional":
		case "nullable":
		case "default":
		case "prefault":
		case "catch":
		case "readonly":
		case "nonoptional":
		case "promise":
		case "success":
			check(def.innerType);
			break;
		case "pipe":
			check(def.in);
			check(def.out);
			break;
		case "function":
			check(def.input);
			check(def.output);
			break;
		case "lazy": {
			const inner = def._cachedInner ?? (resolve ? inst._zod.innerType : void 0);
			merge(inner ? isRecursive(inner, stack, false) : ASSUMED);
			break;
		}
		case "template_literal":
		case "string":
		case "number":
		case "int":
		case "boolean":
		case "bigint":
		case "symbol":
		case "undefined":
		case "null":
		case "void":
		case "never":
		case "any":
		case "unknown":
		case "date":
		case "nan":
		case "enum":
		case "literal":
		case "file":
		case "transform":
		case "custom": break;
		default: for (const key in def) {
			const desc = Object.getOwnPropertyDescriptor(def, key);
			if (!desc || desc.get) continue;
			const value = desc.value;
			if (!value || typeof value !== "object") continue;
			if (value._zod) check(value);
			else if (Array.isArray(value)) for (const el of value) check(el);
		}
	}
	stack.delete(inst);
	return settle(inst, result);
}
/** An assumed answer must not outlive the resolution that settles it, so only a certain one is cached. */
function settle(inst, answer) {
	if (answer !== ASSUMED) recursive.set(inst, answer === PROVEN);
	return answer;
}
function bucketFor(state, inst) {
	let bucket = state.buckets.get(inst);
	if (!bucket) {
		bucket = /* @__PURE__ */ new WeakMap();
		state.buckets.set(inst, bucket);
	}
	return bucket;
}
var handoff;
var open = [];
var memo = {
	alloc(_inst, payload, empty) {
		const bucket = handoff;
		if (!bucket) return empty;
		handoff = void 0;
		const entry = {
			value: empty,
			issues: null
		};
		bucket.set(payload.value, entry);
		open.push(entry);
		return empty;
	},
	guard(inst) {
		var _a;
		(_a = inst._zod).deferred ?? (_a.deferred = []);
		inst._zod.deferred.push(() => {
			const base = inst._zod.parse;
			const wrapped = (payload, ctx) => {
				if (ctx.direction !== "backward" && isBackEdge(ctx, payload.value)) throw new $ZodCyclicError();
				return base(payload, ctx);
			};
			inst._zod.parse = wrapped;
			if (inst._zod.run === base) inst._zod.run = wrapped;
		});
	},
	attach(inst) {
		var _a;
		let isRecursiveInst;
		let rechecked = false;
		let lastCtx;
		let lastBucket;
		(_a = inst._zod).deferred ?? (_a.deferred = []);
		inst._zod.deferred.push(() => {
			const base = inst._zod.parse;
			const wrapped = (payload, ctx) => {
				if (isRecursiveInst === void 0) {
					const walked = isRecursive(inst, /* @__PURE__ */ new Set(), false);
					if (walked === NONE) {
						inst._zod.parse = base;
						if (inst._zod.run === wrapped) inst._zod.run = base;
						return base(payload, ctx);
					}
					if (walked === PROVEN || rechecked) isRecursiveInst = true;
					else rechecked = true;
				}
				const input = payload.value;
				if (!isRef(input)) return base(payload, ctx);
				let state = ctx[STATE];
				if (!state) {
					state = {
						buckets: /* @__PURE__ */ new WeakMap(),
						backEdges: void 0
					};
					ctx[STATE] = state;
				}
				let bucket;
				if (lastCtx === ctx) bucket = lastBucket;
				else {
					bucket = bucketFor(state, inst);
					lastCtx = ctx;
					lastBucket = bucket;
				}
				const hit = bucket.get(input);
				if (hit) {
					payload.value = hit.value;
					if (hit.issues) {
						if (hit.issues.length) payload.issues.push(...cloneIssues(hit.issues));
					} else {
						payload.memo = true;
						state.backEdges ?? (state.backEdges = /* @__PURE__ */ new WeakSet());
						state.backEdges.add(hit.value);
					}
					return payload;
				}
				handoff = bucket;
				const depth = open.length;
				const result = base(payload, ctx);
				handoff = void 0;
				const entry = open.length > depth ? open.pop() : void 0;
				if (result instanceof Promise) return result.then((r) => {
					if (entry) entry.issues = r.issues.length ? cloneIssues(r.issues) : NO_ISSUES;
					return r;
				});
				if (entry) entry.issues = result.issues.length ? cloneIssues(result.issues) : NO_ISSUES;
				return result;
			};
			inst._zod.parse = wrapped;
			if (inst._zod.run === base) inst._zod.run = wrapped;
		});
	}
};
/** The memoizer that gives containers cycle support. `zod` installs it by default; `zod/mini` opts in with `config({ memoizer: memoizer() })`. */
function memoizer() {
	return memo;
}
/** Whether this value is a node a back-edge resolved to before it finished. */
function isBackEdge(ctx, value) {
	const backEdges = ctx[STATE]?.backEdges;
	return backEdges !== void 0 && isRef(value) && backEdges.has(value);
}
//#endregion
//#region ../../node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/locales/en.js
var error = () => {
	const Sizable = {
		string: {
			unit: "characters",
			verb: "to have"
		},
		file: {
			unit: "bytes",
			verb: "to have"
		},
		array: {
			unit: "items",
			verb: "to have"
		},
		set: {
			unit: "items",
			verb: "to have"
		},
		map: {
			unit: "entries",
			verb: "to have"
		}
	};
	function getSizing(origin) {
		return Sizable[origin] ?? null;
	}
	const FormatDictionary = {
		regex: "input",
		email: "email address",
		url: "URL",
		emoji: "emoji",
		uuid: "UUID",
		uuidv4: "UUIDv4",
		uuidv6: "UUIDv6",
		nanoid: "nanoid",
		guid: "GUID",
		cuid: "cuid",
		cuid2: "cuid2",
		ulid: "ULID",
		xid: "XID",
		ksuid: "KSUID",
		datetime: "ISO datetime",
		date: "ISO date",
		time: "ISO time",
		duration: "ISO duration",
		ipv4: "IPv4 address",
		ipv6: "IPv6 address",
		mac: "MAC address",
		cidrv4: "IPv4 range",
		cidrv6: "IPv6 range",
		base64: "base64-encoded string",
		base64url: "base64url-encoded string",
		json_string: "JSON string",
		e164: "E.164 number",
		currency_code: "currency code",
		credit_card: "credit card number",
		iban: "IBAN",
		jwt: "JWT",
		template_literal: "input"
	};
	const TypeDictionary = { nan: "NaN" };
	function getTypeName(type, input) {
		if (type === "number" && typeof input === "number" && !Number.isFinite(input)) return String(input);
		return TypeDictionary[type] ?? type;
	}
	return (issue) => {
		switch (issue.code) {
			case "invalid_type": return `Invalid input: expected ${getTypeName(issue.expected)}, received ${getTypeName(parsedType(issue.input), issue.input)}`;
			case "invalid_value":
				if (issue.values.length === 1) return `Invalid input: expected ${stringifyPrimitive(issue.values[0])}`;
				return `Invalid option: expected one of ${joinValues(issue.values, "|")}`;
			case "too_big": {
				const adj = issue.exact ? "exactly " : issue.inclusive ? "<=" : "<";
				const sizing = getSizing(issue.origin);
				if (sizing) return `Too big: expected ${issue.origin ?? "value"} to have ${adj}${issue.maximum.toString()} ${sizing.unit ?? "elements"}`;
				return `Too big: expected ${issue.origin ?? "value"} to be ${adj}${issue.maximum.toString()}`;
			}
			case "too_small": {
				const adj = issue.exact ? "exactly " : issue.inclusive ? ">=" : ">";
				const sizing = getSizing(issue.origin);
				if (sizing) return `Too small: expected ${issue.origin} to have ${adj}${issue.minimum.toString()} ${sizing.unit}`;
				return `Too small: expected ${issue.origin} to be ${adj}${issue.minimum.toString()}`;
			}
			case "invalid_format": {
				const _issue = issue;
				if (_issue.format === "starts_with") return `Invalid string: must start with "${_issue.prefix}"`;
				if (_issue.format === "ends_with") return `Invalid string: must end with "${_issue.suffix}"`;
				if (_issue.format === "includes") return `Invalid string: must include "${_issue.includes}"`;
				if (_issue.format === "regex") return `Invalid string: must match pattern ${_issue.pattern}`;
				return `Invalid ${FormatDictionary[_issue.format] ?? issue.format}`;
			}
			case "not_multiple_of": return `Invalid number: must be a multiple of ${issue.divisor}`;
			case "unrecognized_keys": return `Unrecognized key${issue.keys.length > 1 ? "s" : ""}: ${joinValues(issue.keys, ", ")}`;
			case "invalid_key": return `Invalid key in ${issue.origin}`;
			case "invalid_union":
				if (issue.options && Array.isArray(issue.options) && issue.options.length > 0) return `Invalid discriminator value. Expected ${issue.options.map((o) => `'${o}'`).join(" | ")}`;
				if (issue.inclusive === false) return "Invalid input: more than one option matched";
				return "Invalid input";
			case "invalid_element": return `Invalid value in ${issue.origin}`;
			default: return `Invalid input`;
		}
	};
};
function en_default() {
	return { localeError: error() };
}
//#endregion
//#region ../../node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/registries.js
var _a;
var $ZodRegistry = class {
	constructor() {
		this._map = /* @__PURE__ */ new WeakMap();
		this._idmap = /* @__PURE__ */ new Map();
	}
	add(schema, ..._meta) {
		const meta = _meta[0];
		this._map.set(schema, meta);
		if (meta && typeof meta === "object" && "id" in meta) this._idmap.set(meta.id, schema);
		return this;
	}
	clear() {
		this._map = /* @__PURE__ */ new WeakMap();
		this._idmap = /* @__PURE__ */ new Map();
		return this;
	}
	remove(schema) {
		const meta = this._map.get(schema);
		if (meta && typeof meta === "object" && "id" in meta) this._idmap.delete(meta.id);
		this._map.delete(schema);
		return this;
	}
	get(schema) {
		const p = schema._zod.parent;
		if (p) {
			const pm = { ...this.get(p) ?? {} };
			delete pm.id;
			const f = {
				...pm,
				...this._map.get(schema)
			};
			return Object.keys(f).length ? f : void 0;
		}
		return this._map.get(schema);
	}
	has(schema) {
		return this._map.has(schema);
	}
};
function registry() {
	return new $ZodRegistry();
}
(_a = globalThis).__zod_globalRegistry ?? (_a.__zod_globalRegistry = registry());
var globalRegistry = globalThis.__zod_globalRegistry;
//#endregion
//#region ../../node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/api.js
function snapshotChecks(def) {
	if (def.checks) def.checks = [...def.checks];
	return def;
}
// @__NO_SIDE_EFFECTS__
function _string(Class, params) {
	return new Class(snapshotChecks({
		type: "string",
		...normalizeParams(params)
	}));
}
// @__NO_SIDE_EFFECTS__
function _email(Class, params) {
	return new Class({
		type: "string",
		format: "email",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _guid(Class, params) {
	return new Class({
		type: "string",
		format: "guid",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _uuid(Class, params) {
	return new Class({
		type: "string",
		format: "uuid",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _uuidv4(Class, params) {
	return new Class({
		type: "string",
		format: "uuid",
		check: "string_format",
		abort: false,
		version: "v4",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _uuidv6(Class, params) {
	return new Class({
		type: "string",
		format: "uuid",
		check: "string_format",
		abort: false,
		version: "v6",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _uuidv7(Class, params) {
	return new Class({
		type: "string",
		format: "uuid",
		check: "string_format",
		abort: false,
		version: "v7",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _url(Class, params) {
	return new Class({
		type: "string",
		format: "url",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _emoji(Class, params) {
	return new Class({
		type: "string",
		format: "emoji",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _nanoid(Class, params) {
	return new Class({
		type: "string",
		format: "nanoid",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
/**
* @deprecated CUID v1 is deprecated by its authors due to information leakage
* (timestamps embedded in the id). Use {@link _cuid2} instead.
* See https://github.com/paralleldrive/cuid.
*/
// @__NO_SIDE_EFFECTS__
function _cuid(Class, params) {
	return new Class({
		type: "string",
		format: "cuid",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _cuid2(Class, params) {
	return new Class({
		type: "string",
		format: "cuid2",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _ulid(Class, params) {
	return new Class({
		type: "string",
		format: "ulid",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _xid(Class, params) {
	return new Class({
		type: "string",
		format: "xid",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _ksuid(Class, params) {
	return new Class({
		type: "string",
		format: "ksuid",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _ipv4(Class, params) {
	return new Class({
		type: "string",
		format: "ipv4",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _ipv6(Class, params) {
	return new Class({
		type: "string",
		format: "ipv6",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _cidrv4(Class, params) {
	return new Class({
		type: "string",
		format: "cidrv4",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _cidrv6(Class, params) {
	return new Class({
		type: "string",
		format: "cidrv6",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _base64(Class, params) {
	return new Class({
		type: "string",
		format: "base64",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _base64url(Class, params) {
	return new Class({
		type: "string",
		format: "base64url",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _e164(Class, params) {
	return new Class({
		type: "string",
		format: "e164",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _jwt(Class, params) {
	return new Class({
		type: "string",
		format: "jwt",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _isoDateTime(Class, params) {
	return new Class({
		type: "string",
		format: "datetime",
		check: "string_format",
		offset: false,
		local: false,
		precision: null,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _isoDate(Class, params) {
	return new Class({
		type: "string",
		format: "date",
		check: "string_format",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _isoTime(Class, params) {
	return new Class({
		type: "string",
		format: "time",
		check: "string_format",
		precision: null,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _isoDuration(Class, params) {
	return new Class({
		type: "string",
		format: "duration",
		check: "string_format",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _number(Class, params) {
	return new Class(snapshotChecks({
		type: "number",
		checks: [],
		...normalizeParams(params)
	}));
}
// @__NO_SIDE_EFFECTS__
function _int(Class, params) {
	return new Class({
		type: "number",
		check: "number_format",
		abort: false,
		format: "safeint",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _boolean(Class, params) {
	return new Class({
		type: "boolean",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _unknown(Class) {
	return new Class({ type: "unknown" });
}
// @__NO_SIDE_EFFECTS__
function _never(Class, params) {
	return new Class({
		type: "never",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _void$1(Class, params) {
	return new Class({
		type: "void",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _lt(value, params) {
	return new $ZodCheckLessThan({
		check: "less_than",
		...normalizeParams(params),
		value,
		inclusive: false
	});
}
// @__NO_SIDE_EFFECTS__
function _lte(value, params) {
	return new $ZodCheckLessThan({
		check: "less_than",
		...normalizeParams(params),
		value,
		inclusive: true
	});
}
// @__NO_SIDE_EFFECTS__
function _gt(value, params) {
	return new $ZodCheckGreaterThan({
		check: "greater_than",
		...normalizeParams(params),
		value,
		inclusive: false
	});
}
// @__NO_SIDE_EFFECTS__
function _gte(value, params) {
	return new $ZodCheckGreaterThan({
		check: "greater_than",
		...normalizeParams(params),
		value,
		inclusive: true
	});
}
// @__NO_SIDE_EFFECTS__
function _multipleOf(value, params) {
	return new $ZodCheckMultipleOf({
		check: "multiple_of",
		...normalizeParams(params),
		value
	});
}
// @__NO_SIDE_EFFECTS__
function _maxLength(maximum, params) {
	return new $ZodCheckMaxLength({
		check: "max_length",
		...normalizeParams(params),
		maximum
	});
}
// @__NO_SIDE_EFFECTS__
function _minLength(minimum, params) {
	return new $ZodCheckMinLength({
		check: "min_length",
		...normalizeParams(params),
		minimum
	});
}
// @__NO_SIDE_EFFECTS__
function _length(length, params) {
	return new $ZodCheckLengthEquals({
		check: "length_equals",
		...normalizeParams(params),
		length
	});
}
// @__NO_SIDE_EFFECTS__
function _regex(pattern, params) {
	return new $ZodCheckRegex({
		check: "string_format",
		format: "regex",
		...normalizeParams(params),
		pattern
	});
}
// @__NO_SIDE_EFFECTS__
function _lowercase(params) {
	return new $ZodCheckLowerCase({
		check: "string_format",
		format: "lowercase",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _uppercase(params) {
	return new $ZodCheckUpperCase({
		check: "string_format",
		format: "uppercase",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _includes(includes, params) {
	return new $ZodCheckIncludes({
		check: "string_format",
		format: "includes",
		...normalizeParams(params),
		includes
	});
}
// @__NO_SIDE_EFFECTS__
function _startsWith(prefix, params) {
	return new $ZodCheckStartsWith({
		check: "string_format",
		format: "starts_with",
		...normalizeParams(params),
		prefix
	});
}
// @__NO_SIDE_EFFECTS__
function _endsWith(suffix, params) {
	return new $ZodCheckEndsWith({
		check: "string_format",
		format: "ends_with",
		...normalizeParams(params),
		suffix
	});
}
// @__NO_SIDE_EFFECTS__
function _overwrite(tx) {
	return new $ZodCheckOverwrite({
		check: "overwrite",
		tx
	});
}
// @__NO_SIDE_EFFECTS__
function _normalize(form) {
	return /* @__PURE__ */ _overwrite((input) => input.normalize(form));
}
// @__NO_SIDE_EFFECTS__
function _trim() {
	return /* @__PURE__ */ _overwrite((input) => input.trim());
}
// @__NO_SIDE_EFFECTS__
function _toLowerCase() {
	return /* @__PURE__ */ _overwrite((input) => input.toLowerCase());
}
// @__NO_SIDE_EFFECTS__
function _toUpperCase() {
	return /* @__PURE__ */ _overwrite((input) => input.toUpperCase());
}
// @__NO_SIDE_EFFECTS__
function _slugify() {
	return /* @__PURE__ */ _overwrite((input) => slugify(input));
}
// @__NO_SIDE_EFFECTS__
function _array(Class, element, params) {
	return new Class({
		type: "array",
		element,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _custom(Class, fn, _params) {
	const norm = normalizeParams(_params);
	norm.abort ?? (norm.abort = true);
	return new Class({
		type: "custom",
		check: "custom",
		fn,
		...norm
	});
}
// @__NO_SIDE_EFFECTS__
function _refine(Class, fn, _params) {
	return new Class({
		type: "custom",
		check: "custom",
		fn,
		...normalizeParams(_params)
	});
}
// @__NO_SIDE_EFFECTS__
function _superRefine(fn, params) {
	const ch = /* @__PURE__ */ _check((payload) => {
		payload.addIssue = (issue$2) => {
			if (typeof issue$2 === "string") payload.issues.push(issue(issue$2, payload.value, ch._zod.def));
			else {
				const _issue = issue$2;
				if (_issue.fatal) _issue.continue = false;
				_issue.code ?? (_issue.code = "custom");
				if (!("input" in _issue)) _issue.input = payload.value;
				_issue.inst ?? (_issue.inst = ch);
				_issue.continue ?? (_issue.continue = !ch._zod.def.abort);
				payload.issues.push(issue(_issue));
			}
		};
		return fn(payload.value, payload);
	}, params);
	return ch;
}
// @__NO_SIDE_EFFECTS__
function _check(fn, params) {
	const ch = new $ZodCheck({
		check: "custom",
		...normalizeParams(params)
	});
	ch._zod.check = fn;
	return ch;
}
//#endregion
//#region ../../node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/to-json-schema.js
function assignProps(target, ...sources) {
	for (const source of sources) for (const key of Reflect.ownKeys(source)) if (Object.prototype.propertyIsEnumerable.call(source, key)) assignProp(target, key, source[key]);
	return target;
}
function initializeContext(params) {
	let target = params?.target ?? "draft-2020-12";
	if (target === "draft-4") target = "draft-04";
	if (target === "draft-7") target = "draft-07";
	return {
		processors: params.processors ?? {},
		metadataRegistry: params?.metadata ?? globalRegistry,
		target,
		unrepresentable: params?.unrepresentable ?? "throw",
		override: params?.override ?? (() => {}),
		io: params?.io ?? "output",
		counter: 0,
		seen: /* @__PURE__ */ new Map(),
		sharedDefsExtractedFor: void 0,
		sharedEmitDoneFor: void 0,
		cycles: params?.cycles ?? "ref",
		reused: params?.reused ?? "inline",
		intersections: [],
		deferred: [],
		external: params?.external ?? void 0
	};
}
/**
* Applies the `unrepresentable` setting at a site that has no JSON Schema equivalent. Throws
* `message` unless the setting (or the handler's return value) says otherwise. Returns `true` if a
* custom JSON Schema was written into `json`, in which case the caller must not write its own.
*/
function handleUnrepresentable(schema, ctx, json, params, message) {
	const result = typeof ctx.unrepresentable === "function" ? ctx.unrepresentable({
		zodSchema: schema,
		path: params.path,
		message
	}) : ctx.unrepresentable;
	if (result === "any") return false;
	if (result === void 0 || result === "throw") throw new Error(message);
	Object.assign(json, result);
	return true;
}
function processSchema(schema, ctx, _params = {
	path: [],
	schemaPath: []
}) {
	var _a;
	const def = schema._zod.def;
	const seen = ctx.seen.get(schema);
	if (seen) {
		seen.count++;
		if (_params.schemaPath.includes(schema)) seen.cycle = _params.path;
		return seen.schema;
	}
	const result = {
		schema: {},
		count: 1,
		cycle: void 0,
		path: _params.path
	};
	ctx.seen.set(schema, result);
	ctx.sharedDefsExtractedFor = void 0;
	ctx.sharedEmitDoneFor = void 0;
	const overrideSchema = schema._zod.toJSONSchema?.();
	if (overrideSchema) result.schema = overrideSchema;
	else {
		const params = {
			..._params,
			schemaPath: [..._params.schemaPath, schema],
			path: _params.path
		};
		if (schema._zod.processJSONSchema) schema._zod.processJSONSchema(ctx, result.schema, params);
		else {
			const _json = result.schema;
			const processor = ctx.processors[def.type];
			if (!processor) throw new Error(`[toJSONSchema]: Non-representable type encountered: ${def.type}`);
			processor(schema, ctx, _json, params);
		}
		const parent = schema._zod.parent;
		if (parent) {
			if (!result.ref) result.ref = parent;
			processSchema(parent, ctx, params);
			ctx.seen.get(parent).isParent = true;
		}
	}
	const meta = ctx.metadataRegistry.get(schema);
	if (meta) assignProps(result.schema, meta);
	if (ctx.io === "input" && isTransforming(schema)) {
		delete result.schema.examples;
		delete result.schema.default;
	}
	if (ctx.io === "input" && "_prefault" in result.schema) (_a = result.schema).default ?? (_a.default = result.schema._prefault);
	delete result.schema._prefault;
	return ctx.seen.get(schema).schema;
}
function encodeJSONPointerSegment(segment) {
	return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}
function extractDefs(ctx, schema) {
	const root = ctx.seen.get(schema);
	if (!root) throw new Error("Unprocessed schema. This is a bug in Zod.");
	if (ctx.external && ctx.sharedDefsExtractedFor === ctx.external) return;
	const idToSchema = /* @__PURE__ */ new Map();
	for (const entry of ctx.seen.entries()) {
		const id = ctx.metadataRegistry.get(entry[0])?.id;
		if (id) {
			const existing = idToSchema.get(id);
			if (existing && existing !== entry[0]) throw new Error(`Duplicate schema id "${id}" detected during JSON Schema conversion. Two different schemas cannot share the same id when converted together.`);
			idToSchema.set(id, entry[0]);
		}
	}
	const makeURI = (entry) => {
		const defsSegment = ctx.target === "draft-2020-12" ? "$defs" : "definitions";
		if (ctx.external) {
			const externalId = ctx.external.registry.get(entry[0])?.id;
			const uriGenerator = ctx.external.uri ?? ((id) => id);
			if (externalId) return { ref: uriGenerator(externalId) };
			const id = entry[1].defId ?? entry[1].schema.id ?? `schema${ctx.counter++}`;
			entry[1].defId = id;
			return {
				defId: id,
				ref: `${uriGenerator("__shared")}#/${defsSegment}/${encodeJSONPointerSegment(id)}`
			};
		}
		const uriPrefix = `#`;
		const defUriPrefix = `${uriPrefix}/${defsSegment}/`;
		if (entry[1] === root && !entry[1].schema.id) return { ref: uriPrefix };
		const defId = entry[1].schema.id ?? `__schema${ctx.counter++}`;
		return {
			defId,
			ref: defUriPrefix + encodeJSONPointerSegment(defId)
		};
	};
	const extractToDef = (entry) => {
		if (entry[1].schema.$ref) return;
		const seen = entry[1];
		const { ref, defId } = makeURI(entry);
		seen.def = { ...seen.schema };
		if (defId) seen.defId = defId;
		const schema = seen.schema;
		for (const key in schema) delete schema[key];
		schema.$ref = ref;
	};
	if (ctx.cycles === "throw") for (const entry of ctx.seen.entries()) {
		const seen = entry[1];
		if (seen.cycle) throw new Error(`Cycle detected: #/${seen.cycle?.join("/")}/<root>

Set the \`cycles\` parameter to \`"ref"\` to resolve cyclical schemas with defs.`);
	}
	for (const entry of ctx.seen.entries()) {
		const seen = entry[1];
		if (schema === entry[0]) {
			extractToDef(entry);
			continue;
		}
		if (ctx.external) {
			const ext = ctx.external.registry.get(entry[0])?.id;
			if (schema !== entry[0] && ext) {
				extractToDef(entry);
				continue;
			}
		}
		if (ctx.metadataRegistry.get(entry[0])?.id) {
			extractToDef(entry);
			continue;
		}
		if (seen.cycle) {
			extractToDef(entry);
			continue;
		}
		if (seen.count > 1) {
			if (ctx.reused === "ref") extractToDef(entry);
		}
	}
	if (ctx.external) ctx.sharedDefsExtractedFor = ctx.external;
}
/** Rewrites `anyOf: [{type: "a"}, {type: "b"}]` to `type: ["a", "b"]`, which every JSON Schema draft treats as equivalent and most consumers render far better for the nullable case. Only branches that are a bare type assertion qualify — anything carrying a constraint, `$ref`, `const` or metadata is left alone. Runs after `flattenRef`, so a branch an override decorated or `$defs` extraction turned into a `$ref` is no longer bare and correctly stays in `anyOf`. `oneOf` is excluded: `integer` and `number` overlap, so "exactly one" and "at least one" are not the same there. OpenAPI 3.0 is excluded: its `type` must be a single string. */
function compactTypeUnion(schema) {
	const options = schema.anyOf;
	if (!Array.isArray(options) || options.length === 0 || schema.type !== void 0) return;
	const types = [];
	for (const option of options) {
		if (!option || typeof option !== "object") return;
		compactTypeUnion(option);
		const keys = Object.keys(option);
		if (keys.length !== 1 || keys[0] !== "type") return;
		const type = option.type;
		for (const member of Array.isArray(type) ? type : [type]) {
			if (typeof member !== "string") return;
			if (!types.includes(member)) types.push(member);
		}
	}
	delete schema.anyOf;
	schema.type = types.length === 1 ? types[0] : types;
}
/** Keywords `foldIntersection` knows how to combine. Anything else — `$ref`, `patternProperties`,
* an annotation like `description` — makes a member unfoldable, so a constraint this does not
* understand leaves the `allOf` alone instead of being silently dropped or misattributed. */
var FOLDABLE_KEYS = /* @__PURE__ */ new Set([
	"type",
	"properties",
	"required",
	"additionalProperties"
]);
var UNION_KEYS = ["oneOf", "anyOf"];
/** A member's constraint on a key it does not declare itself. A `catchall` states one; `false`, an absent `additionalProperties`, and the empty schema a loose object emits state nothing. */
function undeclaredConstraint(member) {
	const extra = member.additionalProperties;
	if (extra === void 0 || extra === false || typeof extra !== "object" || extra === null) return null;
	return Object.keys(extra).length ? extra : null;
}
/** Combines object members into the single object they describe together, or returns `null` if any of them carries a keyword outside {@link FOLDABLE_KEYS}. */
function foldObjects(members) {
	const objects = [];
	for (const member of members) {
		if (typeof member !== "object" || member.type !== "object") return null;
		for (const key in member) if (!FOLDABLE_KEYS.has(key)) return null;
		objects.push(member);
	}
	const properties = {};
	const required = /* @__PURE__ */ new Set();
	for (const object of objects) {
		for (const key in object.properties) {
			if (Object.prototype.hasOwnProperty.call(properties, key)) continue;
			const parts = [];
			for (const other of objects) {
				const part = other.properties?.[key] ?? undeclaredConstraint(other);
				if (part === null || part === void 0) continue;
				if (!parts.some((seen) => JSON.stringify(seen) === JSON.stringify(part))) parts.push(part);
			}
			assignProp(properties, key, parts.length === 1 ? parts[0] : foldObjects(parts) ?? { allOf: parts });
		}
		for (const key of object.required ?? []) required.add(key);
	}
	const folded = {
		type: "object",
		properties
	};
	if (required.size) folded.required = [...required];
	if (objects.every((object) => object.additionalProperties === false)) folded.additionalProperties = false;
	else {
		const constraints = [];
		for (const object of objects) {
			const constraint = undeclaredConstraint(object);
			if (constraint && !constraints.some((seen) => JSON.stringify(seen) === JSON.stringify(constraint))) constraints.push(constraint);
		}
		if (constraints.length === 1) folded.additionalProperties = constraints[0];
		else if (constraints.length > 1) folded.additionalProperties = { allOf: constraints };
	}
	return folded;
}
/** `additionalProperties` in an `allOf` member sees only that member's own `properties`, so two
* closed object members reject each other's keys and the schema validates nothing. Zod's parser
* pools the key sets instead — `handleIntersectionResults` reports a key as unrecognized only when
* *every* side rejects it — so the emitted schema has to pool them too, and folding the members
* into one object is the encoding that says so on every target.
*
* This runs from `finalize`, after `extractDefs`, which is what keeps it clear of the `$ref`
* machinery: a member extracted into `$defs` is already a `$ref` by now and declines to fold, so it
* keeps its reference and its own closedness rather than being inlined as a stale copy. */
function foldIntersection(json) {
	const allOf = json.allOf;
	if (!Array.isArray(allOf) || allOf.length < 2) return;
	for (const key of FOLDABLE_KEYS) if (key in json) return;
	const unions = allOf.filter((m) => UNION_KEYS.some((k) => Array.isArray(m[k])));
	let folded = null;
	if (!unions.length) folded = foldObjects(allOf);
	else {
		const union = unions[0];
		const keyword = UNION_KEYS.find((k) => Array.isArray(union[k]));
		if (Object.keys(union).length !== 1) return;
		const rest = allOf.filter((m) => m !== union);
		const branches = union[keyword].map((branch) => foldObjects([...rest, branch]));
		if (branches.some((b) => !b)) return;
		folded = { [keyword]: branches };
	}
	if (!folded) return;
	delete json.allOf;
	assignProps(json, folded);
}
function finalize(ctx, schema) {
	const root = ctx.seen.get(schema);
	if (!root) throw new Error("Unprocessed schema. This is a bug in Zod.");
	const flattenRef = (zodSchema) => {
		const seen = ctx.seen.get(zodSchema);
		if (seen.ref === null) return;
		const schema = seen.def ?? seen.schema;
		const _cached = { ...schema };
		const ref = seen.ref;
		seen.ref = null;
		if (ref) {
			flattenRef(ref);
			const refSeen = ctx.seen.get(ref);
			const refSchema = refSeen.schema;
			if (refSchema.$ref && (ctx.target === "draft-07" || ctx.target === "draft-04" || ctx.target === "openapi-3.0")) {
				schema.allOf = schema.allOf ?? [];
				schema.allOf.push(refSchema);
			} else assignProps(schema, refSchema);
			assignProps(schema, _cached);
			if (zodSchema._zod.parent === ref) for (const key in schema) {
				if (key === "$ref" || key === "allOf") continue;
				if (!(key in _cached)) delete schema[key];
			}
			if (refSchema.$ref && refSeen.def) for (const key in schema) {
				if (key === "$ref" || key === "allOf") continue;
				if (key in refSeen.def && JSON.stringify(schema[key]) === JSON.stringify(refSeen.def[key])) delete schema[key];
			}
		}
		const parent = zodSchema._zod.parent;
		if (parent && parent !== ref) {
			flattenRef(parent);
			const parentSeen = ctx.seen.get(parent);
			if (parentSeen?.schema.$ref) {
				schema.$ref = parentSeen.schema.$ref;
				if (parentSeen.def) for (const key in schema) {
					if (key === "$ref" || key === "allOf") continue;
					if (key in parentSeen.def && JSON.stringify(schema[key]) === JSON.stringify(parentSeen.def[key])) delete schema[key];
				}
			}
		}
		ctx.override({
			zodSchema,
			jsonSchema: schema,
			path: seen.path ?? []
		});
	};
	if (!ctx.external || ctx.sharedEmitDoneFor !== ctx.external) {
		for (const entry of [...ctx.seen.entries()].reverse()) flattenRef(entry[0]);
		if (ctx.target !== "openapi-3.0") for (const entry of ctx.seen.entries()) compactTypeUnion(entry[1].def ?? entry[1].schema);
		for (const rewrite of ctx.deferred) rewrite();
		if (ctx.intersections.length) {
			const carriers = /* @__PURE__ */ new Map();
			for (const seen of ctx.seen.values()) for (const json of [seen.schema, seen.def]) {
				const allOf = json?.allOf;
				if (!Array.isArray(allOf)) continue;
				const existing = carriers.get(allOf);
				if (existing) existing.push(json);
				else carriers.set(allOf, [json]);
			}
			for (const allOf of ctx.intersections) for (const json of carriers.get(allOf) ?? []) foldIntersection(json);
		}
	}
	const result = {};
	if (ctx.target === "draft-2020-12") result.$schema = "https://json-schema.org/draft/2020-12/schema";
	else if (ctx.target === "draft-07") result.$schema = "http://json-schema.org/draft-07/schema#";
	else if (ctx.target === "draft-04") result.$schema = "http://json-schema.org/draft-04/schema#";
	else if (ctx.target === "openapi-3.0") {}
	if (ctx.external?.uri) {
		const id = ctx.external.registry.get(schema)?.id;
		if (!id) throw new Error("Schema is missing an `id` property");
		result.$id = ctx.external.uri(id);
	}
	assignProps(result, root.defId ? root.schema : root.def ?? root.schema);
	const rootMetaId = ctx.metadataRegistry.get(schema)?.id;
	if (rootMetaId !== void 0 && result.id === rootMetaId) delete result.id;
	const defs = ctx.external?.defs ?? {};
	if (!ctx.external || ctx.sharedEmitDoneFor !== ctx.external) for (const entry of ctx.seen.entries()) {
		const seen = entry[1];
		if (seen.def && seen.defId) {
			if (seen.def.id === seen.defId) delete seen.def.id;
			assignProp(defs, seen.defId, seen.def);
		}
	}
	if (ctx.external) ctx.sharedEmitDoneFor = ctx.external;
	if (ctx.external) {} else if (Object.keys(defs).length > 0) {
		if (ctx.target === "draft-2020-12") result.$defs = defs;
		else result.definitions = defs;
	}
	try {
		const finalized = JSON.parse(JSON.stringify(result));
		Object.defineProperty(finalized, "~standard", {
			value: {
				...schema["~standard"],
				jsonSchema: {
					input: createStandardJSONSchemaMethod(schema, "input", ctx.processors),
					output: createStandardJSONSchemaMethod(schema, "output", ctx.processors)
				}
			},
			enumerable: false,
			writable: false
		});
		return finalized;
	} catch (_err) {
		throw new Error("Error converting schema to JSON.");
	}
}
function isTransforming(_schema, _ctx) {
	const ctx = _ctx ?? { seen: /* @__PURE__ */ new Set() };
	if (ctx.seen.has(_schema)) return false;
	ctx.seen.add(_schema);
	const def = _schema._zod.def;
	if (def.type === "transform") return true;
	if (def.type === "array") return isTransforming(def.element, ctx);
	if (def.type === "set") return isTransforming(def.valueType, ctx);
	if (def.type === "lazy") return isTransforming(def.getter(), ctx);
	if (def.type === "promise" || def.type === "optional" || def.type === "nonoptional" || def.type === "nullable" || def.type === "readonly" || def.type === "default" || def.type === "prefault" || def.type === "catch") return isTransforming(def.innerType, ctx);
	if (def.type === "intersection") return isTransforming(def.left, ctx) || isTransforming(def.right, ctx);
	if (def.type === "record" || def.type === "map") return isTransforming(def.keyType, ctx) || isTransforming(def.valueType, ctx);
	if (def.type === "pipe") {
		if (_schema._zod.traits.has("$ZodCodec")) return true;
		return isTransforming(def.in, ctx) || isTransforming(def.out, ctx);
	}
	if (def.type === "object") {
		for (const key in def.shape) if (isTransforming(def.shape[key], ctx)) return true;
		return false;
	}
	if (def.type === "union") {
		for (const option of def.options) if (isTransforming(option, ctx)) return true;
		return false;
	}
	if (def.type === "tuple") {
		for (const item of def.items) if (isTransforming(item, ctx)) return true;
		if (def.rest && isTransforming(def.rest, ctx)) return true;
		return false;
	}
	return false;
}
/**
* Creates a toJSONSchema method for a schema instance.
* This encapsulates the logic of initializing context, processing, extracting defs, and finalizing.
*/
var createToJSONSchemaMethod = (schema, processors = {}) => (params) => {
	const ctx = initializeContext({
		...params,
		processors
	});
	processSchema(schema, ctx);
	extractDefs(ctx, schema);
	return finalize(ctx, schema);
};
var createStandardJSONSchemaMethod = (schema, io, processors = {}) => (params) => {
	const { libraryOptions, target } = params ?? {};
	const ctx = initializeContext({
		...libraryOptions ?? {},
		target,
		io,
		processors
	});
	processSchema(schema, ctx);
	extractDefs(ctx, schema);
	return finalize(ctx, schema);
};
//#endregion
//#region ../../node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/json-schema-processors.js
var narrowMin = (agg, key, value) => {
	if (agg[key] === void 0 || value > agg[key]) agg[key] = value;
};
var narrowMax = (agg, key, value) => {
	if (agg[key] === void 0 || value < agg[key]) agg[key] = value;
};
var narrowBoth = (agg, value) => {
	narrowMin(agg, "minimum", value);
	narrowMax(agg, "maximum", value);
};
var addDivisor = (agg, value) => {
	agg.multipleOf ?? (agg.multipleOf = []);
	if (!agg.multipleOf.includes(value)) agg.multipleOf.push(value);
};
var addPattern = (agg, pattern) => {
	agg.patterns ?? (agg.patterns = /* @__PURE__ */ new Set());
	agg.patterns.add(pattern);
};
var intersectMime = (agg, mime) => {
	agg.mime = agg.mime ? agg.mime.filter((m) => mime.includes(m)) : [...mime];
};
var setFormat = (agg, format) => {
	agg.format = format;
	if (format.includes("int")) agg.isInt = true;
};
var minContributor = (agg, def) => narrowMin(agg, "minimum", def.minimum);
var maxContributor = (agg, def) => narrowMax(agg, "maximum", def.maximum);
var formatContributor = (ranges) => (agg, def) => {
	setFormat(agg, def.format);
	const [minimum, maximum] = ranges[def.format];
	narrowMin(agg, "minimum", minimum);
	narrowMax(agg, "maximum", maximum);
};
var contributors = {
	greater_than: (agg, def) => narrowMin(agg, def.inclusive ? "minimum" : "exclusiveMinimum", def.value),
	less_than: (agg, def) => narrowMax(agg, def.inclusive ? "maximum" : "exclusiveMaximum", def.value),
	multiple_of: (agg, def) => addDivisor(agg, def.value),
	number_format: formatContributor(NUMBER_FORMAT_RANGES),
	bigint_format: formatContributor(BIGINT_FORMAT_RANGES),
	min_length: minContributor,
	max_length: maxContributor,
	length_equals: (agg, def) => narrowBoth(agg, def.length),
	min_size: minContributor,
	max_size: maxContributor,
	size_equals: (agg, def) => narrowBoth(agg, def.size),
	string_format: (agg, def) => {
		setFormat(agg, def.format);
		if (def.pattern) addPattern(agg, def.pattern);
		if (def.format === "base64" || def.format === "base64url") agg.contentEncoding = def.format;
		if (def.local || def.precision === -1) agg.laxFormat = true;
	},
	mime_type: (agg, def) => intersectMime(agg, def.mime)
};
function aggregateChecks(schema) {
	const agg = {};
	const def = schema._zod.def;
	const list = schema._zod.traits.has("$ZodCheck") ? [schema, ...def.checks ?? []] : def.checks ?? [];
	for (const ch of list) contributors[ch._zod.def.check]?.(agg, ch._zod.def);
	const bag = schema._zod.bag;
	if (bag.minimum !== void 0) narrowMin(agg, "minimum", bag.minimum);
	if (bag.exclusiveMinimum !== void 0) narrowMin(agg, "exclusiveMinimum", bag.exclusiveMinimum);
	if (bag.maximum !== void 0) narrowMax(agg, "maximum", bag.maximum);
	if (bag.exclusiveMaximum !== void 0) narrowMax(agg, "exclusiveMaximum", bag.exclusiveMaximum);
	if (bag.multipleOf !== void 0) addDivisor(agg, bag.multipleOf);
	if (bag.format !== void 0) {
		agg.format ?? (agg.format = bag.format);
		if (bag.format.includes("int")) agg.isInt = true;
	}
	if (bag.mime) intersectMime(agg, bag.mime);
	for (const pattern of bag.patterns ?? []) addPattern(agg, pattern);
	return agg;
}
var formatMap = {
	guid: "uuid",
	url: "uri",
	datetime: "date-time",
	json_string: "json-string",
	regex: ""
};
var exactPatterns = /* @__PURE__ */ new Map([[base64Charset, base64], [base64urlCharset, base64url]]);
var exactPattern = (p) => exactPatterns.get(p) ?? p;
var stringProcessor = (schema, ctx, _json, _params) => {
	const json = _json;
	json.type = "string";
	const { minimum, maximum, format, patterns, contentEncoding, laxFormat } = aggregateChecks(schema);
	if (typeof minimum === "number") json.minLength = minimum;
	if (typeof maximum === "number") json.maxLength = maximum;
	if (format) {
		json.format = formatMap[format] ?? format;
		if (json.format === "") delete json.format;
		if (format === "time" || laxFormat) delete json.format;
	}
	if (contentEncoding) json.contentEncoding = contentEncoding;
	if (patterns && patterns.size > 0) {
		const patternList = [...patterns].map(exactPattern);
		if (patternList.length === 1) json.pattern = patternList[0].source;
		else if (patternList.length > 1) json.allOf = [...patternList.map((regex) => ({
			...ctx.target === "draft-07" || ctx.target === "draft-04" || ctx.target === "openapi-3.0" ? { type: "string" } : {},
			pattern: regex.source
		}))];
	}
};
var numberProcessor = (schema, ctx, _json, params) => {
	const json = _json;
	const { minimum, maximum, multipleOf, exclusiveMaximum, exclusiveMinimum, isInt } = aggregateChecks(schema);
	json.type = isInt ? "integer" : "number";
	const exMin = typeof exclusiveMinimum === "number" && exclusiveMinimum >= (minimum ?? Number.NEGATIVE_INFINITY);
	const exMax = typeof exclusiveMaximum === "number" && exclusiveMaximum <= (maximum ?? Number.POSITIVE_INFINITY);
	const legacy = ctx.target === "draft-04" || ctx.target === "openapi-3.0";
	if (exMin) {
		if (legacy) {
			json.minimum = exclusiveMinimum;
			json.exclusiveMinimum = true;
		} else json.exclusiveMinimum = exclusiveMinimum;
	} else if (typeof minimum === "number") json.minimum = minimum;
	if (exMax) {
		if (legacy) {
			json.maximum = exclusiveMaximum;
			json.exclusiveMaximum = true;
		} else json.exclusiveMaximum = exclusiveMaximum;
	} else if (typeof maximum === "number") json.maximum = maximum;
	if (multipleOf) {
		const divisors = /* @__PURE__ */ new Set();
		for (const divisor of multipleOf) if (Number.isFinite(divisor) && divisor !== 0) divisors.add(Math.abs(divisor));
		else handleUnrepresentable(schema, ctx, json, params, `A multipleOf divisor of ${divisor} cannot be represented in JSON Schema`);
		const [first, ...rest] = divisors;
		if (first !== void 0) json.multipleOf = first;
		if (rest.length) json.allOf = [...json.allOf ?? [], ...rest.map((m) => ({ multipleOf: m }))];
	}
};
var booleanProcessor = (_schema, _ctx, json, _params) => {
	json.type = "boolean";
};
var voidProcessor = (schema, ctx, json, params) => {
	handleUnrepresentable(schema, ctx, json, params, "Void cannot be represented in JSON Schema");
};
var neverProcessor = (_schema, _ctx, json, _params) => {
	json.not = {};
};
var enumProcessor = (schema, _ctx, json, _params) => {
	const def = schema._zod.def;
	const values = getEnumValues(def.entries);
	if (values.length === 0) {
		json.not = {};
		return;
	}
	if (values.every((v) => typeof v === "number")) json.type = "number";
	if (values.every((v) => typeof v === "string")) json.type = "string";
	json.enum = values;
};
var literalProcessor = (schema, ctx, json, params) => {
	const def = schema._zod.def;
	if (def.values.length === 0) {
		json.not = {};
		return;
	}
	const vals = [];
	for (const val of def.values) if (val === void 0) {
		if (handleUnrepresentable(schema, ctx, json, params, "Literal `undefined` cannot be represented in JSON Schema")) return;
	} else if (typeof val === "bigint") {
		if (handleUnrepresentable(schema, ctx, json, params, "BigInt literals cannot be represented in JSON Schema")) return;
		vals.push(Number(val));
	} else vals.push(val);
	if (vals.length === 0) {} else if (vals.length === 1) {
		const val = vals[0];
		json.type = val === null ? "null" : typeof val;
		if (ctx.target === "draft-04" || ctx.target === "openapi-3.0") json.enum = [val];
		else json.const = val;
	} else {
		if (vals.every((v) => typeof v === "number")) json.type = "number";
		if (vals.every((v) => typeof v === "string")) json.type = "string";
		if (vals.every((v) => typeof v === "boolean")) json.type = "boolean";
		if (vals.every((v) => v === null)) json.type = "null";
		json.enum = vals;
	}
};
var customProcessor = (schema, ctx, json, params) => {
	handleUnrepresentable(schema, ctx, json, params, "Custom types cannot be represented in JSON Schema");
};
var transformProcessor = (schema, ctx, json, params) => {
	handleUnrepresentable(schema, ctx, json, params, "Transforms cannot be represented in JSON Schema");
};
var arrayProcessor = (schema, ctx, _json, params) => {
	const json = _json;
	const def = schema._zod.def;
	const { minimum, maximum } = aggregateChecks(schema);
	if (typeof minimum === "number") json.minItems = minimum;
	if (typeof maximum === "number") json.maxItems = maximum;
	json.type = "array";
	json.items = processSchema(def.element, ctx, {
		...params,
		path: [...params.path, "items"]
	});
};
function inputOptin(schema) {
	const def = schema._zod.def;
	if (def.type === "pipe" && def.in._zod.traits.has("$ZodTransform")) return inputOptin(def.out);
	if (def.type === "catch") return inputOptin(def.innerType);
	return schema._zod.optin;
}
var objectProcessor = (schema, ctx, _json, params) => {
	const json = _json;
	const def = schema._zod.def;
	const shape = def.shape;
	if (Object.getOwnPropertySymbols(shape).length && handleUnrepresentable(schema, ctx, json, params, "Symbol keys cannot be represented in JSON Schema")) return;
	json.type = "object";
	json.properties = {};
	for (const key in shape) assignProp(json.properties, key, processSchema(shape[key], ctx, {
		...params,
		path: [
			...params.path,
			"properties",
			key
		]
	}));
	const requiredKeys = [];
	for (const key of Object.keys(shape)) {
		const field = def.shape[key];
		if (ctx.io === "input" ? inputOptin(field) === void 0 : field._zod.optout === void 0) requiredKeys.push(key);
	}
	if (requiredKeys.length > 0) json.required = requiredKeys;
	if (def.catchall?._zod.def.type === "never") json.additionalProperties = false;
	else if (!def.catchall) {
		if (ctx.io === "output") json.additionalProperties = false;
	} else if (def.catchall) json.additionalProperties = processSchema(def.catchall, ctx, {
		...params,
		path: [...params.path, "additionalProperties"]
	});
};
var unionProcessor = (schema, ctx, json, params) => {
	const def = schema._zod.def;
	const isExclusive = def.inclusive === false;
	const options = def.options.map((x, i) => processSchema(x, ctx, {
		...params,
		path: [
			...params.path,
			isExclusive ? "oneOf" : "anyOf",
			i
		]
	}));
	if (isExclusive) json.oneOf = options;
	else json.anyOf = options;
};
var intersectionProcessor = (schema, ctx, json, params) => {
	const def = schema._zod.def;
	const a = processSchema(def.left, ctx, {
		...params,
		path: [
			...params.path,
			"allOf",
			0
		]
	});
	const b = processSchema(def.right, ctx, {
		...params,
		path: [
			...params.path,
			"allOf",
			1
		]
	});
	const isSimpleIntersection = (val) => "allOf" in val && Object.keys(val).length === 1;
	const allOf = [...isSimpleIntersection(a) ? a.allOf : [a], ...isSimpleIntersection(b) ? b.allOf : [b]];
	json.allOf = allOf;
	ctx.intersections.push(allOf);
};
var tupleProcessor = (schema, ctx, _json, params) => {
	const json = _json;
	const def = schema._zod.def;
	json.type = "array";
	const prefixPath = ctx.target === "draft-2020-12" ? "prefixItems" : "items";
	const restPath = ctx.target === "draft-2020-12" ? "items" : ctx.target === "openapi-3.0" ? "items" : "additionalItems";
	const prefixItems = def.items.map((x, i) => processSchema(x, ctx, {
		...params,
		path: [
			...params.path,
			prefixPath,
			i
		]
	}));
	const rest = def.rest ? processSchema(def.rest, ctx, {
		...params,
		path: [
			...params.path,
			restPath,
			...ctx.target === "openapi-3.0" ? [def.items.length] : []
		]
	}) : null;
	let minItems = def.items.length;
	while (minItems > 0) {
		const item = def.items[minItems - 1];
		if (!(ctx.io === "input" ? inputOptin(item) !== void 0 : item._zod.optout === "optional")) break;
		minItems--;
	}
	const maxItems = def.items.length;
	const isClosed = !def.rest;
	if (ctx.target === "draft-2020-12") {
		json.prefixItems = prefixItems;
		if (isClosed) json.items = false;
		else if (rest) json.items = rest;
		if (minItems > 0) json.minItems = minItems;
		if (isClosed) json.maxItems = maxItems;
	} else if (ctx.target === "openapi-3.0") {
		json.items = { anyOf: prefixItems };
		if (rest) json.items.anyOf.push(rest);
		if (minItems > 0) json.minItems = minItems;
		if (isClosed) json.maxItems = maxItems;
	} else {
		json.items = prefixItems;
		if (isClosed) json.additionalItems = false;
		else if (rest) json.additionalItems = rest;
		if (minItems > 0) json.minItems = minItems;
		if (isClosed) json.maxItems = maxItems;
	}
	const { minimum, maximum } = aggregateChecks(schema);
	if (typeof minimum === "number") json.minItems = minimum;
	if (typeof maximum === "number") json.maxItems = maximum;
};
/** JSON object keys are always strings, so a numeric record key schema is re-expressed over the
* numeric-string form the record parser matches. Deferred to `finalize`, after the flatten: a key
* behind a wrapper only carries its own `type` before then, and a union key only has its branches.
*
* A numeric bound cannot apply to a property name, so `minimum` and its siblings are dropped rather
* than carried over: keeping them beside `type: "string"` reproduces the match-nothing schema this
* exists to fix. A key that carries one therefore emits wider than the record parses — `z.record(z.number().min(5), V)`
* accepts `"3"` — which is the deliberate trade, since throwing on it would reject an ordinary schema
* outright. */
function stringifyKeyNames(bySchema, json, visited) {
	if (json.$ref) {
		if (visited.has(json)) return json;
		visited.add(json);
		const def = bySchema.get(json)?.def;
		if (!def) return json;
		const inlined = stringifyKeyNames(bySchema, def, visited);
		return inlined === def ? json : inlined;
	}
	for (const keyword of ["anyOf", "oneOf"]) {
		const branches = json[keyword];
		if (!Array.isArray(branches)) continue;
		const mapped = branches.map((branch) => stringifyKeyNames(bySchema, branch, visited));
		if (mapped.some((branch, i) => branch !== branches[i])) json = {
			...json,
			[keyword]: mapped
		};
	}
	const types = Array.isArray(json.type) ? json.type : [json.type];
	const numericType = !types.includes("string") && types.some((t) => t === "number" || t === "integer");
	const values = json.enum ?? (json.const !== void 0 ? [json.const] : void 0);
	if (!numericType && !values?.some((v) => typeof v === "number")) return json;
	const { minimum, maximum, exclusiveMinimum, exclusiveMaximum, multipleOf, format, id, ...rest } = json;
	if (rest.enum) rest.enum = rest.enum.map((v) => typeof v === "number" ? String(v) : v);
	else if (typeof rest.const === "number") rest.const = String(rest.const);
	if (!numericType) return rest;
	rest.type = "string";
	if (!values) rest.pattern = (types.includes("number") ? number$1 : integer).source;
	return rest;
}
/** Every record of one conversion, so the carriers are found in a single pass rather than once per record. */
var pendingRecords = /* @__PURE__ */ new WeakMap();
function rewriteKeyNames(ctx) {
	const bySchema = /* @__PURE__ */ new Map();
	for (const entry of ctx.seen.values()) if (entry.def && !bySchema.has(entry.schema)) bySchema.set(entry.schema, entry);
	const rewrites = /* @__PURE__ */ new Map();
	for (const record of pendingRecords.get(ctx) ?? []) {
		const seen = ctx.seen.get(record);
		const names = (seen?.def ?? seen?.schema)?.propertyNames;
		if (!names || names === true || rewrites.has(names)) continue;
		const rewritten = stringifyKeyNames(bySchema, names, /* @__PURE__ */ new Set());
		if (rewritten !== names) rewrites.set(names, rewritten);
	}
	if (!rewrites.size) return;
	for (const entry of ctx.seen.values()) for (const carrier of [entry.schema, entry.def]) {
		const rewritten = carrier && rewrites.get(carrier.propertyNames);
		if (rewritten) carrier.propertyNames = rewritten;
	}
}
var recordProcessor = (schema, ctx, _json, params) => {
	const json = _json;
	const def = schema._zod.def;
	json.type = "object";
	const keyType = def.keyType;
	const patterns = aggregateChecks(keyType).patterns;
	if (def.mode === "loose" && patterns && patterns.size > 0) {
		const valueSchema = processSchema(def.valueType, ctx, {
			...params,
			path: [
				...params.path,
				"patternProperties",
				"*"
			]
		});
		json.patternProperties = {};
		for (const pattern of patterns) assignProp(json.patternProperties, exactPattern(pattern).source, valueSchema);
	} else {
		if (ctx.target === "draft-07" || ctx.target === "draft-2020-12") {
			json.propertyNames = processSchema(def.keyType, ctx, {
				...params,
				path: [...params.path, "propertyNames"]
			});
			let pending = pendingRecords.get(ctx);
			if (!pending) {
				pending = [];
				pendingRecords.set(ctx, pending);
				ctx.deferred.push(() => rewriteKeyNames(ctx));
			}
			pending.push(schema);
		}
		json.additionalProperties = processSchema(def.valueType, ctx, {
			...params,
			path: [...params.path, "additionalProperties"]
		});
	}
	const keyValues = keyType._zod.values;
	const omittableOnInput = ctx.io === "input" && inputOptin(def.valueType) !== void 0;
	if (keyValues && !def.partial && !omittableOnInput) {
		const validKeyValues = [...keyValues].filter((v) => typeof v === "string" || typeof v === "number");
		if (validKeyValues.length > 0) json.required = validKeyValues.map(String);
	}
};
var nullableProcessor = (schema, ctx, json, params) => {
	const def = schema._zod.def;
	const inner = processSchema(def.innerType, ctx, params);
	const seen = ctx.seen.get(schema);
	if (ctx.target === "openapi-3.0") {
		seen.ref = def.innerType;
		json.nullable = true;
	} else json.anyOf = [inner, { type: "null" }];
};
var nonoptionalProcessor = (schema, ctx, _json, params) => {
	const def = schema._zod.def;
	processSchema(def.innerType, ctx, params);
	const seen = ctx.seen.get(schema);
	seen.ref = def.innerType;
};
/** Round-trips a default value through JSON so the emitted schema is guaranteed to be valid JSON.
* A BigInt has no reliable encoding, so it goes through `unrepresentable` like any other
* unrepresentable value. Returns a sentinel when the caller must not write a default of its own. */
var UNREPRESENTABLE_DEFAULT = Symbol();
function serializeDefaultValue(value, schema, ctx, json, params) {
	let unrepresentable = false;
	const serialized = JSON.stringify(value, (_, val) => {
		if (typeof val !== "bigint") return val;
		unrepresentable = true;
		return null;
	});
	if (!unrepresentable) return JSON.parse(serialized);
	handleUnrepresentable(schema, ctx, json, params, "BigInt defaults cannot be represented in JSON Schema");
	return UNREPRESENTABLE_DEFAULT;
}
var defaultProcessor = (schema, ctx, json, params) => {
	const def = schema._zod.def;
	processSchema(def.innerType, ctx, params);
	const seen = ctx.seen.get(schema);
	seen.ref = def.innerType;
	const value = serializeDefaultValue(def.defaultValue, schema, ctx, json, params);
	if (value !== UNREPRESENTABLE_DEFAULT) json.default = value;
};
var prefaultProcessor = (schema, ctx, json, params) => {
	const def = schema._zod.def;
	processSchema(def.innerType, ctx, params);
	const seen = ctx.seen.get(schema);
	seen.ref = def.innerType;
	if (ctx.io !== "input") return;
	const value = serializeDefaultValue(def.defaultValue, schema, ctx, json, params);
	if (value !== UNREPRESENTABLE_DEFAULT) json._prefault = value;
};
var catchProcessor = (schema, ctx, json, params) => {
	const def = schema._zod.def;
	processSchema(def.innerType, ctx, params);
	const seen = ctx.seen.get(schema);
	seen.ref = def.innerType;
	let catchValue;
	try {
		catchValue = def.catchValue(void 0);
	} catch {
		handleUnrepresentable(schema, ctx, json, params, "Dynamic catch values are not supported in JSON Schema");
		return;
	}
	json.default = catchValue;
};
var pipeProcessor = (schema, ctx, _json, params) => {
	const def = schema._zod.def;
	const inIsTransform = def.in._zod.traits.has("$ZodTransform");
	const innerType = ctx.io === "input" ? inIsTransform ? def.out : def.in : def.out;
	processSchema(innerType, ctx, params);
	const seen = ctx.seen.get(schema);
	seen.ref = innerType;
};
var readonlyProcessor = (schema, ctx, json, params) => {
	const def = schema._zod.def;
	processSchema(def.innerType, ctx, params);
	const seen = ctx.seen.get(schema);
	seen.ref = def.innerType;
	json.readOnly = true;
};
var optionalProcessor = (schema, ctx, _json, params) => {
	const def = schema._zod.def;
	processSchema(def.innerType, ctx, params);
	const seen = ctx.seen.get(schema);
	seen.ref = def.innerType;
};
//#endregion
//#region ../../node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/classic/errors.js
var _installedErrorProtos = /* @__PURE__ */ new WeakSet([Object.prototype, Error.prototype]);
function _lazyMethod(proto, key, make) {
	Object.defineProperty(proto, key, {
		configurable: true,
		enumerable: false,
		get() {
			const value = make(this);
			Object.defineProperty(this, key, {
				value,
				configurable: true,
				writable: true
			});
			return value;
		},
		set(value) {
			Object.defineProperty(this, key, {
				value,
				configurable: true,
				writable: true
			});
		}
	});
}
var initializer = (inst, issues) => {
	$ZodError.init(inst, issues);
	inst.name = "ZodError";
	const proto = Object.getPrototypeOf(inst);
	if (_installedErrorProtos.has(proto)) return;
	_installedErrorProtos.add(proto);
	_lazyMethod(proto, "format", (self) => (mapper) => formatError(self, mapper));
	_lazyMethod(proto, "flatten", (self) => (mapper) => flattenError(self, mapper));
	_lazyMethod(proto, "addIssue", (self) => (issue) => {
		self.issues.push(issue);
		self.message = JSON.stringify(self.issues, jsonStringifyReplacer, 2);
	});
	_lazyMethod(proto, "addIssues", (self) => (issues) => {
		self.issues.push(...issues);
		self.message = JSON.stringify(self.issues, jsonStringifyReplacer, 2);
	});
	Object.defineProperty(proto, "isEmpty", {
		configurable: true,
		enumerable: false,
		get() {
			return this.issues.length === 0;
		}
	});
};
var ZodRealError = /*@__PURE__*/ $constructor("ZodError", initializer, void 0, { Parent: Error });
//#endregion
//#region ../../node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/classic/parse.js
var parse = /* @__PURE__ */ _parse(ZodRealError);
var parseAsync = /* @__PURE__ */ _parseAsync(ZodRealError);
var safeParse = /* @__PURE__ */ _safeParse(ZodRealError);
var safeParseAsync = /* @__PURE__ */ _safeParseAsync(ZodRealError);
var encode$1 = /* @__PURE__ */ _encode(ZodRealError);
var decode$1 = /* @__PURE__ */ _decode(ZodRealError);
var encodeAsync = /* @__PURE__ */ _encodeAsync(ZodRealError);
var decodeAsync = /* @__PURE__ */ _decodeAsync(ZodRealError);
var safeEncode = /* @__PURE__ */ _safeEncode(ZodRealError);
var safeDecode = /* @__PURE__ */ _safeDecode(ZodRealError);
var safeEncodeAsync = /* @__PURE__ */ _safeEncodeAsync(ZodRealError);
var safeDecodeAsync = /* @__PURE__ */ _safeDecodeAsync(ZodRealError);
//#endregion
//#region ../../node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/classic/schemas.js
function _ensureDefaultLocale() {
	if (!globalConfig.localeError) config(en_default());
}
function _ensureDefaultMemoizer() {
	if (!globalConfig.memoizer) config({ memoizer: memoizer() });
}
var ZodType = /*@__PURE__*/ $constructor("ZodType", (inst, def) => {
	_ensureDefaultLocale();
	$ZodType.init(inst, def);
	inst.def = def;
	inst.type = def.type;
	return inst;
}, {
	check(...chks) {
		const def = this.def;
		return this.clone(mergeDefs(def, { checks: [...def.checks ?? [], ...chks.map((ch) => typeof ch === "function" ? { _zod: {
			check: ch,
			def: { check: "custom" },
			onattach: []
		} } : ch)] }), { parent: true });
	},
	with(...chks) {
		return this.check(...chks);
	},
	clone(def, params) {
		return clone(this, def, params);
	},
	brand() {
		return this;
	},
	register(reg, meta) {
		reg.add(this, meta);
		return this;
	},
	refine(check, params) {
		return this.check(refine(check, params));
	},
	superRefine(refinement, params) {
		return this.check(superRefine(refinement, params));
	},
	overwrite(fn) {
		return this.check(/* @__PURE__ */ _overwrite(fn));
	},
	optional() {
		return optional(this);
	},
	exactOptional() {
		return exactOptional(this);
	},
	nullable() {
		return nullable(this);
	},
	nullish() {
		return optional(nullable(this));
	},
	nonoptional(params) {
		return nonoptional(this, params);
	},
	array() {
		return array(this);
	},
	or(arg) {
		return union([this, arg]);
	},
	and(arg) {
		return intersection(this, arg);
	},
	transform(tx) {
		return pipe(this, transform(tx));
	},
	default(d) {
		return _default(this, d);
	},
	prefault(d) {
		return prefault(this, d);
	},
	catch(params) {
		return _catch(this, params);
	},
	pipe(target) {
		return pipe(this, target);
	},
	readonly() {
		return readonly(this);
	},
	describe(description) {
		const cl = this.clone();
		globalRegistry.add(cl, { description });
		return cl;
	},
	meta(...args) {
		if (args.length === 0) return globalRegistry.get(this);
		const cl = this.clone();
		globalRegistry.add(cl, args[0]);
		return cl;
	},
	isOptional() {
		return this.safeParse(void 0).success;
	},
	isNullable() {
		return this.safeParse(null).success;
	},
	apply(fn, ...args) {
		return args.length === 0 ? fn(this) : fn(this, ...args);
	},
	get "~standard"() {
		return hide(this, "~standard", {
			...standardProps(this),
			jsonSchema: {
				input: createStandardJSONSchemaMethod(this, "input"),
				output: createStandardJSONSchemaMethod(this, "output")
			}
		});
	},
	set "~standard"(value) {
		own(this, "~standard", value);
	},
	parse: function _parse(data, params) {
		return parse(this, data, params, { callee: _parse });
	},
	parseAsync: async function _parseAsync(data, params) {
		return await parseAsync(this, data, params, { callee: _parseAsync });
	},
	safeParse(data, params) {
		return safeParse(this, data, params);
	},
	async safeParseAsync(data, params) {
		return safeParseAsync(this, data, params);
	},
	get spa() {
		return this?.safeParseAsync;
	},
	set spa(value) {
		own(this, "spa", value);
	},
	validate(data, params) {
		return validate(this, data, params);
	},
	validateAsync(data, params) {
		return validateAsync$1(this, data, params);
	},
	encode: function _encode(data, params) {
		return encode$1(this, data, params, { callee: _encode });
	},
	decode: function _decode(data, params) {
		return decode$1(this, data, params, { callee: _decode });
	},
	encodeAsync: async function _encodeAsync(data, params) {
		return await encodeAsync(this, data, params, { callee: _encodeAsync });
	},
	decodeAsync: async function _decodeAsync(data, params) {
		return await decodeAsync(this, data, params, { callee: _decodeAsync });
	},
	safeEncode(data, params) {
		return safeEncode(this, data, params);
	},
	safeDecode(data, params) {
		return safeDecode(this, data, params);
	},
	async safeEncodeAsync(data, params) {
		return safeEncodeAsync(this, data, params);
	},
	async safeDecodeAsync(data, params) {
		return safeDecodeAsync(this, data, params);
	},
	toJSONSchema(params) {
		return createToJSONSchemaMethod(this, {})(params);
	},
	get description() {
		return globalRegistry.get(this)?.description;
	},
	get _def() {
		return this._zod.def;
	}
});
/** @internal */
var _ZodString = /*@__PURE__*/ $constructor("_ZodString", (inst, def) => {
	$ZodString.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => stringProcessor(inst, ctx, json, params);
}, /*@__PURE__*/ derived({
	format: (inst) => aggregateChecks(inst).format ?? null,
	minLength: (inst) => aggregateChecks(inst).minimum ?? null,
	maxLength: (inst) => aggregateChecks(inst).maximum ?? null
}, {
	regex(...args) {
		return this.check(/* @__PURE__ */ _regex(...args));
	},
	includes(...args) {
		return this.check(/* @__PURE__ */ _includes(...args));
	},
	startsWith(...args) {
		return this.check(/* @__PURE__ */ _startsWith(...args));
	},
	endsWith(...args) {
		return this.check(/* @__PURE__ */ _endsWith(...args));
	},
	min(...args) {
		return this.check(/* @__PURE__ */ _minLength(...args));
	},
	max(...args) {
		return this.check(/* @__PURE__ */ _maxLength(...args));
	},
	length(...args) {
		return this.check(/* @__PURE__ */ _length(...args));
	},
	nonempty(...args) {
		return this.check(/* @__PURE__ */ _minLength(1, ...args));
	},
	lowercase(params) {
		return this.check(/* @__PURE__ */ _lowercase(params));
	},
	uppercase(params) {
		return this.check(/* @__PURE__ */ _uppercase(params));
	},
	trim() {
		return this.check(/* @__PURE__ */ _trim());
	},
	normalize(...args) {
		return this.check(/* @__PURE__ */ _normalize(...args));
	},
	toLowerCase() {
		return this.check(/* @__PURE__ */ _toLowerCase());
	},
	toUpperCase() {
		return this.check(/* @__PURE__ */ _toUpperCase());
	},
	slugify() {
		return this.check(/* @__PURE__ */ _slugify());
	}
}));
var ZodString = /*@__PURE__*/ $constructor("ZodString", (inst, def) => {
	$ZodString.init(inst, def);
	_ZodString.init(inst, def);
}, {
	email(params) {
		return this.check(/* @__PURE__ */ _email(ZodEmail, params));
	},
	url(params) {
		return this.check(/* @__PURE__ */ _url(ZodURL, params));
	},
	jwt(params) {
		return this.check(/* @__PURE__ */ _jwt(ZodJWT, params));
	},
	emoji(params) {
		return this.check(/* @__PURE__ */ _emoji(ZodEmoji, params));
	},
	guid(params) {
		return this.check(/* @__PURE__ */ _guid(ZodGUID, params));
	},
	uuid(params) {
		return this.check(/* @__PURE__ */ _uuid(ZodUUID, params));
	},
	uuidv4(params) {
		return this.check(/* @__PURE__ */ _uuidv4(ZodUUID, params));
	},
	uuidv6(params) {
		return this.check(/* @__PURE__ */ _uuidv6(ZodUUID, params));
	},
	uuidv7(params) {
		return this.check(/* @__PURE__ */ _uuidv7(ZodUUID, params));
	},
	nanoid(params) {
		return this.check(/* @__PURE__ */ _nanoid(ZodNanoID, params));
	},
	cuid(params) {
		return this.check(/* @__PURE__ */ _cuid(ZodCUID, params));
	},
	cuid2(params) {
		return this.check(/* @__PURE__ */ _cuid2(ZodCUID2, params));
	},
	ulid(params) {
		return this.check(/* @__PURE__ */ _ulid(ZodULID, params));
	},
	base64(params) {
		return this.check(/* @__PURE__ */ _base64(ZodBase64, params));
	},
	base64url(params) {
		return this.check(/* @__PURE__ */ _base64url(ZodBase64URL, params));
	},
	xid(params) {
		return this.check(/* @__PURE__ */ _xid(ZodXID, params));
	},
	ksuid(params) {
		return this.check(/* @__PURE__ */ _ksuid(ZodKSUID, params));
	},
	ipv4(params) {
		return this.check(/* @__PURE__ */ _ipv4(ZodIPv4, params));
	},
	ipv6(params) {
		return this.check(/* @__PURE__ */ _ipv6(ZodIPv6, params));
	},
	cidrv4(params) {
		return this.check(/* @__PURE__ */ _cidrv4(ZodCIDRv4, params));
	},
	cidrv6(params) {
		return this.check(/* @__PURE__ */ _cidrv6(ZodCIDRv6, params));
	},
	e164(params) {
		return this.check(/* @__PURE__ */ _e164(ZodE164, params));
	},
	datetime(params) {
		return this.check(/* @__PURE__ */ _isoDateTime(ZodISODateTime, params));
	},
	date(params) {
		return this.check(/* @__PURE__ */ _isoDate(ZodISODate, params));
	},
	time(params) {
		return this.check(/* @__PURE__ */ _isoTime(ZodISOTime, params));
	},
	duration(params) {
		return this.check(/* @__PURE__ */ _isoDuration(ZodISODuration, params));
	}
});
function string(params) {
	return /* @__PURE__ */ _string(ZodString, params);
}
var ZodStringFormat = /*@__PURE__*/ $constructor("ZodStringFormat", (inst, def) => {
	$ZodStringFormat.init(inst, def);
	_ZodString.init(inst, def);
});
var ZodISODateTime = /*@__PURE__*/ $constructor("ZodISODateTime", (inst, def) => {
	$ZodISODateTime.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodISODate = /*@__PURE__*/ $constructor("ZodISODate", (inst, def) => {
	$ZodISODate.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodISOTime = /*@__PURE__*/ $constructor("ZodISOTime", (inst, def) => {
	$ZodISOTime.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodISODuration = /*@__PURE__*/ $constructor("ZodISODuration", (inst, def) => {
	$ZodISODuration.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodEmail = /*@__PURE__*/ $constructor("ZodEmail", (inst, def) => {
	$ZodEmail.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodGUID = /*@__PURE__*/ $constructor("ZodGUID", (inst, def) => {
	$ZodGUID.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodUUID = /*@__PURE__*/ $constructor("ZodUUID", (inst, def) => {
	$ZodUUID.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodURL = /*@__PURE__*/ $constructor("ZodURL", (inst, def) => {
	$ZodURL.init(inst, def);
	ZodStringFormat.init(inst, def);
});
function url(params) {
	return /* @__PURE__ */ _url(ZodURL, params);
}
var ZodEmoji = /*@__PURE__*/ $constructor("ZodEmoji", (inst, def) => {
	$ZodEmoji.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodNanoID = /*@__PURE__*/ $constructor("ZodNanoID", (inst, def) => {
	$ZodNanoID.init(inst, def);
	ZodStringFormat.init(inst, def);
});
/**
* @deprecated CUID v1 is deprecated by its authors due to information leakage
* (timestamps embedded in the id). Use {@link ZodCUID2} instead.
* See https://github.com/paralleldrive/cuid.
*/
var ZodCUID = /*@__PURE__*/ $constructor("ZodCUID", (inst, def) => {
	$ZodCUID.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodCUID2 = /*@__PURE__*/ $constructor("ZodCUID2", (inst, def) => {
	$ZodCUID2.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodULID = /*@__PURE__*/ $constructor("ZodULID", (inst, def) => {
	$ZodULID.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodXID = /*@__PURE__*/ $constructor("ZodXID", (inst, def) => {
	$ZodXID.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodKSUID = /*@__PURE__*/ $constructor("ZodKSUID", (inst, def) => {
	$ZodKSUID.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodIPv4 = /*@__PURE__*/ $constructor("ZodIPv4", (inst, def) => {
	$ZodIPv4.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodIPv6 = /*@__PURE__*/ $constructor("ZodIPv6", (inst, def) => {
	$ZodIPv6.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodCIDRv4 = /*@__PURE__*/ $constructor("ZodCIDRv4", (inst, def) => {
	$ZodCIDRv4.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodCIDRv6 = /*@__PURE__*/ $constructor("ZodCIDRv6", (inst, def) => {
	$ZodCIDRv6.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodBase64 = /*@__PURE__*/ $constructor("ZodBase64", (inst, def) => {
	$ZodBase64.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodBase64URL = /*@__PURE__*/ $constructor("ZodBase64URL", (inst, def) => {
	$ZodBase64URL.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodE164 = /*@__PURE__*/ $constructor("ZodE164", (inst, def) => {
	$ZodE164.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodJWT = /*@__PURE__*/ $constructor("ZodJWT", (inst, def) => {
	$ZodJWT.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodNumber = /*@__PURE__*/ $constructor("ZodNumber", (inst, def) => {
	$ZodNumber.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => numberProcessor(inst, ctx, json, params);
	inst.isFinite = true;
}, /*@__PURE__*/ derived({
	minValue: (inst) => {
		const { minimum, exclusiveMinimum } = aggregateChecks(inst);
		return Math.max(minimum ?? Number.NEGATIVE_INFINITY, exclusiveMinimum ?? Number.NEGATIVE_INFINITY);
	},
	maxValue: (inst) => {
		const { maximum, exclusiveMaximum } = aggregateChecks(inst);
		return Math.min(maximum ?? Number.POSITIVE_INFINITY, exclusiveMaximum ?? Number.POSITIVE_INFINITY);
	},
	isInt: (inst) => {
		const { isInt, multipleOf } = aggregateChecks(inst);
		return !!isInt || !!multipleOf?.some(Number.isSafeInteger);
	},
	format: (inst) => aggregateChecks(inst).format ?? null
}, {
	gt(value, params) {
		return this.check(/* @__PURE__ */ _gt(value, params));
	},
	gte(value, params) {
		return this.check(/* @__PURE__ */ _gte(value, params));
	},
	min(value, params) {
		return this.check(/* @__PURE__ */ _gte(value, params));
	},
	lt(value, params) {
		return this.check(/* @__PURE__ */ _lt(value, params));
	},
	lte(value, params) {
		return this.check(/* @__PURE__ */ _lte(value, params));
	},
	max(value, params) {
		return this.check(/* @__PURE__ */ _lte(value, params));
	},
	int(params) {
		return this.check(int(params));
	},
	safe(params) {
		return this.check(int(params));
	},
	positive(params) {
		return this.check(/* @__PURE__ */ _gt(0, params));
	},
	nonnegative(params) {
		return this.check(/* @__PURE__ */ _gte(0, params));
	},
	negative(params) {
		return this.check(/* @__PURE__ */ _lt(0, params));
	},
	nonpositive(params) {
		return this.check(/* @__PURE__ */ _lte(0, params));
	},
	multipleOf(value, params) {
		return this.check(/* @__PURE__ */ _multipleOf(value, params));
	},
	step(value, params) {
		return this.check(/* @__PURE__ */ _multipleOf(value, params));
	},
	finite() {
		return this;
	}
}));
function number(params) {
	return /* @__PURE__ */ _number(ZodNumber, params);
}
var ZodNumberFormat = /*@__PURE__*/ $constructor("ZodNumberFormat", (inst, def) => {
	$ZodNumberFormat.init(inst, def);
	ZodNumber.init(inst, def);
});
function int(params) {
	return /* @__PURE__ */ _int(ZodNumberFormat, params);
}
var ZodBoolean = /*@__PURE__*/ $constructor("ZodBoolean", (inst, def) => {
	$ZodBoolean.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => booleanProcessor(inst, ctx, json, params);
});
function boolean(params) {
	return /* @__PURE__ */ _boolean(ZodBoolean, params);
}
var ZodUnknown = /*@__PURE__*/ $constructor("ZodUnknown", (inst, def) => {
	$ZodUnknown.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => void 0;
});
function unknown() {
	return /* @__PURE__ */ _unknown(ZodUnknown);
}
var ZodNever = /*@__PURE__*/ $constructor("ZodNever", (inst, def) => {
	$ZodNever.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => neverProcessor(inst, ctx, json, params);
});
function never(params) {
	return /* @__PURE__ */ _never(ZodNever, params);
}
var ZodVoid = /*@__PURE__*/ $constructor("ZodVoid", (inst, def) => {
	$ZodVoid.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => voidProcessor(inst, ctx, json, params);
});
function _void(params) {
	return /* @__PURE__ */ _void$1(ZodVoid, params);
}
var ZodArray = /*@__PURE__*/ $constructor("ZodArray", (inst, def) => {
	_ensureDefaultMemoizer();
	$ZodArray.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => arrayProcessor(inst, ctx, json, params);
	inst.element = def.element;
}, {
	min(n, params) {
		return this.check(/* @__PURE__ */ _minLength(n, params));
	},
	nonempty(params) {
		return this.check(/* @__PURE__ */ _minLength(1, params));
	},
	max(n, params) {
		return this.check(/* @__PURE__ */ _maxLength(n, params));
	},
	length(n, params) {
		return this.check(/* @__PURE__ */ _length(n, params));
	},
	unwrap() {
		return this.element;
	}
});
function array(element, params) {
	return /* @__PURE__ */ _array(ZodArray, element, params);
}
var ZodObject = /*@__PURE__*/ $constructor("ZodObject", (inst, def) => {
	_ensureDefaultMemoizer();
	$ZodObjectJIT.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => objectProcessor(inst, ctx, json, params);
	installLazyProp(inst, "shape", (self) => self._zod.def.shape, false);
}, {
	keyof() {
		return _enum(Object.keys(this._zod.def.shape));
	},
	catchall(catchall) {
		return this.clone(mergeDefs(this._zod.def, { catchall }));
	},
	passthrough() {
		return this.clone(mergeDefs(this._zod.def, { catchall: unknown() }));
	},
	loose() {
		return this.clone(mergeDefs(this._zod.def, { catchall: unknown() }));
	},
	strict() {
		return this.clone(mergeDefs(this._zod.def, { catchall: never() }));
	},
	strip() {
		return this.clone(mergeDefs(this._zod.def, { catchall: void 0 }));
	},
	extend(incoming) {
		return extend(this, incoming);
	},
	safeExtend(incoming) {
		return safeExtend(this, incoming);
	},
	merge(other) {
		return merge(this, other);
	},
	pick(mask) {
		return pick(this, mask);
	},
	omit(mask) {
		return omit(this, mask);
	},
	partial(...args) {
		return partial(ZodOptional, this, args[0]);
	},
	exactPartial(...args) {
		return partial(ZodExactOptional, this, args[0], "exactPartial");
	},
	required(...args) {
		return required(ZodNonOptional, this, args[0]);
	}
});
function object(shape, params) {
	return new ZodObject({
		type: "object",
		shape: shape ?? {},
		...normalizeParams(params)
	});
}
function strictObject(shape, params) {
	return new ZodObject({
		type: "object",
		shape,
		catchall: never(),
		...normalizeParams(params)
	});
}
var ZodUnion = /*@__PURE__*/ $constructor("ZodUnion", (inst, def) => {
	$ZodUnion.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => unionProcessor(inst, ctx, json, params);
	inst.options = def.options;
});
function union(options, params) {
	return new ZodUnion({
		type: "union",
		options,
		...normalizeParams(params)
	});
}
var ZodDiscriminatedUnion = /*@__PURE__*/ $constructor("ZodDiscriminatedUnion", (inst, def) => {
	ZodUnion.init(inst, def);
	$ZodDiscriminatedUnion.init(inst, def);
});
function discriminatedUnion(discriminator, options, params) {
	return new ZodDiscriminatedUnion({
		type: "union",
		options,
		discriminator,
		...normalizeParams(params)
	});
}
var ZodIntersection = /*@__PURE__*/ $constructor("ZodIntersection", (inst, def) => {
	$ZodIntersection.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => intersectionProcessor(inst, ctx, json, params);
});
function intersection(left, right) {
	return new ZodIntersection({
		type: "intersection",
		left,
		right
	});
}
var ZodTuple = /*@__PURE__*/ $constructor("ZodTuple", (inst, def) => {
	_ensureDefaultMemoizer();
	$ZodTuple.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => tupleProcessor(inst, ctx, json, params);
}, {
	rest(rest) {
		return this.clone({
			...this._zod.def,
			rest
		});
	},
	partial() {
		const def = this._zod.def;
		if (def.checks?.length) throw new Error(".partial() cannot be used on tuple schemas containing refinements");
		return this.clone({
			...def,
			items: def.items.map((item) => new ZodOptional({
				type: "optional",
				innerType: item
			}))
		});
	}
});
function tuple(items, _paramsOrRest, _params) {
	const hasRest = _paramsOrRest instanceof $ZodType;
	return new ZodTuple({
		type: "tuple",
		items,
		rest: hasRest ? _paramsOrRest : null,
		...normalizeParams(hasRest ? _params : _paramsOrRest)
	});
}
var ZodRecord = /*@__PURE__*/ $constructor("ZodRecord", (inst, def) => {
	_ensureDefaultMemoizer();
	$ZodRecord.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => recordProcessor(inst, ctx, json, params);
	inst.keyType = def.keyType;
	inst.valueType = def.valueType;
});
function record(keyType, valueType, params) {
	if (!valueType || !valueType._zod) return new ZodRecord({
		type: "record",
		keyType: string(),
		valueType: keyType,
		...normalizeParams(valueType)
	});
	return new ZodRecord({
		type: "record",
		keyType,
		valueType,
		...normalizeParams(params)
	});
}
var ZodEnum = /*@__PURE__*/ $constructor("ZodEnum", (inst, def) => {
	$ZodEnum.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => enumProcessor(inst, ctx, json, params);
	inst.enum = def.entries;
	inst.options = [...inst._zod.values];
	const keys = new Set(Object.keys(def.entries));
	inst.extract = (values, params) => {
		const newEntries = {};
		for (const value of values) if (keys.has(value)) newEntries[value] = def.entries[value];
		else throw new Error(`Key ${value} not found in enum`);
		return new ZodEnum({
			...def,
			checks: [],
			...normalizeParams(params),
			entries: newEntries
		});
	};
	inst.exclude = (values, params) => {
		const newEntries = { ...def.entries };
		for (const value of values) if (keys.has(value)) delete newEntries[value];
		else throw new Error(`Key ${value} not found in enum`);
		return new ZodEnum({
			...def,
			checks: [],
			...normalizeParams(params),
			entries: newEntries
		});
	};
});
function _enum(values, params) {
	return new ZodEnum({
		type: "enum",
		entries: Array.isArray(values) ? Object.fromEntries(values.map((v) => [v, v])) : values,
		...normalizeParams(params)
	});
}
var ZodLiteral = /*@__PURE__*/ $constructor("ZodLiteral", (inst, def) => {
	$ZodLiteral.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => literalProcessor(inst, ctx, json, params);
	inst.values = new Set(def.values);
	Object.defineProperty(inst, "value", { get() {
		if (def.values.length > 1) throw new Error("This schema contains multiple valid literal values. Use `.values` instead.");
		return def.values[0];
	} });
});
function literal(value, params) {
	return new ZodLiteral({
		type: "literal",
		values: Array.isArray(value) ? value : [value],
		...normalizeParams(params)
	});
}
var ZodTransform = /*@__PURE__*/ $constructor("ZodTransform", (inst, def) => {
	_ensureDefaultMemoizer();
	$ZodTransform.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => transformProcessor(inst, ctx, json, params);
	inst._zod.parse = (payload, _ctx) => {
		if (_ctx.direction === "backward") throw new $ZodEncodeError(inst.constructor.name);
		payload.addIssue = (issue$1) => {
			if (typeof issue$1 === "string") payload.issues.push(issue(issue$1, payload.value, def));
			else {
				const _issue = issue$1;
				if (_issue.fatal) _issue.continue = false;
				_issue.code ?? (_issue.code = "custom");
				if (!("input" in _issue)) _issue.input = payload.value;
				_issue.inst ?? (_issue.inst = inst);
				payload.issues.push(issue(_issue));
			}
		};
		const output = def.transform(payload.value, payload);
		if (output instanceof Promise) return output.then((output) => {
			payload.value = output;
			return payload;
		});
		payload.value = output;
		return payload;
	};
});
function transform(fn) {
	return new ZodTransform({
		type: "transform",
		transform: fn
	});
}
var ZodOptional = /*@__PURE__*/ $constructor("ZodOptional", (inst, def) => {
	$ZodOptional.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => optionalProcessor(inst, ctx, json, params);
	inst.unwrap = () => inst._zod.def.innerType;
});
function optional(innerType) {
	return new ZodOptional({
		type: "optional",
		innerType
	});
}
var ZodExactOptional = /*@__PURE__*/ $constructor("ZodExactOptional", (inst, def) => {
	$ZodExactOptional.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => optionalProcessor(inst, ctx, json, params);
	inst.unwrap = () => inst._zod.def.innerType;
});
function exactOptional(innerType) {
	return new ZodExactOptional({
		type: "optional",
		innerType
	});
}
var ZodNullable = /*@__PURE__*/ $constructor("ZodNullable", (inst, def) => {
	$ZodNullable.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => nullableProcessor(inst, ctx, json, params);
	inst.unwrap = () => inst._zod.def.innerType;
});
function nullable(innerType) {
	return new ZodNullable({
		type: "nullable",
		innerType
	});
}
var ZodDefault = /*@__PURE__*/ $constructor("ZodDefault", (inst, def) => {
	$ZodDefault.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => defaultProcessor(inst, ctx, json, params);
	inst.unwrap = () => inst._zod.def.innerType;
	inst.removeDefault = inst.unwrap;
});
function _default(innerType, defaultValue) {
	return new ZodDefault({
		type: "default",
		innerType,
		get defaultValue() {
			return typeof defaultValue === "function" ? defaultValue() : shallowClone(defaultValue);
		}
	});
}
var ZodPrefault = /*@__PURE__*/ $constructor("ZodPrefault", (inst, def) => {
	$ZodPrefault.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => prefaultProcessor(inst, ctx, json, params);
	inst.unwrap = () => inst._zod.def.innerType;
});
function prefault(innerType, defaultValue) {
	return new ZodPrefault({
		type: "prefault",
		innerType,
		get defaultValue() {
			return typeof defaultValue === "function" ? defaultValue() : shallowClone(defaultValue);
		}
	});
}
var ZodNonOptional = /*@__PURE__*/ $constructor("ZodNonOptional", (inst, def) => {
	$ZodNonOptional.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => nonoptionalProcessor(inst, ctx, json, params);
	inst.unwrap = () => inst._zod.def.innerType;
});
function nonoptional(innerType, params) {
	return new ZodNonOptional({
		type: "nonoptional",
		innerType,
		...normalizeParams(params)
	});
}
var ZodCatch = /*@__PURE__*/ $constructor("ZodCatch", (inst, def) => {
	$ZodCatch.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => catchProcessor(inst, ctx, json, params);
	inst.unwrap = () => inst._zod.def.innerType;
	inst.removeCatch = inst.unwrap;
});
function _catch(innerType, catchValue) {
	return new ZodCatch({
		type: "catch",
		innerType,
		catchValue: typeof catchValue === "function" ? catchValue : constantCatch(catchValue)
	});
}
var ZodPipe = /*@__PURE__*/ $constructor("ZodPipe", (inst, def) => {
	$ZodPipe.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => pipeProcessor(inst, ctx, json, params);
	inst.in = def.in;
	inst.out = def.out;
});
function pipe(in_, out) {
	return new ZodPipe({
		type: "pipe",
		in: in_,
		out
	});
}
var ZodReadonly = /*@__PURE__*/ $constructor("ZodReadonly", (inst, def) => {
	$ZodReadonly.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => readonlyProcessor(inst, ctx, json, params);
	inst.unwrap = () => inst._zod.def.innerType;
});
function readonly(innerType) {
	return new ZodReadonly({
		type: "readonly",
		innerType
	});
}
var ZodCustom = /*@__PURE__*/ $constructor("ZodCustom", (inst, def) => {
	$ZodCustom.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => customProcessor(inst, ctx, json, params);
});
function custom(fn, _params) {
	return /* @__PURE__ */ _custom(ZodCustom, fn ?? (() => true), _params);
}
function refine(fn, _params = {}) {
	return /* @__PURE__ */ _refine(ZodCustom, fn, _params);
}
function superRefine(fn, params) {
	return /* @__PURE__ */ _superRefine(fn, params);
}
//#endregion
//#region ../../node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/classic/iso.js
function datetime(params) {
	return /* @__PURE__ */ _isoDateTime(ZodISODateTime, params);
}
//#endregion
//#region ../../packages/protocol/src/anchors.ts
var vec3Schema = tuple([
	number(),
	number(),
	number()
]);
var indexSchema = int().nonnegative().max(4294967295);
/**
* Inclusive ranges in `encodeRanges` form: sorted, neither overlapping nor touching. The schema cannot know the mesh,
* so consumers check the ranges against the mesh's counts with `rangesWithin` before decoding them.
*/
var indexRangesSchema = array(tuple([indexSchema, indexSchema]).refine(([start, end]) => start <= end, "A range must not end before it starts.")).superRefine((ranges, ctx) => {
	for (let index = 1; index < ranges.length; index++) {
		const previous = ranges[index - 1];
		const current = ranges[index];
		if (previous && current && current[0] <= previous[1] + 1) ctx.addIssue({
			code: "custom",
			message: "Ranges must be sorted and must not overlap or touch.",
			path: [index]
		});
	}
});
var spatialAnchorSchema = discriminatedUnion("kind", [object({
	kind: literal("surface"),
	mesh: string().min(1),
	vertices: tuple([
		indexSchema,
		indexSchema,
		indexSchema
	]),
	weights: tuple([
		number(),
		number(),
		number()
	])
}), object({
	kind: literal("region"),
	mesh: string().min(1),
	triangles: indexRangesSchema.min(1),
	vertices: indexRangesSchema.min(1)
})]);
var clipRef$1 = {
	clip: string().min(1),
	clipDisplayName: string().min(1)
};
/** A time as stored with a comment: the clip's name in the file, and its display name for people. */
var timeAnchorSchema = discriminatedUnion("kind", [
	object({ kind: literal("none") }),
	object({
		kind: literal("frame"),
		...clipRef$1,
		frame: indexSchema
	}),
	object({
		kind: literal("range"),
		...clipRef$1,
		start: indexSchema,
		end: indexSchema
	})
]).refine((time) => time.kind !== "range" || time.start <= time.end, "A range must not end before it starts.");
/** A time as commands take it: the clip by its name in the file only. The core adds the display name. */
var timeSelectionSchema = discriminatedUnion("kind", [
	object({ kind: literal("none") }),
	object({
		kind: literal("frame"),
		clip: string().min(1),
		frame: indexSchema
	}),
	object({
		kind: literal("range"),
		clip: string().min(1),
		start: indexSchema,
		end: indexSchema
	})
]).refine((time) => time.kind !== "range" || time.start <= time.end, "A range must not end before it starts.");
var cameraAnchorSchema = object({
	position: vec3Schema,
	target: vec3Schema,
	up: vec3Schema,
	fov: number().gt(0).lt(180)
});
var frameRangeSchema = object({
	start: indexSchema,
	end: indexSchema
}).refine((range) => range.start <= range.end, "A range must not end before it starts.");
var topologyFingerprintSchema = object({
	sourceVertexCount: indexSchema,
	triangleCount: indexSchema,
	hash: string().regex(/^[0-9a-f]{16}$/)
});
//#endregion
//#region ../../packages/protocol/src/assets.ts
var assetIdSchema = string().min(1);
/**
* A comment id as a regular expression source: "c" and 26 lowercase ULID digits, such as
* "c01m4gp93004tff59tdwh9edd1r", or "c" and a number for comments made before ids were random, such as "c7".
*/
var COMMENT_ID_PATTERN = "c(?:[0-9a-hjkmnp-tv-z]{26}|\\d+)";
/** A comment id, never reused within the asset. */
var commentIdSchema = string().regex(new RegExp(`^${COMMENT_ID_PATTERN}$`));
var bytesSchema = custom((value) => value instanceof Uint8Array, "Expected bytes.");
var assetStatusSchema = _enum([
	"loading",
	"ready",
	"failed"
]);
var assetSummarySchema = object({
	assetId: assetIdSchema,
	/** Absolute path of the asset file. */
	path: string().min(1),
	name: string(),
	status: assetStatusSchema,
	/** Id of the version on screen, or null before the first successful load. */
	version: string().nullable(),
	/** Why the latest load failed; the previous version stays on screen. */
	error: string().nullable(),
	/** Absolute path of the model's composition file while the version on screen applies it. */
	composition: string().min(1).optional()
});
//#endregion
//#region ../../packages/protocol/src/author.ts
/** Who made a comment, a follow-up or a round: the name a person or an agent gave Arcue. */
var authorSchema = object({ name: string().trim().min(1).max(100) });
//#endregion
//#region ../../packages/protocol/src/errors.ts
var ArcueError = class extends Error {
	name = "ArcueError";
	code;
	issues;
	constructor(code, message, options = {}) {
		super(message, { cause: options.cause });
		this.code = code;
		this.issues = options.issues ?? [];
	}
};
function toWireError(error) {
	if (error instanceof ArcueError) return {
		code: error.code,
		message: error.message,
		issues: error.issues
	};
	return {
		code: "internal",
		message: error instanceof Error ? error.message : String(error),
		issues: []
	};
}
function fromWireError(error) {
	return new ArcueError(error.code, error.message, { issues: error.issues });
}
//#endregion
//#region ../../packages/protocol/src/transport/framed.ts
/** The largest frame either side accepts. A scene of a large asset fits comfortably. */
var MAX_FRAME_BYTES = 1073741824;
var HEADER_BYTES = 4;
/** A frame is a 4-byte big-endian length followed by that many bytes. */
function encodeFrame(payload) {
	if (payload.byteLength > 1073741824) throw new ArcueError("invalid-input", `A message of ${payload.byteLength} bytes is too large to send.`);
	const frame = new Uint8Array(HEADER_BYTES + payload.byteLength);
	new DataView(frame.buffer).setUint32(0, payload.byteLength);
	frame.set(payload, HEADER_BYTES);
	return frame;
}
/** Collects stream chunks and returns the frames they complete. */
var FrameReader = class {
	#chunks = [];
	#buffered = 0;
	#limit;
	constructor(limits = {}) {
		this.#limit = Math.min(limits.firstFrameMaxBytes ?? 1073741824, MAX_FRAME_BYTES);
	}
	/** Throws an `ArcueError` when a frame announces more than its limit; the stream is then unusable. */
	push(chunk) {
		this.#chunks.push(chunk);
		this.#buffered += chunk.byteLength;
		const frames = [];
		for (;;) {
			if (this.#buffered < HEADER_BYTES) return frames;
			const header = this.#peek(HEADER_BYTES);
			const length = new DataView(header.buffer, header.byteOffset, HEADER_BYTES).getUint32(0);
			if (length > this.#limit) throw new ArcueError("invalid-input", `A frame of ${length} bytes is too large.`);
			if (this.#buffered < HEADER_BYTES + length) return frames;
			this.#take(HEADER_BYTES);
			frames.push(this.#take(length));
			this.#limit = MAX_FRAME_BYTES;
		}
	}
	#peek(count) {
		const first = this.#chunks[0];
		if (first && first.byteLength >= count) return first.slice(0, count);
		return this.#joined().slice(0, count);
	}
	#take(count) {
		const joined = this.#joined();
		const taken = joined.slice(0, count);
		const rest = joined.subarray(count);
		this.#chunks = rest.byteLength > 0 ? [rest] : [];
		this.#buffered = rest.byteLength;
		return taken;
	}
	#joined() {
		if (this.#chunks.length === 1 && this.#chunks[0]) return this.#chunks[0];
		const joined = new Uint8Array(this.#buffered);
		let offset = 0;
		for (const chunk of this.#chunks) {
			joined.set(chunk, offset);
			offset += chunk.byteLength;
		}
		this.#chunks = [joined];
		return joined;
	}
};
function framedChannel(stream, codec, limits = {}) {
	const reader = new FrameReader(limits);
	return channel(stream, codec, (chunk) => reader.push(chunk), encodeFrame);
}
/**
* Messages over a stream that delivers each write as one chunk, such as a WebSocket, so a frame needs no length
* prefix. A chunk larger than `MAX_FRAME_BYTES`, or one the codec cannot decode, closes the channel.
*/
function messageChannel(stream, codec) {
	return channel(stream, codec, (chunk) => {
		if (chunk.byteLength > 1073741824) throw new ArcueError("invalid-input", "A message is too large.");
		return [chunk];
	}, (payload) => {
		if (payload.byteLength > 1073741824) throw new ArcueError("invalid-input", `A message of ${payload.byteLength} bytes is too large to send.`);
		return payload;
	});
}
function channel(stream, codec, toFrames, toChunk) {
	const listeners = /* @__PURE__ */ new Set();
	const waiting = [];
	const receivers = [];
	let closed = false;
	const closeListeners = /* @__PURE__ */ new Set();
	const close = () => {
		if (closed) return;
		closed = true;
		stopData();
		stopClose();
		stream.close();
		const error = new ArcueError("disconnected", "The connection closed.");
		for (const receiver of receivers.splice(0)) receiver.reject(error);
		for (const listener of [...closeListeners]) listener();
		closeListeners.clear();
		listeners.clear();
	};
	const stopData = stream.onData((chunk) => {
		if (closed) return;
		let frames;
		try {
			frames = toFrames(chunk);
		} catch {
			close();
			return;
		}
		for (const frame of frames) {
			let value;
			try {
				value = codec.decode(frame);
			} catch {
				close();
				return;
			}
			const receiver = listeners.size === 0 ? receivers.shift() : void 0;
			if (receiver) receiver.resolve(value);
			else if (listeners.size === 0) waiting.push(value);
			else for (const listener of [...listeners]) listener(value);
		}
	});
	const stopClose = stream.onClose(close);
	return {
		send(value) {
			if (!closed) stream.write(toChunk(codec.encode(value)));
		},
		receive() {
			if (waiting.length > 0) return Promise.resolve(waiting.shift());
			if (closed) return Promise.reject(new ArcueError("disconnected", "The connection is closed."));
			return new Promise((resolve, reject) => receivers.push({
				resolve,
				reject
			}));
		},
		listen(listener) {
			listeners.add(listener);
			for (const value of waiting.splice(0)) listener(value);
			return () => {
				listeners.delete(listener);
			};
		},
		onClose(listener) {
			if (closed) {
				listener();
				return () => void 0;
			}
			closeListeners.add(listener);
			return () => {
				closeListeners.delete(listener);
			};
		},
		close
	};
}
/** An endpoint over a framed channel. Buffers are copied, since a stream cannot transfer them. */
function framedEndpoint(channel) {
	return {
		post: (message) => channel.send(message),
		listen: (listener) => channel.listen(listener),
		onClose: (listener) => channel.onClose(listener)
	};
}
//#endregion
//#region ../../packages/protocol/src/bridge.ts
/**
* The file in the desktop app's data folder that tells the command line where the core listens and which token to
* present. The core rewrites it with a new token every time it starts, readable only by the user.
*/
var BRIDGE_INFO_FILE = "bridge.json";
var bridgeInfoSchema = object({
	version: literal(1),
	/** A Unix domain socket path, or a Windows named pipe such as "\\\\.\\pipe\\arcue-…". */
	socket: string().min(1),
	token: string().min(32),
	pid: int().positive(),
	/** Where a browser shows the core's window, when `arcue serve` runs the core rather than the desktop app. */
	url: url().optional()
});
/**
* Where the page an `arcue serve` server serves connects to its core as a window, over a WebSocket that carries one
* `binaryFrameCodec` frame per message. The path names the format, so a page left open across an update of its server
* fails to connect rather than misreads.
*/
var SERVE_CORE_PATH = "/core/2";
/** The file in the app's data folder that tells the command line how to start the app when it is not running. */
var LAUNCH_INFO_FILE = "launch.json";
var launchInfoSchema = object({
	version: literal(1),
	command: string().min(1),
	args: array(string())
});
/** The largest hello or reply either side accepts, so an unauthenticated peer cannot make the other buffer much. */
var HANDSHAKE_MAX_FRAME_BYTES = 4096;
var helloSchema = object({
	type: literal("arcue.hello"),
	version: literal(1),
	token: string(),
	/** Who the bridge acts for, checked against `authorSchema` once the token matches. */
	user: unknown().optional()
});
var replySchema = discriminatedUnion("type", [object({ type: literal("arcue.welcome") }), object({
	type: literal("arcue.rejected"),
	message: string()
})]);
/**
* The core's side of a bridge connection: the first message must carry the token. On success the returned endpoint
* carries envelopes; otherwise the channel is closed and the promise rejects as "forbidden".
*/
async function acceptBridge(channel, options) {
	const hello = helloSchema.safeParse(await firstMessage(channel, options.timeout));
	const refuse = (message, reason) => {
		channel.send({
			type: "arcue.rejected",
			message
		});
		channel.close();
		return new ArcueError("forbidden", reason);
	};
	if (!hello.success || !sameToken(hello.data.token, options.token)) throw refuse("The token does not match the running app.", "A bridge connected without the app's token.");
	const user = authorSchema.optional().safeParse(hello.data.user);
	if (!user.success) throw refuse("The user name is not valid.", "A bridge named a user that is not valid.");
	channel.send({ type: "arcue.welcome" });
	const endpoint = framedEndpoint(channel);
	return user.data ? {
		endpoint,
		user: user.data
	} : { endpoint };
}
/** The bridge's side: presents the token and resolves once the core accepts it. */
async function connectBridge(channel, options) {
	channel.send({
		type: "arcue.hello",
		version: 1,
		token: options.token,
		...options.user ? { user: options.user } : {}
	});
	const reply = replySchema.safeParse(await firstMessage(channel, options.timeout));
	if (!reply.success || reply.data.type === "arcue.rejected") {
		channel.close();
		throw new ArcueError("forbidden", `Arcue refused the connection. ${reply.success && reply.data.type === "arcue.rejected" ? reply.data.message : "It sent no welcome."}`);
	}
	return framedEndpoint(channel);
}
function firstMessage(channel, timeout) {
	return new Promise((resolve, reject) => {
		const cancelTimer = timeout.setTimer(timeout.ms, () => {
			channel.close();
			reject(new ArcueError("timeout", `The handshake took longer than ${timeout.ms} ms.`));
		});
		channel.receive().then((value) => {
			cancelTimer();
			resolve(value);
		}, (error) => {
			cancelTimer();
			reject(error);
		});
	});
}
/** Compares in time that depends only on the length, so the token cannot be guessed byte by byte. */
function sameToken(given, expected) {
	if (given.length !== expected.length) return false;
	let difference = 0;
	for (let index = 0; index < given.length; index++) difference |= given.charCodeAt(index) ^ expected.charCodeAt(index);
	return difference === 0;
}
//#endregion
//#region ../../packages/scene/src/material.ts
var TEXTURE_SLOTS = [
	"baseColor",
	"normal",
	"roughness",
	"metalness",
	"emissive"
];
/**
* Each of Material's texture references with the name of the property it feeds, as `asset.inspect` reports it. Its
* type requires every key, so a texture reference added to Material without an entry here does not compile.
*/
var TEXTURE_REF_NAMES = {
	baseColorTexture: "baseColor",
	metallicRoughnessTexture: "metallicRoughness",
	roughnessTexture: "roughness",
	metalnessTexture: "metalness",
	normalTexture: "normal",
	occlusionTexture: "occlusion",
	emissiveTexture: "emissive"
};
/** Every key of Material that holds a TextureRef. */
var TEXTURE_REF_KEYS = Object.keys(TEXTURE_REF_NAMES);
/** The key of Material that holds each slot's texture. */
var TEXTURE_SLOT_KEYS = {
	baseColor: "baseColorTexture",
	normal: "normalTexture",
	roughness: "roughnessTexture",
	metalness: "metalnessTexture",
	emissive: "emissiveTexture"
};
//#endregion
//#region ../../packages/scene/src/math.ts
/** Bounds of xyz triples; a zero box at the origin when there are no points. */
function boundsOfPoints(arrays) {
	let minX = Infinity;
	let minY = Infinity;
	let minZ = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	let maxZ = -Infinity;
	for (const array of arrays) for (let i = 0; i + 2 < array.length; i += 3) {
		const x = array[i] ?? 0;
		const y = array[i + 1] ?? 0;
		const z = array[i + 2] ?? 0;
		minX = Math.min(minX, x);
		minY = Math.min(minY, y);
		minZ = Math.min(minZ, z);
		maxX = Math.max(maxX, x);
		maxY = Math.max(maxY, y);
		maxZ = Math.max(maxZ, z);
	}
	if (minX > maxX) return {
		min: [
			0,
			0,
			0
		],
		max: [
			0,
			0,
			0
		]
	};
	return {
		min: [
			minX,
			minY,
			minZ
		],
		max: [
			maxX,
			maxY,
			maxZ
		]
	};
}
//#endregion
//#region ../../packages/scene/src/parts.ts
var LOD_SUFFIX = /^(.+)_LOD(\d{1,4})$/i;
var COLLISION_PREFIXES = [
	"UCX_",
	"UBX_",
	"USP_",
	"UCP_"
];
var SOCKET_PREFIX = "SOCKET_";
function partRoleOf(name) {
	if (name.startsWith(SOCKET_PREFIX)) return "socket";
	if (COLLISION_PREFIXES.some((prefix) => name.startsWith(prefix))) return "collision";
	return "model";
}
/**
* Groups a scene's meshes into parts by the rules game engines use: a "<name>_LOD<n>" suffix, case-insensitive, puts
* siblings into one LOD group, as do the children of a LOD group node, whose child order gives the level. Name
* prefixes mark collision helpers and sockets, and win over LOD membership. `lodGroups` holds the indices of the
* nodes the file marks as LOD groups. Parts come in the order of their first node.
*/
function describeParts(nodes, lodGroups = /* @__PURE__ */ new Set()) {
	const childIndex = siblingPositions(nodes);
	const drafts = /* @__PURE__ */ new Map();
	const add = (key, draft, member) => {
		let entry = drafts.get(key);
		if (!entry) {
			entry = {
				...draft,
				members: []
			};
			drafts.set(key, entry);
		}
		if (member) entry.members.push(member);
	};
	nodes.forEach((node, index) => {
		const role = partRoleOf(node.name);
		if (role !== "model") {
			const member = node.mesh === null ? null : {
				level: 0,
				mesh: node.mesh,
				node: index
			};
			if (role === "socket" || member) add(`n${index}`, {
				name: node.name,
				role,
				node: index
			}, member);
			return;
		}
		if (node.mesh === null) return;
		const group = enclosingLodGroup(nodes, index, lodGroups);
		if (group) {
			const owner = nodes[group.node];
			add(`g${group.node}`, {
				name: owner?.name ?? node.name,
				role,
				node: group.node
			}, {
				level: childIndex[group.child] ?? 0,
				mesh: node.mesh,
				node: index
			});
			return;
		}
		const suffix = LOD_SUFFIX.exec(node.name);
		if (suffix?.[1] !== void 0 && suffix[2] !== void 0) {
			add(`s${node.parent}/${suffix[1]}`, {
				name: suffix[1],
				role,
				node: null
			}, {
				level: Number(suffix[2]),
				mesh: node.mesh,
				node: index
			});
			return;
		}
		add(`n${index}`, {
			name: node.name,
			role,
			node: index
		}, {
			level: 0,
			mesh: node.mesh,
			node: index
		});
	});
	return [...drafts.values()].flatMap((draft) => {
		const members = [...draft.members].sort((a, b) => a.level - b.level || a.node - b.node);
		const node = draft.node ?? members[0]?.node;
		const path = node === void 0 ? void 0 : nodes[node]?.path;
		if (node === void 0 || path === void 0) return [];
		const levels = [];
		for (const member of members) {
			const last = levels.at(-1);
			if (last?.level === member.level) last.meshes.push(member.mesh);
			else levels.push({
				level: member.level,
				meshes: [member.mesh]
			});
		}
		return [{
			id: path,
			name: draft.name,
			role: draft.role,
			node,
			levels
		}];
	});
}
function siblingPositions(nodes) {
	const counts = /* @__PURE__ */ new Map();
	return nodes.map((node) => {
		const position = counts.get(node.parent) ?? 0;
		counts.set(node.parent, position + 1);
		return position;
	});
}
/** The nearest LOD group node above a node, and the group's child that leads to it. */
function enclosingLodGroup(nodes, index, lodGroups) {
	if (lodGroups.size === 0) return null;
	let child = index;
	let parent = nodes[index]?.parent ?? -1;
	while (parent >= 0) {
		if (lodGroups.has(parent)) return {
			node: parent,
			child
		};
		child = parent;
		parent = nodes[parent]?.parent ?? -1;
	}
	return null;
}
function defaultPartView() {
	return {
		hidden: [],
		shown: [],
		isolated: null,
		lod: 0
	};
}
function isDefaultPartView(view) {
	return view.hidden.length === 0 && view.shown.length === 0 && view.isolated === null && view.lod === 0;
}
/** Models show by default unless a composition hides them; collision helpers are hidden, and sockets draw no mesh. */
function shownByDefault(part) {
	return part.role === "model" && part.hiddenByDefault !== true;
}
/** The level a part shows for a LOD: the highest level not above it, or the part's lowest level. */
function levelFor(part, lod) {
	let chosen = part.levels[0] ?? null;
	for (const level of part.levels) if (level.level <= lod) chosen = level;
	return chosen;
}
var shownPredicates = /* @__PURE__ */ new WeakMap();
/**
* Whether a view shows each part, as a test built once per parts list and view, so checking every part stays linear.
* An isolated part that the scene does not have isolates nothing.
*/
function partShownIn(parts, view) {
	let byView = shownPredicates.get(parts);
	if (!byView) {
		byView = /* @__PURE__ */ new WeakMap();
		shownPredicates.set(parts, byView);
	}
	let shown = byView.get(view);
	if (!shown) {
		const isolated = view.isolated;
		const hidden = new Set(view.hidden);
		const overrides = new Set(view.shown);
		shown = isolated !== null && parts.some((candidate) => candidate.id === isolated) ? (part) => part.id === isolated : (part) => shownByDefault(part) ? !hidden.has(part.id) : overrides.has(part.id);
		byView.set(view, shown);
	}
	return shown;
}
/** The meshes a view draws. Socket meshes are never drawn. */
function visibleMeshes(parts, view = defaultPartView()) {
	const shown = partShownIn(parts, view);
	const meshes = /* @__PURE__ */ new Set();
	for (const part of parts) {
		if (part.role === "socket" || !shown(part)) continue;
		for (const mesh of levelFor(part, view.lod)?.meshes ?? []) meshes.add(mesh);
	}
	return meshes;
}
/** Every LOD level some part has, ascending. */
function lodLevels(parts) {
	const levels = /* @__PURE__ */ new Set();
	for (const part of parts) for (const level of part.levels) levels.add(level.level);
	return [...levels].sort((a, b) => a - b);
}
/**
* The view with only the parts the scene has: unknown hidden and shown ids dropped, the rest sorted once each, an
* unknown isolated part cleared, and the LOD no higher than the scene's highest level.
*/
function knownPartView(parts, view) {
	const ids = new Set(parts.map((part) => part.id));
	const known = (list) => [...new Set(list.filter((id) => ids.has(id)))].sort();
	return {
		hidden: known(view.hidden),
		shown: known(view.shown),
		isolated: view.isolated !== null && ids.has(view.isolated) ? view.isolated : null,
		lod: Math.min(view.lod, lodLevels(parts).at(-1) ?? 0)
	};
}
/** Rest-pose bounds of the meshes a view draws, or null when it draws none. */
function viewBounds(meshes, parts, view) {
	const visible = visibleMeshes(parts, view);
	const shown = meshes.filter((_, index) => visible.has(index));
	return shown.length > 0 ? boundsOfPoints(shown.map((mesh) => mesh.restPositions)) : null;
}
/** Rest-pose bounds of the meshes a default view draws, or of every mesh when it draws none. */
function defaultViewBounds(meshes, parts) {
	return viewBounds(meshes, parts, defaultPartView()) ?? boundsOfPoints(meshes.map((mesh) => mesh.restPositions));
}
//#endregion
//#region ../../packages/scene/src/source.ts
var SLOT_NAMES = {
	baseColor: "base color",
	normal: "normal",
	roughness: "roughness",
	metalness: "metalness",
	emissive: "emissive"
};
/** The uses for a warning's detail, such as "base color of Stone, normal of Rock". */
function describeTextureUses(uses) {
	return uses.map((use) => `${SLOT_NAMES[use.slot]} of ${use.material}`).join(", ");
}
/** An "error" means the preview is missing something the file meant to show. */
var importWarningSeverity = {
	"texture-not-found": "error",
	"texture-path-absolute": "warning",
	"texture-not-used": "warning",
	"root-scale": "warning",
	"root-rotation": "warning",
	"too-many-uv-sets": "warning",
	"too-many-bones": "error",
	"extra-skins": "warning",
	"unweighted-vertices": "warning",
	"inbetween-shapes": "warning",
	"bind-pose-mismatch": "warning",
	"clip-not-sampled": "error",
	"left-handed-axes": "warning",
	"invalid-data": "warning",
	"animation-bones-missing": "warning",
	"file-not-found": "error",
	"model-not-found": "error",
	"composition-not-loaded": "error",
	"node-not-found": "error",
	"material-not-found": "warning",
	"modifier-not-applied": "warning",
	"constraint-not-evaluated": "warning",
	"driver-not-evaluated": "warning",
	"curve-modifier-not-applied": "warning",
	"action-layer-not-played": "warning",
	"deform-approximated": "warning",
	"object-not-shown": "warning",
	"library-not-loaded": "error",
	"material-approximated": "warning"
};
function importWarning(code, subject, message, file, extra = {}) {
	const warning = {
		code,
		severity: importWarningSeverity[code],
		subject,
		message
	};
	if (file !== void 0) warning.file = file;
	if (extra.detail !== void 0) warning.detail = extra.detail;
	if (extra.materials !== void 0 && extra.materials.length > 0) warning.materials = [...extra.materials];
	if (extra.foundPath !== void 0) warning.foundPath = extra.foundPath;
	if (extra.uses !== void 0 && extra.uses.length > 0) warning.uses = extra.uses.map((use) => ({ ...use }));
	return warning;
}
//#endregion
//#region ../../packages/scene/src/transform.ts
function composeMatrix({ translation, rotation, scale }) {
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
	return Float64Array.of((1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0, (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0, (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0, translation[0], translation[1], translation[2], 1);
}
function multiplyMatrices(a, b) {
	const out = /* @__PURE__ */ new Float64Array(16);
	for (let column = 0; column < 4; column++) for (let row = 0; row < 4; row++) {
		let sum = 0;
		for (let k = 0; k < 4; k++) sum += (a[k * 4 + row] ?? 0) * (b[column * 4 + k] ?? 0);
		out[column * 4 + row] = sum;
	}
	return out;
}
/** The inverse of an affine matrix; a singular one inverts to the identity. */
function invertAffine(m) {
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
	if (Math.abs(det) < 1e-12) return identityMatrix();
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
function identityMatrix() {
	return Float64Array.of(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
}
/** Splits an affine matrix into translation, rotation and scale. Shear is lost; a mirror flips the x scale. */
function decomposeMatrix(m) {
	const at = (index) => m[index] ?? 0;
	let sx = Math.hypot(at(0), at(1), at(2));
	const sy = Math.hypot(at(4), at(5), at(6));
	const sz = Math.hypot(at(8), at(9), at(10));
	if (at(0) * (at(5) * at(10) - at(6) * at(9)) - at(4) * (at(1) * at(10) - at(2) * at(9)) + at(8) * (at(1) * at(6) - at(2) * at(5)) < 0) sx = -sx;
	const ix = sx === 0 ? 0 : 1 / sx;
	const iy = sy === 0 ? 0 : 1 / sy;
	const iz = sz === 0 ? 0 : 1 / sz;
	const m00 = at(0) * ix;
	const m10 = at(1) * ix;
	const m20 = at(2) * ix;
	const m01 = at(4) * iy;
	const m11 = at(5) * iy;
	const m21 = at(6) * iy;
	const m02 = at(8) * iz;
	const m12 = at(9) * iz;
	const m22 = at(10) * iz;
	let rotation;
	const trace = m00 + m11 + m22;
	if (trace > 0) {
		const s = .5 / Math.sqrt(trace + 1);
		rotation = [
			(m21 - m12) * s,
			(m02 - m20) * s,
			(m10 - m01) * s,
			.25 / s
		];
	} else if (m00 > m11 && m00 > m22) {
		const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
		rotation = [
			.25 * s,
			(m01 + m10) / s,
			(m02 + m20) / s,
			(m21 - m12) / s
		];
	} else if (m11 > m22) {
		const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
		rotation = [
			(m01 + m10) / s,
			.25 * s,
			(m12 + m21) / s,
			(m02 - m20) / s
		];
	} else {
		const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
		rotation = [
			(m02 + m20) / s,
			(m12 + m21) / s,
			.25 * s,
			(m10 - m01) / s
		];
	}
	const length = Math.hypot(...rotation) || 1;
	return {
		translation: [
			at(12),
			at(13),
			at(14)
		],
		rotation: [
			rotation[0] / length,
			rotation[1] / length,
			rotation[2] / length,
			rotation[3] / length
		],
		scale: [
			sx,
			sy,
			sz
		]
	};
}
/** Each node's rest transform in scene space. Parents come before their children, as the scene contract requires. */
function restWorldMatrices(nodes) {
	const worlds = [];
	for (const node of nodes) {
		const local = composeMatrix(node);
		const parent = node.parent >= 0 ? worlds[node.parent] : void 0;
		worlds.push(parent ? multiplyMatrices(parent, local) : local);
	}
	return worlds;
}
/** The node path or part id of something from another file of a composition. */
function memberPath(file, path) {
	return `${file}//${path}`;
}
/** The file a node path or part id comes from, null for the model's own, and the path inside that file. */
function splitMemberPath(path) {
	for (let index = 0; index < path.length; index++) {
		const char = path[index];
		if (char === "\\") index++;
		else if (char === "/" && path[index + 1] === "/") return {
			file: path.slice(0, index),
			path: path.slice(index + 2)
		};
	}
	return {
		file: null,
		path
	};
}
var LISTED_NAMES = 5;
/**
* One scene from a model and the other files of its composition. The model's nodes, meshes and clips keep their
* indices and paths. Clips from animation files bind to the model's nodes by name, preferring bones, without the
* tracks that only hold their file's pose, and bones a clip lacks keep the rest pose. Attached nodes keep their rest
* placement in scene space, as both files were exported in the same rest frame: under a bone they follow it,
* otherwise they stay in place. A bone in an attached file that matches a model bone by name is that model bone, so
* skinned meshes and children of those bones follow the model's skeleton, as Unreal's leader pose does. Nodes and
* clips from other files take the file as a prefix on their paths and names. The inputs are not changed; typed arrays
* are shared with them.
*/
function composeScene(model, composition) {
	const builder = new SceneBuilder(model, composition.warnings ?? []);
	for (const attachment of attachOrder(composition.attach)) builder.attach(attachment);
	builder.addMemberMeshes();
	builder.addMemberParts();
	builder.addClips(composition.animations);
	builder.hide(composition.hidden);
	builder.overrideTextures(composition.materials);
	return builder.build();
}
function nodeLookup(nodes) {
	const byPath = /* @__PURE__ */ new Map();
	const bones = /* @__PURE__ */ new Map();
	const others = /* @__PURE__ */ new Map();
	nodes.forEach((node, index) => {
		byPath.set(node.path, index);
		const named = node.kind === "bone" ? bones : others;
		if (!named.has(node.name)) named.set(node.name, index);
	});
	const byName = (name, preferBone) => (preferBone ? bones.get(name) ?? others.get(name) : others.get(name) ?? bones.get(name)) ?? null;
	return {
		find: (nameOrPath, preferBone) => byPath.get(nameOrPath) ?? byName(nameOrPath, preferBone),
		byName,
		bone: (name) => bones.get(name) ?? null
	};
}
/**
* A node's index by its path, or else by its name, preferring a bone or another node as asked, as a composition
* names nodes and bones. Null when nothing matches.
*/
function findNode(nodes, nameOrPath, preferBone) {
	return nodeLookup(nodes).find(nameOrPath, preferBone);
}
var SceneBuilder = class {
	#model;
	#lookup;
	#nodes;
	#meshes;
	#skeletons;
	#materials;
	#textures;
	#parts;
	#clips;
	#warnings;
	#members = /* @__PURE__ */ new Map();
	#modelWorlds = null;
	constructor(model, warnings) {
		this.#model = model;
		this.#lookup = nodeLookup(model.nodes);
		this.#nodes = [...model.nodes];
		this.#meshes = [...model.meshes];
		this.#skeletons = [...model.skeletons];
		this.#materials = [...model.materials];
		this.#textures = [...model.textures];
		this.#parts = [...model.parts];
		this.#clips = [...model.clips];
		this.#warnings = [...model.source.warnings, ...warnings];
	}
	#modelWorld(node) {
		this.#modelWorlds ??= restWorldMatrices(this.#model.nodes);
		return this.#modelWorlds[node];
	}
	#state(member) {
		let state = this.#members.get(member.file);
		if (!state) {
			state = {
				member,
				worlds: restWorldMatrices(member.scene.nodes),
				nodes: /* @__PURE__ */ new Map(),
				merged: /* @__PURE__ */ new Set(),
				meshes: /* @__PURE__ */ new Map(),
				skeletons: /* @__PURE__ */ new Map(),
				materialOffset: null
			};
			this.#members.set(member.file, state);
		}
		return state;
	}
	#warn(warning) {
		this.#warnings.push(warning);
	}
	attach({ member, node, bone }) {
		const state = this.#state(member);
		const source = member.scene.nodes;
		let roots;
		if (node === null) roots = source.flatMap((entry, index) => entry.parent === -1 ? [index] : []);
		else {
			const found = nodeLookup(source).find(node, false);
			if (found === null) {
				this.#warn(importWarning("node-not-found", {
					kind: "node",
					name: node
				}, `Node not found: ${node}`, member.file));
				return;
			}
			roots = [found];
		}
		let parent = -1;
		if (bone !== null) {
			const found = this.#lookup.find(bone, true);
			if (found === null) this.#warn(importWarning("node-not-found", {
				kind: "node",
				name: bone
			}, `Model bone not found: ${bone}`, member.file));
			else parent = found;
		}
		const included = subtree(source, roots);
		source.forEach((entry, index) => {
			if (!included[index] || state.nodes.has(index)) return;
			if (entry.kind === "bone") {
				const match = this.#lookup.bone(entry.name);
				if (match !== null) {
					state.nodes.set(index, match);
					state.merged.add(index);
					return;
				}
			}
			const memberParent = state.nodes.get(entry.parent);
			const placed = entry.parent >= 0 && included[entry.parent] && memberParent !== void 0 ? {
				parent: memberParent,
				transform: entry
			} : {
				parent,
				transform: this.#placeUnder(parent, state.worlds[index])
			};
			state.nodes.set(index, this.#addNode(member.file, entry, placed.parent, placed.transform));
		});
	}
	addMemberMeshes() {
		for (const state of this.#members.values()) for (const [index, composed] of [...state.nodes]) {
			const mesh = state.member.scene.nodes[index]?.mesh ?? null;
			if (mesh === null || state.merged.has(index)) continue;
			const meshIndex = this.#addMesh(state, mesh);
			const target = this.#nodes[composed];
			if (meshIndex !== null && target) this.#nodes[composed] = {
				...target,
				mesh: meshIndex
			};
		}
	}
	/** A transform that keeps a node at its rest placement in scene space once it hangs under `parent`. */
	#placeUnder(parent, world) {
		if (!world) return {
			translation: [
				0,
				0,
				0
			],
			rotation: [
				0,
				0,
				0,
				1
			],
			scale: [
				1,
				1,
				1
			]
		};
		const parentWorld = parent >= 0 ? this.#modelWorld(parent) : void 0;
		return decomposeMatrix(parentWorld ? multiplyMatrices(invertAffine(parentWorld), world) : world);
	}
	#addNode(file, node, parent, transform) {
		this.#nodes.push({
			...node,
			path: memberPath(file, node.path),
			parent,
			translation: transform.translation,
			rotation: transform.rotation,
			scale: transform.scale,
			mesh: null
		});
		return this.#nodes.length - 1;
	}
	#addMesh(state, index) {
		const mesh = state.member.scene.meshes[index];
		if (!mesh) return null;
		const existing = state.meshes.get(index);
		if (existing !== void 0) return existing;
		const materialOffset = this.#addMaterials(state);
		this.#meshes.push({
			...mesh,
			skeleton: mesh.skeleton === null ? null : this.#addSkeleton(state, mesh.skeleton),
			groups: mesh.groups.map((group) => ({
				...group,
				material: group.material + materialOffset
			}))
		});
		state.meshes.set(index, this.#meshes.length - 1);
		return this.#meshes.length - 1;
	}
	#addMaterials(state) {
		if (state.materialOffset !== null) return state.materialOffset;
		const { materials, textures } = state.member.scene;
		const textureOffset = this.#textures.length;
		for (const texture of textures) this.#textures.push(texture);
		state.materialOffset = this.#materials.length;
		for (const material of materials) {
			const moved = { ...material };
			for (const key of TEXTURE_REF_KEYS) {
				const ref = material[key];
				moved[key] = ref && {
					...ref,
					texture: ref.texture + textureOffset
				};
			}
			this.#materials.push(moved);
		}
		return state.materialOffset;
	}
	/**
	* The member's skeleton on composed nodes. A joint is the node it became, the model bone of the same name, or else a
	* new node held at the joint's rest placement.
	*/
	#addSkeleton(state, index) {
		const skeleton = state.member.scene.skeletons[index];
		if (!skeleton) return null;
		const existing = state.skeletons.get(index);
		if (existing !== void 0) return existing;
		const joints = skeleton.joints.map((joint) => {
			const known = state.nodes.get(joint);
			if (known !== void 0) return known;
			const node = state.member.scene.nodes[joint];
			if (!node) return 0;
			const match = this.#lookup.bone(node.name);
			const composed = match ?? this.#addNode(state.member.file, node, -1, this.#placeUnder(-1, state.worlds[joint]));
			state.nodes.set(joint, composed);
			if (match !== null) state.merged.add(joint);
			return composed;
		});
		this.#skeletons.push({
			joints,
			inverseBindMatrices: skeleton.inverseBindMatrices
		});
		state.skeletons.set(index, this.#skeletons.length - 1);
		return this.#skeletons.length - 1;
	}
	/** Each attached file's parts, for the meshes that came along, with the file as a prefix on their ids. */
	addMemberParts() {
		for (const state of this.#members.values()) {
			const meshNode = /* @__PURE__ */ new Map();
			for (const [memberNode, composed] of state.nodes) {
				const mesh = state.member.scene.nodes[memberNode]?.mesh;
				if (mesh !== null && mesh !== void 0 && !state.merged.has(memberNode)) meshNode.set(mesh, composed);
			}
			for (const part of state.member.scene.parts) {
				const levels = part.levels.map(({ level, meshes }) => ({
					level,
					meshes: meshes.flatMap((mesh) => state.meshes.get(mesh) ?? [])
				})).filter((level) => level.meshes.length > 0);
				const own = state.merged.has(part.node) ? void 0 : state.nodes.get(part.node);
				const firstMesh = part.levels.flatMap((level) => level.meshes).find((mesh) => meshNode.has(mesh));
				const node = own ?? (firstMesh === void 0 ? void 0 : meshNode.get(firstMesh));
				if (node === void 0 || levels.length === 0 && part.role !== "socket") continue;
				this.#parts.push({
					...part,
					id: memberPath(state.member.file, part.id),
					node,
					levels
				});
			}
		}
	}
	/**
	* Binds each animation file's clips to the model. A clip's name is its name in its file with the file as a prefix,
	* so adding or removing other files never renames it. Its display name stays its own unless another clip shows
	* the same, which adds " (2)", " (3)" and so on.
	*/
	addClips(animations) {
		const shown = new Set(this.#clips.map((clip) => clip.displayName));
		for (const member of animations) for (const clip of member.scene.clips) {
			const missing = /* @__PURE__ */ new Set();
			const unmatchedMorphs = /* @__PURE__ */ new Set();
			const tracks = [];
			for (const track of clip.tracks) {
				const node = member.scene.nodes[track.node];
				if (!node || track.held) continue;
				const target = this.#lookup.byName(node.name, node.kind === "bone");
				if (target !== null) tracks.push(track.property === "weights" ? this.#morphTrack(member.scene, track, target, unmatchedMorphs) : {
					...track,
					node: target
				});
				else if (node.kind === "bone") missing.add(node.name);
			}
			let displayName = clip.displayName;
			for (let suffix = 2; shown.has(displayName); suffix++) displayName = `${clip.displayName} (${suffix})`;
			shown.add(displayName);
			this.#clips.push({
				...clip,
				name: memberPath(member.file, clip.name),
				displayName,
				tracks,
				file: member.file
			});
			if (missing.size > 0) this.#warnMissingBones(member.file, clip.name, displayName, [...missing]);
			if (unmatchedMorphs.size > 0) this.#warn(importWarning("invalid-data", {
				kind: "clip",
				name: clip.name
			}, `Morph targets not matched: ${displayName}`, member.file, { detail: `Missing or ambiguous morph targets: ${[...unmatchedMorphs].join(", ")}` }));
		}
	}
	#morphTrack(source, track, node, unmatched) {
		const sourceMesh = source.meshes[source.nodes[track.node]?.mesh ?? -1];
		const targetMesh = this.#model.meshes[this.#model.nodes[node]?.mesh ?? -1];
		const sourceTargets = sourceMesh?.morphTargets ?? [];
		const targetTargets = targetMesh?.morphTargets ?? [];
		const sourceNames = uniqueNames(sourceTargets);
		const targetNames = uniqueNames(targetTargets);
		for (const target of sourceTargets) if ((sourceNames.get(target.name) ?? -1) < 0 || (targetNames.get(target.name) ?? -1) < 0) unmatched.add(`${source.nodes[track.node]?.name ?? "(unnamed)"}/${target.name || "(unnamed)"}`);
		const indices = targetTargets.map((target) => (targetNames.get(target.name) ?? -1) < 0 ? -1 : sourceNames.get(target.name) ?? -1);
		const values = new Float32Array(track.times.length * targetTargets.length);
		for (let key = 0; key < track.times.length; key++) targetTargets.forEach((target, index) => {
			const sourceIndex = indices[index] ?? -1;
			values[key * targetTargets.length + index] = sourceIndex < 0 ? target.defaultWeight : track.values[key * sourceTargets.length + sourceIndex] ?? target.defaultWeight;
		});
		return {
			...track,
			node,
			values
		};
	}
	#warnMissingBones(file, clip, displayName, bones) {
		const listed = bones.slice(0, LISTED_NAMES).join(", ");
		const more = bones.length > LISTED_NAMES ? ` and ${bones.length - LISTED_NAMES} more` : "";
		this.#warn(importWarning("animation-bones-missing", {
			kind: "clip",
			name: clip
		}, `Missing bones: ${displayName}`, file, { detail: `Bones the model lacks: ${listed}${more}` }));
	}
	hide(ids) {
		for (const id of ids) {
			const index = this.#parts.findIndex((part) => part.id === id);
			const part = this.#parts[index];
			if (part) {
				this.#parts[index] = {
					...part,
					hiddenByDefault: true
				};
				continue;
			}
			const { file } = splitMemberPath(id);
			this.#warn(importWarning("node-not-found", {
				kind: "node",
				name: id
			}, `Part not found: ${id}`, file ?? void 0));
		}
	}
	/**
	* Puts each slot's texture on the materials of its name. A texture several slots share is added once. It samples as
	* the slot's own texture did, or would have where the file's image was not found.
	*/
	overrideTextures(materials) {
		const added = /* @__PURE__ */ new Map();
		const indexOf = (texture) => {
			let index = added.get(texture);
			if (index === void 0) {
				index = this.#textures.push(texture) - 1;
				added.set(texture, index);
			}
			return index;
		};
		for (const [name, slots] of Object.entries(materials)) {
			const targets = this.#materials.flatMap((material, index) => material.name === name ? [index] : []);
			if (targets.length === 0) {
				this.#warn(importWarning("material-not-found", {
					kind: "material",
					name
				}, `Material not used by any mesh: ${name}`));
				continue;
			}
			for (const slot of TEXTURE_SLOTS) {
				const entry = slots[slot];
				if (!entry) continue;
				const texture = entry.texture ? indexOf(entry.texture) : null;
				for (const target of targets) {
					const material = this.#materials[target];
					if (!material) continue;
					const overrides = {
						...material.textureOverrides,
						[slot]: {
							path: entry.path,
							found: texture !== null
						}
					};
					this.#materials[target] = {
						...texture === null ? material : withTexture(material, slot, {
							...samplingOf(material, slot),
							texture
						}),
						textureOverrides: overrides
					};
				}
			}
		}
	}
	build() {
		return {
			...this.#model,
			source: {
				...this.#model.source,
				warnings: this.#warnings
			},
			nodes: this.#nodes,
			meshes: this.#meshes,
			skeletons: this.#skeletons,
			materials: this.#materials,
			textures: this.#textures,
			clips: this.#clips,
			parts: this.#parts,
			bounds: defaultViewBounds(this.#meshes, this.#parts)
		};
	}
};
function uniqueNames(items) {
	const names = /* @__PURE__ */ new Map();
	items.forEach(({ name }, index) => {
		names.set(name, name === "" || names.has(name) ? -1 : index);
	});
	return names;
}
/**
* The attachments with each file's node entries before its whole-file entries, files in the order they first appear.
* A whole-file entry takes every node its file has not placed yet, so an entry for one of its nodes must come first.
*/
function attachOrder(attach) {
	const byFile = /* @__PURE__ */ new Map();
	for (const attachment of attach) {
		const entries = byFile.get(attachment.member.file) ?? [];
		entries.push(attachment);
		byFile.set(attachment.member.file, entries);
	}
	return [...byFile.values()].flatMap((entries) => [...entries.filter((entry) => entry.node !== null), ...entries.filter((entry) => entry.node === null)]);
}
/** Marks the roots and everything below them. Parents come before their children. */
function subtree(nodes, roots) {
	const included = nodes.map(() => false);
	for (const root of roots) included[root] = true;
	nodes.forEach((node, index) => {
		if (node.parent >= 0 && included[node.parent]) included[index] = true;
	});
	return included;
}
var PLAIN_SAMPLING = {
	uvSet: 0,
	wrapU: "repeat",
	wrapV: "repeat",
	transform: null
};
/** How a slot samples its texture: as its own texture does, else as its missing image would have, else plainly. */
function samplingOf(material, slot) {
	const own = material[TEXTURE_SLOT_KEYS[slot]];
	if (own) {
		const { texture: _, ...sampling } = own;
		return sampling;
	}
	return material.missingTextureSampling?.[slot] ?? PLAIN_SAMPLING;
}
/** The material with a texture in a slot. Its color factor turns white, so the texture shows as it is. */
function withTexture(material, slot, ref) {
	switch (slot) {
		case "baseColor": return {
			...material,
			baseColorTexture: ref,
			baseColor: [
				1,
				1,
				1,
				material.baseColor[3]
			]
		};
		case "normal": return {
			...material,
			normalTexture: ref
		};
		case "roughness": return {
			...material,
			roughnessTexture: ref
		};
		case "metalness": return {
			...material,
			metalnessTexture: ref
		};
		case "emissive": return {
			...material,
			emissiveTexture: ref,
			emissive: material.emissive.every((value) => value === 0) ? [
				1,
				1,
				1
			] : material.emissive
		};
	}
}
//#endregion
//#region ../../packages/scene/src/fingerprint.ts
function topologyFingerprint({ indices, sourceVertex, sourceVertexCount }) {
	if (indices.length % 3 !== 0) throw new RangeError(`Triangle indices must come in threes, got ${indices.length}.`);
	let h1 = 3735928559;
	let h2 = 1103547991;
	for (const rendered of indices) {
		const source = sourceVertex[rendered];
		if (source === void 0 || source >= sourceVertexCount) throw new RangeError(`Rendered vertex ${rendered} has no source vertex below ${sourceVertexCount}.`);
		h1 = Math.imul(h1 ^ source, 2654435761);
		h2 = Math.imul(h2 ^ source, 1597334677);
	}
	h1 = Math.imul(h1 ^ h1 >>> 16, 2246822507) ^ Math.imul(h2 ^ h2 >>> 13, 3266489909);
	h2 = Math.imul(h2 ^ h2 >>> 16, 2246822507) ^ Math.imul(h1 ^ h1 >>> 13, 3266489909);
	return {
		sourceVertexCount,
		triangleCount: indices.length / 3,
		hash: hex32(h2) + hex32(h1)
	};
}
function sameTopology(a, b) {
	return a.sourceVertexCount === b.sourceVertexCount && a.triangleCount === b.triangleCount && a.hash === b.hash;
}
function hex32(value) {
	return (value >>> 0).toString(16).padStart(8, "0");
}
//#endregion
//#region ../../packages/scene/src/image.ts
var SIGNATURES = [
	{
		mimeType: "image/png",
		offset: 0,
		bytes: [
			137,
			80,
			78,
			71,
			13,
			10,
			26,
			10
		]
	},
	{
		mimeType: "image/jpeg",
		offset: 0,
		bytes: [
			255,
			216,
			255
		]
	},
	{
		mimeType: "image/gif",
		offset: 0,
		bytes: [
			71,
			73,
			70,
			56
		]
	},
	{
		mimeType: "image/webp",
		offset: 8,
		bytes: [
			87,
			69,
			66,
			80
		]
	},
	{
		mimeType: "image/ktx2",
		offset: 0,
		bytes: [
			171,
			75,
			84,
			88,
			32,
			50,
			48,
			187
		]
	},
	{
		mimeType: "image/vnd-ms.dds",
		offset: 0,
		bytes: [
			68,
			68,
			83,
			32
		]
	},
	{
		mimeType: "image/vnd.adobe.photoshop",
		offset: 0,
		bytes: [
			56,
			66,
			80,
			83
		]
	},
	{
		mimeType: "image/x-exr",
		offset: 0,
		bytes: [
			118,
			47,
			49,
			1
		]
	},
	{
		mimeType: "image/tiff",
		offset: 0,
		bytes: [
			73,
			73,
			42,
			0
		]
	},
	{
		mimeType: "image/tiff",
		offset: 0,
		bytes: [
			77,
			77,
			0,
			42
		]
	},
	{
		mimeType: "image/vnd.radiance",
		offset: 0,
		bytes: [
			35,
			63,
			82
		]
	},
	{
		mimeType: "image/bmp",
		offset: 0,
		bytes: [66, 77]
	}
];
var EXTENSIONS = /* @__PURE__ */ new Map([
	["png", "image/png"],
	["jpg", "image/jpeg"],
	["jpeg", "image/jpeg"],
	["gif", "image/gif"],
	["webp", "image/webp"],
	["bmp", "image/bmp"],
	["tga", "image/x-tga"],
	["tif", "image/tiff"],
	["tiff", "image/tiff"],
	["dds", "image/vnd-ms.dds"],
	["ktx2", "image/ktx2"],
	["exr", "image/x-exr"],
	["hdr", "image/vnd.radiance"],
	["psd", "image/vnd.adobe.photoshop"]
]);
/** The file name at the end of a path written with either separator. */
function fileNameOf(path) {
	const slashed = path.replaceAll("\\", "/");
	return slashed.slice(slashed.lastIndexOf("/") + 1);
}
/** The image type from the bytes' signature, falling back to the path's extension. */
function imageMimeType(bytes, path) {
	const signature = SIGNATURES.find(({ offset, bytes: expected }) => expected.every((byte, index) => bytes[offset + index] === byte));
	if (signature) return signature.mimeType;
	const name = fileNameOf(path);
	const dot = name.lastIndexOf(".");
	return (dot === -1 ? void 0 : EXTENSIONS.get(name.slice(dot + 1).toLowerCase())) ?? "application/octet-stream";
}
//#endregion
//#region ../../packages/scene/src/importer.ts
function findImporter(importers, fileName) {
	const lower = fileName.toLowerCase();
	return importers.find((importer) => importer.extensions.some((extension) => lower.endsWith(extension))) ?? null;
}
/** Splits a file path stored in an asset, written with either separator. */
function parseStoredPath(storedPath) {
	const slashed = storedPath.replaceAll("\\", "/");
	const name = slashed.slice(slashed.lastIndexOf("/") + 1);
	const absolute = slashed.startsWith("/") || /^[A-Za-z]:/.test(slashed);
	return {
		name,
		relative: absolute || slashed === "" ? null : slashed,
		absolute
	};
}
//#endregion
//#region ../../packages/scene/src/material-slots.ts
var STATE_ORDER = {
	set: 0,
	missing: 1,
	empty: 2
};
function slotOf(scene, material, slot) {
	const ref = material[TEXTURE_SLOT_KEYS[slot]];
	const texture = ref ? scene.textures[ref.texture] : void 0;
	const shown = texture && ref ? ref.texture : null;
	const override = material.textureOverrides?.[slot];
	if (override) return {
		slot,
		state: override.found ? "set" : "missing",
		path: override.path,
		overridden: true,
		texture: shown
	};
	if (texture) return {
		slot,
		state: "set",
		path: texture.storedPath || texture.name,
		overridden: false,
		texture: shown
	};
	const missing = material.missingTextures?.[slot];
	if (missing !== void 0) return {
		slot,
		state: "missing",
		path: missing,
		overridden: false,
		texture: null
	};
	return {
		slot,
		state: "empty",
		path: null,
		overridden: false,
		texture: null
	};
}
/**
* Each named material once with its texture slots that are set or missing, and always its base color slot, which is
* where a texture usually goes. Materials that share a name share the composition's textures, so a slot shows the
* most telling state among them: set, then missing, then empty.
*/
function materialSlots(scene) {
	const byName = /* @__PURE__ */ new Map();
	for (const material of scene.materials) {
		if (material.name === "") continue;
		const slots = TEXTURE_SLOTS.map((slot) => slotOf(scene, material, slot));
		const known = byName.get(material.name);
		byName.set(material.name, known ? known.map((slot, index) => {
			const other = slots[index];
			return other && STATE_ORDER[other.state] < STATE_ORDER[slot.state] ? other : slot;
		}) : slots);
	}
	return [...byName].map(([material, slots]) => ({
		material,
		slots: slots.filter((slot) => slot.state !== "empty" || slot.slot === "baseColor")
	}));
}
//#endregion
//#region ../../packages/scene/src/ranges.ts
/** Sorts, removes duplicates and joins consecutive indices into inclusive ranges. */
function encodeRanges(indices) {
	const sorted = Array.from(indices, checkIndex).sort((a, b) => a - b);
	const ranges = [];
	let current = null;
	for (const index of sorted) if (current && index <= current[1] + 1) current[1] = Math.max(current[1], index);
	else {
		current = [index, index];
		ranges.push(current);
	}
	return ranges;
}
/**
* Expands ranges into indices. The ranges must be sorted and must not overlap or touch. Ranges from a file or another
* process can name any index, so check them with `rangesWithin` against the mesh's counts before decoding.
*/
function decodeRanges(ranges) {
	const out = new Uint32Array(countInRanges(ranges));
	let n = 0;
	for (const [start, end] of ranges) for (let index = start; index <= end; index++) out[n++] = index;
	return out;
}
function countInRanges(ranges) {
	let count = 0;
	let previousEnd = -2;
	for (const [start, end] of ranges) {
		checkIndex(start);
		checkIndex(end);
		if (end < start) throw new RangeError(`Range [${start}, ${end}] ends before it starts.`);
		if (start <= previousEnd + 1) throw new RangeError(`Range [${start}, ${end}] overlaps or touches the range before it.`);
		count += end - start + 1;
		previousEnd = end;
	}
	return count;
}
/** True when every index in the ranges is below `count`. */
function rangesWithin(ranges, count) {
	const last = ranges[ranges.length - 1];
	return last === void 0 || last[1] < count;
}
function checkIndex(index) {
	if (!Number.isInteger(index) || index < 0 || index > 4294967295) throw new RangeError(`${index} is not a valid index.`);
	return index;
}
//#endregion
//#region ../../packages/scene/src/scene.ts
/** The distinct buffers behind every typed array in the scene, for a transfer list. */
function collectTransferables(scene) {
	const buffers = /* @__PURE__ */ new Set();
	const add = (view) => {
		if (view && view.buffer instanceof ArrayBuffer) buffers.add(view.buffer);
	};
	for (const mesh of scene.meshes) {
		add(mesh.positions);
		add(mesh.normals);
		for (const uv of mesh.uvs) add(uv.values);
		add(mesh.colors);
		add(mesh.joints);
		add(mesh.weights);
		add(mesh.indices);
		for (const target of mesh.morphTargets) {
			add(target.positions);
			add(target.normals);
		}
		add(mesh.bindMatrix);
		add(mesh.sourceVertex);
		add(mesh.restPositions);
		if (mesh.skinWeights) {
			add(mesh.skinWeights.offsets);
			add(mesh.skinWeights.joints);
			add(mesh.skinWeights.weights);
		}
	}
	for (const skeleton of scene.skeletons) add(skeleton.inverseBindMatrices);
	for (const texture of scene.textures) add(texture.bytes);
	for (const clip of scene.clips) {
		add(clip.keyTimes);
		for (const track of clip.tracks) {
			add(track.times);
			add(track.values);
		}
	}
	return [...buffers];
}
//#endregion
//#region ../../packages/scene/src/time.ts
/** Number of frames in a clip, counting both frame 0 and the frame at `duration`. */
function frameCountFor(duration, fps) {
	return Math.round(duration * fps) + 1;
}
function lastFrame(clip) {
	return Math.max(0, clip.frameCount - 1);
}
/** Sorted unique key times across the file's curves; times closer than `tolerance` seconds count as one. */
function mergeKeyTimes(curveKeyTimes, tolerance = 1e-5) {
	const all = [];
	for (const times of curveKeyTimes) for (const time of times) all.push(time);
	all.sort((a, b) => a - b);
	const merged = [];
	for (const time of all) {
		const previous = merged[merged.length - 1];
		if (previous === void 0 || time - previous > tolerance) merged.push(time);
	}
	return Float32Array.from(merged);
}
/**
* True when every animated curve in the file has exactly one key on each frame from 0 to frameCount - 1, within a
* quarter frame. Pass each curve's own key times, not the union: a clip whose curves are keyed on different frames
* is not keyed on every frame.
*/
function isKeyedEveryFrame(curveKeyTimes, fps, frameCount) {
	if (curveKeyTimes.length === 0) return false;
	const tolerance = .25 / fps;
	return curveKeyTimes.every((times) => times.length === frameCount && times.every((time, frame) => Math.abs(time - frame / fps) <= tolerance));
}
/** One warning for each material whose textures sample UV sets past `VIEWPORT_UV_SETS`. */
function unshownUvSetWarnings(materials) {
	const sets = /* @__PURE__ */ new Map();
	for (const material of materials) for (const key of TEXTURE_REF_KEYS) {
		const ref = material[key];
		if (!ref || ref.uvSet < 4) continue;
		const found = sets.get(material.name) ?? /* @__PURE__ */ new Set();
		found.add(ref.uvSet);
		sets.set(material.name, found);
	}
	return [...sets].map(([name, unshown]) => {
		const maps = [...unshown].sort((a, b) => a - b).map((set) => set + 1);
		const last = maps.pop();
		const listed = maps.length === 0 ? `UV map ${last}` : `UV maps ${maps.join(", ")} and ${last}`;
		return importWarning("material-approximated", {
			kind: "material",
			name
		}, `Material approximated: ${name}`, void 0, { detail: `Textures on ${listed} show with the first UV map, since the preview draws only the first 4` });
	});
}
//#endregion
//#region ../../packages/protocol/src/view-state.ts
var displayModeSchema = _enum([
	"lit",
	"clay",
	"wireframe"
]);
/** A part's stable id: the node path of its mesh, LOD group or socket, as `ScenePart.id` gives it. */
var partIdSchema = string().min(1);
/**
* Which parts a view shows. `hidden` and `shown` list only parts whose visibility differs from their default: models
* show and collision helpers hide by default. An isolated part is the only part shown. `lod` picks the LOD level; a
* part without that level shows its nearest lower one.
*/
var partViewSchema = object({
	hidden: array(partIdSchema),
	shown: array(partIdSchema),
	isolated: partIdSchema.nullable(),
	lod: indexSchema
});
/** What a window shows for one asset. The core keeps the latest report so a window can be rebuilt after a crash. */
var viewStateSchema = object({
	camera: cameraAnchorSchema,
	/** The clip's name in the file, or null for the rest pose. */
	clip: string().min(1).nullable(),
	frame: indexSchema,
	range: frameRangeSchema.nullable(),
	display: object({
		mode: displayModeSchema,
		skeleton: boolean()
	}),
	parts: partViewSchema.default(() => ({
		hidden: [],
		shown: [],
		isolated: null,
		lod: 0
	})),
	/** The outline drawer is open. It shows only for models with parts or added files to list. */
	outlineOpen: boolean().default(false),
	/** The person dismissed the offer to continue an earlier review, so the tab never offers one again. */
	relinkOfferDismissed: boolean().optional()
});
//#endregion
//#region ../../packages/protocol/src/composition.ts
/** The name of a model's composition file, which lives in the model's review folder. */
var COMPOSITION_FILE_NAME = "composition.json";
/** Extensions of the model files Arcue opens: FBX files, and Blender's own .blend files. */
var MODEL_FILE_EXTENSIONS = [".fbx", ".blend"];
/** Extensions of the images a composition may name and an importer may read beside a model. */
var IMAGE_FILE_EXTENSIONS = [
	".png",
	".jpg",
	".jpeg",
	".tga",
	".tif",
	".tiff",
	".bmp",
	".dds",
	".exr",
	".hdr",
	".webp"
];
/** How a file joins a model's view: its clips, its nodes on a bone, or its nodes in place. */
var memberRoleSchema = _enum([
	"animation",
	"attach",
	"set"
]);
/** The roles a file takes without a bone: its clips bind to the model's bones, or its nodes come along in place. */
var fileRoleSchema = memberRoleSchema.exclude(["attach"]);
/**
* How a file joins a model's view when nobody names its role, and every role it can take, that one first; null for a
* file with neither meshes nor clips. A file with clips is an animation file when it has no meshes, or when it
* animates the model, as a Blender animation file that keeps a copy of the character does. Any other file with meshes
* comes along in place, its bones merging into the model's bones of the same name, so a skinned mesh binds to the
* model's rig. A file with meshes can always come along in place, and one whose clips key the model's bones can always
* be an animation file.
*/
function memberRoles(content) {
	const set = content.meshes > 0;
	const animation = content.clips > 0 && (!set || content.keysModelBones || content.animatesModel);
	if (!set && !animation) return null;
	const role = animation && (!set || content.animatesModel) ? "animation" : "set";
	const roles = [role];
	if (animation && role !== "animation") roles.push("animation");
	if (set && role !== "set") roles.push("set");
	return {
		role,
		roles
	};
}
/** The meshes on a file's own nodes, leaving out those that another file of its composition brings. */
function ownMeshes(scene) {
	const shown = visibleMeshes(scene.parts);
	const meshes = [];
	for (const node of scene.nodes) {
		if (node.mesh === null || splitMemberPath(node.path).file !== null) continue;
		const mesh = scene.meshes[node.mesh];
		if (!mesh) continue;
		meshes.push({
			name: node.name,
			topology: mesh.topology,
			skinned: mesh.skeleton !== null,
			shown: shown.has(node.mesh)
		});
	}
	return meshes;
}
function hasCopy(mesh, among) {
	return among.some((other) => other.name === mesh.name || sameTopology(other.topology, mesh.topology));
}
/**
* Whether most bones a file's clips key are the model's own bones by name, which is how a composition binds them.
* Tracks that only hold the file's pose do not count.
*/
function keysModelBones(member, model) {
	const bones = /* @__PURE__ */ new Set();
	for (const node of model.nodes) if (node.kind === "bone" && splitMemberPath(node.path).file === null) bones.add(node.name);
	const keyed = /* @__PURE__ */ new Set();
	for (const clip of member.clips) for (const track of clip.tracks) {
		const node = member.nodes[track.node];
		if (node?.kind === "bone" && track.held !== true) keyed.add(node.name);
	}
	let matched = 0;
	for (const name of keyed) if (bones.has(name)) matched++;
	return matched * 2 > keyed.size;
}
/**
* Whether a file with clips holds animation for a model rather than more to show with it. Its clips key the model's
* bones, and its meshes copy the model's, each by name or topology: every mesh it shows is a copy of one of the
* model's, or it holds a copy of every mesh the model shows and its other meshes are rigid, such as a floor or a prop.
* Meshes it hides, such as a rig's bone shapes, do not count. An outfit made on the model's rig brings a skinned mesh
* of its own, so it comes along in place even when the file keeps a copy of the model.
*/
function animatesModel(member, model) {
	if (!keysModelBones(member, model)) return false;
	const theirs = ownMeshes(member);
	const ours = ownMeshes(model);
	const extra = theirs.filter((mesh) => mesh.shown && !hasCopy(mesh, ours));
	if (extra.length === 0) return true;
	const shown = ours.filter((mesh) => mesh.shown);
	return shown.length > 0 && shown.every((mesh) => hasCopy(mesh, theirs)) && extra.every((mesh) => !mesh.skinned);
}
/**
* Whether a file beside the model joins it by its name, "<model stem>@<anything>" with a model file's extension, such
* as "Hero@Walk.fbx" or "Hero@Walk.blend", rather than through the composition.
*/
function joinsByName(modelName, fileName) {
	const dot = modelName.lastIndexOf(".");
	const prefix = `${dot > 0 ? modelName.slice(0, dot) : modelName}@`;
	const lower = fileName.toLowerCase();
	return fileName.startsWith(prefix) && fileName.length > prefix.length && MODEL_FILE_EXTENSIONS.some((extension) => lower.endsWith(extension));
}
function isRelativeFile(path) {
	if (path.includes("\\") || path.startsWith("/") || /^[A-Za-z]:/.test(path)) return false;
	return path.split("/").every((segment) => segment !== "");
}
/** A path relative to the model's folder with "/" separators, such as "Shells.fbx" or "../Textures/Rock.png". */
var relativeFileSchema = string().min(1).refine(isRelativeFile, { message: "Use a path relative to the model's folder, with \"/\" separators." });
var textureSlotSchema = _enum([
	"baseColor",
	"normal",
	"roughness",
	"metalness",
	"emissive"
]);
var compositionAttachSchema = strictObject({
	file: relativeFileSchema,
	/** A node's name or path in the file, which brings its children along. Without it the whole file comes along. */
	node: string().min(1).optional(),
	/** A bone's name in the model that the nodes follow. Without it they stay in place, as a set piece. */
	bone: string().min(1).optional()
});
/** Textures by slot, relative to the model's folder. They replace what the model's files say. */
var materialTexturesSchema = strictObject({
	baseColor: relativeFileSchema.optional(),
	normal: relativeFileSchema.optional(),
	roughness: relativeFileSchema.optional(),
	metalness: relativeFileSchema.optional(),
	emissive: relativeFileSchema.optional()
});
/**
* A model's composition file: the other files that complete its view, as game pipelines spread one asset over several
* files. It is `composition.json` in the model's review folder, so its place names the model, and opening the model
* applies it. Every path is relative to the model's folder. Parts and anchors from the other files carry the file as a
* prefix on their node paths: "Shells.fbx//Boulder1".
*/
var compositionFileSchema = strictObject({
	version: literal(1),
	/** Files whose clips bind to the model's bones by name. */
	animations: array(relativeFileSchema).optional(),
	/** Files, or nodes in them, that follow a bone of the model or stay in place. */
	attach: array(compositionAttachSchema).optional(),
	/** Textures by material slot name. */
	materials: record(string().min(1), materialTexturesSchema).optional(),
	/** Part ids hidden until someone shows them, such as the second of two alternative bodies. */
	hidden: array(partIdSchema).optional()
}).superRefine((composition, ctx) => {
	const issue = (message, path) => ctx.addIssue({
		code: "custom",
		message,
		path
	});
	const seen = (list, what, key) => {
		const found = /* @__PURE__ */ new Set();
		list.forEach((entry, index) => {
			if (found.has(entry)) issue(`${what} ${entry} is listed twice.`, [key, index]);
			found.add(entry);
		});
	};
	seen(composition.animations ?? [], "Animation file", "animations");
	seen((composition.attach ?? []).map((entry) => entry.node === void 0 ? entry.file : `${entry.file}, node ${entry.node},`), "Attached", "attach");
	seen(composition.hidden ?? [], "Part", "hidden");
});
//#endregion
//#region ../../packages/protocol/src/context.ts
/**
* The layouts of a comment's stored screenshot, each named after a comment id, which `screenshotOwner` returns. The
* comment schema also checks that it is the comment's own id.
*/
var SCREENSHOT_PATH = new RegExp(`^(?:screenshots/(${COMMENT_ID_PATTERN})(?:-[1-9]\\d*)?|rounds/round-[1-9]\\d*/(${COMMENT_ID_PATTERN}))\\.png$`);
/** The comment id a screenshot path is named after, or undefined when the path is not one of the layouts. */
function screenshotOwner(path) {
	const match = SCREENSHOT_PATH.exec(path);
	return match?.[1] ?? match?.[2];
}
var boneShareSchema = object({
	name: string(),
	/** Share of the target's skin weight, from 0 to 1. */
	share: number().min(0).max(1)
});
/** A joint's world position. `path` is its node path, which stays unique when joint names repeat. */
var jointPositionSchema = object({
	name: string(),
	path: string().min(1),
	position: vec3Schema
});
/**
* Facts computed when a comment is made and stored with it, so history stays accurate after the file changes.
* Positions are in scene space. Comments without a surface target have no bones, centroid or vertices.
* A range comment's posed positions and joints are taken at the range's start frame.
*/
var commentContextSchema = object({
	vertexCount: indexSchema,
	bones: array(boneShareSchema),
	centroid: object({
		rest: vec3Schema,
		posed: vec3Schema
	}).nullable(),
	/** The joints that move the target, at the comment's time. */
	joints: array(jointPositionSchema),
	/** Plain words for the camera direction, such as "palm side, slightly below". */
	viewLabel: string(),
	/**
	* Screenshot path relative to the asset's review folder, in one of the layouts the core writes:
	* `screenshots/<id>.png`, `screenshots/<id>-<k>.png` for a replaced screenshot, or `rounds/round-<r>/<id>.png`.
	*/
	screenshot: string().regex(SCREENSHOT_PATH).nullable()
});
/** What the 3D view computes; the core adds the screenshot path when it saves the image. */
var computedContextSchema = commentContextSchema.omit({ screenshot: true });
//#endregion
//#region ../../packages/protocol/src/definitions.ts
function command(definition) {
	return definition;
}
function query(definition) {
	return definition;
}
var importWarningCodeSchema = _enum(Object.keys(importWarningSeverity));
/** What a warning is about. `file` names the composition's file it comes from, absent for the model's own file. */
var warningSubjectSchema = object({
	kind: _enum([
		"texture",
		"material",
		"node",
		"clip",
		"file"
	]),
	name: string(),
	file: string().min(1).optional()
});
var importWarningShape = {
	code: importWarningCodeSchema,
	severity: _enum(["warning", "error"]),
	subject: warningSubjectSchema.omit({ file: true }),
	message: string().min(1),
	file: string().min(1).optional(),
	detail: string().min(1).optional(),
	materials: array(string()).optional(),
	foundPath: string().min(1).optional(),
	uses: array(object({
		material: string(),
		slot: textureSlotSchema
	})).optional()
};
/** A problem the importer found in the file, as `SourceInfo.warnings` lists it. */
var importWarningSchema = object(importWarningShape);
/** A warning's id: its code, subject and file, so it stays the same across versions and a dismissal sticks. */
var warningIdSchema = string().min(1);
/**
* The command that fixes a warning: `view.setClip`, `asset.reload`, `material.setTexture` on the base color,
* `material.setTexture` on the slot with an image the person chooses, or `asset.relink` to a model file the person
* chooses.
*/
var warningFixSchema = discriminatedUnion("kind", [
	object({
		kind: literal("show-clip"),
		clip: string().min(1)
	}),
	object({ kind: literal("retry") }),
	object({
		kind: literal("use-as-base-color"),
		material: string().min(1),
		/** Absolute path of the image, as material.setTexture takes it. */
		file: string().min(1)
	}),
	object({
		kind: literal("choose-texture"),
		material: string().min(1),
		slot: textureSlotSchema
	}),
	object({ kind: literal("choose-model") })
]);
/** An import warning of the version on screen, with its id and what the review recorded about it. */
var assetWarningSchema = object({
	id: warningIdSchema,
	...importWarningShape,
	dismissed: boolean(),
	/** The newest comment made from the warning, of any status, or null. */
	commentId: commentIdSchema.nullable(),
	fix: warningFixSchema.nullable()
});
/** The warning a comment was made from, as the comment and `round.json` keep it. */
var commentWarningSchema = object({
	id: warningIdSchema,
	code: importWarningCodeSchema,
	subject: warningSubjectSchema.omit({ file: true }),
	file: string().min(1).optional(),
	detail: string().min(1).optional()
});
/** The stable id of a warning: "<code>:<kind>:<name>", with "<file>//" before the name for a composition's file. */
function warningId(warning) {
	const file = warning.file === void 0 ? "" : `${warning.file}//`;
	return `${warning.code}:${warning.subject.kind}:${file}${warning.subject.name}`;
}
/** App settings, kept by the core. */
var settingsSchema = object({
	coordinates: _enum(["y-up", "z-up-blender"]),
	/** The name the core records as the author of what windows do. Without it, nothing names an author. */
	authorName: authorSchema.shape.name.optional()
});
//#endregion
//#region ../../packages/protocol/src/views.ts
/** The query parameter of a page's address, and of its socket's, that names the view the page shows. */
var VIEW_PARAMETER = "view";
/**
* The name of an agent session's view, such as "3f9a0c1d2b4e". The page at `?view=<name>` shows the models that
* session opens, and only those.
*/
var viewNameSchema = string().regex(/^[a-z0-9-]{1,64}$/, "A view name is 1 to 64 lowercase letters, digits and dashes.");
/**
* The address of a view's page on the server at an origin such as "http://localhost:4530", for a view name the schema
* accepts: "http://localhost:4530/?view=3f9a0c1d2b4e".
*/
function viewAddress(origin, view) {
	return `${origin.replace(/\/+$/, "")}/?${VIEW_PARAMETER}=${view}`;
}
//#endregion
//#region ../../packages/protocol/src/commands.ts
var assetRef$1 = { assetId: assetIdSchema };
var commentRef = {
	assetId: assetIdSchema,
	commentId: commentIdSchema
};
var commentTextSchema = string().trim().min(1);
/** A clip's name in the file, such as "Armature|Charge". */
var clipNameSchema = string().min(1);
var versionIdSchema = string().min(1);
/** An absolute path, or one relative to the model's folder. */
var compositionMemberSchema = string().min(1);
var compositionOutput = object({ 
/** The composition file the command wrote. */
path: string().min(1) });
var commands = {
	"asset.open": command({
		description: "Open an asset in a tab, or focus its tab when it is already open. The calling window shows it, or for any other caller a window outside views; asset.openInView shows it in an agent session's view instead. The model loads with the files its composition lists. Optionally show a clip, by its name in the file, and a frame.",
		runsIn: "core",
		input: object({
			path: string().min(1),
			clip: clipNameSchema.optional(),
			frame: indexSchema.optional(),
			/** The view to start from when the asset was not open yet, as a window restoring its tabs passes it. */
			viewState: viewStateSchema.optional()
		}),
		output: object({ assetId: assetIdSchema })
	}),
	"asset.openInView": command({
		description: "Open an asset for an agent session's view, or focus its tab, as asset.open does. The view's page shows it. While that page is not connected, a window outside views shows it, and with neither the core holds the asset until the page connects. An asset shows in one view at a time: when another view has it, or a window outside views has it while this view's page is connected, the call fails with conflict, unless move takes the asset from there. A move never discards a comment box with unsaved text.",
		runsIn: "core",
		input: object({
			path: string().min(1),
			clip: clipNameSchema.optional(),
			frame: indexSchema.optional(),
			view: viewNameSchema,
			move: boolean().default(false)
		}),
		output: object({
			assetId: assetIdSchema,
			/** "view" when the view's page shows the asset, "window" when a window outside views does, "held" while it waits for the page. */
			shown: _enum([
				"view",
				"window",
				"held"
			])
		})
	}),
	"asset.close": command({
		description: "Close an asset's tab. Its review data stays on disk.",
		runsIn: "core",
		input: object(assetRef$1),
		output: _void()
	}),
	"asset.reload": command({
		description: "Parse the asset file and its composition's files again and swap in the new version. The previous version stays if parsing fails.",
		runsIn: "core",
		input: object(assetRef$1),
		output: object({ version: string() })
	}),
	"asset.relink": command({
		description: "Point an open asset whose model file is gone at the file's new path, after a rename or move that Arcue could not follow by itself. Its review folder moves along, the asset keeps its id, and its tab takes the new name. Fails while the old file still exists, and when the new file has a review of its own.",
		runsIn: "core",
		input: object({
			...assetRef$1,
			path: string().min(1)
		}),
		output: _void()
	}),
	"comment.create": command({
		description: "Add a draft comment to the end of the asset's queue.",
		runsIn: "core",
		input: object({
			...assetRef$1,
			text: commentTextSchema,
			/** The asset version the target and time were picked on. The core rejects a version that is no longer current. */
			version: versionIdSchema,
			time: timeSelectionSchema,
			target: spatialAnchorSchema.nullable(),
			camera: cameraAnchorSchema,
			context: computedContextSchema,
			screenshot: bytesSchema.nullable(),
			/** The parts the view showed. The core stores it only when it differs from the default view. */
			parts: partViewSchema.optional()
		}),
		output: object({ commentId: commentIdSchema })
	}),
	"comment.update": command({
		description: "Edit a draft comment. Fields left out keep their values. A change of time or target must bring a new context and screenshot, and the version they were picked on.",
		runsIn: "core",
		input: object({
			...commentRef,
			text: commentTextSchema.optional(),
			version: versionIdSchema.optional(),
			time: timeSelectionSchema.optional(),
			target: spatialAnchorSchema.nullable().optional(),
			camera: cameraAnchorSchema.optional(),
			context: computedContextSchema.optional(),
			screenshot: bytesSchema.nullable().optional(),
			parts: partViewSchema.optional()
		}).refine((input) => input.time === void 0 && input.target === void 0 || input.context !== void 0 && input.screenshot !== void 0 && input.version !== void 0, {
			message: "A new time or target needs a new context, screenshot and version.",
			path: ["context"]
		}),
		output: _void()
	}),
	"comment.delete": command({
		description: "Delete a draft comment.",
		runsIn: "core",
		input: object(commentRef),
		output: _void()
	}),
	"comment.resolve": command({
		description: "Mark a sent comment resolved: the new version of the file fixed it.",
		runsIn: "core",
		input: object(commentRef),
		output: _void()
	}),
	"comment.reopen": command({
		description: "Return a sent or resolved comment to the queue with a follow-up message.",
		runsIn: "core",
		input: object({
			...commentRef,
			text: commentTextSchema
		}),
		output: _void()
	}),
	"comment.createFromWarning": command({
		description: "Add a draft comment about an import warning, by its id from warning.list. Its text starts as the warning's message, and the prompt names the warning and its subject.",
		runsIn: "core",
		input: object({
			...assetRef$1,
			warningId: warningIdSchema
		}),
		output: object({ commentId: commentIdSchema })
	}),
	"warning.dismiss": command({
		description: "Dismiss an import warning on this asset, by its id from warning.list. It stays dismissed across reloads; review.undo brings it back.",
		runsIn: "core",
		input: object({
			...assetRef$1,
			warningId: warningIdSchema
		}),
		output: _void()
	}),
	"warning.dismissAll": command({
		description: "Dismiss every import warning warning.list shows for the asset. review.undo brings them back.",
		runsIn: "core",
		input: object(assetRef$1),
		output: _void()
	}),
	"round.copy": command({
		description: "Save the asset's queue as the next round, mark its comments sent, and copy the prompt.",
		runsIn: "core",
		input: object(assetRef$1),
		output: object({
			round: int().positive(),
			prompt: string(),
			copiedToClipboard: boolean()
		})
	}),
	"composition.addFile": command({
		description: "Load another file into the asset's view and save it in the asset's composition file, composition.json in the asset's review folder, which is created on the first edit. An animation file's clips bind to the model's bones by name. An attached file, or one node of it, follows a bone of the model. A set file stays in place, and its bones merge into the model's bones of the same name, so a skinned mesh binds to the rig. Without a role the core reads the file: clips make an animation file when the file has no meshes, or when most bones they key are the model's bones by name and its meshes copy the model's, so that each mesh it shows is a copy of one of the model's, or it holds a copy of each mesh the model shows and its other meshes are rigid. Other files with meshes are set files. composition.fileRoles tells the role before adding. Adding a file again with the same node replaces its entry. Undo with review.undo.",
		runsIn: "core",
		input: object({
			...assetRef$1,
			file: compositionMemberSchema,
			role: memberRoleSchema.optional(),
			/** A node's name or path in the file, for "attach" and "set". Without it the whole file comes along. */
			node: string().min(1).optional(),
			/** The model's bone that an "attach" file follows. */
			bone: string().min(1).optional()
		}).refine((input) => input.role === "attach" === (input.bone !== void 0), {
			message: "An \"attach\" file needs a bone, and only it takes one.",
			path: ["bone"]
		}).refine((input) => (input.role ?? "animation") !== "animation" || input.node === void 0, {
			message: "An animation file, or a file without a role, takes no node.",
			path: ["node"]
		}),
		output: compositionOutput.extend({ role: memberRoleSchema })
	}),
	"composition.removeFile": command({
		description: "Remove a file from the asset's view and from its composition file. Files named \"<model>@<clip>.fbx\" or \"<model>@<clip>.blend\" beside the model join by their name and cannot be removed this way. Undo with review.undo.",
		runsIn: "core",
		input: object({
			...assetRef$1,
			file: compositionMemberSchema
		}),
		output: compositionOutput
	}),
	"composition.attachFile": command({
		description: "Attach a file of the asset's composition to a bone of the model, or detach it with a null bone, which leaves it in place as a set piece. Without nodes every attached entry of the file moves; with nodes only the entries for those nodes, all in one edit. Saves the change in the composition file. Undo with review.undo.",
		runsIn: "core",
		input: object({
			...assetRef$1,
			file: compositionMemberSchema,
			/** Names or paths of nodes in the file, each naming one of the file's entries. */
			nodes: array(string().min(1)).min(1).optional(),
			/** A bone's name or path in the model, or null for a set piece. */
			bone: string().min(1).nullable()
		}),
		output: compositionOutput
	}),
	"material.setTexture": command({
		description: "Show a texture in a material slot of the asset, in place of what the model's file says, and save it in the composition file. A null file removes the override. scene.materials lists the slots. Undo with review.undo.",
		runsIn: "core",
		input: object({
			...assetRef$1,
			/** The material's name in the file. */
			material: string().min(1),
			slot: textureSlotSchema,
			file: compositionMemberSchema.nullable()
		}),
		output: compositionOutput
	}),
	"settings.set": command({
		description: "Change app settings. Fields left out keep their values. Returns the settings now in effect.",
		runsIn: "core",
		input: settingsSchema.partial(),
		output: settingsSchema
	}),
	"review.undo": command({
		description: "Undo the asset's latest review edit, if there is one: a comment edit or a change to its composition file. A composition file that changed since the edit is not touched, and the call fails with conflict.",
		runsIn: "core",
		input: object(assetRef$1),
		output: object({ changed: boolean() })
	}),
	"review.redo": command({
		description: "Redo the asset's latest undone review edit, if there is one. A composition file that changed since the undo is not touched, and the call fails with conflict.",
		runsIn: "core",
		input: object(assetRef$1),
		output: object({ changed: boolean() })
	}),
	"review.relink": command({
		description: "Move an earlier review onto the asset after its file was renamed or moved: comments, rounds, screenshots and the composition file, with paths and ids rewritten when the model changed folders. from is the earlier model's absolute path, as review.candidates lists it. That file must be gone, and the asset may have no comments, rounds or dismissed warnings of its own yet.",
		runsIn: "core",
		input: object({
			...assetRef$1,
			from: string().min(1)
		}),
		output: _void()
	}),
	"view.reportState": command({
		description: "A window reports what it shows for an asset, so the core can restore the view after a crash.",
		runsIn: "core",
		internal: true,
		input: object({
			...assetRef$1,
			state: viewStateSchema
		}),
		output: _void()
	}),
	"view.reportFocus": command({
		description: "A window reports that it gained focus. The core shows newly opened assets in the window focused last.",
		runsIn: "core",
		internal: true,
		input: object({}),
		output: _void()
	}),
	"view.showAsset": command({
		description: "Show an asset in a tab of this window, at a clip and frame if given. The core sends it to one window before announcing the asset.",
		runsIn: "view",
		internal: true,
		input: object({
			...assetRef$1,
			clip: clipNameSchema.optional(),
			frame: indexSchema.optional()
		}),
		output: _void()
	}),
	"view.moveAsset": command({
		description: "Move an asset's tab from the window that shows it to the calling window, with its camera, clip and frame. Only within a view: an asset of another view, or of no view for a view's page, stays where it is.",
		runsIn: "core",
		internal: true,
		input: object({
			...assetRef$1,
			/**
			* Leaves the tab where it is when another window shows the asset, or the asset belongs to another view, as a page
			* that reopens after a reload does. Without it, an asset of another view fails with conflict.
			*/
			unlessShown: boolean().optional()
		}),
		output: _void()
	}),
	"view.releaseAsset": command({
		description: "Remove an asset's tab from this window without closing the asset, and return what the tab showed. The core sends it before moving the tab to another window. A window refuses with conflict while the tab's comment box has unsaved text.",
		runsIn: "view",
		internal: true,
		input: object(assetRef$1),
		output: viewStateSchema.nullable()
	}),
	"view.setClip": command({
		description: "Show a clip by its name in the file, or the rest pose when clip is null.",
		runsIn: "view",
		input: object({
			...assetRef$1,
			clip: clipNameSchema.nullable()
		}),
		output: _void()
	}),
	"view.setFrame": command({
		description: "Move the playhead to a frame of the current clip.",
		runsIn: "view",
		input: object({
			...assetRef$1,
			frame: indexSchema
		}),
		output: _void()
	}),
	"view.setPlaying": command({
		description: "Play or pause the current clip.",
		runsIn: "view",
		input: object({
			...assetRef$1,
			playing: boolean()
		}),
		output: _void()
	}),
	"view.setSpeed": command({
		description: "Set the playback speed, from 0.25 to 2.",
		runsIn: "view",
		input: object({
			...assetRef$1,
			speed: number().min(.25).max(2)
		}),
		output: _void()
	}),
	"view.setLoop": command({
		description: "Loop playback at the end of the clip, or stop there.",
		runsIn: "view",
		input: object({
			...assetRef$1,
			loop: boolean()
		}),
		output: _void()
	}),
	"view.setRange": command({
		description: "Select a frame range of the current clip, or clear it. Playback loops inside the range.",
		runsIn: "view",
		input: object({
			...assetRef$1,
			range: frameRangeSchema.nullable()
		}),
		output: _void()
	}),
	"view.setCamera": command({
		description: "Move the camera.",
		runsIn: "view",
		input: object({
			...assetRef$1,
			camera: cameraAnchorSchema,
			animate: boolean().default(true)
		}),
		output: _void()
	}),
	"view.frame": command({
		description: "Fit the model in the view, or a comment's target when commentId is given.",
		runsIn: "view",
		input: object({
			...assetRef$1,
			commentId: commentIdSchema.nullable().default(null)
		}),
		output: _void()
	}),
	"view.setDisplayMode": command({
		description: "Show the model lit, as clay or as wireframe.",
		runsIn: "view",
		input: object({
			...assetRef$1,
			mode: displayModeSchema
		}),
		output: _void()
	}),
	"view.setSkeleton": command({
		description: "Show or hide the skeleton overlay.",
		runsIn: "view",
		input: object({
			...assetRef$1,
			visible: boolean()
		}),
		output: _void()
	}),
	"view.setPartVisible": command({
		description: "Show or hide a part by its id from scene.parts. Collision helpers are hidden until shown; sockets draw no mesh. While a part is isolated, the other parts stay as they are on screen and the isolation ends.",
		runsIn: "view",
		input: object({
			...assetRef$1,
			part: partIdSchema,
			visible: boolean()
		}),
		output: _void()
	}),
	"view.isolatePart": command({
		description: "Show only one part, by its id from scene.parts, or every part again when part is null.",
		runsIn: "view",
		input: object({
			...assetRef$1,
			part: partIdSchema.nullable()
		}),
		output: _void()
	}),
	"view.setLod": command({
		description: "Show a LOD level. A part without that level shows its nearest lower one.",
		runsIn: "view",
		input: object({
			...assetRef$1,
			level: indexSchema
		}),
		output: _void()
	}),
	"view.setOutlineOpen": command({
		description: "Open or close the outline drawer, which lists the model's files, bones and parts. It shows only for models with parts or added files to list.",
		runsIn: "view",
		input: object({
			...assetRef$1,
			open: boolean()
		}),
		output: _void()
	}),
	"view.highlightSubject": command({
		description: "Tint what an import warning is about in the 3D view: a material's meshes, the meshes of the materials that use a texture, a node's meshes, or a file's meshes. Null clears the tint.",
		runsIn: "view",
		input: object({
			...assetRef$1,
			subject: warningSubjectSchema.nullable()
		}),
		output: _void()
	}),
	"view.selectComment": command({
		description: "Select a comment, jump to its time and restore its camera and the parts it showed, always showing the part that holds its target. Null clears the selection.",
		runsIn: "view",
		input: object({
			...assetRef$1,
			commentId: commentIdSchema.nullable()
		}),
		output: _void()
	}),
	"view.screenshot": command({
		description: "Render a PNG of the asset at a time and camera, by default the ones on screen. A range renders its start frame.",
		runsIn: "view",
		input: object({
			...assetRef$1,
			width: int().min(16).max(4096).default(1280),
			height: int().min(16).max(4096).default(720),
			time: timeSelectionSchema.optional(),
			camera: cameraAnchorSchema.optional(),
			drawComments: boolean().default(false)
		}),
		output: object({ png: bytesSchema })
	})
};
function isCommandName(name) {
	return Object.hasOwn(commands, name);
}
//#endregion
//#region ../../packages/protocol/src/relink.ts
/** How an earlier review was matched to a model: the same bytes, the same Unity GUID, or the same meshes. */
var relinkMatchSchema = _enum([
	"content",
	"guid",
	"structure"
]);
/** An earlier review whose model file is gone, which may belong to an asset whose file was renamed or moved. */
var reviewCandidateSchema = object({
	/** Absolute path of the model the review was made for, as `review.relink` takes it. */
	path: string().min(1),
	/** How many comments the review holds. */
	comments: int().nonnegative(),
	/** When the review last loaded a version of its model, or null when it never did. */
	lastLoadedAt: datetime().nullable(),
	match: relinkMatchSchema
});
//#endregion
//#region ../../packages/protocol/src/review.ts
var timestampSchema = datetime();
var roundNumberSchema = int().positive();
var commentStatusSchema = _enum([
	"draft",
	"sent",
	"resolved"
]);
/** Whether the comment's surface target survived the latest export: kept exactly, moved to the nearest surface, or lost. */
var anchorStateSchema = _enum([
	"exact",
	"moved",
	"detached"
]);
var followUpSchema = object({
	text: string().min(1),
	createdAt: timestampSchema,
	/** The round whose fix did not work. */
	afterRound: roundNumberSchema,
	/** Who reopened the comment, when the caller named someone. */
	author: authorSchema.optional()
});
var commentSchema = object({
	id: commentIdSchema,
	text: string().min(1),
	status: commentStatusSchema,
	createdAt: timestampSchema,
	updatedAt: timestampSchema,
	/** Id of the asset version the comment was made on. */
	madeOnVersion: string().min(1),
	time: timeAnchorSchema,
	target: spatialAnchorSchema.nullable(),
	/** Id of the version whose vertex and triangle numbers the target uses. Re-anchoring moves it forward. */
	anchorVersion: string().min(1),
	/**
	* Rest positions of the target's source vertices in that version, in the target's vertex order (decoded ranges for
	* a region), rounded to 0.00001 m. Re-anchoring maps from them, so it works after the old file is overwritten.
	* Empty without a target.
	*/
	anchorRestPositions: array(vec3Schema),
	camera: cameraAnchorSchema,
	context: commentContextSchema,
	anchorState: anchorStateSchema,
	/** Messages added each time the comment was reopened, oldest first. */
	followUps: array(followUpSchema),
	/** Rounds the comment was sent in, oldest first. */
	rounds: array(roundNumberSchema),
	/**
	* The status a reopened comment had before it was reopened, while its follow-up waits in the queue. Deleting the
	* draft drops the follow-up and restores this status. Null otherwise.
	*/
	reopenedFrom: _enum(["sent", "resolved"]).nullable(),
	/** The parts the view showed when the comment was made, present only when that differs from the default view. */
	parts: partViewSchema.optional(),
	/** The import warning the comment was made from, if any. */
	warning: commentWarningSchema.optional(),
	/** Who made the comment, when the caller named someone. */
	author: authorSchema.optional()
}).refine((comment) => comment.anchorRestPositions.length === anchoredVertexCount(comment.target), {
	message: "There must be one rest position per anchored vertex.",
	path: ["anchorRestPositions"]
}).refine((comment) => comment.reopenedFrom === null || comment.status === "draft" && comment.followUps.length > 0, {
	message: "Only a reopened draft with a follow-up records the status it was reopened from.",
	path: ["reopenedFrom"]
}).refine((comment) => comment.context.screenshot === null || screenshotOwner(comment.context.screenshot) === comment.id, {
	message: "A comment's screenshot must be named after the comment.",
	path: ["context", "screenshot"]
});
function anchoredVertexCount(target) {
	if (target === null) return 0;
	if (target.kind === "surface") return 3;
	try {
		return countInRanges(target.vertices);
	} catch {
		return NaN;
	}
}
var meshTopologySchema = object({
	mesh: string().min(1),
	topology: topologyFingerprintSchema
});
/** The full 64-bit hash of a file's bytes as 16 hex digits, which finds the file again after a rename. */
var contentHashSchema = string().regex(/^[0-9a-f]{16}$/);
/** The GUID Unity gives an asset in its `.meta` file: 32 lowercase hex digits. */
var unityGuidSchema = string().regex(/^[0-9a-f]{32}$/);
var fileSizeSchema = int().nonnegative();
var versionFileSchema = object({
	/**
	* Relative to the model's folder, as composition prefixes write it, such as "BugShells.fbx"; the composition file
	* itself is "composition.json".
	*/
	file: string().min(1),
	/** Content hash of that file's bytes; older reviews use a seven-character prefix. */
	id: string().min(1),
	/** Full hash of that file's bytes; absent for the composition file and in versions older builds recorded. */
	hash: contentHashSchema.optional(),
	/** The file's size in bytes, beside `hash`. */
	size: fileSizeSchema.optional(),
	/** The GUID in the Unity `.meta` file beside that file, when it has one. */
	guid: unityGuidSchema.optional()
});
var assetVersionSchema = object({
	/** Content identity of the asset and its dependencies; older reviews use a seven-character prefix. */
	id: string().min(1),
	fileModifiedAt: timestampSchema,
	loadedAt: timestampSchema,
	/** Exporter as the file names it, such as "Blender 5.2 FBX". */
	exporter: string().nullable(),
	/** Every mesh with its topology; a mesh from another file of a composition has that file as a prefix. */
	meshes: array(meshTopologySchema),
	/** For a composition, each file the version was built from, the model and the composition file first. */
	files: array(versionFileSchema).optional(),
	/** Full hash of the model file's bytes; absent in versions older builds recorded. */
	hash: contentHashSchema.optional(),
	/** The model file's size in bytes, beside `hash`. */
	size: fileSizeSchema.optional()
});
var roundSummarySchema = object({
	number: roundNumberSchema,
	createdAt: timestampSchema,
	version: string().min(1),
	/** Comment ids in prompt order. */
	comments: array(commentIdSchema),
	/** Who copied the round, when the caller named someone. */
	author: authorSchema.optional()
});
/**
* `review.json`: every comment, round and version of one asset. Only the core writes it.
* The queue holds exactly the draft comments, each once, in the order the next prompt lists them. Files written before
* comment ids were random also carry `nextCommentNumber`, which parsing drops.
*/
var reviewFileSchema = object({
	schemaVersion: literal(1),
	/** The `REVIEW_FORMAT` of the build that last saved the file. Older builds saved none, which reads as format 1. */
	format: int().positive().optional(),
	asset: object({
		/** Relative to the workspace root, or absolute when the asset is outside a git repository. */
		path: string().min(1),
		/** The GUID in the Unity `.meta` file beside the model, read on every load and kept when the file goes away. */
		guid: unityGuidSchema.optional()
	}),
	versions: array(assetVersionSchema),
	comments: array(commentSchema),
	queue: array(commentIdSchema),
	rounds: array(roundSummarySchema),
	/**
	* Counts the core's saves of the file, so a writer can tell whether another save came between its read and its
	* write. Each save adds one; a file written before the counter existed reads as 0.
	*/
	revision: int().nonnegative().default(0),
	/** Import warnings dismissed on this asset, by id; absent when none is. */
	dismissedWarnings: array(warningIdSchema).optional()
}).superRefine((review, ctx) => {
	const issue = (message, path) => ctx.addIssue({
		code: "custom",
		message,
		path
	});
	const statusById = /* @__PURE__ */ new Map();
	review.comments.forEach((comment, index) => {
		if (statusById.has(comment.id)) issue(`Comment id ${comment.id} is used twice.`, [
			"comments",
			index,
			"id"
		]);
		statusById.set(comment.id, comment.status);
	});
	const versionIds = /* @__PURE__ */ new Set();
	review.versions.forEach((version, index) => {
		if (versionIds.has(version.id)) issue(`Version id ${version.id} is used twice.`, [
			"versions",
			index,
			"id"
		]);
		versionIds.add(version.id);
	});
	const queued = /* @__PURE__ */ new Set();
	review.queue.forEach((id, index) => {
		if (queued.has(id)) issue(`Comment ${id} is queued twice.`, ["queue", index]);
		else if (statusById.get(id) !== "draft") issue(`Comment ${id} is queued but is not a draft.`, ["queue", index]);
		queued.add(id);
	});
	review.comments.forEach((comment, index) => {
		if (comment.status === "draft" && !queued.has(comment.id)) issue(`Draft ${comment.id} is missing from the queue.`, [
			"comments",
			index,
			"status"
		]);
	});
});
/** The format a review was saved in. */
function reviewFormat(review) {
	return review.format ?? 1;
}
object({ asset: assetSummarySchema }), object({ asset: assetSummarySchema }), object({ assetId: assetIdSchema }), object({
	assetId: assetIdSchema,
	review: reviewFileSchema
}), object({
	assetId: assetIdSchema,
	from: string().min(1),
	automatic: boolean()
}), object({
	assetId: assetIdSchema,
	candidate: reviewCandidateSchema
}), object({
	assetId: assetIdSchema,
	round: int().positive()
});
//#endregion
//#region ../../packages/protocol/src/listener-errors.ts
/** The default for a listener that throws: the error surfaces as an unhandled rejection, and delivery continues. */
var reportListenerError = (error) => {
	Promise.reject(error);
};
/** Calls every listener; one that throws is reported and does not stop the rest. */
function callEach(listeners, args, onError) {
	for (const listener of [...listeners]) try {
		listener(...args);
	} catch (error) {
		onError(error);
	}
}
//#endregion
//#region ../../packages/protocol/src/transport/envelope.ts
function isRecord(value) {
	return typeof value === "object" && value !== null;
}
function isEnvelope(value) {
	if (!isRecord(value)) return false;
	switch (value.type) {
		case "request": return typeof value.id === "number" && (value.kind === "command" || value.kind === "query") && typeof value.name === "string";
		case "response": return typeof value.id === "number" && (value.ok === true || value.ok === false && isRecord(value.error));
		case "event": return typeof value.name === "string";
		default: return false;
	}
}
//#endregion
//#region ../../packages/protocol/src/transport/peer.ts
var resultTransfers = /* @__PURE__ */ new WeakMap();
/** Marks a request handler's result so the listed buffers move to the other side instead of being copied. */
function withTransfer(value, transfer) {
	resultTransfers.set(value, transfer);
	return value;
}
function createPeer(endpoint, options = {}) {
	let nextId = 1;
	let closed = false;
	const pending = /* @__PURE__ */ new Map();
	const eventListeners = /* @__PURE__ */ new Set();
	const closeListeners = /* @__PURE__ */ new Set();
	const onListenerError = options.onListenerError ?? reportListenerError;
	let unlisten = () => {};
	let unlistenClose = () => {};
	const post = (message, transfer = []) => {
		if (!closed) endpoint.post(message, transfer);
	};
	const postFailure = (id, error) => {
		try {
			post({
				type: "response",
				id,
				ok: false,
				error: toWireError(error)
			});
		} catch {}
	};
	const respond = async ({ id, kind, name, input }) => {
		let output;
		try {
			if (!options.handleRequest) throw new ArcueError("unavailable", `This side does not answer requests ("${name}").`);
			output = await options.handleRequest({
				kind,
				name,
				input
			});
		} catch (error) {
			postFailure(id, error);
			return;
		}
		try {
			const transfer = typeof output === "object" && output !== null ? resultTransfers.get(output) : void 0;
			post({
				type: "response",
				id,
				ok: true,
				output
			}, transfer);
		} catch (error) {
			postFailure(id, error);
		}
	};
	const settle = (id, settleWith) => {
		const entry = pending.get(id);
		if (!entry) return;
		pending.delete(id);
		entry.cancelTimer();
		settleWith(entry);
	};
	const close = () => {
		if (closed) return;
		closed = true;
		unlisten();
		unlistenClose();
		const error = new ArcueError("disconnected", "The connection closed before a response arrived.");
		for (const id of [...pending.keys()]) settle(id, (entry) => entry.reject(error));
		eventListeners.clear();
		const listeners = [...closeListeners];
		closeListeners.clear();
		callEach(listeners, [], onListenerError);
	};
	unlisten = endpoint.listen((message) => {
		if (closed || !isEnvelope(message)) return;
		if (message.type === "request") respond(message);
		else if (message.type === "response") {
			if (message.ok) settle(message.id, (entry) => entry.resolve(message.output));
			else settle(message.id, (entry) => entry.reject(fromWireError(message.error)));
		} else callEach(eventListeners, [message.name, message.payload], onListenerError);
	});
	unlistenClose = endpoint.onClose(close);
	return {
		request(kind, name, input, transfer = []) {
			if (closed) return Promise.reject(new ArcueError("disconnected", "The connection is closed."));
			const id = nextId++;
			return new Promise((resolve, reject) => {
				const timeout = options.requestTimeout;
				const cancelTimer = timeout ? timeout.setTimer(timeout.ms, () => settle(id, (entry) => entry.reject(new ArcueError("timeout", `"${name}" got no response within ${timeout.ms} ms.`)))) : () => void 0;
				pending.set(id, {
					resolve,
					reject,
					cancelTimer
				});
				try {
					post({
						type: "request",
						id,
						kind,
						name,
						input
					}, transfer);
				} catch (error) {
					settle(id, (entry) => entry.reject(error));
				}
			});
		},
		emit(name, payload, transfer = []) {
			post({
				type: "event",
				name,
				payload
			}, transfer);
		},
		onEvent(listener) {
			eventListeners.add(listener);
			return () => {
				eventListeners.delete(listener);
			};
		},
		onClose(listener) {
			if (closed) {
				callEach([listener], [], onListenerError);
				return () => void 0;
			}
			closeListeners.add(listener);
			return () => {
				closeListeners.delete(listener);
			};
		},
		close
	};
}
//#endregion
//#region ../../packages/protocol/src/import-worker.ts
/**
* Requests on the private channel between the core and an import worker; they are not core commands.
* The core sends "import.run". While it runs, the worker may send "import.readFile", "import.findFile" and
* "import.locateFile" back to the core for files the asset references, such as external textures. All are sent as
* kind "command".
*/
var importRequests = {
	run: "import.run",
	readFile: "import.readFile",
	findFile: "import.findFile",
	locateFile: "import.locateFile"
};
var importRunInputSchema = object({
	fileName: string().min(1),
	bytes: bytesSchema
});
var importReadFileInputSchema = object({ 
/**
* Relative to the asset's folder; it may leave the folder, as "../Textures/" does. The core answers null for absolute
* and drive paths, paths outside the workspace root (the git repository, or the asset's folder outside one), files
* that are not images, and paths through a symbolic link.
*/
relativePath: string() });
var importFindFileInputSchema = object({ 
/** The path as the asset stores it. The core searches only inside the workspace root and reads only images. */
storedPath: string() });
/** The import worker's side of the channel: runs the importer that matches the file name. */
function serveImportWorker(endpoint, importers) {
	const peer = createPeer(endpoint, { handleRequest: async ({ name, input }) => {
		if (name !== importRequests.run) throw new ArcueError("unknown-command", `The import worker has no "${name}".`);
		const { fileName, bytes } = importRunInputSchema.parse(input);
		const importer = findImporter(importers, fileName);
		if (!importer) throw new ArcueError("invalid-input", `No importer reads ${fileName}.`);
		const readFile = async (relativePath) => {
			const request = { relativePath };
			return await peer.request("command", importRequests.readFile, request);
		};
		const findFile = async (storedPath) => {
			const request = { storedPath };
			return await peer.request("command", importRequests.findFile, request);
		};
		const locateFile = async (storedPath) => {
			const request = { storedPath };
			return await peer.request("command", importRequests.locateFile, request);
		};
		const scene = await importer.import({
			fileName,
			bytes,
			readFile,
			findFile,
			locateFile
		});
		return withTransfer(scene, collectTransferables(scene));
	} });
	return peer;
}
//#endregion
//#region ../../packages/protocol/src/parts.ts
/** One part of a scene as `scene.parts` and `asset.inspect` list it, with each level's meshes and triangles. */
var partSummarySchema = object({
	id: partIdSchema,
	name: string(),
	role: _enum([
		"model",
		"collision",
		"socket"
	]),
	/** False for collision helpers, sockets and parts a composition hides; view state lists changes from it. */
	shownByDefault: boolean(),
	levels: array(object({
		level: int().nonnegative(),
		meshes: array(string()),
		triangles: int()
	}))
});
//#endregion
//#region ../../packages/protocol/src/inspect.ts
var countSchema = number().int().nonnegative();
var inspectedMeshSchema = object({
	/** The object's name, as the exporting tool shows it. */
	name: string(),
	/** The node path that anchors and comments use for the mesh. */
	path: string(),
	triangles: countSchema,
	/** The file's own vertices, before splits at UV seams and hard edges. */
	vertices: countSchema,
	skinned: boolean()
});
var inspectedBoneSchema = object({
	/** The bone's name in the file. */
	name: string(),
	/** The node path through the bones above it, or "<file>//<node path>" for a bone from another file of the model. */
	path: string()
});
var inspectedTextureRefSchema = object({
	/** The material property the texture feeds, such as "baseColor" or "normal". */
	slot: string(),
	texture: string()
});
var inspectedMaterialSchema = object({
	name: string(),
	textures: array(inspectedTextureRefSchema)
});
var inspectedTextureSchema = object({
	/** The texture's name, or for a texture that was not found, the path the file stores. */
	name: string(),
	found: boolean(),
	/** Null when the texture was not found. */
	mimeType: string().nullable()
});
var inspectedClipSchema = object({
	/** The clip's identity: its name in the file, such as "Armature|Walk". */
	name: string(),
	displayName: string(),
	frames: countSchema,
	fps: number().positive(),
	/** Seconds. */
	duration: number().nonnegative()
});
var inspectedMemberSchema = object({
	/** Relative to the model's folder, with "/" separators. */
	file: string(),
	/** How the file joins the model: its clips, nodes on a bone, nodes in place, or a material's texture. */
	role: _enum([
		"animation",
		"attach",
		"set",
		"texture"
	]),
	found: boolean()
});
/** What `asset.inspect` reports about a file, all plain JSON. */
var assetInspectionSchema = object({
	file: object({
		/** Absolute path, with "/" separators. */
		path: string(),
		name: string(),
		bytes: countSchema
	}),
	format: string(),
	/** The exporting tool and its version, such as "Blender (stable FBX IO) 5.0.1", or null when the file has none. */
	exporter: string().nullable(),
	fps: number(),
	/** The file's own up axis, such as "+Z", before Arcue converted it to +Y up. */
	upAxis: string(),
	/** How many meters one unit of the file was. */
	unitMeters: number(),
	/** Height of the rest pose in meters, 0 for a file without meshes. */
	height: number().nonnegative(),
	meshes: array(inspectedMeshSchema),
	/** Every mesh in exactly one part; LOD groups, collision helpers and sockets are parts with their own roles. */
	parts: array(partSummarySchema),
	triangles: countSchema,
	/** Parents before their children. A file attaches to one of the model's own bones by its name or path. */
	bones: array(inspectedBoneSchema),
	materials: array(inspectedMaterialSchema),
	textures: array(inspectedTextureSchema),
	clips: array(inspectedClipSchema),
	/** The composition file applied to the model, absolute with "/" separators, or null when none applies. */
	composition: string().nullable(),
	/** The other files the model is composed with: the composition's and "<model>@<clip>" animation files. */
	members: array(inspectedMemberSchema),
	warnings: array(importWarningSchema)
});
//#endregion
//#region ../../packages/protocol/src/queries.ts
var assetRef = { assetId: assetIdSchema };
/** Not validated: a scene is large typed data that the core itself produced. */
var sceneDescriptionSchema = custom();
/** A material's texture slot as `scene.materials` lists it. */
var materialSlotSchema = object({
	slot: textureSlotSchema,
	/** "set" shows an image, "missing" names one that was not found, "empty" has none. */
	state: _enum([
		"set",
		"missing",
		"empty"
	]),
	/** The image's path as the model's file or the composition file writes it; null for an empty slot. */
	path: string().nullable(),
	/** The composition file sets this slot. */
	overridden: boolean()
});
var materialSlotsSchema = object({
	material: string(),
	slots: array(materialSlotSchema)
});
var queries = {
	"asset.list": query({
		description: "List the open assets.",
		input: object({}),
		output: object({ assets: array(assetSummarySchema) })
	}),
	"review.get": query({
		description: "Get an asset's review data: comments, queue, rounds and versions.",
		input: object(assetRef),
		output: reviewFileSchema
	}),
	"review.candidates": query({
		description: "List earlier reviews that may belong to the asset because its file was renamed or moved, best first: the model each was made for, which is gone, its comment count, when it last loaded, and whether the bytes, the Unity GUID or only the meshes match. Arcue looks for them when it opens a file that has no review yet, and moves a single review with the same bytes or GUID by itself. review.relink moves one onto the asset.",
		input: object(assetRef),
		output: object({ candidates: array(reviewCandidateSchema) })
	}),
	"viewState.get": query({
		description: "Get the view state a window last reported for an asset, or null before the first report.",
		input: object(assetRef),
		output: viewStateSchema.nullable()
	}),
	"comment.screenshot": query({
		description: "Get a comment's screenshot as PNG bytes, or null when it has none.",
		input: object({
			...assetRef,
			commentId: commentIdSchema
		}),
		output: bytesSchema.nullable()
	}),
	"settings.get": query({
		description: "Get the app settings.",
		input: object({}),
		output: settingsSchema
	}),
	"scene.get": query({
		description: "Get the parsed scene of the asset version on screen, with that version's id.",
		input: object(assetRef),
		output: object({
			version: string().min(1),
			scene: sceneDescriptionSchema
		})
	}),
	"scene.parts": query({
		description: "List the parts of the asset version on screen: meshes, LOD groups with their levels, collision helpers and sockets, with the triangles of each level. Parts from another file of a composition have ids like \"Shells.fbx//Boulder1\".",
		input: object(assetRef),
		output: object({ parts: array(partSummarySchema) })
	}),
	"scene.materials": query({
		description: "List the materials of the asset version on screen, each once by name, with the texture slots that have an image or miss one, and always the base color slot. A slot the composition file sets is marked overridden; material.setTexture with a null file restores the file's own texture.",
		input: object(assetRef),
		output: object({ materials: array(materialSlotsSchema) })
	}),
	"warning.list": query({
		description: "List the import warnings of the asset version on screen, errors first, each with its id, whether it was dismissed, the comment made from it and the command that fixes it.",
		input: object(assetRef),
		output: object({ warnings: array(assetWarningSchema) })
	}),
	"warning.prompt": query({
		description: "Get a prompt that asks a coding agent to fix the asset's import warnings that are not dismissed: one instruction line, then one numbered entry per warning.",
		input: object(assetRef),
		output: object({ prompt: string() })
	}),
	"composition.fileRoles": query({
		description: "Tell how a file would join the asset's view: the role composition.addFile gives it without one, then every other role it can take. A file with meshes can be a \"set\" file. A file with clips can be an \"animation\" file when it has no meshes, or when most bones they key are the model's bones by name.",
		input: object({
			...assetRef,
			file: string().min(1)
		}),
		output: object({
			role: fileRoleSchema,
			roles: array(fileRoleSchema).min(1)
		})
	}),
	"asset.inspect": query({
		description: "Import a file without opening it and summarize it: format, exporter, axes, height, meshes, parts, bones, materials, textures, clips and warnings. A model is composed with its composition file as opening it would be.",
		input: object({ path: string().min(1) }),
		output: assetInspectionSchema
	})
};
function isQueryName(name) {
	return Object.hasOwn(queries, name);
}
//#endregion
//#region ../../packages/protocol/src/round.ts
/** `posed` is null when the 3D view did not compute the target's position at the comment's time. */
var restAndPosedSchema = object({
	rest: vec3Schema,
	posed: vec3Schema.nullable()
});
/**
* `clip` is the clip's name in the file, which `arcue open --clip` takes; `clipDisplayName` is the name without the
* "Armature|" prefix, as Blender shows the action.
*/
var clipRef = {
	clip: string().min(1),
	clipDisplayName: string().min(1)
};
/**
* `sourceFrame` is the frame number the clip's file itself uses for `frame`, such as Blender's frame; it is absent where
* Arcue does not know it, as in rounds written before it existed.
*/
var frameTimeSchema = object({
	...clipRef,
	frame: indexSchema,
	seconds: number(),
	sourceFrame: number().optional()
});
/** `sourceFrames` are the frame numbers the clip's file itself uses for `frames`, where Arcue knows them. */
var rangeTimeSchema = object({
	...clipRef,
	frames: tuple([indexSchema, indexSchema]),
	seconds: tuple([number(), number()]),
	sourceFrames: tuple([number(), number()]).optional()
});
/** `mesh` is the object's name as the exporting tool shows it; `meshPath` is its node path in the file. */
var meshRef = {
	mesh: string(),
	meshPath: string().min(1)
};
var pointTargetSchema = object({
	kind: literal("point"),
	...meshRef,
	vertices: tuple([
		indexSchema,
		indexSchema,
		indexSchema
	]),
	weights: tuple([
		number(),
		number(),
		number()
	]),
	position: restAndPosedSchema,
	bones: array(boneShareSchema)
});
var regionTargetSchema = object({
	kind: literal("region"),
	...meshRef,
	vertices: indexRangesSchema,
	vertexCount: indexSchema,
	centroid: restAndPosedSchema,
	bones: array(boneShareSchema)
});
var roundCommentSchema = object({
	id: commentIdSchema,
	/** The comment's number in the copied prompt, starting at 1. */
	number: int().positive(),
	text: string(),
	/** Null when the comment applies to the model in every pose; positions are then given in the rest pose. */
	time: union([frameTimeSchema, rangeTimeSchema]).nullable(),
	target: discriminatedUnion("kind", [pointTargetSchema, regionTargetSchema]).nullable(),
	/** Joint positions at the comment's time; for a range, at its start frame. */
	pose: object({ joints: array(jointPositionSchema) }).nullable(),
	camera: object({
		position: vec3Schema,
		target: vec3Schema,
		up: vec3Schema,
		fov: number(),
		label: string()
	}),
	/** File name inside the round's folder. */
	screenshot: string().nullable(),
	madeOnVersion: string(),
	/**
	* Whether the target survived the exports since it was made, and the version its vertex and triangle numbers refer
	* to. A detached target's numbers refer to an older version, so match it by its rest positions. Null without a
	* target.
	*/
	anchorState: anchorStateSchema.nullable(),
	anchorVersion: string().min(1).nullable(),
	/** Earlier messages on a reopened comment, with the round each was sent in. */
	earlierMessages: array(object({
		round: int().positive(),
		text: string()
	})).default([]),
	/** The parts the view showed, by part id. Absent for the default view: LOD0, collision helpers hidden. */
	parts: partViewSchema.optional(),
	/** The import warning the comment was made from: its code, subject, file and detail. */
	warning: commentWarningSchema.optional()
});
/** `round.json`: the full data behind one copied prompt. Agents read it; it never changes once written. */
var roundDataSchema = object({
	round: int().positive(),
	asset: object({
		path: string(),
		version: string(),
		exporter: string().nullable(),
		fps: number(),
		space: object({
			units: string(),
			up: _enum([
				"+X",
				"-X",
				"+Y",
				"-Y",
				"+Z",
				"-Z"
			]),
			handedness: _enum(["right", "left"])
		}),
		/** For a composition, each file of the version with its own version. Mesh paths from other files start with one. */
		files: array(versionFileSchema).optional()
	}),
	comments: array(roundCommentSchema)
});
//#endregion
//#region ../../packages/protocol/src/transport/json-codec.ts
var TAG$1 = "$arcueTypedArray";
var typedArrays = {
	Int8Array,
	Uint8Array,
	Uint8ClampedArray,
	Int16Array,
	Uint16Array,
	Int32Array,
	Uint32Array,
	Float32Array,
	Float64Array,
	BigInt64Array,
	BigUint64Array
};
var ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
var LOOKUP = new Map([...ALPHABET].map((char, index) => [char, index]));
function toBase64(bytes) {
	let text = "";
	for (let index = 0; index < bytes.length; index += 3) {
		const a = bytes[index] ?? 0;
		const b = bytes[index + 1];
		const c = bytes[index + 2];
		const triple = a << 16 | (b ?? 0) << 8 | (c ?? 0);
		text += ALPHABET[triple >> 18 & 63];
		text += ALPHABET[triple >> 12 & 63];
		text += b === void 0 ? "=" : ALPHABET[triple >> 6 & 63];
		text += c === void 0 ? "=" : ALPHABET[triple & 63];
	}
	return text;
}
function fromBase64(text) {
	if (text.length % 4 !== 0) throw new Error("Invalid base64 length.");
	const padding = text.endsWith("==") ? 2 : text.endsWith("=") ? 1 : 0;
	const bytes = new Uint8Array(text.length / 4 * 3 - padding);
	let offset = 0;
	for (let index = 0; index < text.length; index += 4) {
		let triple = 0;
		for (let part = 0; part < 4; part++) {
			const char = text[index + part] ?? "=";
			const value = char === "=" ? 0 : LOOKUP.get(char);
			if (value === void 0) throw new Error("Invalid base64 character.");
			triple = triple << 6 | value;
		}
		for (let shift = 16; shift >= 0 && offset < bytes.length; shift -= 8) bytes[offset++] = triple >> shift & 255;
	}
	return bytes;
}
function typedArrayName(value) {
	if (!ArrayBuffer.isView(value) || value instanceof DataView) return null;
	const name = value.constructor.name;
	return Object.hasOwn(typedArrays, name) ? name : null;
}
function replacer(_key, value) {
	if (typeof value !== "object" || value === null) return value;
	const name = typedArrayName(value);
	if (!name) return value;
	const view = value;
	return {
		[TAG$1]: name,
		base64: toBase64(new Uint8Array(view.buffer, view.byteOffset, view.byteLength))
	};
}
function reviver(_key, value) {
	if (typeof value !== "object" || value === null || !(TAG$1 in value)) return value;
	const { [TAG$1]: name, base64 } = value;
	if (typeof name !== "string" || !Object.hasOwn(typedArrays, name) || typeof base64 !== "string") throw new Error("Invalid typed array in a message.");
	const bytes = fromBase64(base64);
	const Constructor = typedArrays[name];
	if (bytes.byteLength % Constructor.BYTES_PER_ELEMENT !== 0) throw new Error("Invalid typed array length.");
	return new Constructor(bytes.buffer);
}
/**
* JSON with typed arrays carried as tagged base64, so both ends of a socket can run different JavaScript engines,
* as the command line on the user's Node does with the core in Electron. Node's v8 serialization cannot do that: an
* older V8 refuses data that a newer one wrote.
*/
var jsonFrameCodec = {
	encode: (value) => new TextEncoder().encode(JSON.stringify(value, replacer)),
	decode: (bytes) => JSON.parse(new TextDecoder().decode(bytes), reviver)
};
//#endregion
//#region ../../packages/protocol/src/transport/binary-codec.ts
var TAG = "$arcueTypedArray";
var LENGTH_BYTES = 4;
var DATA_ALIGNMENT = 8;
var LITTLE_ENDIAN = new Uint8Array(Uint16Array.of(1).buffer)[0] === 1;
var align = (offset, alignment) => Math.ceil(offset / alignment) * alignment;
var invalid = (reason) => new ArcueError("invalid-input", `A malformed frame arrived: ${reason}.`);
function encode(value) {
	if (!LITTLE_ENDIAN) throw new ArcueError("internal", "Binary frames need a little-endian computer.");
	const references = /* @__PURE__ */ new Map();
	let dataBytes = 0;
	const json = JSON.stringify(value, (_key, item) => {
		if (typeof item !== "object" || item === null) return item;
		const type = typedArrayName(item);
		if (!type) return item;
		const array = item;
		let reference = references.get(array);
		if (!reference) {
			const offset = align(dataBytes, array.BYTES_PER_ELEMENT);
			reference = {
				[TAG]: type,
				offset,
				length: array.length
			};
			references.set(array, reference);
			dataBytes = offset + array.byteLength;
		}
		return reference;
	});
	const header = new TextEncoder().encode(json ?? "null");
	const dataStart = align(LENGTH_BYTES + header.byteLength, DATA_ALIGNMENT);
	const total = dataStart + dataBytes;
	if (total > 1073741824) throw new ArcueError("invalid-input", `A message of ${total} bytes is too large to send.`);
	const frame = new Uint8Array(total);
	new DataView(frame.buffer).setUint32(0, header.byteLength, true);
	frame.set(header, LENGTH_BYTES);
	for (const [array, { offset }] of references) frame.set(new Uint8Array(array.buffer, array.byteOffset, array.byteLength), dataStart + offset);
	return frame;
}
function decode(bytes) {
	if (!LITTLE_ENDIAN) throw new ArcueError("internal", "Binary frames need a little-endian computer.");
	if (bytes.byteLength < LENGTH_BYTES) throw invalid("it has no header");
	if (bytes.byteLength > 1073741824) throw invalid(`its ${bytes.byteLength} bytes are too many`);
	const headerLength = new DataView(bytes.buffer, bytes.byteOffset, LENGTH_BYTES).getUint32(0, true);
	const dataStart = align(LENGTH_BYTES + headerLength, DATA_ALIGNMENT);
	if (dataStart > bytes.byteLength) throw invalid("its header is longer than the frame");
	let text;
	try {
		text = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(LENGTH_BYTES, LENGTH_BYTES + headerLength));
	} catch {
		throw invalid("its header is not UTF-8");
	}
	const data = alignedData(bytes.subarray(dataStart));
	try {
		return JSON.parse(text, (_key, value) => revive(value, data));
	} catch (error) {
		if (error instanceof ArcueError) throw error;
		throw invalid("its header is not JSON");
	}
}
/** Views need their element size as alignment in the buffer; a frame that arrived at an odd place is copied once. */
function alignedData(data) {
	return data.byteOffset % DATA_ALIGNMENT === 0 ? data : new Uint8Array(data);
}
function revive(value, data) {
	if (typeof value !== "object" || value === null || !Object.hasOwn(value, TAG)) return value;
	const { [TAG]: type, offset, length, ...rest } = value;
	if (typeof type !== "string" || !Object.hasOwn(typedArrays, type)) throw invalid("it names an unknown array type");
	if (Object.keys(rest).length > 0) throw invalid("an array reference has unknown fields");
	if (!isCount(offset) || !isCount(length)) throw invalid("an array has an invalid offset or length");
	const Constructor = typedArrays[type];
	const size = Constructor.BYTES_PER_ELEMENT;
	if (offset % size !== 0) throw invalid("an array is misaligned");
	if (offset + length * size > data.byteLength) throw invalid("an array reaches past the frame");
	return new Constructor(data.buffer, data.byteOffset + offset, length);
}
function isCount(value) {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
/**
* A JSON header followed by the raw bytes of the message's typed arrays, each aligned for its element size. In the
* header each typed array becomes `{ "$arcueTypedArray": type, offset, length }`, with the offset in bytes from the
* start of the data and the length in elements. The first 4 bytes are the header's length, little-endian, and the data
* starts at the next multiple of 8. Decoded arrays are views into the frame, so they share its buffer.
*
* Like `jsonFrameCodec`, it depends on no JavaScript engine, but it neither copies arrays into strings nor parses them
* back, which matters for scenes of several megabytes. A typed array that occurs twice is written once.
*/
var binaryFrameCodec = {
	encode,
	decode
};
//#endregion
//#region ../../packages/protocol/src/transport/endpoint.ts
function eventData(event) {
	return typeof event === "object" && event !== null && "data" in event ? event.data : void 0;
}
/** Listens for the "close" event that MessagePorts fire when either side closes. */
function portEndpoint(port) {
	return {
		post: (message, transfer) => port.postMessage(message, [...transfer]),
		listen(listener) {
			const onMessage = (event) => listener(eventData(event));
			port.addEventListener("message", onMessage);
			port.start?.();
			return () => port.removeEventListener("message", onMessage);
		},
		onClose(listener) {
			const onClose = () => listener();
			port.addEventListener("close", onClose);
			return () => port.removeEventListener("close", onClose);
		}
	};
}
//#endregion
export { splitMemberPath as $, compositionFileSchema as A, countInRanges as B, settingsSchema as C, ArcueError as Ct, IMAGE_FILE_EXTENSIONS as D, COMPOSITION_FILE_NAME as E, unshownUvSetWarnings as F, parseStoredPath as G, encodeRanges as H, frameCountFor as I, sameTopology as J, fileNameOf as K, isKeyedEveryFrame as L, keysModelBones as M, memberRoles as N, MODEL_FILE_EXTENSIONS as O, viewStateSchema as P, memberPath as Q, lastFrame as R, viewNameSchema as S, messageChannel as St, screenshotOwner as T, rangesWithin as U, decodeRanges as V, materialSlots as W, composeScene as X, topologyFingerprint as Y, findNode as Z, reviewFormat as _, connectBridge as _t, isQueryName as a, knownPartView as at, VIEW_PARAMETER as b, framedChannel as bt, importReadFileInputSchema as c, TEXTURE_REF_NAMES as ct, createPeer as d, BRIDGE_INFO_FILE as dt, describeTextureUses as et, withTransfer as f, HANDSHAKE_MAX_FRAME_BYTES as ft, reviewFileSchema as g, bridgeInfoSchema as gt, reportListenerError as h, acceptBridge as ht, roundDataSchema as i, isDefaultPartView as it, joinsByName as j, animatesModel as k, importRequests as l, TEXTURE_SLOTS as lt, callEach as m, SERVE_CORE_PATH as mt, binaryFrameCodec as n, defaultViewBounds as nt, queries as o, shownByDefault as ot, isEnvelope as p, LAUNCH_INFO_FILE as pt, imageMimeType as q, jsonFrameCodec as r, describeParts as rt, importFindFileInputSchema as s, TEXTURE_REF_KEYS as st, portEndpoint as t, importWarning as tt, serveImportWorker as u, TEXTURE_SLOT_KEYS as ut, commands as v, launchInfoSchema as vt, warningId as w, COMMENT_ID_PATTERN as wt, viewAddress as x, framedEndpoint as xt, isCommandName as y, MAX_FRAME_BYTES as yt, mergeKeyTimes as z };
