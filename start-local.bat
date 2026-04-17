@echo off
setlocal

REM Start both backend and frontend for local development.
set "ROOT_DIR=%~dp0"
set "BACKEND_DIR=%ROOT_DIR%backend"
set "FRONTEND_DIR=%ROOT_DIR%frontend"
set "FRONTEND_PORT="

echo [INFO] Root: %ROOT_DIR%

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js not found in PATH. Install Node.js and try again.
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm not found in PATH. Reinstall Node.js and try again.
  pause
  exit /b 1
)

if not exist "%BACKEND_DIR%\package.json" (
  echo [ERROR] Backend package.json not found: %BACKEND_DIR%
  pause
  exit /b 1
)

if not exist "%FRONTEND_DIR%\package.json" (
  echo [ERROR] Frontend package.json not found: %FRONTEND_DIR%
  pause
  exit /b 1
)

if not exist "%BACKEND_DIR%\node_modules" (
  echo [INFO] Installing backend dependencies...
  pushd "%BACKEND_DIR%"
  call npm install
  if errorlevel 1 (
    echo [ERROR] Failed to install backend dependencies.
    popd
    pause
    exit /b 1
  )
  popd
)

if not exist "%FRONTEND_DIR%\node_modules" (
  echo [INFO] Installing frontend dependencies...
  pushd "%FRONTEND_DIR%"
  call npm install
  if errorlevel 1 (
    echo [ERROR] Failed to install frontend dependencies.
    popd
    pause
    exit /b 1
  )
  popd
)

for %%P in (3000 3001 3002 3003 3004) do (
  powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort %%P -State Listen -ErrorAction SilentlyContinue) { exit 1 } else { exit 0 }"
  if errorlevel 1 (
    REM Port is in use, try the next one.
  ) else (
    set "FRONTEND_PORT=%%P"
    goto :frontend_port_ready
  )
)

if not defined FRONTEND_PORT (
  echo [ERROR] Could not find an available frontend port in range 3000-3004.
  pause
  exit /b 1
)

:frontend_port_ready

echo [INFO] Starting backend on port 9000...
start "Qwen Backend" cmd /k "cd /d "%BACKEND_DIR%" && npm start"

echo [INFO] Starting frontend on port %FRONTEND_PORT%...
start "Qwen Frontend" cmd /k "cd /d "%FRONTEND_DIR%" && npm run dev -- -p %FRONTEND_PORT%"

echo [INFO] Waiting for servers to warm up...
timeout /t 4 /nobreak >nul

echo [INFO] Opening app: http://localhost:%FRONTEND_PORT%
start "" http://localhost:%FRONTEND_PORT%

echo [DONE] Backend and frontend launch commands sent.
echo [TIP] Close the two opened terminal windows to stop servers.

endlocal
exit /b 0
