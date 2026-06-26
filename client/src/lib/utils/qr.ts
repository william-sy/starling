export interface ContactQr {
  t: 'c';
  v: number;
  p: string;   // PIN
  k?: string;  // dh_key_hex
  r?: string;  // relay_url
  n?: string;  // display_name
}

export interface DeviceLinkQr {
  t: 'd';
  v: number;
  ek: string;  // ephemeral DH public key hex
}

export type ParsedQr = ContactQr | DeviceLinkQr;

export function parseQr(raw: string): ParsedQr | null {
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object') return null;
    if (obj.t === 'c' && typeof obj.p === 'string') return obj as ContactQr;
    if (obj.t === 'd' && typeof obj.ek === 'string') return obj as DeviceLinkQr;
    return null;
  } catch {
    return null;
  }
}

export function buildContactQr(pin: string, dhKeyHex: string, relayUrl: string, name: string): string {
  return JSON.stringify({ t: 'c', v: 1, p: pin, k: dhKeyHex, r: relayUrl, n: name });
}

export async function buildDeviceLinkQr(): Promise<{ qrData: string; privKeyHex: string }> {
  const { x25519 } = await import('@noble/curves/ed25519.js');
  const privKey   = x25519.utils.randomSecretKey() as Uint8Array;
  const pubKey    = x25519.getPublicKey(privKey) as Uint8Array;
  const toHex     = (b: Uint8Array) => Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
  return {
    qrData:     JSON.stringify({ t: 'd', v: 1, ek: toHex(pubKey) }),
    privKeyHex: toHex(privKey),
  };
}
