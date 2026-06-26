import { writable, derived, get } from 'svelte/store';
import { account, pendingPassphrase } from './auth';
import { appendMessage, setTyping, toggleReaction, castVote, updateMessageStatus, deleteMessage, editMessage } from './chats';
import { contacts, isBlocked }                      from './contacts';
import type { Contact, Status }                     from './contacts';
import { settings }      from './settings';
import { x25519 } from '@noble/curves/ed25519.js';
import {
  getSession, setSession, loadDhPriv,
  x3dhInitiate, x3dhRespond,
  encryptMsg, decryptMsg,
  bytesToHex, hexToBytes, b64Encode, b64Decode,
  drInitAlice, drInitBob, drEncrypt, drDecrypt,
  saveDRState, loadDRState,
  generateGroupKey, saveGroupKey, loadGroupKey,
} from '$lib/crypto/index';
import type { DRHeader } from '$lib/crypto/index';
import { groups } from './groups';
import { notify } from './notifications';
import { activeContact } from './contacts';
import { activeGroup }   from './groups';
import type { Group } from './groups';

// Default relay: env override (dev) or fallback to same host (for APK / phone browser).
const _devHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
export const DEFAULT_RELAY_WS: string =
  (import.meta.env.VITE_RELAY_URL as string | undefined)
  ?? `ws://${_devHost}:3001/ws`;

function getRelayWs(): string {
  const acct = get(account);
  if (acct?.colonies?.length) return acct.colonies[0];
  return acct?.relay_url ?? DEFAULT_RELAY_WS;
}
function getRelayHttp(): string {
  return getRelayWs().replace(/^ws/, 'http').replace(/\/ws$/, '');
}

function getContactHttp(recipientPin: string): string {
  const c = get(contacts).find(x => x.pin === recipientPin);
  const targetWs = c?.via_colony ?? getRelayWs();
  return targetWs.replace(/^ws/, 'http').replace(/\/ws$/, '');
}

// Derived store so components can bind to the current relay URL reactively.
export const relayHttp = derived(account, ($a) => {
  const ws = ($a?.colonies?.length ? $a.colonies[0] : $a?.relay_url) ?? DEFAULT_RELAY_WS;
  return ws.replace(/^ws/, 'http').replace(/\/ws$/, '');
});

export type RelayStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
export const relayStatus    = writable<RelayStatus>('disconnected');
export const colonyStatuses = writable<Record<string, RelayStatus>>({});

export type EffectKind = 'slap' | 'ghost' | 'confetti' | 'peck' | 'hearts' | 'love' | 'letsgo' | 'thunder';
export const pendingEffect    = writable<{ effect: EffectKind; from: string } | null>(null);
export const pinnedMessages   = writable<Record<string, string | null>>({});
export function setPinned(threadKey: string, msgId: string | null): void {
  pinnedMessages.update(m => ({ ...m, [threadKey]: msgId }));
}

interface ColonyConn {
  ws:             WebSocket;
  token:          string;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
}
const connections = new Map<string, ColonyConn>();

let lastPresenceBroadcast = 0;
const PRESENCE_COOLDOWN_MS = 30_000;

function setColonyStatus(url: string, status: RelayStatus) {
  colonyStatuses.update(m => ({ ...m, [url]: status }));
  const vals = Object.values({ ...get(colonyStatuses), [url]: status }) as RelayStatus[];
  if      (vals.some(v => v === 'connected'))  relayStatus.set('connected');
  else if (vals.some(v => v === 'connecting')) relayStatus.set('connecting');
  else if (vals.some(v => v === 'error'))      relayStatus.set('error');
  else                                          relayStatus.set('disconnected');
}

const seenIds = new Set<string>();
function isDuplicate(id: string): boolean {
  if (seenIds.has(id)) return true;
  seenIds.add(id);
  if (seenIds.size > 500) {
    const [oldest] = seenIds;
    seenIds.delete(oldest);
  }
  return false;
}

