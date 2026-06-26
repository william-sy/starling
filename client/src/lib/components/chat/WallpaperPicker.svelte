<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { settings } from '$lib/stores/settings';

  export let threadId: string;
  export let show: boolean = false;

  const dispatch = createEventDispatcher<{ close: void }>();

  const PRESETS: { label: string; value: string }[] = [
    { label: 'None',      value: '' },
    { label: 'Dots',      value: 'radial-gradient(circle, oklch(0.5 0.04 250 / 0.18) 1px, transparent 1px) 0 0 / 22px 22px' },
    { label: 'Sunset',    value: 'linear-gradient(135deg, oklch(0.28 0.08 30) 0%, oklch(0.22 0.06 300) 100%)' },
    { label: 'Ocean',     value: 'linear-gradient(160deg, oklch(0.20 0.08 240) 0%, oklch(0.26 0.06 200) 100%)' },
    { label: 'Forest',    value: 'linear-gradient(150deg, oklch(0.18 0.07 160) 0%, oklch(0.24 0.05 200) 100%)' },
    { label: 'Violet',    value: 'linear-gradient(140deg, oklch(0.19 0.09 290) 0%, oklch(0.24 0.06 250) 100%)' },
    { label: 'Warm grey', value: 'linear-gradient(160deg, oklch(0.23 0.01 80) 0%, oklch(0.19 0.01 80) 100%)' },
  ];

  $: current = $settings.chatBackgrounds[threadId] ?? '';

  function select(value: string) {
    settings.save({ chatBackgrounds: { ...$settings.chatBackgrounds, [threadId]: value } });
    dispatch('close');
  }

  function handleImage(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      select(`url("${dataUrl}")`);
    };
    reader.readAsDataURL(file);
  }

  let colorVal = '#1a1a2e';
  function applyColor() {
    select(colorVal);
  }
</script>

{#if show}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="backdrop" on:click|self={() => dispatch('close')}>
    <div class="picker">
      <div class="picker-header">
        <span>Chat background</span>
        <button class="close-btn" on:click={() => dispatch('close')}>
          <svg viewBox="0 0 14 14" width="14" height="14" fill="none">
            <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          </svg>
        </button>
      </div>

      <div class="presets">
        {#each PRESETS as p}
          <button
            class="swatch"
            class:active={current === p.value}
            style={p.value ? `background: ${p.value}` : ''}
            on:click={() => select(p.value)}
            title={p.label}
          >
            {#if !p.value}<span class="none-label">None</span>{/if}
          </button>
        {/each}
      </div>

      <div class="custom-row">
        <label class="custom-btn">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
            <rect x="1" y="1" width="14" height="14" rx="2" stroke="currentColor" stroke-width="1.4"/>
            <path d="M1 11l4-4 3 3 3-4 4 4" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
          </svg>
          Image
          <input type="file" accept="image/*" on:change={handleImage} style="display:none" />
        </label>

        <div class="color-row">
          <input type="color" bind:value={colorVal} class="color-input" title="Pick color" />
          <button class="custom-btn" on:click={applyColor}>Color</button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
.backdrop {
  position: fixed; inset: 0; z-index: 300;
  display: flex; align-items: flex-end; justify-content: flex-end;
  padding: 0 8px 70px 0;
}

.picker {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: .75rem;
  width: 236px;
  box-shadow: 0 8px 32px oklch(0 0 0 / 0.28);
  animation: pop-in .15s cubic-bezier(0.2, 0, 0, 1) both;
}
@keyframes pop-in {
  from { opacity: 0; transform: scale(0.93) translateY(6px); }
  to   { opacity: 1; transform: scale(1)    translateY(0);   }
}
@media (prefers-reduced-motion: reduce) { .picker { animation: none; } }

.picker-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: .6rem;
  font-size: 11.5px; font-weight: 700; opacity: .7; text-transform: uppercase; letter-spacing: .05em;
}
.close-btn {
  background: none; border: none; padding: 2px; cursor: pointer;
  color: var(--text-muted); border-radius: 4px;
  display: flex; align-items: center; justify-content: center;
}
.close-btn:hover { color: var(--text); }

.presets {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: .4rem;
  margin-bottom: .6rem;
}

.swatch {
  aspect-ratio: 1; border-radius: 8px; cursor: pointer;
  border: 2px solid transparent;
  background: var(--surface-2);
  transition: border-color .1s, transform .1s;
  display: flex; align-items: center; justify-content: center;
}
.swatch:hover { transform: scale(1.06); }
.swatch.active { border-color: var(--accent); }
.none-label { font-size: 9px; opacity: .5; font-weight: 600; }

.custom-row {
  display: flex; gap: .4rem; align-items: center;
}
.custom-btn {
  flex: 1; display: flex; align-items: center; justify-content: center; gap: .3rem;
  padding: .4rem; border-radius: 8px;
  background: var(--surface-2); border: 1px solid var(--border);
  font-size: 11.5px; font-weight: 600; cursor: pointer; color: var(--text);
  transition: background .1s;
}
.custom-btn:hover { background: var(--surface-3, var(--border)); }

.color-row { flex: 1; display: flex; gap: .3rem; align-items: center; }
.color-input {
  width: 28px; height: 28px; border-radius: 6px; border: 1px solid var(--border);
  padding: 0; cursor: pointer; background: none; flex-shrink: 0;
}
</style>
