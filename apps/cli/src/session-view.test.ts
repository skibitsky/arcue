import { viewNameSchema } from "@arcue/protocol";
import { describe, expect, it } from "vitest";
import { sessionView } from "./session-view";

const claude = "c3a1d6f0-8e2b-4b1c-9d7e-2f5a6b8c0e14";
const codexSession = "019a2b3c-4d5e-7f60-8a9b-0c1d2e3f4a5b";
const codexThread = "019a2b3c-9999-7f60-8a9b-0c1d2e3f4a5b";

describe("the session's view", () => {
  it("is null for a person at a terminal", () => {
    expect(sessionView({})).toBeNull();
    expect(sessionView({ ARCUE_VIEW: "", PATH: "/usr/bin" })).toBeNull();
  });

  it("hashes the session's identity into a short name a page's address takes", () => {
    const view = sessionView({ CLAUDE_CODE_SESSION_ID: claude });

    expect(view).toMatch(/^[0-9a-f]{12}$/);
    expect(viewNameSchema.parse(view)).toBe(view);
    expect(sessionView({ CLAUDE_CODE_SESSION_ID: claude })).toBe(view);
    expect(sessionView({ CLAUDE_CODE_SESSION_ID: codexSession })).not.toBe(view);
  });

  it("takes --view, then ARCUE_VIEW, Claude Code's session, Codex's session and Codex's thread", () => {
    const env = {
      ARCUE_VIEW: "mine",
      CLAUDE_CODE_SESSION_ID: claude,
      CODEX_SESSION_ID: codexSession,
      CODEX_THREAD_ID: codexThread,
    };
    const only = (value: string) => sessionView({}, value);

    expect(sessionView(env, "given")).toBe(only("given"));
    expect(sessionView(env)).toBe(only("mine"));
    expect(sessionView({ ...env, ARCUE_VIEW: undefined })).toBe(only(claude));
    expect(sessionView({ CODEX_SESSION_ID: codexSession, CODEX_THREAD_ID: codexThread })).toBe(only(codexSession));
    expect(sessionView({ CODEX_THREAD_ID: codexThread })).toBe(only(codexThread));
  });

  it("is the same for a subagent, which inherits its session's variables", () => {
    const parent = { CODEX_SESSION_ID: codexSession, CODEX_THREAD_ID: codexThread };
    const subagent = { CODEX_SESSION_ID: codexSession, CODEX_THREAD_ID: "019a2b3c-0000-7f60-8a9b-0c1d2e3f4a5b" };

    expect(sessionView(subagent)).toBe(sessionView(parent));
  });
});
