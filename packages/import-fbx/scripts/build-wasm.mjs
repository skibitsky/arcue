import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const EMSCRIPTEN_VERSION = "6.0.11";
const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const vendorDir = join(packageDir, "vendor", "ufbx");
const outputDir = join(packageDir, "wasm");
const emccName = process.platform === "win32" ? "emcc.bat" : "emcc";

const defines = [
  "NDEBUG",
  "UFBX_NO_STDIO",
  "UFBX_NO_SUBDIVISION",
  "UFBX_NO_TESSELLATION",
  "UFBX_NO_GEOMETRY_CACHE",
  "UFBX_NO_SCENE_EVALUATION",
  "UFBX_NO_SKINNING_EVALUATION",
  "UFBX_NO_FORMAT_OBJ",
  "UFBX_WASM_32BIT",
];

const settings = [
  "MODULARIZE=1",
  "EXPORT_ES6=1",
  "EXPORT_NAME=createArcueUfbx",
  "ENVIRONMENT=web,worker,node",
  "ALLOW_MEMORY_GROWTH=1",
  "MAXIMUM_MEMORY=4GB",
  "STACK_SIZE=1MB",
  "FILESYSTEM=0",
  "DYNAMIC_EXECUTION=0",
  "EXPORTED_FUNCTIONS=_malloc,_free,_arcue_import,_arcue_free",
  "EXPORTED_RUNTIME_METHODS=HEAPU8",
  "INCOMING_MODULE_JS_API=[]",
];

function fail(message) {
  console.error(`build:wasm: ${message}`);
  process.exit(1);
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function sharedToolchainDir() {
  try {
    const commonDir = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
      cwd: packageDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return join(dirname(commonDir), ".toolchains", "emsdk");
  } catch {
    return null;
  }
}

function findEmcc() {
  const candidates = [];
  if (process.env.EMSDK) candidates.push(join(process.env.EMSDK, "upstream", "emscripten", emccName));
  for (const dir of (process.env.PATH ?? "").split(delimiter)) if (dir) candidates.push(join(dir, emccName));
  const shared = sharedToolchainDir();
  if (shared) candidates.push(join(shared, "upstream", "emscripten", emccName));
  const found = candidates.find((candidate) => existsSync(candidate));
  if (found) return found;
  const target = shared ?? "<repository>/.toolchains/emsdk";
  fail(
    [
      `emcc ${EMSCRIPTEN_VERSION} was not found in $EMSDK, on PATH, or in ${target}.`,
      "Install the pinned version there with:",
      `  git clone https://github.com/emscripten-core/emsdk.git ${target}`,
      `  ${join(target, "emsdk")} install ${EMSCRIPTEN_VERSION}`,
      `  ${join(target, "emsdk")} activate ${EMSCRIPTEN_VERSION}`,
      "Contributors who do not change native/ or vendor/ do not need this: the built module is committed in wasm/.",
    ].join("\n"),
  );
}

function checkVersion(emcc) {
  const output = execFileSync(emcc, ["--version"], { encoding: "utf8" });
  const firstLine = output.split("\n").find((line) => line.startsWith("emcc")) ?? output;
  if (!firstLine.includes(` ${EMSCRIPTEN_VERSION} `)) {
    fail(`${emcc} is not Emscripten ${EMSCRIPTEN_VERSION}: "${firstLine.trim()}". Builds must use the pinned version.`);
  }
}

function checkVendor() {
  const source = JSON.parse(readFileSync(join(vendorDir, "source.json"), "utf8"));
  for (const [file, expected] of Object.entries(source.sha256)) {
    const actual = sha256(join(vendorDir, file));
    if (actual !== expected) fail(`vendor/ufbx/${file} does not match source.json (sha256 ${actual}).`);
  }
  return source;
}

// The loader imports node:module only when it runs in Node. A computed specifier keeps browser bundlers from
// resolving it, which would otherwise warn on every web build.
function hideNodeImport(path) {
  const loader = readFileSync(path, "utf8");
  const original = 'await import("node:module")';
  if (!loader.includes(original)) fail(`${path} no longer contains ${original}; update hideNodeImport.`);
  writeFileSync(path, loader.replace(original, 'await import(/* @vite-ignore */ String("node:module"))'));
}

function checkNoLocalPaths(path) {
  const text = readFileSync(path).toString("latin1");
  for (const local of [packageDir, homedir()]) {
    if (text.includes(local)) fail(`${path} contains the local path ${local}.`);
  }
}

const emcc = findEmcc();
checkVersion(emcc);
const source = checkVendor();
mkdirSync(outputDir, { recursive: true });

const args = [
  "native/arcue_ufbx.c",
  "vendor/ufbx/ufbx.c",
  "-Ivendor/ufbx",
  "-O3",
  `-ffile-prefix-map=${packageDir}/=`,
  ...defines.map((define) => `-D${define}`),
  ...settings.flatMap((setting) => ["-s", setting]),
  "-o",
  "wasm/arcue-ufbx.js",
];
execFileSync(emcc, args, { cwd: packageDir, stdio: "inherit" });

const jsPath = join(outputDir, "arcue-ufbx.js");
const wasmPath = join(outputDir, "arcue-ufbx.wasm");
chmodSync(wasmPath, 0o644);
hideNodeImport(jsPath);
checkNoLocalPaths(jsPath);
checkNoLocalPaths(wasmPath);

const inputs = ["native/arcue_ufbx.c", "scripts/build-wasm.mjs", "vendor/ufbx/ufbx.c", "vendor/ufbx/ufbx.h"];
const build = {
  emscripten: EMSCRIPTEN_VERSION,
  ufbx: { tag: source.tag, commit: source.commit },
  defines,
  settings,
  inputs: Object.fromEntries(inputs.map((input) => [input, sha256(join(packageDir, input))])),
  outputs: {
    "wasm/arcue-ufbx.js": sha256(jsPath),
    "wasm/arcue-ufbx.wasm": sha256(wasmPath),
  },
};
writeFileSync(join(outputDir, "build.json"), `${JSON.stringify(build, null, 2)}\n`);
console.log(`build:wasm: wrote wasm/arcue-ufbx.js and wasm/arcue-ufbx.wasm with Emscripten ${EMSCRIPTEN_VERSION}.`);
