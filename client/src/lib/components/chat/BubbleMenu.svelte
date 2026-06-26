<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { Message } from '$lib/stores/chats';

  export let msg: Message;
  export let x = 0;
  export let y = 0;
  export let pinned = false;
  export let is_broadcast = false;

  const dispatch = createEventDispatcher<{ reply: Message; react: void; edit: void; delete: 'me' | 'everyone'; close: void; pin: void }>();

  function pick(action: () => void) {
    action();
    dispatch('close');
  }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
<div
  class="menu"
  style="left: {x}px; top: {y}px"
  role="menu"
  on:click|stopPropagation
>
  <button class="item" role="menuitem" on:click={() => pick(() => dispatch('react'))}>
    <svg viewBox="0 0 14 14" width="13" height="13" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.3"/>
      <path d="M4.5 8.5c.6.9 4 .9 5 0" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
      <circle cx="5.2" cy="6" r=".7" fill="currentColor"/>
      <circle cx="8.8" cy="6" r=".7" fill="currentColor"/>
    </svg>
    React
  </button>
  {#if !is_broadcast}
  <button class="item" role="menuitem" on:click={() => pick(() => dispatch('reply', msg))}>
    <svg viewBox="0 0 14 14" width="13" height="13" fill="none" aria-hidden="true">
      <path d="M1 5h8a4 4 0 010 8H6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M4 2L1 5l3 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    Reply
  </button>
  {/if}

  <button class="item" role="menuitem" on:click={() => pick(() => dispatch('pin'))}>
    <svg viewBox="0 0 14 14" width="13" height="13" fill="none" aria-hidden="true">
      <path d="M9 1l4 4-1.5 1.5-1-.5L7 9.5V12l-1 1-1.5-3-3-1.5L2.5 8l2.5-3.5-.5-1L6 2z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" fill={pinned ? 'currentColor' : 'none'}/>
      {#if pinned}
        <path d="M2 12l2.5-2.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
      {/if}
    </svg>
    {pinned ? 'Unpin' : 'Pin'}
  </button>

  {#if msg.is_me && msg.receipt_status !== 'read' && !msg.deleted && msg.kind !== 'image' && msg.kind !== 'audio' && msg.kind !== 'poll'}
    <button class="item" role="menuitem" on:click={() => pick(() => dispatch('edit'))}>
      <svg viewBox="0 0 14 14" width="13" height="13" fill="none" aria-hidden="true">
        <path d="M9.5 2.5l2 2L4 12H2v-2L9.5 2.5z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      Edit
    </button>
  {/if}

  <button class="item" role="menuitem" on:click={() => pick(() => dispatch('delete', 'me'))}>
    <svg viewBox="0 0 14 14" width="13" height="13" fill="none" aria-hidden="true">
      <path d="M2 4h10M5 4V2h4v2M6 7v4M8 7v4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="3" y="4" width="8" height="9" rx="1" stroke="currentColor" stroke-width="1.4"/>
    </svg>
    Delete for me
  </button>

  {#if msg.is_me}
    <button class="item danger" role="menuitem" on:click={() => pick(() => dispatch('delete', 'everyone'))}>
      <svg viewBox="0 0 14 14" width="13" height="13" fill="none" aria-hidden="true">
        <path d="M2 4h10M5 4V2h4v2M6 7v4M8 7v4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
        <rect x="3" y="4" width="8" height="9" rx="1" stroke="currentColor" stroke-width="1.4"/>
      </svg>
      Delete for everyone
    </button>
  {/if}
</div>

<style>
.menu {
  position: fixed;
  z-index: 80;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: 0 4px 20px oklch(0 0 0 / 0.14);
  padding: .3rem;
  min-width: 170px;
  display: flex; flex-direction: column;
}

.item {
  display: flex; align-items: center; gap: .55rem;
  padding: .5rem .7rem;
  border-radius: calc(var(--radius) - 2px);
  font-size: 13px;
  color: var(--text);
  text-align: left;
  transition: background .1s;
}
.item:hover { background: var(--surface-2); }
.item.danger { color: oklch(0.58 0.2 25); }
.item.danger:hover { background: oklch(0.58 0.2 25 / 0.08); }
</style>
