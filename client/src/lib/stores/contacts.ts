import { writable, derived, get } from 'svelte/store';

export type Status = 'online' | 'away' | 'busy' | 'offline';

export interface Contact {
  pin:             string;
  display_name:    string;
  notif_name:      string;
  status:          Status;
  personal_msg:    string;
  avatar_hash:     string | null;
  avatar_url:      string | null;
  is_close_friend: boolean;
  is_bot?:         boolean;
  unread:          number;
  pub_key_hex?:    string;
  relay_url?:      string;
  via_colony?:     string;
  last_seen?:      number;       // ms timestamp of last received activity
  muted_until?:    number | null; // null = not muted; 0 = always; epoch ms = until
}

const STORAGE_KEY  = 'mwt:contacts';
const BLOCKED_KEY  = 'mwt:blocked';
const ARCHIVED_KEY = 'mwt:archived';

function loadArchived(): Set<string> {
  try {
    const raw = localStorage.getItem(ARCHIVED_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch { return new Set(); }
}

function saveArchived(s: Set<string>) {
  try { localStorage.setItem(ARCHIVED_KEY, JSON.stringify([...s])); } catch {}
}

export function isArchived(pin: string): boolean {
  return loadArchived().has(pin);
}

export const archivedPins = writable<Set<string>>(loadArchived());

function loadFromStorage(): Contact[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Contact[]) : [];
  } catch {
    return [];
  }
}

function save(list: Contact[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch {}
}

function loadBlocked(): Set<string> {
  try {
    const raw = localStorage.getItem(BLOCKED_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch { return new Set(); }
}

function saveBlocked(s: Set<string>) {
  try { localStorage.setItem(BLOCKED_KEY, JSON.stringify([...s])); } catch {}
}

export function isBlocked(pin: string): boolean {
  return loadBlocked().has(pin);
}

function makeStore() {
  const { subscribe, set, update: _update } = writable<Contact[]>(loadFromStorage());

  function doUpdate(fn: (v: Contact[]) => Contact[]) {
    _update(v => { const next = fn(v); save(next); return next; });
  }

  return {
    subscribe,
    set(v: Contact[]) { save(v); set(v); },
    update: doUpdate,
    setStatus(pin: string, status: Status) {
      doUpdate(list => list.map(c => c.pin === pin ? { ...c, status } : c));
    },
    remove(pin: string) {
      doUpdate(list => list.filter(c => c.pin !== pin));
    },
    block(pin: string) {
      doUpdate(list => list.filter(c => c.pin !== pin));
      const blocked = loadBlocked();
      blocked.add(pin);
      saveBlocked(blocked);
    },
    incrementUnread(pin: string) {
      doUpdate(list => list.map(c => c.pin === pin ? { ...c, unread: (c.unread ?? 0) + 1 } : c));
    },
    clearUnread(pin: string) {
      doUpdate(list => list.map(c => c.pin === pin ? { ...c, unread: 0 } : c));
    },
    toggleBot(pin: string) {
      doUpdate(list => list.map(c => c.pin === pin ? { ...c, is_bot: !c.is_bot } : c));
    },
    setLastSeen(pin: string) {
      doUpdate(list => list.map(c => c.pin === pin ? { ...c, last_seen: Date.now() } : c));
    },
    mute(pin: string, until: number | null) {
      doUpdate(list => list.map(c => c.pin === pin ? { ...c, muted_until: until } : c));
    },
    isMuted(pin: string): boolean {
      const c = get(contacts).find(x => x.pin === pin);
      if (!c || c.muted_until == null) return false;
      if (c.muted_until === 0) return true;
      return Date.now() < c.muted_until;
    },
    merge(incoming: Contact[]) {
      doUpdate(list => {
        const pins = new Set(list.map(c => c.pin));
        const newOnes = incoming.filter(c => !pins.has(c.pin));
        return [...list, ...newOnes];
      });
    },
    archiveContact(pin: string) {
      const a = loadArchived();
      a.add(pin);
      saveArchived(a);
      archivedPins.set(new Set(a));
    },
    unarchiveContact(pin: string) {
      const a = loadArchived();
      a.delete(pin);
      saveArchived(a);
      archivedPins.set(new Set(a));
    },
  };
}

export const contacts = makeStore();

export const activePin = writable<string | null>(null);

export const activeContact = derived(
  [contacts, activePin],
  ([$contacts, $pin]) => $contacts.find(c => c.pin === $pin) ?? null
);

export const grouped = derived(contacts, ($c) => {
  const online  = $c.filter(c => c.status === 'online');
  const away    = $c.filter(c => c.status === 'away' || c.status === 'busy');
  const offline = $c.filter(c => c.status === 'offline');
  return { online, away, offline };
});
