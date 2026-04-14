@echo off
title IABilling API (port 5000)
color 0B
cd /d "%~dp0..\backend"
echo.
echo  Starting Express API on http://localhost:5000
echo  Keep this window open. Use start-all.bat to run API + UI together.
echo.
call npm.cmd run dev
