# Uninstall-Task.ps1
# Removes the AutoMessager Windows Task Scheduler entry
# Must be run as Administrator

param(
    [string]$TaskName = "AutoMessager"
)

# Check if running as Administrator
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
$isAdmin = $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Error "This script must be run as Administrator. Please restart PowerShell as Administrator and try again."
    exit 1
}

Write-Host "AutoMessager Task Scheduler Uninstaller" -ForegroundColor Cyan
Write-Host ""

# Check if task exists
$existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue

if (-not $existingTask) {
    Write-Host "Task '$TaskName' does not exist. Nothing to uninstall." -ForegroundColor Yellow
    exit 0
}

Write-Host "Found task: $TaskName" -ForegroundColor Gray
Write-Host ""

# Confirm removal
$response = Read-Host "Are you sure you want to remove this task? (y/n)"

if ($response -ne 'y' -and $response -ne 'Y') {
    Write-Host "Uninstallation cancelled." -ForegroundColor Yellow
    exit 0
}

# Remove task
try {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction Stop
    
    Write-Host ""
    Write-Host "✓ Task '$TaskName' removed successfully!" -ForegroundColor Green
    Write-Host ""
    
} catch {
    Write-Error "Failed to remove scheduled task: $_"
    exit 1
}

