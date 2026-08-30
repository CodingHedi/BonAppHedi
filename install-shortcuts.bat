@echo off
rem ---------------------------------------------------------------------------
rem  Bon App' Hedi - add bah-* commands to your PowerShell profile.
rem
rem  A wrapper, not a second implementation: everything happens in
rem  scripts\install-shortcuts.ps1, which works the repository's location out
rem  from where it sits and writes a fenced block of small functions into your
rem  profile. Re-running it updates that block rather than adding a second one.
rem
rem  It exists for the same two reasons start.bat does: .ps1 files are not
rem  double-clickable - Explorer opens them in an editor - and PowerShell's
rem  default execution policy refuses to run a script file at all.
rem  -ExecutionPolicy Bypass applies to this one invocation and changes nothing
rem  about the machine.
rem
rem  It writes to YOUR PROFILE and to nothing in this repository. The profile is
rem  yours and machine-specific, which is why the shortcuts are generated rather
rem  than committed - a path that is right here is wrong on any other clone.
rem
rem  Arguments pass straight through:
rem      install-shortcuts.bat -WhatIf     print the block, write nothing
rem      install-shortcuts.bat -Remove     take it back out again
rem ---------------------------------------------------------------------------

title Bon App' Hedi - shortcuts

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install-shortcuts.ps1" %*

rem Without this the window closes instantly and takes the list of commands with
rem it, which is the entire difficulty of a double-clicked script.
pause
