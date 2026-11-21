@echo off
cd /d "%~dp0"
node.exe launcher.mjs
if errorlevel 1 pause
