@echo off
setlocal
title Ativar/Desativar Teclado do Notebook

:: ============================================================
::  Alterna (liga/desliga) o teclado interno do notebook.
::  Requer privilegios de ADMINISTRADOR.
::  Nao afeta teclados USB externos (apenas o PS/2 / ACPI interno).
:: ============================================================

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Solicitando privilegios de administrador...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

echo ============================================================
echo   TECLADO INTERNO DO NOTEBOOK - ATIVAR / DESATIVAR
echo ============================================================
echo.

:: --- Descobre estado atual do teclado interno ---
for /f "delims=" %%S in ('powershell -NoProfile -Command "$d = Get-PnpDevice -Class Keyboard ^| Where-Object { ($_.FriendlyName -match 'PS/2') -or ($_.InstanceId -like 'ACPI\*') } ^| Select-Object -First 1; if ($d) { $d.Status } else { 'NAOENCONTRADO' }"') do set "STATUS=%%S"

if "%STATUS%"=="NAOENCONTRADO" (
    echo Nenhum teclado interno PS/2/ACPI foi localizado. Teclados detectados:
    echo.
    powershell -NoProfile -Command "Get-PnpDevice -Class Keyboard | Format-Table Status, FriendlyName, InstanceId -AutoSize"
    echo.
    pause
    exit /b 1
)

echo Estado atual do teclado interno: %STATUS%
echo.

if /i "%STATUS%"=="OK" (
    echo Desativando o teclado interno...
    powershell -NoProfile -Command "$ks = Get-PnpDevice -Class Keyboard; foreach ($k in $ks) { if (($k.FriendlyName -match 'PS/2') -or ($k.InstanceId -like 'ACPI\*')) { Disable-PnpDevice -InstanceId $k.InstanceId -Confirm:$false } }"
    echo Teclado interno DESATIVADO.
) else (
    echo Ativando o teclado interno...
    powershell -NoProfile -Command "$ks = Get-PnpDevice -Class Keyboard; foreach ($k in $ks) { if (($k.FriendlyName -match 'PS/2') -or ($k.InstanceId -like 'ACPI\*')) { Enable-PnpDevice -InstanceId $k.InstanceId -Confirm:$false } }"
    echo Teclado interno ATIVADO.
)

echo.
pause
endlocal
