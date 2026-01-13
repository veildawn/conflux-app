# Mihomo API 中文文档

> 官方文档：https://wiki.metacubex.one/api/

Mihomo（原 Clash.Meta）提供 RESTful API 用于外部控制和管理代理核心。

## 目录

- [请求说明](#请求说明)
- [日志](#日志)
- [流量信息](#流量信息)
- [内存信息](#内存信息)
- [版本信息](#版本信息)
- [缓存](#缓存)
- [运行配置](#运行配置)
- [更新](#更新)
- [策略组](#策略组)
- [代理](#代理)
- [代理集合](#代理集合)
- [规则](#规则)
- [规则集合](#规则集合)
- [连接](#连接)
- [域名查询](#域名查询)
- [DEBUG](#debug)

---

## 请求说明

### 基本格式

```bash
curl -H 'Authorization: Bearer ${secret}' http://${controller-api}/configs?force=true -d '{"path": "", "payload": ""}' -X PUT
```

### 参数说明

| 参数                          | 说明                                                    |
| ----------------------------- | ------------------------------------------------------- |
| `${secret}`                   | 配置文件中设置的 API 密钥                               |
| `${controller-api}`           | 配置文件中设置的 API 监听地址（默认：`127.0.0.1:9090`） |
| `?force=true`                 | 携带参数，部分请求需要                                  |
| `{"path": "", "payload": ""}` | 要更新的资源数据                                        |

### 认证方式

请求头需要添加：

```
Authorization: Bearer <secret>
```

> **注意**：如果配置文件路径不在 Clash 工作目录，请手动设置 `SAFE_PATHS` 环境变量将其加入安全路径。该环境变量的语法同本操作系统的 PATH 环境变量解析规则（Windows 下以分号分割，其他系统下以冒号分割）。

---

## 日志

### GET /logs

获取实时日志（WebSocket 连接）

**响应示例**：

```json
{
  "type": "info",
  "payload": "Start initial configuration in progress"
}
```

### GET /logs?level={log_level}

获取指定等级的日志

**参数**：
| 参数 | 可选值 |
|------|--------|
| `level` | `info`、`debug`、`warning`、`error` |

---

## 流量信息

### GET /traffic

获取实时流量（WebSocket 连接）

**响应示例**：

```json
{
  "up": 1024,
  "down": 2048
}
```

> 单位：kbps

---

## 内存信息

### GET /memory

获取实时内存占用（WebSocket 连接）

**响应示例**：

```json
{
  "inuse": 102400,
  "oslimit": 0
}
```

> 单位：kb

---

## 版本信息

### GET /version

获取 Mihomo 版本信息

**响应示例**：

```json
{
  "meta": true,
  "version": "v1.18.0"
}
```

---

## 缓存

### POST /cache/fakeip/flush

清除 FakeIP 缓存

**请求方法**：`POST`

---

## 运行配置

### GET /configs

获取基本配置

**响应示例**：

```json
{
  "port": 7890,
  "socks-port": 7891,
  "redir-port": 0,
  "tproxy-port": 0,
  "mixed-port": 0,
  "authentication": [],
  "allow-lan": false,
  "bind-address": "*",
  "mode": "rule",
  "log-level": "info",
  "ipv6": false
}
```

### PUT /configs?force=true

重新加载基本配置

**请求参数**：

- URL 需携带 `?force=true` 强制执行
- 必须发送数据

**请求体**：

```json
{
  "path": "/path/to/config.yaml",
  "payload": ""
}
```

### PATCH /configs

更新基本配置（部分更新）

**请求体示例**：

```json
{
  "mixed-port": 7890,
  "mode": "rule",
  "log-level": "info"
}
```

### POST /configs/geo

更新 GEO 数据库

**请求方法**：`POST`（必须发送数据）

### POST /restart

重启内核

**请求方法**：`POST`（必须发送数据）

---

## 更新

### POST /upgrade

更新内核

**请求方法**：`POST`（必须发送数据）

### POST /upgrade/ui

更新面板

**请求方法**：`POST`

> 须设置 `external-ui` 配置项

### POST /upgrade/geo

更新 GEO 数据库

**请求方法**：`POST`（必须发送数据）

---

## 策略组

### GET /group

获取所有策略组信息

**响应示例**：

```json
{
  "proxies": {
    "PROXY": {
      "name": "PROXY",
      "type": "Selector",
      "now": "节点1",
      "all": ["节点1", "节点2", "节点3"]
    }
  }
}
```

### GET /group/{group_name}

获取指定策略组的详细信息

**路径参数**：
| 参数 | 说明 |
|------|------|
| `group_name` | 策略组名称 |

### DELETE /group/{group_name}

清除自动策略组的 fixed 选择

### GET /group/{group_name}/delay

对指定策略组内的节点/策略组进行延迟测试

**请求参数**：
| 参数 | 说明 | 示例 |
|------|------|------|
| `url` | 测试 URL | `http://www.gstatic.com/generate_204` |
| `timeout` | 超时时间（毫秒）| `5000` |

**请求示例**：

```
GET /group/PROXY/delay?url=http://www.gstatic.com/generate_204&timeout=5000
```

**响应示例**：

```json
{
  "节点1": 120,
  "节点2": 200,
  "节点3": 0
}
```

> 返回值为 0 表示超时或测试失败

---

## 代理

### GET /proxies

获取所有代理信息

**响应示例**：

```json
{
  "proxies": {
    "DIRECT": {
      "name": "DIRECT",
      "type": "Direct",
      "history": []
    },
    "REJECT": {
      "name": "REJECT",
      "type": "Reject",
      "history": []
    },
    "节点1": {
      "name": "节点1",
      "type": "Shadowsocks",
      "history": [
        {
          "time": "2024-01-01T00:00:00.000Z",
          "delay": 120
        }
      ]
    }
  }
}
```

### GET /proxies/{proxy_name}

获取指定代理的详细信息

**路径参数**：
| 参数 | 说明 |
|------|------|
| `proxy_name` | 代理名称 |

### PUT /proxies/{proxy_name}

选择特定的代理（用于 Selector 类型的策略组）

**请求体**：

```json
{
  "name": "节点名称"
}
```

**示例**：

```bash
curl -X PUT -H 'Authorization: Bearer secret' \
  -H 'Content-Type: application/json' \
  -d '{"name":"日本节点"}' \
  http://127.0.0.1:9090/proxies/PROXY
```

### GET /proxies/{proxy_name}/delay

对指定代理进行延迟测试

**请求参数**：
| 参数 | 说明 | 示例 |
|------|------|------|
| `url` | 测试 URL | `http://www.gstatic.com/generate_204` |
| `timeout` | 超时时间（毫秒）| `5000` |

**请求示例**：

```
GET /proxies/节点1/delay?url=http://www.gstatic.com/generate_204&timeout=5000
```

**响应示例**：

```json
{
  "delay": 120
}
```

---

## 代理集合

### GET /providers/proxies

获取所有代理集合的信息

**响应示例**：

```json
{
  "providers": {
    "default": {
      "name": "default",
      "type": "Proxy",
      "vehicleType": "Compatible",
      "proxies": []
    },
    "subscription": {
      "name": "subscription",
      "type": "Proxy",
      "vehicleType": "HTTP",
      "updatedAt": "2024-01-01T00:00:00.000Z",
      "proxies": [...]
    }
  }
}
```

### GET /providers/proxies/{provider_name}

获取指定代理集合的详细信息

### PUT /providers/proxies/{provider_name}

更新代理集合（触发订阅更新）

### GET /providers/proxies/{provider_name}/healthcheck

触发指定代理集合的健康检查

### GET /providers/proxies/{provider_name}/{proxy_name}/healthcheck

对代理集合内的指定代理进行延迟测试

**请求参数**：
| 参数 | 说明 | 示例 |
|------|------|------|
| `url` | 测试 URL | `http://www.gstatic.com/generate_204` |
| `timeout` | 超时时间（毫秒）| `5000` |

---

## 规则

### GET /rules

获取所有规则信息

**响应示例**：

```json
{
  "rules": [
    {
      "type": "DOMAIN-SUFFIX",
      "payload": "google.com",
      "proxy": "PROXY"
    },
    {
      "type": "GEOIP",
      "payload": "CN",
      "proxy": "DIRECT"
    }
  ]
}
```

---

## 规则集合

### GET /providers/rules

获取所有规则集合的信息

**响应示例**：

```json
{
  "providers": {
    "rule-set-1": {
      "name": "rule-set-1",
      "type": "Rule",
      "behavior": "domain",
      "ruleCount": 100,
      "updatedAt": "2024-01-01T00:00:00.000Z",
      "vehicleType": "HTTP"
    }
  }
}
```

### PUT /providers/rules/{provider_name}

更新指定规则集合

---

## 连接

### GET /connections

获取所有连接信息

**响应示例**：

```json
{
  "downloadTotal": 1024000,
  "uploadTotal": 512000,
  "connections": [
    {
      "id": "uuid-string",
      "metadata": {
        "network": "tcp",
        "type": "HTTP",
        "sourceIP": "127.0.0.1",
        "destinationIP": "142.250.185.78",
        "sourcePort": "54321",
        "destinationPort": "443",
        "host": "www.google.com",
        "dnsMode": "normal",
        "processPath": "/Applications/Chrome.app"
      },
      "upload": 1024,
      "download": 2048,
      "start": "2024-01-01T00:00:00.000Z",
      "chains": ["PROXY", "节点1"],
      "rule": "DOMAIN-SUFFIX",
      "rulePayload": "google.com"
    }
  ]
}
```

### DELETE /connections

关闭所有连接

### DELETE /connections/{id}

关闭指定连接

**路径参数**：
| 参数 | 说明 |
|------|------|
| `id` | 连接 ID |

---

## 域名查询

### GET /dns/query

进行 DNS 查询

**请求参数**：
| 参数 | 说明 | 示例 |
|------|------|------|
| `name` | 域名 | `example.com` |
| `type` | 记录类型 | `A`、`AAAA`、`MX`、`TXT` 等 |

**请求示例**：

```
GET /dns/query?name=example.com&type=A
```

**响应示例**：

```json
{
  "Status": 0,
  "Question": [
    {
      "Name": "example.com.",
      "Qtype": 1,
      "Qclass": 1
    }
  ],
  "Answer": [
    {
      "Name": "example.com.",
      "Type": 1,
      "TTL": 300,
      "Data": "93.184.216.34"
    }
  ]
}
```

---

## DEBUG

> ⚠️ 使用 `/debug` 相关接口需要内核启动时日志级别设置为 `debug`

### PUT /debug/gc

主动进行垃圾回收（GC）

### GET /debug/pprof

查看原始 DEBUG 信息

浏览器打开 `http://${controller-api}/debug/pprof` 可查看：

| 端点     | 说明                                                           |
| -------- | -------------------------------------------------------------- |
| `allocs` | 每个函数调用的内存分配情况，包括堆栈和堆上分配的内存大小及次数 |
| `heap`   | 堆上使用的内存详细信息，包括被分配的内存块的大小、数量和地址   |

#### 使用 Graphviz 查看图形化报告

**查看 Heap 报告**：

```bash
go tool pprof -http=:8080 http://127.0.0.1:9090/debug/pprof/heap
```

**查看 Allocs 报告**：

```bash
go tool pprof -http=:8080 http://127.0.0.1:9090/debug/pprof/allocs
```

**下载报告文件**：

```
http://${controller-api}/debug/pprof/heap?raw=true
```

---

## 常用配置项

在 `config.yaml` 中配置 API：

```yaml
# API 监听地址
external-controller: 127.0.0.1:9090

# API 密钥（可选）
secret: 'your-secret-key'

# 外部 UI 路径（可选）
external-ui: /path/to/ui
```

---

## 参考链接

- 官方文档：https://wiki.metacubex.one/api/
- GitHub 仓库：https://github.com/MetaCubeX/mihomo
