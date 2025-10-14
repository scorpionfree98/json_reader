#![cfg_attr(
    any(target_os = "ios", target_os = "android"),
    windows_subsystem = "windows"
  )]
  
  use tauri::{Emitter, Manager};
  use tauri::menu::{CheckMenuItem, Menu, MenuItem};
  use tauri::tray::TrayIconBuilder;
  

  


  fn build_tray(app: &tauri::AppHandle) -> anyhow::Result<()> {
    // Create menu items with IDs so we can match in the handler
    let show_i         = MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?;
    let hide_i         = MenuItem::with_id(app, "hide", "隐藏主窗口", true, None::<&str>)?;
    let toggle_top_i   = CheckMenuItem::with_id(app, "toggle-top", "切换置顶", true, false, None::<&str>)?;
    let autostart_i    = CheckMenuItem::with_id(app, "autostart", "开机自启", true, false, None::<&str>)?;
    let check_update_i = MenuItem::with_id(app, "check-updates", "检查更新…", true, None::<&str>)?;
    let quit_i         = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
  
    let menu = Menu::with_items(app, &[&show_i, &hide_i, &toggle_top_i, &autostart_i, &check_update_i, &quit_i])?;
  
    // initial states for check items
    if let Some(win) = app.get_webview_window("main") {
      if let Ok(top) = win.is_always_on_top() {
        let _ = toggle_top_i.set_checked(top);
      }
    }
  
    #[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
    {
      use tauri_plugin_autostart::ManagerExt;
      if let Ok(enabled) = app.autolaunch().is_enabled() {
        let _ = autostart_i.set_checked(enabled);
      }
    }
  
    // move clones into the closure so we can update their check states
    let toggle_top_i_c = toggle_top_i.clone();
    let autostart_i_c = autostart_i.clone();
  
    TrayIconBuilder::new()
      .menu(&menu)
      .on_menu_event(move |app, e| match e.id().as_ref() {
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
            if let Ok(current) = win.is_always_on_top() {
              let newval = !current;
              let _ = win.set_always_on_top(newval);
              let _ = toggle_top_i_c.set_checked(newval);
              let _ = app.emit("tray://toggle-always-on-top", ());
            }
          }
        }
        "autostart" => {
          #[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
          {
            use tauri_plugin_autostart::ManagerExt;
            let mgr = app.autolaunch();
            if let Ok(current) = mgr.is_enabled() {
              if current {
                let _ = mgr.disable();
                let _ = autostart_i_c.set_checked(false);
              } else {
                let _ = mgr.enable();
                let _ = autostart_i_c.set_checked(true);
              }
            }
          }
          let _ = app.emit("tray://toggle-autostart", ());
        }
        "check-updates" => {
          let _ = app.emit("tray://check-updates", ());
        }
        "quit" => app.exit(0),
        _ => {}
      })
     .icon(app.default_window_icon().unwrap().clone())
      .build(app)?;
  
    Ok(())
  }
  
  // Mobile entry point only on iOS/Android
  #[cfg_attr(any(target_os = "ios", target_os = "android"), tauri::mobile_entry_point)]
  pub fn run() {
    tauri::Builder::default()
      // --- Add plugins here (v2: on the Builder chain) ---
      .plugin(tauri_plugin_window_state::Builder::default().build())
      .plugin(tauri_plugin_autostart::init(
        tauri_plugin_autostart::MacosLauncher::LaunchAgent,
        None,
      ))
      .plugin(tauri_plugin_updater::Builder::new().build())
      .plugin(tauri_plugin_process::init())
      .plugin(tauri_plugin_clipboard_manager::init())
      // ---------------------------------------------------
      .setup(|app| {
        // Create tray only for desktop targets
        #[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
        {
          build_tray(&app.handle()).expect("tray");
        }
        Ok(())
      })
      .run(tauri::generate_context!())
      .expect("error while running tauri application");
  }


  fn main() {
    run();
  }