; The Windows installer, which scripts/make.ts builds with Inno Setup 6.3 or later. It installs Arcue for the current
; user, without asking for administrator rights, and adds the app's bin folder, which holds arcue.exe, to that user's
; PATH. Uninstalling removes that folder from PATH again. Keep AppId: it is how Windows knows an update from another app.

#ifndef AppVersion
  #error Pass /DAppVersion=<version>, /DNumericVersion, /DArch, /DSourceDir, /DOutputDir, /DOutputName and /DIconFile.
#endif

[Setup]
AppId={{046AA380-F07D-4944-9E5C-CFC5D38D78DB}
AppName=Arcue
AppVersion={#AppVersion}
AppVerName=Arcue {#AppVersion}
VersionInfoVersion={#NumericVersion}
AppPublisher=Arcue
AppPublisherURL=https://github.com/skibitsky/arcue
AppSupportURL=https://github.com/skibitsky/arcue/issues
DefaultDirName={autopf}\Arcue
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
#if Arch == "arm64"
ArchitecturesAllowed=arm64
ArchitecturesInstallIn64BitMode=arm64
#else
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
#endif
MinVersion=10.0
OutputDir={#OutputDir}
OutputBaseFilename={#OutputName}
SetupIconFile={#IconFile}
UninstallDisplayIcon={app}\Arcue.exe
UninstallDisplayName=Arcue
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ChangesEnvironment=yes

[Tasks]
Name: "addtopath"; Description: "Add the arcue command to PATH"; GroupDescription: "Command line:"
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[InstallDelete]
Type: filesandordirs; Name: "{app}\resources"
Type: filesandordirs; Name: "{app}\locales"
Type: filesandordirs; Name: "{app}\bin"

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\Arcue"; Filename: "{app}\Arcue.exe"
Name: "{autodesktop}\Arcue"; Filename: "{app}\Arcue.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\Arcue.exe"; Description: "{cm:LaunchProgram,Arcue}"; Flags: nowait postinstall skipifsilent

[Code]
const
  EnvironmentKey = 'Environment';

function BinFolder: String;
begin
  Result := ExpandConstant('{app}\bin');
end;

function SameFolder(A, B: String): Boolean;
begin
  Result := CompareText(RemoveBackslashUnlessRoot(Trim(A)), RemoveBackslashUnlessRoot(Trim(B))) = 0;
end;

{ The entries of Path other than Folder, in their order and as they are written. }
function PathWithout(Path, Folder: String): String;
var
  Rest, Entry: String;
  Index: Integer;
  First: Boolean;
begin
  Result := '';
  First := True;
  Rest := Path + ';';
  while Rest <> '' do
  begin
    Index := Pos(';', Rest);
    Entry := Copy(Rest, 1, Index - 1);
    Rest := Copy(Rest, Index + 1, Length(Rest));
    if not SameFolder(Entry, Folder) then
    begin
      if not First then
        Result := Result + ';';
      Result := Result + Entry;
      First := False;
    end;
  end;
end;

procedure AddToPath;
var
  Path: String;
begin
  if not RegQueryStringValue(HKCU, EnvironmentKey, 'Path', Path) then
    Path := '';
  if PathWithout(Path, BinFolder) <> Path then
    Exit;
  if Path = '' then
    Path := BinFolder
  else if Copy(Path, Length(Path), 1) = ';' then
    Path := Path + BinFolder
  else
    Path := Path + ';' + BinFolder;
  RegWriteExpandStringValue(HKCU, EnvironmentKey, 'Path', Path);
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if (CurStep = ssPostInstall) and WizardIsTaskSelected('addtopath') then
    AddToPath;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  Path, Kept: String;
begin
  if CurUninstallStep <> usPostUninstall then
    Exit;
  if not RegQueryStringValue(HKCU, EnvironmentKey, 'Path', Path) then
    Exit;
  Kept := PathWithout(Path, BinFolder);
  if Kept <> Path then
    RegWriteExpandStringValue(HKCU, EnvironmentKey, 'Path', Kept);
end;
