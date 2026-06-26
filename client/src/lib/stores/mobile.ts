import { writable } from 'svelte/store';

export const showMobileContext = writable(false);

function makeIsMobile() {
  function check(): boolean {
    if (typeof window === 'undefined') return false;
    // navigator.maxTouchPoints is the only property Chrome never spoofs in
    // Desktop Site mode. Phones/tablets always report >= 4; desktop mice = 0;
    // touch laptops typically report 1-2, rarely 4+.
    return navigator.maxTouchPoints >= 4;
  }

  const { subscribe, set } = writable(false);

  if (typeof window !== 'undefined') {
    set(check());
    window.addEventListener('resize', () => set(check()));
    window.addEventListener('orientationchange', () => set(check()));
  }

  function notifyZoomChange() { set(check()); }

  return { subscribe, notifyZoomChange };
}

export const isMobile = makeIsMobile();
