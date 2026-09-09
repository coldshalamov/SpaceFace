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

REM Install package metadata if missing or stale. The Node launcher separately provisions
REM Electron's deferred runtime binary and reports the installer's real diagnostics and exit code.
set "NEED_INSTALL=0"
if not exist "node_modules\electron\package.json" set "NEED_INSTALL=1"
if exist "node_modules\electron\package.json" node -e "const project=require('./package.json');const installed=require('./node_modules/electron/package.json');process.exit(installed.version===project.devDependencies.electron?0:1)" >nul 2>nul
if errorlevel 1 set "NEED_INSTALL=1"
if "%NEED_INSTALL%"=="1" (
    echo Installing required packages - this may take a minute the first time...
    call npm install
    if errorlevel 1 (
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
