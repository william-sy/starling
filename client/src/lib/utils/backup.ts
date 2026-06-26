import { get } from 'svelte/store';
import { invoke } from '$lib/utils/tauri';
import { messages, loadHistory } from '$lib/stores/chats';
import { contacts } from '$lib/stores/contacts';
import { settings } from '$lib/stores/settings';
import type { Account } from '$lib/stores/auth';

const VERSION = 1;

export interface BackupBundle {
  version:   number;
  createdAt: number;
  account:   unknown;
  contacts:  unknown;
  settings:  unknown;
  messages:  unknown;
}

function parseBundle(text: string): BackupBundle {
  const bundle = JSON.parse(text) as Partial<BackupBundle>;
  if (!bundle.version || bundle.version > VERSION) throw new Error('Unrecognised backup format.');
  return bundle as BackupBundle;
}

async function applyBundle(bundle: BackupBundle): Promise<Account | null> {
  if (bundle.account) {
    await invoke('save_account', { account: bundle.account });
  }
  if (Array.isArray(bundle.contacts)) {
    contacts.set(bundle.contacts);
  }
  if (bundle.settings && typeof bundle.settings === 'object') {
    settings.save(bundle.settings as never);
  }
  const pin = (bundle.account as { pin?: string })?.pin ?? null;
  if (pin && bundle.messages && typeof bundle.messages === 'object') {
    try { localStorage.setItem(`mwt:history:${pin}`, JSON.stringify(bundle.messages)); } catch {}
    loadHistory(pin);
  }
  return bundle.account ? (bundle.account as Account) : null;
}

function buildBundle(): BackupBundle {
  return {
    version:   VERSION,
    createdAt: Date.now(),
    account:   null,         // filled async below
    contacts:  get(contacts),
    settings:  get(settings),
    messages:  get(messages),
  };
}

function backupFilename(): string {
  return `starling-backup-${new Date().toISOString().slice(0, 10)}.json`;
}

// Save to local/NAS via native file-save dialog
export async function exportBackup(): Promise<string> {
  const account = await invoke('load_account').catch(() => null);
  const bundle  = { ...buildBundle(), account };
  const json     = JSON.stringify(bundle, null, 2);
  const filename = backupFilename();
  const path = await invoke<string>('export_data', { filename, json });
  return path; // empty string = user cancelled
}

export interface WebDavConfig {
  url:      string;
  username: string;
  password: string;
}

// Upload to WebDAV (Nextcloud, Synology, etc.)
export async function exportBackupWebDav(cfg: WebDavConfig): Promise<void> {
  const account = await invoke('load_account').catch(() => null);
  const bundle  = { ...buildBundle(), account };
  const json     = JSON.stringify(bundle, null, 2);
  const filename = backupFilename();
  await invoke('export_webdav', { url: cfg.url, username: cfg.username, password: cfg.password, filename, json });
}

// Used from Settings: restores data in place, returns a status message
export async function importBackup(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const bundle = parseBundle(reader.result as string);
        await applyBundle(bundle);
        resolve('Backup restored. Restart the app to apply all changes.');
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsText(file);
  });
}

// Used from onboarding: restores data and returns the account so the caller can activate it
export async function restoreFromBackupFile(file: File): Promise<Account> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const bundle = parseBundle(reader.result as string);
        const account = await applyBundle(bundle);
        if (!account?.pin) throw new Error('Backup contains no account data.');
        resolve(account);
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsText(file);
  });
}
