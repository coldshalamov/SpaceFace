@echo off
title SpaceFace
echo.
echo ============================================
echo   SpaceFace - Launching...
echo ============================================
echo.
echo Starting local game server...
echo The game will open in your browser automatically.
echo (Close this window to stop the game)
echo.

REM Open the game in the default browser (it will wait a moment for the server)
start "" "http://localhost:8123/"

REM Start the server (this keeps the window open)
node server.js

echo.
echo Server stopped.
pause >nul
