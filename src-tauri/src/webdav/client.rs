use anyhow::{anyhow, Result};
use base64::{engine::general_purpose::STANDARD, Engine};
use reqwest::{header, Client, StatusCode};
use serde::{Deserialize, Serialize};
use tokio::time::{sleep, Duration};

const RETRY_MAX_ATTEMPTS: usize = 5;
const RETRY_BASE_DELAY_MS: u64 = 250;
const RETRY_MAX_DELAY_MS: u64 = 4000;

/// WebDAV 文件信息
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebDavFileInfo {
    pub path: String,
    pub is_dir: bool,
    pub size: Option<u64>,
    pub last_modified: Option<String>,
    pub etag: Option<String>,
}

/// WebDAV 客户端
pub struct WebDavClient {
    client: Client,
    base_url: String,
    auth_header: String,
}

impl WebDavClient {
    /// 创建新的 WebDAV 客户端
    pub fn new(url: &str, username: &str, password: &str) -> Result<Self> {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()?;

        // 构建 Basic Auth header
        let credentials = format!("{}:{}", username, password);
        let auth_header = format!("Basic {}", STANDARD.encode(credentials));

        // 规范化 URL（移除末尾斜杠）
        let base_url = url.trim_end_matches('/').to_string();

        Ok(Self {
            client,
            base_url,
            auth_header,
        })
    }

    /// 测试连接
    pub async fn test_connection(&self) -> Result<bool> {
        let url = format!("{}/", self.base_url);

        let response = self
            .client
            .request(reqwest::Method::from_bytes(b"PROPFIND").unwrap(), &url)
            .header(header::AUTHORIZATION, &self.auth_header)
            .header("Depth", "0")
            .send()
            .await?;

        match response.status() {
            StatusCode::OK | StatusCode::MULTI_STATUS => Ok(true),
            StatusCode::UNAUTHORIZED => Err(anyhow!("认证失败：用户名或密码错误")),
            StatusCode::NOT_FOUND => Err(anyhow!("路径不存在")),
            status => Err(anyhow!("连接失败：HTTP {}", status)),
        }
    }

    /// 确保目录存在（递归创建）
    pub async fn ensure_dir(&self, path: &str) -> Result<()> {
        log::debug!("确保目录存在: {}", path);
        let parts: Vec<&str> = path.trim_matches('/').split('/').collect();
        let mut current_path = String::new();

        for part in parts {
            if part.is_empty() {
                continue;
            }
            current_path = format!("{}/{}", current_path, part);
            let url = format!("{}{}/", self.base_url, current_path);

            // 先检查目录是否存在
            log::debug!("检查目录: {}", url);
            let check_response = self
                .client
                .request(reqwest::Method::from_bytes(b"PROPFIND").unwrap(), &url)
                .header(header::AUTHORIZATION, &self.auth_header)
                .header("Depth", "0")
                .send()
                .await?;

            let status = check_response.status();
            log::debug!("目录检查响应: HTTP {}", status);

            if status == StatusCode::NOT_FOUND {
                // 创建目录
                log::info!("创建目录: {}", current_path);
                let mkcol_response = self
                    .client
                    .request(reqwest::Method::from_bytes(b"MKCOL").unwrap(), &url)
                    .header(header::AUTHORIZATION, &self.auth_header)
                    .send()
                    .await?;

                let mkcol_status = mkcol_response.status();
                log::debug!("创建目录响应: HTTP {}", mkcol_status);

                if !mkcol_status.is_success() && mkcol_status != StatusCode::METHOD_NOT_ALLOWED {
                    let body = mkcol_response.text().await.unwrap_or_default();
                    log::error!("创建目录失败: {} - {}", mkcol_status, body);
                    return Err(anyhow!(
                        "创建目录失败 '{}': HTTP {}",
                        current_path,
                        mkcol_status
                    ));
                }
            }
        }

        Ok(())
    }

