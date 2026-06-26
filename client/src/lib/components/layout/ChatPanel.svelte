<script lang="ts">
  import { afterUpdate, onMount, tick } from 'svelte';
  import { get } from 'svelte/store';
  import MessageBubble from '$lib/components/chat/MessageBubble.svelte';
  import EmojiPicker   from '$lib/components/chat/EmojiPicker.svelte';
  import GifPicker      from '$lib/components/chat/GifPicker.svelte';
  import VoiceRecorder  from '$lib/components/chat/VoiceRecorder.svelte';
  import PollBuilder      from '$lib/components/chat/PollBuilder.svelte';
  import WallpaperPicker  from '$lib/components/chat/WallpaperPicker.svelte';
  import Avatar        from '$lib/components/ui/Avatar.svelte';
  import ColoredName   from '$lib/components/ui/ColoredName.svelte';
  import BirdIcon      from '$lib/components/ui/BirdIcon.svelte';
  import { contacts, activeContact, activePin, archivedPins } from '$lib/stores/contacts';
  import { activeGroup, activeGroupId, groups } from '$lib/stores/groups';
  import { showMobileContext, isMobile } from '$lib/stores/mobile';
  import { messages, appendMessage, setMessageFailed, typingPins, toggleStar, openViewOnce, clearThread, type PollData } from '$lib/stores/chats';
  import { account }       from '$lib/stores/auth';
  import { relaySend, relayTyping, relayStatus, pendingEffect, relayGroupSend, relaySendReceipt, DEFAULT_RELAY_WS, pinnedMessages, setPinned, relayGroupKick, relayGroupSetRestrict } from '$lib/stores/relay';
  import { activeBroadcast, activeBroadcastId, deleteBroadcast } from '$lib/stores/broadcasts';
  import { pendingTrigger, effectQueue } from '$lib/stores/effects';
  import { settings } from '$lib/stores/settings';
  import { clickOutside } from '$lib/actions/clickOutside';
  import { getDisappearAfter } from '$lib/utils/disappear';
  import { safeUUID } from '$lib/utils/uuid';
  import { playSound } from '$lib/audio';
  import type { EffectType } from '$lib/types/effects';
  import { _ } from '$lib/i18n';
  import { initiateCall } from '$lib/stores/calling';
  import { deleteMessage } from '$lib/stores/chats';
  import type { Message } from '$lib/stores/chats';

  const gifEnabled = !!(import.meta.env.VITE_KLIPY_KEY as string | undefined);

  function sendReadReceipts() {
    if (!$activeContact) return;
    const thread = $messages[$activeContact.pin] ?? [];
    const pin = $activeContact.pin;
    thread
      .filter(m => !m.is_me && m.receipt_status !== 'read')
      .forEach(m => relaySendReceipt(pin, m.id, 'read'));
  }

  let effectToast: string | null = null;
  let effectToastTimer: ReturnType<typeof setTimeout> | null = null;

  const EFFECT_LABELS: Record<string, string> = {
    peck:     '🐦 Pecked you',
    slap:     '🐟 Slapped you with a trout',
    ghost:    '👻 Summoned a ghost',
    confetti: '🎉 Threw confetti',
    love:     '💕 Sent love',
    letsgo:   "🚀 Let's go!",
    thunder:  '⚡ Thunder!',
  };

  function fireEffect(effect: string) {
    if ($settings.fullscreenEffects) {
      pendingTrigger.set(effect as EffectType);
      if (effect === 'slap' || effect === 'peck') playSound('peck');
      if (effect === 'peck' || effect === 'thunder') {
        shaking = true;
        setTimeout(() => { shaking = false; }, effect === 'thunder' ? 500 : 600);
      }
    } else {
      effectToast = EFFECT_LABELS[effect] ?? effect;
      if (effectToastTimer) clearTimeout(effectToastTimer);
      effectToastTimer = setTimeout(() => { effectToast = null; }, 3000);
    }
  }

  // Incoming effects: fire if this chat is open, otherwise queue for when it opens.
  onMount(() => {
    sendReadReceipts();
    return pendingEffect.subscribe(pe => {
      if (!pe) return;
      pendingEffect.set(null);
      const activePePin = get(activeContact)?.pin;
      if (pe.from === activePePin) {
        fireEffect(pe.effect);
      } else {
        effectQueue.update(q => ({ ...q, [pe.from]: pe.effect }));
      }
    });
  });

  $: if ($activeContact) {
    sendReadReceipts();
    contacts.clearUnread($activeContact.pin);
    stickToBottom = true;
    const _queued = get(effectQueue)[$activeContact.pin];
    if (_queued) {
      effectQueue.update(q => { const r = { ...q }; delete r[$activeContact!.pin]; return r; });
      setTimeout(() => fireEffect(_queued), 400);
    }
  }

  // Keyboard avoidance via visualViewport API (iOS/Android)
  let visualViewportHeight = 0;
  let windowHeight = 0;

  function updateKeyboard() {
    if (window.visualViewport) {
      visualViewportHeight = window.visualViewport.height;
      windowHeight = window.innerHeight;
    }
  }

  onMount(() => {
    updateKeyboard();
    window.visualViewport?.addEventListener('resize', updateKeyboard);
    window.visualViewport?.addEventListener('scroll', updateKeyboard);
    return () => {
      window.visualViewport?.removeEventListener('resize', updateKeyboard);
      window.visualViewport?.removeEventListener('scroll', updateKeyboard);
    };
  });

  $: keyboardHeight = windowHeight > 0 && visualViewportHeight > 0
    ? Math.max(0, windowHeight - visualViewportHeight)
    : 0;

  // Typing debounce
  let typingCooldown = false;
  function handleInput() {
    // @mention autocomplete in Flocks
    if ($activeGroup) {
      const atMatch = input.match(/@(\w*)$/);
      if (atMatch) {
        mentionQuery = atMatch[1];
        mentionOpen  = true;
        mentionIndex = 0;
      } else {
        mentionOpen = false;
      }
    } else {
      mentionOpen = false;
    }
    // Typing indicator for DMs
    if (!$activeContact || $activeGroup || !$settings.typingIndicator) return;
    if (typingCooldown) return;
    typingCooldown = true;
    relayTyping($activeContact.pin);
    setTimeout(() => { typingCooldown = false; }, 2000);
  }

  let input            = '';
  let listEl: HTMLElement;
  let inputEl: HTMLTextAreaElement;
  let searchEl: HTMLInputElement;
  let stickToBottom    = true;
  let showPollBuilder  = false;
  let showWallpaper    = false;
  let moreMenuOpen     = false;
  let starredOpen      = false;
  let adminOpen        = false;
  let searchActive     = false;
  let pinDismissed     = false;
  let viewOnce         = false;
  let mentionQuery     = '';
  let mentionOpen      = false;
  let mentionIndex     = 0;
  let searchQuery      = '';
  let matchIndex       = 0;

  $: matchIds = searchQuery.trim().length > 1
    ? enriched
        .filter(m => m.kind !== 'system' && m.body?.toLowerCase().includes(searchQuery.toLowerCase()))
        .map(m => m.id)
    : [];

  $: if (matchIds.length) tick().then(() => scrollToMatch(matchIndex));

  function scrollToMatch(i: number) {
    const id = matchIds[i];
    if (!id) return;
    const anchor = listEl?.querySelector(`[data-msgid="${id}"]`);
    // .msg-anchor uses display:contents so it has no layout box — scroll its first real child
    const target = (anchor?.firstElementChild ?? anchor) as HTMLElement | null;
    if (!target || !listEl) return;
    const offsetTop = target.offsetTop;
    listEl.scrollTo({ top: offsetTop - listEl.clientHeight / 2 + target.offsetHeight / 2, behavior: 'smooth' });
  }

  function openSearch() {
    searchActive = true;
    searchQuery  = '';
    matchIndex   = 0;
    setTimeout(() => searchEl?.focus(), 50);
  }

  function closeSearch() {
    searchActive = false;
    searchQuery  = '';
    matchIndex   = 0;
    stickToBottom = true;
  }

  function nextMatch() {
    if (!matchIds.length) return;
    matchIndex = (matchIndex + 1) % matchIds.length;
    scrollToMatch(matchIndex);
  }

  function prevMatch() {
    if (!matchIds.length) return;
    matchIndex = (matchIndex - 1 + matchIds.length) % matchIds.length;
    scrollToMatch(matchIndex);
  }

  function onListScroll() {
    if (!listEl) return;
    const distFromBottom = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight;
    stickToBottom = distFromBottom < 80;
  }
  let imgFileInput: HTMLInputElement;
  let shaking      = false;
  let emojiOpen    = false;
  let gifOpen      = false;
  let gifAnchorEl: HTMLElement | null = null;

  function toggleGif(e: MouseEvent) {
    gifAnchorEl = e.currentTarget as HTMLElement;
    gifOpen     = !gifOpen;
    emojiOpen   = false;
  }
  let attachError  = '';

  $: starredMessages = $activeContact
    ? ($messages[$activeContact.pin] ?? []).filter(m => m.starred)
    : [];

  $: pinnedMsgId = threadKey ? ($pinnedMessages[threadKey] ?? null) : null;
  $: pinnedMsg   = pinnedMsgId && threadKey
    ? ($messages[threadKey] ?? []).find(m => m.id === pinnedMsgId) ?? null
    : null;
  $: { if (threadKey) pinDismissed = false; }

  $: mentionMembers = $activeGroup
    ? $activeGroup.member_pins
        .filter(p => p !== $account?.pin)
        .map(p => $contacts.find(c => c.pin === p))
        .filter((c): c is NonNullable<typeof c> => c != null)
    : [];

  $: mentionSuggestions = mentionOpen
    ? mentionMembers.filter(c =>
        c.display_name.toLowerCase().startsWith(mentionQuery.toLowerCase())
      ).slice(0, 5)
    : [];

  $: contactColony = (() => {
    if (!$activeContact?.via_colony) return null;
    const primary = $account?.colonies?.[0] ?? $account?.relay_url ?? DEFAULT_RELAY_WS;
    if ($activeContact.via_colony === primary) return null;
    return $activeContact.via_colony.replace(/^wss?:\/\//, '').replace(/\/ws$/, '');
  })();
  let showCmds     = false;

  // ── Markdown formatting ───────────────────────────────────────────────────

  function wrapText(open: string, close = open) {
    if (!inputEl) return;
    const s = inputEl.selectionStart ?? 0;
    const e = inputEl.selectionEnd   ?? 0;
    const sel    = input.substring(s, e);
    const before = input.substring(0, s);
    const after  = input.substring(e);
    if (sel) {
      input = before + open + sel + close + after;
      setTimeout(() => {
        inputEl.setSelectionRange(s + open.length, e + open.length);
        inputEl.focus();
      }, 0);
    } else {
      input = before + open + close + after;
      setTimeout(() => {
        const pos = s + open.length;
        inputEl.setSelectionRange(pos, pos);
        inputEl.focus();
      }, 0);
    }
  }

  // ── Image attachment ──────────────────────────────────────────────────────

  interface ImagePreview {
    compressedUrl: string;
    originalUrl:   string;
    filename:      string;
    compressedKB:  number;
    originalKB:    number;
  }
  let imagePreview: ImagePreview | null = null;

  function readAsDataURL(file: File): Promise<string> {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result as string);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }

  function compressImage(src: string, maxDim: number, quality: number): Promise<string> {
    return new Promise(res => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(maxDim / img.width, maxDim / img.height, 1);
        const c = document.createElement('canvas');
        c.width  = Math.round(img.width  * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL('image/jpeg', quality));
      };
      img.src = src;
    });
  }

  const BLOCKED_EXTS = new Set(['exe','sh','bat','cmd','ps1','msi','app','dmg','com','vbs','scr','jar','pif','cpl','reg','ws','wsf','hta']);
  const FILE_MAX_BYTES = 5 * 1024 * 1024;

  async function handleImageFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    attachError = '';
    if (!file.type.startsWith('image/')) {
      await handleNonImageFile(file);
      (e.target as HTMLInputElement).value = '';
      return;
    }
    const originalUrl  = await readAsDataURL(file);
    const originalKB   = Math.round(file.size / 1024);
    const compressedUrl = await compressImage(originalUrl, 1280, 0.85);
    const compressedKB  = Math.round(compressedUrl.length * 0.75 / 1024);
    imagePreview = { compressedUrl, originalUrl, filename: file.name, compressedKB, originalKB };
    (e.target as HTMLInputElement).value = '';
  }

  function sendImage(useOriginal: boolean) {
    if (!imagePreview || !$activeContact) return;
    const ts   = Date.now();
    const pin  = $activeContact.pin;
    const body = useOriginal ? imagePreview.originalUrl : imagePreview.compressedUrl;
    appendMessage(pin, {
      id:       safeUUID(),
      from_pin: $account!.pin,
      body,
      ts,
      status:   'sending',
      is_me:    true,
      kind:     'image',
      original: imagePreview.originalUrl,
      filename: imagePreview.filename,
      ...(viewOnce ? { view_once: true, view_once_opened: true } : {}),
    });
    relaySend(pin, { from: $account!.pin, kind: 'image', body, filename: imagePreview.filename, ts, ...(viewOnce ? { view_once: true } : {}) }).catch(console.error);
    imagePreview = null;
    viewOnce = false;
  }

  async function handleNonImageFile(file: File) {
    const pin = $activeContact?.pin;
    if (!pin || !$account) return;
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (BLOCKED_EXTS.has(ext)) { attachError = `.${ext} files cannot be sent.`; return; }
    if (file.size > FILE_MAX_BYTES) { attachError = 'File too large - 5 MB maximum.'; return; }
    const body = await readAsDataURL(file);
    const ts   = Date.now();
    const msgId = safeUUID();
    appendMessage(pin, { id: msgId, from_pin: $account.pin, body, ts, status: 'sending', is_me: true, kind: 'file', filename: file.name, filesize: file.size });
    relaySend(pin, { from: $account.pin, kind: 'file', body, filename: file.name, filesize: file.size, ts, msgId }).catch(console.error);
  }

  // Notification sound on incoming messages
  let prevPin = '';
  let prevLen = 0;

  $: threadKey = $activeContact?.pin ?? $activeGroup?.id ?? null;
  $: thread    = threadKey ? ($messages[threadKey] ?? []) : [];

  $: if ($activeGroup) groups.clearUnread($activeGroup.id);

  $: {
    const pin = $activeContact?.pin ?? '';
    const len = thread.length;
    if (pin && pin === prevPin && len > prevLen) {
      const last = thread[len - 1];
      if (!last.is_me && $settings.notifEnabled && $settings.notifSound !== 'none') {
        playSound($settings.notifSound);
      }
    }
    prevPin = pin;
    prevLen = len;
  }

  $: enriched = thread.map((msg, i) => {
    if (msg.kind === 'system') return { ...msg, senderLabel: null as string | null };
    const prev = thread[i - 1];
    const isFirst = !prev || prev.from_pin !== msg.from_pin || prev.kind === 'system';
    const senderLabel = isFirst
      ? (msg.is_me
          ? ($settings.displayName || $account?.display_name || 'You')
          : ($activeGroup
              ? ($contacts.find(c => c.pin === msg.from_pin)?.display_name ?? msg.from_pin.slice(-4))
              : ($activeContact?.display_name ?? '')))
      : null;
    return { ...msg, senderLabel };
  });

  $: lastReceived = (() => {
    const rec = [...thread].reverse().find(m => !m.is_me && m.kind !== 'system');
    if (!rec) return null;
    return new Date(rec.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  })();

  let _lastThreadKey: string | null = null;

  afterUpdate(() => {
    if (!listEl || !stickToBottom) return;
    const isNewThread = threadKey !== _lastThreadKey;
    _lastThreadKey = threadKey ?? null;
    listEl.scrollTo({ top: listEl.scrollHeight, behavior: isNewThread ? 'instant' : 'smooth' });
  });

  // ── Commands ──────────────────────────────────────────────────────────────

  const COMMANDS = [
    { cmd: '/poll',    args: '[question? A,B,C]', desc: 'create a poll'             },
    { cmd: '/slap',    args: '<name>',            desc: 'slap with a large trout 🐟' },
    { cmd: '/ghost',   args: '',                  desc: 'summon a ghost 👻'          },
    { cmd: '/me',      args: '<text>',            desc: 'action message'             },
    { cmd: '/lol',     args: '',                  desc: 'confetti 🎉'                },
    { cmd: '/peck',    args: '',                  desc: 'peck your contact 🐦'       },
    { cmd: '/love',    args: '',                  desc: 'send love 💕'               },
    { cmd: '/letsgo',  args: '',                  desc: "let's go! 🚀"               },
    { cmd: '/thunder', args: '',                  desc: 'thunder and lightning ⚡'   },
  ] as const;

  $: showCmdHint = !!$activeContact && input.startsWith('/') && !input.includes('\n') && !input.includes(' ');
  $: cmdToken    = input.toLowerCase();
  $: hintCmds    = COMMANDS.filter(c => c.cmd.startsWith(cmdToken));

  function applyHint(cmd: string, hasArgs: boolean) {
    input = hasArgs ? cmd + ' ' : cmd;
  }

  function sendPoll(detail: { question: string; options: string[] }) {
    const pin = $activeContact?.pin;
    if (!pin || !$account) return;
    const msgId = safeUUID();
    const ts    = Date.now();
    const poll: PollData = { question: detail.question, options: detail.options, votes: {} };
    appendMessage(pin, { id: msgId, from_pin: $account.pin, body: '', ts, status: 'sent', is_me: true, kind: 'poll', poll });
    relaySend(pin, { from: $account.pin, kind: 'poll', body: '', ts, msgId, poll: { question: poll.question, options: poll.options } }).catch(console.error);
  }

  function handleCommand(text: string): boolean {
    if (!$activeContact) return false;
    const parts = text.trim().split(/\s+/);
    const cmd   = parts[0].toLowerCase();
    const rest  = parts.slice(1).join(' ');
    const rawMe = $settings.displayName || $account?.display_name || 'You';
    const me    = /\[c=\d+\]/i.test(rawMe) ? `${rawMe}[c=0]` : rawMe;

    if (cmd === '/poll') {
      if (rest) {
        // Inline syntax: /poll Question? A,B,C
        const qMark = rest.indexOf('?');
        const sep   = rest.lastIndexOf('?') >= 0 ? '?' : ',';
        let question: string, optStr: string;
        if (qMark >= 0) {
          question = rest.slice(0, qMark + 1).trim();
          optStr   = rest.slice(qMark + 1).trim();
        } else {
          const comma = rest.indexOf(',');
          question = comma >= 0 ? rest.slice(0, comma).trim() : rest.trim();
          optStr   = comma >= 0 ? rest.slice(comma + 1).trim() : '';
        }
        const options = optStr.split(',').map(o => o.trim()).filter(Boolean);
        if (question && options.length >= 2) {
          sendPoll({ question, options });
          return true;
        }
      }
      // No args or bad parse: open builder
      showPollBuilder = true;
      return true;
    }

    if (cmd === '/peck') {
      sendPeck();
      return true;
    }

    if (cmd === '/slap') {
      const rawTarget = rest || $activeContact.display_name;
      const target    = /\[c=\d+\]/i.test(rawTarget) ? `${rawTarget}[c=0]` : rawTarget;
      const ts   = Date.now();
      const body = `* ${me} slaps ${target} around a bit with a large trout 🐟`;
      appendMessage($activeContact.pin, {
        id: safeUUID(), from_pin: $account!.pin,
        body, ts, status: 'sent', is_me: true, kind: 'system',
      });
      relaySend($activeContact.pin, { from: $account!.pin, kind: 'system', text: body, ts, effect: 'slap' }).catch(console.error);
      playSound('peck');
      pendingTrigger.set('slap');
      return true;
    }

    if (cmd === '/ghost') {
      const ts   = Date.now();
      const body = `* ${me} summoned a ghost 👻`;
      appendMessage($activeContact.pin, {
        id: safeUUID(), from_pin: $account!.pin,
        body, ts, status: 'sent', is_me: true, kind: 'system',
      });
      relaySend($activeContact.pin, { from: $account!.pin, kind: 'system', text: body, ts, effect: 'ghost' }).catch(console.error);
      pendingTrigger.set('ghost');
      return true;
    }

    if (cmd === '/me' && rest) {
      const ts   = Date.now();
      const body = `* ${me} ${rest}`;
      appendMessage($activeContact.pin, {
        id: safeUUID(), from_pin: $account!.pin,
        body, ts, status: 'sent', is_me: true, kind: 'system',
      });
      relaySend($activeContact.pin, { from: $account!.pin, kind: 'system', text: body, ts }).catch(console.error);
      return true;
    }

    if (cmd === '/lol') {
      const ts   = Date.now();
      const body = `* ${me} threw confetti 🎉`;
      appendMessage($activeContact.pin, {
        id: safeUUID(), from_pin: $account!.pin,
        body, ts, status: 'sent', is_me: true, kind: 'system',
      });
      relaySend($activeContact.pin, { from: $account!.pin, kind: 'system', text: body, ts, effect: 'confetti' }).catch(console.error);
      pendingTrigger.set('confetti');
      return true;
    }

    if (cmd === '/love') {
      const ts   = Date.now();
      const body = `* ${me} sent love 💕`;
      appendMessage($activeContact.pin, {
        id: safeUUID(), from_pin: $account!.pin,
        body, ts, status: 'sent', is_me: true, kind: 'system',
      });
      relaySend($activeContact.pin, { from: $account!.pin, kind: 'system', text: body, ts, effect: 'love' }).catch(console.error);
      pendingTrigger.set('love');
      return true;
    }

    if (cmd === '/letsgo') {
      const ts   = Date.now();
      const body = `* ${me} says LET'S GO! 🚀`;
      appendMessage($activeContact.pin, {
        id: safeUUID(), from_pin: $account!.pin,
        body, ts, status: 'sent', is_me: true, kind: 'system',
      });
      relaySend($activeContact.pin, { from: $account!.pin, kind: 'system', text: body, ts, effect: 'letsgo' }).catch(console.error);
      pendingTrigger.set('letsgo');
      return true;
    }

    if (cmd === '/thunder') {
      const ts   = Date.now();
      const body = `* ${me} summoned thunder ⚡`;
      appendMessage($activeContact.pin, {
        id: safeUUID(), from_pin: $account!.pin,
        body, ts, status: 'sent', is_me: true, kind: 'system',
      });
      relaySend($activeContact.pin, { from: $account!.pin, kind: 'system', text: body, ts, effect: 'thunder' }).catch(console.error);
      pendingTrigger.set('thunder');
      shaking = true;
      setTimeout(() => { shaking = false; }, 500);
      return true;
    }

    return false;
  }

  // ── Send ──────────────────────────────────────────────────────────────────

  async function sendMsg() {
    const body = input.trim();
    if (!body || !threadKey) return;

    if ($activeContact) {
      if (body.startsWith('/') && handleCommand(body)) { input = ''; return; }
      const msgId = safeUUID();
      const ts = Date.now();
      const disappear_after = getDisappearAfter($activeContact.pin);
      const expires_at = disappear_after > 0 ? ts + disappear_after * 1000 : undefined;
      const replyRef = replyingTo ? {
        id: replyingTo.id,
        from_pin: replyingTo.from_pin,
        kind: replyingTo.kind,
        body: replyingTo.kind === 'audio' ? '[voice message]'
            : replyingTo.kind === 'image' && replyingTo.body.startsWith('data:') ? '[photo]'
            : replyingTo.body,
      } : undefined;
      appendMessage($activeContact.pin, {
        id: msgId, from_pin: $account!.pin,
        body, ts, status: 'sending', is_me: true,
        receipt_status: 'sent',
        ...(expires_at !== undefined ? { expires_at } : {}),
        ...(replyRef ? { reply_to: replyRef } : {}),
      });
      relaySend($activeContact.pin, {
        from: $account!.pin, text: body, ts, msgId,
        ...(disappear_after > 0 ? { disappear_after } : {}),
        ...(replyRef ? { reply_to: replyRef } : {}),
      }).catch(err => {
        console.error('[relay] send failed:', err);
        setMessageFailed($activeContact!.pin, msgId);
      });
      replyingTo = null;
    } else if ($activeBroadcast) {
      sendBroadcast().catch(console.error);
      return;
    } else if ($activeGroup) {
      const ts = Date.now();
      const mentionedPins = $activeGroup.member_pins.filter(p => {
        const c = $contacts.find(x => x.pin === p);
        return c && body.includes(`@${c.display_name}`);
      });
      appendMessage($activeGroup.id, {
        id: safeUUID(), from_pin: $account!.pin,
        body, ts, status: 'sending', is_me: true,
      });
      relayGroupSend($activeGroup, {
        from: $account!.pin, text: body, ts,
        ...(mentionedPins.length ? { mention_pins: mentionedPins } : {}),
      }).catch(console.error);
    }
    mentionOpen = false;
    input = '';
  }

  // Reply state
  let replyingTo: Message | null = null;

  function handleReply(e: CustomEvent<Message>) {
    replyingTo = e.detail;
    inputEl?.focus();
  }

  function cancelReply() { replyingTo = null; }

  function insertMention(name: string): void {
    input = input.replace(/@\w*$/, `@${name} `);
    mentionOpen = false;
    inputEl?.focus();
  }

  $: isFlockAdmin = !!$activeGroup && $account?.pin === $activeGroup.admin_pin;

  async function kickMember(pin: string): Promise<void> {
    if (!$activeGroup || !isFlockAdmin) return;
    await relayGroupKick($activeGroup, pin).catch(console.error);
  }

  async function toggleRestrict(): Promise<void> {
    if (!$activeGroup || !isFlockAdmin) return;
    await relayGroupSetRestrict($activeGroup, !$activeGroup.restrict_posting).catch(console.error);
  }

  function deleteGroup(): void {
    if (!$activeGroup || !isFlockAdmin) return;
    const id = $activeGroup.id;
    adminOpen = false;
    activeGroupId.set(null);
    groups.deleteGroup(id);
  }

  async function handlePin(msgId: string, unpin = false): Promise<void> {
    const active = !unpin;
    const key = threadKey;
    if (!key) return;
    setPinned(key, active ? msgId : null);
    pinDismissed = false;
    try {
      if ($activeContact) {
        await relaySend($activeContact.pin, { type: 'pin', from: $account!.pin, pin_msg_id: msgId, pin_active: active, ts: Date.now() });
      } else if ($activeGroup) {
        await relayGroupSend($activeGroup, { type: 'pin', from: $account!.pin, pin_msg_id: msgId, pin_active: active, ts: Date.now() } as any);
      }
    } catch { /* local state already updated */ }
  }

  function handleDeleteMe(e: CustomEvent<Message>) {
    const threadPin = $activeContact?.pin ?? $activeGroup?.id;
    if (!threadPin) return;
    deleteMessage(threadPin, e.detail.id);
  }

  function handleDeleteEveryone(e: CustomEvent<Message>) {
    const threadPin = $activeContact?.pin ?? $activeGroup?.id;
    if (!threadPin || !$account) return;
    deleteMessage(threadPin, e.detail.id);
    relaySend($activeContact?.pin ?? $activeGroup?.id ?? '', {
      from: $account.pin,
      type: 'delete',
      delete_msg_id: e.detail.id,
      ts: Date.now(),
    }).catch(console.error);
  }

  function sendVoice(e: CustomEvent<{ dataUrl: string; duration: number }>) {
    if (!$activeContact || !$account) return;
    const { dataUrl, duration } = e.detail;
    const ts  = Date.now();
    const pin = $activeContact.pin;
    appendMessage(pin, {
      id: safeUUID(), from_pin: $account.pin,
      body: dataUrl, ts, status: 'sending', is_me: true,
      kind: 'audio', duration,
    });
    relaySend(pin, {
      from: $account.pin, kind: 'audio', body: dataUrl, duration, ts,
    }).catch(console.error);
  }

  function handleKey(e: KeyboardEvent) {
    if (mentionOpen && mentionSuggestions.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); mentionIndex = Math.min(mentionIndex + 1, mentionSuggestions.length - 1); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); mentionIndex = Math.max(mentionIndex - 1, 0); return; }
      if (e.key === 'Tab') { e.preventDefault(); insertMention(mentionSuggestions[mentionIndex].display_name); return; }
      if (e.key === 'Escape') { e.preventDefault(); mentionOpen = false; return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); }
    if (e.key === 'Escape') { emojiOpen = false; }
    if (e.key === 'Tab' && showCmdHint && hintCmds.length === 1) {
      e.preventDefault();
      applyHint(hintCmds[0].cmd, !!hintCmds[0].args);
    }
  }

  function handleEmoji(e: CustomEvent<string>) {
    input += e.detail;
    emojiOpen = false;
  }

  function handleGif(e: CustomEvent<{ url: string; title: string; isSticker?: boolean }>) {
    if (!$activeContact) return;
    const ts      = Date.now();
    const pin     = $activeContact.pin;
    const kind    = e.detail.isSticker ? 'sticker' : 'image';
    const filename = e.detail.title || (e.detail.isSticker ? 'Sticker' : 'GIF');
    appendMessage(pin, {
      id:       safeUUID(),
      from_pin: $account!.pin,
      body:     e.detail.url,
      ts,
      status:   'sending',
      is_me:    true,
      kind,
      original: e.detail.url,
      filename,
    });
    relaySend(pin, { from: $account!.pin, kind, body: e.detail.url, filename, ts }).catch(console.error);
    gifOpen = false;
  }

  function sendPeck() {
    if (!$activeContact) return;
    const ts      = Date.now();
    const rawMe   = $settings.displayName || $account?.display_name || 'You';
    const me      = /\[c=\d+\]/i.test(rawMe) ? `${rawMe}[c=0]` : rawMe;
    const rawTgt  = $activeContact.display_name;
    const tgt     = /\[c=\d+\]/i.test(rawTgt) ? `${rawTgt}[c=0]` : rawTgt;
    const body    = `You pecked ${tgt} 🐦`;
    appendMessage($activeContact.pin, {
      id: safeUUID(), from_pin: $account!.pin,
      body, ts, status: 'sent', is_me: true, kind: 'system',
    });
    shaking = true;
    setTimeout(() => shaking = false, 600);
    playSound('peck');
    pendingTrigger.set('peck');
    relaySend($activeContact.pin, {
      from: $account!.pin, kind: 'system',
      text: `${me} pecked you 🐦`,
      ts, effect: 'peck',
    }).catch(console.error);
  }


  function archiveChat() {
    if (!$activeContact) return;
    contacts.archiveContact($activeContact.pin);
    activePin.set(null);
    moreMenuOpen = false;
  }

  function deleteChat() {
    if (!$activeContact) return;
    clearThread($activeContact.pin);
    moreMenuOpen = false;
  }

  async function sendBroadcast(): Promise<void> {
    const bc   = $activeBroadcast;
    const acct = $account;
    if (!bc || !acct || !input.trim()) return;
    const text = input.trim();
    input = '';
    const ts = Date.now();
    await Promise.allSettled(
      bc.recipient_pins.map(pin =>
        relaySend(pin, {
          from:         acct.pin,
          kind:         'text',
          body:         text,
          ts,
          ...(bc.mode === 'channel' ? { is_broadcast: true } : {}),
        }),
      ),
    );
  }
