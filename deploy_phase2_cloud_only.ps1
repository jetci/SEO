# ========================================================================
# Phase 2: CLOUD DEPLOY ONLY SCRIPT (Vercel Production)
# - NO LOCAL DOCKER REQUIRED AT ALL (cloud uses Vercel env DATABASE_URL)
# - INCLUDES XDG ENV WORKAROUND = NO Admin required, NO EPERM errors
# - Can auto-login WITHOUT browser if you set $env:VERCEL_TOKEN first!
#
# HOW TO RUN (OUTSIDE TRAE SANDBOX):
#   Option A (VERCEL_TOKEN, FASTEST, NO BROWSER):
#     1. Go to Vercel.com -> Account Settings -> Tokens -> Create (name: ps-deploy)
#     2. Copy paste the token (starts with "XXXX_...") into command below
#     3. Run in PowerShell normal (no Admin needed):
#        $env:VERCEL_TOKEN="PASTE_YOUR_VERCEL_TOKEN_HERE"
#        cd "d:\AEO\SEO V2"
#        powershell -ExecutionPolicy Bypass -NoProfile -File .\deploy_phase2_cloud_only.ps1 *>&1 | Tee-Object -FilePath deploy_cloud.log
#
#   Option B (browser login, no token):
#     1. Open PowerShell normal outside TRAE sandbox
#     2. Run:
#        cd "d:\AEO\SEO V2"
#        powershell -ExecutionPolicy Bypass -NoProfile -File .\deploy_phase2_cloud_only.ps1 *>&1 | Tee-Object -FilePath deploy_cloud.log
#     3. Script prompts browser OAuth -> click confirm in browser -> back to PS hit Enter
# ========================================================================
param()
$ErrorActionPreference = "Continue"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

# --- Color helpers ---
function Write-Ok    ($s) { Write-Host "  [OK]   $s" -ForegroundColor Green }
function Write-Fail  ($s) { Write-Host "  [FAIL] $s" -ForegroundColor Red   }
function Write-Warn  ($s) { Write-Host "  [WARN] $s" -ForegroundColor Yellow}
function Write-Info  ($s) { Write-Host "  [INFO] $s" -ForegroundColor Cyan  }
function Write-Section ($s) { Write-Host "" ; Write-Host "######## $s ########" -ForegroundColor White -BackgroundColor DarkCyan }
function Write-Banner  ($s) { Write-Host "" ; Write-Host ("=" * 72) -ForegroundColor White ; Write-Host "  $s" -ForegroundColor White -BackgroundColor DarkGreen ; Write-Host ("=" * 72) -ForegroundColor White }

Write-Banner "PHASE 2 CLOUD DEPLOY ONLY (NO LOCAL DOCKER NEEDED)"
Write-Info "Target: vercel.com team_FJYHRav36dr project: prj_gXXwKHF55GgzjMhhp3k6DkX3t6QG"
Write-Info "If you want FAST 1-click no-browser auth, run first:"
Write-Info '   $env:VERCEL_TOKEN="YOUR_VERCEL_ACCOUNT_TOKEN_FROM_VERCEL_COM_ACCOUNT_SETTINGS_TOKENS"'
Write-Host ""

# ========================================================================
# STEP 0: CRITICAL XDG ENV WORKAROUND (no EPERM / no AppData writes)
# ========================================================================
Write-Section "D0  XDG Local Cache + Config Setup (sandbox-friendly)"
$tmpRoot = Join-Path $ScriptDir ".vercel-tmp"
@(
    (Join-Path $tmpRoot ".data"),
    (Join-Path $tmpRoot ".cache"),
    (Join-Path $tmpRoot ".config"),
    (Join-Path $tmpRoot "npm-cache")
) | ForEach-Object { New-Item -ItemType Directory -Force -Path $_ | Out-Null }
$env:XDG_DATA_HOME   = (Resolve-Path (Join-Path $tmpRoot ".data")).Path
$env:XDG_CACHE_HOME  = (Resolve-Path (Join-Path $tmpRoot ".cache")).Path
$env:XDG_CONFIG_HOME = (Resolve-Path (Join-Path $tmpRoot ".config")).Path
$env:npm_config_cache= (Resolve-Path (Join-Path $tmpRoot "npm-cache")).Path
Write-Ok  "XDG_DATA_HOME   = $env:XDG_DATA_HOME"
Write-Info "Vercel CLI will NOT touch %AppData% / %LocalAppData% -> NO EPERM errors"
Write-Info "Testing Vercel CLI version (auto-download cached ~20MB first run) ..."
try {
    $vOut = & npx --yes vercel@latest --version 2>&1 | Out-String
    if ($LASTEXITCODE -eq 0) {
        Write-Ok "Vercel CLI ready: $($vOut.Trim())"
    }
    else {
        Write-Fail "npx vercel failed: $vOut"
        exit 1
    }
}
catch { Write-Fail "Vercel CLI probe exception: $_" ; exit 1 }

