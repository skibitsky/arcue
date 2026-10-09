import type { Comment } from "@arcue/protocol";

const DIGITS = "0123456789abcdefghjkmnpqrstvwxyz";
const TIME_DIGITS = 10;
const RANDOM_DIGITS = 16;
const RANDOM_BYTES = 10;
const RANDOM_LIMIT = 1n << 80n;

/** Fills the bytes with random values. */
export type RandomFill = (bytes: Uint8Array<ArrayBuffer>) => void;

/**
 * Makes comment ids that two people working apart never both make: "c" and a lowercase ULID, such as
 * "c01m4gp93004tff59tdwh9edd1r". The first ten digits are the time in milliseconds and the other sixteen are random.
 * An id made in the same millisecond as the one before, or while the clock goes back, counts up from that one instead,
 * so the ids of one source sort in the order it made them.
 */
export class CommentIds {
  readonly #fill: RandomFill;
  #time = -1;
  #random = 0n;

  constructor(fill: RandomFill = (bytes) => crypto.getRandomValues(bytes)) {
    this.#fill = fill;
  }

  next(nowMs: number): string {
    const now = Math.max(0, Math.floor(nowMs));
    if (now > this.#time) {
      this.#time = now;
      this.#random = this.#randomValue();
    } else {
      this.#random += 1n;
      if (this.#random >= RANDOM_LIMIT) {
        this.#time += 1;
        this.#random = this.#randomValue();
      }
    }
    return `c${encode(BigInt(this.#time), TIME_DIGITS)}${encode(this.#random, RANDOM_DIGITS)}`;
  }

  #randomValue(): bigint {
    const bytes = new Uint8Array(RANDOM_BYTES);
    this.#fill(bytes);
    return bytes.reduce((value, byte) => (value << 8n) | BigInt(byte), 0n);
  }
}

function encode(value: bigint, digits: number): string {
  let text = "";
  let rest = value;
  for (let index = 0; index < digits; index++) {
    text = DIGITS.charAt(Number(rest & 31n)) + text;
    rest >>= 5n;
  }
  return text;
}

/** Orders comments by when they were made, then by id, so every copy of a review puts them in the same order. */
export function byCreation(a: Pick<Comment, "id" | "createdAt">, b: Pick<Comment, "id" | "createdAt">): number {
  const time = Date.parse(a.createdAt) - Date.parse(b.createdAt);
  if (time !== 0) return time;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
