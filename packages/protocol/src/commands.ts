import { z } from "zod";
import { cameraAnchorSchema, frameRangeSchema, indexSchema, spatialAnchorSchema, timeSelectionSchema } from "./anchors";
import { assetIdSchema, bytesSchema, commentIdSchema } from "./assets";
import { memberRoleSchema, textureSlotSchema } from "./composition";
import { computedContextSchema } from "./context";
import type { CommandDefinition } from "./definitions";
import { command } from "./definitions";
import { warningIdSchema, warningSubjectSchema } from "./import-warning";
import { settingsSchema } from "./settings";
import { displayModeSchema, partIdSchema, partViewSchema, viewStateSchema } from "./view-state";

const assetRef = { assetId: assetIdSchema };
const commentRef = { assetId: assetIdSchema, commentId: commentIdSchema };
const commentTextSchema = z.string().trim().min(1);
/** A clip's name in the file, such as "Armature|Charge". */
const clipNameSchema = z.string().min(1);
const versionIdSchema = z.string().min(1);
/** An absolute path, or one relative to the asset's composition file. */
const compositionMemberSchema = z.string().min(1);
const compositionOutput = z.object({
  /** The composition file the command wrote. */
  path: z.string().min(1),
});

export const commands = {
  "asset.open": command({
    description:
      'Open an asset in a tab, or focus its tab when it is already open. A ".arcue" composition file opens its model with the files it lists. Optionally show a clip, by its name in the file, and a frame.',
    runsIn: "core",
    input: z.object({
      path: z.string().min(1),
      clip: clipNameSchema.optional(),
      frame: indexSchema.optional(),
      /** The view to start from when the asset was not open yet, as a window restoring its tabs passes it. */
      viewState: viewStateSchema.optional(),
    }),
    output: z.object({ assetId: assetIdSchema }),
  }),
  "asset.close": command({
    description: "Close an asset's tab. Its review data stays on disk.",
    runsIn: "core",
    input: z.object(assetRef),
    output: z.void(),
  }),
  "asset.reload": command({
    description:
      "Parse the asset file and its composition's files again and swap in the new version. The previous version stays if parsing fails.",
    runsIn: "core",
    input: z.object(assetRef),
    output: z.object({ version: z.string() }),
  }),
  "comment.create": command({
    description: "Add a draft comment to the end of the asset's queue.",
    runsIn: "core",
    input: z.object({
      ...assetRef,
      text: commentTextSchema,
      /** The asset version the target and time were picked on. The core rejects a version that is no longer current. */
      version: versionIdSchema,
      time: timeSelectionSchema,
      target: spatialAnchorSchema.nullable(),
      camera: cameraAnchorSchema,
      context: computedContextSchema,
      screenshot: bytesSchema.nullable(),
      /** The parts the view showed. The core stores it only when it differs from the default view. */
      parts: partViewSchema.optional(),
    }),
    output: z.object({ commentId: commentIdSchema }),
  }),
  "comment.update": command({
    description:
      "Edit a draft comment. Fields left out keep their values. A change of time or target must bring a new context and screenshot, and the version they were picked on.",
    runsIn: "core",
    input: z
      .object({
        ...commentRef,
        text: commentTextSchema.optional(),
        version: versionIdSchema.optional(),
        time: timeSelectionSchema.optional(),
        target: spatialAnchorSchema.nullable().optional(),
        camera: cameraAnchorSchema.optional(),
        context: computedContextSchema.optional(),
        screenshot: bytesSchema.nullable().optional(),
        parts: partViewSchema.optional(),
      })
      .refine(
        (input) =>
          (input.time === undefined && input.target === undefined) ||
          (input.context !== undefined && input.screenshot !== undefined && input.version !== undefined),
        { message: "A new time or target needs a new context, screenshot and version.", path: ["context"] },
      ),
    output: z.void(),
  }),
  "comment.delete": command({
    description: "Delete a draft comment.",
    runsIn: "core",
    input: z.object(commentRef),
    output: z.void(),
  }),
  "comment.resolve": command({
    description: "Mark a sent comment resolved: the new export fixed it.",
    runsIn: "core",
    input: z.object(commentRef),
    output: z.void(),
  }),
  "comment.reopen": command({
    description: "Return a sent or resolved comment to the queue with a follow-up message.",
    runsIn: "core",
    input: z.object({ ...commentRef, text: commentTextSchema }),
    output: z.void(),
  }),
  "comment.createFromWarning": command({
    description:
      "Add a draft comment about an import warning, by its id from warning.list. Its text starts as the warning's message, and the prompt names the warning and its subject.",
    runsIn: "core",
    input: z.object({ ...assetRef, warningId: warningIdSchema }),
    output: z.object({ commentId: commentIdSchema }),
  }),
  "warning.dismiss": command({
    description:
      "Dismiss an import warning on this asset, by its id from warning.list. It stays dismissed across reloads; review.undo brings it back.",
    runsIn: "core",
    input: z.object({ ...assetRef, warningId: warningIdSchema }),
    output: z.void(),
  }),
  "warning.dismissAll": command({
    description: "Dismiss every import warning warning.list shows for the asset. review.undo brings them back.",
    runsIn: "core",
    input: z.object(assetRef),
    output: z.void(),
  }),
  "round.copy": command({
    description: "Save the asset's queue as the next round, mark its comments sent, and copy the prompt.",
    runsIn: "core",
    input: z.object(assetRef),
    output: z.object({
      round: z.int().positive(),
      prompt: z.string(),
      copiedToClipboard: z.boolean(),
    }),
  }),
  "composition.addFile": command({
    description:
      "Load another file into the asset's view and save it in the asset's composition file, which is created beside the model when there is none. An animation file's clips bind to the model's bones by name. An attached file, or one node of it, follows a bone of the model. A set file stays in place, and its bones merge into the model's bones of the same name, so a skinned mesh binds to the rig. Without a role the core reads the file: clips and no meshes make an animation file, meshes a set file. Adding a file again with the same node replaces its entry. Undo with review.undo.",
    runsIn: "core",
    input: z
      .object({
        ...assetRef,
        file: compositionMemberSchema,
        role: memberRoleSchema.optional(),
        /** A node's name or path in the file, for "attach" and "set". Without it the whole file comes along. */
        node: z.string().min(1).optional(),
        /** The model's bone that an "attach" file follows. */
        bone: z.string().min(1).optional(),
      })
      .refine((input) => (input.role === "attach") === (input.bone !== undefined), {
        message: 'An "attach" file needs a bone, and only it takes one.',
        path: ["bone"],
      })
      .refine((input) => (input.role ?? "animation") !== "animation" || input.node === undefined, {
        message: "An animation file, or a file without a role, takes no node.",
        path: ["node"],
      }),
    output: compositionOutput.extend({ role: memberRoleSchema }),
  }),
  "composition.removeFile": command({
    description:
      'Remove a file from the asset\'s view and from its composition file. Files named "<model>@<clip>.fbx" beside the model join by their name and cannot be removed this way. Undo with review.undo.',
    runsIn: "core",
    input: z.object({ ...assetRef, file: compositionMemberSchema }),
    output: compositionOutput,
  }),
  "composition.attachFile": command({
    description:
      "Attach a file of the asset's composition to a bone of the model, or detach it with a null bone, which leaves it in place as a set piece. Without node every attached entry of the file moves; with node only the entry for that node. Saves the change in the composition file. Undo with review.undo.",
    runsIn: "core",
    input: z.object({
      ...assetRef,
      file: compositionMemberSchema,
      /** A node's name or path in the file, naming one of the file's entries. */
      node: z.string().min(1).optional(),
      /** A bone's name or path in the model, or null for a set piece. */
      bone: z.string().min(1).nullable(),
    }),
    output: compositionOutput,
  }),
  "material.setTexture": command({
    description:
      "Show a texture in a material slot of the asset, in place of what the model's file says, and save it in the composition file. A null file removes the override. scene.materials lists the slots. Undo with review.undo.",
    runsIn: "core",
    input: z.object({
      ...assetRef,
      /** The material's name in the file. */
      material: z.string().min(1),
      slot: textureSlotSchema,
      file: compositionMemberSchema.nullable(),
    }),
    output: compositionOutput,
  }),
  "settings.set": command({
    description: "Change app settings. Fields left out keep their values. Returns the settings now in effect.",
    runsIn: "core",
    input: settingsSchema.partial(),
    output: settingsSchema,
  }),
  "review.undo": command({
    description:
      "Undo the asset's latest review edit, if there is one: a comment edit or a change to its composition file. A composition file that changed since the edit is not touched, and the call fails with conflict.",
    runsIn: "core",
    input: z.object(assetRef),
    output: z.object({ changed: z.boolean() }),
  }),
  "review.redo": command({
    description:
      "Redo the asset's latest undone review edit, if there is one. A composition file that changed since the undo is not touched, and the call fails with conflict.",
    runsIn: "core",
    input: z.object(assetRef),
    output: z.object({ changed: z.boolean() }),
  }),
  "view.reportState": command({
    description: "A window reports what it shows for an asset, so the core can restore the view after a crash.",
    runsIn: "core",
    internal: true,
    input: z.object({ ...assetRef, state: viewStateSchema }),
    output: z.void(),
  }),
  "view.reportFocus": command({
    description:
      "A window reports that it gained focus. The core shows newly opened assets in the window focused last.",
    runsIn: "core",
    internal: true,
    input: z.object({}),
    output: z.void(),
  }),
  "view.showAsset": command({
    description:
      "Show an asset in a tab of this window, at a clip and frame if given. The core sends it to one window before announcing the asset.",
    runsIn: "view",
    internal: true,
    input: z.object({ ...assetRef, clip: clipNameSchema.optional(), frame: indexSchema.optional() }),
    output: z.void(),
  }),
  "view.moveAsset": command({
    description:
      "Move an asset's tab from the window that shows it to the calling window, with its camera, clip and frame.",
    runsIn: "core",
    internal: true,
    input: z.object(assetRef),
    output: z.void(),
  }),
  "view.releaseAsset": command({
    description:
      "Remove an asset's tab from this window without closing the asset, and return what the tab showed. The core sends it before moving the tab to another window.",
    runsIn: "view",
    internal: true,
    input: z.object(assetRef),
    output: viewStateSchema.nullable(),
  }),
  "view.setClip": command({
    description: "Show a clip by its name in the file, or the rest pose when clip is null.",
    runsIn: "view",
    input: z.object({ ...assetRef, clip: clipNameSchema.nullable() }),
    output: z.void(),
  }),
  "view.setFrame": command({
    description: "Move the playhead to a frame of the current clip.",
    runsIn: "view",
    input: z.object({ ...assetRef, frame: indexSchema }),
    output: z.void(),
  }),
  "view.setPlaying": command({
    description: "Play or pause the current clip.",
    runsIn: "view",
    input: z.object({ ...assetRef, playing: z.boolean() }),
    output: z.void(),
  }),
  "view.setSpeed": command({
    description: "Set the playback speed, from 0.25 to 2.",
    runsIn: "view",
    input: z.object({ ...assetRef, speed: z.number().min(0.25).max(2) }),
    output: z.void(),
  }),
  "view.setLoop": command({
    description: "Loop playback at the end of the clip, or stop there.",
    runsIn: "view",
    input: z.object({ ...assetRef, loop: z.boolean() }),
    output: z.void(),
  }),
  "view.setRange": command({
    description: "Select a frame range of the current clip, or clear it. Playback loops inside the range.",
    runsIn: "view",
    input: z.object({ ...assetRef, range: frameRangeSchema.nullable() }),
    output: z.void(),
  }),
  "view.setCamera": command({
    description: "Move the camera.",
    runsIn: "view",
    input: z.object({ ...assetRef, camera: cameraAnchorSchema, animate: z.boolean().default(true) }),
    output: z.void(),
  }),
  "view.frame": command({
    description: "Fit the model in the view, or a comment's target when commentId is given.",
    runsIn: "view",
    input: z.object({ ...assetRef, commentId: commentIdSchema.nullable().default(null) }),
    output: z.void(),
  }),
  "view.setDisplayMode": command({
    description: "Show the model lit, as clay or as wireframe.",
    runsIn: "view",
    input: z.object({ ...assetRef, mode: displayModeSchema }),
    output: z.void(),
  }),
  "view.setSkeleton": command({
    description: "Show or hide the skeleton overlay.",
    runsIn: "view",
    input: z.object({ ...assetRef, visible: z.boolean() }),
    output: z.void(),
  }),
  "view.setPartVisible": command({
    description:
      "Show or hide a part by its id from scene.parts. Collision helpers are hidden until shown; sockets draw no mesh. While a part is isolated, the other parts stay as they are on screen and the isolation ends.",
    runsIn: "view",
    input: z.object({ ...assetRef, part: partIdSchema, visible: z.boolean() }),
    output: z.void(),
  }),
  "view.isolatePart": command({
    description: "Show only one part, by its id from scene.parts, or every part again when part is null.",
    runsIn: "view",
    input: z.object({ ...assetRef, part: partIdSchema.nullable() }),
    output: z.void(),
  }),
  "view.setLod": command({
    description: "Show a LOD level. A part without that level shows its nearest lower one.",
    runsIn: "view",
    input: z.object({ ...assetRef, level: indexSchema }),
    output: z.void(),
  }),
  "view.setOutlineOpen": command({
    description:
      "Open or close the outline drawer, which lists the model's files, bones and parts. It shows only for models with parts or added files to list.",
    runsIn: "view",
    input: z.object({ ...assetRef, open: z.boolean() }),
    output: z.void(),
  }),
  "view.highlightSubject": command({
    description:
      "Tint what an import warning is about in the 3D view: a material's meshes, the meshes of the materials that use a texture, a node's meshes, or a file's meshes. Null clears the tint.",
    runsIn: "view",
    input: z.object({ ...assetRef, subject: warningSubjectSchema.nullable() }),
    output: z.void(),
  }),
  "view.selectComment": command({
    description:
      "Select a comment, jump to its time and restore its camera and the parts it showed. Null clears the selection.",
    runsIn: "view",
    input: z.object({ ...assetRef, commentId: commentIdSchema.nullable() }),
    output: z.void(),
  }),
  "view.screenshot": command({
    description:
      "Render a PNG of the asset at a time and camera, by default the ones on screen. A range renders its start frame.",
    runsIn: "view",
    input: z.object({
      ...assetRef,
      width: z.int().min(16).max(4096).default(1280),
      height: z.int().min(16).max(4096).default(720),
      time: timeSelectionSchema.optional(),
      camera: cameraAnchorSchema.optional(),
      drawComments: z.boolean().default(false),
    }),
    output: z.object({ png: bytesSchema }),
  }),
} satisfies Record<string, CommandDefinition>;

export type Commands = typeof commands;
export type CommandName = keyof Commands;
/** What a caller passes; defaults are not applied yet. */
export type CommandInput<Name extends CommandName> = z.input<Commands[Name]["input"]>;
/** What a handler receives: the input after validation and defaults. */
export type CommandArgs<Name extends CommandName> = z.output<Commands[Name]["input"]>;
export type CommandOutput<Name extends CommandName> = z.output<Commands[Name]["output"]>;

export function isCommandName(name: string): name is CommandName {
  return Object.hasOwn(commands, name);
}
