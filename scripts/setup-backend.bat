@echo off
title IABilling - Backend Setup
color 0A

echo.
echo ============================================
echo   IABilling - Backend Setup
echo ============================================
echo.

cd /d "%~dp0..\backend"

echo [1/3] Installing Node.js dependencies...
call npm.cmd install
if %errorlevel% neq 0 (
    echo ERROR: npm install failed. Make sure Node.js is installed.
    pause
    exit /b 1
)

echo.
echo [2/3] Running database migrations (creates all tables in MySQL)...
call npx prisma migrate deploy
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Migration failed!
    echo.
    echo If you see "failed migrations" or P3009, run once from backend folder:
    echo   npx prisma migrate resolve --rolled-back 20260411144422_init
    echo   npx prisma migrate deploy
    echo.
    echo Otherwise check:
    echo   1. MySQL is running
    echo   2. Database exists: CREATE DATABASE iabilling CHARACTER SET utf8mb4;
    echo   3. DATABASE_URL in backend\.env is correct
    echo.
    pause
    exit /b 1
)
call npx prisma generate

echo.
echo [3/3] Seeding sample data (admin user + sample medicines)...
call node prisma/seed.js
if %errorlevel% neq 0 (
    echo WARNING: Seeding failed but you can continue.
)

echo.
echo ============================================
echo   Backend setup COMPLETE!
echo ============================================
echo.
echo   Default Login:
echo   Admin:       admin@iabilling.com / Admin@123
echo   Pharmacist:  pharmacist@iabilling.com / Pharm@123
echo.
echo   Now run: start-all.bat
echo.
pause