    /// 上传文件
    pub async fn upload_file(&self, remote_path: &str, content: &[u8]) -> Result<()> {
        log::debug!("上传文件: {} ({} bytes)", remote_path, content.len());

        // 确保父目录存在
        if let Some(parent) = std::path::Path::new(remote_path).parent() {
            if let Some(parent_str) = parent.to_str() {
                if !parent_str.is_empty() {
                    log::debug!("确保父目录存在: {}", parent_str);
                    self.ensure_dir(parent_str).await?;
                }
            }
        }

        let url = format!("{}{}", self.base_url, remote_path);
        log::debug!("PUT {}", url);
        for attempt in 1..=RETRY_MAX_ATTEMPTS {
            let response = self
                .client
                .put(&url)
                .header(header::AUTHORIZATION, &self.auth_header)
                .header(header::CONTENT_TYPE, "application/octet-stream")
                .body(content.to_vec())
                .send()
                .await;

            match response {
                Ok(resp) => {
                    let status = resp.status();
                    log::debug!(
                        "上传响应: HTTP {} (attempt {}/{})",
                        status,
                        attempt,
                        RETRY_MAX_ATTEMPTS
                    );

                    match status {
                        StatusCode::OK | StatusCode::CREATED | StatusCode::NO_CONTENT => {
                            log::debug!("上传成功: {}", remote_path);
                            return Ok(());
                        }
                        StatusCode::UNAUTHORIZED => return Err(anyhow!("认证失败")),
                        _ if should_retry_status(status) && attempt < RETRY_MAX_ATTEMPTS => {
                            let _ = resp.text().await; // 尽量读掉 body，便于连接复用
                            sleep(retry_delay(attempt)).await;
                            continue;
                        }
                        _ => {
                            let body = resp.text().await.unwrap_or_default();
                            log::error!("上传失败: HTTP {} - {}", status, body);
                            return Err(anyhow!("上传失败：HTTP {}", status));
                        }
                    }
                }
                Err(e) => {
                    log::warn!(
                        "上传请求失败: {} (attempt {}/{})",
                        e,
                        attempt,
                        RETRY_MAX_ATTEMPTS
                    );
                    if attempt < RETRY_MAX_ATTEMPTS && is_retryable_reqwest_error(&e) {
                        sleep(retry_delay(attempt)).await;
                        continue;
                    }
                    return Err(anyhow!("上传失败：{}", e));
                }
            }
        }

        Err(anyhow!("上传失败：超过最大重试次数"))
    }

    /// 下载文件
    pub async fn download_file(&self, remote_path: &str) -> Result<Vec<u8>> {
        let url = format!("{}{}", self.base_url, remote_path);
        for attempt in 1..=RETRY_MAX_ATTEMPTS {
            let response = self
                .client
                .get(&url)
                .header(header::AUTHORIZATION, &self.auth_header)
                .send()
                .await;

            match response {
                Ok(resp) => {
                    let status = resp.status();
                    match status {
                        StatusCode::OK => return Ok(resp.bytes().await?.to_vec()),
                        StatusCode::NOT_FOUND => {
                            return Err(anyhow!("文件不存在：{}", remote_path))
                        }
                        StatusCode::UNAUTHORIZED => return Err(anyhow!("认证失败")),
                        _ if should_retry_status(status) && attempt < RETRY_MAX_ATTEMPTS => {
                            let _ = resp.text().await;
                            sleep(retry_delay(attempt)).await;
                            continue;
                        }
                        _ => return Err(anyhow!("下载失败：HTTP {}", status)),
                    }
                }
                Err(e) => {
                    log::warn!(
                        "下载请求失败: {} (attempt {}/{})",
                        e,
                        attempt,
                        RETRY_MAX_ATTEMPTS
                    );
                    if attempt < RETRY_MAX_ATTEMPTS && is_retryable_reqwest_error(&e) {
                        sleep(retry_delay(attempt)).await;
                        continue;
                    }
                    return Err(anyhow!("下载失败：{}", e));
                }
            }
        }

        Err(anyhow!("下载失败：超过最大重试次数"))
    }

    /// 获取文件信息（Last-Modified, ETag 等）
    #[allow(dead_code)]
    pub async fn get_file_info(&self, remote_path: &str) -> Result<Option<WebDavFileInfo>> {
        let url = format!("{}{}", self.base_url, remote_path);

        let response = self
            .client
            .request(reqwest::Method::from_bytes(b"PROPFIND").unwrap(), &url)
            .header(header::AUTHORIZATION, &self.auth_header)
            .header("Depth", "0")
            .send()
            .await?;

        match response.status() {
            StatusCode::OK | StatusCode::MULTI_STATUS => {
                let body = response.text().await?;
                // 简单解析 XML 响应获取基本信息
                let last_modified = Self::extract_xml_value(&body, "getlastmodified");
                let etag = Self::extract_xml_value(&body, "getetag");
                let size =
                    Self::extract_xml_value(&body, "getcontentlength").and_then(|s| s.parse().ok());
                let is_dir = body.contains("<D:collection") || body.contains("<d:collection");

                Ok(Some(WebDavFileInfo {
                    path: remote_path.to_string(),
                    is_dir,
                    size,
                    last_modified,
                    etag,
                }))
            }
            StatusCode::NOT_FOUND => Ok(None),
            StatusCode::UNAUTHORIZED => Err(anyhow!("认证失败")),
            status => Err(anyhow!("获取文件信息失败：HTTP {}", status)),
        }
    }