// btoa only handles Latin-1. Escape anything above U+00FF as \uXXXX so
// JSON.parse on the receiving end reconstructs the correct Unicode string.
function safeB64Json(obj: unknown): string {
  const json = JSON.stringify(obj).replace(
    /[^\x00-\xFF]/g,
    c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`
  );
  return btoa(json);
}

function safeUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function getDeviceId(): string {
  let id = localStorage.getItem('mwt:device_id');
  if (!id) { id = safeUUID(); localStorage.setItem('mwt:device_id', id); }
  return id;
}

function getSendToken(pin: string): string {
  return localStorage.getItem(`mwt:send_token:${pin}`) ?? pin;
}

function getLastSeq(pin: string): number {
  return parseInt(localStorage.getItem(`mwt:last_seq:${pin}`) ?? '0') || 0;
}

export async function relayRegister(): Promise<void> {
  const acct = get(account);
  if (!acct) return;

  const passphrase = get(pendingPassphrase) ||
    localStorage.getItem(`mwt:colony_pass:${getRelayHttp()}`) || undefined;

  const body: Record<string, string | undefined> = {
    pin:        acct.pin,
    device_id:  getDeviceId(),
    sign_key:   acct.sign_key_hex,
    dh_key:     acct.dh_key_hex,
    passphrase,
  };

  const res = await fetch(`${getRelayHttp()}/register`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  if (res.ok) {
    try {
      const data = await res.json() as { send_token?: string };
      if (data.send_token) localStorage.setItem(`mwt:send_token:${acct.pin}`, data.send_token);
    } catch { /* ignore */ }
    // Persist passphrase for this relay so re-registration (new device link) works
    if (passphrase) {
      localStorage.setItem(`mwt:colony_pass:${getRelayHttp()}`, passphrase);
    }
    pendingPassphrase.set('');
  } else if (res.status === 403) {
    pendingPassphrase.set('');
    throw new Error('Registration failed: wrong colony passphrase');
  } else if (res.status !== 409) {
    throw new Error(`Registration failed: ${res.status}`);
  }
  uploadPrekeyBundle(acct.pin).catch(() => {});
}

async function uploadPrekeyBundle(pin: string): Promise<void> {
  const deviceId = getDeviceId();
  const spkPriv  = x25519.utils.randomSecretKey();
  const spkPub   = x25519.getPublicKey(spkPriv);
  localStorage.setItem(`mwt:spk:${pin}`, bytesToHex(spkPriv));
  const one_time_keys = Array.from({ length: 10 }, (_, i) => {
    const priv = x25519.utils.randomSecretKey();
    const pub  = x25519.getPublicKey(priv);
    const id   = Date.now() + i;
    localStorage.setItem(`mwt:otp:${pin}:${id}`, bytesToHex(priv));
    return { id, public_key: bytesToHex(pub) };
  });
  await fetch(`${getRelayHttp()}/prekeys/${encodeURIComponent(pin)}/${encodeURIComponent(deviceId)}`, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getSendToken(pin)}` },
    body:    JSON.stringify({
      bundle: { device_id: deviceId, spk: bytesToHex(spkPub), spk_sig: '0'.repeat(128), one_time_keys },
    }),
  });
}

