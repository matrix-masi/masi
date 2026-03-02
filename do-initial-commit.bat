@echo off
cd /d "%~dp0"
set GIT_AUTHOR_NAME=cursor
set GIT_AUTHOR_EMAIL=cursor@local
git add -A
git commit -m "Initial commit" --author="cursor <cursor@local>"
echo.
echo If you see "trailer" error above, run these in a normal Command Prompt or PowerShell (outside Cursor):
echo   cd /d "%~dp0"
echo   set GIT_AUTHOR_NAME=cursor
echo   set GIT_AUTHOR_EMAIL=cursor@local
echo   git commit -m "Initial commit" --author="cursor ^<cursor@local^>"
pause
