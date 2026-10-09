import { indexSchema } from "@arcue/protocol";

export interface DeepLink {
  sample: string;
  clip?: string;
  frame?: number;
}

/** Reads `?sample=pebble-golem&clip=Armature%7CWalk&frame=12`. Returns null without a sample. */
export function parseDeepLink(search: string): DeepLink | null {
  const params = new URLSearchParams(search);
  const sample = params.get("sample");
  if (!sample) return null;
  const link: DeepLink = { sample };
  const clip = params.get("clip");
  if (clip) link.clip = clip;
  const frame = params.get("frame");
  if (frame && /^\d+$/.test(frame)) {
    const parsed = indexSchema.safeParse(Number(frame));
    if (parsed.success) link.frame = parsed.data;
  }
  return link;
}
