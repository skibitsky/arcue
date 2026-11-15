import type { Rolldown } from "vite";
import { describe, expect, it } from "vitest";
import { singlePage } from "./single-page.ts";

type OutputAsset = Rolldown.OutputAsset;
type OutputBundle = Rolldown.OutputBundle;
type OutputChunk = Rolldown.OutputChunk;

function asset(fileName: string, source: string): OutputAsset {
  return { type: "asset", fileName, source } as OutputAsset;
}

function chunk(fileName: string, code: string): OutputChunk {
  return { type: "chunk", fileName, code } as OutputChunk;
}

function inline(files: (OutputAsset | OutputChunk)[]): OutputBundle {
  const bundle: OutputBundle = Object.fromEntries(files.map((file) => [file.fileName, file]));
  const hook = singlePage().generateBundle;
  const run = typeof hook === "function" ? hook : hook?.handler;
  run?.call({} as never, {} as never, bundle, false);
  return bundle;
}

describe("singlePage", () => {
  it("puts the script and styles into the page, escaped so neither ends early", () => {
    const bundle = inline([
      asset(
        "view.html",
        '<head><script type="module" crossorigin src="./assets/view-x.js"></script><link rel="stylesheet" crossorigin href="./assets/view-x.css"></head>',
      ),
      chunk("assets/view-x.js", 'const tag = "</script><!-- x";'),
      asset("assets/view-x.css", "a::after { content: '</style>'; }"),
    ]);

    expect(Object.keys(bundle)).toEqual(["view.html"]);
    const page = bundle["view.html"];
    expect(page?.type === "asset" ? page.source : null).toBe(
      '<head><script type="module">const tag = "<\\/script><\\x21-- x";</script><style>a::after { content: \'<\\/style>\'; }</style></head>',
    );
  });

  it("fails the build when it makes a file the page cannot hold, or a page that does not load a file", () => {
    const page = () => asset("view.html", '<script type="module" src="./assets/view-x.js"></script>');
    expect(() => inline([page(), chunk("assets/view-x.js", ""), asset("assets/font.woff2", "")])).toThrow(
      "The build made assets/font.woff2, which the page cannot hold.",
    );
    expect(() => inline([page(), chunk("assets/other.js", "")])).toThrow("The page does not load assets/other.js.");
  });
});
