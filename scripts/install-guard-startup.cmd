@echo off
setlocal EnableExtensions
rem DSH-Superagent guard installer (run by double-click, or from a terminal).
rem Writes a hidden-window VBS starter into THIS user's Startup folder so the guard loop
rem (start the backend at logon + one watchdog tick every 15 minutes) runs on every sign-in.
rem No admin, no Task Scheduler (this environment refuses it), no registry machine keys.
rem Uninstall: delete the VBS from the Startup folder, or drop a "disabled" file in
rem   %APPDATA%\Superagent\watchdog  (the running loop exits at its next tick).
rem Optional: CLI unattended path only. The in-app plugin path does not need this; the app starts its own host.
rem
rem Every line that expands %GUARD%/%PWSH%/%VBS% stays OUT of a parenthesized block, and the error
rem paths use goto instead of ( ... ) blocks: the block reader sees an expanded value before quoting
rem applies, so a checkout path containing ")" (e.g. "repo (2)") would end the block mid-line. Inside
rem double quotes those characters are literal, which is exactly where the VBS writer puts them.
rem The sh.Run argument quotes by VBScript rules: """ opens the string and quotes the path, "" quotes
rem inside it, and """ closes; tests/guard-installer.spec.ts parses the emitted line to pin this.
set "REPO=%~dp0"
set "REPO=%REPO:~0,-1%"
set "GUARD=%REPO%\scripts\dsh-superagent-guard.ps1"
set "PWSH=C:\Program Files\PowerShell\7\pwsh.exe"
if not exist "%GUARD%" goto missingGuard
if not exist "%PWSH%" goto missingPwsh
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "VBS=%STARTUP%\DSH-Superagent-Guard.vbs"
echo Set sh = CreateObject^("WScript.Shell"^) > "%VBS%"
echo sh.Run """%PWSH%"" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""%GUARD%""", 0, False >> "%VBS%"
if not exist "%VBS%" goto writeFailed
echo Installed guard starter: "%VBS%"
echo It runs on your next sign-in. To start now without signing out, double-click it.
echo Uninstall later by deleting that file, or by creating a "disabled" marker in
echo   "%APPDATA%\Superagent\watchdog".
pause
exit /b 0

:missingGuard
echo ERROR: guard script not found at "%GUARD%" & pause
exit /b 1

:missingPwsh
echo ERROR: PowerShell 7 not found at "%PWSH%" & pause
exit /b 1

:writeFailed
echo ERROR: could not write "%VBS%" & pause
exit /b 1
