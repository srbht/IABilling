@echo off
title IABilling - Starting Application
color 0A

echo.
echo ============================================
echo   IABilling - Starting All Services
echo ============================================
echo.
echo   Backend  → http://localhost:5000
echo   Frontend → http://localhost:3000
echo.
echo   Close this window to stop all services.
echo ============================================
echo.

:: Sync Prisma client with schema (fixes "Unknown argument sku" if schema was updated)
cd /d "%~dp0..\backend"
call npx.cmd prisma generate 2>nul
cd /d "%~dp0"

:: Start Backend in a new window
start "IABilling Backend (Port 5000)" cmd /k "cd /d "%~dp0..\backend" && echo Starting Backend... && npm.cmd run dev"

:: Wait for backend to listen on 5000 (avoids ECONNREFUSED if the browser opens too early)
timeout /t 6 /nobreak > nul

:: Start Frontend in a new window
start "IABilling Frontend (Port 3000)" cmd /k "cd /d "%~dp0..\frontend" && echo Starting Frontend... && npm.cmd run dev"

:: Wait 5 seconds then open browser
timeout /t 5 /nobreak > nul
start http://localhost:3000

echo.
echo Both services are starting in separate windows.
echo Browser will open automatically.
echo.
pause
