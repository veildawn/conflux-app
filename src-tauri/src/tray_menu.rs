use tauri::{menu::CheckMenuItem, Runtime, Wry};

use crate::models::ProxyStatus;

pub type TrayMenuState = TrayMenuStateInner<Wry>;

#[derive(Clone)]
pub struct TrayMenuStateInner<R: Runtime> {
    pub mode_rule_item: CheckMenuItem<R>,
    pub mode_global_item: CheckMenuItem<R>,
    pub mode_direct_item: CheckMenuItem<R>,
    pub system_proxy_item: CheckMenuItem<R>,
    pub enhanced_mode_item: CheckMenuItem<R>,
}

impl<R: Runtime> TrayMenuStateInner<R> {
    /// 预处理互斥切换：在执行后端命令前立即更新 UI
    /// 当开启一个模式时，立即关闭另一个模式的显示
    pub fn pre_toggle_exclusive(&self, item_id: &str, will_enable: bool) {
        if !will_enable {
            return; // 关闭操作不需要处理互斥
        }
        match item_id {
            "system_proxy" => {
                let _ = self.enhanced_mode_item.set_checked(false);
            }
            "enhanced_mode" => {
                let _ = self.system_proxy_item.set_checked(false);
            }
            _ => {}
        }
    }

    pub fn sync_from_status(&self, status: &ProxyStatus) {
        if let Err(e) = self.mode_rule_item.set_checked(status.mode == "rule") {
            log::warn!("Failed to update mode_rule menu item: {}", e);
        }
        if let Err(e) = self.mode_global_item.set_checked(status.mode == "global") {
            log::warn!("Failed to update mode_global menu item: {}", e);
        }
        if let Err(e) = self.mode_direct_item.set_checked(status.mode == "direct") {
            log::warn!("Failed to update mode_direct menu item: {}", e);
        }
        if let Err(e) = self.system_proxy_item.set_checked(status.system_proxy) {
            log::warn!("Failed to update system_proxy menu item: {}", e);
        }
        if let Err(e) = self.enhanced_mode_item.set_checked(status.enhanced_mode) {
            log::warn!("Failed to update enhanced_mode menu item: {}", e);
        }
        log::debug!(
            "Tray menu synced: mode={}, system_proxy={}, enhanced_mode={}",
            status.mode,
            status.system_proxy,
            status.enhanced_mode
        );
    }
}
