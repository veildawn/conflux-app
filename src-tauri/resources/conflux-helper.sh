#!/bin/bash
# Conflux Helper - 用于执行需要 root 权限的网络操作
# 安装到 /Library/PrivilegedHelperTools/com.conflux.helper
# 通过 LaunchDaemon 以 root 身份运行

SOCKET_PATH="/var/run/conflux-helper.sock"
LOG_FILE="/var/log/conflux-helper.log"

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') $1" >> "$LOG_FILE"
}

# 获取主要网络服务名称
get_primary_service() {
    local interface=$(route -n get default 2>/dev/null | grep 'interface:' | awk '{print $2}')
    if [ -z "$interface" ]; then
        echo ""
        return 1
    fi

    # 遍历所有网络服务找到匹配的
    while IFS= read -r service; do
        local device=$(networksetup -listallhardwareports | grep -A1 "Hardware Port: $service" | grep "Device:" | awk '{print $2}')
        if [ "$device" = "$interface" ]; then
            echo "$service"
            return 0
        fi
    done < <(networksetup -listallnetworkservices | tail -n +2)

    echo ""
    return 1
}

# 设置 DNS
set_dns() {
    local dns_servers="$1"
    local service=$(get_primary_service)

    if [ -z "$service" ]; then
        log "ERROR: Cannot find primary network service"
        echo "ERROR: Cannot find primary network service"
        return 1
    fi

    log "Setting DNS for '$service': $dns_servers"
    networksetup -setdnsservers "$service" $dns_servers

    if [ $? -eq 0 ]; then
        log "DNS set successfully"
        echo "OK"
        return 0
    else
        log "ERROR: Failed to set DNS"
        echo "ERROR: Failed to set DNS"
        return 1
    fi
}

# 重置 DNS 为 DHCP
reset_dns() {
    local service=$(get_primary_service)

    if [ -z "$service" ]; then
        log "ERROR: Cannot find primary network service"
        echo "ERROR: Cannot find primary network service"
        return 1
    fi

    log "Resetting DNS for '$service' to DHCP"
    networksetup -setdnsservers "$service" empty

    if [ $? -eq 0 ]; then
        log "DNS reset successfully"
        echo "OK"
        return 0
    else
        log "ERROR: Failed to reset DNS"
        echo "ERROR: Failed to reset DNS"
        return 1
    fi
}

# 获取当前 DNS
get_dns() {
    local service=$(get_primary_service)

    if [ -z "$service" ]; then
        echo "ERROR: Cannot find primary network service"
        return 1
    fi

    networksetup -getdnsservers "$service"
}

# 处理命令
handle_command() {
    local cmd="$1"
    shift

    case "$cmd" in
        "set-dns")
            set_dns "$@"
            ;;
        "reset-dns")
            reset_dns
            ;;
        "get-dns")
            get_dns
            ;;
        "ping")
            echo "pong"
            ;;
        *)
            echo "ERROR: Unknown command: $cmd"
            return 1
            ;;
    esac
}

# 如果作为服务运行（监听 socket）
run_daemon() {
    log "Starting Conflux Helper daemon"

    # 清理旧的 socket
    rm -f "$SOCKET_PATH"

    # 创建 socket 并监听
    while true; do
        # 使用 nc 监听 socket
        cmd=$(nc -lU "$SOCKET_PATH" 2>/dev/null)
        if [ -n "$cmd" ]; then
            log "Received command: $cmd"
            result=$(handle_command $cmd)
            log "Result: $result"
        fi
    done
}

# 直接执行命令（用于测试或一次性操作）
if [ "$1" = "--daemon" ]; then
    run_daemon
else
    handle_command "$@"
fi
