use tauri::AppHandle;

/// Returns the device push token (APNs on iOS, FCM on Android).
/// Returns empty string on desktop or when notifications are unavailable.
/// The client skips relay token upload when this returns empty.
#[tauri::command]
pub async fn get_push_token(_app: AppHandle) -> String {
    String::new()
}
