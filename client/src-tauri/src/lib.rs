mod commands;

use tauri::{Emitter, Listener};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_deep_link::init());

    // Haptics + biometric are mobile-only plugins
    #[cfg(mobile)]
    let builder = builder
        .plugin(tauri_plugin_haptics::init())
        .plugin(tauri_plugin_biometric::init());

    builder
        .setup(|app| {
            // Forward deep links to the frontend as 'mwt://deep-link' events.
            // The frontend handler in src/lib/utils/deeplink.ts listens for these
            // and opens the Add Contact modal pre-filled with the PIN.
            let handle = app.handle().clone();
            app.listen("deep-link://new-url", move |event| {
                if let Ok(payload) = serde_json::from_str::<serde_json::Value>(event.payload()) {
                    if let Some(urls) = payload.as_array() {
                        for url in urls {
                            if let Some(s) = url.as_str() {
                                let _ = handle.emit("mwt://deep-link", s.to_string());
                            }
                        }
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::crypto::generate_account,
            commands::crypto::restore_account,
            commands::crypto::verify_phrase_word,
            commands::storage::load_account,
            commands::storage::save_account,
            commands::storage::export_data,
            commands::storage::export_webdav,
            commands::notifications::get_push_token,
            commands::og::fetch_og,
        ])
        .run(tauri::generate_context!())
        .expect("error running mwt");
}
