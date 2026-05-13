#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::{engine::general_purpose, Engine as _};
use screenshots::{
    image::{imageops::FilterType, DynamicImage, ImageOutputFormat},
    Screen,
};
use serde::{Deserialize, Serialize};
use std::{
    io,
    sync::{Mutex, OnceLock},
    thread,
    time::Duration,
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    webview::Color,
    AppHandle, Emitter, Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

const OVERLAY_IDLE_WIDTH: i32 = 74;
const OVERLAY_IDLE_HEIGHT: i32 = 54;
const OVERLAY_BUBBLE_WIDTH: i32 = 380;
const OVERLAY_BUBBLE_HEIGHT: i32 = 210;
const OVERLAY_MARGIN: i32 = 12;
const CURSOR_FOLLOW_INTERVAL_MS: u64 = 45;
const PHASE2_SHORTCUT: &str = "ctrl+alt+space";
const FALLBACK_SHORTCUT: &str = "ctrl+shift+space";
const MAX_SCREENSHOT_WIDTH: u32 = 1280;

static ACTIVE_SHORTCUT: OnceLock<Mutex<String>> = OnceLock::new();
static OVERLAY_SIZE: OnceLock<Mutex<(i32, i32)>> = OnceLock::new();

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CursorContext {
    x: i32,
    y: i32,
    screen: usize,
    monitor_x: i32,
    monitor_y: i32,
    monitor_width: u32,
    monitor_height: u32,
    scale_factor: f64,
}

#[derive(Serialize)]
struct WorkerCheck {
    ok: bool,
    message: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct OverlayState {
    status: String,
    text: String,
    visible: bool,
    accent_color: Option<String>,
    avatar: Option<String>,
    voice_level: Option<f64>,
    voice_active: Option<bool>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ShortcutPayload {
    phase: String,
    shortcut: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeDiagnostics {
    is_tauri: bool,
    overlay_window: bool,
    overlay_click_through: bool,
    cursor_following: bool,
    shortcut: String,
    cursor: CursorContext,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ScreenCapturePayload {
    media_type: String,
    base64: String,
    width: u32,
    height: u32,
    screen: usize,
    monitor_x: i32,
    monitor_y: i32,
    monitor_width: u32,
    monitor_height: u32,
    scale_factor: f64,
    cursor_x: i32,
    cursor_y: i32,
}

#[tauri::command]
fn get_cursor_context(app: AppHandle) -> CursorContext {
    cursor_context_from_app(&app)
}

#[tauri::command]
fn set_overlay_visible(app: AppHandle, visible: bool) -> WorkerCheck {
    if let Some(window) = app.get_webview_window("overlay") {
        let result = if visible {
            window.show()
        } else {
            window.hide()
        };
        return WorkerCheck {
            ok: result.is_ok(),
            message: if visible {
                "Native overlay shown.".to_string()
            } else {
                "Native overlay hidden.".to_string()
            },
        };
    }

    WorkerCheck {
        ok: false,
        message: "Native overlay window was not found.".to_string(),
    }
}

#[tauri::command]
fn set_overlay_state(app: AppHandle, state: OverlayState) -> WorkerCheck {
    let _ = app.emit("clicky-overlay-state", state.clone());
    let (width, height) = overlay_dimensions_for_state(&state);
    if let Ok(mut size) = overlay_size_cell().lock() {
        *size = (width, height);
    }

    if let Some(window) = app.get_webview_window("overlay") {
        let _ = window.set_size(tauri::PhysicalSize::new(width as u32, height as u32));
        let cursor = cursor_context_from_app(&app);
        let _ = window.set_position(overlay_position_for_cursor(&cursor));
        let _ = if state.visible {
            window.show()
        } else {
            window.hide()
        };
    }

    WorkerCheck {
        ok: true,
        message: "Overlay state emitted.".to_string(),
    }
}

#[tauri::command]
fn overlay_diagnostics(app: AppHandle) -> NativeDiagnostics {
    NativeDiagnostics {
        is_tauri: true,
        overlay_window: app.get_webview_window("overlay").is_some(),
        overlay_click_through: true,
        cursor_following: true,
        shortcut: active_shortcut_label(),
        cursor: cursor_context_from_app(&app),
    }
}

#[tauri::command]
fn test_worker_connection(worker_url: String) -> WorkerCheck {
    WorkerCheck {
        ok: !worker_url.trim().is_empty(),
        message: "Worker URL accepted by native scaffold.".to_string(),
    }
}

#[tauri::command]
fn live_session_requested() -> bool {
    std::env::var("CLICKY_LIVE_SESSION")
        .map(|value| value == "1")
        .unwrap_or(false)
}

#[tauri::command]
fn capture_screen_context(app: AppHandle) -> Result<Vec<ScreenCapturePayload>, String> {
    let cursor = cursor_context_from_app(&app);
    capture_screens(cursor)
}

fn capture_screens(cursor: CursorContext) -> Result<Vec<ScreenCapturePayload>, String> {
    let screens =
        Screen::all().map_err(|error| format!("Could not enumerate Windows screens: {error}"))?;
    let mut captures = Vec::new();

    for (index, screen) in screens.iter().enumerate() {
        let rgba = match screen.capture() {
            Ok(image) => image,
            Err(_) => continue,
        };

        let source_width = rgba.width();
        let source_height = rgba.height();
        if source_width == 0 || source_height == 0 {
            continue;
        }

        let scale = (MAX_SCREENSHOT_WIDTH as f64 / source_width as f64).min(1.0);
        let target_width = ((source_width as f64 * scale).round() as u32).max(1);
        let target_height = ((source_height as f64 * scale).round() as u32).max(1);
        let dynamic = DynamicImage::ImageRgba8(rgba);
        let image = if target_width != source_width || target_height != source_height {
            dynamic.resize(target_width, target_height, FilterType::Triangle)
        } else {
            dynamic
        };

        let mut bytes = std::io::Cursor::new(Vec::new());
        image
            .write_to(&mut bytes, ImageOutputFormat::Jpeg(72))
            .map_err(|error| format!("Could not encode screenshot: {error}"))?;

        captures.push(ScreenCapturePayload {
            media_type: "image/jpeg".to_string(),
            base64: general_purpose::STANDARD.encode(bytes.into_inner()),
            width: target_width,
            height: target_height,
            screen: index,
            monitor_x: screen.display_info.x,
            monitor_y: screen.display_info.y,
            monitor_width: screen.display_info.width,
            monitor_height: screen.display_info.height,
            scale_factor: screen.display_info.scale_factor as f64,
            cursor_x: cursor.x,
            cursor_y: cursor.y,
        });
    }

    if captures.is_empty() {
        return Err("Windows screen capture returned no images.".to_string());
    }

    Ok(captures)
}

fn cursor_context_from_app(app: &AppHandle) -> CursorContext {
    let cursor = app.cursor_position().ok();
    let x = cursor
        .map(|position| position.x.round() as i32)
        .unwrap_or(0);
    let y = cursor
        .map(|position| position.y.round() as i32)
        .unwrap_or(0);

    let monitors = app.available_monitors().unwrap_or_default();
    let monitor = app
        .monitor_from_point(x as f64, y as f64)
        .ok()
        .flatten()
        .or_else(|| monitors.first().cloned());

    let screen = monitor
        .as_ref()
        .and_then(|active| {
            monitors.iter().position(|candidate| {
                candidate.position() == active.position() && candidate.size() == active.size()
            })
        })
        .unwrap_or(0);

    if let Some(monitor) = monitor {
        CursorContext {
            x,
            y,
            screen,
            monitor_x: monitor.position().x,
            monitor_y: monitor.position().y,
            monitor_width: monitor.size().width,
            monitor_height: monitor.size().height,
            scale_factor: monitor.scale_factor(),
        }
    } else {
        CursorContext {
            x,
            y,
            screen: 0,
            monitor_x: 0,
            monitor_y: 0,
            monitor_width: 1920,
            monitor_height: 1080,
            scale_factor: 1.0,
        }
    }
}

fn overlay_size_cell() -> &'static Mutex<(i32, i32)> {
    OVERLAY_SIZE.get_or_init(|| Mutex::new((OVERLAY_IDLE_WIDTH, OVERLAY_IDLE_HEIGHT)))
}

fn current_overlay_size() -> (i32, i32) {
    overlay_size_cell()
        .lock()
        .map(|size| *size)
        .unwrap_or((OVERLAY_IDLE_WIDTH, OVERLAY_IDLE_HEIGHT))
}

fn overlay_dimensions_for_state(state: &OverlayState) -> (i32, i32) {
    let has_bubble = !state.text.trim().is_empty() && state.status != "idle" && state.status != "listening";
    if has_bubble {
        (OVERLAY_BUBBLE_WIDTH, OVERLAY_BUBBLE_HEIGHT)
    } else {
        (OVERLAY_IDLE_WIDTH, OVERLAY_IDLE_HEIGHT)
    }
}

fn overlay_position_for_cursor(cursor: &CursorContext) -> PhysicalPosition<i32> {
    let (overlay_width, overlay_height) = current_overlay_size();
    let min_x = cursor.monitor_x + OVERLAY_MARGIN;
    let min_y = cursor.monitor_y + OVERLAY_MARGIN;
    let max_x = cursor.monitor_x + cursor.monitor_width as i32 - overlay_width - OVERLAY_MARGIN;
    let max_y = cursor.monitor_y + cursor.monitor_height as i32 - overlay_height - OVERLAY_MARGIN;

    let mut target_x = cursor.x + 24;
    let mut target_y = cursor.y + 24;

    if target_x > max_x {
        target_x = cursor.x - overlay_width - 24;
    }
    if target_y > max_y {
        target_y = cursor.y - overlay_height - 24;
    }

    PhysicalPosition::new(target_x.clamp(min_x, max_x), target_y.clamp(min_y, max_y))
}

fn show_window(app: &AppHandle, label: &str) {
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn create_overlay(app: &AppHandle) -> tauri::Result<()> {
    let overlay = WebviewWindowBuilder::new(
        app,
        "overlay",
        WebviewUrl::App("index.html?window=overlay".into()),
    )
    .title("Clicky Overlay")
    .transparent(true)
    .background_color(Color(0, 0, 0, 0))
    .decorations(false)
    .shadow(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(false)
    .inner_size(OVERLAY_IDLE_WIDTH as f64, OVERLAY_IDLE_HEIGHT as f64)
    .visible(true)
    .build()?;

    let _ = overlay.set_ignore_cursor_events(true);
    let _ = overlay.set_background_color(Some(Color(0, 0, 0, 0)));
    let cursor = cursor_context_from_app(app);
    let _ = overlay.set_position(overlay_position_for_cursor(&cursor));
    Ok(())
}

fn create_tray(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show Clicky", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let test_worker = MenuItem::with_id(
        app,
        "test-worker",
        "Test Worker Connection",
        true,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &settings, &test_worker, &quit])?;

    TrayIconBuilder::with_id("clicky-tray")
        .tooltip("Clicky Windows")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" | "settings" | "test-worker" => show_window(app, "main"),
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;

    Ok(())
}

fn register_shortcut(app: &AppHandle) -> tauri::Result<()> {
    let shortcuts = [PHASE2_SHORTCUT, FALLBACK_SHORTCUT];
    let mut last_error = None;

    for shortcut in shortcuts {
        let shortcut_label = shortcut.to_string();
        let registration = app
            .global_shortcut()
            .on_shortcut(shortcut, move |app, _shortcut, event| {
                if event.state() == ShortcutState::Pressed {
                    if let Some(overlay) = app.get_webview_window("overlay") {
                        let _ = overlay.show();
                    }
                    let _ = app.emit(
                        "clicky-shortcut",
                        ShortcutPayload {
                            phase: "started".to_string(),
                            shortcut: shortcut_label.clone(),
                        },
                    );
                } else if event.state() == ShortcutState::Released {
                    let _ = app.emit(
                        "clicky-shortcut",
                        ShortcutPayload {
                            phase: "ended".to_string(),
                            shortcut: shortcut_label.clone(),
                        },
                    );
                }
            });

        match registration {
            Ok(()) => {
                set_active_shortcut(shortcut);
                return Ok(());
            }
            Err(error) => {
                last_error = Some(error.to_string());
            }
        }
    }

    Err(tauri::Error::Io(io::Error::new(
        io::ErrorKind::Other,
        format!(
            "failed to register Clicky global shortcut: {}",
            last_error.unwrap_or_else(|| "no shortcut registration detail available".to_string())
        ),
    )))
}

fn set_active_shortcut(shortcut: &str) {
    let active = ACTIVE_SHORTCUT.get_or_init(|| Mutex::new(PHASE2_SHORTCUT.to_string()));
    if let Ok(mut value) = active.lock() {
        *value = shortcut.to_string();
    }
}

fn active_shortcut_label() -> String {
    ACTIVE_SHORTCUT
        .get_or_init(|| Mutex::new(PHASE2_SHORTCUT.to_string()))
        .lock()
        .map(|value| value.clone())
        .unwrap_or_else(|_| PHASE2_SHORTCUT.to_string())
}

fn start_cursor_follow_loop(app: AppHandle) {
    thread::spawn(move || loop {
        let cursor = cursor_context_from_app(&app);

        if let Some(overlay) = app.get_webview_window("overlay") {
            let _ = overlay.set_position(overlay_position_for_cursor(&cursor));
            let _ = overlay.set_ignore_cursor_events(true);
        }

        let _ = app.emit("clicky-cursor-moved", cursor);
        thread::sleep(Duration::from_millis(CURSOR_FOLLOW_INTERVAL_MS));
    });
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            get_cursor_context,
            overlay_diagnostics,
            set_overlay_state,
            set_overlay_visible,
            test_worker_connection,
            live_session_requested,
            capture_screen_context
        ])
        .setup(|app| {
            create_tray(app.handle())?;
            create_overlay(app.handle())?;
            register_shortcut(app.handle())?;
            start_cursor_follow_loop(app.handle().clone());
            if std::env::var("CLICKY_SHOW_MAIN_ON_LAUNCH")
                .map(|value| value == "1")
                .unwrap_or(false)
            {
                show_window(app.handle(), "main");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Clicky Windows");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn capture_screens_returns_jpeg_payload_without_browser_picker() {
        let cursor = CursorContext {
            x: 0,
            y: 0,
            screen: 0,
            monitor_x: 0,
            monitor_y: 0,
            monitor_width: 1920,
            monitor_height: 1080,
            scale_factor: 1.0,
        };

        let captures = capture_screens(cursor).expect("screen capture should return at least one payload");
        assert!(!captures.is_empty());
        assert!(captures.iter().all(|capture| capture.media_type == "image/jpeg"));
        assert!(captures.iter().all(|capture| capture.width > 0 && capture.height > 0));
        assert!(captures.iter().all(|capture| capture.base64.len() > 1000));
    }
}
