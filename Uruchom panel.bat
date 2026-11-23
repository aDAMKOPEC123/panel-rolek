@echo off
title Panel rolek
cd /d "%~dp0"
echo Uruchamiam panel rolek... Nie zamykaj tego okna, dopoki pracujesz w panelu.
call npm.cmd run panel
pause
