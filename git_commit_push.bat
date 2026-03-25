@echo off
setlocal

set MESSAGE=%*
if "%MESSAGE%"=="" set MESSAGE=Update repository

git status --short

git add -A
if errorlevel 1 goto :error

git commit -m "%MESSAGE%"
if errorlevel 1 goto :error

git push origin main
if errorlevel 1 goto :error

echo.
echo Done.
goto :eof

:error
echo.
echo Command failed.
exit /b 1
