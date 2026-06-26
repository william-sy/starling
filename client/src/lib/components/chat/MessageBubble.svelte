<script lang="ts">
  import { createEventDispatcher, tick } from 'svelte';
  import { toggleReaction, editMessage, toggleStar } from '$lib/stores/chats';
  import { activeContact }  from '$lib/stores/contacts';
  import { account }        from '$lib/stores/auth';
  import type { Message }   from '$lib/stores/chats';
  import { parseMarkdown }  from '$lib/utils/markdown';
  import { relaySendReaction, relaySendEdit } from '$lib/stores/relay';
  import { _ } from '$lib/i18n';
  import AudioBubble from './AudioBubble.svelte';
  import BubbleMenu  from './BubbleMenu.svelte';
  import PollBubble  from './PollBubble.svelte';
  import FileBubble   from './FileBubble.svelte';
  import LinkPreview  from './LinkPreview.svelte';
  import { extractFirstUrl } from '$lib/utils/og';
  import { settings } from '$lib/stores/settings';
  import ColoredName  from '$lib/components/ui/ColoredName.svelte';

  export let msg: Message;
  export let senderLabel: string | null = null;
  export let highlight: string = '';
  export let pinned = false;

  const dispatch = createEventDispatcher<{ reply: Message; deleteme: Message; deleteeveryone: Message; pin: string; open_view_once: string }>();

  const QUICK_REACT = ['👍', '❤️', '😂', '😮', '😢', '👎'];
  let showReactBar = false;
  let lightboxSrc: string | null = null;

  // Context menu (right-click / long-press)
  let menuX = 0;
  let menuY = 0;
  let showMenu = false;

  function openMenu(x: number, y: number) {
    showReactBar = false;
    menuX = Math.min(x, window.innerWidth - 180);
    menuY = Math.min(y, window.innerHeight - 150);
    showMenu = true;
  }

  function onContextMenu(e: MouseEvent) {
    if (msg.kind === 'system') return;
    e.preventDefault();
    openMenu(e.clientX, e.clientY);
  }

  // Swipe-to-reply
  let swipeOffset = 0;
  let swipeActive = false;
  let swipeStartX = 0;
  let swipeStartY = 0;
  let swipeCommitted = false;
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  const SWIPE_THRESHOLD = 65;

  function onPointerDown(e: PointerEvent) {
    if (msg.kind === 'system' || msg.is_broadcast || e.button !== 0) return;
    swipeStartX  = e.clientX;
    swipeStartY  = e.clientY;
    swipeActive  = true;
    swipeCommitted = false;
    holdTimer = setTimeout(() => {
      if (!swipeCommitted) openMenu(e.clientX, e.clientY);
    }, 600);
  }

  function onPointerMove(e: PointerEvent) {
    if (!swipeActive) return;
    const dx = e.clientX - swipeStartX;
    const dy = e.clientY - swipeStartY;
    if (!swipeCommitted) {
      if (Math.abs(dy) > Math.abs(dx)) { swipeActive = false; cancelSwipe(); return; }
      if (Math.abs(dx) > 8) swipeCommitted = true;
    }
    if (!swipeCommitted) return;
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
    // Allow right-swipe for received, left-swipe for sent
    const raw = msg.is_me ? -dx : dx;
    swipeOffset = Math.max(0, Math.min(raw, SWIPE_THRESHOLD + 10));
  }

  function onPointerUp() {
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
    if (swipeOffset >= SWIPE_THRESHOLD) dispatch('reply', msg);
    cancelSwipe();
  }

  function cancelSwipe() {
    swipeActive = false;
    swipeCommitted = false;
    swipeOffset = 0;
  }

  let editing    = false;
  let editDraft  = '';
  let editEl: HTMLTextAreaElement;

  function onMenuReact() {
    showMenu = false;
    showReactBar = true;
  }

  function onMenuEdit() {
    showMenu  = false;
    editDraft = msg.body;
    editing   = true;
    tick().then(() => {
      if (editEl) {
        editEl.focus();
        editEl.setSelectionRange(editEl.value.length, editEl.value.length);
      }
    });
  }

  function commitEdit() {
    const newBody = editDraft.trim();
    if (!newBody || newBody === msg.body || !$activeContact || !$account) { editing = false; return; }
    editMessage($activeContact.pin, msg.id, newBody);
    relaySendEdit($activeContact.pin, msg.id, newBody).catch(console.error);
    editing = false;
  }

  function cancelEdit() { editing = false; }

  function onMenuReply(e: CustomEvent<Message>) {
    showMenu = false;
    dispatch('reply', e.detail);
  }

  function onMenuDelete(e: CustomEvent<'me' | 'everyone'>) {
    showMenu = false;
    if (e.detail === 'me') dispatch('deleteme', msg);
    else dispatch('deleteeveryone', msg);
  }

  function react(emoji: string) {
    if (!$activeContact || !$account) return;
    toggleReaction($activeContact.pin, msg.id, emoji, $account.pin);
    relaySendReaction($activeContact.pin, msg.id, emoji).catch(console.error);
    showReactBar = false;
  }

  function replyLabel(pin: string): string {
    return pin === $account?.pin ? 'You' : ($activeContact?.display_name ?? pin.slice(0, 8));
  }

  function replyPreview(r: Message['reply_to']): string {
    if (!r) return '';
    if (r.kind === 'image') return r.body === '[photo]' ? '📷 Photo' : '🎞 GIF';
    if (r.kind === 'audio') return '🎤 Voice message';
    return r.body.length > 60 ? r.body.slice(0, 60) + '…' : r.body;
  }

  $: reactionEntries = Object.entries(msg.reactions ?? []) as [string, string[]][];

  function fmt(ts: number) {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  const statusIcon: Record<string, string> = {
    sending:   '○',
    sent:      '✓',
    delivered: '✓✓',
    read:      '✓✓',
    failed:    '!',
  };

  $: receiptStatus = msg.receipt_status ?? null;

  // Detect emoji-only messages for large rendering
  $: emojiOnly = (() => {
    const text = msg.body?.trim() ?? '';
    if (!text || msg.kind === 'system' || msg.kind === 'image') return false;
    const stripped = text.replace(/[\p{Extended_Pictographic}\u{200D}\u{FE0F}\u{20E3}\s]/gu, '');
    return stripped.length === 0;
  })();

  $: emojiCount = (() => {
    if (!emojiOnly) return 0;
    try {
      const seg = new Intl.Segmenter('en', { granularity: 'grapheme' });
      return [...seg.segment(msg.body.trim())]
        .filter(s => /\p{Extended_Pictographic}/u.test(s.segment))
        .length;
    } catch {
      return (msg.body.match(/\p{Extended_Pictographic}/gu) ?? []).length;
    }
  })();

  $: bigEmoji   = emojiOnly && emojiCount >= 1 && emojiCount <= 3;
  $: emojiSize  = emojiCount === 1 ? 56 : emojiCount === 2 ? 46 : 38;
  $: previewUrl = ($settings.linkPreviews && !msg.deleted && (msg.kind === 'text' || !msg.kind))
    ? extractFirstUrl(msg.body ?? '')
    : null;

  function applyMentionHighlight(html: string, myName: string): string {
    if (!html.includes('@')) return html;
    return html.replace(
      /@([A-Za-z0-9_][A-Za-z0-9_\- ]*?)(?=[\s,\.!?;:'")<\]]|$)/g,
      (match) => {
        const name = match.slice(1).trim();
        const isMine = myName && name === myName;
        return `<span class="mention${isMine ? ' mention-me' : ''}">${match}</span>`;
      }
    );
  }

  $: parsedBody = (() => {
    const base = bigEmoji ? '' : parseMarkdown(msg.body ?? '');
    const withMentions = applyMentionHighlight(base, $account?.display_name ?? '');
    if (!highlight || !withMentions) return withMentions;
    const esc = highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return withMentions.replace(new RegExp(esc, 'gi'), m => `<mark class="search-hi">${m}</mark>`);
  })();
</script>

{#if lightboxSrc}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="lightbox-backdrop" on:click={() => lightboxSrc = null}>
    <div class="lightbox-toolbar" on:click|stopPropagation>
      <a
        class="lightbox-dl"
        href={lightboxSrc}
        download={msg.filename ?? 'image'}
        aria-label="Save image"
        on:click|stopPropagation
      >
        <svg viewBox="0 0 16 16" fill="none" width="16" height="16" aria-hidden="true">
          <path d="M8 2v8M5 7l3 3 3-3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M2 12h12" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
        </svg>
        Save
      </a>
      <button class="lightbox-close" on:click|stopPropagation={() => lightboxSrc = null} aria-label="Close">
        <svg viewBox="0 0 14 14" fill="none" width="14" height="14"><path d="M1 1L13 13M13 1L1 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </button>
    </div>
    <img src={lightboxSrc} alt={msg.filename ?? 'Image'} class="lightbox-img" on:click|stopPropagation />
  </div>
{/if}

{#if showMenu}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="menu-backdrop" on:click={() => showMenu = false} on:contextmenu|preventDefault={() => showMenu = false}></div>
  <BubbleMenu {msg} {pinned} is_broadcast={msg.is_broadcast ?? false} x={menuX} y={menuY} on:react={onMenuReact} on:edit={onMenuEdit} on:reply={onMenuReply} on:delete={onMenuDelete} on:pin={() => dispatch('pin', msg.id)} on:close={() => showMenu = false} />
{/if}

{#if msg.kind === 'system'}
  <div class="system-msg">{@html parseMarkdown(msg.body ?? '')}</div>
{:else}
  {#if senderLabel}
    <div class="says-label" class:me={msg.is_me}>
      <span class="says-name"><ColoredName name={senderLabel} /></span><span class="says-tail"> says:</span>
    </div>
  {/if}

  {#if msg.kind === 'sticker'}
    <!-- Sticker — no bubble, transparent image -->
    <div class="sticker-wrap" class:me={msg.is_me}>
      <button class="sticker-link" on:click={() => lightboxSrc = msg.original ?? msg.body} aria-label={msg.filename ?? 'Sticker'}>
        <img src={msg.body} alt={msg.filename ?? 'Sticker'} class="sticker-img" />
      </button>
      <span class="emoji-meta">
        <span class="time">{fmt(msg.ts)}</span>
        {#if msg.is_me}
          {#if receiptStatus}
            <span class="ticks" class:tick-read={receiptStatus === 'read'} aria-label={receiptStatus}>
              {#if receiptStatus === 'sent'}
                <svg viewBox="0 0 10 8" width="10" height="8" fill="none"><path d="M1 4l3 3 5-6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
              {:else}
                <svg viewBox="0 0 14 8" width="14" height="8" fill="none"><path d="M1 4l3 3 5-6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 4l3 3 5-6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
              {/if}
            </span>
          {:else}
            <span class="status" class:read={msg.status === 'read'} class:failed={msg.status === 'failed'}>{statusIcon[msg.status]}</span>
          {/if}
        {/if}
      </span>
    </div>
  {:else if bigEmoji}
    <!-- Large emoji — no bubble, just the glyph -->
    <div class="emoji-wrap" class:me={msg.is_me}>
      <span class="emoji-big" style="font-size: {emojiSize}px">{msg.body}</span>
      <span class="emoji-meta">
        {#if msg.expires_at}
          <svg class="expire-icon" viewBox="0 0 12 12" width="10" height="10" fill="none" aria-hidden="true">
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1.2"/>
            <path d="M6 3.5V6l1.5 1.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
          </svg>
        {/if}
        <span class="time">{fmt(msg.ts)}</span>
        {#if msg.is_me}
          {#if receiptStatus}
            <span class="ticks" class:tick-read={receiptStatus === 'read'} aria-label={receiptStatus}>
              {#if receiptStatus === 'sent'}
                <svg viewBox="0 0 10 8" width="10" height="8" fill="none"><path d="M1 4l3 3 5-6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
              {:else}
                <svg viewBox="0 0 14 8" width="14" height="8" fill="none"><path d="M1 4l3 3 5-6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 4l3 3 5-6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
              {/if}
            </span>
          {:else}
            <span class="status" class:read={msg.status === 'read'} class:failed={msg.status === 'failed'}>{statusIcon[msg.status]}</span>
          {/if}
        {/if}
      </span>
    </div>
  {:else}
    <div class="msg-row" class:me={msg.is_me}>
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div
        class="bubble-wrap"
        class:me={msg.is_me}
        on:mouseleave={() => showReactBar = false}
        on:contextmenu={onContextMenu}
        on:pointerdown={onPointerDown}
        on:pointermove={onPointerMove}
        on:pointerup={onPointerUp}
        on:pointercancel={onPointerUp}
        style="--swipe: {swipeOffset}px"
      >
        {#if swipeOffset > 10}
          <div class="swipe-icon" class:me={msg.is_me} style="opacity: {Math.min(swipeOffset / SWIPE_THRESHOLD, 1)}" aria-hidden="true">
            <svg viewBox="0 0 14 14" width="16" height="16" fill="none">
              <path d="M1 5h8a4 4 0 010 8H6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M4 2L1 5l3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
        {/if}

        <div class="bubble" class:me={msg.is_me}>
          {#if msg.is_broadcast && !msg.is_me}
            <div class="broadcast-label" aria-label="Broadcast message">
              <svg viewBox="0 0 12 12" fill="none" width="10" height="10" aria-hidden="true">
                <path d="M1.5 4.5h2l3.5-2.5v7.5l-3.5-2.5h-2v-2.5z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
                <path d="M9 4c.8.5.8 3.5 0 4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
              </svg>
              Broadcast
            </div>
          {/if}
          {#if msg.reply_to}
            <div class="reply-quote" class:me={msg.is_me}>
              <span class="reply-name">{replyLabel(msg.reply_to.from_pin)}</span>
              <span class="reply-body">{replyPreview(msg.reply_to)}</span>
            </div>
          {/if}

          {#if msg.deleted}
            <span class="deleted-body">Message deleted</span>
          {:else if msg.kind === 'image'}
            {#if msg.view_once && !msg.view_once_opened}
              <button class="view-once-btn" on:click={() => dispatch('open_view_once', msg.id)} aria-label="Open photo - can only be viewed once">
                <svg viewBox="0 0 20 20" fill="none" width="22" height="22" aria-hidden="true">
                  <path d="M3 10C5 6 8 4 10 4s5 2 7 6c-2 4-5 6-7 6s-5-2-7-6z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
                  <circle cx="10" cy="10" r="3" fill="currentColor"/>
                </svg>
                <span>Tap to open</span>
                <span class="view-once-label">1 time only</span>
              </button>
            {:else if msg.view_once && msg.view_once_opened && !msg.is_me}
              <span class="view-once-opened">Photo opened</span>
            {:else}
              <div class="img-inner">
                <button class="img-link" on:click={() => lightboxSrc = msg.original ?? msg.body} aria-label={msg.filename ?? 'Image'}>
                  <img src={msg.body} alt={msg.filename ?? 'Image'} class="msg-image" />
                </button>
              </div>
              {#if msg.filename}
                <span class="img-caption">{msg.filename}</span>
              {/if}
            {/if}
          {:else if msg.kind === 'audio'}
            <AudioBubble src={msg.body} duration={msg.duration ?? 0} isMe={msg.is_me} />
          {:else if msg.kind === 'file' && msg.filename}
            <FileBubble filename={msg.filename} filesize={msg.filesize} body={msg.body} isMe={msg.is_me} />
          {:else if msg.kind === 'poll' && msg.poll}
            <PollBubble poll={msg.poll} pollId={msg.id} isMe={msg.is_me} />
          {:else if editing}
            <textarea
              class="edit-input"
              bind:this={editEl}
              bind:value={editDraft}
              rows="1"
              on:keydown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitEdit(); } else if (e.key === 'Escape') cancelEdit(); }}
            ></textarea>
            <div class="edit-actions">
              <button class="edit-cancel" on:click={cancelEdit}>Cancel</button>
              <button class="edit-confirm" on:click={commitEdit}>Save</button>
            </div>
          {:else}
            <!-- svelte-ignore security-anchor-rel-noreferrer -->
            <div class="body">{@html parsedBody}</div>
            {#if previewUrl}
              <LinkPreview url={previewUrl} isMe={msg.is_me} />
            {/if}
          {/if}
          <span class="meta">
            {#if msg.edited}<span class="edited-tag">edited</span>{/if}
            {#if msg.expires_at}
              <svg class="expire-icon" viewBox="0 0 12 12" width="10" height="10" fill="none" aria-hidden="true">
                <circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1.2"/>
                <path d="M6 3.5V6l1.5 1.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
              </svg>
            {/if}
            <span class="time">{fmt(msg.ts)}</span>
            {#if msg.is_me}
              {#if receiptStatus}
                <span class="ticks" class:tick-read={receiptStatus === 'read'} aria-label={receiptStatus}>
                  {#if receiptStatus === 'sent'}
                    <svg viewBox="0 0 10 8" width="10" height="8" fill="none"><path d="M1 4l3 3 5-6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  {:else}
                    <svg viewBox="0 0 14 8" width="14" height="8" fill="none"><path d="M1 4l3 3 5-6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 4l3 3 5-6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  {/if}
                </span>
              {:else}
                <span class="status" class:read={msg.status === 'read'} class:failed={msg.status === 'failed'}>{statusIcon[msg.status]}</span>
              {/if}
            {/if}
            <button
              class="star-btn"
              class:starred={msg.starred}
              on:click|stopPropagation={() => $activeContact && toggleStar($activeContact.pin, msg.id)}
              title={msg.starred ? 'Unstar message' : 'Star message'}
              aria-label={msg.starred ? 'Unstar message' : 'Star message'}
              aria-pressed={!!msg.starred}
            >
              <svg viewBox="0 0 14 14" fill="none" width="11" height="11" aria-hidden="true">
                {#if msg.starred}
                  <path d="M7 1l1.7 3.4 3.7.5-2.7 2.6.6 3.7L7 9.7 3.7 11.3l.6-3.7L1.6 5l3.7-.5z" fill="currentColor" stroke="currentColor" stroke-width=".8" stroke-linejoin="round"/>
                {:else}
                  <path d="M7 1l1.7 3.4 3.7.5-2.7 2.6.6 3.7L7 9.7 3.7 11.3l.6-3.7L1.6 5l3.7-.5z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
                {/if}
              </svg>
            </button>
          </span>

          <!-- React trigger: positioned just outside the bubble edge -->
          <button
            class="react-trigger"
            class:me={msg.is_me}
            class:visible={showReactBar}
            on:click|stopPropagation={() => showReactBar = !showReactBar}
            aria-label={$_('chat.reaction_trigger_aria')}
            title="React"
          >
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.3"/>
              <path d="M5.2 9.8c.7 1.1 4.9 1.1 5.6 0" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
              <circle cx="5.8" cy="7" r=".85" fill="currentColor"/>
              <circle cx="10.2" cy="7" r=".85" fill="currentColor"/>
            </svg>
          </button>

          <!-- Quick reaction bar -->
          {#if showReactBar}
            <div class="react-bar" class:me={msg.is_me} role="toolbar" aria-label={$_('chat.reaction_bar_aria')}>
              {#each QUICK_REACT as emoji}
                <button
                  class="react-emoji"
                  on:click|stopPropagation={() => react(emoji)}
                  aria-label={$_('chat.reaction_aria', { values: { emoji } })}
                >{emoji}</button>
              {/each}
            </div>
          {/if}
        </div>
      </div>

      <!-- Reactions sit below the bubble, outside the flex row -->
      {#if reactionEntries.length > 0}
        <div class="reactions" class:me={msg.is_me}>
          {#each reactionEntries as [emoji, pins]}
            <button
              class="reaction-chip"
              class:mine={$account && pins.includes($account.pin)}
              on:click={() => react(emoji)}
              title={pins.length === 1 ? $_('chat.reaction_count', { values: { count: pins.length } }) : $_('chat.reaction_count_plural', { values: { count: pins.length } })}
              aria-pressed={$account ? pins.includes($account.pin) : false}
            >
              <span class="rc-emoji">{emoji}</span>
              <span class="rc-count">{pins.length}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
{/if}

<style>
.system-msg {
  text-align: center;
  font-size: 11px;
  color: var(--text-faint);
  padding: .5rem 1.25rem;
  font-style: italic;
}

/* "Name says:" label */
.says-label {
  display: flex;
  align-items: baseline;
  gap: .1rem;
  padding: .55rem .85rem .1rem;
}
.says-label.me { justify-content: flex-end; }
.says-name {
  font-size: 11px;
  font-weight: 700;
  color: var(--accent);
  letter-spacing: -0.01em;
}
.says-label.me .says-name {
  color: var(--text-muted);
}
.says-tail {
  font-size: 11px;
  color: var(--text-faint);
  font-style: italic;
}

/* ── Sticker ── */
.sticker-wrap {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: .3rem .85rem .1rem;
}
.sticker-wrap.me { align-items: flex-end; }
.sticker-link { display: block; line-height: 0; }
.sticker-img {
  width: 140px;
  height: auto;
  display: block;
  cursor: pointer;
  filter: drop-shadow(0 2px 8px oklch(0 0 0 / 0.18));
  transition: transform .15s cubic-bezier(.25, 1, .5, 1), opacity .12s;
}
.sticker-img:hover { transform: scale(1.06); opacity: .9; }

/* ── Large emoji ── */
.emoji-wrap {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: .45rem .85rem .2rem;
}
.emoji-wrap.me { align-items: flex-end; }

.emoji-big {
  line-height: 1.15;
  filter: drop-shadow(0 3px 12px oklch(0 0 0 / 0.28));
  animation: emoji-pop 0.25s cubic-bezier(.25, 1, .5, 1) both;
  display: block;
}

@keyframes emoji-pop {
  0%   { transform: scale(0.35); opacity: 0; }
  100% { transform: scale(1);    opacity: 1; }
}

.emoji-meta {
  display: flex; align-items: center; gap: .3rem;
  margin-top: 3px;
}

/* ── Bubble ── */
.msg-row {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}
.msg-row.me { align-items: flex-end; }

.bubble-wrap {
  display: flex;
  justify-content: flex-start;
  padding: .1rem .85rem;
  width: 100%;
}
.bubble-wrap.me { justify-content: flex-end; }

.bubble {
  max-width: 62%;
  padding: .52rem .85rem;
  border-radius: var(--radius-lg);
  border-bottom-left-radius: 4px;
  background: var(--bubble-in);
  color: var(--bubble-in-text);
  font-family: var(--font-msg);
  font-size: 14px;
  line-height: 1.48;
  box-shadow: var(--shadow);
  display: flex; flex-direction: column; gap: .25rem;
}
.bubble.me {
  background: var(--bubble-out);
  color: var(--bubble-out-text);
  border-bottom-left-radius: var(--radius-lg);
  border-bottom-right-radius: 4px;
}

.bubble-wrap { --swipe: 0px; touch-action: pan-y; }
.bubble-wrap .bubble { transform: translateX(var(--swipe)); }
.bubble-wrap.me .bubble { transform: translateX(calc(-1 * var(--swipe))); }

.swipe-icon {
  position: absolute; left: -28px; top: 50%; transform: translateY(-50%);
  color: var(--text-muted);
  pointer-events: none;
}
.swipe-icon.me { left: auto; right: -28px; }

.reply-quote {
  display: flex; flex-direction: column; gap: .1rem;
  padding: .3rem .55rem;
  border-radius: var(--radius);
  background: oklch(0 0 0 / 0.07);
  margin-bottom: .1rem;
  max-width: 100%;
  outline: 1px solid oklch(0 0 0 / 0.08);
}
.reply-quote.me {
  background: oklch(1 1 1 / 0.12);
  outline-color: oklch(1 1 1 / 0.10);
}
.reply-name { font-size: 11px; font-weight: 700; color: var(--accent); line-height: 1.2; }
.reply-body { font-size: 12px; opacity: .75; line-height: 1.35; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.broadcast-label {
  display: inline-flex; align-items: center; gap: .3rem;
  font-size: 10.5px; font-weight: 600;
  color: oklch(0.55 0.18 320);
  opacity: .8;
  margin-bottom: .25rem;
}
.deleted-body {
  font-size: 13px; font-style: italic; opacity: .5;
}

.edit-input {
  width: 100%;
  background: transparent;
  border: none;
  border-bottom: 1.5px solid var(--accent);
  color: inherit;
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  resize: none;
  padding: 0 0 3px;
  outline: none;
  field-sizing: content;
  min-height: 1.5em;
}
.edit-actions {
  display: flex; gap: .4rem; justify-content: flex-end;
  margin-top: .35rem;
}
.edit-cancel, .edit-confirm {
  font-size: 11px; font-weight: 600; padding: 2px 8px;
  border-radius: 4px; transition: opacity .1s;
}
.edit-cancel { opacity: .55; }
.edit-cancel:hover { opacity: 1; }
.edit-confirm {
  background: var(--accent); color: #fff;
}
.edit-confirm:hover { opacity: .85; }

.edited-tag {
  font-size: 9.5px; opacity: .45; font-style: italic;
}

.menu-backdrop {
  position: fixed; inset: 0; z-index: 79;
}

.body { word-break: break-word; }
.body :global(mark.search-hi) {
  background: oklch(0.88 0.18 90);
  color: oklch(0.2 0.05 90);
  border-radius: 2px;
  padding: 0 1px;
}

.img-inner {
  overflow: hidden;
  border-radius: calc(var(--radius-lg) - 6px);
  margin: -.52rem -.85rem .1rem;
  line-height: 0;
}
.img-link { display: block; }
.msg-image {
  max-width: 260px;
  width: 100%;
  height: auto;
  display: block;
  cursor: pointer;
  transition: opacity .12s;
}
.msg-image:hover { opacity: .88; }
.img-caption {
  display: block;
  font-size: 10.5px;
  color: inherit;
  opacity: .55;
  margin-top: .2rem;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  max-width: 260px;
}

/* Markdown elements rendered via {@html} — must use :global() */
.body :global(strong) { font-weight: 700; }
.body :global(em)     { font-style: italic; }
.body :global(del)    { text-decoration: line-through; opacity: 0.65; }

.body :global(a) {
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
  opacity: 0.85;
  word-break: break-all;
}
.body :global(a:hover) { opacity: 1; }

.body :global(code.md-code) {
  font-family: 'Menlo', 'Consolas', 'Courier New', monospace;
  font-size: 0.85em;
  background: oklch(0 0 0 / 0.18);
  border-radius: 4px;
  padding: 1px 5px;
  letter-spacing: 0;
}
.bubble.me :global(code.md-code) {
  background: oklch(0 0 0 / 0.22);
}

.body :global(pre.md-pre) {
  font-family: 'Menlo', 'Consolas', 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.6;
  background: oklch(0 0 0 / 0.22);
  border-radius: var(--radius);
  padding: .55rem .75rem;
  overflow-x: auto;
  white-space: pre;
  margin: .3rem 0 .15rem;
  letter-spacing: 0;
}
.bubble.me :global(pre.md-pre) {
  background: oklch(0 0 0 / 0.28);
}
.body :global(pre.md-pre code) {
  background: none;
  padding: 0;
  font-size: inherit;
  border-radius: 0;
}

.meta {
  display: flex; align-items: center; gap: .3rem;
  align-self: flex-end;
}

.star-btn {
  display: flex; align-items: center; justify-content: center;
  opacity: 0;
  color: currentColor;
  border-radius: 3px;
  padding: 1px;
  transition: opacity .12s, color .12s;
}
.star-btn.starred { opacity: 1; color: oklch(0.78 0.18 75); }
.bubble:hover .star-btn { opacity: .45; }
.bubble:hover .star-btn:hover { opacity: 1; color: oklch(0.78 0.18 75); }
.time   { font-family: var(--font-ui); font-size: 10px; opacity: .5; }
.status { font-family: var(--font-ui); font-size: 10px; opacity: .55; letter-spacing: -.02em; }
.status.read { color: var(--status-online); opacity: 1; }
.status.failed { color: oklch(0.58 0.22 25); opacity: 1; font-weight: 700; }
.ticks { display: flex; align-items: center; opacity: .55; color: currentColor; }
.ticks.tick-read { opacity: 1; color: var(--accent); }
.expire-icon { opacity: .45; flex-shrink: 0; }

/* ── Reactions ── */
.bubble { position: relative; }

.react-trigger {
  position: absolute;
  top: 50%; transform: translateY(-50%);
  right: -28px;
  width: 24px; height: 24px;
  border-radius: 50%;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text-muted);
  display: flex; align-items: center; justify-content: center;
  opacity: 0;
  transition: opacity .15s, background .12s, color .12s, transform .12s;
  z-index: 2;
}
.react-trigger.me { right: auto; left: -28px; }
.react-trigger.visible,
.bubble:hover .react-trigger { opacity: 1; }
.react-trigger:hover {
  background: var(--surface-2);
  color: var(--text);
  transform: translateY(-50%) scale(1.12);
}

.react-bar {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  display: flex; gap: 2px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 99px;
  padding: 3px 6px;
  box-shadow: var(--shadow-lg);
  z-index: 10;
  animation: bar-in .1s ease;
}
.react-bar.me { left: auto; right: 0; }
@keyframes bar-in {
  from { opacity: 0; transform: translateY(4px) scale(.96); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

.react-emoji {
  font-size: 18px;
  padding: 2px 3px;
  border-radius: 6px;
  transition: transform .1s, background .1s;
  line-height: 1;
}
.react-emoji:hover { transform: scale(1.25); background: var(--surface-2); }

.reactions {
  display: flex; flex-wrap: wrap; gap: 4px;
  padding: 2px .85rem 0;
  justify-content: flex-start;
  margin-top: -2px;
}
.reactions.me { justify-content: flex-end; }

.reaction-chip {
  display: flex; align-items: center; gap: 3px;
  padding: 2px 7px 2px 5px;
  border-radius: 99px;
  background: var(--surface-2);
  border: 1.5px solid var(--border-subtle);
  font-size: 12px;
  transition: border-color .1s, background .1s;
}
.reaction-chip.mine {
  border-color: oklch(from var(--accent) l c h / 0.5);
  background: oklch(from var(--accent) l c h / 0.08);
}
.reaction-chip:hover { background: var(--surface-3); }
.rc-emoji  { font-size: 14px; line-height: 1; }
.rc-count  { font-size: 11px; font-weight: 600; color: var(--text-muted); }

@media (prefers-reduced-motion: reduce) {
  .emoji-big  { animation: none; }
  .react-bar  { animation: none; }
}

/* ── Image lightbox ── */
.lightbox-backdrop {
  position: fixed;
  inset: 0;
  background: oklch(0 0 0 / 0.88);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  z-index: 200;
  padding: 1rem 1rem 1.5rem;
  cursor: zoom-out;
}
.lightbox-toolbar {
  display: flex; align-items: center; justify-content: flex-end; gap: .5rem;
  width: 100%; max-width: 900px;
  padding-bottom: .65rem;
  flex-shrink: 0;
}
.lightbox-dl {
  display: flex; align-items: center; gap: .4rem;
  padding: .4rem .9rem;
  border-radius: var(--radius);
  background: oklch(0 0 0 / 0.45);
  color: #fff;
  font-size: 13px; font-weight: 600;
  border: 1px solid oklch(1 0 0 / 0.18);
  transition: background .12s;
  cursor: pointer;
}
.lightbox-dl:hover { background: oklch(0 0 0 / 0.65); }
.lightbox-img {
  flex: 1;
  min-height: 0;
  max-width: 100%;
  object-fit: contain;
  border-radius: var(--radius-lg);
  cursor: default;
  box-shadow: 0 8px 40px oklch(0 0 0 / 0.5);
}
.lightbox-close {
  width: 36px; height: 36px;
  border-radius: 50%;
  background: oklch(0 0 0 / 0.45);
  color: #fff;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid oklch(1 0 0 / 0.18);
  transition: background .12s;
  flex-shrink: 0;
}
.lightbox-close:hover { background: oklch(0 0 0 / 0.65); }

/* View-once */
.view-once-btn {
  display: flex; flex-direction: column; align-items: center; gap: .4rem;
  padding: 1.25rem 2rem;
  background: var(--surface-2);
  border: 1.5px dashed var(--border);
  border-radius: var(--radius);
  color: var(--text-muted);
  min-width: 140px;
  transition: background .12s;
}
.view-once-btn:hover { background: var(--surface-3); }
.view-once-btn span { font-size: 13px; font-weight: 600; }
.view-once-label { font-size: 11px; font-weight: 400; opacity: .7; }
.view-once-opened { font-size: 12px; font-style: italic; opacity: .5; }

/* @mention highlighting */
:global(.mention) {
  color: var(--accent);
  font-weight: 600;
  background: oklch(from var(--accent) 0.96 0.04 h);
  border-radius: 3px;
  padding: 0 .2em;
}
:global(.mention.mention-me) {
  background: oklch(from var(--accent) 0.90 0.08 h);
}
</style>
