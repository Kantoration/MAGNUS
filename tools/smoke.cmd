@echo off
REM Windows batch script to run smoke tests
REM Validates basic functionality

echo.
echo ========================================
echo   AutoMessager - Smoke Test Suite
echo ========================================
echo.

REM Determine if we're using binary or source
if exist "%~dp0..\automessager-win.exe" (
    set BINARY=%~dp0..\automessager-win.exe
    echo Using binary: automessager-win.exe
) else if exist "%~dp0..\build\bin\automessager-win.exe" (
    set BINARY=%~dp0..\build\bin\automessager-win.exe
    echo Using binary: build\bin\automessager-win.exe
) else (
    echo ERROR: AutoMessager binary not found!
    echo.
    echo Expected locations:
    echo   - automessager-win.exe
    echo   - build\bin\automessager-win.exe
    echo.
    echo Please build the binary first:
    echo   npm run package:win
    echo.
    pause
    exit /b 1
)

echo.
echo [1/4] Version Check...
echo ---------------------------------------
"%BINARY%" version
if %ERRORLEVEL% NEQ 0 (
    echo FAILED: Version check failed
    pause
    exit /b 1
)
echo PASS
echo.

echo [2/4] Doctor (Diagnostics)...
echo ---------------------------------------
"%BINARY%" doctor
if %ERRORLEVEL% NEQ 0 (
    echo WARNING: Doctor found issues
    echo.
) else (
    echo PASS
    echo.
)

echo [3/4] Verify (Quick Check)...
echo ---------------------------------------
"%BINARY%" verify
if %ERRORLEVEL% NEQ 0 (
    echo WARNING: Verify found issues
    echo.
) else (
    echo PASS
    echo.
)

echo [4/4] Mapping Validation...
echo ---------------------------------------
"%BINARY%" verify:mapping
if %ERRORLEVEL% NEQ 0 (
    echo WARNING: Mapping validation failed
    echo.
) else (
    echo PASS
    echo.
)

echo ========================================
echo   Smoke Tests Complete
echo ========================================
echo.
pause

