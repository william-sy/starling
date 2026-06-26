<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher<{ close: void }>();

  export let open  = false;
  export let title = '';
  export let width = '600px';

  function close() { dispatch('close'); }

  function onBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) close();
  }

  function onKeydown(e: KeyboardEvent) {
    if (open && e.key === 'Escape') close();
  }

  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return { destroy() {} };
  }
</script>

<svelte:window on:keydown={onKeydown} />

{#if open}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="backdrop" use:portal on:click={onBackdrop} role="dialog" aria-modal="true" aria-label={title}>
    <div class="box" style="max-width:{width}">
      <div class="modal-header">
        <h2 class="modal-title">{title}</h2>
        <button class="close-btn" on:click={close} aria-label="Close">
          <svg viewBox="0 0 12 12" fill="none" width="12" height="12" aria-hidden="true">
            <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
      <div class="modal-body">
        <slot />
      </div>
    </div>
  </div>
{/if}

<style>
.backdrop {
  position: fixed; inset: 0;
  z-index: 150;
  background: oklch(0 0 0 / 0.55);
  backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  padding: 1.5rem;
}

.box {
  width: 100%;
  max-height: calc(100vh - 3rem);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg);
  display: flex; flex-direction: column;
  overflow: hidden;
}

.modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 1.1rem 1.4rem .9rem;
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
}
.modal-title {
  font-size: 16px; font-weight: 700;
  letter-spacing: -0.025em;
  color: var(--text);
}
.close-btn {
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px;
  border-radius: var(--radius);
  color: var(--text-muted);
  transition: color .12s, background .12s;
}
.close-btn:hover { color: var(--text); background: var(--surface-2); }

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 1.25rem 1.4rem 1.5rem;
}
.modal-body::-webkit-scrollbar { width: 3px; }
.modal-body::-webkit-scrollbar-thumb { background: var(--border); border-radius: 99px; }
</style>
