# Install-Task.ps1
# Creates a Windows Task Scheduler entry for AutoMessager
# Must be run as Administrator

param(
    [string]$TaskName = "AutoMessager",
    [string]$WorkingDirectory = "",
    [int]$Hour = 9,
    [int]$Minute = 0,
    [switch]$UseDryRun = $false,
    [string]$UserAccount = ""
)

# Check if running as Administrator
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
$isAdmin = $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Error "This script must be run as Administrator. Please restart PowerShell as Administrator and try again."
    exit 1
}

Write-Host "AutoMessager Task Scheduler Installer" -ForegroundColor Cyan
Write-Host ""

# Determine working directory
if ($WorkingDirectory -eq "") {
    # Default: parent of parent of script directory (scripts/windows -> project root)
    $WorkingDirectory = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
}

Write-Host "Configuration:" -ForegroundColor Yellow
Write-Host "  Task Name: $TaskName" -ForegroundColor Gray
Write-Host "  Working Directory: $WorkingDirectory" -ForegroundColor Gray
Write-Host "  Schedule: Daily at $($Hour.ToString('00')):$($Minute.ToString('00'))" -ForegroundColor Gray
Write-Host "  Dry Run Mode: $UseDryRun" -ForegroundColor Gray
Write-Host ""

# Validate working directory exists
if (-not (Test-Path $WorkingDirectory)) {
    Write-Error "Working directory does not exist: $WorkingDirectory"
    exit 1
}

# Validate Start-AutoMessager.ps1 exists
$startScriptPath = Join-Path $WorkingDirectory "scripts\windows\Start-AutoMessager.ps1"
if (-not (Test-Path $startScriptPath)) {
    Write-Error "Start script not found at: $startScriptPath"
    exit 1
}

# Check if task already exists
$existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue

if ($existingTask) {
    Write-Host "Task '$TaskName' already exists." -ForegroundColor Yellow
    $response = Read-Host "Do you want to replace it? (y/n)"
    
    if ($response -ne 'y' -and $response -ne 'Y') {
        Write-Host "Installation cancelled." -ForegroundColor Yellow
        exit 0
    }
    
    Write-Host "Removing existing task..." -ForegroundColor Gray
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

# Determine user account
if ($UserAccount -eq "") {
    $UserAccount = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
}

Write-Host "Creating scheduled task..." -ForegroundColor Cyan

# Build action arguments
$actionArgs = "-ExecutionPolicy Bypass -NoProfile -File `"$startScriptPath`" -WorkingDirectory `"$WorkingDirectory`""

if ($UseDryRun) {
    $actionArgs += " -DryRun"
}

# Create action
$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument $actionArgs `
    -WorkingDirectory $WorkingDirectory

# Create trigger (daily at specified time)
$trigger = New-ScheduledTaskTrigger `
    -Daily `
    -At (Get-Date -Hour $Hour -Minute $Minute -Second 0)

# Create settings
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable `
    -MultipleInstances IgnoreNew

# Create principal (run with highest privileges, whether user is logged on or not)
$principal = New-ScheduledTaskPrincipal `
    -UserId $UserAccount `
    -LogonType S4U `
    -RunLevel Highest

# Register the task
try {
    Register-ScheduledTask `
        -TaskName $TaskName `
        -Action $action `
        -Trigger $trigger `
        -Settings $settings `
        -Principal $principal `
        -Description "AutoMessager - Automated WhatsApp messaging for Salesforce" `
        -ErrorAction Stop | Out-Null
    
    Write-Host ""
    Write-Host "✓ Task created successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Task Details:" -ForegroundColor Yellow
    Write-Host "  Name: $TaskName" -ForegroundColor Gray
    Write-Host "  Schedule: Daily at $($Hour.ToString('00')):$($Minute.ToString('00'))" -ForegroundColor Gray
    Write-Host "  User: $UserAccount" -ForegroundColor Gray
    Write-Host "  Working Directory: $WorkingDirectory" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Next Steps:" -ForegroundColor Yellow
    Write-Host "  1. Test the task manually:" -ForegroundColor Gray
    Write-Host "     Start-ScheduledTask -TaskName '$TaskName'" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  2. View task status:" -ForegroundColor Gray
    Write-Host "     Get-ScheduledTask -TaskName '$TaskName' | Get-ScheduledTaskInfo" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  3. View logs:" -ForegroundColor Gray
    Write-Host "     Get-Content '$WorkingDirectory\logs\run-*.log' -Tail 50" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  4. To remove the task:" -ForegroundColor Gray
    Write-Host "     .\scripts\windows\Uninstall-Task.ps1" -ForegroundColor Cyan
    Write-Host ""
    
} catch {
    Write-Error "Failed to create scheduled task: $_"
    exit 1
}

