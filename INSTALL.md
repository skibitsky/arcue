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

In the Claude desktop app, the plugin shows Arcue in the Browser pane next to the conversation. In a terminal, it opens the Arcue desktop app once that app has run: install it as [Desktop app](#desktop-app) describes, and open it once.

## Codex

1. Run:

   ```sh
   codex plugin marketplace add skibitsky/arcue@plugin
   codex plugin add arcue@arcue
   ```

2. Ask the user to start a new thread, so Codex loads the plugin.

In the Codex app, the plugin shows Arcue in the in-app browser. In a terminal, it opens the Arcue desktop app once that app has run: install it as [Desktop app](#desktop-app) describes, and open it once.

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

Open Arcue once after you install it, so the agent plugin can find it and start it later: from the applications menu, with `open -a Arcue` on macOS, or with `Start-Process "$env:LOCALAPPDATA\Programs\Arcue\Arcue.exe"` on Windows. `arcue open <file>` with the app's own command starts it too.

### macOS

```sh
if [ "$(sysctl -n hw.optional.arm64 2>/dev/null)" = 1 ]; then arch=arm64; else arch=x64; fi
dir=$(mktemp -d)
curl -fL -o "$dir/Arcue-mac-$arch.dmg" "https://github.com/skibitsky/arcue/releases/latest/download/Arcue-mac-$arch.dmg"
mkdir "$dir/volume"
copied=no
if hdiutil attach "$dir/Arcue-mac-$arch.dmg" -nobrowse -readonly -mountpoint "$dir/volume"; then
  ditto "$dir/volume/Arcue.app" "$dir/Arcue.app" && copied=yes
  hdiutil detach "$dir/volume"
fi
[ "$copied" = yes ] &&
rm -rf /Applications/Arcue.app &&
mv "$dir/Arcue.app" /Applications/Arcue.app
```

These lines detach the disk image even when the copy fails, and remove an older Arcue only once the new one is out of it, so a failed download or copy leaves the old one in place. A person opens the disk image and drags Arcue to Applications instead. Then ask the user to open Arcue and choose Install arcue Command in the Arcue menu, which links `/usr/local/bin/arcue` to the command in the app and asks for their password when that folder needs it. Until then, `/Applications/Arcue.app/Contents/Resources/bin/arcue` works in its place.

When the release notes say the macOS app is not notarized, macOS refuses to open a copy downloaded in a browser at first. Open System Settings, then Privacy & Security, and choose Open Anyway beside the message about Arcue.

### Windows

In PowerShell:

```powershell
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
$arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
$setup = Join-Path $env:TEMP "Arcue-win-$arch-setup.exe"
Invoke-WebRequest "https://github.com/skibitsky/arcue/releases/latest/download/Arcue-win-$arch-setup.exe" -OutFile $setup -UseBasicParsing
$installer = Start-Process $setup -ArgumentList '/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART' -Wait -PassThru
if ($installer.ExitCode -ne 0) { throw "The setup program exited with $($installer.ExitCode)." }
$env:Path += ";$env:LOCALAPPDATA\Programs\Arcue\bin"
```

The setup program installs Arcue for the user in `%LOCALAPPDATA%\Programs\Arcue`, without administrator rights, and adds its `bin` folder, which holds `arcue.exe`, to the user's PATH. The first three lines stop at the first error and let Windows PowerShell 5.1 download quickly, over TLS 1.2. The last line adds it to PATH in this shell only. A terminal opened from the Start menu has it too, but an app that was already running, such as the one you run in, keeps the old PATH for every shell it starts until it restarts. Until then, run `& "$env:LOCALAPPDATA\Programs\Arcue\bin\arcue.exe"` in place of `arcue`, or `"$LOCALAPPDATA/Programs/Arcue/bin/arcue.exe"` in Git Bash. A person runs the setup program instead, and can clear Add the arcue command to PATH there. Uninstalling Arcue in Settings, under Apps, closes Arcue and any `arcue serve` first, and removes the folder from PATH again.

When the release notes say the Windows app is not signed, SmartScreen warns before a setup program downloaded in a browser runs. Choose More info, then Run anyway.

### Debian and Ubuntu

```sh
arch=$(dpkg --print-architecture)
dir=$(mktemp -d)
curl -fL -o "$dir/Arcue-linux-$arch.deb" "https://github.com/skibitsky/arcue/releases/latest/download/Arcue-linux-$arch.deb"
sudo apt install "$dir/Arcue-linux-$arch.deb"
```

This installs Arcue in `/usr/lib/arcue`, adds it to the applications menu, and links `/usr/bin/arcue` to its command. It needs `sudo`: when you can't run it, give the user these lines. `sudo apt remove arcue` removes all of it.

A fresh Ubuntu or Debian may not have curl. Install it with `sudo apt install curl`, or use `wget -O <file> <url>` in place of `curl -fL -o <file> <url>`.

### Other Linux

```sh
arch=$(uname -m | sed 's/x86_64/x64/; s/aarch64/arm64/')
dir=$(mktemp -d)
curl -fL -o "$dir/Arcue-linux-$arch.tar.gz" "https://github.com/skibitsky/arcue/releases/latest/download/Arcue-linux-$arch.tar.gz"
tar -xzf "$dir/Arcue-linux-$arch.tar.gz" -C "$dir" &&
mkdir -p ~/.local/opt ~/.local/bin &&
rm -rf "$HOME/.local/opt/Arcue-linux-$arch" &&
mv "$dir/Arcue-linux-$arch" ~/.local/opt &&
ln -sf "$HOME/.local/opt/Arcue-linux-$arch/bin/arcue" ~/.local/bin/arcue
```

`~/.local/bin` must be on PATH.

On systems that limit unprivileged user namespaces, such as Ubuntu 24.04, Electron's sandbox needs its helper, `chrome-sandbox`, to belong to root and be setuid, so Arcue does not start from `~/.local` and says the SUID sandbox helper is not configured correctly. Don't change the helper in `~/.local`: the user owns that folder, so a program running as the user could swap the helper for a link first and have another file made setuid root. On Debian and Ubuntu, install the `.deb` instead. Elsewhere, install Arcue in `/opt`. There, root makes the folder and every file in it, so no one else can replace the helper before root makes it setuid. When you can't run `sudo`, give the user these lines:

```sh
arch=$(uname -m | sed 's/x86_64/x64/; s/aarch64/arm64/')
app=/opt/Arcue-linux-$arch
sudo rm -rf "$app.new" &&
sudo mkdir -m 755 "$app.new" &&
curl -fL "https://github.com/skibitsky/arcue/releases/latest/download/Arcue-linux-$arch.tar.gz" | sudo tar -xz --strip-components=1 -C "$app.new" &&
sudo chmod 4755 "$app.new/chrome-sandbox" &&
sudo rm -rf "$app" &&
sudo mv "$app.new" "$app" &&
sudo ln -sf "$app/bin/arcue" /usr/local/bin/arcue
```

With the `.deb` or in `/opt`, remove the copy in `~/.local`, whose `arcue` PATH may find first: `rm -rf ~/.local/bin/arcue ~/.local/opt/Arcue-linux-*`.

### Upgrade

Arcue does not update itself yet. To upgrade it, install the newer release the same way. On Windows, the setup program replaces the old version, and closes Arcue and any `arcue serve` first. Elsewhere, quit Arcue and stop any `arcue serve` you started before you upgrade. On macOS, the `/usr/local/bin/arcue` link keeps working. When `rm` says Operation not permitted, macOS keeps the terminal from changing apps: ask the user to open the disk image, drag Arcue to Applications and choose Replace. `apt install` of the newer `.deb` upgrades the old one. For a tarball, run all of its lines again. They replace the old folder once the new one is extracted, since extracting over it keeps files that only the old build has, and in `/opt` they make the new helper setuid. To upgrade by hand, remove the old folder first, with `sudo` in `/opt`.

### Check a download

Each release lists the SHA-256 checksums of its files in `SHA256SUMS.txt`, and GitHub keeps a build provenance attestation for each file, which proves that the Release workflow built it from this repository. The install lines save the file under its name in the release, in a new folder `$dir`, or in `%TEMP%` on Windows. To check it before you install it, run these lines after the `curl` line, in the same shell or command, since they use `$dir`, and run the rest only when they pass:

```sh
curl -fL -o "$dir/SHA256SUMS.txt" https://github.com/skibitsky/arcue/releases/latest/download/SHA256SUMS.txt &&
(cd "$dir" && shasum -a 256 --check --ignore-missing SHA256SUMS.txt) &&
gh attestation verify "$dir"/Arcue-* --repo skibitsky/arcue --signer-workflow skibitsky/arcue/.github/workflows/release.yml
```

On Linux, use `sha256sum` in place of `shasum -a 256`. The last line needs the GitHub CLI, signed in. Without it, run only the lines before it, without their last `&&`, or in PowerShell all but the last two. To check the tarball for `/opt`, download it as the `~/.local` lines do, check it, and run the `/opt` lines with `sudo tar -xzf "$dir/Arcue-linux-$arch.tar.gz" --strip-components=1 -C "$app.new" &&` in place of the `curl` line. In PowerShell, after `Invoke-WebRequest`:

```powershell
$arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
$setup = Join-Path $env:TEMP "Arcue-win-$arch-setup.exe"
$sums = Join-Path $env:TEMP 'SHA256SUMS.txt'
Invoke-WebRequest 'https://github.com/skibitsky/arcue/releases/latest/download/SHA256SUMS.txt' -OutFile $sums -UseBasicParsing
$want = (Get-Content -LiteralPath $sums | Where-Object { $_.EndsWith(" Arcue-win-$arch-setup.exe") }) -replace ' .*'
if ((Get-FileHash -LiteralPath $setup -Algorithm SHA256).Hash -ne $want) { throw "$setup does not match SHA256SUMS.txt." }
gh attestation verify $setup --repo skibitsky/arcue --signer-workflow skibitsky/arcue/.github/workflows/release.yml
if ($LASTEXITCODE -ne 0) { throw "gh could not verify $setup." }
```
