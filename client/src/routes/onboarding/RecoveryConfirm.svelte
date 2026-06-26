<script lang="ts">
  import { get } from 'svelte/store';
  import { go } from '$lib/stores/router';
  import { invoke } from '$lib/utils/tauri';
  import { pendingWords } from '$lib/stores/auth';
  import { _ } from '$lib/i18n';

  const words  = get(pendingWords);

  const indices = pickThree(words.length);
  let answers: Record<number, string> = {};
  let errors:  Record<number, boolean> = {};
  let checked = false;

  function pickThree(len: number): number[] {
    const pool = Array.from({ length: len }, (_, i) => i);
    const out: number[] = [];
    while (out.length < 3) {
      const i = Math.floor(Math.random() * pool.length);
      out.push(pool.splice(i, 1)[0]);
    }
    return out.sort((a, b) => a - b);
  }

  async function verify() {
    checked = true;
    errors = {};
    let ok = true;
    for (const idx of indices) {
      const correct = await invoke<boolean>('verify_phrase_word', {
        words,
        index: idx,
        guess: (answers[idx] ?? '').trim().toLowerCase(),
      });
      if (!correct) { errors[idx] = true; ok = false; }
    }
    if (ok) go('local-unlock-setup');
  }
</script>

<div class="wrap">
  <div class="card">
    <h2>{$_('onboarding.recovery_confirm.title')}</h2>
    <p class="sub">
      {$_('onboarding.recovery_confirm.subtitle')}
    </p>

    <div class="slots">
      {#each indices as idx}
        <div class="slot">
          <label for="w{idx}">{$_('onboarding.recovery_confirm.word_label', { values: { n: idx + 1 } })}</label>
          <input
            id="w{idx}"
            type="text"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="none"
            spellcheck="false"
            bind:value={answers[idx]}
            class:err={errors[idx]}
            placeholder={$_('onboarding.recovery_confirm.word_placeholder')}
          />
          {#if errors[idx]}
            <span class="err-msg">{$_('onboarding.recovery_confirm.word_error')}</span>
          {/if}
        </div>
      {/each}
    </div>

    <button class="btn-primary" on:click={verify}>
      {$_('onboarding.recovery_confirm.confirm')}
    </button>

    <button class="back" on:click={() => go('recovery-phrase')}>
      {$_('onboarding.recovery_confirm.back')}
    </button>
  </div>
</div>

<style>
.wrap {
  min-height: 100%;
  display: flex; align-items: center; justify-content: center;
  background: var(--bg); padding: 1.5rem;
}
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  padding: 2.5rem;
  max-width: 420px; width: 100%;
  box-shadow: var(--shadow-lg);
}
h2 { font-size: 20px; font-weight: 700; margin-bottom: .5rem; }
.sub { font-size: 13px; color: var(--text-muted); line-height: 1.6; margin-bottom: 1.5rem; }

.slots { display: flex; flex-direction: column; gap: 1rem; margin-bottom: 1.5rem; }
.slot { display: flex; flex-direction: column; gap: .3rem; }
label { font-size: 13px; font-weight: 600; color: var(--text-2); }
input {
  padding: .6rem .8rem;
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  color: var(--text);
  font-size: 15px;
  font-weight: 600;
  transition: border-color .15s;
}
input:focus { outline: none; border-color: var(--accent); }
input.err { border-color: #ef4444; }
.err-msg { font-size: 12px; color: #ef4444; }

.btn-primary {
  width: 100%; padding: .8rem;
  background: var(--accent); color: #fff;
  border-radius: var(--radius);
  font-size: 15px; font-weight: 600;
  transition: opacity .15s;
  margin-bottom: .75rem;
}
.btn-primary:hover { opacity: .9; }
.back {
  display: block; text-align: center;
  font-size: 13px; color: var(--text-muted);
}
.back:hover { color: var(--text); }
</style>
