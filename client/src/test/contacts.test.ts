import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { contacts, isBlocked } from '$lib/stores/contacts';

// contacts is a singleton loaded at module import; we seed state via contacts.set()
// and reset localStorage between tests.

function makeContact(pin: string, display_name = 'Test') {
  return {
    pin,
    display_name,
    notif_name:      display_name,
    status:          'offline' as const,
    personal_msg:    '',
    avatar_hash:     null,
    avatar_url:      null,
    is_close_friend: false,
    unread:          0,
  };
}

describe('contacts store - block / remove', () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset the in-memory store to empty so each test starts clean
    contacts.set([]);
  });

  it('isBlocked returns false for a PIN not in the blocklist', () => {
    expect(isBlocked('1234-5678')).toBe(false);
  });

  it('block() adds PIN to the localStorage blocklist', () => {
    contacts.set([makeContact('1111-2222', 'Alice')]);
    contacts.block('1111-2222');
    expect(isBlocked('1111-2222')).toBe(true);
  });

  it('block() removes the contact from the in-memory list', () => {
    contacts.set([
      makeContact('1111-2222', 'Alice'),
      makeContact('3333-4444', 'Bob'),
    ]);
    contacts.block('1111-2222');
    const list = get(contacts);
    expect(list.find(c => c.pin === '1111-2222')).toBeUndefined();
    expect(list.find(c => c.pin === '3333-4444')).toBeDefined();
  });

  it('block() on non-existent PIN still adds to blocklist', () => {
    contacts.block('9999-0000');
    expect(isBlocked('9999-0000')).toBe(true);
  });

  it('remove() removes the contact but does NOT block', () => {
    contacts.set([makeContact('1111-2222', 'Alice')]);
    contacts.remove('1111-2222');
    expect(get(contacts).find(c => c.pin === '1111-2222')).toBeUndefined();
    expect(isBlocked('1111-2222')).toBe(false);
  });

  it('remove() leaves other contacts intact', () => {
    contacts.set([
      makeContact('1111-2222', 'Alice'),
      makeContact('3333-4444', 'Bob'),
    ]);
    contacts.remove('1111-2222');
    const list = get(contacts);
    expect(list).toHaveLength(1);
    expect(list[0].pin).toBe('3333-4444');
  });

  it('blocked PIN is persisted across reads', () => {
    contacts.block('5555-6666');
    // isBlocked re-reads from localStorage every call
    expect(isBlocked('5555-6666')).toBe(true);
    expect(isBlocked('5555-6666')).toBe(true);
  });

  it('blocking does not affect other PINs in the blocklist', () => {
    contacts.block('1111-2222');
    contacts.block('3333-4444');
    expect(isBlocked('1111-2222')).toBe(true);
    expect(isBlocked('3333-4444')).toBe(true);
    expect(isBlocked('5555-6666')).toBe(false);
  });
});
