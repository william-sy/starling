<script lang="ts">
  import { get } from 'svelte/store';
  import { go } from '$lib/stores/router';
  import { pendingWords } from '$lib/stores/auth';
  import { copyText } from '$lib/utils/clipboard';
  import { _ } from '$lib/i18n';

  const words = get(pendingWords);
  let revealed = false;
  let copied   = false;

  async function copyAll() {
    await copyText(words.join(' '));
    copied = true;
    setTimeout(() => copied = false, 2000);
  }
</script>

<div class="wrap">
  <div class="card">
    <h2>{$_('onboarding.recovery_phrase.title')}</h2>
    <p class="sub">
      These 24 words are the <em>only</em> way to recover your account on a new device.
      Write them down in order and store them somewhere safe: offline, not in a
      screenshot or cloud notes app.
    </p>

    {#if !revealed}
      <button class="reveal-btn" on:click={() => revealed = true}>
        {$_('onboarding.recovery_phrase.reveal')}
      </button>
    {:else}
      <div class="grid">
        {#each words as word, i}
          <div class="word-cell">
            <span class="num">{i + 1}</span>
            <span class="word">{word}</span>
          </div>
        {/each}
      </div>

      <button class="copy-link" on:click={copyAll}>
        {copied ? $_('onboarding.recovery_phrase.copy_done') : $_('onboarding.recovery_phrase.copy_all')}
      </button>
    {/if}

    <div class="warning">
      <strong>{$_('onboarding.recovery_phrase.warning_bold')}</strong>
      {$_('onboarding.recovery_phrase.warning')}
    </div>

    <button
      class="btn-primary"
      disabled={!revealed}
      on:click={() => go('recovery-confirm')}
    >
      {$_('onboarding.recovery_phrase.continue')}
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
  max-width: 540px; width: 100%;
  box-shadow: var(--shadow-lg);
}
h2 { font-size: 20px; font-weight: 700; margin-bottom: .5rem; }
.sub { font-size: 13px; color: var(--text-muted); line-height: 1.6; margin-bottom: 1.5rem; }

.reveal-btn {
  width: 100%;
  padding: .8rem;
  border: 2px dashed var(--border);
  border-radius: var(--radius);
  color: var(--text-muted);
  font-size: 14px;
  margin-bottom: 1rem;
  transition: background .1s;
}
.reveal-btn:hover { background: var(--surface-2); }

.grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: .4rem;
  margin-bottom: .75rem;
}
.word-cell {
  display: flex; gap: .35rem; align-items: center;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: .45rem .5rem;
}
.num {
  font-size: 10px;
  color: var(--text-faint);
  min-width: 16px;
  font-variant-numeric: tabular-nums;
}
.word { font-size: 13px; font-weight: 600; color: var(--text); }

.copy-link {
  font-size: 12px;
  color: var(--accent);
  margin-bottom: 1rem;
  display: block;
}
.copy-link:hover { text-decoration: underline; }

.warning {
  font-size: 13px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: var(--radius);
  padding: .75rem 1rem;
  line-height: 1.5;
  color: var(--text-2);
  margin-bottom: 1.5rem;
}
.btn-primary {
  width: 100%; padding: .8rem;
  background: var(--accent); color: #fff;
  border-radius: var(--radius);
  font-size: 15px; font-weight: 600;
  transition: opacity .15s;
}
.btn-primary:hover:not(:disabled) { opacity: .9; }
.btn-primary:disabled { opacity: .4; cursor: not-allowed; }
</style>
