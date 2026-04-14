@echo off
title IABilling - Prisma Studio (DB Viewer)
color 0B

echo.
echo ============================================
echo   Opening Prisma Studio (Database Viewer)
echo ============================================
echo.
echo   This opens a visual interface to browse
echo   and edit your database at:
echo   http://localhost:5555
echo.

cd /d "%~dp0..\backend"
start "" http://localhost:5555
npx prisma studio

pause
