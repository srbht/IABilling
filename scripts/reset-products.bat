@echo off
REM Wipes all medicines, bills, purchases, stock adjustments — then re-seeds catalog + users/settings.
cd /d "%~dp0..\backend"
echo Running reset-products.js ...
call npx.cmd prisma generate 2>nul
node prisma/reset-products.js
if errorlevel 1 exit /b 1
echo Running seed.js ...
node prisma/seed.js
if errorlevel 1 exit /b 1
echo Done.
pause
