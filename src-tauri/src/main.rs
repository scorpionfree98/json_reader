#![cfg_attr(
    any(
        target_os = "ios",
        target_os = "android",
        all(not(debug_assertions), target_os = "windows")
    ),
    windows_subsystem = "windows"
)]

use std::sync::{Arc, Mutex};
use tauri::menu::{CheckMenuItem, Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{command, Emitter, Manager, State, Wry};

// Global state structure using Wry Runtime
#[derive(Default)]
struct TrayMenuState {
    toggle_top_item: Option<Arc<CheckMenuItem<Wry>>>,
    autostart_item: Option<Arc<CheckMenuItem<Wry>>>,
    disable_update_item: Option<Arc<CheckMenuItem<Wry>>>,
}

// Update disable state
#[derive(Default)]
struct UpdateState {
    disabled: Mutex<bool>,
}

/// Build system tray menu and logic
fn build_tray(app_handle: &tauri::AppHandle<Wry>) -> anyhow::Result<()> {
    // Create tray menu items
    let show_i = MenuItem::with_id(app_handle, "show", "显示主窗口", true, None::<&str>)?;
    let hide_i = MenuItem::with_id(app_handle, "hide", "隐藏主窗口", true, None::<&str>)?;
    let toggle_top_i = CheckMenuItem::with_id(
        app_handle,
        "toggle-top",
        "切换置顶",
        true,
        false,
        None::<&str>,
    )?;
    let autostart_i = CheckMenuItem::with_id(
        app_handle,
        "autostart",
        "开机自启",
        true,
        false,
        None::<&str>,
    )?;
    let disable_update_i = CheckMenuItem::with_id(
        app_handle,
        "disable-update",
        "禁用自动更新",
        true,
        false,
        None::<&str>,
    )?;
    let check_update_i =
        MenuItem::with_id(app_handle, "check-updates", "检查更新…", true, None::<&str>)?;
    let quit_i = MenuItem::with_id(app_handle, "quit", "退出", true, None::<&str>)?;

    // Store menu items in global state
    let toggle_top_arc = Arc::new(toggle_top_i.clone());
    let autostart_arc = Arc::new(autostart_i.clone());
    let disable_update_arc = Arc::new(disable_update_i.clone());
    app_handle.manage(TrayMenuState {
        toggle_top_item: Some(toggle_top_arc),
        autostart_item: Some(autostart_arc),
        disable_update_item: Some(disable_update_arc),
    });

    // Initialize "always on top" check state
    if let Some(win) = app_handle.get_webview_window("main") {
        if let Ok(top_status) = win.is_always_on_top() {
            let _ = toggle_top_i.set_checked(top_status);
        }
    }

    // Initialize autostart check state (desktop only)
    #[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
    {
        use tauri_plugin_autostart::ManagerExt;
        if let Ok(autostart_status) = app_handle.autolaunch().is_enabled() {
            let _ = autostart_i.set_checked(autostart_status);
        }
    }

    // Clone items for menu event handling
    let toggle_top_i_clone = toggle_top_i.clone();
    let autostart_i_clone = autostart_i.clone();
    let disable_update_i_clone = disable_update_i.clone();

    // Build tray and bind menu events
    TrayIconBuilder::new()
        .menu(&Menu::with_items(
            app_handle,
            &[
                &show_i,
                &hide_i,
                &toggle_top_i,
                &autostart_i,
                &disable_update_i,
                &check_update_i,
                &quit_i,
            ],
        )?)
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "show" => {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.set_focus();
                }
                let _ = app.emit("tray://show", ());
            }
            "hide" => {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.hide();
                }
                let _ = app.emit("tray://hide", ());
            }
            "toggle-top" => {
                if let Some(win) = app.get_webview_window("main") {
                    if let Ok(current_status) = win.is_always_on_top() {
                        let new_status = !current_status;
                        let _ = win.set_always_on_top(new_status);
                        let _ = toggle_top_i_clone.set_checked(new_status);
                        let _ = app.emit("tray://toggle-always-on-top", ());
                    }
                }
            }
            "autostart" => {
                #[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
                {
                    use tauri_plugin_autostart::ManagerExt;
                    let autolaunch = app.autolaunch();
                    if let Ok(current_status) = autolaunch.is_enabled() {
                        // Toggle autostart status
                        let new_status = !current_status;
                        if current_status {
                            let _ = autolaunch.disable();
                        } else {
                            let _ = autolaunch.enable();
                        }

                        // Update check state using Arc'd app handle
                        let _ = autostart_i_clone.set_checked(new_status);
                    }
                }
                let _ = app.emit("tray://toggle-autostart", ());
            }
            "disable-update" => {
                // Get current state from app state
                let update_state = app.state::<UpdateState>();
                let current_disabled = *update_state.disabled.lock().unwrap();
                let new_disabled = !current_disabled;
                
                // Update state
                *update_state.disabled.lock().unwrap() = new_disabled;
                
                // Update menu check state
                let _ = disable_update_i_clone.set_checked(new_disabled);
                
                // Emit event to frontend
                let _ = app.emit("tray://toggle-disable-update", new_disabled);
            }
            "check-updates" => {
                let _ = app.emit("tray://check-updates", ());
            }
            "quit" => {
                std::process::exit(0);
            }
            _ => {}
        })
        .icon(app_handle.default_window_icon().unwrap().clone())
        .build(app_handle)?;

    Ok(())
}

