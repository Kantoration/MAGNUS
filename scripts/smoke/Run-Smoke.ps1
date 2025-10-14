# Run-Smoke.ps1
# Smoke test script for AutoMessager
# Runs doctor, verify, and dry-run to ensure system is working

param(
    [string]$WorkingDirectory = ""
)

# Set error action preference
$ErrorActionPreference = "Stop"

# Determine working directory
if ($WorkingDirectory -eq "") {
    # Default: parent of parent of parent of script directory
    $WorkingDirectory = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
}

Write-Host "╔═══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║          AutoMessager Smoke Test                      ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "Working Directory: $WorkingDirectory" -ForegroundColor Gray
Write-Host ""

# Change to working directory
Set-Location $WorkingDirectory

# Create logs directory if it doesn't exist
$logsDir = Join-Path $WorkingDirectory "logs"
if (-not (Test-Path $logsDir)) {
    New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
}

# Generate smoke log filename
$timestamp = Get-Date -Format "yyyyMMdd-HHmm"
$smokeLogPath = Join-Path $logsDir "smoke-$timestamp.log"

Write-Host "Log file: $smokeLogPath" -ForegroundColor Gray
Write-Host ""

# Start transcript
Start-Transcript -Path $smokeLogPath -Append

# Initialize results
$testResults = @()
$overallSuccess = $true

# Helper function to run a test step
function Run-TestStep {
    param(
        [string]$Name,
        [string]$Command
    )
    
    Write-Host "───────────────────────────────────────────────────────" -ForegroundColor Gray
    Write-Host "Running: $Name" -ForegroundColor Yellow
    Write-Host "Command: $Command" -ForegroundColor Gray
    Write-Host ""
    
    try {
        Invoke-Expression $Command
        $exitCode = $LASTEXITCODE
        
        if ($exitCode -eq 0) {
            Write-Host ""
            Write-Host "✅ $Name PASSED (exit code: $exitCode)" -ForegroundColor Green
            $script:testResults += @{
                Name = $Name
                Status = "PASS"
                ExitCode = $exitCode
            }
        } elseif ($exitCode -eq 2) {
            # Exit code 2 = warnings only
            Write-Host ""
            Write-Host "⚠️  $Name PASSED with warnings (exit code: $exitCode)" -ForegroundColor Yellow
            $script:testResults += @{
                Name = $Name
                Status = "WARN"
                ExitCode = $exitCode
            }
        } else {
            Write-Host ""
            Write-Host "❌ $Name FAILED (exit code: $exitCode)" -ForegroundColor Red
            $script:testResults += @{
                Name = $Name
                Status = "FAIL"
                ExitCode = $exitCode
            }
            $script:overallSuccess = $false
        }
    } catch {
        Write-Host ""
        Write-Host "❌ $Name FAILED with exception: $_" -ForegroundColor Red
        $script:testResults += @{
            Name = $Name
            Status = "FAIL"
            ExitCode = -1
            Error = $_.Exception.Message
        }
        $script:overallSuccess = $false
    }
    
    Write-Host ""
}

# Determine CLI command based on availability
$cliPath = Join-Path $WorkingDirectory "dist\bin\automessager.js"
$binaryPath = Join-Path $WorkingDirectory "automessager-win.exe"

if (Test-Path $binaryPath) {
    $CLI_CMD = ".\automessager-win.exe"
    Write-Host "Using binary: $binaryPath" -ForegroundColor Cyan
} elseif (Test-Path $cliPath) {
    $CLI_CMD = "node dist\bin\automessager.js"
    Write-Host "Using built CLI: $cliPath" -ForegroundColor Cyan
} else {
    Write-Error "Neither binary nor built CLI found. Run 'npm run build' first."
    Stop-Transcript
    exit 1
}

Write-Host ""

# Run smoke tests
Run-TestStep -Name "Doctor Diagnostics" -Command "$CLI_CMD doctor"
Run-TestStep -Name "Verify Configuration" -Command "$CLI_CMD verify"
Run-TestStep -Name "Verify Excel Mapping" -Command "$CLI_CMD verify:mapping"
Run-TestStep -Name "Dry-Run Test" -Command "$CLI_CMD dry-run --no-guard"

# Print summary
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "SMOKE TEST SUMMARY" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

foreach ($result in $testResults) {
    $statusIcon = switch ($result.Status) {
        "PASS" { "✅" }
        "WARN" { "⚠️ " }
        "FAIL" { "❌" }
    }
    $statusColor = switch ($result.Status) {
        "PASS" { "Green" }
        "WARN" { "Yellow" }
        "FAIL" { "Red" }
    }
    
    Write-Host "$statusIcon $($result.Name): $($result.Status) (exit code: $($result.ExitCode))" -ForegroundColor $statusColor
    
    if ($result.Error) {
        Write-Host "   Error: $($result.Error)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "───────────────────────────────────────────────────────" -ForegroundColor Gray

if ($overallSuccess) {
    Write-Host "🎉 SMOKE TEST: PASS" -ForegroundColor Green -BackgroundColor Black
    Write-Host ""
    Write-Host "All smoke tests passed successfully!" -ForegroundColor Green
    Write-Host "System is ready for production use." -ForegroundColor Green
    $exitCode = 0
} else {
    Write-Host "❌ SMOKE TEST: FAIL" -ForegroundColor Red -BackgroundColor Black
    Write-Host ""
    Write-Host "One or more smoke tests failed." -ForegroundColor Red
    Write-Host "Review the output above and fix issues before deployment." -ForegroundColor Red
    $exitCode = 1
}

Write-Host ""
Write-Host "Log saved to: $smokeLogPath" -ForegroundColor Gray
Write-Host ""

Stop-Transcript

exit $exitCode

