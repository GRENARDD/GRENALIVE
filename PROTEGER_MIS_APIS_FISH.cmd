@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"
title GRENA LIVE - Proteger mis dos APIs Fish Audio
echo GRENA LIVE - Migracion privada de Fish Audio
echo.
echo Esta herramienta conserva las APIs en tu propio Windows, fuera de GitHub.
echo Tu instalacion anterior y tus voces no se modifican.
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo No se detecto Node.js. No se hizo ningun cambio.
  pause
  exit /b 1
)
if not exist "%~dp0desktop-build\migrate_owner_fish.cjs" (
  echo Faltan archivos de la carpeta GRENA LIVE. Extrae el ZIP completo antes de abrir este archivo.
  pause
  exit /b 1
)
node "%~dp0desktop-build\migrate_owner_fish.cjs"
if errorlevel 1 (
  echo.
  echo No se migraron las claves. Tu GRENA actual permanece intacto.
  pause
  exit /b 1
)
echo.
echo Comprueba ambas APIs en GRENA LIVE - Administracion antes de actualizar.
pause
