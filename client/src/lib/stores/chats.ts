import { writable } from 'svelte/store';

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
export type MessageKind   = 'text' | 'system' | 'image' | 'sticker' | 'audio' | 'poll' | 'file';

export interface PollData {
  question: string;
  options:  string[];
  votes:    Record<number, string[]>; // option index -> voter pins
}

export interface ReplyRef {
  id:       string;
  from_pin: string;
  body:     string;
  kind?:    MessageKind;
}

export interface Message {
  id:              string;
  from_pin:        string;
  body:            string;
  ts:              number;
  status:          MessageStatus;
  is_me:           boolean;
  kind?:           MessageKind;
  original?:       string;
  filename?:       string;
  reactions?:      Record<string, string[]>;
  filesize?:       number;
  poll?:           PollData;
  receipt_status?: 'sent' | 'delivered' | 'read';
  expires_at?:     number;
  duration?:       number;
  reply_to?:       ReplyRef;
  deleted?:        boolean;
  edited?:         boolean;
  starred?:          boolean;
  view_once?:        boolean;
  view_once_opened?: boolean;
  is_broadcast?:     boolean;
}

const MAX_PER_THREAD = 500;

export const messages  = writable<Record<string, Message[]>>({});
export const typingPins = writable<Set<string>>(new Set());

// ── Persistence ───────────────────────────────────────────────────────────────

let _pin = '';
let _saveTimer: ReturnType<typeof setTimeout> | null = null;

function storageKey() { return `mwt:history:${_pin}`; }

function stripForStorage(msg: Message): Message {
  // View-once images strip immediately once opened
  if (msg.view_once && msg.view_once_opened) return { ...msg, body: '[Photo opened]', original: undefined };
  // Only strip data: URLs (uploaded photos) - CDN URLs (GIFs) are small enough to keep
  if (msg.kind === 'image' && (msg.body.startsWith('data:') || msg.original?.startsWith('data:'))) {
    return { ...msg, body: '[photo]', original: undefined };
  }
  if (msg.kind === 'audio') return { ...msg, body: '[voice message]' };
  if (msg.kind === 'file')  return { ...msg, body: '[file]' };
  return msg;
}

function scheduleSave(threads: Record<string, Message[]>) {
  if (!_pin) return;
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    try {
      const stripped: Record<string, Message[]> = {};
      for (const [k, thread] of Object.entries(threads)) {
        const capped = thread.slice(-MAX_PER_THREAD);
        stripped[k] = capped.map(stripForStorage);
      }
      localStorage.setItem(storageKey(), JSON.stringify(stripped));
    } catch { /* quota exceeded - silently skip */ }
  }, 800);
}

export function loadHistory(accountPin: string) {
  _pin = accountPin;
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return;
    const stored = JSON.parse(raw) as Record<string, Message[]>;
    messages.update(current => {
      const merged: Record<string, Message[]> = { ...stored };
      for (const [k, thread] of Object.entries(current)) {
        const existing = merged[k] ?? [];
        const ids = new Set(existing.map(m => m.id));
        merged[k] = [...existing, ...thread.filter(m => !ids.has(m.id))];
      }
      return merged;
    });
  } catch { /* corrupt storage - ignore */ }
}

export function clearHistory() {
  _pin = '';
  if (_saveTimer) clearTimeout(_saveTimer);
}

messages.subscribe(scheduleSave);

// ── Store operations ──────────────────────────────────────────────────────────

export function appendMessage(pin: string, msg: Message) {
  messages.update(m => {
    const thread = m[pin] ?? [];
    if (thread.some(x => x.id === msg.id)) return m;
    return { ...m, [pin]: [...thread, msg] };
  });
}

export function setTyping(pin: string, isTyping: boolean) {
  typingPins.update(s => {
    const next = new Set(s);
    if (isTyping) next.add(pin); else next.delete(pin);
    return next;
  });
}

