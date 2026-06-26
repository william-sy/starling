import { writable } from 'svelte/store';

export type Status      = 'online' | 'away' | 'busy' | 'offline';
export type NotifSound  = 'ding' | 'chime' | 'pop' | 'boop' | 'bell' | 'none';
export type ColorScheme = 'system' | 'light' | 'dark';
export type FontSize    = 'small' | 'medium' | 'large' | 'xl';

export type LockMinutes = 0 | 1 | 5 | 15 | 30 | 60;

export interface AppSettings {
  displayName:      string;
  personalMsg:      string;
  myStatus:         Status;
  avatarDataUrl:    string;
  colorScheme:      ColorScheme;
  accentHue:        number;
  fontSize:         FontSize;
  classicStyle:     boolean;
  notifEnabled:     boolean;
  notifSound:       NotifSound;
  readReceipts:     boolean;
  typingIndicator:  boolean;
  lockAfterMinutes:  LockMinutes;
  chatBackgrounds:   Record<string, string>;
  fullscreenEffects: boolean;
  showLastSeen:      boolean;
  linkPreviews:      boolean;
}

const DEFAULTS: AppSettings = {
  displayName:      '',
  personalMsg:      'Using Starling 🔒',
  myStatus:         'online',
  avatarDataUrl:    '',
  colorScheme:      'system',
  accentHue:        152,
  fontSize:         'medium',
  classicStyle:     true,
  notifEnabled:     true,
  notifSound:       'chime',
  readReceipts:     true,
  typingIndicator:  true,
  lockAfterMinutes:  5,
  chatBackgrounds:   {},
  fullscreenEffects: true,
  showLastSeen:      true,
  linkPreviews:      true,
};

const KEY = 'mwt:settings';

function load(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<AppSettings>) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

function createSettings() {
  const { subscribe, set, update } = writable<AppSettings>(load());

  subscribe(v => {
    try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {}
  });

  return {
    subscribe,
    save: (patch: Partial<AppSettings>) => update(s => ({ ...s, ...patch })),
    reset: () => set({ ...DEFAULTS }),
  };
}

export const settings = createSettings();
