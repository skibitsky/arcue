import type { z } from "zod";

/** Where a command runs. The core routes "view" commands to the window that shows the asset. */
export type Runner = "core" | "view";

export interface CommandDefinition<Input extends z.ZodType = z.ZodType, Output extends z.ZodType = z.ZodType> {
  description: string;
  runsIn: Runner;
  /**
   * True for commands that only pass between the core and its windows. The command line and MCP cannot call them,
   * and `protocolJsonSchemas` leaves them out.
   */
  internal?: true;
  input: Input;
  output: Output;
}

export interface QueryDefinition<Input extends z.ZodType = z.ZodType, Output extends z.ZodType = z.ZodType> {
  description: string;
  input: Input;
  output: Output;
}

export interface EventDefinition<Payload extends z.ZodType = z.ZodType> {
  description: string;
  payload: Payload;
}

export function command<Input extends z.ZodType, Output extends z.ZodType>(
  definition: CommandDefinition<Input, Output>,
): CommandDefinition<Input, Output> {
  return definition;
}

export function query<Input extends z.ZodType, Output extends z.ZodType>(
  definition: QueryDefinition<Input, Output>,
): QueryDefinition<Input, Output> {
  return definition;
}

export function event<Payload extends z.ZodType>(definition: EventDefinition<Payload>): EventDefinition<Payload> {
  return definition;
}