export function setMessageFailed(threadPin: string, msgId: string) {
  messages.update(m => {
    const t = m[threadPin];
    if (!t) return m;
    return { ...m, [threadPin]: t.map(msg => msg.id === msgId ? { ...msg, status: 'failed' as MessageStatus } : msg) };
  });
}

export function updateMessageStatus(threadPin: string, msgId: string, status: 'delivered' | 'read') {
  messages.update(m => {
    const t = m[threadPin];
    if (!t) return m;
    return { ...m, [threadPin]: t.map(msg => msg.id === msgId ? { ...msg, receipt_status: status } : msg) };
  });
}

export function deleteMessage(threadPin: string, msgId: string) {
  messages.update(m => {
    const t = m[threadPin];
    if (!t) return m;
    return { ...m, [threadPin]: t.map(msg => msg.id === msgId ? { ...msg, deleted: true, body: '' } : msg) };
  });
}

export function clearThread(pin: string) {
  messages.update(m => {
    const next = { ...m };
    delete next[pin];
    return next;
  });
}

export function castVote(threadPin: string, pollId: string, optionIndex: number, voterPin: string) {
  messages.update(m => {
    const thread = m[threadPin] ?? [];
    return {
      ...m,
      [threadPin]: thread.map(msg => {
        if (msg.id !== pollId || !msg.poll) return msg;
        const prev: Record<number, string[]> = { ...msg.poll.votes };
        // Remove existing vote from any option
        for (const k of Object.keys(prev)) {
          prev[+k] = (prev[+k] ?? []).filter(p => p !== voterPin);
        }
        // Add vote to chosen option (toggle off if already there)
        const already = (msg.poll.votes[optionIndex] ?? []).includes(voterPin);
        if (!already) prev[optionIndex] = [...(prev[optionIndex] ?? []), voterPin];
        return { ...msg, poll: { ...msg.poll, votes: prev } };
      }),
    };
  });
}

export function editMessage(threadPin: string, msgId: string, newBody: string) {
  messages.update(m => {
    const thread = m[threadPin] ?? [];
    return {
      ...m,
      [threadPin]: thread.map(msg =>
        msg.id === msgId ? { ...msg, body: newBody, edited: true } : msg
      ),
    };
  });
}

export function openViewOnce(contactPin: string, msgId: string): void {
  messages.update(all => {
    const thread = all[contactPin];
    if (!thread) return all;
    return {
      ...all,
      [contactPin]: thread.map(m =>
        m.id === msgId ? { ...m, view_once_opened: true, body: '[Photo opened]', original: undefined } : m
      ),
    };
  });
}

export function toggleStar(contactPin: string, msgId: string): void {
  messages.update(all => {
    const thread = all[contactPin];
    if (!thread) return all;
    return {
      ...all,
      [contactPin]: thread.map(m => m.id === msgId ? { ...m, starred: !m.starred } : m),
    };
  });
}

export function toggleReaction(threadPin: string, msgId: string, emoji: string, reactorPin: string) {
  messages.update(m => {
    const thread = m[threadPin] ?? [];
    return {
      ...m,
      [threadPin]: thread.map(msg => {
        if (msg.id !== msgId) return msg;
        const prev    = msg.reactions ?? {};
        const pins    = prev[emoji] ?? [];
        const already = pins.includes(reactorPin);
        const next    = already ? pins.filter(p => p !== reactorPin) : [...pins, reactorPin];
        const updated = { ...prev, [emoji]: next };
        if (next.length === 0) delete updated[emoji];
        return { ...msg, reactions: updated };
      }),
    };
  });
}

// Purge expired messages every 10s
setInterval(() => {
  const now = Date.now();
  messages.update(all => {
    const out: typeof all = {};
    for (const [pin, thread] of Object.entries(all))
      out[pin] = thread.filter(m => !m.expires_at || m.expires_at > now);
    return out;
  });
}, 10_000);
