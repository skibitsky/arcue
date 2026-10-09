import { z } from "zod";
import { bytesSchema } from "./assets";
import { commands } from "./commands";
import type { CommandDefinition, QueryDefinition } from "./definitions";
import { queries, sceneDescriptionSchema } from "./queries";

export type JsonSchema = z.core.JSONSchema.BaseSchema;

export interface JsonSchemaEntry {
  kind: "command" | "query";
  description: string;
  input: JsonSchema;
  output: JsonSchema;
}

/**
 * JSON Schemas for every command and query that the command line and MCP may call, which leaves out internal commands.
 * The MessagePort and Worker transports carry bytes as Uint8Array; over JSON, bytes are base64 strings and a void
 * result is null, and the bridge converts values the same way. Scene data has no JSON form.
 */
export function protocolJsonSchemas(): Record<string, JsonSchemaEntry> {
  const entries: Record<string, JsonSchemaEntry> = {};
  const add = (kind: JsonSchemaEntry["kind"], name: string, definition: CommandDefinition | QueryDefinition) => {
    entries[name] = {
      kind,
      description: definition.description,
      input: toJsonSchema(definition.input, "input"),
      output: toJsonSchema(definition.output, "output"),
    };
  };
  for (const [name, definition] of Object.entries(commands)) {
    if (!isInternal(definition)) add("command", name, definition);
  }
  for (const [name, definition] of Object.entries(queries)) add("query", name, definition);
  return entries;
}

function isInternal(definition: CommandDefinition): boolean {
  return definition.internal === true;
}

function toJsonSchema(schema: z.ZodType, io: "input" | "output"): JsonSchema {
  return z.toJSONSchema(schema, {
    io,
    unrepresentable: ({ zodSchema }) => {
      if (zodSchema === bytesSchema) return { type: "string", contentEncoding: "base64" };
      if (zodSchema === sceneDescriptionSchema) return { type: "object", description: "Scene data; no JSON form." };
      if (zodSchema._zod.def.type === "void") return { type: "null" };
      return "throw";
    },
  });
}
