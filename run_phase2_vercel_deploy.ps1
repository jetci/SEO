# ========================================================================
# Phase 2 Vercel Production Deploy Script
# Pure ASCII version for PowerShell locale compatibility
# Run OUTSIDE TRAE sandbox in an ELEVATED (Run as Administrator) PowerShell.
# Usage:
#   cd "d:\AEO\SEO V2"
#   powershell -ExecutionPolicy Bypass -File .\run_phase2_vercel_deploy.ps1
# ========================================================================
param()
$ErrorActionPreference = "Continue"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

# --- ASCII helpers ---
function Write-Ok    ($s) { Write-Host "  [OK]   $s" -ForegroundColor Green }
function Write-Fail  ($s) { Write-Host "  [FAIL] $s" -ForegroundColor Red   }
function Write-Warn  ($s) { Write-Host "  [WARN] $s" -ForegroundColor Yellow}
function Write-Info  ($s) { Write-Host "  [INFO] $s" -ForegroundColor Cyan  }
function Write-Section ($s) { Write-Host "" ; Write-Host "===== $s =====" -ForegroundColor White -BackgroundColor DarkMagenta }

$PROJECT_ID = "prj_gXXwKHF55GgzjMhhp3k6DkX3t6QG"

# ========================================================================
# Vercel CLI invoker: PREFER global "vercel" if available; otherwise FALLBACK to "npx --yes vercel@latest"
# Eliminates mandatory ADMIN-global install requirement.
# ========================================================================
$global:UseNpxFallback = $false
function Invoke-Vercel {
    param(
        [Parameter(ValueFromRemainingArguments = $true)]
        $Args
    )
    if ($global:UseNpxFallback) {
        & npx --yes vercel@latest @Args
    }
    else {
        & vercel @Args
    }
    return $LASTEXITCODE
}

# ========================================================================
# D1: Verify Vercel CLI reachable (global first, fallback to npx auto-download on first call)
# ========================================================================
Write-Section "D1  Vercel CLI Availability Check (global -> npx fallback)"
try {
    $cmd = Get-Command vercel -ErrorAction SilentlyContinue
    if ($cmd) {
        $verOut = & vercel --version 2>$null
        if ($LASTEXITCODE -eq 0 -and $verOut) {
            Write-Ok "Vercel CLI global installed: version $verOut"
            $global:UseNpxFallback = $false
        }
        else {
            Write-Warn "Global vercel binary broken -> fallback to npx vercel@latest (auto-downloads on first use, no Admin required)"
            $global:UseNpxFallback = $true
        }
    }
    else {
        Write-Info "Global Vercel CLI NOT installed (ADMIN not required)."
        Write-Info "Fallback: Using  npx --yes vercel@latest  (auto-download cached version, runs WITHOUT global install)"
        $global:UseNpxFallback = $true
        Write-Info "Probing npx vercel --version (first call will download Vercel CLI ~20MB, please wait 10-30s) ..."
        $probeOut = & npx --yes vercel@latest --version 2>&1 | Out-String
        if ($LASTEXITCODE -eq 0 -and $probeOut -match "\d") {
            Write-Ok "npx vercel probe OK: version $probeOut"
        }
        else {
            Write-Warn "npx vercel probe returned exit=$LASTEXITCODE output=$probeOut"
            Write-Info "Fallback plan: Try PowerShell ADMIN manual:  npm install -g vercel"
            Write-Info "Or continue anyway - script will attempt npx fallback on every vercel invocation."
        }
    }
}
catch {
    Write-Warn "D1 fallback chain exception -> will try npx fallback on each call: $_"
    $global:UseNpxFallback = $true
}

# ========================================================================
# D2: Vercel login check (interactive browser if not authenticated)
# ========================================================================
Write-Section "D2  Vercel Account Login"
try {
    $who = Invoke-Vercel whoami 2>&1 | Out-String
    if ($who -match "not authenticated" -or $who -match "Error" -or $who -match "Unauthorized" -or $LASTEXITCODE -ne 0) {
        Write-Warn "Not authenticated to Vercel."
        Write-Info "A browser window will open for OAuth login. After login completes, come back and press Enter to continue."
        $null = Read-Host "Press Enter to open vercel login in browser"
        Invoke-Vercel login
        Start-Sleep -Seconds 2
    }
    else {
        Write-Ok "Vercel session active: $who"
    }
}
catch {
    Write-Warn "D2 login check skipped. If later steps fail auth, run: Invoke-Vercel login"
}

