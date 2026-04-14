@echo off
REM Regenerate Prisma client and apply migrations. If you see EPERM, STOP the backend first (Ctrl+C in its terminal).
cd /d "%~dp0..\backend"
echo.
echo === prisma migrate deploy ===
call npx prisma migrate deploy
if errorlevel 1 exit /b 1
echo.
echo === prisma generate ===
call npx prisma generate
if errorlevel 1 (
  echo.
  echo If EPERM / rename error: close Node/nodemon running the API, then run this script again.
  exit /b 1
)
echo.
echo Done. Restart the backend: npm run dev
