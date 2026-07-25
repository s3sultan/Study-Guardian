@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo تشغيل Smart Guardian محلياً...
start "SmartGuardianServer" /min cmd /k "python -m http.server 8000"
timeout /t 2 /nobreak >nul
start "" http://localhost:8000/index.html
echo تم التشغيل على http://localhost:8000
pause
