import type { ArcueUfbxModule } from "../wasm/arcue-ufbx.js";
import createArcueUfbx from "../wasm/arcue-ufbx.js";
import type { ParsedFbx } from "./decode";
import { FbxParseError, readResult } from "./decode";

let loading: Promise<ArcueUfbxModule> | null = null;

function loadParser(): Promise<ArcueUfbxModule> {
  loading ??= createArcueUfbx().catch((error: unknown) => {
    loading = null;
    throw error;
  });
  return loading;
}

/**
 * Parses FBX bytes with ufbx in WebAssembly and copies the result out of its memory. Rejects with `FbxParseError` when
 * ufbx rejects the file, including when it exceeds the parser's memory limit. Any other failure, such as the module
 * running out of memory, discards the module so the next call starts a fresh one.
 */
export async function parseFbx(bytes: Uint8Array): Promise<ParsedFbx> {
  const parser = await loadParser();
  try {
    const input = parser._malloc(Math.max(bytes.byteLength, 1)) >>> 0;
    if (input === 0) throw new RangeError(`it could not allocate ${bytes.byteLength} bytes for the file`);
    parser.HEAPU8.set(bytes, input);
    const output = parser._arcue_import(input, bytes.byteLength) >>> 0;
    parser._free(input);
    try {
      return readResult(parser.HEAPU8, output);
    } finally {
      parser._arcue_free(output);
    }
  } catch (error) {
    if (error instanceof FbxParseError) throw error;
    loading = null;
    if (error instanceof Error && error.message.startsWith("Aborted")) {
      throw new Error("it ran out of memory", { cause: error });
    }
    throw error;
  }
}
