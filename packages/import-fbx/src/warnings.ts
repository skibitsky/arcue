import type { ImportWarning, ImportWarningSubject, Quat, Space } from "@arcue/scene";
import { importWarning } from "@arcue/scene";
import type { WireNode, WireWarning } from "./decode";

function message(warning: WireWarning, name: string): string {
  switch (warning.code) {
    case "too-many-uv-sets":
      return `Only the first 8 UV sets of ${name} are kept`;
    case "too-many-bones":
      return `${name} uses more than 65534 bones; the rest are dropped`;
    case "extra-skins":
      return `Only the first skin of ${name} is used`;
    case "unweighted-vertices":
      return `Some vertices of ${name} have no skin weights`;
    case "inbetween-shapes":
      return `In-between shape keys of ${name} use their final shape`;
    case "bind-pose-mismatch":
      return "Meshes are bound in different poses; the first one is used";
    case "clip-not-sampled":
      return warning.detail
        ? `Clip ${name} could not be sampled: ${warning.detail}`
        : `Clip ${name} could not be sampled`;
    case "left-handed-axes":
      return "Left-handed axes, mirrored along X";
    case "invalid-data":
      return warning.detail ?? "The file has invalid data";
  }
}

/** Turns the parser's warnings into import warnings; file-level ones name the asset's file. */
export function parserWarnings(warnings: readonly WireWarning[], fileName: string): ImportWarning[] {
  return warnings.map((warning) => {
    const subject: ImportWarningSubject = {
      kind: warning.subjectKind,
      name: warning.subjectKind === "file" ? fileName : (warning.subject ?? ""),
    };
    return importWarning(warning.code, subject, message(warning, subject.name));
  });
}

const SCALE_TOLERANCE = 0.01;
const ROTATION_TOLERANCE_DEGREES = 1;
const MINUS_90_ABOUT_X: Quat = [-Math.SQRT1_2, 0, 0, Math.SQRT1_2];

function near(value: number, target: number): boolean {
  return Math.abs(value / target - 1) < SCALE_TOLERANCE;
}

function uniformScale(scale: readonly number[]): number | null {
  for (const target of [100, 0.01]) {
    if (scale.every((component) => near(Math.abs(component), target))) return target;
  }
  return null;
}

function nearRotation(a: Quat, b: Quat): boolean {
  const dot = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
  return dot > Math.cos((ROTATION_TOLERANCE_DEGREES * Math.PI) / 360);
}

function isRootOrArmature(nodes: readonly WireNode[], index: number): boolean {
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
export function rootTransformWarnings(nodes: readonly WireNode[], space: Space): ImportWarning[] {
  const warnings: ImportWarning[] = [];
  for (const [index, node] of nodes.entries()) {
    if (!isRootOrArmature(nodes, index)) continue;
    const subject: ImportWarningSubject = { kind: "node", name: node.name };
    const scale = uniformScale(node.fileScale);
    if (scale !== null && !near(scale * space.unitMeters, 1)) {
      warnings.push(importWarning("root-scale", subject, `Root scale of ${scale} on ${node.name}`));
    }
    if (space.axes.up !== "+Y" && nearRotation(node.fileRotation, MINUS_90_ABOUT_X)) {
      warnings.push(importWarning("root-rotation", subject, `Root rotation of -90° about X on ${node.name}`));
    }
  }
  return warnings;
}
