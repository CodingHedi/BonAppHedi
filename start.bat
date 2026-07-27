@echo off
rem ---------------------------------------------------------------------------
rem  Bon App' Hedi - double-click to run the site locally.
rem
rem  A wrapper, not a second implementation: everything happens in
rem  scripts\dev.ps1, which starts the backend on :8080, waits for it to answer,
rem  then starts the frontend on :4200 and opens it once it has compiled.
rem
rem  It exists because .ps1 files are not double-clickable - Explorer opens them
rem  in an editor - and because PowerShell's default execution policy refuses to
rem  run a script file at all. -ExecutionPolicy Bypass applies to this one
rem  invocation and changes nothing about the machine.
rem
rem  Ctrl+C here stops both halves. Closing this window with the X button is the
rem  case that cannot be relied on: Windows gives a closing console a couple of
rem  seconds and no promise, and a JVM does not always take the hint. That is
rem  what stop.bat is for.
rem
rem  Arguments are passed straight through, so all of these work:
rem      start.bat -Fresh     delete the database first, re-run every migration
rem      start.bat -Mocks     frontend only, no backend, no database
rem ---------------------------------------------------------------------------

title Bon App' Hedi

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\dev.ps1" -Open %*
set "EXITCODE=%ERRORLEVEL%"

echo.
if not "%EXITCODE%"=="0" (
    echo Exit code %EXITCODE%. The lines above say what happened.
    echo If a port was already in use, run stop.bat first, then try again.
)

rem Without this the window closes instantly on failure and takes the reason
rem with it, which is the whole difficulty of a double-clicked script.
pause
