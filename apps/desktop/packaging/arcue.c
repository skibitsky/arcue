/*
 * The arcue command of an installed Arcue app on Windows, bin\arcue.exe. It runs resources\cli\arcue.js on the app's
 * own Electron as Node, with its arguments exactly as its caller wrote them, and exits with the command line's code.
 *
 * Electron is a GUI program, which shells neither wait for nor read from, so this console program stands between.
 * It hands its arguments straight to CreateProcess: cmd.exe never reads them, so no character in them is a command.
 *
 * In a console, with no output redirected, it gives Electron no standard handles, so Electron attaches to the
 * console, as a console program would, and receives Ctrl+C itself. Otherwise Electron inherits this program's handles.
 * Electron runs in a job that ends it when this program ends, and that leaves out what it starts, such as the app.
 */

#define WIN32_LEAN_AND_MEAN
#ifndef UNICODE
#define UNICODE
#endif
#include <windows.h>

#define APP_NAME L"Arcue.exe"
#define CLI_SCRIPT L"resources\\cli\\arcue.js"
#define MAX_PATH_CHARS 32768
#define CLOSE_GRACE_MS 4000

static HANDLE child = NULL;

static wchar_t *concat(const wchar_t *const *parts, SIZE_T count) {
  SIZE_T length = 1;
  for (SIZE_T index = 0; index < count; index++) length += (SIZE_T)lstrlenW(parts[index]);
  wchar_t *text = HeapAlloc(GetProcessHeap(), 0, length * sizeof(wchar_t));
  if (text == NULL) ExitProcess(1);
  wchar_t *end = text;
  for (SIZE_T index = 0; index < count; index++) {
    for (const wchar_t *from = parts[index]; *from != L'\0'; from++) *end++ = *from;
  }
  *end = L'\0';
  return text;
}

static void say(const wchar_t *const *parts, SIZE_T count) {
  wchar_t *text = concat(parts, count);
  HANDLE error = GetStdHandle(STD_ERROR_HANDLE);
  DWORD mode;
  DWORD written;
  if (error == NULL || error == INVALID_HANDLE_VALUE) return;
  if (GetConsoleMode(error, &mode)) {
    WriteConsoleW(error, text, (DWORD)lstrlenW(text), &written, NULL);
    return;
  }
  int size = WideCharToMultiByte(CP_UTF8, 0, text, -1, NULL, 0, NULL, NULL);
  char *bytes = size > 1 ? HeapAlloc(GetProcessHeap(), 0, (SIZE_T)size) : NULL;
  if (bytes != NULL && WideCharToMultiByte(CP_UTF8, 0, text, -1, bytes, size, NULL, NULL) == size) {
    WriteFile(error, bytes, (DWORD)(size - 1), &written, NULL);
  }
}

static void decimal(DWORD value, wchar_t *text) {
  wchar_t digits[11];
  int count = 0;
  do {
    digits[count++] = (wchar_t)(L'0' + value % 10);
    value /= 10;
  } while (value != 0);
  while (count > 0) *text++ = digits[--count];
  *text = L'\0';
}

static wchar_t *last_separator(wchar_t *path) {
  wchar_t *found = NULL;
  for (wchar_t *at = path; *at != L'\0'; at++) {
    if (*at == L'\\' || *at == L'/') found = at;
  }
  return found;
}

static BOOL is_file(const wchar_t *path) {
  DWORD attributes = GetFileAttributesW(path);
  return attributes != INVALID_FILE_ATTRIBUTES && (attributes & FILE_ATTRIBUTE_DIRECTORY) == 0;
}

static BOOL is_console(HANDLE handle) {
  DWORD mode;
  return handle != NULL && handle != INVALID_HANDLE_VALUE && GetConsoleMode(handle, &mode);
}

static HANDLE inheritable(HANDLE handle) {
  HANDLE copy = NULL;
  if (handle == NULL || handle == INVALID_HANDLE_VALUE) return NULL;
  if (!DuplicateHandle(GetCurrentProcess(), handle, GetCurrentProcess(), &copy, 0, TRUE, DUPLICATE_SAME_ACCESS)) {
    return NULL;
  }
  return copy;
}

