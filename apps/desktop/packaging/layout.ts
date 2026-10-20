export type Platform = "darwin" | "win32" | "linux";
export type Arch = "x64" | "arm64";

export const PRODUCT = {
  name: "Arcue",
  packageName: "arcue",
  bundleId: "app.arcue.desktop",
  homepage: "https://github.com/skibitsky/arcue",
  summary: "Review 3D models and animations with AI coding agents",
  description:
    "Arcue is a desktop app for reviewing 3D models and animations and handing the feedback to an AI coding agent. It includes the arcue command line.",
} as const;

export function parsePlatform(value: string): Platform {
  if (value === "darwin" || value === "win32" || value === "linux") return value;
  throw new Error(`Unsupported desktop platform: ${value}`);
}

export function parseArch(value: string): Arch {
  if (value === "arm64" || value === "x64") return value;
  throw new Error(`Unsupported desktop architecture: ${value}`);
}

export interface Version {
  /** As in package.json, such as "1.2.0" or "1.3.0-beta.2". */
  full: string;
  /** Only the numbers, such as "1.3.0", for version fields that take nothing else. */
  numeric: string;
  prerelease: boolean;
  /** The Debian form, which sorts a prerelease before its release: "1.3.0~beta.2". */
  debian: string;
}

const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z]+(?:\.(?:0|[1-9]\d*))?))?$/;

/**
 * A release version: three numbers and at most a prerelease of a word and a number, such as beta or beta.2. The
 * Windows app's version fields read each part between dots as a number, so a second word, as in beta.rc1, cannot go
 * there.
 */
export function parseVersion(value: string): Version {
  const match = VERSION.exec(value);
  if (!match) {
    throw new Error(
      `"${value}" is not a release version such as 1.2.0, 1.3.0-beta or 1.3.0-beta.2, whose prerelease is a word and at most one number.`,
    );
  }
  const numeric = `${match[1]}.${match[2]}.${match[3]}`;
  const prerelease = match[4];
  return {
    full: value,
    numeric,
    prerelease: prerelease !== undefined,
    debian: prerelease === undefined ? numeric : `${numeric}~${prerelease}`,
  };
}

/** The version a release tag names, which must be the desktop app's version. */
export function versionOfTag(tag: string, appVersion: string): Version {
  const version = parseVersion(appVersion);
  if (tag !== `v${version.full}`) {
    throw new Error(`The tag ${tag} does not name the desktop app's version, ${version.full}: tag v${version.full}.`);
  }
  return version;
}

/** The folder @electron/packager writes in `out/`. */
export function packagedFolder(platform: Platform, arch: Arch): string {
  return `${PRODUCT.name}-${platform}-${arch}`;
}

export interface AppLayout {
  /** The app's own program, relative to the packaged folder. */
  executable: string;
  /** Where the command line goes, relative to the packaged folder. */
  cli: string;
  /** The `arcue` command, relative to the packaged folder. */
  command: string;
}

/** Where things are in the packaged app. The launchers in `packaging/` look for them there. */
export function appLayout(platform: Platform): AppLayout {
  if (platform === "darwin") {
    const contents = `${PRODUCT.name}.app/Contents`;
    return {
      executable: `${contents}/MacOS/${PRODUCT.name}`,
      cli: `${contents}/Resources/cli`,
      command: `${contents}/Resources/bin/arcue`,
    };
  }
  return {
    executable: platform === "win32" ? `${PRODUCT.name}.exe` : PRODUCT.name,
    cli: "resources/cli",
    command: platform === "win32" ? "bin/arcue.exe" : "bin/arcue",
  };
}

export function debianArch(arch: Arch): string {
  return arch === "x64" ? "amd64" : "arm64";
}

export interface Installer {
  kind: "dmg" | "setup" | "deb" | "tar";
  file: string;
}

/**
 * The files a release has for a platform and architecture. Their names leave out the version, so that
 * `releases/latest/download/<file>` always finds the latest one.
 */
export function installers(platform: Platform, arch: Arch): Installer[] {
  switch (platform) {
    case "darwin":
      return [{ kind: "dmg", file: `${PRODUCT.name}-mac-${arch}.dmg` }];
    case "win32":
      return [{ kind: "setup", file: `${PRODUCT.name}-win-${arch}-setup.exe` }];
    case "linux":
      return [
        { kind: "deb", file: `${PRODUCT.name}-linux-${debianArch(arch)}.deb` },
        { kind: "tar", file: `${PRODUCT.name}-linux-${arch}.tar.gz` },
      ];
  }
}
