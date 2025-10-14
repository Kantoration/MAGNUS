@echo off
REM Windows batch script to verify Excel mapping file
REM Runs automessager verify:mapping command

echo.
echo ========================================
echo   AutoMessager - Mapping Verification
echo ========================================
echo.

REM Determine if we're using binary or source
if exist "%~dp0..\automessager-win.exe" (
    echo Using binary: automessager-win.exe
    echo.
    "%~dp0..\automessager-win.exe" verify:mapping
) else if exist "%~dp0..\build\bin\automessager-win.exe" (
    echo Using binary: build\bin\automessager-win.exe
    echo.
    "%~dp0..\build\bin\automessager-win.exe" verify:mapping
) else if exist "%~dp0..\node_modules\.bin\automessager.cmd" (
    echo Using npm package
    echo.
    cd /d "%~dp0.."
    call npm run verify:mapping
) else (
    echo ERROR: AutoMessager binary not found!
    echo.
    echo Expected locations:
    echo   - automessager-win.exe
    echo   - build\bin\automessager-win.exe
    echo   - npm package (node_modules)
    echo.
    echo Please build the binary first:
    echo   npm run package:win
    echo.
    pause
    exit /b 1
)

echo.
echo ========================================
echo.
pause

