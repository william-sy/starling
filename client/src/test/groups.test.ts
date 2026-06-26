import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get, writable } from 'svelte/store';

// groups.ts calls `get(account)` from './auth' inside createGroup.
// We mock the auth module before each test via vi.doMock + vi.resetModules.

const ADMIN_PIN = 'admin-0001';

async function freshGroups() {
  const { groups } = await import('$lib/stores/groups');
  return groups;
}

describe('groups store', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
    vi.doMock('$lib/stores/auth', () => ({
      account: writable({ pin: ADMIN_PIN, display_name: 'Admin' }),
    }));
  });

  it('createGroup generates a UUID id', async () => {
    const groups = await freshGroups();
    const g = groups.createGroup('Test Group', []);
    expect(g.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('createGroup sets name and admin_pin', async () => {
    const groups = await freshGroups();
    const g = groups.createGroup('My Group', ['member-0001']);
    expect(g.name).toBe('My Group');
    expect(g.admin_pin).toBe(ADMIN_PIN);
  });

  it('createGroup includes admin in member_pins', async () => {
    const groups = await freshGroups();
    const g = groups.createGroup('My Group', ['member-0001']);
    expect(g.member_pins).toContain(ADMIN_PIN);
    expect(g.member_pins).toContain('member-0001');
  });

  it('createGroup deduplicates admin when already in members list', async () => {
    const groups = await freshGroups();
    const g = groups.createGroup('Dedupe', [ADMIN_PIN, 'member-0001']);
    const count = g.member_pins.filter(p => p === ADMIN_PIN).length;
    expect(count).toBe(1);
  });

  it('createGroup trims whitespace from name', async () => {
    const groups = await freshGroups();
    const g = groups.createGroup('  Trimmed  ', []);
    expect(g.name).toBe('Trimmed');
  });

  it('new group starts with unread = 0', async () => {
    const groups = await freshGroups();
    const g = groups.createGroup('Fresh', []);
    expect(g.unread).toBe(0);
  });

  it('incrementUnread increases count', async () => {
    const groups = await freshGroups();
    const g = groups.createGroup('Unread Test', []);
    groups.incrementUnread(g.id);
    groups.incrementUnread(g.id);
    const found = get(groups).find(x => x.id === g.id);
    expect(found?.unread).toBe(2);
  });

  it('clearUnread resets to zero', async () => {
    const groups = await freshGroups();
    const g = groups.createGroup('Clear Test', []);
    groups.incrementUnread(g.id);
    groups.incrementUnread(g.id);
    groups.clearUnread(g.id);
    const found = get(groups).find(x => x.id === g.id);
    expect(found?.unread).toBe(0);
  });

  it('new groups are persisted to localStorage', async () => {
    const groups = await freshGroups();
    const g = groups.createGroup('Persist Test', []);
    const raw = localStorage.getItem('mwt:groups');
    expect(raw).not.toBeNull();
    const saved = JSON.parse(raw!);
    expect(saved.some((x: { id: string }) => x.id === g.id)).toBe(true);
  });

  it('multiple groups coexist without collision', async () => {
    const groups = await freshGroups();
    const g1 = groups.createGroup('Group A', []);
    const g2 = groups.createGroup('Group B', []);
    expect(g1.id).not.toBe(g2.id);
    expect(get(groups)).toHaveLength(2);
  });
});
