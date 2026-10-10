import type { ComputedContext, DisplayMode, TimeSelection } from "@arcue/protocol";
import type {
  CameraAnchor,
  PartView,
  RegionAnchor,
  SceneDescription,
  SpatialAnchor,
  SurfaceAnchor,
} from "@arcue/scene";

export type ToolId = "view" | "comment";

export type OverlayState = "draft" | "sent" | "resolved";

/** A comment drawn in the view: a pin for a surface anchor, a tinted area plus a pin for a region. */
export interface CommentOverlay {
  /** The comment id, or an id the UI picks for the comment being written. */
  id: string;
  /** The comment's queue number shown on its pin; null shows no number. */
  number: number | null;
  state: OverlayState;
  anchor: SpatialAnchor;
  /** A selected region is the one that Shift strokes add to and Ctrl or Cmd strokes erase from. */
  selected: boolean;
  /** The comment is still being written: drawn in the feedback color whatever its state, without a number, pulsing. */
  pending?: boolean;
}

export interface ViewportOptions {
  /** The element the view fills. The view adds its canvas and an overlay layer for pins and the brush. */
  container: HTMLElement;
  /** Upper limit for the device pixel ratio; defaults to 2. */
  maxPixelRatio?: number;
}

/** Seconds from the start of the clip. */
export interface PlaybackRange {
  start: number;
  end: number;
}

export interface ScreenshotOptions {
  width: number;
  height: number;
  /** Defaults to the camera on screen. */
  camera?: CameraAnchor;
  /** Defaults to the clip and time on screen. A range renders its start frame. */
  time?: TimeSelection;
  /** Comments to draw. Pins are drawn without numbers, so a saved image stays right when the queue is renumbered. */
  overlays?: readonly CommentOverlay[];
}

export interface ViewportEvents {
  /** A click on the model with the Comment tool. */
  pinPlaced: { anchor: SurfaceAnchor };
  /**
   * A finished brush stroke. `overlayId` is null for a new region, or names the selected region that a Shift or
   * Ctrl/Cmd stroke changed. `anchor` is null when the stroke erased the whole region.
   */
  regionPainted: { overlayId: string | null; anchor: RegionAnchor | null };
  /** The surface under the cursor, or null when the cursor is off the model. */
  hover: { anchor: SurfaceAnchor | null };
  overlayClicked: { id: string };
  /** A click on empty space, which deselects. */
  emptyClicked: Record<string, never>;
  /** The time on screen, sent while playing and after every change. */
  time: { seconds: number; playing: boolean };
  /**
   * The camera moved, by the user or by an animation, sent on every rendered frame while it moves.
   * The UI uses it with `screenPosition` to keep the comment box beside its pin.
   */
  cameraChange: { camera: CameraAnchor };
  /**
   * The browser took the view's graphics context away, as after a GPU reset. The view draws nothing until the context
   * comes back, then rebuilds itself and sends `contextRestored`.
   */
  contextLost: Record<string, never>;
  contextRestored: Record<string, never>;
}

export type ViewportEventName = keyof ViewportEvents;

/** Where an anchor's point is on screen, in CSS pixels from the container's top left. */
export interface ScreenPosition {
  x: number;
  y: number;
  /** False when the surface faces away or something hides it. */
  visible: boolean;
}

/**
 * The 3D view of one asset. It renders only while something changes: camera motion, playback or painting.
 * Clips are named by their name in the file; null means the rest pose, which is the bind pose.
 *
 * The UI calls the viewport directly for actions local to the view, such as orbiting, scrubbing or switching the
 * display mode, and reports the result to the core with "view.reportState", debounced. The window runs the "view.*"
 * commands with runsIn "view" against its viewport: "view.showAsset" comes from the core itself, and the others are
 * requests from the command line, MCP or tests that the core forwards. Times are selections by clip name in the file;
 * a stored `TimeAnchor` is one too.
 */
export interface Viewport {
  /**
   * Resolves once textures are decoded and the first frame is drawn. Replacing a scene, as on reload after an
   * export, keeps the camera, keeps the clip when the new scene has a clip of that name and shows the rest pose
   * otherwise, and clamps the time to the clip's length.
   */
  setScene(scene: SceneDescription | null): Promise<void>;
  setClip(clip: string | null): void;
  setTime(seconds: number): void;
  setPlaying(playing: boolean): void;
  /** Inactive views freeze playback and stop automatic drawing; explicit queries and screenshots still work. */
  setActive(active: boolean): void;
  /** From 0.25 to 2. */
  setSpeed(speed: number): void;
  setLoop(loop: boolean): void;
  /** Playback loops inside the range; null plays the whole clip. */
  setPlaybackRange(range: PlaybackRange | null): void;
  setDisplayMode(mode: DisplayMode): void;
  setSkeletonVisible(visible: boolean): void;
  /**
   * Which parts to draw, LOD0 without collision helpers by default. Hidden parts are left out of picking, painting,
   * pins, framing, screenshots and `computeContext`. The view keeps it across `setScene`.
   */
  setPartView(view: PartView): void;
  setTool(tool: ToolId): void;
  /** Brush radius in CSS pixels. */
  setBrushSize(radius: number): void;
  getCamera(): CameraAnchor;
  setCamera(camera: CameraAnchor, options?: { animate?: boolean }): void;
  /** Fits the posed model, or the given target, keeping the view direction. */
  frame(target?: SpatialAnchor | null, options?: { animate?: boolean }): void;
  /** Replaces every drawn comment. */
  setOverlays(overlays: readonly CommentOverlay[]): void;
  /**
   * Tints whole meshes, by node path, in the warnings' amber under any painted region, as when pointing at an import
   * warning. Null or an empty list clears the tint. Unknown paths are ignored, and the paths survive `setScene`.
   */
  setHighlight(meshes: readonly string[] | null): void;
  /**
   * Where the anchor's point is on screen in the current pose, or null when it is off screen or not in the scene.
   * A region's point is its posed centroid, the same point as `context.centroid.posed`.
   */
  screenPosition(anchor: SpatialAnchor): ScreenPosition | null;
  on<Name extends ViewportEventName>(name: Name, listener: (payload: ViewportEvents[Name]) => void): () => void;
  /**
   * Bones, positions and joints for a target at a time, and a view label for the current camera.
   * A range is evaluated at its start frame.
   */
  computeContext(anchor: SpatialAnchor | null, time: TimeSelection): ComputedContext;
  /** PNG bytes. */
  screenshot(options: ScreenshotOptions): Promise<Uint8Array>;
  dispose(): void;
}

export type CreateViewport = (options: ViewportOptions) => Viewport;
