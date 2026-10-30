; The Windows installer, which scripts/make.ts builds with Inno Setup 6.3 or later. It installs Arcue for the current
; user, without asking for administrator rights, and adds the app's bin folder, which holds arcue.exe, to that user's
; PATH. Uninstalling removes that folder from PATH again. Keep AppId: it is how Windows knows an update from another app.
; Setup and the uninstaller first close the Arcue.exe and bin\arcue.exe that run from the app's folder, such as the window
; or an agent's arcue serve, and ask before they do unless they run silently.

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

; Only an upgrade deletes, and only the folders whose files are named differently in each build: the folder Arcue is
; installed to may hold other files.
[InstallDelete]
Type: filesandordirs; Name: "{app}\resources\app"; Check: UpgradesArcue
Type: filesandordirs; Name: "{app}\resources\cli"; Check: UpgradesArcue

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
  CloseSeconds = 10;
  EndSeconds = 5;

function GetTickCount: DWORD;
  external 'GetTickCount@kernel32.dll stdcall';

function BinFolder: String;
begin
  Result := ExpandConstant('{app}\bin');
end;

function UpgradesArcue: Boolean;
begin
  Result := FileExists(ExpandConstant('{app}\Arcue.exe'));
end;

{ Arcue.exe runs the window, its helper processes and the Node that bin\arcue.exe starts. }
function IsArcueProgram(Path: String): Boolean;
begin
  Result := (CompareText(Path, ExpandConstant('{app}\Arcue.exe')) = 0) or
    (CompareText(Path, ExpandConstant('{app}\bin\arcue.exe')) = 0);
end;

{ bin\arcue.exe and the Arcue.exe that it runs as Node run the command line, which has no window to close. }
function IsCommandLine(Path: String; CommandLine: Variant): Boolean;
var
  Line: String;
begin
  Result := CompareText(Path, ExpandConstant('{app}\bin\arcue.exe')) = 0;
  if not Result and not VarIsNull(CommandLine) then
  begin
    Line := CommandLine;
    Result := Pos('\resources\cli\arcue.js', LowerCase(Line)) > 0;
  end;
end;

{ WMI's service, which lists the running processes, or Null if it cannot be reached. }
function ProcessService: Variant;
var
  Locator: Variant;
begin
  Result := Null;
  try
    Locator := CreateOleObject('WbemScripting.SWbemLocator');
    Result := Locator.ConnectServer('.', 'root\CIMV2');
  except
    Log('Could not reach WMI: ' + GetExceptionMessage);
  end;
end;

{ The processes that run Arcue's programs from the app's folder, which may also hold other programs. WindowOnly leaves
  out the command line's. }
function ArcueProcesses(Service: Variant; WindowOnly: Boolean): TArrayOfInteger;
var
  Processes, Process, Path, CommandLine: Variant;
  Executable: String;
  Index, Count, Found: Integer;
begin
  SetArrayLength(Result, 0);
  if VarIsNull(Service) then
    Exit;
  Found := 0;
  try
    Processes := Service.ExecQuery(
      'SELECT ProcessId, ExecutablePath, CommandLine FROM Win32_Process WHERE Name = ''arcue.exe''');
    Count := Processes.Count;
    for Index := 0 to Count - 1 do
    begin
      Process := Processes.ItemIndex(Index);
      Path := Process.ExecutablePath;
      if not VarIsNull(Path) then
      begin
        Executable := Path;
        CommandLine := Process.CommandLine;
        if IsArcueProgram(Executable) and not (WindowOnly and IsCommandLine(Executable, CommandLine)) then
        begin
          SetArrayLength(Result, Found + 1);
          Result[Found] := Process.ProcessId;
          Found := Found + 1;
        end;
      end;
    end;
  except
    Log('Could not list the running processes: ' + GetExceptionMessage);
  end;
end;

function ArcueRunning: Boolean;
var
  Running: TArrayOfInteger;
begin
  Running := ArcueProcesses(ProcessService, False);
  Result := GetArrayLength(Running) > 0;
end;

{ Waits up to Seconds while some of Arcue runs, or with WindowOnly while some of its window does. }
procedure WaitForArcue(Service: Variant; WindowOnly: Boolean; Seconds: Integer);
var
  Running: TArrayOfInteger;
  Start, Limit: DWORD;
begin
  Start := GetTickCount;
  Limit := Seconds * 1000;
  Running := ArcueProcesses(Service, WindowOnly);
  while (GetArrayLength(Running) > 0) and (GetTickCount - Start < Limit) do
  begin
    Sleep(500);
    Running := ArcueProcesses(Service, WindowOnly);
  end;
end;

{ Asks the processes to close, which closes their windows, or with Force ends them. }
procedure EndProcesses(Processes: TArrayOfInteger; Force: Boolean);
var
  Params: String;
  Index, ResultCode: Integer;
begin
  if Force then
    Params := '/F'
  else
    Params := '';
  for Index := 0 to GetArrayLength(Processes) - 1 do
    Params := Params + ' /PID ' + IntToStr(Processes[Index]);
  Params := Trim(Params);
  Log('Running taskkill ' + Params);
  Exec(ExpandConstant('{sys}\taskkill.exe'), Params, '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;

{ Asks Arcue to close and gives its window time to, so its core stops cleanly, then ends what still runs, such as the
  command line. False if some of Arcue still runs. }
function CloseArcue: Boolean;
var
  Service: Variant;
  Running: TArrayOfInteger;
begin
  Service := ProcessService;
  Running := ArcueProcesses(Service, False);
  if GetArrayLength(Running) > 0 then
  begin
    EndProcesses(Running, False);
    WaitForArcue(Service, True, CloseSeconds);
    Running := ArcueProcesses(Service, False);
  end;
  if GetArrayLength(Running) > 0 then
  begin
    EndProcesses(Running, True);
    WaitForArcue(Service, False, EndSeconds);
    Running := ArcueProcesses(Service, False);
  end;
  Result := GetArrayLength(Running) = 0;
end;

function MayCloseArcue(Silent: Boolean; Closer: String): Boolean;
begin
  Result := Silent or
    (SuppressibleMsgBox('Arcue is running. ' + Closer + ' will close it.', mbConfirmation, MB_OKCANCEL, IDOK) = IDOK);
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

procedure RemoveFromPath;
var
  Path, Kept: String;
begin
  if not RegQueryStringValue(HKCU, EnvironmentKey, 'Path', Path) then
    Exit;
  Kept := PathWithout(Path, BinFolder);
  if Kept <> Path then
    RegWriteExpandStringValue(HKCU, EnvironmentKey, 'Path', Kept);
end;

{ Runs before Restart Manager looks for programs that use the files Setup replaces. }
function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := '';
  if UpgradesArcue and ArcueRunning and not (MayCloseArcue(WizardSilent, 'Setup') and CloseArcue) then
    Result := 'Close Arcue, then run Setup again.';
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if (CurStep = ssPostInstall) and WizardIsTaskSelected('addtopath') then
    AddToPath;
end;

{ usAppMutexCheck comes after the user confirms the uninstall and before anything is removed. }
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if (CurUninstallStep = usAppMutexCheck) and ArcueRunning then
  begin
    if not MayCloseArcue(UninstallSilent, 'Uninstall') then
      Abort;
    if not CloseArcue then
    begin
      SuppressibleMsgBox('Close Arcue, then uninstall it again.', mbError, MB_OK, IDOK);
      Abort;
    end;
  end
  else if CurUninstallStep = usPostUninstall then
    RemoveFromPath;
end;
