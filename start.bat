@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

cd /d "%~dp0"

cls
echo ========================================
echo   OpenClaw - Starting All Services
echo ========================================
echo.

set "MODE=%~1"
if "%MODE%"=="" set "MODE=all"

set "PORT_SERVER=3001"
set "PORT_WEB=5000"
set "PORT_IM=5173"

set "ROOT=%~dp0"

set "KILL=%~2"
if "%KILL%"=="" set "KILL=yes"

if /I "%MODE%"=="all" (
  call :kill_port %PORT_SERVER% server %KILL%
  call :kill_port %PORT_WEB% web %KILL%
  call :kill_port %PORT_IM% im %KILL%
) else (
  if /I "%MODE%"=="core" (
    call :kill_port %PORT_SERVER% server %KILL%
    call :kill_port %PORT_WEB% web %KILL%
  ) else (
    if /I "%MODE%"=="server" (
      call :kill_port %PORT_SERVER% server %KILL%
    ) else (
      if /I "%MODE%"=="web" (
        call :kill_port %PORT_WEB% web %KILL%
      ) else (
        if /I "%MODE%"=="im" (
          call :kill_port %PORT_IM% im %KILL%
        )
      )
    )
  )
)

echo Mode: %MODE%
echo.

if /I "%MODE%"=="all" (
  call :start_server
  call :start_web
  call :start_im
) else (
  if /I "%MODE%"=="core" (
    call :start_server
    call :start_web
  ) else (
    if /I "%MODE%"=="server" (
      call :start_server
    ) else (
      if /I "%MODE%"=="web" (
        call :start_web
      ) else (
        if /I "%MODE%"=="im" (
          call :start_im
        ) else (
          echo Unknown mode: %MODE%
          echo Usage: start.bat [all^|core^|server^|web^|im] [yes^|no]
          goto :end
        )
      )
    )
  )
)

echo All services launching...
echo   Server:      http://localhost:%PORT_SERVER%
echo   Web:         http://localhost:%PORT_WEB%
echo   IM Analyzer: http://localhost:%PORT_IM%
echo Press any key to close this window...
pause >nul
goto :end

:start_server
echo [1/3] Starting Server...
start "OpenClaw-Server" /max /D "%ROOT%packages\server" cmd /k "pnpm dev"
timeout /t 2 /nobreak >nul
goto :eof

:start_web
echo [2/3] Starting Web...
start "OpenClaw-Web" /max /D "%ROOT%packages\web" cmd /k "pnpm dev"
timeout /t 2 /nobreak >nul
goto :eof

:start_im
echo [3/3] Starting IM Analyzer...
start "OpenClaw-IM" /max /D "%ROOT%packages\im-analyzer" cmd /k "pnpm dev"
timeout /t 2 /nobreak >nul
goto :eof

:kill_port
set "PORT=%~1"
set "NAME=%~2"
set "DO_KILL=%~3"
if /I not "%DO_KILL%"=="yes" goto :eof
for /f "tokens=5" %%p in ('netstat -ano 2^>nul ^| findstr ":%PORT%" ^| findstr "LISTENING"') do (
  set PID=%%p
  if defined PID (
    if not "!PID!"=="" (
      taskkill /PID !PID! /F >nul 2>&1
      set PID=
    )
  )
)
goto :eof

:end
endlocal
