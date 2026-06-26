import { writable, get } from 'svelte/store';
import { invoke } from '$lib/utils/tauri';
import { storeDhPriv, loadDhPriv } from '$lib/crypto';

export interface Account {
  pin:          string;
  display_name: string;
  notif_name:   string;
  sign_key_hex: string;
  dh_key_hex:   string;
  dh_priv_hex?: string;
  tier:         string;
  relay_url?:   string;
  colonies?:    string[];
}

// In-memory only. Keys are never persisted, re-derived when needed.
export const account    = writable<Account | null>(null);
export const unlocked   = writable(false);

// Phrase held in memory only during onboarding, cleared after confirmation.
export const pendingWords       = writable<string[]>([]);
export const pendingPin         = writable<string>('');
export const pendingRelayUrl    = writable<string>('');
export const pendingPassphrase  = writable<string>(''); // cleared after registration

function syncDhPrivToStorage(a: Account) {
  if (a.dh_priv_hex && !loadDhPriv(a.pin)) {
    storeDhPriv(a.pin, a.dh_priv_hex);
  }
}

export async function loadPersistedAccount(): Promise<Account | null> {
  try {
    const a = await invoke<Account | null>('load_account');
    if (a) {
      syncDhPrivToStorage(a);
      account.set(a);
    }
    return a;
  } catch {
    return null;
  }
}

export async function persistAccount(a: Account) {
  syncDhPrivToStorage(a);
  await invoke('save_account', { account: a });
  account.set(a);
}

export function lock() {
  unlocked.set(false);
}

export function unlock() {
  unlocked.set(true);
}