function connectOne(colonyUrl: string): void {
  const acct = get(account);
  if (!acct) return;

  setColonyStatus(colonyUrl, 'connecting');

  const pin     = acct.pin;
  const lastSeq = getLastSeq(pin);
  const token   = safeUUID();
  const wsUrl   = `${colonyUrl}?pin=${encodeURIComponent(pin)}&device_id=${encodeURIComponent(getDeviceId())}&token=${encodeURIComponent(getSendToken(pin))}${lastSeq > 0 ? `&last_seq=${lastSeq}` : ''}`;

  const socket = new WebSocket(wsUrl);
  socket.binaryType = 'arraybuffer';

  const conn: ColonyConn = { ws: socket, token, reconnectTimer: null };
  connections.set(colonyUrl, conn);

  socket.onopen = () => {
    if (connections.get(colonyUrl)?.token !== token) return;
    setColonyStatus(colonyUrl, 'connected');
    traceLog('connected to colony', colonyUrl);
    const now = Date.now();
    if (now - lastPresenceBroadcast >= PRESENCE_COOLDOWN_MS) {
      lastPresenceBroadcast = now;
      for (const c of get(contacts)) {
        relaySendAddRequest(c.pin).catch(() => {});
      }
    }
  };

  socket.onerror = () => {
    if (connections.get(colonyUrl)?.token !== token) return;
    setColonyStatus(colonyUrl, 'error');
  };

  socket.onclose = () => {
    if (connections.get(colonyUrl)?.token !== token) return;
    setColonyStatus(colonyUrl, 'disconnected');
    const c = connections.get(colonyUrl);
    if (c) c.reconnectTimer = setTimeout(() => {
      connections.delete(colonyUrl);
      connectOne(colonyUrl);
    }, 3000);
  };

  socket.onmessage = async (ev) => {
    if (connections.get(colonyUrl)?.token !== token) return;
    try {
      const bytes = new Uint8Array(ev.data as ArrayBuffer);
      const b64   = new TextDecoder().decode(bytes);
      let payload: RelayPayload;

      try {
        const outer = JSON.parse(atob(b64)) as Record<string, unknown>;
        if (typeof outer.seq === 'number') {
          const acct2seq = get(account);
          if (acct2seq) localStorage.setItem(`mwt:last_seq:${acct2seq.pin}`, String(outer.seq));
        }
        if ((outer.v === 1 || outer.v === 2) && outer.ct) {
          const acct2 = get(account);
          if (!acct2) return;
          const myPriv = loadDhPriv(acct2.pin);
          let plainBytes: Uint8Array;

          if (outer.v === 2 && outer.header) {
            const senderPin = outer.sender_pin as string;
            let drState = loadDRState(senderPin);

            if (!drState) {
              if (!myPriv) { traceLog('DR: no private key'); return; }
              if (outer.ek && outer.sender_ik) {
                const sk = x3dhRespond(myPriv, hexToBytes(outer.sender_ik as string), hexToBytes(outer.ek as string));
                drState = drInitBob(sk, myPriv, hexToBytes(acct2.dh_key_hex));
              } else {
                traceLog('DR: no ek/sender_ik on first message'); return;
              }
            }

            const header = outer.header as DRHeader;
            const nonce  = hexToBytes(outer.nonce as string);
            const ct     = b64Decode(outer.ct as string);

            try {
              const { state: nextState, plaintext } = await drDecrypt(drState, header, ct, nonce);
              saveDRState(senderPin, nextState);
              plainBytes = plaintext;
            } catch (e) {
              traceLog('DR decrypt failed', e); return;
            }
          } else {
            let sk: Uint8Array | null = null;
            if (outer.ek && outer.sender_ik && myPriv) {
              sk = x3dhRespond(myPriv, hexToBytes(outer.sender_ik as string), hexToBytes(outer.ek as string));
            } else if (outer.sender_pin) {
              sk = getSession(outer.sender_pin as string);
            }
            if (!sk) { traceLog('no session key for decryption, dropping'); return; }
            const nonce = hexToBytes(outer.nonce as string);
            const ct    = b64Decode(outer.ct as string);
            try {
              plainBytes = await decryptMsg(sk, ct, nonce);
            } catch (e) { traceLog('v1 decrypt failed', e); return; }
            if (outer.ek && outer.sender_pin) setSession(outer.sender_pin as string, sk);
          }

          payload = JSON.parse(new TextDecoder().decode(plainBytes)) as RelayPayload;
        } else if (outer.v === 3 && outer.ct && outer.group_id) {
          const gk = loadGroupKey(outer.group_id as string);
          if (!gk) { traceLog('no group key for', outer.group_id); return; }
          try {
            const plain = await decryptMsg(gk, b64Decode(outer.ct as string), hexToBytes(outer.nonce as string));
            payload = JSON.parse(new TextDecoder().decode(plain)) as RelayPayload;
          } catch (e) { traceLog('v3 group decrypt failed', e); return; }
        } else {
          payload = outer as unknown as RelayPayload;
        }
      } catch {
        try {
          payload = JSON.parse(atob(b64)) as RelayPayload;
        } catch (err) {
          traceLog('failed to decode incoming message', err);
          return;
        }
      }

      handleIncoming(payload);
    } catch (err) {
      traceLog('failed to decode incoming message', err);
    }
  };
}

export function relayConnect(): void {
  const acct = get(account);
  if (!acct) return;
  const rawUrls = acct.colonies?.length
    ? acct.colonies
    : [acct.relay_url ?? DEFAULT_RELAY_WS];
  // deduplicate - opening multiple sockets to the same URL creates NATS consumer conflicts
  const urls = [...new Set(rawUrls)];

  for (const [url, conn] of connections) {
    if (!urls.includes(url)) {
      clearTimeout(conn.reconnectTimer!);
      conn.ws.onopen = conn.ws.onclose = conn.ws.onerror = conn.ws.onmessage = null;
      if (conn.ws.readyState < WebSocket.CLOSING) conn.ws.close();
      connections.delete(url);
      colonyStatuses.update(m => { const n = { ...m }; delete n[url]; return n; });
    }
  }

  for (const url of urls) {
    const existing = connections.get(url);
    if (!existing || existing.ws.readyState > WebSocket.OPEN) {
      if (existing) {
        clearTimeout(existing.reconnectTimer!);
        connections.delete(url);
      }
      connectOne(url);
    }
  }
}

