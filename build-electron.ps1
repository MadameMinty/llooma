param(
    [switch]$SkipInstall,
    [switch]$SkipBuild,
    [switch]$RunDesktop
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Write-Step {
    param([string]$Message)
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Ensure-Pnpm {
    if (Get-Command pnpm -ErrorAction SilentlyContinue) {
        return
    }

    Write-Step "pnpm not found. Bootstrapping with Corepack"

    if (-not (Get-Command corepack -ErrorAction SilentlyContinue)) {
        throw "pnpm is not available and corepack is not installed. Install Node.js with Corepack support first."
    }

    & corepack enable
    if ($LASTEXITCODE -ne 0) {
        throw "corepack enable failed with code $LASTEXITCODE"
    }

    & corepack prepare pnpm@latest --activate
    if ($LASTEXITCODE -ne 0) {
        throw "corepack prepare pnpm@latest --activate failed with code $LASTEXITCODE"
    }

    if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
        throw "pnpm is still unavailable after Corepack setup. Restart terminal and re-run."
    }

    Write-Host "pnpm installed via Corepack:" -ForegroundColor Green
    & pnpm --version
    if ($LASTEXITCODE -ne 0) {
        throw "pnpm --version failed with code $LASTEXITCODE"
    }
}

function Invoke-Pnpm {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments,
        [switch]$RetryOnVirtualStoreError
    )

    $pnpmOutput = & pnpm @Arguments 2>&1
    $exitCode = $LASTEXITCODE
    $pnpmOutput | ForEach-Object { Write-Host $_ }

    if ($exitCode -eq 0) {
        return
    }

    $errorText = ($pnpmOutput | Out-String)

    if ($RetryOnVirtualStoreError -and ($errorText -match 'ERR_PNPM_UNEXPECTED_VIRTUAL_STORE')) {
        Write-Host "Detected pnpm virtual store mismatch. Recreating node_modules..." -ForegroundColor Yellow
        if (Test-Path -Path "node_modules") {
            Remove-Item -Path "node_modules" -Recurse -Force
        }

        & pnpm install
        if ($LASTEXITCODE -ne 0) {
            throw "pnpm install failed with code $LASTEXITCODE"
        }

        & pnpm @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "pnpm retry failed with code $LASTEXITCODE"
        }
        return
    }

    if ($RetryOnVirtualStoreError -and ($errorText -match 'ERR_PNPM_IGNORED_BUILDS')) {
        Write-Host "Detected blocked dependency build scripts. Approving builds and retrying..." -ForegroundColor Yellow
        & pnpm approve-builds --all
        if ($LASTEXITCODE -ne 0) {
            throw "pnpm approve-builds failed with code $LASTEXITCODE"
        }

        & pnpm install
        if ($LASTEXITCODE -ne 0) {
            throw "pnpm install after approve-builds failed with code $LASTEXITCODE"
        }

        & pnpm @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "pnpm retry after approve-builds failed with code $LASTEXITCODE"
        }
        return
    }

    throw "pnpm exited with code $exitCode"
}

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $repoRoot

Write-Step "Validating project root"
if (-not (Test-Path -Path "package.json" -PathType Leaf)) {
    throw "package.json was not found. Run this script from hollama-Next root."
}
if (-not (Test-Path -Path "electron/main.js" -PathType Leaf)) {
    throw "electron/main.js was not found. Copy Electron artifacts first."
}

Ensure-Pnpm

Write-Step "Ensuring package.json has Electron entry point and scripts"
$pkg = Get-Content -Path "package.json" -Raw | ConvertFrom-Json

if (-not $pkg.main) {
    Add-Member -InputObject $pkg -MemberType NoteProperty -Name "main" -Value "./electron/main.js"
} else {
    $pkg.main = "./electron/main.js"
}

if (-not $pkg.scripts) {
    Add-Member -InputObject $pkg -MemberType NoteProperty -Name "scripts" -Value ([pscustomobject]@{})
}

if ($pkg.scripts.PSObject.Properties.Name.Contains('electron')) {
    $pkg.scripts.electron = "electron ."
} else {
    Add-Member -InputObject $pkg.scripts -MemberType NoteProperty -Name "electron" -Value "electron ."
}

if ($pkg.scripts.PSObject.Properties.Name.Contains('electron:build')) {
    $pkg.scripts.'electron:build' = "cross-env PUBLIC_ADAPTER=electron-node vite build && electron-builder --publish never"
} else {
    Add-Member -InputObject $pkg.scripts -MemberType NoteProperty -Name "electron:build" -Value "cross-env PUBLIC_ADAPTER=electron-node vite build && electron-builder --publish never"
}

$updatedPkgJson = $pkg | ConvertTo-Json -Depth 100
Set-Content -Path "package.json" -Value $updatedPkgJson -Encoding UTF8

Write-Step "Installing Electron build dependencies (if missing)"
$pkg = Get-Content -Path "package.json" -Raw | ConvertFrom-Json
$toInstall = @()

if (-not $pkg.devDependencies.PSObject.Properties.Name.Contains('electron')) {
    $toInstall += 'electron@^31.3.1'
}
if (-not $pkg.devDependencies.PSObject.Properties.Name.Contains('electron-builder')) {
    $toInstall += 'electron-builder@^25.0.3'
}

if ($toInstall.Count -gt 0) {
    Invoke-Pnpm -Arguments (@('add', '-D') + $toInstall) -RetryOnVirtualStoreError
} elseif (-not $SkipInstall) {
    Invoke-Pnpm -Arguments @('install') -RetryOnVirtualStoreError
} else {
    Write-Host "Dependencies already present; skipping install." -ForegroundColor Yellow
}

if (-not $SkipBuild) {
    Write-Step "Building distributable Electron app"
    Invoke-Pnpm -Arguments @('run', 'electron:build')
}

if ($RunDesktop) {
    Write-Step "Launching Electron (requires dev server in another terminal)"
    Invoke-Pnpm -Arguments @('run', 'electron')
}

Write-Step "Done"
Write-Host "Packaged files are in dist/ (or release output configured by electron-builder)." -ForegroundColor Green
