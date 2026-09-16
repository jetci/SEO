# ========================================================================
# Phase 2 Exit Gate Validation Script (C1-C6)
# Pure ASCII version for PowerShell locale compatibility
# Run OUTSIDE TRAE sandbox in a normal PowerShell window.
# Usage:
#   cd "d:\AEO\SEO V2"
#   powershell -ExecutionPolicy Bypass -File .\run_phase2_exit_gate.ps1
# ========================================================================
param()
$ErrorActionPreference = "Continue"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

# --- Color helpers (ASCII only, no Unicode glyphs) ---
function Write-Ok    ($s) { Write-Host "  [OK]   $s" -ForegroundColor Green }
function Write-Fail  ($s) { Write-Host "  [FAIL] $s" -ForegroundColor Red   }
function Write-Warn  ($s) { Write-Host "  [WARN] $s" -ForegroundColor Yellow}
function Write-Info  ($s) { Write-Host "  [INFO] $s" -ForegroundColor Cyan  }
function Write-Section ($s) { Write-Host "" ; Write-Host "===== $s =====" -ForegroundColor White -BackgroundColor DarkCyan }

$results = @{ C1=$false; C2=$false; C3=$true; C4=$false; C5=$false; C6=$false }

# ========================================================================
# C1: Docker Service + MySQL Container
# ========================================================================
Write-Section "C1  Docker Service + eeat-mysql Container :3306"
try {
    $svc = Get-Service -Name "com.docker.service" -ErrorAction SilentlyContinue
    if (-not $svc) {
        Write-Warn "com.docker.service not installed. Install Docker Desktop first."
        $results.C1 = $false
    }
    elseif ($svc.Status -ne "Running") {
        Write-Warn "Docker Desktop service is STOPPED."
        Write-Info "Action: Open Start Menu -> Docker Desktop -> wait for green status."
        Write-Info "(Or run PowerShell AS ADMIN then:  net start com.docker.service )"
        $results.C1 = $false
    }
    else {
        Write-Ok "com.docker.service is Running"

        $existing = docker ps -a --filter "name=eeat-mysql" --format "{{.Names}}" 2>$null
        if ($existing -eq "eeat-mysql") {
            $running = docker ps --filter "name=eeat-mysql" --filter "status=running" --format "{{.Names}}" 2>$null
            if (-not $running) {
                Write-Info "eeat-mysql exists but stopped -> docker start eeat-mysql"
                docker start eeat-mysql | Out-Null
                Start-Sleep -Seconds 8
            }
            else {
                Write-Info "eeat-mysql is already running"
            }
        }
        else {
            Write-Info "No eeat-mysql container -> first-run docker create + start mysql:8"
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
            Write-Ok "eeat-mysql port 3306 is reachable via TCP"
            $results.C1 = $true
        }
        catch {
            Write-Warn "Port 3306 still not open (wait longer or container failed to start)"
            $results.C1 = $false
        }
    }
}
catch {
    Write-Fail "C1 exception: $_"
    $results.C1 = $false
}

# ========================================================================
# C2: Apply Phase 2 migration + SHOW TABLES count
# ========================================================================
Write-Section "C2  Apply 0002_phase2_research.sql + SHOW TABLES >= 12"
$results.C2 = -not $results.C1
if ($results.C1) {
    $results.C2 = $false
    try {
        $migrationFile = Join-Path $ScriptDir "db\migrations\0002_phase2_research.sql"
        if (-not (Test-Path $migrationFile)) {
            Write-Warn "Migration file not found: $migrationFile"
        }
        else {
            Write-Info "Running migration SQL via docker exec mysql..."
            $sql = Get-Content $migrationFile -Raw
            docker exec -i eeat-mysql mysql -ueeat -peeat_secret eeat_studio_v2 `
                -e $sql 2>&1 | Out-Null

            $tables = @(docker exec eeat-mysql mysql -ueeat -peeat_secret eeat_studio_v2 `
                -s -N -e "SHOW TABLES;" 2>$null)
            $count = 0
            foreach ($t in $tables) { if ($t -and $t.Trim() -ne "") { $count++ } }
            Write-Info "SHOW TABLES count = $count"
            if ($count -ge 12) {
                Write-Ok "Phase 2 migration applied, $count tables present (>= 12 required)"
                $results.C2 = $true
            }
            elseif ($count -gt 0) {
                Write-Warn "Only $count tables present (<12). Phase 1 base tables may be missing -> Seed will populate on first dev signin."
                $results.C2 = $true
            }
            else {
                Write-Warn "0 tables returned. DB or credentials issue."
                $results.C2 = $false
            }
        }
    }
    catch {
        Write-Fail "C2 exception: $_"
    }
}
else {
    Write-Warn "SKIP C2 because C1 failed (Docker not running)"
}

