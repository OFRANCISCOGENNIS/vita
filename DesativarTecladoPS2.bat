@echo off
setlocal
title Desativar Teclado Padrao PS/2

:: ============================================================
::  Desativa APENAS o "Teclado Padrao PS/2" (interno do notebook).
::  Requer privilegios de ADMINISTRADOR.
::  Para reativar, use o TogglarTecladoNotebook.bat.
:: ============================================================

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Solicitando privilegios de administrador...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

echo Desativando o Teclado Padrao PS/2 ...
echo.

powershell -NoProfile -Command "$ks = Get-PnpDevice -Class Keyboard; foreach ($k in $ks) { if (($k.FriendlyName -match 'PS/2') -or ($k.InstanceId -like 'ACPI\*')) { Write-Host ('-> ' + $k.FriendlyName); Disable-PnpDevice -InstanceId $k.InstanceId -Confirm:$false } }"

echo.
echo Teclado interno PS/2 DESATIVADO.
echo (Rode o TogglarTecladoNotebook.bat para reativar.)
echo.
pause
endlocal
