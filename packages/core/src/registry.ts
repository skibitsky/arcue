import type {
  CommandArgs,
  CommandDefinition,
  CommandInput,
  CommandName,
  CommandOutput,
  ConnectionState,
  CoreClient,
  EventName,
  EventPayload,
  QueryArgs,
  QueryDefinition,
  QueryInput,
  QueryName,
  QueryOutput,
  RequestKind,
  Unsubscribe,
  ValidationIssue,
} from "@arcue/protocol";
import { ArcueError, commands, isCommandName, isQueryName, queries, reportListenerError } from "@arcue/protocol";

/** "core" for calls inside the core's own process; "bridge" for the command line and MCP. */
export type CallerKind = "core" | "window" | "bridge";

/** Who made a call. The core uses the connection to route view commands back to the window that shows an asset. */
export interface CallContext {
  /** The connection the call arrived on, or null for a call made inside the core's own process. */
  connection: string | null;
  caller: CallerKind;
}

export type CommandHandler<Name extends CommandName> = (
  args: CommandArgs<Name>,
  context: CallContext,
) => CommandOutput<Name> | Promise<CommandOutput<Name>>;

export type QueryHandler<Name extends QueryName> = (
  args: QueryArgs<Name>,
  context: CallContext,
) => QueryOutput<Name> | Promise<QueryOutput<Name>>;

export type AnyEventListener = (name: EventName, payload: unknown) => void;

type Handler = (args: unknown, context: CallContext) => unknown;

const IN_PROCESS: CallContext = { connection: null, caller: "core" };

export interface CommandRegistryOptions {
  /** Receives errors thrown by event listeners. By default they surface as unhandled rejections. */
  onListenerError?: (error: unknown, event: EventName) => void;
}

/**
 * Holds a handler for each command and query in the protocol, validates every call against the protocol's schema
 * before the handler sees it, and broadcasts events. It is also the in-process `CoreClient`, which is always connected.
 */
export class CommandRegistry implements CoreClient {
  readonly connectionState: ConnectionState = "connected";
  readonly #commandHandlers = new Map<string, Handler>();
  readonly #queryHandlers = new Map<string, Handler>();
  readonly #listeners = new Map<string, Set<(payload: unknown) => void>>();
  readonly #anyListeners = new Set<AnyEventListener>();
  readonly #onListenerError: (error: unknown, event: EventName) => void;

  constructor(options: CommandRegistryOptions = {}) {
    this.#onListenerError = options.onListenerError ?? ((error) => reportListenerError(error));
  }

  onConnectionChange(_listener: (state: ConnectionState) => void): Unsubscribe {
    return () => undefined;
  }

  handleCommand<Name extends CommandName>(name: Name, handler: CommandHandler<Name>): Unsubscribe {
    return register(this.#commandHandlers, "command", name, (args, context) =>
      handler(args as CommandArgs<Name>, context),
    );
  }

  handleQuery<Name extends QueryName>(name: Name, handler: QueryHandler<Name>): Unsubscribe {
    return register(this.#queryHandlers, "query", name, (args, context) => handler(args as QueryArgs<Name>, context));
  }

  async execute<Name extends CommandName>(name: Name, input: CommandInput<Name>): Promise<CommandOutput<Name>> {
    return (await this.dispatch("command", name, input)) as CommandOutput<Name>;
  }

  async query<Name extends QueryName>(name: Name, input: QueryInput<Name>): Promise<QueryOutput<Name>> {
    return (await this.dispatch("query", name, input)) as QueryOutput<Name>;
  }

  /** The untyped entry point for transports: runs whatever arrived on the wire, or rejects with an `ArcueError`. */
  async dispatch(kind: RequestKind, name: string, input: unknown, context: CallContext = IN_PROCESS): Promise<unknown> {
    const definition = definitionOf(kind, name);
    if (!definition) throw new ArcueError("unknown-command", `There is no ${kind} named "${name}".`);
    if ("internal" in definition && definition.internal && context.caller === "bridge") {
      throw new ArcueError("forbidden", `"${name}" passes only between the core and its windows.`);
    }
    const handler = (kind === "command" ? this.#commandHandlers : this.#queryHandlers).get(name);
    if (!handler) throw new ArcueError("unavailable", `No handler is registered for the ${kind} "${name}".`);
    const parsed = definition.input.safeParse(input);
    if (!parsed.success) {
      const issues: ValidationIssue[] = parsed.error.issues.map((issue) => ({
        path: issue.path.map((key) => (typeof key === "number" ? key : String(key))),
        message: issue.message,
      }));
      const summary = issues.map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`).join("; ");
      throw new ArcueError("invalid-input", `Invalid input for "${name}". ${summary}`, { issues });
    }
    try {
      return await handler(parsed.data, context);
    } catch (error) {
      if (error instanceof ArcueError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new ArcueError("internal", `"${name}" failed: ${message}`, { cause: error });
    }
  }

  /** Calls every listener. It never throws: a listener's error goes to `onListenerError`, and the rest still run. */
  emit<Name extends EventName>(name: Name, payload: EventPayload<Name>): void {
    for (const listener of [...(this.#listeners.get(name) ?? [])]) {
      try {
        listener(payload);
      } catch (error) {
        this.#onListenerError(error, name);
      }
    }
    for (const listener of [...this.#anyListeners]) {
      try {
        listener(name, payload);
      } catch (error) {
        this.#onListenerError(error, name);
      }
    }
  }

  subscribe<Name extends EventName>(name: Name, listener: (payload: EventPayload<Name>) => void): Unsubscribe {
    const forName = this.#listeners.get(name) ?? new Set();
    this.#listeners.set(name, forName);
    const entry = (payload: unknown) => listener(payload as EventPayload<Name>);
    forName.add(entry);
    return () => {
      forName.delete(entry);
    };
  }

  /** Hears every event, for transports that forward events to another process. */
  subscribeAll(listener: AnyEventListener): Unsubscribe {
    this.#anyListeners.add(listener);
    return () => {
      this.#anyListeners.delete(listener);
    };
  }
}

function definitionOf(kind: RequestKind, name: string): CommandDefinition | QueryDefinition | undefined {
  if (kind === "command") return isCommandName(name) ? commands[name] : undefined;
  return isQueryName(name) ? queries[name] : undefined;
}

function register(handlers: Map<string, Handler>, kind: RequestKind, name: string, handler: Handler): Unsubscribe {
  if (handlers.has(name)) throw new ArcueError("conflict", `The ${kind} "${name}" already has a handler.`);
  handlers.set(name, handler);
  return () => {
    if (handlers.get(name) === handler) handlers.delete(name);
  };
}
