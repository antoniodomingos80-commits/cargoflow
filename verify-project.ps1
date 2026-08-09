param(
    [string]$ProjectRoot = $PSScriptRoot
)

$ErrorActionPreference = 'Stop'

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Verificando projeto CargoFlow" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$plataformaRoot = Join-Path $ProjectRoot 'plataforma'
$requiredPaths = @(
    $plataformaRoot,
    (Join-Path $plataformaRoot 'app'),
    (Join-Path $plataformaRoot 'components'),
    (Join-Path $plataformaRoot 'lib'),
    (Join-Path $plataformaRoot 'public')
)

$requiredFiles = @(
    (Join-Path $plataformaRoot 'package.json'),
    (Join-Path $plataformaRoot 'next.config.mjs'),
    (Join-Path $plataformaRoot 'tsconfig.json'),
    (Join-Path $plataformaRoot 'tailwind.config.ts')
)

$missing = @()

foreach ($path in $requiredPaths) {
    if (-not (Test-Path $path)) {
        $missing += $path
    }
}

foreach ($file in $requiredFiles) {
    if (-not (Test-Path $file)) {
        $missing += $file
    }
}

if ($missing.Count -gt 0) {
    Write-Host "Faltam os seguintes itens:" -ForegroundColor Red
    foreach ($item in $missing) {
        Write-Host " - $item" -ForegroundColor Red
    }
    exit 1
}

Write-Host "Estrutura base encontrada." -ForegroundColor Green

$node = Get-Command node -ErrorAction SilentlyContinue
$npm = Get-Command npm -ErrorAction SilentlyContinue

if (-not $node -or -not $npm) {
    Write-Host "Node.js ou npm não foram encontrados no PATH." -ForegroundColor Yellow
    exit 2
}

Push-Location $plataformaRoot
try {
    Write-Host "Executando npm install..." -ForegroundColor Cyan
    npm install --legacy-peer-deps

    Write-Host "Executando verificação de tipos..." -ForegroundColor Cyan
    npm run typecheck

    $eslintBin = Join-Path $plataformaRoot 'node_modules/.bin/eslint'
    if (Test-Path $eslintBin) {
        Write-Host "Executando lint..." -ForegroundColor Cyan
        & $eslintBin . --ext .js,.jsx,.ts,.tsx
    }
    else {
        Write-Host "Lint ignorado porque o ESLint local não está disponível." -ForegroundColor Yellow
    }
}
catch {
    Write-Host "Falha durante a verificação do projeto: $($_.Exception.Message)" -ForegroundColor Red
    exit 3
}
finally {
    Pop-Location
}

Write-Host "========================================" -ForegroundColor Green
Write-Host "Projeto verificado com sucesso." -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
