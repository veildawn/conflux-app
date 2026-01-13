# 开发环境清理脚本
# 停止 conflux-service 服务和相关进程，以便重新构建

Write-Host "正在清理开发环境..." -ForegroundColor Cyan

# 检查是否以管理员身份运行
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "需要管理员权限，正在请求提升..." -ForegroundColor Yellow
    Start-Process powershell -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    exit
}

# 停止服务
Write-Host "停止 conflux-service 服务..." -ForegroundColor Yellow
Stop-Service conflux-service -Force -ErrorAction SilentlyContinue

# 等待服务停止
Start-Sleep -Seconds 1

# 强制杀死可能残留的进程
Write-Host "清理残留进程..." -ForegroundColor Yellow
taskkill /F /IM mihomo.exe 2>$null
taskkill /F /IM "mihomo-x86_64-pc-windows-msvc.exe" 2>$null
taskkill /F /IM conflux-service.exe 2>$null
taskkill /F /IM "conflux-service-x86_64-pc-windows-msvc.exe" 2>$null
taskkill /F /IM node.exe 2>$null

Write-Host ""
Write-Host "✅ 清理完成！现在可以运行 pnpm tauri dev" -ForegroundColor Green
Write-Host ""

# 显示剩余进程
$remaining = tasklist | Select-String -Pattern "conflux|mihomo|node"
if ($remaining) {
    Write-Host "警告：以下进程仍在运行：" -ForegroundColor Yellow
    $remaining
}

Read-Host "按 Enter 键退出"
