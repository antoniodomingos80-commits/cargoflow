# Deploy GitHub Pages

$githubToken = Read-Host "GitHub Token"
$githubUsername = Read-Host "GitHub Username"
$supabaseUrl = Read-Host "Supabase URL"
$supabaseAnonKey = Read-Host "Supabase ANON_KEY"

# Criar .env.local
$env = @"
NEXT_PUBLIC_SUPABASE_URL=$supabaseUrl
NEXT_PUBLIC_SUPABASE_ANON_KEY=$supabaseAnonKey
"@

Set-Content -Path "plataforma\.env.local" -Value $env

# Git
cd plataforma
git init
git add .
git commit -m "Initial"
git branch -M main

# Criar repo
$headers = @{"Authorization" = "token $githubToken"}
$body = @{name="cargoflow"; private=$false} | ConvertTo-Json

Invoke-RestMethod -Uri "https://api.github.com/user/repos" -Method POST -Headers $headers -Body $body

# Push
git remote add origin "https://github.com/$githubUsername/cargoflow.git"
git push -u origin main -f

Write-Host "Pronto! Site: https://$githubUsername.github.io/cargoflow"