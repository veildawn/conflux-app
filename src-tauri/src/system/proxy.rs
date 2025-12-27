use anyhow::Result;
use std::process::Command;

/// 系统代理管理
pub struct SystemProxy;

impl SystemProxy {
    /// 设置系统 HTTP 代理
    #[cfg(target_os = "macos")]
    pub fn set_http_proxy(host: &str, port: u16) -> Result<()> {
        let services = Self::get_network_services()?;
        
        for service in services {
            // 设置 HTTP 代理
            Command::new("networksetup")
                .args(["-setwebproxy", &service, host, &port.to_string()])
                .output()?;
            
            // 启用 HTTP 代理
            Command::new("networksetup")
                .args(["-setwebproxystate", &service, "on"])
                .output()?;
            
            // 设置 HTTPS 代理
            Command::new("networksetup")
                .args(["-setsecurewebproxy", &service, host, &port.to_string()])
                .output()?;
            
            // 启用 HTTPS 代理
            Command::new("networksetup")
                .args(["-setsecurewebproxystate", &service, "on"])
                .output()?;
        }
        
        log::info!("System HTTP proxy set to {}:{}", host, port);
        Ok(())
    }

    /// 设置系统 SOCKS 代理
    #[cfg(target_os = "macos")]
    pub fn set_socks_proxy(host: &str, port: u16) -> Result<()> {
        let services = Self::get_network_services()?;
        
        for service in services {
            Command::new("networksetup")
                .args(["-setsocksfirewallproxy", &service, host, &port.to_string()])
                .output()?;
            
            Command::new("networksetup")
                .args(["-setsocksfirewallproxystate", &service, "on"])
                .output()?;
        }
        
        log::info!("System SOCKS proxy set to {}:{}", host, port);
        Ok(())
    }

    /// 清除系统代理
    #[cfg(target_os = "macos")]
    pub fn clear_proxy() -> Result<()> {
        let services = Self::get_network_services()?;
        
        for service in services {
            // 关闭 HTTP 代理
            Command::new("networksetup")
                .args(["-setwebproxystate", &service, "off"])
                .output()?;
            
            // 关闭 HTTPS 代理
            Command::new("networksetup")
                .args(["-setsecurewebproxystate", &service, "off"])
                .output()?;
            
            // 关闭 SOCKS 代理
            Command::new("networksetup")
                .args(["-setsocksfirewallproxystate", &service, "off"])
                .output()?;
        }
        
        log::info!("System proxy cleared");
        Ok(())
    }

    /// 获取网络服务列表
    #[cfg(target_os = "macos")]
    fn get_network_services() -> Result<Vec<String>> {
        let output = Command::new("networksetup")
            .args(["-listallnetworkservices"])
            .output()?;
        
        let output_str = String::from_utf8_lossy(&output.stdout);
        let services: Vec<String> = output_str
            .lines()
            .skip(1) // 跳过第一行（标题）
            .filter(|s| !s.starts_with('*')) // 跳过禁用的服务
            .map(|s| s.to_string())
            .collect();
        
        Ok(services)
    }

    /// 检查系统代理状态
    #[cfg(target_os = "macos")]
    pub fn get_proxy_status() -> Result<bool> {
        let services = Self::get_network_services()?;
        
        if let Some(service) = services.first() {
            let output = Command::new("networksetup")
                .args(["-getwebproxy", service])
                .output()?;
            
            let output_str = String::from_utf8_lossy(&output.stdout);
            Ok(output_str.contains("Enabled: Yes"))
        } else {
            Ok(false)
        }
    }

    // Windows 实现
    #[cfg(target_os = "windows")]
    pub fn set_http_proxy(host: &str, port: u16) -> Result<()> {
        let proxy_server = format!("{}:{}", host, port);
        
        Command::new("reg")
            .args([
                "add",
                r"HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings",
                "/v", "ProxyServer",
                "/t", "REG_SZ",
                "/d", &proxy_server,
                "/f"
            ])
            .output()?;
        
        Command::new("reg")
            .args([
                "add",
                r"HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings",
                "/v", "ProxyEnable",
                "/t", "REG_DWORD",
                "/d", "1",
                "/f"
            ])
            .output()?;
        
        log::info!("System HTTP proxy set to {}:{}", host, port);
        Ok(())
    }

    #[cfg(target_os = "windows")]
    pub fn set_socks_proxy(_host: &str, _port: u16) -> Result<()> {
        // Windows 系统代理设置不直接支持 SOCKS，需要通过第三方工具或 PAC 脚本
        log::warn!("SOCKS proxy is not directly supported on Windows system proxy");
        Ok(())
    }

    #[cfg(target_os = "windows")]
    pub fn clear_proxy() -> Result<()> {
        Command::new("reg")
            .args([
                "add",
                r"HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings",
                "/v", "ProxyEnable",
                "/t", "REG_DWORD",
                "/d", "0",
                "/f"
            ])
            .output()?;
        
        log::info!("System proxy cleared");
        Ok(())
    }

    #[cfg(target_os = "windows")]
    pub fn get_proxy_status() -> Result<bool> {
        let output = Command::new("reg")
            .args([
                "query",
                r"HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings",
                "/v", "ProxyEnable"
            ])
            .output()?;
        
        let output_str = String::from_utf8_lossy(&output.stdout);
        Ok(output_str.contains("0x1"))
    }

    // Linux 实现
    #[cfg(target_os = "linux")]
    pub fn set_http_proxy(host: &str, port: u16) -> Result<()> {
        let proxy_url = format!("http://{}:{}", host, port);
        
        // 使用 gsettings 设置 GNOME 代理
        Command::new("gsettings")
            .args(["set", "org.gnome.system.proxy", "mode", "manual"])
            .output()?;
        
        Command::new("gsettings")
            .args(["set", "org.gnome.system.proxy.http", "host", host])
            .output()?;
        
        Command::new("gsettings")
            .args(["set", "org.gnome.system.proxy.http", "port", &port.to_string()])
            .output()?;
        
        Command::new("gsettings")
            .args(["set", "org.gnome.system.proxy.https", "host", host])
            .output()?;
        
        Command::new("gsettings")
            .args(["set", "org.gnome.system.proxy.https", "port", &port.to_string()])
            .output()?;
        
        log::info!("System HTTP proxy set to {}", proxy_url);
        Ok(())
    }

    #[cfg(target_os = "linux")]
    pub fn set_socks_proxy(host: &str, port: u16) -> Result<()> {
        Command::new("gsettings")
            .args(["set", "org.gnome.system.proxy.socks", "host", host])
            .output()?;
        
        Command::new("gsettings")
            .args(["set", "org.gnome.system.proxy.socks", "port", &port.to_string()])
            .output()?;
        
        log::info!("System SOCKS proxy set to {}:{}", host, port);
        Ok(())
    }

    #[cfg(target_os = "linux")]
    pub fn clear_proxy() -> Result<()> {
        Command::new("gsettings")
            .args(["set", "org.gnome.system.proxy", "mode", "none"])
            .output()?;
        
        log::info!("System proxy cleared");
        Ok(())
    }

    #[cfg(target_os = "linux")]
    pub fn get_proxy_status() -> Result<bool> {
        let output = Command::new("gsettings")
            .args(["get", "org.gnome.system.proxy", "mode"])
            .output()?;
        
        let output_str = String::from_utf8_lossy(&output.stdout);
        Ok(output_str.contains("manual"))
    }
}




