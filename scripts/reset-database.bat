@echo off
title IABilling - Reset Database
color 0C

echo.
echo ============================================
echo   IABilling - Reset Database
echo ============================================
echo.
echo   WARNING: This will DELETE all data and
echo   re-create the database from scratch!
echo.
set /p confirm="Type YES to confirm: "
if /i "%confirm%" neq "YES" (
    echo Cancelled.
    pause
    exit /b 0
)

cd /d "%~dp0..\backend"

echo.
echo Resetting database...
call npx prisma migrate reset --force

echo.
echo Re-seeding sample data...
call node prisma/seed.js

echo.
echo ============================================
echo   Database reset COMPLETE!
echo ============================================
echo.
pause