export function relayDisconnect(): void {
  for (const [url, conn] of connections) {
    clearTimeout(conn.reconnectTimer!);
    conn.ws.onopen = conn.ws.onclose = conn.ws.onerror = conn.ws.onmessage = null;
    if (conn.ws.readyState < WebSocket.CLOSING) conn.ws.close();
    connections.delete(url);
  }
  colonyStatuses.set({});
  relayStatus.set('disconnected');
  document.removeEventListener('visibilitychange', _onVisibility);
}

function _onVisibility() {
  if (!document.hidden) relayConnect();
}

export function relayRegisterVisibility() {
  document.removeEventListener('visibilitychange', _onVisibility);
  document.addEventListener('visibilitychange', _onVisibility);
}

export function relayBroadcastPresence(): void {
  for (const c of get(contacts)) {
    relaySendAddRequest(c.pin).catch(() => {});
  }
}

export interface RelayPayload {
  type?:          'message' | 'add-request' | 'typing' | 'reaction' | 'vote' | 'receipt' | 'group-invite' | 'group-key' | 'call-offer' | 'call-answer' | 'call-ice' | 'call-end' | 'delete' | 'edit' | 'pin' | 'group-kick' | 'group-restrict' | 'device-sync';
  edit_msg_id?:   string;
  msgId?:         string;
  from:           string;
  name?:          string;
  personal_msg?:  string;
  my_status?:     string;
  text?:          string;
  ts:             number;
  kind?:          'text' | 'image' | 'sticker' | 'system' | 'audio' | 'poll' | 'file';
  poll?:          { question: string; options: string[] };
  filesize?:      number;
  body?:          string;
  filename?:      string;
  duration?:      number;
  effect?:        EffectKind;
  reaction?:      { msgId: string; emoji: string; reactor: string };
  group_id?:      string;
  receipt?:       { msgId: string; status: 'delivered' | 'read' };
  group_invite?:  { id: string; name: string; admin_pin: string; member_pins: string[] };
  group_key_id?:  string;
  group_key_hex?: string;
  disappear_after?: number;
  delete_msg_id?: string;
  reply_to?:      { id: string; from_pin: string; body: string; kind?: string };
  relay_moved?:   string;
  relay_invite?:  string;
  pin_msg_id?:    string;
  pin_active?:    boolean;
  mention_pins?:  string[];
  view_once?:     boolean;
  is_broadcast?:     boolean;
  kick_pin?:         string;
  restrict_posting?: boolean;
  sync_payload?:     string;
  sender_dh_pub?:    string;
  // WebRTC signaling
  sdp?:           string;
  video?:         boolean;
  candidate?:     RTCIceCandidateInit;
  [key: string]:  unknown;
}

async function fetchPeerDhKey(pin: string): Promise<string | null> {
  try {
    const res = await fetch(`${getRelayHttp()}/identity/${encodeURIComponent(pin)}`);
    if (!res.ok) return null;
    const data = await res.json() as { dh_key: string };
    return data.dh_key;
  } catch { return null; }
}

async function buildCiphertext(recipientPin: string, inner: object): Promise<string> {
  const acct = get(account);
  if (!acct) throw new Error('not logged in');

  const plain = new TextEncoder().encode(JSON.stringify(inner));

  try {
    let drState = loadDRState(recipientPin);
    if (drState) {
      traceLog('cipher: DR ratchet encrypt');
      const { state: nextState, header, ct, nonce } = await drEncrypt(drState, plain);
      saveDRState(recipientPin, nextState);
      return btoa(JSON.stringify({
        v: 2, sender_pin: acct.pin,
        header, nonce: bytesToHex(nonce), ct: b64Encode(ct),
      }));
    }

    const peerDhHex = await fetchPeerDhKey(recipientPin);
    if (peerDhHex) {
      const myPriv = loadDhPriv(acct.pin);
      if (myPriv) {
        traceLog('cipher: X3DH+DR init');
        const ekPriv = x25519.utils.randomSecretKey();
        const ekPub  = x25519.getPublicKey(ekPriv);
        const sk     = x3dhInitiate(myPriv, ekPriv, hexToBytes(peerDhHex));
        const state  = await drInitAlice(sk, hexToBytes(peerDhHex));
        const { state: nextState, header, ct, nonce } = await drEncrypt(state, plain);
        saveDRState(recipientPin, nextState);
        return btoa(JSON.stringify({
          v: 2, ek: bytesToHex(ekPub), sender_ik: acct.dh_key_hex, sender_pin: acct.pin,
          header, nonce: bytesToHex(nonce), ct: b64Encode(ct),
        }));
      }
      traceLog('cipher: no local dh_priv - sending plain');
    } else {
      traceLog('cipher: fetchPeerDhKey returned null - sending plain');
    }
  } catch (e) {
    traceLog('cipher: exception - sending plain', e);
  }

  return safeB64Json(inner);
}

