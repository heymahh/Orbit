@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Instale o Node.js 22 ou superior em https://nodejs.org
  pause
  exit /b 1
)
node server.mjs --open
if errorlevel 1 pause
