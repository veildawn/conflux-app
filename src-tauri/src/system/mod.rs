mod app_icon;
mod network_extension;
mod proxy;
mod tun;

#[cfg(target_os = "windows")]
mod win_service;

pub use app_icon::*;
pub use network_extension::*;
pub use proxy::*;
pub use tun::*;

#[cfg(target_os = "windows")]
pub use win_service::*;

/// 检查当前进程是否以管理员权限运行（Windows）
#[cfg(target_os = "windows")]
pub fn is_running_as_admin() -> bool {
    use std::ptr::null_mut;

    #[link(name = "advapi32")]
    extern "system" {
        fn OpenProcessToken(
            ProcessHandle: *mut std::ffi::c_void,
            DesiredAccess: u32,
            TokenHandle: *mut *mut std::ffi::c_void,
        ) -> i32;
        fn GetTokenInformation(
            TokenHandle: *mut std::ffi::c_void,
            TokenInformationClass: u32,
            TokenInformation: *mut std::ffi::c_void,
            TokenInformationLength: u32,
            ReturnLength: *mut u32,
        ) -> i32;
        fn CloseHandle(hObject: *mut std::ffi::c_void) -> i32;
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn GetCurrentProcess() -> *mut std::ffi::c_void;
    }

    const TOKEN_QUERY: u32 = 0x0008;
    const TOKEN_ELEVATION: u32 = 20;

    #[repr(C)]
    struct TokenElevation {
        token_is_elevated: u32,
    }

    unsafe {
        let process = GetCurrentProcess();
        let mut token: *mut std::ffi::c_void = null_mut();

        if OpenProcessToken(process, TOKEN_QUERY, &mut token) == 0 {
            return false;
        }

        let mut elevation = TokenElevation {
            token_is_elevated: 0,
        };
        let mut size: u32 = 0;

        let result = GetTokenInformation(
            token,
            TOKEN_ELEVATION,
            &mut elevation as *mut _ as *mut std::ffi::c_void,
            std::mem::size_of::<TokenElevation>() as u32,
            &mut size,
        );

        CloseHandle(token);

        result != 0 && elevation.token_is_elevated != 0
    }
}

/// 非 Windows 平台始终返回 false
#[cfg(not(target_os = "windows"))]
pub fn is_running_as_admin() -> bool {
    false
}
