import type { CallToolResult, ContentBlock, ImageContent } from "@modelcontextprotocol/client";
import type { App, McpUiDisplayMode, McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import { applyDocumentTheme, applyHostFonts, applyHostStyleVariables } from "@modelcontextprotocol/ext-apps";
import type {
  CardComment,
  CardData,
  CardStatus,
  CommentsCardData,
  InspectionCardData,
  RoundMeta,
} from "../src/card-data";
import { CARD_META_KEY, MAX_SCREENSHOTS, ROUND_META_KEY } from "../src/card-data";
import { count, h } from "./dom";

/** The comments, warnings and lists an inline card shows before it offers the full screen. */
export const INLINE_ROWS = 3;
/** `send_round` may wait for the model to load, so the card waits longer than a call's default minute. */
const SEND_TIMEOUT_MS = 5 * 60_000;

const STATUS_LABELS: Readonly<Record<CardStatus, string>> = { draft: "draft", sent: "sent", resolved: "resolved" };

/**
 * Renders Arcue's card for a tool result in `root`: a model's comments, which it can send and resolve, or what a model
 * file holds, whose warnings it can ask to have fixed. Call before `app.connect()`, then `started()` once connected.
 */
export class Card {
  readonly #root: HTMLElement;
  readonly #app: App;
  #data: CardData | null = null;
  /** The result's text, shown when the result carries no card. */
  #plain: string | null = null;
  #failure: string | null = null;
  readonly #images = new Map<string, string>();
  /** Comments whose screenshot the card asked for, or queued to ask for. */
  readonly #asked = new Set<string>();
  readonly #shotQueue: string[][] = [];
  #fetchingShots = false;
  /** Comments whose screenshot the card asked for and did not get. */
  readonly #noShot = new Set<string>();
  /** The action that runs: "send", or the id of the comment being resolved. One runs at a time. */
  #busy: string | null = null;
  #fixAsked = false;
  #notice: string | null = null;
  /** The display mode the host last granted or reported. */
  #mode: McpUiDisplayMode | undefined;
  /** The host turned down the full screen, so the inline card shows every row. */
  #allInline = false;
  /** What the person did in the card, for the model's context. */
  readonly #done: string[] = [];
  /** The last round's screenshots with their labels, for the model's context when the chat takes no images. */
  #roundShots: ContentBlock[] = [];

  constructor(root: HTMLElement, app: App) {
    this.#root = root;
    this.#app = app;
    root.tabIndex = -1;
    app.ontoolinput = () => this.#render();
    app.ontoolresult = (result) => this.#received(result);
    app.ontoolcancelled = () => {
      if (this.#hasResult) return;
      this.#failure = "The call was cancelled.";
      this.#render();
    };
    app.onhostcontextchanged = (changed) => {
      if (changed.displayMode) this.#mode = changed.displayMode;
      applyHostContext(changed);
      this.#render();
    };
  }

  started(): void {
    applyHostContext(this.#app.getHostContext() ?? {});
    this.#render();
  }

  get #hasResult(): boolean {
    return this.#data !== null || this.#plain !== null || this.#failure !== null;
  }

  #received(result: CallToolResult): void {
    const card = result._meta?.[CARD_META_KEY];
    if (result.isError) this.#failure = firstText(result.content) ?? "The call failed.";
    else if (isCardData(card)) {
      this.#data = card;
      if (card.card === "comments") this.#keepImages(card.screenshots, result.content);
    } else this.#plain = firstText(result.content) ?? "The result has nothing to show.";
    this.#render();
  }

  get #context(): McpUiHostContext {
    return this.#app.getHostContext() ?? {};
  }

  get #fullscreen(): boolean {
    return (this.#mode ?? this.#context.displayMode) === "fullscreen";
  }

  /** The card can open in the full screen, so the inline card shows only the first rows. */
  get #canExpand(): boolean {
    return !this.#fullscreen && !this.#allInline && (this.#context.availableDisplayModes ?? []).includes("fullscreen");
  }

  get #canMessage(): boolean {
    return this.#app.getHostCapabilities()?.message !== undefined;
  }

  get #canCallTools(): boolean {
    return this.#app.getHostCapabilities()?.serverTools !== undefined;
  }

  #render(): void {
    const insets = this.#context.safeAreaInsets;
    this.#root.style.padding = insets ? `${insets.top}px ${insets.right}px ${insets.bottom}px ${insets.left}px` : "";
    this.#root.classList.toggle("is-fullscreen", this.#fullscreen);
    const active = document.activeElement;
    const hadFocus = active instanceof HTMLElement && this.#root.contains(active);
    const focused = hadFocus ? active.dataset.key : undefined;
    this.#root.replaceChildren(this.#view());
    if (hadFocus) {
      const next = focused === undefined ? null : this.#root.querySelector<HTMLElement>(`[data-key="${focused}"]`);
      (next ?? this.#root).focus();
    }
    if (this.#data?.card === "comments") this.#fetchScreenshots(this.#data);
  }

  #view(): HTMLElement {
    if (this.#failure !== null) return h("p", { class: "card-failure" }, this.#failure);
    if (this.#data?.card === "comments") return this.#comments(this.#data);
    if (this.#data?.card === "inspection") return this.#inspection(this.#data);
    if (this.#plain !== null) return h("p", { class: "card-plain" }, this.#plain);
    return h(
      "div",
      { class: "card-skeleton" },
      h("div", { class: "skeleton-line is-wide" }),
      h("div", { class: "skeleton-line" }),
    );
  }

  #comments(data: CommentsCardData): HTMLElement {
    const shown = this.#canExpand ? data.comments.slice(0, INLINE_ROWS) : data.comments;
    const hidden = data.comments.length - shown.length;
    const canSend = data.queued > 0 && this.#canMessage && this.#canCallTools;
    return h(
      "section",
      { class: "card" },
      h("header", { class: "card-header" }, h("h1", null, data.name), countsLine(data.counts)),
      data.comments.length === 0
        ? h("p", { class: "card-empty" }, "No comments to show.")
        : h("ul", { class: "comments" }, ...shown.map((comment) => this.#commentRow(comment))),
      hidden > 0 && h("p", { class: "card-more" }, count(hidden, "more comment")),
      this.#noticeLine(),
      (canSend || hidden > 0) &&
        h(
          "footer",
          { class: "card-actions" },
          canSend &&
            h(
              "button",
              {
                class: "button is-feedback",
                key: "send",
                disabled: this.#busy !== null,
                onclick: () => void this.#send(),
              },
              this.#busy === "send" ? "Sending" : `Send ${count(data.queued, "comment")}`,
            ),
          hidden > 0 && h("button", { class: "button", key: "expand", onclick: () => void this.#expand() }, "Show all"),
        ),
    );
  }

  #commentRow(comment: CardComment): HTMLElement {
    const image = this.#images.get(comment.id);
    const canResolve = comment.status === "sent" && this.#canCallTools;
    const meta = [STATUS_LABELS[comment.status], comment.moment].filter((part) => part !== null).join(" · ");
    return h(
      "li",
      { class: `comment is-${comment.status}` },
      image !== undefined
        ? h("img", { class: "comment-shot", src: image, alt: "" })
        : h("div", { class: `comment-shot is-empty${this.#awaitsShot(comment) ? " is-loading" : ""}` }),
      h(
        "div",
        { class: "comment-body" },
        h("p", { class: "comment-text" }, comment.text),
        h(
          "p",
          { class: "comment-meta" },
          h("span", { class: `status-dot is-${comment.status}` }),
          `${meta.charAt(0).toUpperCase()}${meta.slice(1)}`,
        ),
      ),
      canResolve &&
        h(
          "button",
          {
            class: "button is-small",
            key: `resolve-${comment.id}`,
            disabled: this.#busy !== null,
            onclick: () => void this.#resolve(comment.id),
          },
          this.#busy === comment.id ? "Resolving" : "Resolve",
        ),
    );
  }

  #awaitsShot(comment: CardComment): boolean {
    return comment.hasScreenshot && this.#canCallTools && !this.#noShot.has(comment.id);
  }

  #inspection(data: InspectionCardData): HTMLElement {
    const facts: [string, string][] = [
      ["Triangles", data.triangles.toLocaleString("en-US")],
      ["Meshes", data.meshCount.toLocaleString("en-US")],
      ...(data.bones > 0 ? [["Bones", data.bones.toLocaleString("en-US")] as [string, string]] : []),
      ...(data.clipCount > 0 ? [["Clips", data.clipCount.toLocaleString("en-US")] as [string, string]] : []),
      ["Height", `${Number(data.height.toPrecision(3))} m`],
    ];
    const warnings = this.#canExpand ? data.warnings.slice(0, INLINE_ROWS) : data.warnings;
    const hidden = data.warnings.length - warnings.length;
    const hasDetails = data.meshes.length > 0 || data.clips.length > 0 || hidden > 0;
    const canFix = data.prompt !== null && this.#canMessage;
    return h(
      "section",
      { class: "card" },
      h("header", { class: "card-header" }, h("h1", null, data.name), h("p", { class: "card-sub" }, data.format)),
      h(
        "dl",
        { class: "facts" },
        ...facts.map(([label, value]) => h("div", { class: "fact" }, h("dt", null, label), h("dd", null, value))),
      ),
      warnings.length > 0 &&
        h(
          "ul",
          { class: "warnings" },
          ...warnings.map((warning) =>
            h(
              "li",
              { class: `warning is-${warning.severity}` },
              h("span", { class: "status-dot is-alert" }),
              warning.message,
            ),
          ),
        ),
      hidden > 0 && h("p", { class: "card-more" }, count(hidden, "more warning")),
      this.#noticeLine(),
      (canFix || (this.#canExpand && hasDetails)) &&
        h(
          "footer",
          { class: "card-actions" },
          canFix &&
            h(
              "button",
              { class: "button is-primary", key: "fix", disabled: this.#fixAsked, onclick: () => void this.#fix(data) },
              this.#fixAsked ? "Asked" : `Fix ${count(data.warnings.length, "warning")}`,
            ),
          this.#canExpand &&
            hasDetails &&
            h("button", { class: "button", key: "expand", onclick: () => void this.#expand() }, "Show details"),
        ),
      !this.#canExpand && details(data),
    );
  }

  #noticeLine(): HTMLElement | null {
    return this.#notice === null ? null : h("p", { class: "card-notice", role: "status" }, this.#notice);
  }

  async #expand(): Promise<void> {
    const granted = await this.#app.requestDisplayMode({ mode: "fullscreen" }).catch(() => null);
    if (granted) this.#mode = granted.mode;
    if (!this.#fullscreen) this.#allInline = true;
    this.#render();
  }

  /** Sends the queue as a round and posts its prompt to the chat, with the screenshots where the chat takes them. */
  async #send(): Promise<void> {
    const data = this.#data;
    if (data?.card !== "comments" || this.#busy !== null) return;
    this.#busy = "send";
    this.#notice = null;
    this.#render();
    try {
      const sent = await this.#app.callServerTool(
        { name: "send_round", arguments: { path: data.path } },
        { timeout: SEND_TIMEOUT_MS },
      );
      const round = roundOf(sent);
      if (sent.isError || round === null) {
        this.#notice = firstText(sent.content) ?? "Arcue could not send the comments.";
      } else {
        this.#markSent(round);
        this.#render();
        await this.#post(sent.content);
      }
      await this.#refresh();
    } catch (error) {
      this.#notice = messageOf(error);
    } finally {
      this.#busy = null;
      this.#render();
    }
  }

  #markSent(round: RoundMeta): void {
    if (this.#data?.card !== "comments") return;
    const data = this.#data;
    const sent = round.comments.length;
    data.counts.draft = Math.max(0, data.counts.draft - sent);
    data.counts.sent += sent;
    data.queued = 0;
    for (const comment of data.comments) if (round.comments.includes(comment.id)) comment.status = "sent";
  }

  /** Posts a round's prompt to the chat. Where the chat takes no images, the screenshots go to the model's context. */
  async #post(content: readonly ContentBlock[]): Promise<void> {
    const capabilities = this.#app.getHostCapabilities();
    let message = [...content];
    if (capabilities?.message?.image === undefined) {
      const shots = content.filter((block, index) => block.type === "image" || content[index + 1]?.type === "image");
      message = content.filter((block) => block.type === "text" && !shots.includes(block));
      if (shots.length > 0 && capabilities?.updateModelContext?.image !== undefined) {
        this.#roundShots = shots;
        await this.#tellModel();
      }
    }
    const posted = await this.#app.sendMessage({ role: "user", content: message }).catch(() => ({ isError: true }));
    if (posted.isError) this.#notice = "Arcue saved the round, but the chat did not take its prompt.";
  }

  async #resolve(id: string): Promise<void> {
    const data = this.#data;
    if (data?.card !== "comments" || this.#busy !== null) return;
    this.#busy = id;
    this.#notice = null;
    this.#render();
    try {
      const resolved = await this.#app.callServerTool({
        name: "resolve_comment",
        arguments: { path: data.path, comment: id },
      });
      if (resolved.isError) {
        this.#notice = firstText(resolved.content) ?? "Arcue could not resolve the comment.";
        return;
      }
      const comment = data.comments.find((entry) => entry.id === id);
      if (comment && comment.status !== "resolved") {
        data.counts[comment.status]--;
        data.counts.resolved++;
        comment.status = "resolved";
      }
      this.#done.push(`The person resolved comment ${id} on ${data.name} in Arcue's card.`);
      await this.#tellModel();
    } catch (error) {
      this.#notice = messageOf(error);
    } finally {
      this.#busy = null;
      this.#render();
    }
  }

  /** The host keeps only the latest context, so each update carries everything the card has to tell. */
  async #tellModel(): Promise<void> {
    if (this.#app.getHostCapabilities()?.updateModelContext === undefined) return;
    const content: ContentBlock[] = [];
    if (this.#done.length > 0) content.push({ type: "text", text: this.#done.join("\n") });
    content.push(...this.#roundShots);
    await this.#app.updateModelContext({ content }).catch(() => undefined);
  }

  async #fix(data: InspectionCardData): Promise<void> {
    if (data.prompt === null) return;
    this.#fixAsked = true;
    this.#notice = null;
    this.#render();
    const posted = await this.#app
      .sendMessage({ role: "user", content: [{ type: "text", text: data.prompt }] })
      .catch(() => ({ isError: true }));
    if (posted.isError) {
      this.#fixAsked = false;
      this.#notice = "The chat did not take the request.";
    }
    this.#render();
  }

  /** Reads the comments on the card again, keeping its rows and the screenshots it has. */
  async #refresh(): Promise<void> {
    const data = this.#data;
    if (data?.card !== "comments") return;
    const ids = data.comments.map((comment) => comment.id);
    const listed = await this.#app
      .callServerTool({
        name: "get_comments",
        arguments:
          ids.length > 0
            ? { path: data.path, comments: ids, screenshots: false }
            : { path: data.path, screenshots: false },
      })
      .catch(() => null);
    const card = listed?.isError ? null : listed?._meta?.[CARD_META_KEY];
    if (!isCardData(card) || card.card !== "comments") return;
    this.#data = ids.length > 0 ? card : { ...data, counts: card.counts, queued: card.queued };
  }

  /** Queues the screenshots of the rows on screen that the result left out, and asks for them a batch at a time. */
  #fetchScreenshots(data: CommentsCardData): void {
    if (!this.#canCallTools) return;
    const shown = this.#canExpand ? data.comments.slice(0, INLINE_ROWS) : data.comments;
    const missing = shown
      .filter((comment) => comment.hasScreenshot && !this.#images.has(comment.id) && !this.#asked.has(comment.id))
      .map((comment) => comment.id);
    for (const id of missing) this.#asked.add(id);
    for (let start = 0; start < missing.length; start += MAX_SCREENSHOTS) {
      this.#shotQueue.push(missing.slice(start, start + MAX_SCREENSHOTS));
    }
    if (missing.length > 0) void this.#fetchQueuedShots(data.path);
  }

  /** A result can stop short of a batch at its size limit; the ones it left out are then asked for one at a time. */
  async #fetchQueuedShots(path: string): Promise<void> {
    if (this.#fetchingShots) return;
    this.#fetchingShots = true;
    try {
      for (let batch = this.#shotQueue.shift(); batch; batch = this.#shotQueue.shift()) {
        const listed = await this.#app
          .callServerTool({ name: "get_comments", arguments: { path, comments: batch, screenshots: true } })
          .catch(() => null);
        const card = listed?.isError ? null : listed?._meta?.[CARD_META_KEY];
        const got = isCardData(card) && card.card === "comments" && listed ? card.screenshots : [];
        if (listed && got.length > 0) this.#keepImages(got, listed.content);
        const left = batch.filter((id) => !this.#images.has(id));
        if (got.length > 0 && batch.length > 1) this.#shotQueue.unshift(...left.map((id) => [id]));
        else for (const id of left) this.#noShot.add(id);
        this.#render();
      }
    } finally {
      this.#fetchingShots = false;
    }
  }

  #keepImages(ids: readonly string[], content: readonly ContentBlock[]): void {
    const images = content.filter((block): block is ImageContent => block.type === "image");
    ids.forEach((id, index) => {
      const image = images[index];
      if (image) this.#images.set(id, `data:${image.mimeType};base64,${image.data}`);
    });
  }
}

function countsLine(counts: Record<CardStatus, number>): HTMLElement {
  const parts = (Object.keys(STATUS_LABELS) as CardStatus[]).filter((status) => counts[status] > 0);
  return h(
    "p",
    { class: "card-sub" },
    ...parts.flatMap((status, index) => [
      index > 0 ? " · " : null,
      h("span", { class: `status-dot is-${status}` }),
      `${counts[status]} ${STATUS_LABELS[status]}`,
    ]),
  );
}

function details(data: InspectionCardData): HTMLElement | false {
  if (data.meshes.length === 0 && data.clips.length === 0) return false;
  return h(
    "div",
    { class: "details" },
    data.meshes.length > 0 &&
      h(
        "section",
        null,
        h("h2", null, "Meshes"),
        h(
          "ul",
          { class: "rows" },
          ...data.meshes.map((mesh) =>
            h(
              "li",
              null,
              h("span", null, mesh.name),
              h(
                "span",
                { class: "row-detail" },
                `${count(mesh.triangles, "triangle")}${mesh.skinned ? ", skinned" : ""}`,
              ),
            ),
          ),
        ),
      ),
    data.clips.length > 0 &&
      h(
        "section",
        null,
        h("h2", null, "Clips"),
        h(
          "ul",
          { class: "rows" },
          ...data.clips.map((clip) =>
            h(
              "li",
              { title: clip.name },
              h("span", null, clip.displayName),
              h("span", { class: "row-detail" }, count(clip.frames, "frame")),
            ),
          ),
        ),
      ),
  );
}

function applyHostContext(context: Partial<McpUiHostContext>): void {
  if (context.theme) applyDocumentTheme(context.theme);
  if (context.styles?.variables) applyHostStyleVariables(context.styles.variables);
  if (context.styles?.css?.fonts) applyHostFonts(context.styles.css.fonts);
}

function firstText(content: readonly ContentBlock[]): string | null {
  for (const block of content) if (block.type === "text") return block.text;
  return null;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isCardData(value: unknown): value is CardData {
  if (typeof value !== "object" || value === null || !("card" in value)) return false;
  return value.card === "comments" || value.card === "inspection";
}

function roundOf(result: CallToolResult): RoundMeta | null {
  const round = result._meta?.[ROUND_META_KEY];
  if (typeof round !== "object" || round === null || !("comments" in round)) return null;
  const { comments } = round;
  if (!Array.isArray(comments) || !comments.every((id) => typeof id === "string")) return null;
  return { round: "round" in round && typeof round.round === "number" ? round.round : 0, comments };
}
