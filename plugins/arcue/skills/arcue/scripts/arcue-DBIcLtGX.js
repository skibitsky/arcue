import { D as readBridgeInfo, E as connectToCore, _ as warningPrompt, c as formatLabel, h as fromNativePath, l as inspectFile, p as systemClock, r as connectForOpen, s as formatInspection, t as import_websocket } from "./arcue-DHkKMS0E.js";
import { $t as intersection, Bt as ArcueError, Ct as SERVE_CORE_PATH, Et as bridgeAuthorization, Gt as _enum, Ht as date, I as MODEL_FILE_EXTENSIONS, Jt as array, Kt as _null, O as VIEW_PARAMETER, Pt as MAX_FRAME_BYTES, Qt as int, Ut as datetime, Vt as COMMENT_ID_PATTERN, Wt as ZodNumber, Xt as discriminatedUnion, Yt as boolean, Zt as email, a as MAX_PIECE_BYTES, an as optional, c as WINDOW_CHANNEL_META_KEY, cn as string, dn as url, en as lazy, fn as safeParse, hn as NEVER, in as object, k as viewAddress, l as WINDOW_CHANNEL_TOOL, ln as union, mn as _coercedNumber, nn as looseObject, o as MCP_VIEW_META_KEY, on as preprocess, pn as toJSONSchema, qt as any, rn as number$1, s as MCP_VIEW_URI, sn as record, tn as literal, u as windowChannelInputSchema, un as unknown } from "./arcue-DgAKlMPA.js";
import { realpath, stat } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { setTimeout as setTimeout$1 } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import process$1 from "node:process";
//#region ../../node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/classic/compat.js
/** @deprecated Use the raw string literal codes instead, e.g. "invalid_type". */
var ZodIssueCode = {
	invalid_type: "invalid_type",
	too_big: "too_big",
	too_small: "too_small",
	invalid_format: "invalid_format",
	not_multiple_of: "not_multiple_of",
	unrecognized_keys: "unrecognized_keys",
	invalid_union: "invalid_union",
	invalid_key: "invalid_key",
	invalid_element: "invalid_element",
	invalid_value: "invalid_value",
	custom: "custom"
};
/** @deprecated Do not use. Stub definition, only included for zod-to-json-schema compatibility. */
var ZodFirstPartyTypeKind;
ZodFirstPartyTypeKind || (ZodFirstPartyTypeKind = {});
//#endregion
//#region ../../node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/classic/coerce.js
function number(params) {
	return _coercedNumber(ZodNumber, params);
}
//#endregion
//#region ../../node_modules/.pnpm/@modelcontextprotocol+ext-apps@2.1.0_@modelcontextprotocol+client@2.4.0_@modelcontextpr_94abaf3778a1c43596536a06fbf3beb8/node_modules/@modelcontextprotocol/ext-apps/dist/src/server/index.js
var D = "ui/resourceUri";
var L = "text/html;profile=mcp-app";
function j(B, Q, F, V) {
	let q = F._meta, J = q.ui, Z = q[D], $ = q;
	if (J?.resourceUri && !Z) $ = {
		...q,
		[D]: J.resourceUri
	};
	else if (Z && !J?.resourceUri) $ = {
		...q,
		ui: {
			...J,
			resourceUri: Z
		}
	};
	return B.registerTool(Q, {
		...F,
		_meta: $
	}, V);
}
function G(B, Q, F, V, q) {
	return B.registerResource(Q, F, {
		mimeType: L,
		...V
	}, q);
}
var W = "io.modelcontextprotocol/ui";
function H(B) {
	if (!B) return;
	return B.extensions?.[W];
}
//#endregion
//#region ../../node_modules/.pnpm/@modelcontextprotocol+server@2.4.0/node_modules/@modelcontextprotocol/server/dist/chunk-vYduTEsO.mjs
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJSMin = (cb, mod) => () => (mod || cb((mod = { exports: {} }).exports, mod), mod.exports);
var __exportAll = (all, symbols) => {
	let target = {};
	for (var name in all) __defProp(target, name, {
		get: all[name],
		enumerable: true
	});
	if (symbols) __defProp(target, Symbol.toStringTag, { value: "Module" });
	return target;
};
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));
//#endregion
//#region ../../node_modules/.pnpm/@modelcontextprotocol+server@2.4.0/node_modules/@modelcontextprotocol/server/dist/dialects-CDpMbily.mjs
/**
* Canonical `$schema` URIs per supported dialect (http + https variants, trailing-`#` stripped).
*/
var DRAFT_2020_12_URIS = /* @__PURE__ */ new Set(["https://json-schema.org/draft/2020-12/schema", "http://json-schema.org/draft/2020-12/schema"]);
var DRAFT_2019_09_URIS = /* @__PURE__ */ new Set(["https://json-schema.org/draft/2019-09/schema", "http://json-schema.org/draft/2019-09/schema"]);
var DRAFT_07_URIS = /* @__PURE__ */ new Set(["https://json-schema.org/draft-07/schema", "http://json-schema.org/draft-07/schema"]);
var DRAFT_06_URIS = /* @__PURE__ */ new Set(["https://json-schema.org/draft-06/schema", "http://json-schema.org/draft-06/schema"]);
/**
* Whether a `$schema` value declares the 2019-09 dialect — the only supported dialect with
* `$recursiveRef`/`$recursiveAnchor`. Non-throwing (unlike {@linkcode declaredDialect}) so
* wire-layer callers can consult it for documents whose dialect may be unsupported.
*/
function declares2019Dialect($schema) {
	return typeof $schema === "string" && DRAFT_2019_09_URIS.has($schema.replace(/#$/, ""));
}
/**
* Classify a schema's declared `$schema` dialect. No `$schema` (or a non-string one) means
* 2020-12. Any other dialect throws a plain `Error` with a clear message rather than letting the
* engine crash on an opaque internal error or silently mis-validate; `remedy` names the calling
* provider's escape hatch in that message.
*/
function declaredDialect(schema, remedy) {
	if (!("$schema" in schema) || typeof schema.$schema !== "string") return "2020-12";
	const declared = schema.$schema.replace(/#$/, "");
	if (DRAFT_2020_12_URIS.has(declared)) return "2020-12";
	if (DRAFT_2019_09_URIS.has(declared)) return "2019-09";
	if (DRAFT_07_URIS.has(declared) || DRAFT_06_URIS.has(declared)) return "draft-7";
	throw new Error(`JSON Schema declares an unsupported dialect ("$schema": "${schema.$schema.slice(0, 200)}"). The default validator supports JSON Schema 2020-12, 2019-09, draft-07, and draft-06; ${remedy}`);
}
var SUPPORTED_PROTOCOL_VERSIONS = [
	"2025-11-25",
	"2025-06-18",
	"2025-03-26",
	"2024-11-05",
	"2024-10-07"
];
/**
* `_meta` key associating a message with a 2025-11-25 task.
*
* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
*/
var RELATED_TASK_META_KEY = "io.modelcontextprotocol/related-task";
/**
* `_meta` key carrying the MCP protocol version governing a request.
*
* For the HTTP transport, the value must match the `MCP-Protocol-Version` header.
*/
var PROTOCOL_VERSION_META_KEY = "io.modelcontextprotocol/protocolVersion";
/**
* `_meta` key identifying the client software making a request.
*
* Clients SHOULD include it on every request; the value is self-reported and
* intended for display, logging, and debugging — servers should not rely on
* it for behavior or security decisions.
*/
var CLIENT_INFO_META_KEY = "io.modelcontextprotocol/clientInfo";
/**
* `_meta` key identifying the server software producing a response.
*
* Servers SHOULD include it on every response; the value is self-reported and
* intended for display, logging, and debugging — clients should not rely on
* it for behavior or security decisions.
*/
var SERVER_INFO_META_KEY = "io.modelcontextprotocol/serverInfo";
/**
* `_meta` key carrying the client's capabilities for a request.
*
* Capabilities are declared per request rather than once at initialization;
* servers must not infer capabilities from prior requests.
*/
var CLIENT_CAPABILITIES_META_KEY = "io.modelcontextprotocol/clientCapabilities";
/**
* `_meta` key carrying the JSON-RPC ID of the `subscriptions/listen` request
* that opened the stream a notification was delivered on.
*
* Stamped by the server on every notification delivered via a
* `subscriptions/listen` stream (including the leading
* `notifications/subscriptions/acknowledged`); on stdio, where all messages
* share one channel, clients use it to correlate notifications with their
* originating subscription. The value is the listen request's JSON-RPC ID
* verbatim.
*/
var SUBSCRIPTION_ID_META_KEY = "io.modelcontextprotocol/subscriptionId";
/**
* `_meta` key carrying the desired log level for a request.
*
* When absent, the server must not send `notifications/message` notifications
* for the request.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months.
*/
var LOG_LEVEL_META_KEY = "io.modelcontextprotocol/logLevel";
var JSONValueSchema = lazy(() => union([
	string(),
	number$1(),
	boolean(),
	_null(),
	record(string(), JSONValueSchema),
	array(JSONValueSchema)
]));
var JSONObjectSchema = record(string(), JSONValueSchema);
var JSONArraySchema = array(JSONValueSchema);
/**
* A progress token, used to associate progress notifications with the original request.
*/
var ProgressTokenSchema = union([string(), number$1().int()]);
/**
* An opaque token used to represent a cursor for pagination.
*/
var CursorSchema = string();
/** @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only. */
var TaskMetadataSchema = object({ ttl: number$1().optional() });
/**
* Metadata for associating messages with a task.
* Include this in the `_meta` field under the key `io.modelcontextprotocol/related-task`.
*
* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
*/
var RelatedTaskMetadataSchema = object({ taskId: string() });
var RequestMetaSchema = looseObject({
	progressToken: ProgressTokenSchema.optional(),
	[RELATED_TASK_META_KEY]: RelatedTaskMetadataSchema.optional()
});
/**
* Common params for any request.
*/
var BaseRequestParamsSchema = object({ _meta: RequestMetaSchema.optional() });
/**
* Common params for any task-augmented request.
*
* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
*/
var TaskAugmentedRequestParamsSchema = BaseRequestParamsSchema.extend({ task: TaskMetadataSchema.optional() });
var RequestSchema = object({
	method: string(),
	params: BaseRequestParamsSchema.loose().optional()
});
var NotificationsParamsSchema = object({ _meta: RequestMetaSchema.optional() });
var NotificationSchema = object({
	method: string(),
	params: NotificationsParamsSchema.loose().optional()
});
/**
* The contents of a result's `_meta` field (the 2026-07-28 `ResultMetaObject`).
* Loose — implementation-specific keys pass through.
*
* The serverInfo key identifies the server software producing the response
* (servers SHOULD include it on every response; the value is self-reported
* and intended for display, logging, and debugging). The getter defers the
* `ImplementationSchema` reference, which is declared later in this file.
*/
var ResultMetaObjectSchema = looseObject({ get [SERVER_INFO_META_KEY]() {
	return ImplementationSchema.optional().catch(void 0);
} });
var ResultSchema = looseObject({ _meta: ResultMetaObjectSchema.optional() });
/**
* A uniquely identifying ID for a request in JSON-RPC.
*/
var RequestIdSchema = union([string(), number$1().int()]);
/**
* A request that expects a response.
*/
var JSONRPCRequestSchema = object({
	jsonrpc: literal("2.0"),
	id: RequestIdSchema,
	...RequestSchema.shape
}).strict();
/**
* A notification which does not expect a response.
*/
var JSONRPCNotificationSchema = object({
	jsonrpc: literal("2.0"),
	...NotificationSchema.shape
}).strict();
/**
* A successful (non-error) response to a request.
*/
var JSONRPCResultResponseSchema = object({
	jsonrpc: literal("2.0"),
	id: RequestIdSchema,
	result: ResultSchema
}).strict();
/**
* A response to a request that indicates an error occurred.
*/
var JSONRPCErrorResponseSchema = object({
	jsonrpc: literal("2.0"),
	id: RequestIdSchema.optional(),
	error: object({
		code: number$1().int(),
		message: string(),
		data: unknown().optional()
	})
}).strict();
var JSONRPCMessageSchema = union([
	JSONRPCRequestSchema,
	JSONRPCNotificationSchema,
	JSONRPCResultResponseSchema,
	JSONRPCErrorResponseSchema
]);
var JSONRPCResponseSchema = union([JSONRPCResultResponseSchema, JSONRPCErrorResponseSchema]);
/**
* A response that indicates success but carries no data.
*/
var EmptyResultSchema = ResultSchema.strict();
var CancelledNotificationParamsSchema = NotificationsParamsSchema.extend({
	requestId: RequestIdSchema.optional(),
	reason: string().optional()
});
/**
* This notification can be sent by either side to indicate that it is cancelling a previously-issued request.
*
* The request SHOULD still be in-flight, but due to communication latency, it is always possible that this notification MAY arrive after the request has already finished.
*
* This notification indicates that the result will be unused, so any associated processing SHOULD cease.
*
* A client MUST NOT attempt to cancel its {@linkcode InitializeRequest | initialize} request.
*/
var CancelledNotificationSchema = NotificationSchema.extend({
	method: literal("notifications/cancelled"),
	params: CancelledNotificationParamsSchema
});
/**
* Icon schema for use in {@link Tool | tools}, {@link Prompt | prompts}, {@link Resource | resources}, and {@link Implementation | implementations}.
*/
var IconSchema = object({
	src: string(),
	mimeType: string().optional(),
	sizes: array(string()).optional(),
	theme: _enum(["light", "dark"]).optional()
});
/**
* Base schema to add `icons` property.
*
*/
var IconsSchema = object({ icons: array(IconSchema).optional() });
/**
* Base metadata interface for common properties across {@link Resource | resources}, {@link Tool | tools}, {@link Prompt | prompts}, and {@link Implementation | implementations}.
*/
var BaseMetadataSchema = object({
	name: string(),
	title: string().optional()
});
/**
* Describes the name and version of an MCP implementation.
*/
var ImplementationSchema = BaseMetadataSchema.extend({
	...BaseMetadataSchema.shape,
	...IconsSchema.shape,
	version: string(),
	websiteUrl: string().optional(),
	description: string().optional()
});
var FormElicitationCapabilitySchema = intersection(object({ applyDefaults: boolean().optional() }), JSONObjectSchema);
var ElicitationCapabilitySchema = preprocess((value) => {
	if (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0) return { form: {} };
	return value;
}, intersection(object({
	form: FormElicitationCapabilitySchema.optional(),
	url: JSONObjectSchema.optional()
}), JSONObjectSchema.optional()));
/**
* Task capabilities for clients, indicating which request types support task creation.
*
* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
*/
var ClientTasksCapabilitySchema = looseObject({
	list: JSONObjectSchema.optional(),
	cancel: JSONObjectSchema.optional(),
	requests: looseObject({
		sampling: looseObject({ createMessage: JSONObjectSchema.optional() }).optional(),
		elicitation: looseObject({ create: JSONObjectSchema.optional() }).optional()
	}).optional()
});
/**
* Task capabilities for servers, indicating which request types support task creation.
*
* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
*/
var ServerTasksCapabilitySchema = looseObject({
	list: JSONObjectSchema.optional(),
	cancel: JSONObjectSchema.optional(),
	requests: looseObject({ tools: looseObject({ call: JSONObjectSchema.optional() }).optional() }).optional()
});
/**
* Capabilities a client may support. Known capabilities are defined here, in this schema, but this is not a closed set: any client can define its own, additional capabilities.
*/
var ClientCapabilitiesSchema = object({
	experimental: record(string(), JSONObjectSchema).optional(),
	sampling: object({
		context: JSONObjectSchema.optional(),
		tools: JSONObjectSchema.optional()
	}).optional(),
	elicitation: ElicitationCapabilitySchema.optional(),
	roots: object({ listChanged: boolean().optional() }).optional(),
	tasks: ClientTasksCapabilitySchema.optional(),
	extensions: record(string(), JSONObjectSchema).optional()
});
var InitializeRequestParamsSchema = BaseRequestParamsSchema.extend({
	protocolVersion: string(),
	capabilities: ClientCapabilitiesSchema,
	clientInfo: ImplementationSchema
});
/**
* This request is sent from the client to the server when it first connects, asking it to begin initialization.
*/
var InitializeRequestSchema = RequestSchema.extend({
	method: literal("initialize"),
	params: InitializeRequestParamsSchema
});
/**
* Capabilities that a server may support. Known capabilities are defined here, in this schema, but this is not a closed set: any server can define its own, additional capabilities.
*/
var ServerCapabilitiesSchema = object({
	experimental: record(string(), JSONObjectSchema).optional(),
	logging: JSONObjectSchema.optional(),
	completions: JSONObjectSchema.optional(),
	prompts: object({ listChanged: boolean().optional() }).optional(),
	resources: object({
		subscribe: boolean().optional(),
		listChanged: boolean().optional()
	}).optional(),
	tools: object({ listChanged: boolean().optional() }).optional(),
	tasks: ServerTasksCapabilitySchema.optional(),
	extensions: record(string(), JSONObjectSchema).optional()
});
/**
* After receiving an initialize request from the client, the server sends this response.
*/
var InitializeResultSchema = ResultSchema.extend({
	protocolVersion: string(),
	capabilities: ServerCapabilitiesSchema,
	serverInfo: ImplementationSchema,
	instructions: string().optional()
});
/**
* This notification is sent from the client to the server after initialization has finished.
*/
var InitializedNotificationSchema = NotificationSchema.extend({
	method: literal("notifications/initialized"),
	params: NotificationsParamsSchema.optional()
});
/**
* A request from the client asking the server to advertise its supported protocol
* versions, capabilities, and other metadata (protocol revision 2026-07-28). Servers
* MUST implement `server/discover`. Clients MAY call it but are not required to —
* version negotiation can also happen inline via the per-request `_meta` envelope.
*/
var DiscoverRequestSchema = RequestSchema.extend({
	method: literal("server/discover"),
	params: BaseRequestParamsSchema.optional()
});
/**
* The result returned by the server for a `server/discover` request.
*/
var DiscoverResultSchema = ResultSchema.extend({
	supportedVersions: array(string()),
	capabilities: ServerCapabilitiesSchema,
	instructions: string().optional()
});
/**
* A ping, issued by either the server or the client, to check that the other party is still alive. The receiver must promptly respond, or else may be disconnected.
*/
var PingRequestSchema = RequestSchema.extend({
	method: literal("ping"),
	params: BaseRequestParamsSchema.optional()
});
var ProgressSchema = object({
	progress: number$1(),
	total: optional(number$1()),
	message: optional(string())
});
var ProgressNotificationParamsSchema = object({
	...NotificationsParamsSchema.shape,
	...ProgressSchema.shape,
	progressToken: ProgressTokenSchema
});
/**
* An out-of-band notification used to inform the receiver of a progress update for a long-running request.
*
* @category notifications/progress
*/
var ProgressNotificationSchema = NotificationSchema.extend({
	method: literal("notifications/progress"),
	params: ProgressNotificationParamsSchema
});
var PaginatedRequestParamsSchema = BaseRequestParamsSchema.extend({ cursor: CursorSchema.optional() });
var PaginatedRequestSchema = RequestSchema.extend({ params: PaginatedRequestParamsSchema.optional() });
var PaginatedResultSchema = ResultSchema.extend({ nextCursor: CursorSchema.optional() });
/**
* The contents of a specific resource or sub-resource.
*/
var ResourceContentsSchema = object({
	uri: string(),
	mimeType: optional(string()),
	_meta: record(string(), unknown()).optional()
});
var TextResourceContentsSchema = ResourceContentsSchema.extend({ text: string() });
/**
* A Zod schema for validating Base64 strings that is more performant and
* robust for very large inputs than the default regex-based check. It avoids
* stack overflows by using the native `atob` function for validation.
*/
var Base64Schema = string().refine((val) => {
	try {
		atob(val);
		return true;
	} catch {
		return false;
	}
}, { message: "Invalid Base64 string" });
var BlobResourceContentsSchema = ResourceContentsSchema.extend({ blob: Base64Schema });
/**
* The sender or recipient of messages and data in a conversation.
*/
var RoleSchema = _enum(["user", "assistant"]);
/**
* Optional annotations providing clients additional context about a resource.
*/
var AnnotationsSchema = object({
	audience: array(RoleSchema).optional(),
	priority: number$1().min(0).max(1).optional(),
	lastModified: datetime({ offset: true }).optional()
});
/**
* A known resource that the server is capable of reading.
*/
var ResourceSchema = object({
	...BaseMetadataSchema.shape,
	...IconsSchema.shape,
	uri: string(),
	description: optional(string()),
	mimeType: optional(string()),
	size: optional(number$1()),
	annotations: AnnotationsSchema.optional(),
	_meta: optional(looseObject({}))
});
/**
* A template description for resources available on the server.
*/
var ResourceTemplateSchema = object({
	...BaseMetadataSchema.shape,
	...IconsSchema.shape,
	uriTemplate: string(),
	description: optional(string()),
	mimeType: optional(string()),
	annotations: AnnotationsSchema.optional(),
	_meta: optional(looseObject({}))
});
/**
* Sent from the client to request a list of resources the server has.
*/
var ListResourcesRequestSchema = PaginatedRequestSchema.extend({ method: literal("resources/list") });
/**
* The server's response to a {@linkcode ListResourcesRequest | resources/list} request from the client.
*/
var ListResourcesResultSchema = PaginatedResultSchema.extend({ resources: array(ResourceSchema) });
/**
* Sent from the client to request a list of resource templates the server has.
*/
var ListResourceTemplatesRequestSchema = PaginatedRequestSchema.extend({ method: literal("resources/templates/list") });
/**
* The server's response to a {@linkcode ListResourceTemplatesRequest | resources/templates/list} request from the client.
*/
var ListResourceTemplatesResultSchema = PaginatedResultSchema.extend({ resourceTemplates: array(ResourceTemplateSchema) });
var ResourceRequestParamsSchema = BaseRequestParamsSchema.extend({ uri: string() });
/**
* Parameters for a {@linkcode ReadResourceRequest | resources/read} request.
*/
var ReadResourceRequestParamsSchema = ResourceRequestParamsSchema;
/**
* Sent from the client to the server, to read a specific resource URI.
*/
var ReadResourceRequestSchema = RequestSchema.extend({
	method: literal("resources/read"),
	params: ReadResourceRequestParamsSchema
});
/**
* The server's response to a {@linkcode ReadResourceRequest | resources/read} request from the client.
*/
var ReadResourceResultSchema = ResultSchema.extend({ contents: array(union([TextResourceContentsSchema, BlobResourceContentsSchema])) });
/**
* An optional notification from the server to the client, informing it that the list of resources it can read from has changed. This may be issued by servers without any previous subscription from the client.
*/
var ResourceListChangedNotificationSchema = NotificationSchema.extend({
	method: literal("notifications/resources/list_changed"),
	params: NotificationsParamsSchema.optional()
});
var SubscribeRequestParamsSchema = ResourceRequestParamsSchema;
/**
* Sent from the client to request `resources/updated` notifications from the server whenever a particular resource changes.
*/
var SubscribeRequestSchema = RequestSchema.extend({
	method: literal("resources/subscribe"),
	params: SubscribeRequestParamsSchema
});
var UnsubscribeRequestParamsSchema = ResourceRequestParamsSchema;
/**
* Sent from the client to request cancellation of {@linkcode ResourceUpdatedNotification | resources/updated} notifications from the server. This should follow a previous {@linkcode SubscribeRequest | resources/subscribe} request.
*/
var UnsubscribeRequestSchema = RequestSchema.extend({
	method: literal("resources/unsubscribe"),
	params: UnsubscribeRequestParamsSchema
});
/**
* The set of notification types a client opts in to on a `subscriptions/listen`
* request. Each type is opt-in; the server MUST NOT send a notification type
* the client has not explicitly requested here.
*/
var SubscriptionFilterSchema = object({
	toolsListChanged: boolean().optional(),
	promptsListChanged: boolean().optional(),
	resourcesListChanged: boolean().optional(),
	resourceSubscriptions: array(string()).optional()
});
var SubscriptionsListenRequestParamsSchema = BaseRequestParamsSchema.extend({ notifications: SubscriptionFilterSchema });
/**
* Sent from the client to open a long-lived channel for receiving notifications
* outside the context of a specific request (protocol revision 2026-07-28).
* Replaces the previous HTTP GET endpoint and `resources/subscribe`.
*/
var SubscriptionsListenRequestSchema = RequestSchema.extend({
	method: literal("subscriptions/listen"),
	params: SubscriptionsListenRequestParamsSchema
});
var SubscriptionsAcknowledgedNotificationParamsSchema = NotificationsParamsSchema.extend({ notifications: SubscriptionFilterSchema });
/**
* Sent by the server as the first message on a `subscriptions/listen` stream
* to acknowledge that the subscription has been established and report which
* notification types it agreed to honor (protocol revision 2026-07-28).
*/
var SubscriptionsAcknowledgedNotificationSchema = NotificationSchema.extend({
	method: literal("notifications/subscriptions/acknowledged"),
	params: SubscriptionsAcknowledgedNotificationParamsSchema
});
/**
* `_meta` for a {@linkcode SubscriptionsListenResult}: the listen request's
* JSON-RPC ID under the canonical subscription-id key (mirroring the same key
* on every notification delivered on the stream). Extends
* {@linkcode ResultMetaObjectSchema}, so the optional serverInfo key is typed
* here too.
*/
var SubscriptionsListenResultMetaSchema = ResultMetaObjectSchema.extend({ [SUBSCRIPTION_ID_META_KEY]: RequestIdSchema });
/**
* The response to a `subscriptions/listen` request, signalling that the
* subscription has ended gracefully (for example, during server shutdown).
* Because the listen stream is long-lived, this result is sent only when the
* server tears the subscription down; an abrupt transport close carries no
* response. The result body is otherwise empty.
*/
var SubscriptionsListenResultSchema = ResultSchema.extend({ _meta: SubscriptionsListenResultMetaSchema });
/**
* Parameters for a {@linkcode ResourceUpdatedNotification | notifications/resources/updated} notification.
*/
var ResourceUpdatedNotificationParamsSchema = NotificationsParamsSchema.extend({ uri: string() });
/**
* A notification from the server to the client, informing it that a resource has changed and may need to be read again. This should only be sent if the client previously sent a {@linkcode SubscribeRequest | resources/subscribe} request.
*/
var ResourceUpdatedNotificationSchema = NotificationSchema.extend({
	method: literal("notifications/resources/updated"),
	params: ResourceUpdatedNotificationParamsSchema
});
/**
* Describes an argument that a prompt can accept.
*/
var PromptArgumentSchema = object({
	name: string(),
	description: optional(string()),
	required: optional(boolean())
});
/**
* A prompt or prompt template that the server offers.
*/
var PromptSchema = object({
	...BaseMetadataSchema.shape,
	...IconsSchema.shape,
	description: optional(string()),
	arguments: optional(array(PromptArgumentSchema)),
	_meta: optional(looseObject({}))
});
/**
* Sent from the client to request a list of prompts and prompt templates the server has.
*/
var ListPromptsRequestSchema = PaginatedRequestSchema.extend({ method: literal("prompts/list") });
/**
* The server's response to a {@linkcode ListPromptsRequest | prompts/list} request from the client.
*/
var ListPromptsResultSchema = PaginatedResultSchema.extend({ prompts: array(PromptSchema) });
/**
* Parameters for a {@linkcode GetPromptRequest | prompts/get} request.
*/
var GetPromptRequestParamsSchema = BaseRequestParamsSchema.extend({
	name: string(),
	arguments: record(string(), string()).optional()
});
/**
* Used by the client to get a prompt provided by the server.
*/
var GetPromptRequestSchema = RequestSchema.extend({
	method: literal("prompts/get"),
	params: GetPromptRequestParamsSchema
});
/**
* Text provided to or from an LLM.
*/
var TextContentSchema = object({
	type: literal("text"),
	text: string(),
	annotations: AnnotationsSchema.optional(),
	_meta: record(string(), unknown()).optional()
});
/**
* An image provided to or from an LLM.
*/
var ImageContentSchema = object({
	type: literal("image"),
	data: Base64Schema,
	mimeType: string(),
	annotations: AnnotationsSchema.optional(),
	_meta: record(string(), unknown()).optional()
});
/**
* Audio content provided to or from an LLM.
*/
var AudioContentSchema = object({
	type: literal("audio"),
	data: Base64Schema,
	mimeType: string(),
	annotations: AnnotationsSchema.optional(),
	_meta: record(string(), unknown()).optional()
});
/**
* A tool call request from an assistant (LLM).
* Represents the assistant's request to use a tool.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to calling LLM
* provider APIs directly.
*/
var ToolUseContentSchema = object({
	type: literal("tool_use"),
	name: string(),
	id: string(),
	input: record(string(), unknown()),
	_meta: record(string(), unknown()).optional()
});
/**
* The contents of a resource, embedded into a prompt or tool call result.
*/
var EmbeddedResourceSchema = object({
	type: literal("resource"),
	resource: union([TextResourceContentsSchema, BlobResourceContentsSchema]),
	annotations: AnnotationsSchema.optional(),
	_meta: record(string(), unknown()).optional()
});
/**
* A resource that the server is capable of reading, included in a prompt or tool call result.
*
* Note: resource links returned by tools are not guaranteed to appear in the results of {@linkcode ListResourcesRequest | resources/list} requests.
*/
var ResourceLinkSchema = ResourceSchema.extend({ type: literal("resource_link") });
/**
* A content block that can be used in prompts and tool results.
*/
var ContentBlockSchema = union([
	TextContentSchema,
	ImageContentSchema,
	AudioContentSchema,
	ResourceLinkSchema,
	EmbeddedResourceSchema
]);
/**
* Describes a message returned as part of a prompt.
*/
var PromptMessageSchema = object({
	role: RoleSchema,
	content: ContentBlockSchema
});
/**
* The server's response to a {@linkcode GetPromptRequest | prompts/get} request from the client.
*/
var GetPromptResultSchema = ResultSchema.extend({
	description: string().optional(),
	messages: array(PromptMessageSchema)
});
/**
* An optional notification from the server to the client, informing it that the list of prompts it offers has changed. This may be issued by servers without any previous subscription from the client.
*/
var PromptListChangedNotificationSchema = NotificationSchema.extend({
	method: literal("notifications/prompts/list_changed"),
	params: NotificationsParamsSchema.optional()
});
/**
* Additional properties describing a `Tool` to clients.
*
* NOTE: all properties in {@linkcode ToolAnnotations} are **hints**.
* They are not guaranteed to provide a faithful description of
* tool behavior (including descriptive properties like `title`).
*
* Clients should never make tool use decisions based on `ToolAnnotations`
* received from untrusted servers.
*/
var ToolAnnotationsSchema = object({
	title: string().optional(),
	readOnlyHint: boolean().optional(),
	destructiveHint: boolean().optional(),
	idempotentHint: boolean().optional(),
	openWorldHint: boolean().optional()
});
/**
* Execution-related properties for a tool.
*/
var ToolExecutionSchema = object({ taskSupport: _enum([
	"required",
	"optional",
	"forbidden"
]).optional() });
/**
* Definition for a tool the client can call.
*/
var ToolSchema = object({
	...BaseMetadataSchema.shape,
	...IconsSchema.shape,
	description: string().optional(),
	inputSchema: object({
		type: literal("object"),
		properties: record(string(), JSONValueSchema).optional(),
		required: array(string()).optional()
	}).catchall(unknown()),
	outputSchema: looseObject({ $schema: string().optional() }).optional(),
	annotations: ToolAnnotationsSchema.optional(),
	execution: ToolExecutionSchema.optional(),
	_meta: record(string(), unknown()).optional()
});
/**
* Sent from the client to request a list of tools the server has.
*/
var ListToolsRequestSchema = PaginatedRequestSchema.extend({ method: literal("tools/list") });
/**
* The server's response to a {@linkcode ListToolsRequest | tools/list} request from the client.
*/
var ListToolsResultSchema = PaginatedResultSchema.extend({ tools: array(ToolSchema) });
/**
* The server's response to a tool call.
*/
var CallToolResultSchema = ResultSchema.extend({
	content: array(ContentBlockSchema).default([]),
	structuredContent: unknown().optional(),
	isError: boolean().optional()
});
/**
* {@linkcode CallToolResultSchema} extended with backwards compatibility to protocol version 2024-10-07.
*/
var CompatibilityCallToolResultSchema = CallToolResultSchema.or(ResultSchema.extend({ toolResult: unknown() }));
/**
* Parameters for a `tools/call` request.
*/
var CallToolRequestParamsSchema = TaskAugmentedRequestParamsSchema.extend({
	name: string(),
	arguments: record(string(), unknown()).optional()
});
/**
* Used by the client to invoke a tool provided by the server.
*/
var CallToolRequestSchema = RequestSchema.extend({
	method: literal("tools/call"),
	params: CallToolRequestParamsSchema
});
/**
* An optional notification from the server to the client, informing it that the list of tools it offers has changed. This may be issued by servers without any previous subscription from the client.
*/
var ToolListChangedNotificationSchema = NotificationSchema.extend({
	method: literal("notifications/tools/list_changed"),
	params: NotificationsParamsSchema.optional()
});
/**
* Base schema for list changed subscription options (without callback).
* Used internally for Zod validation of `autoRefresh` and `debounceMs`.
*/
var ListChangedOptionsBaseSchema = object({
	autoRefresh: boolean().default(true),
	debounceMs: number$1().int().nonnegative().default(300)
});
/**
* The severity of a log message.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to stderr logging
* (STDIO servers) or OpenTelemetry.
*/
var LoggingLevelSchema = _enum([
	"debug",
	"info",
	"notice",
	"warning",
	"error",
	"critical",
	"alert",
	"emergency"
]);
/**
* Parameters for a `logging/setLevel` request.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to stderr logging
* (STDIO servers) or OpenTelemetry.
*/
var SetLevelRequestParamsSchema = BaseRequestParamsSchema.extend({ level: LoggingLevelSchema });
/**
* A request from the client to the server, to enable or adjust logging.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to stderr logging
* (STDIO servers) or OpenTelemetry.
*/
var SetLevelRequestSchema = RequestSchema.extend({
	method: literal("logging/setLevel"),
	params: SetLevelRequestParamsSchema
});
/**
* Parameters for a `notifications/message` notification.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to stderr logging
* (STDIO servers) or OpenTelemetry.
*/
var LoggingMessageNotificationParamsSchema = NotificationsParamsSchema.extend({
	level: LoggingLevelSchema,
	logger: string().optional(),
	data: unknown()
});
/**
* Notification of a log message passed from server to client. If no `logging/setLevel` request has been sent from the client, the server MAY decide which messages to send automatically.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to stderr logging
* (STDIO servers) or OpenTelemetry.
*/
var LoggingMessageNotificationSchema = NotificationSchema.extend({
	method: literal("notifications/message"),
	params: LoggingMessageNotificationParamsSchema
});
/**
* Hints to use for model selection.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to calling LLM
* provider APIs directly.
*/
var ModelHintSchema = object({ name: string().optional() });
/**
* The server's preferences for model selection, requested of the client during sampling.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to calling LLM
* provider APIs directly.
*/
var ModelPreferencesSchema = object({
	hints: array(ModelHintSchema).optional(),
	costPriority: number$1().min(0).max(1).optional(),
	speedPriority: number$1().min(0).max(1).optional(),
	intelligencePriority: number$1().min(0).max(1).optional()
});
/**
* Controls tool usage behavior in sampling requests.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to calling LLM
* provider APIs directly.
*/
var ToolChoiceSchema = object({ mode: _enum([
	"auto",
	"required",
	"none"
]).optional() });
/**
* The result of a tool execution, provided by the user (server).
* Represents the outcome of invoking a tool requested via `ToolUseContent`.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to calling LLM
* provider APIs directly.
*/
var ToolResultContentSchema = object({
	type: literal("tool_result"),
	toolUseId: string().describe("The unique identifier for the corresponding tool call."),
	content: array(ContentBlockSchema),
	structuredContent: unknown().optional(),
	isError: boolean().optional(),
	_meta: record(string(), unknown()).optional()
});
/**
* Basic content types for sampling responses (without tool use).
* Used for backwards-compatible {@linkcode CreateMessageResult} when tools are not used.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to calling LLM
* provider APIs directly.
*/
var SamplingContentSchema = discriminatedUnion("type", [
	TextContentSchema,
	ImageContentSchema,
	AudioContentSchema
]);
/**
* Content block types allowed in sampling messages.
* This includes text, image, audio, tool use requests, and tool results.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to calling LLM
* provider APIs directly.
*/
var SamplingMessageContentBlockSchema = discriminatedUnion("type", [
	TextContentSchema,
	ImageContentSchema,
	AudioContentSchema,
	ToolUseContentSchema,
	ToolResultContentSchema
]);
/**
* Describes a message issued to or received from an LLM API.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to calling LLM
* provider APIs directly.
*/
var SamplingMessageSchema = object({
	role: RoleSchema,
	content: union([SamplingMessageContentBlockSchema, array(SamplingMessageContentBlockSchema)]),
	_meta: record(string(), unknown()).optional()
});
/**
* Parameters for a `sampling/createMessage` request.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to calling LLM
* provider APIs directly.
*/
var CreateMessageRequestParamsSchema = TaskAugmentedRequestParamsSchema.extend({
	messages: array(SamplingMessageSchema),
	modelPreferences: ModelPreferencesSchema.optional(),
	systemPrompt: string().optional(),
	includeContext: _enum([
		"none",
		"thisServer",
		"allServers"
	]).optional(),
	temperature: number$1().optional(),
	maxTokens: number$1().int(),
	stopSequences: array(string()).optional(),
	metadata: JSONObjectSchema.optional(),
	tools: array(ToolSchema).optional(),
	toolChoice: ToolChoiceSchema.optional()
});
/**
* A request from the server to sample an LLM via the client. The client has full discretion over which model to select. The client should also inform the user before beginning sampling, to allow them to inspect the request (human in the loop) and decide whether to approve it.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to calling LLM
* provider APIs directly.
*/
var CreateMessageRequestSchema = RequestSchema.extend({
	method: literal("sampling/createMessage"),
	params: CreateMessageRequestParamsSchema
});
/**
* The client's response to a `sampling/create_message` request from the server.
* This is the backwards-compatible version that returns single content (no arrays).
* Used when the request does not include tools.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to calling LLM
* provider APIs directly.
*/
var CreateMessageResultSchema = ResultSchema.extend({
	model: string(),
	stopReason: optional(_enum([
		"endTurn",
		"stopSequence",
		"maxTokens"
	]).or(string())),
	role: RoleSchema,
	content: SamplingContentSchema
});
/**
* The client's response to a `sampling/create_message` request when tools were provided.
* This version supports array content for tool use flows.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to calling LLM
* provider APIs directly.
*/
var CreateMessageResultWithToolsSchema = ResultSchema.extend({
	model: string(),
	stopReason: optional(_enum([
		"endTurn",
		"stopSequence",
		"maxTokens",
		"toolUse"
	]).or(string())),
	role: RoleSchema,
	content: union([SamplingMessageContentBlockSchema, array(SamplingMessageContentBlockSchema)])
});
/**
* Primitive schema definition for boolean fields.
*/
var BooleanSchemaSchema = object({
	type: literal("boolean"),
	title: string().optional(),
	description: string().optional(),
	default: boolean().optional()
});
/**
* Primitive schema definition for string fields.
*/
var StringSchemaSchema = object({
	type: literal("string"),
	title: string().optional(),
	description: string().optional(),
	minLength: number$1().optional(),
	maxLength: number$1().optional(),
	format: _enum([
		"email",
		"uri",
		"date",
		"date-time"
	]).optional(),
	default: string().optional()
});
/**
* Primitive schema definition for number fields.
*/
var NumberSchemaSchema = object({
	type: _enum(["number", "integer"]),
	title: string().optional(),
	description: string().optional(),
	minimum: number$1().optional(),
	maximum: number$1().optional(),
	default: number$1().optional()
});
/**
* Schema for single-selection enumeration without display titles for options.
*/
var UntitledSingleSelectEnumSchemaSchema = object({
	type: literal("string"),
	title: string().optional(),
	description: string().optional(),
	enum: array(string()),
	default: string().optional()
});
/**
* Schema for single-selection enumeration with display titles for each option.
*/
var TitledSingleSelectEnumSchemaSchema = object({
	type: literal("string"),
	title: string().optional(),
	description: string().optional(),
	oneOf: array(object({
		const: string(),
		title: string()
	})),
	default: string().optional()
});
/**
* Use {@linkcode TitledSingleSelectEnumSchema} instead.
* This interface will be removed in a future version.
*/
var LegacyTitledEnumSchemaSchema = object({
	type: literal("string"),
	title: string().optional(),
	description: string().optional(),
	enum: array(string()),
	enumNames: array(string()).optional(),
	default: string().optional()
});
var SingleSelectEnumSchemaSchema = union([UntitledSingleSelectEnumSchemaSchema, TitledSingleSelectEnumSchemaSchema]);
/**
* Schema for multiple-selection enumeration without display titles for options.
*/
var UntitledMultiSelectEnumSchemaSchema = object({
	type: literal("array"),
	title: string().optional(),
	description: string().optional(),
	minItems: number$1().optional(),
	maxItems: number$1().optional(),
	items: object({
		type: literal("string"),
		enum: array(string())
	}),
	default: array(string()).optional()
});
/**
* Schema for multiple-selection enumeration with display titles for each option.
*/
var TitledMultiSelectEnumSchemaSchema = object({
	type: literal("array"),
	title: string().optional(),
	description: string().optional(),
	minItems: number$1().optional(),
	maxItems: number$1().optional(),
	items: object({ anyOf: array(object({
		const: string(),
		title: string()
	})) }),
	default: array(string()).optional()
});
/**
* Combined schema for multiple-selection enumeration
*/
var MultiSelectEnumSchemaSchema = union([UntitledMultiSelectEnumSchemaSchema, TitledMultiSelectEnumSchemaSchema]);
/**
* Primitive schema definition for enum fields.
*/
var EnumSchemaSchema = union([
	LegacyTitledEnumSchemaSchema,
	SingleSelectEnumSchemaSchema,
	MultiSelectEnumSchemaSchema
]);
/**
* Union of all primitive schema definitions.
*/
var PrimitiveSchemaDefinitionSchema = union([
	EnumSchemaSchema,
	BooleanSchemaSchema,
	StringSchemaSchema,
	NumberSchemaSchema
]);
/**
* Parameters for an `elicitation/create` request for form-based elicitation.
*/
var ElicitRequestFormParamsSchema = TaskAugmentedRequestParamsSchema.extend({
	mode: literal("form").optional(),
	message: string(),
	requestedSchema: object({
		type: literal("object"),
		properties: record(string(), PrimitiveSchemaDefinitionSchema),
		required: array(string()).optional()
	}).catchall(unknown())
});
/**
* Parameters for an {@linkcode ElicitRequest | elicitation/create} request for URL-based elicitation.
*/
var ElicitRequestURLParamsSchema = TaskAugmentedRequestParamsSchema.extend({
	mode: literal("url"),
	message: string(),
	elicitationId: string(),
	url: string().url()
});
/**
* The parameters for a request to elicit additional information from the user via the client.
*/
var ElicitRequestParamsSchema = union([ElicitRequestFormParamsSchema, ElicitRequestURLParamsSchema]);
/**
* A request from the server to elicit user input via the client.
* The client should present the message and form fields to the user (form mode)
* or navigate to a URL (URL mode).
*/
var ElicitRequestSchema = RequestSchema.extend({
	method: literal("elicitation/create"),
	params: ElicitRequestParamsSchema
});
/**
* Parameters for a {@linkcode ElicitationCompleteNotification | notifications/elicitation/complete} notification.
*
* @deprecated Removed from the spec by #2891 (2026-07-28). The client learns the outcome
* of an out-of-band interaction by retrying the original request; no server-initiated
* completion signal exists in the 2026-07-28 revision. Kept here for the 2025-era flow
* only. The 2026-07-28 wire codec excludes this notification.
* @category notifications/elicitation/complete
*/
var ElicitationCompleteNotificationParamsSchema = NotificationsParamsSchema.extend({ elicitationId: string() });
/**
* A notification from the server to the client, informing it of a completion of an out-of-band elicitation request.
*
* @deprecated Removed from the spec by #2891 (2026-07-28). The client learns the outcome
* of an out-of-band interaction by retrying the original request; no server-initiated
* completion signal exists in the 2026-07-28 revision. Kept here for the 2025-era flow
* only. The 2026-07-28 wire codec excludes this notification.
* @category notifications/elicitation/complete
*/
var ElicitationCompleteNotificationSchema = NotificationSchema.extend({
	method: literal("notifications/elicitation/complete"),
	params: ElicitationCompleteNotificationParamsSchema
});
/**
* The client's response to an {@linkcode ElicitRequest | elicitation/create} request from the server.
*/
var ElicitResultSchema = ResultSchema.extend({
	action: _enum([
		"accept",
		"decline",
		"cancel"
	]),
	content: preprocess((val) => val === null ? void 0 : val, record(string(), union([
		string(),
		number$1(),
		boolean(),
		array(string())
	])).optional())
});
/**
* A reference to a resource or resource template definition.
*/
var ResourceTemplateReferenceSchema = object({
	type: literal("ref/resource"),
	uri: string()
});
/**
* Identifies a prompt.
*/
var PromptReferenceSchema = object({
	type: literal("ref/prompt"),
	name: string()
});
/**
* Parameters for a {@linkcode CompleteRequest | completion/complete} request.
*/
var CompleteRequestParamsSchema = BaseRequestParamsSchema.extend({
	ref: union([PromptReferenceSchema, ResourceTemplateReferenceSchema]),
	argument: object({
		name: string(),
		value: string()
	}),
	context: object({ arguments: record(string(), string()).optional() }).optional()
});
/**
* A request from the client to the server, to ask for completion options.
*/
var CompleteRequestSchema = RequestSchema.extend({
	method: literal("completion/complete"),
	params: CompleteRequestParamsSchema
});
/**
* The server's response to a {@linkcode CompleteRequest | completion/complete} request
*/
var CompleteResultSchema = ResultSchema.extend({ completion: looseObject({
	values: array(string()).max(100),
	total: optional(number$1().int()),
	hasMore: optional(boolean())
}) });
/**
* Represents a root directory or file that the server can operate on.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to passing paths via
* tool parameters, resource URIs, or configuration.
*/
var RootSchema = object({
	uri: string().startsWith("file://"),
	name: string().optional(),
	_meta: record(string(), unknown()).optional()
});
/**
* Sent from the server to request a list of root URIs from the client.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to passing paths via
* tool parameters, resource URIs, or configuration.
*/
var ListRootsRequestSchema = RequestSchema.extend({
	method: literal("roots/list"),
	params: BaseRequestParamsSchema.optional()
});
/**
* The client's response to a `roots/list` request from the server.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to passing paths via
* tool parameters, resource URIs, or configuration.
*/
var ListRootsResultSchema = ResultSchema.extend({ roots: array(RootSchema) });
/**
* A notification from the client to the server, informing it that the list of roots has changed.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to passing paths via
* tool parameters, resource URIs, or configuration.
*/
var RootsListChangedNotificationSchema = NotificationSchema.extend({
	method: literal("notifications/roots/list_changed"),
	params: NotificationsParamsSchema.optional()
});
/**
* Task creation parameters, used to ask that the server create a task to represent a request.
*
* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
*/
var TaskCreationParamsSchema = looseObject({
	ttl: number$1().optional(),
	pollInterval: number$1().optional()
});
/**
* The status of a task.
*
* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
*/
var TaskStatusSchema = _enum([
	"working",
	"input_required",
	"completed",
	"failed",
	"cancelled"
]);
/**
* A pollable state object associated with a request.
*
* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
*/
var TaskSchema = object({
	taskId: string(),
	status: TaskStatusSchema,
	ttl: union([number$1(), _null()]),
	createdAt: string(),
	lastUpdatedAt: string(),
	pollInterval: optional(number$1()),
	statusMessage: optional(string())
});
/**
* Result returned when a task is created, containing the task data wrapped in a `task` field.
*
* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
*/
var CreateTaskResultSchema = ResultSchema.extend({ task: TaskSchema });
/**
* Parameters for task status notification.
*
* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
*/
var TaskStatusNotificationParamsSchema = NotificationsParamsSchema.merge(TaskSchema);
/**
* A notification sent when a task's status changes.
*
* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
*/
var TaskStatusNotificationSchema = NotificationSchema.extend({
	method: literal("notifications/tasks/status"),
	params: TaskStatusNotificationParamsSchema
});
/**
* A request to get the state of a specific task.
*
* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
*/
var GetTaskRequestSchema = RequestSchema.extend({
	method: literal("tasks/get"),
	params: BaseRequestParamsSchema.extend({ taskId: string() })
});
/**
* The response to a {@linkcode GetTaskRequest | tasks/get} request.
*
* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
*/
var GetTaskResultSchema = ResultSchema.merge(TaskSchema);
/**
* A request to get the result of a specific task.
*
* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
*/
var GetTaskPayloadRequestSchema = RequestSchema.extend({
	method: literal("tasks/result"),
	params: BaseRequestParamsSchema.extend({ taskId: string() })
});
/**
* The response to a `tasks/result` request.
* The structure matches the result type of the original request.
* For example, a {@linkcode CallToolRequest | tools/call} task would return the `CallToolResult` structure.
*
*
* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
*/
var GetTaskPayloadResultSchema = ResultSchema.loose();
/**
* A request to list tasks.
*
* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
*/
var ListTasksRequestSchema = PaginatedRequestSchema.extend({ method: literal("tasks/list") });
/**
* The response to a {@linkcode ListTasksRequest | tasks/list} request.
*
* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
*/
var ListTasksResultSchema = PaginatedResultSchema.extend({ tasks: array(TaskSchema) });
/**
* A request to cancel a specific task.
*
* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
*/
var CancelTaskRequestSchema = RequestSchema.extend({
	method: literal("tasks/cancel"),
	params: BaseRequestParamsSchema.extend({ taskId: string() })
});
/**
* The response to a {@linkcode CancelTaskRequest | tasks/cancel} request.
*
* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
*/
var CancelTaskResultSchema = ResultSchema.merge(TaskSchema);
var ClientRequestSchema = union([
	PingRequestSchema,
	InitializeRequestSchema,
	DiscoverRequestSchema,
	CompleteRequestSchema,
	SetLevelRequestSchema,
	GetPromptRequestSchema,
	ListPromptsRequestSchema,
	ListResourcesRequestSchema,
	ListResourceTemplatesRequestSchema,
	ReadResourceRequestSchema,
	SubscribeRequestSchema,
	UnsubscribeRequestSchema,
	SubscriptionsListenRequestSchema,
	CallToolRequestSchema,
	ListToolsRequestSchema
]);
var ClientNotificationSchema = union([
	CancelledNotificationSchema,
	ProgressNotificationSchema,
	InitializedNotificationSchema,
	RootsListChangedNotificationSchema
]);
var ClientResultSchema = union([
	EmptyResultSchema,
	CreateMessageResultSchema,
	CreateMessageResultWithToolsSchema,
	ElicitResultSchema,
	ListRootsResultSchema
]);
var ServerRequestSchema = union([
	PingRequestSchema,
	CreateMessageRequestSchema,
	ElicitRequestSchema,
	ListRootsRequestSchema
]);
var ServerNotificationSchema = union([
	CancelledNotificationSchema,
	ProgressNotificationSchema,
	LoggingMessageNotificationSchema,
	ResourceUpdatedNotificationSchema,
	ResourceListChangedNotificationSchema,
	ToolListChangedNotificationSchema,
	PromptListChangedNotificationSchema,
	SubscriptionsAcknowledgedNotificationSchema,
	ElicitationCompleteNotificationSchema
]);
var ServerResultSchema = union([
	EmptyResultSchema,
	InitializeResultSchema,
	DiscoverResultSchema,
	CompleteResultSchema,
	GetPromptResultSchema,
	ListPromptsResultSchema,
	ListResourcesResultSchema,
	ListResourceTemplatesResultSchema,
	ReadResourceResultSchema,
	CallToolResultSchema,
	ListToolsResultSchema,
	SubscriptionsListenResultSchema
]);
//#endregion
//#region ../../node_modules/.pnpm/@modelcontextprotocol+core@2.4.0/node_modules/@modelcontextprotocol/core/dist/auth-UMQCo-ad.mjs
/**
* Reusable URL validation that disallows `javascript:` scheme
*/
var SafeUrlSchema = url().superRefine((val, ctx) => {
	if (!URL.canParse(val)) {
		ctx.addIssue({
			code: ZodIssueCode.custom,
			message: "URL must be parseable",
			fatal: true
		});
		return NEVER;
	}
}).refine((url) => {
	const u = new URL(url);
	return u.protocol !== "javascript:" && u.protocol !== "data:" && u.protocol !== "vbscript:";
}, { message: "URL cannot use javascript:, data:, or vbscript: scheme" });
/**
* RFC 9728 OAuth Protected Resource Metadata
*/
var OAuthProtectedResourceMetadataSchema = looseObject({
	resource: string().url(),
	authorization_servers: array(SafeUrlSchema).optional(),
	jwks_uri: string().url().optional(),
	scopes_supported: array(string()).optional(),
	bearer_methods_supported: array(string()).optional(),
	resource_signing_alg_values_supported: array(string()).optional(),
	resource_name: string().optional(),
	resource_documentation: string().optional(),
	resource_policy_uri: string().url().optional(),
	resource_tos_uri: string().url().optional(),
	tls_client_certificate_bound_access_tokens: boolean().optional(),
	authorization_details_types_supported: array(string()).optional(),
	dpop_signing_alg_values_supported: array(string()).optional(),
	dpop_bound_access_tokens_required: boolean().optional()
});
/**
* RFC 8414 OAuth 2.0 Authorization Server Metadata
*/
var OAuthMetadataSchema = looseObject({
	issuer: string(),
	authorization_endpoint: SafeUrlSchema,
	token_endpoint: SafeUrlSchema,
	registration_endpoint: SafeUrlSchema.optional(),
	scopes_supported: array(string()).optional(),
	response_types_supported: array(string()),
	response_modes_supported: array(string()).optional(),
	grant_types_supported: array(string()).optional(),
	token_endpoint_auth_methods_supported: array(string()).optional(),
	token_endpoint_auth_signing_alg_values_supported: array(string()).optional(),
	service_documentation: SafeUrlSchema.optional(),
	revocation_endpoint: SafeUrlSchema.optional(),
	revocation_endpoint_auth_methods_supported: array(string()).optional(),
	revocation_endpoint_auth_signing_alg_values_supported: array(string()).optional(),
	introspection_endpoint: string().optional(),
	introspection_endpoint_auth_methods_supported: array(string()).optional(),
	introspection_endpoint_auth_signing_alg_values_supported: array(string()).optional(),
	code_challenge_methods_supported: array(string()).optional(),
	client_id_metadata_document_supported: boolean().optional(),
	authorization_response_iss_parameter_supported: boolean().optional().catch(void 0),
	dpop_signing_alg_values_supported: array(string()).optional()
});
/**
* OpenID Connect Discovery 1.0 Provider Metadata
*
* @see https://openid.net/specs/openid-connect-discovery-1_0.html#ProviderMetadata
*/
var OpenIdProviderMetadataSchema = looseObject({
	issuer: string(),
	authorization_endpoint: SafeUrlSchema,
	token_endpoint: SafeUrlSchema,
	userinfo_endpoint: SafeUrlSchema.optional(),
	jwks_uri: SafeUrlSchema,
	registration_endpoint: SafeUrlSchema.optional(),
	scopes_supported: array(string()).optional(),
	response_types_supported: array(string()),
	response_modes_supported: array(string()).optional(),
	grant_types_supported: array(string()).optional(),
	acr_values_supported: array(string()).optional(),
	subject_types_supported: array(string()),
	id_token_signing_alg_values_supported: array(string()),
	id_token_encryption_alg_values_supported: array(string()).optional(),
	id_token_encryption_enc_values_supported: array(string()).optional(),
	userinfo_signing_alg_values_supported: array(string()).optional(),
	userinfo_encryption_alg_values_supported: array(string()).optional(),
	userinfo_encryption_enc_values_supported: array(string()).optional(),
	request_object_signing_alg_values_supported: array(string()).optional(),
	request_object_encryption_alg_values_supported: array(string()).optional(),
	request_object_encryption_enc_values_supported: array(string()).optional(),
	token_endpoint_auth_methods_supported: array(string()).optional(),
	token_endpoint_auth_signing_alg_values_supported: array(string()).optional(),
	display_values_supported: array(string()).optional(),
	claim_types_supported: array(string()).optional(),
	claims_supported: array(string()).optional(),
	service_documentation: string().optional(),
	claims_locales_supported: array(string()).optional(),
	ui_locales_supported: array(string()).optional(),
	claims_parameter_supported: boolean().optional(),
	request_parameter_supported: boolean().optional(),
	request_uri_parameter_supported: boolean().optional(),
	require_request_uri_registration: boolean().optional(),
	op_policy_uri: SafeUrlSchema.optional(),
	op_tos_uri: SafeUrlSchema.optional(),
	client_id_metadata_document_supported: boolean().optional(),
	authorization_response_iss_parameter_supported: boolean().optional().catch(void 0)
});
/**
* OpenID Connect Discovery metadata that may include OAuth 2.0 fields
* This schema represents the real-world scenario where OIDC providers
* return a mix of OpenID Connect and OAuth 2.0 metadata fields
*/
var OpenIdProviderDiscoveryMetadataSchema = object({
	...OpenIdProviderMetadataSchema.shape,
	...OAuthMetadataSchema.pick({ code_challenge_methods_supported: true }).shape
});
/**
* OAuth 2.1 token response
*/
var OAuthTokensSchema = object({
	access_token: string(),
	id_token: string().optional(),
	token_type: string(),
	expires_in: number().optional(),
	scope: string().optional(),
	refresh_token: string().optional(),
	issuer: string().optional().catch(void 0)
}).strip();
/**
* RFC 8693 §2.2.1 Token Exchange response for ID-JAG tokens.
*
* `token_type` is intentionally optional: per RFC 8693 §2.2.1 it is informational when
* the issued token is not an access token, and per RFC 6749 §5.1 it is case-insensitive,
* so strict checking rejects conformant IdPs.
*/
var IdJagTokenExchangeResponseSchema = object({
	issued_token_type: literal("urn:ietf:params:oauth:token-type:id-jag"),
	access_token: string(),
	token_type: string().optional(),
	expires_in: number$1().optional(),
	scope: string().optional()
}).strip();
/**
* OAuth 2.1 error response
*/
var OAuthErrorResponseSchema = object({
	error: string(),
	error_description: string().optional(),
	error_uri: string().optional()
});
/**
* Optional version of {@linkcode SafeUrlSchema} that allows empty string for backward compatibility on `tos_uri` and `logo_uri`
*/
var OptionalSafeUrlSchema = SafeUrlSchema.optional().or(literal("").transform(() => void 0));
/**
* RFC 7591 OAuth 2.0 Dynamic Client Registration metadata
*/
var OAuthClientMetadataSchema = object({
	redirect_uris: array(SafeUrlSchema),
	token_endpoint_auth_method: string().optional(),
	grant_types: array(string()).optional(),
	response_types: array(string()).optional(),
	application_type: string().optional(),
	client_name: string().optional(),
	client_uri: SafeUrlSchema.optional(),
	logo_uri: OptionalSafeUrlSchema,
	scope: string().optional(),
	contacts: array(string()).optional(),
	tos_uri: OptionalSafeUrlSchema,
	policy_uri: string().optional(),
	jwks_uri: SafeUrlSchema.optional(),
	jwks: any().optional(),
	software_id: string().optional(),
	software_version: string().optional(),
	software_statement: string().optional()
}).strip();
/**
* RFC 7591 OAuth 2.0 Dynamic Client Registration client information
*/
var OAuthClientInformationSchema = object({
	client_id: string(),
	client_secret: string().optional(),
	client_id_issued_at: number$1().optional(),
	client_secret_expires_at: number$1().optional(),
	issuer: string().optional().catch(void 0)
}).strip();
/**
* RFC 7591 OAuth 2.0 Dynamic Client Registration full response (client information plus metadata)
*/
var OAuthClientInformationFullSchema = OAuthClientMetadataSchema.merge(OAuthClientInformationSchema);
/**
* RFC 7591 OAuth 2.0 Dynamic Client Registration error response
*/
var OAuthClientRegistrationErrorSchema = object({
	error: string(),
	error_description: string().optional()
}).strip();
/**
* RFC 7009 OAuth 2.0 Token Revocation request
*/
var OAuthTokenRevocationRequestSchema = object({
	token: string(),
	token_type_hint: string().optional()
}).strip();
//#endregion
//#region ../../node_modules/.pnpm/@modelcontextprotocol+server@2.4.0/node_modules/@modelcontextprotocol/server/dist/src-DdvbAHrR.mjs
/**
* Cross-bundle `instanceof` support for the SDK error classes.
*
* `@modelcontextprotocol/client` and `@modelcontextprotocol/server` each bundle their
* own copy of `core-internal`, so an error constructed by one package fails a
* prototype-identity `instanceof` against the same class re-exported by the other —
* exactly the check a dual-role process (gateway, host, in-process test) writes.
*
* Instead of prototype identity, branded classes stamp every instance with the brand
* strings of its class chain under a registry symbol (`Symbol.for`, shared across
* bundles and realms), and resolve `instanceof` via `Symbol.hasInstance` against the
* brand set. Ordinary prototype-based `instanceof` is kept as a fallback so behavior
* is unchanged for anything unbranded.
*
* A class participates by defining an **own** `mcpBrand` static (via a `static {}`
* block, so nothing reaches the declaration files — a declared `protected static`
* field would make the constructor types nominally incompatible across the bundled
* copies) and (for hierarchy roots) installing {@linkcode brandedHasInstance} as
* `Symbol.hasInstance`. User-defined subclasses that do not declare their own brand
* keep plain prototype semantics — a foreign base-class instance never satisfies
* `instanceof UserSubclass`.
*
* Prior art — the same stamp-and-hook shape ships at scale elsewhere: Node core
* (stream.Writable since 2017, Console via a marker symbol, diagnostics_channel),
* undici's whole error hierarchy (vendored into Node as fetch), googleapis/gaxios
* (GaxiosError, Symbol.for marker), AWS SDK v3's ServiceException (which pairs a
* Symbol.hasInstance override with a static isInstance guard, as we do), and zod v4
* (Symbol.hasInstance on every schema class for cross-version interop).
*
* Contract notes:
* - Participation criterion: **every error class exported from a public package that
*   callers are documented to `instanceof` must be branded.** The per-package
*   errorBrandConformance tests walk the export surfaces and fail naming any
*   exported Error subclass that has not opted in.
* - Brands assert **identity, not shape**: brand strings are version-less, so an
*   instance from one SDK version matches the class of another. Members added to a
*   branded class in a later version may be absent on a matched instance — read
*   fields defensively, and treat branded classes as additive-only. The escape
*   hatch when a release must break a branded class's read contract: change that
*   class's brand string in the same release, which cleanly severs cross-version
*   matching for that class. The per-package brand pins make the rename
*   deliberate: errorSurfacePins.test.ts owns the core-internal brands, and each
*   package's errorBrandConformance test pins its package-local ones.
* - Cross-bundle matching requires **both** copies to be at or after the release
*   that introduced branding; against an older copy, behavior degrades to plain
*   prototype `instanceof` in both directions.
* - A consumer re-bundling the SDK with property mangling (`mangle.props`) would
*   break the brand statics; default esbuild/webpack/terser settings do not.
*/
/** Registry symbol — identical across bundled copies and realms. */
var BRANDS = Symbol.for("mcp.sdk.errorBrands");
/**
* Stamp `instance` with the brand of every class in `ctor`'s chain that declares an
* own `mcpBrand`. Call once from the hierarchy root's constructor with `new.target` —
* subclasses inherit the stamping without touching their constructors.
*
* Constructor-time only: never stamp arbitrary objects. A stamped non-instance would
* satisfy `instanceof` while lacking the prototype members (getters like `.status`)
* that callers reach for after the check.
*/
function stampErrorBrands(instance, ctor) {
	const brands = /* @__PURE__ */ new Set();
	let current = ctor;
	while (typeof current === "function") {
		const brand = current.mcpBrand;
		if (Object.prototype.hasOwnProperty.call(current, "mcpBrand") && typeof brand === "string") brands.add(brand);
		current = Object.getPrototypeOf(current);
	}
	if (brands.size === 0) return;
	Object.defineProperty(instance, BRANDS, {
		value: brands,
		enumerable: false,
		configurable: true
	});
}
/**
* `Symbol.hasInstance` implementation for branded hierarchy roots. Matches when the
* value carries the **own** brand of the class being tested against (cross-bundle
* path), falling back to ordinary prototype-based `instanceof` otherwise.
*/
function brandedHasInstance(cls, value) {
	try {
		if (typeof value === "object" && value !== null && Object.prototype.hasOwnProperty.call(cls, "mcpBrand") && typeof cls.mcpBrand === "string" && Object.prototype.hasOwnProperty.call(value, BRANDS)) {
			const carried = value[BRANDS];
			if (carried && typeof carried.has === "function" && carried.has(cls.mcpBrand)) return true;
		}
	} catch {}
	return Function.prototype[Symbol.hasInstance].call(cls, value);
}
(class OAuthError extends Error {
	static {
		Object.defineProperty(this, "mcpBrand", { value: "mcp.OAuthError" });
	}
	static [Symbol.hasInstance](value) {
		return brandedHasInstance(this, value);
	}
	/**
	* Brand-based type guard: equivalent to `value instanceof this`, as an
	* explicit static predicate (the axios/AWS-SDK `isInstance` style). Reads
	* the caller's own brand via `this`, so every branded subclass gets a
	* correctly-scoped guard by inheritance. Must be invoked on the class —
	* in callback position write `v => SdkError.isInstance(v)`, not
	* `.filter(SdkError.isInstance)` (detached calls throw rather than
	* silently matching nothing).
	*/
	static isInstance(value) {
		if (typeof this !== "function") throw new TypeError("isInstance must be called on the class (e.g. `SdkError.isInstance(value)`); for callbacks use `v => SdkError.isInstance(v)`");
		return brandedHasInstance(this, value);
	}
	constructor(code, message, errorUri) {
		super(message);
		this.code = code;
		this.errorUri = errorUri;
		this.name = "OAuthError";
		stampErrorBrands(this, new.target);
	}
	/**
	* Converts the error to a standard OAuth error response object.
	*/
	toResponseObject() {
		const response = {
			error: this.code,
			error_description: this.message
		};
		if (this.errorUri) response.error_uri = this.errorUri;
		return response;
	}
	/**
	* Creates an {@linkcode OAuthError} from an OAuth error response.
	*/
	static fromResponse(response) {
		return new OAuthError(response.error, response.error_description ?? response.error, response.error_uri);
	}
});
/**
* Error codes for SDK errors (local errors that never cross the wire).
* Unlike {@linkcode ProtocolErrorCode} which uses numeric JSON-RPC codes, `SdkErrorCode` uses
* descriptive string values for better developer experience.
*
* These errors are thrown locally by the SDK and are never serialized as
* JSON-RPC error responses.
*/
var SdkErrorCode = /* @__PURE__ */ function(SdkErrorCode$1) {
	/** Transport is not connected */
	SdkErrorCode$1["NotConnected"] = "NOT_CONNECTED";
	/** Transport is already connected */
	SdkErrorCode$1["AlreadyConnected"] = "ALREADY_CONNECTED";
	/** Protocol is not initialized */
	SdkErrorCode$1["NotInitialized"] = "NOT_INITIALIZED";
	/** Required capability is not supported by the remote side */
	SdkErrorCode$1["CapabilityNotSupported"] = "CAPABILITY_NOT_SUPPORTED";
	/** Request timed out waiting for response */
	SdkErrorCode$1["RequestTimeout"] = "REQUEST_TIMEOUT";
	/** Connection was closed */
	SdkErrorCode$1["ConnectionClosed"] = "CONNECTION_CLOSED";
	/** Failed to send message */
	SdkErrorCode$1["SendFailed"] = "SEND_FAILED";
	/** Response result failed local schema validation */
	SdkErrorCode$1["InvalidResult"] = "INVALID_RESULT";
	/**
	* The response carried a `resultType` discriminator (protocol revision
	* 2026-07-28) naming a result kind this client cannot consume yet, e.g.
	* `input_required`. The kind is carried in `data.resultType`.
	*/
	SdkErrorCode$1["UnsupportedResultType"] = "UNSUPPORTED_RESULT_TYPE";
	/**
	* The multi-round-trip auto-fulfilment driver exhausted its round cap
	* (`inputRequired.maxRounds`) without the server returning a complete
	* result. `data.rounds` carries the cap that was hit and
	* `data.lastResult` carries the last `input_required` payload received
	* (`{ inputRequests, requestState? }`), so callers can inspect or resume
	* the flow manually.
	*/
	SdkErrorCode$1["InputRequiredRoundsExceeded"] = "INPUT_REQUIRED_ROUNDS_EXCEEDED";
	/**
	* The auto-aggregating no-`cursor` `listTools()` / `listPrompts()` /
	* `listResources()` / `listResourceTemplates()` walk hit the
	* `ClientOptions.listMaxPages` cap without the server's pagination
	* converging. `data.method` carries the list verb and
	* `data.listMaxPages` the cap that was hit; raise the cap or fall back to
	* explicit per-page `{ cursor }` calls.
	*/
	SdkErrorCode$1["ListPaginationExceeded"] = "LIST_PAGINATION_EXCEEDED";
	/**
	* The spec method being sent does not exist on the negotiated protocol
	* version's wire era (e.g. `tasks/get` toward a 2026-07-28 peer, or
	* `server/discover` toward a 2025-era peer). Raised locally, before
	* anything reaches the transport. The method and era are carried in
	* `data.method` / `data.era`.
	*/
	SdkErrorCode$1["MethodNotSupportedByProtocolVersion"] = "METHOD_NOT_SUPPORTED_BY_PROTOCOL_VERSION";
	/**
	* Protocol-era negotiation at connect time failed without producing either a
	* usable modern (2026-07-28+) era or a definitive legacy fallback signal —
	* e.g. the negotiation mode forbids falling back (`pin`), the probe hit a
	* network failure, or the server answered the probe with a 5xx (a typed
	* connect error, never an era verdict).
	*
	* Negotiation-phase only: this code is never used once an era is
	* established. Auth walls never carry it: a 401/403 rejecting the probe
	* uses {@linkcode ClientHttpAuthentication} / {@linkcode ClientHttpForbidden}
	* instead, so era-recovery flows keyed on this code (e.g. cached-verdict
	* gateways) can never persist a verdict for an unauthorized exchange.
	*/
	SdkErrorCode$1["EraNegotiationFailed"] = "ERA_NEGOTIATION_FAILED";
	SdkErrorCode$1["ClientHttpNotImplemented"] = "CLIENT_HTTP_NOT_IMPLEMENTED";
	/**
	* HTTP 401 authentication failure: the transport's re-auth retry still got
	* 401 (`Server returned 401 after re-authentication`), or the version
	* negotiation probe was rejected 401 with no `authProvider` configured
	* (`Version negotiation failed: the server requires authorization (HTTP 401)`).
	* Carried on an {@linkcode SdkHttpError} with `status: 401`.
	*/
	SdkErrorCode$1["ClientHttpAuthentication"] = "CLIENT_HTTP_AUTHENTICATION";
	/**
	* HTTP 403 denial: the step-up re-authorization retry limit was reached,
	* or the version negotiation probe was rejected 403
	* (`Version negotiation failed: the server denied access (HTTP 403)`).
	* Carried on an {@linkcode SdkHttpError} with `status: 403`.
	*/
	SdkErrorCode$1["ClientHttpForbidden"] = "CLIENT_HTTP_FORBIDDEN";
	SdkErrorCode$1["ClientHttpUnexpectedContent"] = "CLIENT_HTTP_UNEXPECTED_CONTENT";
	SdkErrorCode$1["ClientHttpFailedToOpenStream"] = "CLIENT_HTTP_FAILED_TO_OPEN_STREAM";
	SdkErrorCode$1["ClientHttpFailedToTerminateSession"] = "CLIENT_HTTP_FAILED_TO_TERMINATE_SESSION";
	return SdkErrorCode$1;
}({});
/**
* SDK errors are local errors that never cross the wire.
* They are distinct from {@linkcode ProtocolError} which represents JSON-RPC protocol errors
* that are serialized and sent as error responses.
*
* @example
* ```ts source="./sdkErrors.examples.ts#SdkError_basicUsage"
* try {
*     // Throwing an SDK error
*     throw new SdkError(SdkErrorCode.NotConnected, 'Transport is not connected');
* } catch (error) {
*     // Checking error type by code
*     if (error instanceof SdkError && error.code === SdkErrorCode.RequestTimeout) {
*         // Handle timeout
*     }
* }
* ```
*/
var SdkError = class extends Error {
	static {
		Object.defineProperty(this, "mcpBrand", { value: "mcp.SdkError" });
	}
	static [Symbol.hasInstance](value) {
		return brandedHasInstance(this, value);
	}
	/**
	* Brand-based type guard: equivalent to `value instanceof this`, as an
	* explicit static predicate (the axios/AWS-SDK `isInstance` style). Reads
	* the caller's own brand via `this`, so every branded subclass gets a
	* correctly-scoped guard by inheritance. Must be invoked on the class —
	* in callback position write `v => SdkError.isInstance(v)`, not
	* `.filter(SdkError.isInstance)` (detached calls throw rather than
	* silently matching nothing).
	*/
	static isInstance(value) {
		if (typeof this !== "function") throw new TypeError("isInstance must be called on the class (e.g. `SdkError.isInstance(value)`); for callbacks use `v => SdkError.isInstance(v)`");
		return brandedHasInstance(this, value);
	}
	/**
	* @param code - Stable string code identifying the failure ({@linkcode SdkErrorCode}).
	* @param message - Human-readable description.
	* @param data - Optional structured payload (for example the HTTP status carried by
	* {@linkcode SdkHttpError}). Opaque to the SDK: a `cause` key inside `data` is not
	* promoted to `Error.cause`.
	* @param options - Standard `ErrorOptions`, forwarded to `Error`. Pass the underlying
	* failure as `{ cause }` so it is reachable through the `Error.cause` chain that
	* loggers and error trackers walk.
	*/
	constructor(code, message, data, options) {
		super(message, options);
		this.code = code;
		this.data = data;
		this.name = "SdkError";
		stampErrorBrands(this, new.target);
	}
};
/**
* An {@linkcode SdkError} subclass for HTTP transport failures.
*
* Thrown by the streamable HTTP transport when the server responds with a
* non-OK status code. Narrows {@linkcode SdkError.data | data} to
* {@linkcode SdkHttpErrorData} so consumers can inspect the HTTP status
* without unsafe casting.
*
* @example
* ```ts source="./sdkErrors.examples.ts#SdkHttpError_basicUsage"
* if (error instanceof SdkHttpError) {
*     console.log(error.status); // number
*     console.log(error.statusText); // string | undefined
* }
* ```
*/
var SdkHttpError = class extends SdkError {
	static {
		Object.defineProperty(this, "mcpBrand", { value: "mcp.SdkHttpError" });
	}
	/**
	* @param options - Standard `ErrorOptions`, forwarded to `Error` (see {@linkcode SdkError}).
	*/
	constructor(code, message, data, options) {
		super(code, message, data, options);
		this.name = "SdkHttpError";
	}
	get status() {
		return this.data.status;
	}
	get statusText() {
		return this.data.statusText;
	}
};
function isPlainObject$7(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
/**
* Whether a required nested member counts as declared even though it is not
* spelled out: a bare `elicitation: {}` declaration (no mode sub-capability at
* all) is read as form support — the pre-mode (2025) meaning of a bare
* declaration — so an `elicitation.form` requirement treats it as satisfied.
* Declaring any mode explicitly (for example `elicitation: { url: {} }`)
* removes the implication.
*/
function isImpliedCapabilityMember(capability, member, declaredValue) {
	return capability === "elicitation" && member === "form" && declaredValue["form"] === void 0 && declaredValue["url"] === void 0;
}
/**
* The client capabilities an embedded multi-round-trip input request requires
* (call site 2 — the outbound input-request leg): a server MUST NOT send an
* `inputRequests` kind the request's declared client capabilities do not
* cover. Returns `undefined` for entries whose method is not one of the
* embedded input-request kinds (those are a server bug handled separately,
* not a capability question).
*
* The requirement is mode-aware where the capability is: URL-mode elicitation
* requires `elicitation.url`; form-mode (or mode-omitted) elicitation requires
* `elicitation.form` (modes are sub-capabilities, and a server MUST NOT send a
* mode the client did not declare); sampling with `tools`/`toolChoice`
* requires `sampling.tools`. A bare `elicitation: {}` declaration satisfies
* the form requirement — see {@linkcode missingClientCapabilities}.
*/
function requiredClientCapabilitiesForInputRequest(entry) {
	switch (entry.method) {
		case "elicitation/create":
			if (entry.params?.["mode"] === "url") return { elicitation: { url: {} } };
			return { elicitation: { form: {} } };
		case "sampling/createMessage": {
			const params = entry.params;
			if (params !== void 0 && (params["tools"] !== void 0 || params["toolChoice"] !== void 0)) return { sampling: { tools: {} } };
			return { sampling: {} };
		}
		case "roots/list": return { roots: {} };
		default: return;
	}
}
/**
* Computes the subset of `required` client capabilities the client did not
* declare. Returns `undefined` when every required capability is declared;
* otherwise returns an object in the `ClientCapabilities` shape containing
* exactly the missing capabilities (suitable for
* `data.requiredCapabilities` on the `-32021` error).
*
* A capability counts as declared when its top-level key is present on the
* declared capabilities; when the requirement names nested members (for
* example `elicitation: { url: {} }`), each named member must also be present
* under the declared capability. One lenient reading applies: a bare
* `elicitation: {}` declaration (no mode sub-capability at all) counts as
* declaring `elicitation.form` — the pre-mode (2025) meaning of a bare
* declaration. An absent or empty `declared` value means
* nothing is declared — every required capability is missing (the structural
* clean-refusal posture for sessions with no per-request capability view).
*/
function missingClientCapabilities(required, declared) {
	const missing = {};
	for (const [capability, requirement] of Object.entries(required)) {
		if (requirement === void 0) continue;
		const declaredValue = declared === void 0 ? void 0 : declared[capability];
		if (declaredValue === void 0) {
			missing[capability] = requirement;
			continue;
		}
		if (isPlainObject$7(requirement) && isPlainObject$7(declaredValue)) {
			const missingMembers = {};
			for (const [member, memberRequirement] of Object.entries(requirement)) if (memberRequirement !== void 0 && declaredValue[member] === void 0 && !isImpliedCapabilityMember(capability, member, declaredValue)) missingMembers[member] = memberRequirement;
			if (Object.keys(missingMembers).length > 0) missing[capability] = missingMembers;
		}
	}
	return Object.keys(missing).length > 0 ? missing : void 0;
}
/**
* The first protocol revision of the modern (2026-07-28) era. Revision identifiers
* are ISO dates, so lexicographic comparison orders them chronologically.
*/
var FIRST_MODERN_PROTOCOL_VERSION = "2026-07-28";
/**
* Modern-era protocol revisions this SDK can negotiate via `server/discover`.
* Deliberately separate from {@linkcode SUPPORTED_PROTOCOL_VERSIONS} (the legacy
* `initialize` list), so adding a revision here can never leak a modern version
* string into a 2025-era handshake. Internal — not part of the public API surface.
*/
var SUPPORTED_MODERN_PROTOCOL_VERSIONS = [FIRST_MODERN_PROTOCOL_VERSION];
/** Whether the given protocol revision belongs to the modern (2026-07-28+) era. */
function isModernProtocolVersion(version) {
	return version >= FIRST_MODERN_PROTOCOL_VERSION;
}
/** The legacy-era (pre-2026-07-28) subset of a supported-versions list, in the list's own preference order. */
function legacyProtocolVersions(versions) {
	return versions.filter((version) => !isModernProtocolVersion(version));
}
/** The modern-era (2026-07-28+) subset of a supported-versions list, in the list's own preference order. */
function modernProtocolVersions(versions) {
	return versions.filter((version) => isModernProtocolVersion(version));
}
/**
* SEP-2106 §4.3 TextContent auto-append, era-agnostic, called from BOTH
* codecs' {@link WireCodec.projectCallToolResult}: when `structuredContent`
* is a non-object value (array/primitive/`null`) and the handler authored no
* `type:'text'` block, append `{type:'text', text: JSON.stringify(value)}`.
* Object-shaped (or absent) `structuredContent` returns the same reference.
*
* Leaf module: imported by both era codec modules, so it must NOT import from
* `./codec.js` (which value-imports the rev codecs at top level — that would
* make a runtime cycle and a TDZ hazard for entries that evaluate a rev codec
* module first).
*/
function appendTextFallbackForNonObject(result) {
	const sc = result.structuredContent;
	if (sc === void 0) return result;
	if (!(typeof sc !== "object" || sc === null || Array.isArray(sc))) return result;
	if (result.content?.some((c) => c.type === "text") ?? false) return result;
	return {
		...result,
		content: [...result.content ?? [], {
			type: "text",
			text: JSON.stringify(sc)
		}]
	};
}
/**
* Result-family keys that must never default into a `{content: []}` tools/call
* success. Shared by the 2025 wire-seam schema and server normalization.
* Leaf module (like `textFallback.ts`): imported by registry/server paths, so
* it must NOT import from `./codec.js` — that would close a runtime cycle.
*/
var TOOL_RESULT_FOREIGN_FAMILY_KEYS = [
	"task",
	"inputRequests",
	"requestState"
];
/**
* Single owner of the v1-parity ruling: a plain-object tool result without `content` (and
* without foreign-family keys) gains `content: []`. Shared by the 2025 wire seam and server-side handler normalization.
*/
function normalizeContentlessToolResult(value) {
	if (value === null || typeof value !== "object" || Array.isArray(value) || value.content !== void 0 || TOOL_RESULT_FOREIGN_FAMILY_KEYS.some((key) => key in value)) return value;
	return {
		...value,
		content: []
	};
}
/**
* Complete frozen 2025-11-25 wire schemas. Self-contained — no imports from
* the public/neutral types/schemas.ts. The neutral layer is the public-API
* superset and is free to evolve (e.g., SEP-2106 widening); this file is the
* 2025 wire-parse contract (Q10-L2 byte-identity) and is BEHAVIOR-FROZEN.
*
* This is the era's complete frozen wire-parse contract — both the 2025-only
* delta (the deprecated task family, the era role unions) AND frozen copies of
* every era-shared shape (Tool, CallToolResult, Initialize*, ContentBlock,
* prompts/resources/completion/elicitation, …). The 2026-era codec
* (`wire/rev2026-07-28/`) is symmetrically self-contained in the same way.
*
* The 2025-only delta (the task message surface, restored types-only by #2248
* for interop with task-capable 2025 peers) is parsed ONLY through this era's
* registry; the deprecated Task* schemas also live (marked `@deprecated`) in
* the neutral schema layer so the public types stay nameable without a
* cross-layer import — nameability is constant, runtime availability is
* version-keyed — but appear in no API signature. Q1 increment 2 — deletions
* are physical: the
* 2026-era REGISTRY has no Task* methods (its frozen building-block copies do
* carry the deprecated Task* sub-schemas by composition — soft contamination,
* tracked for anchor-exactness adjudication).
*
* The only cross-layer dependency is `import type { JSONObject, JSONValue }`
* from the neutral types barrel — pure structural type aliases with no parse
* behavior. No runtime schema is shared with the neutral layer.
*/
function build$1() {
	const JSONValueSchema$1 = lazy(() => union([
		string(),
		number$1(),
		boolean(),
		_null(),
		record(string(), JSONValueSchema$1),
		array(JSONValueSchema$1)
	]));
	const JSONObjectSchema$1 = record(string(), JSONValueSchema$1);
	/**
	* A progress token, used to associate progress notifications with the original request.
	*/
	const ProgressTokenSchema$1 = union([string(), number$1().int()]);
	/**
	* An opaque token used to represent a cursor for pagination.
	*/
	const CursorSchema$1 = string();
	/** @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only. */
	const TaskMetadataSchema$1 = object({ ttl: number$1().optional() });
	/**
	* Metadata for associating messages with a task.
	* Include this in the `_meta` field under the key `io.modelcontextprotocol/related-task`.
	*
	* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
	*/
	const RelatedTaskMetadataSchema$1 = object({ taskId: string() });
	const RequestMetaSchema$1 = looseObject({
		progressToken: ProgressTokenSchema$1.optional(),
		"io.modelcontextprotocol/related-task": RelatedTaskMetadataSchema$1.optional()
	});
	/**
	* Common params for any request.
	*/
	const BaseRequestParamsSchema$1 = object({ _meta: RequestMetaSchema$1.optional() });
	/**
	* Common params for any task-augmented request.
	*
	* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
	*/
	const TaskAugmentedRequestParamsSchema$1 = BaseRequestParamsSchema$1.extend({ task: TaskMetadataSchema$1.optional() });
	const RequestSchema$1 = object({
		method: string(),
		params: BaseRequestParamsSchema$1.loose().optional()
	});
	const NotificationsParamsSchema$1 = object({ _meta: RequestMetaSchema$1.optional() });
	const NotificationSchema$1 = object({
		method: string(),
		params: NotificationsParamsSchema$1.loose().optional()
	});
	const ResultSchema$1 = looseObject({ _meta: RequestMetaSchema$1.optional() });
	/**
	* A uniquely identifying ID for a request in JSON-RPC.
	*/
	const RequestIdSchema$1 = union([string(), number$1().int()]);
	/**
	* A response that indicates success but carries no data.
	*/
	const EmptyResultSchema$1 = ResultSchema$1.strict();
	const CancelledNotificationParamsSchema$1 = NotificationsParamsSchema$1.extend({
		requestId: RequestIdSchema$1.optional(),
		reason: string().optional()
	});
	/**
	* This notification can be sent by either side to indicate that it is cancelling a previously-issued request.
	*
	* The request SHOULD still be in-flight, but due to communication latency, it is always possible that this notification MAY arrive after the request has already finished.
	*
	* This notification indicates that the result will be unused, so any associated processing SHOULD cease.
	*
	* A client MUST NOT attempt to cancel its {@linkcode InitializeRequest | initialize} request.
	*/
	const CancelledNotificationSchema$1 = NotificationSchema$1.extend({
		method: literal("notifications/cancelled"),
		params: CancelledNotificationParamsSchema$1
	});
	/**
	* Icon schema for use in {@link Tool | tools}, {@link Prompt | prompts}, {@link Resource | resources}, and {@link Implementation | implementations}.
	*/
	const IconSchema$1 = object({
		src: string(),
		mimeType: string().optional(),
		sizes: array(string()).optional(),
		theme: _enum(["light", "dark"]).optional()
	});
	/**
	* Base schema to add `icons` property.
	*
	*/
	const IconsSchema$1 = object({ icons: array(IconSchema$1).optional() });
	/**
	* Base metadata interface for common properties across {@link Resource | resources}, {@link Tool | tools}, {@link Prompt | prompts}, and {@link Implementation | implementations}.
	*/
	const BaseMetadataSchema$1 = object({
		name: string(),
		title: string().optional()
	});
	/**
	* Describes the name and version of an MCP implementation.
	*/
	const ImplementationSchema$1 = BaseMetadataSchema$1.extend({
		...BaseMetadataSchema$1.shape,
		...IconsSchema$1.shape,
		version: string(),
		websiteUrl: string().optional(),
		description: string().optional()
	});
	const FormElicitationCapabilitySchema = intersection(object({ applyDefaults: boolean().optional() }), JSONObjectSchema$1);
	const ElicitationCapabilitySchema = preprocess((value) => {
		if (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0) return { form: {} };
		return value;
	}, intersection(object({
		form: FormElicitationCapabilitySchema.optional(),
		url: JSONObjectSchema$1.optional()
	}), JSONObjectSchema$1.optional()));
	/**
	* Task capabilities for clients, indicating which request types support task creation.
	*
	* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
	*/
	const ClientTasksCapabilitySchema$1 = looseObject({
		list: JSONObjectSchema$1.optional(),
		cancel: JSONObjectSchema$1.optional(),
		requests: looseObject({
			sampling: looseObject({ createMessage: JSONObjectSchema$1.optional() }).optional(),
			elicitation: looseObject({ create: JSONObjectSchema$1.optional() }).optional()
		}).optional()
	});
	/**
	* Task capabilities for servers, indicating which request types support task creation.
	*
	* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
	*/
	const ServerTasksCapabilitySchema$1 = looseObject({
		list: JSONObjectSchema$1.optional(),
		cancel: JSONObjectSchema$1.optional(),
		requests: looseObject({ tools: looseObject({ call: JSONObjectSchema$1.optional() }).optional() }).optional()
	});
	/**
	* Capabilities a client may support. Known capabilities are defined here, in this schema, but this is not a closed set: any client can define its own, additional capabilities.
	*/
	const ClientCapabilitiesSchema$1 = object({
		experimental: record(string(), JSONObjectSchema$1).optional(),
		sampling: object({
			context: JSONObjectSchema$1.optional(),
			tools: JSONObjectSchema$1.optional()
		}).optional(),
		elicitation: ElicitationCapabilitySchema.optional(),
		roots: object({ listChanged: boolean().optional() }).optional(),
		tasks: ClientTasksCapabilitySchema$1.optional(),
		extensions: record(string(), JSONObjectSchema$1).optional()
	});
	const InitializeRequestParamsSchema$1 = BaseRequestParamsSchema$1.extend({
		protocolVersion: string(),
		capabilities: ClientCapabilitiesSchema$1,
		clientInfo: ImplementationSchema$1
	});
	/**
	* This request is sent from the client to the server when it first connects, asking it to begin initialization.
	*/
	const InitializeRequestSchema$1 = RequestSchema$1.extend({
		method: literal("initialize"),
		params: InitializeRequestParamsSchema$1
	});
	/**
	* Capabilities that a server may support. Known capabilities are defined here, in this schema, but this is not a closed set: any server can define its own, additional capabilities.
	*/
	const ServerCapabilitiesSchema$1 = object({
		experimental: record(string(), JSONObjectSchema$1).optional(),
		logging: JSONObjectSchema$1.optional(),
		completions: JSONObjectSchema$1.optional(),
		prompts: object({ listChanged: boolean().optional() }).optional(),
		resources: object({
			subscribe: boolean().optional(),
			listChanged: boolean().optional()
		}).optional(),
		tools: object({ listChanged: boolean().optional() }).optional(),
		tasks: ServerTasksCapabilitySchema$1.optional(),
		extensions: record(string(), JSONObjectSchema$1).optional()
	});
	/**
	* After receiving an initialize request from the client, the server sends this response.
	*/
	const InitializeResultSchema$1 = ResultSchema$1.extend({
		protocolVersion: string(),
		capabilities: ServerCapabilitiesSchema$1,
		serverInfo: ImplementationSchema$1,
		instructions: string().optional()
	});
	/**
	* This notification is sent from the client to the server after initialization has finished.
	*/
	const InitializedNotificationSchema$1 = NotificationSchema$1.extend({
		method: literal("notifications/initialized"),
		params: NotificationsParamsSchema$1.optional()
	});
	/**
	* A ping, issued by either the server or the client, to check that the other party is still alive. The receiver must promptly respond, or else may be disconnected.
	*/
	const PingRequestSchema$1 = RequestSchema$1.extend({
		method: literal("ping"),
		params: BaseRequestParamsSchema$1.optional()
	});
	const ProgressSchema$1 = object({
		progress: number$1(),
		total: optional(number$1()),
		message: optional(string())
	});
	const ProgressNotificationParamsSchema$1 = object({
		...NotificationsParamsSchema$1.shape,
		...ProgressSchema$1.shape,
		progressToken: ProgressTokenSchema$1
	});
	/**
	* An out-of-band notification used to inform the receiver of a progress update for a long-running request.
	*
	* @category notifications/progress
	*/
	const ProgressNotificationSchema$1 = NotificationSchema$1.extend({
		method: literal("notifications/progress"),
		params: ProgressNotificationParamsSchema$1
	});
	const PaginatedRequestParamsSchema$1 = BaseRequestParamsSchema$1.extend({ cursor: CursorSchema$1.optional() });
	const PaginatedRequestSchema$1 = RequestSchema$1.extend({ params: PaginatedRequestParamsSchema$1.optional() });
	const PaginatedResultSchema$1 = ResultSchema$1.extend({ nextCursor: CursorSchema$1.optional() });
	/**
	* The contents of a specific resource or sub-resource.
	*/
	const ResourceContentsSchema$1 = object({
		uri: string(),
		mimeType: optional(string()),
		_meta: record(string(), unknown()).optional()
	});
	const TextResourceContentsSchema$1 = ResourceContentsSchema$1.extend({ text: string() });
	/**
	* A Zod schema for validating Base64 strings that is more performant and
	* robust for very large inputs than the default regex-based check. It avoids
	* stack overflows by using the native `atob` function for validation.
	*/
	const Base64Schema = string().refine((val) => {
		try {
			atob(val);
			return true;
		} catch {
			return false;
		}
	}, { message: "Invalid Base64 string" });
	const BlobResourceContentsSchema$1 = ResourceContentsSchema$1.extend({ blob: Base64Schema });
	/**
	* The sender or recipient of messages and data in a conversation.
	*/
	const RoleSchema$1 = _enum(["user", "assistant"]);
	/**
	* Optional annotations providing clients additional context about a resource.
	*/
	const AnnotationsSchema$1 = object({
		audience: array(RoleSchema$1).optional(),
		priority: number$1().min(0).max(1).optional(),
		lastModified: datetime({ offset: true }).optional()
	});
	/**
	* A known resource that the server is capable of reading.
	*/
	const ResourceSchema$1 = object({
		...BaseMetadataSchema$1.shape,
		...IconsSchema$1.shape,
		uri: string(),
		description: optional(string()),
		mimeType: optional(string()),
		size: optional(number$1()),
		annotations: AnnotationsSchema$1.optional(),
		_meta: optional(looseObject({}))
	});
	/**
	* A template description for resources available on the server.
	*/
	const ResourceTemplateSchema$1 = object({
		...BaseMetadataSchema$1.shape,
		...IconsSchema$1.shape,
		uriTemplate: string(),
		description: optional(string()),
		mimeType: optional(string()),
		annotations: AnnotationsSchema$1.optional(),
		_meta: optional(looseObject({}))
	});
	/**
	* Sent from the client to request a list of resources the server has.
	*/
	const ListResourcesRequestSchema$1 = PaginatedRequestSchema$1.extend({ method: literal("resources/list") });
	/**
	* The server's response to a {@linkcode ListResourcesRequest | resources/list} request from the client.
	*/
	const ListResourcesResultSchema$1 = PaginatedResultSchema$1.extend({ resources: array(ResourceSchema$1) });
	/**
	* Sent from the client to request a list of resource templates the server has.
	*/
	const ListResourceTemplatesRequestSchema$1 = PaginatedRequestSchema$1.extend({ method: literal("resources/templates/list") });
	/**
	* The server's response to a {@linkcode ListResourceTemplatesRequest | resources/templates/list} request from the client.
	*/
	const ListResourceTemplatesResultSchema$1 = PaginatedResultSchema$1.extend({ resourceTemplates: array(ResourceTemplateSchema$1) });
	const ResourceRequestParamsSchema$1 = BaseRequestParamsSchema$1.extend({ uri: string() });
	/**
	* Parameters for a {@linkcode ReadResourceRequest | resources/read} request.
	*/
	const ReadResourceRequestParamsSchema$1 = ResourceRequestParamsSchema$1;
	/**
	* Sent from the client to the server, to read a specific resource URI.
	*/
	const ReadResourceRequestSchema$1 = RequestSchema$1.extend({
		method: literal("resources/read"),
		params: ReadResourceRequestParamsSchema$1
	});
	/**
	* The server's response to a {@linkcode ReadResourceRequest | resources/read} request from the client.
	*/
	const ReadResourceResultSchema$1 = ResultSchema$1.extend({ contents: array(union([TextResourceContentsSchema$1, BlobResourceContentsSchema$1])) });
	/**
	* An optional notification from the server to the client, informing it that the list of resources it can read from has changed. This may be issued by servers without any previous subscription from the client.
	*/
	const ResourceListChangedNotificationSchema$1 = NotificationSchema$1.extend({
		method: literal("notifications/resources/list_changed"),
		params: NotificationsParamsSchema$1.optional()
	});
	const SubscribeRequestParamsSchema$1 = ResourceRequestParamsSchema$1;
	/**
	* Sent from the client to request `resources/updated` notifications from the server whenever a particular resource changes.
	*/
	const SubscribeRequestSchema$1 = RequestSchema$1.extend({
		method: literal("resources/subscribe"),
		params: SubscribeRequestParamsSchema$1
	});
	const UnsubscribeRequestParamsSchema$1 = ResourceRequestParamsSchema$1;
	/**
	* Sent from the client to request cancellation of {@linkcode ResourceUpdatedNotification | resources/updated} notifications from the server. This should follow a previous {@linkcode SubscribeRequest | resources/subscribe} request.
	*/
	const UnsubscribeRequestSchema$1 = RequestSchema$1.extend({
		method: literal("resources/unsubscribe"),
		params: UnsubscribeRequestParamsSchema$1
	});
	/**
	* Parameters for a {@linkcode ResourceUpdatedNotification | notifications/resources/updated} notification.
	*/
	const ResourceUpdatedNotificationParamsSchema$1 = NotificationsParamsSchema$1.extend({ uri: string() });
	/**
	* A notification from the server to the client, informing it that a resource has changed and may need to be read again. This should only be sent if the client previously sent a {@linkcode SubscribeRequest | resources/subscribe} request.
	*/
	const ResourceUpdatedNotificationSchema$1 = NotificationSchema$1.extend({
		method: literal("notifications/resources/updated"),
		params: ResourceUpdatedNotificationParamsSchema$1
	});
	/**
	* Describes an argument that a prompt can accept.
	*/
	const PromptArgumentSchema$1 = object({
		name: string(),
		description: optional(string()),
		required: optional(boolean())
	});
	/**
	* A prompt or prompt template that the server offers.
	*/
	const PromptSchema$1 = object({
		...BaseMetadataSchema$1.shape,
		...IconsSchema$1.shape,
		description: optional(string()),
		arguments: optional(array(PromptArgumentSchema$1)),
		_meta: optional(looseObject({}))
	});
	/**
	* Sent from the client to request a list of prompts and prompt templates the server has.
	*/
	const ListPromptsRequestSchema$1 = PaginatedRequestSchema$1.extend({ method: literal("prompts/list") });
	/**
	* The server's response to a {@linkcode ListPromptsRequest | prompts/list} request from the client.
	*/
	const ListPromptsResultSchema$1 = PaginatedResultSchema$1.extend({ prompts: array(PromptSchema$1) });
	/**
	* Parameters for a {@linkcode GetPromptRequest | prompts/get} request.
	*/
	const GetPromptRequestParamsSchema$1 = BaseRequestParamsSchema$1.extend({
		name: string(),
		arguments: record(string(), string()).optional()
	});
	/**
	* Used by the client to get a prompt provided by the server.
	*/
	const GetPromptRequestSchema$1 = RequestSchema$1.extend({
		method: literal("prompts/get"),
		params: GetPromptRequestParamsSchema$1
	});
	/**
	* Text provided to or from an LLM.
	*/
	const TextContentSchema$1 = object({
		type: literal("text"),
		text: string(),
		annotations: AnnotationsSchema$1.optional(),
		_meta: record(string(), unknown()).optional()
	});
	/**
	* An image provided to or from an LLM.
	*/
	const ImageContentSchema$1 = object({
		type: literal("image"),
		data: Base64Schema,
		mimeType: string(),
		annotations: AnnotationsSchema$1.optional(),
		_meta: record(string(), unknown()).optional()
	});
	/**
	* Audio content provided to or from an LLM.
	*/
	const AudioContentSchema$1 = object({
		type: literal("audio"),
		data: Base64Schema,
		mimeType: string(),
		annotations: AnnotationsSchema$1.optional(),
		_meta: record(string(), unknown()).optional()
	});
	/**
	* A tool call request from an assistant (LLM).
	* Represents the assistant's request to use a tool.
	*
	* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
	* in the specification for at least twelve months. Migrate to calling LLM
	* provider APIs directly.
	*/
	const ToolUseContentSchema$1 = object({
		type: literal("tool_use"),
		name: string(),
		id: string(),
		input: record(string(), unknown()),
		_meta: record(string(), unknown()).optional()
	});
	/**
	* The contents of a resource, embedded into a prompt or tool call result.
	*/
	const EmbeddedResourceSchema$1 = object({
		type: literal("resource"),
		resource: union([TextResourceContentsSchema$1, BlobResourceContentsSchema$1]),
		annotations: AnnotationsSchema$1.optional(),
		_meta: record(string(), unknown()).optional()
	});
	/**
	* A resource that the server is capable of reading, included in a prompt or tool call result.
	*
	* Note: resource links returned by tools are not guaranteed to appear in the results of {@linkcode ListResourcesRequest | resources/list} requests.
	*/
	const ResourceLinkSchema$1 = ResourceSchema$1.extend({ type: literal("resource_link") });
	/**
	* A content block that can be used in prompts and tool results.
	*/
	const ContentBlockSchema$1 = union([
		TextContentSchema$1,
		ImageContentSchema$1,
		AudioContentSchema$1,
		ResourceLinkSchema$1,
		EmbeddedResourceSchema$1
	]);
	/**
	* Describes a message returned as part of a prompt.
	*/
	const PromptMessageSchema$1 = object({
		role: RoleSchema$1,
		content: ContentBlockSchema$1
	});
	/**
	* The server's response to a {@linkcode GetPromptRequest | prompts/get} request from the client.
	*/
	const GetPromptResultSchema$1 = ResultSchema$1.extend({
		description: string().optional(),
		messages: array(PromptMessageSchema$1)
	});
	/**
	* An optional notification from the server to the client, informing it that the list of prompts it offers has changed. This may be issued by servers without any previous subscription from the client.
	*/
	const PromptListChangedNotificationSchema$1 = NotificationSchema$1.extend({
		method: literal("notifications/prompts/list_changed"),
		params: NotificationsParamsSchema$1.optional()
	});
	/**
	* Additional properties describing a `Tool` to clients.
	*
	* NOTE: all properties in {@linkcode ToolAnnotations} are **hints**.
	* They are not guaranteed to provide a faithful description of
	* tool behavior (including descriptive properties like `title`).
	*
	* Clients should never make tool use decisions based on `ToolAnnotations`
	* received from untrusted servers.
	*/
	const ToolAnnotationsSchema$1 = object({
		title: string().optional(),
		readOnlyHint: boolean().optional(),
		destructiveHint: boolean().optional(),
		idempotentHint: boolean().optional(),
		openWorldHint: boolean().optional()
	});
	/**
	* Execution-related properties for a tool.
	*/
	const ToolExecutionSchema$1 = object({ taskSupport: _enum([
		"required",
		"optional",
		"forbidden"
	]).optional() });
	/**
	* Definition for a tool the client can call.
	*/
	const ToolSchema$1 = object({
		...BaseMetadataSchema$1.shape,
		...IconsSchema$1.shape,
		description: string().optional(),
		inputSchema: object({
			type: literal("object"),
			properties: record(string(), JSONValueSchema$1).optional(),
			required: array(string()).optional()
		}).catchall(unknown()),
		outputSchema: object({
			type: literal("object"),
			properties: record(string(), JSONValueSchema$1).optional(),
			required: array(string()).optional()
		}).catchall(unknown()).optional(),
		annotations: ToolAnnotationsSchema$1.optional(),
		execution: ToolExecutionSchema$1.optional(),
		_meta: record(string(), unknown()).optional()
	});
	/**
	* Sent from the client to request a list of tools the server has.
	*/
	const ListToolsRequestSchema$1 = PaginatedRequestSchema$1.extend({ method: literal("tools/list") });
	/**
	* The server's response to a {@linkcode ListToolsRequest | tools/list} request from the client.
	*/
	const ListToolsResultSchema$1 = PaginatedResultSchema$1.extend({ tools: array(ToolSchema$1) });
	/**
	* The server's response to a tool call.
	*/
	const CallToolResultSchema$1 = ResultSchema$1.extend({
		content: array(ContentBlockSchema$1),
		structuredContent: record(string(), unknown()).optional(),
		isError: boolean().optional()
	});
	/**
	* Parameters for a `tools/call` request.
	*/
	const CallToolRequestParamsSchema$1 = TaskAugmentedRequestParamsSchema$1.extend({
		name: string(),
		arguments: record(string(), unknown()).optional()
	});
	/**
	* Used by the client to invoke a tool provided by the server.
	*/
	const CallToolRequestSchema$1 = RequestSchema$1.extend({
		method: literal("tools/call"),
		params: CallToolRequestParamsSchema$1
	});
	/**
	* An optional notification from the server to the client, informing it that the list of tools it offers has changed. This may be issued by servers without any previous subscription from the client.
	*/
	const ToolListChangedNotificationSchema$1 = NotificationSchema$1.extend({
		method: literal("notifications/tools/list_changed"),
		params: NotificationsParamsSchema$1.optional()
	});
	/**
	* The severity of a log message.
	*
	* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
	* in the specification for at least twelve months. Migrate to stderr logging
	* (STDIO servers) or OpenTelemetry.
	*/
	const LoggingLevelSchema$1 = _enum([
		"debug",
		"info",
		"notice",
		"warning",
		"error",
		"critical",
		"alert",
		"emergency"
	]);
	/**
	* Parameters for a `logging/setLevel` request.
	*
	* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
	* in the specification for at least twelve months. Migrate to stderr logging
	* (STDIO servers) or OpenTelemetry.
	*/
	const SetLevelRequestParamsSchema$1 = BaseRequestParamsSchema$1.extend({ level: LoggingLevelSchema$1 });
	/**
	* A request from the client to the server, to enable or adjust logging.
	*
	* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
	* in the specification for at least twelve months. Migrate to stderr logging
	* (STDIO servers) or OpenTelemetry.
	*/
	const SetLevelRequestSchema$1 = RequestSchema$1.extend({
		method: literal("logging/setLevel"),
		params: SetLevelRequestParamsSchema$1
	});
	/**
	* Parameters for a `notifications/message` notification.
	*
	* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
	* in the specification for at least twelve months. Migrate to stderr logging
	* (STDIO servers) or OpenTelemetry.
	*/
	const LoggingMessageNotificationParamsSchema$1 = NotificationsParamsSchema$1.extend({
		level: LoggingLevelSchema$1,
		logger: string().optional(),
		data: unknown()
	});
	/**
	* Notification of a log message passed from server to client. If no `logging/setLevel` request has been sent from the client, the server MAY decide which messages to send automatically.
	*
	* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
	* in the specification for at least twelve months. Migrate to stderr logging
	* (STDIO servers) or OpenTelemetry.
	*/
	const LoggingMessageNotificationSchema$1 = NotificationSchema$1.extend({
		method: literal("notifications/message"),
		params: LoggingMessageNotificationParamsSchema$1
	});
	/**
	* Hints to use for model selection.
	*
	* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
	* in the specification for at least twelve months. Migrate to calling LLM
	* provider APIs directly.
	*/
	const ModelHintSchema$1 = object({ name: string().optional() });
	/**
	* The server's preferences for model selection, requested of the client during sampling.
	*
	* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
	* in the specification for at least twelve months. Migrate to calling LLM
	* provider APIs directly.
	*/
	const ModelPreferencesSchema$1 = object({
		hints: array(ModelHintSchema$1).optional(),
		costPriority: number$1().min(0).max(1).optional(),
		speedPriority: number$1().min(0).max(1).optional(),
		intelligencePriority: number$1().min(0).max(1).optional()
	});
	/**
	* Controls tool usage behavior in sampling requests.
	*
	* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
	* in the specification for at least twelve months. Migrate to calling LLM
	* provider APIs directly.
	*/
	const ToolChoiceSchema$1 = object({ mode: _enum([
		"auto",
		"required",
		"none"
	]).optional() });
	/**
	* The result of a tool execution, provided by the user (server).
	* Represents the outcome of invoking a tool requested via `ToolUseContent`.
	*
	* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
	* in the specification for at least twelve months. Migrate to calling LLM
	* provider APIs directly.
	*/
	const ToolResultContentSchema$1 = object({
		type: literal("tool_result"),
		toolUseId: string().describe("The unique identifier for the corresponding tool call."),
		content: array(ContentBlockSchema$1),
		structuredContent: object({}).loose().optional(),
		isError: boolean().optional(),
		_meta: record(string(), unknown()).optional()
	});
	/**
	* Basic content types for sampling responses (without tool use).
	* Used for backwards-compatible {@linkcode CreateMessageResult} when tools are not used.
	*
	* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
	* in the specification for at least twelve months. Migrate to calling LLM
	* provider APIs directly.
	*/
	const SamplingContentSchema$1 = discriminatedUnion("type", [
		TextContentSchema$1,
		ImageContentSchema$1,
		AudioContentSchema$1
	]);
	/**
	* Content block types allowed in sampling messages.
	* This includes text, image, audio, tool use requests, and tool results.
	*
	* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
	* in the specification for at least twelve months. Migrate to calling LLM
	* provider APIs directly.
	*/
	const SamplingMessageContentBlockSchema$1 = discriminatedUnion("type", [
		TextContentSchema$1,
		ImageContentSchema$1,
		AudioContentSchema$1,
		ToolUseContentSchema$1,
		ToolResultContentSchema$1
	]);
	/**
	* Describes a message issued to or received from an LLM API.
	*
	* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
	* in the specification for at least twelve months. Migrate to calling LLM
	* provider APIs directly.
	*/
	const SamplingMessageSchema$1 = object({
		role: RoleSchema$1,
		content: union([SamplingMessageContentBlockSchema$1, array(SamplingMessageContentBlockSchema$1)]),
		_meta: record(string(), unknown()).optional()
	});
	/**
	* Parameters for a `sampling/createMessage` request.
	*
	* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
	* in the specification for at least twelve months. Migrate to calling LLM
	* provider APIs directly.
	*/
	const CreateMessageRequestParamsSchema$1 = TaskAugmentedRequestParamsSchema$1.extend({
		messages: array(SamplingMessageSchema$1),
		modelPreferences: ModelPreferencesSchema$1.optional(),
		systemPrompt: string().optional(),
		includeContext: _enum([
			"none",
			"thisServer",
			"allServers"
		]).optional(),
		temperature: number$1().optional(),
		maxTokens: number$1().int(),
		stopSequences: array(string()).optional(),
		metadata: JSONObjectSchema$1.optional(),
		tools: array(ToolSchema$1).optional(),
		toolChoice: ToolChoiceSchema$1.optional()
	});
	/**
	* A request from the server to sample an LLM via the client. The client has full discretion over which model to select. The client should also inform the user before beginning sampling, to allow them to inspect the request (human in the loop) and decide whether to approve it.
	*
	* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
	* in the specification for at least twelve months. Migrate to calling LLM
	* provider APIs directly.
	*/
	const CreateMessageRequestSchema$1 = RequestSchema$1.extend({
		method: literal("sampling/createMessage"),
		params: CreateMessageRequestParamsSchema$1
	});
	/**
	* The client's response to a `sampling/create_message` request from the server.
	* This is the backwards-compatible version that returns single content (no arrays).
	* Used when the request does not include tools.
	*
	* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
	* in the specification for at least twelve months. Migrate to calling LLM
	* provider APIs directly.
	*/
	const CreateMessageResultSchema$1 = ResultSchema$1.extend({
		model: string(),
		stopReason: optional(_enum([
			"endTurn",
			"stopSequence",
			"maxTokens"
		]).or(string())),
		role: RoleSchema$1,
		content: SamplingContentSchema$1
	});
	/**
	* The client's response to a `sampling/create_message` request when tools were provided.
	* This version supports array content for tool use flows.
	*
	* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
	* in the specification for at least twelve months. Migrate to calling LLM
	* provider APIs directly.
	*/
	const CreateMessageResultWithToolsSchema$1 = ResultSchema$1.extend({
		model: string(),
		stopReason: optional(_enum([
			"endTurn",
			"stopSequence",
			"maxTokens",
			"toolUse"
		]).or(string())),
		role: RoleSchema$1,
		content: union([SamplingMessageContentBlockSchema$1, array(SamplingMessageContentBlockSchema$1)])
	});
	/**
	* Primitive schema definition for boolean fields.
	*/
	const BooleanSchemaSchema$1 = object({
		type: literal("boolean"),
		title: string().optional(),
		description: string().optional(),
		default: boolean().optional()
	});
	/**
	* Primitive schema definition for string fields.
	*/
	const StringSchemaSchema$1 = object({
		type: literal("string"),
		title: string().optional(),
		description: string().optional(),
		minLength: number$1().optional(),
		maxLength: number$1().optional(),
		format: _enum([
			"email",
			"uri",
			"date",
			"date-time"
		]).optional(),
		default: string().optional()
	});
	/**
	* Primitive schema definition for number fields.
	*/
	const NumberSchemaSchema$1 = object({
		type: _enum(["number", "integer"]),
		title: string().optional(),
		description: string().optional(),
		minimum: number$1().optional(),
		maximum: number$1().optional(),
		default: number$1().optional()
	});
	/**
	* Schema for single-selection enumeration without display titles for options.
	*/
	const UntitledSingleSelectEnumSchemaSchema$1 = object({
		type: literal("string"),
		title: string().optional(),
		description: string().optional(),
		enum: array(string()),
		default: string().optional()
	});
	/**
	* Schema for single-selection enumeration with display titles for each option.
	*/
	const TitledSingleSelectEnumSchemaSchema$1 = object({
		type: literal("string"),
		title: string().optional(),
		description: string().optional(),
		oneOf: array(object({
			const: string(),
			title: string()
		})),
		default: string().optional()
	});
	/**
	* Use {@linkcode TitledSingleSelectEnumSchema} instead.
	* This interface will be removed in a future version.
	*/
	const LegacyTitledEnumSchemaSchema$1 = object({
		type: literal("string"),
		title: string().optional(),
		description: string().optional(),
		enum: array(string()),
		enumNames: array(string()).optional(),
		default: string().optional()
	});
	const SingleSelectEnumSchemaSchema$1 = union([UntitledSingleSelectEnumSchemaSchema$1, TitledSingleSelectEnumSchemaSchema$1]);
	/**
	* Schema for multiple-selection enumeration without display titles for options.
	*/
	const UntitledMultiSelectEnumSchemaSchema$1 = object({
		type: literal("array"),
		title: string().optional(),
		description: string().optional(),
		minItems: number$1().optional(),
		maxItems: number$1().optional(),
		items: object({
			type: literal("string"),
			enum: array(string())
		}),
		default: array(string()).optional()
	});
	/**
	* Schema for multiple-selection enumeration with display titles for each option.
	*/
	const TitledMultiSelectEnumSchemaSchema$1 = object({
		type: literal("array"),
		title: string().optional(),
		description: string().optional(),
		minItems: number$1().optional(),
		maxItems: number$1().optional(),
		items: object({ anyOf: array(object({
			const: string(),
			title: string()
		})) }),
		default: array(string()).optional()
	});
	/**
	* Combined schema for multiple-selection enumeration
	*/
	const MultiSelectEnumSchemaSchema$1 = union([UntitledMultiSelectEnumSchemaSchema$1, TitledMultiSelectEnumSchemaSchema$1]);
	/**
	* Primitive schema definition for enum fields.
	*/
	const EnumSchemaSchema$1 = union([
		LegacyTitledEnumSchemaSchema$1,
		SingleSelectEnumSchemaSchema$1,
		MultiSelectEnumSchemaSchema$1
	]);
	/**
	* Union of all primitive schema definitions.
	*/
	const PrimitiveSchemaDefinitionSchema$1 = union([
		EnumSchemaSchema$1,
		BooleanSchemaSchema$1,
		StringSchemaSchema$1,
		NumberSchemaSchema$1
	]);
	/**
	* Parameters for an `elicitation/create` request for form-based elicitation.
	*/
	const ElicitRequestFormParamsSchema$1 = TaskAugmentedRequestParamsSchema$1.extend({
		mode: literal("form").optional(),
		message: string(),
		requestedSchema: object({
			type: literal("object"),
			properties: record(string(), PrimitiveSchemaDefinitionSchema$1),
			required: array(string()).optional()
		}).catchall(unknown())
	});
	/**
	* Parameters for an {@linkcode ElicitRequest | elicitation/create} request for URL-based elicitation.
	*/
	const ElicitRequestURLParamsSchema$1 = TaskAugmentedRequestParamsSchema$1.extend({
		mode: literal("url"),
		message: string(),
		elicitationId: string(),
		url: string().url()
	});
	/**
	* The parameters for a request to elicit additional information from the user via the client.
	*/
	const ElicitRequestParamsSchema$1 = union([ElicitRequestFormParamsSchema$1, ElicitRequestURLParamsSchema$1]);
	/**
	* A request from the server to elicit user input via the client.
	* The client should present the message and form fields to the user (form mode)
	* or navigate to a URL (URL mode).
	*/
	const ElicitRequestSchema$1 = RequestSchema$1.extend({
		method: literal("elicitation/create"),
		params: ElicitRequestParamsSchema$1
	});
	/**
	* Parameters for a {@linkcode ElicitationCompleteNotification | notifications/elicitation/complete} notification.
	*
	* @category notifications/elicitation/complete
	*/
	const ElicitationCompleteNotificationParamsSchema$1 = NotificationsParamsSchema$1.extend({ elicitationId: string() });
	/**
	* A notification from the server to the client, informing it of a completion of an out-of-band elicitation request.
	*
	* @category notifications/elicitation/complete
	*/
	const ElicitationCompleteNotificationSchema$1 = NotificationSchema$1.extend({
		method: literal("notifications/elicitation/complete"),
		params: ElicitationCompleteNotificationParamsSchema$1
	});
	/**
	* The client's response to an {@linkcode ElicitRequest | elicitation/create} request from the server.
	*/
	const ElicitResultSchema$1 = ResultSchema$1.extend({
		action: _enum([
			"accept",
			"decline",
			"cancel"
		]),
		content: preprocess((val) => val === null ? void 0 : val, record(string(), union([
			string(),
			number$1(),
			boolean(),
			array(string())
		])).optional())
	});
	/**
	* A reference to a resource or resource template definition.
	*/
	const ResourceTemplateReferenceSchema$1 = object({
		type: literal("ref/resource"),
		uri: string()
	});
	/**
	* Identifies a prompt.
	*/
	const PromptReferenceSchema$1 = object({
		type: literal("ref/prompt"),
		name: string()
	});
	/**
	* Parameters for a {@linkcode CompleteRequest | completion/complete} request.
	*/
	const CompleteRequestParamsSchema$1 = BaseRequestParamsSchema$1.extend({
		ref: union([PromptReferenceSchema$1, ResourceTemplateReferenceSchema$1]),
		argument: object({
			name: string(),
			value: string()
		}),
		context: object({ arguments: record(string(), string()).optional() }).optional()
	});
	/**
	* A request from the client to the server, to ask for completion options.
	*/
	const CompleteRequestSchema$1 = RequestSchema$1.extend({
		method: literal("completion/complete"),
		params: CompleteRequestParamsSchema$1
	});
	/**
	* The server's response to a {@linkcode CompleteRequest | completion/complete} request
	*/
	const CompleteResultSchema$1 = ResultSchema$1.extend({ completion: looseObject({
		values: array(string()).max(100),
		total: optional(number$1().int()),
		hasMore: optional(boolean())
	}) });
	/**
	* Represents a root directory or file that the server can operate on.
	*
	* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
	* in the specification for at least twelve months. Migrate to passing paths via
	* tool parameters, resource URIs, or configuration.
	*/
	const RootSchema$1 = object({
		uri: string().startsWith("file://"),
		name: string().optional(),
		_meta: record(string(), unknown()).optional()
	});
	/**
	* Sent from the server to request a list of root URIs from the client.
	*
	* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
	* in the specification for at least twelve months. Migrate to passing paths via
	* tool parameters, resource URIs, or configuration.
	*/
	const ListRootsRequestSchema$1 = RequestSchema$1.extend({
		method: literal("roots/list"),
		params: BaseRequestParamsSchema$1.optional()
	});
	/**
	* The client's response to a `roots/list` request from the server.
	*
	* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
	* in the specification for at least twelve months. Migrate to passing paths via
	* tool parameters, resource URIs, or configuration.
	*/
	const ListRootsResultSchema$1 = ResultSchema$1.extend({ roots: array(RootSchema$1) });
	/**
	* A notification from the client to the server, informing it that the list of roots has changed.
	*
	* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
	* in the specification for at least twelve months. Migrate to passing paths via
	* tool parameters, resource URIs, or configuration.
	*/
	const RootsListChangedNotificationSchema$1 = NotificationSchema$1.extend({
		method: literal("notifications/roots/list_changed"),
		params: NotificationsParamsSchema$1.optional()
	});
	/**
	* Task creation parameters, used to ask that the server create a task to represent a request.
	*
	* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
	*/
	const TaskCreationParamsSchema$1 = looseObject({
		ttl: number$1().optional(),
		pollInterval: number$1().optional()
	});
	/**
	* The status of a task.
	*
	* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
	*/
	const TaskStatusSchema$1 = _enum([
		"working",
		"input_required",
		"completed",
		"failed",
		"cancelled"
	]);
	/**
	* A pollable state object associated with a request.
	*
	* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
	*/
	const TaskSchema$1 = object({
		taskId: string(),
		status: TaskStatusSchema$1,
		ttl: union([number$1(), _null()]),
		createdAt: string(),
		lastUpdatedAt: string(),
		pollInterval: optional(number$1()),
		statusMessage: optional(string())
	});
	/**
	* Result returned when a task is created, containing the task data wrapped in a `task` field.
	*
	* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
	*/
	const CreateTaskResultSchema$1 = ResultSchema$1.extend({ task: TaskSchema$1 });
	/**
	* Parameters for task status notification.
	*
	* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
	*/
	const TaskStatusNotificationParamsSchema$1 = NotificationsParamsSchema$1.merge(TaskSchema$1);
	/**
	* A notification sent when a task's status changes.
	*
	* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
	*/
	const TaskStatusNotificationSchema$1 = NotificationSchema$1.extend({
		method: literal("notifications/tasks/status"),
		params: TaskStatusNotificationParamsSchema$1
	});
	/**
	* A request to get the state of a specific task.
	*
	* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
	*/
	const GetTaskRequestSchema$1 = RequestSchema$1.extend({
		method: literal("tasks/get"),
		params: BaseRequestParamsSchema$1.extend({ taskId: string() })
	});
	/**
	* The response to a {@linkcode GetTaskRequest | tasks/get} request.
	*
	* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
	*/
	const GetTaskResultSchema$1 = ResultSchema$1.merge(TaskSchema$1);
	/**
	* A request to get the result of a specific task.
	*
	* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
	*/
	const GetTaskPayloadRequestSchema$1 = RequestSchema$1.extend({
		method: literal("tasks/result"),
		params: BaseRequestParamsSchema$1.extend({ taskId: string() })
	});
	/**
	* The response to a `tasks/result` request.
	* The structure matches the result type of the original request.
	* For example, a {@linkcode CallToolRequest | tools/call} task would return the `CallToolResult` structure.
	*
	*
	* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
	*/
	const GetTaskPayloadResultSchema$1 = ResultSchema$1.loose();
	/**
	* A request to list tasks.
	*
	* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
	*/
	const ListTasksRequestSchema$1 = PaginatedRequestSchema$1.extend({ method: literal("tasks/list") });
	/**
	* The response to a {@linkcode ListTasksRequest | tasks/list} request.
	*
	* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
	*/
	const ListTasksResultSchema$1 = PaginatedResultSchema$1.extend({ tasks: array(TaskSchema$1) });
	/**
	* A request to cancel a specific task.
	*
	* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
	*/
	const CancelTaskRequestSchema$1 = RequestSchema$1.extend({
		method: literal("tasks/cancel"),
		params: BaseRequestParamsSchema$1.extend({ taskId: string() })
	});
	return {
		JSONValueSchema: JSONValueSchema$1,
		JSONObjectSchema: JSONObjectSchema$1,
		ProgressTokenSchema: ProgressTokenSchema$1,
		CursorSchema: CursorSchema$1,
		TaskMetadataSchema: TaskMetadataSchema$1,
		RelatedTaskMetadataSchema: RelatedTaskMetadataSchema$1,
		RequestMetaSchema: RequestMetaSchema$1,
		BaseRequestParamsSchema: BaseRequestParamsSchema$1,
		TaskAugmentedRequestParamsSchema: TaskAugmentedRequestParamsSchema$1,
		RequestSchema: RequestSchema$1,
		NotificationsParamsSchema: NotificationsParamsSchema$1,
		NotificationSchema: NotificationSchema$1,
		ResultSchema: ResultSchema$1,
		RequestIdSchema: RequestIdSchema$1,
		EmptyResultSchema: EmptyResultSchema$1,
		CancelledNotificationParamsSchema: CancelledNotificationParamsSchema$1,
		CancelledNotificationSchema: CancelledNotificationSchema$1,
		IconSchema: IconSchema$1,
		IconsSchema: IconsSchema$1,
		BaseMetadataSchema: BaseMetadataSchema$1,
		ImplementationSchema: ImplementationSchema$1,
		ClientTasksCapabilitySchema: ClientTasksCapabilitySchema$1,
		ServerTasksCapabilitySchema: ServerTasksCapabilitySchema$1,
		ClientCapabilitiesSchema: ClientCapabilitiesSchema$1,
		InitializeRequestParamsSchema: InitializeRequestParamsSchema$1,
		InitializeRequestSchema: InitializeRequestSchema$1,
		ServerCapabilitiesSchema: ServerCapabilitiesSchema$1,
		InitializeResultSchema: InitializeResultSchema$1,
		InitializedNotificationSchema: InitializedNotificationSchema$1,
		PingRequestSchema: PingRequestSchema$1,
		ProgressSchema: ProgressSchema$1,
		ProgressNotificationParamsSchema: ProgressNotificationParamsSchema$1,
		ProgressNotificationSchema: ProgressNotificationSchema$1,
		PaginatedRequestParamsSchema: PaginatedRequestParamsSchema$1,
		PaginatedRequestSchema: PaginatedRequestSchema$1,
		PaginatedResultSchema: PaginatedResultSchema$1,
		ResourceContentsSchema: ResourceContentsSchema$1,
		TextResourceContentsSchema: TextResourceContentsSchema$1,
		BlobResourceContentsSchema: BlobResourceContentsSchema$1,
		RoleSchema: RoleSchema$1,
		AnnotationsSchema: AnnotationsSchema$1,
		ResourceSchema: ResourceSchema$1,
		ResourceTemplateSchema: ResourceTemplateSchema$1,
		ListResourcesRequestSchema: ListResourcesRequestSchema$1,
		ListResourcesResultSchema: ListResourcesResultSchema$1,
		ListResourceTemplatesRequestSchema: ListResourceTemplatesRequestSchema$1,
		ListResourceTemplatesResultSchema: ListResourceTemplatesResultSchema$1,
		ResourceRequestParamsSchema: ResourceRequestParamsSchema$1,
		ReadResourceRequestParamsSchema: ReadResourceRequestParamsSchema$1,
		ReadResourceRequestSchema: ReadResourceRequestSchema$1,
		ReadResourceResultSchema: ReadResourceResultSchema$1,
		ResourceListChangedNotificationSchema: ResourceListChangedNotificationSchema$1,
		SubscribeRequestParamsSchema: SubscribeRequestParamsSchema$1,
		SubscribeRequestSchema: SubscribeRequestSchema$1,
		UnsubscribeRequestParamsSchema: UnsubscribeRequestParamsSchema$1,
		UnsubscribeRequestSchema: UnsubscribeRequestSchema$1,
		ResourceUpdatedNotificationParamsSchema: ResourceUpdatedNotificationParamsSchema$1,
		ResourceUpdatedNotificationSchema: ResourceUpdatedNotificationSchema$1,
		PromptArgumentSchema: PromptArgumentSchema$1,
		PromptSchema: PromptSchema$1,
		ListPromptsRequestSchema: ListPromptsRequestSchema$1,
		ListPromptsResultSchema: ListPromptsResultSchema$1,
		GetPromptRequestParamsSchema: GetPromptRequestParamsSchema$1,
		GetPromptRequestSchema: GetPromptRequestSchema$1,
		TextContentSchema: TextContentSchema$1,
		ImageContentSchema: ImageContentSchema$1,
		AudioContentSchema: AudioContentSchema$1,
		ToolUseContentSchema: ToolUseContentSchema$1,
		EmbeddedResourceSchema: EmbeddedResourceSchema$1,
		ResourceLinkSchema: ResourceLinkSchema$1,
		ContentBlockSchema: ContentBlockSchema$1,
		PromptMessageSchema: PromptMessageSchema$1,
		GetPromptResultSchema: GetPromptResultSchema$1,
		PromptListChangedNotificationSchema: PromptListChangedNotificationSchema$1,
		ToolAnnotationsSchema: ToolAnnotationsSchema$1,
		ToolExecutionSchema: ToolExecutionSchema$1,
		ToolSchema: ToolSchema$1,
		ListToolsRequestSchema: ListToolsRequestSchema$1,
		ListToolsResultSchema: ListToolsResultSchema$1,
		CallToolResultSchema: CallToolResultSchema$1,
		CallToolRequestParamsSchema: CallToolRequestParamsSchema$1,
		CallToolRequestSchema: CallToolRequestSchema$1,
		ToolListChangedNotificationSchema: ToolListChangedNotificationSchema$1,
		LoggingLevelSchema: LoggingLevelSchema$1,
		SetLevelRequestParamsSchema: SetLevelRequestParamsSchema$1,
		SetLevelRequestSchema: SetLevelRequestSchema$1,
		LoggingMessageNotificationParamsSchema: LoggingMessageNotificationParamsSchema$1,
		LoggingMessageNotificationSchema: LoggingMessageNotificationSchema$1,
		ModelHintSchema: ModelHintSchema$1,
		ModelPreferencesSchema: ModelPreferencesSchema$1,
		ToolChoiceSchema: ToolChoiceSchema$1,
		ToolResultContentSchema: ToolResultContentSchema$1,
		SamplingContentSchema: SamplingContentSchema$1,
		SamplingMessageContentBlockSchema: SamplingMessageContentBlockSchema$1,
		SamplingMessageSchema: SamplingMessageSchema$1,
		CreateMessageRequestParamsSchema: CreateMessageRequestParamsSchema$1,
		CreateMessageRequestSchema: CreateMessageRequestSchema$1,
		CreateMessageResultSchema: CreateMessageResultSchema$1,
		CreateMessageResultWithToolsSchema: CreateMessageResultWithToolsSchema$1,
		BooleanSchemaSchema: BooleanSchemaSchema$1,
		StringSchemaSchema: StringSchemaSchema$1,
		NumberSchemaSchema: NumberSchemaSchema$1,
		UntitledSingleSelectEnumSchemaSchema: UntitledSingleSelectEnumSchemaSchema$1,
		TitledSingleSelectEnumSchemaSchema: TitledSingleSelectEnumSchemaSchema$1,
		LegacyTitledEnumSchemaSchema: LegacyTitledEnumSchemaSchema$1,
		SingleSelectEnumSchemaSchema: SingleSelectEnumSchemaSchema$1,
		UntitledMultiSelectEnumSchemaSchema: UntitledMultiSelectEnumSchemaSchema$1,
		TitledMultiSelectEnumSchemaSchema: TitledMultiSelectEnumSchemaSchema$1,
		MultiSelectEnumSchemaSchema: MultiSelectEnumSchemaSchema$1,
		EnumSchemaSchema: EnumSchemaSchema$1,
		PrimitiveSchemaDefinitionSchema: PrimitiveSchemaDefinitionSchema$1,
		ElicitRequestFormParamsSchema: ElicitRequestFormParamsSchema$1,
		ElicitRequestURLParamsSchema: ElicitRequestURLParamsSchema$1,
		ElicitRequestParamsSchema: ElicitRequestParamsSchema$1,
		ElicitRequestSchema: ElicitRequestSchema$1,
		ElicitationCompleteNotificationParamsSchema: ElicitationCompleteNotificationParamsSchema$1,
		ElicitationCompleteNotificationSchema: ElicitationCompleteNotificationSchema$1,
		ElicitResultSchema: ElicitResultSchema$1,
		ResourceTemplateReferenceSchema: ResourceTemplateReferenceSchema$1,
		PromptReferenceSchema: PromptReferenceSchema$1,
		CompleteRequestParamsSchema: CompleteRequestParamsSchema$1,
		CompleteRequestSchema: CompleteRequestSchema$1,
		CompleteResultSchema: CompleteResultSchema$1,
		RootSchema: RootSchema$1,
		ListRootsRequestSchema: ListRootsRequestSchema$1,
		ListRootsResultSchema: ListRootsResultSchema$1,
		RootsListChangedNotificationSchema: RootsListChangedNotificationSchema$1,
		TaskCreationParamsSchema: TaskCreationParamsSchema$1,
		TaskStatusSchema: TaskStatusSchema$1,
		TaskSchema: TaskSchema$1,
		CreateTaskResultSchema: CreateTaskResultSchema$1,
		TaskStatusNotificationParamsSchema: TaskStatusNotificationParamsSchema$1,
		TaskStatusNotificationSchema: TaskStatusNotificationSchema$1,
		GetTaskRequestSchema: GetTaskRequestSchema$1,
		GetTaskResultSchema: GetTaskResultSchema$1,
		GetTaskPayloadRequestSchema: GetTaskPayloadRequestSchema$1,
		GetTaskPayloadResultSchema: GetTaskPayloadResultSchema$1,
		ListTasksRequestSchema: ListTasksRequestSchema$1,
		ListTasksResultSchema: ListTasksResultSchema$1,
		CancelTaskRequestSchema: CancelTaskRequestSchema$1,
		CancelTaskResultSchema: ResultSchema$1.merge(TaskSchema$1),
		ClientRequestSchema: union([
			PingRequestSchema$1,
			InitializeRequestSchema$1,
			CompleteRequestSchema$1,
			SetLevelRequestSchema$1,
			GetPromptRequestSchema$1,
			ListPromptsRequestSchema$1,
			ListResourcesRequestSchema$1,
			ListResourceTemplatesRequestSchema$1,
			ReadResourceRequestSchema$1,
			SubscribeRequestSchema$1,
			UnsubscribeRequestSchema$1,
			CallToolRequestSchema$1,
			ListToolsRequestSchema$1,
			GetTaskRequestSchema$1,
			GetTaskPayloadRequestSchema$1,
			ListTasksRequestSchema$1,
			CancelTaskRequestSchema$1
		]),
		ClientNotificationSchema: union([
			CancelledNotificationSchema$1,
			ProgressNotificationSchema$1,
			InitializedNotificationSchema$1,
			RootsListChangedNotificationSchema$1,
			TaskStatusNotificationSchema$1
		]),
		ClientResultSchema: union([
			EmptyResultSchema$1,
			CreateMessageResultSchema$1,
			CreateMessageResultWithToolsSchema$1,
			ElicitResultSchema$1,
			ListRootsResultSchema$1,
			GetTaskResultSchema$1,
			ListTasksResultSchema$1,
			CreateTaskResultSchema$1
		]),
		ServerRequestSchema: union([
			PingRequestSchema$1,
			CreateMessageRequestSchema$1,
			ElicitRequestSchema$1,
			ListRootsRequestSchema$1,
			GetTaskRequestSchema$1,
			GetTaskPayloadRequestSchema$1,
			ListTasksRequestSchema$1,
			CancelTaskRequestSchema$1
		]),
		ServerNotificationSchema: union([
			CancelledNotificationSchema$1,
			ProgressNotificationSchema$1,
			LoggingMessageNotificationSchema$1,
			ResourceUpdatedNotificationSchema$1,
			ResourceListChangedNotificationSchema$1,
			ToolListChangedNotificationSchema$1,
			PromptListChangedNotificationSchema$1,
			TaskStatusNotificationSchema$1,
			ElicitationCompleteNotificationSchema$1
		]),
		ServerResultSchema: union([
			EmptyResultSchema$1,
			InitializeResultSchema$1,
			CompleteResultSchema$1,
			GetPromptResultSchema$1,
			ListPromptsResultSchema$1,
			ListResourcesResultSchema$1,
			ListResourceTemplatesResultSchema$1,
			ReadResourceResultSchema$1,
			CallToolResultSchema$1,
			ListToolsResultSchema$1,
			GetTaskResultSchema$1,
			ListTasksResultSchema$1,
			CreateTaskResultSchema$1
		]),
		CallToolResultWireSchema: unknown().superRefine((value, ctx) => {
			if (typeof value !== "object" || value === null || Array.isArray(value) || value.content !== void 0) return;
			for (const key of TOOL_RESULT_FOREIGN_FAMILY_KEYS) if (key in value) {
				ctx.addIssue({
					code: "custom",
					message: `content is required when the body carries '${key}' — another result family cannot default into an empty tools/call success`
				});
				return;
			}
		}).transform(normalizeContentlessToolResult).pipe(CallToolResultSchema$1)
	};
}
var memo$1;
/**
* Builds the era wire-schema set on first call and returns the same object
* thereafter. Module evaluation stays construction-free so importing the
* era codec/registry costs nothing until the first validation actually
* needs a schema; the registry, the codec, and the eager `schemas.ts`
* shim all pull through this memo, so reference identity holds across
* every consumer.
*/
function buildSchemas2025() {
	return memo$1 ??= build$1();
}
/**
* SEP-2106 legacy `outputSchema` wrap helpers (2025-era projection only).
*
* The neutral / 2026-07-28 model lets a tool's `outputSchema` carry any JSON
* Schema root. The 2025-11-25 wire shape requires `type:'object'` at the root,
* so when an era-blind handler advertises a non-object root, the 2025 codec's
* `encodeResult('tools/list', …)` projects it down to
* `{type:'object', properties:{result:<natural>}, required:['result']}`, and
* `projectCallToolResult` wraps the matching `structuredContent` as
* `{result:<value>}`. The 2026 codec's projections are the identity.
*
* These helpers are wire-layer property — they exist so the projection can
* live behind {@link WireCodec.encodeResult} / {@link WireCodec.projectCallToolResult}
* and never be re-derived in shared/ or server-side code.
*/
/**
* Whether a JSON Schema's root is non-object: either an explicit non-object
* `type`, or a typeless root such as `{anyOf:[…]}`. Object-shaped typeless
* roots that the schema-conversion layer can prove are objects are stamped
* `type:'object'` upstream, so they reach this predicate as object roots.
*/
function isNonObjectJsonSchemaRoot(json) {
	return json["type"] !== "object";
}
/**
* Keyword-position keys whose values are instance data (not subschemas). A
* `{$ref:…}` appearing inside one is a literal value, not a JSON Pointer to
* rewrite. Only consulted when the current object is in keyword position —
* a PROPERTY named `default`/`const` (under `properties`/`$defs`/…) is a name
* position whose value IS a subschema and is recursed into.
*/
var REF_REWRITE_DATA_POSITION_KEYS = /* @__PURE__ */ new Set([
	"const",
	"enum",
	"default",
	"examples"
]);
/**
* Keyword-position keys whose value is a name→subschema map. Entries inside
* such a map are in NAME position: their keys are author-chosen property
* names (which may collide with JSON Schema keywords), their values are
* subschemas to recurse into.
*/
var REF_REWRITE_NAME_MAP_KEYS = /* @__PURE__ */ new Set([
	"properties",
	"patternProperties",
	"$defs",
	"definitions",
	"dependentSchemas",
	"dependencies"
]);
/**
* Whether a subtree's `$id` establishes a new resolution base. A fragment-only
* `$id` (`"#item"`, the draft-07/06 spelling of 2020-12's `$anchor`) does not
* change the RFC 3986 base URI — same-document pointers inside still resolve
* against the document root and must be rewritten.
*/
function establishesNewBase(id) {
	return id !== void 0 && !(typeof id === "string" && id.startsWith("#"));
}
/**
* Wrap a non-object output schema in the 2025-era envelope:
* `{type:'object', properties:{result:<natural>}, required:['result']}`.
*
* Same-document `$ref` / `$dynamicRef` JSON Pointers inside the natural schema
* (e.g. `#/properties/foo` produced by zod for de-duplicated/recursive types)
* are rewritten to account for the new `#/properties/result` root: bare `#` →
* `#/properties/result`, `#/…` → `#/properties/result/…`. Cross-document refs
* (anything not starting with `#`) are left untouched.
*
* The rewrite is position-aware: data-valued keywords
* (`const`/`enum`/`default`/`examples`) in keyword position are NOT descended
* into; the same names appearing as property names under
* `properties`/`patternProperties`/`$defs`/`definitions`/`dependentSchemas`/
* `dependencies` ARE descended into (they're subschemas). The rewrite is also
* `$id`-scoped: if the natural root carries a base-establishing `$id` no
* pointer is rewritten (same-document refs inside resolve against the embedded
* `$id` base, not the wrapper root), and any subtree that establishes its own
* `$id` is left untouched for the same reason. Fragment-only `$id` (`"#item"`,
* draft-07's anchor spelling) does not establish a base and IS descended into.
*/
function wrapOutputSchemaForLegacy(natural) {
	const $schema = typeof natural["$schema"] === "string" ? natural["$schema"] : void 0;
	if (establishesNewBase(natural["$id"])) return {
		...$schema !== void 0 && { $schema },
		type: "object",
		properties: { result: natural },
		required: ["result"]
	};
	const convertRecursiveRefs = declares2019Dialect(natural["$schema"]) && natural["$recursiveAnchor"] !== true;
	const rewriteRefs = (node, parentIsNameMap) => {
		if (Array.isArray(node)) return node.map((item) => rewriteRefs(item, false));
		if (node === null || typeof node !== "object") return node;
		if (!parentIsNameMap && establishesNewBase(node["$id"])) return node;
		const out = {};
		let convertedRecursion = false;
		for (const [k, v] of Object.entries(node)) if (parentIsNameMap) out[k] = rewriteRefs(v, false);
		else if ((k === "$ref" || k === "$dynamicRef") && typeof v === "string") out[k] = v === "#" ? "#/properties/result" : v.startsWith("#/") ? `#/properties/result${v.slice(1)}` : v;
		else if (k === "$recursiveRef" && v === "#" && convertRecursiveRefs) convertedRecursion = true;
		else if (REF_REWRITE_DATA_POSITION_KEYS.has(k)) out[k] = v;
		else if (REF_REWRITE_NAME_MAP_KEYS.has(k)) out[k] = rewriteRefs(v, true);
		else out[k] = rewriteRefs(v, false);
		if (convertedRecursion) if ("$ref" in out) out["allOf"] = [...Array.isArray(out["allOf"]) ? out["allOf"] : [], { $ref: "#/properties/result" }];
		else out["$ref"] = "#/properties/result";
		return out;
	};
	return {
		...$schema !== void 0 && { $schema },
		type: "object",
		properties: { result: rewriteRefs(natural, false) },
		required: ["result"]
	};
}
var requestMethodKeys$1 = {
	ping: null,
	initialize: null,
	"completion/complete": null,
	"logging/setLevel": null,
	"prompts/get": null,
	"prompts/list": null,
	"resources/list": null,
	"resources/templates/list": null,
	"resources/read": null,
	"resources/subscribe": null,
	"resources/unsubscribe": null,
	"tools/call": null,
	"tools/list": null,
	"tasks/get": null,
	"tasks/result": null,
	"tasks/list": null,
	"tasks/cancel": null,
	"sampling/createMessage": null,
	"elicitation/create": null,
	"roots/list": null
};
var notificationMethodKeys$1 = {
	"notifications/cancelled": null,
	"notifications/progress": null,
	"notifications/initialized": null,
	"notifications/roots/list_changed": null,
	"notifications/tasks/status": null,
	"notifications/message": null,
	"notifications/resources/updated": null,
	"notifications/resources/list_changed": null,
	"notifications/tools/list_changed": null,
	"notifications/prompts/list_changed": null,
	"notifications/elicitation/complete": null
};
var resultMethodKeys = {
	ping: null,
	initialize: null,
	"completion/complete": null,
	"logging/setLevel": null,
	"prompts/get": null,
	"prompts/list": null,
	"resources/list": null,
	"resources/templates/list": null,
	"resources/read": null,
	"resources/subscribe": null,
	"resources/unsubscribe": null,
	"tools/call": null,
	"tools/list": null,
	"sampling/createMessage": null,
	"elicitation/create": null,
	"roots/list": null
};
var maps$1;
function registryMaps() {
	if (maps$1) return maps$1;
	const s = buildSchemas2025();
	maps$1 = {
		requestSchemas: {
			ping: s.PingRequestSchema,
			initialize: s.InitializeRequestSchema,
			"completion/complete": s.CompleteRequestSchema,
			"logging/setLevel": s.SetLevelRequestSchema,
			"prompts/get": s.GetPromptRequestSchema,
			"prompts/list": s.ListPromptsRequestSchema,
			"resources/list": s.ListResourcesRequestSchema,
			"resources/templates/list": s.ListResourceTemplatesRequestSchema,
			"resources/read": s.ReadResourceRequestSchema,
			"resources/subscribe": s.SubscribeRequestSchema,
			"resources/unsubscribe": s.UnsubscribeRequestSchema,
			"tools/call": s.CallToolRequestSchema,
			"tools/list": s.ListToolsRequestSchema,
			"tasks/get": s.GetTaskRequestSchema,
			"tasks/result": s.GetTaskPayloadRequestSchema,
			"tasks/list": s.ListTasksRequestSchema,
			"tasks/cancel": s.CancelTaskRequestSchema,
			"sampling/createMessage": s.CreateMessageRequestSchema,
			"elicitation/create": s.ElicitRequestSchema,
			"roots/list": s.ListRootsRequestSchema
		},
		notificationSchemas: {
			"notifications/cancelled": s.CancelledNotificationSchema,
			"notifications/progress": s.ProgressNotificationSchema,
			"notifications/initialized": s.InitializedNotificationSchema,
			"notifications/roots/list_changed": s.RootsListChangedNotificationSchema,
			"notifications/tasks/status": s.TaskStatusNotificationSchema,
			"notifications/message": s.LoggingMessageNotificationSchema,
			"notifications/resources/updated": s.ResourceUpdatedNotificationSchema,
			"notifications/resources/list_changed": s.ResourceListChangedNotificationSchema,
			"notifications/tools/list_changed": s.ToolListChangedNotificationSchema,
			"notifications/prompts/list_changed": s.PromptListChangedNotificationSchema,
			"notifications/elicitation/complete": s.ElicitationCompleteNotificationSchema
		},
		resultSchemas: {
			ping: s.EmptyResultSchema,
			initialize: s.InitializeResultSchema,
			"completion/complete": s.CompleteResultSchema,
			"logging/setLevel": s.EmptyResultSchema,
			"prompts/get": s.GetPromptResultSchema,
			"prompts/list": s.ListPromptsResultSchema,
			"resources/list": s.ListResourcesResultSchema,
			"resources/templates/list": s.ListResourceTemplatesResultSchema,
			"resources/read": s.ReadResourceResultSchema,
			"resources/subscribe": s.EmptyResultSchema,
			"resources/unsubscribe": s.EmptyResultSchema,
			"tools/call": s.CallToolResultWireSchema,
			"tools/list": s.ListToolsResultSchema,
			"sampling/createMessage": s.CreateMessageResultWithToolsSchema,
			"elicitation/create": s.ElicitResultSchema,
			"roots/list": s.ListRootsResultSchema
		}
	};
	return maps$1;
}
/** The 2025-era request-method set (registry membership = the deletion story). */
function hasRequestMethod2025(method) {
	return Object.prototype.hasOwnProperty.call(requestMethodKeys$1, method);
}
/** The 2025-era notification-method set. */
function hasNotificationMethod2025(method) {
	return Object.prototype.hasOwnProperty.call(notificationMethodKeys$1, method);
}
/** Result-map membership: exactly the era's typed-method subset (no task entries, no 2026-only methods). */
function hasResultMethod(method) {
	return Object.prototype.hasOwnProperty.call(resultMethodKeys, method);
}
function getResultSchema(method) {
	return hasResultMethod(method) ? registryMaps().resultSchemas[method] : void 0;
}
function getRequestSchema(method) {
	return hasRequestMethod2025(method) ? registryMaps().requestSchemas[method] : void 0;
}
function getNotificationSchema(method) {
	return hasNotificationMethod2025(method) ? registryMaps().notificationSchemas[method] : void 0;
}
Object.keys(requestMethodKeys$1);
Object.keys(notificationMethodKeys$1);
function isPlainObject$6(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
/** Tri-state wrap of an optional Zod schema lookup (the function-only contract). */
function triState$1(schema, raw) {
	if (schema === void 0) return {
		ok: false,
		reason: "not-in-era"
	};
	const parsed = schema.safeParse(raw);
	return parsed.success ? {
		ok: true,
		value: parsed.data
	} : {
		ok: false,
		reason: "invalid",
		message: String(parsed.error)
	};
}
var NOT_IN_ERA$1 = {
	ok: false,
	reason: "not-in-era"
};
/** Whether a `tools/list` entry advertises a non-object `outputSchema` root that needs the SEP-2106 legacy wrap. */
function toolNeedsLegacyWrap(t) {
	return isPlainObject$6(t) && isPlainObject$6(t["outputSchema"]) && isNonObjectJsonSchemaRoot(t["outputSchema"]);
}
/** The wire→neutral trust boundary: a decoded 2025-era wire result is adopted as the neutral `Result` here (the module's single deliberate assertion). */
function toNeutralResult(value) {
	return value;
}
var rev2025Codec = {
	era: "2025-11-25",
	hasRequestMethod: hasRequestMethod2025,
	hasNotificationMethod: hasNotificationMethod2025,
	validateRequest: (method, raw) => triState$1(getRequestSchema(method), raw),
	validateResult: (method, raw) => triState$1(getResultSchema(method), raw),
	validateNotification: (method, raw) => triState$1(getNotificationSchema(method), raw),
	hasInputRequestMethod: () => false,
	validateInputRequest: () => NOT_IN_ERA$1,
	validateInputResponse: () => NOT_IN_ERA$1,
	samplingResultVariant: ((hasTools, raw) => {
		const s = buildSchemas2025();
		return triState$1(hasTools ? s.CreateMessageResultWithToolsSchema : s.CreateMessageResultSchema, raw);
	}),
	outboundEnvelope: (_material) => void 0,
	validateEnvelopeMeta: (_meta) => [],
	projectCallToolResult(result, advertisedOutputSchema) {
		const withText = appendTextFallbackForNonObject(result);
		const sc = withText.structuredContent;
		if (sc === void 0) return withText;
		const valueIsNonObject = typeof sc !== "object" || sc === null || Array.isArray(sc);
		const schemaWrapped = advertisedOutputSchema !== void 0 && isNonObjectJsonSchemaRoot(advertisedOutputSchema);
		if (!valueIsNonObject && !schemaWrapped) return withText;
		return {
			...withText,
			structuredContent: { result: sc }
		};
	},
	decodeResult(_method, raw) {
		if (isPlainObject$6(raw) && "resultType" in raw) {
			const stripped = { ...raw };
			delete stripped["resultType"];
			return {
				kind: "complete",
				result: toNeutralResult(stripped)
			};
		}
		return {
			kind: "complete",
			result: toNeutralResult(raw)
		};
	},
	encodeResult(method, result) {
		if (method !== "tools/list") return result;
		const tools = result.tools;
		if (!Array.isArray(tools) || !tools.some((t) => toolNeedsLegacyWrap(t))) return result;
		return {
			...result,
			tools: tools.map((t) => toolNeedsLegacyWrap(t) ? {
				...t,
				outputSchema: wrapOutputSchemaForLegacy(t.outputSchema)
			} : t)
		};
	},
	encodeErrorCode: (code) => code === -32002 ? -32602 : code,
	checkInboundEnvelope: (_material) => void 0
};
/**
* 2026-era wire schemas (protocol revision 2026-07-28).
*
* Fully self-contained — no runtime imports from types/schemas.ts. The
* neutral types/schemas.ts layer is the public-API superset and is free to
* evolve; this file is the 2026 wire-parse contract and is BEHAVIOR-FROZEN
* against the 2026-07-28 anchor. Every era-shared building block (content
* blocks, resources, prompts, capabilities, notifications, …) that the wire
* shapes compose is a frozen LOCAL copy — verbatim from the neutral layer at
* the point this revision was sealed, dependencies first. The only cross-layer
* dependency is `import type { JSONObject, JSONValue }` from the neutral types
* barrel — pure structural type aliases with no parse behavior.
*
* This module is the only place the per-request `_meta` envelope is modeled.
* The envelope is wire-only vocabulary: the protocol layer lifts it off
* inbound requests before any handler runs and surfaces it at
* `ctx.mcpReq.envelope`; the 2026-era codec enforces its requiredness at
* dispatch time (`checkInboundEnvelope`) - the former neutral-schema JSDoc
* deferral ("enforced per request at dispatch time, not here") is now
* discharged by that codec step.
*
* No 2025-era traffic ever touches this module, so requiredness here is
* bare and spec-exact (the shared-schema `.catch` hazards do not apply).
*
* SPEC-CURRENCY RE-SEAL (2026-07-17): the 2026-07-28 revision was re-sealed
* upstream by spec PR #3002 (commit 71e30695, merged 2026-07-15 — after the
* previous anchor pin f68d864a): the envelope's `clientInfo` demoted from
* required to SHOULD, and `DiscoverResult.serverInfo` moved from the result
* body to the new `ResultMetaObject` key
* `_meta['io.modelcontextprotocol/serverInfo']` (optional on every result).
* The shapes below are the re-sealed anchor, exactly — no pre-#3002 shape is
* modeled anywhere (per ruling: the final revision is the only 2026-07-28).
*/
function build() {
	const JSONValueSchema$1 = lazy(() => union([
		string(),
		number$1(),
		boolean(),
		_null(),
		record(string(), JSONValueSchema$1),
		array(JSONValueSchema$1)
	]));
	const JSONObjectSchema$1 = record(string(), JSONValueSchema$1);
	/**
	* A progress token, used to associate progress notifications with the original request.
	*/
	const ProgressTokenSchema$1 = union([string(), number$1().int()]);
	/**
	* An opaque token used to represent a cursor for pagination.
	*/
	const CursorSchema$1 = string();
	/**
	* A uniquely identifying ID for a request in JSON-RPC.
	*/
	const RequestIdSchema$1 = union([string(), number$1().int()]);
	/**
	* The sender or recipient of messages and data in a conversation.
	*/
	const RoleSchema$1 = _enum(["user", "assistant"]);
	/**
	* The severity of a log message.
	*/
	const LoggingLevelSchema$1 = _enum([
		"debug",
		"info",
		"notice",
		"warning",
		"error",
		"critical",
		"alert",
		"emergency"
	]);
	/**
	* A Zod schema for validating Base64 strings that is more performant and
	* robust for very large inputs than the default regex-based check. It avoids
	* stack overflows by using the native `atob` function for validation.
	*/
	const Base64Schema = string().refine((val) => {
		try {
			atob(val);
			return true;
		} catch {
			return false;
		}
	}, { message: "Invalid Base64 string" });
	/** @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only. */
	const TaskMetadataSchema$1 = object({ ttl: number$1().optional() });
	/** @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only. */
	const RelatedTaskMetadataSchema$1 = object({ taskId: string() });
	const RequestMetaSchema$1 = looseObject({
		progressToken: ProgressTokenSchema$1.optional(),
		"io.modelcontextprotocol/related-task": RelatedTaskMetadataSchema$1.optional()
	});
	const BaseRequestParamsSchema$1 = object({ _meta: RequestMetaSchema$1.optional() });
	/** @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only. */
	const TaskAugmentedRequestParamsSchema$1 = BaseRequestParamsSchema$1.extend({ task: TaskMetadataSchema$1.optional() });
	const NotificationsParamsSchema$1 = object({ _meta: RequestMetaSchema$1.optional() });
	const NotificationSchema$1 = object({
		method: string(),
		params: NotificationsParamsSchema$1.loose().optional()
	});
	const IconSchema$1 = object({
		src: string(),
		mimeType: string().optional(),
		sizes: array(string()).optional(),
		theme: _enum(["light", "dark"]).optional()
	});
	const IconsSchema$1 = object({ icons: array(IconSchema$1).optional() });
	const BaseMetadataSchema$1 = object({
		name: string(),
		title: string().optional()
	});
	const ImplementationSchema$1 = BaseMetadataSchema$1.extend({
		...BaseMetadataSchema$1.shape,
		...IconsSchema$1.shape,
		version: string(),
		websiteUrl: string().optional(),
		description: string().optional()
	});
	const FormElicitationCapabilitySchema = intersection(object({ applyDefaults: boolean().optional() }), JSONObjectSchema$1);
	const ElicitationCapabilitySchema = preprocess((value) => {
		if (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0) return { form: {} };
		return value;
	}, intersection(object({
		form: FormElicitationCapabilitySchema.optional(),
		url: JSONObjectSchema$1.optional()
	}), JSONObjectSchema$1.optional()));
	/** @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only. */
	const ClientTasksCapabilitySchema$1 = looseObject({
		list: JSONObjectSchema$1.optional(),
		cancel: JSONObjectSchema$1.optional(),
		requests: looseObject({
			sampling: looseObject({ createMessage: JSONObjectSchema$1.optional() }).optional(),
			elicitation: looseObject({ create: JSONObjectSchema$1.optional() }).optional()
		}).optional()
	});
	/** @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only. */
	const ServerTasksCapabilitySchema$1 = looseObject({
		list: JSONObjectSchema$1.optional(),
		cancel: JSONObjectSchema$1.optional(),
		requests: looseObject({ tools: looseObject({ call: JSONObjectSchema$1.optional() }).optional() }).optional()
	});
	const ClientCapabilitiesSchema$1 = object({
		experimental: record(string(), JSONObjectSchema$1).optional(),
		sampling: object({
			context: JSONObjectSchema$1.optional(),
			tools: JSONObjectSchema$1.optional()
		}).optional(),
		elicitation: ElicitationCapabilitySchema.optional(),
		roots: object({ listChanged: boolean().optional() }).optional(),
		tasks: ClientTasksCapabilitySchema$1.optional(),
		extensions: record(string(), JSONObjectSchema$1).optional()
	});
	const ServerCapabilitiesSchema$1 = object({
		experimental: record(string(), JSONObjectSchema$1).optional(),
		logging: JSONObjectSchema$1.optional(),
		completions: JSONObjectSchema$1.optional(),
		prompts: object({ listChanged: boolean().optional() }).optional(),
		resources: object({
			subscribe: boolean().optional(),
			listChanged: boolean().optional()
		}).optional(),
		tools: object({ listChanged: boolean().optional() }).optional(),
		tasks: ServerTasksCapabilitySchema$1.optional(),
		extensions: record(string(), JSONObjectSchema$1).optional()
	});
	const ProgressSchema$1 = object({
		progress: number$1(),
		total: optional(number$1()),
		message: optional(string())
	});
	const ProgressNotificationParamsSchema$1 = object({
		...NotificationsParamsSchema$1.shape,
		...ProgressSchema$1.shape,
		progressToken: ProgressTokenSchema$1
	});
	const ProgressNotificationSchema$1 = NotificationSchema$1.extend({
		method: literal("notifications/progress"),
		params: ProgressNotificationParamsSchema$1
	});
	const LoggingMessageNotificationParamsSchema$1 = NotificationsParamsSchema$1.extend({
		level: LoggingLevelSchema$1,
		logger: string().optional(),
		data: unknown()
	});
	const LoggingMessageNotificationSchema$1 = NotificationSchema$1.extend({
		method: literal("notifications/message"),
		params: LoggingMessageNotificationParamsSchema$1
	});
	const ResourceContentsSchema$1 = object({
		uri: string(),
		mimeType: optional(string()),
		_meta: record(string(), unknown()).optional()
	});
	const TextResourceContentsSchema$1 = ResourceContentsSchema$1.extend({ text: string() });
	const BlobResourceContentsSchema$1 = ResourceContentsSchema$1.extend({ blob: Base64Schema });
	const AnnotationsSchema$1 = object({
		audience: array(RoleSchema$1).optional(),
		priority: number$1().min(0).max(1).optional(),
		lastModified: datetime({ offset: true }).optional()
	});
	const ResourceSchema$1 = object({
		...BaseMetadataSchema$1.shape,
		...IconsSchema$1.shape,
		uri: string(),
		description: optional(string()),
		mimeType: optional(string()),
		size: optional(number$1()),
		annotations: AnnotationsSchema$1.optional(),
		_meta: optional(looseObject({}))
	});
	const ResourceTemplateSchema$1 = object({
		...BaseMetadataSchema$1.shape,
		...IconsSchema$1.shape,
		uriTemplate: string(),
		description: optional(string()),
		mimeType: optional(string()),
		annotations: AnnotationsSchema$1.optional(),
		_meta: optional(looseObject({}))
	});
	const ResourceListChangedNotificationSchema$1 = NotificationSchema$1.extend({
		method: literal("notifications/resources/list_changed"),
		params: NotificationsParamsSchema$1.optional()
	});
	const ResourceUpdatedNotificationParamsSchema$1 = NotificationsParamsSchema$1.extend({ uri: string() });
	const ResourceUpdatedNotificationSchema$1 = NotificationSchema$1.extend({
		method: literal("notifications/resources/updated"),
		params: ResourceUpdatedNotificationParamsSchema$1
	});
	const PromptArgumentSchema$1 = object({
		name: string(),
		description: optional(string()),
		required: optional(boolean())
	});
	const PromptSchema$1 = object({
		...BaseMetadataSchema$1.shape,
		...IconsSchema$1.shape,
		description: optional(string()),
		arguments: optional(array(PromptArgumentSchema$1)),
		_meta: optional(looseObject({}))
	});
	const PromptListChangedNotificationSchema$1 = NotificationSchema$1.extend({
		method: literal("notifications/prompts/list_changed"),
		params: NotificationsParamsSchema$1.optional()
	});
	const TextContentSchema$1 = object({
		type: literal("text"),
		text: string(),
		annotations: AnnotationsSchema$1.optional(),
		_meta: record(string(), unknown()).optional()
	});
	const ImageContentSchema$1 = object({
		type: literal("image"),
		data: Base64Schema,
		mimeType: string(),
		annotations: AnnotationsSchema$1.optional(),
		_meta: record(string(), unknown()).optional()
	});
	const AudioContentSchema$1 = object({
		type: literal("audio"),
		data: Base64Schema,
		mimeType: string(),
		annotations: AnnotationsSchema$1.optional(),
		_meta: record(string(), unknown()).optional()
	});
	const ToolUseContentSchema$1 = object({
		type: literal("tool_use"),
		name: string(),
		id: string(),
		input: record(string(), unknown()),
		_meta: record(string(), unknown()).optional()
	});
	const EmbeddedResourceSchema$1 = object({
		type: literal("resource"),
		resource: union([TextResourceContentsSchema$1, BlobResourceContentsSchema$1]),
		annotations: AnnotationsSchema$1.optional(),
		_meta: record(string(), unknown()).optional()
	});
	const ResourceLinkSchema$1 = ResourceSchema$1.extend({ type: literal("resource_link") });
	const ContentBlockSchema$1 = union([
		TextContentSchema$1,
		ImageContentSchema$1,
		AudioContentSchema$1,
		ResourceLinkSchema$1,
		EmbeddedResourceSchema$1
	]);
	const PromptMessageSchema$1 = object({
		role: RoleSchema$1,
		content: ContentBlockSchema$1
	});
	const ToolAnnotationsSchema$1 = object({
		title: string().optional(),
		readOnlyHint: boolean().optional(),
		destructiveHint: boolean().optional(),
		idempotentHint: boolean().optional(),
		openWorldHint: boolean().optional()
	});
	const ToolListChangedNotificationSchema$1 = NotificationSchema$1.extend({
		method: literal("notifications/tools/list_changed"),
		params: NotificationsParamsSchema$1.optional()
	});
	const ModelHintSchema$1 = object({ name: string().optional() });
	const ModelPreferencesSchema$1 = object({
		hints: array(ModelHintSchema$1).optional(),
		costPriority: number$1().min(0).max(1).optional(),
		speedPriority: number$1().min(0).max(1).optional(),
		intelligencePriority: number$1().min(0).max(1).optional()
	});
	const ToolChoiceSchema$1 = object({ mode: _enum([
		"auto",
		"required",
		"none"
	]).optional() });
	const BooleanSchemaSchema$1 = object({
		type: literal("boolean"),
		title: string().optional(),
		description: string().optional(),
		default: boolean().optional()
	});
	const StringSchemaSchema$1 = object({
		type: literal("string"),
		title: string().optional(),
		description: string().optional(),
		minLength: number$1().optional(),
		maxLength: number$1().optional(),
		format: _enum([
			"email",
			"uri",
			"date",
			"date-time"
		]).optional(),
		default: string().optional()
	});
	const NumberSchemaSchema$1 = object({
		type: _enum(["number", "integer"]),
		title: string().optional(),
		description: string().optional(),
		minimum: number$1().optional(),
		maximum: number$1().optional(),
		default: number$1().optional()
	});
	const UntitledSingleSelectEnumSchemaSchema$1 = object({
		type: literal("string"),
		title: string().optional(),
		description: string().optional(),
		enum: array(string()),
		default: string().optional()
	});
	const TitledSingleSelectEnumSchemaSchema$1 = object({
		type: literal("string"),
		title: string().optional(),
		description: string().optional(),
		oneOf: array(object({
			const: string(),
			title: string()
		})),
		default: string().optional()
	});
	const LegacyTitledEnumSchemaSchema$1 = object({
		type: literal("string"),
		title: string().optional(),
		description: string().optional(),
		enum: array(string()),
		enumNames: array(string()).optional(),
		default: string().optional()
	});
	const SingleSelectEnumSchemaSchema$1 = union([UntitledSingleSelectEnumSchemaSchema$1, TitledSingleSelectEnumSchemaSchema$1]);
	const UntitledMultiSelectEnumSchemaSchema$1 = object({
		type: literal("array"),
		title: string().optional(),
		description: string().optional(),
		minItems: number$1().optional(),
		maxItems: number$1().optional(),
		items: object({
			type: literal("string"),
			enum: array(string())
		}),
		default: array(string()).optional()
	});
	const TitledMultiSelectEnumSchemaSchema$1 = object({
		type: literal("array"),
		title: string().optional(),
		description: string().optional(),
		minItems: number$1().optional(),
		maxItems: number$1().optional(),
		items: object({ anyOf: array(object({
			const: string(),
			title: string()
		})) }),
		default: array(string()).optional()
	});
	const MultiSelectEnumSchemaSchema$1 = union([UntitledMultiSelectEnumSchemaSchema$1, TitledMultiSelectEnumSchemaSchema$1]);
	const EnumSchemaSchema$1 = union([
		LegacyTitledEnumSchemaSchema$1,
		SingleSelectEnumSchemaSchema$1,
		MultiSelectEnumSchemaSchema$1
	]);
	const PrimitiveSchemaDefinitionSchema$1 = union([
		EnumSchemaSchema$1,
		BooleanSchemaSchema$1,
		StringSchemaSchema$1,
		NumberSchemaSchema$1
	]);
	const ElicitRequestFormParamsSchema$1 = TaskAugmentedRequestParamsSchema$1.extend({
		mode: literal("form").optional(),
		message: string(),
		requestedSchema: object({
			type: literal("object"),
			properties: record(string(), PrimitiveSchemaDefinitionSchema$1),
			required: array(string()).optional()
		}).catchall(unknown())
	});
	const ResourceTemplateReferenceSchema$1 = object({
		type: literal("ref/resource"),
		uri: string()
	});
	const PromptReferenceSchema$1 = object({
		type: literal("ref/prompt"),
		name: string()
	});
	const RootSchema$1 = object({
		uri: string().startsWith("file://"),
		name: string().optional(),
		_meta: record(string(), unknown()).optional()
	});
	const sharedClientCapabilityShape = ClientCapabilitiesSchema$1.shape;
	const ClientCapabilities2026Schema = object({
		experimental: sharedClientCapabilityShape.experimental,
		sampling: sharedClientCapabilityShape.sampling,
		elicitation: sharedClientCapabilityShape.elicitation,
		roots: sharedClientCapabilityShape.roots,
		extensions: sharedClientCapabilityShape.extensions
	});
	const sharedServerCapabilityShape = ServerCapabilitiesSchema$1.shape;
	const ServerCapabilities2026Schema = object({
		experimental: sharedServerCapabilityShape.experimental,
		logging: sharedServerCapabilityShape.logging,
		completions: sharedServerCapabilityShape.completions,
		prompts: sharedServerCapabilityShape.prompts,
		resources: sharedServerCapabilityShape.resources,
		tools: sharedServerCapabilityShape.tools,
		extensions: sharedServerCapabilityShape.extensions
	});
	/**
	* The per-request `_meta` envelope carried by every request under protocol revision
	* 2026-07-28: the protocol version governing the request, the client implementation
	* info, and the client's capabilities — declared per request rather than once at
	* initialization — plus the optional log-level opt-in.
	*
	* This schema models the complete envelope on its own (loose: foreign keys
	* pass through - the lift extracts exactly the reserved keys, so enforcement
	* never sees extension material). Requiredness is enforced per request at
	* dispatch time by the 2026-era codec's `checkInboundEnvelope` step.
	*/
	const RequestMetaEnvelopeSchema = looseObject({
		progressToken: ProgressTokenSchema$1.optional(),
		[PROTOCOL_VERSION_META_KEY]: string(),
		[CLIENT_INFO_META_KEY]: ImplementationSchema$1.optional(),
		[CLIENT_CAPABILITIES_META_KEY]: ClientCapabilities2026Schema,
		[LOG_LEVEL_META_KEY]: LoggingLevelSchema$1.optional()
	});
	/** 2026-era Tool: anchor-exact — no `execution` (deleted vocabulary). */
	const ToolSchema$1 = object({
		...BaseMetadataSchema$1.shape,
		...IconsSchema$1.shape,
		description: string().optional(),
		inputSchema: looseObject({
			$schema: string().optional(),
			type: literal("object")
		}),
		outputSchema: looseObject({ $schema: string().optional() }).optional(),
		annotations: ToolAnnotationsSchema$1.optional(),
		_meta: record(string(), unknown()).optional()
	});
	/** 2026-era ToolResultContent (anchor-exact: `structuredContent?: unknown`). */
	const ToolResultContentSchema$1 = object({
		type: literal("tool_result"),
		toolUseId: string(),
		content: array(ContentBlockSchema$1),
		structuredContent: unknown().optional(),
		isError: boolean().optional(),
		_meta: record(string(), unknown()).optional()
	});
	/** 2026-era sampling content union (composes the forked tool-result shape). */
	const SamplingMessageContentBlockSchema$1 = union([
		TextContentSchema$1,
		ImageContentSchema$1,
		AudioContentSchema$1,
		ToolUseContentSchema$1,
		ToolResultContentSchema$1
	]);
	/** 2026-era SamplingMessage (anchor-exact: single block or array). */
	const SamplingMessageSchema$1 = object({
		role: RoleSchema$1,
		content: union([SamplingMessageContentBlockSchema$1, array(SamplingMessageContentBlockSchema$1)]),
		_meta: record(string(), unknown()).optional()
	});
	/** Open union per the anchor: 'complete' | 'input_required' | string. */
	const ResultTypeSchema = string();
	/**
	* Result `_meta` (anchor `ResultMetaObject`, added by spec PR #3002):
	* loose, with the serverInfo key typed when present; the outbound stamp
	* is the encode contract's `stampServerInfoMeta` step.
	*/
	const ResultMetaSchema = looseObject({ [SERVER_INFO_META_KEY]: ImplementationSchema$1.optional().catch(void 0) });
	const wireMeta = ResultMetaSchema.optional();
	function wireResult(shape) {
		return looseObject({
			_meta: wireMeta,
			resultType: ResultTypeSchema.default("complete"),
			...shape
		});
	}
	const ResultSchema$1 = wireResult({});
	const PaginatedResultSchema$1 = wireResult({ nextCursor: CursorSchema$1.optional() });
	const CallToolResultSchema$1 = wireResult({
		content: array(ContentBlockSchema$1),
		structuredContent: unknown().optional(),
		isError: boolean().optional()
	});
	const ListToolsResultSchema$1 = wireResult({
		ttlMs: number$1().int().min(0),
		cacheScope: _enum(["public", "private"]),
		tools: array(ToolSchema$1),
		nextCursor: CursorSchema$1.optional()
	});
	const ListPromptsResultSchema$1 = wireResult({
		ttlMs: number$1().int().min(0),
		cacheScope: _enum(["public", "private"]),
		prompts: array(PromptSchema$1),
		nextCursor: CursorSchema$1.optional()
	});
	const GetPromptResultSchema$1 = wireResult({
		description: string().optional(),
		messages: array(PromptMessageSchema$1)
	});
	const ListResourcesResultSchema$1 = wireResult({
		ttlMs: number$1().int().min(0),
		cacheScope: _enum(["public", "private"]),
		resources: array(ResourceSchema$1),
		nextCursor: CursorSchema$1.optional()
	});
	const ListResourceTemplatesResultSchema$1 = wireResult({
		ttlMs: number$1().int().min(0),
		cacheScope: _enum(["public", "private"]),
		resourceTemplates: array(ResourceTemplateSchema$1),
		nextCursor: CursorSchema$1.optional()
	});
	const ReadResourceResultSchema$1 = wireResult({
		ttlMs: number$1().int().min(0),
		cacheScope: _enum(["public", "private"]),
		contents: array(union([TextResourceContentsSchema$1, BlobResourceContentsSchema$1]))
	});
	const CompleteResultSchema$1 = wireResult({ completion: object({
		values: array(string()).max(100),
		total: number$1().int().optional(),
		hasMore: boolean().optional()
	}).loose() });
	/** CacheableResult (SEP-2549): ttlMs and cacheScope REQUIRED per the anchor. */
	const CacheableResultSchema = wireResult({
		ttlMs: number$1().int().min(0),
		cacheScope: _enum(["public", "private"])
	});
	const DiscoverResultSchema$1 = wireResult({
		ttlMs: number$1().int().min(0).catch(0),
		cacheScope: _enum(["public", "private"]).catch("private"),
		supportedVersions: array(string()),
		capabilities: ServerCapabilities2026Schema,
		instructions: string().optional()
	});
	/** 2026-era CreateMessageRequestParams (anchor-exact: forked SamplingMessage/Tool, no task augmentation). */
	const CreateMessageRequestParamsSchema$1 = object({
		messages: array(SamplingMessageSchema$1),
		modelPreferences: ModelPreferencesSchema$1.optional(),
		systemPrompt: string().optional(),
		includeContext: _enum([
			"none",
			"thisServer",
			"allServers"
		]).optional(),
		temperature: number$1().optional(),
		maxTokens: number$1().int(),
		stopSequences: array(string()).optional(),
		metadata: JSONObjectSchema$1.optional(),
		tools: array(ToolSchema$1).optional(),
		toolChoice: ToolChoiceSchema$1.optional()
	});
	/** 2026-era embedded sampling request (de-JSON-RPC'd). */
	const CreateMessageRequestSchema$1 = object({
		method: literal("sampling/createMessage"),
		params: CreateMessageRequestParamsSchema$1
	});
	/**
	* 2026-era embedded roots listing request (de-JSON-RPC'd). Embedded input
	* requests do NOT carry the per-request `_meta` envelope on this revision —
	* the anchor declares a bare optional `_meta` on `params`.
	*/
	const ListRootsRequestSchema$1 = object({
		method: literal("roots/list"),
		params: object({ _meta: record(string(), unknown()).optional() }).optional()
	});
	/** 2026-era embedded sampling response (anchor-exact: extends the forked SamplingMessage). */
	const CreateMessageResultSchema$1 = object({
		...SamplingMessageSchema$1.shape,
		model: string(),
		stopReason: string().optional()
	});
	/** 2026-era embedded roots listing response (anchor-exact: bare `roots` array). */
	const ListRootsResultSchema$1 = object({ roots: array(RootSchema$1) });
	/** 2026-era embedded elicitation response (anchor-exact: bare result, restricted content value types). */
	const ElicitResultSchema$1 = object({
		action: _enum([
			"accept",
			"decline",
			"cancel"
		]),
		content: record(string(), union([
			string(),
			number$1(),
			boolean(),
			array(string())
		])).optional()
	});
	/**
	* 2026-era URL-mode elicitation params (anchor-exact fork): the draft removed
	* `elicitationId` (and the `notifications/elicitation/complete` channel it
	* keyed) — the shared schema keeps the field because it is required on the
	* frozen 2025-11-25 revision.
	*/
	const ElicitRequestURLParamsSchema$1 = object({
		mode: literal("url"),
		message: string(),
		url: string().url()
	});
	/** 2026-era elicitation params (form mode is revision-identical; URL mode is the fork above). */
	const ElicitRequestParamsSchema$1 = union([ElicitRequestFormParamsSchema$1, ElicitRequestURLParamsSchema$1]);
	/** 2026-era embedded elicitation request (de-JSON-RPC'd; see the URL-mode fork above). */
	const ElicitRequestSchema$1 = object({
		method: literal("elicitation/create"),
		params: ElicitRequestParamsSchema$1
	});
	/** A single embedded input request (one of the three demoted server→client requests). */
	const InputRequestSchema = union([
		CreateMessageRequestSchema$1,
		ListRootsRequestSchema$1,
		ElicitRequestSchema$1
	]);
	/** A single embedded input response — the BARE result union (never a `{method, result}` wrapper). */
	const InputResponseSchema = union([
		CreateMessageResultSchema$1,
		ListRootsResultSchema$1,
		ElicitResultSchema$1
	]);
	/** Map of embedded input requests, keyed by server-assigned identifiers. */
	const InputRequestsSchema = record(string(), InputRequestSchema);
	/** Map of embedded input responses, keyed by the corresponding request identifiers. */
	const InputResponsesSchema = record(string(), InputResponseSchema);
	/**
	* The wire InputRequiredResult: `resultType: 'input_required'` plus at least
	* one of `inputRequests` / `requestState` (the at-least-one rule is enforced
	* at the server seam, not by this parse shape).
	*/
	const InputRequiredResultSchema = wireResult({
		inputRequests: InputRequestsSchema.optional(),
		requestState: string().optional()
	});
	/** The retry-channel members carried by client-initiated requests on this revision. */
	const retryParamsShape = {
		inputResponses: InputResponsesSchema.optional(),
		requestState: string().optional()
	};
	/** Anchor InputResponseRequestParams: the retry channel on top of the required request `_meta` envelope. */
	const InputResponseRequestParamsSchema = object({
		_meta: RequestMetaEnvelopeSchema,
		...retryParamsShape
	});
	/** Post-lift request `_meta` (progressToken + extension keys; loose). */
	const DispatchRequestMetaSchema = looseObject({ progressToken: ProgressTokenSchema$1.optional() });
	function wireRequest(method, paramsShape) {
		return object({
			method: literal(method),
			params: object({
				_meta: RequestMetaEnvelopeSchema,
				...paramsShape
			})
		});
	}
	function dispatchRequest(method, paramsShape) {
		return object({
			method: literal(method),
			params: object({
				_meta: DispatchRequestMetaSchema.optional(),
				...paramsShape
			}).optional()
		});
	}
	const callToolParamsShape = {
		name: string(),
		arguments: record(string(), unknown()).optional(),
		...retryParamsShape
	};
	const paginatedParamsShape = { cursor: CursorSchema$1.optional() };
	const CallToolRequestSchema$1 = wireRequest("tools/call", callToolParamsShape);
	const ListToolsRequestSchema$1 = wireRequest("tools/list", paginatedParamsShape);
	const ListPromptsRequestSchema$1 = wireRequest("prompts/list", paginatedParamsShape);
	const GetPromptRequestSchema$1 = wireRequest("prompts/get", {
		name: string(),
		arguments: record(string(), string()).optional(),
		...retryParamsShape
	});
	const ListResourcesRequestSchema$1 = wireRequest("resources/list", paginatedParamsShape);
	const ListResourceTemplatesRequestSchema$1 = wireRequest("resources/templates/list", paginatedParamsShape);
	const ReadResourceRequestSchema$1 = wireRequest("resources/read", {
		uri: string(),
		...retryParamsShape
	});
	const completeParamsShape = {
		ref: union([PromptReferenceSchema$1, ResourceTemplateReferenceSchema$1]),
		argument: object({
			name: string(),
			value: string()
		}),
		context: object({ arguments: record(string(), string()).optional() }).optional()
	};
	const CompleteRequestSchema$1 = wireRequest("completion/complete", completeParamsShape);
	const DiscoverRequestSchema$1 = wireRequest("server/discover", {});
	/** Anchor SubscriptionFilter (2026-only). */
	const SubscriptionFilterSchema$1 = object({
		toolsListChanged: boolean().optional(),
		promptsListChanged: boolean().optional(),
		resourcesListChanged: boolean().optional(),
		resourceSubscriptions: array(string()).optional()
	});
	const subscriptionsListenParamsShape = { notifications: SubscriptionFilterSchema$1 };
	const SubscriptionsListenRequestSchema$1 = wireRequest("subscriptions/listen", subscriptionsListenParamsShape);
	/**
	* Anchor SubscriptionsListenResultMetaObject — required subscriptionId stamp on
	* the graceful-close result. Extends `ResultMetaObject` since spec PR
	* #3002 (composed, so the serverInfo key and its leniency stay single-sourced).
	*/
	const SubscriptionsListenResultMetaSchema$1 = ResultMetaSchema.extend({ "io.modelcontextprotocol/subscriptionId": RequestIdSchema$1 });
	/**
	* Anchor SubscriptionsListenResult (2026-only). The empty `subscriptions/listen`
	* response signalling that the subscription has ended gracefully (server
	* shutdown). An abrupt transport close carries no response — the client treats
	* stream-close-without-result as a disconnect.
	*/
	const SubscriptionsListenResultSchema$1 = looseObject({
		_meta: SubscriptionsListenResultMetaSchema$1,
		resultType: ResultTypeSchema.default("complete")
	});
	/** Dispatch (post-lift) request schemas, keyed by method — registry-internal. */
	const dispatchRequestSchemas = {
		"tools/call": dispatchRequest("tools/call", callToolParamsShape),
		"tools/list": dispatchRequest("tools/list", paginatedParamsShape),
		"prompts/get": dispatchRequest("prompts/get", {
			name: string(),
			arguments: record(string(), string()).optional()
		}),
		"prompts/list": dispatchRequest("prompts/list", paginatedParamsShape),
		"resources/list": dispatchRequest("resources/list", paginatedParamsShape),
		"resources/templates/list": dispatchRequest("resources/templates/list", paginatedParamsShape),
		"resources/read": dispatchRequest("resources/read", { uri: string() }),
		"completion/complete": dispatchRequest("completion/complete", completeParamsShape),
		"server/discover": dispatchRequest("server/discover", {}),
		"subscriptions/listen": dispatchRequest("subscriptions/listen", subscriptionsListenParamsShape)
	};
	/** Dispatch (post-lift) result schemas, keyed by method — what the funnel
	* validates AFTER `decodeResult` consumed `resultType`. */
	function liftedResult(shape) {
		return looseObject({
			_meta: wireMeta,
			...shape
		});
	}
	const dispatchResultSchemas = {
		"tools/call": liftedResult({
			content: array(ContentBlockSchema$1),
			structuredContent: unknown().optional(),
			isError: boolean().optional()
		}),
		"tools/list": liftedResult({
			ttlMs: number$1().int().min(0),
			cacheScope: _enum(["public", "private"]),
			tools: array(ToolSchema$1),
			nextCursor: CursorSchema$1.optional()
		}),
		"prompts/get": liftedResult({
			description: string().optional(),
			messages: array(PromptMessageSchema$1)
		}),
		"prompts/list": liftedResult({
			ttlMs: number$1().int().min(0),
			cacheScope: _enum(["public", "private"]),
			prompts: array(PromptSchema$1),
			nextCursor: CursorSchema$1.optional()
		}),
		"resources/list": liftedResult({
			ttlMs: number$1().int().min(0),
			cacheScope: _enum(["public", "private"]),
			resources: array(ResourceSchema$1),
			nextCursor: CursorSchema$1.optional()
		}),
		"resources/templates/list": liftedResult({
			ttlMs: number$1().int().min(0),
			cacheScope: _enum(["public", "private"]),
			resourceTemplates: array(ResourceTemplateSchema$1),
			nextCursor: CursorSchema$1.optional()
		}),
		"resources/read": liftedResult({
			ttlMs: number$1().int().min(0),
			cacheScope: _enum(["public", "private"]),
			contents: array(union([TextResourceContentsSchema$1, BlobResourceContentsSchema$1]))
		}),
		"completion/complete": liftedResult({ completion: object({
			values: array(string()).max(100),
			total: number$1().int().optional(),
			hasMore: boolean().optional()
		}).loose() }),
		"server/discover": liftedResult({
			ttlMs: number$1().int().min(0).catch(0),
			cacheScope: _enum(["public", "private"]).catch("private"),
			supportedVersions: array(string()),
			capabilities: ServerCapabilities2026Schema,
			instructions: string().optional()
		}),
		"subscriptions/listen": liftedResult({})
	};
	/**
	* Notification `_meta` (anchor `NotificationMetaObject`): loose, with the
	* subscriptions/listen demux key typed when present. Only the anchor-exact
	* SHAPE is modeled here — listen delivery itself (filter gating, demux,
	* teardown) is #14 scope and not implemented by this module.
	*/
	const NotificationMetaSchema = looseObject({ "io.modelcontextprotocol/subscriptionId": RequestIdSchema$1.optional() });
	/** Anchor SubscriptionsAcknowledgedNotification (2026-only). */
	const SubscriptionsAcknowledgedNotificationSchema$1 = object({
		method: literal("notifications/subscriptions/acknowledged"),
		params: object({
			_meta: NotificationMetaSchema.optional(),
			notifications: SubscriptionFilterSchema$1
		})
	});
	/**
	* 2026-era `notifications/cancelled` params (anchor-exact fork): `requestId`
	* is REQUIRED on this revision — the shared schema keeps it optional because
	* the frozen 2025-11-25 shape declares it optional (task cancellation goes
	* through `tasks/cancel` there). Requiredness is bare because no 2025-era
	* traffic touches this module.
	*/
	const CancelledNotificationParamsSchema$1 = object({
		_meta: NotificationMetaSchema.optional(),
		requestId: RequestIdSchema$1,
		reason: string().optional()
	});
	/** 2026-era `notifications/cancelled` (see the params fork above). */
	const CancelledNotificationSchema$1 = object({
		method: literal("notifications/cancelled"),
		params: CancelledNotificationParamsSchema$1
	});
	const notificationSchemas2026 = {
		"notifications/cancelled": CancelledNotificationSchema$1,
		"notifications/progress": ProgressNotificationSchema$1,
		"notifications/message": LoggingMessageNotificationSchema$1,
		"notifications/resources/updated": ResourceUpdatedNotificationSchema$1,
		"notifications/resources/list_changed": ResourceListChangedNotificationSchema$1,
		"notifications/tools/list_changed": ToolListChangedNotificationSchema$1,
		"notifications/prompts/list_changed": PromptListChangedNotificationSchema$1,
		"notifications/subscriptions/acknowledged": SubscriptionsAcknowledgedNotificationSchema$1
	};
	const wireResultResponse = (result) => object({
		jsonrpc: literal("2.0"),
		id: union([string(), number$1().int()]),
		result
	}).strict();
	return {
		JSONValueSchema: JSONValueSchema$1,
		JSONObjectSchema: JSONObjectSchema$1,
		ProgressTokenSchema: ProgressTokenSchema$1,
		CursorSchema: CursorSchema$1,
		RequestIdSchema: RequestIdSchema$1,
		RoleSchema: RoleSchema$1,
		LoggingLevelSchema: LoggingLevelSchema$1,
		TaskMetadataSchema: TaskMetadataSchema$1,
		RelatedTaskMetadataSchema: RelatedTaskMetadataSchema$1,
		RequestMetaSchema: RequestMetaSchema$1,
		BaseRequestParamsSchema: BaseRequestParamsSchema$1,
		TaskAugmentedRequestParamsSchema: TaskAugmentedRequestParamsSchema$1,
		NotificationsParamsSchema: NotificationsParamsSchema$1,
		NotificationSchema: NotificationSchema$1,
		IconSchema: IconSchema$1,
		IconsSchema: IconsSchema$1,
		BaseMetadataSchema: BaseMetadataSchema$1,
		ImplementationSchema: ImplementationSchema$1,
		ClientTasksCapabilitySchema: ClientTasksCapabilitySchema$1,
		ServerTasksCapabilitySchema: ServerTasksCapabilitySchema$1,
		ClientCapabilitiesSchema: ClientCapabilitiesSchema$1,
		ServerCapabilitiesSchema: ServerCapabilitiesSchema$1,
		ProgressSchema: ProgressSchema$1,
		ProgressNotificationParamsSchema: ProgressNotificationParamsSchema$1,
		ProgressNotificationSchema: ProgressNotificationSchema$1,
		LoggingMessageNotificationParamsSchema: LoggingMessageNotificationParamsSchema$1,
		LoggingMessageNotificationSchema: LoggingMessageNotificationSchema$1,
		ResourceContentsSchema: ResourceContentsSchema$1,
		TextResourceContentsSchema: TextResourceContentsSchema$1,
		BlobResourceContentsSchema: BlobResourceContentsSchema$1,
		AnnotationsSchema: AnnotationsSchema$1,
		ResourceSchema: ResourceSchema$1,
		ResourceTemplateSchema: ResourceTemplateSchema$1,
		ResourceListChangedNotificationSchema: ResourceListChangedNotificationSchema$1,
		ResourceUpdatedNotificationParamsSchema: ResourceUpdatedNotificationParamsSchema$1,
		ResourceUpdatedNotificationSchema: ResourceUpdatedNotificationSchema$1,
		PromptArgumentSchema: PromptArgumentSchema$1,
		PromptSchema: PromptSchema$1,
		PromptListChangedNotificationSchema: PromptListChangedNotificationSchema$1,
		TextContentSchema: TextContentSchema$1,
		ImageContentSchema: ImageContentSchema$1,
		AudioContentSchema: AudioContentSchema$1,
		ToolUseContentSchema: ToolUseContentSchema$1,
		EmbeddedResourceSchema: EmbeddedResourceSchema$1,
		ResourceLinkSchema: ResourceLinkSchema$1,
		ContentBlockSchema: ContentBlockSchema$1,
		PromptMessageSchema: PromptMessageSchema$1,
		ToolAnnotationsSchema: ToolAnnotationsSchema$1,
		ToolListChangedNotificationSchema: ToolListChangedNotificationSchema$1,
		ModelHintSchema: ModelHintSchema$1,
		ModelPreferencesSchema: ModelPreferencesSchema$1,
		ToolChoiceSchema: ToolChoiceSchema$1,
		BooleanSchemaSchema: BooleanSchemaSchema$1,
		StringSchemaSchema: StringSchemaSchema$1,
		NumberSchemaSchema: NumberSchemaSchema$1,
		UntitledSingleSelectEnumSchemaSchema: UntitledSingleSelectEnumSchemaSchema$1,
		TitledSingleSelectEnumSchemaSchema: TitledSingleSelectEnumSchemaSchema$1,
		LegacyTitledEnumSchemaSchema: LegacyTitledEnumSchemaSchema$1,
		SingleSelectEnumSchemaSchema: SingleSelectEnumSchemaSchema$1,
		UntitledMultiSelectEnumSchemaSchema: UntitledMultiSelectEnumSchemaSchema$1,
		TitledMultiSelectEnumSchemaSchema: TitledMultiSelectEnumSchemaSchema$1,
		MultiSelectEnumSchemaSchema: MultiSelectEnumSchemaSchema$1,
		EnumSchemaSchema: EnumSchemaSchema$1,
		PrimitiveSchemaDefinitionSchema: PrimitiveSchemaDefinitionSchema$1,
		ElicitRequestFormParamsSchema: ElicitRequestFormParamsSchema$1,
		ResourceTemplateReferenceSchema: ResourceTemplateReferenceSchema$1,
		PromptReferenceSchema: PromptReferenceSchema$1,
		RootSchema: RootSchema$1,
		ClientCapabilities2026Schema,
		ServerCapabilities2026Schema,
		RequestMetaEnvelopeSchema,
		ToolSchema: ToolSchema$1,
		ToolResultContentSchema: ToolResultContentSchema$1,
		SamplingMessageContentBlockSchema: SamplingMessageContentBlockSchema$1,
		SamplingMessageSchema: SamplingMessageSchema$1,
		ResultTypeSchema,
		ResultMetaSchema,
		ResultSchema: ResultSchema$1,
		PaginatedResultSchema: PaginatedResultSchema$1,
		CallToolResultSchema: CallToolResultSchema$1,
		ListToolsResultSchema: ListToolsResultSchema$1,
		ListPromptsResultSchema: ListPromptsResultSchema$1,
		GetPromptResultSchema: GetPromptResultSchema$1,
		ListResourcesResultSchema: ListResourcesResultSchema$1,
		ListResourceTemplatesResultSchema: ListResourceTemplatesResultSchema$1,
		ReadResourceResultSchema: ReadResourceResultSchema$1,
		CompleteResultSchema: CompleteResultSchema$1,
		CacheableResultSchema,
		DiscoverResultSchema: DiscoverResultSchema$1,
		CreateMessageRequestParamsSchema: CreateMessageRequestParamsSchema$1,
		CreateMessageRequestSchema: CreateMessageRequestSchema$1,
		ListRootsRequestSchema: ListRootsRequestSchema$1,
		CreateMessageResultSchema: CreateMessageResultSchema$1,
		ListRootsResultSchema: ListRootsResultSchema$1,
		ElicitResultSchema: ElicitResultSchema$1,
		ElicitRequestURLParamsSchema: ElicitRequestURLParamsSchema$1,
		ElicitRequestParamsSchema: ElicitRequestParamsSchema$1,
		ElicitRequestSchema: ElicitRequestSchema$1,
		InputRequestSchema,
		InputResponseSchema,
		InputRequestsSchema,
		InputResponsesSchema,
		InputRequiredResultSchema,
		InputResponseRequestParamsSchema,
		CallToolRequestSchema: CallToolRequestSchema$1,
		ListToolsRequestSchema: ListToolsRequestSchema$1,
		ListPromptsRequestSchema: ListPromptsRequestSchema$1,
		GetPromptRequestSchema: GetPromptRequestSchema$1,
		ListResourcesRequestSchema: ListResourcesRequestSchema$1,
		ListResourceTemplatesRequestSchema: ListResourceTemplatesRequestSchema$1,
		ReadResourceRequestSchema: ReadResourceRequestSchema$1,
		CompleteRequestSchema: CompleteRequestSchema$1,
		DiscoverRequestSchema: DiscoverRequestSchema$1,
		SubscriptionFilterSchema: SubscriptionFilterSchema$1,
		SubscriptionsListenRequestSchema: SubscriptionsListenRequestSchema$1,
		SubscriptionsListenResultMetaSchema: SubscriptionsListenResultMetaSchema$1,
		SubscriptionsListenResultSchema: SubscriptionsListenResultSchema$1,
		dispatchRequestSchemas,
		dispatchResultSchemas,
		NotificationMetaSchema,
		SubscriptionsAcknowledgedNotificationSchema: SubscriptionsAcknowledgedNotificationSchema$1,
		CancelledNotificationParamsSchema: CancelledNotificationParamsSchema$1,
		CancelledNotificationSchema: CancelledNotificationSchema$1,
		notificationSchemas2026,
		JSONRPCResultResponseSchema: wireResultResponse(ResultSchema$1),
		CallToolResultResponseSchema: wireResultResponse(union([CallToolResultSchema$1, InputRequiredResultSchema])),
		ListToolsResultResponseSchema: wireResultResponse(ListToolsResultSchema$1),
		ListPromptsResultResponseSchema: wireResultResponse(ListPromptsResultSchema$1),
		GetPromptResultResponseSchema: wireResultResponse(union([GetPromptResultSchema$1, InputRequiredResultSchema])),
		ListResourcesResultResponseSchema: wireResultResponse(ListResourcesResultSchema$1),
		ListResourceTemplatesResultResponseSchema: wireResultResponse(ListResourceTemplatesResultSchema$1),
		ReadResourceResultResponseSchema: wireResultResponse(union([ReadResourceResultSchema$1, InputRequiredResultSchema])),
		CompleteResultResponseSchema: wireResultResponse(CompleteResultSchema$1),
		DiscoverResultResponseSchema: wireResultResponse(DiscoverResultSchema$1),
		SubscriptionsListenResultResponseSchema: wireResultResponse(SubscriptionsListenResultSchema$1)
	};
}
var memo;
/**
* Builds the era wire-schema set on first call and returns the same object
* thereafter. Module evaluation stays construction-free so importing the
* era codec/registry costs nothing until the first validation actually
* needs a schema; the registry, the codec, and the eager `schemas.ts`
* shim all pull through this memo, so reference identity holds across
* every consumer.
*/
function buildSchemas2026() {
	return memo ??= build();
}
/**
* The operations whose results are cacheable on the 2026-07-28 revision (the
* `CacheableResult` extenders). This list is closed: no other operation's
* result ever receives cache fields from the SDK.
*/
var CACHEABLE_RESULT_METHODS = [
	"tools/list",
	"prompts/list",
	"resources/list",
	"resources/templates/list",
	"resources/read",
	"server/discover"
];
/** Whether the given method's result is cacheable on the 2026-07-28 revision. */
function isCacheableResultMethod(method) {
	return CACHEABLE_RESULT_METHODS.includes(method);
}
/**
* The symbol-keyed carrier for a configured cache hint on a result object.
* Symbol properties are invisible to JSON serialization, so the carrier can be
* attached era-blind: only the 2026-era encode seam consumes it.
*/
var RESULT_CACHE_HINT_FALLBACK = Symbol("modelcontextprotocol.resultCacheHintFallback");
/**
* Attaches a configured cache hint to a result as the encode-time fallback.
* Returns the result unchanged when there is nothing to attach. When a more
* specific hint is already attached, the two hints are combined per field
* (most-specific-author-wins for each of `ttlMs` and `cacheScope`): the
* per-registration hint attached by the feature layer keeps every field it
* sets, and the server-level per-operation hint only fills the fields the
* more specific hint leaves unset.
*/
function attachCacheHintFallback(result, hint) {
	if (hint === void 0) return result;
	const attached = result[RESULT_CACHE_HINT_FALLBACK];
	if (attached === void 0) return {
		...result,
		[RESULT_CACHE_HINT_FALLBACK]: hint
	};
	const merged = {};
	const ttlMs = attached.ttlMs ?? hint.ttlMs;
	if (ttlMs !== void 0) merged.ttlMs = ttlMs;
	const cacheScope = attached.cacheScope ?? hint.cacheScope;
	if (cacheScope !== void 0) merged.cacheScope = cacheScope;
	return {
		...result,
		[RESULT_CACHE_HINT_FALLBACK]: merged
	};
}
/** Reads the configured cache-hint fallback attached to a result, if any. */
function cacheHintFallbackOf(result) {
	return result[RESULT_CACHE_HINT_FALLBACK];
}
/**
* Whether a value is a valid `ttlMs`: a non-negative safe integer. Safe
* integers are required because the wire schemas validate `ttlMs` as an
* integer within `Number.MIN_SAFE_INTEGER`/`Number.MAX_SAFE_INTEGER`; a value
* outside that range is treated as invalid here so it falls through to the
* next author instead of being emitted and rejected downstream.
*/
function isValidCacheTtlMs(value) {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
/** Whether a value is a valid `cacheScope`. */
function isValidCacheScope(value) {
	return value === "public" || value === "private";
}
/**
* Validates a configured cache hint at configuration time. Throws a
* `RangeError` naming the offending field, so misconfiguration fails at
* startup/registration rather than silently degrading at encode time.
*/
function assertValidCacheHint(hint, context) {
	if (hint.ttlMs !== void 0 && !isValidCacheTtlMs(hint.ttlMs)) throw new RangeError(`Invalid cache hint for ${context}: ttlMs must be a non-negative safe integer (got ${String(hint.ttlMs)})`);
	if (hint.cacheScope !== void 0 && !isValidCacheScope(hint.cacheScope)) throw new RangeError(`Invalid cache hint for ${context}: cacheScope must be 'public' or 'private' (got ${String(hint.cacheScope)})`);
}
/**
* Error codes for protocol errors that cross the wire as JSON-RPC error responses.
* These follow the JSON-RPC specification and MCP-specific extensions.
*/
var ProtocolErrorCode = /* @__PURE__ */ function(ProtocolErrorCode$1) {
	ProtocolErrorCode$1[ProtocolErrorCode$1["ParseError"] = -32700] = "ParseError";
	ProtocolErrorCode$1[ProtocolErrorCode$1["InvalidRequest"] = -32600] = "InvalidRequest";
	ProtocolErrorCode$1[ProtocolErrorCode$1["MethodNotFound"] = -32601] = "MethodNotFound";
	ProtocolErrorCode$1[ProtocolErrorCode$1["InvalidParams"] = -32602] = "InvalidParams";
	ProtocolErrorCode$1[ProtocolErrorCode$1["InternalError"] = -32603] = "InternalError";
	/**
	* Resource not found.
	*
	* Receive-tolerated only: the SDK never EMITS `-32002` — `resources/read`
	* misses answer `-32602` (Invalid Params) on every protocol revision per
	* the 2026-07-28 spec MUST, and a handler-thrown `-32002` is mapped to
	* `-32602` at the era encode seam. The member stays importable so clients
	* can recognise `-32002` from peers built on earlier SDK releases (the
	* spec's "clients SHOULD also accept `-32002`" backwards-compatibility
	* clause). Throw `ResourceNotFoundError` instead.
	*/
	ProtocolErrorCode$1[ProtocolErrorCode$1["ResourceNotFound"] = -32002] = "ResourceNotFound";
	/**
	* Processing the request requires a capability the client did not declare
	* in the request's `clientCapabilities` (protocol revision 2026-07-28).
	*/
	ProtocolErrorCode$1[ProtocolErrorCode$1["MissingRequiredClientCapability"] = -32021] = "MissingRequiredClientCapability";
	/**
	* The request's protocol version is unknown to the server or unsupported
	* by it (protocol revision 2026-07-28).
	*/
	ProtocolErrorCode$1[ProtocolErrorCode$1["UnsupportedProtocolVersion"] = -32022] = "UnsupportedProtocolVersion";
	ProtocolErrorCode$1[ProtocolErrorCode$1["UrlElicitationRequired"] = -32042] = "UrlElicitationRequired";
	return ProtocolErrorCode$1;
}({});
/**
* Protocol errors are JSON-RPC errors that cross the wire as error responses.
* They use numeric error codes from the {@linkcode ProtocolErrorCode} enum.
*
* `instanceof` on this class (and its subclasses) is brand-matched, so it works
* across separately bundled copies of the SDK — e.g. an error constructed by
* `@modelcontextprotocol/client` matches the class re-exported by
* `@modelcontextprotocol/server` in the same process.
*/
var ProtocolError = class ProtocolError extends Error {
	static {
		Object.defineProperty(this, "mcpBrand", { value: "mcp.ProtocolError" });
	}
	static [Symbol.hasInstance](value) {
		return brandedHasInstance(this, value);
	}
	/**
	* Brand-based type guard: equivalent to `value instanceof this`, as an
	* explicit static predicate (the axios/AWS-SDK `isInstance` style). Reads
	* the caller's own brand via `this`, so every branded subclass gets a
	* correctly-scoped guard by inheritance. Must be invoked on the class —
	* in callback position write `v => SdkError.isInstance(v)`, not
	* `.filter(SdkError.isInstance)` (detached calls throw rather than
	* silently matching nothing).
	*/
	static isInstance(value) {
		if (typeof this !== "function") throw new TypeError("isInstance must be called on the class (e.g. `SdkError.isInstance(value)`); for callbacks use `v => SdkError.isInstance(v)`");
		return brandedHasInstance(this, value);
	}
	constructor(code, message, data) {
		super(message);
		this.code = code;
		this.data = data;
		this.name = "ProtocolError";
		stampErrorBrands(this, new.target);
	}
	/**
	* Factory method to create the appropriate error type based on the error code and data
	*/
	static fromError(code, message, data) {
		if (code === ProtocolErrorCode.UrlElicitationRequired && data) {
			const errorData = data;
			if (errorData.elicitations) return new UrlElicitationRequiredError(errorData.elicitations, message);
		}
		if (code === ProtocolErrorCode.UnsupportedProtocolVersion && data) {
			const errorData = data;
			if (Array.isArray(errorData.supported) && typeof errorData.requested === "string") return new UnsupportedProtocolVersionError({
				supported: errorData.supported,
				requested: errorData.requested
			}, message);
		}
		if (code === ProtocolErrorCode.InvalidParams || code === ProtocolErrorCode.ResourceNotFound) {
			const errorData = data;
			if (typeof errorData?.uri === "string" && (code === ProtocolErrorCode.ResourceNotFound || Object.keys(errorData).length === 1)) return new ResourceNotFoundError(errorData.uri, message);
		}
		if (code === ProtocolErrorCode.MissingRequiredClientCapability && data) {
			const errorData = data;
			if (errorData.requiredCapabilities !== null && typeof errorData.requiredCapabilities === "object" && !Array.isArray(errorData.requiredCapabilities)) return new MissingRequiredClientCapabilityError({ requiredCapabilities: errorData.requiredCapabilities }, message);
		}
		return new ProtocolError(code, message, data);
	}
};
/**
* Error type for a `resources/read` miss: the requested resource does not
* exist. The wire code is `-32602` (Invalid Params) on every protocol
* revision — the spec MUST for revision 2026-07-28, and the value the v1.x
* SDK has always emitted on earlier revisions. The error data echoes the
* requested URI.
*
* Recognise this error by checking `error.data` is exactly `{ uri: string }`
* (a `-32602` whose data carries `uri` and nothing else is resource-not-found;
* any other `-32602` is an ordinary Invalid Params). For backwards compatibility, clients should also
* accept `-32002` as resource not found — earlier SDK builds emitted that
* code, and {@linkcode ProtocolError.fromError} reconstructs this class for
* either code **when `error.data` carries `uri`** (a bare `-32002` without
* `data.uri` stays a generic {@linkcode ProtocolError}). `instanceof` checks
* are brand-matched and work across separately bundled copies of the SDK.
*/
var ResourceNotFoundError = class extends ProtocolError {
	static {
		Object.defineProperty(this, "mcpBrand", { value: "mcp.ResourceNotFoundError" });
	}
	constructor(uri, message = `Resource not found: ${uri}`) {
		super(ProtocolErrorCode.InvalidParams, message, { uri });
	}
	/** The URI that was requested and not found. */
	get uri() {
		return this.data.uri;
	}
};
/**
* Specialized error type when a tool requires a URL mode elicitation.
* This makes it nicer for the client to handle since there is specific data to work with instead of just a code to check against.
*/
var UrlElicitationRequiredError = class extends ProtocolError {
	static {
		Object.defineProperty(this, "mcpBrand", { value: "mcp.UrlElicitationRequiredError" });
	}
	constructor(elicitations, message = `URL elicitation${elicitations.length > 1 ? "s" : ""} required`) {
		super(ProtocolErrorCode.UrlElicitationRequired, message, { elicitations });
	}
	get elicitations() {
		return this.data?.elicitations ?? [];
	}
};
/**
* Error type for the `-32022` UnsupportedProtocolVersion protocol error (protocol
* revision 2026-07-28): the request's protocol version is unknown to the server or
* unsupported by it.
*
* The error data lists the protocol versions the receiver supports (`supported`),
* so the sender can choose a mutually supported version and retry, and echoes the
* version that was requested (`requested`).
*/
var UnsupportedProtocolVersionError = class extends ProtocolError {
	static {
		Object.defineProperty(this, "mcpBrand", { value: "mcp.UnsupportedProtocolVersionError" });
	}
	constructor(data, message = `Unsupported protocol version: ${data.requested}`) {
		super(ProtocolErrorCode.UnsupportedProtocolVersion, message, data);
	}
	/**
	* Protocol versions the receiver supports.
	*/
	get supported() {
		return this.data.supported;
	}
	/**
	* The protocol version that was requested.
	*/
	get requested() {
		return this.data.requested;
	}
};
/**
* Error type for the `-32021` MissingRequiredClientCapability protocol error
* (protocol revision 2026-07-28): processing the request requires a capability
* the client did not declare in the request's `clientCapabilities`.
*
* The error data lists the missing capabilities (`requiredCapabilities`) in
* the `ClientCapabilities` shape, so the client can see exactly what it would
* have to declare for the request to be served. On HTTP, the response status
* is `400 Bad Request`.
*
* Recognize this error by its code and `data.requiredCapabilities`, or by
* `instanceof` — checks are brand-matched and work across separately bundled
* copies of the SDK.
*/
var MissingRequiredClientCapabilityError = class extends ProtocolError {
	static {
		Object.defineProperty(this, "mcpBrand", { value: "mcp.MissingRequiredClientCapabilityError" });
	}
	constructor(data, message = `Missing required client capabilities: ${Object.keys(data.requiredCapabilities).join(", ")}`) {
		super(ProtocolErrorCode.MissingRequiredClientCapability, message, data);
	}
	/**
	* The capabilities the server requires from the client to process the
	* request (only the missing capabilities are listed).
	*/
	get requiredCapabilities() {
		return this.data.requiredCapabilities;
	}
};
/** The default cache policy when neither the handler nor configuration provides one. */
var DEFAULT_CACHE_TTL_MS = 0;
var DEFAULT_CACHE_SCOPE = "private";
/**
* Request methods whose spec result vocabulary goes beyond `'complete'` on the
* 2026-07-28 revision: their results may be `input_required` (multi
* round-trip requests), so a handler-provided `resultType` passes through the
* stamp untouched. `subscriptions/listen` is NOT in this set: it never emits
* a JSON-RPC result — termination is stream close (HTTP) or
* `notifications/cancelled` (stdio) per the spec.
*/
var EXTENDED_RESULT_TYPE_METHODS = [
	"tools/call",
	"prompts/get",
	"resources/read"
];
/**
* Step 1 of the encode contract: ensure the outbound result carries the
* required `resultType` discriminator.
*
* - No handler-provided value → stamp `'complete'`.
* - Handler-provided `'complete'` → kept as-is.
* - Handler-provided non-`'complete'` value on a method whose vocabulary
*   allows it ({@linkcode EXTENDED_RESULT_TYPE_METHODS}) → passes through.
*   The value is forwarded verbatim — the wire vocabulary is an open union and
*   the SDK does not validate the string, so emitting a `resultType` the
*   negotiated revision does not define is the handler author's
*   responsibility.
* - Handler-provided non-`'complete'` value on any other method → internal
*   error (loud): the value would be mis-typed on the wire, and silently
*   rewriting it would hide a server bug.
*/
function stampResultType(method, result) {
	const provided = result["resultType"];
	if (provided === void 0) return {
		...result,
		resultType: "complete"
	};
	if (provided === "complete") return result;
	if (EXTENDED_RESULT_TYPE_METHODS.includes(method)) return result;
	throw new ProtocolError(ProtocolErrorCode.InternalError, `Handler for ${method} returned resultType '${String(provided)}', but results of ${method} only support 'complete' on protocol revision 2026-07-28`);
}
/**
* Step 2 of the encode contract: fill the required `ttlMs`/`cacheScope` fields
* on cacheable results.
*
* Applies only when the (post-stamp) `resultType` is `'complete'` and the
* method is one of the cacheable operations; everything else is returned
* untouched apart from removing the configured-hint carrier. Field resolution
* is per field, most specific author first: a valid handler-returned value,
* then the configured cache hint attached by the server layer, then the
* defaults. Handler-returned values are validated at encode time (`ttlMs`
* must be a non-negative integer, `cacheScope` must be `'public'` or
* `'private'`); invalid values are ignored rather than emitted.
*/
function fillCacheFields(method, result) {
	const fallback = cacheHintFallbackOf(result);
	if (result["resultType"] !== "complete" || !isCacheableResultMethod(method)) return fallback === void 0 ? result : stripCacheHintFallback(result);
	const provided = result;
	const ttlMs = isValidCacheTtlMs(provided["ttlMs"]) ? provided["ttlMs"] : resolveTtlMs(fallback);
	const cacheScope = isValidCacheScope(provided["cacheScope"]) ? provided["cacheScope"] : resolveCacheScope(fallback);
	const filled = {
		...provided,
		ttlMs,
		cacheScope
	};
	delete filled[RESULT_CACHE_HINT_FALLBACK];
	return filled;
}
function isPlainObject$5(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
/**
* Step 3 of the encode contract: stamp the server's identity into the
* result's `_meta` under `io.modelcontextprotocol/serverInfo` (spec PR #3002:
* servers SHOULD include it on every response).
*
* - No `serverInfo` supplied (a client instance, or a hand-constructed
*   protocol object) → identity function.
* - The result's `_meta` already carries the key → kept as-is (the handler
*   is the more specific author; mirrors the cache-fill resolution order).
* - A present-but-non-object `_meta` (a dynamic-caller bug) → kept as-is:
*   the stamp never rewrites handler material, and the malformed value fails
*   loudly at the peer instead of being silently replaced here.
* - Otherwise → the key is added, preserving any other `_meta` entries.
*
* Runs for every result regardless of `resultType`: the anchor types
* `Result._meta` as `ResultMetaObject` on all results, `input_required`
* included.
*/
function stampServerInfoMeta(result, serverInfo) {
	if (serverInfo === void 0) return result;
	const meta = result["_meta"];
	if (meta === void 0) return {
		...result,
		_meta: { [SERVER_INFO_META_KEY]: serverInfo }
	};
	if (!isPlainObject$5(meta)) return result;
	if (meta["io.modelcontextprotocol/serverInfo"] !== void 0) return result;
	return {
		...result,
		_meta: {
			...meta,
			[SERVER_INFO_META_KEY]: serverInfo
		}
	};
}
function resolveTtlMs(fallback) {
	return fallback !== void 0 && isValidCacheTtlMs(fallback.ttlMs) ? fallback.ttlMs : DEFAULT_CACHE_TTL_MS;
}
function resolveCacheScope(fallback) {
	return fallback !== void 0 && isValidCacheScope(fallback.cacheScope) ? fallback.cacheScope : DEFAULT_CACHE_SCOPE;
}
function stripCacheHintFallback(result) {
	const copy = { ...result };
	delete copy[RESULT_CACHE_HINT_FALLBACK];
	return copy;
}
/**
* In-band input-request vocabulary of the 2026-07-28 revision (SEP-2322
* multi round-trip requests), dispatch view.
*
* The three former server→client wire requests (`elicitation/create`,
* `sampling/createMessage`, `roots/list`) are NOT wire request methods on
* this revision — they are demoted to de-JSON-RPC'd payloads embedded in an
* `input_required` result. The multi-round-trip driver dispatches those
* embedded payloads to the client's registered handlers through the normal
* handler machinery, and these are the schemas that dispatch parses them
* with: lenient where the anchor's wire-true artifacts are strict (an
* embedded request never carries the per-request `_meta` envelope), exact
* where the vocabulary forks (the sampling shapes compose the forked
* SamplingMessage/Tool payloads).
*
* Registry membership is intentionally NOT granted here — these methods stay
* absent from the 2026-era request registry (a peer sending one as a wire
* request still gets −32601 by absence). Only the codec's
* `inputRequestSchema`/`inputResponseSchema` accessors expose them.
*/
/** The embedded input-request methods of the 2026-07-28 revision. */
var INPUT_REQUEST_METHODS_2026 = [
	"elicitation/create",
	"sampling/createMessage",
	"roots/list"
];
var maps;
function inputSchemaMaps() {
	if (maps) return maps;
	const s = buildSchemas2026();
	maps = {
		request: {
			"elicitation/create": object({
				method: literal("elicitation/create"),
				params: s.ElicitRequestParamsSchema
			}),
			"sampling/createMessage": object({
				method: literal("sampling/createMessage"),
				params: s.CreateMessageRequestParamsSchema
			}),
			"roots/list": object({
				method: literal("roots/list"),
				params: looseObject({}).optional()
			})
		},
		response: {
			"elicitation/create": s.ElicitResultSchema,
			"sampling/createMessage": s.CreateMessageResultSchema,
			"roots/list": s.ListRootsResultSchema
		}
	};
	return maps;
}
function isInputRequestMethod2026(method) {
	return INPUT_REQUEST_METHODS_2026.includes(method);
}
function getInputRequestSchema2026(method) {
	return isInputRequestMethod2026(method) ? inputSchemaMaps().request[method] : void 0;
}
function getInputResponseSchema2026(method) {
	return isInputRequestMethod2026(method) ? inputSchemaMaps().response[method] : void 0;
}
var requestMethodKeys = {
	"tools/call": null,
	"tools/list": null,
	"prompts/get": null,
	"prompts/list": null,
	"resources/list": null,
	"resources/templates/list": null,
	"resources/read": null,
	"completion/complete": null,
	"server/discover": null,
	"subscriptions/listen": null
};
var notificationMethodKeys = {
	"notifications/cancelled": null,
	"notifications/progress": null,
	"notifications/message": null,
	"notifications/resources/updated": null,
	"notifications/resources/list_changed": null,
	"notifications/tools/list_changed": null,
	"notifications/prompts/list_changed": null,
	"notifications/subscriptions/acknowledged": null
};
/** The 2026-era request-method set (registry membership = the deletion story). */
function hasRequestMethod2026(method) {
	return Object.prototype.hasOwnProperty.call(requestMethodKeys, method);
}
/** The 2026-era notification-method set. */
function hasNotificationMethod2026(method) {
	return Object.prototype.hasOwnProperty.call(notificationMethodKeys, method);
}
/** Result-map membership (same key set as the request map on this era). */
function hasResultMethod2026(method) {
	return Object.prototype.hasOwnProperty.call(requestMethodKeys, method);
}
function getRequestSchema2026(method) {
	return hasRequestMethod2026(method) ? buildSchemas2026().dispatchRequestSchemas[method] : void 0;
}
function getResultSchema2026(method) {
	return hasResultMethod2026(method) ? buildSchemas2026().dispatchResultSchemas[method] : void 0;
}
function getNotificationSchema2026(method) {
	return hasNotificationMethod2026(method) ? buildSchemas2026().notificationSchemas2026[method] : void 0;
}
Object.keys(requestMethodKeys);
Object.keys(notificationMethodKeys);
function isPlainObject$4(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
/** Tri-state wrap of an optional Zod schema lookup (the function-only contract). */
function triState(schema, raw) {
	if (schema === void 0) return {
		ok: false,
		reason: "not-in-era"
	};
	const parsed = schema.safeParse(raw);
	return parsed.success ? {
		ok: true,
		value: parsed.data
	} : {
		ok: false,
		reason: "invalid",
		message: String(parsed.error)
	};
}
var NOT_IN_ERA = {
	ok: false,
	reason: "not-in-era"
};
/**
* The reserved `_meta` keys an envelope must carry on this era (in reporting
* order). `clientInfo` is NOT here: spec PR #3002 demoted it to SHOULD, so a
* request without it is accepted (a present-but-malformed value still fails
* the envelope schema parse below).
*/
var REQUIRED_ENVELOPE_KEYS = [PROTOCOL_VERSION_META_KEY, CLIENT_CAPABILITIES_META_KEY];
/** Strip the known deleted-field set from an outbound result (Q1-SD3 iii). */
function enforceDeletedFields(method, result) {
	let next = result;
	let copied = false;
	const copy = () => {
		if (!copied) {
			next = { ...next };
			copied = true;
		}
		return next;
	};
	const tools = result.tools;
	if (method === "tools/list" && Array.isArray(tools) && tools.some((tool) => isPlainObject$4(tool) && "execution" in tool)) copy().tools = tools.map((tool) => {
		if (!isPlainObject$4(tool) || !("execution" in tool)) return tool;
		const rest = { ...tool };
		delete rest["execution"];
		return rest;
	});
	const capabilities = result.capabilities;
	if (isPlainObject$4(capabilities) && "tasks" in capabilities) {
		const rest = { ...capabilities };
		delete rest["tasks"];
		copy().capabilities = rest;
	}
	return next;
}
var rev2026Codec = {
	era: "2026-07-28",
	hasRequestMethod: hasRequestMethod2026,
	hasNotificationMethod: hasNotificationMethod2026,
	hasInputRequestMethod: (method) => getInputRequestSchema2026(method) !== void 0,
	validateRequest: (method, raw) => triState(getRequestSchema2026(method), raw),
	validateResult: (method, raw) => triState(getResultSchema2026(method), raw),
	validateNotification: (method, raw) => triState(getNotificationSchema2026(method), raw),
	validateInputRequest: (method, raw) => triState(getInputRequestSchema2026(method), raw),
	validateInputResponse: (method, raw) => triState(getInputResponseSchema2026(method), raw),
	samplingResultVariant: () => NOT_IN_ERA,
	outboundEnvelope(material) {
		return {
			[PROTOCOL_VERSION_META_KEY]: material.protocolVersion,
			[CLIENT_INFO_META_KEY]: material.clientInfo,
			[CLIENT_CAPABILITIES_META_KEY]: material.clientCapabilities,
			...material.logLevel !== void 0 && { ["io.modelcontextprotocol/logLevel"]: material.logLevel }
		};
	},
	validateEnvelopeMeta(meta) {
		const issues = [];
		for (const key of REQUIRED_ENVELOPE_KEYS) if (!(key in meta)) issues.push({
			key,
			problem: "missing"
		});
		const parsed = buildSchemas2026().RequestMetaEnvelopeSchema.safeParse(meta);
		if (!parsed.success) for (const issue of parsed.error.issues) {
			const path = issue.path.map(String);
			const key = path.length > 0 ? path.join(".") : "_meta";
			if (path.length === 1 && issues.some((existing) => existing.key === key && existing.problem === "missing")) continue;
			issues.push({
				key,
				problem: issue.message
			});
		}
		return issues;
	},
	projectCallToolResult: (result) => appendTextFallbackForNonObject(result),
	inputRequestSchema: getInputRequestSchema2026,
	decodeResult(method, raw) {
		if (!isPlainObject$4(raw)) return {
			kind: "invalid",
			error: new SdkError(SdkErrorCode.InvalidResult, `Invalid result for ${method}: not an object`, { method })
		};
		const rawResultType = raw["resultType"];
		if (rawResultType === void 0) return {
			kind: "invalid",
			error: new SdkError(SdkErrorCode.InvalidResult, `Invalid result for ${method}: missing required resultType — servers implementing protocol revision 2026-07-28 MUST include it (the absent-means-complete bridge applies only to earlier-revision servers)`, {
				method,
				violation: "missing-resultType"
			})
		};
		if (typeof rawResultType !== "string") return {
			kind: "invalid",
			error: new SdkError(SdkErrorCode.InvalidResult, `Invalid result for ${method}: non-string resultType`, {
				method,
				resultType: rawResultType
			})
		};
		if (rawResultType === "input_required") {
			const rawInputRequests = raw["inputRequests"];
			const inputRequests = isPlainObject$4(rawInputRequests) ? rawInputRequests : {};
			const requestState = raw["requestState"];
			const metaParse = raw["_meta"] === void 0 ? void 0 : buildSchemas2026().ResultMetaSchema.safeParse(raw["_meta"]);
			const meta = metaParse?.success ? metaParse.data : void 0;
			if (Object.keys(inputRequests).length === 0 && typeof requestState !== "string") return {
				kind: "invalid",
				error: new SdkError(SdkErrorCode.InvalidResult, `Invalid result for ${method}: input_required carries neither inputRequests nor requestState (every input_required result must include at least one of the two)`, {
					method,
					violation: "input-required-missing-both"
				})
			};
			return {
				kind: "input_required",
				inputRequests,
				...typeof requestState === "string" && { requestState },
				...meta !== void 0 && { _meta: meta }
			};
		}
		if (rawResultType !== "complete") return {
			kind: "invalid",
			error: new SdkError(SdkErrorCode.UnsupportedResultType, `Unsupported result type '${rawResultType}' for ${method}`, {
				resultType: rawResultType,
				method
			})
		};
		const wireResultSchemas = getWireResultSchemas();
		const wireSchema = Object.hasOwn(wireResultSchemas, method) ? wireResultSchemas[method] : void 0;
		if (wireSchema !== void 0) {
			const parsed = wireSchema.safeParse(raw);
			if (!parsed.success) return {
				kind: "invalid",
				error: new SdkError(SdkErrorCode.InvalidResult, `Invalid result for ${method}: ${parsed.error}`, { method })
			};
		}
		const lifted = { ...raw };
		delete lifted["resultType"];
		return {
			kind: "complete",
			result: lifted
		};
	},
	encodeResult(method, result, serverInfo) {
		return stampServerInfoMeta(fillCacheFields(method, stampResultType(method, enforceDeletedFields(method, result))), serverInfo);
	},
	encodeErrorCode: (code) => code === -32002 ? -32602 : code,
	checkInboundEnvelope(material) {
		if (material.envelope === void 0) return "Request is missing the required _meta envelope for protocol revision 2026-07-28 (io.modelcontextprotocol/protocolVersion, io.modelcontextprotocol/clientCapabilities)";
		const parsed = buildSchemas2026().RequestMetaEnvelopeSchema.safeParse(material.envelope);
		if (!parsed.success) return `Invalid _meta envelope for protocol revision 2026-07-28: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`;
	}
};
/** Wire-true result wrappers consulted by decode step 2, keyed by method —
* built once through the era's schema memo on the first decode. */
var wireResultSchemasMemo;
function getWireResultSchemas() {
	if (wireResultSchemasMemo) return wireResultSchemasMemo;
	const s = buildSchemas2026();
	wireResultSchemasMemo = {
		"tools/call": s.CallToolResultSchema,
		"tools/list": s.ListToolsResultSchema,
		"prompts/get": s.GetPromptResultSchema,
		"prompts/list": s.ListPromptsResultSchema,
		"resources/list": s.ListResourcesResultSchema,
		"resources/templates/list": s.ListResourceTemplatesResultSchema,
		"resources/read": s.ReadResourceResultSchema,
		"completion/complete": s.CompleteResultSchema,
		"server/discover": s.DiscoverResultSchema
	};
	return wireResultSchemasMemo;
}
/**
* The modern wire revision literal. Internal only — deliberately NOT a public
* constant (G-D2-4: no public modern-version constant ships before era-aware
* list semantics exist).
*/
var MODERN_WIRE_REVISION = "2026-07-28";
/**
* Era resolution, many-to-one (Q1-SD1): every modern-era revision
* (`>= 2026-07-28`) → the 2026-era codec; every legacy revision (the five
* `SUPPORTED_PROTOCOL_VERSIONS`) and `undefined`/unknown → the 2025-era
* codec (the DV-13 default posture — hand-constructed instances and
* unclassified traffic are legacy-era). This is the same era predicate the
* rest of the SDK uses ({@link isModernProtocolVersion}); a pinned modern
* revision other than the literal '2026-07-28' must still resolve modern.
*/
function codecForVersion(version) {
	return version !== void 0 && isModernProtocolVersion(version) ? rev2026Codec : rev2025Codec;
}
/**
* The wire era an edge classification names (Q2 — produced at the
* transport/entry edge; this layer only CONSUMES it). The dispatch funnel no
* longer resolves a codec FROM the classification: era is instance state, and
* a classified inbound message is VALIDATED against the instance era — a
* mismatch is an entry/routing error, never a per-message era switch. The
* exact `revision` wins over the coarse era flag when both are present.
*/
function classifiedWireEra(classification) {
	if (classification.revision !== void 0) return codecForVersion(classification.revision).era;
	return classification.era === "modern" ? rev2026Codec.era : rev2025Codec.era;
}
/**
* The derived spec-method universe: the union of every codec registry. A
* method in this set is era-gated at dispatch and send time; a method outside
* it is a consumer-owned extension method (era-blind, schema-explicit).
* Derived from the registries — never hand-curated (the LEGACY_ONLY_METHODS
* table class is exactly what registry membership replaces).
*/
function isSpecRequestMethod(method) {
	return ALL_CODECS.some((codec) => codec.hasRequestMethod(method));
}
function isSpecNotificationMethod(method) {
	return ALL_CODECS.some((codec) => codec.hasNotificationMethod(method));
}
/** The names SEP-2663 re-defines for the Tasks extension on the era that removed them from core. */
function isExtensionReusedRequestMethod(method) {
	return method === "tasks/get" || method === "tasks/cancel";
}
var ALL_CODECS = [rev2025Codec, rev2026Codec];
var schemas_exports = /* @__PURE__ */ __exportAll({
	AnnotationsSchema: () => AnnotationsSchema,
	AudioContentSchema: () => AudioContentSchema,
	BaseMetadataSchema: () => BaseMetadataSchema,
	BaseRequestParamsSchema: () => BaseRequestParamsSchema,
	BlobResourceContentsSchema: () => BlobResourceContentsSchema,
	BooleanSchemaSchema: () => BooleanSchemaSchema,
	CallToolRequestParamsSchema: () => CallToolRequestParamsSchema,
	CallToolRequestSchema: () => CallToolRequestSchema,
	CallToolResultSchema: () => CallToolResultSchema,
	CancelTaskRequestSchema: () => CancelTaskRequestSchema,
	CancelTaskResultSchema: () => CancelTaskResultSchema,
	CancelledNotificationParamsSchema: () => CancelledNotificationParamsSchema,
	CancelledNotificationSchema: () => CancelledNotificationSchema,
	ClientCapabilitiesSchema: () => ClientCapabilitiesSchema,
	ClientNotificationSchema: () => ClientNotificationSchema,
	ClientRequestSchema: () => ClientRequestSchema,
	ClientResultSchema: () => ClientResultSchema,
	ClientTasksCapabilitySchema: () => ClientTasksCapabilitySchema,
	CompatibilityCallToolResultSchema: () => CompatibilityCallToolResultSchema,
	CompleteRequestParamsSchema: () => CompleteRequestParamsSchema,
	CompleteRequestSchema: () => CompleteRequestSchema,
	CompleteResultSchema: () => CompleteResultSchema,
	ContentBlockSchema: () => ContentBlockSchema,
	CreateMessageRequestParamsSchema: () => CreateMessageRequestParamsSchema,
	CreateMessageRequestSchema: () => CreateMessageRequestSchema,
	CreateMessageResultSchema: () => CreateMessageResultSchema,
	CreateMessageResultWithToolsSchema: () => CreateMessageResultWithToolsSchema,
	CreateTaskResultSchema: () => CreateTaskResultSchema,
	CursorSchema: () => CursorSchema,
	DiscoverRequestSchema: () => DiscoverRequestSchema,
	DiscoverResultSchema: () => DiscoverResultSchema,
	ElicitRequestFormParamsSchema: () => ElicitRequestFormParamsSchema,
	ElicitRequestParamsSchema: () => ElicitRequestParamsSchema,
	ElicitRequestSchema: () => ElicitRequestSchema,
	ElicitRequestURLParamsSchema: () => ElicitRequestURLParamsSchema,
	ElicitResultSchema: () => ElicitResultSchema,
	ElicitationCompleteNotificationParamsSchema: () => ElicitationCompleteNotificationParamsSchema,
	ElicitationCompleteNotificationSchema: () => ElicitationCompleteNotificationSchema,
	EmbeddedResourceSchema: () => EmbeddedResourceSchema,
	EmptyResultSchema: () => EmptyResultSchema,
	EnumSchemaSchema: () => EnumSchemaSchema,
	GetPromptRequestParamsSchema: () => GetPromptRequestParamsSchema,
	GetPromptRequestSchema: () => GetPromptRequestSchema,
	GetPromptResultSchema: () => GetPromptResultSchema,
	GetTaskPayloadRequestSchema: () => GetTaskPayloadRequestSchema,
	GetTaskPayloadResultSchema: () => GetTaskPayloadResultSchema,
	GetTaskRequestSchema: () => GetTaskRequestSchema,
	GetTaskResultSchema: () => GetTaskResultSchema,
	IconSchema: () => IconSchema,
	IconsSchema: () => IconsSchema,
	ImageContentSchema: () => ImageContentSchema,
	ImplementationSchema: () => ImplementationSchema,
	InitializeRequestParamsSchema: () => InitializeRequestParamsSchema,
	InitializeRequestSchema: () => InitializeRequestSchema,
	InitializeResultSchema: () => InitializeResultSchema,
	InitializedNotificationSchema: () => InitializedNotificationSchema,
	JSONArraySchema: () => JSONArraySchema,
	JSONObjectSchema: () => JSONObjectSchema,
	JSONRPCErrorResponseSchema: () => JSONRPCErrorResponseSchema,
	JSONRPCMessageSchema: () => JSONRPCMessageSchema,
	JSONRPCNotificationSchema: () => JSONRPCNotificationSchema,
	JSONRPCRequestSchema: () => JSONRPCRequestSchema,
	JSONRPCResponseSchema: () => JSONRPCResponseSchema,
	JSONRPCResultResponseSchema: () => JSONRPCResultResponseSchema,
	JSONValueSchema: () => JSONValueSchema,
	LegacyTitledEnumSchemaSchema: () => LegacyTitledEnumSchemaSchema,
	ListChangedOptionsBaseSchema: () => ListChangedOptionsBaseSchema,
	ListPromptsRequestSchema: () => ListPromptsRequestSchema,
	ListPromptsResultSchema: () => ListPromptsResultSchema,
	ListResourceTemplatesRequestSchema: () => ListResourceTemplatesRequestSchema,
	ListResourceTemplatesResultSchema: () => ListResourceTemplatesResultSchema,
	ListResourcesRequestSchema: () => ListResourcesRequestSchema,
	ListResourcesResultSchema: () => ListResourcesResultSchema,
	ListRootsRequestSchema: () => ListRootsRequestSchema,
	ListRootsResultSchema: () => ListRootsResultSchema,
	ListTasksRequestSchema: () => ListTasksRequestSchema,
	ListTasksResultSchema: () => ListTasksResultSchema,
	ListToolsRequestSchema: () => ListToolsRequestSchema,
	ListToolsResultSchema: () => ListToolsResultSchema,
	LoggingLevelSchema: () => LoggingLevelSchema,
	LoggingMessageNotificationParamsSchema: () => LoggingMessageNotificationParamsSchema,
	LoggingMessageNotificationSchema: () => LoggingMessageNotificationSchema,
	ModelHintSchema: () => ModelHintSchema,
	ModelPreferencesSchema: () => ModelPreferencesSchema,
	MultiSelectEnumSchemaSchema: () => MultiSelectEnumSchemaSchema,
	NotificationSchema: () => NotificationSchema,
	NotificationsParamsSchema: () => NotificationsParamsSchema,
	NumberSchemaSchema: () => NumberSchemaSchema,
	PaginatedRequestParamsSchema: () => PaginatedRequestParamsSchema,
	PaginatedRequestSchema: () => PaginatedRequestSchema,
	PaginatedResultSchema: () => PaginatedResultSchema,
	PingRequestSchema: () => PingRequestSchema,
	PrimitiveSchemaDefinitionSchema: () => PrimitiveSchemaDefinitionSchema,
	ProgressNotificationParamsSchema: () => ProgressNotificationParamsSchema,
	ProgressNotificationSchema: () => ProgressNotificationSchema,
	ProgressSchema: () => ProgressSchema,
	ProgressTokenSchema: () => ProgressTokenSchema,
	PromptArgumentSchema: () => PromptArgumentSchema,
	PromptListChangedNotificationSchema: () => PromptListChangedNotificationSchema,
	PromptMessageSchema: () => PromptMessageSchema,
	PromptReferenceSchema: () => PromptReferenceSchema,
	PromptSchema: () => PromptSchema,
	ReadResourceRequestParamsSchema: () => ReadResourceRequestParamsSchema,
	ReadResourceRequestSchema: () => ReadResourceRequestSchema,
	ReadResourceResultSchema: () => ReadResourceResultSchema,
	RelatedTaskMetadataSchema: () => RelatedTaskMetadataSchema,
	RequestIdSchema: () => RequestIdSchema,
	RequestMetaSchema: () => RequestMetaSchema,
	RequestSchema: () => RequestSchema,
	ResourceContentsSchema: () => ResourceContentsSchema,
	ResourceLinkSchema: () => ResourceLinkSchema,
	ResourceListChangedNotificationSchema: () => ResourceListChangedNotificationSchema,
	ResourceRequestParamsSchema: () => ResourceRequestParamsSchema,
	ResourceSchema: () => ResourceSchema,
	ResourceTemplateReferenceSchema: () => ResourceTemplateReferenceSchema,
	ResourceTemplateSchema: () => ResourceTemplateSchema,
	ResourceUpdatedNotificationParamsSchema: () => ResourceUpdatedNotificationParamsSchema,
	ResourceUpdatedNotificationSchema: () => ResourceUpdatedNotificationSchema,
	ResultMetaObjectSchema: () => ResultMetaObjectSchema,
	ResultSchema: () => ResultSchema,
	RoleSchema: () => RoleSchema,
	RootSchema: () => RootSchema,
	RootsListChangedNotificationSchema: () => RootsListChangedNotificationSchema,
	SamplingContentSchema: () => SamplingContentSchema,
	SamplingMessageContentBlockSchema: () => SamplingMessageContentBlockSchema,
	SamplingMessageSchema: () => SamplingMessageSchema,
	ServerCapabilitiesSchema: () => ServerCapabilitiesSchema,
	ServerNotificationSchema: () => ServerNotificationSchema,
	ServerRequestSchema: () => ServerRequestSchema,
	ServerResultSchema: () => ServerResultSchema,
	ServerTasksCapabilitySchema: () => ServerTasksCapabilitySchema,
	SetLevelRequestParamsSchema: () => SetLevelRequestParamsSchema,
	SetLevelRequestSchema: () => SetLevelRequestSchema,
	SingleSelectEnumSchemaSchema: () => SingleSelectEnumSchemaSchema,
	StringSchemaSchema: () => StringSchemaSchema,
	SubscribeRequestParamsSchema: () => SubscribeRequestParamsSchema,
	SubscribeRequestSchema: () => SubscribeRequestSchema,
	SubscriptionFilterSchema: () => SubscriptionFilterSchema,
	SubscriptionsAcknowledgedNotificationParamsSchema: () => SubscriptionsAcknowledgedNotificationParamsSchema,
	SubscriptionsAcknowledgedNotificationSchema: () => SubscriptionsAcknowledgedNotificationSchema,
	SubscriptionsListenRequestParamsSchema: () => SubscriptionsListenRequestParamsSchema,
	SubscriptionsListenRequestSchema: () => SubscriptionsListenRequestSchema,
	SubscriptionsListenResultMetaSchema: () => SubscriptionsListenResultMetaSchema,
	SubscriptionsListenResultSchema: () => SubscriptionsListenResultSchema,
	TaskAugmentedRequestParamsSchema: () => TaskAugmentedRequestParamsSchema,
	TaskCreationParamsSchema: () => TaskCreationParamsSchema,
	TaskMetadataSchema: () => TaskMetadataSchema,
	TaskSchema: () => TaskSchema,
	TaskStatusNotificationParamsSchema: () => TaskStatusNotificationParamsSchema,
	TaskStatusNotificationSchema: () => TaskStatusNotificationSchema,
	TaskStatusSchema: () => TaskStatusSchema,
	TextContentSchema: () => TextContentSchema,
	TextResourceContentsSchema: () => TextResourceContentsSchema,
	TitledMultiSelectEnumSchemaSchema: () => TitledMultiSelectEnumSchemaSchema,
	TitledSingleSelectEnumSchemaSchema: () => TitledSingleSelectEnumSchemaSchema,
	ToolAnnotationsSchema: () => ToolAnnotationsSchema,
	ToolChoiceSchema: () => ToolChoiceSchema,
	ToolExecutionSchema: () => ToolExecutionSchema,
	ToolListChangedNotificationSchema: () => ToolListChangedNotificationSchema,
	ToolResultContentSchema: () => ToolResultContentSchema,
	ToolSchema: () => ToolSchema,
	ToolUseContentSchema: () => ToolUseContentSchema,
	UnsubscribeRequestParamsSchema: () => UnsubscribeRequestParamsSchema,
	UnsubscribeRequestSchema: () => UnsubscribeRequestSchema,
	UntitledMultiSelectEnumSchemaSchema: () => UntitledMultiSelectEnumSchemaSchema,
	UntitledSingleSelectEnumSchemaSchema: () => UntitledSingleSelectEnumSchemaSchema
});
var isJSONRPCRequest = (value) => JSONRPCRequestSchema.safeParse(value).success;
var isJSONRPCNotification = (value) => JSONRPCNotificationSchema.safeParse(value).success;
/**
* Checks if a value is a valid {@linkcode JSONRPCResultResponse}.
* @param value - The value to check.
*
* @returns True if the value is a valid {@linkcode JSONRPCResultResponse}, false otherwise.
*/
var isJSONRPCResultResponse = (value) => JSONRPCResultResponseSchema.safeParse(value).success;
/**
* Checks if a value is a valid {@linkcode JSONRPCErrorResponse}.
* @param value - The value to check.
*
* @returns True if the value is a valid {@linkcode JSONRPCErrorResponse}, false otherwise.
*/
var isJSONRPCErrorResponse = (value) => JSONRPCErrorResponseSchema.safeParse(value).success;
/**
* Checks whether a value is an input-required result (protocol revision
* 2026-07-28): the multi-round-trip return shape discriminated by
* `resultType: 'input_required'`.
*
* This is a discriminator check, not a full validator — the at-least-one rule
* (`inputRequests` or `requestState`) is enforced by the `inputRequired()`
* builder and re-checked by the server seam for hand-built values.
*
* @param value - The value to check.
* @returns True if the value carries the `input_required` discriminator.
*/
var isInputRequiredResult = (value) => typeof value === "object" && value !== null && !Array.isArray(value) && value.resultType === "input_required";
function assertCompleteRequestPrompt(request) {
	if (request.params.ref.type !== "ref/prompt") throw new TypeError(`Expected CompleteRequestPrompt, but got ${request.params.ref.type}`);
}
function assertCompleteRequestResourceTemplate(request) {
	if (request.params.ref.type !== "ref/resource") throw new TypeError(`Expected CompleteRequestResourceTemplate, but got ${request.params.ref.type}`);
}
/** The schema-extension property name a tool's `inputSchema` carries. */
var X_MCP_HEADER_KEY = "x-mcp-header";
/**
* RFC 9110 §5.1 `token` syntax (`1*tchar`). Rejects empty, space, control
* characters (including CR/LF), and the listed delimiters.
*/
var RFC9110_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
/**
* JSON Schema `type` values the spec admits on an `x-mcp-header` property:
* `integer`, `string` and `boolean`. `number` is explicitly not permitted
* (2026-07-28 Streamable HTTP, "Schema Extension"), so a tool that annotates a
* `number`-typed property is invalid (the server still checks its headers).
* Everything else (`object`, `array`, `null`, absent) is rejected too.
*/
var PERMITTED_X_MCP_HEADER_TYPES = /* @__PURE__ */ new Set([
	"string",
	"integer",
	"boolean"
]);
/**
* Scan a tool's JSON-serialized `inputSchema` for `x-mcp-header` declarations
* and validate every constraint the spec places on them. Returns either the
* collected declarations (possibly empty) or the first violated constraint
* (with the declarations too, when `number`-typed declarations are the only fault).
*
* The walk descends through `properties` at any depth (the spec's "any nesting
* depth" clause). The static-reachability MUST is enforced as a structural
* sweep: every position the chain MUST NOT pass through (`items`/
* `additionalProperties`, `oneOf`/`anyOf`/`allOf`/`not`, `if`/`then`/`else`,
* `$defs`, `$ref` targets within `$defs`) is visited too, and an
* `x-mcp-header` found anywhere on that path invalidates the schema — "an
* annotation anywhere else makes the tool definition invalid".
*/
function scanXMcpHeaderDeclarations(inputSchema) {
	const declarations = [];
	const seenLower = /* @__PURE__ */ new Map();
	let numberFault;
	const visit = (node, path, reachable) => {
		if (node === null || typeof node !== "object") return void 0;
		const schema = node;
		if (X_MCP_HEADER_KEY in schema) {
			if (!reachable || path.length === 0) return `${pathName(path)}: x-mcp-header is only permitted on properties statically reachable via a chain of 'properties' keys (not under items, additionalProperties, oneOf/anyOf/allOf/not, if/then/else, or $ref)`;
			const raw = schema[X_MCP_HEADER_KEY];
			if (typeof raw !== "string" || raw.length === 0) return `${pathName(path)}: x-mcp-header MUST be a non-empty string`;
			if (!RFC9110_TOKEN.test(raw)) return `${pathName(path)}: x-mcp-header '${raw}' is not a valid RFC 9110 token (no spaces, control characters or HTTP delimiters)`;
			const type = typeof schema.type === "string" ? schema.type : void 0;
			if (type === void 0 || !PERMITTED_X_MCP_HEADER_TYPES.has(type)) {
				const fault$1 = `${pathName(path)}: x-mcp-header is only permitted on primitive-typed properties (string, integer, boolean); got ${type ?? "<none>"}`;
				if (type !== "number") return fault$1;
				numberFault ??= fault$1;
			}
			const lower = raw.toLowerCase();
			const prior = seenLower.get(lower);
			if (prior !== void 0) return `x-mcp-header '${raw}' is not case-insensitively unique (also declared as '${prior}')`;
			seenLower.set(lower, raw);
			declarations.push({
				path,
				headerName: raw,
				type
			});
		}
		const properties = schema.properties;
		if (properties !== null && typeof properties === "object") for (const [key, child] of Object.entries(properties)) {
			const fault$1 = visit(child, [...path, key], reachable);
			if (fault$1 !== void 0) return fault$1;
		}
		for (const k of NON_REACHABLE_SUBSCHEMA_KEYWORDS) {
			const sub = schema[k];
			if (sub === void 0) continue;
			const branches = Array.isArray(sub) ? sub : sub !== null && typeof sub === "object" && OBJECT_VALUED_SUBSCHEMA_KEYWORDS.has(k) ? Object.values(sub) : [sub];
			for (const branch of branches) {
				const fault$1 = visit(branch, [...path, `<${k}>`], false);
				if (fault$1 !== void 0) return fault$1;
			}
		}
	};
	const fault = visit(inputSchema, [], true);
	if (fault !== void 0) return {
		valid: false,
		reason: numberFault ?? fault
	};
	return numberFault === void 0 ? {
		valid: true,
		declarations
	} : {
		valid: false,
		reason: numberFault,
		declarations
	};
}
/**
* JSON Schema keywords whose subschemas the SEP-2243 static-reachability
* constraint excludes from the `properties`-only chain. An `x-mcp-header`
* found under any of these invalidates the tool definition.
*/
var NON_REACHABLE_SUBSCHEMA_KEYWORDS = [
	"items",
	"prefixItems",
	"contains",
	"additionalProperties",
	"unevaluatedProperties",
	"unevaluatedItems",
	"propertyNames",
	"patternProperties",
	"dependentSchemas",
	"oneOf",
	"anyOf",
	"allOf",
	"not",
	"if",
	"then",
	"else",
	"$defs",
	"definitions"
];
/**
* Subschema-carrying keywords whose value is a `name → subschema` object
* (not a single subschema or array of subschemas). The visit branches over
* `Object.values()` for these.
*/
var OBJECT_VALUED_SUBSCHEMA_KEYWORDS = /* @__PURE__ */ new Set([
	"patternProperties",
	"dependentSchemas",
	"$defs",
	"definitions"
]);
function pathName(path) {
	return path.length === 0 ? "<root>" : path.join(".");
}
/**
* Inbound HTTP request classification and the inbound validation ladder
* (protocol revision 2026-07-28).
*
* `classifyInboundRequest` is the body-primary era predicate for an HTTP
* entry that serves both protocol eras on one endpoint. It is evaluated
* exactly once, at the entry boundary, on the already-parsed request body:
*
* - `initialize` is a legacy-era request by definition (the modern era has no
*   `initialize` handshake) — unless it carries a valid envelope claim naming
*   a modern revision, in which case the claim wins and the request is
*   classified like any other enveloped request (the modern era then answers
*   it with method-not-found, exactly like every other method it does not
*   define).
* - A request whose `params._meta` carries the reserved protocol-version key
*   claims the per-request envelope mechanism and classifies into the era the
*   named revision belongs to (a malformed envelope behind a present claim is
*   a validation error, never a silent fall back to legacy handling).
* - A request without a claim is legacy-era traffic.
* - The `MCP-Protocol-Version` header is a cross-check only *for
*   classification*: it never upgrades or downgrades a body-derived
*   classification, and a disagreement between header and body is an explicit
*   ladder outcome. Its absence likewise never changes the era — but the spec
*   requires the header on every modern *request* POST, so a
*   modern-classified request that omits it is refused one rung later, by
*   {@linkcode validateStandardRequestHeaders}, not here. Notification POSTs
*   are exempt (see the next bullet), and that rung enforces presence on
*   requests only.
* - Notifications carry no envelope claim of their own under the current
*   spec, so for notification POSTs without a body claim the modern header is
*   determinative; the `Mcp-Method` header is validated against the body when
*   the message classifies modern and is never enforced on legacy traffic.
*   A notification that does carry a claim is treated body-primary like a
*   request, and a malformed claim is rejected the same way a request's
*   malformed claim is — never silently resolved against the header.
*   The notification-POST header cross-checks here are an SDK-defensive
*   posture, not a spec requirement: the spec leaves header rules for posted
*   notifications undefined (core client notifications do not occur over
*   Streamable HTTP); applying the request rules symmetrically is what an
*   ecosystem custom-notification POST expects, and the −32020 cells stay
*   passing for them.
* - `GET`/`DELETE` (and any other non-`POST` method) are body-less 2025-era
*   session operations: the modern era is `POST`-only, so they are routed to
*   legacy serving when it is configured and rejected otherwise.
* - Array (batch) bodies are classified element-wise: an array containing a
*   modern-claiming or invalid element is rejected, an all-legacy array is
*   legacy traffic unchanged, and a single-element array is still an array.
*
* The classifier returns plain values (it never throws and never touches a
* transport): a routing outcome (`legacy`/`modern`) or a ladder rejection
* carrying the JSON-RPC error to emit and the HTTP status to emit it with.
* Legacy routing outcomes deliberately carry NO `MessageClassification` —
* legacy and hand-wired traffic is never classified, which keeps its
* dispatch behavior byte-identical to today's.
*
* Error codes for the modern-path rejection cells follow the published
* conformance suite (and the spec text it asserts):
*
* - A header/body cross-check mismatch (the `MCP-Protocol-Version` header
*   disagreeing with the body, or the `Mcp-Method` header disagreeing with the
*   body method) is rejected with `-32020` (`HeaderMismatch`) on HTTP 400.
* - A request whose protocol-version header names a modern revision but whose
*   body carries no `_meta` envelope claim — including an envelope present but
*   missing the required protocol-version key — is rejected with `-32602`
*   (invalid params) naming the missing key(s), on HTTP 400.
*
* Should a future spec revision or conformance release change these
* assignments, the affected cells are re-derived against that release; the
* `settled` flag on {@linkcode InboundLadderRejection} stays available to mark
* a cell provisional again while such a change is in flight.
*/
/**
* The error code emitted for header/body cross-check mismatches: the
* `MCP-Protocol-Version` header disagreeing with the body's envelope claim (or
* with the body's classification), and the `Mcp-Method` header disagreeing
* with the body method.
*
* `-32020` is the draft schema's `HEADER_MISMATCH` constant (the SEP-2243
* `HeaderMismatch` code; the spec requires HTTP 400 for it), as also asserted
* by the published conformance suite for header-validation failures. It has no
* {@linkcode ProtocolErrorCode} member because it is not part of the 2025-era
* wire vocabulary; the validation ladder is its only emitter.
*/
var HEADER_MISMATCH_ERROR_CODE = -32020;
ProtocolErrorCode.InvalidRequest, ProtocolErrorCode.UnsupportedProtocolVersion, ProtocolErrorCode.InvalidParams, ProtocolErrorCode.MethodNotFound, ProtocolErrorCode.InvalidParams, ProtocolErrorCode.MissingRequiredClientCapability;
/**
* HTTP status for ladder-originated JSON-RPC error codes.
*
* Keyed on origin, not on the bare code: this table only applies to errors
* the ladder (or a pre-handler protocol gate) produced. Errors produced by
* request handlers — whatever their code — stay in-band on HTTP 200, and are
* never mapped to an HTTP status by this table; in particular `-32603` and
* domain-specific codes never become a blanket 500. The single exception is
* `MissingRequiredClientCapability` (-32021) — see
* {@linkcode httpStatusForErrorCode}.
*
* `-32602` (invalid params) deliberately has NO entry: the only invalid-params
* rejection that maps to HTTP 400 is the classifier's own envelope rung
* short-circuit, which carries its HTTP status directly. A dispatch- or
* handler-produced invalid-params error is always in-band.
*/
var LADDER_ERROR_HTTP_STATUS = {
	[ProtocolErrorCode.ParseError]: 400,
	[ProtocolErrorCode.InvalidRequest]: 400,
	[ProtocolErrorCode.MethodNotFound]: 404,
	[ProtocolErrorCode.UnsupportedProtocolVersion]: 400,
	[ProtocolErrorCode.MissingRequiredClientCapability]: 400,
	[HEADER_MISMATCH_ERROR_CODE]: 400
};
/**
* Internal Zod schema utilities for protocol handling.
* These are used internally by the SDK for protocol message validation.
*/
/**
* Parses data against a Zod schema (synchronous).
* Returns a discriminated union with success/error.
*/
function parseSchema(schema, data) {
	return safeParse(schema, data);
}
/**
* Union of the declared shape keys across several Zod object schemas.
*/
function shapeKeys(schemas) {
	return new Set(schemas.flatMap((schema) => Object.keys(schema.shape)));
}
/**
* Standard Schema utilities for user-provided schemas.
* Supports Zod v4, Valibot, ArkType, and other Standard Schema implementations.
* @see https://standardschema.dev
*/
function isStandardSchema(schema) {
	if (schema == null) return false;
	const schemaType = typeof schema;
	if (schemaType !== "object" && schemaType !== "function") return false;
	if (!("~standard" in schema)) return false;
	return typeof schema["~standard"]?.validate === "function";
}
var warnedZodFallback = false;
/** JSON Schema draft targeted by every conversion; shared so pattern references above stay in lockstep. */
var JSON_SCHEMA_CONVERSION_TARGET = "draft-2020-12";
/**
* Converts a StandardSchema to JSON Schema for use as an MCP tool/prompt schema.
*
* MCP requires `type: "object"` at the root of tool `inputSchema` and prompt
* argument schemas; `outputSchema` may have any JSON Schema root (SEP-2106).
* Zod's discriminated unions emit `{oneOf: [...]}` without a top-level `type`,
* so for `io: 'input'` this function defaults `type` to `"object"` when absent
* and throws on an explicit non-object `type` (e.g. `z.string()`). For
* `io: 'output'` a non-object root is returned as-is; the `"object"` default is
* applied only when the root is provably object-shaped.
*/
function standardSchemaToJsonSchema(schema, io = "input") {
	const std = schema["~standard"];
	let result;
	if (std.jsonSchema) result = std.jsonSchema[io]({ target: JSON_SCHEMA_CONVERSION_TARGET });
	else if (std.vendor === "zod") {
		if (!("_zod" in schema)) throw new Error("Schema appears to be from zod 3, which the SDK cannot convert to JSON Schema. Upgrade to zod >=4.2.0, or wrap your JSON Schema with fromJsonSchema().");
		if (!warnedZodFallback) {
			warnedZodFallback = true;
			console.warn("[mcp-sdk] Your zod version does not implement `~standard.jsonSchema` (added in zod 4.2.0). Falling back to z.toJSONSchema(). Upgrade to zod >=4.2.0 to silence this warning.");
		}
		result = toJSONSchema(schema, {
			target: JSON_SCHEMA_CONVERSION_TARGET,
			io
		});
	} else throw new Error(`Schema library "${std.vendor}" does not implement StandardJSONSchemaV1 (\`~standard.jsonSchema\`). Upgrade to a version that does, or wrap your JSON Schema with fromJsonSchema().`);
	if (io === "output") {
		if (result.type !== void 0) return result;
		return isProvablyObjectShapedRoot(result) ? {
			type: "object",
			...result
		} : result;
	}
	if (result.type !== void 0 && result.type !== "object") throw new Error(`MCP tool and prompt schemas must describe objects (got type: ${JSON.stringify(result.type)}). Wrap your schema in z.object({...}) or equivalent.`);
	return {
		type: "object",
		...result
	};
}
var LOCAL_DEFINITION_REF = /^#\/(\$defs|definitions)\/([^/~%]+)$/;
/**
* A typeless JSON Schema root is "provably object-shaped" when either it carries object keywords
* directly (`properties`/`patternProperties`/`additionalProperties`/`required`), or it is a
* composition (`oneOf`/`anyOf`/`allOf`) whose every member is itself `type:'object'` or recursively
* provably object-shaped (e.g. a nested `discriminatedUnion`). A `$ref` is followed one hop, to an
* entry of the root's `$defs`/`definitions` that is itself `type:'object'`. Used to
* decide whether stamping `type:'object'` is safe (redundant-but-valid) versus self-contradictory.
*/
function isProvablyObjectShapedRoot(schema, root = schema) {
	if ("properties" in schema || "patternProperties" in schema || "additionalProperties" in schema || "required" in schema) return true;
	const ref = typeof schema.$ref === "string" && LOCAL_DEFINITION_REF.exec(schema.$ref);
	if (ref && root[ref[1]]?.[ref[2]]?.type === "object") return true;
	for (const key of [
		"oneOf",
		"anyOf",
		"allOf"
	]) {
		const members = schema[key];
		if (Array.isArray(members) && members.length > 0) return members.every((m) => m !== null && typeof m === "object" && (m.type === "object" || isProvablyObjectShapedRoot(m, "$id" in m ? {} : root)));
	}
	return false;
}
function formatIssue(issue) {
	if (!issue.path?.length) return issue.message;
	return `${issue.path.map((p) => String(typeof p === "object" ? p.key : p)).join(".")}: ${issue.message}`;
}
async function validateStandardSchema(schema, data) {
	const result = await schema["~standard"].validate(data);
	if (result.issues && result.issues.length > 0) return {
		success: false,
		error: result.issues.map((i) => formatIssue(i)).join(", ")
	};
	return {
		success: true,
		data: result.value
	};
}
function zodEmittedPattern(schema) {
	const jsonSchema = toJSONSchema(schema, {
		target: JSON_SCHEMA_CONVERSION_TARGET,
		io: "input"
	});
	return typeof jsonSchema.pattern === "string" ? jsonSchema.pattern : void 0;
}
var DATETIME_FRACTION_DIGITS = /\\\.\\d\{(\d+)\}/;
function datetimeReferenceSchemas(pattern) {
	const fractionDigits = DATETIME_FRACTION_DIGITS.exec(pattern);
	const precisions = [
		void 0,
		-1,
		0
	];
	if (fractionDigits) precisions.push(Number(fractionDigits[1]));
	return [false, true].flatMap((local) => [false, true].flatMap((offset) => precisions.map((precision) => datetime({
		local,
		offset,
		precision
	}))));
}
function referencePatternsForFormat(format, pattern) {
	let referenceSchemas;
	switch (format) {
		case "email":
			referenceSchemas = [email()];
			break;
		case "uri":
			referenceSchemas = [url()];
			break;
		case "date":
			referenceSchemas = [date()];
			break;
		case "date-time": referenceSchemas = datetimeReferenceSchemas(pattern);
	}
	return new Set(referenceSchemas.map((schema) => zodEmittedPattern(schema)).filter((emitted) => emitted !== void 0));
}
/** Whether `pattern` is the library's own realization of `format` (droppable) rather than a user customization. */
function isLibraryFormatPattern(format, pattern, vendor) {
	if (vendor !== "zod") return true;
	return referencePatternsForFormat(format, pattern).has(pattern);
}
function promptArgumentsFromStandardSchema(schema) {
	const jsonSchema = standardSchemaToJsonSchema(schema, "input");
	const properties = jsonSchema.properties || {};
	const required = jsonSchema.required || [];
	return Object.entries(properties).map(([name, prop]) => ({
		name,
		description: prop?.description,
		required: required.includes(name)
	}));
}
function isJsonObject(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function convertStandardElicitationSchema(schema) {
	try {
		return standardSchemaToJsonSchema(schema, "input");
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Elicitation requestedSchema must describe an object with flat primitive properties: ${detail}`);
	}
}
var ANNOTATION_ONLY_JSON_SCHEMA_KEYWORDS = /* @__PURE__ */ new Set([
	"$comment",
	"deprecated",
	"description",
	"examples",
	"readOnly",
	"title",
	"writeOnly"
]);
function isAnnotationOnlyJsonSchemaKeyword(key) {
	return ANNOTATION_ONLY_JSON_SCHEMA_KEYWORDS.has(key) || key.startsWith("x-");
}
var ROOT_KEYS = /* @__PURE__ */ new Set(["$schema", ...Object.keys(ElicitRequestFormParamsSchema.shape.requestedSchema.shape)]);
var PROPERTY_KEYS_BY_TYPE = {
	string: shapeKeys([
		StringSchemaSchema,
		UntitledSingleSelectEnumSchemaSchema,
		TitledSingleSelectEnumSchemaSchema,
		LegacyTitledEnumSchemaSchema
	]),
	number: shapeKeys([NumberSchemaSchema]),
	integer: shapeKeys([NumberSchemaSchema]),
	boolean: shapeKeys([BooleanSchemaSchema]),
	array: shapeKeys([UntitledMultiSelectEnumSchemaSchema, TitledMultiSelectEnumSchemaSchema])
};
var SUPPORTED_STRING_FORMATS = new Set(StringSchemaSchema.shape.format.unwrap().options);
/** Walks one property node: keeps grammar keys, drops the library format pattern, rejects unknown constraints. */
function walkProperty(node, path, vendor, unsupported) {
	if (!isJsonObject(node)) return node;
	const allowedKeys = typeof node.type === "string" && Object.hasOwn(PROPERTY_KEYS_BY_TYPE, node.type) ? PROPERTY_KEYS_BY_TYPE[node.type] : void 0;
	if (allowedKeys === void 0) return node;
	const pruned = {};
	for (const [key, value] of Object.entries(node)) if (allowedKeys.has(key) || isAnnotationOnlyJsonSchemaKeyword(key)) pruned[key] = value;
	else if (key === "pattern" && node.type === "string" && typeof node.format === "string") {
		if (!SUPPORTED_STRING_FORMATS.has(node.format)) pruned[key] = value;
		else if (typeof value !== "string" || !isLibraryFormatPattern(node.format, value, vendor)) unsupported.push(`${path}.${key}`);
	} else unsupported.push(`${path}.${key}`);
	return pruned;
}
/** Walks the schema root: keeps the spec root keys, drops annotations, rejects the rest. */
function walkRequestedSchema(converted, vendor) {
	const pruned = {};
	const unsupported = [];
	for (const [key, value] of Object.entries(converted)) if (key === "properties" && isJsonObject(value)) pruned[key] = Object.fromEntries(Object.entries(value).map(([name, node]) => [name, walkProperty(node, `properties.${name}`, vendor, unsupported)]));
	else if (ROOT_KEYS.has(key)) pruned[key] = value;
	else if (!isAnnotationOnlyJsonSchemaKeyword(key)) unsupported.push(key);
	if (unsupported.length > 0) throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Elicitation requestedSchema contains unsupported JSON Schema constraint(s) after Standard Schema conversion: ${unsupported.join(", ")}`);
	return pruned;
}
/** Names the properties that fail value validation, instead of surfacing a raw union dump. */
function describeUnsupportedProperties(pruned, fallback) {
	if (!isJsonObject(pruned.properties)) return fallback;
	const offenders = Object.entries(pruned.properties).filter(([, node]) => !parseSchema(PrimitiveSchemaDefinitionSchema, node).success).map(([name]) => `properties.${name}`);
	return offenders.length > 0 ? offenders.join(", ") : fallback;
}
function findDroppedConstraintPaths(original, parsed, path = "") {
	if (Array.isArray(original) && Array.isArray(parsed)) return original.flatMap((item, index) => findDroppedConstraintPaths(item, parsed[index], `${path}[${index}]`));
	if (!isJsonObject(original) || !isJsonObject(parsed)) return [];
	return Object.entries(original).flatMap(([key, value]) => {
		const childPath = path ? `${path}.${key}` : key;
		if (!Object.prototype.hasOwnProperty.call(parsed, key)) return isAnnotationOnlyJsonSchemaKeyword(key) ? [] : [childPath];
		return findDroppedConstraintPaths(value, parsed[key], childPath);
	});
}
/** Converts an authoring-friendly elicitation input into its wire-ready form. */
function normalizeElicitInputParams(input) {
	if (!isStandardSchema(input.requestedSchema)) return {
		...input,
		mode: "form",
		requestedSchema: input.requestedSchema
	};
	const vendor = input.requestedSchema["~standard"].vendor;
	const pruned = walkRequestedSchema(convertStandardElicitationSchema(input.requestedSchema), vendor);
	const parsed = parseSchema(ElicitRequestFormParamsSchema.shape.requestedSchema, pruned);
	if (!parsed.success) throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Elicitation requestedSchema only supports flat primitive properties (string, number, integer, boolean, and string enums): ${describeUnsupportedProperties(pruned, parsed.error.message)}`);
	const droppedConstraints = findDroppedConstraintPaths(pruned, parsed.data);
	if (droppedConstraints.length > 0) throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Elicitation requestedSchema contains unsupported JSON Schema constraint(s) after Standard Schema conversion: ${droppedConstraints.join(", ")}`);
	const danglingRequired = (parsed.data.required ?? []).filter((key) => !Object.prototype.hasOwnProperty.call(parsed.data.properties, key));
	if (danglingRequired.length > 0) throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Elicitation requestedSchema lists required properties that are not defined in properties: ${danglingRequired.join(", ")}`);
	return {
		...input,
		mode: "form",
		requestedSchema: parsed.data
	};
}
/**
* Authoring helpers for multi-round-trip requests (protocol revision
* 2026-07-28).
*
* A handler for one of the multi-round-trip methods (`tools/call`,
* `prompts/get`, `resources/read`) requests additional client input by
* returning an {@linkcode InputRequiredResult} instead of a final result. The
* helpers here build that return value and its embedded requests as NEUTRAL
* values; only the 2026-07-28 wire codec maps them to/from the wire. The
* 2025-era codec has no input-required vocabulary — on a 2025-era request the
* server's legacy shim (on by default) fulfils the embedded requests as real
* server→client requests and re-enters the handler, so the same return shape
* serves both eras; `ServerOptions.inputRequired.legacyShim: false` restores
* the pre-shim loud failure.
*
* There is no nominal brand: `resultType: 'input_required'` is the
* discriminator, and hand-built result literals are equally legal — the
* server seam re-checks the at-least-one rule for them.
*/
function buildInputRequired(spec) {
	const hasInputRequests = spec.inputRequests !== void 0 && Object.keys(spec.inputRequests).length > 0;
	const hasRequestState = typeof spec.requestState === "string";
	if (!hasInputRequests && !hasRequestState) throw new TypeError("inputRequired() requires at least one of inputRequests (with at least one entry) or requestState (spec: every InputRequiredResult MUST include at least one of the two)");
	return {
		resultType: "input_required",
		...spec.inputRequests !== void 0 && { inputRequests: spec.inputRequests },
		...spec.requestState !== void 0 && { requestState: spec.requestState }
	};
}
Object.assign(buildInputRequired, {
	elicit(params) {
		try {
			return {
				method: "elicitation/create",
				params: normalizeElicitInputParams(params)
			};
		} catch (error) {
			throw error instanceof ProtocolError ? new TypeError(error.message, { cause: error }) : error;
		}
	},
	elicitUrl(params) {
		return {
			method: "elicitation/create",
			params: {
				...params,
				mode: "url"
			}
		};
	},
	createMessage(params) {
		return {
			method: "sampling/createMessage",
			params
		};
	},
	listRoots() {
		return { method: "roots/list" };
	}
});
/**
* The message both multi-round-trip loops emit when the round cap is
* exhausted — the client driver as a typed error, the server-side legacy
* shim as its per-family failure. One formatter so the texts cannot drift
* (hosts and models read the tool-result copy verbatim).
*/
function inputRequiredRoundsExceededMessage(method, maxRounds) {
	return `Multi-round-trip request '${method}' still required input after ${maxRounds} rounds (inputRequired.maxRounds)`;
}
/**
* Abortable delay: resolves after `ms`, or rejects with the signal's reason
* (wrapped in an `SdkError` when it isn't already one) if the signal aborts
* first. Aborting after resolution is a no-op. Shared with the server-side
* legacy shim (the pacing semantics must match per era).
*/
function sleep(ms, signal) {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(signal.reason instanceof SdkError ? signal.reason : new SdkError(SdkErrorCode.RequestTimeout, String(signal.reason)));
			return;
		}
		const timer = setTimeout(() => {
			signal?.removeEventListener("abort", onAbort);
			resolve();
		}, ms);
		const onAbort = () => {
			clearTimeout(timer);
			reject(signal?.reason instanceof SdkError ? signal.reason : new SdkError(SdkErrorCode.RequestTimeout, String(signal?.reason)));
		};
		signal?.addEventListener("abort", onAbort, { once: true });
	});
}
/**
* A per-round abort linked to the caller's signal: the embedded sibling
* dispatches share it, so the first failure (or a caller abort) cancels the
* others instead of leaving them running. Shared with the server-side legacy
* shim (the abort-linkage semantics must match per era).
*/
function linkedRoundAbort(outer) {
	const controller = new AbortController();
	const onOuterAbort = () => controller.abort(outer?.reason);
	outer?.addEventListener("abort", onOuterAbort, { once: true });
	if (outer?.aborted) controller.abort(outer.reason);
	return {
		signal: controller.signal,
		abort: (reason) => controller.abort(reason),
		dispose: () => outer?.removeEventListener("abort", onOuterAbort)
	};
}
/**
* Explicit allowlist of protocol Zod schemas that correspond to a public spec type in `types.ts`.
*
* This intentionally excludes internal helper schemas exported from `schemas.ts` that have no
* matching public type (e.g. `ListChangedOptionsBaseSchema`, `BaseRequestParamsSchema`,
* `NotificationsParamsSchema`, `ClientTasksCapabilitySchema`, `ServerTasksCapabilitySchema`).
* Keeping the list explicit means new public spec types must be added here deliberately, and
* internals never leak into `SpecTypeName`.
*
* `ResourceTemplateSchema` is included; its public type is exported as `ResourceTemplateType`
* (the bare name collides with the server package's `ResourceTemplate` class), so
* `SpecTypes['ResourceTemplate']` is structurally equal to `ResourceTemplateType` rather than to
* a type literally named `ResourceTemplate`.
*/
var SPEC_SCHEMA_KEYS = [
	"AnnotationsSchema",
	"AudioContentSchema",
	"BaseMetadataSchema",
	"BlobResourceContentsSchema",
	"BooleanSchemaSchema",
	"CallToolRequestSchema",
	"CallToolRequestParamsSchema",
	"CallToolResultSchema",
	"CancelledNotificationSchema",
	"CancelledNotificationParamsSchema",
	"CancelTaskRequestSchema",
	"CancelTaskResultSchema",
	"ClientCapabilitiesSchema",
	"ClientNotificationSchema",
	"ClientRequestSchema",
	"ClientResultSchema",
	"CompatibilityCallToolResultSchema",
	"CompleteRequestSchema",
	"CompleteRequestParamsSchema",
	"CompleteResultSchema",
	"ContentBlockSchema",
	"CreateMessageRequestSchema",
	"CreateMessageRequestParamsSchema",
	"CreateMessageResultSchema",
	"CreateMessageResultWithToolsSchema",
	"CreateTaskResultSchema",
	"CursorSchema",
	"DiscoverRequestSchema",
	"DiscoverResultSchema",
	"ElicitationCompleteNotificationSchema",
	"ElicitationCompleteNotificationParamsSchema",
	"ElicitRequestSchema",
	"ElicitRequestFormParamsSchema",
	"ElicitRequestParamsSchema",
	"ElicitRequestURLParamsSchema",
	"ElicitResultSchema",
	"EmbeddedResourceSchema",
	"EmptyResultSchema",
	"EnumSchemaSchema",
	"GetPromptRequestSchema",
	"GetPromptRequestParamsSchema",
	"GetPromptResultSchema",
	"GetTaskPayloadRequestSchema",
	"GetTaskPayloadResultSchema",
	"GetTaskRequestSchema",
	"GetTaskResultSchema",
	"IconSchema",
	"IconsSchema",
	"ImageContentSchema",
	"ImplementationSchema",
	"InitializedNotificationSchema",
	"InitializeRequestSchema",
	"InitializeRequestParamsSchema",
	"InitializeResultSchema",
	"JSONArraySchema",
	"JSONObjectSchema",
	"JSONRPCErrorResponseSchema",
	"JSONRPCMessageSchema",
	"JSONRPCNotificationSchema",
	"JSONRPCRequestSchema",
	"JSONRPCResponseSchema",
	"JSONRPCResultResponseSchema",
	"JSONValueSchema",
	"LegacyTitledEnumSchemaSchema",
	"ListPromptsRequestSchema",
	"ListPromptsResultSchema",
	"ListResourcesRequestSchema",
	"ListResourcesResultSchema",
	"ListResourceTemplatesRequestSchema",
	"ListResourceTemplatesResultSchema",
	"ListRootsRequestSchema",
	"ListRootsResultSchema",
	"ListTasksRequestSchema",
	"ListTasksResultSchema",
	"ListToolsRequestSchema",
	"ListToolsResultSchema",
	"LoggingLevelSchema",
	"LoggingMessageNotificationSchema",
	"LoggingMessageNotificationParamsSchema",
	"ModelHintSchema",
	"ModelPreferencesSchema",
	"MultiSelectEnumSchemaSchema",
	"NotificationSchema",
	"NumberSchemaSchema",
	"PaginatedRequestSchema",
	"PaginatedRequestParamsSchema",
	"PaginatedResultSchema",
	"PingRequestSchema",
	"PrimitiveSchemaDefinitionSchema",
	"ProgressSchema",
	"ProgressNotificationSchema",
	"ProgressNotificationParamsSchema",
	"ProgressTokenSchema",
	"PromptSchema",
	"PromptArgumentSchema",
	"PromptListChangedNotificationSchema",
	"PromptMessageSchema",
	"PromptReferenceSchema",
	"ReadResourceRequestSchema",
	"ReadResourceRequestParamsSchema",
	"ReadResourceResultSchema",
	"RelatedTaskMetadataSchema",
	"RequestSchema",
	"RequestIdSchema",
	"RequestMetaSchema",
	"ResourceSchema",
	"ResourceContentsSchema",
	"ResourceLinkSchema",
	"ResourceListChangedNotificationSchema",
	"ResourceRequestParamsSchema",
	"ResourceTemplateSchema",
	"ResourceTemplateReferenceSchema",
	"ResourceUpdatedNotificationSchema",
	"ResourceUpdatedNotificationParamsSchema",
	"ResultMetaObjectSchema",
	"ResultSchema",
	"RoleSchema",
	"RootSchema",
	"RootsListChangedNotificationSchema",
	"SamplingContentSchema",
	"SamplingMessageSchema",
	"SamplingMessageContentBlockSchema",
	"ServerCapabilitiesSchema",
	"ServerNotificationSchema",
	"ServerRequestSchema",
	"ServerResultSchema",
	"SetLevelRequestSchema",
	"SetLevelRequestParamsSchema",
	"SingleSelectEnumSchemaSchema",
	"StringSchemaSchema",
	"SubscribeRequestSchema",
	"SubscribeRequestParamsSchema",
	"SubscriptionFilterSchema",
	"SubscriptionsAcknowledgedNotificationSchema",
	"SubscriptionsAcknowledgedNotificationParamsSchema",
	"SubscriptionsListenRequestSchema",
	"SubscriptionsListenRequestParamsSchema",
	"SubscriptionsListenResultSchema",
	"SubscriptionsListenResultMetaSchema",
	"TaskAugmentedRequestParamsSchema",
	"TaskCreationParamsSchema",
	"TaskMetadataSchema",
	"TaskSchema",
	"TaskStatusSchema",
	"TaskStatusNotificationSchema",
	"TaskStatusNotificationParamsSchema",
	"TextContentSchema",
	"TextResourceContentsSchema",
	"TitledMultiSelectEnumSchemaSchema",
	"TitledSingleSelectEnumSchemaSchema",
	"ToolSchema",
	"ToolAnnotationsSchema",
	"ToolChoiceSchema",
	"ToolExecutionSchema",
	"ToolListChangedNotificationSchema",
	"ToolResultContentSchema",
	"ToolUseContentSchema",
	"UnsubscribeRequestSchema",
	"UnsubscribeRequestParamsSchema",
	"UntitledMultiSelectEnumSchemaSchema",
	"UntitledSingleSelectEnumSchemaSchema"
];
var authSchemas = {
	IdJagTokenExchangeResponseSchema,
	OAuthClientInformationFullSchema,
	OAuthClientInformationSchema,
	OAuthClientMetadataSchema,
	OAuthClientRegistrationErrorSchema,
	OAuthErrorResponseSchema,
	OAuthMetadataSchema,
	OAuthProtectedResourceMetadataSchema,
	OAuthTokenRevocationRequestSchema,
	OAuthTokensSchema,
	OpenIdProviderDiscoveryMetadataSchema,
	OpenIdProviderMetadataSchema
};
var _specTypeSchemas = {};
var _isSpecType = {};
function register(key, schema) {
	const name = key.slice(0, -6);
	_specTypeSchemas[name] = schema;
	_isSpecType[name] = (v) => schema.safeParse(v).success;
}
for (const key of SPEC_SCHEMA_KEYS) register(key, schemas_exports[key]);
for (const [key, schema] of Object.entries(authSchemas)) register(key, schema);
Object.freeze(_specTypeSchemas);
Object.freeze(_isSpecType);
function bootstrapOutboundCodec(method) {
	switch (method) {
		case "initialize":
		case "notifications/initialized": return codecForVersion(void 0);
		case "server/discover": return codecForVersion(MODERN_WIRE_REVISION);
		default: return;
	}
}
/**
* The reserved per-request `_meta` envelope keys (protocol revision
* 2026-07-28). The protocol layer lifts these out of inbound `_meta` before
* handlers run and surfaces them at `ctx.mcpReq.envelope` — they are
* wire-level bookkeeping, not handler material.
*/
var RESERVED_ENVELOPE_META_KEYS = [
	PROTOCOL_VERSION_META_KEY,
	CLIENT_INFO_META_KEY,
	CLIENT_CAPABILITIES_META_KEY,
	LOG_LEVEL_META_KEY
];
/**
* Top-level params members carrying multi-round-trip driver material
* (protocol revision 2026-07-28). The spec reserves these names on
* client-initiated REQUESTS only — notification params keep them untouched
* (a vendor notification may legitimately use the same names).
*/
var RETRY_PARAMS_KEYS = ["inputResponses", "requestState"];
/**
* Lift wire-only material out of an inbound message so handlers see exactly
* the 2025-era shape, and surface it for the protocol layer (requests: via
* `ctx.mcpReq`). What counts as wire-only depends on the message kind: the
* reserved envelope `_meta` keys are reserved on every message, while the
* multi-round-trip retry fields (`inputResponses`/`requestState`) are
* reserved on client-initiated requests only — so notifications get only the
* envelope lift, and their top-level params stay untouched. Messages without
* wire-only material are returned unchanged (same reference).
*/
function liftWireOnlyMaterial(message, kind) {
	const params = message.params;
	if (!isPlainObject$1(params)) return {
		message,
		lifted: {}
	};
	const meta = params._meta;
	const envelopeKeys = isPlainObject$1(meta) ? RESERVED_ENVELOPE_META_KEYS.filter((key) => key in meta) : [];
	const retryKeys = kind === "request" ? RETRY_PARAMS_KEYS.filter((key) => key in params) : [];
	if (envelopeKeys.length === 0 && retryKeys.length === 0) return {
		message,
		lifted: {}
	};
	const lifted = {};
	const nextParams = { ...params };
	if (envelopeKeys.length > 0 && isPlainObject$1(meta)) {
		const envelope = {};
		const nextMeta = { ...meta };
		for (const key of envelopeKeys) {
			envelope[key] = meta[key];
			delete nextMeta[key];
		}
		lifted.envelope = envelope;
		if (Object.keys(nextMeta).length > 0) nextParams._meta = nextMeta;
		else delete nextParams._meta;
	}
	for (const key of retryKeys) {
		if (key === "inputResponses") lifted.inputResponses = nextParams[key];
		if (key === "requestState") lifted.requestState = nextParams[key];
		delete nextParams[key];
	}
	return {
		message: {
			...message,
			params: nextParams
		},
		lifted
	};
}
/**
* Standard Schema adapter over the era codec's `validateResult` function (the
* function-only WireCodec contract exposes no schema objects). Used by the
* spec-method `request()` overload so the request funnel keeps a single
* `StandardSchemaV1`-shaped validation seam for both spec and explicit-schema
* paths.
*
* Returns `undefined` when the method has no result entry on this era's
* registry — the caller maps that to the synchronous "pass a result schema"
* TypeError, exactly matching the pre-function-only behavior the
* typedMapAlignment suite pins (the result map deliberately excludes the
* `tasks/*` methods, so the spec-method overload refuses them up front).
*/
function codecResultValidator(codec, method) {
	const probe = codec.validateResult(method, void 0);
	if (!probe.ok && probe.reason === "not-in-era") return void 0;
	return { "~standard": {
		version: 1,
		vendor: "mcp-wire-codec",
		validate(value) {
			const outcome = codec.validateResult(method, value);
			if (outcome.ok) return { value: outcome.value };
			return { issues: [{ message: outcome.reason === "invalid" ? outcome.message : `not-in-era: ${method}` }] };
		}
	} };
}
/**
* Builds the `ctx.mcpReq.requestState` accessor for a resolved value. The
* `as T` below is the one place {@linkcode RequestStateAccessor}'s
* caller-asserted typing is implemented — no implementation can produce an
* arbitrary `T` from a runtime value honestly.
*/
function requestStateAccessor(value) {
	return () => value;
}
/** Shared no-state accessor: the common case allocates nothing per request. */
var NO_REQUEST_STATE = requestStateAccessor(void 0);
/**
* Returns a context whose `requestState` accessor reads the given value —
* how the server seam hands a verify hook's decoded payload (or the legacy
* shim's per-round echo) to the handler without mutating the original
* context.
*/
function withRequestStateValue(ctx, value) {
	return {
		...ctx,
		mcpReq: {
			...ctx.mcpReq,
			requestState: requestStateAccessor(value)
		}
	};
}
/**
* Implements MCP protocol framing on top of a pluggable transport, including
* features like request/response linking, notifications, and progress.
*
* `Protocol` is abstract; `Client` and `Server` are the concrete role-specific
* implementations most code should use.
*/
var Protocol = class {
	_transport;
	_requestMessageId = 0;
	_requestHandlers = /* @__PURE__ */ new Map();
	/** Methods registered with an explicit schema; the era gate in `_onrequest` reads it for the Tasks extension names. */
	_customSchemaRequestMethods = /* @__PURE__ */ new Set();
	_requestHandlerAbortControllers = /* @__PURE__ */ new Map();
	_notificationHandlers = /* @__PURE__ */ new Map();
	_responseHandlers = /* @__PURE__ */ new Map();
	_progressHandlers = /* @__PURE__ */ new Map();
	_timeoutInfo = /* @__PURE__ */ new Map();
	_pendingDebouncedNotifications = /* @__PURE__ */ new Set();
	/**
	* The protocol version negotiated for the current connection (`undefined`
	* before negotiation completes), which determines the wire era this
	* instance speaks. Set by the SDK's negotiation and initialize paths
	* (`Client.connect`, `Server._oninitialize`).
	*/
	_negotiatedProtocolVersion;
	static {}
	_supportedProtocolVersions;
	/**
	* Callback for when the connection is closed for any reason.
	*
	* This is invoked when {@linkcode Protocol.close | close()} is called as well.
	*/
	onclose;
	/**
	* Callback for when an error occurs.
	*
	* Note that errors are not necessarily fatal; they are used for reporting any kind of exceptional condition out of band.
	*/
	onerror;
	/**
	* A handler to invoke for any request types that do not have their own handler installed.
	*/
	fallbackRequestHandler;
	/**
	* A handler to invoke for any notification types that do not have their own handler installed.
	*/
	fallbackNotificationHandler;
	constructor(_options) {
		this._options = _options;
		this._supportedProtocolVersions = _options?.supportedProtocolVersions ?? SUPPORTED_PROTOCOL_VERSIONS;
		this.setNotificationHandler("notifications/cancelled", (notification) => {
			this._oncancel(notification);
		});
		this.setNotificationHandler("notifications/progress", (notification) => {
			this._onprogress(notification);
		});
		this.setRequestHandler("ping", (_request) => ({}));
	}
	/**
	* Drop consult for inbound messages whose transport did not classify them
	* at the edge — long-lived channels such as stdio, where a role class may
	* need to decline traffic the negotiated era has no answer for (the
	* client-side inbound-request drop on modern-era connections: the
	* 2026-07-28 era has no server→client request channel, and on stdio the
	* client must never write JSON-RPC responses).
	*
	* Consulted ONLY when the transport supplied no
	* {@linkcode MessageExtraInfo.classification}: edge-classified traffic
	* never reaches the hook. Returning `'drop'` discards the message without
	* writing any response (requests are surfaced via `onerror`). The base
	* implementation returns `undefined`: unclassified traffic keeps today's
	* dispatch path unchanged. Era selection never happens here — era is
	* instance state, owned by the serving entry that constructed and
	* connected the instance.
	*/
	_shouldDropInbound(_message) {}
	/**
	* The per-request `_meta` envelope this instance attaches to every outgoing
	* request and notification, when one applies. The base implementation
	* returns `undefined` (no envelope — the 2025-era posture, so legacy-era
	* outbound traffic is byte-identical to a build without this seam).
	* `Client` overrides it on a connection that negotiated a modern (2026-07-28+)
	* era to return the reserved protocol-version / client-info /
	* client-capabilities keys. User-supplied `_meta` keys take precedence over
	* the auto-attached ones.
	*/
	_outboundMetaEnvelope() {}
	/**
	* Attach this instance's outbound `_meta` envelope (when one is configured)
	* to a request or notification. A no-op when the seam returns `undefined`
	* — the message returns by reference, so the legacy-era wire stays
	* byte-identical. User-supplied `_meta` keys are spread last so they win
	* over the auto-attached envelope keys.
	*/
	_envelopeOutbound(message) {
		const envelope = this._outboundMetaEnvelope();
		if (envelope === void 0) return message;
		const params = message.params ?? {};
		return {
			...message,
			params: {
				...params,
				_meta: {
					...envelope,
					...params._meta
				}
			}
		};
	}
	/**
	* Extension point for non-`complete` decoded results in the response
	* funnel: a result the wire codec discriminated into a kind other than
	* `'complete'` or `'invalid'` is handed here for the role class to
	* resolve. The base default surfaces it as a typed
	* {@linkcode SdkErrorCode.UnsupportedResultType} error (no retry).
	*
	* Intended consumers (named so the seam stays accountable):
	* - the `Client`'s multi-round-trip auto-fulfilment engine, which fulfils
	*   `'input_required'` results through the registered
	*   elicitation/sampling/roots handlers and retries via `flow.retry`;
	* - a future client-side terminal-result handler for
	*   `subscriptions/listen`, when the spec defines one.
	*
	* `Server` instances never receive `input_required` responses on their
	* outbound legs and leave the base behavior in place.
	*/
	_resolveNonCompleteResult(decoded, flow) {
		return Promise.reject(new SdkError(SdkErrorCode.UnsupportedResultType, `Unsupported result type '${decoded.kind}' for ${flow.request.method}`, {
			resultType: decoded.kind,
			method: flow.request.method
		}));
	}
	/**
	* Protected accessor for a registered request handler. Used by role
	* classes that dispatch synthesized requests through the same stored
	* handler chain (e.g. the `Client` fulfilling an embedded multi-round-trip
	* input request).
	*/
	_getRequestHandler(method) {
		return this._requestHandlers.get(method);
	}
	async _oncancel(notification) {
		if (notification.params.requestId === void 0) return;
		this._requestHandlerAbortControllers.get(notification.params.requestId)?.abort(notification.params.reason);
	}
	_setupTimeout(messageId, timeout, maxTotalTimeout, onTimeout, resetTimeoutOnProgress = false) {
		this._timeoutInfo.set(messageId, {
			timeoutId: setTimeout(onTimeout, timeout),
			startTime: Date.now(),
			timeout,
			maxTotalTimeout,
			resetTimeoutOnProgress,
			onTimeout
		});
	}
	_resetTimeout(messageId) {
		const info = this._timeoutInfo.get(messageId);
		if (!info) return false;
		const totalElapsed = Date.now() - info.startTime;
		if (info.maxTotalTimeout && totalElapsed >= info.maxTotalTimeout) {
			this._timeoutInfo.delete(messageId);
			throw new SdkError(SdkErrorCode.RequestTimeout, "Maximum total timeout exceeded", {
				maxTotalTimeout: info.maxTotalTimeout,
				totalElapsed
			});
		}
		clearTimeout(info.timeoutId);
		info.timeoutId = setTimeout(info.onTimeout, info.timeout);
		return true;
	}
	_cleanupTimeout(messageId) {
		const info = this._timeoutInfo.get(messageId);
		if (info) {
			clearTimeout(info.timeoutId);
			this._timeoutInfo.delete(messageId);
		}
	}
	/**
	* Attaches to the given transport, starts it, and starts listening for messages.
	*
	* The caller assumes ownership of the {@linkcode Transport}, replacing any callbacks that have already been set, and expects that it is the only user of the {@linkcode Transport} instance going forward.
	*/
	async connect(transport) {
		this._transport = transport;
		const _onclose = this.transport?.onclose;
		this._transport.onclose = () => {
			try {
				_onclose?.();
			} finally {
				this._onclose();
			}
		};
		const _onerror = this.transport?.onerror;
		this._transport.onerror = (error) => {
			_onerror?.(error);
			this._onerror(error);
		};
		const _onmessage = this._transport?.onmessage;
		this._transport.onmessage = (message, extra) => {
			_onmessage?.(message, extra);
			if (isJSONRPCResultResponse(message) || isJSONRPCErrorResponse(message)) this._onresponse(message);
			else if (isJSONRPCRequest(message)) this._onrequest(message, extra);
			else if (isJSONRPCNotification(message)) this._onnotification(message, extra);
			else this._onerror(/* @__PURE__ */ new Error(`Unknown message type: ${JSON.stringify(message)}`));
		};
		transport.setSupportedProtocolVersions?.(this._supportedProtocolVersions);
		await this._transport.start();
	}
	/**
	* Transport-close hook. Subclass overrides MUST call `super._onclose()`
	* after their own cleanup — base teardown (response-handler settlement,
	* timeout clearing, in-flight request abort) does not run otherwise.
	*/
	_onclose() {
		const responseHandlers = this._responseHandlers;
		this._responseHandlers = /* @__PURE__ */ new Map();
		this._progressHandlers.clear();
		this._pendingDebouncedNotifications.clear();
		for (const info of this._timeoutInfo.values()) clearTimeout(info.timeoutId);
		this._timeoutInfo.clear();
		const requestHandlerAbortControllers = this._requestHandlerAbortControllers;
		this._requestHandlerAbortControllers = /* @__PURE__ */ new Map();
		const error = new SdkError(SdkErrorCode.ConnectionClosed, "Connection closed");
		this._transport = void 0;
		try {
			this.onclose?.();
		} finally {
			for (const handler of responseHandlers.values()) handler(error);
			for (const controller of requestHandlerAbortControllers.values()) controller.abort(error);
		}
	}
	_onerror(error) {
		this.onerror?.(error);
	}
	/**
	* Inbound-notification dispatch. Subclass overrides MUST delegate
	* unmatched traffic to `super._onnotification(rawNotification, extra)` —
	* an override that consumes only what it owns and falls through to base
	* dispatch for everything else.
	*/
	_onnotification(rawNotification, extra) {
		const { message: notification } = liftWireOnlyMaterial(rawNotification, "notification");
		const codec = this._negotiatedWireCodec();
		if (extra?.classification === void 0 && this._shouldDropInbound(rawNotification) === "drop") return;
		if (extra?.classification !== void 0) {
			const classified = classifiedWireEra(extra.classification);
			if (classified !== codec.era) {
				this._onerror(/* @__PURE__ */ new Error(`Era mismatch on inbound notification '${notification.method}': classified as ${classified} but this instance serves ${codec.era}`));
				return;
			}
		}
		if (isSpecNotificationMethod(notification.method) && !codec.hasNotificationMethod(notification.method)) return;
		const handler = this._notificationHandlers.get(notification.method);
		const fallback = this.fallbackNotificationHandler;
		if (handler === void 0 && fallback === void 0) return;
		Promise.resolve().then(() => handler === void 0 ? fallback(notification) : handler(notification, codec)).catch((error) => this._onerror(/* @__PURE__ */ new Error(`Uncaught error in notification handler: ${error}`)));
	}
	_onrequest(rawRequest, extra) {
		const { message: request, lifted } = liftWireOnlyMaterial(rawRequest, "request");
		const codec = this._negotiatedWireCodec();
		if (extra?.classification === void 0 && this._shouldDropInbound(rawRequest) === "drop") {
			this._onerror(/* @__PURE__ */ new Error(`Dropped inbound request '${rawRequest.method}': not servable on this connection's protocol era`));
			return;
		}
		const capturedTransport = this._transport;
		const sendErrorResponse = (code, message, data) => {
			const errorResponse = {
				jsonrpc: "2.0",
				id: request.id,
				error: {
					code,
					message,
					...data !== void 0 && { data }
				}
			};
			capturedTransport?.send(errorResponse).catch((error) => this._onerror(/* @__PURE__ */ new Error(`Failed to send an error response: ${error}`)));
		};
		if (extra?.classification !== void 0) {
			const classified = classifiedWireEra(extra.classification);
			if (classified !== codec.era) {
				this._onerror(/* @__PURE__ */ new Error(`Era mismatch on inbound request '${request.method}': classified as ${classified} but this instance serves ${codec.era}`));
				const requested = extra.classification.revision ?? classified;
				sendErrorResponse(ProtocolErrorCode.UnsupportedProtocolVersion, `Unsupported protocol version: ${requested}`, {
					supported: this._supportedProtocolVersions,
					requested
				});
				return;
			}
		}
		if (isSpecRequestMethod(request.method) && !codec.hasRequestMethod(request.method) && !(isExtensionReusedRequestMethod(request.method) && this._customSchemaRequestMethods.has(request.method))) {
			sendErrorResponse(ProtocolErrorCode.MethodNotFound, "Method not found");
			return;
		}
		const handler = this._requestHandlers.get(request.method) ?? this.fallbackRequestHandler;
		if (handler === void 0) {
			sendErrorResponse(ProtocolErrorCode.MethodNotFound, "Method not found");
			return;
		}
		const envelopeError = codec.checkInboundEnvelope(lifted);
		if (envelopeError !== void 0) {
			sendErrorResponse(ProtocolErrorCode.InvalidParams, envelopeError);
			return;
		}
		const sendNotification = (notification, options) => this._notificationViaCodec(this._resolveOutboundCodec(notification.method), notification, {
			...options,
			relatedRequestId: request.id
		});
		const sendRequest = (r, resultSchema, options) => this._requestWithSchemaViaCodec(this._resolveOutboundCodec(r.method), r, resultSchema, {
			...options,
			relatedRequestId: request.id
		});
		const abortController = new AbortController();
		this._requestHandlerAbortControllers.set(request.id, abortController);
		const partitionedInputResponses = lifted.inputResponses === void 0 ? void 0 : partitionInputResponses(lifted.inputResponses);
		const baseCtx = {
			sessionId: capturedTransport?.sessionId,
			mcpReq: {
				id: request.id,
				method: request.method,
				_meta: request.params?._meta,
				...lifted.envelope !== void 0 && { envelope: lifted.envelope },
				...partitionedInputResponses !== void 0 && { inputResponses: partitionedInputResponses.accepted },
				...partitionedInputResponses !== void 0 && partitionedInputResponses.droppedKeys.length > 0 && { droppedInputResponseKeys: partitionedInputResponses.droppedKeys },
				requestState: lifted.requestState === void 0 ? NO_REQUEST_STATE : requestStateAccessor(lifted.requestState),
				signal: abortController.signal,
				send: ((r, schemaOrOptions, maybeOptions) => {
					const sendCodec = this._resolveOutboundCodec(r.method);
					this._assertOutboundRequestInEra(sendCodec, r.method);
					if (isStandardSchema(schemaOrOptions)) return sendRequest(r, schemaOrOptions, maybeOptions);
					const validate = codecResultValidator(sendCodec, r.method);
					if (validate === void 0) throw new TypeError(`'${r.method}' is not a spec method; pass a result schema as the second argument to ctx.mcpReq.send().`);
					return sendRequest(r, validate, schemaOrOptions);
				}),
				notify: sendNotification
			},
			http: extra?.authInfo ? { authInfo: extra.authInfo } : void 0
		};
		const ctx = this.buildContext(baseCtx, extra);
		Promise.resolve().then(() => handler(request, ctx)).then(async (result) => {
			if (abortController.signal.aborted) return;
			let encoded;
			try {
				encoded = codec.encodeResult(request.method, result, this._outboundServerInfo());
			} catch (error) {
				this._onerror(/* @__PURE__ */ new Error(`Failed to encode result for ${request.method}: ${error}`));
				sendErrorResponse(ProtocolErrorCode.InternalError, "Internal error");
				return;
			}
			const response = {
				result: encoded,
				jsonrpc: "2.0",
				id: request.id
			};
			await capturedTransport?.send(response);
		}, async (error) => {
			if (abortController.signal.aborted) return;
			const thrownCode = Number.isSafeInteger(error["code"]) ? error["code"] : ProtocolErrorCode.InternalError;
			const errorResponse = {
				jsonrpc: "2.0",
				id: request.id,
				error: {
					code: codec.encodeErrorCode(thrownCode),
					message: error.message ?? "Internal error",
					...error["data"] !== void 0 && { data: error["data"] }
				}
			};
			await capturedTransport?.send(errorResponse);
		}).catch((error) => this._onerror(/* @__PURE__ */ new Error(`Failed to send response: ${error}`))).finally(() => {
			if (this._requestHandlerAbortControllers.get(request.id) === abortController) this._requestHandlerAbortControllers.delete(request.id);
		});
	}
	_onprogress(notification) {
		const { progressToken, ...params } = notification.params;
		const messageId = Number(progressToken);
		const handler = this._progressHandlers.get(messageId);
		if (!handler) {
			this._onerror(/* @__PURE__ */ new Error(`Received a progress notification for an unknown token: ${JSON.stringify(notification)}`));
			return;
		}
		const responseHandler = this._responseHandlers.get(messageId);
		const timeoutInfo = this._timeoutInfo.get(messageId);
		if (timeoutInfo && responseHandler && timeoutInfo.resetTimeoutOnProgress) try {
			this._resetTimeout(messageId);
		} catch (error) {
			this._responseHandlers.delete(messageId);
			this._progressHandlers.delete(messageId);
			this._cleanupTimeout(messageId);
			responseHandler(error);
			return;
		}
		handler(params);
	}
	/**
	* Inbound-response dispatch. Subclass overrides MUST delegate unmatched
	* traffic to `super._onresponse(response)` — an override that consumes
	* only what it owns and falls through to base dispatch for everything
	* else.
	*/
	_onresponse(response) {
		const messageId = Number(response.id);
		const handler = this._responseHandlers.get(messageId);
		if (handler === void 0) {
			this._onerror(/* @__PURE__ */ new Error(`Received a response for an unknown message ID: ${JSON.stringify(response)}`));
			return;
		}
		this._responseHandlers.delete(messageId);
		this._cleanupTimeout(messageId);
		this._progressHandlers.delete(messageId);
		if (isJSONRPCResultResponse(response)) handler(response);
		else handler(ProtocolError.fromError(response.error.code, response.error.message, response.error.data));
	}
	get transport() {
		return this._transport;
	}
	/**
	* Closes the connection.
	*/
	async close() {
		await this._transport?.close();
	}
	request(request, schemaOrOptions, maybeOptions) {
		const codec = this._resolveOutboundCodec(request.method);
		if (isStandardSchema(schemaOrOptions)) {
			if (!isExtensionReusedRequestMethod(request.method)) this._assertOutboundRequestInEra(codec, request.method);
			return this._requestWithSchemaViaCodec(codec, request, schemaOrOptions, maybeOptions);
		}
		this._assertOutboundRequestInEra(codec, request.method);
		const validate = codecResultValidator(codec, request.method);
		if (validate === void 0) throw new TypeError(`'${request.method}' is not a spec method; pass a result schema as the second argument to request().`);
		return this._requestWithSchemaViaCodec(codec, request, validate, schemaOrOptions);
	}
	/**
	* The wire codec for this instance's negotiated era — the phase-2 truth:
	* everything an established connection sends and receives resolves
	* through it. Legacy until a version has been negotiated.
	*/
	_negotiatedWireCodec() {
		return codecForVersion(this._negotiatedProtocolVersion);
	}
	/**
	* Protected accessor for the instance's negotiated wire codec, for role
	* classes (Client/Server/McpServer) routing era-dependent behavior
	* through the codec's function-only surface — `samplingResultVariant`,
	* `outboundEnvelope`, `projectCallToolResult` — instead of branching on
	* the protocol version themselves.
	*/
	_wireCodec() {
		return this._negotiatedWireCodec();
	}
	/**
	* Outbound codec resolution: while the negotiated version is still unset
	* (the negotiation window), lifecycle messages are bootstrap-pinned BY
	* METHOD — they self-identify their era (`initialize` IS the legacy
	* handshake, `server/discover` IS the modern probe). Once a version has
	* been negotiated, the instance era is authoritative for everything — a
	* negotiated session never re-routes a method onto the other era.
	*/
	_resolveOutboundCodec(method) {
		if (this._negotiatedProtocolVersion === void 0) {
			const pinned = bootstrapOutboundCodec(method);
			if (pinned) return pinned;
		}
		return this._negotiatedWireCodec();
	}
	/**
	* Era gate for outbound requests — deletions are physical in BOTH
	* directions: sending a spec method that the resolved era does not define
	* dies locally with a typed error before anything reaches the transport.
	* Methods outside the spec universe are consumer-owned extension methods
	* and stay era-blind.
	*/
	_assertOutboundRequestInEra(codec, method) {
		if (isSpecRequestMethod(method) && !codec.hasRequestMethod(method)) throw new SdkError(SdkErrorCode.MethodNotSupportedByProtocolVersion, `Method '${method}' is not supported by the negotiated protocol version (wire era ${codec.era})`, {
			method,
			era: codec.era
		});
	}
	/**
	* Sends a request and waits for a response, using the provided schema for
	* validation instead of the era registry's method-keyed entry.
	*
	* This is the internal implementation used by SDK methods whose result
	* schema cannot be expressed as a method-keyed registry entry — the one
	* surviving case is `server.createMessage`, whose result schema depends
	* on the REQUEST params (tools vs no tools) — and by callers passing
	* explicit compatibility schemas. Spec methods are still era-gated here:
	* an explicit schema never smuggles a deleted method onto the wire.
	*/
	_requestWithSchema(request, resultSchema, options) {
		const codec = this._resolveOutboundCodec(request.method);
		this._assertOutboundRequestInEra(codec, request.method);
		return this._requestWithSchemaViaCodec(codec, request, resultSchema, options);
	}
	/**
	* The request funnel proper, keyed by the resolved era codec: the codec
	* owns result decoding (raw-first `resultType` discrimination — V-1 —
	* and the era's lift posture) before the schema validation step.
	*/
	_requestWithSchemaViaCodec(codec, request, resultSchema, options) {
		const { relatedRequestId, resumptionToken, onresumptiontoken, headers } = options ?? {};
		const flowStartedAt = Date.now();
		let onAbort;
		let cleanupMessageId;
		return new Promise((resolve, reject) => {
			const earlyReject = (error) => {
				reject(error);
			};
			if (!this._transport) {
				earlyReject(/* @__PURE__ */ new Error("Not connected"));
				return;
			}
			if (this._options?.enforceStrictCapabilities === true) try {
				this.assertCapabilityForMethod(request.method);
			} catch (error) {
				earlyReject(error);
				return;
			}
			if (options?.signal?.aborted) {
				const reason = options.signal.reason;
				throw reason instanceof SdkError ? reason : new SdkError(SdkErrorCode.RequestTimeout, String(reason));
			}
			const requestAbort = codec.era === "2026-07-28" && this._transport.hasPerRequestStream === true ? new AbortController() : void 0;
			const messageId = this._requestMessageId++;
			cleanupMessageId = messageId;
			const jsonrpcRequest = {
				...request,
				jsonrpc: "2.0",
				id: messageId
			};
			if (options?.onprogress) {
				this._progressHandlers.set(messageId, options.onprogress);
				jsonrpcRequest.params = {
					...request.params,
					_meta: {
						...request.params?._meta,
						progressToken: messageId
					}
				};
			}
			const outbound = this._envelopeOutbound(jsonrpcRequest);
			let responseReceived = false;
			const cancel = (reason) => {
				if (responseReceived) return;
				this._progressHandlers.delete(messageId);
				if (requestAbort === void 0) {
					if (request.method !== "initialize") this._transport?.send(this._envelopeOutbound({
						jsonrpc: "2.0",
						method: "notifications/cancelled",
						params: {
							requestId: messageId,
							reason: String(reason)
						}
					}), {
						relatedRequestId,
						resumptionToken,
						onresumptiontoken
					}).catch((error) => this._onerror(/* @__PURE__ */ new Error(`Failed to send cancellation: ${error}`)));
				} else requestAbort.abort();
				reject(reason instanceof SdkError ? reason : new SdkError(SdkErrorCode.RequestTimeout, String(reason)));
			};
			this._responseHandlers.set(messageId, (response) => {
				if (options?.signal?.aborted) return;
				responseReceived = true;
				if (response instanceof Error) return reject(response);
				let decoded;
				try {
					decoded = codec.decodeResult(request.method, response.result);
				} catch (error) {
					return reject(error instanceof Error ? error : new Error(String(error)));
				}
				if (decoded.kind === "invalid") return reject(decoded.error);
				if (decoded.kind === "input_required") {
					if (options?.allowInputRequired === true) return resolve(manualInputRequiredValue(decoded));
					const flow = {
						codec,
						request,
						resultSchema,
						options,
						flowStartedAt,
						retry: (params, legOptions) => this._requestWithSchemaViaCodec(codec, params === void 0 ? { method: request.method } : {
							method: request.method,
							params
						}, resultSchema, legOptions)
					};
					return resolve(this._resolveNonCompleteResult(decoded, flow));
				}
				const result = decoded.result;
				validateStandardSchema(resultSchema, result).then((parseResult) => {
					if (parseResult.success) resolve(parseResult.data);
					else reject(new SdkError(SdkErrorCode.InvalidResult, `Invalid result for ${request.method}: ${parseResult.error}`));
				}, reject);
			});
			onAbort = () => cancel(options?.signal?.reason);
			options?.signal?.addEventListener("abort", onAbort, { once: true });
			const timeout = options?.timeout ?? 6e4;
			const timeoutHandler = () => cancel(new SdkError(SdkErrorCode.RequestTimeout, "Request timed out", { timeout }));
			this._setupTimeout(messageId, timeout, options?.maxTotalTimeout, timeoutHandler, options?.resetTimeoutOnProgress ?? false);
			this._transport.send(outbound, {
				relatedRequestId,
				resumptionToken,
				onresumptiontoken,
				headers,
				requestSignal: requestAbort?.signal
			}).catch((error) => {
				this._progressHandlers.delete(messageId);
				reject(error);
			});
		}).finally(() => {
			if (onAbort) options?.signal?.removeEventListener("abort", onAbort);
			if (cleanupMessageId !== void 0) {
				this._responseHandlers.delete(cleanupMessageId);
				this._cleanupTimeout(cleanupMessageId);
			}
		});
	}
	/**
	* Emits a notification, which is a one-way message that does not expect a response.
	*/
	async notification(notification, options) {
		return await this._notificationViaCodec(this._resolveOutboundCodec(notification.method), notification, options);
	}
	/**
	* The notification funnel proper, keyed by the resolved era codec —
	* direct sends and related notifications (`ctx.mcpReq.notify`) alike
	* resolve through the instance's negotiated era at send time.
	*/
	async _notificationViaCodec(codec, notification, options) {
		if (!this._transport) throw new SdkError(SdkErrorCode.NotConnected, "Not connected");
		if (isSpecNotificationMethod(notification.method) && !codec.hasNotificationMethod(notification.method)) throw new SdkError(SdkErrorCode.MethodNotSupportedByProtocolVersion, `Notification '${notification.method}' is not supported by the negotiated protocol version (wire era ${codec.era})`, {
			method: notification.method,
			era: codec.era
		});
		this.assertNotificationCapability(notification.method);
		const jsonrpcNotification = this._envelopeOutbound({
			jsonrpc: "2.0",
			...notification
		});
		if ((this._options?.debouncedNotificationMethods ?? []).includes(notification.method) && !notification.params && options?.relatedRequestId === void 0) {
			if (this._pendingDebouncedNotifications.has(notification.method)) return;
			this._pendingDebouncedNotifications.add(notification.method);
			Promise.resolve().then(() => {
				this._pendingDebouncedNotifications.delete(notification.method);
				if (!this._transport) return;
				this._transport?.send(jsonrpcNotification, options).catch((error) => this._onerror(error));
			});
			return;
		}
		await this._transport.send(jsonrpcNotification, options);
	}
	setRequestHandler(method, schemasOrHandler, maybeHandler) {
		this.assertRequestHandlerCapability(method);
		let stored;
		if (typeof schemasOrHandler === "function") {
			if (!isSpecRequestMethod(method)) throw new TypeError(`'${method}' is not a spec request method; pass schemas as the second argument to setRequestHandler().`);
			stored = (request, ctx) => {
				const dispatchCodec = this._negotiatedWireCodec();
				let outcome = dispatchCodec.validateRequest(method, request);
				if (!outcome.ok && outcome.reason === "not-in-era") outcome = dispatchCodec.validateInputRequest(method, request);
				if (!outcome.ok) {
					if (outcome.reason === "not-in-era") throw new ProtocolError(ProtocolErrorCode.InternalError, `No wire schema for ${method} in the resolved era`);
					throw new Error(outcome.message);
				}
				return Promise.resolve(schemasOrHandler(outcome.value, ctx));
			};
		} else if (maybeHandler) stored = async (request, ctx) => {
			const parsed = await validateStandardSchema(schemasOrHandler.params, { ...request.params });
			if (!parsed.success) throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Invalid params for ${method}: ${parsed.error}`);
			return maybeHandler(parsed.data, ctx);
		};
		else throw new TypeError("setRequestHandler: handler is required");
		if (typeof schemasOrHandler === "function") this._customSchemaRequestMethods.delete(method);
		else this._customSchemaRequestMethods.add(method);
		this._requestHandlers.set(method, this._wrapHandler(method, stored));
	}
	/**
	* Hook for subclasses to wrap a registered request handler with role-specific
	* validation or behavior (e.g. `Server` validates `tools/call` results, `Client`
	* validates `elicitation/create` mode and result). Runs for both the 2-arg and
	* 3-arg registration paths. The default implementation is identity.
	*
	* Subclasses overriding this hook avoid redeclaring `setRequestHandler`'s overload set.
	*/
	_wrapHandler(_method, handler) {
		return handler;
	}
	/**
	* Hook for subclasses to supply the implementation identity the 2026-era
	* encode seam stamps into outbound result `_meta` under
	* `io.modelcontextprotocol/serverInfo` (spec PR #3002: servers SHOULD
	* identify themselves on every response). The default is `undefined` — no
	* stamp. Only `Server` overrides this: the key identifies the software
	* producing a response, and the 2025-era codec never stamps anything
	* regardless (the never-stamp guarantee).
	*/
	_outboundServerInfo() {}
	/**
	* Removes the request handler for the given method.
	*/
	removeRequestHandler(method) {
		this._requestHandlers.delete(method);
		this._customSchemaRequestMethods.delete(method);
	}
	/**
	* Asserts that a request handler has not already been set for the given method, in preparation for a new one being automatically installed.
	*/
	assertCanSetRequestHandler(method) {
		if (this._requestHandlers.has(method)) throw new Error(`A request handler for ${method} already exists, which would be overridden`);
	}
	setNotificationHandler(method, schemasOrHandler, maybeHandler) {
		if (typeof schemasOrHandler === "function") {
			if (!isSpecNotificationMethod(method)) throw new TypeError(`'${method}' is not a spec notification method; pass schemas as the second argument to setNotificationHandler().`);
			this._notificationHandlers.set(method, (notification, codec) => {
				const outcome = codec.validateNotification(method, notification);
				if (!outcome.ok) {
					if (outcome.reason === "not-in-era") throw new ProtocolError(ProtocolErrorCode.InternalError, `No wire schema for ${method} in the resolved era`);
					throw new Error(outcome.message);
				}
				return Promise.resolve(schemasOrHandler(outcome.value));
			});
			return;
		}
		if (!maybeHandler) throw new TypeError("setNotificationHandler: handler is required");
		this._notificationHandlers.set(method, async (notification) => {
			const parsed = await validateStandardSchema(schemasOrHandler.params, { ...notification.params });
			if (!parsed.success) throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Invalid params for notification ${method}: ${parsed.error}`);
			await maybeHandler(parsed.data, notification);
		});
	}
	/**
	* Removes the notification handler for the given method.
	*/
	removeNotificationHandler(method) {
		this._notificationHandlers.delete(method);
	}
};
function isPlainObject$1(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
function mergeCapabilities(base, additional) {
	const result = { ...base };
	for (const key in additional) {
		const k = key;
		const addValue = additional[k];
		if (addValue === void 0) continue;
		const baseValue = result[k];
		result[k] = isPlainObject$1(baseValue) && isPlainObject$1(addValue) ? {
			...baseValue,
			...addValue
		} : addValue;
	}
	return result;
}
function isPlainObject(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
/**
* Splits a retried request's `inputResponses` map into the BARE response
* entries the spec defines and everything else. The spec's embedded responses
* are the bare result objects (an `ElicitResult`, `CreateMessageResult`, or
* `ListRootsResult`); a wrapped `{method, result}` envelope (a shape some
* peers emit) is never accepted as a response — its key is recorded so the
* handler can re-issue the corresponding input request.
*/
function partitionInputResponses(inputResponses) {
	const accepted = {};
	const droppedKeys = [];
	if (!isPlainObject(inputResponses)) return {
		accepted,
		droppedKeys
	};
	for (const [key, entry] of Object.entries(inputResponses)) {
		if (!isPlainObject(entry) || "method" in entry || "result" in entry) {
			droppedKeys.push(key);
			continue;
		}
		accepted[key] = entry;
	}
	return {
		accepted,
		droppedKeys
	};
}
/**
* Builds the manual-mode {@linkcode InputRequiredResult} value from the
* codec's decoded payload — what an `allowInputRequired: true` caller
* receives instead of the auto-fulfilled complete result.
*/
function manualInputRequiredValue(decoded) {
	return {
		resultType: "input_required",
		inputRequests: decoded.inputRequests,
		...decoded.requestState !== void 0 && { requestState: decoded.requestState },
		...decoded._meta !== void 0 && { _meta: decoded._meta }
	};
}
/*!
* content-type
* Copyright(c) 2015 Douglas Christopher Wilson
* MIT Licensed
*/
(/* @__PURE__ */ __commonJSMin(((exports) => {
	/**
	* RegExp to match *( ";" parameter ) in RFC 7231 sec 3.1.1.1
	*
	* parameter     = token "=" ( token / quoted-string )
	* token         = 1*tchar
	* tchar         = "!" / "#" / "$" / "%" / "&" / "'" / "*"
	*               / "+" / "-" / "." / "^" / "_" / "`" / "|" / "~"
	*               / DIGIT / ALPHA
	*               ; any VCHAR, except delimiters
	* quoted-string = DQUOTE *( qdtext / quoted-pair ) DQUOTE
	* qdtext        = HTAB / SP / %x21 / %x23-5B / %x5D-7E / obs-text
	* obs-text      = %x80-FF
	* quoted-pair   = "\" ( HTAB / SP / VCHAR / obs-text )
	*/
	var PARAM_REGEXP = /; *([!#$%&'*+.^_`|~0-9A-Za-z-]+) *= *("(?:[\u000b\u0020\u0021\u0023-\u005b\u005d-\u007e\u0080-\u00ff]|\\[\u000b\u0020-\u00ff])*"|[!#$%&'*+.^_`|~0-9A-Za-z-]+) */g;
	/**
	* RegExp to match quoted-pair in RFC 7230 sec 3.2.6
	*
	* quoted-pair = "\" ( HTAB / SP / VCHAR / obs-text )
	* obs-text    = %x80-FF
	*/
	var QESC_REGEXP = /\\([\u000b\u0020-\u00ff])/g;
	/**
	* RegExp to match type in RFC 7231 sec 3.1.1.1
	*
	* media-type = type "/" subtype
	* type       = token
	* subtype    = token
	*/
	var TYPE_REGEXP = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+\/[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
	exports.parse = parse;
	/**
	* Parse media type to object.
	*
	* @param {string|object} string
	* @return {Object}
	* @public
	*/
	function parse(string) {
		if (!string) throw new TypeError("argument string is required");
		var header = typeof string === "object" ? getcontenttype(string) : string;
		if (typeof header !== "string") throw new TypeError("argument string is required to be a string");
		var index = header.indexOf(";");
		var type = index !== -1 ? header.slice(0, index).trim() : header.trim();
		if (!TYPE_REGEXP.test(type)) throw new TypeError("invalid media type");
		var obj = new ContentType(type.toLowerCase());
		if (index !== -1) {
			var key;
			var match;
			var value;
			PARAM_REGEXP.lastIndex = index;
			while (match = PARAM_REGEXP.exec(header)) {
				if (match.index !== index) throw new TypeError("invalid parameter format");
				index += match[0].length;
				key = match[1].toLowerCase();
				value = match[2];
				if (value.charCodeAt(0) === 34) {
					value = value.slice(1, -1);
					if (value.indexOf("\\") !== -1) value = value.replace(QESC_REGEXP, "$1");
				}
				obj.parameters[key] = value;
			}
			if (index !== header.length) throw new TypeError("invalid parameter format");
		}
		return obj;
	}
	/**
	* Get content-type from req/res objects.
	*
	* @param {object}
	* @return {Object}
	* @private
	*/
	function getcontenttype(obj) {
		var header;
		if (typeof obj.getHeader === "function") header = obj.getHeader("content-type");
		else if (typeof obj.headers === "object") header = obj.headers && obj.headers["content-type"];
		if (typeof header !== "string") throw new TypeError("content-type header is missing from object");
		return header;
	}
	/**
	* Class to represent a content type.
	* @private
	*/
	function ContentType(type) {
		this.parameters = Object.create(null);
		this.type = type;
	}
})))();
/**
* Buffers a continuous stdio stream into discrete JSON-RPC messages.
*/
var ReadBuffer = class {
	_buffer;
	_maxBufferSize;
	constructor(options) {
		this._maxBufferSize = options?.maxBufferSize ?? 10485760;
	}
	append(chunk) {
		if ((this._buffer?.length ?? 0) + chunk.length > this._maxBufferSize) {
			this.clear();
			throw new Error(`ReadBuffer exceeded maximum size of ${this._maxBufferSize} bytes`);
		}
		this._buffer = this._buffer ? Buffer.concat([this._buffer, chunk]) : chunk;
	}
	readMessage() {
		while (this._buffer) {
			const index = this._buffer.indexOf("\n");
			if (index === -1) return null;
			const line = this._buffer.toString("utf8", 0, index).replace(/\r$/, "");
			this._buffer = this._buffer.subarray(index + 1);
			try {
				return deserializeMessage(line);
			} catch (error) {
				if (error instanceof SyntaxError) continue;
				throw error;
			}
		}
		return null;
	}
	clear() {
		this._buffer = void 0;
	}
};
function deserializeMessage(line) {
	return JSONRPCMessageSchema.parse(JSON.parse(line));
}
function serializeMessage(message) {
	return JSON.stringify(message) + "\n";
}
/**
* Tool name validation utilities according to SEP: Specify Format for Tool Names
*
* Tool names SHOULD be between 1 and 128 characters in length (inclusive).
* Tool names are case-sensitive.
* Allowed characters: uppercase and lowercase ASCII letters (`A-Z`, `a-z`), digits
* (`0-9`), underscore (`_`), dash (`-`), and dot (`.`).
* Tool names SHOULD NOT contain spaces, commas, or other special characters.
*
* @see {@link https://github.com/modelcontextprotocol/modelcontextprotocol/issues/986 | SEP-986: Specify Format for Tool Names}
*/
/**
* Regular expression for valid tool names according to SEP-986 specification
*/
var TOOL_NAME_REGEX = /^[A-Za-z0-9._-]{1,128}$/;
/**
* Validates a tool name according to the SEP specification
* @param name - The tool name to validate
* @returns An object containing validation result and any warnings
*/
function validateToolName(name) {
	const warnings = [];
	if (name.length === 0) return {
		isValid: false,
		warnings: ["Tool name cannot be empty"]
	};
	if (name.length > 128) return {
		isValid: false,
		warnings: [`Tool name exceeds maximum length of 128 characters (current: ${name.length})`]
	};
	if (name.includes(" ")) warnings.push("Tool name contains spaces, which may cause parsing issues");
	if (name.includes(",")) warnings.push("Tool name contains commas, which may cause parsing issues");
	if (name.startsWith("-") || name.endsWith("-")) warnings.push("Tool name starts or ends with a dash, which may cause parsing issues in some contexts");
	if (name.startsWith(".") || name.endsWith(".")) warnings.push("Tool name starts or ends with a dot, which may cause parsing issues in some contexts");
	if (!TOOL_NAME_REGEX.test(name)) {
		const invalidChars = [...name].filter((char) => !/[A-Za-z0-9._-]/.test(char)).filter((char, index, arr) => arr.indexOf(char) === index);
		warnings.push(`Tool name contains invalid characters: ${invalidChars.map((c) => `"${c}"`).join(", ")}`, "Allowed characters are: A-Z, a-z, 0-9, underscore (_), dash (-), and dot (.)");
		return {
			isValid: false,
			warnings
		};
	}
	return {
		isValid: true,
		warnings
	};
}
/**
* Issues warnings for non-conforming tool names
* @param name - The tool name that triggered the warnings
* @param warnings - Array of warning messages
*/
function issueToolNameWarning(name, warnings) {
	if (warnings.length > 0) {
		console.warn(`Tool name validation warning for "${name}":`);
		for (const warning of warnings) console.warn(`  - ${warning}`);
		console.warn("Tool registration will proceed, but this may cause compatibility issues.");
		console.warn("Consider updating the tool name to conform to the MCP tool naming standard.");
		console.warn("See SEP: Specify Format for Tool Names (https://github.com/modelcontextprotocol/modelcontextprotocol/issues/986) for more details.");
	}
}
/**
* Validates a tool name and issues warnings for non-conforming names
* @param name - The tool name to validate
* @returns `true` if the name is valid, `false` otherwise
*/
function validateAndWarnToolName(name) {
	const result = validateToolName(name);
	issueToolNameWarning(name, result.warnings);
	return result.isValid;
}
/**
* Zod-specific helpers for the v1-compat raw-shape shorthand on
* `registerTool`/`registerPrompt`. Kept separate from `standardSchema.ts` so
* that file stays library-agnostic per the Standard Schema spec.
*/
function isZodV4Schema(v) {
	return typeof v === "object" && v !== null && "_zod" in v;
}
function looksLikeZodV3(v) {
	return typeof v === "object" && v !== null && !("_zod" in v) && "_def" in v && typeof v._def?.typeName === "string";
}
/**
* Detects a "raw shape" — a plain object whose values are Zod field schemas,
* e.g. `{ name: z.string() }`. Powers the auto-wrap in
* {@linkcode normalizeRawShapeSchema}, which wraps with `z.object()`, so only
* Zod values are supported.
*
* @internal
*/
function isZodRawShape(obj) {
	if (typeof obj !== "object" || obj === null) return false;
	if (isStandardSchema(obj)) return false;
	const proto = Object.getPrototypeOf(obj);
	if (proto !== Object.prototype && proto !== null) return false;
	return Object.values(obj).every((v) => isZodV4Schema(v));
}
/**
* Accepts either a {@linkcode StandardSchemaWithJSON} or a raw Zod shape
* `{ field: z.string() }` and returns a {@linkcode StandardSchemaWithJSON}.
* Raw shapes are wrapped with `z.object()` so the rest of the pipeline sees a
* uniform schema type; already-wrapped schemas pass through unchanged.
*
* @internal
*/
function normalizeRawShapeSchema(schema) {
	if (schema === void 0) return void 0;
	if (isZodRawShape(schema)) return object(schema);
	if (typeof schema === "object" && schema !== null && !isStandardSchema(schema) && Object.values(schema).some((v) => looksLikeZodV3(v))) throw new TypeError("Raw-shape inputSchema/outputSchema/argsSchema fields must be Zod v4 schemas. Got a Zod v3 field schema. Import from `zod/v4` (or upgrade your zod import), or wrap with `z.object({...})` yourself.");
	if (!isStandardSchema(schema)) throw new TypeError("inputSchema/outputSchema/argsSchema must be a Standard Schema (e.g. z.object({...})) or a raw Zod shape ({ field: z.string() }).");
	return schema;
}
//#endregion
//#region ../../node_modules/.pnpm/@modelcontextprotocol+server@2.4.0/node_modules/@modelcontextprotocol/server/dist/ajvProvider-DyjnscPj.mjs
var require_code$1 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.regexpCode = exports.getEsmExportName = exports.getProperty = exports.safeStringify = exports.stringify = exports.strConcat = exports.addCodeArg = exports.str = exports._ = exports.nil = exports._Code = exports.Name = exports.IDENTIFIER = exports._CodeOrName = void 0;
	var _CodeOrName = class {};
	exports._CodeOrName = _CodeOrName;
	exports.IDENTIFIER = /^[a-z$_][a-z$_0-9]*$/i;
	var Name = class extends _CodeOrName {
		constructor(s) {
			super();
			if (!exports.IDENTIFIER.test(s)) throw new Error("CodeGen: name must be a valid identifier");
			this.str = s;
		}
		toString() {
			return this.str;
		}
		emptyStr() {
			return false;
		}
		get names() {
			return { [this.str]: 1 };
		}
	};
	exports.Name = Name;
	var _Code = class extends _CodeOrName {
		constructor(code) {
			super();
			this._items = typeof code === "string" ? [code] : code;
		}
		toString() {
			return this.str;
		}
		emptyStr() {
			if (this._items.length > 1) return false;
			const item = this._items[0];
			return item === "" || item === "\"\"";
		}
		get str() {
			var _a;
			return (_a = this._str) !== null && _a !== void 0 ? _a : this._str = this._items.reduce((s, c) => `${s}${c}`, "");
		}
		get names() {
			var _a;
			return (_a = this._names) !== null && _a !== void 0 ? _a : this._names = this._items.reduce((names, c) => {
				if (c instanceof Name) names[c.str] = (names[c.str] || 0) + 1;
				return names;
			}, {});
		}
	};
	exports._Code = _Code;
	exports.nil = new _Code("");
	function _(strs, ...args) {
		const code = [strs[0]];
		let i = 0;
		while (i < args.length) {
			addCodeArg(code, args[i]);
			code.push(strs[++i]);
		}
		return new _Code(code);
	}
	exports._ = _;
	const plus = new _Code("+");
	function str(strs, ...args) {
		const expr = [safeStringify(strs[0])];
		let i = 0;
		while (i < args.length) {
			expr.push(plus);
			addCodeArg(expr, args[i]);
			expr.push(plus, safeStringify(strs[++i]));
		}
		optimize(expr);
		return new _Code(expr);
	}
	exports.str = str;
	function addCodeArg(code, arg) {
		if (arg instanceof _Code) code.push(...arg._items);
		else if (arg instanceof Name) code.push(arg);
		else code.push(interpolate(arg));
	}
	exports.addCodeArg = addCodeArg;
	function optimize(expr) {
		let i = 1;
		while (i < expr.length - 1) {
			if (expr[i] === plus) {
				const res = mergeExprItems(expr[i - 1], expr[i + 1]);
				if (res !== void 0) {
					expr.splice(i - 1, 3, res);
					continue;
				}
				expr[i++] = "+";
			}
			i++;
		}
	}
	function mergeExprItems(a, b) {
		if (b === "\"\"") return a;
		if (a === "\"\"") return b;
		if (typeof a == "string") {
			if (b instanceof Name || a[a.length - 1] !== "\"") return;
			if (typeof b != "string") return `${a.slice(0, -1)}${b}"`;
			if (b[0] === "\"") return a.slice(0, -1) + b.slice(1);
			return;
		}
		if (typeof b == "string" && b[0] === "\"" && !(a instanceof Name)) return `"${a}${b.slice(1)}`;
	}
	function strConcat(c1, c2) {
		return c2.emptyStr() ? c1 : c1.emptyStr() ? c2 : str`${c1}${c2}`;
	}
	exports.strConcat = strConcat;
	function interpolate(x) {
		return typeof x == "number" || typeof x == "boolean" || x === null ? x : safeStringify(Array.isArray(x) ? x.join(",") : x);
	}
	function stringify(x) {
		return new _Code(safeStringify(x));
	}
	exports.stringify = stringify;
	function safeStringify(x) {
		return JSON.stringify(x).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
	}
	exports.safeStringify = safeStringify;
	function getProperty(key) {
		return typeof key == "string" && exports.IDENTIFIER.test(key) ? new _Code(`.${key}`) : _`[${key}]`;
	}
	exports.getProperty = getProperty;
	function getEsmExportName(key) {
		if (typeof key == "string" && exports.IDENTIFIER.test(key)) return new _Code(`${key}`);
		throw new Error(`CodeGen: invalid export name: ${key}, use explicit $id name mapping`);
	}
	exports.getEsmExportName = getEsmExportName;
	function regexpCode(rx) {
		return new _Code(rx.toString());
	}
	exports.regexpCode = regexpCode;
}));
var require_scope = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.ValueScope = exports.ValueScopeName = exports.Scope = exports.varKinds = exports.UsedValueState = void 0;
	const code_1 = require_code$1();
	var ValueError = class extends Error {
		constructor(name) {
			super(`CodeGen: "code" for ${name} not defined`);
			this.value = name.value;
		}
	};
	var UsedValueState;
	(function(UsedValueState) {
		UsedValueState[UsedValueState["Started"] = 0] = "Started";
		UsedValueState[UsedValueState["Completed"] = 1] = "Completed";
	})(UsedValueState || (exports.UsedValueState = UsedValueState = {}));
	exports.varKinds = {
		const: new code_1.Name("const"),
		let: new code_1.Name("let"),
		var: new code_1.Name("var")
	};
	var Scope = class {
		constructor({ prefixes, parent } = {}) {
			this._names = {};
			this._prefixes = prefixes;
			this._parent = parent;
		}
		toName(nameOrPrefix) {
			return nameOrPrefix instanceof code_1.Name ? nameOrPrefix : this.name(nameOrPrefix);
		}
		name(prefix) {
			return new code_1.Name(this._newName(prefix));
		}
		_newName(prefix) {
			const ng = this._names[prefix] || this._nameGroup(prefix);
			return `${prefix}${ng.index++}`;
		}
		_nameGroup(prefix) {
			var _a, _b;
			if (((_b = (_a = this._parent) === null || _a === void 0 ? void 0 : _a._prefixes) === null || _b === void 0 ? void 0 : _b.has(prefix)) || this._prefixes && !this._prefixes.has(prefix)) throw new Error(`CodeGen: prefix "${prefix}" is not allowed in this scope`);
			return this._names[prefix] = {
				prefix,
				index: 0
			};
		}
	};
	exports.Scope = Scope;
	var ValueScopeName = class extends code_1.Name {
		constructor(prefix, nameStr) {
			super(nameStr);
			this.prefix = prefix;
		}
		setValue(value, { property, itemIndex }) {
			this.value = value;
			this.scopePath = (0, code_1._)`.${new code_1.Name(property)}[${itemIndex}]`;
		}
	};
	exports.ValueScopeName = ValueScopeName;
	const line = (0, code_1._)`\n`;
	var ValueScope = class extends Scope {
		constructor(opts) {
			super(opts);
			this._values = {};
			this._scope = opts.scope;
			this.opts = {
				...opts,
				_n: opts.lines ? line : code_1.nil
			};
		}
		get() {
			return this._scope;
		}
		name(prefix) {
			return new ValueScopeName(prefix, this._newName(prefix));
		}
		value(nameOrPrefix, value) {
			var _a;
			if (value.ref === void 0) throw new Error("CodeGen: ref must be passed in value");
			const name = this.toName(nameOrPrefix);
			const { prefix } = name;
			const valueKey = (_a = value.key) !== null && _a !== void 0 ? _a : value.ref;
			let vs = this._values[prefix];
			if (vs) {
				const _name = vs.get(valueKey);
				if (_name) return _name;
			} else vs = this._values[prefix] = /* @__PURE__ */ new Map();
			vs.set(valueKey, name);
			const s = this._scope[prefix] || (this._scope[prefix] = []);
			const itemIndex = s.length;
			s[itemIndex] = value.ref;
			name.setValue(value, {
				property: prefix,
				itemIndex
			});
			return name;
		}
		getValue(prefix, keyOrRef) {
			const vs = this._values[prefix];
			if (!vs) return;
			return vs.get(keyOrRef);
		}
		scopeRefs(scopeName, values = this._values) {
			return this._reduceValues(values, (name) => {
				if (name.scopePath === void 0) throw new Error(`CodeGen: name "${name}" has no value`);
				return (0, code_1._)`${scopeName}${name.scopePath}`;
			});
		}
		scopeCode(values = this._values, usedValues, getCode) {
			return this._reduceValues(values, (name) => {
				if (name.value === void 0) throw new Error(`CodeGen: name "${name}" has no value`);
				return name.value.code;
			}, usedValues, getCode);
		}
		_reduceValues(values, valueCode, usedValues = {}, getCode) {
			let code = code_1.nil;
			for (const prefix in values) {
				const vs = values[prefix];
				if (!vs) continue;
				const nameSet = usedValues[prefix] = usedValues[prefix] || /* @__PURE__ */ new Map();
				vs.forEach((name) => {
					if (nameSet.has(name)) return;
					nameSet.set(name, UsedValueState.Started);
					let c = valueCode(name);
					if (c) {
						const def = this.opts.es5 ? exports.varKinds.var : exports.varKinds.const;
						code = (0, code_1._)`${code}${def} ${name} = ${c};${this.opts._n}`;
					} else if (c = getCode === null || getCode === void 0 ? void 0 : getCode(name)) code = (0, code_1._)`${code}${c}${this.opts._n}`;
					else throw new ValueError(name);
					nameSet.set(name, UsedValueState.Completed);
				});
			}
			return code;
		}
	};
	exports.ValueScope = ValueScope;
}));
var require_codegen = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.or = exports.and = exports.not = exports.CodeGen = exports.operators = exports.varKinds = exports.ValueScopeName = exports.ValueScope = exports.Scope = exports.Name = exports.regexpCode = exports.stringify = exports.getProperty = exports.nil = exports.strConcat = exports.str = exports._ = void 0;
	const code_1 = require_code$1();
	const scope_1 = require_scope();
	var code_2 = require_code$1();
	Object.defineProperty(exports, "_", {
		enumerable: true,
		get: function() {
			return code_2._;
		}
	});
	Object.defineProperty(exports, "str", {
		enumerable: true,
		get: function() {
			return code_2.str;
		}
	});
	Object.defineProperty(exports, "strConcat", {
		enumerable: true,
		get: function() {
			return code_2.strConcat;
		}
	});
	Object.defineProperty(exports, "nil", {
		enumerable: true,
		get: function() {
			return code_2.nil;
		}
	});
	Object.defineProperty(exports, "getProperty", {
		enumerable: true,
		get: function() {
			return code_2.getProperty;
		}
	});
	Object.defineProperty(exports, "stringify", {
		enumerable: true,
		get: function() {
			return code_2.stringify;
		}
	});
	Object.defineProperty(exports, "regexpCode", {
		enumerable: true,
		get: function() {
			return code_2.regexpCode;
		}
	});
	Object.defineProperty(exports, "Name", {
		enumerable: true,
		get: function() {
			return code_2.Name;
		}
	});
	var scope_2 = require_scope();
	Object.defineProperty(exports, "Scope", {
		enumerable: true,
		get: function() {
			return scope_2.Scope;
		}
	});
	Object.defineProperty(exports, "ValueScope", {
		enumerable: true,
		get: function() {
			return scope_2.ValueScope;
		}
	});
	Object.defineProperty(exports, "ValueScopeName", {
		enumerable: true,
		get: function() {
			return scope_2.ValueScopeName;
		}
	});
	Object.defineProperty(exports, "varKinds", {
		enumerable: true,
		get: function() {
			return scope_2.varKinds;
		}
	});
	exports.operators = {
		GT: new code_1._Code(">"),
		GTE: new code_1._Code(">="),
		LT: new code_1._Code("<"),
		LTE: new code_1._Code("<="),
		EQ: new code_1._Code("==="),
		NEQ: new code_1._Code("!=="),
		NOT: new code_1._Code("!"),
		OR: new code_1._Code("||"),
		AND: new code_1._Code("&&"),
		ADD: new code_1._Code("+")
	};
	var Node = class {
		optimizeNodes() {
			return this;
		}
		optimizeNames(_names, _constants) {
			return this;
		}
	};
	var Def = class extends Node {
		constructor(varKind, name, rhs) {
			super();
			this.varKind = varKind;
			this.name = name;
			this.rhs = rhs;
		}
		render({ es5, _n }) {
			const varKind = es5 ? scope_1.varKinds.var : this.varKind;
			const rhs = this.rhs === void 0 ? "" : ` = ${this.rhs}`;
			return `${varKind} ${this.name}${rhs};` + _n;
		}
		optimizeNames(names, constants) {
			if (!names[this.name.str]) return;
			if (this.rhs) this.rhs = optimizeExpr(this.rhs, names, constants);
			return this;
		}
		get names() {
			return this.rhs instanceof code_1._CodeOrName ? this.rhs.names : {};
		}
	};
	var Assign = class extends Node {
		constructor(lhs, rhs, sideEffects) {
			super();
			this.lhs = lhs;
			this.rhs = rhs;
			this.sideEffects = sideEffects;
		}
		render({ _n }) {
			return `${this.lhs} = ${this.rhs};` + _n;
		}
		optimizeNames(names, constants) {
			if (this.lhs instanceof code_1.Name && !names[this.lhs.str] && !this.sideEffects) return;
			this.rhs = optimizeExpr(this.rhs, names, constants);
			return this;
		}
		get names() {
			return addExprNames(this.lhs instanceof code_1.Name ? {} : { ...this.lhs.names }, this.rhs);
		}
	};
	var AssignOp = class extends Assign {
		constructor(lhs, op, rhs, sideEffects) {
			super(lhs, rhs, sideEffects);
			this.op = op;
		}
		render({ _n }) {
			return `${this.lhs} ${this.op}= ${this.rhs};` + _n;
		}
	};
	var Label = class extends Node {
		constructor(label) {
			super();
			this.label = label;
			this.names = {};
		}
		render({ _n }) {
			return `${this.label}:` + _n;
		}
	};
	var Break = class extends Node {
		constructor(label) {
			super();
			this.label = label;
			this.names = {};
		}
		render({ _n }) {
			return `break${this.label ? ` ${this.label}` : ""};` + _n;
		}
	};
	var Throw = class extends Node {
		constructor(error) {
			super();
			this.error = error;
		}
		render({ _n }) {
			return `throw ${this.error};` + _n;
		}
		get names() {
			return this.error.names;
		}
	};
	var AnyCode = class extends Node {
		constructor(code) {
			super();
			this.code = code;
		}
		render({ _n }) {
			return `${this.code};` + _n;
		}
		optimizeNodes() {
			return `${this.code}` ? this : void 0;
		}
		optimizeNames(names, constants) {
			this.code = optimizeExpr(this.code, names, constants);
			return this;
		}
		get names() {
			return this.code instanceof code_1._CodeOrName ? this.code.names : {};
		}
	};
	var ParentNode = class extends Node {
		constructor(nodes = []) {
			super();
			this.nodes = nodes;
		}
		render(opts) {
			return this.nodes.reduce((code, n) => code + n.render(opts), "");
		}
		optimizeNodes() {
			const { nodes } = this;
			let i = nodes.length;
			while (i--) {
				const n = nodes[i].optimizeNodes();
				if (Array.isArray(n)) nodes.splice(i, 1, ...n);
				else if (n) nodes[i] = n;
				else nodes.splice(i, 1);
			}
			return nodes.length > 0 ? this : void 0;
		}
		optimizeNames(names, constants) {
			const { nodes } = this;
			let i = nodes.length;
			while (i--) {
				const n = nodes[i];
				if (n.optimizeNames(names, constants)) continue;
				subtractNames(names, n.names);
				nodes.splice(i, 1);
			}
			return nodes.length > 0 ? this : void 0;
		}
		get names() {
			return this.nodes.reduce((names, n) => addNames(names, n.names), {});
		}
	};
	var BlockNode = class extends ParentNode {
		render(opts) {
			return "{" + opts._n + super.render(opts) + "}" + opts._n;
		}
	};
	var Root = class extends ParentNode {};
	var Else = class extends BlockNode {};
	Else.kind = "else";
	var If = class If extends BlockNode {
		constructor(condition, nodes) {
			super(nodes);
			this.condition = condition;
		}
		render(opts) {
			let code = `if(${this.condition})` + super.render(opts);
			if (this.else) code += "else " + this.else.render(opts);
			return code;
		}
		optimizeNodes() {
			super.optimizeNodes();
			const cond = this.condition;
			if (cond === true) return this.nodes;
			let e = this.else;
			if (e) {
				const ns = e.optimizeNodes();
				e = this.else = Array.isArray(ns) ? new Else(ns) : ns;
			}
			if (e) {
				if (cond === false) return e instanceof If ? e : e.nodes;
				if (this.nodes.length) return this;
				return new If(not(cond), e instanceof If ? [e] : e.nodes);
			}
			if (cond === false || !this.nodes.length) return void 0;
			return this;
		}
		optimizeNames(names, constants) {
			var _a;
			this.else = (_a = this.else) === null || _a === void 0 ? void 0 : _a.optimizeNames(names, constants);
			if (!(super.optimizeNames(names, constants) || this.else)) return;
			this.condition = optimizeExpr(this.condition, names, constants);
			return this;
		}
		get names() {
			const names = super.names;
			addExprNames(names, this.condition);
			if (this.else) addNames(names, this.else.names);
			return names;
		}
	};
	If.kind = "if";
	var For = class extends BlockNode {};
	For.kind = "for";
	var ForLoop = class extends For {
		constructor(iteration) {
			super();
			this.iteration = iteration;
		}
		render(opts) {
			return `for(${this.iteration})` + super.render(opts);
		}
		optimizeNames(names, constants) {
			if (!super.optimizeNames(names, constants)) return;
			this.iteration = optimizeExpr(this.iteration, names, constants);
			return this;
		}
		get names() {
			return addNames(super.names, this.iteration.names);
		}
	};
	var ForRange = class extends For {
		constructor(varKind, name, from, to) {
			super();
			this.varKind = varKind;
			this.name = name;
			this.from = from;
			this.to = to;
		}
		render(opts) {
			const varKind = opts.es5 ? scope_1.varKinds.var : this.varKind;
			const { name, from, to } = this;
			return `for(${varKind} ${name}=${from}; ${name}<${to}; ${name}++)` + super.render(opts);
		}
		get names() {
			return addExprNames(addExprNames(super.names, this.from), this.to);
		}
	};
	var ForIter = class extends For {
		constructor(loop, varKind, name, iterable) {
			super();
			this.loop = loop;
			this.varKind = varKind;
			this.name = name;
			this.iterable = iterable;
		}
		render(opts) {
			return `for(${this.varKind} ${this.name} ${this.loop} ${this.iterable})` + super.render(opts);
		}
		optimizeNames(names, constants) {
			if (!super.optimizeNames(names, constants)) return;
			this.iterable = optimizeExpr(this.iterable, names, constants);
			return this;
		}
		get names() {
			return addNames(super.names, this.iterable.names);
		}
	};
	var Func = class extends BlockNode {
		constructor(name, args, async) {
			super();
			this.name = name;
			this.args = args;
			this.async = async;
		}
		render(opts) {
			return `${this.async ? "async " : ""}function ${this.name}(${this.args})` + super.render(opts);
		}
	};
	Func.kind = "func";
	var Return = class extends ParentNode {
		render(opts) {
			return "return " + super.render(opts);
		}
	};
	Return.kind = "return";
	var Try = class extends BlockNode {
		render(opts) {
			let code = "try" + super.render(opts);
			if (this.catch) code += this.catch.render(opts);
			if (this.finally) code += this.finally.render(opts);
			return code;
		}
		optimizeNodes() {
			var _a, _b;
			super.optimizeNodes();
			(_a = this.catch) === null || _a === void 0 || _a.optimizeNodes();
			(_b = this.finally) === null || _b === void 0 || _b.optimizeNodes();
			return this;
		}
		optimizeNames(names, constants) {
			var _a, _b;
			super.optimizeNames(names, constants);
			(_a = this.catch) === null || _a === void 0 || _a.optimizeNames(names, constants);
			(_b = this.finally) === null || _b === void 0 || _b.optimizeNames(names, constants);
			return this;
		}
		get names() {
			const names = super.names;
			if (this.catch) addNames(names, this.catch.names);
			if (this.finally) addNames(names, this.finally.names);
			return names;
		}
	};
	var Catch = class extends BlockNode {
		constructor(error) {
			super();
			this.error = error;
		}
		render(opts) {
			return `catch(${this.error})` + super.render(opts);
		}
	};
	Catch.kind = "catch";
	var Finally = class extends BlockNode {
		render(opts) {
			return "finally" + super.render(opts);
		}
	};
	Finally.kind = "finally";
	var CodeGen = class {
		constructor(extScope, opts = {}) {
			this._values = {};
			this._blockStarts = [];
			this._constants = {};
			this.opts = {
				...opts,
				_n: opts.lines ? "\n" : ""
			};
			this._extScope = extScope;
			this._scope = new scope_1.Scope({ parent: extScope });
			this._nodes = [new Root()];
		}
		toString() {
			return this._root.render(this.opts);
		}
		name(prefix) {
			return this._scope.name(prefix);
		}
		scopeName(prefix) {
			return this._extScope.name(prefix);
		}
		scopeValue(prefixOrName, value) {
			const name = this._extScope.value(prefixOrName, value);
			(this._values[name.prefix] || (this._values[name.prefix] = /* @__PURE__ */ new Set())).add(name);
			return name;
		}
		getScopeValue(prefix, keyOrRef) {
			return this._extScope.getValue(prefix, keyOrRef);
		}
		scopeRefs(scopeName) {
			return this._extScope.scopeRefs(scopeName, this._values);
		}
		scopeCode() {
			return this._extScope.scopeCode(this._values);
		}
		_def(varKind, nameOrPrefix, rhs, constant) {
			const name = this._scope.toName(nameOrPrefix);
			if (rhs !== void 0 && constant) this._constants[name.str] = rhs;
			this._leafNode(new Def(varKind, name, rhs));
			return name;
		}
		const(nameOrPrefix, rhs, _constant) {
			return this._def(scope_1.varKinds.const, nameOrPrefix, rhs, _constant);
		}
		let(nameOrPrefix, rhs, _constant) {
			return this._def(scope_1.varKinds.let, nameOrPrefix, rhs, _constant);
		}
		var(nameOrPrefix, rhs, _constant) {
			return this._def(scope_1.varKinds.var, nameOrPrefix, rhs, _constant);
		}
		assign(lhs, rhs, sideEffects) {
			return this._leafNode(new Assign(lhs, rhs, sideEffects));
		}
		add(lhs, rhs) {
			return this._leafNode(new AssignOp(lhs, exports.operators.ADD, rhs));
		}
		code(c) {
			if (typeof c == "function") c();
			else if (c !== code_1.nil) this._leafNode(new AnyCode(c));
			return this;
		}
		object(...keyValues) {
			const code = ["{"];
			for (const [key, value] of keyValues) {
				if (code.length > 1) code.push(",");
				code.push(key);
				if (key !== value || this.opts.es5) {
					code.push(":");
					(0, code_1.addCodeArg)(code, value);
				}
			}
			code.push("}");
			return new code_1._Code(code);
		}
		if(condition, thenBody, elseBody) {
			this._blockNode(new If(condition));
			if (thenBody && elseBody) this.code(thenBody).else().code(elseBody).endIf();
			else if (thenBody) this.code(thenBody).endIf();
			else if (elseBody) throw new Error("CodeGen: \"else\" body without \"then\" body");
			return this;
		}
		elseIf(condition) {
			return this._elseNode(new If(condition));
		}
		else() {
			return this._elseNode(new Else());
		}
		endIf() {
			return this._endBlockNode(If, Else);
		}
		_for(node, forBody) {
			this._blockNode(node);
			if (forBody) this.code(forBody).endFor();
			return this;
		}
		for(iteration, forBody) {
			return this._for(new ForLoop(iteration), forBody);
		}
		forRange(nameOrPrefix, from, to, forBody, varKind = this.opts.es5 ? scope_1.varKinds.var : scope_1.varKinds.let) {
			const name = this._scope.toName(nameOrPrefix);
			return this._for(new ForRange(varKind, name, from, to), () => forBody(name));
		}
		forOf(nameOrPrefix, iterable, forBody, varKind = scope_1.varKinds.const) {
			const name = this._scope.toName(nameOrPrefix);
			if (this.opts.es5) {
				const arr = iterable instanceof code_1.Name ? iterable : this.var("_arr", iterable);
				return this.forRange("_i", 0, (0, code_1._)`${arr}.length`, (i) => {
					this.var(name, (0, code_1._)`${arr}[${i}]`);
					forBody(name);
				});
			}
			return this._for(new ForIter("of", varKind, name, iterable), () => forBody(name));
		}
		forIn(nameOrPrefix, obj, forBody, varKind = this.opts.es5 ? scope_1.varKinds.var : scope_1.varKinds.const) {
			if (this.opts.ownProperties) return this.forOf(nameOrPrefix, (0, code_1._)`Object.keys(${obj})`, forBody);
			const name = this._scope.toName(nameOrPrefix);
			return this._for(new ForIter("in", varKind, name, obj), () => forBody(name));
		}
		endFor() {
			return this._endBlockNode(For);
		}
		label(label) {
			return this._leafNode(new Label(label));
		}
		break(label) {
			return this._leafNode(new Break(label));
		}
		return(value) {
			const node = new Return();
			this._blockNode(node);
			this.code(value);
			if (node.nodes.length !== 1) throw new Error("CodeGen: \"return\" should have one node");
			return this._endBlockNode(Return);
		}
		try(tryBody, catchCode, finallyCode) {
			if (!catchCode && !finallyCode) throw new Error("CodeGen: \"try\" without \"catch\" and \"finally\"");
			const node = new Try();
			this._blockNode(node);
			this.code(tryBody);
			if (catchCode) {
				const error = this.name("e");
				this._currNode = node.catch = new Catch(error);
				catchCode(error);
			}
			if (finallyCode) {
				this._currNode = node.finally = new Finally();
				this.code(finallyCode);
			}
			return this._endBlockNode(Catch, Finally);
		}
		throw(error) {
			return this._leafNode(new Throw(error));
		}
		block(body, nodeCount) {
			this._blockStarts.push(this._nodes.length);
			if (body) this.code(body).endBlock(nodeCount);
			return this;
		}
		endBlock(nodeCount) {
			const len = this._blockStarts.pop();
			if (len === void 0) throw new Error("CodeGen: not in self-balancing block");
			const toClose = this._nodes.length - len;
			if (toClose < 0 || nodeCount !== void 0 && toClose !== nodeCount) throw new Error(`CodeGen: wrong number of nodes: ${toClose} vs ${nodeCount} expected`);
			this._nodes.length = len;
			return this;
		}
		func(name, args = code_1.nil, async, funcBody) {
			this._blockNode(new Func(name, args, async));
			if (funcBody) this.code(funcBody).endFunc();
			return this;
		}
		endFunc() {
			return this._endBlockNode(Func);
		}
		optimize(n = 1) {
			while (n-- > 0) {
				this._root.optimizeNodes();
				this._root.optimizeNames(this._root.names, this._constants);
			}
		}
		_leafNode(node) {
			this._currNode.nodes.push(node);
			return this;
		}
		_blockNode(node) {
			this._currNode.nodes.push(node);
			this._nodes.push(node);
		}
		_endBlockNode(N1, N2) {
			const n = this._currNode;
			if (n instanceof N1 || N2 && n instanceof N2) {
				this._nodes.pop();
				return this;
			}
			throw new Error(`CodeGen: not in block "${N2 ? `${N1.kind}/${N2.kind}` : N1.kind}"`);
		}
		_elseNode(node) {
			const n = this._currNode;
			if (!(n instanceof If)) throw new Error("CodeGen: \"else\" without \"if\"");
			this._currNode = n.else = node;
			return this;
		}
		get _root() {
			return this._nodes[0];
		}
		get _currNode() {
			const ns = this._nodes;
			return ns[ns.length - 1];
		}
		set _currNode(node) {
			const ns = this._nodes;
			ns[ns.length - 1] = node;
		}
	};
	exports.CodeGen = CodeGen;
	function addNames(names, from) {
		for (const n in from) names[n] = (names[n] || 0) + (from[n] || 0);
		return names;
	}
	function addExprNames(names, from) {
		return from instanceof code_1._CodeOrName ? addNames(names, from.names) : names;
	}
	function optimizeExpr(expr, names, constants) {
		if (expr instanceof code_1.Name) return replaceName(expr);
		if (!canOptimize(expr)) return expr;
		return new code_1._Code(expr._items.reduce((items, c) => {
			if (c instanceof code_1.Name) c = replaceName(c);
			if (c instanceof code_1._Code) items.push(...c._items);
			else items.push(c);
			return items;
		}, []));
		function replaceName(n) {
			const c = constants[n.str];
			if (c === void 0 || names[n.str] !== 1) return n;
			delete names[n.str];
			return c;
		}
		function canOptimize(e) {
			return e instanceof code_1._Code && e._items.some((c) => c instanceof code_1.Name && names[c.str] === 1 && constants[c.str] !== void 0);
		}
	}
	function subtractNames(names, from) {
		for (const n in from) names[n] = (names[n] || 0) - (from[n] || 0);
	}
	function not(x) {
		return typeof x == "boolean" || typeof x == "number" || x === null ? !x : (0, code_1._)`!${par(x)}`;
	}
	exports.not = not;
	const andCode = mappend(exports.operators.AND);
	function and(...args) {
		return args.reduce(andCode);
	}
	exports.and = and;
	const orCode = mappend(exports.operators.OR);
	function or(...args) {
		return args.reduce(orCode);
	}
	exports.or = or;
	function mappend(op) {
		return (x, y) => x === code_1.nil ? y : y === code_1.nil ? x : (0, code_1._)`${par(x)} ${op} ${par(y)}`;
	}
	function par(x) {
		return x instanceof code_1.Name ? x : (0, code_1._)`(${x})`;
	}
}));
var require_util = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.checkStrictMode = exports.getErrorPath = exports.Type = exports.useFunc = exports.setEvaluated = exports.evaluatedPropsToName = exports.mergeEvaluated = exports.eachItem = exports.unescapeJsonPointer = exports.escapeJsonPointer = exports.escapeFragment = exports.unescapeFragment = exports.schemaRefOrVal = exports.schemaHasRulesButRef = exports.schemaHasRules = exports.checkUnknownRules = exports.alwaysValidSchema = exports.toHash = void 0;
	const codegen_1 = require_codegen();
	const code_1 = require_code$1();
	function toHash(arr) {
		const hash = {};
		for (const item of arr) hash[item] = true;
		return hash;
	}
	exports.toHash = toHash;
	function alwaysValidSchema(it, schema) {
		if (typeof schema == "boolean") return schema;
		if (Object.keys(schema).length === 0) return true;
		checkUnknownRules(it, schema);
		return !schemaHasRules(schema, it.self.RULES.all);
	}
	exports.alwaysValidSchema = alwaysValidSchema;
	function checkUnknownRules(it, schema = it.schema) {
		const { opts, self } = it;
		if (!opts.strictSchema) return;
		if (typeof schema === "boolean") return;
		const rules = self.RULES.keywords;
		for (const key in schema) if (!rules[key]) checkStrictMode(it, `unknown keyword: "${key}"`);
	}
	exports.checkUnknownRules = checkUnknownRules;
	function schemaHasRules(schema, rules) {
		if (typeof schema == "boolean") return !schema;
		for (const key in schema) if (rules[key]) return true;
		return false;
	}
	exports.schemaHasRules = schemaHasRules;
	function schemaHasRulesButRef(schema, RULES) {
		if (typeof schema == "boolean") return !schema;
		for (const key in schema) if (key !== "$ref" && RULES.all[key]) return true;
		return false;
	}
	exports.schemaHasRulesButRef = schemaHasRulesButRef;
	function schemaRefOrVal({ topSchemaRef, schemaPath }, schema, keyword, $data) {
		if (!$data) {
			if (typeof schema == "number" || typeof schema == "boolean") return schema;
			if (typeof schema == "string") return (0, codegen_1._)`${schema}`;
		}
		return (0, codegen_1._)`${topSchemaRef}${schemaPath}${(0, codegen_1.getProperty)(keyword)}`;
	}
	exports.schemaRefOrVal = schemaRefOrVal;
	function unescapeFragment(str) {
		return unescapeJsonPointer(decodeURIComponent(str));
	}
	exports.unescapeFragment = unescapeFragment;
	function escapeFragment(str) {
		return encodeURIComponent(escapeJsonPointer(str));
	}
	exports.escapeFragment = escapeFragment;
	function escapeJsonPointer(str) {
		if (typeof str == "number") return `${str}`;
		return str.replace(/~/g, "~0").replace(/\//g, "~1");
	}
	exports.escapeJsonPointer = escapeJsonPointer;
	function unescapeJsonPointer(str) {
		return str.replace(/~1/g, "/").replace(/~0/g, "~");
	}
	exports.unescapeJsonPointer = unescapeJsonPointer;
	function eachItem(xs, f) {
		if (Array.isArray(xs)) for (const x of xs) f(x);
		else f(xs);
	}
	exports.eachItem = eachItem;
	function makeMergeEvaluated({ mergeNames, mergeToName, mergeValues, resultToName }) {
		return (gen, from, to, toName) => {
			const res = to === void 0 ? from : to instanceof codegen_1.Name ? (from instanceof codegen_1.Name ? mergeNames(gen, from, to) : mergeToName(gen, from, to), to) : from instanceof codegen_1.Name ? (mergeToName(gen, to, from), from) : mergeValues(from, to);
			return toName === codegen_1.Name && !(res instanceof codegen_1.Name) ? resultToName(gen, res) : res;
		};
	}
	exports.mergeEvaluated = {
		props: makeMergeEvaluated({
			mergeNames: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true && ${from} !== undefined`, () => {
				gen.if((0, codegen_1._)`${from} === true`, () => gen.assign(to, true), () => gen.assign(to, (0, codegen_1._)`${to} || {}`).code((0, codegen_1._)`Object.assign(${to}, ${from})`));
			}),
			mergeToName: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true`, () => {
				if (from === true) gen.assign(to, true);
				else {
					gen.assign(to, (0, codegen_1._)`${to} || {}`);
					setEvaluated(gen, to, from);
				}
			}),
			mergeValues: (from, to) => from === true ? true : {
				...from,
				...to
			},
			resultToName: evaluatedPropsToName
		}),
		items: makeMergeEvaluated({
			mergeNames: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true && ${from} !== undefined`, () => gen.assign(to, (0, codegen_1._)`${from} === true ? true : ${to} > ${from} ? ${to} : ${from}`)),
			mergeToName: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true`, () => gen.assign(to, from === true ? true : (0, codegen_1._)`${to} > ${from} ? ${to} : ${from}`)),
			mergeValues: (from, to) => from === true ? true : Math.max(from, to),
			resultToName: (gen, items) => gen.var("items", items)
		})
	};
	function evaluatedPropsToName(gen, ps) {
		if (ps === true) return gen.var("props", true);
		const props = gen.var("props", (0, codegen_1._)`{}`);
		if (ps !== void 0) setEvaluated(gen, props, ps);
		return props;
	}
	exports.evaluatedPropsToName = evaluatedPropsToName;
	function setEvaluated(gen, props, ps) {
		Object.keys(ps).forEach((p) => gen.assign((0, codegen_1._)`${props}${(0, codegen_1.getProperty)(p)}`, true));
	}
	exports.setEvaluated = setEvaluated;
	const snippets = {};
	function useFunc(gen, f) {
		return gen.scopeValue("func", {
			ref: f,
			code: snippets[f.code] || (snippets[f.code] = new code_1._Code(f.code))
		});
	}
	exports.useFunc = useFunc;
	var Type;
	(function(Type) {
		Type[Type["Num"] = 0] = "Num";
		Type[Type["Str"] = 1] = "Str";
	})(Type || (exports.Type = Type = {}));
	function getErrorPath(dataProp, dataPropType, jsPropertySyntax) {
		if (dataProp instanceof codegen_1.Name) {
			const isNumber = dataPropType === Type.Num;
			return jsPropertySyntax ? isNumber ? (0, codegen_1._)`"[" + ${dataProp} + "]"` : (0, codegen_1._)`"['" + ${dataProp} + "']"` : isNumber ? (0, codegen_1._)`"/" + ${dataProp}` : (0, codegen_1._)`"/" + ${dataProp}.replace(/~/g, "~0").replace(/\\//g, "~1")`;
		}
		return jsPropertySyntax ? (0, codegen_1.getProperty)(dataProp).toString() : "/" + escapeJsonPointer(dataProp);
	}
	exports.getErrorPath = getErrorPath;
	function checkStrictMode(it, msg, mode = it.opts.strictSchema) {
		if (!mode) return;
		msg = `strict mode: ${msg}`;
		if (mode === true) throw new Error(msg);
		it.self.logger.warn(msg);
	}
	exports.checkStrictMode = checkStrictMode;
}));
var require_names = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	const codegen_1 = require_codegen();
	exports.default = {
		data: new codegen_1.Name("data"),
		valCxt: new codegen_1.Name("valCxt"),
		instancePath: new codegen_1.Name("instancePath"),
		parentData: new codegen_1.Name("parentData"),
		parentDataProperty: new codegen_1.Name("parentDataProperty"),
		rootData: new codegen_1.Name("rootData"),
		dynamicAnchors: new codegen_1.Name("dynamicAnchors"),
		vErrors: new codegen_1.Name("vErrors"),
		errors: new codegen_1.Name("errors"),
		this: new codegen_1.Name("this"),
		self: new codegen_1.Name("self"),
		scope: new codegen_1.Name("scope"),
		json: new codegen_1.Name("json"),
		jsonPos: new codegen_1.Name("jsonPos"),
		jsonLen: new codegen_1.Name("jsonLen"),
		jsonPart: new codegen_1.Name("jsonPart")
	};
}));
var require_errors = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.extendErrors = exports.resetErrorsCount = exports.reportExtraError = exports.reportError = exports.keyword$DataError = exports.keywordError = void 0;
	const codegen_1 = require_codegen();
	const util_1 = require_util();
	const names_1 = require_names();
	exports.keywordError = { message: ({ keyword }) => (0, codegen_1.str)`must pass "${keyword}" keyword validation` };
	exports.keyword$DataError = { message: ({ keyword, schemaType }) => schemaType ? (0, codegen_1.str)`"${keyword}" keyword must be ${schemaType} ($data)` : (0, codegen_1.str)`"${keyword}" keyword is invalid ($data)` };
	function reportError(cxt, error = exports.keywordError, errorPaths, overrideAllErrors) {
		const { it } = cxt;
		const { gen, compositeRule, allErrors } = it;
		const errObj = errorObjectCode(cxt, error, errorPaths);
		if (overrideAllErrors !== null && overrideAllErrors !== void 0 ? overrideAllErrors : compositeRule || allErrors) addError(gen, errObj);
		else returnErrors(it, (0, codegen_1._)`[${errObj}]`);
	}
	exports.reportError = reportError;
	function reportExtraError(cxt, error = exports.keywordError, errorPaths) {
		const { it } = cxt;
		const { gen, compositeRule, allErrors } = it;
		addError(gen, errorObjectCode(cxt, error, errorPaths));
		if (!(compositeRule || allErrors)) returnErrors(it, names_1.default.vErrors);
	}
	exports.reportExtraError = reportExtraError;
	function resetErrorsCount(gen, errsCount) {
		gen.assign(names_1.default.errors, errsCount);
		gen.if((0, codegen_1._)`${names_1.default.vErrors} !== null`, () => gen.if(errsCount, () => gen.assign((0, codegen_1._)`${names_1.default.vErrors}.length`, errsCount), () => gen.assign(names_1.default.vErrors, null)));
	}
	exports.resetErrorsCount = resetErrorsCount;
	function extendErrors({ gen, keyword, schemaValue, data, errsCount, it }) {
		/* istanbul ignore if */
		if (errsCount === void 0) throw new Error("ajv implementation error");
		const err = gen.name("err");
		gen.forRange("i", errsCount, names_1.default.errors, (i) => {
			gen.const(err, (0, codegen_1._)`${names_1.default.vErrors}[${i}]`);
			gen.if((0, codegen_1._)`${err}.instancePath === undefined`, () => gen.assign((0, codegen_1._)`${err}.instancePath`, (0, codegen_1.strConcat)(names_1.default.instancePath, it.errorPath)));
			gen.assign((0, codegen_1._)`${err}.schemaPath`, (0, codegen_1.str)`${it.errSchemaPath}/${keyword}`);
			if (it.opts.verbose) {
				gen.assign((0, codegen_1._)`${err}.schema`, schemaValue);
				gen.assign((0, codegen_1._)`${err}.data`, data);
			}
		});
	}
	exports.extendErrors = extendErrors;
	function addError(gen, errObj) {
		const err = gen.const("err", errObj);
		gen.if((0, codegen_1._)`${names_1.default.vErrors} === null`, () => gen.assign(names_1.default.vErrors, (0, codegen_1._)`[${err}]`), (0, codegen_1._)`${names_1.default.vErrors}.push(${err})`);
		gen.code((0, codegen_1._)`${names_1.default.errors}++`);
	}
	function returnErrors(it, errs) {
		const { gen, validateName, schemaEnv } = it;
		if (schemaEnv.$async) gen.throw((0, codegen_1._)`new ${it.ValidationError}(${errs})`);
		else {
			gen.assign((0, codegen_1._)`${validateName}.errors`, errs);
			gen.return(false);
		}
	}
	const E = {
		keyword: new codegen_1.Name("keyword"),
		schemaPath: new codegen_1.Name("schemaPath"),
		params: new codegen_1.Name("params"),
		propertyName: new codegen_1.Name("propertyName"),
		message: new codegen_1.Name("message"),
		schema: new codegen_1.Name("schema"),
		parentSchema: new codegen_1.Name("parentSchema")
	};
	function errorObjectCode(cxt, error, errorPaths) {
		const { createErrors } = cxt.it;
		if (createErrors === false) return (0, codegen_1._)`{}`;
		return errorObject(cxt, error, errorPaths);
	}
	function errorObject(cxt, error, errorPaths = {}) {
		const { gen, it } = cxt;
		const keyValues = [errorInstancePath(it, errorPaths), errorSchemaPath(cxt, errorPaths)];
		extraErrorProps(cxt, error, keyValues);
		return gen.object(...keyValues);
	}
	function errorInstancePath({ errorPath }, { instancePath }) {
		const instPath = instancePath ? (0, codegen_1.str)`${errorPath}${(0, util_1.getErrorPath)(instancePath, util_1.Type.Str)}` : errorPath;
		return [names_1.default.instancePath, (0, codegen_1.strConcat)(names_1.default.instancePath, instPath)];
	}
	function errorSchemaPath({ keyword, it: { errSchemaPath } }, { schemaPath, parentSchema }) {
		let schPath = parentSchema ? errSchemaPath : (0, codegen_1.str)`${errSchemaPath}/${keyword}`;
		if (schemaPath) schPath = (0, codegen_1.str)`${schPath}${(0, util_1.getErrorPath)(schemaPath, util_1.Type.Str)}`;
		return [E.schemaPath, schPath];
	}
	function extraErrorProps(cxt, { params, message }, keyValues) {
		const { keyword, data, schemaValue, it } = cxt;
		const { opts, propertyName, topSchemaRef, schemaPath } = it;
		keyValues.push([E.keyword, keyword], [E.params, typeof params == "function" ? params(cxt) : params || (0, codegen_1._)`{}`]);
		if (opts.messages) keyValues.push([E.message, typeof message == "function" ? message(cxt) : message]);
		if (opts.verbose) keyValues.push([E.schema, schemaValue], [E.parentSchema, (0, codegen_1._)`${topSchemaRef}${schemaPath}`], [names_1.default.data, data]);
		if (propertyName) keyValues.push([E.propertyName, propertyName]);
	}
}));
var require_boolSchema = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.boolOrEmptySchema = exports.topBoolOrEmptySchema = void 0;
	const errors_1 = require_errors();
	const codegen_1 = require_codegen();
	const names_1 = require_names();
	const boolError = { message: "boolean schema is false" };
	function topBoolOrEmptySchema(it) {
		const { gen, schema, validateName } = it;
		if (schema === false) falseSchemaError(it, false);
		else if (typeof schema == "object" && schema.$async === true) gen.return(names_1.default.data);
		else {
			gen.assign((0, codegen_1._)`${validateName}.errors`, null);
			gen.return(true);
		}
	}
	exports.topBoolOrEmptySchema = topBoolOrEmptySchema;
	function boolOrEmptySchema(it, valid) {
		const { gen, schema } = it;
		if (schema === false) {
			gen.var(valid, false);
			falseSchemaError(it);
		} else gen.var(valid, true);
	}
	exports.boolOrEmptySchema = boolOrEmptySchema;
	function falseSchemaError(it, overrideAllErrors) {
		const { gen, data } = it;
		const cxt = {
			gen,
			keyword: "false schema",
			data,
			schema: false,
			schemaCode: false,
			schemaValue: false,
			params: {},
			it
		};
		(0, errors_1.reportError)(cxt, boolError, void 0, overrideAllErrors);
	}
}));
var require_rules = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.getRules = exports.isJSONType = void 0;
	const jsonTypes = /* @__PURE__ */ new Set([
		"string",
		"number",
		"integer",
		"boolean",
		"null",
		"object",
		"array"
	]);
	function isJSONType(x) {
		return typeof x == "string" && jsonTypes.has(x);
	}
	exports.isJSONType = isJSONType;
	function getRules() {
		const groups = {
			number: {
				type: "number",
				rules: []
			},
			string: {
				type: "string",
				rules: []
			},
			array: {
				type: "array",
				rules: []
			},
			object: {
				type: "object",
				rules: []
			}
		};
		return {
			types: {
				...groups,
				integer: true,
				boolean: true,
				null: true
			},
			rules: [
				{ rules: [] },
				groups.number,
				groups.string,
				groups.array,
				groups.object
			],
			post: { rules: [] },
			all: {},
			keywords: {}
		};
	}
	exports.getRules = getRules;
}));
var require_applicability = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.shouldUseRule = exports.shouldUseGroup = exports.schemaHasRulesForType = void 0;
	function schemaHasRulesForType({ schema, self }, type) {
		const group = self.RULES.types[type];
		return group && group !== true && shouldUseGroup(schema, group);
	}
	exports.schemaHasRulesForType = schemaHasRulesForType;
	function shouldUseGroup(schema, group) {
		return group.rules.some((rule) => shouldUseRule(schema, rule));
	}
	exports.shouldUseGroup = shouldUseGroup;
	function shouldUseRule(schema, rule) {
		var _a;
		return schema[rule.keyword] !== void 0 || ((_a = rule.definition.implements) === null || _a === void 0 ? void 0 : _a.some((kwd) => schema[kwd] !== void 0));
	}
	exports.shouldUseRule = shouldUseRule;
}));
var require_dataType = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.reportTypeError = exports.checkDataTypes = exports.checkDataType = exports.coerceAndCheckDataType = exports.getJSONTypes = exports.getSchemaTypes = exports.DataType = void 0;
	const rules_1 = require_rules();
	const applicability_1 = require_applicability();
	const errors_1 = require_errors();
	const codegen_1 = require_codegen();
	const util_1 = require_util();
	var DataType;
	(function(DataType) {
		DataType[DataType["Correct"] = 0] = "Correct";
		DataType[DataType["Wrong"] = 1] = "Wrong";
	})(DataType || (exports.DataType = DataType = {}));
	function getSchemaTypes(schema) {
		const types = getJSONTypes(schema.type);
		if (types.includes("null")) {
			if (schema.nullable === false) throw new Error("type: null contradicts nullable: false");
		} else {
			if (!types.length && schema.nullable !== void 0) throw new Error("\"nullable\" cannot be used without \"type\"");
			if (schema.nullable === true) types.push("null");
		}
		return types;
	}
	exports.getSchemaTypes = getSchemaTypes;
	function getJSONTypes(ts) {
		const types = Array.isArray(ts) ? ts : ts ? [ts] : [];
		if (types.every(rules_1.isJSONType)) return types;
		throw new Error("type must be JSONType or JSONType[]: " + types.join(","));
	}
	exports.getJSONTypes = getJSONTypes;
	function coerceAndCheckDataType(it, types) {
		const { gen, data, opts } = it;
		const coerceTo = coerceToTypes(types, opts.coerceTypes);
		const checkTypes = types.length > 0 && !(coerceTo.length === 0 && types.length === 1 && (0, applicability_1.schemaHasRulesForType)(it, types[0]));
		if (checkTypes) {
			const wrongType = checkDataTypes(types, data, opts.strictNumbers, DataType.Wrong);
			gen.if(wrongType, () => {
				if (coerceTo.length) coerceData(it, types, coerceTo);
				else reportTypeError(it);
			});
		}
		return checkTypes;
	}
	exports.coerceAndCheckDataType = coerceAndCheckDataType;
	const COERCIBLE = /* @__PURE__ */ new Set([
		"string",
		"number",
		"integer",
		"boolean",
		"null"
	]);
	function coerceToTypes(types, coerceTypes) {
		return coerceTypes ? types.filter((t) => COERCIBLE.has(t) || coerceTypes === "array" && t === "array") : [];
	}
	function coerceData(it, types, coerceTo) {
		const { gen, data, opts } = it;
		const dataType = gen.let("dataType", (0, codegen_1._)`typeof ${data}`);
		const coerced = gen.let("coerced", (0, codegen_1._)`undefined`);
		if (opts.coerceTypes === "array") gen.if((0, codegen_1._)`${dataType} == 'object' && Array.isArray(${data}) && ${data}.length == 1`, () => gen.assign(data, (0, codegen_1._)`${data}[0]`).assign(dataType, (0, codegen_1._)`typeof ${data}`).if(checkDataTypes(types, data, opts.strictNumbers), () => gen.assign(coerced, data)));
		gen.if((0, codegen_1._)`${coerced} !== undefined`);
		for (const t of coerceTo) if (COERCIBLE.has(t) || t === "array" && opts.coerceTypes === "array") coerceSpecificType(t);
		gen.else();
		reportTypeError(it);
		gen.endIf();
		gen.if((0, codegen_1._)`${coerced} !== undefined`, () => {
			gen.assign(data, coerced);
			assignParentData(it, coerced);
		});
		function coerceSpecificType(t) {
			switch (t) {
				case "string":
					gen.elseIf((0, codegen_1._)`${dataType} == "number" || ${dataType} == "boolean"`).assign(coerced, (0, codegen_1._)`"" + ${data}`).elseIf((0, codegen_1._)`${data} === null`).assign(coerced, (0, codegen_1._)`""`);
					return;
				case "number":
					gen.elseIf((0, codegen_1._)`${dataType} == "boolean" || ${data} === null
              || (${dataType} == "string" && ${data} && ${data} == +${data})`).assign(coerced, (0, codegen_1._)`+${data}`);
					return;
				case "integer":
					gen.elseIf((0, codegen_1._)`${dataType} === "boolean" || ${data} === null
              || (${dataType} === "string" && ${data} && ${data} == +${data} && !(${data} % 1))`).assign(coerced, (0, codegen_1._)`+${data}`);
					return;
				case "boolean":
					gen.elseIf((0, codegen_1._)`${data} === "false" || ${data} === 0 || ${data} === null`).assign(coerced, false).elseIf((0, codegen_1._)`${data} === "true" || ${data} === 1`).assign(coerced, true);
					return;
				case "null":
					gen.elseIf((0, codegen_1._)`${data} === "" || ${data} === 0 || ${data} === false`);
					gen.assign(coerced, null);
					return;
				case "array": gen.elseIf((0, codegen_1._)`${dataType} === "string" || ${dataType} === "number"
              || ${dataType} === "boolean" || ${data} === null`).assign(coerced, (0, codegen_1._)`[${data}]`);
			}
		}
	}
	function assignParentData({ gen, parentData, parentDataProperty }, expr) {
		gen.if((0, codegen_1._)`${parentData} !== undefined`, () => gen.assign((0, codegen_1._)`${parentData}[${parentDataProperty}]`, expr));
	}
	function checkDataType(dataType, data, strictNums, correct = DataType.Correct) {
		const EQ = correct === DataType.Correct ? codegen_1.operators.EQ : codegen_1.operators.NEQ;
		let cond;
		switch (dataType) {
			case "null": return (0, codegen_1._)`${data} ${EQ} null`;
			case "array":
				cond = (0, codegen_1._)`Array.isArray(${data})`;
				break;
			case "object":
				cond = (0, codegen_1._)`${data} && typeof ${data} == "object" && !Array.isArray(${data})`;
				break;
			case "integer":
				cond = numCond((0, codegen_1._)`!(${data} % 1) && !isNaN(${data})`);
				break;
			case "number":
				cond = numCond();
				break;
			default: return (0, codegen_1._)`typeof ${data} ${EQ} ${dataType}`;
		}
		return correct === DataType.Correct ? cond : (0, codegen_1.not)(cond);
		function numCond(_cond = codegen_1.nil) {
			return (0, codegen_1.and)((0, codegen_1._)`typeof ${data} == "number"`, _cond, strictNums ? (0, codegen_1._)`isFinite(${data})` : codegen_1.nil);
		}
	}
	exports.checkDataType = checkDataType;
	function checkDataTypes(dataTypes, data, strictNums, correct) {
		if (dataTypes.length === 1) return checkDataType(dataTypes[0], data, strictNums, correct);
		let cond;
		const types = (0, util_1.toHash)(dataTypes);
		if (types.array && types.object) {
			const notObj = (0, codegen_1._)`typeof ${data} != "object"`;
			cond = types.null ? notObj : (0, codegen_1._)`!${data} || ${notObj}`;
			delete types.null;
			delete types.array;
			delete types.object;
		} else cond = codegen_1.nil;
		if (types.number) delete types.integer;
		for (const t in types) cond = (0, codegen_1.and)(cond, checkDataType(t, data, strictNums, correct));
		return cond;
	}
	exports.checkDataTypes = checkDataTypes;
	const typeError = {
		message: ({ schema }) => `must be ${schema}`,
		params: ({ schema, schemaValue }) => typeof schema == "string" ? (0, codegen_1._)`{type: ${schema}}` : (0, codegen_1._)`{type: ${schemaValue}}`
	};
	function reportTypeError(it) {
		const cxt = getTypeErrorContext(it);
		(0, errors_1.reportError)(cxt, typeError);
	}
	exports.reportTypeError = reportTypeError;
	function getTypeErrorContext(it) {
		const { gen, data, schema } = it;
		const schemaCode = (0, util_1.schemaRefOrVal)(it, schema, "type");
		return {
			gen,
			keyword: "type",
			data,
			schema: schema.type,
			schemaCode,
			schemaValue: schemaCode,
			parentSchema: schema,
			params: {},
			it
		};
	}
}));
var require_defaults = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.assignDefaults = void 0;
	const codegen_1 = require_codegen();
	const util_1 = require_util();
	function assignDefaults(it, ty) {
		const { properties, items } = it.schema;
		if (ty === "object" && properties) for (const key in properties) assignDefault(it, key, properties[key].default);
		else if (ty === "array" && Array.isArray(items)) items.forEach((sch, i) => assignDefault(it, i, sch.default));
	}
	exports.assignDefaults = assignDefaults;
	function assignDefault(it, prop, defaultValue) {
		const { gen, compositeRule, data, opts } = it;
		if (defaultValue === void 0) return;
		const childData = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(prop)}`;
		if (compositeRule) {
			(0, util_1.checkStrictMode)(it, `default is ignored for: ${childData}`);
			return;
		}
		let condition = (0, codegen_1._)`${childData} === undefined`;
		if (opts.useDefaults === "empty") condition = (0, codegen_1._)`${condition} || ${childData} === null || ${childData} === ""`;
		gen.if(condition, (0, codegen_1._)`${childData} = ${(0, codegen_1.stringify)(defaultValue)}`);
	}
}));
var require_code = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.validateUnion = exports.validateArray = exports.usePattern = exports.callValidateCode = exports.schemaProperties = exports.allSchemaProperties = exports.noPropertyInData = exports.propertyInData = exports.isOwnProperty = exports.hasPropFunc = exports.reportMissingProp = exports.checkMissingProp = exports.checkReportMissingProp = void 0;
	const codegen_1 = require_codegen();
	const util_1 = require_util();
	const names_1 = require_names();
	const util_2 = require_util();
	function checkReportMissingProp(cxt, prop) {
		const { gen, data, it } = cxt;
		gen.if(noPropertyInData(gen, data, prop, it.opts.ownProperties), () => {
			cxt.setParams({ missingProperty: (0, codegen_1._)`${prop}` }, true);
			cxt.error();
		});
	}
	exports.checkReportMissingProp = checkReportMissingProp;
	function checkMissingProp({ gen, data, it: { opts } }, properties, missing) {
		return (0, codegen_1.or)(...properties.map((prop) => (0, codegen_1.and)(noPropertyInData(gen, data, prop, opts.ownProperties), (0, codegen_1._)`${missing} = ${prop}`)));
	}
	exports.checkMissingProp = checkMissingProp;
	function reportMissingProp(cxt, missing) {
		cxt.setParams({ missingProperty: missing }, true);
		cxt.error();
	}
	exports.reportMissingProp = reportMissingProp;
	function hasPropFunc(gen) {
		return gen.scopeValue("func", {
			ref: Object.prototype.hasOwnProperty,
			code: (0, codegen_1._)`Object.prototype.hasOwnProperty`
		});
	}
	exports.hasPropFunc = hasPropFunc;
	function isOwnProperty(gen, data, property) {
		return (0, codegen_1._)`${hasPropFunc(gen)}.call(${data}, ${property})`;
	}
	exports.isOwnProperty = isOwnProperty;
	function propertyInData(gen, data, property, ownProperties) {
		const cond = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(property)} !== undefined`;
		return ownProperties ? (0, codegen_1._)`${cond} && ${isOwnProperty(gen, data, property)}` : cond;
	}
	exports.propertyInData = propertyInData;
	function noPropertyInData(gen, data, property, ownProperties) {
		const cond = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(property)} === undefined`;
		return ownProperties ? (0, codegen_1.or)(cond, (0, codegen_1.not)(isOwnProperty(gen, data, property))) : cond;
	}
	exports.noPropertyInData = noPropertyInData;
	function allSchemaProperties(schemaMap) {
		return schemaMap ? Object.keys(schemaMap).filter((p) => p !== "__proto__") : [];
	}
	exports.allSchemaProperties = allSchemaProperties;
	function schemaProperties(it, schemaMap) {
		return allSchemaProperties(schemaMap).filter((p) => !(0, util_1.alwaysValidSchema)(it, schemaMap[p]));
	}
	exports.schemaProperties = schemaProperties;
	function callValidateCode({ schemaCode, data, it: { gen, topSchemaRef, schemaPath, errorPath }, it }, func, context, passSchema) {
		const dataAndSchema = passSchema ? (0, codegen_1._)`${schemaCode}, ${data}, ${topSchemaRef}${schemaPath}` : data;
		const valCxt = [
			[names_1.default.instancePath, (0, codegen_1.strConcat)(names_1.default.instancePath, errorPath)],
			[names_1.default.parentData, it.parentData],
			[names_1.default.parentDataProperty, it.parentDataProperty],
			[names_1.default.rootData, names_1.default.rootData]
		];
		if (it.opts.dynamicRef) valCxt.push([names_1.default.dynamicAnchors, names_1.default.dynamicAnchors]);
		const args = (0, codegen_1._)`${dataAndSchema}, ${gen.object(...valCxt)}`;
		return context !== codegen_1.nil ? (0, codegen_1._)`${func}.call(${context}, ${args})` : (0, codegen_1._)`${func}(${args})`;
	}
	exports.callValidateCode = callValidateCode;
	const newRegExp = (0, codegen_1._)`new RegExp`;
	function usePattern({ gen, it: { opts } }, pattern) {
		const u = opts.unicodeRegExp ? "u" : "";
		const { regExp } = opts.code;
		const rx = regExp(pattern, u);
		return gen.scopeValue("pattern", {
			key: rx.toString(),
			ref: rx,
			code: (0, codegen_1._)`${regExp.code === "new RegExp" ? newRegExp : (0, util_2.useFunc)(gen, regExp)}(${pattern}, ${u})`
		});
	}
	exports.usePattern = usePattern;
	function validateArray(cxt) {
		const { gen, data, keyword, it } = cxt;
		const valid = gen.name("valid");
		if (it.allErrors) {
			const validArr = gen.let("valid", true);
			validateItems(() => gen.assign(validArr, false));
			return validArr;
		}
		gen.var(valid, true);
		validateItems(() => gen.break());
		return valid;
		function validateItems(notValid) {
			const len = gen.const("len", (0, codegen_1._)`${data}.length`);
			gen.forRange("i", 0, len, (i) => {
				cxt.subschema({
					keyword,
					dataProp: i,
					dataPropType: util_1.Type.Num
				}, valid);
				gen.if((0, codegen_1.not)(valid), notValid);
			});
		}
	}
	exports.validateArray = validateArray;
	function validateUnion(cxt) {
		const { gen, schema, keyword, it } = cxt;
		/* istanbul ignore if */
		if (!Array.isArray(schema)) throw new Error("ajv implementation error");
		if (schema.some((sch) => (0, util_1.alwaysValidSchema)(it, sch)) && !it.opts.unevaluated) return;
		const valid = gen.let("valid", false);
		const schValid = gen.name("_valid");
		gen.block(() => schema.forEach((_sch, i) => {
			const schCxt = cxt.subschema({
				keyword,
				schemaProp: i,
				compositeRule: true
			}, schValid);
			gen.assign(valid, (0, codegen_1._)`${valid} || ${schValid}`);
			if (!cxt.mergeValidEvaluated(schCxt, schValid)) gen.if((0, codegen_1.not)(valid));
		}));
		cxt.result(valid, () => cxt.reset(), () => cxt.error(true));
	}
	exports.validateUnion = validateUnion;
}));
var require_keyword = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.validateKeywordUsage = exports.validSchemaType = exports.funcKeywordCode = exports.macroKeywordCode = void 0;
	const codegen_1 = require_codegen();
	const names_1 = require_names();
	const code_1 = require_code();
	const errors_1 = require_errors();
	function macroKeywordCode(cxt, def) {
		const { gen, keyword, schema, parentSchema, it } = cxt;
		const macroSchema = def.macro.call(it.self, schema, parentSchema, it);
		const schemaRef = useKeyword(gen, keyword, macroSchema);
		if (it.opts.validateSchema !== false) it.self.validateSchema(macroSchema, true);
		const valid = gen.name("valid");
		cxt.subschema({
			schema: macroSchema,
			schemaPath: codegen_1.nil,
			errSchemaPath: `${it.errSchemaPath}/${keyword}`,
			topSchemaRef: schemaRef,
			compositeRule: true
		}, valid);
		cxt.pass(valid, () => cxt.error(true));
	}
	exports.macroKeywordCode = macroKeywordCode;
	function funcKeywordCode(cxt, def) {
		var _a;
		const { gen, keyword, schema, parentSchema, $data, it } = cxt;
		checkAsyncKeyword(it, def);
		const validateRef = useKeyword(gen, keyword, !$data && def.compile ? def.compile.call(it.self, schema, parentSchema, it) : def.validate);
		const valid = gen.let("valid");
		cxt.block$data(valid, validateKeyword);
		cxt.ok((_a = def.valid) !== null && _a !== void 0 ? _a : valid);
		function validateKeyword() {
			if (def.errors === false) {
				assignValid();
				if (def.modifying) modifyData(cxt);
				reportErrs(() => cxt.error());
			} else {
				const ruleErrs = def.async ? validateAsync() : validateSync();
				if (def.modifying) modifyData(cxt);
				reportErrs(() => addErrs(cxt, ruleErrs));
			}
		}
		function validateAsync() {
			const ruleErrs = gen.let("ruleErrs", null);
			gen.try(() => assignValid((0, codegen_1._)`await `), (e) => gen.assign(valid, false).if((0, codegen_1._)`${e} instanceof ${it.ValidationError}`, () => gen.assign(ruleErrs, (0, codegen_1._)`${e}.errors`), () => gen.throw(e)));
			return ruleErrs;
		}
		function validateSync() {
			const validateErrs = (0, codegen_1._)`${validateRef}.errors`;
			gen.assign(validateErrs, null);
			assignValid(codegen_1.nil);
			return validateErrs;
		}
		function assignValid(_await = def.async ? (0, codegen_1._)`await ` : codegen_1.nil) {
			const passCxt = it.opts.passContext ? names_1.default.this : names_1.default.self;
			const passSchema = !("compile" in def && !$data || def.schema === false);
			gen.assign(valid, (0, codegen_1._)`${_await}${(0, code_1.callValidateCode)(cxt, validateRef, passCxt, passSchema)}`, def.modifying);
		}
		function reportErrs(errors) {
			var _a$1;
			gen.if((0, codegen_1.not)((_a$1 = def.valid) !== null && _a$1 !== void 0 ? _a$1 : valid), errors);
		}
	}
	exports.funcKeywordCode = funcKeywordCode;
	function modifyData(cxt) {
		const { gen, data, it } = cxt;
		gen.if(it.parentData, () => gen.assign(data, (0, codegen_1._)`${it.parentData}[${it.parentDataProperty}]`));
	}
	function addErrs(cxt, errs) {
		const { gen } = cxt;
		gen.if((0, codegen_1._)`Array.isArray(${errs})`, () => {
			gen.assign(names_1.default.vErrors, (0, codegen_1._)`${names_1.default.vErrors} === null ? ${errs} : ${names_1.default.vErrors}.concat(${errs})`).assign(names_1.default.errors, (0, codegen_1._)`${names_1.default.vErrors}.length`);
			(0, errors_1.extendErrors)(cxt);
		}, () => cxt.error());
	}
	function checkAsyncKeyword({ schemaEnv }, def) {
		if (def.async && !schemaEnv.$async) throw new Error("async keyword in sync schema");
	}
	function useKeyword(gen, keyword, result) {
		if (result === void 0) throw new Error(`keyword "${keyword}" failed to compile`);
		return gen.scopeValue("keyword", typeof result == "function" ? { ref: result } : {
			ref: result,
			code: (0, codegen_1.stringify)(result)
		});
	}
	function validSchemaType(schema, schemaType, allowUndefined = false) {
		return !schemaType.length || schemaType.some((st) => st === "array" ? Array.isArray(schema) : st === "object" ? schema && typeof schema == "object" && !Array.isArray(schema) : typeof schema == st || allowUndefined && typeof schema == "undefined");
	}
	exports.validSchemaType = validSchemaType;
	function validateKeywordUsage({ schema, opts, self, errSchemaPath }, def, keyword) {
		/* istanbul ignore if */
		if (Array.isArray(def.keyword) ? !def.keyword.includes(keyword) : def.keyword !== keyword) throw new Error("ajv implementation error");
		const deps = def.dependencies;
		if (deps === null || deps === void 0 ? void 0 : deps.some((kwd) => !Object.prototype.hasOwnProperty.call(schema, kwd))) throw new Error(`parent schema must have dependencies of ${keyword}: ${deps.join(",")}`);
		if (def.validateSchema) {
			if (!def.validateSchema(schema[keyword])) {
				const msg = `keyword "${keyword}" value is invalid at path "${errSchemaPath}": ` + self.errorsText(def.validateSchema.errors);
				if (opts.validateSchema === "log") self.logger.error(msg);
				else throw new Error(msg);
			}
		}
	}
	exports.validateKeywordUsage = validateKeywordUsage;
}));
var require_subschema = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.extendSubschemaMode = exports.extendSubschemaData = exports.getSubschema = void 0;
	const codegen_1 = require_codegen();
	const util_1 = require_util();
	function getSubschema(it, { keyword, schemaProp, schema, schemaPath, errSchemaPath, topSchemaRef }) {
		if (keyword !== void 0 && schema !== void 0) throw new Error("both \"keyword\" and \"schema\" passed, only one allowed");
		if (keyword !== void 0) {
			const sch = it.schema[keyword];
			return schemaProp === void 0 ? {
				schema: sch,
				schemaPath: (0, codegen_1._)`${it.schemaPath}${(0, codegen_1.getProperty)(keyword)}`,
				errSchemaPath: `${it.errSchemaPath}/${keyword}`
			} : {
				schema: sch[schemaProp],
				schemaPath: (0, codegen_1._)`${it.schemaPath}${(0, codegen_1.getProperty)(keyword)}${(0, codegen_1.getProperty)(schemaProp)}`,
				errSchemaPath: `${it.errSchemaPath}/${keyword}/${(0, util_1.escapeFragment)(schemaProp)}`
			};
		}
		if (schema !== void 0) {
			if (schemaPath === void 0 || errSchemaPath === void 0 || topSchemaRef === void 0) throw new Error("\"schemaPath\", \"errSchemaPath\" and \"topSchemaRef\" are required with \"schema\"");
			return {
				schema,
				schemaPath,
				topSchemaRef,
				errSchemaPath
			};
		}
		throw new Error("either \"keyword\" or \"schema\" must be passed");
	}
	exports.getSubschema = getSubschema;
	function extendSubschemaData(subschema, it, { dataProp, dataPropType: dpType, data, dataTypes, propertyName }) {
		if (data !== void 0 && dataProp !== void 0) throw new Error("both \"data\" and \"dataProp\" passed, only one allowed");
		const { gen } = it;
		if (dataProp !== void 0) {
			const { errorPath, dataPathArr, opts } = it;
			dataContextProps(gen.let("data", (0, codegen_1._)`${it.data}${(0, codegen_1.getProperty)(dataProp)}`, true));
			subschema.errorPath = (0, codegen_1.str)`${errorPath}${(0, util_1.getErrorPath)(dataProp, dpType, opts.jsPropertySyntax)}`;
			subschema.parentDataProperty = (0, codegen_1._)`${dataProp}`;
			subschema.dataPathArr = [...dataPathArr, subschema.parentDataProperty];
		}
		if (data !== void 0) {
			dataContextProps(data instanceof codegen_1.Name ? data : gen.let("data", data, true));
			if (propertyName !== void 0) subschema.propertyName = propertyName;
		}
		if (dataTypes) subschema.dataTypes = dataTypes;
		function dataContextProps(_nextData) {
			subschema.data = _nextData;
			subschema.dataLevel = it.dataLevel + 1;
			subschema.dataTypes = [];
			it.definedProperties = /* @__PURE__ */ new Set();
			subschema.parentData = it.data;
			subschema.dataNames = [...it.dataNames, _nextData];
		}
	}
	exports.extendSubschemaData = extendSubschemaData;
	function extendSubschemaMode(subschema, { jtdDiscriminator, jtdMetadata, compositeRule, createErrors, allErrors }) {
		if (compositeRule !== void 0) subschema.compositeRule = compositeRule;
		if (createErrors !== void 0) subschema.createErrors = createErrors;
		if (allErrors !== void 0) subschema.allErrors = allErrors;
		subschema.jtdDiscriminator = jtdDiscriminator;
		subschema.jtdMetadata = jtdMetadata;
	}
	exports.extendSubschemaMode = extendSubschemaMode;
}));
var require_fast_deep_equal = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = function equal(a, b) {
		if (a === b) return true;
		if (a && b && typeof a == "object" && typeof b == "object") {
			if (a.constructor !== b.constructor) return false;
			var length, i, keys;
			if (Array.isArray(a)) {
				length = a.length;
				if (length != b.length) return false;
				for (i = length; i-- !== 0;) if (!equal(a[i], b[i])) return false;
				return true;
			}
			if (a.constructor === RegExp) return a.source === b.source && a.flags === b.flags;
			if (a.valueOf !== Object.prototype.valueOf) return a.valueOf() === b.valueOf();
			if (a.toString !== Object.prototype.toString) return a.toString() === b.toString();
			keys = Object.keys(a);
			length = keys.length;
			if (length !== Object.keys(b).length) return false;
			for (i = length; i-- !== 0;) if (!Object.prototype.hasOwnProperty.call(b, keys[i])) return false;
			for (i = length; i-- !== 0;) {
				var key = keys[i];
				if (!equal(a[key], b[key])) return false;
			}
			return true;
		}
		return a !== a && b !== b;
	};
}));
var require_json_schema_traverse = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var traverse = module.exports = function(schema, opts, cb) {
		if (typeof opts == "function") {
			cb = opts;
			opts = {};
		}
		cb = opts.cb || cb;
		var pre = typeof cb == "function" ? cb : cb.pre || function() {};
		var post = cb.post || function() {};
		_traverse(opts, pre, post, schema, "", schema);
	};
	traverse.keywords = {
		additionalItems: true,
		items: true,
		contains: true,
		additionalProperties: true,
		propertyNames: true,
		not: true,
		if: true,
		then: true,
		else: true
	};
	traverse.arrayKeywords = {
		items: true,
		allOf: true,
		anyOf: true,
		oneOf: true
	};
	traverse.propsKeywords = {
		$defs: true,
		definitions: true,
		properties: true,
		patternProperties: true,
		dependencies: true
	};
	traverse.skipKeywords = {
		default: true,
		enum: true,
		const: true,
		required: true,
		maximum: true,
		minimum: true,
		exclusiveMaximum: true,
		exclusiveMinimum: true,
		multipleOf: true,
		maxLength: true,
		minLength: true,
		pattern: true,
		format: true,
		maxItems: true,
		minItems: true,
		uniqueItems: true,
		maxProperties: true,
		minProperties: true
	};
	function _traverse(opts, pre, post, schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex) {
		if (schema && typeof schema == "object" && !Array.isArray(schema)) {
			pre(schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex);
			for (var key in schema) {
				var sch = schema[key];
				if (Array.isArray(sch)) {
					if (key in traverse.arrayKeywords) for (var i = 0; i < sch.length; i++) _traverse(opts, pre, post, sch[i], jsonPtr + "/" + key + "/" + i, rootSchema, jsonPtr, key, schema, i);
				} else if (key in traverse.propsKeywords) {
					if (sch && typeof sch == "object") for (var prop in sch) _traverse(opts, pre, post, sch[prop], jsonPtr + "/" + key + "/" + escapeJsonPtr(prop), rootSchema, jsonPtr, key, schema, prop);
				} else if (key in traverse.keywords || opts.allKeys && !(key in traverse.skipKeywords)) _traverse(opts, pre, post, sch, jsonPtr + "/" + key, rootSchema, jsonPtr, key, schema);
			}
			post(schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex);
		}
	}
	function escapeJsonPtr(str) {
		return str.replace(/~/g, "~0").replace(/\//g, "~1");
	}
}));
var require_resolve = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.getSchemaRefs = exports.resolveUrl = exports.normalizeId = exports._getFullPath = exports.getFullPath = exports.inlineRef = void 0;
	const util_1 = require_util();
	const equal = require_fast_deep_equal();
	const traverse = require_json_schema_traverse();
	const SIMPLE_INLINED = /* @__PURE__ */ new Set([
		"type",
		"format",
		"pattern",
		"maxLength",
		"minLength",
		"maxProperties",
		"minProperties",
		"maxItems",
		"minItems",
		"maximum",
		"minimum",
		"uniqueItems",
		"multipleOf",
		"required",
		"enum",
		"const"
	]);
	function inlineRef(schema, limit = true) {
		if (typeof schema == "boolean") return true;
		if (limit === true) return !hasRef(schema);
		if (!limit) return false;
		return countKeys(schema) <= limit;
	}
	exports.inlineRef = inlineRef;
	const REF_KEYWORDS = /* @__PURE__ */ new Set([
		"$ref",
		"$recursiveRef",
		"$recursiveAnchor",
		"$dynamicRef",
		"$dynamicAnchor"
	]);
	function hasRef(schema) {
		for (const key in schema) {
			if (REF_KEYWORDS.has(key)) return true;
			const sch = schema[key];
			if (Array.isArray(sch) && sch.some(hasRef)) return true;
			if (typeof sch == "object" && hasRef(sch)) return true;
		}
		return false;
	}
	function countKeys(schema) {
		let count = 0;
		for (const key in schema) {
			if (key === "$ref") return Infinity;
			count++;
			if (SIMPLE_INLINED.has(key)) continue;
			if (typeof schema[key] == "object") (0, util_1.eachItem)(schema[key], (sch) => count += countKeys(sch));
			if (count === Infinity) return Infinity;
		}
		return count;
	}
	function getFullPath(resolver, id = "", normalize) {
		if (normalize !== false) id = normalizeId(id);
		return _getFullPath(resolver, resolver.parse(id));
	}
	exports.getFullPath = getFullPath;
	function _getFullPath(resolver, p) {
		return resolver.serialize(p).split("#")[0] + "#";
	}
	exports._getFullPath = _getFullPath;
	const TRAILING_SLASH_HASH = /#\/?$/;
	function normalizeId(id) {
		return id ? id.replace(TRAILING_SLASH_HASH, "") : "";
	}
	exports.normalizeId = normalizeId;
	function resolveUrl(resolver, baseId, id) {
		id = normalizeId(id);
		return resolver.resolve(baseId, id);
	}
	exports.resolveUrl = resolveUrl;
	const ANCHOR = /^[a-z_][-a-z0-9._]*$/i;
	function getSchemaRefs(schema, baseId) {
		if (typeof schema == "boolean") return {};
		const { schemaId, uriResolver } = this.opts;
		const schId = normalizeId(schema[schemaId] || baseId);
		const baseIds = { "": schId };
		const pathPrefix = getFullPath(uriResolver, schId, false);
		const localRefs = {};
		const schemaRefs = /* @__PURE__ */ new Set();
		traverse(schema, { allKeys: true }, (sch, jsonPtr, _, parentJsonPtr) => {
			if (parentJsonPtr === void 0) return;
			const fullPath = pathPrefix + jsonPtr;
			let innerBaseId = baseIds[parentJsonPtr];
			if (typeof sch[schemaId] == "string") innerBaseId = addRef.call(this, sch[schemaId]);
			addAnchor.call(this, sch.$anchor);
			addAnchor.call(this, sch.$dynamicAnchor);
			baseIds[jsonPtr] = innerBaseId;
			function addRef(ref) {
				const _resolve = this.opts.uriResolver.resolve;
				ref = normalizeId(innerBaseId ? _resolve(innerBaseId, ref) : ref);
				if (schemaRefs.has(ref)) throw ambiguos(ref);
				schemaRefs.add(ref);
				let schOrRef = this.refs[ref];
				if (typeof schOrRef == "string") schOrRef = this.refs[schOrRef];
				if (typeof schOrRef == "object") checkAmbiguosRef(sch, schOrRef.schema, ref);
				else if (ref !== normalizeId(fullPath)) if (ref[0] === "#") {
					checkAmbiguosRef(sch, localRefs[ref], ref);
					localRefs[ref] = sch;
				} else this.refs[ref] = fullPath;
				return ref;
			}
			function addAnchor(anchor) {
				if (typeof anchor == "string") {
					if (!ANCHOR.test(anchor)) throw new Error(`invalid anchor "${anchor}"`);
					addRef.call(this, `#${anchor}`);
				}
			}
		});
		return localRefs;
		function checkAmbiguosRef(sch1, sch2, ref) {
			if (sch2 !== void 0 && !equal(sch1, sch2)) throw ambiguos(ref);
		}
		function ambiguos(ref) {
			return /* @__PURE__ */ new Error(`reference "${ref}" resolves to more than one schema`);
		}
	}
	exports.getSchemaRefs = getSchemaRefs;
}));
var require_validate = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.getData = exports.KeywordCxt = exports.validateFunctionCode = void 0;
	const boolSchema_1 = require_boolSchema();
	const dataType_1 = require_dataType();
	const applicability_1 = require_applicability();
	const dataType_2 = require_dataType();
	const defaults_1 = require_defaults();
	const keyword_1 = require_keyword();
	const subschema_1 = require_subschema();
	const codegen_1 = require_codegen();
	const names_1 = require_names();
	const resolve_1 = require_resolve();
	const util_1 = require_util();
	const errors_1 = require_errors();
	function validateFunctionCode(it) {
		if (isSchemaObj(it)) {
			checkKeywords(it);
			if (schemaCxtHasRules(it)) {
				topSchemaObjCode(it);
				return;
			}
		}
		validateFunction(it, () => (0, boolSchema_1.topBoolOrEmptySchema)(it));
	}
	exports.validateFunctionCode = validateFunctionCode;
	function validateFunction({ gen, validateName, schema, schemaEnv, opts }, body) {
		if (opts.code.es5) gen.func(validateName, (0, codegen_1._)`${names_1.default.data}, ${names_1.default.valCxt}`, schemaEnv.$async, () => {
			gen.code((0, codegen_1._)`"use strict"; ${funcSourceUrl(schema, opts)}`);
			destructureValCxtES5(gen, opts);
			gen.code(body);
		});
		else gen.func(validateName, (0, codegen_1._)`${names_1.default.data}, ${destructureValCxt(opts)}`, schemaEnv.$async, () => gen.code(funcSourceUrl(schema, opts)).code(body));
	}
	function destructureValCxt(opts) {
		return (0, codegen_1._)`{${names_1.default.instancePath}="", ${names_1.default.parentData}, ${names_1.default.parentDataProperty}, ${names_1.default.rootData}=${names_1.default.data}${opts.dynamicRef ? (0, codegen_1._)`, ${names_1.default.dynamicAnchors}={}` : codegen_1.nil}}={}`;
	}
	function destructureValCxtES5(gen, opts) {
		gen.if(names_1.default.valCxt, () => {
			gen.var(names_1.default.instancePath, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.instancePath}`);
			gen.var(names_1.default.parentData, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.parentData}`);
			gen.var(names_1.default.parentDataProperty, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.parentDataProperty}`);
			gen.var(names_1.default.rootData, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.rootData}`);
			if (opts.dynamicRef) gen.var(names_1.default.dynamicAnchors, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.dynamicAnchors}`);
		}, () => {
			gen.var(names_1.default.instancePath, (0, codegen_1._)`""`);
			gen.var(names_1.default.parentData, (0, codegen_1._)`undefined`);
			gen.var(names_1.default.parentDataProperty, (0, codegen_1._)`undefined`);
			gen.var(names_1.default.rootData, names_1.default.data);
			if (opts.dynamicRef) gen.var(names_1.default.dynamicAnchors, (0, codegen_1._)`{}`);
		});
	}
	function topSchemaObjCode(it) {
		const { schema, opts, gen } = it;
		validateFunction(it, () => {
			if (opts.$comment && schema.$comment) commentKeyword(it);
			checkNoDefault(it);
			gen.let(names_1.default.vErrors, null);
			gen.let(names_1.default.errors, 0);
			if (opts.unevaluated) resetEvaluated(it);
			typeAndKeywords(it);
			returnResults(it);
		});
	}
	function resetEvaluated(it) {
		const { gen, validateName } = it;
		it.evaluated = gen.const("evaluated", (0, codegen_1._)`${validateName}.evaluated`);
		gen.if((0, codegen_1._)`${it.evaluated}.dynamicProps`, () => gen.assign((0, codegen_1._)`${it.evaluated}.props`, (0, codegen_1._)`undefined`));
		gen.if((0, codegen_1._)`${it.evaluated}.dynamicItems`, () => gen.assign((0, codegen_1._)`${it.evaluated}.items`, (0, codegen_1._)`undefined`));
	}
	function funcSourceUrl(schema, opts) {
		const schId = typeof schema == "object" && schema[opts.schemaId];
		return schId && (opts.code.source || opts.code.process) ? (0, codegen_1._)`/*# sourceURL=${schId} */` : codegen_1.nil;
	}
	function subschemaCode(it, valid) {
		if (isSchemaObj(it)) {
			checkKeywords(it);
			if (schemaCxtHasRules(it)) {
				subSchemaObjCode(it, valid);
				return;
			}
		}
		(0, boolSchema_1.boolOrEmptySchema)(it, valid);
	}
	function schemaCxtHasRules({ schema, self }) {
		if (typeof schema == "boolean") return !schema;
		for (const key in schema) if (self.RULES.all[key]) return true;
		return false;
	}
	function isSchemaObj(it) {
		return typeof it.schema != "boolean";
	}
	function subSchemaObjCode(it, valid) {
		const { schema, gen, opts } = it;
		if (opts.$comment && schema.$comment) commentKeyword(it);
		updateContext(it);
		checkAsyncSchema(it);
		const errsCount = gen.const("_errs", names_1.default.errors);
		typeAndKeywords(it, errsCount);
		gen.var(valid, (0, codegen_1._)`${errsCount} === ${names_1.default.errors}`);
	}
	function checkKeywords(it) {
		(0, util_1.checkUnknownRules)(it);
		checkRefsAndKeywords(it);
	}
	function typeAndKeywords(it, errsCount) {
		if (it.opts.jtd) return schemaKeywords(it, [], false, errsCount);
		const types = (0, dataType_1.getSchemaTypes)(it.schema);
		schemaKeywords(it, types, !(0, dataType_1.coerceAndCheckDataType)(it, types), errsCount);
	}
	function checkRefsAndKeywords(it) {
		const { schema, errSchemaPath, opts, self } = it;
		if (schema.$ref && opts.ignoreKeywordsWithRef && (0, util_1.schemaHasRulesButRef)(schema, self.RULES)) self.logger.warn(`$ref: keywords ignored in schema at path "${errSchemaPath}"`);
	}
	function checkNoDefault(it) {
		const { schema, opts } = it;
		if (schema.default !== void 0 && opts.useDefaults && opts.strictSchema) (0, util_1.checkStrictMode)(it, "default is ignored in the schema root");
	}
	function updateContext(it) {
		const schId = it.schema[it.opts.schemaId];
		if (schId) it.baseId = (0, resolve_1.resolveUrl)(it.opts.uriResolver, it.baseId, schId);
	}
	function checkAsyncSchema(it) {
		if (it.schema.$async && !it.schemaEnv.$async) throw new Error("async schema in sync schema");
	}
	function commentKeyword({ gen, schemaEnv, schema, errSchemaPath, opts }) {
		const msg = schema.$comment;
		if (opts.$comment === true) gen.code((0, codegen_1._)`${names_1.default.self}.logger.log(${msg})`);
		else if (typeof opts.$comment == "function") {
			const schemaPath = (0, codegen_1.str)`${errSchemaPath}/$comment`;
			const rootName = gen.scopeValue("root", { ref: schemaEnv.root });
			gen.code((0, codegen_1._)`${names_1.default.self}.opts.$comment(${msg}, ${schemaPath}, ${rootName}.schema)`);
		}
	}
	function returnResults(it) {
		const { gen, schemaEnv, validateName, ValidationError, opts } = it;
		if (schemaEnv.$async) gen.if((0, codegen_1._)`${names_1.default.errors} === 0`, () => gen.return(names_1.default.data), () => gen.throw((0, codegen_1._)`new ${ValidationError}(${names_1.default.vErrors})`));
		else {
			gen.assign((0, codegen_1._)`${validateName}.errors`, names_1.default.vErrors);
			if (opts.unevaluated) assignEvaluated(it);
			gen.return((0, codegen_1._)`${names_1.default.errors} === 0`);
		}
	}
	function assignEvaluated({ gen, evaluated, props, items }) {
		if (props instanceof codegen_1.Name) gen.assign((0, codegen_1._)`${evaluated}.props`, props);
		if (items instanceof codegen_1.Name) gen.assign((0, codegen_1._)`${evaluated}.items`, items);
	}
	function schemaKeywords(it, types, typeErrors, errsCount) {
		const { gen, schema, data, allErrors, opts, self } = it;
		const { RULES } = self;
		if (schema.$ref && (opts.ignoreKeywordsWithRef || !(0, util_1.schemaHasRulesButRef)(schema, RULES))) {
			gen.block(() => keywordCode(it, "$ref", RULES.all.$ref.definition));
			return;
		}
		if (!opts.jtd) checkStrictTypes(it, types);
		gen.block(() => {
			for (const group of RULES.rules) groupKeywords(group);
			groupKeywords(RULES.post);
		});
		function groupKeywords(group) {
			if (!(0, applicability_1.shouldUseGroup)(schema, group)) return;
			if (group.type) {
				gen.if((0, dataType_2.checkDataType)(group.type, data, opts.strictNumbers));
				iterateKeywords(it, group);
				if (types.length === 1 && types[0] === group.type && typeErrors) {
					gen.else();
					(0, dataType_2.reportTypeError)(it);
				}
				gen.endIf();
			} else iterateKeywords(it, group);
			if (!allErrors) gen.if((0, codegen_1._)`${names_1.default.errors} === ${errsCount || 0}`);
		}
	}
	function iterateKeywords(it, group) {
		const { gen, schema, opts: { useDefaults } } = it;
		if (useDefaults) (0, defaults_1.assignDefaults)(it, group.type);
		gen.block(() => {
			for (const rule of group.rules) if ((0, applicability_1.shouldUseRule)(schema, rule)) keywordCode(it, rule.keyword, rule.definition, group.type);
		});
	}
	function checkStrictTypes(it, types) {
		if (it.schemaEnv.meta || !it.opts.strictTypes) return;
		checkContextTypes(it, types);
		if (!it.opts.allowUnionTypes) checkMultipleTypes(it, types);
		checkKeywordTypes(it, it.dataTypes);
	}
	function checkContextTypes(it, types) {
		if (!types.length) return;
		if (!it.dataTypes.length) {
			it.dataTypes = types;
			return;
		}
		types.forEach((t) => {
			if (!includesType(it.dataTypes, t)) strictTypesError(it, `type "${t}" not allowed by context "${it.dataTypes.join(",")}"`);
		});
		narrowSchemaTypes(it, types);
	}
	function checkMultipleTypes(it, ts) {
		if (ts.length > 1 && !(ts.length === 2 && ts.includes("null"))) strictTypesError(it, "use allowUnionTypes to allow union type keyword");
	}
	function checkKeywordTypes(it, ts) {
		const rules = it.self.RULES.all;
		for (const keyword in rules) {
			const rule = rules[keyword];
			if (typeof rule == "object" && (0, applicability_1.shouldUseRule)(it.schema, rule)) {
				const { type } = rule.definition;
				if (type.length && !type.some((t) => hasApplicableType(ts, t))) strictTypesError(it, `missing type "${type.join(",")}" for keyword "${keyword}"`);
			}
		}
	}
	function hasApplicableType(schTs, kwdT) {
		return schTs.includes(kwdT) || kwdT === "number" && schTs.includes("integer");
	}
	function includesType(ts, t) {
		return ts.includes(t) || t === "integer" && ts.includes("number");
	}
	function narrowSchemaTypes(it, withTypes) {
		const ts = [];
		for (const t of it.dataTypes) if (includesType(withTypes, t)) ts.push(t);
		else if (withTypes.includes("integer") && t === "number") ts.push("integer");
		it.dataTypes = ts;
	}
	function strictTypesError(it, msg) {
		const schemaPath = it.schemaEnv.baseId + it.errSchemaPath;
		msg += ` at "${schemaPath}" (strictTypes)`;
		(0, util_1.checkStrictMode)(it, msg, it.opts.strictTypes);
	}
	var KeywordCxt = class {
		constructor(it, def, keyword) {
			(0, keyword_1.validateKeywordUsage)(it, def, keyword);
			this.gen = it.gen;
			this.allErrors = it.allErrors;
			this.keyword = keyword;
			this.data = it.data;
			this.schema = it.schema[keyword];
			this.$data = def.$data && it.opts.$data && this.schema && this.schema.$data;
			this.schemaValue = (0, util_1.schemaRefOrVal)(it, this.schema, keyword, this.$data);
			this.schemaType = def.schemaType;
			this.parentSchema = it.schema;
			this.params = {};
			this.it = it;
			this.def = def;
			if (this.$data) this.schemaCode = it.gen.const("vSchema", getData(this.$data, it));
			else {
				this.schemaCode = this.schemaValue;
				if (!(0, keyword_1.validSchemaType)(this.schema, def.schemaType, def.allowUndefined)) throw new Error(`${keyword} value must be ${JSON.stringify(def.schemaType)}`);
			}
			if ("code" in def ? def.trackErrors : def.errors !== false) this.errsCount = it.gen.const("_errs", names_1.default.errors);
		}
		result(condition, successAction, failAction) {
			this.failResult((0, codegen_1.not)(condition), successAction, failAction);
		}
		failResult(condition, successAction, failAction) {
			this.gen.if(condition);
			if (failAction) failAction();
			else this.error();
			if (successAction) {
				this.gen.else();
				successAction();
				if (this.allErrors) this.gen.endIf();
			} else if (this.allErrors) this.gen.endIf();
			else this.gen.else();
		}
		pass(condition, failAction) {
			this.failResult((0, codegen_1.not)(condition), void 0, failAction);
		}
		fail(condition) {
			if (condition === void 0) {
				this.error();
				if (!this.allErrors) this.gen.if(false);
				return;
			}
			this.gen.if(condition);
			this.error();
			if (this.allErrors) this.gen.endIf();
			else this.gen.else();
		}
		fail$data(condition) {
			if (!this.$data) return this.fail(condition);
			const { schemaCode } = this;
			this.fail((0, codegen_1._)`${schemaCode} !== undefined && (${(0, codegen_1.or)(this.invalid$data(), condition)})`);
		}
		error(append, errorParams, errorPaths) {
			if (errorParams) {
				this.setParams(errorParams);
				this._error(append, errorPaths);
				this.setParams({});
				return;
			}
			this._error(append, errorPaths);
		}
		_error(append, errorPaths) {
			(append ? errors_1.reportExtraError : errors_1.reportError)(this, this.def.error, errorPaths);
		}
		$dataError() {
			(0, errors_1.reportError)(this, this.def.$dataError || errors_1.keyword$DataError);
		}
		reset() {
			if (this.errsCount === void 0) throw new Error("add \"trackErrors\" to keyword definition");
			(0, errors_1.resetErrorsCount)(this.gen, this.errsCount);
		}
		ok(cond) {
			if (!this.allErrors) this.gen.if(cond);
		}
		setParams(obj, assign) {
			if (assign) Object.assign(this.params, obj);
			else this.params = obj;
		}
		block$data(valid, codeBlock, $dataValid = codegen_1.nil) {
			this.gen.block(() => {
				this.check$data(valid, $dataValid);
				codeBlock();
			});
		}
		check$data(valid = codegen_1.nil, $dataValid = codegen_1.nil) {
			if (!this.$data) return;
			const { gen, schemaCode, schemaType, def } = this;
			gen.if((0, codegen_1.or)((0, codegen_1._)`${schemaCode} === undefined`, $dataValid));
			if (valid !== codegen_1.nil) gen.assign(valid, true);
			if (schemaType.length || def.validateSchema) {
				gen.elseIf(this.invalid$data());
				this.$dataError();
				if (valid !== codegen_1.nil) gen.assign(valid, false);
			}
			gen.else();
		}
		invalid$data() {
			const { gen, schemaCode, schemaType, def, it } = this;
			return (0, codegen_1.or)(wrong$DataType(), invalid$DataSchema());
			function wrong$DataType() {
				if (schemaType.length) {
					/* istanbul ignore if */
					if (!(schemaCode instanceof codegen_1.Name)) throw new Error("ajv implementation error");
					const st = Array.isArray(schemaType) ? schemaType : [schemaType];
					return (0, codegen_1._)`${(0, dataType_2.checkDataTypes)(st, schemaCode, it.opts.strictNumbers, dataType_2.DataType.Wrong)}`;
				}
				return codegen_1.nil;
			}
			function invalid$DataSchema() {
				if (def.validateSchema) {
					const validateSchemaRef = gen.scopeValue("validate$data", { ref: def.validateSchema });
					return (0, codegen_1._)`!${validateSchemaRef}(${schemaCode})`;
				}
				return codegen_1.nil;
			}
		}
		subschema(appl, valid) {
			const subschema = (0, subschema_1.getSubschema)(this.it, appl);
			(0, subschema_1.extendSubschemaData)(subschema, this.it, appl);
			(0, subschema_1.extendSubschemaMode)(subschema, appl);
			const nextContext = {
				...this.it,
				...subschema,
				items: void 0,
				props: void 0
			};
			subschemaCode(nextContext, valid);
			return nextContext;
		}
		mergeEvaluated(schemaCxt, toName) {
			const { it, gen } = this;
			if (!it.opts.unevaluated) return;
			if (it.props !== true && schemaCxt.props !== void 0) it.props = util_1.mergeEvaluated.props(gen, schemaCxt.props, it.props, toName);
			if (it.items !== true && schemaCxt.items !== void 0) it.items = util_1.mergeEvaluated.items(gen, schemaCxt.items, it.items, toName);
		}
		mergeValidEvaluated(schemaCxt, valid) {
			const { it, gen } = this;
			if (it.opts.unevaluated && (it.props !== true || it.items !== true)) {
				gen.if(valid, () => this.mergeEvaluated(schemaCxt, codegen_1.Name));
				return true;
			}
		}
	};
	exports.KeywordCxt = KeywordCxt;
	function keywordCode(it, keyword, def, ruleType) {
		const cxt = new KeywordCxt(it, def, keyword);
		if ("code" in def) def.code(cxt, ruleType);
		else if (cxt.$data && def.validate) (0, keyword_1.funcKeywordCode)(cxt, def);
		else if ("macro" in def) (0, keyword_1.macroKeywordCode)(cxt, def);
		else if (def.compile || def.validate) (0, keyword_1.funcKeywordCode)(cxt, def);
	}
	const JSON_POINTER = /^\/(?:[^~]|~0|~1)*$/;
	const RELATIVE_JSON_POINTER = /^([0-9]+)(#|\/(?:[^~]|~0|~1)*)?$/;
	function getData($data, { dataLevel, dataNames, dataPathArr }) {
		let jsonPointer;
		let data;
		if ($data === "") return names_1.default.rootData;
		if ($data[0] === "/") {
			if (!JSON_POINTER.test($data)) throw new Error(`Invalid JSON-pointer: ${$data}`);
			jsonPointer = $data;
			data = names_1.default.rootData;
		} else {
			const matches = RELATIVE_JSON_POINTER.exec($data);
			if (!matches) throw new Error(`Invalid JSON-pointer: ${$data}`);
			const up = +matches[1];
			jsonPointer = matches[2];
			if (jsonPointer === "#") {
				if (up >= dataLevel) throw new Error(errorMsg("property/index", up));
				return dataPathArr[dataLevel - up];
			}
			if (up > dataLevel) throw new Error(errorMsg("data", up));
			data = dataNames[dataLevel - up];
			if (!jsonPointer) return data;
		}
		let expr = data;
		const segments = jsonPointer.split("/");
		for (const segment of segments) if (segment) {
			data = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)((0, util_1.unescapeJsonPointer)(segment))}`;
			expr = (0, codegen_1._)`${expr} && ${data}`;
		}
		return expr;
		function errorMsg(pointerType, up) {
			return `Cannot access ${pointerType} ${up} levels up, current level is ${dataLevel}`;
		}
	}
	exports.getData = getData;
}));
var require_validation_error = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	var ValidationError = class extends Error {
		constructor(errors) {
			super("validation failed");
			this.errors = errors;
			this.ajv = this.validation = true;
		}
	};
	exports.default = ValidationError;
}));
var require_ref_error = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	const resolve_1 = require_resolve();
	var MissingRefError = class extends Error {
		constructor(resolver, baseId, ref, msg) {
			super(msg || `can't resolve reference ${ref} from id ${baseId}`);
			this.missingRef = (0, resolve_1.resolveUrl)(resolver, baseId, ref);
			this.missingSchema = (0, resolve_1.normalizeId)((0, resolve_1.getFullPath)(resolver, this.missingRef));
		}
	};
	exports.default = MissingRefError;
}));
var require_compile = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.resolveSchema = exports.getCompilingSchema = exports.resolveRef = exports.compileSchema = exports.SchemaEnv = void 0;
	const codegen_1 = require_codegen();
	const validation_error_1 = require_validation_error();
	const names_1 = require_names();
	const resolve_1 = require_resolve();
	const util_1 = require_util();
	const validate_1 = require_validate();
	var SchemaEnv = class {
		constructor(env) {
			var _a;
			this.refs = {};
			this.dynamicAnchors = {};
			let schema;
			if (typeof env.schema == "object") schema = env.schema;
			this.schema = env.schema;
			this.schemaId = env.schemaId;
			this.root = env.root || this;
			this.baseId = (_a = env.baseId) !== null && _a !== void 0 ? _a : (0, resolve_1.normalizeId)(schema === null || schema === void 0 ? void 0 : schema[env.schemaId || "$id"]);
			this.schemaPath = env.schemaPath;
			this.localRefs = env.localRefs;
			this.meta = env.meta;
			this.$async = schema === null || schema === void 0 ? void 0 : schema.$async;
			this.refs = {};
		}
	};
	exports.SchemaEnv = SchemaEnv;
	function compileSchema(sch) {
		const _sch = getCompilingSchema.call(this, sch);
		if (_sch) return _sch;
		const rootId = (0, resolve_1.getFullPath)(this.opts.uriResolver, sch.root.baseId);
		const { es5, lines } = this.opts.code;
		const { ownProperties } = this.opts;
		const gen = new codegen_1.CodeGen(this.scope, {
			es5,
			lines,
			ownProperties
		});
		let _ValidationError;
		if (sch.$async) _ValidationError = gen.scopeValue("Error", {
			ref: validation_error_1.default,
			code: (0, codegen_1._)`require("ajv/dist/runtime/validation_error").default`
		});
		const validateName = gen.scopeName("validate");
		sch.validateName = validateName;
		const schemaCxt = {
			gen,
			allErrors: this.opts.allErrors,
			data: names_1.default.data,
			parentData: names_1.default.parentData,
			parentDataProperty: names_1.default.parentDataProperty,
			dataNames: [names_1.default.data],
			dataPathArr: [codegen_1.nil],
			dataLevel: 0,
			dataTypes: [],
			definedProperties: /* @__PURE__ */ new Set(),
			topSchemaRef: gen.scopeValue("schema", this.opts.code.source === true ? {
				ref: sch.schema,
				code: (0, codegen_1.stringify)(sch.schema)
			} : { ref: sch.schema }),
			validateName,
			ValidationError: _ValidationError,
			schema: sch.schema,
			schemaEnv: sch,
			rootId,
			baseId: sch.baseId || rootId,
			schemaPath: codegen_1.nil,
			errSchemaPath: sch.schemaPath || (this.opts.jtd ? "" : "#"),
			errorPath: (0, codegen_1._)`""`,
			opts: this.opts,
			self: this
		};
		let sourceCode;
		try {
			this._compilations.add(sch);
			(0, validate_1.validateFunctionCode)(schemaCxt);
			gen.optimize(this.opts.code.optimize);
			const validateCode = gen.toString();
			sourceCode = `${gen.scopeRefs(names_1.default.scope)}return ${validateCode}`;
			if (this.opts.code.process) sourceCode = this.opts.code.process(sourceCode, sch);
			const validate = new Function(`${names_1.default.self}`, `${names_1.default.scope}`, sourceCode)(this, this.scope.get());
			this.scope.value(validateName, { ref: validate });
			validate.errors = null;
			validate.schema = sch.schema;
			validate.schemaEnv = sch;
			if (sch.$async) validate.$async = true;
			if (this.opts.code.source === true) validate.source = {
				validateName,
				validateCode,
				scopeValues: gen._values
			};
			if (this.opts.unevaluated) {
				const { props, items } = schemaCxt;
				validate.evaluated = {
					props: props instanceof codegen_1.Name ? void 0 : props,
					items: items instanceof codegen_1.Name ? void 0 : items,
					dynamicProps: props instanceof codegen_1.Name,
					dynamicItems: items instanceof codegen_1.Name
				};
				if (validate.source) validate.source.evaluated = (0, codegen_1.stringify)(validate.evaluated);
			}
			sch.validate = validate;
			return sch;
		} catch (e) {
			delete sch.validate;
			delete sch.validateName;
			if (sourceCode) this.logger.error("Error compiling schema, function code:", sourceCode);
			throw e;
		} finally {
			this._compilations.delete(sch);
		}
	}
	exports.compileSchema = compileSchema;
	function resolveRef(root, baseId, ref) {
		var _a;
		ref = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, ref);
		const schOrFunc = root.refs[ref];
		if (schOrFunc) return schOrFunc;
		let _sch = resolve.call(this, root, ref);
		if (_sch === void 0) {
			const schema = (_a = root.localRefs) === null || _a === void 0 ? void 0 : _a[ref];
			const { schemaId } = this.opts;
			if (schema) _sch = new SchemaEnv({
				schema,
				schemaId,
				root,
				baseId
			});
		}
		if (_sch === void 0) return;
		return root.refs[ref] = inlineOrCompile.call(this, _sch);
	}
	exports.resolveRef = resolveRef;
	function inlineOrCompile(sch) {
		if ((0, resolve_1.inlineRef)(sch.schema, this.opts.inlineRefs)) return sch.schema;
		return sch.validate ? sch : compileSchema.call(this, sch);
	}
	function getCompilingSchema(schEnv) {
		for (const sch of this._compilations) if (sameSchemaEnv(sch, schEnv)) return sch;
	}
	exports.getCompilingSchema = getCompilingSchema;
	function sameSchemaEnv(s1, s2) {
		return s1.schema === s2.schema && s1.root === s2.root && s1.baseId === s2.baseId;
	}
	function resolve(root, ref) {
		let sch;
		while (typeof (sch = this.refs[ref]) == "string") ref = sch;
		return sch || this.schemas[ref] || resolveSchema.call(this, root, ref);
	}
	function resolveSchema(root, ref) {
		const p = this.opts.uriResolver.parse(ref);
		const refPath = (0, resolve_1._getFullPath)(this.opts.uriResolver, p);
		let baseId = (0, resolve_1.getFullPath)(this.opts.uriResolver, root.baseId, void 0);
		if (Object.keys(root.schema).length > 0 && refPath === baseId) return getJsonPointer.call(this, p, root);
		const id = (0, resolve_1.normalizeId)(refPath);
		const schOrRef = this.refs[id] || this.schemas[id];
		if (typeof schOrRef == "string") {
			const sch = resolveSchema.call(this, root, schOrRef);
			if (typeof (sch === null || sch === void 0 ? void 0 : sch.schema) !== "object") return;
			return getJsonPointer.call(this, p, sch);
		}
		if (typeof (schOrRef === null || schOrRef === void 0 ? void 0 : schOrRef.schema) !== "object") return;
		if (!schOrRef.validate) compileSchema.call(this, schOrRef);
		if (id === (0, resolve_1.normalizeId)(ref)) {
			const { schema } = schOrRef;
			const { schemaId } = this.opts;
			const schId = schema[schemaId];
			if (schId) baseId = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schId);
			return new SchemaEnv({
				schema,
				schemaId,
				root,
				baseId
			});
		}
		return getJsonPointer.call(this, p, schOrRef);
	}
	exports.resolveSchema = resolveSchema;
	const PREVENT_SCOPE_CHANGE = /* @__PURE__ */ new Set([
		"properties",
		"patternProperties",
		"enum",
		"dependencies",
		"definitions"
	]);
	function getJsonPointer(parsedRef, { baseId, schema, root }) {
		var _a;
		if (((_a = parsedRef.fragment) === null || _a === void 0 ? void 0 : _a[0]) !== "/") return;
		for (const part of parsedRef.fragment.slice(1).split("/")) {
			if (typeof schema === "boolean") return;
			const partSchema = schema[(0, util_1.unescapeFragment)(part)];
			if (partSchema === void 0) return;
			schema = partSchema;
			const schId = typeof schema === "object" && schema[this.opts.schemaId];
			if (!PREVENT_SCOPE_CHANGE.has(part) && schId) baseId = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schId);
		}
		let env;
		if (typeof schema != "boolean" && schema.$ref && !(0, util_1.schemaHasRulesButRef)(schema, this.RULES)) {
			const $ref = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schema.$ref);
			env = resolveSchema.call(this, root, $ref);
		}
		const { schemaId } = this.opts;
		env = env || new SchemaEnv({
			schema,
			schemaId,
			root,
			baseId
		});
		if (env.schema !== env.root.schema) return env;
	}
}));
var require_data = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = {
		"$id": "https://raw.githubusercontent.com/ajv-validator/ajv/master/lib/refs/data.json#",
		"description": "Meta-schema for $data reference (JSON AnySchema extension proposal)",
		"type": "object",
		"required": ["$data"],
		"properties": { "$data": {
			"type": "string",
			"anyOf": [{ "format": "relative-json-pointer" }, { "format": "json-pointer" }]
		} },
		"additionalProperties": false
	};
}));
var require_utils = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	/** @type {(value: string) => boolean} */
	const isUUID = RegExp.prototype.test.bind(/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/iu);
	/** @type {(value: string) => boolean} */
	const isIPv4 = RegExp.prototype.test.bind(/^(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)$/u);
	/** @type {(value: string) => boolean} */
	const isPort = RegExp.prototype.test.bind(/^\d*$/u);
	/** @type {(value: string) => boolean} */
	const isHexPair = RegExp.prototype.test.bind(/^[\da-f]{2}$/iu);
	/** @type {(value: string) => boolean} */
	const isUnreserved = RegExp.prototype.test.bind(/^[\da-z\-._~]$/iu);
	/** @type {(value: string) => boolean} */
	const isPathCharacter = RegExp.prototype.test.bind(/^[A-Za-z0-9\-._~!$&'()*+,;=:@/]$/u);
	/** @type {(value: string) => boolean} */
	const isQueryFragmentCharacter = RegExp.prototype.test.bind(/^[A-Za-z0-9\-._~!$&'()*+,;=:@/?]$/u);
	/** @type {(value: string) => boolean} */
	const isUserinfoCharacter = RegExp.prototype.test.bind(/^[A-Za-z0-9\-._~!$&'()*+,;=:]$/u);
	const BYTE_HEX = new Array(256);
	{
		const HEX_DIGITS = "0123456789ABCDEF";
		for (let i = 0; i < 256; i++) BYTE_HEX[i] = "%" + HEX_DIGITS[i >> 4] + HEX_DIGITS[i & 15];
	}
	function percentEncodeNonAscii(cp) {
		if (cp < 2048) return BYTE_HEX[192 | cp >> 6] + BYTE_HEX[128 | cp & 63];
		if (cp < 65536) return BYTE_HEX[224 | cp >> 12] + BYTE_HEX[128 | cp >> 6 & 63] + BYTE_HEX[128 | cp & 63];
		return BYTE_HEX[240 | cp >> 18] + BYTE_HEX[128 | cp >> 12 & 63] + BYTE_HEX[128 | cp >> 6 & 63] + BYTE_HEX[128 | cp & 63];
	}
	/**
	* @param {Array<string>} input
	* @returns {string}
	*/
	function stringArrayToHexStripped(input) {
		let acc = "";
		let code = 0;
		let i = 0;
		for (i = 0; i < input.length; i++) {
			code = input[i].charCodeAt(0);
			if (code === 48) continue;
			if (!(code >= 48 && code <= 57 || code >= 65 && code <= 70 || code >= 97 && code <= 102)) return "";
			acc += input[i];
			break;
		}
		for (i += 1; i < input.length; i++) {
			code = input[i].charCodeAt(0);
			if (!(code >= 48 && code <= 57 || code >= 65 && code <= 70 || code >= 97 && code <= 102)) return "";
			acc += input[i];
		}
		return acc;
	}
	/** @type {(value: string) => boolean} */
	const isHextet = RegExp.prototype.test.bind(/^[\dA-Fa-f]{1,4}$/);
	/** @type {(value: string) => boolean} */
	const isIPvFuture = RegExp.prototype.test.bind(/^[vV][\dA-Fa-f]+\.[A-Za-z\d\-._~!$&'()*+,;=:]+$/);
	/** @type {(value: string) => boolean} */
	const isZoneCharacter = RegExp.prototype.test.bind(/^[A-Za-z\d\-._~]$/);
	/**
	* @param {string} value
	* @returns {boolean}
	*/
	const nonSimpleDomain = RegExp.prototype.test.bind(/[^!"$&'()*+,\-.;=_`a-z{}~]/u);
	/**
	* @param {string} zone
	* @returns {boolean}
	*/
	function isZoneIdentifier(zone) {
		if (zone.length === 0) return false;
		for (let i = 0; i < zone.length; i++) {
			if (isZoneCharacter(zone[i])) continue;
			if (zone[i] === "%" && i + 2 < zone.length && isHexPair(zone.slice(i + 1, i + 3))) {
				i += 2;
				continue;
			}
			return false;
		}
		return true;
	}
	/**
	* Compresses the longest run of zero hextets to "::" per RFC 5952. A run of a
	* single zero hextet is left uncompressed. On ties the leftmost run wins.
	*
	* @param {string[]} hextets
	* @returns {string}
	*/
	function compressIPv6ZeroRun(hextets) {
		let bestStart = -1;
		let bestLength = 0;
		let runStart = -1;
		let runLength = 0;
		for (let i = 0; i < hextets.length; i++) if (hextets[i] === "0") {
			if (runStart === -1) runStart = i;
			runLength++;
			if (runLength > bestLength) {
				bestLength = runLength;
				bestStart = runStart;
			}
		} else {
			runStart = -1;
			runLength = 0;
		}
		if (bestLength < 2) return hextets.join(":");
		const head = hextets.slice(0, bestStart).join(":");
		const tail = hextets.slice(bestStart + bestLength).join(":");
		return head + "::" + tail;
	}
	/**
	* Validates an IPv6 address against the alternatives in RFC 3986 section
	* 3.2.2 and returns the same address with leading hextet zeroes removed.
	* An embedded IPv4 address counts as two hextets and is only valid at the end.
	*
	* @param {string} input
	* @returns {string|undefined}
	*/
	function normalizeIPv6Address(input) {
		const compression = input.indexOf("::");
		if (compression !== -1 && input.indexOf("::", compression + 1) !== -1) return void 0;
		const left = compression === -1 ? input.split(":") : input.slice(0, compression).split(":");
		const right = compression === -1 ? [] : input.slice(compression + 2).split(":");
		if (compression !== -1) {
			if (left.length === 1 && left[0] === "") left.length = 0;
			if (right.length === 1 && right[0] === "") right.length = 0;
		}
		const parts = left.concat(right);
		let hextetCount = 0;
		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];
			if (part === "") return void 0;
			if (part.indexOf(".") !== -1) {
				if (i !== parts.length - 1 || compression !== -1 && right.length === 0 || !isIPv4(part)) return void 0;
				hextetCount += 2;
				continue;
			}
			if (!isHextet(part)) return void 0;
			parts[i] = parseInt(part, 16).toString(16);
			hextetCount++;
		}
		if (compression === -1) {
			if (hextetCount !== 8) return void 0;
			return compressIPv6ZeroRun(parts);
		}
		if (hextetCount >= 8) return void 0;
		const expanded = parts.slice(0, left.length);
		for (let i = hextetCount; i < 8; i++) expanded.push("0");
		for (let i = left.length; i < parts.length; i++) expanded.push(parts[i]);
		return compressIPv6ZeroRun(expanded);
	}
	/**
	* @typedef {Object} NormalizeIPv6Result
	* @property {string} host - The normalized host.
	* @property {string} [escapedHost] - The escaped host.
	* @property {boolean} isIPV6 - Indicates if the host is an IPv6 address.
	* @property {boolean} [isIPVFuture] - Indicates if the host is an IPvFuture literal.
	* @property {boolean} [error] - Indicates if a bracketed IP literal is malformed.
	*/
	/**
	* Validates and normalizes a bracketed IP literal. Raw zone separators remain
	* accepted for backwards compatibility, while encoded separators and zone
	* contents follow RFC 6874.
	*
	* @param {string} host
	* @returns {NormalizeIPv6Result}
	*/
	function normalizeIPv6(host) {
		const bracketed = host[0] === "[" && host[host.length - 1] === "]";
		if ((host[0] === "[" || host[host.length - 1] === "]") && !bracketed) return {
			host,
			isIPV6: false,
			error: true
		};
		let input = bracketed ? host.slice(1, -1) : host;
		if (bracketed && isIPvFuture(input)) {
			input = input.toLowerCase();
			return {
				host: `[${input}]`,
				escapedHost: input,
				isIPV6: false,
				isIPVFuture: true
			};
		}
		if (findToken(input, ":") < 2) return {
			host,
			isIPV6: false,
			error: bracketed
		};
		let zoneIdentifier = "";
		const zoneSeparator = input.indexOf("%");
		if (zoneSeparator !== -1) {
			const separatorLength = input.slice(zoneSeparator, zoneSeparator + 3).toLowerCase() === "%25" ? 3 : 1;
			zoneIdentifier = input.slice(zoneSeparator + separatorLength);
			if (!isZoneIdentifier(zoneIdentifier)) return {
				host,
				isIPV6: false,
				error: true
			};
			input = input.slice(0, zoneSeparator);
		}
		const address = normalizeIPv6Address(input);
		if (address === void 0) return {
			host,
			isIPV6: false,
			error: true
		};
		return {
			host: address + (zoneIdentifier ? "%" + zoneIdentifier : ""),
			escapedHost: address + (zoneIdentifier ? "%25" + zoneIdentifier : ""),
			isIPV6: true
		};
	}
	/**
	* @param {string} str
	* @param {string} token
	* @returns {number}
	*/
	function findToken(str, token) {
		let ind = 0;
		for (let i = 0; i < str.length; i++) if (str[i] === token) ind++;
		return ind;
	}
	/**
	* @param {string} path
	* @returns {string}
	*
	* @see https://datatracker.ietf.org/doc/html/rfc3986#section-5.2.4
	*/
	function removeDotSegments(path) {
		let input = path;
		const output = [];
		let nextSlash = -1;
		let len = 0;
		while (len = input.length) {
			if (len === 1) if (input === ".") break;
			else if (input === "/") {
				output.push("/");
				break;
			} else {
				output.push(input);
				break;
			}
			else if (len === 2) {
				if (input[0] === ".") {
					if (input[1] === ".") break;
					else if (input[1] === "/") {
						input = input.slice(2);
						continue;
					}
				} else if (input[0] === "/") {
					if (input[1] === "." || input[1] === "/") {
						output.push("/");
						break;
					}
				}
			} else if (len === 3) {
				if (input === "/..") {
					if (output.length !== 0) output.pop();
					output.push("/");
					break;
				}
			}
			if (input[0] === ".") {
				if (input[1] === ".") {
					if (input[2] === "/") {
						input = input.slice(3);
						continue;
					}
				} else if (input[1] === "/") {
					input = input.slice(2);
					continue;
				}
			} else if (input[0] === "/") {
				if (input[1] === ".") {
					if (input[2] === "/") {
						input = input.slice(2);
						continue;
					} else if (input[2] === ".") {
						if (input[3] === "/") {
							input = input.slice(3);
							if (output.length !== 0) output.pop();
							continue;
						}
					}
				}
			}
			if ((nextSlash = input.indexOf("/", 1)) === -1) {
				output.push(input);
				break;
			} else {
				output.push(input.slice(0, nextSlash));
				input = input.slice(nextSlash);
			}
		}
		return output.join("");
	}
	/**
	* Re-escape RFC 3986 gen-delims that must not appear literally in the host.
	* After the URI regex parses, these characters cannot be literal in the host
	* field, so any that appear after decoding came from percent-encoding and
	* must be restored to prevent authority structure changes.
	*
	* @param {string} host
	* @param {boolean} isIP - true for IPv4/IPv6 hosts (skip colon re-escaping)
	* @returns {string}
	*/
	const HOST_DELIMS = {
		"@": "%40",
		"/": "%2F",
		"?": "%3F",
		"#": "%23",
		":": "%3A"
	};
	const HOST_DELIM_RE = /[@/?#:]/g;
	const HOST_DELIM_NO_COLON_RE = /[@/?#]/g;
	function reescapeHostDelimiters(host, isIP) {
		const re = isIP ? HOST_DELIM_NO_COLON_RE : HOST_DELIM_RE;
		re.lastIndex = 0;
		return host.replace(re, (ch) => HOST_DELIMS[ch]);
	}
	/**
	* Normalizes percent escapes and optionally decodes only unreserved ASCII bytes.
	* Reserved delimiters such as `%2F` stay escaped; `%2E` is unreserved.
	*
	* @param {string} input
	* @param {boolean} [decodeUnreserved=false]
	* @returns {string}
	*/
	function normalizePercentEncoding(input, decodeUnreserved = false) {
		if (input.indexOf("%") === -1) return input;
		let output = "";
		for (let i = 0; i < input.length; i++) {
			if (input[i] === "%" && i + 2 < input.length) {
				const hex = input.slice(i + 1, i + 3);
				if (isHexPair(hex)) {
					const normalizedHex = hex.toUpperCase();
					const decoded = String.fromCharCode(parseInt(normalizedHex, 16));
					if (decodeUnreserved && isUnreserved(decoded)) output += decoded;
					else output += "%" + normalizedHex;
					i += 2;
					continue;
				}
			}
			output += input[i];
		}
		return output;
	}
	/**
	* Normalizes path data without turning reserved escapes into live path syntax.
	* Valid escapes are uppercased, raw unsafe characters are escaped, and only
	* unreserved bytes that are not `.` are decoded.
	*
	* @param {string} input
	* @returns {string}
	*/
	function normalizePathEncoding(input) {
		let output = "";
		for (let i = 0; i < input.length; i++) {
			const ch = input[i];
			if (ch === "%" && i + 2 < input.length) {
				const hex = input.slice(i + 1, i + 3);
				if (isHexPair(hex)) {
					const normalizedHex = hex.toUpperCase();
					const decoded = String.fromCharCode(parseInt(normalizedHex, 16));
					if (decoded !== "." && isUnreserved(decoded)) output += decoded;
					else output += "%" + normalizedHex;
					i += 2;
					continue;
				}
			}
			if (isPathCharacter(ch)) output += ch;
			else {
				const code = input.charCodeAt(i);
				if (code < 128) output += isEscapeSafe(code) ? ch : BYTE_HEX[code];
				else if (code < 55296 || code > 57343) output += percentEncodeNonAscii(code);
				else if (code <= 56319 && i + 1 < input.length) {
					const low = input.charCodeAt(i + 1);
					if (low >= 56320 && low <= 57343) {
						output += percentEncodeNonAscii(65536 + (code - 55296 << 10) + (low - 56320));
						i++;
					} else output += percentEncodeNonAscii(65533);
				} else output += percentEncodeNonAscii(65533);
			}
		}
		return output;
	}
	/**
	* Serializes a path without rewriting reserved data. Raw RFC 3986 path
	* characters remain literal, valid escapes are preserved and uppercased, and
	* everything else is UTF-8 percent-encoded. In a path-noscheme, a colon in the
	* first segment must be escaped so the result cannot be parsed as a scheme.
	*
	* @param {string} input
	* @param {boolean} [pathNoScheme=false]
	* @returns {string}
	*/
	function serializePathEncoding(input, pathNoScheme = false) {
		let output = "";
		let firstSegment = pathNoScheme && input[0] !== "/";
		for (let i = 0; i < input.length; i++) {
			const ch = input[i];
			if (ch === "%" && i + 2 < input.length) {
				const hex = input.slice(i + 1, i + 3);
				if (isHexPair(hex)) {
					output += "%" + hex.toUpperCase();
					i += 2;
					continue;
				}
			}
			if (ch === "/") firstSegment = false;
			if (isPathCharacter(ch) && (ch !== ":" || !firstSegment)) output += ch;
			else {
				const code = input.charCodeAt(i);
				if (code < 128) output += BYTE_HEX[code];
				else if (code < 55296 || code > 57343) output += percentEncodeNonAscii(code);
				else if (code <= 56319 && i + 1 < input.length) {
					const low = input.charCodeAt(i + 1);
					if (low >= 56320 && low <= 57343) {
						output += percentEncodeNonAscii(65536 + (code - 55296 << 10) + (low - 56320));
						i++;
					} else output += percentEncodeNonAscii(65533);
				} else output += percentEncodeNonAscii(65533);
			}
		}
		return output;
	}
	/**
	* Percent-encodes a URI component using its RFC 3986 literal character set.
	* Existing valid escapes are preserved and normalized to uppercase hex.
	*
	* @param {string} input
	* @param {(value: string) => boolean} isAllowed
	* @returns {string}
	*/
	function encodeComponent(input, isAllowed) {
		let output = "";
		for (let i = 0; i < input.length; i++) {
			const ch = input[i];
			if (ch === "%" && i + 2 < input.length) {
				const hex = input.slice(i + 1, i + 3);
				if (isHexPair(hex)) {
					output += "%" + hex.toUpperCase();
					i += 2;
					continue;
				}
			}
			if (isAllowed(ch)) output += ch;
			else {
				const code = input.charCodeAt(i);
				if (code < 128) output += BYTE_HEX[code];
				else if (code < 55296 || code > 57343) output += percentEncodeNonAscii(code);
				else if (code <= 56319 && i + 1 < input.length) {
					const low = input.charCodeAt(i + 1);
					if (low >= 56320 && low <= 57343) {
						output += percentEncodeNonAscii(65536 + (code - 55296 << 10) + (low - 56320));
						i++;
					} else output += percentEncodeNonAscii(65533);
				} else output += percentEncodeNonAscii(65533);
			}
		}
		return output;
	}
	/**
	* Encodes userinfo while preserving its RFC 3986 §3.2.1 literal characters.
	* In particular, authority delimiters such as `@`, `/`, `?`, and `#` are data.
	*
	* @param {string} input
	* @returns {string}
	*/
	function encodeUserinfo(input) {
		return encodeComponent(input, isUserinfoCharacter);
	}
	/**
	* Encodes query data using the RFC 3986 §3.4 grammar. A literal `#` must be
	* escaped because it would otherwise begin the fragment component.
	*
	* @param {string} input
	* @returns {string}
	*/
	function encodeQuery(input) {
		return encodeComponent(input, isQueryFragmentCharacter);
	}
	/**
	* Encodes fragment data using the RFC 3986 §3.5 grammar.
	*
	* @param {string} input
	* @returns {string}
	*/
	function encodeFragment(input) {
		return encodeComponent(input, isQueryFragmentCharacter);
	}
	function isEscapeSafe(cp) {
		return cp >= 48 && cp <= 57 || cp >= 65 && cp <= 90 || cp >= 97 && cp <= 122 || cp === 42 || cp === 43 || cp === 45 || cp === 46 || cp === 47 || cp === 64 || cp === 95;
	}
	/**
	* Normalizes the percent-encoding of a query or fragment component.
	*
	* Like `normalizePathEncoding`, but uses the query/fragment character set
	* (which additionally allows `?`) and decodes `.` since it has no dot-segment
	* meaning outside of a path.
	*
	* @param {string} input
	* @returns {string}
	*/
	function normalizeQueryFragmentEncoding(input) {
		let output = "";
		for (let i = 0; i < input.length; i++) {
			const ch = input[i];
			if (ch === "%" && i + 2 < input.length) {
				const hex = input.slice(i + 1, i + 3);
				if (isHexPair(hex)) {
					const normalizedHex = hex.toUpperCase();
					const decoded = String.fromCharCode(parseInt(normalizedHex, 16));
					if (isUnreserved(decoded)) output += decoded;
					else output += "%" + normalizedHex;
					i += 2;
					continue;
				}
			}
			if (isQueryFragmentCharacter(ch)) output += ch;
			else {
				const code = input.charCodeAt(i);
				if (code < 128) output += isEscapeSafe(code) ? ch : BYTE_HEX[code];
				else if (code < 55296 || code > 57343) output += percentEncodeNonAscii(code);
				else if (code <= 56319 && i + 1 < input.length) {
					const low = input.charCodeAt(i + 1);
					if (low >= 56320 && low <= 57343) {
						output += percentEncodeNonAscii(65536 + (code - 55296 << 10) + (low - 56320));
						i++;
					} else output += percentEncodeNonAscii(65533);
				} else output += percentEncodeNonAscii(65533);
			}
		}
		return output;
	}
	/**
	* Escapes a component while preserving existing valid percent escapes.
	*
	* @param {string} input
	* @returns {string}
	*/
	function escapePreservingEscapes(input) {
		let output = "";
		for (let i = 0; i < input.length; i++) {
			if (input[i] === "%" && i + 2 < input.length) {
				const hex = input.slice(i + 1, i + 3);
				if (isHexPair(hex)) {
					output += "%" + hex.toUpperCase();
					i += 2;
					continue;
				}
			}
			output += escape(input[i]);
		}
		return output;
	}
	/**
	* @param {import('../types/index').URIComponent} component
	* @returns {string|undefined}
	*/
	function recomposeAuthority(component) {
		const uriTokens = [];
		if (component.userinfo !== void 0) {
			uriTokens.push(encodeUserinfo(component.userinfo));
			uriTokens.push("@");
		}
		if (component.host !== void 0) {
			let host = component.host;
			if (!isIPv4(host)) {
				let ipV6res = normalizeIPv6(host);
				if (ipV6res.isIPV6 !== true && ipV6res.isIPVFuture !== true) {
					host = normalizePercentEncoding(host, true);
					ipV6res = normalizeIPv6(host);
				}
				if (ipV6res.isIPV6 === true || ipV6res.isIPVFuture === true) host = `[${ipV6res.escapedHost}]`;
				else host = reescapeHostDelimiters(host, false);
			}
			uriTokens.push(host);
		}
		if (typeof component.port === "number" || typeof component.port === "string") {
			const port = String(component.port);
			if (!isPort(port)) throw new TypeError("URI port is malformed.");
			uriTokens.push(":");
			uriTokens.push(port);
		}
		return uriTokens.length ? uriTokens.join("") : void 0;
	}
	module.exports = {
		nonSimpleDomain,
		recomposeAuthority,
		reescapeHostDelimiters,
		normalizePercentEncoding,
		normalizePathEncoding,
		serializePathEncoding,
		normalizeQueryFragmentEncoding,
		encodeUserinfo,
		encodeQuery,
		encodeFragment,
		escapePreservingEscapes,
		removeDotSegments,
		isIPv4,
		isUUID,
		normalizeIPv6,
		stringArrayToHexStripped
	};
}));
var require_schemes = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { isUUID } = require_utils();
	const URN_REG = /^([\da-z][\d\-a-z]{0,31}):((?:[\w!$'()*+,\-./:;=@]|%[\da-f]{2})+)$/iu;
	const supportedSchemeNames = [
		"http",
		"https",
		"ws",
		"wss",
		"urn",
		"urn:uuid"
	];
	/** @typedef {supportedSchemeNames[number]} SchemeName */
	/**
	* @param {string} name
	* @returns {name is SchemeName}
	*/
	function isValidSchemeName(name) {
		return supportedSchemeNames.indexOf(name) !== -1;
	}
	/**
	* @callback SchemeFn
	* @param {import('../types/index').URIComponent} component
	* @param {import('../types/index').Options} options
	* @returns {import('../types/index').URIComponent}
	*/
	/**
	* @typedef {Object} SchemeHandler
	* @property {SchemeName} scheme - The scheme name.
	* @property {boolean} [domainHost] - Indicates if the scheme supports domain hosts.
	* @property {SchemeFn} parse - Function to parse the URI component for this scheme.
	* @property {SchemeFn} serialize - Function to serialize the URI component for this scheme.
	* @property {boolean} [skipNormalize] - Indicates if normalization should be skipped for this scheme.
	* @property {boolean} [absolutePath] - Indicates if the scheme uses absolute paths.
	* @property {boolean} [unicodeSupport] - Indicates if the scheme supports Unicode.
	*/
	/**
	* @param {import('../types/index').URIComponent} wsComponent
	* @returns {boolean}
	*/
	function wsIsSecure(wsComponent) {
		if (wsComponent.secure === true) return true;
		else if (wsComponent.secure === false) return false;
		else if (wsComponent.scheme) return wsComponent.scheme.length === 3 && (wsComponent.scheme[0] === "w" || wsComponent.scheme[0] === "W") && (wsComponent.scheme[1] === "s" || wsComponent.scheme[1] === "S") && (wsComponent.scheme[2] === "s" || wsComponent.scheme[2] === "S");
		else return false;
	}
	/** @type {SchemeFn} */
	function httpParse(component) {
		if (!component.host) component.error = component.error || "HTTP URIs must have a host.";
		return component;
	}
	/** @type {SchemeFn} */
	function httpSerialize(component) {
		const secure = String(component.scheme).toLowerCase() === "https";
		if (component.port === (secure ? 443 : 80) || component.port === "") component.port = void 0;
		if (!component.path) component.path = "/";
		return component;
	}
	/** @type {SchemeFn} */
	function wsParse(wsComponent) {
		wsComponent.secure = wsIsSecure(wsComponent);
		wsComponent.resourceName = (wsComponent.path || "/") + (wsComponent.query ? "?" + wsComponent.query : "");
		wsComponent.path = void 0;
		wsComponent.query = void 0;
		return wsComponent;
	}
	/** @type {SchemeFn} */
	function wsSerialize(wsComponent) {
		if (wsComponent.port === (wsIsSecure(wsComponent) ? 443 : 80) || wsComponent.port === "") wsComponent.port = void 0;
		if (typeof wsComponent.secure === "boolean") {
			wsComponent.scheme = wsComponent.secure ? "wss" : "ws";
			wsComponent.secure = void 0;
		}
		if (wsComponent.resourceName) {
			const queryIndex = wsComponent.resourceName.indexOf("?");
			const path = queryIndex === -1 ? wsComponent.resourceName : wsComponent.resourceName.slice(0, queryIndex);
			wsComponent.path = path && path !== "/" ? path : void 0;
			wsComponent.query = queryIndex === -1 ? void 0 : wsComponent.resourceName.slice(queryIndex + 1);
			wsComponent.resourceName = void 0;
		}
		wsComponent.fragment = void 0;
		return wsComponent;
	}
	/** @type {SchemeFn} */
	function urnParse(urnComponent, options) {
		if (!urnComponent.path) {
			urnComponent.error = "URN can not be parsed";
			return urnComponent;
		}
		const matches = urnComponent.path.match(URN_REG);
		if (matches && matches[0] === urnComponent.path) {
			const scheme = options.scheme || urnComponent.scheme || "urn";
			urnComponent.nid = matches[1].toLowerCase();
			urnComponent.nss = matches[2];
			const schemeHandler = getSchemeHandler(`${scheme}:${options.nid || urnComponent.nid}`);
			urnComponent.path = void 0;
			if (schemeHandler) urnComponent = schemeHandler.parse(urnComponent, options);
		} else urnComponent.error = urnComponent.error || "URN can not be parsed.";
		return urnComponent;
	}
	/** @type {SchemeFn} */
	function urnSerialize(urnComponent, options) {
		if (urnComponent.nid === void 0) throw new Error("URN without nid cannot be serialized");
		const scheme = options.scheme || urnComponent.scheme || "urn";
		const nid = urnComponent.nid.toLowerCase();
		const schemeHandler = getSchemeHandler(`${scheme}:${options.nid || nid}`);
		if (schemeHandler) urnComponent = schemeHandler.serialize(urnComponent, options);
		const uriComponent = urnComponent;
		const nss = urnComponent.nss;
		uriComponent.path = `${nid || options.nid}:${nss}`;
		options.skipEscape = true;
		return uriComponent;
	}
	/** @type {SchemeFn} */
	function urnuuidParse(urnComponent, options) {
		const uuidComponent = urnComponent;
		uuidComponent.uuid = uuidComponent.nss;
		uuidComponent.nss = void 0;
		if (!options.tolerant && (!uuidComponent.uuid || !isUUID(uuidComponent.uuid))) uuidComponent.error = uuidComponent.error || "UUID is not valid.";
		return uuidComponent;
	}
	/** @type {SchemeFn} */
	function urnuuidSerialize(uuidComponent) {
		const urnComponent = uuidComponent;
		urnComponent.nss = (uuidComponent.uuid || "").toLowerCase();
		return urnComponent;
	}
	const http = {
		scheme: "http",
		domainHost: true,
		parse: httpParse,
		serialize: httpSerialize
	};
	const https = {
		scheme: "https",
		domainHost: http.domainHost,
		parse: httpParse,
		serialize: httpSerialize
	};
	const ws = {
		scheme: "ws",
		domainHost: true,
		parse: wsParse,
		serialize: wsSerialize
	};
	const SCHEMES = {
		http,
		https,
		ws,
		wss: {
			scheme: "wss",
			domainHost: ws.domainHost,
			parse: ws.parse,
			serialize: ws.serialize
		},
		urn: {
			scheme: "urn",
			parse: urnParse,
			serialize: urnSerialize,
			skipNormalize: true
		},
		"urn:uuid": {
			scheme: "urn:uuid",
			parse: urnuuidParse,
			serialize: urnuuidSerialize,
			skipNormalize: true
		}
	};
	Object.setPrototypeOf(SCHEMES, null);
	/**
	* @param {string|undefined} scheme
	* @returns {SchemeHandler|undefined}
	*/
	function getSchemeHandler(scheme) {
		return scheme && (SCHEMES[scheme] || SCHEMES[scheme.toLowerCase()]) || void 0;
	}
	module.exports = {
		wsIsSecure,
		SCHEMES,
		isValidSchemeName,
		getSchemeHandler
	};
}));
var require_fast_uri = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { normalizeIPv6, removeDotSegments, recomposeAuthority, normalizePercentEncoding, normalizePathEncoding, serializePathEncoding, normalizeQueryFragmentEncoding, encodeQuery, encodeFragment, reescapeHostDelimiters, isIPv4, nonSimpleDomain } = require_utils();
	const { SCHEMES, getSchemeHandler } = require_schemes();
	const VALID_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*$/u;
	const MALFORMED_SCHEME_ERROR = "URI scheme is malformed.";
	/**
	* @param {string} scheme
	* @returns {string}
	*/
	function decodeValidScheme(scheme) {
		const decodedScheme = unescape(String(scheme));
		if (!VALID_SCHEME.test(decodedScheme)) throw new TypeError(MALFORMED_SCHEME_ERROR);
		return decodedScheme;
	}
	/**
	* @template {import('./types/index').URIComponent|string} T
	* @param {T} uri
	* @param {import('./types/index').Options} [options]
	* @returns {T}
	*/
	function normalize(uri, options) {
		if (typeof uri === "string") uri = normalizeString(uri, options);
		else if (typeof uri === "object") uri = parse(serialize(uri, options), options);
		return uri;
	}
	/**
	* @param {string} baseURI
	* @param {string} relativeURI
	* @param {import('./types/index').Options} [options]
	* @returns {string}
	*/
	function resolve(baseURI, relativeURI, options) {
		const schemelessOptions = options ? Object.assign({ scheme: "null" }, options) : { scheme: "null" };
		const { parsed: baseParsed, malformedAuthorityOrPort: baseMalformed, malformedPercentEncoding: baseMalformedPercentEncoding, malformedSchemeSpecific: baseMalformedSchemeSpecific, malformedHost: baseMalformedHost, malformedScheme: baseMalformedScheme } = parseWithStatus(baseURI, schemelessOptions);
		const { parsed: relativeParsed, malformedAuthorityOrPort: relativeMalformed, malformedPercentEncoding: relativeMalformedPercentEncoding, malformedSchemeSpecific: relativeMalformedSchemeSpecific, malformedHost: relativeMalformedHost, malformedScheme: relativeMalformedScheme } = parseWithStatus(relativeURI, schemelessOptions);
		if (baseMalformed || relativeMalformed || baseMalformedPercentEncoding || relativeMalformedPercentEncoding || baseMalformedSchemeSpecific || relativeMalformedSchemeSpecific || baseMalformedHost || relativeMalformedHost || baseMalformedScheme || relativeMalformedScheme) throw new Error(baseParsed.error || relativeParsed.error || "URI is malformed.");
		const resolved = resolveComponent(baseParsed, relativeParsed, schemelessOptions, true);
		const resolvedSchemeHandler = getSchemeHandler(options && options.scheme || resolved.scheme);
		const resolvedHost = resolved.host;
		const resolvedHostIsIP = resolvedHost !== void 0 && resolvedHost !== "" && (isIPv4(resolvedHost) || normalizeIPv6(resolvedHost).isIPV6);
		canonicalizeHost(resolved, options || {}, resolvedSchemeHandler, resolvedHostIsIP);
		const encodedASCIIHost = resolvedHost && resolvedHost.indexOf("%") !== -1 && !/\P{ASCII}/u.test(resolvedHost);
		if (resolved.error && !encodedASCIIHost) throw new Error(resolved.error);
		schemelessOptions.skipEscape = true;
		return serialize(resolved, schemelessOptions);
	}
	/**
	* @param {import ('./types/index').URIComponent} base
	* @param {import ('./types/index').URIComponent} relative
	* @param {import('./types/index').Options} [options]
	* @param {boolean} [skipNormalization=false]
	* @returns {import ('./types/index').URIComponent}
	*/
	function resolveComponent(base, relative, options, skipNormalization) {
		/** @type {import('./types/index').URIComponent} */
		const target = {};
		if (!skipNormalization) {
			base = parse(serialize(base, options), options);
			relative = parse(serialize(relative, options), options);
		}
		options = options || {};
		if (!options.tolerant && relative.scheme) {
			target.scheme = relative.scheme;
			target.userinfo = relative.userinfo;
			target.host = relative.host;
			target.port = relative.port;
			target.path = removeDotSegments(relative.path || "");
			target.query = relative.query;
		} else {
			if (relative.userinfo !== void 0 || relative.host !== void 0 || relative.port !== void 0) {
				target.userinfo = relative.userinfo;
				target.host = relative.host;
				target.port = relative.port;
				target.path = removeDotSegments(relative.path || "");
				target.query = relative.query;
			} else {
				if (!relative.path) {
					target.path = base.path;
					if (relative.query !== void 0) target.query = relative.query;
					else target.query = base.query;
				} else {
					if (relative.path[0] === "/") target.path = removeDotSegments(relative.path);
					else {
						if ((base.userinfo !== void 0 || base.host !== void 0 || base.port !== void 0) && !base.path) target.path = "/" + relative.path;
						else if (!base.path) target.path = relative.path;
						else target.path = base.path.slice(0, base.path.lastIndexOf("/") + 1) + relative.path;
						target.path = removeDotSegments(target.path);
					}
					target.query = relative.query;
				}
				target.userinfo = base.userinfo;
				target.host = base.host;
				target.port = base.port;
			}
			target.scheme = base.scheme;
		}
		target.fragment = relative.fragment;
		return target;
	}
	/**
	* @param {import ('./types/index').URIComponent|string} uriA
	* @param {import ('./types/index').URIComponent|string} uriB
	* @param {import ('./types/index').Options} options
	* @returns {boolean}
	*/
	function equal(uriA, uriB, options) {
		const normalizedA = normalizeComparableURI(uriA, options);
		const normalizedB = normalizeComparableURI(uriB, options);
		return normalizedA !== void 0 && normalizedB !== void 0 && normalizedA === normalizedB;
	}
	/**
	* @param {Readonly<import('./types/index').URIComponent>} cmpts
	* @param {import('./types/index').Options} [opts]
	* @returns {string}
	*/
	function serialize(cmpts, opts) {
		const component = {
			host: cmpts.host,
			scheme: cmpts.scheme,
			userinfo: cmpts.userinfo,
			port: cmpts.port,
			path: cmpts.path,
			query: cmpts.query,
			nid: cmpts.nid,
			nss: cmpts.nss,
			uuid: cmpts.uuid,
			fragment: cmpts.fragment,
			reference: cmpts.reference,
			resourceName: cmpts.resourceName,
			secure: cmpts.secure,
			error: ""
		};
		const options = Object.assign({}, opts);
		const uriTokens = [];
		if (component.scheme) component.scheme = decodeValidScheme(component.scheme);
		const schemeHandler = getSchemeHandler(options.scheme || component.scheme);
		if (schemeHandler && schemeHandler.serialize) schemeHandler.serialize(component, options);
		const hasAuthority = component.userinfo !== void 0 || component.host !== void 0 || component.port !== void 0;
		const pathNoScheme = !options.skipEscape && component.scheme === void 0 && !hasAuthority;
		if (component.path !== void 0) if (!options.skipEscape) component.path = serializePathEncoding(component.path, pathNoScheme);
		else component.path = normalizePercentEncoding(component.path);
		if (options.reference !== "suffix" && component.scheme) {
			component.scheme = decodeValidScheme(component.scheme);
			uriTokens.push(component.scheme, ":");
		}
		const authority = recomposeAuthority(component);
		if (authority !== void 0) {
			if (options.reference !== "suffix") uriTokens.push("//");
			uriTokens.push(authority);
			if (component.path && component.path[0] !== "/") uriTokens.push("/");
		}
		if (component.path !== void 0) {
			let s = component.path;
			if (!options.absolutePath && (!schemeHandler || !schemeHandler.absolutePath)) s = removeDotSegments(s);
			if (pathNoScheme) s = serializePathEncoding(s, true);
			if (authority === void 0 && s[0] === "/" && s[1] === "/") s = "/%2F" + s.slice(2);
			uriTokens.push(s);
		}
		if (component.query !== void 0) uriTokens.push("?", encodeQuery(component.query));
		if (component.fragment !== void 0) uriTokens.push("#", encodeFragment(component.fragment));
		return uriTokens.join("");
	}
	const URI_PARSE = /^(?:([^#/:?]+):)?(?:\/\/((?:([^#/?@]*)@)?(\[[^#/?\]]+\]|[^#/:?]*)(?::(\d*))?))?([^#?]*)(?:\?([^#]*))?(?:#((?:.|[\n\r])*))?/u;
	const AUTHORITY_PREFIX = /^(?:[^#/:?]+:)?\/\/([^/?#]*)/;
	const AUTHORITY_INTRODUCER_REGION = /^(?:[^#/:?]+:)?([/\\\t\n\r]*)/;
	/**
	* @param {import('./types/index').URIComponent} parsed
	* @param {RegExpMatchArray} matches
	* @returns {string|undefined}
	*/
	function getParseError(parsed, matches) {
		if (matches[2] !== void 0 && parsed.path && parsed.path[0] !== "/") return "URI path must start with \"/\" when authority is present.";
		if (typeof parsed.port === "number" && (parsed.port < 0 || parsed.port > 65535)) return "URI port is malformed.";
	}
	/**
	* Checks percent syntax without decoding the represented octets. RFC 3986
	* percent-encoding is byte-oriented, so sequences such as `%FF` are valid even
	* though they are not independently valid UTF-8.
	*
	* @param {string|undefined} component
	* @returns {boolean}
	*/
	function hasMalformedPercentEncoding(component) {
		if (component === void 0) return false;
		let percent = component.indexOf("%");
		while (percent !== -1) {
			if (percent + 2 >= component.length || !/^[\da-f]{2}$/iu.test(component.slice(percent + 1, percent + 3))) return true;
			percent = component.indexOf("%", percent + 3);
		}
		return false;
	}
	/**
	* Whether the host is a bracketed IP literal (RFC 3986 `IP-literal`).
	* An unterminated `[` is not a literal, so it must still be validated as a
	* reg-name instead of being waved through as an IP.
	*
	* @param {string} host
	* @returns {boolean}
	*/
	function isIPLiteral(host) {
		return host[0] === "[" && host[host.length - 1] === "]";
	}
	/**
	* @param {RegExpMatchArray} matches
	* @returns {boolean}
	*/
	function hasMalformedComponentPercentEncoding(matches) {
		const host = matches[4];
		return hasMalformedPercentEncoding(matches[3]) || host !== void 0 && !isIPLiteral(host) && hasMalformedPercentEncoding(host) || hasMalformedPercentEncoding(matches[6]) || hasMalformedPercentEncoding(matches[7]) || hasMalformedPercentEncoding(matches[8]);
	}
	/**
	* @param {import('./types/index').URIComponent} parsed
	* @param {import('./types/index').Options} options
	* @param {{ domainHost?: boolean, unicodeSupport?: boolean }|undefined} schemeHandler
	* @param {boolean} isIP
	* @returns {boolean} whether host conversion failed
	*/
	function canonicalizeHost(parsed, options, schemeHandler, isIP) {
		if (!options.unicodeSupport && (!schemeHandler || !schemeHandler.unicodeSupport) && parsed.host && !isIPLiteral(parsed.host) && (options.domainHost || schemeHandler && schemeHandler.domainHost) && isIP === false && nonSimpleDomain(parsed.host)) try {
			parsed.host = new URL("http://" + parsed.host).hostname;
		} catch (e) {
			parsed.error = parsed.error || "Host's domain name can not be converted to ASCII: " + e;
			return true;
		}
		return false;
	}
	/**
	* @param {string} uri
	* @param {import('./types/index').Options} [opts]
	* @returns {{ parsed: import('./types/index').URIComponent, malformedAuthorityOrPort: boolean, malformedPercentEncoding: boolean, malformedSchemeSpecific: boolean, malformedHost: boolean, malformedScheme: boolean }}
	*/
	function parseWithStatus(uri, opts) {
		const options = Object.assign({}, opts);
		/** @type {import('./types/index').URIComponent} */
		const parsed = {
			scheme: void 0,
			userinfo: void 0,
			host: "",
			port: void 0,
			path: "",
			query: void 0,
			fragment: void 0
		};
		let malformedAuthorityOrPort = false;
		let malformedPercentEncoding = false;
		let malformedSchemeSpecific = false;
		let malformedHost = false;
		let malformedIPLiteral = false;
		let malformedScheme = false;
		let isIP = false;
		if (options.reference === "suffix") if (options.scheme) uri = options.scheme + ":" + uri;
		else uri = "//" + uri;
		const authorityMatch = uri.match(AUTHORITY_PREFIX);
		if (authorityMatch !== null && authorityMatch[1].indexOf("\\") !== -1) {
			parsed.error = "URI authority must not contain a literal backslash.";
			malformedAuthorityOrPort = true;
		}
		const introducerMatch = uri.match(AUTHORITY_INTRODUCER_REGION);
		if (introducerMatch !== null) {
			const region = introducerMatch[1];
			const normalizedRegion = region.replace(/[\t\n\r]/g, "");
			if (normalizedRegion.length >= 2) {
				if (normalizedRegion.slice(0, 2) !== "//") {
					parsed.error = parsed.error || "URI authority must not contain a literal backslash.";
					malformedAuthorityOrPort = true;
				} else if (region.length !== normalizedRegion.length) {
					parsed.error = parsed.error || "URI authority introducer must not contain whitespace.";
					malformedAuthorityOrPort = true;
				}
			}
		}
		const matches = uri.match(URI_PARSE);
		if (matches) {
			parsed.scheme = matches[1];
			parsed.userinfo = matches[3];
			parsed.host = matches[4];
			parsed.port = parseInt(matches[5], 10);
			parsed.path = matches[6] || "";
			parsed.query = matches[7];
			parsed.fragment = matches[8];
			if (parsed.scheme !== void 0) {
				const decodedScheme = unescape(parsed.scheme);
				if (VALID_SCHEME.test(decodedScheme)) parsed.scheme = decodedScheme.toLowerCase();
				else {
					parsed.error = parsed.error || MALFORMED_SCHEME_ERROR;
					malformedScheme = true;
				}
			}
			malformedPercentEncoding = hasMalformedComponentPercentEncoding(matches);
			if (malformedPercentEncoding) parsed.error = parsed.error || "URI contains malformed percent-encoding.";
			if (isNaN(parsed.port)) parsed.port = matches[5];
			const parseError = getParseError(parsed, matches);
			if (parseError !== void 0) {
				parsed.error = parsed.error || parseError;
				malformedAuthorityOrPort = true;
			}
			if (parsed.host) if (isIPv4(parsed.host) === false) {
				const bracketedIPLiteral = isIPLiteral(parsed.host);
				const hasIPLiteralBracket = parsed.host.indexOf("[") !== -1 || parsed.host.indexOf("]") !== -1;
				const ipv6result = normalizeIPv6(parsed.host);
				isIP = ipv6result.isIPV6 || ipv6result.isIPVFuture === true;
				malformedIPLiteral = hasIPLiteralBracket && (!bracketedIPLiteral || ipv6result.error === true);
				parsed.host = isIP ? ipv6result.host : ipv6result.host.toLowerCase();
				if (malformedIPLiteral) {
					parsed.error = parsed.error || "URI host is malformed.";
					malformedAuthorityOrPort = true;
				}
			} else isIP = true;
			if (parsed.scheme === void 0 && parsed.userinfo === void 0 && parsed.host === void 0 && parsed.port === void 0 && parsed.query === void 0 && !parsed.path) parsed.reference = "same-document";
			else if (parsed.scheme === void 0) parsed.reference = "relative";
			else if (parsed.fragment === void 0) parsed.reference = "absolute";
			else parsed.reference = "uri";
			if (options.reference && options.reference !== "suffix" && options.reference !== parsed.reference) parsed.error = parsed.error || "URI is not a " + options.reference + " reference.";
			const schemeHandler = getSchemeHandler(options.scheme || parsed.scheme);
			if (!malformedIPLiteral) malformedHost = canonicalizeHost(parsed, options, schemeHandler, isIP);
			if (uri.indexOf("%") !== -1 && parsed.host !== void 0 && !malformedIPLiteral) {
				let host = isIP ? parsed.host : normalizePercentEncoding(parsed.host, true);
				if (!isIP) host = normalizePercentEncoding(host.toLowerCase());
				parsed.host = reescapeHostDelimiters(host, isIP);
			}
			if (!schemeHandler || schemeHandler && !schemeHandler.skipNormalize) {
				if (parsed.path) parsed.path = normalizePathEncoding(parsed.path);
				if (parsed.query) parsed.query = normalizeQueryFragmentEncoding(parsed.query);
				if (parsed.fragment) parsed.fragment = normalizeQueryFragmentEncoding(parsed.fragment);
			}
			if (schemeHandler && schemeHandler.parse) {
				schemeHandler.parse(parsed, options);
				if (schemeHandler === SCHEMES.urn && parsed.nid === void 0) malformedSchemeSpecific = true;
			}
		} else parsed.error = parsed.error || "URI can not be parsed.";
		return {
			parsed,
			malformedAuthorityOrPort,
			malformedPercentEncoding,
			malformedSchemeSpecific,
			malformedHost,
			malformedScheme
		};
	}
	/**
	* @param {string} uri
	* @param {import('./types/index').Options} [opts]
	* @returns
	*/
	function parse(uri, opts) {
		return parseWithStatus(uri, opts).parsed;
	}
	/**
	* @param {string} uri
	* @param {import('./types/index').Options} [opts]
	* @returns {string}
	*/
	function normalizeString(uri, opts) {
		return normalizeStringWithStatus(uri, opts).normalized;
	}
	/**
	* @param {string} uri
	* @param {import('./types/index').Options} [opts]
	* @returns {{ normalized: string, malformedAuthorityOrPort: boolean, malformedPercentEncoding: boolean, malformedSchemeSpecific: boolean, malformedHost: boolean, malformedScheme: boolean }}
	*/
	function normalizeStringWithStatus(uri, opts) {
		const { parsed, malformedAuthorityOrPort, malformedPercentEncoding, malformedSchemeSpecific, malformedHost, malformedScheme } = parseWithStatus(uri, opts);
		return {
			normalized: malformedAuthorityOrPort || malformedPercentEncoding || malformedSchemeSpecific || malformedHost || malformedScheme ? uri : serialize(parsed, opts),
			malformedAuthorityOrPort,
			malformedPercentEncoding,
			malformedSchemeSpecific,
			malformedHost,
			malformedScheme
		};
	}
	/**
	* @param {import ('./types/index').URIComponent|string} uri
	* @param {import('./types/index').Options} [opts]
	* @returns {string|undefined}
	*/
	function normalizeComparableURI(uri, opts) {
		if (typeof uri !== "string" && typeof uri !== "object") return;
		let value;
		try {
			value = typeof uri === "string" ? uri : serialize(uri, opts);
		} catch {
			return;
		}
		const { normalized, malformedAuthorityOrPort, malformedPercentEncoding, malformedSchemeSpecific, malformedHost, malformedScheme } = normalizeStringWithStatus(value, opts);
		return malformedAuthorityOrPort || malformedPercentEncoding || malformedSchemeSpecific || malformedHost || malformedScheme ? void 0 : normalized;
	}
	const fastUri = {
		SCHEMES,
		normalize,
		resolve,
		resolveComponent,
		equal,
		serialize,
		parse
	};
	module.exports = fastUri;
	module.exports.default = fastUri;
	module.exports.fastUri = fastUri;
}));
var require_uri = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	const uri = require_fast_uri();
	uri.code = "require(\"ajv/dist/runtime/uri\").default";
	exports.default = uri;
}));
var require_core$3 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.CodeGen = exports.Name = exports.nil = exports.stringify = exports.str = exports._ = exports.KeywordCxt = void 0;
	var validate_1 = require_validate();
	Object.defineProperty(exports, "KeywordCxt", {
		enumerable: true,
		get: function() {
			return validate_1.KeywordCxt;
		}
	});
	var codegen_1 = require_codegen();
	Object.defineProperty(exports, "_", {
		enumerable: true,
		get: function() {
			return codegen_1._;
		}
	});
	Object.defineProperty(exports, "str", {
		enumerable: true,
		get: function() {
			return codegen_1.str;
		}
	});
	Object.defineProperty(exports, "stringify", {
		enumerable: true,
		get: function() {
			return codegen_1.stringify;
		}
	});
	Object.defineProperty(exports, "nil", {
		enumerable: true,
		get: function() {
			return codegen_1.nil;
		}
	});
	Object.defineProperty(exports, "Name", {
		enumerable: true,
		get: function() {
			return codegen_1.Name;
		}
	});
	Object.defineProperty(exports, "CodeGen", {
		enumerable: true,
		get: function() {
			return codegen_1.CodeGen;
		}
	});
	const validation_error_1 = require_validation_error();
	const ref_error_1 = require_ref_error();
	const rules_1 = require_rules();
	const compile_1 = require_compile();
	const codegen_2 = require_codegen();
	const resolve_1 = require_resolve();
	const dataType_1 = require_dataType();
	const util_1 = require_util();
	const $dataRefSchema = require_data();
	const uri_1 = require_uri();
	const defaultRegExp = (str, flags) => new RegExp(str, flags);
	defaultRegExp.code = "new RegExp";
	const META_IGNORE_OPTIONS = [
		"removeAdditional",
		"useDefaults",
		"coerceTypes"
	];
	const EXT_SCOPE_NAMES = /* @__PURE__ */ new Set([
		"validate",
		"serialize",
		"parse",
		"wrapper",
		"root",
		"schema",
		"keyword",
		"pattern",
		"formats",
		"validate$data",
		"func",
		"obj",
		"Error"
	]);
	const removedOptions = {
		errorDataPath: "",
		format: "`validateFormats: false` can be used instead.",
		nullable: "\"nullable\" keyword is supported by default.",
		jsonPointers: "Deprecated jsPropertySyntax can be used instead.",
		extendRefs: "Deprecated ignoreKeywordsWithRef can be used instead.",
		missingRefs: "Pass empty schema with $id that should be ignored to ajv.addSchema.",
		processCode: "Use option `code: {process: (code, schemaEnv: object) => string}`",
		sourceCode: "Use option `code: {source: true}`",
		strictDefaults: "It is default now, see option `strict`.",
		strictKeywords: "It is default now, see option `strict`.",
		uniqueItems: "\"uniqueItems\" keyword is always validated.",
		unknownFormats: "Disable strict mode or pass `true` to `ajv.addFormat` (or `formats` option).",
		cache: "Map is used as cache, schema object as key.",
		serialize: "Map is used as cache, schema object as key.",
		ajvErrors: "It is default now."
	};
	const deprecatedOptions = {
		ignoreKeywordsWithRef: "",
		jsPropertySyntax: "",
		unicode: "\"minLength\"/\"maxLength\" account for unicode characters by default."
	};
	const MAX_EXPRESSION = 200;
	function requiredOptions(o) {
		var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0;
		const s = o.strict;
		const _optz = (_a = o.code) === null || _a === void 0 ? void 0 : _a.optimize;
		const optimize = _optz === true || _optz === void 0 ? 1 : _optz || 0;
		const regExp = (_c = (_b = o.code) === null || _b === void 0 ? void 0 : _b.regExp) !== null && _c !== void 0 ? _c : defaultRegExp;
		const uriResolver = (_d = o.uriResolver) !== null && _d !== void 0 ? _d : uri_1.default;
		return {
			strictSchema: (_f = (_e = o.strictSchema) !== null && _e !== void 0 ? _e : s) !== null && _f !== void 0 ? _f : true,
			strictNumbers: (_h = (_g = o.strictNumbers) !== null && _g !== void 0 ? _g : s) !== null && _h !== void 0 ? _h : true,
			strictTypes: (_k = (_j = o.strictTypes) !== null && _j !== void 0 ? _j : s) !== null && _k !== void 0 ? _k : "log",
			strictTuples: (_m = (_l = o.strictTuples) !== null && _l !== void 0 ? _l : s) !== null && _m !== void 0 ? _m : "log",
			strictRequired: (_p = (_o = o.strictRequired) !== null && _o !== void 0 ? _o : s) !== null && _p !== void 0 ? _p : false,
			code: o.code ? {
				...o.code,
				optimize,
				regExp
			} : {
				optimize,
				regExp
			},
			loopRequired: (_q = o.loopRequired) !== null && _q !== void 0 ? _q : MAX_EXPRESSION,
			loopEnum: (_r = o.loopEnum) !== null && _r !== void 0 ? _r : MAX_EXPRESSION,
			meta: (_s = o.meta) !== null && _s !== void 0 ? _s : true,
			messages: (_t = o.messages) !== null && _t !== void 0 ? _t : true,
			inlineRefs: (_u = o.inlineRefs) !== null && _u !== void 0 ? _u : true,
			schemaId: (_v = o.schemaId) !== null && _v !== void 0 ? _v : "$id",
			addUsedSchema: (_w = o.addUsedSchema) !== null && _w !== void 0 ? _w : true,
			validateSchema: (_x = o.validateSchema) !== null && _x !== void 0 ? _x : true,
			validateFormats: (_y = o.validateFormats) !== null && _y !== void 0 ? _y : true,
			unicodeRegExp: (_z = o.unicodeRegExp) !== null && _z !== void 0 ? _z : true,
			int32range: (_0 = o.int32range) !== null && _0 !== void 0 ? _0 : true,
			uriResolver
		};
	}
	var Ajv = class {
		constructor(opts = {}) {
			this.schemas = {};
			this.refs = {};
			this.formats = {};
			this._compilations = /* @__PURE__ */ new Set();
			this._loading = {};
			this._cache = /* @__PURE__ */ new Map();
			opts = this.opts = {
				...opts,
				...requiredOptions(opts)
			};
			const { es5, lines } = this.opts.code;
			this.scope = new codegen_2.ValueScope({
				scope: {},
				prefixes: EXT_SCOPE_NAMES,
				es5,
				lines
			});
			this.logger = getLogger(opts.logger);
			const formatOpt = opts.validateFormats;
			opts.validateFormats = false;
			this.RULES = (0, rules_1.getRules)();
			checkOptions.call(this, removedOptions, opts, "NOT SUPPORTED");
			checkOptions.call(this, deprecatedOptions, opts, "DEPRECATED", "warn");
			this._metaOpts = getMetaSchemaOptions.call(this);
			if (opts.formats) addInitialFormats.call(this);
			this._addVocabularies();
			this._addDefaultMetaSchema();
			if (opts.keywords) addInitialKeywords.call(this, opts.keywords);
			if (typeof opts.meta == "object") this.addMetaSchema(opts.meta);
			addInitialSchemas.call(this);
			opts.validateFormats = formatOpt;
		}
		_addVocabularies() {
			this.addKeyword("$async");
		}
		_addDefaultMetaSchema() {
			const { $data, meta, schemaId } = this.opts;
			let _dataRefSchema = $dataRefSchema;
			if (schemaId === "id") {
				_dataRefSchema = { ...$dataRefSchema };
				_dataRefSchema.id = _dataRefSchema.$id;
				delete _dataRefSchema.$id;
			}
			if (meta && $data) this.addMetaSchema(_dataRefSchema, _dataRefSchema[schemaId], false);
		}
		defaultMeta() {
			const { meta, schemaId } = this.opts;
			return this.opts.defaultMeta = typeof meta == "object" ? meta[schemaId] || meta : void 0;
		}
		validate(schemaKeyRef, data) {
			let v;
			if (typeof schemaKeyRef == "string") {
				v = this.getSchema(schemaKeyRef);
				if (!v) throw new Error(`no schema with key or ref "${schemaKeyRef}"`);
			} else v = this.compile(schemaKeyRef);
			const valid = v(data);
			if (!("$async" in v)) this.errors = v.errors;
			return valid;
		}
		compile(schema, _meta) {
			const sch = this._addSchema(schema, _meta);
			return sch.validate || this._compileSchemaEnv(sch);
		}
		compileAsync(schema, meta) {
			if (typeof this.opts.loadSchema != "function") throw new Error("options.loadSchema should be a function");
			const { loadSchema } = this.opts;
			return runCompileAsync.call(this, schema, meta);
			async function runCompileAsync(_schema, _meta) {
				await loadMetaSchema.call(this, _schema.$schema);
				const sch = this._addSchema(_schema, _meta);
				return sch.validate || _compileAsync.call(this, sch);
			}
			async function loadMetaSchema($ref) {
				if ($ref && !this.getSchema($ref)) await runCompileAsync.call(this, { $ref }, true);
			}
			async function _compileAsync(sch) {
				try {
					return this._compileSchemaEnv(sch);
				} catch (e) {
					if (!(e instanceof ref_error_1.default)) throw e;
					checkLoaded.call(this, e);
					await loadMissingSchema.call(this, e.missingSchema);
					return _compileAsync.call(this, sch);
				}
			}
			function checkLoaded({ missingSchema: ref, missingRef }) {
				if (this.refs[ref]) throw new Error(`AnySchema ${ref} is loaded but ${missingRef} cannot be resolved`);
			}
			async function loadMissingSchema(ref) {
				const _schema = await _loadSchema.call(this, ref);
				if (!this.refs[ref]) await loadMetaSchema.call(this, _schema.$schema);
				if (!this.refs[ref]) this.addSchema(_schema, ref, meta);
			}
			async function _loadSchema(ref) {
				const p = this._loading[ref];
				if (p) return p;
				try {
					return await (this._loading[ref] = loadSchema(ref));
				} finally {
					delete this._loading[ref];
				}
			}
		}
		addSchema(schema, key, _meta, _validateSchema = this.opts.validateSchema) {
			if (Array.isArray(schema)) {
				for (const sch of schema) this.addSchema(sch, void 0, _meta, _validateSchema);
				return this;
			}
			let id;
			if (typeof schema === "object") {
				const { schemaId } = this.opts;
				id = schema[schemaId];
				if (id !== void 0 && typeof id != "string") throw new Error(`schema ${schemaId} must be string`);
			}
			key = (0, resolve_1.normalizeId)(key || id);
			this._checkUnique(key);
			this.schemas[key] = this._addSchema(schema, _meta, key, _validateSchema, true);
			return this;
		}
		addMetaSchema(schema, key, _validateSchema = this.opts.validateSchema) {
			this.addSchema(schema, key, true, _validateSchema);
			return this;
		}
		validateSchema(schema, throwOrLogError) {
			if (typeof schema == "boolean") return true;
			let $schema;
			$schema = schema.$schema;
			if ($schema !== void 0 && typeof $schema != "string") throw new Error("$schema must be a string");
			$schema = $schema || this.opts.defaultMeta || this.defaultMeta();
			if (!$schema) {
				this.logger.warn("meta-schema not available");
				this.errors = null;
				return true;
			}
			const valid = this.validate($schema, schema);
			if (!valid && throwOrLogError) {
				const message = "schema is invalid: " + this.errorsText();
				if (this.opts.validateSchema === "log") this.logger.error(message);
				else throw new Error(message);
			}
			return valid;
		}
		getSchema(keyRef) {
			let sch;
			while (typeof (sch = getSchEnv.call(this, keyRef)) == "string") keyRef = sch;
			if (sch === void 0) {
				const { schemaId } = this.opts;
				const root = new compile_1.SchemaEnv({
					schema: {},
					schemaId
				});
				sch = compile_1.resolveSchema.call(this, root, keyRef);
				if (!sch) return;
				this.refs[keyRef] = sch;
			}
			return sch.validate || this._compileSchemaEnv(sch);
		}
		removeSchema(schemaKeyRef) {
			if (schemaKeyRef instanceof RegExp) {
				this._removeAllSchemas(this.schemas, schemaKeyRef);
				this._removeAllSchemas(this.refs, schemaKeyRef);
				return this;
			}
			switch (typeof schemaKeyRef) {
				case "undefined":
					this._removeAllSchemas(this.schemas);
					this._removeAllSchemas(this.refs);
					this._cache.clear();
					return this;
				case "string": {
					const sch = getSchEnv.call(this, schemaKeyRef);
					if (typeof sch == "object") this._cache.delete(sch.schema);
					delete this.schemas[schemaKeyRef];
					delete this.refs[schemaKeyRef];
					return this;
				}
				case "object": {
					const cacheKey = schemaKeyRef;
					this._cache.delete(cacheKey);
					let id = schemaKeyRef[this.opts.schemaId];
					if (id) {
						id = (0, resolve_1.normalizeId)(id);
						delete this.schemas[id];
						delete this.refs[id];
					}
					return this;
				}
				default: throw new Error("ajv.removeSchema: invalid parameter");
			}
		}
		addVocabulary(definitions) {
			for (const def of definitions) this.addKeyword(def);
			return this;
		}
		addKeyword(kwdOrDef, def) {
			let keyword;
			if (typeof kwdOrDef == "string") {
				keyword = kwdOrDef;
				if (typeof def == "object") {
					this.logger.warn("these parameters are deprecated, see docs for addKeyword");
					def.keyword = keyword;
				}
			} else if (typeof kwdOrDef == "object" && def === void 0) {
				def = kwdOrDef;
				keyword = def.keyword;
				if (Array.isArray(keyword) && !keyword.length) throw new Error("addKeywords: keyword must be string or non-empty array");
			} else throw new Error("invalid addKeywords parameters");
			checkKeyword.call(this, keyword, def);
			if (!def) {
				(0, util_1.eachItem)(keyword, (kwd) => addRule.call(this, kwd));
				return this;
			}
			keywordMetaschema.call(this, def);
			const definition = {
				...def,
				type: (0, dataType_1.getJSONTypes)(def.type),
				schemaType: (0, dataType_1.getJSONTypes)(def.schemaType)
			};
			(0, util_1.eachItem)(keyword, definition.type.length === 0 ? (k) => addRule.call(this, k, definition) : (k) => definition.type.forEach((t) => addRule.call(this, k, definition, t)));
			return this;
		}
		getKeyword(keyword) {
			const rule = this.RULES.all[keyword];
			return typeof rule == "object" ? rule.definition : !!rule;
		}
		removeKeyword(keyword) {
			const { RULES } = this;
			delete RULES.keywords[keyword];
			delete RULES.all[keyword];
			for (const group of RULES.rules) {
				const i = group.rules.findIndex((rule) => rule.keyword === keyword);
				if (i >= 0) group.rules.splice(i, 1);
			}
			return this;
		}
		addFormat(name, format) {
			if (typeof format == "string") format = new RegExp(format);
			this.formats[name] = format;
			return this;
		}
		errorsText(errors = this.errors, { separator = ", ", dataVar = "data" } = {}) {
			if (!errors || errors.length === 0) return "No errors";
			return errors.map((e) => `${dataVar}${e.instancePath} ${e.message}`).reduce((text, msg) => text + separator + msg);
		}
		$dataMetaSchema(metaSchema, keywordsJsonPointers) {
			const rules = this.RULES.all;
			metaSchema = JSON.parse(JSON.stringify(metaSchema));
			for (const jsonPointer of keywordsJsonPointers) {
				const segments = jsonPointer.split("/").slice(1);
				let keywords = metaSchema;
				for (const seg of segments) keywords = keywords[seg];
				for (const key in rules) {
					const rule = rules[key];
					if (typeof rule != "object") continue;
					const { $data } = rule.definition;
					const schema = keywords[key];
					if ($data && schema) keywords[key] = schemaOrData(schema);
				}
			}
			return metaSchema;
		}
		_removeAllSchemas(schemas, regex) {
			for (const keyRef in schemas) {
				const sch = schemas[keyRef];
				if (!regex || regex.test(keyRef)) {
					if (typeof sch == "string") delete schemas[keyRef];
					else if (sch && !sch.meta) {
						this._cache.delete(sch.schema);
						delete schemas[keyRef];
					}
				}
			}
		}
		_addSchema(schema, meta, baseId, validateSchema = this.opts.validateSchema, addSchema = this.opts.addUsedSchema) {
			let id;
			const { schemaId } = this.opts;
			if (typeof schema == "object") id = schema[schemaId];
			else if (this.opts.jtd) throw new Error("schema must be object");
			else if (typeof schema != "boolean") throw new Error("schema must be object or boolean");
			let sch = this._cache.get(schema);
			if (sch !== void 0) return sch;
			baseId = (0, resolve_1.normalizeId)(id || baseId);
			const localRefs = resolve_1.getSchemaRefs.call(this, schema, baseId);
			sch = new compile_1.SchemaEnv({
				schema,
				schemaId,
				meta,
				baseId,
				localRefs
			});
			this._cache.set(sch.schema, sch);
			if (addSchema && !baseId.startsWith("#")) {
				if (baseId) this._checkUnique(baseId);
				this.refs[baseId] = sch;
			}
			if (validateSchema) this.validateSchema(schema, true);
			return sch;
		}
		_checkUnique(id) {
			if (this.schemas[id] || this.refs[id]) throw new Error(`schema with key or id "${id}" already exists`);
		}
		_compileSchemaEnv(sch) {
			if (sch.meta) this._compileMetaSchema(sch);
			else compile_1.compileSchema.call(this, sch);
			/* istanbul ignore if */
			if (!sch.validate) throw new Error("ajv implementation error");
			return sch.validate;
		}
		_compileMetaSchema(sch) {
			const currentOpts = this.opts;
			this.opts = this._metaOpts;
			try {
				compile_1.compileSchema.call(this, sch);
			} finally {
				this.opts = currentOpts;
			}
		}
	};
	Ajv.ValidationError = validation_error_1.default;
	Ajv.MissingRefError = ref_error_1.default;
	exports.default = Ajv;
	function checkOptions(checkOpts, options, msg, log = "error") {
		for (const key in checkOpts) {
			const opt = key;
			if (opt in options) this.logger[log](`${msg}: option ${key}. ${checkOpts[opt]}`);
		}
	}
	function getSchEnv(keyRef) {
		keyRef = (0, resolve_1.normalizeId)(keyRef);
		return this.schemas[keyRef] || this.refs[keyRef];
	}
	function addInitialSchemas() {
		const optsSchemas = this.opts.schemas;
		if (!optsSchemas) return;
		if (Array.isArray(optsSchemas)) this.addSchema(optsSchemas);
		else for (const key in optsSchemas) this.addSchema(optsSchemas[key], key);
	}
	function addInitialFormats() {
		for (const name in this.opts.formats) {
			const format = this.opts.formats[name];
			if (format) this.addFormat(name, format);
		}
	}
	function addInitialKeywords(defs) {
		if (Array.isArray(defs)) {
			this.addVocabulary(defs);
			return;
		}
		this.logger.warn("keywords option as map is deprecated, pass array");
		for (const keyword in defs) {
			const def = defs[keyword];
			if (!def.keyword) def.keyword = keyword;
			this.addKeyword(def);
		}
	}
	function getMetaSchemaOptions() {
		const metaOpts = { ...this.opts };
		for (const opt of META_IGNORE_OPTIONS) delete metaOpts[opt];
		return metaOpts;
	}
	const noLogs = {
		log() {},
		warn() {},
		error() {}
	};
	function getLogger(logger) {
		if (logger === false) return noLogs;
		if (logger === void 0) return console;
		if (logger.log && logger.warn && logger.error) return logger;
		throw new Error("logger must implement log, warn and error methods");
	}
	const KEYWORD_NAME = /^[a-z_$][a-z0-9_$:-]*$/i;
	function checkKeyword(keyword, def) {
		const { RULES } = this;
		(0, util_1.eachItem)(keyword, (kwd) => {
			if (RULES.keywords[kwd]) throw new Error(`Keyword ${kwd} is already defined`);
			if (!KEYWORD_NAME.test(kwd)) throw new Error(`Keyword ${kwd} has invalid name`);
		});
		if (!def) return;
		if (def.$data && !("code" in def || "validate" in def)) throw new Error("$data keyword must have \"code\" or \"validate\" function");
	}
	function addRule(keyword, definition, dataType) {
		var _a;
		const post = definition === null || definition === void 0 ? void 0 : definition.post;
		if (dataType && post) throw new Error("keyword with \"post\" flag cannot have \"type\"");
		const { RULES } = this;
		let ruleGroup = post ? RULES.post : RULES.rules.find(({ type: t }) => t === dataType);
		if (!ruleGroup) {
			ruleGroup = {
				type: dataType,
				rules: []
			};
			RULES.rules.push(ruleGroup);
		}
		RULES.keywords[keyword] = true;
		if (!definition) return;
		const rule = {
			keyword,
			definition: {
				...definition,
				type: (0, dataType_1.getJSONTypes)(definition.type),
				schemaType: (0, dataType_1.getJSONTypes)(definition.schemaType)
			}
		};
		if (definition.before) addBeforeRule.call(this, ruleGroup, rule, definition.before);
		else ruleGroup.rules.push(rule);
		RULES.all[keyword] = rule;
		(_a = definition.implements) === null || _a === void 0 || _a.forEach((kwd) => this.addKeyword(kwd));
	}
	function addBeforeRule(ruleGroup, rule, before) {
		const i = ruleGroup.rules.findIndex((_rule) => _rule.keyword === before);
		if (i >= 0) ruleGroup.rules.splice(i, 0, rule);
		else {
			ruleGroup.rules.push(rule);
			this.logger.warn(`rule ${before} is not defined`);
		}
	}
	function keywordMetaschema(def) {
		let { metaSchema } = def;
		if (metaSchema === void 0) return;
		if (def.$data && this.opts.$data) metaSchema = schemaOrData(metaSchema);
		def.validateSchema = this.compile(metaSchema, true);
	}
	const $dataRef = { $ref: "https://raw.githubusercontent.com/ajv-validator/ajv/master/lib/refs/data.json#" };
	function schemaOrData(schema) {
		return { anyOf: [schema, $dataRef] };
	}
}));
var require_id = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.default = {
		keyword: "id",
		code() {
			throw new Error("NOT SUPPORTED: keyword \"id\", use \"$id\" for schema ID");
		}
	};
}));
var require_ref = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.callRef = exports.getValidate = void 0;
	const ref_error_1 = require_ref_error();
	const code_1 = require_code();
	const codegen_1 = require_codegen();
	const names_1 = require_names();
	const compile_1 = require_compile();
	const util_1 = require_util();
	const def = {
		keyword: "$ref",
		schemaType: "string",
		code(cxt) {
			const { gen, schema: $ref, it } = cxt;
			const { baseId, schemaEnv: env, validateName, opts, self } = it;
			const { root } = env;
			if (($ref === "#" || $ref === "#/") && baseId === root.baseId) return callRootRef();
			const schOrEnv = compile_1.resolveRef.call(self, root, baseId, $ref);
			if (schOrEnv === void 0) throw new ref_error_1.default(it.opts.uriResolver, baseId, $ref);
			if (schOrEnv instanceof compile_1.SchemaEnv) return callValidate(schOrEnv);
			return inlineRefSchema(schOrEnv);
			function callRootRef() {
				if (env === root) return callRef(cxt, validateName, env, env.$async);
				const rootName = gen.scopeValue("root", { ref: root });
				return callRef(cxt, (0, codegen_1._)`${rootName}.validate`, root, root.$async);
			}
			function callValidate(sch) {
				callRef(cxt, getValidate(cxt, sch), sch, sch.$async);
			}
			function inlineRefSchema(sch) {
				const schName = gen.scopeValue("schema", opts.code.source === true ? {
					ref: sch,
					code: (0, codegen_1.stringify)(sch)
				} : { ref: sch });
				const valid = gen.name("valid");
				const schCxt = cxt.subschema({
					schema: sch,
					dataTypes: [],
					schemaPath: codegen_1.nil,
					topSchemaRef: schName,
					errSchemaPath: $ref
				}, valid);
				cxt.mergeEvaluated(schCxt);
				cxt.ok(valid);
			}
		}
	};
	function getValidate(cxt, sch) {
		const { gen } = cxt;
		return sch.validate ? gen.scopeValue("validate", { ref: sch.validate }) : (0, codegen_1._)`${gen.scopeValue("wrapper", { ref: sch })}.validate`;
	}
	exports.getValidate = getValidate;
	function callRef(cxt, v, sch, $async) {
		const { gen, it } = cxt;
		const { allErrors, schemaEnv: env, opts } = it;
		const passCxt = opts.passContext ? names_1.default.this : codegen_1.nil;
		if ($async) callAsyncRef();
		else callSyncRef();
		function callAsyncRef() {
			if (!env.$async) throw new Error("async schema referenced by sync schema");
			const valid = gen.let("valid");
			gen.try(() => {
				gen.code((0, codegen_1._)`await ${(0, code_1.callValidateCode)(cxt, v, passCxt)}`);
				addEvaluatedFrom(v);
				if (!allErrors) gen.assign(valid, true);
			}, (e) => {
				gen.if((0, codegen_1._)`!(${e} instanceof ${it.ValidationError})`, () => gen.throw(e));
				addErrorsFrom(e);
				if (!allErrors) gen.assign(valid, false);
			});
			cxt.ok(valid);
		}
		function callSyncRef() {
			cxt.result((0, code_1.callValidateCode)(cxt, v, passCxt), () => addEvaluatedFrom(v), () => addErrorsFrom(v));
		}
		function addErrorsFrom(source) {
			const errs = (0, codegen_1._)`${source}.errors`;
			gen.assign(names_1.default.vErrors, (0, codegen_1._)`${names_1.default.vErrors} === null ? ${errs} : ${names_1.default.vErrors}.concat(${errs})`);
			gen.assign(names_1.default.errors, (0, codegen_1._)`${names_1.default.vErrors}.length`);
		}
		function addEvaluatedFrom(source) {
			var _a;
			if (!it.opts.unevaluated) return;
			const schEvaluated = (_a = sch === null || sch === void 0 ? void 0 : sch.validate) === null || _a === void 0 ? void 0 : _a.evaluated;
			if (it.props !== true) if (schEvaluated && !schEvaluated.dynamicProps) {
				if (schEvaluated.props !== void 0) it.props = util_1.mergeEvaluated.props(gen, schEvaluated.props, it.props);
			} else {
				const props = gen.var("props", (0, codegen_1._)`${source}.evaluated.props`);
				it.props = util_1.mergeEvaluated.props(gen, props, it.props, codegen_1.Name);
			}
			if (it.items !== true) if (schEvaluated && !schEvaluated.dynamicItems) {
				if (schEvaluated.items !== void 0) it.items = util_1.mergeEvaluated.items(gen, schEvaluated.items, it.items);
			} else {
				const items = gen.var("items", (0, codegen_1._)`${source}.evaluated.items`);
				it.items = util_1.mergeEvaluated.items(gen, items, it.items, codegen_1.Name);
			}
		}
	}
	exports.callRef = callRef;
	exports.default = def;
}));
var require_core$2 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	const id_1 = require_id();
	const ref_1 = require_ref();
	exports.default = [
		"$schema",
		"$id",
		"$defs",
		"$vocabulary",
		{ keyword: "$comment" },
		"definitions",
		id_1.default,
		ref_1.default
	];
}));
var require_limitNumber = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	const codegen_1 = require_codegen();
	const ops = codegen_1.operators;
	const KWDs = {
		maximum: {
			okStr: "<=",
			ok: ops.LTE,
			fail: ops.GT
		},
		minimum: {
			okStr: ">=",
			ok: ops.GTE,
			fail: ops.LT
		},
		exclusiveMaximum: {
			okStr: "<",
			ok: ops.LT,
			fail: ops.GTE
		},
		exclusiveMinimum: {
			okStr: ">",
			ok: ops.GT,
			fail: ops.LTE
		}
	};
	exports.default = {
		keyword: Object.keys(KWDs),
		type: "number",
		schemaType: "number",
		$data: true,
		error: {
			message: ({ keyword, schemaCode }) => (0, codegen_1.str)`must be ${KWDs[keyword].okStr} ${schemaCode}`,
			params: ({ keyword, schemaCode }) => (0, codegen_1._)`{comparison: ${KWDs[keyword].okStr}, limit: ${schemaCode}}`
		},
		code(cxt) {
			const { keyword, data, schemaCode } = cxt;
			cxt.fail$data((0, codegen_1._)`${data} ${KWDs[keyword].fail} ${schemaCode} || isNaN(${data})`);
		}
	};
}));
var require_multipleOf = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	const codegen_1 = require_codegen();
	exports.default = {
		keyword: "multipleOf",
		type: "number",
		schemaType: "number",
		$data: true,
		error: {
			message: ({ schemaCode }) => (0, codegen_1.str)`must be multiple of ${schemaCode}`,
			params: ({ schemaCode }) => (0, codegen_1._)`{multipleOf: ${schemaCode}}`
		},
		code(cxt) {
			const { gen, data, schemaCode, it } = cxt;
			const prec = it.opts.multipleOfPrecision;
			const res = gen.let("res");
			const invalid = prec ? (0, codegen_1._)`Math.abs(Math.round(${res}) - ${res}) > 1e-${prec}` : (0, codegen_1._)`${res} !== parseInt(${res})`;
			cxt.fail$data((0, codegen_1._)`(${schemaCode} === 0 || (${res} = ${data}/${schemaCode}, ${invalid}))`);
		}
	};
}));
var require_ucs2length = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	function ucs2length(str) {
		const len = str.length;
		let length = 0;
		let pos = 0;
		let value;
		while (pos < len) {
			length++;
			value = str.charCodeAt(pos++);
			if (value >= 55296 && value <= 56319 && pos < len) {
				value = str.charCodeAt(pos);
				if ((value & 64512) === 56320) pos++;
			}
		}
		return length;
	}
	exports.default = ucs2length;
	ucs2length.code = "require(\"ajv/dist/runtime/ucs2length\").default";
}));
var require_limitLength = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	const codegen_1 = require_codegen();
	const util_1 = require_util();
	const ucs2length_1 = require_ucs2length();
	exports.default = {
		keyword: ["maxLength", "minLength"],
		type: "string",
		schemaType: "number",
		$data: true,
		error: {
			message({ keyword, schemaCode }) {
				const comp = keyword === "maxLength" ? "more" : "fewer";
				return (0, codegen_1.str)`must NOT have ${comp} than ${schemaCode} characters`;
			},
			params: ({ schemaCode }) => (0, codegen_1._)`{limit: ${schemaCode}}`
		},
		code(cxt) {
			const { keyword, data, schemaCode, it } = cxt;
			const op = keyword === "maxLength" ? codegen_1.operators.GT : codegen_1.operators.LT;
			const len = it.opts.unicode === false ? (0, codegen_1._)`${data}.length` : (0, codegen_1._)`${(0, util_1.useFunc)(cxt.gen, ucs2length_1.default)}(${data})`;
			cxt.fail$data((0, codegen_1._)`${len} ${op} ${schemaCode}`);
		}
	};
}));
var require_pattern = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	const code_1 = require_code();
	const util_1 = require_util();
	const codegen_1 = require_codegen();
	exports.default = {
		keyword: "pattern",
		type: "string",
		schemaType: "string",
		$data: true,
		error: {
			message: ({ schemaCode }) => (0, codegen_1.str)`must match pattern "${schemaCode}"`,
			params: ({ schemaCode }) => (0, codegen_1._)`{pattern: ${schemaCode}}`
		},
		code(cxt) {
			const { gen, data, $data, schema, schemaCode, it } = cxt;
			const u = it.opts.unicodeRegExp ? "u" : "";
			if ($data) {
				const { regExp } = it.opts.code;
				const regExpCode = regExp.code === "new RegExp" ? (0, codegen_1._)`new RegExp` : (0, util_1.useFunc)(gen, regExp);
				const valid = gen.let("valid");
				gen.try(() => gen.assign(valid, (0, codegen_1._)`${regExpCode}(${schemaCode}, ${u}).test(${data})`), () => gen.assign(valid, false));
				cxt.fail$data((0, codegen_1._)`!${valid}`);
			} else {
				const regExp = (0, code_1.usePattern)(cxt, schema);
				cxt.fail$data((0, codegen_1._)`!${regExp}.test(${data})`);
			}
		}
	};
}));
var require_limitProperties = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	const codegen_1 = require_codegen();
	exports.default = {
		keyword: ["maxProperties", "minProperties"],
		type: "object",
		schemaType: "number",
		$data: true,
		error: {
			message({ keyword, schemaCode }) {
				const comp = keyword === "maxProperties" ? "more" : "fewer";
				return (0, codegen_1.str)`must NOT have ${comp} than ${schemaCode} properties`;
			},
			params: ({ schemaCode }) => (0, codegen_1._)`{limit: ${schemaCode}}`
		},
		code(cxt) {
			const { keyword, data, schemaCode } = cxt;
			const op = keyword === "maxProperties" ? codegen_1.operators.GT : codegen_1.operators.LT;
			cxt.fail$data((0, codegen_1._)`Object.keys(${data}).length ${op} ${schemaCode}`);
		}
	};
}));
var require_required = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	const code_1 = require_code();
	const codegen_1 = require_codegen();
	const util_1 = require_util();
	exports.default = {
		keyword: "required",
		type: "object",
		schemaType: "array",
		$data: true,
		error: {
			message: ({ params: { missingProperty } }) => (0, codegen_1.str)`must have required property '${missingProperty}'`,
			params: ({ params: { missingProperty } }) => (0, codegen_1._)`{missingProperty: ${missingProperty}}`
		},
		code(cxt) {
			const { gen, schema, schemaCode, data, $data, it } = cxt;
			const { opts } = it;
			if (!$data && schema.length === 0) return;
			const useLoop = schema.length >= opts.loopRequired;
			if (it.allErrors) allErrorsMode();
			else exitOnErrorMode();
			if (opts.strictRequired) {
				const props = cxt.parentSchema.properties;
				const { definedProperties } = cxt.it;
				for (const requiredKey of schema) if ((props === null || props === void 0 ? void 0 : props[requiredKey]) === void 0 && !definedProperties.has(requiredKey)) {
					const msg = `required property "${requiredKey}" is not defined at "${it.schemaEnv.baseId + it.errSchemaPath}" (strictRequired)`;
					(0, util_1.checkStrictMode)(it, msg, it.opts.strictRequired);
				}
			}
			function allErrorsMode() {
				if (useLoop || $data) cxt.block$data(codegen_1.nil, loopAllRequired);
				else for (const prop of schema) (0, code_1.checkReportMissingProp)(cxt, prop);
			}
			function exitOnErrorMode() {
				const missing = gen.let("missing");
				if (useLoop || $data) {
					const valid = gen.let("valid", true);
					cxt.block$data(valid, () => loopUntilMissing(missing, valid));
					cxt.ok(valid);
				} else {
					gen.if((0, code_1.checkMissingProp)(cxt, schema, missing));
					(0, code_1.reportMissingProp)(cxt, missing);
					gen.else();
				}
			}
			function loopAllRequired() {
				gen.forOf("prop", schemaCode, (prop) => {
					cxt.setParams({ missingProperty: prop });
					gen.if((0, code_1.noPropertyInData)(gen, data, prop, opts.ownProperties), () => cxt.error());
				});
			}
			function loopUntilMissing(missing, valid) {
				cxt.setParams({ missingProperty: missing });
				gen.forOf(missing, schemaCode, () => {
					gen.assign(valid, (0, code_1.propertyInData)(gen, data, missing, opts.ownProperties));
					gen.if((0, codegen_1.not)(valid), () => {
						cxt.error();
						gen.break();
					});
				}, codegen_1.nil);
			}
		}
	};
}));
var require_limitItems = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	const codegen_1 = require_codegen();
	exports.default = {
		keyword: ["maxItems", "minItems"],
		type: "array",
		schemaType: "number",
		$data: true,
		error: {
			message({ keyword, schemaCode }) {
				const comp = keyword === "maxItems" ? "more" : "fewer";
				return (0, codegen_1.str)`must NOT have ${comp} than ${schemaCode} items`;
			},
			params: ({ schemaCode }) => (0, codegen_1._)`{limit: ${schemaCode}}`
		},
		code(cxt) {
			const { keyword, data, schemaCode } = cxt;
			const op = keyword === "maxItems" ? codegen_1.operators.GT : codegen_1.operators.LT;
			cxt.fail$data((0, codegen_1._)`${data}.length ${op} ${schemaCode}`);
		}
	};
}));
var require_equal = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	const equal = require_fast_deep_equal();
	equal.code = "require(\"ajv/dist/runtime/equal\").default";
	exports.default = equal;
}));
var require_uniqueItems = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	const dataType_1 = require_dataType();
	const codegen_1 = require_codegen();
	const util_1 = require_util();
	const equal_1 = require_equal();
	exports.default = {
		keyword: "uniqueItems",
		type: "array",
		schemaType: "boolean",
		$data: true,
		error: {
			message: ({ params: { i, j } }) => (0, codegen_1.str)`must NOT have duplicate items (items ## ${j} and ${i} are identical)`,
			params: ({ params: { i, j } }) => (0, codegen_1._)`{i: ${i}, j: ${j}}`
		},
		code(cxt) {
			const { gen, data, $data, schema, parentSchema, schemaCode, it } = cxt;
			if (!$data && !schema) return;
			const valid = gen.let("valid");
			const itemTypes = parentSchema.items ? (0, dataType_1.getSchemaTypes)(parentSchema.items) : [];
			cxt.block$data(valid, validateUniqueItems, (0, codegen_1._)`${schemaCode} === false`);
			cxt.ok(valid);
			function validateUniqueItems() {
				const i = gen.let("i", (0, codegen_1._)`${data}.length`);
				const j = gen.let("j");
				cxt.setParams({
					i,
					j
				});
				gen.assign(valid, true);
				gen.if((0, codegen_1._)`${i} > 1`, () => (canOptimize() ? loopN : loopN2)(i, j));
			}
			function canOptimize() {
				return itemTypes.length > 0 && !itemTypes.some((t) => t === "object" || t === "array");
			}
			function loopN(i, j) {
				const item = gen.name("item");
				const wrongType = (0, dataType_1.checkDataTypes)(itemTypes, item, it.opts.strictNumbers, dataType_1.DataType.Wrong);
				const indices = gen.const("indices", (0, codegen_1._)`{}`);
				gen.for((0, codegen_1._)`;${i}--;`, () => {
					gen.let(item, (0, codegen_1._)`${data}[${i}]`);
					gen.if(wrongType, (0, codegen_1._)`continue`);
					if (itemTypes.length > 1) gen.if((0, codegen_1._)`typeof ${item} == "string"`, (0, codegen_1._)`${item} += "_"`);
					gen.if((0, codegen_1._)`typeof ${indices}[${item}] == "number"`, () => {
						gen.assign(j, (0, codegen_1._)`${indices}[${item}]`);
						cxt.error();
						gen.assign(valid, false).break();
					}).code((0, codegen_1._)`${indices}[${item}] = ${i}`);
				});
			}
			function loopN2(i, j) {
				const eql = (0, util_1.useFunc)(gen, equal_1.default);
				const outer = gen.name("outer");
				gen.label(outer).for((0, codegen_1._)`;${i}--;`, () => gen.for((0, codegen_1._)`${j} = ${i}; ${j}--;`, () => gen.if((0, codegen_1._)`${eql}(${data}[${i}], ${data}[${j}])`, () => {
					cxt.error();
					gen.assign(valid, false).break(outer);
				})));
			}
		}
	};
}));
var require_const = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	const codegen_1 = require_codegen();
	const util_1 = require_util();
	const equal_1 = require_equal();
	exports.default = {
		keyword: "const",
		$data: true,
		error: {
			message: "must be equal to constant",
			params: ({ schemaCode }) => (0, codegen_1._)`{allowedValue: ${schemaCode}}`
		},
		code(cxt) {
			const { gen, data, $data, schemaCode, schema } = cxt;
			if ($data || schema && typeof schema == "object") cxt.fail$data((0, codegen_1._)`!${(0, util_1.useFunc)(gen, equal_1.default)}(${data}, ${schemaCode})`);
			else cxt.fail((0, codegen_1._)`${schema} !== ${data}`);
		}
	};
}));
var require_enum = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	const codegen_1 = require_codegen();
	const util_1 = require_util();
	const equal_1 = require_equal();
	exports.default = {
		keyword: "enum",
		schemaType: "array",
		$data: true,
		error: {
			message: "must be equal to one of the allowed values",
			params: ({ schemaCode }) => (0, codegen_1._)`{allowedValues: ${schemaCode}}`
		},
		code(cxt) {
			const { gen, data, $data, schema, schemaCode, it } = cxt;
			if (!$data && schema.length === 0) throw new Error("enum must have non-empty array");
			const useLoop = schema.length >= it.opts.loopEnum;
			let eql;
			const getEql = () => eql !== null && eql !== void 0 ? eql : eql = (0, util_1.useFunc)(gen, equal_1.default);
			let valid;
			if (useLoop || $data) {
				valid = gen.let("valid");
				cxt.block$data(valid, loopEnum);
			} else {
				/* istanbul ignore if */
				if (!Array.isArray(schema)) throw new Error("ajv implementation error");
				const vSchema = gen.const("vSchema", schemaCode);
				valid = (0, codegen_1.or)(...schema.map((_x, i) => equalCode(vSchema, i)));
			}
			cxt.pass(valid);
			function loopEnum() {
				gen.assign(valid, false);
				gen.forOf("v", schemaCode, (v) => gen.if((0, codegen_1._)`${getEql()}(${data}, ${v})`, () => gen.assign(valid, true).break()));
			}
			function equalCode(vSchema, i) {
				const sch = schema[i];
				return typeof sch === "object" && sch !== null ? (0, codegen_1._)`${getEql()}(${data}, ${vSchema}[${i}])` : (0, codegen_1._)`${data} === ${sch}`;
			}
		}
	};
}));
var require_validation$2 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	const limitNumber_1 = require_limitNumber();
	const multipleOf_1 = require_multipleOf();
	const limitLength_1 = require_limitLength();
	const pattern_1 = require_pattern();
	const limitProperties_1 = require_limitProperties();
	const required_1 = require_required();
	const limitItems_1 = require_limitItems();
	const uniqueItems_1 = require_uniqueItems();
	const const_1 = require_const();
	const enum_1 = require_enum();
	exports.default = [
		limitNumber_1.default,
		multipleOf_1.default,
		limitLength_1.default,
		pattern_1.default,
		limitProperties_1.default,
		required_1.default,
		limitItems_1.default,
		uniqueItems_1.default,
		{
			keyword: "type",
			schemaType: ["string", "array"]
		},
		{
			keyword: "nullable",
			schemaType: "boolean"
		},
		const_1.default,
		enum_1.default
	];
}));
var require_additionalItems = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.validateAdditionalItems = void 0;
	const codegen_1 = require_codegen();
	const util_1 = require_util();
	const def = {
		keyword: "additionalItems",
		type: "array",
		schemaType: ["boolean", "object"],
		before: "uniqueItems",
		error: {
			message: ({ params: { len } }) => (0, codegen_1.str)`must NOT have more than ${len} items`,
			params: ({ params: { len } }) => (0, codegen_1._)`{limit: ${len}}`
		},
		code(cxt) {
			const { parentSchema, it } = cxt;
			const { items } = parentSchema;
			if (!Array.isArray(items)) {
				(0, util_1.checkStrictMode)(it, "\"additionalItems\" is ignored when \"items\" is not an array of schemas");
				return;
			}
			validateAdditionalItems(cxt, items);
		}
	};
	function validateAdditionalItems(cxt, items) {
		const { gen, schema, data, keyword, it } = cxt;
		it.items = true;
		const len = gen.const("len", (0, codegen_1._)`${data}.length`);
		if (schema === false) {
			cxt.setParams({ len: items.length });
			cxt.pass((0, codegen_1._)`${len} <= ${items.length}`);
		} else if (typeof schema == "object" && !(0, util_1.alwaysValidSchema)(it, schema)) {
			const valid = gen.var("valid", (0, codegen_1._)`${len} <= ${items.length}`);
			gen.if((0, codegen_1.not)(valid), () => validateItems(valid));
			cxt.ok(valid);
		}
		function validateItems(valid) {
			gen.forRange("i", items.length, len, (i) => {
				cxt.subschema({
					keyword,
					dataProp: i,
					dataPropType: util_1.Type.Num
				}, valid);
				if (!it.allErrors) gen.if((0, codegen_1.not)(valid), () => gen.break());
			});
		}
	}
	exports.validateAdditionalItems = validateAdditionalItems;
	exports.default = def;
}));
var require_items = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.validateTuple = void 0;
	const codegen_1 = require_codegen();
	const util_1 = require_util();
	const code_1 = require_code();
	const def = {
		keyword: "items",
		type: "array",
		schemaType: [
			"object",
			"array",
			"boolean"
		],
		before: "uniqueItems",
		code(cxt) {
			const { schema, it } = cxt;
			if (Array.isArray(schema)) return validateTuple(cxt, "additionalItems", schema);
			it.items = true;
			if ((0, util_1.alwaysValidSchema)(it, schema)) return;
			cxt.ok((0, code_1.validateArray)(cxt));
		}
	};
	function validateTuple(cxt, extraItems, schArr = cxt.schema) {
		const { gen, parentSchema, data, keyword, it } = cxt;
		checkStrictTuple(parentSchema);
		if (it.opts.unevaluated && schArr.length && it.items !== true) it.items = util_1.mergeEvaluated.items(gen, schArr.length, it.items);
		const valid = gen.name("valid");
		const len = gen.const("len", (0, codegen_1._)`${data}.length`);
		schArr.forEach((sch, i) => {
			if ((0, util_1.alwaysValidSchema)(it, sch)) return;
			gen.if((0, codegen_1._)`${len} > ${i}`, () => cxt.subschema({
				keyword,
				schemaProp: i,
				dataProp: i
			}, valid));
			cxt.ok(valid);
		});
		function checkStrictTuple(sch) {
			const { opts, errSchemaPath } = it;
			const l = schArr.length;
			const fullTuple = l === sch.minItems && (l === sch.maxItems || sch[extraItems] === false);
			if (opts.strictTuples && !fullTuple) {
				const msg = `"${keyword}" is ${l}-tuple, but minItems or maxItems/${extraItems} are not specified or different at path "${errSchemaPath}"`;
				(0, util_1.checkStrictMode)(it, msg, opts.strictTuples);
			}
		}
	}
	exports.validateTuple = validateTuple;
	exports.default = def;
}));
var require_prefixItems = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	const items_1 = require_items();
	exports.default = {
		keyword: "prefixItems",
		type: "array",
		schemaType: ["array"],
		before: "uniqueItems",
		code: (cxt) => (0, items_1.validateTuple)(cxt, "items")
	};
}));
var require_items2020 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	const codegen_1 = require_codegen();
	const util_1 = require_util();
	const code_1 = require_code();
	const additionalItems_1 = require_additionalItems();
	exports.default = {
		keyword: "items",
		type: "array",
		schemaType: ["object", "boolean"],
		before: "uniqueItems",
		error: {
			message: ({ params: { len } }) => (0, codegen_1.str)`must NOT have more than ${len} items`,
			params: ({ params: { len } }) => (0, codegen_1._)`{limit: ${len}}`
		},
		code(cxt) {
			const { schema, parentSchema, it } = cxt;
			const { prefixItems } = parentSchema;
			it.items = true;
			if ((0, util_1.alwaysValidSchema)(it, schema)) return;
			if (prefixItems) (0, additionalItems_1.validateAdditionalItems)(cxt, prefixItems);
			else cxt.ok((0, code_1.validateArray)(cxt));
		}
	};
}));
var require_contains = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	const codegen_1 = require_codegen();
	const util_1 = require_util();
	exports.default = {
		keyword: "contains",
		type: "array",
		schemaType: ["object", "boolean"],
		before: "uniqueItems",
		trackErrors: true,
		error: {
			message: ({ params: { min, max } }) => max === void 0 ? (0, codegen_1.str)`must contain at least ${min} valid item(s)` : (0, codegen_1.str)`must contain at least ${min} and no more than ${max} valid item(s)`,
			params: ({ params: { min, max } }) => max === void 0 ? (0, codegen_1._)`{minContains: ${min}}` : (0, codegen_1._)`{minContains: ${min}, maxContains: ${max}}`
		},
		code(cxt) {
			const { gen, schema, parentSchema, data, it } = cxt;
			let min;
			let max;
			const { minContains, maxContains } = parentSchema;
			if (it.opts.next) {
				min = minContains === void 0 ? 1 : minContains;
				max = maxContains;
			} else min = 1;
			const len = gen.const("len", (0, codegen_1._)`${data}.length`);
			cxt.setParams({
				min,
				max
			});
			if (max === void 0 && min === 0) {
				(0, util_1.checkStrictMode)(it, `"minContains" == 0 without "maxContains": "contains" keyword ignored`);
				return;
			}
			if (max !== void 0 && min > max) {
				(0, util_1.checkStrictMode)(it, `"minContains" > "maxContains" is always invalid`);
				cxt.fail();
				return;
			}
			if ((0, util_1.alwaysValidSchema)(it, schema)) {
				let cond = (0, codegen_1._)`${len} >= ${min}`;
				if (max !== void 0) cond = (0, codegen_1._)`${cond} && ${len} <= ${max}`;
				cxt.pass(cond);
				return;
			}
			it.items = true;
			const valid = gen.name("valid");
			if (max === void 0 && min === 1) validateItems(valid, () => gen.if(valid, () => gen.break()));
			else if (min === 0) {
				gen.let(valid, true);
				if (max !== void 0) gen.if((0, codegen_1._)`${data}.length > 0`, validateItemsWithCount);
			} else {
				gen.let(valid, false);
				validateItemsWithCount();
			}
			cxt.result(valid, () => cxt.reset());
			function validateItemsWithCount() {
				const schValid = gen.name("_valid");
				const count = gen.let("count", 0);
				validateItems(schValid, () => gen.if(schValid, () => checkLimits(count)));
			}
			function validateItems(_valid, block) {
				gen.forRange("i", 0, len, (i) => {
					cxt.subschema({
						keyword: "contains",
						dataProp: i,
						dataPropType: util_1.Type.Num,
						compositeRule: true
					}, _valid);
					block();
				});
			}
			function checkLimits(count) {
				gen.code((0, codegen_1._)`${count}++`);
				if (max === void 0) gen.if((0, codegen_1._)`${count} >= ${min}`, () => gen.assign(valid, true).break());
				else {
					gen.if((0, codegen_1._)`${count} > ${max}`, () => gen.assign(valid, false).break());
					if (min === 1) gen.assign(valid, true);
					else gen.if((0, codegen_1._)`${count} >= ${min}`, () => gen.assign(valid, true));
				}
			}
		}
	};
}));
var require_dependencies = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.validateSchemaDeps = exports.validatePropertyDeps = exports.error = void 0;
	const codegen_1 = require_codegen();
	const util_1 = require_util();
	const code_1 = require_code();
	exports.error = {
		message: ({ params: { property, depsCount, deps } }) => {
			const property_ies = depsCount === 1 ? "property" : "properties";
			return (0, codegen_1.str)`must have ${property_ies} ${deps} when property ${property} is present`;
		},
		params: ({ params: { property, depsCount, deps, missingProperty } }) => (0, codegen_1._)`{property: ${property},
    missingProperty: ${missingProperty},
    depsCount: ${depsCount},
    deps: ${deps}}`
	};
	const def = {
		keyword: "dependencies",
		type: "object",
		schemaType: "object",
		error: exports.error,
		code(cxt) {
			const [propDeps, schDeps] = splitDependencies(cxt);
			validatePropertyDeps(cxt, propDeps);
			validateSchemaDeps(cxt, schDeps);
		}
	};
	function splitDependencies({ schema }) {
		const propertyDeps = {};
		const schemaDeps = {};
		for (const key in schema) {
			if (key === "__proto__") continue;
			const deps = Array.isArray(schema[key]) ? propertyDeps : schemaDeps;
			deps[key] = schema[key];
		}
		return [propertyDeps, schemaDeps];
	}
	function validatePropertyDeps(cxt, propertyDeps = cxt.schema) {
		const { gen, data, it } = cxt;
		if (Object.keys(propertyDeps).length === 0) return;
		const missing = gen.let("missing");
		for (const prop in propertyDeps) {
			const deps = propertyDeps[prop];
			if (deps.length === 0) continue;
			const hasProperty = (0, code_1.propertyInData)(gen, data, prop, it.opts.ownProperties);
			cxt.setParams({
				property: prop,
				depsCount: deps.length,
				deps: deps.join(", ")
			});
			if (it.allErrors) gen.if(hasProperty, () => {
				for (const depProp of deps) (0, code_1.checkReportMissingProp)(cxt, depProp);
			});
			else {
				gen.if((0, codegen_1._)`${hasProperty} && (${(0, code_1.checkMissingProp)(cxt, deps, missing)})`);
				(0, code_1.reportMissingProp)(cxt, missing);
				gen.else();
			}
		}
	}
	exports.validatePropertyDeps = validatePropertyDeps;
	function validateSchemaDeps(cxt, schemaDeps = cxt.schema) {
		const { gen, data, keyword, it } = cxt;
		const valid = gen.name("valid");
		for (const prop in schemaDeps) {
			if ((0, util_1.alwaysValidSchema)(it, schemaDeps[prop])) continue;
			gen.if((0, code_1.propertyInData)(gen, data, prop, it.opts.ownProperties), () => {
				const schCxt = cxt.subschema({
					keyword,
					schemaProp: prop
				}, valid);
				cxt.mergeValidEvaluated(schCxt, valid);
			}, () => gen.var(valid, true));
			cxt.ok(valid);
		}
	}
	exports.validateSchemaDeps = validateSchemaDeps;
	exports.default = def;
}));
var require_propertyNames = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	const codegen_1 = require_codegen();
	const util_1 = require_util();
	exports.default = {
		keyword: "propertyNames",
		type: "object",
		schemaType: ["object", "boolean"],
		error: {
			message: "property name must be valid",
			params: ({ params }) => (0, codegen_1._)`{propertyName: ${params.propertyName}}`
		},
		code(cxt) {
			const { gen, schema, data, it } = cxt;
			if ((0, util_1.alwaysValidSchema)(it, schema)) return;
			const valid = gen.name("valid");
			gen.forIn("key", data, (key) => {
				cxt.setParams({ propertyName: key });
				cxt.subschema({
					keyword: "propertyNames",
					data: key,
					dataTypes: ["string"],
					propertyName: key,
					compositeRule: true
				}, valid);
				gen.if((0, codegen_1.not)(valid), () => {
					cxt.error(true);
					if (!it.allErrors) gen.break();
				});
			});
			cxt.ok(valid);
		}
	};
}));
var require_additionalProperties = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	const code_1 = require_code();
	const codegen_1 = require_codegen();
	const names_1 = require_names();
	const util_1 = require_util();
	exports.default = {
		keyword: "additionalProperties",
		type: ["object"],
		schemaType: ["boolean", "object"],
		allowUndefined: true,
		trackErrors: true,
		error: {
			message: "must NOT have additional properties",
			params: ({ params }) => (0, codegen_1._)`{additionalProperty: ${params.additionalProperty}}`
		},
		code(cxt) {
			const { gen, schema, parentSchema, data, errsCount, it } = cxt;
			/* istanbul ignore if */
			if (!errsCount) throw new Error("ajv implementation error");
			const { allErrors, opts } = it;
			it.props = true;
			if (opts.removeAdditional !== "all" && (0, util_1.alwaysValidSchema)(it, schema)) return;
			const props = (0, code_1.allSchemaProperties)(parentSchema.properties);
			const patProps = (0, code_1.allSchemaProperties)(parentSchema.patternProperties);
			checkAdditionalProperties();
			cxt.ok((0, codegen_1._)`${errsCount} === ${names_1.default.errors}`);
			function checkAdditionalProperties() {
				gen.forIn("key", data, (key) => {
					if (!props.length && !patProps.length) additionalPropertyCode(key);
					else gen.if(isAdditional(key), () => additionalPropertyCode(key));
				});
			}
			function isAdditional(key) {
				let definedProp;
				if (props.length > 8) {
					const propsSchema = (0, util_1.schemaRefOrVal)(it, parentSchema.properties, "properties");
					definedProp = (0, code_1.isOwnProperty)(gen, propsSchema, key);
				} else if (props.length) definedProp = (0, codegen_1.or)(...props.map((p) => (0, codegen_1._)`${key} === ${p}`));
				else definedProp = codegen_1.nil;
				if (patProps.length) definedProp = (0, codegen_1.or)(definedProp, ...patProps.map((p) => (0, codegen_1._)`${(0, code_1.usePattern)(cxt, p)}.test(${key})`));
				return (0, codegen_1.not)(definedProp);
			}
			function deleteAdditional(key) {
				gen.code((0, codegen_1._)`delete ${data}[${key}]`);
			}
			function additionalPropertyCode(key) {
				if (opts.removeAdditional === "all" || opts.removeAdditional && schema === false) {
					deleteAdditional(key);
					return;
				}
				if (schema === false) {
					cxt.setParams({ additionalProperty: key });
					cxt.error();
					if (!allErrors) gen.break();
					return;
				}
				if (typeof schema == "object" && !(0, util_1.alwaysValidSchema)(it, schema)) {
					const valid = gen.name("valid");
					if (opts.removeAdditional === "failing") {
						applyAdditionalSchema(key, valid, false);
						gen.if((0, codegen_1.not)(valid), () => {
							cxt.reset();
							deleteAdditional(key);
						});
					} else {
						applyAdditionalSchema(key, valid);
						if (!allErrors) gen.if((0, codegen_1.not)(valid), () => gen.break());
					}
				}
			}
			function applyAdditionalSchema(key, valid, errors) {
				const subschema = {
					keyword: "additionalProperties",
					dataProp: key,
					dataPropType: util_1.Type.Str
				};
				if (errors === false) Object.assign(subschema, {
					compositeRule: true,
					createErrors: false,
					allErrors: false
				});
				cxt.subschema(subschema, valid);
			}
		}
	};
}));
var require_properties = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	const validate_1 = require_validate();
	const code_1 = require_code();
	const util_1 = require_util();
	const additionalProperties_1 = require_additionalProperties();
	exports.default = {
		keyword: "properties",
		type: "object",
		schemaType: "object",
		code(cxt) {
			const { gen, schema, parentSchema, data, it } = cxt;
			if (it.opts.removeAdditional === "all" && parentSchema.additionalProperties === void 0) additionalProperties_1.default.code(new validate_1.KeywordCxt(it, additionalProperties_1.default, "additionalProperties"));
			const allProps = (0, code_1.allSchemaProperties)(schema);
			for (const prop of allProps) it.definedProperties.add(prop);
			if (it.opts.unevaluated && allProps.length && it.props !== true) it.props = util_1.mergeEvaluated.props(gen, (0, util_1.toHash)(allProps), it.props);
			const properties = allProps.filter((p) => !(0, util_1.alwaysValidSchema)(it, schema[p]));
			if (properties.length === 0) return;
			const valid = gen.name("valid");
			for (const prop of properties) {
				if (hasDefault(prop)) applyPropertySchema(prop);
				else {
					gen.if((0, code_1.propertyInData)(gen, data, prop, it.opts.ownProperties));
					applyPropertySchema(prop);
					if (!it.allErrors) gen.else().var(valid, true);
					gen.endIf();
				}
				cxt.it.definedProperties.add(prop);
				cxt.ok(valid);
			}
			function hasDefault(prop) {
				return it.opts.useDefaults && !it.compositeRule && schema[prop].default !== void 0;
			}
			function applyPropertySchema(prop) {
				cxt.subschema({
					keyword: "properties",
					schemaProp: prop,
					dataProp: prop
				}, valid);
			}
		}
	};
}));
var require_patternProperties = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	const code_1 = require_code();
	const codegen_1 = require_codegen();
	const util_1 = require_util();
	const util_2 = require_util();
	exports.default = {
		keyword: "patternProperties",
		type: "object",
		schemaType: "object",
		code(cxt) {
			const { gen, schema, data, parentSchema, it } = cxt;
			const { opts } = it;
			const patterns = (0, code_1.allSchemaProperties)(schema);
			const alwaysValidPatterns = patterns.filter((p) => (0, util_1.alwaysValidSchema)(it, schema[p]));
			if (patterns.length === 0 || alwaysValidPatterns.length === patterns.length && (!it.opts.unevaluated || it.props === true)) return;
			const checkProperties = opts.strictSchema && !opts.allowMatchingProperties && parentSchema.properties;
			const valid = gen.name("valid");
			if (it.props !== true && !(it.props instanceof codegen_1.Name)) it.props = (0, util_2.evaluatedPropsToName)(gen, it.props);
			const { props } = it;
			validatePatternProperties();
			function validatePatternProperties() {
				for (const pat of patterns) {
					if (checkProperties) checkMatchingProperties(pat);
					if (it.allErrors) validateProperties(pat);
					else {
						gen.var(valid, true);
						validateProperties(pat);
						gen.if(valid);
					}
				}
			}
			function checkMatchingProperties(pat) {
				for (const prop in checkProperties) if (new RegExp(pat).test(prop)) (0, util_1.checkStrictMode)(it, `property ${prop} matches pattern ${pat} (use allowMatchingProperties)`);
			}
			function validateProperties(pat) {
				gen.forIn("key", data, (key) => {
					gen.if((0, codegen_1._)`${(0, code_1.usePattern)(cxt, pat)}.test(${key})`, () => {
						const alwaysValid = alwaysValidPatterns.includes(pat);
						if (!alwaysValid) cxt.subschema({
							keyword: "patternProperties",
							schemaProp: pat,
							dataProp: key,
							dataPropType: util_2.Type.Str
						}, valid);
						if (it.opts.unevaluated && props !== true) gen.assign((0, codegen_1._)`${props}[${key}]`, true);
						else if (!alwaysValid && !it.allErrors) gen.if((0, codegen_1.not)(valid), () => gen.break());
					});
				});
			}
		}
	};
}));
var require_not = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	const util_1 = require_util();
	exports.default = {
		keyword: "not",
		schemaType: ["object", "boolean"],
		trackErrors: true,
		code(cxt) {
			const { gen, schema, it } = cxt;
			if ((0, util_1.alwaysValidSchema)(it, schema)) {
				cxt.fail();
				return;
			}
			const valid = gen.name("valid");
			cxt.subschema({
				keyword: "not",
				compositeRule: true,
				createErrors: false,
				allErrors: false
			}, valid);
			cxt.failResult(valid, () => cxt.reset(), () => cxt.error());
		},
		error: { message: "must NOT be valid" }
	};
}));
var require_anyOf = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.default = {
		keyword: "anyOf",
		schemaType: "array",
		trackErrors: true,
		code: require_code().validateUnion,
		error: { message: "must match a schema in anyOf" }
	};
}));
var require_oneOf = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	const codegen_1 = require_codegen();
	const util_1 = require_util();
	exports.default = {
		keyword: "oneOf",
		schemaType: "array",
		trackErrors: true,
		error: {
			message: "must match exactly one schema in oneOf",
			params: ({ params }) => (0, codegen_1._)`{passingSchemas: ${params.passing}}`
		},
		code(cxt) {
			const { gen, schema, parentSchema, it } = cxt;
			/* istanbul ignore if */
			if (!Array.isArray(schema)) throw new Error("ajv implementation error");
			if (it.opts.discriminator && parentSchema.discriminator) return;
			const schArr = schema;
			const valid = gen.let("valid", false);
			const passing = gen.let("passing", null);
			const schValid = gen.name("_valid");
			cxt.setParams({ passing });
			gen.block(validateOneOf);
			cxt.result(valid, () => cxt.reset(), () => cxt.error(true));
			function validateOneOf() {
				schArr.forEach((sch, i) => {
					let schCxt;
					if ((0, util_1.alwaysValidSchema)(it, sch)) gen.var(schValid, true);
					else schCxt = cxt.subschema({
						keyword: "oneOf",
						schemaProp: i,
						compositeRule: true
					}, schValid);
					if (i > 0) gen.if((0, codegen_1._)`${schValid} && ${valid}`).assign(valid, false).assign(passing, (0, codegen_1._)`[${passing}, ${i}]`).else();
					gen.if(schValid, () => {
						gen.assign(valid, true);
						gen.assign(passing, i);
						if (schCxt) cxt.mergeEvaluated(schCxt, codegen_1.Name);
					});
				});
			}
		}
	};
}));
var require_allOf = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	const util_1 = require_util();
	exports.default = {
		keyword: "allOf",
		schemaType: "array",
		code(cxt) {
			const { gen, schema, it } = cxt;
			/* istanbul ignore if */
			if (!Array.isArray(schema)) throw new Error("ajv implementation error");
			const valid = gen.name("valid");
			schema.forEach((sch, i) => {
				if ((0, util_1.alwaysValidSchema)(it, sch)) return;
				const schCxt = cxt.subschema({
					keyword: "allOf",
					schemaProp: i
				}, valid);
				cxt.ok(valid);
				cxt.mergeEvaluated(schCxt);
			});
		}
	};
}));
var require_if = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	const codegen_1 = require_codegen();
	const util_1 = require_util();
	const def = {
		keyword: "if",
		schemaType: ["object", "boolean"],
		trackErrors: true,
		error: {
			message: ({ params }) => (0, codegen_1.str)`must match "${params.ifClause}" schema`,
			params: ({ params }) => (0, codegen_1._)`{failingKeyword: ${params.ifClause}}`
		},
		code(cxt) {
			const { gen, parentSchema, it } = cxt;
			if (parentSchema.then === void 0 && parentSchema.else === void 0) (0, util_1.checkStrictMode)(it, "\"if\" without \"then\" and \"else\" is ignored");
			const hasThen = hasSchema(it, "then");
			const hasElse = hasSchema(it, "else");
			if (!hasThen && !hasElse) return;
			const valid = gen.let("valid", true);
			const schValid = gen.name("_valid");
			validateIf();
			cxt.reset();
			if (hasThen && hasElse) {
				const ifClause = gen.let("ifClause");
				cxt.setParams({ ifClause });
				gen.if(schValid, validateClause("then", ifClause), validateClause("else", ifClause));
			} else if (hasThen) gen.if(schValid, validateClause("then"));
			else gen.if((0, codegen_1.not)(schValid), validateClause("else"));
			cxt.pass(valid, () => cxt.error(true));
			function validateIf() {
				const schCxt = cxt.subschema({
					keyword: "if",
					compositeRule: true,
					createErrors: false,
					allErrors: false
				}, schValid);
				cxt.mergeEvaluated(schCxt);
			}
			function validateClause(keyword, ifClause) {
				return () => {
					const schCxt = cxt.subschema({ keyword }, schValid);
					gen.assign(valid, schValid);
					cxt.mergeValidEvaluated(schCxt, valid);
					if (ifClause) gen.assign(ifClause, (0, codegen_1._)`${keyword}`);
					else cxt.setParams({ ifClause: keyword });
				};
			}
		}
	};
	function hasSchema(it, keyword) {
		const schema = it.schema[keyword];
		return schema !== void 0 && !(0, util_1.alwaysValidSchema)(it, schema);
	}
	exports.default = def;
}));
var require_thenElse = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	const util_1 = require_util();
	exports.default = {
		keyword: ["then", "else"],
		schemaType: ["object", "boolean"],
		code({ keyword, parentSchema, it }) {
			if (parentSchema.if === void 0) (0, util_1.checkStrictMode)(it, `"${keyword}" without "if" is ignored`);
		}
	};
}));
var require_applicator$2 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	const additionalItems_1 = require_additionalItems();
	const prefixItems_1 = require_prefixItems();
	const items_1 = require_items();
	const items2020_1 = require_items2020();
	const contains_1 = require_contains();
	const dependencies_1 = require_dependencies();
	const propertyNames_1 = require_propertyNames();
	const additionalProperties_1 = require_additionalProperties();
	const properties_1 = require_properties();
	const patternProperties_1 = require_patternProperties();
	const not_1 = require_not();
	const anyOf_1 = require_anyOf();
	const oneOf_1 = require_oneOf();
	const allOf_1 = require_allOf();
	const if_1 = require_if();
	const thenElse_1 = require_thenElse();
	function getApplicator(draft2020 = false) {
		const applicator = [
			not_1.default,
			anyOf_1.default,
			oneOf_1.default,
			allOf_1.default,
			if_1.default,
			thenElse_1.default,
			propertyNames_1.default,
			additionalProperties_1.default,
			dependencies_1.default,
			properties_1.default,
			patternProperties_1.default
		];
		if (draft2020) applicator.push(prefixItems_1.default, items2020_1.default);
		else applicator.push(additionalItems_1.default, items_1.default);
		applicator.push(contains_1.default);
		return applicator;
	}
	exports.default = getApplicator;
}));
var require_format$2 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	const codegen_1 = require_codegen();
	exports.default = {
		keyword: "format",
		type: ["number", "string"],
		schemaType: "string",
		$data: true,
		error: {
			message: ({ schemaCode }) => (0, codegen_1.str)`must match format "${schemaCode}"`,
			params: ({ schemaCode }) => (0, codegen_1._)`{format: ${schemaCode}}`
		},
		code(cxt, ruleType) {
			const { gen, data, $data, schema, schemaCode, it } = cxt;
			const { opts, errSchemaPath, schemaEnv, self } = it;
			if (!opts.validateFormats) return;
			if ($data) validate$DataFormat();
			else validateFormat();
			function validate$DataFormat() {
				const fmts = gen.scopeValue("formats", {
					ref: self.formats,
					code: opts.code.formats
				});
				const fDef = gen.const("fDef", (0, codegen_1._)`${fmts}[${schemaCode}]`);
				const fType = gen.let("fType");
				const format = gen.let("format");
				gen.if((0, codegen_1._)`typeof ${fDef} == "object" && !(${fDef} instanceof RegExp)`, () => gen.assign(fType, (0, codegen_1._)`${fDef}.type || "string"`).assign(format, (0, codegen_1._)`${fDef}.validate`), () => gen.assign(fType, (0, codegen_1._)`"string"`).assign(format, fDef));
				cxt.fail$data((0, codegen_1.or)(unknownFmt(), invalidFmt()));
				function unknownFmt() {
					if (opts.strictSchema === false) return codegen_1.nil;
					return (0, codegen_1._)`${schemaCode} && !${format}`;
				}
				function invalidFmt() {
					const callFormat = schemaEnv.$async ? (0, codegen_1._)`(${fDef}.async ? await ${format}(${data}) : ${format}(${data}))` : (0, codegen_1._)`${format}(${data})`;
					const validData = (0, codegen_1._)`(typeof ${format} == "function" ? ${callFormat} : ${format}.test(${data}))`;
					return (0, codegen_1._)`${format} && ${format} !== true && ${fType} === ${ruleType} && !${validData}`;
				}
			}
			function validateFormat() {
				const formatDef = self.formats[schema];
				if (!formatDef) {
					unknownFormat();
					return;
				}
				if (formatDef === true) return;
				const [fmtType, format, fmtRef] = getFormat(formatDef);
				if (fmtType === ruleType) cxt.pass(validCondition());
				function unknownFormat() {
					if (opts.strictSchema === false) {
						self.logger.warn(unknownMsg());
						return;
					}
					throw new Error(unknownMsg());
					function unknownMsg() {
						return `unknown format "${schema}" ignored in schema at path "${errSchemaPath}"`;
					}
				}
				function getFormat(fmtDef) {
					const code = fmtDef instanceof RegExp ? (0, codegen_1.regexpCode)(fmtDef) : opts.code.formats ? (0, codegen_1._)`${opts.code.formats}${(0, codegen_1.getProperty)(schema)}` : void 0;
					const fmt = gen.scopeValue("formats", {
						key: schema,
						ref: fmtDef,
						code
					});
					if (typeof fmtDef == "object" && !(fmtDef instanceof RegExp)) return [
						fmtDef.type || "string",
						fmtDef.validate,
						(0, codegen_1._)`${fmt}.validate`
					];
					return [
						"string",
						fmtDef,
						fmt
					];
				}
				function validCondition() {
					if (typeof formatDef == "object" && !(formatDef instanceof RegExp) && formatDef.async) {
						if (!schemaEnv.$async) throw new Error("async format in sync schema");
						return (0, codegen_1._)`await ${fmtRef}(${data})`;
					}
					return typeof format == "function" ? (0, codegen_1._)`${fmtRef}(${data})` : (0, codegen_1._)`${fmtRef}.test(${data})`;
				}
			}
		}
	};
}));
var require_format$1 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.default = [require_format$2().default];
}));
var require_metadata = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.contentVocabulary = exports.metadataVocabulary = void 0;
	exports.metadataVocabulary = [
		"title",
		"description",
		"default",
		"deprecated",
		"readOnly",
		"writeOnly",
		"examples"
	];
	exports.contentVocabulary = [
		"contentMediaType",
		"contentEncoding",
		"contentSchema"
	];
}));
var require_draft7 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	const core_1 = require_core$2();
	const validation_1 = require_validation$2();
	const applicator_1 = require_applicator$2();
	const format_1 = require_format$1();
	const metadata_1 = require_metadata();
	exports.default = [
		core_1.default,
		validation_1.default,
		(0, applicator_1.default)(),
		format_1.default,
		metadata_1.metadataVocabulary,
		metadata_1.contentVocabulary
	];
}));
var require_types = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.DiscrError = void 0;
	var DiscrError;
	(function(DiscrError) {
		DiscrError["Tag"] = "tag";
		DiscrError["Mapping"] = "mapping";
	})(DiscrError || (exports.DiscrError = DiscrError = {}));
}));
var require_discriminator = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	const codegen_1 = require_codegen();
	const types_1 = require_types();
	const compile_1 = require_compile();
	const ref_error_1 = require_ref_error();
	const util_1 = require_util();
	exports.default = {
		keyword: "discriminator",
		type: "object",
		schemaType: "object",
		error: {
			message: ({ params: { discrError, tagName } }) => discrError === types_1.DiscrError.Tag ? `tag "${tagName}" must be string` : `value of tag "${tagName}" must be in oneOf`,
			params: ({ params: { discrError, tag, tagName } }) => (0, codegen_1._)`{error: ${discrError}, tag: ${tagName}, tagValue: ${tag}}`
		},
		code(cxt) {
			const { gen, data, schema, parentSchema, it } = cxt;
			const { oneOf } = parentSchema;
			if (!it.opts.discriminator) throw new Error("discriminator: requires discriminator option");
			const tagName = schema.propertyName;
			if (typeof tagName != "string") throw new Error("discriminator: requires propertyName");
			if (schema.mapping) throw new Error("discriminator: mapping is not supported");
			if (!oneOf) throw new Error("discriminator: requires oneOf keyword");
			const valid = gen.let("valid", false);
			const tag = gen.const("tag", (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(tagName)}`);
			gen.if((0, codegen_1._)`typeof ${tag} == "string"`, () => validateMapping(), () => cxt.error(false, {
				discrError: types_1.DiscrError.Tag,
				tag,
				tagName
			}));
			cxt.ok(valid);
			function validateMapping() {
				const mapping = getMapping();
				gen.if(false);
				for (const tagValue in mapping) {
					gen.elseIf((0, codegen_1._)`${tag} === ${tagValue}`);
					gen.assign(valid, applyTagSchema(mapping[tagValue]));
				}
				gen.else();
				cxt.error(false, {
					discrError: types_1.DiscrError.Mapping,
					tag,
					tagName
				});
				gen.endIf();
			}
			function applyTagSchema(schemaProp) {
				const _valid = gen.name("valid");
				const schCxt = cxt.subschema({
					keyword: "oneOf",
					schemaProp
				}, _valid);
				cxt.mergeEvaluated(schCxt, codegen_1.Name);
				return _valid;
			}
			function getMapping() {
				var _a;
				const oneOfMapping = {};
				const topRequired = hasRequired(parentSchema);
				let tagRequired = true;
				for (let i = 0; i < oneOf.length; i++) {
					let sch = oneOf[i];
					if ((sch === null || sch === void 0 ? void 0 : sch.$ref) && !(0, util_1.schemaHasRulesButRef)(sch, it.self.RULES)) {
						const ref = sch.$ref;
						sch = compile_1.resolveRef.call(it.self, it.schemaEnv.root, it.baseId, ref);
						if (sch instanceof compile_1.SchemaEnv) sch = sch.schema;
						if (sch === void 0) throw new ref_error_1.default(it.opts.uriResolver, it.baseId, ref);
					}
					const propSch = (_a = sch === null || sch === void 0 ? void 0 : sch.properties) === null || _a === void 0 ? void 0 : _a[tagName];
					if (typeof propSch != "object") throw new Error(`discriminator: oneOf subschemas (or referenced schemas) must have "properties/${tagName}"`);
					tagRequired = tagRequired && (topRequired || hasRequired(sch));
					addMappings(propSch, i);
				}
				if (!tagRequired) throw new Error(`discriminator: "${tagName}" must be required`);
				return oneOfMapping;
				function hasRequired({ required }) {
					return Array.isArray(required) && required.includes(tagName);
				}
				function addMappings(sch, i) {
					if (sch.const) addMapping(sch.const, i);
					else if (sch.enum) for (const tagValue of sch.enum) addMapping(tagValue, i);
					else throw new Error(`discriminator: "properties/${tagName}" must have "const" or "enum"`);
				}
				function addMapping(tagValue, i) {
					if (typeof tagValue != "string" || tagValue in oneOfMapping) throw new Error(`discriminator: "${tagName}" values must be unique strings`);
					oneOfMapping[tagValue] = i;
				}
			}
		}
	};
}));
var require_json_schema_draft_07 = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = {
		"$schema": "http://json-schema.org/draft-07/schema#",
		"$id": "http://json-schema.org/draft-07/schema#",
		"title": "Core schema meta-schema",
		"definitions": {
			"schemaArray": {
				"type": "array",
				"minItems": 1,
				"items": { "$ref": "#" }
			},
			"nonNegativeInteger": {
				"type": "integer",
				"minimum": 0
			},
			"nonNegativeIntegerDefault0": { "allOf": [{ "$ref": "#/definitions/nonNegativeInteger" }, { "default": 0 }] },
			"simpleTypes": { "enum": [
				"array",
				"boolean",
				"integer",
				"null",
				"number",
				"object",
				"string"
			] },
			"stringArray": {
				"type": "array",
				"items": { "type": "string" },
				"uniqueItems": true,
				"default": []
			}
		},
		"type": ["object", "boolean"],
		"properties": {
			"$id": {
				"type": "string",
				"format": "uri-reference"
			},
			"$schema": {
				"type": "string",
				"format": "uri"
			},
			"$ref": {
				"type": "string",
				"format": "uri-reference"
			},
			"$comment": { "type": "string" },
			"title": { "type": "string" },
			"description": { "type": "string" },
			"default": true,
			"readOnly": {
				"type": "boolean",
				"default": false
			},
			"examples": {
				"type": "array",
				"items": true
			},
			"multipleOf": {
				"type": "number",
				"exclusiveMinimum": 0
			},
			"maximum": { "type": "number" },
			"exclusiveMaximum": { "type": "number" },
			"minimum": { "type": "number" },
			"exclusiveMinimum": { "type": "number" },
			"maxLength": { "$ref": "#/definitions/nonNegativeInteger" },
			"minLength": { "$ref": "#/definitions/nonNegativeIntegerDefault0" },
			"pattern": {
				"type": "string",
				"format": "regex"
			},
			"additionalItems": { "$ref": "#" },
			"items": {
				"anyOf": [{ "$ref": "#" }, { "$ref": "#/definitions/schemaArray" }],
				"default": true
			},
			"maxItems": { "$ref": "#/definitions/nonNegativeInteger" },
			"minItems": { "$ref": "#/definitions/nonNegativeIntegerDefault0" },
			"uniqueItems": {
				"type": "boolean",
				"default": false
			},
			"contains": { "$ref": "#" },
			"maxProperties": { "$ref": "#/definitions/nonNegativeInteger" },
			"minProperties": { "$ref": "#/definitions/nonNegativeIntegerDefault0" },
			"required": { "$ref": "#/definitions/stringArray" },
			"additionalProperties": { "$ref": "#" },
			"definitions": {
				"type": "object",
				"additionalProperties": { "$ref": "#" },
				"default": {}
			},
			"properties": {
				"type": "object",
				"additionalProperties": { "$ref": "#" },
				"default": {}
			},
			"patternProperties": {
				"type": "object",
				"additionalProperties": { "$ref": "#" },
				"propertyNames": { "format": "regex" },
				"default": {}
			},
			"dependencies": {
				"type": "object",
				"additionalProperties": { "anyOf": [{ "$ref": "#" }, { "$ref": "#/definitions/stringArray" }] }
			},
			"propertyNames": { "$ref": "#" },
			"const": true,
			"enum": {
				"type": "array",
				"items": true,
				"minItems": 1,
				"uniqueItems": true
			},
			"type": { "anyOf": [{ "$ref": "#/definitions/simpleTypes" }, {
				"type": "array",
				"items": { "$ref": "#/definitions/simpleTypes" },
				"minItems": 1,
				"uniqueItems": true
			}] },
			"format": { "type": "string" },
			"contentMediaType": { "type": "string" },
			"contentEncoding": { "type": "string" },
			"if": { "$ref": "#" },
			"then": { "$ref": "#" },
			"else": { "$ref": "#" },
			"allOf": { "$ref": "#/definitions/schemaArray" },
			"anyOf": { "$ref": "#/definitions/schemaArray" },
			"oneOf": { "$ref": "#/definitions/schemaArray" },
			"not": { "$ref": "#" }
		},
		"default": true
	};
}));
var require_ajv = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.MissingRefError = exports.ValidationError = exports.CodeGen = exports.Name = exports.nil = exports.stringify = exports.str = exports._ = exports.KeywordCxt = exports.Ajv = void 0;
	const core_1 = require_core$3();
	const draft7_1 = require_draft7();
	const discriminator_1 = require_discriminator();
	const draft7MetaSchema = require_json_schema_draft_07();
	const META_SUPPORT_DATA = ["/properties"];
	const META_SCHEMA_ID = "http://json-schema.org/draft-07/schema";
	var Ajv = class extends core_1.default {
		_addVocabularies() {
			super._addVocabularies();
			draft7_1.default.forEach((v) => this.addVocabulary(v));
			if (this.opts.discriminator) this.addKeyword(discriminator_1.default);
		}
		_addDefaultMetaSchema() {
			super._addDefaultMetaSchema();
			if (!this.opts.meta) return;
			const metaSchema = this.opts.$data ? this.$dataMetaSchema(draft7MetaSchema, META_SUPPORT_DATA) : draft7MetaSchema;
			this.addMetaSchema(metaSchema, META_SCHEMA_ID, false);
			this.refs["http://json-schema.org/schema"] = META_SCHEMA_ID;
		}
		defaultMeta() {
			return this.opts.defaultMeta = super.defaultMeta() || (this.getSchema(META_SCHEMA_ID) ? META_SCHEMA_ID : void 0);
		}
	};
	exports.Ajv = Ajv;
	module.exports = exports = Ajv;
	module.exports.Ajv = Ajv;
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.default = Ajv;
	var validate_1 = require_validate();
	Object.defineProperty(exports, "KeywordCxt", {
		enumerable: true,
		get: function() {
			return validate_1.KeywordCxt;
		}
	});
	var codegen_1 = require_codegen();
	Object.defineProperty(exports, "_", {
		enumerable: true,
		get: function() {
			return codegen_1._;
		}
	});
	Object.defineProperty(exports, "str", {
		enumerable: true,
		get: function() {
			return codegen_1.str;
		}
	});
	Object.defineProperty(exports, "stringify", {
		enumerable: true,
		get: function() {
			return codegen_1.stringify;
		}
	});
	Object.defineProperty(exports, "nil", {
		enumerable: true,
		get: function() {
			return codegen_1.nil;
		}
	});
	Object.defineProperty(exports, "Name", {
		enumerable: true,
		get: function() {
			return codegen_1.Name;
		}
	});
	Object.defineProperty(exports, "CodeGen", {
		enumerable: true,
		get: function() {
			return codegen_1.CodeGen;
		}
	});
	var validation_error_1 = require_validation_error();
	Object.defineProperty(exports, "ValidationError", {
		enumerable: true,
		get: function() {
			return validation_error_1.default;
		}
	});
	var ref_error_1 = require_ref_error();
	Object.defineProperty(exports, "MissingRefError", {
		enumerable: true,
		get: function() {
			return ref_error_1.default;
		}
	});
}));
var require_dynamicAnchor = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.dynamicAnchor = void 0;
	const codegen_1 = require_codegen();
	const names_1 = require_names();
	const compile_1 = require_compile();
	const ref_1 = require_ref();
	const def = {
		keyword: "$dynamicAnchor",
		schemaType: "string",
		code: (cxt) => dynamicAnchor(cxt, cxt.schema)
	};
	function dynamicAnchor(cxt, anchor) {
		const { gen, it } = cxt;
		it.schemaEnv.root.dynamicAnchors[anchor] = true;
		const v = (0, codegen_1._)`${names_1.default.dynamicAnchors}${(0, codegen_1.getProperty)(anchor)}`;
		const validate = it.errSchemaPath === "#" ? it.validateName : _getValidate(cxt);
		gen.if((0, codegen_1._)`!${v}`, () => gen.assign(v, validate));
	}
	exports.dynamicAnchor = dynamicAnchor;
	function _getValidate(cxt) {
		const { schemaEnv, schema, self } = cxt.it;
		const { root, baseId, localRefs, meta } = schemaEnv.root;
		const { schemaId } = self.opts;
		const sch = new compile_1.SchemaEnv({
			schema,
			schemaId,
			root,
			baseId,
			localRefs,
			meta
		});
		compile_1.compileSchema.call(self, sch);
		return (0, ref_1.getValidate)(cxt, sch);
	}
	exports.default = def;
}));
var require_dynamicRef = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.dynamicRef = void 0;
	const codegen_1 = require_codegen();
	const names_1 = require_names();
	const ref_1 = require_ref();
	const def = {
		keyword: "$dynamicRef",
		schemaType: "string",
		code: (cxt) => dynamicRef(cxt, cxt.schema)
	};
	function dynamicRef(cxt, ref) {
		const { gen, keyword, it } = cxt;
		if (ref[0] !== "#") throw new Error(`"${keyword}" only supports hash fragment reference`);
		const anchor = ref.slice(1);
		if (it.allErrors) _dynamicRef();
		else {
			const valid = gen.let("valid", false);
			_dynamicRef(valid);
			cxt.ok(valid);
		}
		function _dynamicRef(valid) {
			if (it.schemaEnv.root.dynamicAnchors[anchor]) {
				const v = gen.let("_v", (0, codegen_1._)`${names_1.default.dynamicAnchors}${(0, codegen_1.getProperty)(anchor)}`);
				gen.if(v, _callRef(v, valid), _callRef(it.validateName, valid));
			} else _callRef(it.validateName, valid)();
		}
		function _callRef(validate, valid) {
			return valid ? () => gen.block(() => {
				(0, ref_1.callRef)(cxt, validate);
				gen.let(valid, true);
			}) : () => (0, ref_1.callRef)(cxt, validate);
		}
	}
	exports.dynamicRef = dynamicRef;
	exports.default = def;
}));
var require_recursiveAnchor = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	const dynamicAnchor_1 = require_dynamicAnchor();
	const util_1 = require_util();
	exports.default = {
		keyword: "$recursiveAnchor",
		schemaType: "boolean",
		code(cxt) {
			if (cxt.schema) (0, dynamicAnchor_1.dynamicAnchor)(cxt, "");
			else (0, util_1.checkStrictMode)(cxt.it, "$recursiveAnchor: false is ignored");
		}
	};
}));
var require_recursiveRef = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	const dynamicRef_1 = require_dynamicRef();
	exports.default = {
		keyword: "$recursiveRef",
		schemaType: "string",
		code: (cxt) => (0, dynamicRef_1.dynamicRef)(cxt, cxt.schema)
	};
}));
var require_dynamic = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	const dynamicAnchor_1 = require_dynamicAnchor();
	const dynamicRef_1 = require_dynamicRef();
	const recursiveAnchor_1 = require_recursiveAnchor();
	const recursiveRef_1 = require_recursiveRef();
	exports.default = [
		dynamicAnchor_1.default,
		dynamicRef_1.default,
		recursiveAnchor_1.default,
		recursiveRef_1.default
	];
}));
var require_dependentRequired = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	const dependencies_1 = require_dependencies();
	exports.default = {
		keyword: "dependentRequired",
		type: "object",
		schemaType: "object",
		error: dependencies_1.error,
		code: (cxt) => (0, dependencies_1.validatePropertyDeps)(cxt)
	};
}));
var require_dependentSchemas = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	const dependencies_1 = require_dependencies();
	exports.default = {
		keyword: "dependentSchemas",
		type: "object",
		schemaType: "object",
		code: (cxt) => (0, dependencies_1.validateSchemaDeps)(cxt)
	};
}));
var require_limitContains = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	const util_1 = require_util();
	exports.default = {
		keyword: ["maxContains", "minContains"],
		type: "array",
		schemaType: "number",
		code({ keyword, parentSchema, it }) {
			if (parentSchema.contains === void 0) (0, util_1.checkStrictMode)(it, `"${keyword}" without "contains" is ignored`);
		}
	};
}));
var require_next = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	const dependentRequired_1 = require_dependentRequired();
	const dependentSchemas_1 = require_dependentSchemas();
	const limitContains_1 = require_limitContains();
	exports.default = [
		dependentRequired_1.default,
		dependentSchemas_1.default,
		limitContains_1.default
	];
}));
var require_unevaluatedProperties = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	const codegen_1 = require_codegen();
	const util_1 = require_util();
	const names_1 = require_names();
	exports.default = {
		keyword: "unevaluatedProperties",
		type: "object",
		schemaType: ["boolean", "object"],
		trackErrors: true,
		error: {
			message: "must NOT have unevaluated properties",
			params: ({ params }) => (0, codegen_1._)`{unevaluatedProperty: ${params.unevaluatedProperty}}`
		},
		code(cxt) {
			const { gen, schema, data, errsCount, it } = cxt;
			/* istanbul ignore if */
			if (!errsCount) throw new Error("ajv implementation error");
			const { allErrors, props } = it;
			if (props instanceof codegen_1.Name) gen.if((0, codegen_1._)`${props} !== true`, () => gen.forIn("key", data, (key) => gen.if(unevaluatedDynamic(props, key), () => unevaluatedPropCode(key))));
			else if (props !== true) gen.forIn("key", data, (key) => props === void 0 ? unevaluatedPropCode(key) : gen.if(unevaluatedStatic(props, key), () => unevaluatedPropCode(key)));
			it.props = true;
			cxt.ok((0, codegen_1._)`${errsCount} === ${names_1.default.errors}`);
			function unevaluatedPropCode(key) {
				if (schema === false) {
					cxt.setParams({ unevaluatedProperty: key });
					cxt.error();
					if (!allErrors) gen.break();
					return;
				}
				if (!(0, util_1.alwaysValidSchema)(it, schema)) {
					const valid = gen.name("valid");
					cxt.subschema({
						keyword: "unevaluatedProperties",
						dataProp: key,
						dataPropType: util_1.Type.Str
					}, valid);
					if (!allErrors) gen.if((0, codegen_1.not)(valid), () => gen.break());
				}
			}
			function unevaluatedDynamic(evaluatedProps, key) {
				return (0, codegen_1._)`!${evaluatedProps} || !${evaluatedProps}[${key}]`;
			}
			function unevaluatedStatic(evaluatedProps, key) {
				const ps = [];
				for (const p in evaluatedProps) if (evaluatedProps[p] === true) ps.push((0, codegen_1._)`${key} !== ${p}`);
				return (0, codegen_1.and)(...ps);
			}
		}
	};
}));
var require_unevaluatedItems = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	const codegen_1 = require_codegen();
	const util_1 = require_util();
	exports.default = {
		keyword: "unevaluatedItems",
		type: "array",
		schemaType: ["boolean", "object"],
		error: {
			message: ({ params: { len } }) => (0, codegen_1.str)`must NOT have more than ${len} items`,
			params: ({ params: { len } }) => (0, codegen_1._)`{limit: ${len}}`
		},
		code(cxt) {
			const { gen, schema, data, it } = cxt;
			const items = it.items || 0;
			if (items === true) return;
			const len = gen.const("len", (0, codegen_1._)`${data}.length`);
			if (schema === false) {
				cxt.setParams({ len: items });
				cxt.fail((0, codegen_1._)`${len} > ${items}`);
			} else if (typeof schema == "object" && !(0, util_1.alwaysValidSchema)(it, schema)) {
				const valid = gen.var("valid", (0, codegen_1._)`${len} <= ${items}`);
				gen.if((0, codegen_1.not)(valid), () => validateItems(valid, items));
				cxt.ok(valid);
			}
			it.items = true;
			function validateItems(valid, from) {
				gen.forRange("i", from, len, (i) => {
					cxt.subschema({
						keyword: "unevaluatedItems",
						dataProp: i,
						dataPropType: util_1.Type.Num
					}, valid);
					if (!it.allErrors) gen.if((0, codegen_1.not)(valid), () => gen.break());
				});
			}
		}
	};
}));
var require_unevaluated$1 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	const unevaluatedProperties_1 = require_unevaluatedProperties();
	const unevaluatedItems_1 = require_unevaluatedItems();
	exports.default = [unevaluatedProperties_1.default, unevaluatedItems_1.default];
}));
var require_schema$1 = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = {
		"$schema": "https://json-schema.org/draft/2019-09/schema",
		"$id": "https://json-schema.org/draft/2019-09/schema",
		"$vocabulary": {
			"https://json-schema.org/draft/2019-09/vocab/core": true,
			"https://json-schema.org/draft/2019-09/vocab/applicator": true,
			"https://json-schema.org/draft/2019-09/vocab/validation": true,
			"https://json-schema.org/draft/2019-09/vocab/meta-data": true,
			"https://json-schema.org/draft/2019-09/vocab/format": false,
			"https://json-schema.org/draft/2019-09/vocab/content": true
		},
		"$recursiveAnchor": true,
		"title": "Core and Validation specifications meta-schema",
		"allOf": [
			{ "$ref": "meta/core" },
			{ "$ref": "meta/applicator" },
			{ "$ref": "meta/validation" },
			{ "$ref": "meta/meta-data" },
			{ "$ref": "meta/format" },
			{ "$ref": "meta/content" }
		],
		"type": ["object", "boolean"],
		"properties": {
			"definitions": {
				"$comment": "While no longer an official keyword as it is replaced by $defs, this keyword is retained in the meta-schema to prevent incompatible extensions as it remains in common use.",
				"type": "object",
				"additionalProperties": { "$recursiveRef": "#" },
				"default": {}
			},
			"dependencies": {
				"$comment": "\"dependencies\" is no longer a keyword, but schema authors should avoid redefining it to facilitate a smooth transition to \"dependentSchemas\" and \"dependentRequired\"",
				"type": "object",
				"additionalProperties": { "anyOf": [{ "$recursiveRef": "#" }, { "$ref": "meta/validation#/$defs/stringArray" }] }
			}
		}
	};
}));
var require_applicator$1 = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = {
		"$schema": "https://json-schema.org/draft/2019-09/schema",
		"$id": "https://json-schema.org/draft/2019-09/meta/applicator",
		"$vocabulary": { "https://json-schema.org/draft/2019-09/vocab/applicator": true },
		"$recursiveAnchor": true,
		"title": "Applicator vocabulary meta-schema",
		"type": ["object", "boolean"],
		"properties": {
			"additionalItems": { "$recursiveRef": "#" },
			"unevaluatedItems": { "$recursiveRef": "#" },
			"items": { "anyOf": [{ "$recursiveRef": "#" }, { "$ref": "#/$defs/schemaArray" }] },
			"contains": { "$recursiveRef": "#" },
			"additionalProperties": { "$recursiveRef": "#" },
			"unevaluatedProperties": { "$recursiveRef": "#" },
			"properties": {
				"type": "object",
				"additionalProperties": { "$recursiveRef": "#" },
				"default": {}
			},
			"patternProperties": {
				"type": "object",
				"additionalProperties": { "$recursiveRef": "#" },
				"propertyNames": { "format": "regex" },
				"default": {}
			},
			"dependentSchemas": {
				"type": "object",
				"additionalProperties": { "$recursiveRef": "#" }
			},
			"propertyNames": { "$recursiveRef": "#" },
			"if": { "$recursiveRef": "#" },
			"then": { "$recursiveRef": "#" },
			"else": { "$recursiveRef": "#" },
			"allOf": { "$ref": "#/$defs/schemaArray" },
			"anyOf": { "$ref": "#/$defs/schemaArray" },
			"oneOf": { "$ref": "#/$defs/schemaArray" },
			"not": { "$recursiveRef": "#" }
		},
		"$defs": { "schemaArray": {
			"type": "array",
			"minItems": 1,
			"items": { "$recursiveRef": "#" }
		} }
	};
}));
var require_content$1 = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = {
		"$schema": "https://json-schema.org/draft/2019-09/schema",
		"$id": "https://json-schema.org/draft/2019-09/meta/content",
		"$vocabulary": { "https://json-schema.org/draft/2019-09/vocab/content": true },
		"$recursiveAnchor": true,
		"title": "Content vocabulary meta-schema",
		"type": ["object", "boolean"],
		"properties": {
			"contentMediaType": { "type": "string" },
			"contentEncoding": { "type": "string" },
			"contentSchema": { "$recursiveRef": "#" }
		}
	};
}));
var require_core$1 = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = {
		"$schema": "https://json-schema.org/draft/2019-09/schema",
		"$id": "https://json-schema.org/draft/2019-09/meta/core",
		"$vocabulary": { "https://json-schema.org/draft/2019-09/vocab/core": true },
		"$recursiveAnchor": true,
		"title": "Core vocabulary meta-schema",
		"type": ["object", "boolean"],
		"properties": {
			"$id": {
				"type": "string",
				"format": "uri-reference",
				"$comment": "Non-empty fragments not allowed.",
				"pattern": "^[^#]*#?$"
			},
			"$schema": {
				"type": "string",
				"format": "uri"
			},
			"$anchor": {
				"type": "string",
				"pattern": "^[A-Za-z][-A-Za-z0-9.:_]*$"
			},
			"$ref": {
				"type": "string",
				"format": "uri-reference"
			},
			"$recursiveRef": {
				"type": "string",
				"format": "uri-reference"
			},
			"$recursiveAnchor": {
				"type": "boolean",
				"default": false
			},
			"$vocabulary": {
				"type": "object",
				"propertyNames": {
					"type": "string",
					"format": "uri"
				},
				"additionalProperties": { "type": "boolean" }
			},
			"$comment": { "type": "string" },
			"$defs": {
				"type": "object",
				"additionalProperties": { "$recursiveRef": "#" },
				"default": {}
			}
		}
	};
}));
var require_format = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = {
		"$schema": "https://json-schema.org/draft/2019-09/schema",
		"$id": "https://json-schema.org/draft/2019-09/meta/format",
		"$vocabulary": { "https://json-schema.org/draft/2019-09/vocab/format": true },
		"$recursiveAnchor": true,
		"title": "Format vocabulary meta-schema",
		"type": ["object", "boolean"],
		"properties": { "format": { "type": "string" } }
	};
}));
var require_meta_data$1 = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = {
		"$schema": "https://json-schema.org/draft/2019-09/schema",
		"$id": "https://json-schema.org/draft/2019-09/meta/meta-data",
		"$vocabulary": { "https://json-schema.org/draft/2019-09/vocab/meta-data": true },
		"$recursiveAnchor": true,
		"title": "Meta-data vocabulary meta-schema",
		"type": ["object", "boolean"],
		"properties": {
			"title": { "type": "string" },
			"description": { "type": "string" },
			"default": true,
			"deprecated": {
				"type": "boolean",
				"default": false
			},
			"readOnly": {
				"type": "boolean",
				"default": false
			},
			"writeOnly": {
				"type": "boolean",
				"default": false
			},
			"examples": {
				"type": "array",
				"items": true
			}
		}
	};
}));
var require_validation$1 = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = {
		"$schema": "https://json-schema.org/draft/2019-09/schema",
		"$id": "https://json-schema.org/draft/2019-09/meta/validation",
		"$vocabulary": { "https://json-schema.org/draft/2019-09/vocab/validation": true },
		"$recursiveAnchor": true,
		"title": "Validation vocabulary meta-schema",
		"type": ["object", "boolean"],
		"properties": {
			"multipleOf": {
				"type": "number",
				"exclusiveMinimum": 0
			},
			"maximum": { "type": "number" },
			"exclusiveMaximum": { "type": "number" },
			"minimum": { "type": "number" },
			"exclusiveMinimum": { "type": "number" },
			"maxLength": { "$ref": "#/$defs/nonNegativeInteger" },
			"minLength": { "$ref": "#/$defs/nonNegativeIntegerDefault0" },
			"pattern": {
				"type": "string",
				"format": "regex"
			},
			"maxItems": { "$ref": "#/$defs/nonNegativeInteger" },
			"minItems": { "$ref": "#/$defs/nonNegativeIntegerDefault0" },
			"uniqueItems": {
				"type": "boolean",
				"default": false
			},
			"maxContains": { "$ref": "#/$defs/nonNegativeInteger" },
			"minContains": {
				"$ref": "#/$defs/nonNegativeInteger",
				"default": 1
			},
			"maxProperties": { "$ref": "#/$defs/nonNegativeInteger" },
			"minProperties": { "$ref": "#/$defs/nonNegativeIntegerDefault0" },
			"required": { "$ref": "#/$defs/stringArray" },
			"dependentRequired": {
				"type": "object",
				"additionalProperties": { "$ref": "#/$defs/stringArray" }
			},
			"const": true,
			"enum": {
				"type": "array",
				"items": true
			},
			"type": { "anyOf": [{ "$ref": "#/$defs/simpleTypes" }, {
				"type": "array",
				"items": { "$ref": "#/$defs/simpleTypes" },
				"minItems": 1,
				"uniqueItems": true
			}] }
		},
		"$defs": {
			"nonNegativeInteger": {
				"type": "integer",
				"minimum": 0
			},
			"nonNegativeIntegerDefault0": {
				"$ref": "#/$defs/nonNegativeInteger",
				"default": 0
			},
			"simpleTypes": { "enum": [
				"array",
				"boolean",
				"integer",
				"null",
				"number",
				"object",
				"string"
			] },
			"stringArray": {
				"type": "array",
				"items": { "type": "string" },
				"uniqueItems": true,
				"default": []
			}
		}
	};
}));
var require_json_schema_2019_09 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	const metaSchema = require_schema$1();
	const applicator = require_applicator$1();
	const content = require_content$1();
	const core = require_core$1();
	const format = require_format();
	const metadata = require_meta_data$1();
	const validation = require_validation$1();
	const META_SUPPORT_DATA = ["/properties"];
	function addMetaSchema2019($data) {
		[
			metaSchema,
			applicator,
			content,
			core,
			with$data(this, format),
			metadata,
			with$data(this, validation)
		].forEach((sch) => this.addMetaSchema(sch, void 0, false));
		return this;
		function with$data(ajv, sch) {
			return $data ? ajv.$dataMetaSchema(sch, META_SUPPORT_DATA) : sch;
		}
	}
	exports.default = addMetaSchema2019;
}));
var require__2019 = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.MissingRefError = exports.ValidationError = exports.CodeGen = exports.Name = exports.nil = exports.stringify = exports.str = exports._ = exports.KeywordCxt = exports.Ajv2019 = void 0;
	const core_1 = require_core$3();
	const draft7_1 = require_draft7();
	const dynamic_1 = require_dynamic();
	const next_1 = require_next();
	const unevaluated_1 = require_unevaluated$1();
	const discriminator_1 = require_discriminator();
	const json_schema_2019_09_1 = require_json_schema_2019_09();
	const META_SCHEMA_ID = "https://json-schema.org/draft/2019-09/schema";
	var Ajv2019 = class extends core_1.default {
		constructor(opts = {}) {
			super({
				...opts,
				dynamicRef: true,
				next: true,
				unevaluated: true
			});
		}
		_addVocabularies() {
			super._addVocabularies();
			this.addVocabulary(dynamic_1.default);
			draft7_1.default.forEach((v) => this.addVocabulary(v));
			this.addVocabulary(next_1.default);
			this.addVocabulary(unevaluated_1.default);
			if (this.opts.discriminator) this.addKeyword(discriminator_1.default);
		}
		_addDefaultMetaSchema() {
			super._addDefaultMetaSchema();
			const { $data, meta } = this.opts;
			if (!meta) return;
			json_schema_2019_09_1.default.call(this, $data);
			this.refs["http://json-schema.org/schema"] = META_SCHEMA_ID;
		}
		defaultMeta() {
			return this.opts.defaultMeta = super.defaultMeta() || (this.getSchema(META_SCHEMA_ID) ? META_SCHEMA_ID : void 0);
		}
	};
	exports.Ajv2019 = Ajv2019;
	module.exports = exports = Ajv2019;
	module.exports.Ajv2019 = Ajv2019;
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.default = Ajv2019;
	var validate_1 = require_validate();
	Object.defineProperty(exports, "KeywordCxt", {
		enumerable: true,
		get: function() {
			return validate_1.KeywordCxt;
		}
	});
	var codegen_1 = require_codegen();
	Object.defineProperty(exports, "_", {
		enumerable: true,
		get: function() {
			return codegen_1._;
		}
	});
	Object.defineProperty(exports, "str", {
		enumerable: true,
		get: function() {
			return codegen_1.str;
		}
	});
	Object.defineProperty(exports, "stringify", {
		enumerable: true,
		get: function() {
			return codegen_1.stringify;
		}
	});
	Object.defineProperty(exports, "nil", {
		enumerable: true,
		get: function() {
			return codegen_1.nil;
		}
	});
	Object.defineProperty(exports, "Name", {
		enumerable: true,
		get: function() {
			return codegen_1.Name;
		}
	});
	Object.defineProperty(exports, "CodeGen", {
		enumerable: true,
		get: function() {
			return codegen_1.CodeGen;
		}
	});
	var validation_error_1 = require_validation_error();
	Object.defineProperty(exports, "ValidationError", {
		enumerable: true,
		get: function() {
			return validation_error_1.default;
		}
	});
	var ref_error_1 = require_ref_error();
	Object.defineProperty(exports, "MissingRefError", {
		enumerable: true,
		get: function() {
			return ref_error_1.default;
		}
	});
}));
var require_draft2020 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	const core_1 = require_core$2();
	const validation_1 = require_validation$2();
	const applicator_1 = require_applicator$2();
	const dynamic_1 = require_dynamic();
	const next_1 = require_next();
	const unevaluated_1 = require_unevaluated$1();
	const format_1 = require_format$1();
	const metadata_1 = require_metadata();
	exports.default = [
		dynamic_1.default,
		core_1.default,
		validation_1.default,
		(0, applicator_1.default)(true),
		format_1.default,
		metadata_1.metadataVocabulary,
		metadata_1.contentVocabulary,
		next_1.default,
		unevaluated_1.default
	];
}));
var require_schema = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = {
		"$schema": "https://json-schema.org/draft/2020-12/schema",
		"$id": "https://json-schema.org/draft/2020-12/schema",
		"$vocabulary": {
			"https://json-schema.org/draft/2020-12/vocab/core": true,
			"https://json-schema.org/draft/2020-12/vocab/applicator": true,
			"https://json-schema.org/draft/2020-12/vocab/unevaluated": true,
			"https://json-schema.org/draft/2020-12/vocab/validation": true,
			"https://json-schema.org/draft/2020-12/vocab/meta-data": true,
			"https://json-schema.org/draft/2020-12/vocab/format-annotation": true,
			"https://json-schema.org/draft/2020-12/vocab/content": true
		},
		"$dynamicAnchor": "meta",
		"title": "Core and Validation specifications meta-schema",
		"allOf": [
			{ "$ref": "meta/core" },
			{ "$ref": "meta/applicator" },
			{ "$ref": "meta/unevaluated" },
			{ "$ref": "meta/validation" },
			{ "$ref": "meta/meta-data" },
			{ "$ref": "meta/format-annotation" },
			{ "$ref": "meta/content" }
		],
		"type": ["object", "boolean"],
		"$comment": "This meta-schema also defines keywords that have appeared in previous drafts in order to prevent incompatible extensions as they remain in common use.",
		"properties": {
			"definitions": {
				"$comment": "\"definitions\" has been replaced by \"$defs\".",
				"type": "object",
				"additionalProperties": { "$dynamicRef": "#meta" },
				"deprecated": true,
				"default": {}
			},
			"dependencies": {
				"$comment": "\"dependencies\" has been split and replaced by \"dependentSchemas\" and \"dependentRequired\" in order to serve their differing semantics.",
				"type": "object",
				"additionalProperties": { "anyOf": [{ "$dynamicRef": "#meta" }, { "$ref": "meta/validation#/$defs/stringArray" }] },
				"deprecated": true,
				"default": {}
			},
			"$recursiveAnchor": {
				"$comment": "\"$recursiveAnchor\" has been replaced by \"$dynamicAnchor\".",
				"$ref": "meta/core#/$defs/anchorString",
				"deprecated": true
			},
			"$recursiveRef": {
				"$comment": "\"$recursiveRef\" has been replaced by \"$dynamicRef\".",
				"$ref": "meta/core#/$defs/uriReferenceString",
				"deprecated": true
			}
		}
	};
}));
var require_applicator = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = {
		"$schema": "https://json-schema.org/draft/2020-12/schema",
		"$id": "https://json-schema.org/draft/2020-12/meta/applicator",
		"$vocabulary": { "https://json-schema.org/draft/2020-12/vocab/applicator": true },
		"$dynamicAnchor": "meta",
		"title": "Applicator vocabulary meta-schema",
		"type": ["object", "boolean"],
		"properties": {
			"prefixItems": { "$ref": "#/$defs/schemaArray" },
			"items": { "$dynamicRef": "#meta" },
			"contains": { "$dynamicRef": "#meta" },
			"additionalProperties": { "$dynamicRef": "#meta" },
			"properties": {
				"type": "object",
				"additionalProperties": { "$dynamicRef": "#meta" },
				"default": {}
			},
			"patternProperties": {
				"type": "object",
				"additionalProperties": { "$dynamicRef": "#meta" },
				"propertyNames": { "format": "regex" },
				"default": {}
			},
			"dependentSchemas": {
				"type": "object",
				"additionalProperties": { "$dynamicRef": "#meta" },
				"default": {}
			},
			"propertyNames": { "$dynamicRef": "#meta" },
			"if": { "$dynamicRef": "#meta" },
			"then": { "$dynamicRef": "#meta" },
			"else": { "$dynamicRef": "#meta" },
			"allOf": { "$ref": "#/$defs/schemaArray" },
			"anyOf": { "$ref": "#/$defs/schemaArray" },
			"oneOf": { "$ref": "#/$defs/schemaArray" },
			"not": { "$dynamicRef": "#meta" }
		},
		"$defs": { "schemaArray": {
			"type": "array",
			"minItems": 1,
			"items": { "$dynamicRef": "#meta" }
		} }
	};
}));
var require_unevaluated = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = {
		"$schema": "https://json-schema.org/draft/2020-12/schema",
		"$id": "https://json-schema.org/draft/2020-12/meta/unevaluated",
		"$vocabulary": { "https://json-schema.org/draft/2020-12/vocab/unevaluated": true },
		"$dynamicAnchor": "meta",
		"title": "Unevaluated applicator vocabulary meta-schema",
		"type": ["object", "boolean"],
		"properties": {
			"unevaluatedItems": { "$dynamicRef": "#meta" },
			"unevaluatedProperties": { "$dynamicRef": "#meta" }
		}
	};
}));
var require_content = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = {
		"$schema": "https://json-schema.org/draft/2020-12/schema",
		"$id": "https://json-schema.org/draft/2020-12/meta/content",
		"$vocabulary": { "https://json-schema.org/draft/2020-12/vocab/content": true },
		"$dynamicAnchor": "meta",
		"title": "Content vocabulary meta-schema",
		"type": ["object", "boolean"],
		"properties": {
			"contentEncoding": { "type": "string" },
			"contentMediaType": { "type": "string" },
			"contentSchema": { "$dynamicRef": "#meta" }
		}
	};
}));
var require_core = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = {
		"$schema": "https://json-schema.org/draft/2020-12/schema",
		"$id": "https://json-schema.org/draft/2020-12/meta/core",
		"$vocabulary": { "https://json-schema.org/draft/2020-12/vocab/core": true },
		"$dynamicAnchor": "meta",
		"title": "Core vocabulary meta-schema",
		"type": ["object", "boolean"],
		"properties": {
			"$id": {
				"$ref": "#/$defs/uriReferenceString",
				"$comment": "Non-empty fragments not allowed.",
				"pattern": "^[^#]*#?$"
			},
			"$schema": { "$ref": "#/$defs/uriString" },
			"$ref": { "$ref": "#/$defs/uriReferenceString" },
			"$anchor": { "$ref": "#/$defs/anchorString" },
			"$dynamicRef": { "$ref": "#/$defs/uriReferenceString" },
			"$dynamicAnchor": { "$ref": "#/$defs/anchorString" },
			"$vocabulary": {
				"type": "object",
				"propertyNames": { "$ref": "#/$defs/uriString" },
				"additionalProperties": { "type": "boolean" }
			},
			"$comment": { "type": "string" },
			"$defs": {
				"type": "object",
				"additionalProperties": { "$dynamicRef": "#meta" }
			}
		},
		"$defs": {
			"anchorString": {
				"type": "string",
				"pattern": "^[A-Za-z_][-A-Za-z0-9._]*$"
			},
			"uriString": {
				"type": "string",
				"format": "uri"
			},
			"uriReferenceString": {
				"type": "string",
				"format": "uri-reference"
			}
		}
	};
}));
var require_format_annotation = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = {
		"$schema": "https://json-schema.org/draft/2020-12/schema",
		"$id": "https://json-schema.org/draft/2020-12/meta/format-annotation",
		"$vocabulary": { "https://json-schema.org/draft/2020-12/vocab/format-annotation": true },
		"$dynamicAnchor": "meta",
		"title": "Format vocabulary meta-schema for annotation results",
		"type": ["object", "boolean"],
		"properties": { "format": { "type": "string" } }
	};
}));
var require_meta_data = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = {
		"$schema": "https://json-schema.org/draft/2020-12/schema",
		"$id": "https://json-schema.org/draft/2020-12/meta/meta-data",
		"$vocabulary": { "https://json-schema.org/draft/2020-12/vocab/meta-data": true },
		"$dynamicAnchor": "meta",
		"title": "Meta-data vocabulary meta-schema",
		"type": ["object", "boolean"],
		"properties": {
			"title": { "type": "string" },
			"description": { "type": "string" },
			"default": true,
			"deprecated": {
				"type": "boolean",
				"default": false
			},
			"readOnly": {
				"type": "boolean",
				"default": false
			},
			"writeOnly": {
				"type": "boolean",
				"default": false
			},
			"examples": {
				"type": "array",
				"items": true
			}
		}
	};
}));
var require_validation = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = {
		"$schema": "https://json-schema.org/draft/2020-12/schema",
		"$id": "https://json-schema.org/draft/2020-12/meta/validation",
		"$vocabulary": { "https://json-schema.org/draft/2020-12/vocab/validation": true },
		"$dynamicAnchor": "meta",
		"title": "Validation vocabulary meta-schema",
		"type": ["object", "boolean"],
		"properties": {
			"type": { "anyOf": [{ "$ref": "#/$defs/simpleTypes" }, {
				"type": "array",
				"items": { "$ref": "#/$defs/simpleTypes" },
				"minItems": 1,
				"uniqueItems": true
			}] },
			"const": true,
			"enum": {
				"type": "array",
				"items": true
			},
			"multipleOf": {
				"type": "number",
				"exclusiveMinimum": 0
			},
			"maximum": { "type": "number" },
			"exclusiveMaximum": { "type": "number" },
			"minimum": { "type": "number" },
			"exclusiveMinimum": { "type": "number" },
			"maxLength": { "$ref": "#/$defs/nonNegativeInteger" },
			"minLength": { "$ref": "#/$defs/nonNegativeIntegerDefault0" },
			"pattern": {
				"type": "string",
				"format": "regex"
			},
			"maxItems": { "$ref": "#/$defs/nonNegativeInteger" },
			"minItems": { "$ref": "#/$defs/nonNegativeIntegerDefault0" },
			"uniqueItems": {
				"type": "boolean",
				"default": false
			},
			"maxContains": { "$ref": "#/$defs/nonNegativeInteger" },
			"minContains": {
				"$ref": "#/$defs/nonNegativeInteger",
				"default": 1
			},
			"maxProperties": { "$ref": "#/$defs/nonNegativeInteger" },
			"minProperties": { "$ref": "#/$defs/nonNegativeIntegerDefault0" },
			"required": { "$ref": "#/$defs/stringArray" },
			"dependentRequired": {
				"type": "object",
				"additionalProperties": { "$ref": "#/$defs/stringArray" }
			}
		},
		"$defs": {
			"nonNegativeInteger": {
				"type": "integer",
				"minimum": 0
			},
			"nonNegativeIntegerDefault0": {
				"$ref": "#/$defs/nonNegativeInteger",
				"default": 0
			},
			"simpleTypes": { "enum": [
				"array",
				"boolean",
				"integer",
				"null",
				"number",
				"object",
				"string"
			] },
			"stringArray": {
				"type": "array",
				"items": { "type": "string" },
				"uniqueItems": true,
				"default": []
			}
		}
	};
}));
var require_json_schema_2020_12 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	const metaSchema = require_schema();
	const applicator = require_applicator();
	const unevaluated = require_unevaluated();
	const content = require_content();
	const core = require_core();
	const format = require_format_annotation();
	const metadata = require_meta_data();
	const validation = require_validation();
	const META_SUPPORT_DATA = ["/properties"];
	function addMetaSchema2020($data) {
		[
			metaSchema,
			applicator,
			unevaluated,
			content,
			core,
			with$data(this, format),
			metadata,
			with$data(this, validation)
		].forEach((sch) => this.addMetaSchema(sch, void 0, false));
		return this;
		function with$data(ajv, sch) {
			return $data ? ajv.$dataMetaSchema(sch, META_SUPPORT_DATA) : sch;
		}
	}
	exports.default = addMetaSchema2020;
}));
var require__2020 = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.MissingRefError = exports.ValidationError = exports.CodeGen = exports.Name = exports.nil = exports.stringify = exports.str = exports._ = exports.KeywordCxt = exports.Ajv2020 = void 0;
	const core_1 = require_core$3();
	const draft2020_1 = require_draft2020();
	const discriminator_1 = require_discriminator();
	const json_schema_2020_12_1 = require_json_schema_2020_12();
	const META_SCHEMA_ID = "https://json-schema.org/draft/2020-12/schema";
	var Ajv2020 = class extends core_1.default {
		constructor(opts = {}) {
			super({
				...opts,
				dynamicRef: true,
				next: true,
				unevaluated: true
			});
		}
		_addVocabularies() {
			super._addVocabularies();
			draft2020_1.default.forEach((v) => this.addVocabulary(v));
			if (this.opts.discriminator) this.addKeyword(discriminator_1.default);
		}
		_addDefaultMetaSchema() {
			super._addDefaultMetaSchema();
			const { $data, meta } = this.opts;
			if (!meta) return;
			json_schema_2020_12_1.default.call(this, $data);
			this.refs["http://json-schema.org/schema"] = META_SCHEMA_ID;
		}
		defaultMeta() {
			return this.opts.defaultMeta = super.defaultMeta() || (this.getSchema(META_SCHEMA_ID) ? META_SCHEMA_ID : void 0);
		}
	};
	exports.Ajv2020 = Ajv2020;
	module.exports = exports = Ajv2020;
	module.exports.Ajv2020 = Ajv2020;
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.default = Ajv2020;
	var validate_1 = require_validate();
	Object.defineProperty(exports, "KeywordCxt", {
		enumerable: true,
		get: function() {
			return validate_1.KeywordCxt;
		}
	});
	var codegen_1 = require_codegen();
	Object.defineProperty(exports, "_", {
		enumerable: true,
		get: function() {
			return codegen_1._;
		}
	});
	Object.defineProperty(exports, "str", {
		enumerable: true,
		get: function() {
			return codegen_1.str;
		}
	});
	Object.defineProperty(exports, "stringify", {
		enumerable: true,
		get: function() {
			return codegen_1.stringify;
		}
	});
	Object.defineProperty(exports, "nil", {
		enumerable: true,
		get: function() {
			return codegen_1.nil;
		}
	});
	Object.defineProperty(exports, "Name", {
		enumerable: true,
		get: function() {
			return codegen_1.Name;
		}
	});
	Object.defineProperty(exports, "CodeGen", {
		enumerable: true,
		get: function() {
			return codegen_1.CodeGen;
		}
	});
	var validation_error_1 = require_validation_error();
	Object.defineProperty(exports, "ValidationError", {
		enumerable: true,
		get: function() {
			return validation_error_1.default;
		}
	});
	var ref_error_1 = require_ref_error();
	Object.defineProperty(exports, "MissingRefError", {
		enumerable: true,
		get: function() {
			return ref_error_1.default;
		}
	});
}));
var require_formats = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.formatNames = exports.fastFormats = exports.fullFormats = void 0;
	function fmtDef(validate, compare) {
		return {
			validate,
			compare
		};
	}
	exports.fullFormats = {
		date: fmtDef(date, compareDate),
		time: fmtDef(getTime(true), compareTime),
		"date-time": fmtDef(getDateTime(true), compareDateTime),
		"iso-time": fmtDef(getTime(), compareIsoTime),
		"iso-date-time": fmtDef(getDateTime(), compareIsoDateTime),
		duration: /^P(?!$)((\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+S)?)?|(\d+W)?)$/,
		uri,
		"uri-reference": /^(?:[a-z][a-z0-9+\-.]*:)?(?:\/?\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:]|%[0-9a-f]{2})*@)?(?:\[(?:(?:(?:(?:[0-9a-f]{1,4}:){6}|::(?:[0-9a-f]{1,4}:){5}|(?:[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){4}|(?:(?:[0-9a-f]{1,4}:){0,1}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){3}|(?:(?:[0-9a-f]{1,4}:){0,2}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){2}|(?:(?:[0-9a-f]{1,4}:){0,3}[0-9a-f]{1,4})?::[0-9a-f]{1,4}:|(?:(?:[0-9a-f]{1,4}:){0,4}[0-9a-f]{1,4})?::)(?:[0-9a-f]{1,4}:[0-9a-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?))|(?:(?:[0-9a-f]{1,4}:){0,5}[0-9a-f]{1,4})?::[0-9a-f]{1,4}|(?:(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{1,4})?::)|[Vv][0-9a-f]+\.[a-z0-9\-._~!$&'()*+,;=:]+)\]|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:[a-z0-9\-._~!$&'"()*+,;=]|%[0-9a-f]{2})*)(?::\d*)?(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*|\/(?:(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*)?|(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*)?(?:\?(?:[a-z0-9\-._~!$&'"()*+,;=:@/?]|%[0-9a-f]{2})*)?(?:#(?:[a-z0-9\-._~!$&'"()*+,;=:@/?]|%[0-9a-f]{2})*)?$/i,
		"uri-template": /^(?:(?:[^\x00-\x20"'<>%\\^`{|}]|%[0-9a-f]{2})|\{[+#./;?&=,!@|]?(?:[a-z0-9_]|%[0-9a-f]{2})+(?::[1-9][0-9]{0,3}|\*)?(?:,(?:[a-z0-9_]|%[0-9a-f]{2})+(?::[1-9][0-9]{0,3}|\*)?)*\})*$/i,
		url: /^(?:https?|ftp):\/\/(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z0-9\u{00a1}-\u{ffff}]+-)*[a-z0-9\u{00a1}-\u{ffff}]+)(?:\.(?:[a-z0-9\u{00a1}-\u{ffff}]+-)*[a-z0-9\u{00a1}-\u{ffff}]+)*(?:\.(?:[a-z\u{00a1}-\u{ffff}]{2,})))(?::\d{2,5})?(?:\/[^\s]*)?$/iu,
		email: /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i,
		hostname: /^(?=.{1,253}\.?$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[-0-9a-z]{0,61}[0-9a-z])?)*\.?$/i,
		ipv4: /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/,
		ipv6: /^((([0-9a-f]{1,4}:){7}([0-9a-f]{1,4}|:))|(([0-9a-f]{1,4}:){6}(:[0-9a-f]{1,4}|((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9a-f]{1,4}:){5}(((:[0-9a-f]{1,4}){1,2})|:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9a-f]{1,4}:){4}(((:[0-9a-f]{1,4}){1,3})|((:[0-9a-f]{1,4})?:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){3}(((:[0-9a-f]{1,4}){1,4})|((:[0-9a-f]{1,4}){0,2}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){2}(((:[0-9a-f]{1,4}){1,5})|((:[0-9a-f]{1,4}){0,3}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){1}(((:[0-9a-f]{1,4}){1,6})|((:[0-9a-f]{1,4}){0,4}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(:(((:[0-9a-f]{1,4}){1,7})|((:[0-9a-f]{1,4}){0,5}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:)))$/i,
		regex,
		uuid: /^(?:urn:uuid:)?[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i,
		"json-pointer": /^(?:\/(?:[^~/]|~0|~1)*)*$/,
		"json-pointer-uri-fragment": /^#(?:\/(?:[a-z0-9_\-.!$&'()*+,;:=@]|%[0-9a-f]{2}|~0|~1)*)*$/i,
		"relative-json-pointer": /^(?:0|[1-9][0-9]*)(?:#|(?:\/(?:[^~/]|~0|~1)*)*)$/,
		byte,
		int32: {
			type: "number",
			validate: validateInt32
		},
		int64: {
			type: "number",
			validate: validateInt64
		},
		float: {
			type: "number",
			validate: validateNumber
		},
		double: {
			type: "number",
			validate: validateNumber
		},
		password: true,
		binary: true
	};
	exports.fastFormats = {
		...exports.fullFormats,
		date: fmtDef(/^\d\d\d\d-[0-1]\d-[0-3]\d$/, compareDate),
		time: fmtDef(/^(?:[0-2]\d:[0-5]\d:[0-5]\d|23:59:60)(?:\.\d+)?(?:z|[+-]\d\d(?::?\d\d)?)$/i, compareTime),
		"date-time": fmtDef(/^\d\d\d\d-[0-1]\d-[0-3]\dt(?:[0-2]\d:[0-5]\d:[0-5]\d|23:59:60)(?:\.\d+)?(?:z|[+-]\d\d(?::?\d\d)?)$/i, compareDateTime),
		"iso-time": fmtDef(/^(?:[0-2]\d:[0-5]\d:[0-5]\d|23:59:60)(?:\.\d+)?(?:z|[+-]\d\d(?::?\d\d)?)?$/i, compareIsoTime),
		"iso-date-time": fmtDef(/^\d\d\d\d-[0-1]\d-[0-3]\d[t\s](?:[0-2]\d:[0-5]\d:[0-5]\d|23:59:60)(?:\.\d+)?(?:z|[+-]\d\d(?::?\d\d)?)?$/i, compareIsoDateTime),
		uri: /^(?:[a-z][a-z0-9+\-.]*:)(?:\/?\/)?[^\s]*$/i,
		"uri-reference": /^(?:(?:[a-z][a-z0-9+\-.]*:)?\/?\/)?(?:[^\\\s#][^\s#]*)?(?:#[^\\\s]*)?$/i,
		email: /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i
	};
	exports.formatNames = Object.keys(exports.fullFormats);
	function isLeapYear(year) {
		return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
	}
	const DATE = /^(\d\d\d\d)-(\d\d)-(\d\d)$/;
	const DAYS = [
		0,
		31,
		28,
		31,
		30,
		31,
		30,
		31,
		31,
		30,
		31,
		30,
		31
	];
	function date(str) {
		const matches = DATE.exec(str);
		if (!matches) return false;
		const year = +matches[1];
		const month = +matches[2];
		const day = +matches[3];
		return month >= 1 && month <= 12 && day >= 1 && day <= (month === 2 && isLeapYear(year) ? 29 : DAYS[month]);
	}
	function compareDate(d1, d2) {
		if (!(d1 && d2)) return void 0;
		if (d1 > d2) return 1;
		if (d1 < d2) return -1;
		return 0;
	}
	const TIME = /^(\d\d):(\d\d):(\d\d(?:\.\d+)?)(z|([+-])(\d\d)(?::?(\d\d))?)?$/i;
	function getTime(strictTimeZone) {
		return function time(str) {
			const matches = TIME.exec(str);
			if (!matches) return false;
			const hr = +matches[1];
			const min = +matches[2];
			const sec = +matches[3];
			const tz = matches[4];
			const tzSign = matches[5] === "-" ? -1 : 1;
			const tzH = +(matches[6] || 0);
			const tzM = +(matches[7] || 0);
			if (tzH > 23 || tzM > 59 || strictTimeZone && !tz) return false;
			if (hr <= 23 && min <= 59 && sec < 60) return true;
			const utcMin = min - tzM * tzSign;
			const utcHr = hr - tzH * tzSign - (utcMin < 0 ? 1 : 0);
			return (utcHr === 23 || utcHr === -1) && (utcMin === 59 || utcMin === -1) && sec < 61;
		};
	}
	function compareTime(s1, s2) {
		if (!(s1 && s2)) return void 0;
		const t1 = (/* @__PURE__ */ new Date("2020-01-01T" + s1)).valueOf();
		const t2 = (/* @__PURE__ */ new Date("2020-01-01T" + s2)).valueOf();
		if (!(t1 && t2)) return void 0;
		return t1 - t2;
	}
	function compareIsoTime(t1, t2) {
		if (!(t1 && t2)) return void 0;
		const a1 = TIME.exec(t1);
		const a2 = TIME.exec(t2);
		if (!(a1 && a2)) return void 0;
		t1 = a1[1] + a1[2] + a1[3];
		t2 = a2[1] + a2[2] + a2[3];
		if (t1 > t2) return 1;
		if (t1 < t2) return -1;
		return 0;
	}
	const DATE_TIME_SEPARATOR = /t|\s/i;
	function getDateTime(strictTimeZone) {
		const time = getTime(strictTimeZone);
		return function date_time(str) {
			const dateTime = str.split(DATE_TIME_SEPARATOR);
			return dateTime.length === 2 && date(dateTime[0]) && time(dateTime[1]);
		};
	}
	function compareDateTime(dt1, dt2) {
		if (!(dt1 && dt2)) return void 0;
		const d1 = new Date(dt1).valueOf();
		const d2 = new Date(dt2).valueOf();
		if (!(d1 && d2)) return void 0;
		return d1 - d2;
	}
	function compareIsoDateTime(dt1, dt2) {
		if (!(dt1 && dt2)) return void 0;
		const [d1, t1] = dt1.split(DATE_TIME_SEPARATOR);
		const [d2, t2] = dt2.split(DATE_TIME_SEPARATOR);
		const res = compareDate(d1, d2);
		if (res === void 0) return void 0;
		return res || compareTime(t1, t2);
	}
	const NOT_URI_FRAGMENT = /\/|:/;
	const URI = /^(?:[a-z][a-z0-9+\-.]*:)(?:\/?\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:]|%[0-9a-f]{2})*@)?(?:\[(?:(?:(?:(?:[0-9a-f]{1,4}:){6}|::(?:[0-9a-f]{1,4}:){5}|(?:[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){4}|(?:(?:[0-9a-f]{1,4}:){0,1}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){3}|(?:(?:[0-9a-f]{1,4}:){0,2}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){2}|(?:(?:[0-9a-f]{1,4}:){0,3}[0-9a-f]{1,4})?::[0-9a-f]{1,4}:|(?:(?:[0-9a-f]{1,4}:){0,4}[0-9a-f]{1,4})?::)(?:[0-9a-f]{1,4}:[0-9a-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?))|(?:(?:[0-9a-f]{1,4}:){0,5}[0-9a-f]{1,4})?::[0-9a-f]{1,4}|(?:(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{1,4})?::)|[Vv][0-9a-f]+\.[a-z0-9\-._~!$&'()*+,;=:]+)\]|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:[a-z0-9\-._~!$&'()*+,;=]|%[0-9a-f]{2})*)(?::\d*)?(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*|\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*)?|(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*)(?:\?(?:[a-z0-9\-._~!$&'()*+,;=:@/?]|%[0-9a-f]{2})*)?(?:#(?:[a-z0-9\-._~!$&'()*+,;=:@/?]|%[0-9a-f]{2})*)?$/i;
	function uri(str) {
		return NOT_URI_FRAGMENT.test(str) && URI.test(str);
	}
	const BYTE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/gm;
	function byte(str) {
		BYTE.lastIndex = 0;
		return BYTE.test(str);
	}
	const MIN_INT32 = -(2 ** 31);
	const MAX_INT32 = 2 ** 31 - 1;
	function validateInt32(value) {
		return Number.isInteger(value) && value <= MAX_INT32 && value >= MIN_INT32;
	}
	function validateInt64(value) {
		return Number.isInteger(value);
	}
	function validateNumber() {
		return true;
	}
	const Z_ANCHOR = /[^\\]\\Z/;
	function regex(str) {
		if (Z_ANCHOR.test(str)) return false;
		try {
			new RegExp(str);
			return true;
		} catch (e) {
			return false;
		}
	}
}));
var require_limit = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.formatLimitDefinition = void 0;
	const ajv_1 = require_ajv();
	const codegen_1 = require_codegen();
	const ops = codegen_1.operators;
	const KWDs = {
		formatMaximum: {
			okStr: "<=",
			ok: ops.LTE,
			fail: ops.GT
		},
		formatMinimum: {
			okStr: ">=",
			ok: ops.GTE,
			fail: ops.LT
		},
		formatExclusiveMaximum: {
			okStr: "<",
			ok: ops.LT,
			fail: ops.GTE
		},
		formatExclusiveMinimum: {
			okStr: ">",
			ok: ops.GT,
			fail: ops.LTE
		}
	};
	exports.formatLimitDefinition = {
		keyword: Object.keys(KWDs),
		type: "string",
		schemaType: "string",
		$data: true,
		error: {
			message: ({ keyword, schemaCode }) => (0, codegen_1.str)`should be ${KWDs[keyword].okStr} ${schemaCode}`,
			params: ({ keyword, schemaCode }) => (0, codegen_1._)`{comparison: ${KWDs[keyword].okStr}, limit: ${schemaCode}}`
		},
		code(cxt) {
			const { gen, data, schemaCode, keyword, it } = cxt;
			const { opts, self } = it;
			if (!opts.validateFormats) return;
			const fCxt = new ajv_1.KeywordCxt(it, self.RULES.all.format.definition, "format");
			if (fCxt.$data) validate$DataFormat();
			else validateFormat();
			function validate$DataFormat() {
				const fmts = gen.scopeValue("formats", {
					ref: self.formats,
					code: opts.code.formats
				});
				const fmt = gen.const("fmt", (0, codegen_1._)`${fmts}[${fCxt.schemaCode}]`);
				cxt.fail$data((0, codegen_1.or)((0, codegen_1._)`typeof ${fmt} != "object"`, (0, codegen_1._)`${fmt} instanceof RegExp`, (0, codegen_1._)`typeof ${fmt}.compare != "function"`, compareCode(fmt)));
			}
			function validateFormat() {
				const format = fCxt.schema;
				const fmtDef = self.formats[format];
				if (!fmtDef || fmtDef === true) return;
				if (typeof fmtDef != "object" || fmtDef instanceof RegExp || typeof fmtDef.compare != "function") throw new Error(`"${keyword}": format "${format}" does not define "compare" function`);
				const fmt = gen.scopeValue("formats", {
					key: format,
					ref: fmtDef,
					code: opts.code.formats ? (0, codegen_1._)`${opts.code.formats}${(0, codegen_1.getProperty)(format)}` : void 0
				});
				cxt.fail$data(compareCode(fmt));
			}
			function compareCode(fmt) {
				return (0, codegen_1._)`${fmt}.compare(${data}, ${schemaCode}) ${KWDs[keyword].fail} 0`;
			}
		},
		dependencies: ["format"]
	};
	const formatLimitPlugin = (ajv) => {
		ajv.addKeyword(exports.formatLimitDefinition);
		return ajv;
	};
	exports.default = formatLimitPlugin;
}));
var require_dist = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	const formats_1 = require_formats();
	const limit_1 = require_limit();
	const codegen_1 = require_codegen();
	const fullName = new codegen_1.Name("fullFormats");
	const fastName = new codegen_1.Name("fastFormats");
	const formatsPlugin = (ajv, opts = { keywords: true }) => {
		if (Array.isArray(opts)) {
			addFormats(ajv, opts, formats_1.fullFormats, fullName);
			return ajv;
		}
		const [formats, exportName] = opts.mode === "fast" ? [formats_1.fastFormats, fastName] : [formats_1.fullFormats, fullName];
		addFormats(ajv, opts.formats || formats_1.formatNames, formats, exportName);
		if (opts.keywords) (0, limit_1.default)(ajv);
		return ajv;
	};
	formatsPlugin.get = (name, mode = "full") => {
		const f = (mode === "fast" ? formats_1.fastFormats : formats_1.fullFormats)[name];
		if (!f) throw new Error(`Unknown format "${name}"`);
		return f;
	};
	function addFormats(ajv, list, fs, exportName) {
		var _a;
		var _b;
		(_a = (_b = ajv.opts.code).formats) !== null && _a !== void 0 || (_b.formats = (0, codegen_1._)`require("ajv-formats/dist/formats").${exportName}`);
		for (const f of list) ajv.addFormat(f, fs[f]);
	}
	module.exports = exports = formatsPlugin;
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.default = formatsPlugin;
}));
var import_ajv = require_ajv();
var import__2019 = require__2019();
var import__2020 = require__2020();
/** `ajv-formats` default export, normalised through the CJS/ESM interop wrapper. */
var addFormats = (/* @__PURE__ */ __toESM(require_dist(), 1)).default;
function createDefaultAjvInstance(engineClass) {
	const ajv = new engineClass({
		strict: false,
		validateFormats: true,
		validateSchema: false,
		allErrors: true
	});
	addFormats(ajv);
	return ajv;
}
/**
* AJV-backed JSON Schema validator. See `@modelcontextprotocol/{client,server}/validators/ajv`
* for the customisation entry point (re-exports `Ajv` and `addFormats` from the bundled copy).
*
* Default dispatches on the schema's declared dialect: no `$schema` or 2020-12 → `Ajv2020`
* (SEP-1613); 2019-09 → `Ajv2019`; draft-07 or draft-06 → the classic draft-07 `Ajv` class
* (draft-07's changes over draft-06 are additive, so one engine covers both). Known draft-07 deviation: classic Ajv
* evaluates keywords adjacent to `$ref` (stricter than draft-07's ignore-siblings rule, matching
* v1's default engine), while the cfworker provider ignores them per spec.
* Schemas declaring any other `$schema` are
* rejected with a plain `Error`; pass a pre-configured Ajv instance to validate
* other dialects. The SDK bundles ajv internally but does not re-export `Ajv2020` (its type
* graph tips downstream declaration bundling — see #2339). To construct a custom 2020-12
* instance, add `ajv` to your own dependencies (matching the SDK's pinned version) and
* `import { Ajv2020 } from 'ajv/dist/2020.js'` — `new Ajv(...)` is the draft-07 class and would
* silently downgrade dialect.
*
* @example Use with default configuration
* ```ts source="./ajvProvider.examples.ts#AjvJsonSchemaValidator_default"
* const validator = new AjvJsonSchemaValidator();
* ```
*
* @example Use with a custom AJV instance
* ```ts source="./ajvProvider.examples.ts#AjvJsonSchemaValidator_customInstance"
* // import { Ajv2020 } from 'ajv/dist/2020.js';
* const ajv = new Ajv2020({ strict: false, validateSchema: false, allErrors: true });
* const validator = new AjvJsonSchemaValidator(ajv);
* ```
*
* @example Register ajv-formats
* ```ts source="./ajvProvider.examples.ts#AjvJsonSchemaValidator_withFormats"
* // import { Ajv2020 } from 'ajv/dist/2020.js';
* const ajv = new Ajv2020({ strict: false, validateSchema: false, allErrors: true });
* addFormats(ajv);
* const validator = new AjvJsonSchemaValidator(ajv);
* ```
*/
var AjvJsonSchemaValidator = class {
	_ajv;
	/** Lazy classic (draft-07) engine, built on the first draft-07/draft-06-declared schema. */
	_ajvDraft7;
	/** Lazy 2019-09 engine, built on the first 2019-09-declared schema. */
	_ajv2019;
	/** True iff the constructor received a caller-supplied engine; the `$schema` dispatch is skipped. */
	_userAjv;
	/**
	* @param ajv - Optional pre-configured AJV-compatible instance. When supplied, this instance is
	* used for **every** schema regardless of its declared `$schema` (the caller owns dialect
	* choice). When omitted, the provider constructs per-dialect engines (`Ajv2020`, `Ajv2019`,
	* and the classic draft-07 `Ajv` for draft-07/06-declared schemas) with
	* `strict: false`, `validateFormats: true`, `validateSchema: false`, `allErrors: true`, and
	* `ajv-formats` registered — **lazily, on the first {@linkcode getValidator} call needing each**, so
	* constructing the provider (e.g. as the default validator of a `Client`/`Server` that never
	* validates a JSON Schema) does not pay the ajv + ajv-formats instantiation cost. The parameter
	* is typed structurally so consumers who don't pass an instance need not have `ajv` installed.
	*/
	constructor(ajv) {
		this._userAjv = ajv !== void 0;
		this._ajv = ajv;
	}
	/** The underlying 2020-12 engine — the default instance is created on first use. */
	get ajv() {
		return this._ajv ??= createDefaultAjvInstance(import__2020.Ajv2020);
	}
	/**
	* Pick the engine for a schema's declared dialect. A caller-supplied engine is used for
	* every schema — do not second-guess by `$schema` (bring-your-own-validator means
	* bring-your-own-dialect). Otherwise: no `$schema` or 2020-12 → `Ajv2020`; 2019-09 →
	* `Ajv2019`; draft-07 or draft-06 → classic `Ajv`; anything else → `Error`.
	*/
	_engineFor(schema) {
		if (this._userAjv) return this.ajv;
		const dialect = declaredDialect(schema, "pass a pre-configured Ajv instance to AjvJsonSchemaValidator(ajv) to validate other dialects.");
		if (dialect === "2020-12") return this.ajv;
		if (dialect === "2019-09") return this._ajv2019 ??= createDefaultAjvInstance(import__2019.Ajv2019);
		return this._ajvDraft7 ??= createDefaultAjvInstance(import_ajv.Ajv);
	}
	getValidator(schema) {
		const engine = this._engineFor(schema);
		const ajvValidator = "$id" in schema && typeof schema.$id === "string" ? engine.getSchema(schema.$id) ?? engine.compile(schema) : engine.compile(schema);
		return (input) => {
			return ajvValidator(input) ? {
				valid: true,
				data: input,
				errorMessage: void 0
			} : {
				valid: false,
				data: void 0,
				errorMessage: engine.errorsText(ajvValidator.errors)
			};
		};
	}
};
import_ajv.Ajv;
//#endregion
//#region ../../node_modules/.pnpm/@modelcontextprotocol+server@2.4.0/node_modules/@modelcontextprotocol/server/dist/mcp-oHn3ureC.mjs
var COMPLETABLE_SYMBOL = Symbol.for("mcp.completable");
/**
* Checks if a schema is completable (has completion metadata).
*/
function isCompletable(schema) {
	return !!schema && typeof schema === "object" && COMPLETABLE_SYMBOL in schema;
}
/**
* Gets the completer callback from a completable schema, if it exists.
*/
function getCompleter(schema) {
	return schema[COMPLETABLE_SYMBOL]?.complete;
}
var MAX_TIMER_DELAY_MS = 2 ** 31 - 1;
/** Arms an unref'd timer, or disables keep-alive for invalid delays. */
function armSseKeepAlive(intervalMs, onTick) {
	if (!Number.isFinite(intervalMs) || intervalMs < 1) return;
	const timer = setInterval(onTick, Math.min(intervalMs, MAX_TIMER_DELAY_MS));
	timer.unref?.();
	return timer;
}
var readClassification;
/**
* The per-request micro-transport: a real, connected `Transport` whose whole
* lifetime is one HTTP exchange. See the module documentation for the
* response shapes it produces.
*
* Connecting a `Server` binds the instance to the classified modern revision
* when its `supportedProtocolVersions` lists it and the SDK implements it.
*/
var PerRequestHTTPServerTransport = class {
	static {
		readClassification = (transport) => transport._classification;
	}
	onclose;
	onerror;
	onmessage;
	_classification;
	_responseMode;
	_started = false;
	_used = false;
	_closed = false;
	_terminalDelivered = false;
	/**
	* `true` only while the inbound message is being delivered synchronously
	* to the connected protocol layer. The pre-handler gates (the era
	* registry gate, the edge→instance handoff check, the missing-handler
	* rejection) answer inside this window; request handlers always run
	* after it (the protocol layer defers them to a microtask). An error
	* sent inside the window is therefore ladder-originated, and an error
	* sent after it is handler-produced.
	*/
	_dispatchWindowOpen = false;
	_requestId;
	_deferredResponse;
	_sse;
	_abortCleanup;
	_keepAliveMs;
	constructor(options) {
		this._classification = options.classification;
		this._responseMode = options.responseMode ?? "auto";
		this._keepAliveMs = options.keepAliveMs ?? 15e3;
	}
	async start() {
		if (this._started) throw new Error("PerRequestHTTPServerTransport is already started");
		this._started = true;
	}
	/**
	* Serves the single exchange: delivers the classified message to the
	* connected server instance and resolves with the HTTP response.
	*
	* Throws when called a second time (the transport is strictly
	* single-use), or before a server has been connected to the transport.
	* The returned promise rejects with a connection-closed error when the
	* transport is closed before a response was produced (for example because
	* the client disconnected).
	*/
	async handleMessage(message, extra) {
		if (this._used) throw new Error("PerRequestHTTPServerTransport serves exactly one exchange; construct a new transport per request");
		if (!this._started || this.onmessage === void 0) throw new Error("PerRequestHTTPServerTransport is not connected: connect a server to this transport before handling a message");
		if (this._closed) throw new Error("PerRequestHTTPServerTransport is closed");
		this._used = true;
		const signal = extra?.request?.signal;
		if (signal?.aborted) {
			await this.close();
			throw new SdkError(SdkErrorCode.ConnectionClosed, "The request was aborted before it could be handled");
		}
		const messageExtra = {
			classification: this._classification,
			...extra?.request !== void 0 && { request: extra.request },
			...extra?.authInfo !== void 0 && { authInfo: extra.authInfo }
		};
		if (isJSONRPCRequest(message)) {
			this._requestId = message.id;
			let resolve;
			let reject;
			const promise = new Promise((promiseResolve, promiseReject) => {
				resolve = promiseResolve;
				reject = promiseReject;
			});
			this._deferredResponse = {
				promise,
				resolve,
				reject,
				settled: false
			};
			if (signal !== void 0) {
				const onAbort = () => void this.close();
				signal.addEventListener("abort", onAbort, { once: true });
				this._abortCleanup = () => signal.removeEventListener("abort", onAbort);
			}
			this._dispatchWindowOpen = true;
			try {
				this.onmessage(message, messageExtra);
			} finally {
				this._dispatchWindowOpen = false;
			}
			if (this._responseMode === "sse" && !this._closed && !this._deferredResponse.settled) this.upgradeToSse();
			return promise;
		}
		this.onmessage(message, messageExtra);
		return new Response(null, { status: 202 });
	}
	async send(message, options) {
		if (this._closed) return;
		const isResponse = isJSONRPCResultResponse(message) || isJSONRPCErrorResponse(message);
		const relatedId = isResponse ? message.id : options?.relatedRequestId;
		if (this._requestId === void 0 || relatedId === void 0 || relatedId !== this._requestId) {
			if (isResponse) this.onerror?.(/* @__PURE__ */ new Error(`Received a response for an unknown request id: ${String(message.id)}`));
			return;
		}
		if (isResponse) {
			if (this._terminalDelivered) return;
			this._terminalDelivered = true;
			const errorCode = isJSONRPCErrorResponse(message) ? message.error.code : void 0;
			const ladderStatus = errorCode !== void 0 && (this._dispatchWindowOpen || errorCode === ProtocolErrorCode.MissingRequiredClientCapability) ? LADDER_ERROR_HTTP_STATUS[errorCode] : void 0;
			if (ladderStatus !== void 0 && this._sse === void 0) {
				this.settleResponse(Response.json(message, {
					status: ladderStatus,
					headers: { "Content-Type": "application/json" }
				}));
				queueMicrotask(() => void this.close());
				return;
			}
			if (this._sse !== void 0 || this._responseMode === "sse") {
				if (this._sse === void 0) this.upgradeToSse();
				this.writeMessageFrame(message);
				this.finalizeStream();
				return;
			}
			this.settleResponse(Response.json(message, {
				status: 200,
				headers: { "Content-Type": "application/json" }
			}));
			queueMicrotask(() => void this.close());
			return;
		}
		if (this._responseMode === "json") return;
		if (this._sse === void 0) this.upgradeToSse();
		this.writeMessageFrame(message);
	}
	/**
	* Writes an SSE comment frame (a keep-alive heartbeat). Dropped when the
	* exchange is not currently streaming.
	*/
	writeCommentFrame(comment) {
		if (this._closed || this._sse === void 0 || this._sse.closed) return;
		const frame = comment.split("\n").map((line) => `: ${line}`).join("\n");
		this.writeFrame(`${frame}\n\n`);
	}
	async close() {
		if (this._closed) return;
		this._closed = true;
		this._abortCleanup?.();
		this._abortCleanup = void 0;
		if (this._sse?.keepAliveTimer !== void 0) clearInterval(this._sse.keepAliveTimer);
		if (this._sse !== void 0 && !this._sse.closed) {
			this._sse.closed = true;
			try {
				this._sse.controller.close();
			} catch {}
		}
		if (this._deferredResponse !== void 0 && !this._deferredResponse.settled) {
			this._deferredResponse.settled = true;
			this._deferredResponse.reject(new SdkError(SdkErrorCode.ConnectionClosed, "Connection closed before a response was produced"));
		}
		this.onclose?.();
	}
	settleResponse(response) {
		if (this._deferredResponse === void 0 || this._deferredResponse.settled) return;
		this._deferredResponse.settled = true;
		this._deferredResponse.resolve(response);
	}
	upgradeToSse() {
		let controller;
		const readable = new ReadableStream({
			start: (streamController) => {
				controller = streamController;
			},
			cancel: () => {
				this.close();
			}
		});
		this._sse = {
			controller,
			encoder: new TextEncoder(),
			closed: false
		};
		this._sse.keepAliveTimer = armSseKeepAlive(this._keepAliveMs, () => this.writeCommentFrame("keepalive"));
		this.settleResponse(new Response(readable, {
			status: 200,
			headers: {
				"Content-Type": "text/event-stream",
				"Cache-Control": "no-cache, no-transform",
				Connection: "keep-alive",
				"X-Accel-Buffering": "no"
			}
		}));
	}
	finalizeStream() {
		if (this._sse?.keepAliveTimer !== void 0) clearInterval(this._sse.keepAliveTimer);
		if (this._sse !== void 0 && !this._sse.closed) {
			this._sse.closed = true;
			try {
				this._sse.controller.close();
			} catch {}
		}
		queueMicrotask(() => void this.close());
	}
	writeMessageFrame(message) {
		this.writeFrame(`event: message\ndata: ${JSON.stringify(message)}\n\n`);
	}
	writeFrame(frame) {
		if (this._sse === void 0 || this._sse.closed) return;
		try {
			this._sse.controller.enqueue(this._sse.encoder.encode(frame));
		} catch (error) {
			this.onerror?.(/* @__PURE__ */ new Error(`Failed to write to the response stream: ${error}`));
		}
	}
};
/** Package-internal: the classification a per-request transport serves; `undefined` for any other transport. Not public API. */
function perRequestClassificationOf(transport) {
	return transport instanceof PerRequestHTTPServerTransport ? readClassification(transport) : void 0;
}
/** @internal */
function supportsScopeChallengeResolver(transport) {
	return typeof transport === "object" && transport !== null && "setScopeChallengeResolver" in transport && typeof transport.setScopeChallengeResolver === "function";
}
/**
* Default handler re-entries per originating request — tighter than the
* client driver's 10 because the shim holds a live wire request open.
*/
var DEFAULT_LEGACY_SHIM_MAX_ROUNDS = 8;
/** Default per-leg timeout: legs are human-paced, so the 60s protocol default is wrong. */
var DEFAULT_LEGACY_SHIM_ROUND_TIMEOUT_MS = 6e5;
/** Resolves and validates `ServerOptions.inputRequired`, failing loudly at construction time. */
function resolveLegacyShimOptions(options) {
	if (options?.maxRounds !== void 0 && (!Number.isInteger(options.maxRounds) || options.maxRounds < 1)) throw new RangeError(`inputRequired.maxRounds must be a positive integer (got ${options.maxRounds})`);
	if (options?.roundTimeoutMs !== void 0 && (!Number.isFinite(options.roundTimeoutMs) || options.roundTimeoutMs <= 0)) throw new RangeError(`inputRequired.roundTimeoutMs must be a positive number (got ${options.roundTimeoutMs})`);
	return {
		maxRounds: options?.maxRounds ?? DEFAULT_LEGACY_SHIM_MAX_ROUNDS,
		roundTimeoutMs: options?.roundTimeoutMs ?? DEFAULT_LEGACY_SHIM_ROUND_TIMEOUT_MS,
		legacyShim: options?.legacyShim ?? true
	};
}
/**
* Validates one `inputRequests` entry: malformed or unknown kinds are server
* bugs and fail loudly on both eras. Shared by the modern seam's capability
* check and the shim's gate.
*/
function coerceEmbeddedInputRequest(method, key, entry) {
	if (entry === null || typeof entry !== "object" || typeof entry.method !== "string") throw new ProtocolError(ProtocolErrorCode.InternalError, `Handler for ${method} returned an invalid input request '${key}': each inputRequests entry must be an embedded elicitation/create, sampling/createMessage, or roots/list request`);
	const embedded = entry;
	const required = requiredClientCapabilitiesForInputRequest(embedded);
	if (required === void 0) throw new ProtocolError(ProtocolErrorCode.InternalError, `Handler for ${method} returned an input request '${key}' of kind '${embedded.method}', which is not an embedded request the 2026-07-28 revision defines`);
	return {
		embedded,
		required
	};
}
/**
* The 2025-11-25 URL-mode wire shape requires an `elicitationId`; the 2026
* in-band shape has none, so URL legs mint one (CSPRNG-backed, with a
* getRandomValues fallback for runtimes without `randomUUID`).
*/
function syntheticElicitationId() {
	const webCrypto = globalThis.crypto;
	if (webCrypto?.randomUUID !== void 0) return webCrypto.randomUUID();
	const bytes = /* @__PURE__ */ new Uint8Array(16);
	webCrypto.getRandomValues(bytes);
	bytes[6] = bytes[6] & 15 | 64;
	bytes[8] = bytes[8] & 63 | 128;
	const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
/** Per-family surfacing: tools/call → isError result (the 2025 idiom); prompts/resources → JSON-RPC error. */
function legacyShimFailure(method, message) {
	if (method === "tools/call") return {
		content: [{
			type: "text",
			text: message
		}],
		isError: true
	};
	throw new ProtocolError(ProtocolErrorCode.InternalError, message);
}
/** The fulfilment loop — see the module doc for the contract. */
var LegacyInputRequiredShim = class {
	constructor(_host) {
		this._host = _host;
	}
	async fulfill(method, handler, request, ctx, firstResult) {
		const { maxRounds, roundTimeoutMs } = this._host;
		const outerSignal = ctx.mcpReq.signal;
		let current = firstResult;
		let round = 0;
		while (true) {
			round += 1;
			if (round > maxRounds) return legacyShimFailure(method, inputRequiredRoundsExceededMessage(method, maxRounds));
			const inputRequests = current.inputRequests;
			const hasInputRequests = inputRequests != null && Object.keys(inputRequests).length > 0;
			const requestState = typeof current.requestState === "string" ? current.requestState : void 0;
			if (!hasInputRequests && requestState === void 0) throw new ProtocolError(ProtocolErrorCode.InternalError, `Handler for ${method} returned an input-required result with neither inputRequests nor requestState (every InputRequiredResult must include at least one of the two)`);
			let responses;
			if (hasInputRequests) {
				const declared = this._host.resolvedClientCapabilities(ctx);
				const coerced = [];
				for (const [key, entry] of Object.entries(inputRequests)) {
					const { embedded, required } = coerceEmbeddedInputRequest(method, key, entry);
					if (embedded.method !== "roots/list" && embedded.params === void 0) throw new ProtocolError(ProtocolErrorCode.InternalError, `Handler for ${method} returned an input request '${key}' of kind '${embedded.method}' without params`);
					if (missingClientCapabilities(required, declared) !== void 0) return legacyShimFailure(method, `Cannot request input '${key}' (${embedded.method}): the client on this 2025-era connection did not declare the required capability${declared === void 0 ? " (no client capabilities are available on this connection — per-request legacy serving cannot receive server-to-client requests)" : ""}`);
					coerced.push([key, embedded]);
				}
				const roundAbort = linkedRoundAbort(outerSignal);
				try {
					const legOptions = {
						relatedRequestId: ctx.mcpReq.id,
						timeout: roundTimeoutMs,
						resetTimeoutOnProgress: true,
						onprogress: () => {},
						signal: roundAbort.signal
					};
					const fulfilled = await Promise.all(coerced.map(async ([key, embedded]) => {
						try {
							return [key, await this._dispatchLeg(embedded, legOptions)];
						} catch (error) {
							roundAbort.abort(error);
							throw error;
						}
					}));
					responses = Object.fromEntries(fulfilled);
				} catch (error) {
					if (outerSignal.aborted) throw error;
					return legacyShimFailure(method, `Fulfilling input required by '${method}' failed: ${error instanceof Error ? error.message : String(error)}`);
				} finally {
					roundAbort.dispose();
				}
			} else await sleep(250, outerSignal);
			let ctxNext = {
				...ctx,
				mcpReq: {
					...ctx.mcpReq,
					inputResponses: responses,
					droppedInputResponseKeys: void 0,
					requestState: requestStateAccessor(requestState)
				}
			};
			if (requestState !== void 0) {
				const decoded = await this._host.verifyRequestState(requestState, ctxNext, method);
				if (decoded !== void 0) ctxNext = withRequestStateValue(ctxNext, decoded);
			}
			const next = await handler(request, ctxNext);
			if (!isInputRequiredResult(next)) return next;
			current = next;
		}
	}
	/** Routes one embedded request through the host's existing 2025-era senders (gate already ran). */
	async _dispatchLeg(embedded, options) {
		switch (embedded.method) {
			case "elicitation/create": {
				let params = embedded.params;
				if (params.mode === "url" && params.elicitationId === void 0) params = {
					...params,
					elicitationId: syntheticElicitationId()
				};
				return await this._host.sendElicitation(params, options);
			}
			case "sampling/createMessage": return await this._host.sendSampling(embedded.params, options);
			case "roots/list": return await this._host.listRoots(embedded.params, options);
		}
	}
};
/**
* The request methods whose 2026-07-28 result vocabulary includes
* `input_required` (the multi round-trip methods). Returning an
* input-required result from any other handler is a server bug.
*/
var INPUT_REQUIRED_CAPABLE_METHODS = /* @__PURE__ */ new Set([
	"tools/call",
	"prompts/get",
	"resources/read"
]);
/**
* An MCP server on top of a pluggable transport.
*
* This server will automatically respond to the initialization flow as initiated from the client.
*
* @deprecated Use {@linkcode server/mcp.McpServer | McpServer} instead for the high-level API. Only use `Server` for advanced use cases.
*/
var Server = class extends Protocol {
	_clientCapabilities;
	_clientVersion;
	static {}
	_capabilities;
	_instructions;
	_jsonSchemaValidator;
	_cacheHints;
	_requestStateVerify;
	_inputRequiredServing;
	_legacyShim;
	_boundFromTransport = false;
	/** Lazily-built legacy shim; the loop lives in legacyInputRequiredShim.ts behind a narrow host contract. */
	_legacyInputRequiredShim() {
		return this._legacyShim ??= new LegacyInputRequiredShim({
			maxRounds: this._inputRequiredServing.maxRounds,
			roundTimeoutMs: this._inputRequiredServing.roundTimeoutMs,
			resolvedClientCapabilities: (ctx) => this._inputRequestCapabilityView(ctx),
			verifyRequestState: (state, ctx, method) => this._verifyRequestState(state, ctx, method),
			sendElicitation: (params, options) => this._sendElicitationLeg(params, options, { validateAcceptedContent: false }),
			sendSampling: (params, options) => this.createMessage(params, options),
			listRoots: (params, options) => this.listRoots(params, options)
		});
	}
	/**
	* Callback for when initialization has fully completed (i.e., the client has sent an `notifications/initialized` notification).
	*/
	oninitialized;
	/**
	* Initializes this server with the given name and version information.
	*/
	constructor(_serverInfo, options) {
		super(options);
		this._serverInfo = _serverInfo;
		this._capabilities = options?.capabilities ? { ...options.capabilities } : {};
		this._instructions = options?.instructions;
		this._jsonSchemaValidator = options?.jsonSchemaValidator ?? new AjvJsonSchemaValidator();
		this._requestStateVerify = options?.requestState?.verify;
		this._inputRequiredServing = resolveLegacyShimOptions(options?.inputRequired);
		if (options?.cacheHints !== void 0) {
			for (const [operation, hint] of Object.entries(options.cacheHints)) if (hint !== void 0) assertValidCacheHint(hint, `cacheHints['${operation}']`);
			this._cacheHints = options.cacheHints;
		}
		this.setRequestHandler("initialize", (request) => this._oninitialize(request));
		this.setNotificationHandler("notifications/initialized", () => this.oninitialized?.());
		if (modernProtocolVersions(this._supportedProtocolVersions).length > 0) this.setRequestHandler("server/discover", () => this._ondiscover());
		if (this._capabilities.logging) this._registerLoggingHandler();
	}
	/** Attaches to the given transport; rejects while this instance is connected to another one. */
	async connect(transport) {
		if (this.transport !== void 0) throw new SdkError(SdkErrorCode.AlreadyConnected, "Use a separate Server instance per connection: this instance is already connected to a transport. To connect it to a new transport, call close() first.");
		if (this._boundFromTransport) {
			this._boundFromTransport = false;
			this._negotiatedProtocolVersion = void 0;
		}
		const revision = perRequestClassificationOf(transport)?.revision;
		if (revision !== void 0 && !this._servedModernEra() && SUPPORTED_MODERN_PROTOCOL_VERSIONS.includes(revision) && modernProtocolVersions(this._supportedProtocolVersions).includes(revision)) {
			this._negotiatedProtocolVersion = revision;
			this._boundFromTransport = true;
		}
		await super.connect(transport);
	}
	/**
	* Registers the built-in `logging/setLevel` request handler.
	*
	* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577).
	* Remains functional during the deprecation window (at least twelve months).
	* Migrate to stderr logging (STDIO servers) or OpenTelemetry.
	*/
	_registerLoggingHandler() {
		this.setRequestHandler("logging/setLevel", async (request, ctx) => {
			const transportSessionId = ctx.sessionId || ctx.http?.req?.headers.get("mcp-session-id") || void 0;
			const { level } = request.params;
			const parseResult = parseSchema(LoggingLevelSchema, level);
			if (parseResult.success) this._loggingLevels.set(transportSessionId, parseResult.data);
			return {};
		});
	}
	buildContext(ctx, transportInfo) {
		const hasHttpInfo = ctx.http || transportInfo?.request || transportInfo?.closeSSEStream || transportInfo?.closeStandaloneSSEStream;
		return {
			...ctx,
			mcpReq: {
				...ctx.mcpReq,
				log: (level, data, logger) => {
					if (!this._capabilities.logging) return Promise.resolve();
					let threshold;
					if (this._servedModernEra()) {
						threshold = ctx.mcpReq.envelope?.[LOG_LEVEL_META_KEY];
						if (threshold === void 0) return Promise.resolve();
					} else threshold = this._loggingLevels.get(ctx.sessionId) ?? this._loggingLevels.get(void 0);
					if (threshold !== void 0 && this.LOG_LEVEL_SEVERITY.get(level) < this.LOG_LEVEL_SEVERITY.get(threshold)) return Promise.resolve();
					return ctx.mcpReq.notify({
						method: "notifications/message",
						params: {
							level,
							data,
							logger
						}
					});
				},
				elicitInput: (params, options) => this.elicitInput(params, options),
				requestSampling: (params, options) => this.createMessage(params, options)
			},
			http: hasHttpInfo ? {
				...ctx.http,
				req: transportInfo?.request,
				closeSSE: transportInfo?.closeSSEStream,
				closeStandaloneSSE: transportInfo?.closeStandaloneSSEStream
			} : void 0
		};
	}
	_loggingLevels = /* @__PURE__ */ new Map();
	LOG_LEVEL_SEVERITY = new Map(LoggingLevelSchema.options.map((level, index) => [level, index]));
	isMessageIgnored = (level, sessionId) => {
		const currentLevel = this._loggingLevels.get(sessionId);
		return currentLevel ? this.LOG_LEVEL_SEVERITY.get(level) < this.LOG_LEVEL_SEVERITY.get(currentLevel) : false;
	};
	/**
	* Registers new capabilities. This can only be called before connecting to a transport.
	*
	* The new capabilities will be merged with any existing capabilities previously given (e.g., at initialization).
	*/
	registerCapabilities(capabilities) {
		if (this.transport) throw new SdkError(SdkErrorCode.AlreadyConnected, "Cannot register capabilities after connecting to transport");
		const hadLogging = !!this._capabilities.logging;
		this._capabilities = mergeCapabilities(this._capabilities, capabilities);
		if (!hadLogging && this._capabilities.logging) this._registerLoggingHandler();
	}
	/**
	* Enforces server-side validation for `tools/call` results regardless of how the
	* handler was registered, attaches the configured per-operation cache hint
	* (when one exists) so the 2026-07-28 encode seam can fill `ttlMs`/`cacheScope`
	* for results that do not provide their own, and owns the multi-round-trip
	* seam: on the methods whose 2026-07-28 result vocabulary includes
	* `input_required` (`tools/call`, `prompts/get`, `resources/read`) an
	* input-required return skips result-schema validation and is checked
	* against the served era, the at-least-one rule, and the request's own
	* declared client capabilities; on every other method an input-required
	* return is a server bug and fails loudly. The hint rides a symbol-keyed
	* property that is never serialized, so 2025-era responses are unaffected.
	*/
	_wrapHandler(method, handler) {
		if (method !== "tools/call") {
			const cacheHint = this._cacheHints?.[method];
			const isInputRequiredCapable = INPUT_REQUIRED_CAPABLE_METHODS.has(method);
			if (cacheHint === void 0 && !isInputRequiredCapable) return async (request, ctx) => {
				const result = await handler(request, ctx);
				if (isInputRequiredResult(result)) throw new ProtocolError(ProtocolErrorCode.InternalError, `Handler for ${method} returned an input-required result, but only tools/call, prompts/get and resources/read support input_required (protocol revision 2026-07-28)`);
				return result;
			};
			return async (request, ctx) => {
				const result = isInputRequiredCapable ? await this._invokeInputRequiredCapableHandler(method, handler, request, ctx) : await handler(request, ctx);
				if (isInputRequiredResult(result)) {
					if (!isInputRequiredCapable) throw new ProtocolError(ProtocolErrorCode.InternalError, `Handler for ${method} returned an input-required result, but only tools/call, prompts/get and resources/read support input_required (protocol revision 2026-07-28)`);
					return result;
				}
				return cacheHint === void 0 ? result : attachCacheHintFallback(result, cacheHint);
			};
		}
		return async (request, ctx) => {
			const codec = codecForVersion(this._negotiatedProtocolVersion);
			const validatedRequest = codec.validateRequest("tools/call", request);
			if (!validatedRequest.ok) throw new ProtocolError(validatedRequest.reason === "not-in-era" ? ProtocolErrorCode.InternalError : ProtocolErrorCode.InvalidParams, validatedRequest.reason === "not-in-era" ? "No wire schema for tools/call in the resolved era" : `Invalid tools/call request: ${validatedRequest.message}`);
			const result = await this._invokeInputRequiredCapableHandler("tools/call", handler, request, ctx);
			if (isInputRequiredResult(result)) return result;
			const normalizedResult = normalizeContentlessToolResult(result);
			const validationResult = codec.validateResult("tools/call", normalizedResult);
			if (!validationResult.ok) throw new ProtocolError(validationResult.reason === "not-in-era" ? ProtocolErrorCode.InternalError : ProtocolErrorCode.InvalidParams, validationResult.reason === "not-in-era" ? "No wire schema for tools/call in the resolved era" : `Invalid tools/call result: ${validationResult.message}`);
			return validationResult.value;
		};
	}
	/**
	* Whether this instance is bound to a 2026-07-28-or-later protocol
	* revision. Era is instance state — a serving entry (`createMcpHandler`,
	* `serveStdio`) marks the instance modern at construction; a 2025-era
	* `initialize` handshake binds it legacy. The multi-round-trip seam reads
	* this directly: there is no per-request era consult.
	*/
	_servedModernEra() {
		return this._negotiatedProtocolVersion !== void 0 && isModernProtocolVersion(this._negotiatedProtocolVersion);
	}
	/**
	* Invokes a handler for one of the multi-round-trip methods and applies
	* the input-required seam:
	*
	* - a `UrlElicitationRequiredError` (or any 2025-style server→client
	*   request idiom) escaping the handler on a request served on the
	*   2026-07-28 era fails LOUDLY with a clear steer to
	*   `inputRequired.elicitUrl(...)` — the `-32042` error never reaches the
	*   2026-07-28 wire and the throw is not silently converted. Requests
	*   served on the 2025 era keep today's `-32042` behavior byte-exact (the
	*   error is rethrown unchanged).
	* - an input-required RETURN toward a 2026-07-28 request must satisfy
	*   the at-least-one rule, and every embedded request must be covered by
	*   the capabilities declared on the request's envelope (violations
	*   answer the typed `-32021` error). Toward a 2025-era request the
	*   return is fulfilled by the default-on legacy shim, whose own gate
	*   consults the initialize-declared capabilities and surfaces
	*   violations per family; `inputRequired.legacyShim: false` restores
	*   the pre-shim loud failure.
	*/
	async _invokeInputRequiredCapableHandler(method, handler, request, ctx) {
		const servedModern = this._servedModernEra();
		const rawRequestState = ctx.mcpReq.requestState();
		if (rawRequestState !== void 0 && typeof rawRequestState !== "string") throw new ProtocolError(ProtocolErrorCode.InvalidParams, "Invalid or expired requestState", { reason: "invalid_request_state" });
		let ctxForHandler = ctx;
		if (typeof rawRequestState === "string") {
			const decoded = await this._verifyRequestState(rawRequestState, ctx, method);
			if (decoded !== void 0) ctxForHandler = withRequestStateValue(ctx, decoded);
		}
		let result;
		try {
			result = await handler(request, ctxForHandler);
		} catch (error) {
			if (error instanceof ProtocolError && error.code === ProtocolErrorCode.UrlElicitationRequired) {
				if (!servedModern) throw error;
				throw new ProtocolError(ProtocolErrorCode.InternalError, `URL elicitation cannot be signalled by throwing UrlElicitationRequiredError on protocol revision ${this._negotiatedProtocolVersion}: return inputRequired({ inputRequests: { …: inputRequired.elicitUrl(...) } }) from the handler instead. The urlElicitationRequired error (-32042) of earlier revisions is not available on this revision.`);
			}
			throw error;
		}
		if (!isInputRequiredResult(result)) return result;
		if (!servedModern) {
			if (!this._inputRequiredServing.legacyShim) throw new ProtocolError(ProtocolErrorCode.InternalError, `Handler for ${method} returned an input-required result, but this request is served on protocol revision ${this._negotiatedProtocolVersion ?? "2025-11-25"}, which has no input_required vocabulary`);
			return await this._legacyInputRequiredShim().fulfill(method, handler, request, ctxForHandler, result);
		}
		const inputRequests = result.inputRequests;
		const hasInputRequests = inputRequests != null && Object.keys(inputRequests).length > 0;
		const hasRequestState = typeof result.requestState === "string";
		if (!hasInputRequests && !hasRequestState) throw new ProtocolError(ProtocolErrorCode.InternalError, `Handler for ${method} returned an input-required result with neither inputRequests nor requestState (every InputRequiredResult must include at least one of the two)`);
		if (hasInputRequests) {
			const declared = this._inputRequestCapabilityView(ctx);
			for (const [key, entry] of Object.entries(inputRequests)) {
				const { embedded, required } = coerceEmbeddedInputRequest(method, key, entry);
				const missing = missingClientCapabilities(required, declared);
				if (missing !== void 0) throw new MissingRequiredClientCapabilityError({ requiredCapabilities: missing }, `Cannot request input '${key}' (${embedded.method}): the request's client capabilities do not declare the required capability`);
			}
		}
		return result;
	}
	/**
	* Runs the configured `requestState.verify` hook and returns its
	* resolved value (`undefined` when unconfigured or the hook returns
	* nothing). Deny-on-error: any hook failure answers the frozen `-32602`;
	* the reason goes to `onerror` only.
	*/
	async _verifyRequestState(state, ctx, method) {
		if (this._requestStateVerify === void 0) return;
		try {
			return await this._requestStateVerify(state, ctx);
		} catch (error) {
			this.onerror?.(/* @__PURE__ */ new Error(`requestState verification rejected ${method}: ${error instanceof Error ? error.message : String(error)}`));
			throw new ProtocolError(ProtocolErrorCode.InvalidParams, "Invalid or expired requestState", { reason: "invalid_request_state" });
		}
	}
	/**
	* The per-request resolved client-capabilities view: the request's own
	* `_meta` envelope on the 2026 era; the `initialize`-declared state on a
	* 2025-era connection. Per-request instances that never saw an
	* initialize (stateless legacy) hold nothing, so gates refuse there.
	*/
	_inputRequestCapabilityView(ctx) {
		return this._servedModernEra() ? ctx.mcpReq.envelope?.[CLIENT_CAPABILITIES_META_KEY] : this._clientCapabilities;
	}
	/**
	* Guard for the push-style server→client request APIs ({@linkcode createMessage},
	* {@linkcode elicitInput}, {@linkcode listRoots}, {@linkcode ping}) on a
	* modern-era instance: the 2026-07-28 revision has no server→client request
	* channel, so the call fails before any wire traffic with a typed error
	* whose message steers to `inputRequired(...)`. The base era gate would
	* also reject it; this guard runs first to carry the steer.
	*/
	_assertPushApiInServedEra(method) {
		if (this._servedModernEra()) throw new SdkError(SdkErrorCode.MethodNotSupportedByProtocolVersion, `Server-to-client requests are not available on protocol revision ${this._negotiatedProtocolVersion}: '${method}' cannot be sent while serving a request on that revision. Return inputRequired({ ... }) from the handler instead — the client fulfils the embedded requests and retries the original request (multi round-trip requests).`, {
			method,
			era: "2026-07-28"
		});
	}
	assertCapabilityForMethod(method) {
		switch (method) {
			case "sampling/createMessage":
				if (!this._clientCapabilities?.sampling) throw new SdkError(SdkErrorCode.CapabilityNotSupported, `Client does not support sampling (required for ${method})`);
				break;
			case "elicitation/create":
				if (!this._clientCapabilities?.elicitation) throw new SdkError(SdkErrorCode.CapabilityNotSupported, `Client does not support elicitation (required for ${method})`);
				break;
			case "roots/list": if (!this._clientCapabilities?.roots) throw new SdkError(SdkErrorCode.CapabilityNotSupported, `Client does not support listing roots (required for ${method})`);
		}
	}
	assertNotificationCapability(method) {
		switch (method) {
			case "notifications/message":
				if (!this._capabilities.logging) throw new SdkError(SdkErrorCode.CapabilityNotSupported, `Server does not support logging (required for ${method})`);
				break;
			case "notifications/resources/updated":
			case "notifications/resources/list_changed":
				if (!this._capabilities.resources) throw new SdkError(SdkErrorCode.CapabilityNotSupported, `Server does not support notifying about resources (required for ${method})`);
				break;
			case "notifications/tools/list_changed":
				if (!this._capabilities.tools) throw new SdkError(SdkErrorCode.CapabilityNotSupported, `Server does not support notifying of tool list changes (required for ${method})`);
				break;
			case "notifications/prompts/list_changed":
				if (!this._capabilities.prompts) throw new SdkError(SdkErrorCode.CapabilityNotSupported, `Server does not support notifying of prompt list changes (required for ${method})`);
				break;
			case "notifications/elicitation/complete": if (!this._clientCapabilities?.elicitation?.url) throw new SdkError(SdkErrorCode.CapabilityNotSupported, `Client does not support URL elicitation (required for ${method})`);
		}
	}
	assertRequestHandlerCapability(method) {
		switch (method) {
			case "completion/complete":
				if (!this._capabilities.completions) throw new SdkError(SdkErrorCode.CapabilityNotSupported, `Server does not support completions (required for ${method})`);
				break;
			case "logging/setLevel":
				if (!this._capabilities.logging) throw new SdkError(SdkErrorCode.CapabilityNotSupported, `Server does not support logging (required for ${method})`);
				break;
			case "prompts/get":
			case "prompts/list":
				if (!this._capabilities.prompts) throw new SdkError(SdkErrorCode.CapabilityNotSupported, `Server does not support prompts (required for ${method})`);
				break;
			case "resources/list":
			case "resources/templates/list":
			case "resources/read":
				if (!this._capabilities.resources) throw new SdkError(SdkErrorCode.CapabilityNotSupported, `Server does not support resources (required for ${method})`);
				break;
			case "tools/call":
			case "tools/list": if (!this._capabilities.tools) throw new SdkError(SdkErrorCode.CapabilityNotSupported, `Server does not support tools (required for ${method})`);
		}
	}
	async _oninitialize(request) {
		const requestedVersion = request.params.protocolVersion;
		this._clientCapabilities = request.params.capabilities;
		this._clientVersion = request.params.clientInfo;
		const legacyVersions = legacyProtocolVersions(this._supportedProtocolVersions);
		const protocolVersion = legacyVersions.includes(requestedVersion) ? requestedVersion : legacyVersions[0] ?? "2025-11-25";
		this._negotiatedProtocolVersion = protocolVersion;
		this.transport?.setProtocolVersion?.(protocolVersion);
		return {
			protocolVersion,
			capabilities: this.getCapabilities(),
			serverInfo: this._serverInfo,
			...this._instructions && { instructions: this._instructions }
		};
	}
	/**
	* Answers `server/discover` (protocol revision 2026-07-28). `supportedVersions`
	* lists only modern revisions (2025-era versions are negotiated via `initialize`);
	* the capabilities are advertised as-is, listChanged/subscribe bits included
	* (see {@linkcode discoverAdvertisedCapabilities}).
	*/
	_ondiscover() {
		return {
			supportedVersions: modernProtocolVersions(this._supportedProtocolVersions),
			capabilities: discoverAdvertisedCapabilities(this.getCapabilities()),
			...this._instructions && { instructions: this._instructions }
		};
	}
	/**
	* The identity the 2026-era encode seam stamps into every outbound
	* result's `_meta` under `io.modelcontextprotocol/serverInfo` (spec PR
	* #3002: servers SHOULD identify themselves on every response).
	*/
	_outboundServerInfo() {
		return this._serverInfo;
	}
	/**
	* After initialization has completed, this will be populated with the client's reported capabilities.
	*
	* @deprecated Read client identity from the per-request handler context instead: on
	* 2026-07-28 (per-request envelope) requests `ctx.mcpReq.envelope` carries the client's
	* declared capabilities, while on 2025-era connections this accessor keeps returning the
	* `initialize`-scoped value. The accessor remains functional where `createMcpHandler`
	* serves the 2026-07-28 era: it backfills it per request from the validated envelope.
	*/
	getClientCapabilities() {
		return this._clientCapabilities;
	}
	/**
	* After initialization has completed, this will be populated with information about the client's name and version.
	*
	* @deprecated Read client identity from the per-request handler context instead: on
	* 2026-07-28 (per-request envelope) requests `ctx.mcpReq.envelope` carries the client's
	* name and version, while on 2025-era connections this accessor keeps returning the
	* `initialize`-scoped value. The accessor remains functional where `createMcpHandler`
	* serves the 2026-07-28 era: it backfills it per request from the validated envelope.
	*/
	getClientVersion() {
		return this._clientVersion;
	}
	/**
	* After initialization has completed, this will be populated with the protocol version negotiated
	* with the client (the version the server responded with during the initialize handshake), or
	* `undefined` before initialization.
	*
	* @deprecated Read the protocol revision from the per-request handler context instead: on
	* 2026-07-28 (per-request envelope) requests `ctx.mcpReq.envelope` names the revision the
	* request was sent for, while on 2025-era connections this accessor keeps returning the
	* `initialize`-negotiated version. The accessor remains functional — instances serving the
	* 2026-07-28 era report that revision.
	*/
	getNegotiatedProtocolVersion() {
		return this._negotiatedProtocolVersion;
	}
	/**
	* Project a `tools/call` result through this instance's negotiated wire
	* codec — the era-agnostic SEP-2106 §4.3 TextContent auto-append, plus on
	* the 2025 era the `{result:…}` wrap when `structuredContent` is a
	* non-object value or the advertised `outputSchema` had a non-object root.
	* Identity for object-shaped `structuredContent` on the 2026 era.
	*
	* `McpServer`'s built-in `tools/call` handler routes through this method.
	* Low-level `setRequestHandler('tools/call', …)` authors call it
	* themselves so the projection lives in one place (the codec) and the
	* server-side handler stays era-blind.
	*
	* This is the only codec function exposed on `Server` — the full
	* `WireCodec` is intentionally not part of the public surface.
	*/
	projectCallToolResult(result, advertisedOutputSchema) {
		return this._wireCodec().projectCallToolResult(result, advertisedOutputSchema);
	}
	/**
	* Returns the current server capabilities.
	*/
	getCapabilities() {
		return this._capabilities;
	}
	/**
	* Sends a `ping` request to the connected client.
	*
	* @deprecated The 2026-07-28 protocol removed ping; it throws on a 2026-07-28-era instance.
	* If your factory serves both eras, this only works on the legacy path.
	*/
	async ping() {
		this._assertPushApiInServedEra("ping");
		return this.request({ method: "ping" });
	}
	async createMessage(params, options) {
		this._assertPushApiInServedEra("sampling/createMessage");
		if ((params.tools || params.toolChoice) && !this._clientCapabilities?.sampling?.tools) throw new SdkError(SdkErrorCode.CapabilityNotSupported, "Client does not support sampling tools capability.");
		if (params.messages.length > 0) {
			const lastMessage = params.messages.at(-1);
			const lastContent = Array.isArray(lastMessage.content) ? lastMessage.content : [lastMessage.content];
			const hasToolResults = lastContent.some((c) => c.type === "tool_result");
			const previousMessage = params.messages.length > 1 ? params.messages.at(-2) : void 0;
			const previousContent = previousMessage ? Array.isArray(previousMessage.content) ? previousMessage.content : [previousMessage.content] : [];
			const hasPreviousToolUse = previousContent.some((c) => c.type === "tool_use");
			if (hasToolResults) {
				if (lastContent.some((c) => c.type !== "tool_result")) throw new ProtocolError(ProtocolErrorCode.InvalidParams, "The last message must contain only tool_result content if any is present");
				if (!hasPreviousToolUse) throw new ProtocolError(ProtocolErrorCode.InvalidParams, "tool_result blocks are not matching any tool_use from the previous message");
			}
			if (hasPreviousToolUse) {
				const toolUseIds = new Set(previousContent.filter((c) => c.type === "tool_use").map((c) => c.id));
				const toolResultIds = new Set(lastContent.filter((c) => c.type === "tool_result").map((c) => c.toolUseId));
				if (toolUseIds.size !== toolResultIds.size || ![...toolUseIds].every((id) => toolResultIds.has(id))) throw new ProtocolError(ProtocolErrorCode.InvalidParams, "ids of tool_result blocks and tool_use blocks from previous message do not match");
			}
		}
		const hasTools = Boolean(params.tools || params.toolChoice);
		const wide = await this.request({
			method: "sampling/createMessage",
			params
		}, options);
		const outcome = this._wireCodec().samplingResultVariant(hasTools, wide);
		if (!outcome.ok) throw new SdkError(SdkErrorCode.InvalidResult, `Invalid sampling/createMessage result: ${outcome.reason === "invalid" ? outcome.message : outcome.reason}`);
		return outcome.value;
	}
	/**
	* Creates an elicitation request for the given parameters.
	* For backwards compatibility, `mode` may be omitted for form requests and will default to `"form"`.
	* @param params The parameters for the elicitation request.
	* @param options Optional request options.
	* @returns The result of the elicitation request.
	*
	* @deprecated Throws on a 2026-07-28-era request — use {@link index.inputRequired | inputRequired} (multi-round-trip)
	* instead. The 2025 push-style server-to-client request model is replaced by input_required
	* results in the 2026-07-28 protocol. If your factory serves both eras, this only works on the
	* legacy path.
	*/
	async elicitInput(params, options) {
		this._assertPushApiInServedEra("elicitation/create");
		switch (params.mode ?? "form") {
			case "url":
				if (!this._clientCapabilities?.elicitation?.url) throw new SdkError(SdkErrorCode.CapabilityNotSupported, "Client does not support url elicitation.");
				break;
			case "form": if (!this._clientCapabilities?.elicitation?.form) throw new SdkError(SdkErrorCode.CapabilityNotSupported, "Client does not support form elicitation.");
		}
		return this._sendElicitationLeg(params, options);
	}
	/**
	* The capability-check-free core of {@linkcode elicitInput}. The shim
	* uses it because its gate differs from the public checks: a bare
	* `elicitation: {}` counts as form support (the pre-mode rule), and
	* accepted content passes through unvalidated for parity with the
	* modern client driver (handlers validate via the schema-aware
	* `acceptedContent` overload and can re-ask).
	*/
	async _sendElicitationLeg(params, options, behavior) {
		const mode = params.mode ?? "form";
		const validateAcceptedContent = behavior?.validateAcceptedContent ?? true;
		switch (mode) {
			case "url": {
				const urlParams = params;
				return this.request({
					method: "elicitation/create",
					params: urlParams
				}, options);
			}
			case "form": {
				const formParams = params.mode === "form" ? params : {
					...params,
					mode: "form"
				};
				const result = await this.request({
					method: "elicitation/create",
					params: formParams
				}, options);
				if (validateAcceptedContent && result.action === "accept" && result.content && formParams.requestedSchema) try {
					const validationResult = this._jsonSchemaValidator.getValidator(formParams.requestedSchema)(result.content);
					if (!validationResult.valid) throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Elicitation response content does not match requested schema: ${validationResult.errorMessage}`);
				} catch (error) {
					if (error instanceof ProtocolError) throw error;
					throw new ProtocolError(ProtocolErrorCode.InternalError, `Error validating elicitation response: ${error instanceof Error ? error.message : String(error)}`);
				}
				return result;
			}
		}
	}
	/**
	* Creates a reusable callback that, when invoked, will send a `notifications/elicitation/complete`
	* notification for the specified elicitation ID.
	*
	* The notification (and the `elicitationId` it references) exists only on protocol revision
	* 2025-11-25 — the 2026-07-28 revision removed both. On a connection negotiated at 2026-07-28 the
	* returned callback rejects with a typed local error before anything reaches the transport
	* (the method is not part of that revision's wire registry).
	*
	* @param elicitationId The ID of the elicitation to mark as complete.
	* @param options Optional notification options. Useful when the completion notification should be related to a prior request.
	* @returns A function that emits the completion notification when awaited.
	*/
	createElicitationCompletionNotifier(elicitationId, options) {
		if (!this._clientCapabilities?.elicitation?.url) throw new SdkError(SdkErrorCode.CapabilityNotSupported, "Client does not support URL elicitation (required for notifications/elicitation/complete)");
		return () => this.notification({
			method: "notifications/elicitation/complete",
			params: { elicitationId }
		}, options);
	}
	/**
	* Requests the list of roots from the client.
	*
	* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577).
	* Throws on a 2026-07-28-era request — use {@link index.inputRequired | inputRequired} (multi-round-trip) instead,
	* or migrate to passing paths via tool parameters, resource URIs, or configuration. The 2025
	* push-style server-to-client request model is replaced by input_required results in the
	* 2026-07-28 protocol. If your factory serves both eras, this only works on the legacy path.
	*/
	async listRoots(params, options) {
		this._assertPushApiInServedEra("roots/list");
		return this.request({
			method: "roots/list",
			params
		}, options);
	}
	/**
	* Sends a logging message to the client, if connected.
	* Note: You only need to send the parameters object, not the entire JSON-RPC message.
	* @see {@linkcode LoggingMessageNotification}
	* @param params
	* @param sessionId Optional for stateless transports and backward compatibility.
	*
	* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577).
	* Remains functional during the deprecation window (at least twelve months).
	* Migrate to stderr logging (STDIO servers) or OpenTelemetry.
	*/
	async sendLoggingMessage(params, sessionId) {
		if (this._capabilities.logging && !this.isMessageIgnored(params.level, sessionId)) return this.notification({
			method: "notifications/message",
			params
		});
	}
	async sendResourceUpdated(params) {
		return this.notification({
			method: "notifications/resources/updated",
			params
		});
	}
	async sendResourceListChanged() {
		return this.notification({ method: "notifications/resources/list_changed" });
	}
	async sendToolListChanged() {
		return this.notification({ method: "notifications/tools/list_changed" });
	}
	async sendPromptListChanged() {
		return this.notification({ method: "notifications/prompts/list_changed" });
	}
};
/**
* The capability set a server advertises on `server/discover`. Pure — never
* mutates the input; the legacy `initialize` advertisement is untouched.
*
* The serving entries serve `subscriptions/listen` themselves, so the
* `listChanged` and `resources.subscribe` capability bits are advertised
* as-is: a modern-era client uses them to decide which notification types to
* request on its listen filter.
*/
function discoverAdvertisedCapabilities(capabilities) {
	return { ...capabilities };
}
function toolInputElementCount(value, max) {
	let count = 0;
	const stack = [value];
	while (stack.length > 0) {
		const node = stack.pop();
		if (node === null || typeof node !== "object") continue;
		if (Array.isArray(node)) for (const child of node) {
			if (++count > max) return count;
			if (child !== null && typeof child === "object") stack.push(child);
		}
		else for (const key in node) {
			if (!Object.prototype.hasOwnProperty.call(node, key)) continue;
			if (++count > max) return count;
			const child = node[key];
			if (child !== null && typeof child === "object") stack.push(child);
		}
	}
	return count;
}
function resolveMaxToolInputElements(value) {
	if (value === void 0 || value === Infinity) return void 0;
	if (typeof value !== "number" || Number.isNaN(value) || value < 1) throw new RangeError(`maxToolInputElements must be a number of at least 1, or Infinity, got ${String(value)}`);
	return value;
}
/**
* High-level MCP server that provides a simpler API for working with resources, tools, and prompts.
* For advanced usage (like sending notifications or setting custom request handlers), use the underlying
* {@linkcode Server} instance available via the {@linkcode McpServer.server | server} property.
*
* @example
* ```ts source="./mcp.examples.ts#McpServer_basicUsage"
* const server = new McpServer({
*     name: 'my-server',
*     version: '1.0.0'
* });
* ```
*/
var McpServer = class {
	/**
	* The underlying {@linkcode Server} instance, useful for advanced operations like sending notifications.
	*/
	server;
	_maxToolInputElements;
	_registeredResources = {};
	_registeredResourceTemplates = {};
	_registeredTools = {};
	_registeredPrompts = {};
	/** Per-tool JSON-converted `inputSchema`, filled on first use by `toolInputSchemaJson()`. */
	_toolInputSchemaJson = {};
	/**
	* The JSON-serialized `inputSchema` of a registered tool, or `undefined`
	* when no such tool is registered. Used by the HTTP entry's pre-dispatch
	* SEP-2243 `Mcp-Param-*` validation step (which needs the same JSON Schema
	* `tools/list` would emit, before dispatch reaches the handler).
	*
	* @internal
	*/
	toolInputSchemaJson(name) {
		const tool = this._registeredTools[name];
		if (tool === void 0 || !tool.enabled) return void 0;
		if (Object.hasOwn(this._toolInputSchemaJson, name)) return this._toolInputSchemaJson[name];
		if (tool.inputSchema === void 0) return EMPTY_OBJECT_JSON_SCHEMA;
		try {
			const json = standardSchemaToJsonSchema(tool.inputSchema, "input");
			this._toolInputSchemaJson[name] = json;
			return json;
		} catch {
			return;
		}
	}
	constructor(serverInfo, options) {
		this.server = new Server(serverInfo, options);
		this._maxToolInputElements = resolveMaxToolInputElements(options?.maxToolInputElements);
		if (options?.capabilities?.tools) this.setToolRequestHandlers();
		if (options?.capabilities?.resources) this.setResourceRequestHandlers();
		if (options?.capabilities?.prompts) this.setPromptRequestHandlers();
	}
	/**
	* Attaches to the given transport, starts it, and starts listening for messages.
	*
	* The `server` object assumes ownership of the {@linkcode Transport}, replacing any callbacks that have already been set, and expects that it is the only user of the {@linkcode Transport} instance going forward.
	*
	* @example
	* ```ts source="./mcp.examples.ts#McpServer_connect_stdio"
	* const server = new McpServer({ name: 'my-server', version: '1.0.0' });
	* const transport = new StdioServerTransport();
	* await server.connect(transport);
	* ```
	*/
	async connect(transport) {
		if (supportsScopeChallengeResolver(transport)) transport.setScopeChallengeResolver((context) => this.resolveScopeChallenge(context));
		return await this.server.connect(transport);
	}
	/**
	* Closes the connection.
	*/
	async close() {
		await this.server.close();
	}
	/** @internal */
	resolveScopeChallenge = (context) => {
		switch (context.request.method) {
			case "tools/call": {
				const toolName = context.request.params?.name;
				if (typeof toolName !== "string") return;
				const tool = this._registeredTools[toolName];
				if (tool === void 0 || !tool.enabled) return;
				return tool.scopeChallenge?.(context);
			}
			case "resources/read": {
				const resourceUri = context.request.params?.uri;
				if (typeof resourceUri !== "string") return;
				let uri;
				try {
					uri = new URL(resourceUri);
				} catch {
					return;
				}
				const resource = this._registeredResources[uri.toString()];
				if (resource !== void 0) return resource.enabled ? resource.scopeChallenge?.(context) : void 0;
				for (const template of Object.values(this._registeredResourceTemplates)) if (template.resourceTemplate.uriTemplate.match(uri.toString())) return template.enabled ? template.scopeChallenge?.(context) : void 0;
				return;
			}
			case "prompts/get": {
				const promptName = context.request.params?.name;
				if (typeof promptName !== "string") return;
				const prompt = this._registeredPrompts[promptName];
				if (prompt === void 0 || !prompt.enabled) return;
				return prompt.scopeChallenge?.(context);
			}
			default: return;
		}
	};
	_toolHandlersInitialized = false;
	setToolRequestHandlers() {
		if (this._toolHandlersInitialized) return;
		this.server.assertCanSetRequestHandler("tools/list");
		this.server.assertCanSetRequestHandler("tools/call");
		this.server.registerCapabilities({ tools: { listChanged: this.server.getCapabilities().tools?.listChanged ?? true } });
		this.server.setRequestHandler("tools/list", () => ({ tools: Object.entries(this._registeredTools).filter(([, tool]) => tool.enabled).map(([name, tool]) => {
			const toolDefinition = {
				name,
				title: tool.title,
				description: tool.description,
				inputSchema: tool.inputSchema ? convertListedInputSchema(name, tool.inputSchema) : EMPTY_OBJECT_JSON_SCHEMA,
				annotations: tool.annotations,
				icons: tool.icons,
				execution: tool.execution,
				_meta: tool._meta
			};
			if (tool.outputSchema) toolDefinition.outputSchema = standardSchemaToJsonSchema(tool.outputSchema, "output");
			return toolDefinition;
		}) }));
		this.server.setRequestHandler("tools/call", async (request, ctx) => {
			const tool = this._registeredTools[request.params.name];
			if (!tool) throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Tool ${request.params.name} not found`);
			if (!tool.enabled) throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Tool ${request.params.name} disabled`);
			try {
				const args = await this.validateToolInput(tool, request.params.arguments, request.params.name);
				const result = await this.executeToolHandler(tool, args, ctx);
				await this.validateToolOutput(tool, result, request.params.name);
				if (isInputRequiredResult(result)) return result;
				return this.server.projectCallToolResult(result, tool.outputSchemaJson);
			} catch (error) {
				if (error instanceof ProtocolError && error.code === ProtocolErrorCode.UrlElicitationRequired) throw error;
				return this.createToolError(error instanceof Error ? error.message : String(error));
			}
		});
		this._toolHandlersInitialized = true;
	}
	/**
	* Creates a tool error result.
	*
	* @param errorMessage - The error message.
	* @returns The tool error result.
	*/
	createToolError(errorMessage) {
		return {
			content: [{
				type: "text",
				text: errorMessage
			}],
			isError: true
		};
	}
	/**
	* Validates tool input arguments against the tool's input schema.
	*/
	async validateToolInput(tool, args, toolName) {
		if (this._maxToolInputElements !== void 0 && toolInputElementCount(args, this._maxToolInputElements) > this._maxToolInputElements) throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Invalid arguments for tool ${toolName}: arguments contain more than the maximum of ${this._maxToolInputElements} elements`);
		if (!tool.inputSchema) return;
		const parseResult = await validateStandardSchema(tool.inputSchema, args ?? {});
		if (!parseResult.success) throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Input validation error: Invalid arguments for tool ${toolName}: ${parseResult.error}`);
		return parseResult.data;
	}
	/**
	* Validates tool output against the tool's output schema.
	*/
	async validateToolOutput(tool, result, toolName) {
		if (!tool.outputSchema) return;
		if (isInputRequiredResult(result)) return;
		if (result.isError) return;
		if (result.structuredContent === void 0) throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Output validation error: Tool ${toolName} has an output schema but no structured content was provided`);
		const parseResult = await validateStandardSchema(tool.outputSchema, result.structuredContent);
		if (!parseResult.success) throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Output validation error: Invalid structured content for tool ${toolName}: ${parseResult.error}`);
	}
	/**
	* Executes a tool handler.
	*/
	async executeToolHandler(tool, args, ctx) {
		return tool.executor(args, ctx);
	}
	_completionHandlerInitialized = false;
	setCompletionRequestHandler() {
		if (this._completionHandlerInitialized) return;
		this.server.assertCanSetRequestHandler("completion/complete");
		this.server.registerCapabilities({ completions: {} });
		this.server.setRequestHandler("completion/complete", async (request) => {
			switch (request.params.ref.type) {
				case "ref/prompt":
					assertCompleteRequestPrompt(request);
					return this.handlePromptCompletion(request, request.params.ref);
				case "ref/resource":
					assertCompleteRequestResourceTemplate(request);
					return this.handleResourceCompletion(request, request.params.ref);
				default: throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Invalid completion reference: ${request.params.ref}`);
			}
		});
		this._completionHandlerInitialized = true;
	}
	async handlePromptCompletion(request, ref) {
		const prompt = this._registeredPrompts[ref.name];
		if (!prompt) throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Prompt ${ref.name} not found`);
		if (!prompt.enabled) throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Prompt ${ref.name} disabled`);
		if (!prompt.argsSchema) return EMPTY_COMPLETION_RESULT;
		const field = unwrapOptionalSchema(getSchemaShape(prompt.argsSchema)?.[request.params.argument.name]);
		if (!isCompletable(field)) return EMPTY_COMPLETION_RESULT;
		const completer = getCompleter(field);
		if (!completer) return EMPTY_COMPLETION_RESULT;
		return createCompletionResult(await completer(request.params.argument.value, request.params.context));
	}
	async handleResourceCompletion(request, ref) {
		const template = Object.values(this._registeredResourceTemplates).find((t) => t.resourceTemplate.uriTemplate.toString() === ref.uri);
		if (!template) {
			if (this._registeredResources[ref.uri]) return EMPTY_COMPLETION_RESULT;
			throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Resource template ${request.params.ref.uri} not found`);
		}
		const completer = template.resourceTemplate.completeCallback(request.params.argument.name);
		if (!completer) return EMPTY_COMPLETION_RESULT;
		return createCompletionResult(await completer(request.params.argument.value, request.params.context));
	}
	_resourceHandlersInitialized = false;
	setResourceRequestHandlers() {
		if (this._resourceHandlersInitialized) return;
		this.server.assertCanSetRequestHandler("resources/list");
		this.server.assertCanSetRequestHandler("resources/templates/list");
		this.server.assertCanSetRequestHandler("resources/read");
		this.server.registerCapabilities({ resources: { listChanged: this.server.getCapabilities().resources?.listChanged ?? true } });
		this.server.setRequestHandler("resources/list", async (_request, ctx) => {
			const resources = Object.entries(this._registeredResources).filter(([_, resource]) => resource.enabled).map(([uri, resource]) => ({
				uri,
				name: resource.name,
				...resource.metadata
			}));
			const templateResources = [];
			for (const template of Object.values(this._registeredResourceTemplates)) {
				if (!template.resourceTemplate.listCallback) continue;
				const result = await template.resourceTemplate.listCallback(ctx);
				for (const resource of result.resources) templateResources.push({
					...template.metadata,
					...resource
				});
			}
			return { resources: [...resources, ...templateResources] };
		});
		this.server.setRequestHandler("resources/templates/list", async () => {
			return { resourceTemplates: Object.entries(this._registeredResourceTemplates).map(([name, template]) => ({
				name,
				uriTemplate: template.resourceTemplate.uriTemplate.toString(),
				...template.metadata
			})) };
		});
		this.server.setRequestHandler("resources/read", async (request, ctx) => {
			let uri;
			try {
				uri = new URL(request.params.uri);
			} catch {
				throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Resource URI ${request.params.uri} is invalid`, {
					uri: request.params.uri,
					reason: "invalid_uri"
				});
			}
			const resource = this._registeredResources[uri.toString()];
			if (resource) {
				if (!resource.enabled) throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Resource ${uri} disabled`);
				return attachCacheHintFallback(await resource.readCallback(uri, ctx), resource.cacheHint);
			}
			for (const template of Object.values(this._registeredResourceTemplates)) {
				const variables = template.resourceTemplate.uriTemplate.match(uri.toString());
				if (variables) {
					if (!template.enabled) throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Resource template ${template.resourceTemplate.uriTemplate} disabled`);
					return attachCacheHintFallback(await template.readCallback(uri, variables, ctx), template.cacheHint);
				}
			}
			throw new ResourceNotFoundError(request.params.uri);
		});
		this._resourceHandlersInitialized = true;
	}
	_promptHandlersInitialized = false;
	setPromptRequestHandlers() {
		if (this._promptHandlersInitialized) return;
		this.server.assertCanSetRequestHandler("prompts/list");
		this.server.assertCanSetRequestHandler("prompts/get");
		this.server.registerCapabilities({ prompts: { listChanged: this.server.getCapabilities().prompts?.listChanged ?? true } });
		this.server.setRequestHandler("prompts/list", () => ({ prompts: Object.entries(this._registeredPrompts).filter(([, prompt]) => prompt.enabled).map(([name, prompt]) => {
			return {
				name,
				title: prompt.title,
				description: prompt.description,
				arguments: prompt.argsSchema ? promptArgumentsFromStandardSchema(prompt.argsSchema) : void 0,
				icons: prompt.icons,
				_meta: prompt._meta
			};
		}) }));
		this.server.setRequestHandler("prompts/get", async (request, ctx) => {
			const prompt = this._registeredPrompts[request.params.name];
			if (!prompt) throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Prompt ${request.params.name} not found`);
			if (!prompt.enabled) throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Prompt ${request.params.name} disabled`);
			return prompt.handler(request.params.arguments, ctx);
		});
		this._promptHandlersInitialized = true;
	}
	registerResource(name, uriOrTemplate, config, readCallback) {
		const { cacheHint, scopeChallenge, ...resourceMetadata } = config;
		const metadata = resourceMetadata;
		if (cacheHint !== void 0) assertValidCacheHint(cacheHint, `resource ${name}`);
		if (typeof uriOrTemplate === "string") {
			if (this._registeredResources[uriOrTemplate]) throw new Error(`Resource ${uriOrTemplate} is already registered`);
			const registeredResource = this._createRegisteredResource(name, config.title, uriOrTemplate, metadata, scopeChallenge, readCallback);
			if (cacheHint !== void 0) registeredResource.cacheHint = cacheHint;
			this.setResourceRequestHandlers();
			this.sendResourceListChanged();
			return registeredResource;
		} else {
			if (this._registeredResourceTemplates[name]) throw new Error(`Resource template ${name} is already registered`);
			const registeredResourceTemplate = this._createRegisteredResourceTemplate(name, config.title, uriOrTemplate, metadata, scopeChallenge, readCallback);
			if (cacheHint !== void 0) registeredResourceTemplate.cacheHint = cacheHint;
			this.setResourceRequestHandlers();
			this.sendResourceListChanged();
			return registeredResourceTemplate;
		}
	}
	_createRegisteredResource(name, title, uri, metadata, scopeChallenge, readCallback) {
		const registeredResource = {
			name,
			title,
			metadata,
			readCallback,
			scopeChallenge,
			enabled: true,
			disable: () => registeredResource.update({ enabled: false }),
			enable: () => registeredResource.update({ enabled: true }),
			remove: () => registeredResource.update({ uri: null }),
			update: (updates) => {
				if (updates.uri !== void 0 && updates.uri !== uri) {
					delete this._registeredResources[uri];
					if (updates.uri) this._registeredResources[updates.uri] = registeredResource;
				}
				if (updates.name !== void 0) registeredResource.name = updates.name;
				if (updates.metadata !== void 0) registeredResource.metadata = updates.metadata;
				if (updates.title !== void 0) {
					registeredResource.title = updates.title;
					registeredResource.metadata = {
						...registeredResource.metadata,
						title: updates.title
					};
				}
				if (updates.callback !== void 0) registeredResource.readCallback = updates.callback;
				if (updates.scopeChallenge !== void 0) registeredResource.scopeChallenge = updates.scopeChallenge === null ? void 0 : updates.scopeChallenge;
				if (updates.enabled !== void 0) registeredResource.enabled = updates.enabled;
				this.sendResourceListChanged();
			}
		};
		this._registeredResources[uri] = registeredResource;
		return registeredResource;
	}
	_createRegisteredResourceTemplate(name, title, template, metadata, scopeChallenge, readCallback) {
		const registeredResourceTemplate = {
			resourceTemplate: template,
			title,
			metadata,
			readCallback,
			scopeChallenge,
			enabled: true,
			disable: () => registeredResourceTemplate.update({ enabled: false }),
			enable: () => registeredResourceTemplate.update({ enabled: true }),
			remove: () => registeredResourceTemplate.update({ name: null }),
			update: (updates) => {
				if (updates.name !== void 0 && updates.name !== name) {
					delete this._registeredResourceTemplates[name];
					if (updates.name) this._registeredResourceTemplates[updates.name] = registeredResourceTemplate;
				}
				if (updates.template !== void 0) registeredResourceTemplate.resourceTemplate = updates.template;
				if (updates.metadata !== void 0) registeredResourceTemplate.metadata = updates.metadata;
				if (updates.title !== void 0) {
					registeredResourceTemplate.title = updates.title;
					registeredResourceTemplate.metadata = {
						...registeredResourceTemplate.metadata,
						title: updates.title
					};
				}
				if (updates.callback !== void 0) registeredResourceTemplate.readCallback = updates.callback;
				if (updates.scopeChallenge !== void 0) registeredResourceTemplate.scopeChallenge = updates.scopeChallenge === null ? void 0 : updates.scopeChallenge;
				if (updates.enabled !== void 0) registeredResourceTemplate.enabled = updates.enabled;
				this.sendResourceListChanged();
			}
		};
		this._registeredResourceTemplates[name] = registeredResourceTemplate;
		const variableNames = template.uriTemplate.variableNames;
		if (Array.isArray(variableNames) && variableNames.some((v) => !!template.completeCallback(v))) this.setCompletionRequestHandler();
		return registeredResourceTemplate;
	}
	_createRegisteredPrompt(name, title, description, argsSchema, callback, icons, scopeChallenge, _meta) {
		let currentArgsSchema = argsSchema;
		let currentCallback = callback;
		const registeredPrompt = {
			title,
			description,
			argsSchema,
			icons,
			scopeChallenge,
			_meta,
			handler: createPromptHandler(name, argsSchema, callback),
			enabled: true,
			disable: () => registeredPrompt.update({ enabled: false }),
			enable: () => registeredPrompt.update({ enabled: true }),
			remove: () => registeredPrompt.update({ name: null }),
			update: (updates) => {
				if (updates.name !== void 0 && updates.name !== name) {
					delete this._registeredPrompts[name];
					if (updates.name) this._registeredPrompts[updates.name] = registeredPrompt;
				}
				if (updates.title !== void 0) registeredPrompt.title = updates.title;
				if (updates.description !== void 0) registeredPrompt.description = updates.description;
				if (updates.icons !== void 0) registeredPrompt.icons = updates.icons;
				if (updates.scopeChallenge !== void 0) registeredPrompt.scopeChallenge = updates.scopeChallenge === null ? void 0 : updates.scopeChallenge;
				if (updates._meta !== void 0) registeredPrompt._meta = updates._meta;
				let needsHandlerRegen = false;
				if (updates.argsSchema !== void 0) {
					registeredPrompt.argsSchema = updates.argsSchema;
					currentArgsSchema = updates.argsSchema;
					needsHandlerRegen = true;
				}
				if (updates.callback !== void 0) {
					currentCallback = updates.callback;
					needsHandlerRegen = true;
				}
				if (needsHandlerRegen) registeredPrompt.handler = createPromptHandler(name, currentArgsSchema, currentCallback);
				if (updates.enabled !== void 0) registeredPrompt.enabled = updates.enabled;
				this.sendPromptListChanged();
			}
		};
		this._registeredPrompts[name] = registeredPrompt;
		if (argsSchema) {
			const shape = getSchemaShape(argsSchema);
			if (shape) {
				if (Object.values(shape).some((field) => {
					return isCompletable(unwrapOptionalSchema(field));
				})) this.setCompletionRequestHandler();
			}
		}
		return registeredPrompt;
	}
	_createRegisteredTool(name, title, description, inputSchema, outputSchema, annotations, icons, execution, scopeChallenge, _meta, handler) {
		validateAndWarnToolName(name);
		let currentHandler = handler;
		let outputSchemaJson;
		const registeredTool = {
			title,
			description,
			inputSchema,
			outputSchema,
			get outputSchemaJson() {
				return outputSchemaJson ??= convertOutputSchemaJson(registeredTool.outputSchema);
			},
			set outputSchemaJson(value) {
				outputSchemaJson = value;
			},
			annotations,
			icons,
			execution,
			scopeChallenge,
			_meta,
			handler,
			executor: createToolExecutor(inputSchema, handler),
			enabled: true,
			disable: () => registeredTool.update({ enabled: false }),
			enable: () => registeredTool.update({ enabled: true }),
			remove: () => registeredTool.update({ name: null }),
			update: (updates) => {
				if (updates.name !== void 0 && updates.name !== name) {
					if (typeof updates.name === "string") validateAndWarnToolName(updates.name);
					delete this._registeredTools[name];
					delete this._toolInputSchemaJson[name];
					if (updates.name) {
						delete this._toolInputSchemaJson[updates.name];
						this._registeredTools[updates.name] = registeredTool;
						name = updates.name;
					}
				}
				if (updates.title !== void 0) registeredTool.title = updates.title;
				if (updates.description !== void 0) registeredTool.description = updates.description;
				let needsExecutorRegen = false;
				if (updates.paramsSchema !== void 0) {
					registeredTool.inputSchema = updates.paramsSchema;
					delete this._toolInputSchemaJson[name];
					needsExecutorRegen = true;
				}
				if (updates.callback !== void 0) {
					registeredTool.handler = updates.callback;
					currentHandler = updates.callback;
					needsExecutorRegen = true;
				}
				if (needsExecutorRegen) registeredTool.executor = createToolExecutor(registeredTool.inputSchema, currentHandler);
				if (updates.outputSchema !== void 0) {
					registeredTool.outputSchema = updates.outputSchema;
					registeredTool.outputSchemaJson = convertOutputSchemaJson(updates.outputSchema);
				}
				if (updates.annotations !== void 0) registeredTool.annotations = updates.annotations;
				if (updates.icons !== void 0) registeredTool.icons = updates.icons;
				if (updates.scopeChallenge !== void 0) registeredTool.scopeChallenge = updates.scopeChallenge === null ? void 0 : updates.scopeChallenge;
				if (updates._meta !== void 0) registeredTool._meta = updates._meta;
				if (updates.enabled !== void 0) registeredTool.enabled = updates.enabled;
				this.sendToolListChanged();
			}
		};
		this._registeredTools[name] = registeredTool;
		this.setToolRequestHandlers();
		this.sendToolListChanged();
		return registeredTool;
	}
	registerTool(name, config, cb) {
		if (this._registeredTools[name]) throw new Error(`Tool ${name} is already registered`);
		const { title, description, inputSchema, outputSchema, annotations, icons, scopeChallenge, _meta } = config;
		return this._createRegisteredTool(name, title, description, normalizeRawShapeSchema(inputSchema), normalizeRawShapeSchema(outputSchema), annotations, icons, void 0, scopeChallenge, _meta, cb);
	}
	registerPrompt(name, config, cb) {
		if (this._registeredPrompts[name]) throw new Error(`Prompt ${name} is already registered`);
		const { title, description, argsSchema, icons, scopeChallenge, _meta } = config;
		const registeredPrompt = this._createRegisteredPrompt(name, title, description, normalizeRawShapeSchema(argsSchema), cb, icons, scopeChallenge, _meta);
		this.setPromptRequestHandlers();
		this.sendPromptListChanged();
		return registeredPrompt;
	}
	/**
	* Checks if the server is connected to a transport.
	* @returns `true` if the server is connected
	*/
	isConnected() {
		return this.server.transport !== void 0;
	}
	/**
	* Sends a logging message to the client, if connected.
	* Note: You only need to send the parameters object, not the entire JSON-RPC message.
	* @see {@linkcode LoggingMessageNotification}
	* @param params
	* @param sessionId Optional for stateless transports and backward compatibility.
	*
	* @example
	* ```ts source="./mcp.examples.ts#McpServer_sendLoggingMessage_basic"
	* await server.sendLoggingMessage({
	*     level: 'info',
	*     data: 'Processing complete'
	* });
	* ```
	*
	* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577).
	* Remains functional during the deprecation window (at least twelve months).
	* Migrate to stderr logging (STDIO servers) or OpenTelemetry.
	*/
	async sendLoggingMessage(params, sessionId) {
		return this.server.sendLoggingMessage(params, sessionId);
	}
	/**
	* Sends a resource list changed event to the client, if connected.
	*/
	sendResourceListChanged() {
		if (this.isConnected()) this.server.sendResourceListChanged();
	}
	/**
	* Sends a tool list changed event to the client, if connected.
	*/
	sendToolListChanged() {
		if (this.isConnected()) this.server.sendToolListChanged();
	}
	/**
	* Sends a prompt list changed event to the client, if connected.
	*/
	sendPromptListChanged() {
		if (this.isConnected()) this.server.sendPromptListChanged();
	}
};
/**
* Creates an executor that invokes the handler with the appropriate arguments.
* When `inputSchema` is defined, the handler is called with `(args, ctx)`.
* When `inputSchema` is undefined, the handler is called with just `(ctx)`.
*/
function createToolExecutor(inputSchema, handler) {
	if (inputSchema) {
		const callback$1 = handler;
		return async (args, ctx) => callback$1(args, ctx);
	}
	const callback = handler;
	return async (_args, ctx) => callback(ctx);
}
var EMPTY_OBJECT_JSON_SCHEMA = {
	type: "object",
	properties: {}
};
/** Converts a tool's `inputSchema` for `tools/list` and warns on an invalid SEP-2243 `x-mcp-header` declaration. */
function convertListedInputSchema(name, inputSchema) {
	const json = standardSchemaToJsonSchema(inputSchema, "input");
	const scan = scanXMcpHeaderDeclarations(json);
	if (!scan.valid) console.warn(`[mcp-sdk] tool '${name}' carries an invalid x-mcp-header declaration and will be excluded by conforming Streamable HTTP clients: ${scan.reason}`);
	return json;
}
/**
* Convert a registered `outputSchema` to JSON Schema, memoised on {@link RegisteredTool.outputSchemaJson}
* so `tools/call` passes the SAME advertised schema to the wire codec's `projectCallToolResult` that
* `tools/list` emits (and that the 2025 codec's `encodeResult('tools/list', …)` may wrap). A conversion
* failure yields `undefined` so the failure surfaces where it always has (`tools/list`).
*/
function convertOutputSchemaJson(outputSchema) {
	if (outputSchema === void 0) return void 0;
	try {
		return standardSchemaToJsonSchema(outputSchema, "output");
	} catch {
		return;
	}
}
/**
* Creates a type-safe prompt handler that captures the schema and callback in a closure.
* This eliminates the need for type assertions at the call site.
*/
function createPromptHandler(name, argsSchema, callback) {
	if (argsSchema) {
		const typedCallback = callback;
		return async (args, ctx) => {
			const parseResult = await validateStandardSchema(argsSchema, args ?? {});
			if (!parseResult.success) throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Invalid arguments for prompt ${name}: ${parseResult.error}`);
			return typedCallback(parseResult.data, ctx);
		};
	} else {
		const typedCallback = callback;
		return async (_args, ctx) => {
			return typedCallback(ctx);
		};
	}
}
function createCompletionResult(suggestions) {
	return { completion: {
		values: suggestions.map(String).slice(0, 100),
		total: suggestions.length,
		hasMore: suggestions.length > 100
	} };
}
var EMPTY_COMPLETION_RESULT = { completion: {
	values: [],
	hasMore: false
} };
/** @internal Gets the shape of a Zod object schema */
function getSchemaShape(schema) {
	const candidate = schema;
	if (candidate.shape && typeof candidate.shape === "object") return candidate.shape;
}
/** @internal Checks if a Zod schema is optional */
function isOptionalSchema(schema) {
	return schema?.type === "optional";
}
/** @internal Unwraps an optional Zod schema */
function unwrapOptionalSchema(schema) {
	if (!isOptionalSchema(schema)) return schema;
	return schema.def?.innerType ?? schema;
}
//#endregion
//#region ../../node_modules/.pnpm/@modelcontextprotocol+server@2.4.0/node_modules/@modelcontextprotocol/server/dist/stdio.mjs
/**
* Marks a stdout `'error'` listener that a closed transport left attached purely to
* swallow late write failures (see {@link StdioServerTransport.close}). A fresh
* transport taking over the same stream removes listeners carrying this tag in
* `start()`, so repeated create→close cycles on the process-global `process.stdout`
* don't accumulate listeners.
*/
var swallowsErrorsAfterClose = Symbol("swallowsErrorsAfterClose");
/**
* Server transport for stdio: this communicates with an MCP client by reading from the current process' `stdin` and writing to `stdout`.
*
* This transport is only available in Node.js environments.
*
* When the client closes its end of the pipe (stdin reaches end-of-file), the transport
* closes itself and fires `onclose`, per the MCP stdio binding's guidance that servers
* should exit promptly when their standard input is closed. A server that holds no other
* keep-alive handles will then exit naturally. Requests still in flight when stdin ends are
* aborted and not answered; a client that expects responses keeps stdin open until it has
* read them.
*
* @example
* ```ts source="./stdio.examples.ts#StdioServerTransport_basicUsage"
* const server = new McpServer({ name: 'my-server', version: '1.0.0' });
* const transport = new StdioServerTransport();
* await server.connect(transport);
* ```
*/
var StdioServerTransport = class {
	_readBuffer;
	_started = false;
	_closed = false;
	constructor(_stdin = process$1.stdin, _stdout = process$1.stdout, options) {
		this._stdin = _stdin;
		this._stdout = _stdout;
		this._readBuffer = new ReadBuffer({ maxBufferSize: options?.maxBufferSize });
	}
	onclose;
	onerror;
	onmessage;
	_ondata = (chunk) => {
		try {
			this._readBuffer.append(chunk);
			this.processReadBuffer();
		} catch (error) {
			this.onerror?.(error);
			this.close().catch(() => {});
		}
	};
	_onerror = (error) => {
		this.onerror?.(error);
	};
	_onstdouterror = (error) => {
		if (this._closed) return;
		this.onerror?.(error);
		this.close().catch(() => {});
	};
	_onstdinclose = () => {
		this.close().catch(() => {});
	};
	/**
	* Starts listening for messages on `stdin`.
	*/
	async start() {
		if (this._started) throw new Error("StdioServerTransport already started! If using Server class, note that connect() calls start() automatically.");
		this._started = true;
		for (const listener of this._stdout.listeners("error")) if (listener[swallowsErrorsAfterClose]) this._stdout.off("error", listener);
		if (this._stdin.readableEnded || this._stdin.destroyed) setImmediate(this._onstdinclose);
		this._stdin.on("data", this._ondata);
		this._stdin.on("error", this._onerror);
		this._stdin.on("end", this._onstdinclose);
		this._stdin.on("close", this._onstdinclose);
		this._stdout.on("error", this._onstdouterror);
	}
	processReadBuffer() {
		while (true) try {
			const message = this._readBuffer.readMessage();
			if (message === null) break;
			this.onmessage?.(message);
		} catch (error) {
			this.onerror?.(error);
		}
	}
	async close() {
		if (this._closed) return;
		this._closed = true;
		this._stdin.off("data", this._ondata);
		this._stdin.off("error", this._onerror);
		this._stdin.off("end", this._onstdinclose);
		this._stdin.off("close", this._onstdinclose);
		this._onstdouterror[swallowsErrorsAfterClose] = true;
		if (this._stdin.listenerCount("data") === 0) this._stdin.pause();
		this._readBuffer.clear();
		this.onclose?.();
	}
	send(message) {
		if (this._closed) return Promise.reject(/* @__PURE__ */ new Error("StdioServerTransport is closed"));
		return new Promise((resolve, reject) => {
			const json = serializeMessage(message);
			let settled = false;
			const onError = (error) => {
				if (settled) return;
				settled = true;
				this._stdout.off("error", onError);
				this._stdout.off("drain", onDrain);
				reject(error);
			};
			const onDrain = () => {
				if (settled) return;
				settled = true;
				this._stdout.off("error", onError);
				this._stdout.off("drain", onDrain);
				resolve();
			};
			this._stdout.once("error", onError);
			if (this._stdout.write(json)) {
				if (settled) return;
				settled = true;
				this._stdout.off("error", onError);
				resolve();
			} else if (!settled) this._stdout.once("drain", onDrain);
		});
	}
};
//#endregion
//#region src/card-data.ts
/** What Arcue's card shows for a tool result, which the server puts in the result's `_meta` under this key. */
var CARD_META_KEY = "arcue/card";
/** The card that `get_comments` and `inspect_model` render in apps that show MCP Apps. */
var CARD_URI = "ui://arcue/card.html";
/** What `send_round` puts in its result's `_meta` under this key when it sent a round, as the view reads it too. */
var ROUND_META_KEY = "arcue/round";
//#endregion
//#region src/window-relay.ts
var RECEIVE_BYTES = 2 * MAX_PIECE_BYTES;
var WAIT_MS = 2e4;
var IDLE_MS = 15e3;
var SWEEP_MS = 3e3;
var MAX_CHANNELS = 16;
/** The largest message a view sends, such as a comment with its screenshot. */
var MAX_VIEW_MESSAGE_BYTES = 67108864;
/**
* The channels of the windows in the views an app shows. A view cannot reach Arcue in the browser itself, so it calls a
* tool for each piece of work, and the relay holds a socket to the core for it.
*
* The view numbers the pieces it sends, and names the first piece it has not taken when it receives, so a call that it
* makes again after losing the answer neither repeats nor loses one.
*/
var WindowRelay = class {
	#channels = /* @__PURE__ */ new Map();
	#options;
	#pieceBytes;
	constructor(options) {
		this.#options = options;
		this.#pieceBytes = Math.min(options.pieceBytes ?? 196608, MAX_PIECE_BYTES);
	}
	async open() {
		const limit = this.#options.maxChannels ?? MAX_CHANNELS;
		if (this.#channels.size >= limit) throw new ArcueError("unavailable", `Arcue shows at most ${limit} views at once. Close one, or reload the app.`);
		const socket = await this.#options.connect();
		const id = randomBytes(16).toString("base64url");
		const channel = {
			socket,
			out: [],
			base: 0,
			next: 0,
			partial: [],
			partialBytes: 0,
			closed: false,
			wake: null,
			calls: 0,
			onCall: /* @__PURE__ */ new Set(),
			cancelIdle: () => void 0
		};
		this.#channels.set(id, channel);
		socket.onMessage((bytes) => {
			if (channel.closed) return;
			channel.out.push(...this.#split(bytes));
			channel.wake?.();
		});
		socket.onClose(() => {
			channel.closed = true;
			channel.partial = [];
			channel.wake?.();
			if (channel.calls === 0 && channel.out.length === 0) this.#drop(id);
		});
		this.#armIdle(id, channel);
		return id;
	}
	/** Takes the view's pieces from number `seq` on, skipping those it sent before, and returns the next number. */
	send(id, seq, pieces) {
		return this.#during(id, (channel) => {
			if (seq > channel.next) throw new ArcueError("invalid-input", "A piece before these did not arrive.");
			for (const piece of pieces.slice(channel.next - seq)) {
				const bytes = Buffer.from(piece.data, "base64");
				channel.partial.push(bytes);
				channel.partialBytes += bytes.byteLength;
				if (channel.partialBytes > MAX_VIEW_MESSAGE_BYTES) {
					this.close(id);
					throw new ArcueError("invalid-input", "A message is too large.");
				}
				if (piece.more) continue;
				const message = Buffer.concat(channel.partial);
				channel.partial = [];
				channel.partialBytes = 0;
				if (!channel.closed) channel.socket.send(message);
			}
			channel.next = Math.max(channel.next, seq + pieces.length);
			return channel.next;
		});
	}
	/**
	* Returns the pieces for the view from number `from` on, which drops the ones before it, once there are any, the
	* channel closes, the wait ends, a later receive starts or the signal aborts.
	*/
	async receive(id, from, signal) {
		return this.#during(id, async (channel) => {
			if (from < channel.base || from > channel.base + channel.out.length) throw new ArcueError("invalid-input", "The view asked for pieces it took already or that never came.");
			channel.out.splice(0, from - channel.base);
			channel.base = from;
			channel.wake?.();
			if (channel.out.length === 0 && !channel.closed) await this.#wait(channel, signal);
			if (channel.base !== from) return {
				from,
				pieces: [],
				closed: false
			};
			const limit = this.#options.receiveBytes ?? RECEIVE_BYTES;
			const pieces = [];
			let bytes = 0;
			for (const piece of channel.out) {
				const size = piece.bytes.byteLength;
				if (pieces.length > 0 && bytes + size > limit) break;
				const data = piece.bytes.toString("base64");
				pieces.push(piece.more ? {
					data,
					more: true
				} : { data });
				bytes += size;
			}
			return {
				from,
				pieces,
				closed: channel.closed && pieces.length === channel.out.length
			};
		});
	}
	close(id) {
		const channel = this.#channels.get(id);
		if (!channel) return;
		this.#drop(id);
		channel.closed = true;
		channel.wake?.();
		channel.socket.close();
	}
	/**
	* Closes the channels of views that are gone, which hold windows that never answer: it ends each receive that waits,
	* and closes each channel whose view does not call again within `sweepMs`. Resolves once their sockets closed.
	*/
	async sweep() {
		await Promise.all([...this.#channels].map(([id, channel]) => this.#check(id, channel)));
	}
	/** Closes every channel, as when the app's connection ends. */
	dispose() {
		for (const id of [...this.#channels.keys()]) this.close(id);
	}
	#channel(id) {
		const channel = this.#channels.get(id);
		if (!channel) throw new ArcueError("not-found", "This window's channel is closed.");
		return channel;
	}
	/** Runs one call on the channel, which stays open while a call runs and for `idleMs` after the last. */
	#during(id, work) {
		const channel = this.#channel(id);
		channel.calls++;
		channel.cancelIdle();
		for (const listener of [...channel.onCall]) listener();
		const done = () => {
			channel.calls--;
			if (channel.calls > 0 || this.#channels.get(id) !== channel) return;
			if (channel.closed && channel.out.length === 0) this.#drop(id);
			else this.#armIdle(id, channel);
		};
		let value;
		try {
			value = work(channel);
		} catch (error) {
			done();
			throw error;
		}
		if (value instanceof Promise) value.finally(done).catch(() => void 0);
		else done();
		return value;
	}
	#check(id, channel) {
		return new Promise((resolve) => {
			const called = () => {
				cancel();
				channel.onCall.delete(called);
				resolve();
			};
			channel.onCall.add(called);
			const cancel = this.#options.setTimer(this.#options.sweepMs ?? SWEEP_MS, () => {
				channel.onCall.delete(called);
				const open = this.#channels.get(id) === channel && !channel.closed;
				if (open) channel.socket.onClose(resolve);
				this.close(id);
				if (!open) resolve();
			});
			channel.wake?.();
		});
	}
	#armIdle(id, channel) {
		channel.cancelIdle();
		channel.cancelIdle = this.#options.setTimer(this.#options.idleMs ?? IDLE_MS, () => {
			if (channel.calls === 0) this.close(id);
		});
	}
	#drop(id) {
		const channel = this.#channels.get(id);
		if (!channel) return;
		channel.cancelIdle();
		this.#channels.delete(id);
	}
	#wait(channel, signal) {
		return new Promise((resolve) => {
			const cancel = this.#options.setTimer(this.#options.waitMs ?? WAIT_MS, () => wake());
			const wake = () => {
				cancel();
				signal?.removeEventListener("abort", wake);
				if (channel.wake === wake) channel.wake = null;
				resolve();
			};
			channel.wake = wake;
			signal?.addEventListener("abort", wake, { once: true });
			if (signal?.aborted) wake();
		});
	}
	#split(bytes) {
		const size = this.#pieceBytes;
		const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
		const pieces = [];
		for (let at = 0; at === 0 || at < buffer.byteLength; at += size) {
			const end = Math.min(at + size, buffer.byteLength);
			pieces.push({
				bytes: buffer.subarray(at, end),
				more: end < buffer.byteLength
			});
		}
		return pieces;
	}
};
var HANDSHAKE_MS = 1e4;
/**
* Connects to Arcue in the browser at `url` as a page of the view, with the token from its `serve.json` in place of
* a page's origin.
*/
function openWindowSocket(url, token, view) {
	const address = new URL(SERVE_CORE_PATH, url);
	address.protocol = address.protocol === "https:" ? "wss:" : "ws:";
	address.searchParams.set(VIEW_PARAMETER, view);
	const socket = new import_websocket.default(address, {
		headers: { authorization: bridgeAuthorization(token) },
		handshakeTimeout: HANDSHAKE_MS,
		maxPayload: MAX_FRAME_BYTES,
		perMessageDeflate: false
	});
	return new Promise((resolve, reject) => {
		socket.once("error", reject);
		socket.once("open", () => {
			socket.off("error", reject);
			socket.on("error", () => socket.terminate());
			resolve({
				send: (bytes) => socket.send(bytes),
				onMessage(listener) {
					socket.on("message", (data, binary) => {
						if (binary && data instanceof Buffer) listener(data);
						else socket.terminate();
					});
				},
				onClose(listener) {
					socket.once("close", () => listener());
				},
				close: () => socket.close()
			});
		});
	});
}
//#endregion
//#region src/mcp.ts
/** The card's page, which the build writes beside `arcue.js`. */
var bundledCardPage = fileURLToPath(new URL("./card.html", import.meta.url));
/** The view's page, which the build of the web UI writes beside `arcue.js`. */
var bundledViewPage = fileURLToPath(new URL("./view.html", import.meta.url));
/** The view of a server that has no `--view` and no session's variables. */
var DEFAULT_VIEW = "mcp";
/** The most PNG bytes one result carries, so that it stays within what MCP clients read. */
var MAX_IMAGE_BYTES = 4194304;
var LOAD_POLL_MS = 200;
/** How long views wait after Arcue in the browser failed to start before one starts it again. */
var START_RETRY_MS = 1e4;
/** The most models whose last showing a view's channel records. */
var MAX_SHOWN = 1e3;
var VIEW_READY_MS = 3e4;
var OLDER_CORE = "The Arcue that runs is older than this arcue command and cannot show models in a session's view. Restart it.";
var pathInput = string().min(1).describe("The model file, such as an FBX or .blend: absolute, or relative to the folder the server runs in.");
var clipInput = string().min(1).describe("A clip by its name in the file, as round.json and inspect_model give it, such as \"Armature|Walk\".");
var frameInput = int().min(0).max(4294967295).describe("A frame of the clip, counted from 0.");
var commentInput = string().regex(new RegExp(`^${COMMENT_ID_PATTERN}$`), "Expected a comment id.").describe("A comment id, such as \"c01k9qv3m4x7r2t8w5y6z0abcde\", from get_comments or round.json.");
var text = (value) => ({
	type: "text",
	text: value
});
var image = (png) => ({
	type: "image",
	data: Buffer.from(png).toString("base64"),
	mimeType: "image/png"
});
var result = (...content) => ({ content });
var carded = (card, ...content) => ({
	content,
	_meta: { [CARD_META_KEY]: card }
});
/** The longest lists of meshes and clips a card shows. */
var CARD_LIST_LIMIT = 200;
var viewResult = (shown, ...content) => ({
	content,
	_meta: { [MCP_VIEW_META_KEY]: shown }
});
var channelResult = (output) => ({
	content: [],
	_meta: { [WINDOW_CHANNEL_META_KEY]: output }
});
/** The MCP server of `arcue mcp`. Each tool call connects to the core that `arcue open` would use for the view. */
function createArcueMcpServer(given) {
	let starting = null;
	const options = {
		...given,
		startServe: () => starting ??= given.startServe().finally(() => {
			starting = null;
		})
	};
	const leases = /* @__PURE__ */ new Map();
	/** When `open_model` last showed each model, by its path, so a view of an earlier one can tell. */
	const shownAt = /* @__PURE__ */ new Map();
	let lastShown = 0;
	const openWindow = options.openWindow ?? openWindowSocket;
	/** Why Arcue in the browser last failed to start for a view, so views that call again soon do not start it again. */
	let startFailure = null;
	const relay = new WindowRelay({
		setTimer: systemClock.setTimer,
		connect: async () => {
			const attempt = async () => {
				const info = await readBridgeInfo(options.userData, "serve");
				if (info?.url === void 0) return null;
				return openWindow(info.url, info.token, options.view).catch(() => null);
			};
			const socket = await attempt();
			if (socket) return socket;
			if (startFailure && Date.now() - startFailure.at < START_RETRY_MS) throw startFailure.error;
			await options.startServe().catch((error) => {
				startFailure = {
					at: Date.now(),
					error
				};
				throw error;
			});
			startFailure = null;
			const started = await attempt();
			if (!started) throw new Error("Arcue in the browser started but does not take the view's window.");
			return started;
		}
	});
	const server = new McpServer({
		name: "arcue",
		version: options.version
	}, { instructions: ["Arcue is an app where people pin or paint comments on 3D models at a frame. These tools list the models open in Arcue, read a model's comments with their screenshots, send its queued comments as a round, show the model at a clip and frame, render screenshots, and resolve or reopen comments.", `Paths are model files, absolute or relative to ${options.cwd}. A comment's vertex numbers count the file's own vertices, in the file's order.`].join(" ") });
	server.server.onclose = () => relay.dispose();
	/** The client renders the view, so `open_model` shows the model there, through Arcue in the browser. */
	const showsViews = () => H(server.server.getClientCapabilities())?.mimeTypes?.includes("text/html;profile=mcp-app") ?? false;
	G(server, "Arcue view", MCP_VIEW_URI, { description: "The page that apps showing MCP Apps render for open_model. It holds no data." }, async () => ({ contents: [{
		uri: MCP_VIEW_URI,
		mimeType: L,
		text: await options.viewHtml(),
		_meta: { ui: {
			prefersBorder: false,
			csp: { resourceDomains: ["https://assets.claude.ai"] }
		} }
	}] }));
	G(server, "Arcue card", CARD_URI, { description: "The page that apps showing MCP Apps render for get_comments and inspect_model. It holds no data." }, async () => ({ contents: [{
		uri: CARD_URI,
		mimeType: L,
		text: await options.cardHtml(),
		_meta: { ui: {
			prefersBorder: false,
			csp: { resourceDomains: ["https://assets.claude.ai"] }
		} }
	}] }));
	server.registerTool("list_models", {
		title: "List the models open in Arcue",
		description: "List the models open in Arcue, with the number of comments of each status. Starts nothing: without Arcue running, there are none.",
		inputSchema: object({}),
		annotations: {
			readOnlyHint: true,
			openWorldHint: false
		}
	}, async () => {
		const models = /* @__PURE__ */ new Map();
		for (const kind of ["serve", "desktop"]) {
			const connection = await connectToCore(options.userData, kind);
			if (!connection) continue;
			try {
				const { assets } = await connection.client.query("asset.list", {});
				for (const asset of assets) {
					if (models.has(asset.path)) continue;
					const review = asset.version === null ? null : await connection.client.query("review.get", { assetId: asset.assetId });
					models.set(asset.path, {
						path: asset.path,
						status: asset.status,
						comments: review ? countsOf(review.comments) : null
					});
				}
			} finally {
				connection.close();
			}
		}
		if (models.size === 0) return result(text("No models are open in Arcue."));
		return result(text(models.size === 1 ? "1 model is open in Arcue." : `${models.size} models are open in Arcue.`), text(JSON.stringify([...models.values()])));
	});
	j(server, "inspect_model", {
		title: "Inspect a model",
		description: "Read a model file without opening it in Arcue: format, exporter, axes, height, meshes with their triangles, parts, bones, materials and missing textures, clips, the files its composition adds, and import warnings. json gives the full result, with each mesh's vertex count and every bone.",
		inputSchema: object({
			path: pathInput,
			json: boolean().default(false).describe("Return the full result as JSON.")
		}),
		annotations: {
			readOnlyHint: true,
			openWorldHint: false
		},
		_meta: { ui: { resourceUri: CARD_URI } }
	}, async ({ path, json }) => {
		const file = await modelFile(options.cwd, path);
		let workerError = null;
		const inspection = await inspectFile(file, {
			importWorkerEntry: options.importWorkerEntry,
			userData: options.userData,
			onError: (error) => {
				workerError ??= error;
			}
		}).catch((error) => {
			throw workerError ?? error;
		});
		return carded(inspectionCard(file, inspection), text(json ? JSON.stringify(inspection) : formatInspection(inspection)));
	});
	j(server, "open_model", {
		title: "Show a model in Arcue",
		description: "Show a model in Arcue, at a clip and frame when given: in apps that show MCP Apps, in Arcue's view in the conversation; elsewhere in this session's page of Arcue in the browser, or in the Arcue desktop app. The result says where, with the page's address when it is not open yet.",
		inputSchema: object({
			path: pathInput,
			clip: clipInput.optional(),
			frame: frameInput.optional(),
			move: boolean().default(false).describe("Take the model from another session's view when one shows it.")
		}),
		annotations: {
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: false
		},
		_meta: { ui: { resourceUri: MCP_VIEW_URI } }
	}, async ({ path, clip, frame, move }, { mcpReq: { signal } }) => {
		const file = await modelFile(options.cwd, path);
		const here = showsViews();
		if (here) await relay.sweep();
		return withCore(options, (core) => leased(leases, core, file, true, async () => {
			const open = await openAsset(core, file);
			const at = open?.path ?? file;
			let named = clip;
			if (clip !== void 0) {
				const { assetId } = open ?? await openInView(core, {
					path: at,
					view: options.view,
					move
				});
				await loaded(core.client, assetId, options.loadTimeoutMs, signal);
				named = await clipNamed(core.client, {
					assetId,
					name: basename(file)
				}, clip, frame);
			}
			const { assetId, shown } = await openInView(core, {
				path: at,
				view: options.view,
				move,
				...named !== void 0 ? { clip: named } : {},
				...frame !== void 0 ? { frame } : {}
			});
			const moment = named !== void 0 ? ` at clip "${named}"${frame !== void 0 ? `, frame ${frame}` : ""}` : frame !== void 0 ? ` at frame ${frame}` : "";
			const name = `${basename(file)}${moment}`;
			if (here) {
				const { assets } = await core.client.query("asset.list", {});
				const shownPath = assets.find((asset) => asset.assetId === assetId)?.path ?? fromNativePath(file);
				lastShown = Math.max(Date.now(), lastShown + 1);
				shownAt.set(shownPath, lastShown);
				return viewResult({
					path: shownPath,
					assetId,
					shownAt: lastShown,
					...named !== void 0 ? { clip: named } : {},
					...frame !== void 0 ? { frame } : {}
				}, text(`Arcue shows ${name} as ${assetId} in its view in this conversation.`));
			}
			const lines = startedLine(core);
			if (shown === "view") lines.push(`Arcue shows ${name} in this session's page as ${assetId}.`);
			else if (shown === "window" && core.page !== null) lines.push(`Arcue shows ${name} as ${assetId} in another of its pages, since this session's page is not open: ${core.page}`);
			else if (shown === "window") lines.push(`Arcue shows ${name} in the Arcue app as ${assetId}.`);
			else if (core.page !== null) lines.push(`Arcue holds ${name} as ${assetId} until this session's page opens: ${core.page}`);
			else lines.push(`Arcue holds ${name} as ${assetId} until one of its windows opens.`);
			return result(text(lines.join("\n")));
		}), here ? "serve" : "open");
	});
	const windowChannel = server.registerTool(WINDOW_CHANNEL_TOOL, {
		title: "Carry the view's window",
		description: "Carries the messages between Arcue's view in the conversation and Arcue in the browser. Only the view calls it.",
		inputSchema: windowChannelInputSchema,
		annotations: {
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: false,
			openWorldHint: false
		},
		_meta: { ui: { visibility: ["app"] } }
	}, async ({ op, channel, path, shownAt: at, seq, from, pieces }, { mcpReq: { signal } }) => {
		if (op === "open") {
			const id = await relay.open();
			const latest = path === void 0 || at === void 0 || at >= (shownAt.get(path) ?? 0);
			if (path !== void 0 && at !== void 0 && latest && (shownAt.has(path) || shownAt.size < MAX_SHOWN)) shownAt.set(path, at);
			return channelResult({
				channel: id,
				latest
			});
		}
		if (channel === void 0) throw new Error(`${op} needs the channel.`);
		if (op === "send") return channelResult({ next: relay.send(channel, seq ?? 0, pieces ?? []) });
		if (op === "receive") return channelResult(await relay.receive(channel, from ?? 0, signal));
		relay.close(channel);
		return channelResult({});
	});
	/** Only an app that shows the view lists the tool, which only the view calls. */
	windowChannel.disable();
	server.server.oninitialized = () => {
		if (showsViews()) windowChannel.enable();
	};
	j(server, "get_comments", {
		title: "Read a model's comments",
		description: "List the review comments on a model, with their screenshots: each comment's id, status, rounds, messages, clip and frame, the mesh, vertices and bones it points at, and the camera. A draft waits in the reviewer's queue, sent went to the agent in a round, and resolved was fixed. Opens the model in Arcue when it is not open.",
		inputSchema: object({
			path: pathInput,
			status: array(_enum([
				"draft",
				"sent",
				"resolved"
			])).min(1).default(["draft", "sent"]).describe("The statuses to list."),
			comments: array(commentInput).min(1).optional().describe("List only these comments, whatever their status."),
			screenshots: boolean().default(true).describe(`Add the screenshots of up to 8 comments; the result says how many it left out.`)
		}),
		annotations: {
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: false
		},
		_meta: { ui: { resourceUri: CARD_URI } }
	}, async ({ path, status, comments, screenshots }) => {
		const file = await modelFile(options.cwd, path);
		return withCore(options, (core) => withModel(core, file, options, leases, async (asset) => {
			const review = await core.client.query("review.get", { assetId: asset.assetId });
			const missing = comments?.find((id) => !review.comments.some((entry) => entry.id === id));
			if (missing !== void 0) throw new Error(`${asset.name} has no comment ${missing}.`);
			const listed = sorted(review.comments).filter((comment) => comments ? comments.includes(comment.id) : status.includes(comment.status));
			const content = [text([...startedLine(core), summaryLine(asset.name, review, listed)].join("\n"))];
			const card = commentsCard(file, asset.name, review, listed);
			if (listed.length === 0) return carded(card, ...content);
			content.push(text(JSON.stringify(listed.map(commentEntry))));
			if (screenshots) {
				const shots = listed.filter((comment) => comment.context.screenshot !== null).map((comment) => ({
					id: comment.id,
					label: comment.id
				}));
				const { content: images, ids, left } = await screenshotsOf(core.client, asset.assetId, shots);
				content.push(...images);
				card.screenshots = ids;
				if (left > 0) content.push(text(`${leftOut(left)} Pass their ids as comments to get them.`));
			}
			return carded(card, ...content);
		}));
	});
	server.registerTool("send_round", {
		title: "Send the queued comments",
		description: "Send the comments in a model's queue as the next round, as Arcue's copy button does, and return the round's prompt with the screenshots and each comment's id. The comments become sent. Send only when the user asks. The prompt names the round's folder, whose round.json has each comment's exact vertices, positions, bones and camera; get_comments gives them too.",
		inputSchema: object({ path: pathInput }),
		annotations: {
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: false,
			openWorldHint: false
		}
	}, async ({ path }, { mcpReq: { signal } }) => {
		const file = await modelFile(options.cwd, path);
		return withCore(options, (core) => withModel(core, file, options, leases, async (asset) => {
			const empty = () => result(text([...startedLine(core), `${asset.name} has no comments in its queue.`].join("\n")));
			if ((await core.client.query("review.get", { assetId: asset.assetId })).queue.length === 0) return empty();
			const current = await loaded(core.client, asset.assetId, options.loadTimeoutMs, signal);
			signal.throwIfAborted();
			let copy;
			try {
				copy = await core.client.execute("round.copy", {
					assetId: asset.assetId,
					clipboard: false
				});
			} catch (error) {
				if ((await core.client.query("review.get", { assetId: asset.assetId })).queue.length === 0) return empty();
				throw error;
			}
			const review = await core.client.query("review.get", { assetId: asset.assetId });
			const ids = review.rounds.find((entry) => entry.number === copy.round)?.comments ?? [];
			const shots = ids.flatMap((id, index) => review.comments.find((entry) => entry.id === id)?.context.screenshot ? [{
				id,
				label: `comment ${index + 1}`
			}] : []);
			const { content: images, left } = await screenshotsOf(core.client, asset.assetId, shots);
			const notes = [
				...startedLine(core),
				...staleLine(current),
				`The round's comments by number: ${ids.map((id, index) => `${index + 1} ${id}`).join(", ")}.`,
				...copy.copiedToClipboard ? ["Arcue also copied the prompt to the clipboard."] : [],
				...left > 0 ? [`${leftOut(left)} get_comments with their ids gives them.`] : []
			];
			const round = {
				round: copy.round,
				comments: ids
			};
			return {
				...result(text(copy.prompt), ...images, text(notes.join("\n"))),
				_meta: { [ROUND_META_KEY]: round }
			};
		}));
	});
	server.registerTool("resolve_comment", {
		title: "Resolve a comment",
		description: "Mark a sent comment resolved: the model's new version fixed it. Resolve only when the user asks or confirms the fix. A resolved comment stays resolved.",
		inputSchema: object({
			path: pathInput,
			comment: commentInput
		}),
		annotations: {
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: false
		}
	}, async ({ path, comment }) => {
		const file = await modelFile(options.cwd, path);
		return withCore(options, (core) => withModel(core, file, options, leases, async (asset) => {
			const found = (await core.client.query("review.get", { assetId: asset.assetId })).comments.find((entry) => entry.id === comment);
			if (!found) throw new Error(`${asset.name} has no comment ${comment}.`);
			if (found.status === "resolved") return result(text(`${comment} on ${asset.name} is already resolved.`));
			await core.client.execute("comment.resolve", {
				assetId: asset.assetId,
				commentId: comment
			});
			return result(text(`Resolved ${comment} on ${asset.name}.`));
		}));
	});
	server.registerTool("reopen_comment", {
		title: "Reopen a comment",
		description: "Return a sent or resolved comment to the model's queue with a follow-up message, when its fix did not work. The next round sends it again. Reopen only when the user asks, with what they say is still wrong.",
		inputSchema: object({
			path: pathInput,
			comment: commentInput,
			text: string().trim().min(1).describe("What is still wrong.")
		}),
		annotations: {
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: false,
			openWorldHint: false
		}
	}, async ({ path, comment, text: message }) => {
		const file = await modelFile(options.cwd, path);
		return withCore(options, (core) => withModel(core, file, options, leases, async (asset) => {
			await core.client.execute("comment.reopen", {
				assetId: asset.assetId,
				commentId: comment,
				text: message
			});
			return result(text(`Reopened ${comment} on ${asset.name}. It waits in the queue with the follow-up.`));
		}));
	});
	server.registerTool("screenshot", {
		title: "Render a screenshot",
		description: "Render the model as Arcue's view shows it and return the PNG: as on screen, at a clip and frame, or at a comment's time and camera, on the model's current version. Needs an Arcue window that shows the model; open_model shows it.",
		inputSchema: object({
			path: pathInput,
			comment: commentInput.optional().describe("Render at this comment's time and camera."),
			clip: clipInput.optional(),
			frame: frameInput.optional(),
			width: int().min(16).max(2048).default(1280),
			height: int().min(16).max(2048).default(720)
		}),
		annotations: {
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: false
		}
	}, async ({ path, comment, clip, frame, width, height }, { mcpReq: { signal } }) => {
		const file = await modelFile(options.cwd, path);
		return withCore(options, (core) => leased(leases, core, file, true, async () => {
			const asset = await openAsset(core, file) ?? {
				...await openInView(core, {
					path: file,
					view: options.view,
					move: false
				}),
				name: basename(file)
			};
			const current = await loaded(core.client, asset.assetId, options.loadTimeoutMs, signal);
			let time;
			let camera;
			if (comment !== void 0) {
				const found = (await core.client.query("review.get", { assetId: asset.assetId })).comments.find((entry) => entry.id === comment);
				if (!found) throw new Error(`${asset.name} has no comment ${comment}.`);
				time = selectionOf(found.time);
				camera = found.camera;
			}
			if (clip !== void 0 || frame !== void 0) {
				const onScreen = clip ?? clipOf(time) ?? (await core.client.query("viewState.get", { assetId: asset.assetId }))?.clip;
				if (onScreen === void 0 || onScreen === null) throw new Error("A frame needs a clip.");
				const at = frame ?? (clip !== void 0 ? frameOf(time) : void 0) ?? 0;
				time = {
					kind: "frame",
					clip: await clipNamed(core.client, asset, onScreen, at),
					frame: at
				};
			}
			const input = {
				assetId: asset.assetId,
				width,
				height,
				...time !== void 0 ? { time } : {},
				...camera !== void 0 ? { camera } : {}
			};
			const png = await screenshotWhenReady(core, asset.name, input, signal);
			return result(text([...staleLine(current), `${asset.name}${timeLabel(time)}:`].join("\n")), image(png));
		}));
	});
	return server;
}
/** Runs the server on stdin and stdout until the client closes stdin. */
async function serveMcp(options, streams = {
	stdin: process.stdin,
	stdout: process.stdout
}) {
	const server = createArcueMcpServer({
		...options,
		view: options.view ?? DEFAULT_VIEW
	});
	const { promise: closed, resolve: close } = Promise.withResolvers();
	const disposeRelay = server.server.onclose;
	server.server.onclose = () => {
		disposeRelay?.();
		close();
	};
	await server.connect(new StdioServerTransport(streams.stdin, streams.stdout));
	await closed;
}
async function modelFile(cwd, path) {
	const given = resolve(cwd, path);
	if (!(await stat(given).catch(() => null))?.isFile()) throw new Error(`${given} is not a file.`);
	if (!MODEL_FILE_EXTENSIONS.includes(extname(given).toLowerCase())) throw new Error(`${given} is not a model. Arcue opens ${MODEL_FILE_EXTENSIONS.join(" and ")} files.`);
	return realpath(given);
}
/**
* Connects to the core `arcue open` would use for the view, and starts Arcue in the browser where `arcue open` would
* say to.
*/
async function withCore(options, work, to = "open") {
	let started = false;
	const route = async () => {
		try {
			return await connectForOpen(options.userData, options.view);
		} catch (error) {
			if (!(error instanceof Error) || !error.message.includes("arcue serve --detach")) throw error;
		}
		await options.startServe();
		started = true;
		return connectForOpen(options.userData, options.view);
	};
	const toServe = async () => {
		const running = await connectToCore(options.userData, "serve");
		if (running) return {
			connection: running,
			kind: "serve"
		};
		await options.startServe();
		started = true;
		const connection = await connectToCore(options.userData, "serve");
		if (!connection) throw new Error("Arcue in the browser did not start.");
		return {
			connection,
			kind: "serve"
		};
	};
	const { connection, kind } = await (to === "serve" ? toServe() : route());
	const url = kind === "serve" ? connection.info.url : void 0;
	const core = {
		client: connection.client,
		kind,
		page: url !== void 0 ? viewAddress(url, options.view) : null,
		started
	};
	try {
		return await work(core);
	} catch (error) {
		if (!(error instanceof ArcueError) || error.code !== "disconnected") throw error;
		throw new Error(kind === "serve" ? "Arcue in the browser stopped during the call. Try again." : "Arcue quit during the call. Try again.");
	} finally {
		connection.close();
	}
}
function startedLine(core) {
	return core.started && core.page !== null ? [`Started Arcue in the browser. This session's page: ${core.page}`] : [];
}
function staleLine(asset) {
	return asset.status === "failed" ? [`Arcue could not load the latest ${asset.name} and uses the version it loaded before: ${asset.error}`] : [];
}
async function openInView(core, input) {
	try {
		return await core.client.execute("asset.openInView", input);
	} catch (error) {
		if (!(error instanceof ArcueError)) throw error;
		if (error.code === "unknown-command") throw new Error(OLDER_CORE);
		if (error.code === "conflict" && !input.move) throw new Error(`${error.message} Pass move to show it in this session's view instead.`);
		throw error;
	}
}
/** The open asset of the file, also when it was opened through another path to it. */
async function openAsset(core, file) {
	const { assets } = await core.client.query("asset.list", {});
	const path = fromNativePath(file);
	const same = assets.find((asset) => asset.path === path);
	if (same) return same;
	for (const asset of assets) if (await realpath(asset.path).catch(() => null) === file) return asset;
}
/** Runs `work` as one of the calls on the file's model; the last of them closes the model they opened for themselves. */
async function leased(leases, core, file, keep, work) {
	let lease = leases.get(file);
	while (lease?.closing) {
		await lease.closing;
		lease = leases.get(file);
	}
	if (!lease) {
		lease = {
			calls: 0,
			opened: null,
			keep: false,
			closing: null
		};
		leases.set(file, lease);
	}
	lease.calls++;
	lease.keep ||= keep;
	try {
		return await work(lease);
	} finally {
		lease.calls--;
		if (lease.calls === 0) {
			const { opened } = lease;
			if (opened === null || lease.keep) leases.delete(file);
			else {
				lease.closing = core.client.execute("asset.close", { assetId: opened }).then(() => void 0, () => void 0).finally(() => leases.delete(file));
				await lease.closing;
			}
		}
	}
}
/**
* Runs `work` on the file's open asset. When no window has it, it opens the file for the view, and the last call on it
* closes it again unless this session's page shows it, so that it holds no model for a page nobody opened.
*/
async function withModel(core, file, options, leases, work) {
	return leased(leases, core, file, false, async (lease) => {
		const open = await openAsset(core, file);
		if (open) return work(open);
		const { assetId, shown } = await openInView(core, {
			path: file,
			view: options.view,
			move: false
		});
		if (shown !== "view") lease.opened = assetId;
		return work({
			assetId,
			name: basename(file)
		});
	});
}
/**
* Renders a screenshot, waiting while the window's 3D view gets the model ready, and says what to do when no window
* shows it.
*/
async function screenshotWhenReady(core, name, input, signal) {
	const deadline = Date.now() + VIEW_READY_MS;
	for (;;) try {
		return (await core.client.execute("view.screenshot", input)).png;
	} catch (error) {
		if (!(error instanceof ArcueError) || error.code !== "unavailable") throw error;
		if (error.message.endsWith("is not ready.") && Date.now() < deadline) {
			await setTimeout$1(LOAD_POLL_MS, void 0, { signal });
			continue;
		}
		if (!error.message.startsWith("No window shows")) throw error;
		throw new Error(core.page !== null ? `No page shows ${name}. Open this session's page, ${core.page}, and keep it open, then try again.` : `No window shows ${name}. Show it with open_model, then try again.`);
	}
}
/** The asset once it has loaded and no reload is under way. A failed reload keeps the version loaded before it. */
async function loaded(client, assetId, timeoutMs = 12e4, signal) {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		signal?.throwIfAborted();
		const { assets } = await client.query("asset.list", {});
		const asset = assets.find((entry) => entry.assetId === assetId);
		if (!asset) throw new Error("Arcue closed the model.");
		if (asset.status === "failed" && asset.version === null) throw new Error(`Arcue could not load ${asset.name}: ${asset.error}`);
		if (asset.status !== "loading" && asset.version !== null) return asset;
		if (Date.now() >= deadline) throw new Error(`${asset.name} is still loading. Try again once it has loaded.`);
		await setTimeout$1(LOAD_POLL_MS, void 0, { signal });
	}
}
/** The clip by its name in the file, or by its display name when only one clip has it, checking the frame. */
async function clipNamed(client, asset, clip, frame) {
	const { scene } = await client.query("scene.get", { assetId: asset.assetId });
	const byDisplayName = scene.clips.filter((entry) => entry.displayName === clip);
	const found = scene.clips.find((entry) => entry.name === clip) ?? (byDisplayName.length === 1 ? byDisplayName[0] : void 0);
	if (!found) {
		const names = scene.clips.map((entry) => `"${entry.name}"`).join(", ");
		throw new Error(`${asset.name} has no clip "${clip}". ${names ? `Its clips: ${names}.` : "It has no clips."}`);
	}
	if (frame !== void 0 && frame >= found.frameCount) throw new Error(`"${found.name}" has frames 0 to ${found.frameCount - 1}.`);
	return found.name;
}
function sorted(comments) {
	return [...comments].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}
function countsOf(comments) {
	const counts = {
		draft: 0,
		sent: 0,
		resolved: 0
	};
	for (const comment of comments) counts[comment.status]++;
	return counts;
}
function summaryLine(name, review, listed) {
	if (review.comments.length === 0) return `${name} has no comments.`;
	const counts = Object.entries(countsOf(review.comments)).filter(([, count]) => count > 0).map(([status, count]) => `${count} ${status}`);
	const total = review.comments.length;
	const head = `${name} has ${total} ${total === 1 ? "comment" : "comments"}: ${counts.join(", ")}.`;
	return listed.length === total ? head : `${head} ${listed.length} listed.`;
}
function commentEntry(comment) {
	const messages = [comment.text, ...comment.followUps.map((followUp) => followUp.text)];
	const { context, target } = comment;
	return {
		id: comment.id,
		status: comment.status,
		rounds: comment.rounds,
		text: messages.at(-1) ?? comment.text,
		...messages.length > 1 ? { earlierMessages: messages.slice(0, -1) } : {},
		time: timeEntry(comment.time),
		target: target === null ? null : target.kind === "surface" ? {
			kind: "point",
			mesh: target.mesh,
			vertices: target.vertices,
			weights: target.weights
		} : {
			kind: "region",
			mesh: target.mesh,
			vertices: target.vertices,
			vertexCount: context.vertexCount
		},
		...target !== null ? {
			anchorState: comment.anchorState,
			anchorVersion: comment.anchorVersion
		} : {},
		bones: context.bones,
		view: context.viewLabel,
		camera: comment.camera,
		screenshot: context.screenshot !== null,
		...comment.parts ? { parts: comment.parts } : {},
		...comment.warning ? { warning: comment.warning } : {}
	};
}
function timeEntry(time) {
	if (time.kind === "none") return null;
	if (time.kind === "frame") return {
		clip: time.clip,
		frame: time.frame
	};
	return {
		clip: time.clip,
		frames: [time.start, time.end]
	};
}
function selectionOf(time) {
	if (time.kind === "none") return { kind: "none" };
	if (time.kind === "frame") return {
		kind: "frame",
		clip: time.clip,
		frame: time.frame
	};
	return {
		kind: "range",
		clip: time.clip,
		start: time.start,
		end: time.end
	};
}
function clipOf(time) {
	return time === void 0 || time.kind === "none" ? void 0 : time.clip;
}
function frameOf(time) {
	if (time === void 0 || time.kind === "none") return void 0;
	return time.kind === "frame" ? time.frame : time.start;
}
function timeLabel(time) {
	if (time === void 0) return " as on screen";
	if (time.kind === "none") return " in the rest pose";
	if (time.kind === "frame") return ` at clip "${time.clip}", frame ${time.frame}`;
	return ` at clip "${time.clip}", frame ${time.start}`;
}
function commentsCard(file, name, review, listed) {
	return {
		card: "comments",
		path: file,
		name,
		counts: countsOf(review.comments),
		queued: review.queue.length,
		comments: listed.map(cardComment),
		screenshots: []
	};
}
function cardComment(comment) {
	const { time } = comment;
	return {
		id: comment.id,
		status: comment.status,
		text: comment.followUps.at(-1)?.text ?? comment.text,
		moment: time.kind === "none" ? null : time.kind === "frame" ? `${time.clipDisplayName}, frame ${time.frame}` : `${time.clipDisplayName}, frames ${time.start} to ${time.end}`,
		hasScreenshot: comment.context.screenshot !== null
	};
}
function inspectionCard(file, inspection) {
	return {
		card: "inspection",
		path: file,
		name: inspection.file.name,
		format: formatLabel(inspection),
		height: inspection.height,
		triangles: shownTriangles(inspection.parts),
		meshes: inspection.meshes.slice(0, CARD_LIST_LIMIT).map((mesh) => ({
			name: mesh.name,
			triangles: mesh.triangles,
			skinned: mesh.skinned
		})),
		meshCount: inspection.meshes.length,
		bones: inspection.bones.length,
		materials: inspection.materials.length,
		clips: inspection.clips.slice(0, CARD_LIST_LIMIT).map((clip) => ({
			name: clip.name,
			displayName: clip.displayName,
			frames: clip.frames
		})),
		clipCount: inspection.clips.length,
		warnings: inspection.warnings.map((warning) => ({
			severity: warning.severity,
			message: warning.message
		})),
		prompt: inspection.warnings.length > 0 ? warningPrompt(inspection.file.path, inspection.warnings) : null
	};
}
/** The triangles the model shows at its most detailed level, without collision helpers, sockets or hidden parts. */
function shownTriangles(parts) {
	return parts.filter((part) => part.role === "model" && part.shownByDefault).reduce((sum, part) => {
		const finest = Math.min(...part.levels.map((level) => level.level));
		return sum + (part.levels.find((level) => level.level === finest)?.triangles ?? 0);
	}, 0);
}
/**
* The comments' screenshots, each after a line that names it, up to `MAX_SCREENSHOTS` and `MAX_IMAGE_BYTES`, and how
* many it left out.
*/
async function screenshotsOf(client, assetId, shots) {
	const content = [];
	const ids = [];
	let bytes = 0;
	for (const [index, { id, label }] of shots.entries()) {
		if (ids.length === 8) return {
			content,
			ids,
			left: shots.length - index
		};
		const png = await client.query("comment.screenshot", {
			assetId,
			commentId: id
		});
		if (png === null) continue;
		if (ids.length > 0 && bytes + png.byteLength > MAX_IMAGE_BYTES) return {
			content,
			ids,
			left: shots.length - index
		};
		content.push(text(`Screenshot of ${label}:`), image(png));
		ids.push(id);
		bytes += png.byteLength;
	}
	return {
		content,
		ids,
		left: 0
	};
}
function leftOut(count) {
	return count === 1 ? "Left out the screenshot of 1 more comment." : `Left out the screenshots of ${count} more comments.`;
}
//#endregion
export { bundledCardPage, bundledViewPage, serveMcp };