    /// 删除文件
    pub async fn delete_file(&self, path: &str) -> Result<()> {
        let url = format!("{}{}", self.base_url, path);

        let response = self
            .client
            .request(reqwest::Method::DELETE, &url)
            .header(header::AUTHORIZATION, &self.auth_header)
            .send()
            .await?;

        match response.status() {
            StatusCode::OK | StatusCode::NO_CONTENT | StatusCode::NOT_FOUND => Ok(()),
            StatusCode::UNAUTHORIZED => Err(anyhow!("认证失败")),
            status => Err(anyhow!("删除失败：HTTP {}", status)),
        }
    }

    /// 列出目录内容（返回相对于 base_url 的路径列表）
    pub async fn list_dir(&self, path: &str) -> Result<Vec<(String, bool)>> {
        let url = if path.ends_with('/') {
            format!("{}{}", self.base_url, path)
        } else {
            format!("{}{}/", self.base_url, path)
        };

        let response = self
            .client
            .request(reqwest::Method::from_bytes(b"PROPFIND").unwrap(), &url)
            .header(header::AUTHORIZATION, &self.auth_header)
            .header("Depth", "1")
            .send()
            .await?;

        match response.status() {
            StatusCode::OK | StatusCode::MULTI_STATUS => {
                let body = response.text().await?;
                Ok(Self::parse_propfind_entries(&body, path))
            }
            StatusCode::NOT_FOUND => Ok(vec![]),
            StatusCode::UNAUTHORIZED => Err(anyhow!("认证失败")),
            status => Err(anyhow!("列出目录失败：HTTP {}", status)),
        }
    }

    /// 递归删除目录内容（坚果云不允许直接删除非空目录）
    /// 使用迭代方式避免异步递归问题
    pub async fn delete_dir_contents(&self, path: &str) -> Result<()> {
        // 收集所有需要处理的目录（广度优先）
        let mut dirs_to_process = vec![path.to_string()];
        let mut all_files = Vec::new();
        let mut all_dirs = Vec::new();

        // 遍历所有目录，收集文件和子目录
        while let Some(current_dir) = dirs_to_process.pop() {
            let entries = self.list_dir(&current_dir).await?;

            for (entry_path, is_dir) in entries {
                if is_dir {
                    dirs_to_process.push(entry_path.clone());
                    all_dirs.push(entry_path);
                } else {
                    all_files.push(entry_path);
                }
            }
        }

        // 先删除所有文件
        for file_path in all_files {
            let _ = self.delete_file(&file_path).await;
        }

        // 按路径深度倒序删除目录（先删子目录）
        all_dirs.sort_by(|a, b| b.matches('/').count().cmp(&a.matches('/').count()));
        for dir_path in all_dirs {
            let _ = self.delete_file(&format!("{}/", dir_path)).await;
        }

        Ok(())
    }