# ========================================================================
# D3: Link project (if not already linked)
# ========================================================================
Write-Section "D3  Vercel Link Project (ID: $PROJECT_ID)"
$linkedFile = Join-Path $ScriptDir ".vercel\project.json"
if (-not (Test-Path $linkedFile)) {
    Write-Info ".vercel/project.json missing -> running vercel link."
    Write-Info "Prompt answers (if interactive): Set up? Y  Scope? (pick your team)  Link to existing? Y  Project ID paste: $PROJECT_ID"
    Invoke-Vercel link $PROJECT_ID --yes 2>&1 | ForEach-Object { Write-Host $_ }
}
else {
    Write-Ok "Project already linked (found: $linkedFile)."
}

# ========================================================================
# D4: Production deploy (vercel --prod)
# ========================================================================
Write-Section "D4  Deploy to Production: vercel --prod  (1-3 minutes, be patient)"
$null = Read-Host "Press Enter to START production deploy now"
$deployLog = Join-Path $ScriptDir "deploy_prod.log"
Invoke-Vercel --prod 2>&1 | Tee-Object -FilePath $deployLog | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -ne 0) {
    Write-Fail "vercel --prod failed (exit=$LASTEXITCODE). See: $deployLog"
    exit 1
}

# Parse last vercel.app URL from deploy log
$logContent = Get-Content $deployLog -Raw
$matchesUrl = [regex]::Matches($logContent, "https?://[a-zA-Z0-9\-\.]+vercel\.app[^\s\""']*")
$prodUrl = $null
if ($matchesUrl -and $matchesUrl.Count -gt 0) {
    $prodUrl = $matchesUrl[$matchesUrl.Count - 1].Value.TrimEnd('/')
}

if (-not $prodUrl) {
    Write-Warn "Could not auto-extract production URL from deploy log."
    Write-Info "Open Vercel project dashboard to get URL, then run manually:  Invoke-RestMethod https://<URL>/api/health"
    exit 0
}

Write-Ok "Production deploy successful: $prodUrl"

# ========================================================================
# D5: Cloud Health check (phase=2 routers.length=10 has 'research')
# ========================================================================
Write-Section "D5  Cloud Health Check: GET $prodUrl/api/health"
Start-Sleep -Seconds 10
try {
    $resp = Invoke-RestMethod -Uri "$prodUrl/api/health" -Method Get -ErrorAction Stop
    $phaseOK    = [string]$resp.phase -eq "2" -or [int]$resp.phase -eq 2
    $routerOK   = [int]$resp.routers.Count -ge 10
    $researchOK = $resp.routers -contains "research"

    Write-Info ("phase="    + $resp.phase          + "  (expect 2)")
    Write-Info ("routers="  + $resp.routers.Count  + "  (expect >=10)")
    Write-Info ("has research router: " + $researchOK)
    Write-Info ("env_health: " + $resp.env_health)

    if ($phaseOK -and $routerOK -and $researchOK) {
        Write-Ok "CLOUD HEALTH PASS: phase=2 + routers includes research"
        Write-Ok "DEPLOY COMPLETE -> Production URL: $prodUrl"
        Write-Info "Send BOTH the production URL and this health output back to implementer."
        exit 0
    }
    else {
        Write-Warn "Health criteria not fully satisfied (see above). Sometimes edge needs 30-60s more warmup."
        Write-Info "Re-check later with:  Invoke-RestMethod '$prodUrl/api/health'"
        exit 2
    }
}
catch {
    Write-Warn "Health request exception (edge may still be warming up): $_"
    Write-Info "Re-check in 1 minute with:  Invoke-RestMethod '$prodUrl/api/health'"
    exit 2
}