# Local helper call: npx --yes vercel@latest ...
function Invoke-Vercel {
    param([Parameter(ValueFromRemainingArguments=$true)]$Args)
    & npx --yes vercel@latest @Args
    return $LASTEXITCODE
}

# ========================================================================
# STEP 1: Auth check (VERCEL_TOKEN env = AUTO LOGIN NO BROWSER)
# ========================================================================
Write-Section "D1  Vercel Authentication"
$hasToken = -not [string]::IsNullOrWhiteSpace($env:VERCEL_TOKEN)
if ($hasToken) {
    Write-Ok "VERCEL_TOKEN env found (length=$($env:VERCEL_TOKEN.Length)) -> Auto auth without browser"
}
try {
    $who = Invoke-Vercel whoami 2>&1 | Out-String
    if ($who -match "not authenticated" -or $who -match "Unauthorized" -or $LASTEXITCODE -ne 0) {
        if ($hasToken) {
            Write-Fail "VERCEL_TOKEN was provided but whoami failed. Token invalid or revoked?"
            Write-Info "Check at vercel.com/account/settings/tokens and re-create a new token."
            exit 2
        }
        Write-Warn "Not authenticated to Vercel."
        Write-Info "=> A browser window will open -> Click 'Continue' to grant Vercel CLI OAuth"
        Write-Info "   (If you want to skip this step: Cancel this run, set `$env:VERCEL_TOKEN and rerun)"
        $null = Read-Host "Press Enter to OPEN browser and complete OAuth login"
        Invoke-Vercel login | Out-Null
        Start-Sleep -Seconds 3
    }
    else {
        Write-Ok "Authenticated to Vercel as: $($who.Trim())"
    }
}
catch { Write-Fail "D1 auth exception: $_" ; exit 3 }

# ========================================================================
# STEP 2: Link project (auto if .vercel/project.json exists)
# ========================================================================
Write-Section "D2  Link Project (id: prj_gXXwKHF55GgzjMhhp3k6DkX3t6QG)"
$linkedFile = Join-Path $ScriptDir ".vercel\project.json"
if (Test-Path $linkedFile) {
    Write-Ok "Project already linked: $linkedFile"
}
else {
    Write-Info "Running: vercel link prj_gXXwKHF55GgzjMhhp3k6DkX3t6QG --yes"
    Invoke-Vercel link "prj_gXXwKHF55GgzjMhhp3k6DkX3t6QG" --yes 2>&1 | ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -ne 0) {
        Write-Warn "vercel link exit=$LASTEXITCODE (may be ok even if prompts occurred)"
    }
}

# ========================================================================
# STEP 3: Pre-deploy local BUILD first (fail fast if build broken)
# ========================================================================
Write-Section "D3  Pre-Deploy Local Typecheck + Build (fail fast)"
Push-Location $ScriptDir
try {
    Write-Info "Typecheck -> tsc --noEmit"
    & npm run typecheck 2>&1 | Select-Object -Last 5
    if ($LASTEXITCODE -ne 0) { Write-Fail "Typecheck exit=$LASTEXITCODE (FIX BEFORE DEPLOY)" ; exit 10 }
    Write-Ok "Typecheck exit 0"
    Write-Info "Vite build -> rollup modules (<= 1900 cap)"
    & npm run build 2>&1 | Select-Object -Last 15
    if ($LASTEXITCODE -ne 0) { Write-Fail "Build exit=$LASTEXITCODE (FIX BEFORE DEPLOY)" ; exit 11 }
    Write-Ok "Build exit 0"
}
catch { Write-Fail "D3 pre-deploy build exception: $_" ; exit 12 }
Pop-Location

