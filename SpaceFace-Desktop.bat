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
echo This launcher will not close an existing game or test process.
echo.

node scripts\launch-electron.mjs
set LAUNCH_EXIT=%errorlevel%
if %LAUNCH_EXIT% equ 2 (
    echo.
    echo SpaceFace is still starting. The launcher left it running.
    echo Check the diagnostic log printed above if no window appears.
    echo.
    pause
    popd
    exit /b 2
)
if %LAUNCH_EXIT% neq 0 (
    echo.
    echo ERROR: SpaceFace desktop app failed to launch.
    echo The specific reason and diagnostic log are printed above.
    echo.
    pause
    popd
    exit /b 1
)

echo.
echo Launcher handoff complete. SpaceFace will keep running if this window closes.
popd
