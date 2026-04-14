@echo off
title IABilling - Frontend Setup
color 0A

echo.
echo ============================================
echo   IABilling - Frontend Setup
echo ============================================
echo.

cd /d "%~dp0..\frontend"

echo Installing Node.js dependencies (this may take a minute)...
call npm.cmd install
if %errorlevel% neq 0 (
    echo ERROR: npm install failed. Make sure Node.js is installed.
    pause
    exit /b 1
)

echo.
echo ============================================
echo   Frontend setup COMPLETE!
echo ============================================
echo.
echo   Now run: start-all.bat
echo.
pause
