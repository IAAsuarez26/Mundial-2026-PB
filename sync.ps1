# Script de Sincronización Rápida para GitHub
Write-Host "Iniciando sincronización con GitHub..." -ForegroundColor Cyan

# Verificar si hay cambios
$changes = git status --porcelain
if (-not $changes) {
    Write-Host "No hay cambios pendientes para subir." -ForegroundColor Yellow
    pause
    exit
}

# Mostrar cambios detectados
Write-Host "Cambios detectados:"
git status -s

# Pedir mensaje de commit (opcional)
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$defaultMessage = "Update: $timestamp"
Write-Host "`nEscribe un mensaje para este cambio (o presiona Enter para usar '$defaultMessage'):" -NoNewline
$userMessage = Read-Host
$finalMessage = if ([string]::IsNullOrWhiteSpace($userMessage)) { $defaultMessage } else { $userMessage }

# Ejecutar comandos de Git
Write-Host "`nSubiendo cambios..." -ForegroundColor Cyan
git add .
git commit -m "$finalMessage"
git push origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n¡Sincronización completada con éxito!" -ForegroundColor Green
} else {
    Write-Host "`nHubo un error al subir los cambios. Revisa la terminal arriba." -ForegroundColor Red
}

Write-Host "`nPresiona cualquier tecla para salir..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
