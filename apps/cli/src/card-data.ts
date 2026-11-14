/** What Arcue's card shows for a tool result, which the server puts in the result's `_meta` under this key. */
export const CARD_META_KEY = "arcue/card";

/** The card that `get_comments` and `inspect_model` render in apps that show MCP Apps. */
export const CARD_URI = "ui://arcue/card.html";

export type CardStatus = "draft" | "sent" | "resolved";

export interface CommentsCardData {
  card: "comments";
  /** The model file, absolute, for the card's own tool calls. */
  path: string;
  name: string;
  counts: Record<CardStatus, number>;
  /** How many comments wait in the model's queue. */
  queued: number;
  comments: CardComment[];
  /** The comments whose screenshots the result carries, in the order of its images. */
  screenshots: string[];
}

export interface CardComment {
  id: string;
  status: CardStatus;
  /** The latest message: the comment's text, or its last follow-up. */
  text: string;
  /** The clip and frame, such as "Walk, frame 12", or null for the rest pose. */
  moment: string | null;
  hasScreenshot: boolean;
}

export interface InspectionCardData {
  card: "inspection";
  path: string;
  name: string;
  /** Such as "FBX from Blender 4.2". */
  format: string;
  /** Meters. */
  height: number;
  triangles: number;
  meshes: { name: string; triangles: number; skinned: boolean }[];
  bones: number;
  materials: number;
  clips: { name: string; displayName: string; frames: number }[];
  warnings: { severity: "warning" | "error"; message: string }[];
  /** A prompt that asks an agent to fix the warnings, or null when there are none. */
  prompt: string | null;
}

export type CardData = CommentsCardData | InspectionCardData;
