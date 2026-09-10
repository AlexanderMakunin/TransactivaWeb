@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo No se encontro Node.js. Abre esta carpeta con Live Server desde VS Code.
pause
  exit /b 1
)
node scripts\serve.mjs
if errorlevel 1 pause
