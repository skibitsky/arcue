import { z } from "zod";

/** Who made a comment, a follow-up or a round: the name a person or an agent gave Arcue. */
export const authorSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

export type Author = z.output<typeof authorSchema>;
