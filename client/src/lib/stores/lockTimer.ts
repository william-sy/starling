import { get } from 'svelte/store';
import { settings } from './settings';
import { lock } from './auth';
import { go } from './router';

let _timer: ReturnType<typeof setTimeout> | null = null;
let _active = false;

function lockNow() {
  if (!_active) return;
  stop();
  lock();
  go('unlock');
}

function reset() {
  if (!_active) return;
  if (_timer) clearTimeout(_timer);
  const mins = get(settings).lockAfterMinutes;
  if (!mins) return;
  _timer = setTimeout(lockNow, mins * 60 * 1000);
}

function onVisibility() {
  if (document.hidden) {
    reset(); // start the countdown when hidden, lock fires after lockAfterMinutes
  } else {
    reset(); // restart full timer when visible again
  }
}

const EVENTS = ['mousedown', 'keydown', 'touchstart', 'pointerdown'] as const;

export function start() {
  if (_active) return;
  _active = true;
  reset();
  EVENTS.forEach(e => document.addEventListener(e, reset, { passive: true }));
  document.addEventListener('visibilitychange', onVisibility);
}

export function stop() {
  _active = false;
  if (_timer) { clearTimeout(_timer); _timer = null; }
  EVENTS.forEach(e => document.removeEventListener(e, reset));
  document.removeEventListener('visibilitychange', onVisibility);
}
