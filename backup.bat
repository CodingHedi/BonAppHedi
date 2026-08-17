@echo off
rem ---------------------------------------------------------------------------
rem  Bon App' Hedi - double-click to fetch the newest backup off the server.
rem
rem  This is the whole thing. One double-click: it asks the VPS for its newest
rem  nightly snapshot of the database and the photographs, copies both here,
rem  checks the archives actually open, and puts a second copy in Google Drive.
rem
rem  A wrapper, and a wrapper of a wrapper: everything happens in
rem  deploy\pull-backup.ps1, and deploy\backup.bat is what knows which Google
rem  Drive folder to use. This file exists only so the command is in the folder
rem  you already have open, beside start.bat and stop.bat, rather than one
rem  directory down. Nothing here decides anything.
rem
rem  Safe to run whenever. It only ever reads from the server and writes here,
rem  so there is no version of this that changes the live site - which is why,
rem  unlike deploy, it does not ask before it starts.
rem
rem  Arguments pass straight through:
rem      backup.bat -MaxAgeHours 12     complain sooner about a stale backup
rem      backup.bat -KeepLocal 90       keep more copies on this machine
rem ---------------------------------------------------------------------------

title Bon App' Hedi - backup

rem deploy\ is a private submodule. A clone without access to it has no backup
rem script at all, and saying so beats a "file not found" from cmd.
if not exist "%~dp0deploy\backup.bat" (
    echo.
    echo   deploy\backup.bat is missing.
    echo.
    echo   deploy\ is the private ops submodule. If this is a fresh clone, run:
    echo       git submodule update --init deploy
    echo.
    pause
    exit /b 1
)

call "%~dp0deploy\backup.bat" %*
