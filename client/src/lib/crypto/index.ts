import { x25519 } from '@noble/curves/ed25519.js';
import { hkdf }   from '@noble/hashes/hkdf.js';
import { sha256 }  from '@noble/hashes/sha2.js';

const SESSION_STORE = 'mwt:sessions';
const DH_PRIV_STORE = 'mwt:dh_priv';

// ── Session key cache (symmetric key per contact PIN) ─────────────────────

function loadSessions(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(SESSION_STORE) ?? '{}'); } catch { return {}; }
}
function saveSessions(s: Record<string, string>) {
  try { localStorage.setItem(SESSION_STORE, JSON.stringify(s)); } catch {}
}
export function getSession(pin: string): Uint8Array | null {
  const s = loadSessions()[pin];
  return s ? hexToBytes(s) : null;
}
export function setSession(pin: string, key: Uint8Array) {
  const s = loadSessions();
  s[pin] = bytesToHex(key);
  saveSessions(s);
}

// ── Identity key storage (browser mode only) ─────────────────────────────

export function storeDhPriv(pin: string, privHex: string) {
  try { localStorage.setItem(`${DH_PRIV_STORE}:${pin}`, privHex); } catch {}
}
export function loadDhPriv(pin: string): Uint8Array | null {
  const h = localStorage.getItem(`${DH_PRIV_STORE}:${pin}`);
  return h ? hexToBytes(h) : null;
}

// Generate a new X25519 identity keypair, store the private key, return pub hex
export function generateDhKeypair(pin: string): string {
  const priv = x25519.utils.randomSecretKey();
  const pub  = x25519.getPublicKey(priv);
  storeDhPriv(pin, bytesToHex(priv));
  return bytesToHex(pub);
}

// ── X3DH key agreement ────────────────────────────────────────────────────

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) { out.set(a, offset); offset += a.length; }
  return out;
}

// Alice initiates: she has Bob's IK, generates a fresh ephemeral EK
export function x3dhInitiate(
  aliceIkPriv: Uint8Array,
  aliceEkPriv: Uint8Array,
  bobIkPub:    Uint8Array,
): Uint8Array {
  const dh1 = x25519.getSharedSecret(aliceEkPriv, bobIkPub);
  const dh2 = x25519.getSharedSecret(aliceIkPriv, bobIkPub);
  const ikm  = concat(dh1, dh2);
  return hkdf(sha256, ikm, undefined, new TextEncoder().encode('mwt-x3dh-v1'), 32);
}

// Bob responds: he has Alice's IK and her ephemeral EK
export function x3dhRespond(
  bobIkPriv:   Uint8Array,
  aliceIkPub:  Uint8Array,
  aliceEkPub:  Uint8Array,
): Uint8Array {
  const dh1 = x25519.getSharedSecret(bobIkPriv, aliceEkPub);
  const dh2 = x25519.getSharedSecret(bobIkPriv, aliceIkPub);
  const ikm  = concat(dh1, dh2);
  return hkdf(sha256, ikm, undefined, new TextEncoder().encode('mwt-x3dh-v1'), 32);
}

// ── AES-256-GCM encrypt / decrypt ─────────────────────────────────────────

export async function encryptMsg(
  key: Uint8Array,
  plaintext: Uint8Array,
): Promise<{ ct: Uint8Array; nonce: Uint8Array }> {
  const nonce   = crypto.getRandomValues(new Uint8Array(12));
  const keyBuf  = key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength) as ArrayBuffer;
  const ck      = await crypto.subtle.importKey('raw', keyBuf, { name: 'AES-GCM' }, false, ['encrypt']);
  const ptBuf   = plaintext.buffer.slice(plaintext.byteOffset, plaintext.byteOffset + plaintext.byteLength) as ArrayBuffer;
  const ivBuf   = nonce.buffer.slice(nonce.byteOffset, nonce.byteOffset + nonce.byteLength) as ArrayBuffer;
  const buf     = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: ivBuf }, ck, ptBuf);
  return { ct: new Uint8Array(buf), nonce };
}

