import { writable, get, derived } from 'svelte/store';
import { account } from './auth';
import { safeUUID } from '$lib/utils/uuid';

export interface Group {
  id:               string;
  name:             string;
  admin_pin:        string;
  member_pins:      string[];
  unread:           number;
  restrict_posting?: boolean;
}

const STORAGE_KEY = 'mwt:groups';

function load(): Group[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'); } catch { return []; }
}
function save(list: Group[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch {}
}

function makeGroupStore() {
  const { subscribe, update } = writable<Group[]>(load());

  function doUpdate(fn: (v: Group[]) => Group[]) {
    update(v => { const next = fn(v); save(next); return next; });
  }

  return {
    subscribe,
    createGroup(name: string, memberPins: string[]): Group {
      const acct = get(account);
      if (!acct) throw new Error('not logged in');
      const group: Group = {
        id:          safeUUID(),
        name:        name.trim(),
        admin_pin:   acct.pin,
        member_pins: [...new Set([acct.pin, ...memberPins])],
        unread:      0,
      };
      doUpdate(list => [...list, group]);
      return group;
    },
    clearUnread(id: string) {
      doUpdate(list => list.map(g => g.id === id ? { ...g, unread: 0 } : g));
    },
    incrementUnread(id: string) {
      doUpdate(list => list.map(g => g.id === id ? { ...g, unread: g.unread + 1 } : g));
    },
    addFromInvite(gi: { id: string; name: string; admin_pin: string; member_pins: string[] }) {
      doUpdate(list => list.find(g => g.id === gi.id) ? list : [...list, { ...gi, unread: 0 }]);
    },
    kickMember(groupId: string, pin: string) {
      doUpdate(list => list.map(g =>
        g.id === groupId ? { ...g, member_pins: g.member_pins.filter(p => p !== pin) } : g
      ));
    },
    setRestrict(groupId: string, restrict: boolean) {
      doUpdate(list => list.map(g =>
        g.id === groupId ? { ...g, restrict_posting: restrict } : g
      ));
    },
    deleteGroup(id: string) {
      doUpdate(list => list.filter(g => g.id !== id));
    },
    leaveGroup(id: string, pin: string) {
      doUpdate(list => list
        .map(g => g.id === id ? { ...g, member_pins: g.member_pins.filter(p => p !== pin) } : g)
        .filter(g => g.id !== id ? true : g.member_pins.length > 0)
      );
    },
  };
}

export const groups      = makeGroupStore();
export const activeGroupId = writable<string | null>(null);
export const activeGroup   = derived(
  [groups, activeGroupId],
  ([$groups, $id]) => $groups.find(g => g.id === $id) ?? null,
);
