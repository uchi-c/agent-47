<#
  Device Leasing Agent installer (Windows)
  ---------------------------------------------------------------------------
  Installs Python deps, writes .env, and registers the agent as a Windows
  service (DeviceLeasingAgent). Run from an ELEVATED PowerShell (Run as
  Administrator) because service install needs admin rights.

  Adapted from uchi-c/dube-man-system's pc-agent/install.ps1 -- the
  pywin32-DLL-registration and delayed-auto-startup steps below are reused
  unchanged because they're fixes for real failures reproduced on that
  project (see the comments inline), not this feature's own logic.

  Examples
    .\install.ps1 -SupabaseUrl "https://abc.supabase.co" `
                  -SupabaseAnonKey "eyJ..." `
                  -OrganizationId "<this tenant's organizations.id>" `
                  -ComputerCode "DEV-01"

    # Just check health of an already-installed agent
    .\install.ps1 -VerifyOnly
#>
[CmdletBinding()]
param(
  [string]$SupabaseUrl,
  [string]$SupabaseAnonKey,
  [string]$OrganizationId,
  [string]$ComputerCode = "DEV-01",
  [int]$HeartbeatInterval = 30,
  [int]$LockdownCheckInterval = 20,
  [string]$AgentSecret,
  [switch]$VerifyOnly
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Definition
$envPath = Join-Path $here ".env"
$svcName = "DeviceLeasingAgent"

function Assert-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p  = New-Object Security.Principal.WindowsPrincipal($id)
  if (-not $p.IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)) {
    throw "Run this from an elevated PowerShell (Run as Administrator)."
  }
}

function Get-Python {
  foreach ($c in @("python", "py")) {
    $exe = (Get-Command $c -ErrorAction SilentlyContinue)
    if (-not $exe) { continue }
    # Windows ships a fake "python.exe" App Execution Alias under
    # ...\WindowsApps\ that sits on PATH even when Python isn't actually
    # installed. Running it produces no real output, which crashes later
    # steps with a cryptic error instead of a clear one -- skip it here.
    if ($exe.Source -like "*\WindowsApps\*") { continue }
    $verOutput = & $exe.Source --version 2>&1
    if ($LASTEXITCODE -eq 0 -and $verOutput -match "Python 3") {
      return $exe.Source
    }
  }
  throw "Python 3 not found on PATH. Install Python 3.10+ from https://python.org (not the Microsoft Store) and check 'Add to PATH' during setup, then retry."
}

function New-Secret {
  -join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Maximum 256) })
}

# ----- Verify-only path -----------------------------------------------------
if ($VerifyOnly) {
  Write-Host "== Agent health check ==" -ForegroundColor Cyan
  if (Test-Path $envPath) {
    $keys = @("SUPABASE_URL","SUPABASE_ANON_KEY","ORGANIZATION_ID","COMPUTER_CODE","AGENT_SECRET")
    foreach ($k in $keys) {
      $line = Select-String -Path $envPath -Pattern "^$k=(.*)$"
      $val  = if ($line) { $line.Matches[0].Groups[1].Value } else { "" }
      $ok   = -not [string]::IsNullOrWhiteSpace($val)
      $shown = if ($k -eq "AGENT_SECRET" -and $ok) { "set (" + $val.Length + " chars)" }
               elseif ($ok) { $val } else { "MISSING" }
      Write-Host ("  {0,-18} {1}" -f $k, $shown) -ForegroundColor ($(if($ok){"Green"}else{"Red"}))
    }
  } else {
    Write-Host "  .env not found at $envPath" -ForegroundColor Red
  }
  $svc = Get-Service -Name $svcName -ErrorAction SilentlyContinue
  if ($svc) {
    Write-Host ("  Service            {0}" -f $svc.Status) -ForegroundColor Green
    $startMode = (Get-CimInstance Win32_Service -Filter "Name='$svcName'" -ErrorAction SilentlyContinue).StartMode
    $startColor = if ($startMode -eq "Auto") { "Green" } else { "Red" }
    Write-Host ("  Startup type       {0}" -f $startMode) -ForegroundColor $startColor
    if ($startMode -ne "Auto") {
      Write-Host "    Fix: sc.exe config $svcName start= delayed-auto" -ForegroundColor Yellow
    }
  }
  else      { Write-Host  "  Service            NOT INSTALLED" -ForegroundColor Red }
  $log = Join-Path $here "agent.log"
  if (Test-Path $log) { Write-Host "`n-- last log lines --"; Get-Content $log -Tail 8 }
  return
}

# ----- Install path ---------------------------------------------------------
Assert-Admin

