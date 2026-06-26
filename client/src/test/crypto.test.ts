import { describe, it, expect, beforeEach } from 'vitest';
import { x25519 } from '@noble/curves/ed25519.js';
import {
  x3dhInitiate,
  x3dhRespond,
  encryptMsg,
  decryptMsg,
  bytesToHex,
  hexToBytes,
  getSession,
  setSession,
  generateDhKeypair,
  storeDhPriv,
  loadDhPriv,
  b64Encode,
  b64Decode,
} from '$lib/crypto/index';

// ── Hex utilities ─────────────────────────────────────────────────────────────

describe('hex utilities', () => {
  it('round-trips hex encoding', () => {
    const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x00, 0xff]);
    expect(hexToBytes(bytesToHex(bytes))).toEqual(bytes);
  });

  it('pads single-digit bytes', () => {
    expect(bytesToHex(new Uint8Array([0, 1, 15, 16]))).toBe('00010f10');
  });

  it('throws on odd-length hex', () => {
    expect(() => hexToBytes('abc')).toThrow();
  });
});

// ── Base64 helpers ────────────────────────────────────────────────────────────

describe('b64 utilities', () => {
  it('round-trips arbitrary bytes', () => {
    const bytes = crypto.getRandomValues(new Uint8Array(64));
    expect(b64Decode(b64Encode(bytes))).toEqual(bytes);
  });
});

// ── X3DH key agreement ────────────────────────────────────────────────────────

describe('X3DH key agreement', () => {
  it('Alice and Bob derive the same shared key', () => {
    const aliceIkPriv = x25519.utils.randomSecretKey();
    const aliceIkPub  = x25519.getPublicKey(aliceIkPriv);
    const aliceEkPriv = x25519.utils.randomSecretKey();
    const aliceEkPub  = x25519.getPublicKey(aliceEkPriv);
    const bobIkPriv   = x25519.utils.randomSecretKey();
    const bobIkPub    = x25519.getPublicKey(bobIkPriv);

    const aliceSk = x3dhInitiate(aliceIkPriv, aliceEkPriv, bobIkPub);
    const bobSk   = x3dhRespond(bobIkPriv, aliceIkPub, aliceEkPub);

    expect(bytesToHex(aliceSk)).toBe(bytesToHex(bobSk));
  });

  it('different ephemeral keys produce different session keys', () => {
    const aliceIkPriv  = x25519.utils.randomSecretKey();
    const aliceEk1Priv = x25519.utils.randomSecretKey();
    const aliceEk2Priv = x25519.utils.randomSecretKey();
    const bobIkPub     = x25519.getPublicKey(x25519.utils.randomSecretKey());

    const sk1 = x3dhInitiate(aliceIkPriv, aliceEk1Priv, bobIkPub);
    const sk2 = x3dhInitiate(aliceIkPriv, aliceEk2Priv, bobIkPub);
    expect(bytesToHex(sk1)).not.toBe(bytesToHex(sk2));
  });

  it('swapped keys in x3dhRespond do not match', () => {
    const aliceIkPriv = x25519.utils.randomSecretKey();
    const aliceIkPub  = x25519.getPublicKey(aliceIkPriv);
    const aliceEkPriv = x25519.utils.randomSecretKey();
    const aliceEkPub  = x25519.getPublicKey(aliceEkPriv);
    const bobIkPriv   = x25519.utils.randomSecretKey();
    const bobIkPub    = x25519.getPublicKey(bobIkPriv);

    const aliceSk  = x3dhInitiate(aliceIkPriv, aliceEkPriv, bobIkPub);
    const wrongSk  = x3dhRespond(bobIkPriv, aliceEkPub, aliceIkPub); // args swapped
    expect(bytesToHex(aliceSk)).not.toBe(bytesToHex(wrongSk));
  });

  it('is deterministic for the same inputs', () => {
    const aliceIkPriv = x25519.utils.randomSecretKey();
    const aliceEkPriv = x25519.utils.randomSecretKey();
    const bobIkPub    = x25519.getPublicKey(x25519.utils.randomSecretKey());

    const sk1 = x3dhInitiate(aliceIkPriv, aliceEkPriv, bobIkPub);
    const sk2 = x3dhInitiate(aliceIkPriv, aliceEkPriv, bobIkPub);
    expect(bytesToHex(sk1)).toBe(bytesToHex(sk2));
  });
});

