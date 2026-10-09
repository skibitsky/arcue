import { fileURLToPath } from "node:url";
import { ArcueCore } from "@arcue/core";
import { fromNativePath, NodePlatform, startNodeImportWorker } from "@arcue/platform-node";
import type { AssetInspection, ListenerErrorHandler, PartSummary } from "@arcue/protocol";

/** The import worker the build writes beside `arcue.js`. */
export const bundledImportWorker = fileURLToPath(new URL("./import-worker.js", import.meta.url));

export interface InspectOptions {
  importWorkerEntry: string;
  /** The app's data folder, where the core reads its settings. Nothing is written there. */
  userData: string;
  onError: ListenerErrorHandler;
}

/** Runs a core in this process on the Node platform and asks it for `asset.inspect`; no app needs to run. */
export async function inspectFile(nativePath: string, options: InspectOptions): Promise<AssetInspection> {
  const platform = new NodePlatform({
    appDataDir: fromNativePath(options.userData),
    startImportWorker: () => startNodeImportWorker(options.importWorkerEntry, options.onError),
  });
  const core = await ArcueCore.start({ platform, onError: options.onError });
  try {
    return await core.client.query("asset.inspect", { path: fromNativePath(nativePath) });
  } finally {
    core.dispose();
  }
}

const FORMAT_NAMES: Readonly<Record<string, string>> = { fbx: "FBX", gltf: "glTF", glb: "GLB" };

/** A few aligned lines for people. Empty sections are left out. */
export function formatInspection(inspection: AssetInspection): string {
  const rows: [label: string, lines: string[]][] = [];
  const add = (label: string, lines: string[]) => {
    if (lines.length > 0) rows.push([label, lines]);
  };
  const format = FORMAT_NAMES[inspection.format] ?? inspection.format;
  add("File", [inspection.file.path]);
  add("Format", [inspection.exporter ? `${format} from ${inspection.exporter}` : format]);
  if (inspection.clips.length > 0) add("Frame rate", [`${formatNumber(inspection.fps)} fps`]);
  add("Up axis", [inspection.upAxis]);
  if (inspection.unitMeters !== 1) add("Unit", [`${formatNumber(inspection.unitMeters)} m`]);
  add("Height", [`${formatNumber(inspection.height)} m`]);
  add(
    "Meshes",
    columns(
      inspection.meshes.map((mesh) => [
        mesh.name,
        `${count(mesh.triangles, "triangle")}${mesh.skinned ? ", skinned" : ""}`,
      ]),
    ),
  );
  add(
    "Parts",
    columns(inspection.parts.flatMap((part) => (partDetail(part) === "" ? [] : [[part.name, partDetail(part)]]))),
  );
  if (inspection.bones > 0) add("Bones", [String(inspection.bones)]);
  add(
    "Materials",
    columns(
      inspection.materials.map((material) => [
        material.name,
        material.textures.map((ref) => `${slotName(ref.slot)} ${ref.texture}`).join(", "),
      ]),
    ),
  );
  add(
    "Clips",
    columns(
      inspection.clips.map((clip) => [
        clip.name,
        `${count(clip.frames, "frame")}${clip.fps === inspection.fps ? "" : ` at ${formatNumber(clip.fps)} fps`}`,
      ]),
    ),
  );
  if (inspection.composition !== null) add("Composition", [inspection.composition]);
  add("Files", columns(inspection.members.map((member) => [member.file, member.role])));
  const problems = (severity: string) =>
    inspection.warnings.flatMap((warning) =>
      warning.severity !== severity
        ? []
        : [
            warning.file && warning.file !== warning.subject.name
              ? `${warning.message} (${warning.file})`
              : warning.message,
          ],
    );
  add("Errors", problems("error"));
  add("Warnings", problems("warning"));
  const width = Math.max(...rows.map(([label]) => label.length)) + 2;
  return `${rows
    .flatMap(([label, lines]) => lines.map((line, index) => `${(index === 0 ? label : "").padEnd(width)}${line}`))
    .map((line) => line.trimEnd())
    .join("\n")}\n`;
}

/** What sets a part apart from a plain mesh: its LOD levels, its role, or being hidden by default. */
function partDetail(part: PartSummary): string {
  const details: string[] = [];
  if (part.levels.length > 1) details.push(`LOD ${part.levels.map((entry) => entry.level).join(", ")}`);
  if (part.role !== "model") details.push(part.role);
  else if (!part.shownByDefault) details.push("hidden");
  return details.join(", ");
}

function columns(rows: [string, string][]): string[] {
  const width = Math.max(0, ...rows.map(([name]) => name.length)) + 2;
  return rows.map(([name, detail]) => (detail === "" ? name : `${name.padEnd(width)}${detail}`));
}

function count(value: number, noun: string): string {
  return `${value.toLocaleString("en-US")} ${noun}${value === 1 ? "" : "s"}`;
}

function formatNumber(value: number): string {
  return String(Number(value.toPrecision(4)));
}

function slotName(slot: string): string {
  return slot.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`);
}