export async function relaySend(recipientPin: string, payload: RelayPayload): Promise<void> {
  const acct = get(account);
  if (!acct) throw new Error('not logged in');
  const msgId      = safeUUID();
  const inner      = { type: 'message', msgId, ...payload };
  if (payload.reply_to) {
    console.log('[relay] sending reply_to:', JSON.stringify(payload.reply_to));
  }
  const ciphertext = await buildCiphertext(recipientPin, inner);
  const targetUrl  = `${getContactHttp(recipientPin)}/message`;
  const sendToken  = getSendToken(acct.pin);
  const res = await fetch(targetUrl, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sendToken}` },
    body:    JSON.stringify({ recipient_pin: recipientPin, ciphertext }),
  });
  if (!res.ok) throw new Error(`Send failed: ${res.status}`);
}

export function relayTyping(recipientPin: string): void {
  const acct = get(account);
  if (!acct) return;
  const ciphertext = btoa(JSON.stringify({ type: 'typing', from: acct.pin, ts: Date.now() }));
  fetch(`${getContactHttp(recipientPin)}/message`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getSendToken(acct.pin)}` },
    body:    JSON.stringify({ recipient_pin: recipientPin, ciphertext }),
  }).catch(() => {});
}

export async function relaySendAddRequest(recipientPin: string): Promise<void> {
  const acct = get(account);
  const cfg  = get(settings);
  if (!acct) throw new Error('not logged in');

  const sealed_payload = safeB64Json({
    type:         'add-request',
    from:         acct.pin,
    name:         cfg.displayName || acct.display_name,
    personal_msg: cfg.personalMsg,
    my_status:    cfg.myStatus,
    ts:           Date.now(),
  });

  const res = await fetch(`${getContactHttp(recipientPin)}/add-request`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ sender_pin: acct.pin, recipient_pin: recipientPin, sealed_payload }),
  });
  if (!res.ok && res.status !== 409) throw new Error(`Add-request failed: ${res.status}`);
}

export async function relaySendReaction(recipientPin: string, msgId: string, emoji: string): Promise<void> {
  const acct = get(account);
  if (!acct) return;
  const inner = {
    type:     'reaction',
    from:     acct.pin,
    reaction: { msgId, emoji, reactor: acct.pin },
    ts:       Date.now(),
  };
  const ciphertext = await buildCiphertext(recipientPin, inner);
  const res = await fetch(`${getContactHttp(recipientPin)}/message`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getSendToken(acct.pin)}` },
    body:    JSON.stringify({ recipient_pin: recipientPin, ciphertext }),
  });
  if (!res.ok) throw new Error(`Reaction send failed: ${res.status}`);
}

export async function relaySendEdit(recipientPin: string, msgId: string, newText: string): Promise<void> {
  const acct = get(account);
  if (!acct) return;
  const inner = { type: 'edit', from: acct.pin, edit_msg_id: msgId, text: newText, ts: Date.now() };
  const ciphertext = await buildCiphertext(recipientPin, inner);
  const res = await fetch(`${getContactHttp(recipientPin)}/message`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getSendToken(acct.pin)}` },
    body:    JSON.stringify({ recipient_pin: recipientPin, ciphertext }),
  });
  if (!res.ok) throw new Error(`Edit send failed: ${res.status}`);
}

export async function relaySendVote(recipientPin: string, pollId: string, optionIndex: number): Promise<void> {
  const acct = get(account);
  if (!acct) return;
  const inner = {
    type:  'vote',
    from:  acct.pin,
    vote:  { poll_id: pollId, option: optionIndex, voter: acct.pin },
    ts:    Date.now(),
  };
  const ciphertext = await buildCiphertext(recipientPin, inner);
  const res = await fetch(`${getContactHttp(recipientPin)}/message`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getSendToken(acct.pin)}` },
    body:    JSON.stringify({ recipient_pin: recipientPin, ciphertext }),
  });
  if (!res.ok) throw new Error(`Vote send failed: ${res.status}`);
}

export async function relayGroupSend(group: Group, payload: RelayPayload): Promise<void> {
  const acct = get(account);
  if (!acct) return;
  const msgId  = payload.msgId ?? safeUUID();
  const inner  = { type: 'message', msgId, ...payload, group_id: group.id };
  const gk     = loadGroupKey(group.id);
  const others = group.member_pins.filter(p => p !== acct.pin);

  let ciphertextFn: (pin: string) => Promise<string>;
  if (gk) {
    try {
      const plain = new TextEncoder().encode(JSON.stringify(inner));
      const { ct, nonce } = await encryptMsg(gk, plain);
      const envelope = btoa(JSON.stringify({
        v: 3, group_id: group.id, sender_pin: acct.pin,
        nonce: bytesToHex(nonce), ct: b64Encode(ct),
      }));
      ciphertextFn = async () => envelope;
    } catch {
      ciphertextFn = (pin) => buildCiphertext(pin, inner);
    }
  } else {
    ciphertextFn = (pin) => buildCiphertext(pin, inner);
  }

  await Promise.all(others.map(async pin => {
    const ciphertext = await ciphertextFn(pin);
    const res = await fetch(`${getContactHttp(pin)}/message`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getSendToken(acct.pin)}` },
      body:    JSON.stringify({ recipient_pin: pin, ciphertext }),
    });
    if (!res.ok) throw new Error(`Group send failed to ${pin}: ${res.status}`);
  }));
}

