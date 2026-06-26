import { writable, derived } from 'svelte/store';

export type BroadcastMode = 'channel' | 'private';

export interface Broadcast {
  id:             string;
  name:           string;
  mode:           BroadcastMode;
  recipient_pins: string[];
  created_at:     number;
}

const STORAGE_KEY = 'mwt:broadcasts';

function load(): Broadcast[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'); }
  catch { return []; }
}

export const broadcasts        = writable<Broadcast[]>(load());
export const activeBroadcastId = writable<string | null>(null);
export const activeBroadcast   = derived(
  [broadcasts, activeBroadcastId],
  ([list, id]) => list.find(b => b.id === id) ?? null,
);

broadcasts.subscribe(list => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch { /* storage full */ }
});

export function createBroadcast(name: string, mode: BroadcastMode, recipient_pins: string[]): Broadcast {
  const b: Broadcast = { id: crypto.randomUUID(), name, mode, recipient_pins, created_at: Date.now() };
  broadcasts.update(list => [...list, b]);
  activeBroadcastId.set(b.id);
  return b;
}

export function deleteBroadcast(id: string): void {
  broadcasts.update(list => list.filter(b => b.id !== id));
  activeBroadcastId.update(cur => cur === id ? null : cur);
}
