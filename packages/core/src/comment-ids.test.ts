import { commentIdSchema } from "@arcue/protocol";
import { describe, expect, it } from "vitest";
import { byCreation, CommentIds } from "./comment-ids";

const AT = Date.UTC(2026, 9, 9, 16);

describe("CommentIds", () => {
  it("makes a c and a lowercase ULID whose first ten digits are the time", () => {
    const ids = new CommentIds((bytes) => bytes.fill(0));
    const id = ids.next(AT);
    expect(id).toBe(`c01m4gp9300${"0".repeat(16)}`);
    expect(commentIdSchema.safeParse(id).success).toBe(true);
  });

  it("makes different ids from different random bytes at the same time", () => {
    const first = new CommentIds((bytes) => bytes.fill(1)).next(AT);
    const second = new CommentIds((bytes) => bytes.fill(2)).next(AT);
    expect(first).not.toBe(second);
    expect(first.slice(0, 11)).toBe(second.slice(0, 11));
  });

  it("counts up within one millisecond and while the clock goes back, so ids sort in the order they were made", () => {
    let fills = 0;
    const ids = new CommentIds((bytes) => {
      fills++;
      bytes.fill(200 - fills);
    });
    const made = [ids.next(AT), ids.next(AT), ids.next(AT - 5000), ids.next(AT + 1)];
    expect([...made].sort()).toEqual(made);
    expect(new Set(made).size).toBe(4);
    expect(fills).toBe(2);
  });

  it("moves to the next millisecond when counting up would overflow the random digits", () => {
    const ids = new CommentIds((bytes) => bytes.fill(0xff));
    const first = ids.next(AT);
    const second = ids.next(AT);
    expect(first.endsWith("zzzzzzzzzzzzzzzz")).toBe(true);
    expect(second > first).toBe(true);
    expect(commentIdSchema.safeParse(second).success).toBe(true);
  });

  it("uses random bytes by default", () => {
    const ids = new CommentIds();
    const first = ids.next(AT);
    expect(new CommentIds().next(AT)).not.toBe(first);
  });
});

describe("byCreation", () => {
  it("orders by creation time, then by id, however the time is written", () => {
    const first = { id: "c1", createdAt: "2026-10-08T14:02:00Z" };
    const sameTime = { id: "c2", createdAt: "2026-10-08T14:02:00.000Z" };
    const late = { id: "c0", createdAt: "2026-10-08T14:03:00.000Z" };
    expect([late, sameTime, first].sort(byCreation)).toEqual([first, sameTime, late]);
  });
});
