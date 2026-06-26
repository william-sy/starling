<script lang="ts">
  import { createEventDispatcher, tick } from 'svelte';

  export let show = false;

  const dispatch = createEventDispatcher<{ send: { question: string; options: string[] }; close: void }>();

  let question = '';
  let options  = ['', ''];
  let optEls: HTMLInputElement[] = [];

  function addOption() {
    if (options.length >= 6) return;
    options = [...options, ''];
    tick().then(() => optEls[options.length - 1]?.focus());
  }

  function removeOption(i: number) {
    if (options.length <= 2) return;
    options = options.filter((_, idx) => idx !== i);
  }

  function handleKey(e: KeyboardEvent, i: number) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (i < options.length - 1) optEls[i + 1]?.focus();
      else addOption();
    }
    if (e.key === 'Backspace' && options[i] === '' && options.length > 2) {
      e.preventDefault();
      removeOption(i);
      tick().then(() => optEls[Math.max(0, i - 1)]?.focus());
    }
  }

  function send() {
    const q = question.trim();
    const opts = options.map(o => o.trim()).filter(Boolean);
    if (!q || opts.length < 2) return;
    dispatch('send', { question: q, options: opts });
    reset();
  }

  function reset() {
    question = '';
    options  = ['', ''];
    show     = false;
  }

  $: valid = question.trim().length > 0 && options.filter(o => o.trim()).length >= 2;
</script>

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
{#if show}
  <div class="backdrop" on:click={() => dispatch('close')}>
    <div class="builder" on:click|stopPropagation role="dialog" aria-label="Create poll">
      <div class="builder-header">
        <span class="builder-title">New poll</span>
        <button class="close-btn" on:click={() => dispatch('close')} aria-label="Close">
          <svg viewBox="0 0 12 12" width="12" height="12" fill="none">
            <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
          </svg>
        </button>
      </div>

      <input
        class="question-input"
        bind:value={question}
        placeholder="Ask a question..."
        maxlength="200"
        aria-label="Poll question"
        on:keydown={e => e.key === 'Enter' && optEls[0]?.focus()}
      />

      <ul class="opts-list">
        {#each options as opt, i}
          <li class="opt-row">
            <span class="opt-bullet">{i + 1}</span>
            <input
              class="opt-input"
              bind:value={options[i]}
              bind:this={optEls[i]}
              placeholder="Option {i + 1}"
              maxlength="100"
              aria-label="Option {i + 1}"
              on:keydown={e => handleKey(e, i)}
            />
            {#if options.length > 2}
              <button class="remove-btn" on:click={() => removeOption(i)} aria-label="Remove option {i + 1}" tabindex="-1">
                <svg viewBox="0 0 10 10" width="10" height="10" fill="none">
                  <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
                </svg>
              </button>
            {/if}
          </li>
        {/each}
      </ul>

      {#if options.length < 6}
        <button class="add-btn" on:click={addOption}>
          <svg viewBox="0 0 12 12" width="11" height="11" fill="none">
            <path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
          </svg>
          Add option
        </button>
      {/if}

      <button class="send-btn" disabled={!valid} on:click={send}>
        Send poll
      </button>
    </div>
  </div>
{/if}

<style>
.backdrop {
  position: fixed; inset: 0; z-index: 60;
  background: oklch(0 0 0 / 0.55);
  display: flex; align-items: flex-start; justify-content: center;
  padding: 10vh 1rem 0;
}

.builder {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: 0 8px 32px oklch(0 0 0 / 0.22);
  padding: 1rem;
  width: min(360px, 100%);
  max-height: 70vh;
  overflow-y: auto;
  display: flex; flex-direction: column; gap: .65rem;
  animation: pop-in .15s cubic-bezier(.25, 1, .5, 1);
}
@keyframes pop-in {
  from { opacity: 0; transform: translateY(10px) scale(.97); }
  to   { opacity: 1; transform: translateY(0)    scale(1);   }
}
@media (prefers-reduced-motion: reduce) { .builder { animation: none; } }

.builder-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: .1rem;
}
.builder-title {
  font-size: 13px; font-weight: 700; color: var(--text);
  letter-spacing: -0.01em;
}
.close-btn {
  width: 24px; height: 24px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  color: var(--text-muted);
  transition: background .1s, color .1s;
}
.close-btn:hover { background: var(--surface-2); color: var(--text); }

.question-input {
  width: 100%;
  padding: .5rem .65rem;
  border-radius: var(--radius);
  border: 1.5px solid var(--border);
  background: var(--surface-2);
  color: var(--text);
  font-size: 13.5px; font-weight: 600;
  transition: border-color .15s;
}
.question-input:focus { outline: none; border-color: var(--accent); }
.question-input::placeholder { color: var(--text-faint); font-weight: 400; }

.opts-list {
  display: flex; flex-direction: column; gap: 5px;
  list-style: none; padding: 0; margin: 0;
}
.opt-row {
  display: flex; align-items: center; gap: .45rem;
}
.opt-bullet {
  font-size: 11px; font-weight: 700; color: var(--text-faint);
  min-width: 1ch; text-align: right;
}
.opt-input {
  flex: 1;
  padding: .38rem .55rem;
  border-radius: var(--radius);
  border: 1.5px solid var(--border);
  background: var(--surface-2);
  color: var(--text);
  font-size: 13px;
  transition: border-color .15s;
}
.opt-input:focus { outline: none; border-color: var(--accent); }
.opt-input::placeholder { color: var(--text-faint); }
.remove-btn {
  width: 20px; height: 20px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  color: var(--text-faint);
  flex-shrink: 0;
  transition: background .1s, color .1s;
}
.remove-btn:hover { background: var(--surface-3); color: var(--text-muted); }

.add-btn {
  display: flex; align-items: center; gap: .4rem;
  font-size: 12.5px; color: var(--accent);
  padding: .25rem 0;
  align-self: flex-start;
  transition: opacity .1s;
}
.add-btn:hover { opacity: .75; }

.send-btn {
  padding: .52rem;
  border-radius: var(--radius);
  background: var(--accent);
  color: #fff;
  font-size: 13px; font-weight: 700;
  letter-spacing: -0.01em;
  transition: opacity .12s;
  margin-top: .15rem;
}
.send-btn:hover:not(:disabled) { opacity: .88; }
.send-btn:disabled { opacity: .4; cursor: not-allowed; }
</style>
