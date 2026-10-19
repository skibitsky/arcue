import { fileURLToPath } from "node:url";
import { assemblePlugin } from "../src/assemble.ts";

const fromRoot = (path: string) => fileURLToPath(new URL(`../../../${path}`, import.meta.url));
const out = fromRoot("apps/plugin/dist");

await assemblePlugin(
  {
    skill: fromRoot("skills/arcue"),
    cliBuild: fromRoot("apps/cli/dist"),
    webBuild: fromRoot("apps/web/dist-local"),
    icon: fromRoot("assets/branding/png/arcue-256.png"),
    readme: fromRoot("apps/plugin/README.md"),
    license: fromRoot("LICENSE"),
    launcher: fromRoot("apps/plugin/launcher"),
  },
  out,
);
console.log(`Built the plugin and its marketplace in ${out}.`);
