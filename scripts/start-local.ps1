$ErrorActionPreference = 'Stop'

# Start backend and frontend for local development on Windows PowerShell.
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir
$BackendDir = Join-Path $RootDir 'backend'
$FrontendDir = Join-Path $RootDir 'frontend'
$BackendPort = if ($env:BACKEND_PORT) { $env:BACKEND_PORT } else { '9000' }
$VenvDir = Join-Path $BackendDir '.venv'
$VenvPython = Join-Path $VenvDir 'Scripts\python.exe'
$VenvPip = Join-Path $VenvDir 'Scripts\pip.exe'

function Info([string]$msg) {
  Write-Host "[INFO] $msg"
}

function Fail([string]$msg) {
  Write-Host "[ERROR] $msg" -ForegroundColor Red
  exit 1
}

function Require-Command([string]$name) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    Fail "Required command not found: $name"
  }
}

function Test-PortListening([int]$port) {
  $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  return $null -ne $conn
}

function Get-FreeFrontendPort {
  foreach ($p in 3000..3004) {
    if (-not (Test-PortListening $p)) {
      return $p
    }
  }
  return $null
}

Info "Root: $RootDir"

Require-Command node
Require-Command npm
Require-Command python

if (-not (Test-Path (Join-Path $BackendDir 'package.json'))) {
  Fail "Backend package.json not found: $BackendDir"
}

if (-not (Test-Path (Join-Path $FrontendDir 'package.json'))) {
  Fail "Frontend package.json not found: $FrontendDir"
}

if (-not (Test-Path (Join-Path $BackendDir 'requirements.txt'))) {
  Fail "Python requirements not found: $BackendDir\\requirements.txt"
}

if (-not (Test-Path $VenvDir)) {
  Info "Creating Python virtual environment at $VenvDir..."
  python -m venv $VenvDir
}

if (-not (Test-Path $VenvPip)) {
  Fail "pip not found in virtual environment: $VenvPip"
}

if (-not (Test-Path (Join-Path $BackendDir 'node_modules'))) {
  Info 'Installing backend dependencies...'
  Push-Location $BackendDir
  npm install
  Pop-Location
}

if (-not (Test-Path (Join-Path $FrontendDir 'node_modules'))) {
  Info 'Installing frontend dependencies...'
  Push-Location $FrontendDir
  npm install
  Pop-Location
}

Info 'Installing backend Python dependencies from requirements.txt...'
& $VenvPip install -r (Join-Path $BackendDir 'requirements.txt')

$frontendPort = Get-FreeFrontendPort
if ($null -eq $frontendPort) {
  Fail 'Could not find an available frontend port in range 3000-3004'
}

Info "Starting backend on port $BackendPort..."
$backendCmd = "Set-Location '$BackendDir'; `$env:PATH='$($VenvDir)\\Scripts;' + `$env:PATH; `$env:PORT='$BackendPort'; npm start"
Start-Process powershell -ArgumentList '-NoExit', '-Command', $backendCmd | Out-Null

Info "Starting frontend on port $frontendPort..."
$frontendCmd = "Set-Location '$FrontendDir'; npm run dev -- -p $frontendPort"
Start-Process powershell -ArgumentList '-NoExit', '-Command', $frontendCmd | Out-Null

Start-Sleep -Seconds 3

$appUrl = "http://localhost:$frontendPort"
Info "Opening app: $appUrl"
Start-Process $appUrl | Out-Null

Info 'Backend and frontend launch commands sent.'
Info 'Close the opened PowerShell windows to stop services.'
