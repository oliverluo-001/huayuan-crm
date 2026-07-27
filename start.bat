@echo off
cd /d "%~dp0"
echo Starting huayuan-crm (backend:3001, frontend:3000)...
call npm run dev
pause