// ── AES-256-GCM encrypt / decrypt ─────────────────────────────────────────────

describe('AES-256-GCM', () => {
  it('round-trips a plaintext message', async () => {
    const key       = crypto.getRandomValues(new Uint8Array(32));
    const plaintext = new TextEncoder().encode('hello world');

    const { ct, nonce } = await encryptMsg(key, plaintext);
    const recovered     = await decryptMsg(key, ct, nonce);

    expect(new TextDecoder().decode(recovered)).toBe('hello world');
  });

  it('round-trips empty payload', async () => {
    const key = crypto.getRandomValues(new Uint8Array(32));
    const { ct, nonce } = await encryptMsg(key, new Uint8Array(0));
    const recovered     = await decryptMsg(key, ct, nonce);
    expect(recovered.byteLength).toBe(0);
  });

  it('decryption fails with wrong key', async () => {
    const key1 = crypto.getRandomValues(new Uint8Array(32));
    const key2 = crypto.getRandomValues(new Uint8Array(32));
    const { ct, nonce } = await encryptMsg(key1, new TextEncoder().encode('secret'));
    await expect(decryptMsg(key2, ct, nonce)).rejects.toThrow();
  });

  it('decryption fails with wrong nonce', async () => {
    const key       = crypto.getRandomValues(new Uint8Array(32));
    const { ct }    = await encryptMsg(key, new TextEncoder().encode('secret'));
    const wrongNonce = crypto.getRandomValues(new Uint8Array(12));
    await expect(decryptMsg(key, ct, wrongNonce)).rejects.toThrow();
  });

  it('produces different nonces on repeated calls (random nonce)', async () => {
    const key       = crypto.getRandomValues(new Uint8Array(32));
    const plaintext = new TextEncoder().encode('hello');
    const enc1 = await encryptMsg(key, plaintext);
    const enc2 = await encryptMsg(key, plaintext);
    expect(bytesToHex(enc1.nonce)).not.toBe(bytesToHex(enc2.nonce));
  });
});

// ── Session key storage ───────────────────────────────────────────────────────

describe('session key storage', () => {
  beforeEach(() => { localStorage.clear(); });

  it('stores and retrieves a session key by PIN', () => {
    const key = crypto.getRandomValues(new Uint8Array(32));
    setSession('1234-5678', key);
    const retrieved = getSession('1234-5678');
    expect(retrieved).not.toBeNull();
    expect(bytesToHex(retrieved!)).toBe(bytesToHex(key));
  });

  it('returns null for unknown PIN', () => {
    expect(getSession('unknown-pin')).toBeNull();
  });

  it('overwrites an existing session key', () => {
    const key1 = crypto.getRandomValues(new Uint8Array(32));
    const key2 = crypto.getRandomValues(new Uint8Array(32));
    setSession('1234-5678', key1);
    setSession('1234-5678', key2);
    expect(bytesToHex(getSession('1234-5678')!)).toBe(bytesToHex(key2));
  });
});

// ── DH private key storage ────────────────────────────────────────────────────

describe('DH private key storage', () => {
  beforeEach(() => { localStorage.clear(); });

  it('generateDhKeypair stores priv and returns 64-char pub hex', () => {
    const pubHex = generateDhKeypair('test-pin');
    expect(pubHex).toHaveLength(64);
    expect(loadDhPriv('test-pin')).not.toBeNull();
  });

  it('two calls produce different keypairs', () => {
    const pub1 = generateDhKeypair('pin-a');
    const pub2 = generateDhKeypair('pin-b');
    expect(pub1).not.toBe(pub2);
  });

  it('storeDhPriv + loadDhPriv round-trip', () => {
    const priv = x25519.utils.randomSecretKey();
    storeDhPriv('test-pin', bytesToHex(priv));
    const loaded = loadDhPriv('test-pin');
    expect(loaded).not.toBeNull();
    expect(bytesToHex(loaded!)).toBe(bytesToHex(priv));
  });

  it('returns null when no key stored', () => {
    expect(loadDhPriv('nonexistent-pin')).toBeNull();
  });
});
