@echo off
rem ---------------------------------------------------------------------------
rem  Bon App' Hedi - double-click to stop the site.
rem
rem  Normally unnecessary: Ctrl+C in the start.bat window stops both halves, and
rem  so does either half dying. This is for when that path could not run - a
rem  window closed with the X button, a machine that slept, a server left over
rem  from a session nobody remembers.
rem
rem  scripts\stop.ps1 finds the leftovers by asking who is listening on :4200 and
rem  :8080 rather than by trusting a recorded process id, and refuses to kill
rem  anything that is not node or java, since :8080 is a popular port and this
rem  script should never be the reason an unrelated server disappeared.
rem ---------------------------------------------------------------------------

title Bon App' Hedi - stop

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop.ps1" %*

echo.
pause
