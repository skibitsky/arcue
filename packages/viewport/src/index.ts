import { ThreeViewport } from "./three-viewport";
import type { CreateViewport } from "./viewport";

export type {
  CommentOverlay,
  CreateViewport,
  OverlayState,
  PlaybackRange,
  ScreenPosition,
  ScreenshotOptions,
  ToolId,
  Viewport,
  ViewportEventName,
  ViewportEvents,
  ViewportOptions,
} from "./viewport";

/** Creates the three.js view of one asset inside `options.container`. */
export const createViewport: CreateViewport = (options) => new ThreeViewport(options);
