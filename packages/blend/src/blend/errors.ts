/** The bytes are not a .blend file this reader understands; the message says why. */
export class BlendParseError extends Error {
  override readonly name = "BlendParseError";
}

/** The file is valid but nests deeper than the reader follows; the message says what, after the file's name. */
export class BlendLimitError extends Error {
  override readonly name = "BlendLimitError";
}

/**
 * Why a .blend file could not be read: it is not one this reader understands, Blender before 2.80 saved it, its scene
 * nests objects and bones too deep, or reading its scene failed.
 */
export type BlendReadErrorReason = "unreadable" | "too-old" | "too-deep" | "failed";

/** A .blend file that `readBlend` cannot read. */
export class BlendReadError extends Error {
  override readonly name = "BlendReadError";
  readonly reason: BlendReadErrorReason;
  /**
   * What the message says after its opening words: why the file is unreadable, such as "its file header is damaged",
   * the version of Blender that saved a file that is too old, such as "2.79", or how deep a scene nests.
   */
  readonly detail: string;

  constructor(reason: BlendReadErrorReason, message: string, detail: string, options?: ErrorOptions) {
    super(message, options);
    this.reason = reason;
    this.detail = detail;
  }
}
