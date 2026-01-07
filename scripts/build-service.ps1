# Build Conflux Service for Windows
# This script builds the service executable and copies it to the right location

param(
    [switch]$Release
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ServiceDir = Join-Path $ScriptDir "..\src-tauri\service"
$MainTargetDir = Join-Path $ScriptDir "..\src-tauri\target"
$BinariesDir = Join-Path $ScriptDir "..\src-tauri\binaries"

Write-Host "Building Conflux Service..." -ForegroundColor Cyan

Push-Location $ServiceDir
try {
    if ($Release) {
        Write-Host "Building in release mode..."
        cargo build --release
        # 服务项目有独立的 target 目录
        $ServiceBinaryPath = Join-Path $ServiceDir "target\release\conflux-service.exe"
    } else {
        Write-Host "Building in debug mode..."
        cargo build
        $ServiceBinaryPath = Join-Path $ServiceDir "target\debug\conflux-service.exe"
    }

    if (Test-Path $ServiceBinaryPath) {
        Write-Host "Service built successfully: $ServiceBinaryPath" -ForegroundColor Green
        
        # 复制到 binaries 目录（与 mihomo 放在一起）
        if (-not (Test-Path $BinariesDir)) {
            New-Item -ItemType Directory -Path $BinariesDir -Force | Out-Null
        }
        $BinariesTarget = Join-Path $BinariesDir "conflux-service-x86_64-pc-windows-msvc.exe"
        Copy-Item $ServiceBinaryPath $BinariesTarget -Force
        Write-Host "Copied to: $BinariesTarget" -ForegroundColor Green

        # 也复制到主 target 目录（用于开发，可选）
        if ($Release) {
            $MainTargetBinDir = Join-Path $MainTargetDir "release"
        } else {
            $MainTargetBinDir = Join-Path $MainTargetDir "debug"
        }
        if (-not (Test-Path $MainTargetBinDir)) {
            New-Item -ItemType Directory -Path $MainTargetBinDir -Force | Out-Null
        }
        $MainTargetPath = Join-Path $MainTargetBinDir "conflux-service.exe"
        try {
            Copy-Item $ServiceBinaryPath $MainTargetPath -Force -ErrorAction Stop
            Write-Host "Copied to: $MainTargetPath" -ForegroundColor Green
        } catch {
            Write-Host "Note: Could not copy to $MainTargetPath (file may be in use)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "Build failed: binary not found at $ServiceBinaryPath" -ForegroundColor Red
        exit 1
    }
} finally {
    Pop-Location
}

Write-Host "Done!" -ForegroundColor Cyan


