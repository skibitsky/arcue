# Set up Arcue

These steps are for an AI agent that sets up Arcue for its user. People can follow them too.

Arcue is an app for reviewing 3D models and animations with an AI agent. The user comments on the model, and the agent gets the exact vertices, bones, frame, camera and a screenshot. The [README](README.md) has the full picture.

## Pick your host

| You run in | Go to |
|---|---|
| Claude Code, in a terminal or the Code tab of the Claude desktop app | [Claude Code](#claude-code) |
| Codex, in a terminal or the Codex app | [Codex](#codex) |
| Any other agent | [Other agents](#other-agents) |
| Only the desktop app and its `arcue` command | [Desktop app](#desktop-app) |

## Claude Code

1. Run:

   ```sh
   claude plugin marketplace add skibitsky/arcue#plugin
   claude plugin install arcue@arcue
   ```

   If `claude` is not on your PATH, give the user these two commands to run in a terminal.
2. Plugins load when a session starts. Ask the user to start a new session.

In the Claude desktop app, the plugin shows Arcue in the Browser pane next to the conversation. In a terminal, it opens the Arcue desktop app, which [Desktop app](#desktop-app) installs.

## Codex

1. Run:

   ```sh
   codex plugin marketplace add skibitsky/arcue@plugin
   codex plugin add arcue@arcue
   ```

2. Ask the user to start a new thread, so Codex loads the plugin.

In the Codex app, the plugin shows Arcue in the in-app browser. In a terminal, it opens the Arcue desktop app, which [Desktop app](#desktop-app) installs.

## Other agents

1. Install the Arcue skill. If it asks which agents to install it for, pick yourself.

   ```sh
   npx skills add skibitsky/arcue
   ```

2. Install the Arcue desktop app as [Desktop app](#desktop-app) describes, and tell the user to paste each round of comments to you.
3. Check that `arcue help` runs. The skill uses the `arcue` command to open models in the app and to inspect files, in bash, zsh, Git Bash or PowerShell.

## Desktop app

The desktop app shows models in its own window and installs the `arcue` command, which runs on the app's own Node. Skip this when `arcue help` already runs, and ask the user before you install it. Each release has these files, and `https://github.com/skibitsky/arcue/releases/latest/download/<file>` downloads the latest:

| Computer | File |
|---|---|
| Mac with Apple silicon | `Arcue-mac-arm64.dmg` |
| Mac with an Intel processor | `Arcue-mac-x64.dmg` |
| Windows on x64 | `Arcue-win-x64-setup.exe` |
| Windows on Arm | `Arcue-win-arm64-setup.exe` |
| Debian or Ubuntu | `Arcue-linux-amd64.deb`, or `Arcue-linux-arm64.deb` on Arm |
| Other Linux | `Arcue-linux-x64.tar.gz`, or `Arcue-linux-arm64.tar.gz` on Arm |

Arcue needs macOS 13 or later, Windows 10 or later, or a 64-bit Linux desktop.

### macOS

```sh
if [ "$(sysctl -n hw.optional.arm64 2>/dev/null)" = 1 ]; then arch=arm64; else arch=x64; fi
curl -fL -o /tmp/Arcue.dmg "https://github.com/skibitsky/arcue/releases/latest/download/Arcue-mac-$arch.dmg"
hdiutil attach /tmp/Arcue.dmg -nobrowse -mountpoint /tmp/Arcue-dmg
ditto /tmp/Arcue-dmg/Arcue.app /Applications/Arcue.app
hdiutil detach /tmp/Arcue-dmg
```

A person opens the disk image and drags Arcue to Applications instead. Then ask the user to open Arcue and choose Install arcue Command in the Arcue menu, which links `/usr/local/bin/arcue` to the command in the app and asks for their password when that folder needs it. Until then, `/Applications/Arcue.app/Contents/Resources/bin/arcue` works in its place.

When the release notes say the macOS app is not notarized, macOS refuses to open a copy downloaded in a browser at first. Open System Settings, then Privacy & Security, and choose Open Anyway beside the message about Arcue.

### Windows

In PowerShell:

```powershell
$arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
$setup = Join-Path $env:TEMP 'Arcue-setup.exe'
Invoke-WebRequest "https://github.com/skibitsky/arcue/releases/latest/download/Arcue-win-$arch-setup.exe" -OutFile $setup
Start-Process $setup -ArgumentList '/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART' -Wait
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
```

The setup program installs Arcue for the user in `%LOCALAPPDATA%\Programs\Arcue`, without administrator rights, and adds its `bin` folder, which holds `arcue.exe`, to the user's PATH. The last line updates PATH in this shell; new terminals have it already. A person runs the setup program instead, and can clear Add the arcue command to PATH there. Uninstalling Arcue in Settings, under Apps, removes the folder from PATH again.

When the release notes say the Windows app is not signed, SmartScreen warns before a setup program downloaded in a browser runs. Choose More info, then Run anyway.

### Debian and Ubuntu

```sh
curl -fL -o /tmp/arcue.deb "https://github.com/skibitsky/arcue/releases/latest/download/Arcue-linux-$(dpkg --print-architecture).deb"
sudo apt install /tmp/arcue.deb
```

This installs Arcue in `/usr/lib/arcue`, adds it to the applications menu, and links `/usr/bin/arcue` to its command. It needs `sudo`: when you can't run it, give the user the second line. `sudo apt remove arcue` removes all of it.

### Other Linux

```sh
arch=$(uname -m | sed 's/x86_64/x64/; s/aarch64/arm64/')
mkdir -p ~/.local/opt ~/.local/bin
curl -fL "https://github.com/skibitsky/arcue/releases/latest/download/Arcue-linux-$arch.tar.gz" | tar -xz -C ~/.local/opt
ln -sf ~/.local/opt/Arcue-linux-$arch/bin/arcue ~/.local/bin/arcue
```

`~/.local/bin` must be on PATH. On systems that limit unprivileged user namespaces, such as Ubuntu 24.04, Electron's sandbox needs its helper to belong to root: ask the user to run `sudo chown root:root chrome-sandbox && sudo chmod 4755 chrome-sandbox` in `~/.local/opt/Arcue-linux-<arch>`.

### Check a download

Each release lists the SHA-256 checksums of its files in `SHA256SUMS.txt`, and GitHub keeps a build provenance attestation for each file, which proves that the Release workflow built it from this repository:

```sh
shasum -a 256 --check --ignore-missing SHA256SUMS.txt
gh attestation verify Arcue-mac-arm64.dmg --repo skibitsky/arcue
```
