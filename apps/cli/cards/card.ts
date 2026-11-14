import type { CallToolResult, ContentBlock, ImageContent } from "@modelcontextprotocol/client";
import type { App, McpUiDisplayMode, McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import { applyDocumentTheme, applyHostFonts, applyHostStyleVariables } from "@modelcontextprotocol/ext-apps";
import type { CardComment, CardData, CardStatus, CommentsCardData, InspectionCardData } from "../src/card-data";
import { CARD_META_KEY } from "../src/card-data";
import { count, h } from "./dom";

/** The comments, warnings and lists an inline card shows before it offers the full screen. */
export const INLINE_ROWS = 3;
/** The most screenshots `get_comments` returns in one result. */
const SCREENSHOT_BATCH = 8;

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
  readonly #fetching = new Set<string>();
  /** Comments whose screenshot the card asked for and did not get. */
  readonly #noShot = new Set<string>();
  readonly #resolving = new Set<string>();
  #sending = false;
  #fixAsked = false;
  #notice: string | null = null;
  /** The display mode the host last granted or reported. */
  #mode: McpUiDisplayMode | undefined;
  /** What the person did in the card, for the model's context. */
  readonly #done: string[] = [];

  constructor(root: HTMLElement, app: App) {
    this.#root = root;
    this.#app = app;
    app.ontoolinput = () => this.#render();
    app.ontoolresult = (result) => this.#received(result);
    app.ontoolcancelled = () => {
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

  #received(result: CallToolResult): void {
    const card = result._meta?.[CARD_META_KEY];
    if (result.isError) this.#failure = firstText(result.content) ?? "The call failed.";
    else if (isCardData(card)) {
      this.#data = card;
      if (card.card === "comments") this.#keepImages(card.screenshots, result.content);
    } else this.#plain = firstText(result.content);
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
    return !this.#fullscreen && (this.#context.availableDisplayModes ?? []).includes("fullscreen");
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
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.key : undefined;
    this.#root.replaceChildren(this.#view());
    if (focused !== undefined) this.#root.querySelector<HTMLElement>(`[data-key="${focused}"]`)?.focus();
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
        : h("ul", { class: "comments" }, ...shown.map((comment) => this.#commentRow(data, comment))),
      hidden > 0 && h("p", { class: "card-more" }, `${count(hidden, "more comment")}`),
      this.#notice !== null && h("p", { class: "card-notice" }, this.#notice),
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
                disabled: this.#sending,
                onclick: () => void this.#send(data),
              },
              this.#sending ? "Sending" : `Send ${count(data.queued, "comment")}`,
            ),
          hidden > 0 && h("button", { class: "button", key: "expand", onclick: () => void this.#expand() }, "Show all"),
        ),
    );
  }

  #commentRow(data: CommentsCardData, comment: CardComment): HTMLElement {
    const image = this.#images.get(comment.id);
    const canResolve = comment.status === "sent" && !this.#canExpand && this.#canCallTools;
    const resolving = this.#resolving.has(comment.id);
    return h(
      "li",
      { class: `comment is-${comment.status}` },
      image !== undefined
        ? h("img", { class: "comment-shot", src: image, alt: "" })
        : h("div", {
            class: `comment-shot is-empty${this.#awaitsShot(comment) ? " is-loading" : ""}`,
          }),
      h(
        "div",
        { class: "comment-body" },
        h("p", { class: "comment-text" }, comment.text),
        h(
          "p",
          { class: "comment-meta" },
          h("span", { class: `status-dot is-${comment.status}` }),
          [STATUS_LABELS[comment.status], comment.moment].filter((part) => part !== null).join(" · "),
        ),
      ),
      canResolve &&
        h(
          "button",
          {
            class: "button is-small",
            key: `resolve-${comment.id}`,
            disabled: resolving,
            onclick: () => void this.#resolve(data, comment),
          },
          resolving ? "Resolving" : "Resolve",
        ),
    );
  }

  #awaitsShot(comment: CardComment): boolean {
    return comment.hasScreenshot && this.#canCallTools && !this.#noShot.has(comment.id);
  }

  #inspection(data: InspectionCardData): HTMLElement {
    const facts: [string, string][] = [
      ["Triangles", data.triangles.toLocaleString("en-US")],
      ["Meshes", data.meshes.length.toLocaleString("en-US")],
      ...(data.bones > 0 ? [["Bones", data.bones.toLocaleString("en-US")] as [string, string]] : []),
      ...(data.clips.length > 0 ? [["Clips", data.clips.length.toLocaleString("en-US")] as [string, string]] : []),
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
      this.#notice !== null && h("p", { class: "card-notice" }, this.#notice),
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
      this.#fullscreen && details(data),
    );
  }

  async #expand(): Promise<void> {
    const granted = await this.#app.requestDisplayMode({ mode: "fullscreen" }).catch(() => null);
    if (granted) this.#mode = granted.mode;
    this.#render();
  }

  /** Sends the queue as a round and posts its prompt to the chat, with the screenshots where the chat takes them. */
  async #send(data: CommentsCardData): Promise<void> {
    this.#sending = true;
    this.#notice = null;
    this.#render();
    try {
      const sent = await this.#app.callServerTool({ name: "send_round", arguments: { path: data.path } });
      const prompt = firstText(sent.content);
      if (sent.isError || prompt === null) {
        this.#notice = prompt ?? "Arcue could not send the comments.";
        return;
      }
      const images = sent.content.filter((block): block is ImageContent => block.type === "image");
      const capabilities = this.#app.getHostCapabilities();
      const message: ContentBlock[] = [{ type: "text", text: prompt }];
      if (capabilities?.message?.image !== undefined) message.push(...images);
      else if (images.length > 0 && capabilities?.updateModelContext?.image !== undefined) {
        await this.#app.updateModelContext({ content: images }).catch(() => undefined);
      }
      const posted = await this.#app.sendMessage({ role: "user", content: message });
      if (posted.isError) this.#notice = "Arcue saved the round, but the chat did not take its prompt.";
      await this.#refresh(data);
    } catch (error) {
      this.#notice = error instanceof Error ? error.message : String(error);
    } finally {
      this.#sending = false;
      this.#render();
    }
  }

  async #resolve(data: CommentsCardData, comment: CardComment): Promise<void> {
    this.#resolving.add(comment.id);
    this.#notice = null;
    this.#render();
    try {
      const resolved = await this.#app.callServerTool({
        name: "resolve_comment",
        arguments: { path: data.path, comment: comment.id },
      });
      if (resolved.isError) {
        this.#notice = firstText(resolved.content) ?? "Arcue could not resolve the comment.";
        return;
      }
      if (comment.status === "sent") {
        data.counts.sent--;
        data.counts.resolved++;
      }
      comment.status = "resolved";
      this.#done.push(`The person resolved comment ${comment.id} on ${data.name} in Arcue's card.`);
      await this.#app
        .updateModelContext({ content: [{ type: "text", text: this.#done.join("\n") }] })
        .catch(() => undefined);
    } catch (error) {
      this.#notice = error instanceof Error ? error.message : String(error);
    } finally {
      this.#resolving.delete(comment.id);
      this.#render();
    }
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

  /** Reads the comments again after a round, keeping the screenshots the card has. */
  async #refresh(data: CommentsCardData): Promise<void> {
    const listed = await this.#app.callServerTool({
      name: "get_comments",
      arguments: { path: data.path, comments: data.comments.map((comment) => comment.id), screenshots: false },
    });
    const card = listed._meta?.[CARD_META_KEY];
    if (!listed.isError && isCardData(card) && card.card === "comments") this.#data = card;
  }

  /** Asks for the screenshots of the rows on screen that the result left out, a batch at a time. */
  #fetchScreenshots(data: CommentsCardData): void {
    if (!this.#canCallTools) return;
    const shown = this.#canExpand ? data.comments.slice(0, INLINE_ROWS) : data.comments;
    const missing = shown
      .filter((comment) => comment.hasScreenshot && !this.#images.has(comment.id) && !this.#fetching.has(comment.id))
      .map((comment) => comment.id);
    for (let start = 0; start < missing.length; start += SCREENSHOT_BATCH) {
      this.#fetchBatch(data.path, missing.slice(start, start + SCREENSHOT_BATCH));
    }
  }

  /** A result may stop short of a batch at its size limit, so the ones it left out are asked for one at a time. */
  #fetchBatch(path: string, batch: string[]): void {
    for (const id of batch) this.#fetching.add(id);
    void this.#app
      .callServerTool({ name: "get_comments", arguments: { path, comments: batch, screenshots: true } })
      .then((listed) => {
        const card = listed._meta?.[CARD_META_KEY];
        if (!listed.isError && isCardData(card) && card.card === "comments") {
          this.#keepImages(card.screenshots, listed.content);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        const left = batch.filter((id) => !this.#images.has(id));
        if (batch.length > 1) for (const id of left) this.#fetchBatch(path, [id]);
        else for (const id of left) this.#noShot.add(id);
        this.#render();
      });
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

function details(data: InspectionCardData): HTMLElement {
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

function isCardData(value: unknown): value is CardData {
  if (typeof value !== "object" || value === null || !("card" in value)) return false;
  return value.card === "comments" || value.card === "inspection";
}
