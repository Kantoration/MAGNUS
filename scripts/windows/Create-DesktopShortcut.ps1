# Create-DesktopShortcut.ps1
# Creates a desktop shortcut for AutoMessager
# Can be configured to run in dry-run or live mode

param(
    [string]$ShortcutName = "AutoMessager",
    [string]$WorkingDirectory = "",
    [string]$BinaryPath = "",
    [switch]$DryRun = $false,
    [switch]$Run = $false
)

Write-Host "AutoMessager Desktop Shortcut Creator" -ForegroundColor Cyan
Write-Host ""

# Determine working directory
if ($WorkingDirectory -eq "") {
    # Default: parent of parent of script directory (scripts/windows -> project root)
    $WorkingDirectory = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
}

# Validate working directory exists
if (-not (Test-Path $WorkingDirectory)) {
    Write-Error "Working directory does not exist: $WorkingDirectory"
    exit 1
}

# Determine binary path
if ($BinaryPath -eq "") {
    # Try to find the binary in build/bin
    $possiblePaths = @(
        (Join-Path $WorkingDirectory "build\bin\automessager-win.exe"),
        (Join-Path $WorkingDirectory "automessager-win.exe"),
        (Join-Path $WorkingDirectory "automessager.exe")
    )
    
    foreach ($path in $possiblePaths) {
        if (Test-Path $path) {
            $BinaryPath = $path
            break
        }
    }
    
    if ($BinaryPath -eq "") {
        Write-Error "Could not find AutoMessager binary. Please specify -BinaryPath parameter."
        Write-Host ""
        Write-Host "Expected locations:" -ForegroundColor Yellow
        foreach ($path in $possiblePaths) {
            Write-Host "  - $path" -ForegroundColor Gray
        }
        Write-Host ""
        Write-Host "To build the binary, run:" -ForegroundColor Yellow
        Write-Host "  npm run package:win" -ForegroundColor Cyan
        exit 1
    }
}

# Validate binary exists
if (-not (Test-Path $BinaryPath)) {
    Write-Error "Binary not found at: $BinaryPath"
    exit 1
}

# Get desktop path
$desktopPath = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktopPath "$ShortcutName.lnk"

Write-Host "Configuration:" -ForegroundColor Yellow
Write-Host "  Shortcut Name: $ShortcutName" -ForegroundColor Gray
Write-Host "  Binary Path: $BinaryPath" -ForegroundColor Gray
Write-Host "  Working Directory: $WorkingDirectory" -ForegroundColor Gray
Write-Host "  Desktop Path: $desktopPath" -ForegroundColor Gray

# Determine command arguments
$arguments = ""
if ($DryRun) {
    $arguments = "dry-run"
    Write-Host "  Mode: Dry-Run (preview only)" -ForegroundColor Gray
} elseif ($Run) {
    $arguments = "run"
    Write-Host "  Mode: Live (actual execution)" -ForegroundColor Gray
} else {
    $arguments = "doctor"
    Write-Host "  Mode: Doctor (diagnostics)" -ForegroundColor Gray
}

Write-Host ""

# Check if shortcut already exists
if (Test-Path $shortcutPath) {
    Write-Host "Shortcut already exists at: $shortcutPath" -ForegroundColor Yellow
    $response = Read-Host "Do you want to replace it? (y/n)"
    
    if ($response -ne 'y' -and $response -ne 'Y') {
        Write-Host "Operation cancelled." -ForegroundColor Yellow
        exit 0
    }
    
    Remove-Item $shortcutPath -Force
}

# Create shortcut
try {
    $WScriptShell = New-Object -ComObject WScript.Shell
    $shortcut = $WScriptShell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $BinaryPath
    $shortcut.Arguments = $arguments
    $shortcut.WorkingDirectory = $WorkingDirectory
    $shortcut.WindowStyle = 1  # Normal window
    $shortcut.Description = "AutoMessager - Automated WhatsApp messaging for Salesforce"
    
    # Set icon (use the binary's icon)
    $shortcut.IconLocation = "$BinaryPath,0"
    
    $shortcut.Save()
    
    Write-Host "✓ Shortcut created successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Shortcut Location:" -ForegroundColor Yellow
    Write-Host "  $shortcutPath" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Next Steps:" -ForegroundColor Yellow
    Write-Host "  1. Double-click the desktop shortcut to run AutoMessager" -ForegroundColor Gray
    Write-Host "  2. A console window will open showing the output" -ForegroundColor Gray
    Write-Host "  3. Logs are saved to: $WorkingDirectory\logs\" -ForegroundColor Gray
    Write-Host ""
    Write-Host "To create different shortcuts:" -ForegroundColor Yellow
    Write-Host "  Doctor (diagnostics):" -ForegroundColor Gray
    Write-Host "    .\scripts\windows\Create-DesktopShortcut.ps1 -ShortcutName 'AutoMessager Doctor'" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Dry-Run (preview):" -ForegroundColor Gray
    Write-Host "    .\scripts\windows\Create-DesktopShortcut.ps1 -ShortcutName 'AutoMessager Dry-Run' -DryRun" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Live Run:" -ForegroundColor Gray
    Write-Host "    .\scripts\windows\Create-DesktopShortcut.ps1 -ShortcutName 'AutoMessager Run' -Run" -ForegroundColor Cyan
    Write-Host ""
    
} catch {
    Write-Error "Failed to create shortcut: $_"
    exit 1
}