    /// 解析 PROPFIND 响应，提取子项路径
    fn parse_propfind_entries(xml: &str, parent_path: &str) -> Vec<(String, bool)> {
        let mut entries = Vec::new();
        let parent_normalized = parent_path.trim_matches('/');

        log::debug!("解析 PROPFIND 响应, 父目录: {}", parent_normalized);
        log::trace!("XML 响应: {}", xml);

        // 简单解析：查找所有 <d:href> 或 <D:href>
        for pattern in &["<d:href>", "<D:href>"] {
            let end_pattern = if *pattern == "<d:href>" {
                "</d:href>"
            } else {
                "</D:href>"
            };
            let mut search_start = 0;

            while let Some(start_idx) = xml[search_start..].find(pattern) {
                let abs_start = search_start + start_idx + pattern.len();
                if let Some(end_idx) = xml[abs_start..].find(end_pattern) {
                    let href = &xml[abs_start..abs_start + end_idx];
                    log::debug!("找到 href: {}", href);

                    // 从 href 中提取路径
                    // 优先尝试找 /dav/ 前缀（坚果云），否则直接查找 parent_path
                    let path = if let Some(path_start) = href.find("/dav/") {
                        // 坚果云格式：/dav/conflux/...
                        &href[path_start + 4..] // 去掉 "/dav"
                    } else if let Some(path_start) = href.find(&format!("/{}", parent_normalized)) {
                        // 直接查找父目录路径
                        &href[path_start..]
                    } else if href.starts_with('/') {
                        // 已经是绝对路径
                        href
                    } else {
                        // 跳过无法解析的 href
                        search_start = abs_start + end_idx;
                        continue;
                    };

                    let path_normalized = path.trim_matches('/');
                    log::debug!("解析后路径: {}", path_normalized);

                    // 跳过父目录本身
                    if path_normalized != parent_normalized
                        && path_normalized.starts_with(parent_normalized)
                    {
                        // 检查是否是目录（以 / 结尾或包含 collection）
                        let is_dir = path.ends_with('/') || {
                            // 查找该条目对应的 response 块是否包含 collection
                            let response_start = xml[..abs_start]
                                .rfind("<d:response>")
                                .or_else(|| xml[..abs_start].rfind("<D:response>"))
                                .unwrap_or(0);
                            let response_end = xml[abs_start..]
                                .find("</d:response>")
                                .or_else(|| xml[abs_start..].find("</D:response>"))
                                .map(|i| abs_start + i)
                                .unwrap_or(xml.len());
                            let response_block = &xml[response_start..response_end];
                            response_block.contains("<d:collection")
                                || response_block.contains("<D:collection")
                        };

                        let clean_path = format!("/{}", path_normalized);
                        if !entries.iter().any(|(p, _)| p == &clean_path) {
                            log::debug!("添加条目: {} (目录: {})", clean_path, is_dir);
                            entries.push((clean_path, is_dir));
                        }
                    }
                    search_start = abs_start + end_idx;
                } else {
                    break;
                }
            }
        }

        log::debug!("解析完成, 共 {} 个条目", entries.len());
        entries
    }

    /// 简单的 XML 值提取（避免引入重量级 XML 库）
    #[allow(dead_code)]
    fn extract_xml_value(xml: &str, tag: &str) -> Option<String> {
        // 尝试多种命名空间前缀
        let patterns = [
            format!("<D:{}>", tag),
            format!("<d:{}>", tag),
            format!("<{}>", tag),
            format!("<lp1:{}>", tag),
            format!("<lp2:{}>", tag),
        ];

        let end_patterns = [
            format!("</D:{}>", tag),
            format!("</d:{}>", tag),
            format!("</{}>", tag),
            format!("</lp1:{}>", tag),
            format!("</lp2:{}>", tag),
        ];

        for (start_pattern, end_pattern) in patterns.iter().zip(end_patterns.iter()) {
            if let Some(start_idx) = xml.find(start_pattern) {
                let value_start = start_idx + start_pattern.len();
                if let Some(end_idx) = xml[value_start..].find(end_pattern) {
                    let value = xml[value_start..value_start + end_idx].trim();
                    if !value.is_empty() {
                        return Some(value.to_string());
                    }
                }
            }
        }

        None
    }
}

fn should_retry_status(status: StatusCode) -> bool {
    matches!(
        status,
        StatusCode::TOO_MANY_REQUESTS
            | StatusCode::INTERNAL_SERVER_ERROR
            | StatusCode::BAD_GATEWAY
            | StatusCode::SERVICE_UNAVAILABLE
            | StatusCode::GATEWAY_TIMEOUT
    )
}

fn retry_delay(attempt: usize) -> Duration {
    // attempt 从 1 开始：250ms, 500ms, 1000ms, 2000ms, 4000ms
    let pow = (attempt - 1).min(8) as u32;
    let mut ms = RETRY_BASE_DELAY_MS.saturating_mul(2u64.saturating_pow(pow));
    if ms > RETRY_MAX_DELAY_MS {
        ms = RETRY_MAX_DELAY_MS;
    }
    Duration::from_millis(ms)
}

fn is_retryable_reqwest_error(e: &reqwest::Error) -> bool {
    e.is_timeout() || e.is_connect() || e.is_request() || e.is_body() || e.is_decode()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_xml_extract() {
        let xml = r#"<D:getlastmodified>Mon, 01 Jan 2024 00:00:00 GMT</D:getlastmodified>"#;
        assert_eq!(
            WebDavClient::extract_xml_value(xml, "getlastmodified"),
            Some("Mon, 01 Jan 2024 00:00:00 GMT".to_string())
        );
    }
}