</script>

<section class="panel" class:shake={shaking}>
  {#if $activeBroadcast && !$activeContact && !$activeGroup}
    <div class="broadcast-view">
      <header class="chat-header">
        <button class="back-btn" on:click={() => activeBroadcastId.set(null)} aria-label="Back">
          <svg viewBox="0 0 18 18" fill="none" width="18" height="18" aria-hidden="true">
            <path d="M11 4 L6 9 L11 14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <div class="bc-header-icon" aria-hidden="true">
          <svg viewBox="0 0 16 16" fill="none" width="15" height="15">
            <path d="M2 6h2.5l5-4v12l-5-4H2V6z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
            <path d="M12.5 5.5c1.3.8 1.3 4.2 0 5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
          </svg>
        </div>
        <div class="hinfo">
          <span class="hname">{$activeBroadcast.name}</span>
          <span class="hsub">{$activeBroadcast.recipient_pins.length} recipient{$activeBroadcast.recipient_pins.length !== 1 ? 's' : ''} - {$activeBroadcast.mode} mode</span>
        </div>
        <div class="hactions">
          <button class="hbtn danger-btn" on:click={() => { const bc = $activeBroadcast; if (bc) deleteBroadcast(bc.id); }} title="Delete broadcast" aria-label="Delete broadcast">
            <svg viewBox="0 0 14 14" width="15" height="15" fill="none" aria-hidden="true">
              <path d="M2 4h10M5 4V2h4v2M6 7v4M8 7v4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
              <rect x="3" y="4" width="8" height="9" rx="1" stroke="currentColor" stroke-width="1.4"/>
            </svg>
          </button>
        </div>
      </header>
      <div class="broadcast-body">
        <div class="bc-info-card">
          <svg viewBox="0 0 24 24" fill="none" width="36" height="36" aria-hidden="true" style="opacity:.25">
            <path d="M3 8h3.5l7-5.5v17L6.5 14H3V8z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
            <path d="M18 7c2 1.2 2 7.8 0 9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
          </svg>
          {#if $activeBroadcast.mode === 'channel'}
            <p>Channel broadcast: your message arrives as a read-only broadcast in each recipient's Nest.</p>
          {:else}
            <p>Private broadcast: your message arrives as a regular direct message. Recipients can reply in their Nest.</p>
          {/if}
          <ul class="bc-recipients">
            {#each $activeBroadcast.recipient_pins as rpin}
              {@const rc = $contacts.find(x => x.pin === rpin)}
              <li>{rc?.display_name ?? rpin.slice(-4)}</li>
            {/each}
          </ul>
        </div>
      </div>
      <div class="bc-compose">
        <textarea
          class="bc-input"
          placeholder="Message all {$activeBroadcast.recipient_pins.length} recipients..."
          bind:value={input}
          on:keydown={handleKey}
          rows="1"
          aria-label="Broadcast message"
        ></textarea>
        <button class="send-btn" on:click={sendMsg} disabled={!input.trim()} aria-label="Send broadcast">
          <svg viewBox="0 0 16 16" fill="none" width="14" height="14" aria-hidden="true">
            <path d="M14 8 L2 2 L5 8 L2 14 Z" fill="currentColor"/>
          </svg>
          Send
        </button>
      </div>
    </div>
  {:else if !$activeContact && !$activeGroup}
    <div class="empty-state">
      <BirdIcon size={42} color="var(--text-faint)" />
      <p class="empty-title">{$_('chat.empty_title')}</p>
      <p class="empty-sub">{$_('chat.empty_sub')}</p>
    </div>
  {:else}
    <header class="chat-header">
      <button class="back-btn" on:click={() => { if (searchActive) { closeSearch(); } else { activePin.set(null); activeGroupId.set(null); showMobileContext.set(false); } }} aria-label={$_('chat.back_aria')}>
        <svg viewBox="0 0 18 18" fill="none" width="18" height="18" aria-hidden="true">
          <path d="M11 4 L6 9 L11 14" stroke="currentColor" stroke-width="1.8"
                stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>

      {#if searchActive}
        <div class="search-bar">
          <input
            bind:this={searchEl}
            bind:value={searchQuery}
            class="search-input"
            placeholder="Search messages..."
            aria-label="Search messages"
            on:keydown={e => { if (e.key === 'Escape') closeSearch(); else if (e.key === 'Enter') nextMatch(); }}
          />
          {#if matchIds.length}
            <span class="match-count">{matchIndex + 1}/{matchIds.length}</span>
            <button class="hbtn" on:click={prevMatch} aria-label="Previous match">
              <svg viewBox="0 0 12 12" width="11" height="11" fill="none"><path d="M8 2L4 6l4 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <button class="hbtn" on:click={nextMatch} aria-label="Next match">
              <svg viewBox="0 0 12 12" width="11" height="11" fill="none"><path d="M4 2l4 4-4 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          {:else if searchQuery.length > 1}
            <span class="match-count no-match">0 results</span>
          {/if}
        </div>
      {:else}
        {#if $activeContact}
          <button class="avatar-btn" on:click={() => showMobileContext.set(true)} aria-label="Contact info">
            <Avatar
              src={$activeContact.avatar_url}
              name={$activeContact.display_name}
              size={34}
              status={$activeContact.status}
            />
          </button>
        {:else if $activeGroup}
          <div class="group-hdr-avatar" aria-hidden="true">{$activeGroup.name[0].toUpperCase()}</div>
        {/if}
        <div class="hinfo">
          <span class="hname">
            {#if $activeContact}<ColoredName name={$activeContact.display_name} />{:else}{$activeGroup?.name ?? ''}{/if}
            {#if $activeContact?.is_bot}<span class="hdr-bot-chip" aria-label="Bot account">Bot</span>{/if}
            {#if contactColony}<span class="colony-pill" title="Routed via {contactColony}">{contactColony}</span>{/if}
          </span>
          <span class="hsub">
            {#if $activeContact}{$activeContact.personal_msg || $activeContact.status}
            {:else if $activeGroup}{$activeGroup.member_pins.length} members{/if}
          </span>
        </div>
      {/if}

      <div class="hactions">
        <!-- Hidden on desktop via CSS; always rendered when contact active -->
        {#if $activeGroup && isFlockAdmin && !searchActive}
          <button
            class="hbtn"
            class:active={adminOpen}
            on:click={() => adminOpen = !adminOpen}
            title="Flock admin"
            aria-label="Flock admin controls"
            aria-pressed={adminOpen}
          >
            <svg viewBox="0 0 16 16" fill="none" width="16" height="16" aria-hidden="true">
              <path d="M8 1l1.4 3.5 3.7.3-2.8 2.4.9 3.6L8 9l-3.2 1.8.9-3.6L2.9 4.8l3.7-.3z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" fill={adminOpen ? 'currentColor' : 'none'}/>
              <path d="M4 14h8M6 12l-1 2M10 12l1 2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
            </svg>
          </button>
        {/if}
        {#if searchActive}
          <button class="hbtn" on:click={closeSearch} aria-label="Close search">
            <svg viewBox="0 0 14 14" width="14" height="14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
          </button>
        {/if}
        {#if $activeContact && !searchActive}
          <button class="hbtn" title={$_('chat.voice_call')} aria-label={$_('chat.voice_call')}
            on:click={() => $activeContact && initiateCall($activeContact.pin)}>
            <svg viewBox="0 0 18 18" fill="none" width="16" height="16" aria-hidden="true">
              <path d="M3.5 3.5c0 0 1 1.5 1.5 3s-.5 2.5-.5 2.5 2 4 5 5c0 0 1-1 2.5-.5s3 1.5 3 1.5c0 0 .5-1 0-2.5s-2-2-2-2-1-1.5-1-3 1-2.5 1-2.5-1.5-1-3.5-1-6 1.5-6 1.5z"
                    stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        {/if}
        {#if $activeContact && !searchActive}
          <button class="hbtn" title={$_('chat.video_call')} aria-label={$_('chat.video_call')}
            on:click={() => $activeContact && initiateCall($activeContact.pin, true)}>
            <svg viewBox="0 0 18 18" fill="none" width="16" height="16" aria-hidden="true">
              <rect x="1.5" y="4.5" width="11" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
              <path d="M12.5 7.5 L16.5 5.5 L16.5 12.5 L12.5 10.5" stroke="currentColor" stroke-width="1.3"
                    stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        {/if}
        {#if $activeContact && !searchActive}
          <div class="more-wrap" on:mouseleave={() => moreMenuOpen = false}>
            <button class="hbtn" title="More options" aria-label="More options"
              on:click={() => moreMenuOpen = !moreMenuOpen}>
              <svg viewBox="0 0 18 18" fill="none" width="16" height="16" aria-hidden="true">
                <circle cx="9" cy="4" r="1.1" fill="currentColor"/>
                <circle cx="9" cy="9" r="1.1" fill="currentColor"/>
                <circle cx="9" cy="14" r="1.1" fill="currentColor"/>
              </svg>
            </button>
            {#if moreMenuOpen}
              <div class="more-menu" role="menu">
                <button class="more-item" role="menuitem" on:click={() => { starredOpen = !starredOpen; moreMenuOpen = false; }}>
                  <svg viewBox="0 0 16 16" fill="none" width="13" height="13" aria-hidden="true">
                    <path d="M8 1.5l1.9 3.8 4.2.6-3 3 .7 4.2L8 11l-3.8 2.1.7-4.2-3-3 4.2-.6z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
                  </svg>
                  Starred messages
                </button>
                <button class="more-item" role="menuitem" on:click={() => { openSearch(); moreMenuOpen = false; }}>
                  <svg viewBox="0 0 18 18" fill="none" width="13" height="13" aria-hidden="true">
                    <circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.4"/>
                    <path d="M12.5 12.5 L16 16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
                  </svg>
                  Search messages
                </button>
                <button class="more-item" role="menuitem" on:click={() => { showWallpaper = !showWallpaper; moreMenuOpen = false; }}>
                  <svg viewBox="0 0 16 16" fill="none" width="13" height="13" aria-hidden="true">
                    <rect x="1" y="1" width="14" height="14" rx="2" stroke="currentColor" stroke-width="1.3"/>
                    <circle cx="5.5" cy="5.5" r="1.5" fill="currentColor" opacity=".6"/>
                    <path d="M1 11l3.5-3.5 3 3 2.5-3.5L15 11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  Chat background
                </button>
                <div class="more-divider" role="separator"></div>
                {#if !$archivedPins.has($activeContact.pin)}
                  <button class="more-item" role="menuitem" on:click={archiveChat}>
                    <svg viewBox="0 0 16 16" fill="none" width="13" height="13" aria-hidden="true">
                      <rect x="1" y="4" width="14" height="10" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
                      <path d="M1 7h14" stroke="currentColor" stroke-width="1.3"/>
                      <path d="M5.5 1.5h5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                      <path d="M6 10.5l2 2 2-2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    Archive chat
                  </button>
                {:else}
                  <button class="more-item" role="menuitem"
                    on:click={() => { contacts.unarchiveContact($activeContact?.pin ?? ''); moreMenuOpen = false; }}>
                    <svg viewBox="0 0 16 16" fill="none" width="13" height="13" aria-hidden="true">
                      <rect x="1" y="4" width="14" height="10" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
                      <path d="M1 7h14" stroke="currentColor" stroke-width="1.3"/>
                      <path d="M5.5 1.5h5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                      <path d="M6 12.5l2-2 2 2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    Unarchive chat
                  </button>
                {/if}
                <button class="more-item danger" role="menuitem" on:click={deleteChat}>
                  <svg viewBox="0 0 16 16" fill="none" width="13" height="13" aria-hidden="true">
                    <path d="M2 4h12M6 4V2.5h4V4M13 4L12 13.5H4L3 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  Delete messages
                </button>
              </div>
            {/if}
          </div>
        {/if}
      </div>
    </header>

    {#if showWallpaper && threadKey}
      <WallpaperPicker threadId={threadKey} show={showWallpaper} on:close={() => showWallpaper = false} />
    {/if}

    {#if starredOpen}
      <div class="starred-panel" role="region" aria-label="Starred messages">
        <div class="starred-header">
          <span class="starred-title">Starred</span>
          {#if starredMessages.length > 0}
            <span class="starred-count">{starredMessages.length}</span>
          {/if}
          <button class="starred-close" on:click={() => starredOpen = false} aria-label="Close starred messages">
            <svg viewBox="0 0 12 12" fill="none" width="11" height="11"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
          </button>
        </div>
        {#if starredMessages.length === 0}
          <div class="starred-empty">
            <svg viewBox="0 0 24 24" fill="none" width="28" height="28" aria-hidden="true">
              <path d="M12 2l2.9 5.8 6.4.9-4.6 4.5 1.1 6.4L12 16.8l-5.8 3.1 1.1-6.4L2.7 9l6.4-.9z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
            </svg>
            <p>No starred messages yet</p>
            <p class="starred-empty-sub">Hover a message and click the star to save it here.</p>
          </div>
        {:else}
          <div class="starred-list">
            {#each [...starredMessages].reverse() as smsg (smsg.id)}
              <div class="starred-item">
                <div class="starred-item-meta">
                  <span class="starred-item-who">{smsg.is_me ? 'You' : ($activeContact?.display_name ?? '')}</span>
                  <span class="starred-item-time">{new Date(smsg.ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                  <button
                    class="starred-item-unstar"
                    on:click={() => $activeContact && toggleStar($activeContact.pin, smsg.id)}
                    title="Unstar"
                    aria-label="Unstar message"
                  >
                    <svg viewBox="0 0 14 14" fill="none" width="11" height="11"><path d="M7 1l1.7 3.4 3.7.5-2.7 2.6.6 3.7L7 9.7 3.7 11.3l.6-3.7L1.6 5l3.7-.5z" fill="currentColor" stroke="currentColor" stroke-width=".8" stroke-linejoin="round"/></svg>
                  </button>
                </div>
                <p class="starred-item-body">{smsg.body}</p>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    {#if adminOpen && $activeGroup && isFlockAdmin}
      <div class="admin-panel" role="region" aria-label="Flock admin controls">
        <div class="admin-header">
          <span class="admin-title">Admin</span>
          <button class="admin-close" on:click={() => adminOpen = false} aria-label="Close admin panel">
            <svg viewBox="0 0 12 12" fill="none" width="11" height="11"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
          </button>
        </div>

        <div class="admin-section">
          <div class="admin-row">
            <div class="admin-row-info">
              <span class="admin-row-label">Restrict posting</span>
              <span class="admin-row-sub">Only you can send messages</span>
            </div>
            <button
              class="toggle-btn"
              class:on={$activeGroup.restrict_posting}
              on:click={toggleRestrict}
              role="switch"
              aria-checked={!!$activeGroup.restrict_posting}
              aria-label="Restrict posting"
            >
              <span class="toggle-thumb"></span>
            </button>
          </div>
        </div>

        <div class="admin-section">
          <div class="admin-section-label">Members</div>
          {#each $activeGroup.member_pins as mpin}
            {@const mc = $contacts.find(x => x.pin === mpin)}
            {@const isSelf = mpin === $account?.pin}
            {@const memberName = isSelf
              ? ($settings.displayName || $account?.display_name || mpin.slice(-4))
              : (mc?.display_name ?? mpin.slice(-4))}
            {@const memberAvatar = isSelf ? ($settings.avatarDataUrl || null) : (mc?.avatar_url ?? null)}
            <div class="admin-member">
              <Avatar name={memberName} src={memberAvatar} size={28} />
              <div class="admin-member-info">
                <span class="admin-member-name"><ColoredName name={memberName} /></span>
                {#if mpin === $activeGroup.admin_pin}
                  <span class="admin-badge">Admin</span>
                {/if}
              </div>
              {#if !isSelf}
                <button
                  class="kick-btn"
                  on:click={() => kickMember(mpin)}
                  title="Remove {memberName} from flock"
                  aria-label="Remove member"
                >
                  <svg viewBox="0 0 14 14" fill="none" width="13" height="13" aria-hidden="true">
                    <path d="M2 12l10-10M12 12L2 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                  </svg>
                </button>
              {/if}
            </div>
          {/each}
        </div>

        <div class="admin-section">
          <button class="admin-danger-btn" on:click={deleteGroup}>
            <svg viewBox="0 0 16 16" fill="none" width="13" height="13" aria-hidden="true">
              <path d="M2 4h12M6 4V2.5h4V4M13 4L12 13.5H4L3 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Delete flock
          </button>
        </div>
      </div>
    {/if}

    {#if $relayStatus === 'disconnected' || $relayStatus === 'error'}
      <div class="relay-banner" role="alert">
        <svg viewBox="0 0 14 14" fill="none" width="12" height="12" aria-hidden="true">
          <circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.3"/>
          <path d="M7 4v3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
          <circle cx="7" cy="10" r=".7" fill="currentColor"/>
        </svg>
        Not connected - messages may not send
      </div>
    {/if}

    {#if pinnedMsg && !pinDismissed}
      <div class="pin-banner" role="note" aria-label="Pinned message">
        <svg class="pin-icon" viewBox="0 0 14 14" fill="none" width="12" height="12" aria-hidden="true">
          <path d="M9 1l4 4-1.5 1.5-1-.5L7 9.5V12l-1 1-1.5-3-3-1.5L2.5 8l2.5-3.5-.5-1L6 2z" fill="currentColor"/>
        </svg>
        <span class="pin-text">{pinnedMsg.body.slice(0, 80)}{pinnedMsg.body.length > 80 ? '...' : ''}</span>
        <button class="pin-unpin" on:click={() => pinnedMsg && handlePin(pinnedMsg.id, true)} title="Unpin" aria-label="Unpin message">
          <svg viewBox="0 0 12 12" fill="none" width="10" height="10"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        </button>
        <button class="pin-dismiss" on:click={() => pinDismissed = true} title="Dismiss" aria-label="Dismiss pin banner">
          <svg viewBox="0 0 12 12" fill="none" width="9" height="9"><path d="M9 3L3 9M3 3l6 6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
        </button>
      </div>
    {/if}

    {#if effectToast}
      <div class="effect-toast" role="status" aria-live="polite">{effectToast}</div>
    {/if}

    <div class="messages" bind:this={listEl} on:scroll={onListScroll}
      style={$settings.chatBackgrounds[threadKey ?? ''] ? `background: ${$settings.chatBackgrounds[threadKey ?? '']}` : ''}>
      {#each enriched as msg (msg.id)}
        <div data-msgid={msg.id} class="msg-anchor" class:search-match={searchQuery.length > 1 && matchIds.includes(msg.id)}>
          <MessageBubble {msg} senderLabel={msg.senderLabel}
            highlight={searchActive && matchIds.includes(msg.id) ? searchQuery : ''}
            pinned={pinnedMsgId === msg.id}
            on:reply={handleReply}
            on:deleteme={handleDeleteMe}
            on:deleteeveryone={handleDeleteEveryone}
            on:pin={(e) => handlePin(e.detail)}
            on:open_view_once={(e) => threadKey && openViewOnce(threadKey, e.detail)}
          />
        </div>
      {/each}
      {#if thread.length === 0}
        <div class="no-msgs"><p>{$_('chat.no_messages')}</p></div>
      {/if}
      {#if lastReceived}
        <div class="status-bar">{$_('chat.last_received', { values: { time: lastReceived } })}</div>
      {/if}
    </div>

    <!-- Typing indicator -->
    {#if $settings.typingIndicator && $activeContact && $typingPins.has($activeContact.pin)}
      <div class="typing-bar">
        <span class="typing-name">{$_('chat.typing', { values: { name: $activeContact?.display_name ?? '' } })}</span>
        <span class="typing-dots" aria-hidden="true">
          <span></span><span></span><span></span>
        </span>
      </div>
    {/if}

    <!-- Hidden image file input -->
    <input
      bind:this={imgFileInput}
      type="file"
      accept="image/*,application/*,text/plain,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.zip,.rar,.7z,.tar,.gz"
      class="sr-only"
      on:change={handleImageFile}
      aria-hidden="true"
      tabindex="-1"
    />

    <div class="input-area" style="padding-bottom: {keyboardHeight}px">
      <!-- Image preview — floats above input area -->
      {#if imagePreview}
        <div class="img-preview">
          <img src={imagePreview.compressedUrl} alt={$_('chat.image_preview_alt')} class="img-thumb" />
          <div class="img-info">
            <span class="img-name">{imagePreview.filename}</span>
            <span class="img-sizes">{$_('chat.image_sizes', { values: { compressed: imagePreview.compressedKB, original: imagePreview.originalKB } })}</span>
          </div>
          <div class="img-actions">
            {#if $activeContact}
              <label class="view-once-toggle">
                <input type="checkbox" bind:checked={viewOnce} />
                <span>View once</span>
              </label>
            {/if}
            <button class="img-send" on:click={() => sendImage(false)}>{$_('chat.image_send')}</button>
            <button class="img-send-orig" on:click={() => sendImage(true)}>{$_('chat.image_send_original')}</button>
            <button class="img-cancel" on:click={() => { imagePreview = null; viewOnce = false; }} aria-label={$_('chat.image_cancel_aria')}>
              <svg viewBox="0 0 12 12" fill="none" width="11" height="11" aria-hidden="true">
                <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
        </div>
      {/if}

      <!-- Reply banner -->
      {#if replyingTo}
        <div class="reply-banner">
          <div class="reply-banner-content">
            <svg viewBox="0 0 14 14" width="12" height="12" fill="none" aria-hidden="true">
              <path d="M1 5h8a4 4 0 010 8H6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M4 2L1 5l3 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span class="reply-banner-name">{replyingTo.is_me ? 'You' : ($activeContact?.display_name ?? '')}</span>
            <span class="reply-banner-body">{replyingTo.kind === 'image' ? '📷 Photo' : replyingTo.kind === 'audio' ? '🎤 Voice message' : replyingTo.body.slice(0, 60)}</span>
          </div>
          <button class="reply-cancel" on:click={cancelReply} aria-label="Cancel reply">
            <svg viewBox="0 0 12 12" fill="none" width="11" height="11" aria-hidden="true">
              <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      {/if}

      <!-- Attach error banner -->
      {#if attachError}
        <div class="attach-error" role="alert">
          <svg viewBox="0 0 14 14" fill="none" width="12" height="12" aria-hidden="true">
            <circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.3"/>
            <path d="M7 4.5v3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            <circle cx="7" cy="9.5" r=".8" fill="currentColor"/>
          </svg>
          {attachError}
          <button class="attach-error-dismiss" on:click={() => attachError = ''} aria-label="Dismiss">
            <svg viewBox="0 0 10 10" fill="none" width="9" height="9"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          </button>
        </div>
      {/if}

      <!-- Commands panel -->
      {#if showCmds}
        <div class="cmds-panel" role="dialog" aria-label="Available commands">
          <div class="cmds-header">
            <span class="cmds-title">Commands</span>
            <button class="cmds-close" on:click={() => showCmds = false} aria-label="Close commands">
              <svg viewBox="0 0 12 12" fill="none" width="11" height="11"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
            </button>
          </div>
          {#each COMMANDS as c}
            <button class="cmds-item" on:click={() => { input = c.args ? c.cmd + ' ' : c.cmd; showCmds = false; inputEl?.focus(); }}>
              <span class="cmds-cmd">{c.cmd}</span>
              {#if c.args}<span class="cmds-args">{c.args}</span>{/if}
              <span class="cmds-desc">{c.desc}</span>
            </button>
          {/each}
        </div>
      {/if}

      <!-- Command hint — floats above input when typing / -->
      {#if showCmdHint && hintCmds.length > 0}
        <div class="cmd-hint" role="listbox" aria-label={$_('chat.commands_aria')}>
          {#each hintCmds as c}
            <button
              class="cmd-item"
              role="option"
              aria-selected="false"
              on:click={() => applyHint(c.cmd, !!c.args)}
            >
              <span class="cmd-name">{c.cmd}</span>
              {#if c.args}<span class="cmd-args">{c.args}</span>{/if}
              <span class="cmd-desc">{c.desc}</span>
            </button>
          {/each}
        </div>
      {/if}

      <!-- @mention autocomplete -->
      {#if mentionOpen && mentionSuggestions.length > 0}
        <div class="mention-popup" role="listbox" aria-label="Mention suggestions">
          {#each mentionSuggestions as member, i}
            <button
              class="mention-item"
              class:active={i === mentionIndex}
              role="option"
              aria-selected={i === mentionIndex}
              on:click={() => insertMention(member.display_name)}
              on:mouseenter={() => mentionIndex = i}
            >
              <span class="mention-avatar">{member.display_name.charAt(0).toUpperCase()}</span>
              <span class="mention-name">{member.display_name}</span>
              <span class="mention-pin-tag">{member.pin.slice(-4)}</span>
            </button>
          {/each}
        </div>
      {/if}

      <!-- Formatting toolbar -->
      <div class="fmt-toolbar">
        <div class="fmt-scroll">
          <button class="fmt-btn" on:click={() => wrapText('**')}         title={$_('chat.bold')}          aria-label={$_('chat.bold')}><b>B</b></button>
          <button class="fmt-btn" on:click={() => wrapText('*')}          title={$_('chat.italic')}        aria-label={$_('chat.italic')}><em>I</em></button>
          <button class="fmt-btn mono" on:click={() => wrapText('`')}     title={$_('chat.code')}          aria-label={$_('chat.code')}>`</button>
          <button class="fmt-btn" on:click={() => wrapText('~~')}         title={$_('chat.strikethrough')} aria-label={$_('chat.strikethrough')}><s>S</s></button>
          <button class="fmt-btn cmds-toggle" class:active={showCmds} on:click={() => showCmds = !showCmds} title="Commands" aria-label="Show commands" aria-expanded={showCmds}>/</button>
        </div>
        <div class="fmt-actions">
          {#if gifEnabled}
          <div class="gif-wrap">
            <button
              class="fmt-btn gif-btn"
              class:active={gifOpen}
              on:click={toggleGif}
              title="GIF"
              aria-label={$_('chat.gif_aria')}
            >GIF</button>
            <GifPicker open={gifOpen} anchorEl={gifAnchorEl} on:pick={handleGif} />
          </div>
          {/if}
          <button class="fmt-btn attach" on:click={() => imgFileInput.click()} title={$_('chat.attach_aria')} aria-label={$_('chat.attach_aria')}>
            <svg viewBox="0 0 16 16" fill="none" width="14" height="14" aria-hidden="true">
              <path d="M13.5 8.5 L8 14 Q5.5 16.5 3 14 Q0.5 11.5 3 9 L9.5 2.5 Q11 1 12.5 2.5 Q14 4 12.5 5.5 L6.5 11.5 Q5.5 12.5 4.5 11.5 Q3.5 10.5 4.5 9.5 L9.5 4.5"
                    stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <button class="fmt-btn" on:click={() => { showPollBuilder = !showPollBuilder; }} title="Poll" aria-label="Create poll">
            <svg viewBox="0 0 16 16" fill="none" width="14" height="14" aria-hidden="true">
              <rect x="1" y="9" width="3" height="6" rx="1" fill="currentColor" opacity=".5"/>
              <rect x="6" y="5" width="3" height="10" rx="1" fill="currentColor" opacity=".75"/>
              <rect x="11" y="1" width="3" height="14" rx="1" fill="currentColor"/>
            </svg>
          </button>
          {#if $activeContact}
            <button class="fmt-btn" on:click={sendPeck} title={$_('chat.peck_aria')} aria-label={$_('chat.peck_aria')}>
              <svg viewBox="0 0 18 18" fill="none" width="15" height="15" aria-hidden="true">
                <rect x="5" y="2" width="8" height="14" rx="1.8" stroke="currentColor" stroke-width="1.3"/>
                <path d="M1.5 6 Q-0.5 9 1.5 12" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
                <path d="M16.5 6 Q18.5 9 16.5 12" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
              </svg>
            </button>
          {/if}
        </div>
      </div>

      <!-- Compose row -->
      {#if $activeGroup?.restrict_posting && !isFlockAdmin}
        <div class="restricted-notice" role="note">
          <svg viewBox="0 0 14 14" fill="none" width="13" height="13" aria-hidden="true">
            <circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.3"/>
            <path d="M7 5v3M7 9.5v.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
          </svg>
          Only the flock admin can post
        </div>
      {:else}
      <div class="compose-row">
        <div class="emoji-wrap" use:clickOutside={() => (emojiOpen = false)}>
          <button
            class="tool-btn"
            class:active={emojiOpen}
            on:click={() => { emojiOpen = !emojiOpen; gifOpen = false; }}
            title="Emoji"
            aria-label={$_('chat.emoji_aria')}
            aria-expanded={emojiOpen}
          >
            <svg viewBox="0 0 20 20" fill="none" width="18" height="18" aria-hidden="true">
              <circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="1.4"/>
              <circle cx="7.5" cy="8.5" r="1" fill="currentColor"/>
              <circle cx="12.5" cy="8.5" r="1" fill="currentColor"/>
              <path d="M7 12.5 Q10 15 13 12.5" stroke="currentColor" stroke-width="1.4"
                    stroke-linecap="round" fill="none"/>
            </svg>
          </button>
          <EmojiPicker {emojiOpen} on:pick={handleEmoji} />
        </div>

        <textarea
          class="msg-input"
          bind:value={input}
          bind:this={inputEl}
          on:keydown={handleKey}
          on:input={handleInput}
          placeholder={$_('chat.input_placeholder_dm')}
          rows="1"
          aria-label={$_('chat.input_aria')}
          autocorrect="off"
          autocapitalize="sentences"
          autocomplete="off"
          spellcheck="true"
        ></textarea>

        {#if $activeContact && !$activeGroup}
          <VoiceRecorder on:send={sendVoice} />
        {/if}

        <PollBuilder
          bind:show={showPollBuilder}
          on:send={e => { sendPoll(e.detail); showPollBuilder = false; }}
          on:close={() => showPollBuilder = false}
        />

        <button class="send-btn" on:click={sendMsg} disabled={!input.trim()} aria-label={$_('chat.send_aria')}>
          <svg viewBox="0 0 16 16" fill="none" width="14" height="14" aria-hidden="true">
            <path d="M14 8 L2 2 L5 8 L2 14 Z" fill="currentColor"/>
          </svg>
          {$_('chat.send')}
        </button>
      </div>
      {/if}
    </div>
  {/if}
</section>

<style>
.panel {
  flex: 1;
  position: relative;
  display: flex; flex-direction: column;
  height: 100%; overflow: hidden;
  background: var(--bg);
  min-width: 0;
}

/* ── Broadcast view ── */
.broadcast-view {
  flex: 1; display: flex; flex-direction: column; overflow: hidden;
}
.bc-header-icon {
  width: 34px; height: 34px; border-radius: 50%;
  background: oklch(0.55 0.18 320);
  color: #fff;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.broadcast-body {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  padding: 2rem;
}
.bc-info-card {
  display: flex; flex-direction: column; align-items: center;
  gap: .75rem; text-align: center; max-width: 320px;
}
.bc-info-card p {
  font-size: 13px; color: var(--text-muted); line-height: 1.6; margin: 0;
}
.bc-recipients {
  display: flex; flex-wrap: wrap; gap: .4rem;
  justify-content: center;
  list-style: none; padding: 0; margin: 0;
}
.bc-recipients li {
  font-size: 11.5px; font-weight: 600;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 99px;
  padding: .2rem .6rem;
  color: var(--text-muted);
}
.bc-compose {
  display: flex; align-items: center; gap: .5rem;
  padding: .6rem .85rem;
  border-top: 1px solid var(--border);
  background: var(--surface);
}
.bc-input {
  flex: 1;
  padding: .5rem .75rem;
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  font-size: 13.5px;
  font-family: var(--font-msg);
  resize: none;
  transition: border-color .12s;
}
.bc-input:focus { outline: none; border-color: var(--accent); background: var(--surface); }
.danger-btn { color: oklch(0.6 0.2 25) !important; }
.danger-btn:hover { background: oklch(0.6 0.2 25 / 0.10) !important; }

.empty-state {
  flex: 1;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: .75rem; color: var(--text-faint);
}
.empty-title { font-size: 14px; font-weight: 600; color: var(--text-muted); letter-spacing: -0.02em; }
.empty-sub   { font-size: 12px; color: var(--text-faint); text-align: center; max-width: 220px; line-height: 1.55; }

.chat-header {
  display: flex; align-items: center; gap: .7rem;
  padding: .65rem 1rem;
  padding-top: calc(.65rem + var(--safe-top));
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.avatar-btn {
  background: none; border: none; padding: 0; cursor: pointer;
  border-radius: 50%; display: flex; align-items: center;
  flex-shrink: 0;
}
.avatar-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.more-divider { height: 1px; background: var(--border); margin: 3px 0; }
.group-hdr-avatar {
  width: 34px; height: 34px; border-radius: 50%;
  background: var(--accent);
  color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: 700;
  flex-shrink: 0;
}
.hinfo { flex: 1; min-width: 0; }
.hname {
  display: flex; align-items: center; gap: .45rem;
  font-size: 14px; font-weight: 700;
  letter-spacing: -0.02em; line-height: 1.3;
  overflow: hidden;
}
.colony-pill {
  font-size: 9.5px; font-weight: 600; letter-spacing: .03em;
  padding: .1rem .42rem;
  border-radius: 99px;
  background: oklch(from var(--accent) l c h / 0.12);
  color: var(--accent);
  flex-shrink: 0;
  max-width: 100px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  cursor: default;
}
.hdr-bot-chip {
  font-size: 9px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase;
  padding: .1rem .42rem;
  border-radius: 99px;
  background: oklch(0.55 0.15 280 / 0.12);
  color: oklch(0.55 0.15 280);
  flex-shrink: 0;
  cursor: default;
}
.hsub {
  display: block; font-size: 11px; color: var(--text-muted);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 1px;
}
.hactions { display: flex; gap: .2rem; align-items: center; }
.hbtn {
  display: flex; align-items: center; justify-content: center;
  padding: .35rem; border-radius: var(--radius);
  color: var(--text-muted); transition: color .12s, background .12s;
}
.hbtn:hover { color: var(--text); background: var(--surface-2); }
.hbtn.active { color: oklch(0.78 0.18 75); background: oklch(0.78 0.18 75 / 0.12); }

.more-wrap { position: relative; }
.more-menu {
  position: absolute; top: calc(100% + 4px); right: 0;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: 0 4px 16px oklch(0 0 0 / 0.12);
  min-width: 160px;
  z-index: 50;
  overflow: hidden;
  animation: menu-in .12s ease-out;
}
@keyframes menu-in {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}
.more-item {
  display: flex; align-items: center; gap: .55rem;
  width: 100%; text-align: left;
  padding: .6rem .85rem;
  font-size: 12.5px; font-weight: 500;
  color: var(--text-2);
  transition: background .1s, color .1s;
}
.more-item:hover { background: var(--surface-2); }
.more-item.danger { color: oklch(0.60 0.20 25); }
.more-item.danger:hover { background: oklch(0.60 0.20 25 / 0.07); }

/* ── Starred panel ── */
.starred-panel {
  position: absolute;
  top: 0; right: 0; bottom: 0;
  width: min(320px, 100%);
  background: var(--surface);
  border-left: 1px solid var(--border);
  display: flex; flex-direction: column;
  z-index: 30;
  animation: starred-slide-in .18s cubic-bezier(.25, 1, .5, 1);
}
@keyframes starred-slide-in {
  from { transform: translateX(100%); opacity: 0; }
  to   { transform: translateX(0);    opacity: 1; }
}
@media (prefers-reduced-motion: reduce) { .starred-panel { animation: none; } }

/* Admin panel */
.admin-panel {
  position: absolute;
  top: 0; right: 0; bottom: 0;
  width: min(280px, 100%);
  background: var(--surface);
  border-left: 1px solid var(--border);
  display: flex; flex-direction: column;
  z-index: 30;
  overflow-y: auto;
  animation: starred-slide-in .18s cubic-bezier(.25, 1, .5, 1);
}
.admin-header {
  display: flex; align-items: center;
  padding: .75rem 1rem;
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
}
.admin-title {
  font-size: 13px; font-weight: 700;
  color: var(--text); letter-spacing: -0.01em;
}
.admin-close {
  margin-left: auto; padding: .25rem; border-radius: 4px;
  color: var(--text-faint); transition: color .1s;
}
.admin-close:hover { color: var(--text); }
.admin-section {
  padding: .6rem 0;
  border-bottom: 1px solid var(--border-subtle);
}
.admin-section:last-child { border-bottom: none; }
.admin-section-label {
  font-size: 10.5px; font-weight: 700;
  color: var(--text-faint); letter-spacing: .05em; text-transform: uppercase;
  padding: 0 1rem .35rem;
}
.admin-row {
  display: flex; align-items: center; gap: .75rem;
  padding: .5rem 1rem;
}
.admin-row-info { flex: 1; min-width: 0; }
.admin-row-label {
  display: block; font-size: 13px; font-weight: 600; color: var(--text);
}
.admin-row-sub {
  display: block; font-size: 11px; color: var(--text-faint); line-height: 1.4;
}
.toggle-btn {
  width: 36px; height: 20px; border-radius: 99px;
  background: var(--border); border: none;
  position: relative; cursor: pointer; flex-shrink: 0;
  transition: background .15s;
}
.toggle-btn.on { background: var(--accent); }
.toggle-thumb {
  position: absolute; top: 2px; left: 2px;
  width: 16px; height: 16px; border-radius: 50%;
  background: #fff;
  transition: transform .15s;
  box-shadow: 0 1px 3px oklch(0 0 0 / 0.2);
}
.toggle-btn.on .toggle-thumb { transform: translateX(16px); }
.admin-member {
  display: flex; align-items: center; gap: .5rem;
  padding: .45rem 1rem;
}
.admin-member-avatar {
  width: 26px; height: 26px; border-radius: 50%;
  background: var(--accent); color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 700; flex-shrink: 0;
}
.admin-member-info {
  flex: 1; min-width: 0;
  display: flex; align-items: center; gap: .4rem;
}
.admin-member-name {
  font-size: 12.5px; font-weight: 500; color: var(--text);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.admin-badge {
  font-size: 10px; font-weight: 700;
  color: var(--accent);
  background: oklch(from var(--accent) l c h / 0.12);
  border-radius: 99px; padding: .1rem .4rem;
  flex-shrink: 0;
}
.kick-btn {
  padding: .25rem; border-radius: 4px;
  color: var(--text-faint);
  transition: color .1s, background .1s; flex-shrink: 0;
}
.kick-btn:hover { color: oklch(0.58 0.2 25); background: oklch(0.58 0.2 25 / 0.08); }

.admin-danger-btn {
  display: flex; align-items: center; gap: .5rem;
  width: 100%; padding: .45rem .55rem;
  border-radius: var(--radius);
  font-size: 12.5px; font-weight: 500;
  color: oklch(0.58 0.2 25);
  transition: background .1s;
}
.admin-danger-btn:hover { background: oklch(0.58 0.2 25 / 0.08); }
.restricted-notice {
  display: flex; align-items: center; gap: .5rem;
  padding: .75rem 1rem;
  background: var(--surface-2);
  border-top: 1px solid var(--border-subtle);
  font-size: 12.5px; color: var(--text-muted);
  font-weight: 500;
  flex-shrink: 0;
}
.starred-header {
  display: flex; align-items: center; gap: .5rem;
  padding: .75rem 1rem;
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
}
.starred-title { font-size: 13px; font-weight: 700; color: var(--text); letter-spacing: -0.01em; }
.starred-count {
  font-size: 11px; font-weight: 700;
  background: oklch(0.78 0.18 75 / 0.15);
  color: oklch(0.62 0.18 75);
  border-radius: 99px;
  padding: .1rem .45rem;
}
.starred-close {
  margin-left: auto;
  padding: .25rem; border-radius: 4px;
  color: var(--text-faint); transition: color .1s;
}
.starred-close:hover { color: var(--text); }
.starred-empty {
  flex: 1;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: .5rem; padding: 2rem;
  color: var(--text-faint); text-align: center; opacity: .75;
}
.starred-empty p { font-size: 13px; font-weight: 500; margin: 0; }
.starred-empty-sub { font-size: 12px; opacity: .8; }
.starred-list {
  flex: 1; overflow-y: auto;
  display: flex; flex-direction: column;
  padding: .5rem; gap: .35rem;
}
.starred-item {
  padding: .6rem .75rem;
  background: var(--surface-2);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  display: flex; flex-direction: column; gap: .3rem;
}
.starred-item-meta { display: flex; align-items: center; gap: .45rem; }
.starred-item-who { font-size: 11.5px; font-weight: 700; color: var(--accent); }
.starred-item-time { font-size: 11px; color: var(--text-faint); }
.starred-item-unstar {
  margin-left: auto;
  color: oklch(0.78 0.18 75);
  padding: .15rem; transition: opacity .1s;
}
.starred-item-unstar:hover { opacity: .65; }
.starred-item-body {
  font-size: 13px; color: var(--text);
  line-height: 1.5; white-space: pre-wrap; word-break: break-word; margin: 0;
}

.search-bar {
  flex: 1; display: flex; align-items: center; gap: .3rem;
  min-width: 0;
}
.search-input {
  flex: 1; min-width: 0;
  background: var(--surface-2);
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  padding: .38rem .65rem;
  font-size: 13px; color: var(--text);
  transition: border-color .15s;
}
.search-input:focus { outline: none; border-color: var(--accent); }
.search-input::placeholder { color: var(--text-faint); }
.match-count {
  font-size: 11px; color: var(--text-muted);
  white-space: nowrap; flex-shrink: 0;
}
.match-count.no-match { color: oklch(0.58 0.18 25); }

.msg-anchor { display: contents; }
.msg-anchor.search-match > :global(*) { background: oklch(from var(--accent) l c h / 0.06); }

.messages {
  flex: 1; overflow-y: auto;
  padding: .75rem 0 .25rem;
  display: flex; flex-direction: column; gap: .05rem;
}
.no-msgs {
  flex: 1; display: flex; align-items: center; justify-content: center;
  font-size: 12px; color: var(--text-faint);
}
.status-bar {
  font-size: 10.5px; color: var(--text-faint);
  font-style: italic; text-align: center;
  padding: .5rem 1rem .85rem;
}

.effect-toast {
  position: absolute; top: 3.2rem; left: 50%;
  transform: translateX(-50%);
  background: var(--surface);
  border: 1px solid var(--border);
  box-shadow: 0 2px 12px oklch(0 0 0 / 0.10);
  border-radius: var(--radius);
  padding: .38rem .85rem;
  font-size: 12px; font-weight: 500;
  color: var(--text-2);
  white-space: nowrap;
  z-index: 10;
  pointer-events: none;
  animation: effect-toast-in .18s ease-out;
}
@keyframes effect-toast-in {
  from { opacity: 0; transform: translateX(-50%) translateY(-4px); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0); }
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  15%       { transform: translateX(-5px); }
  30%       { transform: translateX(5px); }
  45%       { transform: translateX(-4px); }
  60%       { transform: translateX(4px); }
  75%       { transform: translateX(-2px); }
  90%       { transform: translateX(2px); }
}
.shake { animation: shake 0.5s ease; }

/* ── Typing indicator ── */
.typing-bar {
  display: flex; align-items: center; gap: .45rem;
  padding: .3rem .85rem .2rem;
  background: var(--bg);
  flex-shrink: 0;
}
.typing-name {
  font-size: 11px;
  color: var(--text-muted);
  font-style: italic;
}
.typing-dots {
  display: flex; align-items: center; gap: 3px;
}
.typing-dots span {
  width: 4px; height: 4px;
  border-radius: 50%;
  background: var(--text-faint);
  animation: typing-pulse 1.2s ease-in-out infinite;
}
.typing-dots span:nth-child(2) { animation-delay: .2s; }
.typing-dots span:nth-child(3) { animation-delay: .4s; }
@keyframes typing-pulse {
  0%, 60%, 100% { transform: translateY(0); opacity: .45; }
  30%            { transform: translateY(-3px); opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .typing-dots span { animation: none; opacity: .6; }
}

/* ── Input area ── */
.input-area {
  position: relative;
  display: flex; flex-direction: column;
  background: var(--surface);
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}

/* ── Formatting toolbar ── */
.fmt-toolbar {
  display: flex; align-items: center;
  padding: .35rem .75rem .2rem;
  border-bottom: 1px solid var(--border-subtle);
  gap: .25rem;
}
.fmt-scroll {
  flex: 1; min-width: 0;
  display: flex; align-items: center; gap: .1rem;
}
.fmt-actions {
  display: flex; align-items: center; gap: .1rem;
  flex-shrink: 0;
  position: relative;
}
.fmt-btn {
  display: flex; align-items: center; justify-content: center;
  min-width: 26px; height: 26px;
  padding: 0 .35rem;
  border-radius: 4px;
  font-size: 12.5px;
  color: var(--text-muted);
  transition: color .1s, background .1s;
}
.fmt-btn:hover { color: var(--text); background: var(--surface-2); }
.fmt-btn.mono   { font-family: 'Menlo', 'Consolas', monospace; font-size: 13px; }
.fmt-btn.attach { margin-left: .1rem; }
.fmt-btn.active { color: var(--accent); background: oklch(from var(--accent) l c h / 0.10); }
.gif-wrap { position: relative; }
.gif-btn  { font-size: 11px; font-weight: 700; letter-spacing: .02em; padding: 0 .45rem; }

/* ── Compose row ── */
.compose-row {
  display: flex; align-items: flex-end; gap: .4rem;
  padding: .5rem .75rem .6rem;
  padding-bottom: calc(.6rem + var(--safe-bottom));
}

/* ── Image preview ── */
.img-preview {
  position: absolute;
  bottom: calc(100% + 4px);
  left: .75rem; right: .75rem;
  display: flex; align-items: center; gap: .75rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: .55rem .75rem;
  box-shadow: var(--shadow-lg);
  z-index: 50;
}
.img-thumb {
  width: 52px; height: 52px;
  object-fit: cover;
  border-radius: var(--radius);
  flex-shrink: 0;
  border: 1px solid var(--border-subtle);
}
.img-info {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column; gap: .2rem;
}
.img-name {
  font-size: 12.5px; font-weight: 600;
  color: var(--text);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.img-sizes {
  font-size: 11px;
  color: var(--text-muted);
}
.img-actions {
  display: flex; align-items: center; gap: .35rem;
  flex-shrink: 0;
}
.img-send {
  padding: .3rem .75rem;
  background: var(--accent); color: #fff;
  border-radius: var(--radius);
  font-size: 12px; font-weight: 600;
  transition: background .12s;
}
.img-send:hover { background: var(--accent-hover); }
.img-send-orig {
  padding: .3rem .65rem;
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  font-size: 12px; font-weight: 500;
  color: var(--text-2);
  transition: background .12s, border-color .12s;
}
.img-send-orig:hover { background: var(--surface-2); }
.img-cancel {
  display: flex; align-items: center; justify-content: center;
  width: 26px; height: 26px;
  border-radius: 50%;
  color: var(--text-muted);
  transition: color .1s, background .1s;
}
.img-cancel:hover { color: var(--text); background: var(--surface-2); }

.sr-only {
  position: absolute; width: 1px; height: 1px;
  padding: 0; margin: -1px; overflow: hidden;
  clip: rect(0,0,0,0); white-space: nowrap; border: 0;
}

/* ── Command hint ── */
.reply-banner {
  display: flex; align-items: center; justify-content: space-between;
  padding: .4rem .75rem;
  background: oklch(from var(--accent) l c h / 0.07);
  border-top: 1px solid var(--border-subtle);
  gap: .5rem;
}
.reply-banner-content {
  display: flex; align-items: center; gap: .4rem;
  color: var(--text-muted); font-size: 12px;
  overflow: hidden;
  flex: 1; min-width: 0;
}
.reply-banner-name { font-weight: 700; color: var(--accent); flex-shrink: 0; }
.reply-banner-body { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.reply-cancel {
  flex-shrink: 0;
  padding: .2rem;
  color: var(--text-muted);
  border-radius: var(--radius);
}
.reply-cancel:hover { color: var(--text); background: var(--surface); }

.cmd-hint {
  position: absolute;
  bottom: calc(100% + 4px);
  left: .75rem;
  right: .75rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  z-index: 50;
}
.cmd-item {
  display: flex; align-items: baseline; gap: .5rem;
  width: 100%;
  padding: .5rem .85rem;
  font-size: 12.5px;
  text-align: left;
  transition: background .1s;
  border-bottom: 1px solid var(--border-subtle);
}
.cmd-item:last-child { border-bottom: none; }
.cmd-item:hover { background: var(--surface-2); }

.cmd-name {
  font-weight: 700;
  color: var(--accent);
  font-family: 'Menlo', 'Consolas', monospace;
  font-size: 12px;
}
.cmd-args {
  font-size: 11px;
  color: var(--text-muted);
  font-family: 'Menlo', 'Consolas', monospace;
}
.cmd-desc {
  font-size: 11.5px;
  color: var(--text-faint);
  margin-left: auto;
}

/* ── Emoji wrap ── */
.emoji-wrap { position: relative; flex-shrink: 0; }

.msg-input {
  flex: 1; resize: none;
  border: 1.5px solid var(--border);
  border-radius: var(--radius-lg);
  padding: .5rem .8rem;
  font-size: 14px;
  background: var(--surface-2);
  max-height: 140px; overflow-y: auto;
  line-height: 1.45;
  transition: border-color .12s, background .12s;
}
.msg-input:focus { outline: none; border-color: var(--accent); background: var(--surface); }
.msg-input::placeholder { color: var(--text-faint); }

.tool-btn {
  position: relative;
  display: flex; align-items: center; justify-content: center;
  padding: .35rem; border-radius: var(--radius);
  color: var(--text-muted); transition: color .12s, background .12s;
}
.tool-btn:hover  { color: var(--text-2); background: var(--surface-2); }
.tool-btn.active { color: var(--accent); background: oklch(from var(--accent) l c h / 0.10); }

/* CSS tooltip via data-label — appears above button on hover */
.tool-btn[data-label]::after {
  content: attr(data-label);
  position: absolute;
  bottom: calc(100% + 5px);
  left: 50%; transform: translateX(-50%);
  background: var(--surface-3);
  color: var(--text-2);
  font-size: 10.5px; font-weight: 500;
  white-space: nowrap;
  padding: 3px 7px;
  border-radius: 5px;
  border: 1px solid var(--border);
  box-shadow: var(--shadow);
  pointer-events: none;
  opacity: 0;
  transition: opacity .1s;
  z-index: 20;
}
.tool-btn[data-label]:hover::after { opacity: 1; }

/* ── Attach error ── */
.attach-error {
  display: flex; align-items: center; gap: .4rem;
  padding: .35rem .75rem;
  background: oklch(0.96 0.04 25);
  border-top: 1px solid oklch(0.88 0.08 25);
  font-size: 12px;
  color: oklch(0.45 0.18 25);
  animation: slide-in .15s ease;
}
@keyframes slide-in {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
.attach-error-dismiss {
  margin-left: auto; flex-shrink: 0;
  padding: .2rem;
  border-radius: 3px;
  color: inherit; opacity: .65;
  transition: opacity .1s;
}
.attach-error-dismiss:hover { opacity: 1; }

/* ── Commands panel ── */
.cmds-toggle {
  font-family: 'Menlo', 'Consolas', monospace;
  font-weight: 700; font-size: 13px;
  color: var(--text-faint);
}
.cmds-toggle.active, .cmds-toggle:hover { color: var(--accent); }
.cmds-panel {
  position: absolute;
  bottom: calc(100% + 4px);
  left: .75rem; right: .75rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  z-index: 50;
  animation: bar-in .12s ease;
}
.cmds-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: .45rem .75rem .35rem;
  border-bottom: 1px solid var(--border-subtle);
}
.cmds-title { font-size: 11.5px; font-weight: 700; color: var(--text-2); letter-spacing: .04em; text-transform: uppercase; }
.cmds-close {
  padding: .2rem; border-radius: 3px;
  color: var(--text-faint); transition: color .1s;
}
.cmds-close:hover { color: var(--text); }
.cmds-item {
  display: flex; align-items: baseline; gap: .5rem;
  width: 100%; padding: .45rem .75rem;
  font-size: 12.5px; text-align: left;
  transition: background .1s;
  border-bottom: 1px solid var(--border-subtle);
}
.cmds-item:last-child { border-bottom: none; }
.cmds-item:hover { background: var(--surface-2); }
.cmds-cmd {
  font-weight: 700; color: var(--accent);
  font-family: 'Menlo', 'Consolas', monospace; font-size: 12px;
  flex-shrink: 0;
}
.cmds-args {
  font-size: 11px; color: var(--text-muted);
  font-family: 'Menlo', 'Consolas', monospace;
  flex-shrink: 0;
}
.cmds-desc { font-size: 11.5px; color: var(--text-faint); margin-left: auto; }

@keyframes bar-in {
  from { opacity: 0; transform: translateY(4px) scale(.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

.send-btn {
  display: flex; align-items: center; gap: .35rem;
  padding: .48rem .9rem;
  background: var(--accent); color: #fff;
  border-radius: var(--radius-lg);
  font-size: 13px; font-weight: 600; letter-spacing: -0.01em;
  transition: background .12s, opacity .12s;
  flex-shrink: 0;
}
.send-btn:hover:not(:disabled)  { background: var(--accent-hover); }
.send-btn:disabled { opacity: .3; cursor: not-allowed; }

@media (prefers-reduced-motion: reduce) {
  .shake { animation: none; }
}

/* ── Back button (mobile only) ── */
.back-btn {
  display: none;
  align-items: center; justify-content: center;
  padding: .25rem;
  border-radius: var(--radius);
  color: var(--text-muted);
  transition: color .12s, background .12s;
  flex-shrink: 0;
}

/* ── Mobile layout ── */
@media (max-width: 767px) {
  .back-btn {
    display: flex;
    min-width: 44px; min-height: 44px;
    margin-left: -.35rem;
  }
  .back-btn:hover { color: var(--text); background: var(--surface-2); }

  /* Larger touch targets for all icon buttons */
  .hbtn {
    min-width: 44px; min-height: 44px;
  }

  /* Formatting toolbar: only the text-format buttons scroll; gif+attach stay fixed */
  .fmt-scroll {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }
  .fmt-scroll::-webkit-scrollbar { display: none; }
  .fmt-btn { flex-shrink: 0; min-width: 36px; min-height: 36px; }

  /* Use system keyboard emoji on mobile */
  .emoji-wrap { display: none; }

  /* Compose row tool buttons */
  .tool-btn { min-width: 40px; min-height: 40px; }

  /* Show icon labels below buttons on mobile */
  .tool-btn[data-label] {
    flex-direction: column; gap: 1px;
  }
  .tool-btn[data-label]::after {
    position: static;
    transform: none;
    background: transparent;
    border: none;
    box-shadow: none;
    opacity: 1;
    font-size: 8.5px;
    font-weight: 600;
    color: var(--text-faint);
    padding: 0;
    letter-spacing: .01em;
  }

  /* Send button more finger-friendly */
  .send-btn { padding: .55rem 1rem; }

  /* Bottom safe area (iPhone home bar) */
  .compose-row {
    padding-bottom: max(.6rem, env(safe-area-inset-bottom));
  }
}

/* Prevent iOS auto-zoom on textarea focus (requires font-size >= 16px) */
@media (pointer: coarse) {
  .msg-input { font-size: 16px; }
}

/* Pin banner */
.relay-banner {
  display: flex; align-items: center; gap: .45rem;
  padding: .3rem .75rem;
  background: oklch(0.97 0.02 60);
  border-bottom: 1px solid oklch(0.88 0.06 60);
  font-size: 11.5px; font-weight: 500;
  color: oklch(0.45 0.12 50);
  flex-shrink: 0;
}
[data-theme="dark"] .relay-banner {
  background: oklch(0.22 0.04 50);
  border-bottom-color: oklch(0.32 0.06 50);
  color: oklch(0.75 0.12 70);
}

.pin-banner {
  display: flex; align-items: center; gap: .5rem;
  padding: .35rem .75rem .35rem .65rem;
  background: oklch(from var(--accent) 0.96 0.03 h);
  border-bottom: 1px solid oklch(from var(--accent) 0.88 0.06 h);
  flex-shrink: 0;
}
.pin-icon { color: var(--accent); flex-shrink: 0; }
.pin-text {
  flex: 1; min-width: 0;
  font-size: 12px; color: var(--text-muted);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.pin-unpin, .pin-dismiss {
  padding: .2rem; flex-shrink: 0;
  color: var(--text-faint); border-radius: 3px;
  transition: color .1s;
}
.pin-unpin:hover, .pin-dismiss:hover { color: var(--text); }

/* @mention popup */
.mention-popup {
  background: var(--surface);
  border: 1px solid var(--border);
  border-bottom: none;
  border-radius: var(--radius) var(--radius) 0 0;
  overflow: hidden;
}
.mention-item {
  display: flex; align-items: center; gap: .55rem;
  width: 100%; padding: .5rem .75rem;
  font-size: 13px; color: var(--text);
  text-align: left;
  transition: background .08s;
}
.mention-item:hover, .mention-item.active { background: var(--surface-2); }
.mention-avatar {
  width: 24px; height: 24px; border-radius: 50%;
  background: var(--accent); color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 700; flex-shrink: 0;
}
.mention-name { font-weight: 600; }
.mention-pin-tag { font-size: 11px; color: var(--text-faint); margin-left: auto; }

/* View-once toggle */
.view-once-toggle {
  display: flex; align-items: center; gap: .4rem;
  font-size: 12px; color: var(--text-muted);
  cursor: pointer; user-select: none;
  padding: .1rem 0;
}
.view-once-toggle input { cursor: pointer; accent-color: var(--accent); }
</style>
