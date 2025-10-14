# Start-AutoMessager.ps1
# Runs AutoMessager with proper working directory and logging
# Can be executed directly or via Windows Task Scheduler

param(
    [string]$WorkingDirectory = "",
    [switch]$DryRun = $false
)

# Set error action preference
$ErrorActionPreference = "Stop"

# Determine working directory
if ($WorkingDirectory -eq "") {
    # Default: parent of parent of script directory (scripts/windows -> project root)
    $WorkingDirectory = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
}

Write-Host "AutoMessager Launcher" -ForegroundColor Cyan
Write-Host "Working Directory: $WorkingDirectory" -ForegroundColor Gray
Write-Host ""

# Change to working directory
Set-Location $WorkingDirectory

# Check if node is available
$nodeVersion = & node --version 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Error "Node.js is not installed or not in PATH. Please install Node.js 20+ and try again."
    exit 1
}

Write-Host "Node.js Version: $nodeVersion" -ForegroundColor Gray

# Check if dist/bin/automessager.js exists
$cliPath = Join-Path $WorkingDirectory "dist\bin\automessager.js"
if (-not (Test-Path $cliPath)) {
    Write-Error "AutoMessager CLI not found at: $cliPath. Please run 'npm run build' first."
    exit 1
}

# Create logs directory if it doesn't exist
$logsDir = Join-Path $WorkingDirectory "logs"
if (-not (Test-Path $logsDir)) {
    New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
}

# Set environment variables
$env:NODE_NO_WARNINGS = "1"

if ($DryRun) {
    $env:DRY_RUN = "1"
    Write-Host "Mode: DRY RUN (no messages will be sent)" -ForegroundColor Yellow
} else {
    $env:DRY_RUN = "0"
    Write-Host "Mode: LIVE (messages will be sent)" -ForegroundColor Green
}

Write-Host ""

# Generate log file name with date
$dateStr = Get-Date -Format "yyyyMMdd"
$logFile = Join-Path $logsDir "run-$dateStr.log"

Write-Host "Log file: $logFile" -ForegroundColor Gray
Write-Host ""
Write-Host "Starting AutoMessager..." -ForegroundColor Cyan
Write-Host "----------------------------------------" -ForegroundColor Gray

# Run AutoMessager and tee output to log file
try {
    if ($DryRun) {
        & node $cliPath dry-run 2>&1 | Tee-Object -FilePath $logFile -Append
    } else {
        & node $cliPath run 2>&1 | Tee-Object -FilePath $logFile -Append
    }
    
    $exitCode = $LASTEXITCODE
    
    Write-Host ""
    Write-Host "----------------------------------------" -ForegroundColor Gray
    
    if ($exitCode -eq 0) {
        Write-Host "AutoMessager completed successfully" -ForegroundColor Green
    } else {
        Write-Host "AutoMessager completed with errors (exit code: $exitCode)" -ForegroundColor Yellow
    }
    
    exit $exitCode
} catch {
    Write-Error "Failed to run AutoMessager: $_"
    exit 1
}

