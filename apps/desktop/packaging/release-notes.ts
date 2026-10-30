import type { Arch, Installer, Platform } from "./layout.ts";
import { installers } from "./layout.ts";

/** Which computer each release file is for, in the order the install table lists them. */
const DOWNLOADS: { computer: string; platform: Platform; arch: Arch; kind: Installer["kind"] }[] = [
  { computer: "Mac with Apple silicon", platform: "darwin", arch: "arm64", kind: "dmg" },
  { computer: "Mac with an Intel processor", platform: "darwin", arch: "x64", kind: "dmg" },
  { computer: "Windows on x64", platform: "win32", arch: "x64", kind: "setup" },
  { computer: "Windows on Arm", platform: "win32", arch: "arm64", kind: "setup" },
  { computer: "Debian or Ubuntu on x64", platform: "linux", arch: "x64", kind: "deb" },
  { computer: "Debian or Ubuntu on Arm", platform: "linux", arch: "arm64", kind: "deb" },
  { computer: "Other Linux on x64", platform: "linux", arch: "x64", kind: "tar" },
  { computer: "Other Linux on Arm", platform: "linux", arch: "arm64", kind: "tar" },
];

export interface ReleaseNotesInput {
  /** The repository, as owner/name. */
  repository: string;
  tag: string;
  /** What the release brings, in Markdown, from `release-notes/<version>.md`. */
  summary: string;
  /** Whether both macOS apps are signed with a Developer ID and notarized. */
  macNotarized: boolean;
  /** Whether both Windows setup programs are signed. */
  windowsSigned: boolean;
  /** Whether the release becomes the latest one, which INSTALL.md's commands download. */
  latest: boolean;
}

/** The notes the Release workflow puts above GitHub's list of the release's pull requests. */
export function releaseNotes({
  repository,
  tag,
  summary,
  macNotarized,
  windowsSigned,
  latest,
}: ReleaseNotesInput): string {
  if (!summary.trim()) throw new Error(`The summary of ${tag} is empty.`);
  const site = `https://github.com/${repository}`;
  const rows = DOWNLOADS.map(({ computer, platform, arch, kind }) => {
    const file = installers(platform, arch).find((installer) => installer.kind === kind)?.file;
    if (!file) throw new Error(`No ${kind} installer for ${platform} ${arch}.`);
    return `| ${computer} | [${file}](${site}/releases/download/${tag}/${file}) |`;
  });
  const firstLaunch = [
    ...(macNotarized
      ? []
      : ["- macOS: the app isn't notarized. Open System Settings > Privacy & Security and choose Open Anyway."]),
    ...(windowsSigned
      ? []
      : ["- Windows: the setup program isn't signed. In the SmartScreen warning, choose More info > Run anyway."]),
  ];
  return [
    summary.trim(),
    "",
    "## Install",
    "",
    "| Computer | File |",
    "|---|---|",
    ...rows,
    "",
    latest
      ? `[INSTALL.md](${site}/blob/${tag}/INSTALL.md#desktop-app) has the steps for each computer, or ask your agent: \`Set up Arcue for me: ${site}/blob/main/INSTALL.md\`.`
      : `[INSTALL.md](${site}/blob/${tag}/INSTALL.md#desktop-app) has the steps for each computer, but its commands download the latest release: use the files above for this one.`,
    "The macOS, Windows and Debian installers put the `arcue` command on PATH; on macOS, choose Arcue > Install arcue Command. For a tarball, INSTALL.md shows how to link it.",
    ...(firstLaunch.length > 0 ? ["", "The first time you open it:", "", ...firstLaunch] : []),
    "",
    "## Verify a download",
    "",
    `\`SHA256SUMS.txt\` lists the SHA-256 checksum of every file, and \`gh attestation verify <file> --repo ${repository} --signer-workflow ${repository}/.github/workflows/release.yml\` proves that the Release workflow built it.`,
    "",
  ].join("\n");
}
