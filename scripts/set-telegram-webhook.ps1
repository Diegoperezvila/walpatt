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

    $commands = @(
        @{ command = 'ayuda'; description = 'Ver instrucciones y ejemplos' }
        @{ command = 'vincular'; description = 'Conectar tu cuenta de Walpatt' }
        @{ command = 'listas'; description = 'Ver tus listas' }
        @{ command = 'tengo'; description = 'Consultar Pokémon o disfraces que tienes' }
        @{ command = 'faltan'; description = 'Consultar Pokémon o disfraces pendientes' }
        @{ command = 'anadir'; description = 'Marcar un Pokémon o disfraz' }
        @{ command = 'desvincular'; description = 'Desconectar tu cuenta de Telegram' }
    )
    $commandsPayload = @{ commands = $commands } | ConvertTo-Json -Depth 4 -Compress

    try {
        $menuResult = Invoke-RestMethod -Method Post `
            -Uri "https://api.telegram.org/bot$botToken/setMyCommands" `
            -ContentType 'application/json' `
            -Body $commandsPayload
    } catch {
        throw 'El webhook quedó configurado, pero Telegram no pudo guardar el menú de comandos.'
    }

    if (-not $menuResult.ok) {
        throw "El webhook quedó configurado, pero Telegram rechazó el menú: $($menuResult.description)"
    }
    $buttonPayload = @{ menu_button = @{ type = 'commands' } } | ConvertTo-Json -Compress
    try {
        $buttonResult = Invoke-RestMethod -Method Post `
            -Uri "https://api.telegram.org/bot$botToken/setChatMenuButton" `
            -ContentType 'application/json' `
            -Body $buttonPayload
    } catch {
        throw 'Los comandos se guardaron, pero Telegram no pudo activar el botón del menú.'
    }

    if (-not $buttonResult.ok) {
        throw "Los comandos se guardaron, pero Telegram rechazó el botón del menú: $($buttonResult.description)"
    }
    Write-Host 'Webhook, comandos y botón de menú configurados. Abre el chat del bot y pulsa Menú o / junto al campo de mensaje.'
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPointer)
    $botToken = $null
    $webhookSecret = $null
    $payload = $null
    $commands = $null
    $commandsPayload = $null
    $buttonPayload = $null
}