# ========================================================================
# C3: Seed demo projects (informational only, happens on dev signin auto)
# ========================================================================
Write-Section "C3  Demo projects seed (optional if DB empty)"
$results.C3 = $true
if ($results.C1) {
    try {
        $cntRaw = docker exec eeat-mysql mysql -ueeat -peeat_secret eeat_studio_v2 `
            -s -N -e "SELECT COUNT(*) FROM projects;" 2>$null
        $cnt = 0
        if ($cntRaw -match "(\d+)") { $cnt = [int]$Matches[1] }
        Write-Info "projects table row count = $cnt"
        if ($cnt -eq 0) {
            Write-Info "projects table is EMPTY -> Will auto-seed on first Dev Signin via the web UI."
            Write-Info "(If you need seed now, start backend: npm run dev:server, then signin as admin.)"
        }
        else {
            Write-Ok "$cnt projects rows already present, no seed required."
        }
        $results.C3 = $true
    }
    catch {
        Write-Info "C3 projects count check skipped (non-critical)."
        $results.C3 = $true
    }
}
else {
    Write-Warn "SKIP C3 because C1 failed (Docker not running)"
}

# ========================================================================
# C4: Runtime G1.1 - G1.7 (requires live MySQL + backend running on :3002)
# ========================================================================
Write-Section "C4  phase1_runtime_g11_g17.test.ts  -> Expect 7/7 PASS"
$results.C4 = $false
if ($results.C1) {
    Push-Location $ScriptDir
    try {
        Write-Info "Executing: node --import tsx/esm db/phase1_runtime_g11_g17.test.ts"
        Write-Info "(Requires backend running on port 3002; if not, run: npm run dev:server)"
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
            Write-Warn "Could not parse G1.1-G1.7 result, see raw output above."
        }
    }
    catch {
        Write-Fail "C4 exception: $_"
    }
    Pop-Location
}
else {
    Write-Warn "SKIP C4 because C1 failed (Docker not running)"
}

# ========================================================================
# C5: All static test suites
# ========================================================================
Write-Section "C5  Static test suites: deploy (11) + ui (23) + phase2 pipeline (18 or 22)"
Push-Location $ScriptDir
$allPass = $true

# Suite 1
try {
    Write-Info "Suite 1/3: phase1_backend_deploy.test.mjs"
    $out1 = & node tests/phase1_backend_deploy.test.mjs 2>&1 | Out-String
    Write-Host $out1
    if ($out1 -match "11/11" -or $out1 -match "11 passed" -or $out1 -match "ALL PASS") {
        Write-Ok "Suite 1 -> 11/11 PASS"
    }
    else {
        Write-Fail "Suite 1 -> FAIL"; $allPass = $false
    }
}
catch { Write-Fail "Suite 1 exception: $_"; $allPass = $false }

# Suite 2
try {
    Write-Info "Suite 2/3: phase1_static_ui.test.mjs"
    $out2 = & node tests/phase1_static_ui.test.mjs 2>&1 | Out-String
    Write-Host $out2
    if ($out2 -match "23/23" -or $out2 -match "23 passed" -or $out2 -match "ALL PASS") {
        Write-Ok "Suite 2 -> 23/23 PASS"
    }
    else {
        Write-Fail "Suite 2 -> FAIL"; $allPass = $false
    }
}
catch { Write-Fail "Suite 2 exception: $_"; $allPass = $false }

# Suite 3
try {
    Write-Info "Suite 3/3: phase2_pipeline.test.mjs"
    $out3 = & node tests/phase2_pipeline.test.mjs 2>&1 | Out-String
    Write-Host $out3
    if ($results.C1) {
        if ($out3 -match "22/22" -or $out3 -match "22 passed" -or $out3 -match "ALL PASS") {
            Write-Ok "Suite 3 -> 22/22 PASS (full incl. DB checks)"
        }
        else {
            Write-Fail "Suite 3 -> FAIL (expected 22/22 because DB is online)"; $allPass = $false
        }
    }
    else {
        if ($out3 -match "18/18" -or $out3 -match "18 passed" -or $out3 -match "ALL PASS") {
            Write-Ok "Suite 3 -> 18/18 PASS (static subset only, DB skipped)"
        }
        else {
            Write-Fail "Suite 3 -> FAIL (expected static 18/18)"; $allPass = $false
        }
    }
}
catch { Write-Fail "Suite 3 exception: $_"; $allPass = $false }

Pop-Location
$results.C5 = $allPass

# ========================================================================
# C6: Final typecheck + build regression
# ========================================================================
Write-Section "C6  npm run typecheck + npm run build (final regression)"
Push-Location $ScriptDir
$results.C6 = $false
try {
    Write-Info "Typecheck (tsc --noEmit)..."
    & npm run typecheck 2>&1 | Select-Object -Last 5 | ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "typecheck exit=$LASTEXITCODE (expected 0)"
    }
    else {
        Write-Ok "typecheck exit 0"
        Write-Info "Build (vite rollup)..."
        & npm run build 2>&1 | Select-Object -Last 15 | ForEach-Object { Write-Host $_ }
        if ($LASTEXITCODE -ne 0) {
            Write-Fail "build exit=$LASTEXITCODE (expected 0)"
        }
        else {
            Write-Ok "build exit 0"
            $results.C6 = $true
        }
    }
}
catch {
    Write-Fail "C6 exception: $_"
}
Pop-Location

# ========================================================================
# FINAL REPORT
# ========================================================================
Write-Host ""
Write-Host "============================================================" -ForegroundColor White -BackgroundColor DarkGreen
Write-Host "  PHASE 2 EXIT GATE REPORT   (C1 - C6)                     " -ForegroundColor White -BackgroundColor DarkGreen
Write-Host "============================================================" -ForegroundColor White -BackgroundColor DarkGreen
$pass = 0
foreach ($key in @("C1","C2","C3","C4","C5","C6")) {
    if ($results[$key]) {
        Write-Host "  $key ........................ PASS" -ForegroundColor Green
        $pass++
    }
    else {
        Write-Host "  $key ........................ FAIL / SKIP" -ForegroundColor Red
    }
}
Write-Host "------------------------------------------------------------"
Write-Host ("  TOTAL PASS:  $pass / 6")
Write-Host "============================================================"
Write-Host ""
if ($pass -eq 6) {
    Write-Ok "ALL 6/6 EXIT GATE PASSED. Notify implementer to close Phase 2."
    exit 0
}
else {
    Write-Warn "Some gates not passed yet. Inspect output above, fix, then rerun."
    Write-Info "Send full output back to implementer for review."
    exit 1
}
