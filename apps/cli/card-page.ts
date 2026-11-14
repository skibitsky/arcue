import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build, type LogLevel, type Plugin, type Rolldown } from "vite";

const cardsDir = fileURLToPath(new URL("./cards/", import.meta.url));

/** Builds `cards/index.html` into one self-contained page, with its script and styles inline. */
export async function buildCardPage(logLevel: LogLevel = "warn"): Promise<string> {
  const result = await build({
    configFile: false,
    root: cardsDir,
    logLevel,
    base: "./",
    build: {
      write: false,
      target: "es2022",
      cssTarget: ["chrome123", "edge123", "firefox120", "safari17.5"],
      cssCodeSplit: false,
      modulePreload: false,
      assetsInlineLimit: Number.MAX_SAFE_INTEGER,
      rolldownOptions: { output: { codeSplitting: false } },
    },
  });
  const outputs = (Array.isArray(result) ? result : [result]) as Rolldown.RolldownOutput[];
  const files = outputs.flatMap((output) => output.output);
  const page = files.find((file) => file.fileName === "index.html");
  if (page?.type !== "asset") throw new Error("The card build made no page.");
  let html = typeof page.source === "string" ? page.source : new TextDecoder().decode(page.source);
  for (const file of files) {
    if (file === page) continue;
    const name = file.fileName.replaceAll(".", "\\.");
    if (file.type === "chunk") {
      const code = file.code.replace(/<\/(script)/gi, "<\\/$1").replaceAll("<!--", "<\\x21--");
      const tag = new RegExp(`<script type="module"[^>]*src="\\./${name}"[^>]*></script>`);
      html = replaceOnce(html, tag, `<script type="module">${code}</script>`, file.fileName);
    } else if (file.fileName.endsWith(".css")) {
      const source = typeof file.source === "string" ? file.source : new TextDecoder().decode(file.source);
      const css = source.replace(/<\/(style)/gi, "<\\/$1");
      const tag = new RegExp(`<link rel="stylesheet"[^>]*href="\\./${name}"[^>]*>`);
      html = replaceOnce(html, tag, `<style>${css}</style>`, file.fileName);
    } else {
      throw new Error(`The card build made ${file.fileName}, which the page cannot inline.`);
    }
  }
  return html;
}

function replaceOnce(html: string, tag: RegExp, replacement: string, fileName: string): string {
  if (!tag.test(html)) throw new Error(`The card's page does not load ${fileName}.`);
  return html.replace(tag, () => replacement);
}

/** Writes the card page as `card.html` beside the command line's build. */
export function cardPage(): Plugin {
  let logLevel: LogLevel = "warn";
  return {
    name: "arcue-card-page",
    apply: "build",
    configResolved(config) {
      logLevel = config.logLevel ?? logLevel;
    },
    async writeBundle(options) {
      await writeFile(join(options.dir ?? "dist", "card.html"), await buildCardPage(logLevel));
    },
  };
}
