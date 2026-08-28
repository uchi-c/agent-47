<#
  DeviceGuard Agent — remote installer (Windows)
  ---------------------------------------------------------------------------
  Lets whoever is physically at a device install the agent themselves, with
  nothing more than a one-line command an admin sends them — no git clone,
  no admin needing to be there. Fetches pc-agent/'s files straight from
  GitHub (this is a public repo) into a local folder, then hands off to
  install.ps1, which does the actual dependency install + service
  registration (see its own header comment for that part).

  Usage: an admin gets this from the console's "Connect a device" panel,
  already filled in:

    $env:DEVICEGUARD_API = "https://api.yourdomain.com"
    $env:DEVICEGUARD_KEY = "<organization's agent_api_key>"
    irm https://raw.githubusercontent.com/uchi-c/agent-47/main/pc-agent/remote-install.ps1 | iex

  Values travel as env vars, not script arguments, specifically so nothing
  sensitive ends up in this process's command line (visible to any other
  process on the machine while it runs) or in shell history the way a
  bare -AgentSecret "..." argument would.
#>
$ErrorActionPreference = "Stop"

function Assert-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p  = New-Object Security.Principal.WindowsPrincipal($id)
  if (-not $p.IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)) {
    throw "Run this from an elevated PowerShell (Run as Administrator)."
  }
}

Assert-Admin

$apiUrl = $env:DEVICEGUARD_API
$agentKey = $env:DEVICEGUARD_KEY
$computerCode = if ($env:DEVICEGUARD_CODE) { $env:DEVICEGUARD_CODE } else { $env:COMPUTERNAME }

if ([string]::IsNullOrWhiteSpace($apiUrl)) {
  throw "`$env:DEVICEGUARD_API is not set. Get the install command from DeviceGuard's console (Connect a device) rather than running this script bare."
}
if ([string]::IsNullOrWhiteSpace($agentKey)) {
  throw "`$env:DEVICEGUARD_KEY is not set. Get the install command from DeviceGuard's console (Connect a device) rather than running this script bare."
}

$installDir = "$env:ProgramData\DeviceGuardAgent\pc-agent"
Write-Host "Installing to $installDir ..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $installDir | Out-Null

# Listing the folder via GitHub's contents API (rather than hardcoding a
# file list here) means this script doesn't go stale every time a new
# module gets added to pc-agent/ -- it always mirrors whatever's actually
# in the repo.
$apiListing = "https://api.github.com/repos/uchi-c/agent-47/contents/pc-agent"
Write-Host "Fetching file list..." -ForegroundColor Cyan
$files = Invoke-RestMethod -Uri $apiListing -Headers @{ "User-Agent" = "DeviceGuard-remote-install" }

foreach ($f in $files) {
  if ($f.type -ne "file") { continue }
  # remote-install.ps1 itself is in this listing too (self-referential) --
  # skip it, only install.ps1 and the actual agent files are needed here.
  if ($f.name -eq "remote-install.ps1") { continue }
  Write-Host "  $($f.name)"
  Invoke-WebRequest -Uri $f.download_url -OutFile (Join-Path $installDir $f.name) -Headers @{ "User-Agent" = "DeviceGuard-remote-install" }
}

Write-Host "Running install.ps1..." -ForegroundColor Cyan
Push-Location $installDir
try {
  & (Join-Path $installDir "install.ps1") -ApiBaseUrl $apiUrl -AgentSecret $agentKey -ComputerCode $computerCode
} finally {
  Pop-Location
}