if ([string]::IsNullOrWhiteSpace($SupabaseUrl) -or [string]::IsNullOrWhiteSpace($SupabaseAnonKey)) {
  throw "SupabaseUrl and SupabaseAnonKey are required."
}
if ([string]::IsNullOrWhiteSpace($OrganizationId)) {
  throw "OrganizationId is required - this is a shared multi-tenant database, so the agent must be told which lessor it belongs to. Query: select id, name from organizations;"
}
if ([string]::IsNullOrWhiteSpace($AgentSecret)) {
  $AgentSecret = New-Secret
  Write-Host "Generated a new AGENT_SECRET for this install." -ForegroundColor Yellow
}

$python = Get-Python
Write-Host "Using Python: $python"

Write-Host "Installing dependencies..." -ForegroundColor Cyan
& $python -m pip install --upgrade pip | Out-Null
& $python -m pip install -r (Join-Path $here "requirements.txt")

# pywin32 installed via pip does NOT register its COM/service DLLs into
# System32. The Windows Service Control Manager launches pythonservice.exe
# without the installing interpreter's sys.path context, so without this
# step "service.py install"/"start" below fails with a DLL-load error even
# though the earlier pip install reported success.
Write-Host "Registering pywin32 system DLLs..." -ForegroundColor Cyan
$scriptsDir = (& $python -c "import sys, os; print(os.path.join(os.path.dirname(sys.executable), 'Scripts'))").Trim()
$postInstall = Join-Path $scriptsDir "pywin32_postinstall.py"
if (Test-Path $postInstall) {
  & $python $postInstall -install -silent
} else {
  Write-Host "  pywin32_postinstall.py not found at $postInstall - skipping. If service registration fails below, locate it under your Python install's Scripts folder and run: python <path> -install" -ForegroundColor Yellow
}

Write-Host "Writing .env ($ComputerCode)..." -ForegroundColor Cyan
$envContent = @"
SUPABASE_URL=$SupabaseUrl
SUPABASE_ANON_KEY=$SupabaseAnonKey
ORGANIZATION_ID=$OrganizationId
COMPUTER_CODE=$ComputerCode
HEARTBEAT_INTERVAL=$HeartbeatInterval
LOCKDOWN_CHECK_INTERVAL=$LockdownCheckInterval
AGENT_SECRET=$AgentSecret
"@
# Windows PowerShell 5.1's "-Encoding UTF8" silently prepends a byte-order
# mark, which glues an invisible character onto the first key's name
# (SUPABASE_URL). python-dotenv does not strip it, so the agent fails with
# "SUPABASE_URL is missing" even though the file visibly has it. Writing via
# .NET's UTF8Encoding with BOM explicitly disabled sidesteps this.
[System.IO.File]::WriteAllText($envPath, $envContent, (New-Object System.Text.UTF8Encoding($false)))

Write-Host "Registering Windows service ($svcName)..." -ForegroundColor Cyan
Push-Location $here
try {
  $existing = Get-Service -Name $svcName -ErrorAction SilentlyContinue
  if ($existing) {
    Write-Host "  Existing '$svcName' service found - stopping and removing before reinstall..." -ForegroundColor Yellow
    if ($existing.Status -ne "Stopped") {
      & $python service.py stop
      Start-Sleep -Seconds 2
    }
    & $python service.py remove
  }
  & $python service.py install
  if ($LASTEXITCODE -ne 0) { throw "service.py install exited with code $LASTEXITCODE (see output above)" }
  # Plain "install" registers Manual startup, not Automatic -- it runs fine
  # right after this script starts it below, but silently never comes back
  # on its own after the next reboot/shutdown until someone starts it by
  # hand. "Automatic (Delayed Start)" avoids racing the network stack at
  # boot, which a plain "auto" start can hit before Wi-Fi/Ethernet is up.
  & sc.exe config $svcName start= delayed-auto | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "sc.exe config (delayed-auto startup) exited with code $LASTEXITCODE" }
  & $python service.py start
  if ($LASTEXITCODE -ne 0) { throw "service.py start exited with code $LASTEXITCODE (see output above)" }
} catch {
  Write-Host ""
  Write-Host "Service registration/start failed: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Common causes:" -ForegroundColor Yellow
  Write-Host "  - pywin32 DLLs not registered - re-run this installer, or run manually: python `"$postInstall`" -install"
  Write-Host "  - Leftover service registration from a prior failed install - try: sc.exe delete $svcName"
  Write-Host "  - Not actually elevated despite the prompt - confirm the PowerShell window title says 'Administrator'"
  throw
} finally {
  Pop-Location
}

Start-Sleep -Seconds 2
$svc = Get-Service -Name $svcName -ErrorAction SilentlyContinue
Write-Host ""
Write-Host "Done. Service '$svcName' is: $($svc.Status)" -ForegroundColor Green
Write-Host "AGENT_SECRET length: $($AgentSecret.Length) (store it with this tenant's records)."
Write-Host "Health check any time:  .\install.ps1 -VerifyOnly"
