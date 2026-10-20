import type { Arch, Version } from "./layout.ts";
import { debianArch, PRODUCT } from "./layout.ts";

/** Where the package installs the app. `/usr/bin/arcue` links to the command in its `bin` folder. */
export const DEB_APP_DIR = `/usr/lib/${PRODUCT.packageName}`;

/** The icon sizes in `assets/branding/png` that go into the hicolor theme. */
export const DEB_ICON_SIZES = [16, 24, 32, 48, 64, 128, 256, 512] as const;

/**
 * What Electron needs on Debian and Ubuntu. Ubuntu 24.04 and Debian 13 renamed some libraries with a t64 suffix, so
 * those depend on either name.
 */
export const DEB_DEPENDS = [
  "libasound2 | libasound2t64",
  "libatk-bridge2.0-0 | libatk-bridge2.0-0t64",
  "libatk1.0-0 | libatk1.0-0t64",
  "libc6 (>= 2.28)",
  "libcups2 | libcups2t64",
  "libdrm2",
  "libgbm1",
  "libgtk-3-0 | libgtk-3-0t64",
  "libnspr4",
  "libnss3",
  "libxcomposite1",
  "libxdamage1",
  "libxfixes3",
  "libxkbcommon0",
  "libxrandr2",
  "xdg-utils",
] as const;

/** Breaks text into lines of at most `width` characters, at spaces. */
export function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** The package's `DEBIAN/control`. */
export function debianControl(version: Version, arch: Arch, installedKiB: number): string {
  return lines([
    `Package: ${PRODUCT.packageName}`,
    `Version: ${version.debian}`,
    `Architecture: ${debianArch(arch)}`,
    `Maintainer: ${PRODUCT.name} <${PRODUCT.homepage}/issues>`,
    `Installed-Size: ${Math.max(1, Math.ceil(installedKiB))}`,
    `Depends: ${DEB_DEPENDS.join(", ")}`,
    "Section: graphics",
    "Priority: optional",
    `Homepage: ${PRODUCT.homepage}`,
    `Description: ${PRODUCT.summary}`,
    ...wrap(PRODUCT.description, 78).map((line) => ` ${line}`),
  ]);
}

/** The menu entry, `/usr/share/applications/arcue.desktop`. */
export function desktopEntry(): string {
  return lines([
    "[Desktop Entry]",
    "Type=Application",
    `Name=${PRODUCT.name}`,
    `Comment=${PRODUCT.summary}`,
    `Exec=${DEB_APP_DIR}/${PRODUCT.name} %F`,
    `Icon=${PRODUCT.packageName}`,
    "Terminal=false",
    "Categories=Graphics;3DGraphics;Development;",
    `StartupWMClass=${PRODUCT.name}`,
  ]);
}

/** The holder in a license's copyright line: "2026 The Arcue Authors" in "Copyright (c) 2026 The Arcue Authors". */
export function copyrightHolder(license: string): string {
  const holder = /^[ \t]*Copyright[ \t]+(?:\(c\)|©)?[ \t]*(\S.*?)[ \t]*\r?$/im.exec(license)?.[1];
  if (!holder) throw new Error("The license has no copyright line, such as Copyright (c) 2026 The Arcue Authors.");
  return holder;
}

/**
 * `/usr/share/doc/arcue/copyright`, in Debian's machine-readable format. The first paragraph covers Electron's runtime,
 * and a later one, which wins, gives Arcue's own files the license's holder and text.
 */
export function debianCopyright(license: string): string {
  const text = license
    .replaceAll("\r\n", "\n")
    .trim()
    .split("\n")
    .map((line) => (line.trim() === "" ? " ." : ` ${line}`));
  const app = DEB_APP_DIR.slice(1);
  return lines([
    "Format: https://www.debian.org/doc/packaging-manuals/copyright-format/1.0/",
    `Upstream-Name: ${PRODUCT.name}`,
    `Source: ${PRODUCT.homepage}`,
    "",
    "Files: *",
    "Copyright: Electron contributors, The Chromium Authors and others",
    "License: other",
    ` The Electron runtime. Its licenses are in ${DEB_APP_DIR}/LICENSE and`,
    ` ${DEB_APP_DIR}/LICENSES.chromium.html.`,
    "",
    "Files: usr/bin/arcue",
    ` ${app}/bin/*`,
    ` ${app}/resources/*`,
    " usr/share/*",
    `Copyright: ${copyrightHolder(license)}`,
    "Comment: Includes bundled libraries and fonts under their own licenses.",
    "License: MIT",
    ...text,
  ]);
}

function lines(values: readonly string[]): string {
  return `${values.join("\n")}\n`;
}
