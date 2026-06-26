# Security Audit - mwt client

**Scope:** `src/lib/crypto/index.ts`, `src/lib/stores/relay.ts`, `src/routes/onboarding/Unlock.svelte`, `src/routes/settings/Settings.svelte`, `src/lib/utils/tauri.ts`, `crates/mwt-relay/src/routes/messages.rs`, `crates/mwt-relay/src/routes/register.rs`, `crates/mwt-relay/src/routes/account.rs`

---

## P0 - Critical

### [P0-1] Device PIN never verified in Unlock.svelte

**File:** `src/routes/onboarding/Unlock.svelte`

`attempt()` checks only `if (!pin.trim())` before calling `unlock()`. Any non-empty string unlocks the app; the entered PIN is never compared against the stored hash. A user who sets a device PIN gains no real local access protection.

**Fix:** Hash the entered PIN with the same algorithm used at setup (bcrypt/PBKDF2/Argon2), compare against the stored hash, and reject on mismatch.

---

### [P0-2] Production auth entirely broken

**File:** `crates/mwt-relay/src/routes/messages.rs`

`resolve_sender()` contains `// TODO: look up session token` and returns `None` when `dev_no_auth=false`. Downstream, `ws_connect` sets `ok = false` when `resolve_sender()` returns `None`, so every WebSocket connection is rejected in production. The app cannot function with real auth enabled.

**Fix:** Implement session-token-to-PIN lookup before shipping any production deployment. Gate on a feature flag until complete, not by leaving `DEV_NO_AUTH=true` in prod.

---

## P1 - High

### [P1-1] X3DH uses only 2 DH operations (missing SPK and OPK)

**File:** `src/lib/crypto/index.ts`

`x3dhInitiate` / `x3dhRespond` compute `dh1 = EK*IK_bob` and `dh2 = IK_alice*IK_bob`. The Signal X3DH spec requires at minimum three operations including the Signed Pre-Key (SPK), and optionally a One-Time Pre-Key (OPK). Omitting the SPK means:
- Loss of break-in recovery (compromise of IK breaks all past sessions).
- Reduced binding between the session and a freshly generated key material.

**Fix:** Implement full 3-DH (or 4-DH with OPK) X3DH per the Signal spec: `dh1 = IK_alice * SPK_bob`, `dh2 = EK * IK_bob`, `dh3 = EK * SPK_bob`, `dh4 = EK * OPK_bob` (optional). Rotate SPK periodically; upload OPK bundles to the relay.

---

### [P1-2] All key material stored as plaintext hex in localStorage

**File:** `src/lib/crypto/index.ts`

Private DH keys (`mwt:dh_priv:<pin>`), session symmetric keys (`mwt:sessions`), and Double Ratchet state (`mwt:dr`) are serialized as plain hex strings. Any XSS, malicious extension, or physical access to DevTools can exfiltrate all key material.

**Fix:** Wrap key storage with the WebCrypto key wrapping API. Derive a wrapping key from the device PIN using PBKDF2 (high iteration count), then use AES-KW to wrap private keys before storing. This ties key access to knowledge of the PIN even if localStorage is readable.

---

### [P1-3] Add-request leaks sender identity to relay in plaintext

**File:** `src/lib/stores/relay.ts` - `relaySendAddRequest()`

The add-request payload (display name, status, personal message, public key) is sent as plain base64 over HTTP. The relay can read all fields. For an app with a zero-knowledge architecture goal, sender identity at add-time should be sealed with the recipient's public key.

**Fix:** Encrypt the add-request body with the recipient's IK public key (ECIES or X25519+AES-GCM) so the relay sees only an opaque blob.

---

### [P1-4] `deleteAccount()` only clears localStorage; relay data persists

**File:** `src/routes/settings/Settings.svelte`

Calling `deleteAccount()` invokes `localStorage.clear()` but never calls the relay `DELETE /account` endpoint. The relay retains the user's registration, prekeys, and queued messages indefinitely. This violates GDPR Art. 17 (right to erasure) and leaves stale key material on the server.

