# Installs and checks the PQTABS local signer on Windows.
#
# It installs the pinned dependencies from package-lock.json, builds the CLI, runs the signer's tests,
# and prints the path to put in the MCP configuration. It does not create, import, or print any key.
# Create or import the agent key yourself afterwards, in an interactive terminal.
#
# Requirements: Windows 10 or 11, Windows PowerShell 5.1 or PowerShell 7, Node.js 22 or newer.
#
# Usage (from packages/pqtabs-signer):
#   powershell -ExecutionPolicy Bypass -File scripts\install-windows.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\install-windows.ps1 -SkipTests

[CmdletBinding()]
param(
  [switch]$SkipTests
)

$ErrorActionPreference = "Stop"

function Fail([string]$Message) {
  Write-Host "Install stopped: $Message" -ForegroundColor Red
  Write-Host "Nothing was stored. No key was created or printed."
  exit 1
}

if ([System.Environment]::OSVersion.Platform -ne [System.PlatformID]::Win32NT) {
  Fail "the local signer runs on Windows only. macOS and Linux fail closed. See the 'Other operating systems' section of README.md."
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { Fail "Node.js is not on PATH. Install Node.js 22 or newer from https://nodejs.org, then open a new terminal." }

$version = (& node -p "process.versions.node") 2>$null
$major = [int](($version -split "\.")[0])
if ($major -lt 22) { Fail "Node.js $version found. The signer needs Node.js 22 or newer." }

$packageDir = Split-Path -Parent $PSScriptRoot
Push-Location $packageDir
try {
  Write-Host "Installing pinned dependencies (npm ci)..."
  & npm ci --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { Fail "npm ci failed. Check the network and run the script again." }

  Write-Host "Building the signer CLI..."
  & npm run build
  if ($LASTEXITCODE -ne 0) { Fail "the build failed." }

  if (-not $SkipTests) {
    Write-Host "Running the signer tests (includes real Windows DPAPI round-trips)..."
    & npm test
    if ($LASTEXITCODE -ne 0) { Fail "the signer tests failed. Do not use this build." }
  }

  $cli = Join-Path $packageDir "dist\src\cli.js"
  if (-not (Test-Path $cli)) { Fail "the CLI was not built at $cli." }

  Write-Host ""
  Write-Host "Protector check (public data only):"
  $platform = & node $cli platform
  Write-Host $platform
  if ($platform -notmatch '"protector":"windows-dpapi-user"') { Fail "this machine did not report the Windows DPAPI protector." }

  Write-Host ""
  Write-Host "Stored agents on this Windows account (public addresses only):"
  Write-Host (& node $cli list)

  $cliForJson = $cli.Replace('\', '\\')
  Write-Host ""
  Write-Host "Install complete. Next steps:" -ForegroundColor Green
  Write-Host "  1. Create a new agent key here, or import an existing PQTABS backup in an interactive terminal:"
  Write-Host "       node `"$cli`" create"
  Write-Host "       node `"$cli`" import-backup <backup-file.json> --agent 0x<agent address>"
  Write-Host "  2. Check it unlocks. This prints no key:"
  Write-Host "       node `"$cli`" status --agent 0x<agent address>"
  Write-Host "  3. Point the MCP server at the signer. Put this in the pqtabs entry of your MCP configuration:"
  Write-Host ""
  Write-Host "       `"PQTABS_SIGNER_CLI`": `"$cliForJson`","
  Write-Host "       `"PQTABS_SIGNER_AGENT`": `"0x<agent address from status>`""
  Write-Host ""
  Write-Host "  Do not set PQTABS_AGENT_PRIVATE_KEY. The MCP refuses to start when both modes are set."
} finally {
  Pop-Location
}