/* What follows the program's own name on its command line, which CommandLineToArgvW and the C runtime both skip. */
static const wchar_t *arguments(const wchar_t *line) {
  BOOL quoted = FALSE;
  while (*line != L'\0' && (quoted || (*line != L' ' && *line != L'\t'))) {
    if (*line == L'"') quoted = !quoted;
    line++;
  }
  while (*line == L' ' || *line == L'\t') line++;
  return line;
}

/* The console sends Ctrl+C to Electron as well, which stops on its own; on close, give it time to finish first. */
static BOOL WINAPI on_console_event(DWORD event) {
  if (event == CTRL_C_EVENT || event == CTRL_BREAK_EVENT) return TRUE;
  if (child != NULL) WaitForSingleObject(child, CLOSE_GRACE_MS);
  return FALSE;
}

int main(void) {
  wchar_t *folder = HeapAlloc(GetProcessHeap(), 0, MAX_PATH_CHARS * sizeof(wchar_t));
  if (folder == NULL) return 1;
  DWORD length = GetModuleFileNameW(NULL, folder, MAX_PATH_CHARS);
  if (length == 0 || length >= MAX_PATH_CHARS) {
    const wchar_t *message[] = {L"Cannot find where arcue.exe is.\r\n"};
    say(message, ARRAYSIZE(message));
    return 1;
  }
  for (int level = 0; level < 2; level++) {
    wchar_t *separator = last_separator(folder);
    if (separator == NULL) {
      const wchar_t *message[] = {L"Reinstall Arcue: arcue.exe is not in an Arcue app's bin folder.\r\n"};
      say(message, ARRAYSIZE(message));
      return 1;
    }
    *separator = L'\0';
  }

  const wchar_t *app_parts[] = {folder, L"\\" APP_NAME};
  const wchar_t *script_parts[] = {folder, L"\\" CLI_SCRIPT};
  wchar_t *app = concat(app_parts, ARRAYSIZE(app_parts));
  wchar_t *script = concat(script_parts, ARRAYSIZE(script_parts));
  if (!is_file(app) || !is_file(script)) {
    const wchar_t *message[] = {L"Reinstall Arcue: ", folder, L" is not a complete Arcue app.\r\n"};
    say(message, ARRAYSIZE(message));
    return 1;
  }

  const wchar_t *rest = arguments(GetCommandLineW());
  const wchar_t *line_parts[] = {L"\"", app, L"\" \"", script, *rest != L'\0' ? L"\" " : L"\"", rest};
  wchar_t *line = concat(line_parts, ARRAYSIZE(line_parts));

  SetEnvironmentVariableW(L"ELECTRON_RUN_AS_NODE", L"1");
  SetEnvironmentVariableW(L"NODE_OPTIONS", NULL);

  HANDLE input = GetStdHandle(STD_INPUT_HANDLE);
  HANDLE output = GetStdHandle(STD_OUTPUT_HANDLE);
  HANDLE error = GetStdHandle(STD_ERROR_HANDLE);
  BOOL in_console = is_console(output) && is_console(error);
  STARTUPINFOW startup = {0};
  startup.cb = sizeof(startup);
  startup.dwFlags = STARTF_USESTDHANDLES;
  if (!in_console) {
    startup.hStdInput = inheritable(input);
    startup.hStdOutput = inheritable(output);
    startup.hStdError = inheritable(error);
  }

  HANDLE job = CreateJobObjectW(NULL, NULL);
  if (job != NULL) {
    JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits = {0};
    limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE | JOB_OBJECT_LIMIT_SILENT_BREAKAWAY_OK;
    SetInformationJobObject(job, JobObjectExtendedLimitInformation, &limits, sizeof(limits));
  }

  PROCESS_INFORMATION started = {0};
  if (!CreateProcessW(app, line, NULL, NULL, !in_console, CREATE_SUSPENDED, NULL, NULL, &startup, &started)) {
    wchar_t code[11];
    decimal(GetLastError(), code);
    const wchar_t *message[] = {L"Could not start ", app, L": error ", code, L".\r\n"};
    say(message, ARRAYSIZE(message));
    return 1;
  }
  child = started.hProcess;
  if (job != NULL) AssignProcessToJobObject(job, started.hProcess);
  if (in_console) SetConsoleCtrlHandler(on_console_event, TRUE);
  ResumeThread(started.hThread);
  CloseHandle(started.hThread);

  DWORD exit_code = 1;
  WaitForSingleObject(started.hProcess, INFINITE);
  GetExitCodeProcess(started.hProcess, &exit_code);
  return (int)exit_code;
}
