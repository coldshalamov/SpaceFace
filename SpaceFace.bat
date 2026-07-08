@echo off
setlocal
pushd "%~dp0"
title SpaceFace
echo.
echo ============================================
echo   SpaceFace - Launching...
echo ============================================
echo.
echo Starting the local game route...
echo.

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

node scripts\launch-browser.mjs
set EXIT_CODE=%errorlevel%

echo.
if %EXIT_CODE% neq 0 (
    echo SpaceFace launcher stopped with an error.
    pause
    popd
    exit /b %EXIT_CODE%
)

popd
