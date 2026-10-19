import type { BlendStruct } from "../blend/file.js";
import { idName } from "../blend/ids.js";

/** The scene's name, the frame range its timeline plays and its time remapping. */
export interface SceneTimeline {
  name: string;
  start: number;
  end: number;
  /**
   * Blender's `framelen` from Time Stretching, the old frames over the new: the action frames one scene frame
   * advances, so a scene frame shows its actions at the frame times this.
   */
  frameLength: number;
}

/** The scene's time remapping, which scales every frame Blender evaluates: its `framelen`, or 1 where that is unusable. */
function frameLength(render: BlendStruct | null | undefined): number {
  const length = render?.number("framelen") ?? 1;
  return Number.isFinite(length) && length > 0 ? length : 1;
}

export function sceneTimeline(scene: BlendStruct | null): SceneTimeline {
  const render = scene?.struct("r");
  const start = render?.number("sfra") ?? 1;
  return {
    name: scene ? idName(scene) : "",
    start,
    end: render?.number("efra") ?? start,
    frameLength: frameLength(render),
  };
}
