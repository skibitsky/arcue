import { fileURLToPath } from "node:url";
import { assemblePlugin } from "../src/assemble.ts";

const fromRoot = (path: string) => fileURLToPath(new URL(`../../../${path}`, import.meta.url));
const out = fromRoot("apps/plugin/dist");

await assemblePlugin(
  {
    skill: fromRoot("skills/arcue"),
    cli: fromRoot("apps/cli/dist"),
    readme: fromRoot("apps/plugin/README.md"),
    license: fromRoot("LICENSE"),
  },
  out,
);
console.log(`Built the plugin and its marketplace in ${out}.`);