export async function decryptMsg(
  key: Uint8Array,
  ct: Uint8Array,
  nonce: Uint8Array,
): Promise<Uint8Array> {
  const keyBuf  = key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength) as ArrayBuffer;
  const ck      = await crypto.subtle.importKey('raw', keyBuf, { name: 'AES-GCM' }, false, ['decrypt']);
  const ctBuf   = ct.buffer.slice(ct.byteOffset, ct.byteOffset + ct.byteLength) as ArrayBuffer;
  const ivBuf   = nonce.buffer.slice(nonce.byteOffset, nonce.byteOffset + nonce.byteLength) as ArrayBuffer;
  const buf     = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBuf }, ck, ctBuf);
  return new Uint8Array(buf);
}

// ── Hex helpers ───────────────────────────────────────────────────────────

export function bytesToHex(b: Uint8Array): string {
  return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
}
export function hexToBytes(h: string): Uint8Array {
  if (h.length % 2 !== 0) throw new Error('odd hex length');
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function b64Encode(b: Uint8Array): string {
  return btoa(String.fromCharCode(...b));
}
export function b64Decode(s: string): Uint8Array {
  return new Uint8Array(atob(s).split('').map(c => c.charCodeAt(0)));
}

// ── Double Ratchet ────────────────────────────────────────────────────────────

export interface DRState {
  RK:       string;
  CKs:      string | null;
  CKr:      string | null;
  DHs_priv: string;
  DHs_pub:  string;
  DHr:      string | null;
  Ns:  number;
  Nr:  number;
  PN:  number;
  skipped: Array<{ DHr: string; n: number; mk: string }>;
}

export interface DRHeader {
  dh: string;
  pn: number;
  n:  number;
}

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const keyBuf  = key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength) as ArrayBuffer;
  const dataBuf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  const k = await crypto.subtle.importKey('raw', keyBuf, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, dataBuf));
}

export async function kdfChain(ck: Uint8Array): Promise<{ mk: Uint8Array; nextCk: Uint8Array }> {
  const mk     = await hmac(ck, new Uint8Array([0x01]));
  const nextCk = await hmac(ck, new Uint8Array([0x02]));
  return { mk, nextCk };
}

export async function kdfRoot(rk: Uint8Array, dh: Uint8Array): Promise<{ nextRK: Uint8Array; ck: Uint8Array }> {
  const dhBuf  = dh.buffer.slice(dh.byteOffset, dh.byteOffset + dh.byteLength) as ArrayBuffer;
  const rkBuf  = rk.buffer.slice(rk.byteOffset, rk.byteOffset + rk.byteLength) as ArrayBuffer;
  const ikm  = await crypto.subtle.importKey('raw', dhBuf, { name: 'HKDF' }, false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: rkBuf, info: new TextEncoder().encode('mwt-dr-root') },
    ikm, 512
  );
  const arr = new Uint8Array(bits);
  return { nextRK: arr.slice(0, 32), ck: arr.slice(32, 64) };
}

export async function drInitAlice(sk: Uint8Array, bobDhPub: Uint8Array): Promise<DRState> {
  const dhsPriv = x25519.utils.randomSecretKey();
  const dhsPub  = x25519.getPublicKey(dhsPriv);
  const dh = x25519.getSharedSecret(dhsPriv, bobDhPub);
  const { nextRK, ck } = await kdfRoot(sk, dh);
  return {
    RK: bytesToHex(nextRK), CKs: bytesToHex(ck), CKr: null,
    DHs_priv: bytesToHex(dhsPriv), DHs_pub: bytesToHex(dhsPub),
    DHr: bytesToHex(bobDhPub), Ns: 0, Nr: 0, PN: 0, skipped: [],
  };
}

export function drInitBob(sk: Uint8Array, bobIkPriv: Uint8Array, bobIkPub: Uint8Array): DRState {
  return {
    RK: bytesToHex(sk), CKs: null, CKr: null,
    DHs_priv: bytesToHex(bobIkPriv), DHs_pub: bytesToHex(bobIkPub),
    DHr: null, Ns: 0, Nr: 0, PN: 0, skipped: [],
  };
}

const DR_STORE = 'mwt:dr';
export function saveDRState(pin: string, state: DRState) {
  try {
    const s = JSON.parse(localStorage.getItem(DR_STORE) ?? '{}');
    s[pin] = state; localStorage.setItem(DR_STORE, JSON.stringify(s));
  } catch {}
}
export function loadDRState(pin: string): DRState | null {
  try { const s = JSON.parse(localStorage.getItem(DR_STORE) ?? '{}'); return s[pin] ?? null; }
  catch { return null; }
}

