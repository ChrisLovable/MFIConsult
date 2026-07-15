$bytes = New-Object byte[] 48
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()

try {
  $rng.GetBytes($bytes)
}
finally {
  $rng.Dispose()
}

$secret = -join (
  $bytes |
  ForEach-Object {
    $_.ToString("x2")
  }
)

$secret | Set-Clipboard

Write-Host ""
Write-Host "ADMIN_SESSION_SECRET generated and copied to clipboard."
Write-Host "Paste it directly into Vercel. Do not put it in source code."
