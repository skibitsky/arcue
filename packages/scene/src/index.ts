export type { CameraAnchor, IndexRange, RegionAnchor, SpatialAnchor, SurfaceAnchor, TimeAnchor } from "./anchor";
export type { Clip, Interpolation, Track, TrackProperty } from "./clip";
export { cleanClipName, clipNames, displayNames, UNNAMED_CLIP } from "./clip";
export type { Composition, CompositionAttachment, CompositionMember, CompositionTexture } from "./composition";
export { composeScene, findNode, MEMBER_SEPARATOR, memberPath, splitMemberPath } from "./composition";
export type { TopologyFingerprint, TopologyInput } from "./fingerprint";
export { sameTopology, topologyFingerprint } from "./fingerprint";
export type { Barycentric, NearestVertex, SurfacePoint } from "./geometry";
export { closestPointOnTriangle, closestSurfacePoint, nearestVertex, sourceIndices } from "./geometry";
export { fileNameOf, imageMimeType } from "./image";
export type { FoundFile, Importer, ImportRequest, StoredPath } from "./importer";
export { findImporter, parseStoredPath } from "./importer";
export type {
  AlphaMode,
  Material,
  Texture,
  TextureOverride,
  TextureRef,
  TextureSlot,
  UvTransform,
  WrapMode,
} from "./material";
export { TEXTURE_SLOTS } from "./material";
export type { MaterialSlot, MaterialSlots, SlotState } from "./material-slots";
export { materialSlots, missingSlots } from "./material-slots";
export type { Bounds, Quat, Vec3, Vec4 } from "./math";
export { boundsOfPoints } from "./math";
export type { MaterialGroup, Mesh, MorphTarget, SkinWeights, UvSet } from "./mesh";
export type { NamedNode, NodeKind, SceneNode } from "./node";
export { buildNodePaths, UNNAMED_NODE } from "./node";
export type { PartLevel, PartNode, PartRole, PartView, ScenePart } from "./parts";
export {
  defaultPartView,
  defaultViewBounds,
  describeParts,
  isDefaultPartView,
  isolationAsVisibility,
  knownPartView,
  levelFor,
  lodLevels,
  partRoleOf,
  partShown,
  shownByDefault,
  viewBounds,
  visibleMeshes,
  withPartVisible,
} from "./parts";
export { countInRanges, decodeRanges, encodeRanges, rangesContain, rangesWithin } from "./ranges";
export type { SceneDescription } from "./scene";
export { collectTransferables } from "./scene";
export type { Skeleton } from "./skeleton";
export type {
  AxisDirection,
  CoordinateAxes,
  Exporter,
  ImportWarning,
  ImportWarningCode,
  ImportWarningExtra,
  ImportWarningSeverity,
  ImportWarningSubject,
  ImportWarningSubjectKind,
  SourceFormat,
  SourceInfo,
  Space,
  SpaceConversion,
  TextureUse,
} from "./source";
export { describeTextureUses, importWarning, importWarningSeverity, SCENE_SPACE } from "./source";
export type { SubjectRef } from "./subject";
export { subjectMeshes } from "./subject";
export {
  frameCountFor,
  frameToSeconds,
  isKeyedEveryFrame,
  lastFrame,
  mergeKeyTimes,
  secondsToFrame,
} from "./time";