**Fix:** Call `DELETE /account` (with Ed25519 signature as implemented in `account.rs`) before clearing localStorage. Show the user an error if the relay call fails rather than silently proceeding.

---

## P2 - Medium

### [P2-1] PIN and session token exposed in WebSocket URL query string

**File:** `src/lib/stores/relay.ts` - `relayConnect()`

`new WebSocket(\`${RELAY_WS}?pin=${pin}&token=${token}\`)` places credentials in the URL. URLs are logged by reverse proxies, CDNs, browser history, and server access logs, even over TLS.

**Fix:** Move authentication to the first WebSocket message after the handshake (a JSON `{type:"auth", pin, token}` frame), or use a short-lived URL token obtained via a separate authenticated HTTP call.

---

### [P2-2] `recipient_pin` not validated before NATS subject formatting

**File:** `crates/mwt-relay/src/routes/messages.rs` - `send_message()`

`format!("mwt.inbox.{}", req.recipient_pin)` constructs a NATS subject without validating `recipient_pin`. NATS subjects use `.` as separator and `*`/`>` as wildcards. A crafted value like `foo.>` could potentially match unintended subscriptions depending on the NATS server configuration.

**Fix:** Validate `recipient_pin` against the same regex used in `register.rs` (`is_valid_pin()`) before constructing the subject. Return HTTP 400 if it fails.

---

### [P2-3] Browser stub `restore_account` ignores recovery words

**File:** `src/lib/utils/tauri.ts`

In browser mode, if `mwt:dh_priv:<pin>` exists in localStorage, `restore_account()` loads the key and returns success regardless of the provided recovery words. The words are entirely ignored.

**Fix:** Either disable the browser stub for restore (requiring Tauri), or derive the private key from the mnemonic and verify it matches the stored value before accepting the restore.

---

## P3 - Low / Informational

### [P3-1] Em dash in Settings.svelte version string (project constraint violation)

**File:** `src/routes/settings/Settings.svelte` (now in `src/lib/i18n/en.json`)

"Version 0.1.0 - early access" was previously "Version 0.1.0 — early access" with an em dash. Fixed in the i18n migration: en.json uses a hyphen.

---

### [P3-2] Caret versioning on cryptographic dependencies

**File:** `package.json`

`@noble/curves: "^2.2.0"` and `@noble/hashes: "^2.2.0"` allow automatic minor/patch upgrades. For cryptographic primitives, even patch updates can introduce regressions or behavior changes. Unpinned deps also widen the supply chain attack surface.

**Fix:** Pin to exact versions (`"2.2.0"`) and update deliberately. Consider a lockfile integrity check in CI (`npm ci` rather than `npm install`).

---

## Summary table

| ID    | Severity | Description                                       | Status   |
|-------|----------|---------------------------------------------------|----------|
| ID    | Severity | Description                                       | Status   |
|-------|----------|---------------------------------------------------|----------|
| P0-1  | Critical | Device PIN never verified on unlock               | Fixed    |
| P0-2  | Critical | Production auth broken (ws_connect always false)  | Fixed    |
| P1-1  | High     | X3DH missing SPK/OPK (2-DH only)                 | Open     |
| P1-2  | High     | Key material plaintext in localStorage            | Open     |
| P1-3  | High     | Add-request leaks identity to relay               | Open     |
| P1-4  | High     | deleteAccount does not call relay DELETE          | Open - needs sign_delete_account Tauri command |
| P2-1  | Medium   | Credentials in WebSocket URL query string         | Partial - send_token reduces exposure; WS URL still has PIN |
| P2-2  | Medium   | recipient_pin not validated before NATS subject   | Fixed    |
| P2-3  | Medium   | Browser restore ignores recovery words            | Open     |
| P3-1  | Low      | Em dash in version string                         | Fixed    |
| P3-2  | Low      | Caret versioning on crypto deps                   | Fixed    |
