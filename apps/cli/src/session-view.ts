import { createHash } from "node:crypto";

/**
 * The environment variables that name the agent session a command runs for, in the order they are taken. Codex sets
 * CODEX_SESSION_ID to its conversation's root thread, which the conversation's subagents share; releases before it set
 * only CODEX_THREAD_ID, which differs for each subagent.
 */
export const SESSION_VARIABLES = [
  "ARCUE_VIEW",
  "CLAUDE_CODE_SESSION_ID",
  "CODEX_SESSION_ID",
  "CODEX_THREAD_ID",
] as const;

/**
 * The view of the agent session a command runs for: the first of `--view` and the session variables that is set,
 * hashed into a short name. Subagents inherit the variables, so they reach their session's view. Null when none is set,
 * as for a person at a terminal.
 */
export function sessionView(env: NodeJS.ProcessEnv, given?: string): string | null {
  const identity = [given, ...SESSION_VARIABLES.map((name) => env[name])].find(
    (value) => value !== undefined && value !== "",
  );
  if (identity === undefined) return null;
  return createHash("sha256").update(identity).digest("hex").slice(0, 12);
}

/** A copy of the environment without the variables that name an agent session, for a process that belongs to none. */
export function outsideSessions(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const copy: NodeJS.ProcessEnv = { ...env };
  for (const name of SESSION_VARIABLES) delete copy[name];
  return copy;
}
