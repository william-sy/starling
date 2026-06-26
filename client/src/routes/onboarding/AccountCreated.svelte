<script lang="ts">
  import { get } from 'svelte/store';
  import { go } from '$lib/stores/router';
  import { pendingPin } from '$lib/stores/auth';
  import { copyText } from '$lib/utils/clipboard';
  import { _ } from '$lib/i18n';

  const pin = get(pendingPin);
  let copied = false;

  async function copyPin() {
    await copyText(pin);
    copied = true;
    setTimeout(() => copied = false, 2000);
  }
</script>

<div class="wrap">
  <div class="card">
    <div class="icon-row">
      <div class="check-circle">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
          <path d="M5 12L10 17L19 7" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
    </div>
    <h2>{$_('onboarding.account_created.title')}</h2>
    <p class="sub">
      This is your <strong>PIN</strong>: your address, your identity.
      Share it with people you want to chat with.
    </p>

    <div class="pin-box">
      <span class="pin">{pin}</span>
    </div>
    <button class="copy-btn" on:click={copyPin}>
      <svg viewBox="0 0 16 16" fill="none" width="13" height="13" aria-hidden="true">
        {#if copied}
          <path d="M3 8l3.5 3.5 6.5-7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        {:else}
          <rect x="5.5" y="1.5" width="9" height="11" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
          <path d="M3.5 4.5H2.5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1v-1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        {/if}
      </svg>
      {copied ? $_('onboarding.account_created.copied') : $_('onboarding.account_created.copy')}
    </button>

    <div class="notice">
      <strong>{$_('onboarding.account_created.notice_bold')}</strong>
      {$_('onboarding.account_created.notice')}
    </div>

    <button class="btn-primary" on:click={() => go('recovery-phrase')}>
      {$_('onboarding.account_created.next')}
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
  max-width: 440px; width: 100%;
  box-shadow: var(--shadow-lg);
  text-align: center;
}
.icon-row { display: flex; justify-content: center; margin-bottom: 1rem; }
.check-circle {
  width: 56px; height: 56px; border-radius: 50%;
  background: var(--accent);
  display: flex; align-items: center; justify-content: center;
}
h2 { font-size: 20px; font-weight: 700; margin-bottom: .5rem; }
.sub { font-size: 13px; color: var(--text-muted); line-height: 1.6; margin-bottom: 1.5rem; }
.pin-box {
  background: var(--surface-2);
  border: 2px solid var(--accent);
  border-radius: var(--radius-lg);
  padding: 1rem 1.25rem;
  margin-bottom: .75rem;
}
.pin {
  display: block;
  font-size: clamp(15px, 4.5vw, 19px);
  font-weight: 700;
  letter-spacing: .08em;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
  word-break: break-all;
}
.copy-btn {
  display: inline-flex; align-items: center; gap: .35rem;
  font-size: 12.5px; font-weight: 500;
  padding: .4rem .9rem;
  border: 1.5px solid var(--border);
  border-radius: 99px;
  color: var(--text-muted);
  background: var(--surface);
  margin-bottom: 1.25rem;
  transition: background .12s, border-color .12s, color .12s;
}
.copy-btn:hover { background: var(--surface-2); border-color: var(--accent); color: var(--accent); }
.notice {
  font-size: 13px;
  color: var(--text-2);
  background: oklch(from var(--accent) 0.96 0.04 85);
  border: 1px solid oklch(from var(--accent) 0.88 0.08 85);
  border-radius: var(--radius);
  padding: .75rem 1rem;
  text-align: left;
  margin-bottom: 1.5rem;
  line-height: 1.5;
}
.btn-primary {
  width: 100%; padding: .8rem;
  background: var(--accent); color: #fff;
  border-radius: var(--radius);
  font-size: 15px; font-weight: 600;
  transition: opacity .15s;
}
.btn-primary:hover { opacity: .9; }
</style>
