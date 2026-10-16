/** The bytes are not a .blend file this reader understands; the message says why. */
export class BlendParseError extends Error {
  override readonly name = "BlendParseError";
}

/** The file is valid but holds more than Arcue can show; the message says what, after the file's name. */
export class BlendLimitError extends Error {
  override readonly name = "BlendLimitError";
}
