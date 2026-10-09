import type { WireError } from "../errors";

export type RequestKind = "command" | "query";

export interface RequestEnvelope {
  type: "request";
  id: number;
  kind: RequestKind;
  name: string;
  input: unknown;
}

export type ResponseEnvelope =
  | { type: "response"; id: number; ok: true; output: unknown }
  | { type: "response"; id: number; ok: false; error: WireError };

export interface EventEnvelope {
  type: "event";
  name: string;
  payload: unknown;
}

/** Every message on an Arcue channel. Request ids are unique per sender; a response carries its request's id. */
export type Envelope = RequestEnvelope | ResponseEnvelope | EventEnvelope;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isEnvelope(value: unknown): value is Envelope {
  if (!isRecord(value)) return false;
  switch (value.type) {
    case "request":
      return (
        typeof value.id === "number" &&
        (value.kind === "command" || value.kind === "query") &&
        typeof value.name === "string"
      );
    case "response":
      return typeof value.id === "number" && (value.ok === true || (value.ok === false && isRecord(value.error)));
    case "event":
      return typeof value.name === "string";
    default:
      return false;
  }
}
