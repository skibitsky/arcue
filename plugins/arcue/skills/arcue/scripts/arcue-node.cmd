@echo off
rem Published as arcue-node.cmd, which prints the path of a Node 24 or later to run arcue.js with, and as
rem arcue-setup.cmd, which downloads the pinned Node. Neither reads its arguments: cmd.exe would parse them.
setlocal EnableExtensions DisableDelayedExpansion
set "NoDefaultCurrentDirectoryInExePath=1"
set "NODE_OPTIONS="
set "here=%~dp0"
set "mode=%~n0"
set "pathnode="
pushd "%~dp0" && (
  for %%I in (node.exe) do set "pathnode=%%~$PATH:I"
  popd
)
set amp=^&
setlocal EnableDelayedExpansion

set "floor=24"
set "scripts=!here:~0,-1!"
set "pins=!here!node-sha256sums.txt"
set "setup="
if /i "!mode!"=="arcue-setup" set "setup=1"
set "stage="
if not exist "!here!arcue.js" (
  set "msg=Reinstall the Arcue plugin: there is no arcue.js in !scripts!."
  goto :fail1
)
if not defined SystemRoot (
  set "msg=SystemRoot is not set."
  goto :fail1
)
set "sys=!SystemRoot!\System32"

set "found=there is none on PATH"
if not defined pathnode goto :cache
set "probe=!pathnode!"
call :probe
set "found=node on PATH (!pathnode!) does not run"
if defined got set "found=node on PATH is !got!"
call :new_enough || goto :cache
if not defined setup (
  set "node=!pathnode!"
  goto :print
)
set "msg=Node !got! on PATH (!pathnode!) runs Arcue, so setup has nothing to download."
goto :done0

:cache
set "arch="
if /i "!PROCESSOR_ARCHITECTURE!"=="AMD64" set "arch=x64"
if /i "!PROCESSOR_ARCHITEW6432!"=="AMD64" set "arch=x64"
if /i "!PROCESSOR_ARCHITECTURE!"=="ARM64" set "arch=arm64"
if /i "!PROCESSOR_ARCHITEW6432!"=="ARM64" set "arch=arm64"
if defined PROCESSOR_IDENTIFIER if /i "!PROCESSOR_IDENTIFIER:~0,5!"=="ARMv8" set "arch=arm64"
if defined arch goto :pins
if defined setup (
  set "msg=There is no Node download for 32-bit Windows. Install Node !floor! or later and put it on PATH."
  goto :fail1
)
set "msg=Arcue needs Node !floor! or later, and !found!. Install Node !floor! or later and put it on PATH: there is no Node download for 32-bit Windows."
goto :fail3

:pins
set "pinline="
set "version="
if not exist "!pins!" goto :damaged
for /f "usebackq tokens=2" %%N in ("!pins!") do if not defined pinline set "pinline=%%N"
if not defined pinline goto :damaged
for /f "tokens=2 delims=-" %%V in ("!pinline!") do set "version=%%V"
if not defined version goto :damaged
if not "!version:~0,1!"=="v" goto :damaged
set "version=!version:~1!"
if not defined version goto :damaged
set "bad="
for /f "delims=0123456789." %%X in ("!version!") do set "bad=1"
if defined bad goto :damaged

if defined ARCUE_RUNTIME_DIR goto :root_from_env
if not defined LOCALAPPDATA (
  set "msg=LOCALAPPDATA is not set. Set ARCUE_RUNTIME_DIR to a folder for Arcue's Node."
  goto :fail1
)
set "root=!LOCALAPPDATA!\Arcue\runtime"
goto :root_set
:root_from_env
set "root=!ARCUE_RUNTIME_DIR:/=\!"
set "unquoted=!root:"=!"
if not "!unquoted!"=="!root!" goto :bad_root
if "!root:~1,2!"==":\" goto :root_set
if "!root:~0,2!"=="\\" goto :root_set
:bad_root
set "msg=ARCUE_RUNTIME_DIR must be an absolute path without quotes, got "!ARCUE_RUNTIME_DIR!"."
goto :fail1
:root_set
if "!root:~-1!"=="\" set "root=!root:~0,-1!"
set "install=!root!\node-v!version!-win-!arch!"
set "pinned=!install!\node.exe"
set "src=nodejs.org"
if defined ARCUE_NODE_MIRROR set "src=the mirror in ARCUE_NODE_MIRROR"
if defined setup goto :setup