# ========================================================================
# STEP 4: PRODUCTION DEPLOY  vercel --prod
# ========================================================================
Write-Section "D4  PRODUCTION DEPLOY: vercel --prod"
Write-Warn "Duration: typically 1-3 minutes (builds on Vercel remote)."
$null = Read-Host "Press Enter to START PRODUCTION DEPLOY NOW"
$deployLog = Join-Path $ScriptDir "deploy_cloud_prod.log"
Invoke-Vercel --prod 2>&1 | Tee-Object -FilePath $deployLog | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -ne 0) {
    Write-Fail "vercel --prod FAILED exit=$LASTEXITCODE. Full output saved: $deployLog"
    exit 20
}
Write-Ok "Deploy process completed."

# ========================================================================
# STEP 5: Extract Production URL + Health Verify (phase=2, research router)
# ========================================================================
Write-Section "D5  Parse Production URL + Cloud Health Check"
$logRaw = Get-Content $deployLog -Raw
$urls = [regex]::Matches($logRaw, "https?://[a-zA-Z0-9\-\.]+vercel\.app[^\s\""']*")
$prodUrl = $null
if ($urls -and $urls.Count -gt 0) {
    $prodUrl = $urls[$urls.Count - 1].Value.TrimEnd('/').Trim()
}
if (-not $prodUrl) {
    Write-Warn "Could not auto-extract URL from deploy log. Find latest 'Production:' line in deploy log, then:"
    Write-Info "Manual verify: Invoke-RestMethod https://YOUR-VERCEL-URL.vercel.app/api/health"
    Write-Info "Expected: phase=2, routers>=10, routers contains 'research'"
    exit 30
}
Write-Ok "Production URL detected: $prodUrl"

Write-Info "Waiting 15 seconds for Vercel Edge warmup (first deploy cold start) ..."
Start-Sleep -Seconds 15
Write-Info "GET $prodUrl/api/health"
try {
    $resp = Invoke-RestMethod -Uri "$prodUrl/api/health" -Method Get -ErrorAction Stop
    $phaseOK    = [string]$resp.phase -eq "2" -or [int]$resp.phase -eq 2
    $routerOK   = [int]$resp.routers.Count -ge 10
    $researchOK = $resp.routers -contains "research"
    Write-Host ""
    Write-Host ("=" * 72) -ForegroundColor White
    Write-Host "  CLOUD HEALTH RESULT" -ForegroundColor White -BackgroundColor DarkMagenta
    Write-Host ("=" * 72) -ForegroundColor White
    Write-Info "Production URL   : $prodUrl"
    Write-Info "phase            : $($resp.phase)          (expected: 2)        -> $(&{if($phaseOK){'PASS'}else{'FAIL'}})"
    Write-Info "routers count    : $($resp.routers.Count)         (expected: >=10)     -> $(&{if($routerOK){'PASS'}else{'FAIL'}})"
    Write-Info "has research rtr : $researchOK      (expected: True)     -> $(&{if($researchOK){'PASS'}else{'FAIL'}})"
    Write-Info "env_health       : $($resp.env_health)"
    Write-Info "setup_required   : $($resp.setup_required)"
    Write-Info "allowedOrigins n : $($resp.allowedOrigins.Count)"
    Write-Host ("=" * 72) -ForegroundColor White
    if ($phaseOK -and $routerOK -and $researchOK) {
        Write-Ok "CLOUD DEPLOY 100% SUCCESS: PHASE 2 LIVE ON PRODUCTION"
        Write-Host ""
        Write-Info "QUICK VERIFY CHECKLIST (open in browser):"
        Write-Info "   1) $prodUrl/login         -> Login page loads"
        Write-Info "   2) $prodUrl/settings      -> SettingsPage loads, NO redirect to /"
        Write-Info "   3) $prodUrl/projects      -> Projects list shows 7 demo cards after login"
        Write-Info "   4) $prodUrl/kcp           -> Keyword Cluster Planner shows SV/KD badges + Enrich buttons"
        Write-Host ""
        exit 0
    }
    else {
        Write-Warn "Some health criteria not met. Edge warmup usually resolves in 60s."
        Write-Info "Manual retry: Invoke-RestMethod '$prodUrl/api/health'"
        exit 31
    }
}
catch {
    Write-Warn "Health request exception (usually edge still warming 30-90s): $_"
    Write-Info "Your deployed URL: $prodUrl"
    Write-Info "Run in 60s: Invoke-RestMethod '$prodUrl/api/health'"
    exit 32
}
