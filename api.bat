@echo off
rem ---------------------------------------------------------------------------
rem  Bon App' Hedi - double-click to exercise the API by hand.
rem
rem  Runs the public, social, abuse and admin flows against the backend on
rem  :8080, doing the session-cookie and XSRF handshake once so the writes
rem  actually go through. Each call prints what it sent and what came back.
rem
rem  START THE SITE FIRST. This talks to a running backend and does not start
rem  one - use start.bat, wait for it to say the API is up, then run this.
rem
rem  It writes to whatever database that backend is pointed at: it posts
rem  comments, ratings and reactions. Against the dev database that is the
rem  point. Against anything you care about it is not, so check what start.bat
rem  is serving before running it.
rem
rem  A wrapper, not a second implementation: everything is in scripts\api.ps1.
rem
rem  Arguments pass straight through:
rem      api.bat -Flow Social            one flow instead of all four
rem      api.bat -BaseUrl http://...     somewhere other than localhost:8080
rem ---------------------------------------------------------------------------

title Bon App' Hedi - API check

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\api.ps1" %*
set "EXITCODE=%ERRORLEVEL%"

echo.
if not "%EXITCODE%"=="0" (
    echo Exit code %EXITCODE%. The lines above say what happened.
    echo If everything failed to connect, the backend is not running: start.bat.
)

rem Without this the window closes instantly and takes the reason with it.
pause