export function relaySendReceipt(recipientPin: string, msgId: string, status: 'delivered' | 'read'): void {
  const acct = get(account);
  if (!acct) return;
  const ciphertext = btoa(JSON.stringify({ type: 'receipt', from: acct.pin, ts: Date.now(), receipt: { msgId, status } }));
  fetch(`${getContactHttp(recipientPin)}/message`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getSendToken(acct.pin)}` },
    body:    JSON.stringify({ recipient_pin: recipientPin, ciphertext }),
  }).catch(() => {});
}

export async function relayGroupInvite(group: Group): Promise<void> {
  const acct = get(account);
  if (!acct) return;
  const others = group.member_pins.filter(p => p !== acct.pin);
  await Promise.all(others.map(pin =>
    relaySend(pin, {
      from: acct.pin, ts: Date.now(),
      type: 'group-invite',
      group_invite: { id: group.id, name: group.name, admin_pin: group.admin_pin, member_pins: group.member_pins },
    })
  ));
}

export async function relayDistributeGroupKey(group: Group, key: Uint8Array): Promise<void> {
  const acct = get(account);
  if (!acct) return;
  const others = group.member_pins.filter(p => p !== acct.pin);
  await Promise.all(others.map(pin =>
    relaySend(pin, {
      from: acct.pin, ts: Date.now(),
      type: 'group-key',
      group_key_id: group.id, group_key_hex: bytesToHex(key),
    })
  ));
}

const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();

function handleIncoming(payload: RelayPayload) {
  if (payload.type === 'add-request') {
    handleAddRequest(payload);
    return;
  }

  if (payload.type === 'typing') {
    const pin = payload.from;
    if (!pin) return;
    clearTimeout(typingTimers.get(pin));
    setTyping(pin, true);
    typingTimers.set(pin, setTimeout(() => { setTyping(pin, false); typingTimers.delete(pin); }, 3000));
    return;
  }

  if (payload.type === 'reaction' && payload.reaction) {
    const { msgId, emoji, reactor } = payload.reaction;
    const senderPin = payload.from;
    if (!senderPin) return;
    toggleReaction(senderPin, msgId, emoji, reactor);
    return;
  }

  if (payload.type === 'vote' && payload.vote) {
    const { poll_id, option, voter } = payload.vote as { poll_id: string; option: number; voter: string };
    const senderPin = payload.from;
    if (!senderPin) return;
    castVote(senderPin, poll_id, option, voter);
    return;
  }

  if (payload.type === 'edit' && payload.edit_msg_id && payload.text != null) {
    const senderPin = payload.from;
    if (!senderPin) return;
    editMessage(senderPin, payload.edit_msg_id, payload.text);
    return;
  }

  if (payload.type === 'receipt' && payload.receipt) {
    updateMessageStatus(payload.from, payload.receipt.msgId, payload.receipt.status);
    return;
  }

  if (payload.type === 'group-invite' && payload.group_invite) {
    const gi = payload.group_invite;
    if (!get(groups).find(g => g.id === gi.id)) groups.addFromInvite(gi);
    return;
  }

  if (payload.type === 'group-key' && payload.group_key_id && payload.group_key_hex) {
    saveGroupKey(payload.group_key_id, hexToBytes(payload.group_key_hex));
    return;
  }

  if (['call-offer', 'call-answer', 'call-ice', 'call-end'].includes(payload.type ?? '')) {
    import('./calling').then(m => m.handleCallSignal(payload));
    return;
  }

  if (payload.type === 'delete' && payload.delete_msg_id) {
    deleteMessage(payload.from, payload.delete_msg_id as string);
    return;
  }

  if (payload.type === 'pin') {
    const threadKey = payload.group_id ?? payload.from;
    setPinned(threadKey, payload.pin_active !== false ? (payload.pin_msg_id ?? null) : null);
    return;
  }

  if (payload.type === 'group-kick') {
    const groupId = payload.group_id;
    const kickPin = payload.kick_pin;
    if (groupId && kickPin) groups.kickMember(groupId, kickPin);
    return;
  }

  if (payload.type === 'group-restrict') {
    const groupId = payload.group_id;
    if (groupId && payload.restrict_posting !== undefined) {
      groups.setRestrict(groupId, payload.restrict_posting as boolean);
    }
    return;
  }

  if (payload.type === 'device-sync') {
    const syncPayload  = payload.sync_payload  as string | undefined;
    const senderDhPub  = payload.sender_dh_pub as string | undefined;
    if (syncPayload && senderDhPub) {
      import('$lib/utils/sync').then(({ decryptAndImportSync }) => {
        decryptAndImportSync(syncPayload, senderDhPub).then(ok => {
          if (ok) {
            import('$lib/stores/sync').then(({ syncSuccess }) => {
              syncSuccess.set(true);
              setTimeout(() => syncSuccess.set(false), 4000);
            });
          }
        });
      });
    }
    return;
  }

  const dedupeKey = payload.msgId ?? `${payload.from}:${payload.ts}`;
  if (isDuplicate(dedupeKey)) { traceLog('duplicate dropped'); return; }

  const senderPin = payload.from;
  if (!senderPin) { traceLog('no from pin, dropping'); return; }
  traceLog(`incoming from ${senderPin.slice(0, 8)} type=${payload.type ?? 'message'}`);

  contacts.setStatus(senderPin, 'online');
  contacts.setLastSeen(senderPin);
  clearTimeout(typingTimers.get(senderPin));
  typingTimers.delete(senderPin);
  setTyping(senderPin, false);

  if (payload.effect) {
    pendingEffect.set({ effect: payload.effect, from: senderPin });
  }

  const threadKey = payload.group_id ?? senderPin;
  const expiresAt = payload.disappear_after ? payload.ts + payload.disappear_after * 1000 : undefined;

  // Explicitly reconstruct reply_to to survive any serialization edge-cases
  const rawReply = payload.reply_to as Record<string, unknown> | null | undefined;
  const replyTo: import('./chats').ReplyRef | undefined =
    rawReply && typeof rawReply === 'object' && rawReply.from_pin
      ? {
          id:       String(rawReply.id       ?? ''),
          from_pin: String(rawReply.from_pin ?? ''),
          body:     String(rawReply.body     ?? ''),
          ...(rawReply.kind ? { kind: rawReply.kind as import('./chats').MessageKind } : {}),
        }
      : undefined;

  if (replyTo) console.log('[relay] incoming reply_to:', JSON.stringify(replyTo));

  const rawPoll = payload.poll as { question: string; options: string[] } | undefined;

  appendMessage(threadKey, {
    id:       payload.msgId ?? safeUUID(),
    from_pin: senderPin,
    body:     payload.text ?? payload.body ?? '',
    ts:       payload.ts,
    status:   'delivered',
    is_me:    false,
    kind:     payload.kind ?? 'text',
    ...((payload.kind === 'image' || payload.kind === 'sticker') ? { filename: payload.filename } : {}),
    ...(payload.kind === 'audio' ? { duration: payload.duration } : {}),
    ...(payload.kind === 'file'  ? { filesize: payload.filesize, filename: payload.filename ?? 'file' } : {}),
    ...(payload.kind === 'poll' && rawPoll ? { poll: { question: rawPoll.question, options: rawPoll.options, votes: {} } } : {}),
    ...(replyTo ? { reply_to: replyTo } : {}),
    ...(expiresAt ? { expires_at: expiresAt } : {}),
    ...(payload.is_broadcast ? { is_broadcast: true } : {}),
    ...(payload.view_once ? { view_once: true } : {}),
  });

  if (payload.group_id) {
    groups.incrementUnread(payload.group_id);
  }

  // Notify - only for content messages when the sender's thread is not open
  const msgType = payload.type ?? 'message';
  const notifKind = payload.kind ?? 'text';
  if (msgType === 'message' && (notifKind !== 'system' || payload.effect)) {
    const openPin   = get(activeContact)?.pin;
    const openGroup = get(activeGroup)?.id;
    const isOpen    = payload.group_id
      ? openGroup === payload.group_id
      : openPin   === senderPin;
    if (!isOpen) {
      if (!payload.group_id) contacts.incrementUnread(senderPin);
      const contact    = get(contacts).find(c => c.pin === senderPin);
      const senderName = contact?.display_name ?? senderPin.slice(0, 8);
      const groupList  = get(groups) as Group[];
      const threadName = payload.group_id
        ? (groupList.find((g: Group) => g.id === payload.group_id)?.name ?? 'Group')
        : senderName;
      let preview: string;
      if (notifKind === 'image')        preview = 'Sent a photo';
      else if (notifKind === 'sticker') preview = 'Sent a sticker';
      else if (notifKind === 'audio')   preview = 'Sent a voice message';
      else if (notifKind === 'file')    preview = `Sent a file: ${payload.filename ?? ''}`;
      else if (notifKind === 'poll')    preview = 'Sent a poll';
      else if (payload.effect === 'slap')  preview = 'Slapped you with a trout 🐟';
      else if (payload.effect === 'peck')  preview = 'Pecked you 🐦';
      else if (payload.effect === 'ghost') preview = 'Summoned a ghost 👻';
      else if (payload.effect === 'confetti') preview = 'Threw confetti 🎉';
      else preview = (payload.text ?? payload.body ?? '').slice(0, 80);
      if (!contacts.isMuted(senderPin)) notify(threadName, preview, senderPin);
    }
  }

  if (!payload.group_id) {
    relaySendReceipt(senderPin, dedupeKey, 'delivered');
  }
}

function handleAddRequest(payload: RelayPayload) {
  const senderPin = payload.from;
  if (!senderPin) return;

  if (isBlocked(senderPin)) return;

  const existing = get(contacts).find(c => c.pin === senderPin);
  if (existing) {
    const wasOffline = existing.status !== 'online';
    const newStatus  = (payload.my_status as Status | undefined) ?? 'online';
    const newName    = payload.name?.trim() || undefined;
    contacts.update(cs => cs.map(c =>
      c.pin === senderPin ? {
        ...c,
        status:       newStatus,
        display_name: newName ?? c.display_name,
        notif_name:   newName ?? c.notif_name,
        personal_msg: payload.personal_msg ?? c.personal_msg,
      } : c
    ));
    if (wasOffline) relaySendAddRequest(senderPin).catch(() => {});
    return;
  }

  const displayName = payload.name?.trim() || `Starling ${senderPin.slice(-4)}`;
  const initStatus  = (payload.my_status as Status | undefined) ?? 'online';
  contacts.update(cs => [...cs, {
    pin:             senderPin,
    display_name:    displayName,
    notif_name:      displayName,
    status:          initStatus,
    personal_msg:    payload.personal_msg ?? '',
    avatar_hash:     null,
    avatar_url:      null,
    is_close_friend: false,
    unread:          0,
  } as Contact]);

  relaySendAddRequest(senderPin).catch(() => {});
  traceLog('auto-added contact from add-request', senderPin);
}

function traceLog(...args: unknown[]) {
  if (import.meta.env.DEV) console.log('[relay]', ...args);
}

export async function relayGroupKick(group: Group, kickPin: string): Promise<void> {
  const acct = get(account);
  if (!acct || group.admin_pin !== acct.pin) return;
  await relayGroupSend(group, {
    type:     'group-kick',
    from:     acct.pin,
    kick_pin: kickPin,
    ts:       Date.now(),
  } as any);
  groups.kickMember(group.id, kickPin);
}

export async function relayGroupSetRestrict(group: Group, restrict: boolean): Promise<void> {
  const acct = get(account);
  if (!acct || group.admin_pin !== acct.pin) return;
  await relayGroupSend(group, {
    type:             'group-restrict',
    from:             acct.pin,
    restrict_posting: restrict,
    ts:               Date.now(),
  } as any);
  groups.setRestrict(group.id, restrict);
}

export async function relaySendDeviceSync(
  toPin:         string,
  syncPayload:   string,
  senderDhPub:   string,
): Promise<void> {
  const acct = get(account);
  if (!acct) throw new Error('not logged in');
  const ciphertext = btoa(JSON.stringify({
    type:           'device-sync',
    from:           acct.pin,
    ts:             Date.now(),
    sync_payload:   syncPayload,
    sender_dh_pub:  senderDhPub,
  }));
  const res = await fetch(`${getRelayHttp()}/message`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getSendToken(acct.pin)}` },
    body:    JSON.stringify({ recipient_pin: toPin, ciphertext }),
  });
  if (!res.ok) throw new Error(`Device sync send failed: ${res.status}`);
}

