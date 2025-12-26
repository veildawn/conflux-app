use anyhow::Result;
use reqwest::Client;
use serde_json::json;
use std::time::Duration;

use crate::models::{
    ConnectionsResponse, DelayResponse, ProxiesResponse, RulesResponse, TrafficData, VersionInfo,
};

/// MiHomo REST API 客户端
pub struct MihomoApi {
    client: Client,
    base_url: String,
    secret: String,
}

impl MihomoApi {
    /// 创建新的 API 客户端
    pub fn new(base_url: String, secret: String) -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .expect("Failed to create HTTP client");

        Self {
            client,
            base_url,
            secret,
        }
    }

    /// 添加认证头
    fn auth_header(&self, request: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        if self.secret.is_empty() {
            request
        } else {
            request.header("Authorization", format!("Bearer {}", self.secret))
        }
    }

    /// 获取版本信息
    #[allow(dead_code)]
    pub async fn get_version(&self) -> Result<VersionInfo> {
        let url = format!("{}/version", self.base_url);
        let request = self.client.get(&url);
        let response = self.auth_header(request).send().await?;
        let version = response.json().await?;
        Ok(version)
    }

    /// 获取代理列表
    pub async fn get_proxies(&self) -> Result<ProxiesResponse> {
        let url = format!("{}/proxies", self.base_url);
        let request = self.client.get(&url);
        let response = self.auth_header(request).send().await?;
        let proxies = response.json().await?;
        Ok(proxies)
    }

    /// 获取单个代理信息
    #[allow(dead_code)]
    pub async fn get_proxy(&self, name: &str) -> Result<crate::models::ProxyInfo> {
        let url = format!("{}/proxies/{}", self.base_url, urlencoding::encode(name));
        let request = self.client.get(&url);
        let response = self.auth_header(request).send().await?;
        let proxy = response.json().await?;
        Ok(proxy)
    }

    /// 切换代理节点
    pub async fn select_proxy(&self, group: &str, name: &str) -> Result<()> {
        let url = format!("{}/proxies/{}", self.base_url, urlencoding::encode(group));
        let request = self.client.put(&url).json(&json!({ "name": name }));
        let response = self.auth_header(request).send().await?;

        if response.status().is_success() {
            Ok(())
        } else {
            let error_text = response.text().await.unwrap_or_default();
            Err(anyhow::anyhow!("Failed to select proxy: {}", error_text))
        }
    }

    /// 测试代理延迟
    pub async fn test_delay(&self, proxy: &str, timeout: u32, url: &str) -> Result<DelayResponse> {
        let api_url = format!(
            "{}/proxies/{}/delay",
            self.base_url,
            urlencoding::encode(proxy)
        );
        let request = self.client.get(&api_url).query(&[
            ("timeout", timeout.to_string()),
            ("url", url.to_string()),
        ]);
        let response = self.auth_header(request).send().await?;

        if response.status().is_success() {
            let delay = response.json().await?;
            Ok(delay)
        } else {
            Err(anyhow::anyhow!("Delay test failed or timed out"))
        }
    }

    /// 获取连接列表
    pub async fn get_connections(&self) -> Result<ConnectionsResponse> {
        let url = format!("{}/connections", self.base_url);
        let request = self.client.get(&url);
        let response = self.auth_header(request).send().await?;
        let connections = response.json().await?;
        Ok(connections)
    }

    /// 关闭指定连接
    pub async fn close_connection(&self, id: &str) -> Result<()> {
        let url = format!("{}/connections/{}", self.base_url, id);
        let request = self.client.delete(&url);
        let response = self.auth_header(request).send().await?;

        if response.status().is_success() {
            Ok(())
        } else {
            Err(anyhow::anyhow!("Failed to close connection"))
        }
    }

    /// 关闭所有连接
    pub async fn close_all_connections(&self) -> Result<()> {
        let url = format!("{}/connections", self.base_url);
        let request = self.client.delete(&url);
        let response = self.auth_header(request).send().await?;

        if response.status().is_success() {
            Ok(())
        } else {
            Err(anyhow::anyhow!("Failed to close all connections"))
        }
    }

    /// 获取实时流量数据
    pub async fn get_traffic(&self) -> Result<TrafficData> {
        let url = format!("{}/traffic", self.base_url);
        let request = self.client.get(&url);
        let response = self.auth_header(request).send().await?;
        
        // traffic 端点返回的是流式数据，我们只取第一行
        let text = response.text().await?;
        if let Some(line) = text.lines().next() {
            let traffic: TrafficData = serde_json::from_str(line)?;
            Ok(traffic)
        } else {
            Ok(TrafficData::default())
        }
    }

    /// 切换代理模式
    pub async fn patch_configs(&self, mode: &str) -> Result<()> {
        let url = format!("{}/configs", self.base_url);
        let request = self.client.patch(&url).json(&json!({ "mode": mode }));
        let response = self.auth_header(request).send().await?;

        if response.status().is_success() {
            Ok(())
        } else {
            let error_text = response.text().await.unwrap_or_default();
            Err(anyhow::anyhow!("Failed to patch configs: {}", error_text))
        }
    }

    /// 设置 TUN 模式
    pub async fn set_tun(&self, enabled: bool) -> Result<()> {
        let url = format!("{}/configs", self.base_url);
        let tun_config = if enabled {
            json!({
                "tun": {
                    "enable": true,
                    "stack": "system",
                    "auto-route": true,
                    "auto-detect-interface": true
                }
            })
        } else {
            json!({
                "tun": {
                    "enable": false
                }
            })
        };
        
        let request = self.client.patch(&url).json(&tun_config);
        let response = self.auth_header(request).send().await?;

        if response.status().is_success() {
            Ok(())
        } else {
            let error_text = response.text().await.unwrap_or_default();
            Err(anyhow::anyhow!("Failed to set TUN mode: {}", error_text))
        }
    }

    /// 重载配置
    pub async fn reload_configs(&self, path: &str, force: bool) -> Result<()> {
        let url = format!("{}/configs", self.base_url);
        let request = self.client.put(&url).json(&json!({
            "path": path,
            "payload": ""
        }));
        let response = self.auth_header(request)
            .query(&[("force", force.to_string())])
            .send()
            .await?;

        if response.status().is_success() {
            Ok(())
        } else {
            let error_text = response.text().await.unwrap_or_default();
            Err(anyhow::anyhow!("Failed to reload configs: {}", error_text))
        }
    }

    /// 获取配置
    #[allow(dead_code)]
    pub async fn get_configs(&self) -> Result<serde_json::Value> {
        let url = format!("{}/configs", self.base_url);
        let request = self.client.get(&url);
        let response = self.auth_header(request).send().await?;
        let configs = response.json().await?;
        Ok(configs)
    }

    /// 获取规则列表
    pub async fn get_rules(&self) -> Result<RulesResponse> {
        let url = format!("{}/rules", self.base_url);
        let request = self.client.get(&url);
        let response = self.auth_header(request).send().await?;
        let rules = response.json().await?;
        Ok(rules)
    }
}