export async function drEncrypt(
  state: DRState, plaintext: Uint8Array
): Promise<{ state: DRState; header: DRHeader; ct: Uint8Array; nonce: Uint8Array }> {
  if (!state.CKs) throw new Error('DR: no send chain key');
  const { mk, nextCk } = await kdfChain(hexToBytes(state.CKs));
  const { ct, nonce } = await encryptMsg(mk, plaintext);
  return {
    state: { ...state, CKs: bytesToHex(nextCk), Ns: state.Ns + 1 },
    header: { dh: state.DHs_pub, pn: state.PN, n: state.Ns },
    ct, nonce,
  };
}

const MAX_SKIP = 100;

async function dhRatchetStep(state: DRState, theirDhPub: string): Promise<DRState> {
  const dh1 = x25519.getSharedSecret(hexToBytes(state.DHs_priv), hexToBytes(theirDhPub));
  const { nextRK: rk1, ck: ckr } = await kdfRoot(hexToBytes(state.RK), dh1);
  const newPriv = x25519.utils.randomSecretKey();
  const newPub  = x25519.getPublicKey(newPriv);
  const dh2 = x25519.getSharedSecret(newPriv, hexToBytes(theirDhPub));
  const { nextRK: rk2, ck: cks } = await kdfRoot(rk1, dh2);
  return {
    ...state, RK: bytesToHex(rk2),
    CKs: bytesToHex(cks), CKr: bytesToHex(ckr),
    DHs_priv: bytesToHex(newPriv), DHs_pub: bytesToHex(newPub),
    DHr: theirDhPub, PN: state.Ns, Ns: 0, Nr: 0,
  };
}

async function skipMessageKeys(state: DRState, until: number): Promise<DRState> {
  if (!state.CKr || state.Nr >= until) return state;
  if (until - state.Nr > MAX_SKIP) throw new Error('DR: too many skipped messages');
  let s = { ...state, skipped: [...state.skipped] };
  while (s.Nr < until) {
    const { mk, nextCk } = await kdfChain(hexToBytes(s.CKr!));
    s.skipped.push({ DHr: s.DHr!, n: s.Nr, mk: bytesToHex(mk) });
    s = { ...s, CKr: bytesToHex(nextCk), Nr: s.Nr + 1 };
  }
  return s;
}

export async function drDecrypt(
  state: DRState, header: DRHeader, ct: Uint8Array, nonce: Uint8Array
): Promise<{ state: DRState; plaintext: Uint8Array }> {
  const idx = state.skipped.findIndex(s => s.DHr === header.dh && s.n === header.n);
  if (idx >= 0) {
    const mk = hexToBytes(state.skipped[idx].mk);
    const plaintext = await decryptMsg(mk, ct, nonce);
    return { state: { ...state, skipped: state.skipped.filter((_, i) => i !== idx) }, plaintext };
  }

  let s = { ...state };

  if (header.dh !== state.DHr) {
    s = await skipMessageKeys(s, header.pn);
    s = await dhRatchetStep(s, header.dh);
  }

  s = await skipMessageKeys(s, header.n);

  if (!s.CKr) throw new Error('DR: no recv chain key');
  const { mk, nextCk } = await kdfChain(hexToBytes(s.CKr));
  const plaintext = await decryptMsg(mk, ct, nonce);
  return { state: { ...s, CKr: bytesToHex(nextCk), Nr: s.Nr + 1 }, plaintext };
}

// ── Group symmetric key (MLS-lite) ────────────────────────────────────────

const GK_STORE = 'mwt:group_keys';

export function generateGroupKey(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}
export function saveGroupKey(groupId: string, key: Uint8Array): void {
  try {
    const s = JSON.parse(localStorage.getItem(GK_STORE) ?? '{}');
    s[groupId] = bytesToHex(key);
    localStorage.setItem(GK_STORE, JSON.stringify(s));
  } catch {}
}
export function loadGroupKey(groupId: string): Uint8Array | null {
  try {
    const s = JSON.parse(localStorage.getItem(GK_STORE) ?? '{}');
    const h = s[groupId];
    return h ? hexToBytes(h) : null;
  } catch { return null; }
}
