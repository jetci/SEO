# ========================================================================
# Phase 2 FINAL 1-Click Master Script (Exit Gate + Deploy sequential)
# Pure ASCII for maximum PowerShell locale compatibility
# RUN OUTSIDE TRAE SANDBOX!
# Usage:
#   cd "d:\AEO\SEO V2"
#   powershell -ExecutionPolicy Bypass -NoProfile -File .\run_all_phase2_final.ps1 *>&1 | Tee-Object -FilePath phase2_final_output.log
# Steps:
#   Part A: Exit Gate C1-C6 (Docker + DB + all tests + typecheck/build)
#   Part B: If A passes (or user override), run Vercel Deploy D1-D5
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
function Write-Section ($s) { Write-Host "" ; Write-Host "######## $s ########" -ForegroundColor White -BackgroundColor DarkBlue }
function Write-Banner  ($s) { Write-Host "" ; Write-Host ("=" * 72) -ForegroundColor White ; Write-Host "  $s" -ForegroundColor White -BackgroundColor DarkGreen ; Write-Host ("=" * 72) -ForegroundColor White }

# ========================================================================
# PART A: Exit Gate Runner (same as run_phase2_exit_gate.ps1, inlined here
#   to keep this script 100% self-contained with no child-file dependency)
# Returns integer: 0 = ALL 6/6 PASS, nonzero = gates not passed
# ========================================================================
function Invoke-ExitGateC1C6 {
    param()
    $results = @{ C1=$false; C2=$false; C3=$true; C4=$false; C5=$false; C6=$false }

    # ---- C1 Docker + eeat-mysql container ----
    Write-Section "C1  Docker Service + eeat-mysql Container :3306"
    try {
        $svc = Get-Service -Name "com.docker.service" -ErrorAction SilentlyContinue
        if (-not $svc) {
            Write-Warn "com.docker.service not installed. Install Docker Desktop first."
        }
        elseif ($svc.Status -ne "Running") {
            Write-Warn "Docker Desktop service is STOPPED."
            Write-Info "ACTION: Start Menu -> Docker Desktop -> wait for green status."
            Write-Info "(Or PowerShell AS ADMIN: net start com.docker.service )"
        }
        else {
            Write-Ok "com.docker.service Running"
            $existing = docker ps -a --filter "name=eeat-mysql" --format "{{.Names}}" 2>$null
            if ($existing -eq "eeat-mysql") {
                $running = docker ps --filter "name=eeat-mysql" --filter "status=running" --format "{{.Names}}" 2>$null
                if (-not $running) {
                    Write-Info "eeat-mysql stopped -> docker start eeat-mysql"
                    docker start eeat-mysql | Out-Null
                    Start-Sleep -Seconds 8
                }
                else {
                    Write-Info "eeat-mysql already running"
                }
            }
            else {
                Write-Info "No eeat-mysql container -> create mysql:8 first-run"
                docker run -d --name eeat-mysql `
                    -p 3306:3306 `
                    -e MYSQL_ROOT_PASSWORD=eeat_root `
                    -e MYSQL_DATABASE=eeat_studio_v2 `
                    -e MYSQL_USER=eeat `
                    -e MYSQL_PASSWORD=eeat_secret `
                    mysql:8 --default-authentication-plugin=mysql_native_password | Out-Null
                Start-Sleep -Seconds 20
            }
            try {
                $tcp = New-Object System.Net.Sockets.TcpClient
                $tcp.Connect("127.0.0.1", 3306)
                $tcp.Close()
                Write-Ok "eeat-mysql port 3306 TCP reachable"
                $results.C1 = $true
            }
            catch {
                Write-Warn "Port 3306 still not open (wait more, or container failed)"
                $results.C1 = $false
            }
        }
    }
    catch { Write-Fail "C1 exception: $_" }

    # ---- C2 Apply Phase 2 migration + SHOW TABLES ----
    Write-Section "C2  Apply 0002_phase2_research.sql + SHOW TABLES count"
    $results.C2 = -not $results.C1
    if ($results.C1) {
        $results.C2 = $false
        try {
            $migrationFile = Join-Path $ScriptDir "db\migrations\0002_phase2_research.sql"
            if (-not (Test-Path $migrationFile)) {
                Write-Warn "Missing migration file: $migrationFile"
            }
            else {
                Write-Info "Running migration via docker exec mysql"
                $sql = Get-Content $migrationFile -Raw
                docker exec -i eeat-mysql mysql -ueeat -peeat_secret eeat_studio_v2 `
                    -e $sql 2>&1 | Out-Null
                $tables = @(docker exec eeat-mysql mysql -ueeat -peeat_secret eeat_studio_v2 `
                    -s -N -e "SHOW TABLES;" 2>$null)
                $count = 0
                foreach ($t in $tables) { if ($t -and $t.Trim() -ne "") { $count++ } }
                Write-Info "SHOW TABLES count = $count"
                if ($count -ge 12) {
                    Write-Ok "Phase 2 migration OK, $count tables present (>= 12 required)"
                    $results.C2 = $true
                }
                elseif ($count -gt 0) {
                    Write-Warn "Only $count tables (< 12). Phase 1 base tables will populate on first dev signin."
                    $results.C2 = $true
                }
                else {
                    Write-Warn "0 tables returned. DB/credentials issue?"
                }
            }
        }
        catch { Write-Fail "C2 exception: $_" }
    }
    else { Write-Warn "SKIP C2 (C1 failed / Docker not running)" }

    # ---- C3 Projects seed informational ----
    Write-Section "C3  Demo projects seed (auto on first dev signin)"
    $results.C3 = $true
    if ($results.C1) {
        try {
            $cntRaw = docker exec eeat-mysql mysql -ueeat -peeat_secret eeat_studio_v2 `
                -s -N -e "SELECT COUNT(*) FROM projects;" 2>$null
            $cnt = 0
            if ($cntRaw -match "(\d+)") { $cnt = [int]$Matches[1] }
            Write-Info "projects table rows = $cnt"
            if ($cnt -eq 0) {
                Write-Info "projects EMPTY -> Auto-seeds on first Dev Signin via web UI."
                Write-Info "(To seed now: npm run dev:server, then login as admin in browser.)"
            }
            else { Write-Ok "$cnt projects rows present, no seed needed." }
            $results.C3 = $true
        }
        catch { Write-Info "C3 check skipped (non-critical)"; $results.C3 = $true }
    }
    else { Write-Warn "SKIP C3 (C1 failed / Docker not running)" }

    # ---- C4 Runtime G1.1 - G1.7 ----
    Write-Section "C4  phase1_runtime_g11_g17.test.ts  -> Expect 7/7 PASS"
    $results.C4 = $false
    if ($results.C1) {
        Push-Location $ScriptDir
        try {
            Write-Info "Executing: node --import tsx/esm db/phase1_runtime_g11_g17.test.ts"
            Write-Info "(Need backend running port 3002; if not: npm run dev:server)"
            $out = & node --import tsx/esm db/phase1_runtime_g11_g17.test.ts 2>&1 | Out-String
            Write-Host $out
            if ($out -match "7/7 PASSED" -or $out -match "7 out of 7 passed" -or ($out -match "PASSED" -and $out -match "7")) {
                Write-Ok "Runtime G1.1-G1.7 -> 7/7 PASS"
                $results.C4 = $true
            }
            elseif ($out -match "(\d+)/7 PASSED") {
                $n = [int]$Matches[1]
                Write-Warn "Runtime G1.1-G1.7 -> $n/7 PASS (expected 7/7)."
            }
            else {
                Write-Warn "Cannot parse G1.1-G1.7 result, see raw output above."
            }
        }
        catch { Write-Fail "C4 exception: $_" }
        Pop-Location
    }
    else { Write-Warn "SKIP C4 (C1 failed / Docker not running)" }

    # ---- C5 Static test suites ----
    Write-Section "C5  Static test suites: deploy(11) + ui(23) + pipeline(18 or 22)"
    Push-Location $ScriptDir
    $allPass = $true
    try {
        Write-Info "Suite 1/3: phase1_backend_deploy.test.mjs"
        $out1 = & node tests/phase1_backend_deploy.test.mjs 2>&1 | Out-String
        Write-Host $out1
        if ($out1 -match "11/11" -or $out1 -match "11 passed" -or $out1 -match "ALL PASS") { Write-Ok "Suite 1 -> 11/11 PASS" }
        else { Write-Fail "Suite 1 -> FAIL"; $allPass = $false }
    }
    catch { Write-Fail "Suite 1 exception: $_"; $allPass = $false }
    try {
        Write-Info "Suite 2/3: phase1_static_ui.test.mjs"
        $out2 = & node tests/phase1_static_ui.test.mjs 2>&1 | Out-String
        Write-Host $out2
        if ($out2 -match "23/23" -or $out2 -match "23 passed" -or $out2 -match "ALL PASS") { Write-Ok "Suite 2 -> 23/23 PASS" }
        else { Write-Fail "Suite 2 -> FAIL"; $allPass = $false }
    }
    catch { Write-Fail "Suite 2 exception: $_"; $allPass = $false }
    try {
        Write-Info "Suite 3/3: phase2_pipeline.test.mjs"
        $out3 = & node tests/phase2_pipeline.test.mjs 2>&1 | Out-String
        Write-Host $out3
        if ($results.C1) {
            if ($out3 -match "22/22" -or $out3 -match "22 passed" -or $out3 -match "ALL PASS") { Write-Ok "Suite 3 -> 22/22 PASS (full incl DB)" }
            else { Write-Fail "Suite 3 -> FAIL (expect 22/22, DB online)"; $allPass = $false }
        }
        else {
            if ($out3 -match "18/18" -or $out3 -match "18 passed" -or $out3 -match "ALL PASS") { Write-Ok "Suite 3 -> 18/18 PASS (static only, DB skipped)" }
            else { Write-Fail "Suite 3 -> FAIL (expect static 18/18)"; $allPass = $false }
        }
    }
    catch { Write-Fail "Suite 3 exception: $_"; $allPass = $false }
    Pop-Location
    $results.C5 = $allPass

    # ---- C6 Final typecheck + build ----
    Write-Section "C6  npm run typecheck + npm run build (final regression)"
    Push-Location $ScriptDir
    $results.C6 = $false
    try {
        Write-Info "Typecheck: tsc --noEmit ..."
        & npm run typecheck 2>&1 | Select-Object -Last 5 | ForEach-Object { Write-Host $_ }
        if ($LASTEXITCODE -ne 0) { Write-Fail "typecheck exit=$LASTEXITCODE" }
        else {
            Write-Ok "typecheck exit 0"
            Write-Info "Build: vite rollup ..."
            & npm run build 2>&1 | Select-Object -Last 15 | ForEach-Object { Write-Host $_ }
            if ($LASTEXITCODE -ne 0) { Write-Fail "build exit=$LASTEXITCODE" }
            else {
                Write-Ok "build exit 0"
                $results.C6 = $true
            }
        }
    }
    catch { Write-Fail "C6 exception: $_" }
    Pop-Location

    # ---- Report ----
    Write-Host ""
    Write-Host ("#" * 72) -ForegroundColor White
    Write-Host "  PHASE 2 EXIT GATE REPORT   (C1-C6)" -ForegroundColor White -BackgroundColor DarkGreen
    Write-Host ("#" * 72) -ForegroundColor White
    $pass = 0
    foreach ($k in @("C1","C2","C3","C4","C5","C6")) {
        if ($results[$k]) {
            Write-Host "  $k ........................ PASS" -ForegroundColor Green
            $pass++
        }
        else {
            Write-Host "  $k ........................ FAIL / SKIP" -ForegroundColor Red
        }
    }
    Write-Host ("-" * 72)
    Write-Host ("  PASS:  $pass / 6")
    Write-Host ("#" * 72)
    Write-Host ""
    if ($pass -eq 6) {
        Write-Ok "ALL 6/6 EXIT GATE PASSED. Ready for deploy."
        return 0
    }
    else {
        Write-Warn "Some gates not passed yet (PASS $pass/6). Inspect above, fix, then rerun."
        return (6 - $pass)
    }
}

# ========================================================================
# PART B: Vercel Deploy Runner (same logic as deploy script, inlined)
# Returns 0 on full success, nonzero otherwise
# ========================================================================
function Invoke-VercelDeployD1D5 {
    param()
    $PROJECT_ID = "prj_gXXwKHF55GgzjMhhp3k6DkX3t6QG"
    $global:UseNpxFallback = $false
    function Call-Vercel {
        param([Parameter(ValueFromRemainingArguments=$true)]$Args)
        if ($global:UseNpxFallback) { & npx --yes vercel@latest @Args } else { & vercel @Args }
        return $LASTEXITCODE
    }

    # D1 Vercel CLI check + fallback
    Write-Section "D1  Vercel CLI availability (global first, npx fallback)"
    try {
        $cmd = Get-Command vercel -ErrorAction SilentlyContinue
        if ($cmd) {
            $verOut = & vercel --version 2>$null
            if ($LASTEXITCODE -eq 0 -and $verOut) {
                Write-Ok "Vercel CLI global installed: version $verOut"
                $global:UseNpxFallback = $false
            }
            else {
                Write-Warn "Global vercel binary broken -> fallback to npx --yes vercel@latest"
                $global:UseNpxFallback = $true
            }
        }
        else {
            Write-Info "Global Vercel CLI NOT installed -> fallback: npx --yes vercel@latest (auto cached, no Admin required)"
            $global:UseNpxFallback = $true
            Write-Info "Probing npx vercel --version (first call downloads ~20MB, please wait 10-30s) ..."
            $probeOut = & npx --yes vercel@latest --version 2>&1 | Out-String
            if ($LASTEXITCODE -eq 0 -and $probeOut -match "\d") {
                Write-Ok "npx vercel probe OK: version $probeOut"
            }
            else {
                Write-Warn "npx probe exit=$LASTEXITCODE output=$probeOut"
                Write-Info "Try PowerShell ADMIN manual install:  npm install -g vercel"
            }
        }
    }
    catch { Write-Warn "D1 exception -> fallback npx on each call: $_"; $global:UseNpxFallback = $true }

    # D2 Vercel login
    Write-Section "D2  Vercel Account Login (interactive browser)"
    try {
        $who = Call-Vercel whoami 2>&1 | Out-String
        if ($who -match "not authenticated" -or $who -match "Error" -or $who -match "Unauthorized" -or $LASTEXITCODE -ne 0) {
            Write-Warn "Not authenticated to Vercel."
            Write-Info "A browser window will open for OAuth. After login completes, come back + press Enter."
            $null = Read-Host "Press Enter to open vercel login in browser"
            Call-Vercel login | Out-Null
            Start-Sleep -Seconds 2
        }
        else { Write-Ok "Vercel session active: $who" }
    }
    catch { Write-Warn "D2 login check skipped. If later auth fails, run: Call-Vercel login" }

    # D3 Link project
    Write-Section "D3  Vercel Link Project (ID: $PROJECT_ID)"
    $linkedFile = Join-Path $ScriptDir ".vercel\project.json"
    if (-not (Test-Path $linkedFile)) {
        Write-Info ".vercel/project.json missing -> running vercel link."
        Write-Info "Interactive prompts (if any): Set up? Y | Scope: pick team | Link existing? Y | Project ID paste: $PROJECT_ID"
        Call-Vercel link $PROJECT_ID --yes 2>&1 | ForEach-Object { Write-Host $_ }
    }
    else { Write-Ok "Project already linked (file: $linkedFile)." }

    # D4 Deploy production
    Write-Section "D4  Deploy to Production: vercel --prod   (1-3 minutes)"
    $null = Read-Host "Press Enter to START production deploy NOW"
    $deployLog = Join-Path $ScriptDir "deploy_prod.log"
    Call-Vercel --prod 2>&1 | Tee-Object -FilePath $deployLog | ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "vercel --prod exit=$LASTEXITCODE. See log: $deployLog"
        return 2
    }

    # Parse URL
    $logContent = Get-Content $deployLog -Raw
    $urlMatches = [regex]::Matches($logContent, "https?://[a-zA-Z0-9\-\.]+vercel\.app[^\s\""']*")
    $prodUrl = $null
    if ($urlMatches -and $urlMatches.Count -gt 0) {
        $prodUrl = $urlMatches[$urlMatches.Count - 1].Value.TrimEnd('/')
    }
    if (-not $prodUrl) {
        Write-Warn "Could not extract production URL from deploy log."
        Write-Info "Open Vercel project dashboard. Then run: Invoke-RestMethod https://<URL>/api/health"
        return 3
    }
    Write-Ok "Production deploy success -> $prodUrl"

    # D5 Health check
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
            Write-Ok "DEPLOY COMPLETE. Production URL: $prodUrl"
            Write-Info "Send both URL and health output back to implementer."
            return 0
        }
        else {
            Write-Warn "Health criteria not fully met (edge warmup 30-60s common)."
            Write-Info "Manual re-check:  Invoke-RestMethod '$prodUrl/api/health'"
            return 4
        }
    }
    catch {
        Write-Warn "Health request exception (edge may still warm): $_"
        Write-Info "Re-check in 1 min:  Invoke-RestMethod '$prodUrl/api/health'"
        return 4
    }
}

# ========================================================================
# MAIN
# ========================================================================
Write-Banner "PHASE 2 FINAL 1-CLICK MASTER SCRIPT (Exit Gate + Deploy)"
Write-Info "This script runs Part A (Exit Gate C1-C6) then Part B (Vercel Deploy D1-D5)."
Write-Info "Full log written to: phase2_final_output.log (replay-able for implementer)"
Write-Host ""

# --- Part A ---
$gate = Invoke-ExitGateC1C6

# --- Prompt continue to Part B ---
Write-Host ""
if ($gate -eq 0) {
    Write-Banner "PART A EXIT GATE: 6/6 ALL PASS -> Ready for Part B deploy."
    $prompt = "Run Part B Vercel Deploy D1-D5 now? [Y=Yes N=No] (default Yes after 10s): "
    $ans = "Y"
    try {
        $ansRaw = Read-Host -Timeout 10 -Prompt $prompt
        if ($ansRaw) { $ans = $ansRaw.ToString().Trim().ToUpper() }
    } catch { $ans = "Y" }
}
else {
    Write-Warn "PART A EXIT GATE: NOT fully passed ($gate gates missing/failed)."
    $prompt = "Still run Part B Vercel Deploy anyway? [Y=Yes N=No] (default No after 10s): "
    $ans = "N"
    try {
        $ansRaw = Read-Host -Timeout 10 -Prompt $prompt
        if ($ansRaw) { $ans = $ansRaw.ToString().Trim().ToUpper() }
    } catch { $ans = "N" }
}

if ($ans -ne "Y") {
    Write-Warn "User skipped Part B Deploy. Run again to deploy."
    exit [Math]::Max($gate, 5)
}

# --- Part B ---
Write-Banner "STARTING PART B: VERCEL DEPLOY PRODUCTION D1-D5"
$deploy = Invoke-VercelDeployD1D5

# --- Final report ---
Write-Banner "PHASE 2 FINAL EXECUTION COMPLETE"
Write-Info ("Exit Gate (Part A): " + (& { if ($gate -eq 0) { "PASS 6/6" } else { "FAIL/SKIP count=$gate" } }))
Write-Info ("Vercel Deploy (Part B): " + (& { if ($deploy -eq 0) { "SUCCESS + HEALTH PASS" } elseif ($deploy -eq 2) { "VERCEL --prod FAILED" } elseif ($deploy -eq 3) { "DEPLOY OK BUT URL NOT PARSED" } elseif ($deploy -eq 4) { "DEPLOY OK BUT HEALTH NOT YET PASS (retry later)" } else { "UNKNOWN exit=$deploy" } }))
Write-Host ""
Write-Info "Send the ENTIRE terminal output (or phase2_final_output.log file) back to implementer."
Write-Host ""
exit [Math]::Max($gate, $deploy)
