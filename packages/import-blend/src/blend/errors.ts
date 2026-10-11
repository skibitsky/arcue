/** The bytes are not a .blend file this reader understands; the message says why. */
export class BlendParseError extends Error {
  override readonly name = "BlendParseError";
}
