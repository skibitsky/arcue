import type { Plugin } from "vite";

/**
 * Puts the build's script and styles into its page, so the page is one file, as an app that shows MCP Apps renders it
 * without fetching anything. Anything else the build makes fails it.
 */
export function singlePage(): Plugin {
  return {
    name: "arcue-single-page",
    apply: "build",
    enforce: "post",
    generateBundle(_options, bundle) {
      const pages = Object.values(bundle).filter((file) => file.type === "asset" && file.fileName.endsWith(".html"));
      const page = pages[0];
      if (pages.length !== 1 || page?.type !== "asset") throw new Error("The build must make exactly one page.");
      let html = typeof page.source === "string" ? page.source : new TextDecoder().decode(page.source);
      for (const file of Object.values(bundle)) {
        if (file === page) continue;
        const name = file.fileName.replaceAll(".", "\\.");
        if (file.type === "chunk") {
          const code = file.code.replace(/<\/(script)/gi, "<\\/$1").replaceAll("<!--", "<\\x21--");
          const tag = new RegExp(`<script type="module"[^>]*src="\\./${name}"[^>]*></script>`);
          html = replaceOnce(html, tag, `<script type="module">${code}</script>`, file.fileName);
        } else if (file.fileName.endsWith(".css")) {
          const source = typeof file.source === "string" ? file.source : new TextDecoder().decode(file.source);
          const tag = new RegExp(`<link rel="stylesheet"[^>]*href="\\./${name}"[^>]*>`);
          html = replaceOnce(html, tag, `<style>${source.replace(/<\/(style)/gi, "<\\/$1")}</style>`, file.fileName);
        } else {
          throw new Error(`The build made ${file.fileName}, which the page cannot hold.`);
        }
        delete bundle[file.fileName];
      }
      page.source = html;
    },
  };
}

function replaceOnce(html: string, tag: RegExp, replacement: string, fileName: string): string {
  if (!tag.test(html)) throw new Error(`The page does not load ${fileName}.`);
  return html.replace(tag, () => replacement);
}
