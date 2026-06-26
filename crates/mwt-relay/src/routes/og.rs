use axum::{extract::{Query, State}, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use crate::AppState;

#[derive(Deserialize)]
pub struct OgQuery {
    pub url: String,
}

#[derive(Clone, Serialize)]
pub struct OgMeta {
    pub url:         String,
    pub domain:      String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title:       Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image:       Option<String>,
}

pub type OgCache = Arc<Mutex<HashMap<String, OgMeta>>>;

pub fn new_cache() -> OgCache {
    Arc::new(Mutex::new(HashMap::new()))
}

fn domain_of(url: &str) -> String {
    url.trim_start_matches("https://")
        .trim_start_matches("http://")
        .split('/')
        .next()
        .unwrap_or(url)
        .trim_start_matches("www.")
        .to_owned()
}

fn extract_attr(tag: &str, attr: &str) -> Option<String> {
    let tag_lower = tag.to_ascii_lowercase();
    let attr_lower = attr.to_ascii_lowercase();
    for quote in ['"', '\''] {
        let pat = format!("{}={}", attr_lower, quote);
        if let Some(start) = tag_lower.find(&pat) {
            let val_start = start + pat.len();
            if let Some(end) = tag[val_start..].find(quote) {
                let raw = &tag[val_start..val_start + end];
                return Some(decode_entities(raw));
            }
        }
    }
    None
}

fn decode_entities(s: &str) -> String {
    s.replace("&amp;", "&")
     .replace("&lt;", "<")
     .replace("&gt;", ">")
     .replace("&quot;", "\"")
     .replace("&#39;", "'")
     .replace("&apos;", "'")
}

fn extract_meta_property(html: &str, property: &str) -> Option<String> {
    let html_lower = html.to_ascii_lowercase();
    let prop_lower = property.to_ascii_lowercase();
    let mut pos = 0;

    while pos < html.len() {
        // Stop after </head> - no OG tags in body
        if let Some(head_end) = html_lower[pos..].find("</head>") {
            let _ = head_end; // continue searching within head only
        }

        let rel = match html_lower[pos..].find("<meta") {
            Some(i) => i,
            None    => break,
        };
        pos += rel;

        let tag_end = match html_lower[pos..].find('>') {
            Some(i) => pos + i + 1,
            None    => break,
        };

        let tag      = &html[pos..tag_end];
        let tag_low  = &html_lower[pos..tag_end];

        let has_prop = tag_low.contains(&format!("property=\"{}\"", prop_lower))
                    || tag_low.contains(&format!("property='{}'",   prop_lower))
                    || tag_low.contains(&format!("name=\"{}\"",      prop_lower))
                    || tag_low.contains(&format!("name='{}'" ,      prop_lower));

        if has_prop {
            if let Some(val) = extract_attr(tag, "content") {
                return Some(val);
            }
        }

        pos = tag_end;
    }
    None
}

fn extract_title(html: &str) -> Option<String> {
    let low = html.to_ascii_lowercase();
    let start = low.find("<title")?;
    let inner_start = low[start..].find('>')? + start + 1;
    let inner_end   = low[inner_start..].find("</title>")? + inner_start;
    let raw = html[inner_start..inner_end].trim();
    if raw.is_empty() { None } else { Some(decode_entities(raw)) }
}

pub async fn get_og(
    Query(params): Query<OgQuery>,
    State(state):  State<AppState>,
) -> Result<Json<OgMeta>, StatusCode> {
    let url = params.url.trim().to_owned();

    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err(StatusCode::BAD_REQUEST);
    }

    // Cache hit
    if let Ok(cache) = state.og_cache.lock() {
        if let Some(cached) = cache.get(&url) {
            return Ok(Json(cached.clone()));
        }
    }

    let domain = domain_of(&url);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(6))
        .user_agent("Mozilla/5.0 (compatible; StarlingBot/1.0; +https://mwt.app)")
        .redirect(reqwest::redirect::Policy::limited(3))
        .build()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let resp = client
        .get(&url)
        .header("Accept", "text/html,application/xhtml+xml")
        .send()
        .await
        .map_err(|_| {
            tracing::debug!(url = %url, "og fetch failed");
            StatusCode::BAD_GATEWAY
        })?;

    // Read at most 100 KB - OG tags are always in <head>
    let bytes = resp.bytes().await.map_err(|_| StatusCode::BAD_GATEWAY)?;
    let html  = String::from_utf8_lossy(&bytes[..bytes.len().min(102_400)]);

    let meta = OgMeta {
        url:         url.clone(),
        domain:      domain.clone(),
        title:       extract_meta_property(&html, "og:title")
                         .or_else(|| extract_title(&html)),
        description: extract_meta_property(&html, "og:description")
                         .or_else(|| extract_meta_property(&html, "description")),
        image:       extract_meta_property(&html, "og:image"),
    };

    if let Ok(mut cache) = state.og_cache.lock() {
        // Cap cache at 2000 entries to avoid unbounded growth
        if cache.len() >= 2000 { cache.clear(); }
        cache.insert(url, meta.clone());
    }

    Ok(Json(meta))
}
