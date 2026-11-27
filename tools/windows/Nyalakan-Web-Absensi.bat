@echo off
setlocal

set "APP_DIR=%~dp0..\..\absensi"
cd /d "%APP_DIR%"

powershell.exe -NoProfile -Command "try { Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction Stop | Out-Null; exit 0 } catch { exit 1 }"
if %errorlevel% equ 0 goto open

start "Absensi Web" /D "%APP_DIR%" cmd.exe /k npm.cmd run dev
timeout /t 3 /nobreak >nul

:open
start "" "http://localhost:3000"
endlocal
