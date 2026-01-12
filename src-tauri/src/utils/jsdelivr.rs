//! JsDelivr CDN 加速工具
//!
//! 将 GitHub 资源 URL 转换为 JsDelivr CDN URL 以加速国内访问。
//!
//! 支持的转换格式：
//! - `https://raw.githubusercontent.com/user/repo/branch/path` → `https://cdn.jsdelivr.net/gh/user/repo@branch/path`
//! - `https://github.com/user/repo/raw/branch/path` → `https://cdn.jsdelivr.net/gh/user/repo@branch/path`
//! - `https://gist.githubusercontent.com/user/gist_id/raw/...` → `https://cdn.jsdelivr.net/gh/user/gist_id@...`

use regex::Regex;

/// 将 GitHub URL 转换为 JsDelivr CDN URL
///
/// 如果 URL 不是 GitHub URL，则原样返回
pub fn convert_github_to_jsdelivr(url: &str) -> String {
    // raw.githubusercontent.com 格式
    // https://raw.githubusercontent.com/user/repo/branch/path/to/file
    // -> https://cdn.jsdelivr.net/gh/user/repo@branch/path/to/file
    if let Some(converted) = try_convert_raw_githubusercontent(url) {
        return converted;
    }

    // github.com/user/repo/raw/branch/path 格式
    // https://github.com/user/repo/raw/branch/path/to/file
    // -> https://cdn.jsdelivr.net/gh/user/repo@branch/path/to/file
    if let Some(converted) = try_convert_github_raw(url) {
        return converted;
    }

    // gist.githubusercontent.com 格式 (暂不支持，直接返回原 URL)
    // gist 格式比较复杂，暂不处理

    // 不是 GitHub URL，原样返回
    url.to_string()
}

/// 尝试转换 raw.githubusercontent.com URL
fn try_convert_raw_githubusercontent(url: &str) -> Option<String> {
    // 匹配: https://raw.githubusercontent.com/user/repo/branch/path...
    let re = Regex::new(
        r"^https?://raw\.githubusercontent\.com/([^/]+)/([^/]+)/([^/]+)/(.+)$"
    ).ok()?;

    let caps = re.captures(url)?;
    let user = caps.get(1)?.as_str();
    let repo = caps.get(2)?.as_str();
    let branch = caps.get(3)?.as_str();
    let path = caps.get(4)?.as_str();

    Some(format!(
        "https://cdn.jsdelivr.net/gh/{}/{}@{}/{}",
        user, repo, branch, path
    ))
}

/// 尝试转换 github.com/.../raw/... URL
fn try_convert_github_raw(url: &str) -> Option<String> {
    // 匹配: https://github.com/user/repo/raw/branch/path...
    let re = Regex::new(
        r"^https?://github\.com/([^/]+)/([^/]+)/raw/([^/]+)/(.+)$"
    ).ok()?;

    let caps = re.captures(url)?;
    let user = caps.get(1)?.as_str();
    let repo = caps.get(2)?.as_str();
    let branch = caps.get(3)?.as_str();
    let path = caps.get(4)?.as_str();

    Some(format!(
        "https://cdn.jsdelivr.net/gh/{}/{}@{}/{}",
        user, repo, branch, path
    ))
}

/// 检查 URL 是否是 GitHub 资源 URL（可以被转换为 JsDelivr）
pub fn is_github_resource_url(url: &str) -> bool {
    url.starts_with("https://raw.githubusercontent.com/")
        || url.starts_with("http://raw.githubusercontent.com/")
        || (url.contains("github.com/") && url.contains("/raw/"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_convert_raw_githubusercontent() {
        let url = "https://raw.githubusercontent.com/user/repo/main/path/to/file.yaml";
        let expected = "https://cdn.jsdelivr.net/gh/user/repo@main/path/to/file.yaml";
        assert_eq!(convert_github_to_jsdelivr(url), expected);
    }

    #[test]
    fn test_convert_github_raw() {
        let url = "https://github.com/user/repo/raw/main/path/to/file.yaml";
        let expected = "https://cdn.jsdelivr.net/gh/user/repo@main/path/to/file.yaml";
        assert_eq!(convert_github_to_jsdelivr(url), expected);
    }

    #[test]
    fn test_non_github_url_unchanged() {
        let url = "https://example.com/some/file.yaml";
        assert_eq!(convert_github_to_jsdelivr(url), url);
    }

    #[test]
    fn test_is_github_resource_url() {
        assert!(is_github_resource_url("https://raw.githubusercontent.com/user/repo/main/file"));
        assert!(is_github_resource_url("https://github.com/user/repo/raw/main/file"));
        assert!(!is_github_resource_url("https://example.com/file"));
        assert!(!is_github_resource_url("https://github.com/user/repo"));
    }
}
