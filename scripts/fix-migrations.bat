@echo off
title IABilling - Fix failed migrations
color 0E
echo.
echo This marks the initial migration as rolled back, then applies it again.
echo Use this if you see P3009 / P3018 or "table does not exist" after a failed migrate.
echo.
cd /d "%~dp0..\backend"
call npx prisma migrate resolve --rolled-back 20260411144422_init
call npx prisma migrate deploy
call npx prisma generate
call node prisma/seed.js
echo.
echo Done. Restart the backend (npm run dev).
pause
