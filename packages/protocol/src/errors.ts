export type ErrorCode =
  | "unknown-command"
  | "invalid-input"
  | "forbidden"
  | "not-found"
  | "conflict"
  | "unavailable"
  | "disconnected"
  | "timeout"
  | "internal";

export interface ValidationIssue {
  path: (string | number)[];
  message: string;
}

/** An error as it crosses a process boundary. */
export interface WireError {
  code: ErrorCode;
  message: string;
  issues: ValidationIssue[];
}

export interface ArcueErrorOptions {
  issues?: ValidationIssue[];
  cause?: unknown;
}

export class ArcueError extends Error {
  override readonly name = "ArcueError";
  readonly code: ErrorCode;
  readonly issues: ValidationIssue[];

  constructor(code: ErrorCode, message: string, options: ArcueErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.code = code;
    this.issues = options.issues ?? [];
  }
}

export function toWireError(error: unknown): WireError {
  if (error instanceof ArcueError) return { code: error.code, message: error.message, issues: error.issues };
  const message = error instanceof Error ? error.message : String(error);
  return { code: "internal", message, issues: [] };
}

export function fromWireError(error: WireError): ArcueError {
  return new ArcueError(error.code, error.message, { issues: error.issues });
}
