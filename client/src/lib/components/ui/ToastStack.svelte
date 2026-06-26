<script lang="ts">
  import { toasts, dismissToast } from '$lib/stores/notifications';
</script>

{#if $toasts.length}
  <div class="toast-stack" role="region" aria-label="Notifications" aria-live="polite">
    {#each $toasts as toast (toast.id)}
      <div class="toast" on:click={() => dismissToast(toast.id)}>
        <div class="toast-title">{toast.title}</div>
        {#if toast.body}
          <div class="toast-body">{toast.body}</div>
        {/if}
      </div>
    {/each}
  </div>
{/if}

<style>
.toast-stack {
  position: fixed;
  top: max(env(safe-area-inset-top), 12px);
  right: 14px;
  z-index: 1200;
  display: flex;
  flex-direction: column;
  gap: .45rem;
  pointer-events: none;
}

.toast {
  pointer-events: auto;
  max-width: 280px;
  padding: .6rem .8rem;
  border-radius: 12px;
  background: oklch(0.18 0.01 250 / 0.92);
  color: oklch(0.96 0 0);
  backdrop-filter: blur(12px) saturate(1.4);
  -webkit-backdrop-filter: blur(12px) saturate(1.4);
  box-shadow: 0 4px 16px oklch(0 0 0 / 0.32);
  cursor: pointer;
  animation: toast-in 0.22s cubic-bezier(0.2, 0, 0, 1) both;
}

@media (prefers-color-scheme: light) {
  .toast {
    background: oklch(0.98 0.004 250 / 0.94);
    color: oklch(0.14 0.01 250);
    box-shadow: 0 4px 16px oklch(0 0 0 / 0.14);
  }
}

.toast-title {
  font-size: 12.5px;
  font-weight: 700;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.toast-body {
  font-size: 11.5px;
  opacity: .7;
  margin-top: 2px;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

@keyframes toast-in {
  from { opacity: 0; transform: translateX(28px) scale(0.93); }
  to   { opacity: 1; transform: translateX(0)    scale(1);    }
}

@media (prefers-reduced-motion: reduce) {
  .toast { animation: none; }
}
</style>
