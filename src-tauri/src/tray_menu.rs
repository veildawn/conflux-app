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
    /// 预处理切换（保留接口，不再处理互斥）
    /// 系统代理和增强模式现在可以同时开启
    #[allow(unused_variables)]
    pub fn pre_toggle_exclusive(&self, item_id: &str, will_enable: bool) {
        // 不再处理互斥，允许两个模式同时开启
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
