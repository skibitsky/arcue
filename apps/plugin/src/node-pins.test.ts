import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { NODE_ARCHIVES, NODE_MAJOR, NODE_PINS_FILE, parseNodePins, pinsFromShasums } from "./node-pins";

const fromRoot = (path: string) => fileURLToPath(new URL(`../../../${path}`, import.meta.url));
const read = (path: string) => readFile(fromRoot(path), "utf8");

const SHASUMS = `cbb1d625fbfa61b23fd4a949ea41c9b08bb7905fbc75403bb11d4bcca73a5566  node-v24.22.0-aix-ppc64.tar.gz
3161e384f52d95e80bbc85c7ec6fe675528790647b7a3ec71e6ea6d53ce66b29  node-v24.22.0-arm64.msi
6a9724d9b50a5f22b4816cded441b5a8d9ddae546191a5e5b7efa5a5e2ee26d5  node-v24.22.0-darwin-arm64.tar.gz
75ddfb875bbd868ebe57536f4442225f54dd10f6d2178dd439de869a5c648dc3  node-v24.22.0-darwin-arm64.tar.xz
b890d687983ddc811641f6739c3ce99d2912c58f9e44b68aa25944037b425305  node-v24.22.0-darwin-x64.tar.xz
00e9f08b9057f9f5428387a5ffd496e53f274565b40b144b7ba876700755352a  node-v24.22.0-headers.tar.gz
b7e7991d5407815adfa74a2a9cd4db683552c8ce32ff4a295c22e972849c3f5d  node-v24.22.0-linux-arm64.tar.gz
fef00bb4d36e1c50104a9775a10359beee98f162b4104dd12472c75065c6a143  node-v24.22.0-linux-arm64.tar.xz
1111111111111111111111111111111111111111111111111111111111111111  node-v24.22.0-linux-armv7l.tar.xz
8cba7bbf689a9b58a65e5811146ea8d01e49d07e71f7b8462e4f6ffcd7d2e7fd  node-v24.22.0-linux-ppc64le.tar.gz
a8d2897df6cd50beb83b34f958b2ca32628389225b41841f2b157d83d317a867  node-v24.22.0-linux-x64-musl.tar.xz
28ea0a438de9a13bd7891fd758eee6c7819ee8af5442dfd8d45bd65e56d4228c  node-v24.22.0-linux-x64.tar.gz
cc2f601cee82d9a5a233302fe307abc600727035fd7d2c3a3571755989e95008  node-v24.22.0-linux-x64.tar.xz
905ddb9b5cd66fc537cdeb149fafbe526b95915781a588be96632c01a106bfa5  node-v24.22.0.pkg
43f6bca62fb4a8c2377d4b99dd212f613d95b04c6a0b9013440880197a6eee1d  node-v24.22.0-win-arm64.7z
3a5c209a5bc59e65b3bc0fa13ed5e166a26bd3d55332847f498b76b037408d61  node-v24.22.0-win-arm64.zip
bde54a359b563133baa3338f02d2b0d54e7d9cc7d3a9ef6b33ee72936c12ed2a  node-v24.22.0-win-x64.7z
f9683a19877e12a9b167305c8db71040d812876359de21f0d2e97c3f321f80c3  node-v24.22.0-win-x64.zip
97ebad47ad35da4b59182a5fbe9fad2b1a1836f1042b4833ff5b4b9571175088  node-v24.22.0-x64.msi
ba93f9a70bd86fce3ebbb39ec758501458453467aa92a34a0a3602d1e3fc2b9c  win-x64/node.exe
`;

const committed = () => read(`apps/plugin/launcher/${NODE_PINS_FILE}`);

function pinsFor(version: string): string {
  return NODE_ARCHIVES.map((archive) => `${"a".repeat(64)}  node-v${version}-${archive}\n`).join("");
}

describe("pinsFromShasums", () => {
  it("picks the eight archives from SHASUMS256.txt in order and ignores the rest", async () => {
    expect(pinsFromShasums("24.22.0", SHASUMS)).toBe(await committed());
  });

  it("names the archives a release lacks", () => {
    const shasums = SHASUMS.split("\n")
      .filter((line) => !line.endsWith("win-arm64.zip"))
      .join("\n");

    expect(() => pinsFromShasums("24.22.0", shasums)).toThrow(
      "SHASUMS256.txt for Node 24.22.0 has no node-v24.22.0-win-arm64.zip.",
    );
  });
});

describe("parseNodePins", () => {
  it("rejects pins with CR, mixed versions, short hashes, a missing newline, a ninth line or another major", () => {
    const good = pinsFor("24.1.0");
    expect(parseNodePins(good).version).toBe("24.1.0");

    const lines = good.split("\n");
    const bad = [
      good.replaceAll("\n", "\r\n"),
      [lines[0]?.replace("24.1.0", "24.2.0"), ...lines.slice(1)].join("\n"),
      [lines[0]?.slice(1), ...lines.slice(1)].join("\n"),
      good.slice(0, -1),
      `${good}${lines[0]}\n`,
      pinsFor("26.0.0"),
      [lines[1], lines[0], ...lines.slice(2)].join("\n"),
    ];
    for (const text of bad) expect(() => parseNodePins(text), text).toThrow("pnpm --filter @arcue/plugin pin-node");
  });

  it("keeps the committed pins valid", async () => {
    const pins = parseNodePins(await committed());

    expect(Number(pins.version.split(".")[0])).toBe(NODE_MAJOR);
    expect(pins.sums.size).toBe(8);
  });
});

describe("the Node floor", () => {
  it("keeps the Node floor the same everywhere", async () => {
    const floors = [
      /^floor=(\d+)$/m.exec(await read("apps/plugin/launcher/arcue"))?.[1],
      /set "floor=(\d+)"/.exec(await read("apps/plugin/launcher/arcue-node.cmd"))?.[1],
      /target: "node(\d+)"/.exec(await read("apps/cli/vite.config.ts"))?.[1],
      /^const NODE_MAJOR = (\d+);$/m.exec(await read("apps/cli/src/run.ts"))?.[1],
    ];

    expect(floors).toEqual(floors.map(() => String(NODE_MAJOR)));
    for (const path of ["skills/arcue/SKILL.md", "apps/plugin/README.md", "apps/cli/src/args.ts"]) {
      expect(await read(path), path).toContain(`Node ${NODE_MAJOR} or later`);
    }
  });
});
