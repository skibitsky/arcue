import { cpSync } from "node:fs";

cpSync(new URL("../vendor/", import.meta.url), new URL("../dist/vendor/", import.meta.url), { recursive: true });
