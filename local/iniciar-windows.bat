@echo off
cd /d "%~dp0"
py -3 iniciar_actividad.py
if errorlevel 1 pause
