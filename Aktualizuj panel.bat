@echo off
setlocal
title Aktualizacja Panelu rolek
node "%~dp0scripts\aktualizuj.mjs" %*
set "WYNIK=%ERRORLEVEL%"
pause
exit /b %WYNIK%
