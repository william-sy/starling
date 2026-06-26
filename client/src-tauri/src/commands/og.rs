use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct OgMeta {
    pub url:         String,
    pub domain:      String,
    pub title:       Option<String>,
    pub description: Option<String>,
    pub image:       Option<String>,
}

// Extract value of `attr` from a single HTML tag string, handling both " and '
fn attr_value(tag: &str, attr: &str) -> Option<String> {
    let lo = tag.to_lowercase();
    for quote in &['"', '\''] {
        let needle = format!("{}={}", attr, quote);
        if let Some(pos) = lo.find(&needle) {
            let start = pos + needle.len();
            let rest  = &tag[start..];
            let end   = rest.find(*quote)?;
            let val   = rest[..end].trim().to_string();
            if !val.is_empty() { return Some(val); }
        }
    }
    None
}

// Scan all <meta ... > tags for one matching the given property/name
fn extract_meta(html: &str, property: &str) -> Option<String> {
    let lo = html.to_lowercase();
    let prop_lo = property.to_lowercase();
    let mut pos = 0;

    while let Some(rel) = lo[pos..].find("<meta") {
        let start = pos + rel;
        // Tag ends at first > (may be "/>")
        let end = lo[start..].find('>').map(|i| start + i + 1).unwrap_or(lo.len().min(start + 512));
        let tag    = &html[start..end];
        let tag_lo = tag.to_lowercase();

        let has_prop = tag_lo.contains(&format!("property=\"{}\"", prop_lo))
            || tag_lo.contains(&format!("property='{}'",  prop_lo))
            || tag_lo.contains(&format!("name=\"{}\"",    prop_lo))
            || tag_lo.contains(&format!("name='{}'",      prop_lo));

        if has_prop {
            if let Some(val) = attr_value(tag, "content") {
                return Some(html_unescape(&val));
            }
        }

        pos = end;
        if pos >= lo.len() { break; }
    }
    None
}

fn extract_title(html: &str) -> Option<String> {
    let lo = html.to_lowercase();
    let s  = lo.find("<title>")? + 7;
    let e  = lo[s..].find("</title>")?;
    let raw = html[s..s + e].trim();
    if raw.is_empty() { None } else { Some(html_unescape(raw)) }
}

fn html_unescape(s: &str) -> String {
    s.replace("&amp;",  "&")
     .replace("&lt;",   "<")
     .replace("&gt;",   ">")
     .replace("&quot;", "\"")
     .replace("&#39;",  "'")
     .replace("&apos;", "'")
}

fn domain_of(url: &str) -> String {
    url.trim_start_matches("https://")
       .trim_start_matches("http://")
       .split('/')
       .next()
       .unwrap_or(url)
       .trim_start_matches("www.")
       .to_string()
}

#[tauri::command]
pub async fn fetch_og(url: String) -> Result<OgMeta, String> {
    let client = reqwest::Client::builder()
        .user_agent("facebookexternalhit/1.1")
        .timeout(std::time::Duration::from_secs(8))
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client.get(&url)
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        .header("Accept-Language", "en")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let content_type = resp.headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_lowercase();

    if !content_type.starts_with("text/html") && !content_type.starts_with("application/xhtml") {
        return Err(format!("not html: {}", content_type));
    }

    // First 64 KB covers all <head> content
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    let html  = String::from_utf8_lossy(&bytes[..bytes.len().min(65536)]);

    let title = extract_meta(&html, "og:title")
        .or_else(|| extract_title(&html));
    let description = extract_meta(&html, "og:description")
        .or_else(|| extract_meta(&html, "description"));
    let image = extract_meta(&html, "og:image");

    Ok(OgMeta {
        url:    url.clone(),
        domain: domain_of(&url),
        title,
        description,
        image,
    })
}
