use serde::{Deserialize, Serialize};
use std::fs;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

/// Minimal account state persisted locally.
#[derive(Serialize, Deserialize, Clone)]
pub struct LocalAccount {
    pub pin:          String,
    pub display_name: String,
    pub notif_name:   String,
    pub sign_key_hex: String,
    pub dh_key_hex:   String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(default)]
    pub dh_priv_hex:  Option<String>,
    pub tier:         String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(default)]
    pub relay_url:    Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(default)]
    pub colonies:     Option<Vec<String>>,
}

fn account_path(app: &tauri::AppHandle) -> std::path::PathBuf {
    app.path().app_data_dir()
        .expect("no app data dir")
        .join("account.json")
}

#[tauri::command]
pub fn load_account(app: tauri::AppHandle) -> Option<LocalAccount> {
    let path = account_path(&app);
    let data = fs::read(&path).ok()?;
    serde_json::from_slice(&data).ok()
}

#[tauri::command]
pub fn save_account(app: tauri::AppHandle, account: LocalAccount) -> Result<(), String> {
    let path = account_path(&app);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let data = serde_json::to_vec_pretty(&account).map_err(|e| e.to_string())?;
    fs::write(&path, data).map_err(|e| e.to_string())
}

/// Save a backup to a user-chosen location via the native file-save dialog.
/// Returns the path the file was saved to, or an empty string if cancelled.
#[tauri::command]
pub async fn export_data(app: tauri::AppHandle, filename: String, json: String) -> Result<String, String> {
    use tauri_plugin_dialog::FilePath;

    let path = app.dialog()
        .file()
        .set_file_name(&filename)
        .add_filter("Starling Backup", &["json"])
        .blocking_save_file();

    match path {
        Some(FilePath::Path(p)) => {
            fs::write(&p, json.as_bytes()).map_err(|e| e.to_string())?;
            Ok(p.to_string_lossy().into_owned())
        }
        _ => Ok(String::new()), // user cancelled
    }
}

/// Upload a backup blob to a WebDAV endpoint (Nextcloud, Synology, etc.)
#[tauri::command]
pub async fn export_webdav(
    url:      String,
    username: String,
    password: String,
    filename: String,
    json:     String,
) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let upload_url = format!("{}/{}", url.trim_end_matches('/'), filename);

    let resp = client
        .put(&upload_url)
        .basic_auth(&username, Some(&password))
        .header("Content-Type", "application/json")
        .body(json)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if resp.status().is_success() || resp.status().as_u16() == 201 {
        Ok(())
    } else {
        Err(format!("WebDAV upload failed: HTTP {}", resp.status()))
    }
}
