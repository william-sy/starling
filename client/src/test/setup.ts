import { vi } from 'vitest';

// Provide a reliable in-memory localStorage implementation.
// jsdom's localStorage can be incomplete depending on the environment config.
function makeStorage() {
  let store: Record<string, string> = {};
  return {
    get length() { return Object.keys(store).length; },
    key(i: number) { return Object.keys(store)[i] ?? null; },
    getItem(k: string) {
      return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null;
    },
    setItem(k: string, v: string) { store[k] = String(v); },
    removeItem(k: string) { delete store[k]; },
    clear() { store = {}; },
  };
}

vi.stubGlobal('localStorage', makeStorage());
vi.stubGlobal('sessionStorage', makeStorage());

// Ensure crypto.randomUUID is present (node 19+ has it; earlier versions may not)
if (!globalThis.crypto.randomUUID) {
  Object.defineProperty(globalThis.crypto, 'randomUUID', {
    value: () =>
      '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) => {
        const n = Number(c);
        return (n ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (n / 4)))).toString(16);
      }),
  });
}