set "node="
if exist "!pinned!" (
  set "probe=!pinned!"
  call :probe
  call :new_enough && set "node=!pinned!"
)
if defined node goto :print
for /d %%D in ("!root!\node-v*-win-!arch!") do if not defined node (
  set "probe=!root!\%%~nxD\node.exe"
  if exist "!probe!" (
    call :probe
    call :new_enough && set "node=!probe!"
  )
)
if defined node goto :print
if exist "!pinned!" goto :missing_broken
set "msg=Arcue needs Node !floor! or later, and !found!. Ask the user before you run !amp! "!scripts!\arcue-setup.cmd" in PowerShell: it downloads Node !version! from !src! (about 35 MB) into !root!, once. Nothing was downloaded."
goto :fail3
:missing_broken
set "msg=Arcue needs Node !floor! or later, and !found!. The Node in !install! does not run. Ask the user before you run !amp! "!scripts!\arcue-setup.cmd" again in PowerShell: it downloads Node !version! from !src! again (about 35 MB) and replaces it."
goto :fail3

:print
setlocal DisableDelayedExpansion
for %%F in ("%node%") do echo(%%~sF
exit /b 0

:setup
if exist "!pinned!" (
  set "probe=!pinned!"
  call :probe
  if "!got!"=="v!version!" (
    set "msg=Node !version! for Arcue is already set up in !install!."
    goto :done0
  )
)
set "tools=1"
if not exist "!sys!\curl.exe" set "tools="
if not exist "!sys!\tar.exe" set "tools="
if not exist "!sys!\certutil.exe" set "tools="
if not defined tools (
  set "msg=Setup needs curl.exe, tar.exe and certutil.exe, which Windows has since Windows 10 version 1803."
  goto :fail1
)
set "file=node-v!version!-win-!arch!.zip"
set "sha="
for /f "usebackq tokens=1,2" %%A in ("!pins!") do if "%%B"=="!file!" set "sha=%%A"
if not defined sha goto :damaged
if "!sha:~63,1!"=="" goto :damaged
if not "!sha:~64!"=="" goto :damaged
set "bad="
for /f "delims=0123456789abcdef" %%X in ("!sha!") do set "bad=1"
if defined bad goto :damaged

set "mirror=https://nodejs.org/dist"
if defined ARCUE_NODE_MIRROR set "mirror=!ARCUE_NODE_MIRROR!"
set "unquoted=!mirror:"=!"
if not "!unquoted!"=="!mirror!" goto :bad_mirror
if "!mirror:~-1!"=="/" set "mirror=!mirror:~0,-1!"
set "scheme="
if "!mirror:~0,8!"=="https://" set "scheme=https"
if "!mirror:~0,7!"=="http://" set "scheme=http"
if defined scheme goto :mirror_set
:bad_mirror
set "msg=ARCUE_NODE_MIRROR must start with https:// or http:// and have no quotes."
goto :fail1
:mirror_set

if not exist "!root!\" mkdir "!root!" >nul 2>&1
if not exist "!root!\" goto :no_write
set "nopercent=!root:%%=!"
if "!nopercent!"=="!root!" "!sys!\forfiles.exe" /p "!root!" /m .setup-* /d -2 /c "cmd /d /c if @isdir==TRUE rd /s /q @path" >nul 2>&1
for /l %%N in (1,1,100) do if not defined stage (
  set "try=!root!\.setup-!TIME:~-2!!RANDOM!!RANDOM!"
  mkdir "!try!" >nul 2>&1 && set "stage=!try!"
)
if not defined stage goto :no_write

set "archive=!stage!\!file!"
set "url=!mirror!/v!version!/!file!"
>&2 echo(Downloading !file! from !src!
"!sys!\curl.exe" --fail --location --silent --show-error --proto "=!scheme!" --proto-redir "=https,!scheme!" --max-filesize 104857600 --connect-timeout 30 --speed-limit 1024 --speed-time 60 --retry 2 --output "!archive!" "!url!" || (
  set "msg=Could not download !file! from !src!, as curl.exe says above. Setup needs network access: when commands run in a sandbox, allow this one. Behind a proxy, set HTTPS_PROXY, or set ARCUE_NODE_MIRROR to a mirror of nodejs.org/dist."
  goto :fail1
)
set "actual="
for /f "delims=" %%H in ('""%%sys%%\certutil.exe" -hashfile "%%archive%%" SHA256" 2^>nul') do (
  set "line=%%H"
  call :hash_line
)
if /i not "!actual!"=="!sha!" (
  set "msg=!file! from !src! does not match the SHA-256 checksum the Arcue plugin pins, so setup deleted it. Expected !sha!, got !actual!. Run setup again; if it fails again, the mirror or a proxy changes the file."
  goto :fail1
)
set "member=node-v!version!-win-!arch!/node.exe"
"!sys!\tar.exe" -xof "!archive!" -C "!stage!" "!member!" || (
  set "msg=Could not unpack !member! from !file!, as tar.exe says above."
  goto :fail1
)
set "unpacked=!stage!\node-v!version!-win-!arch!\node.exe"
if not exist "!unpacked!" (
  set "msg=!file! has no !member!."
  goto :fail1
)
set "probe=!unpacked!"
call :probe
if not "!got!"=="v!version!" (
  set "msg=The Node that setup downloaded does not run here. A policy may block programs in !root!: set ARCUE_RUNTIME_DIR to a folder where they may run, or install Node !floor! or later and put it on PATH."
  goto :fail1
)
if not exist "!install!\" mkdir "!install!" >nul 2>&1
set "moved="
for /l %%N in (1,1,3) do if not defined moved (
  move /y "!unpacked!" "!pinned!" >nul 2>&1 && set "moved=1"
  if not defined moved "!sys!\ping.exe" -n 2 127.0.0.1 >nul
)
set "probe=!pinned!"
call :probe
if not "!got!"=="v!version!" (
  set "msg=Cannot install Node as !pinned!."
  goto :fail1
)
for /d %%D in ("!root!\node-v*-win-!arch!") do if /i not "%%~nxD"=="node-v!version!-win-!arch!" rd /s /q "!root!\%%~nxD" >nul 2>&1
rd /s /q "!stage!" >nul 2>&1
echo(Node !version! for Arcue is ready in !install!.
exit /b 0

:no_write
set "msg=Cannot write to !root!. Setup needs to write there: when commands run in a sandbox, allow this one, or set ARCUE_RUNTIME_DIR to a folder it can write to."
goto :fail1

:damaged
set "msg=Reinstall the Arcue plugin: !pins! is missing or damaged."
goto :fail1

:done0
echo(!msg!
exit /b 0

:fail1
if defined stage rd /s /q "!stage!" >nul 2>&1
>&2 echo(!msg!
exit /b 1

:fail3
>&2 echo(!msg!
exit /b 3

:probe
set "got="
for /f "delims=" %%V in ('""%%probe%%" --version" 2^>nul') do (
  set "line=%%V"
  call :version_line
)
exit /b 0

:version_line
if not "!line:~0,1!"=="v" exit /b 0
set "digits=!line:~1!"
if not defined digits exit /b 0
for /f "delims=0123456789." %%X in ("!digits!") do exit /b 0
set "got=!line!"
exit /b 0

:hash_line
set "line=!line: =!"
if not defined line exit /b 0
if "!line:~63,1!"=="" exit /b 0
if not "!line:~64!"=="" exit /b 0
for /f "delims=0123456789abcdefABCDEF" %%X in ("!line!") do exit /b 0
set "actual=!line!"
exit /b 0

:new_enough
if not defined got exit /b 1
set "major=!got:~1!"
for /f "delims=." %%M in ("!major!") do set "major=%%M"
if !major! geq !floor! exit /b 0
exit /b 1
