// The core and the importers run in Node processes and in browser workers. Their type-checks use only the
// ECMAScript library, so DOM and Node APIs fail to compile. These are the few host globals every runtime provides.

declare class TextEncoder {
  encode(input?: string): Uint8Array;
}

declare class TextDecoder {
  constructor(label?: string);
  decode(input?: Uint8Array): string;
}

type Transferable = object;

declare function structuredClone<Value>(value: Value, options?: { transfer?: Transferable[] }): Value;

declare const crypto: { getRandomValues<Bytes extends Uint8Array>(array: Bytes): Bytes };
