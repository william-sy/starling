import { writable } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';

export interface InAppToast {
  id:        string;
  title:     string;
  body:      string;
  senderPin: string;
}

export const toasts = writable<InAppToast[]>([]);

let _permission: NotificationPermission = 'default';
let _pushToken = '';

export function dismissToast(id: string) {
  toasts.update(ts => ts.filter(t => t.id !== id));
}

export function showToast(title: string, body: string, durationMs = 5000): void {
  const id = Math.random().toString(36).slice(2);
  toasts.update(ts => [...ts, { id, title, body, senderPin: '' }]);
  setTimeout(() => dismissToast(id), durationMs);
}

export async function requestPermission(): Promise<void> {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') { _permission = 'granted'; return; }
  if (Notification.permission === 'denied')  { _permission = 'denied';  return; }
  _permission = await Notification.requestPermission();
}

export async function loadPushToken(): Promise<string> {
  try {
    _pushToken = await invoke<string>('get_push_token');
  } catch {
    _pushToken = '';
  }
  return _pushToken;
}

export function getPushToken(): string { return _pushToken; }

export function notify(title: string, body: string, senderPin: string): void {
  if (document.hidden && _permission === 'granted') {
    try {
      const n = new Notification(title, {
        body,
        icon: '/icon.png',
        tag:  senderPin,
      });
      n.onclick = () => { window.focus(); n.close(); };
    } catch {}
  }
  // In-app: rely on unread badge in contact list, no floating toast
  void senderPin;
}
