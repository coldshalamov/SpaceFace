@echo off
setlocal
pushd "%~dp0"
title SpaceFace (Desktop)
echo.
echo ============================================
echo   SpaceFace - Desktop Launcher
echo ============================================
echo.
echo This will run the game in a real desktop window using Electron.
echo (No browser tab, looks and feels like a normal game)
echo.

REM Check if node is available
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed or not in your PATH.
    echo.
    echo Please install Node.js from https://nodejs.org/
    echo Then run this file again.
    echo.
    pause
    popd
    exit /b 1
)

REM Install dependencies if needed (first time only, or if Electron is missing)
if not exist "node_modules\.bin\electron.cmd" (
    echo Installing required packages - this may take a minute the first time...
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo ERROR: npm install failed.
        echo Please check the error above, then run this file again.
        echo.
        pause
        popd
        exit /b 1
    )
    echo.
)

echo Launching SpaceFace desktop app...
echo You can close this window after the game opens.
echo.

call npm run electron
if %errorlevel% neq 0 (
    echo.
    echo ERROR: SpaceFace desktop app failed to launch.
    echo Please check the error above.
    echo.
    pause
    popd
    exit /b 1
)

echo.
echo Game closed.
pause >nul
popd
