@echo off
rem ============================================================================
rem  MYPAGE digital-twin server -- launcher (portable copy, versioned in the repo)
rem
rem  What it does
rem    1. finds node.exe by itself (this machine has no system-wide Node:
rem       PATH -> the copy bundled with WorkBuddy -> scan its versions folder)
rem    2. refuses to start twice (if 8080 is already serving, it just tells you
rem       the URL -- that is the usual "the twin seems offline" false alarm)
rem    3. auto-restarts if the server dies unexpectedly, so a visitor never
rem       hits an offline twin while this window is open
rem
rem  Keep the window open while you use the page. Closing it = twin offline
rem  (the page then falls back to the local knowledge base, which is honest
rem   but not the DeepSeek brain).
rem
rem  ASCII-only on purpose: non-ASCII text in .cmd files can be garbled by the
rem  console code page.
rem ============================================================================
setlocal
cd /d "%~dp0"

rem ---- already running? ------------------------------------------------------
netstat -an | find ":8080" | find "LISTENING" >nul 2>nul
if %errorlevel%==0 (
  echo.
  echo   The twin is ALREADY running on port 8080.
  echo   Just open this in your browser:  http://127.0.0.1:8080/
  echo.
  echo   If the page still shows offline answers, refresh it with Ctrl+F5.
  echo.
  pause
  exit /b 0
)

rem ---- find node.exe ---------------------------------------------------------
set "NODE_EXE="
where node >nul 2>nul && set "NODE_EXE=node"
if not defined NODE_EXE if exist "%USERPROFILE%\.workbuddy\binaries\node\versions\22.22.2-3\node.exe" set "NODE_EXE=%USERPROFILE%\.workbuddy\binaries\node\versions\22.22.2-3\node.exe"
if not defined NODE_EXE for /d %%D in ("%USERPROFILE%\.workbuddy\binaries\node\versions\*") do if exist "%%D\node.exe" set "NODE_EXE=%%D\node.exe"

if not defined NODE_EXE (
  echo.
  echo   Cannot find node.exe on this machine.
  echo   Option 1: install Node.js LTS from https://nodejs.org , then run this file again.
  echo   Option 2: open this file with Notepad and put the full path of node.exe in the NODE_EXE line.
  echo.
  pause
  exit /b 1
)

echo.
echo   node.exe:  %NODE_EXE%
echo   Twin server starting now -- server.js, port 8080.
echo.
echo   Open this in your browser:  http://127.0.0.1:8080/
echo   Keep this window OPEN while you chat. Closing it = twin offline.
echo.

rem ---- run, and restart if it dies -------------------------------------------
:run
"%NODE_EXE%" server.js

netstat -an | find ":8080" | find "LISTENING" >nul 2>nul
if %errorlevel%==0 (
  echo.
  echo   Another instance is serving 8080 now -- leaving it alone.
  echo   Open this in your browser:  http://127.0.0.1:8080/
  echo.
  pause
  exit /b 0
)

echo.
echo   Server stopped unexpectedly. Restarting in 5 seconds ...
echo   (close this window to stop it for good)
rem ⚠️ 用 ping 等 5 秒，不用 timeout：timeout 在「stdin 被重定向」时会立刻退出
rem    ⇒ 重启循环会变成空转（2026-09-24 测出来的：14 秒转了 30 圈）。ping 与输入无关。
ping -n 6 127.0.0.1 >nul
goto run
