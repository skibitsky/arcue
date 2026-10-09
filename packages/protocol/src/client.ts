import type { CommandInput, CommandName, CommandOutput } from "./commands";
import type { EventName, EventPayload } from "./events";
import type { QueryInput, QueryName, QueryOutput } from "./queries";

export type Unsubscribe = () => void;

/**
 * "connected" while calls can reach the core; "reconnecting" while a host restores a lost connection, such as a window
 * waiting for a restarted core; "closed" once the connection is gone for good.
 */
export type ConnectionState = "connected" | "reconnecting" | "closed";

/**
 * How every caller talks to the core: the UI, the command line, tests and the later MCP server.
 * Calls reject with an `ArcueError`.
 */
export interface CoreClient {
  execute<Name extends CommandName>(name: Name, input: CommandInput<Name>): Promise<CommandOutput<Name>>;
  query<Name extends QueryName>(name: Name, input: QueryInput<Name>): Promise<QueryOutput<Name>>;
  subscribe<Name extends EventName>(name: Name, listener: (payload: EventPayload<Name>) => void): Unsubscribe;
  readonly connectionState: ConnectionState;
  /** Calls the listener on every change of `connectionState`. */
  onConnectionChange(listener: (state: ConnectionState) => void): Unsubscribe;
}
