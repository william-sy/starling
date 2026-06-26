<script lang="ts">
  import ContactPanel  from '$lib/components/layout/ContactPanel.svelte';
  import ChatPanel     from '$lib/components/layout/ChatPanel.svelte';
  import ContextPanel  from '$lib/components/layout/ContextPanel.svelte';
  import EffectOverlay from '$lib/components/effects/EffectOverlay.svelte';
  import CallOverlay   from '$lib/components/calling/CallOverlay.svelte';
  import { activeContact, activePin } from '$lib/stores/contacts';
  import { activeGroupId } from '$lib/stores/groups';
  import { showMobileContext, isMobile } from '$lib/stores/mobile';
  import { syncSuccess } from '$lib/stores/sync';

  $: if (!$activeContact) showMobileContext.set(false);

  const PANEL_MIN = 200;
  const PANEL_MAX = 400;
  const STORAGE_KEY = 'mwt:panel-width';

  let panelWidth: number = (() => {
    try { return Math.max(PANEL_MIN, Math.min(PANEL_MAX, Number(localStorage.getItem(STORAGE_KEY)) || 240)); }
    catch { return 240; }
  })();

  let resizing = false;
  let startX   = 0;
  let startW   = 0;

  function onResizeStart(e: PointerEvent) {
    if (!$isMobile) {
      resizing = true;
      startX   = e.clientX;
      startW   = panelWidth;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
  }

  function onResizeMove(e: PointerEvent) {
    if (!resizing) return;
    panelWidth = Math.max(PANEL_MIN, Math.min(PANEL_MAX, startW + e.clientX - startX));
  }

  function onResizeEnd() {
    if (!resizing) return;
    resizing = false;
    try { localStorage.setItem(STORAGE_KEY, String(panelWidth)); } catch {}
  }
</script>

<div
  class="shell"
  class:has-chat={!!$activeContact}
  class:has-context={$showMobileContext}
>
  <div class="col col-contacts" style={!$isMobile ? `width:${panelWidth}px` : ''}>
    <ContactPanel />
  </div>
  {#if !$isMobile}
    <div
      class="resize-handle"
      role="separator"
      aria-label="Resize panel"
      on:pointerdown={onResizeStart}
      on:pointermove={onResizeMove}
      on:pointerup={onResizeEnd}
      on:pointercancel={onResizeEnd}
    ></div>
  {/if}
  <div class="col col-chat"><ChatPanel /></div>
  <div class="col col-context"><ContextPanel /></div>
</div>

<EffectOverlay />
<CallOverlay />

{#if $syncSuccess}
  <div class="sync-toast" role="status" aria-live="polite">
    <svg viewBox="0 0 14 14" fill="none" width="13" height="13" aria-hidden="true">
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.3"/>
      <path d="M4.5 7l2 2 3.5-3.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    Contacts synced from your other device
  </div>
{/if}

<style>
/* ── Default: mobile single-panel slide navigation ── */
.shell {
  height: 100%;
  position: relative;
  overflow: hidden;
  display: block;
}

.col {
  position: absolute;
  inset: 0;
  display: block;
  overflow: hidden;
  transition: transform 0.27s cubic-bezier(0.4, 0, 0.2, 1);
  will-change: transform;
}

.col :global(.panel) {
  width: 100% !important;
  height: 100%;
  flex-shrink: 0;
}

/* Stacking order and default positions */
.col-contacts { transform: translateX(0);    z-index: 1; }
.col-chat     { transform: translateX(100%); z-index: 2; }
.col-context  { transform: translateX(100%); z-index: 3; }

/* Contact selected: contacts peek left, chat slides in */
.has-chat .col-contacts { transform: translateX(-28%); }
.has-chat .col-chat     { transform: translateX(0); }

/* Context requested: chat peeks left, context slides in */
.has-context .col-chat    { transform: translateX(-28%); }
.has-context .col-context { transform: translateX(0); }

@media (prefers-reduced-motion: reduce) {
  .col { transition: none; }
}

.sync-toast {
  position: fixed; bottom: 1.25rem; left: 50%; transform: translateX(-50%);
  background: var(--surface);
  border: 1px solid var(--border);
  box-shadow: 0 4px 16px oklch(0 0 0 / 0.12);
  border-radius: var(--radius);
  padding: .55rem 1rem;
  font-size: 12.5px; font-weight: 500;
  color: var(--status-online);
  display: flex; align-items: center; gap: .45rem;
  z-index: 999;
  white-space: nowrap;
  animation: toast-in .2s ease-out;
}
@keyframes toast-in {
  from { opacity: 0; transform: translateX(-50%) translateY(8px); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0); }
}

/* ── Desktop: 2-column layout (≥1024px) ── */
@media (min-width: 1024px) {
  .shell        { display: flex; position: static; }
  .col          { display: flex; position: static; transform: none; overflow: hidden; transition: none; will-change: auto; }
  .col :global(.panel) { width: 100% !important; }
  .col-contacts { flex-shrink: 0; }
  .col-chat     { flex: 1; min-width: 0; }
  .col-context  { display: none; }

  /* Undo slide-class overrides on desktop */
  .has-chat .col-contacts { transform: none; }
  .has-chat .col-chat     { transform: none; }
  .has-context .col-chat    { transform: none; }
  .has-context .col-context { transform: none; }
}

/* ── Wide desktop: show context panel (≥1280px) ── */
@media (min-width: 1280px) {
  .col-context { display: flex; width: 240px; flex-shrink: 0; }
}

.resize-handle {
  display: none;
}
@media (min-width: 1024px) {
  .resize-handle {
    display: block;
    width: 5px;
    flex-shrink: 0;
    cursor: col-resize;
    background: transparent;
    position: relative;
    z-index: 10;
    transition: background .15s;
    touch-action: none;
    user-select: none;
  }
  .resize-handle:hover,
  .resize-handle:active {
    background: var(--accent);
    opacity: .35;
  }
}
</style>
