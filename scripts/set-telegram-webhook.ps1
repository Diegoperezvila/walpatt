$ErrorActionPreference = 'Stop'

$botTokenSecure = Read-Host 'Pega el token de BotFather' -AsSecureString
$webhookSecretSecure = Read-Host 'Pega TELEGRAM_WEBHOOK_SECRET (el mismo valor de Vercel)' -AsSecureString
$domain = (Read-Host 'Dominio desplegado, por ejemplo https://walpatt.vercel.app').Trim().TrimEnd('/')

$tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($botTokenSecure)
$secretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($webhookSecretSecure)

try {
    $botToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer)
    $webhookSecret = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPointer)
    if ($domain -notmatch '^https://[^/]+$') {
        throw 'Escribe el dominio HTTPS de tu despliegue, sin / al final ni rutas.'
    }
    if ($webhookSecret -notmatch '^[A-Za-z0-9_-]{1,256}$') {
        throw 'El webhook secret solo puede contener letras, números, guion y guion bajo.'
    }

    $payload = @{
        url = "$domain/api/telegram/webhook"
        secret_token = $webhookSecret
        allowed_updates = @('message')
    } | ConvertTo-Json -Compress

    try {
        $result = Invoke-RestMethod -Method Post `
            -Uri "https://api.telegram.org/bot$botToken/setWebhook" `
            -ContentType 'application/json' `
            -Body $payload
    } catch {
        throw 'No se pudo registrar el webhook. Revisa el token, el secreto y que el dominio ya esté desplegado por HTTPS.'
    }

    if (-not $result.ok) {
        throw "Telegram rechazó el webhook: $($result.description)"
    }
    Write-Host "Webhook configurado en $domain/api/telegram/webhook"
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPointer)
    $botToken = $null
    $webhookSecret = $null
    $payload = $null
}