/// Handle frontend "set_always_on_top" command
#[command]
fn set_always_on_top(app: tauri::AppHandle<Wry>, state: State<TrayMenuState>) {
    let main_window = match app.get_webview_window("main") {
        Some(win) => win,
        None => {
            eprintln!("获取主窗口失败：主窗口未找到");
            return;
        }
    };

    let current_top_status = match main_window.is_always_on_top() {
        Ok(status) => status,
        Err(e) => {
            eprintln!("检查置顶状态失败：{:?}", e);
            return;
        }
    };

    if let Some(toggle_top_btn) = &state.toggle_top_item {
        let _ = toggle_top_btn.set_checked(current_top_status);
    }
}

/// Handle frontend "set_autostart" command (desktop only)
#[command]
#[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
fn set_autostart(app: tauri::AppHandle<Wry>, state: State<TrayMenuState>) {
    use tauri_plugin_autostart::ManagerExt;
    let autolaunch_manager = app.autolaunch();

    let current_autostart_status = match autolaunch_manager.is_enabled() {
        Ok(status) => status,
        Err(e) => {
            eprintln!("检查自启状态失败：{:?}", e);
            return;
        }
    };

    if let Some(autostart_btn) = &state.autostart_item {
        let _ = autostart_btn.set_checked(current_autostart_status);
    }
}

/// Handle frontend "set_update_disabled" command
#[command]
fn set_update_disabled(
    app: tauri::AppHandle<Wry>,
    state: State<TrayMenuState>,
    update_state: State<UpdateState>,
    disabled: bool,
) {
    // Update state
    *update_state.disabled.lock().unwrap() = disabled;

    // Update tray menu check state
    if let Some(disable_update_btn) = &state.disable_update_item {
        let _ = disable_update_btn.set_checked(disabled);
    }

    println!("更新禁用状态已设置为: {}", disabled);
}

/// Get update disabled state
#[command]
fn get_update_disabled(update_state: State<UpdateState>) -> bool {
    *update_state.disabled.lock().unwrap()
}

// Mobile entry point
#[cfg_attr(
    any(target_os = "ios", target_os = "android"),
    tauri::mobile_entry_point
)]
pub fn run() {
    tauri::Builder::<Wry>::new()
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(UpdateState::default())
        .setup(|app| {
            let app_handle = app.handle();
            #[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
            {
                build_tray(&app_handle).expect("创建系统托盘失败，请检查环境配置");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            set_always_on_top,
            set_autostart,
            set_update_disabled,
            get_update_disabled
        ])
        .run(tauri::generate_context!())
        .expect("应用启动失败，请检查依赖和配置");
}

// Main entry point
fn main() {
    run();
}
