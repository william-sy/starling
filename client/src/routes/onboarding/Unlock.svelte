<script lang="ts">
  import { go } from '$lib/stores/router';
  import { account, unlock } from '$lib/stores/auth';
  import { get } from 'svelte/store';
  import { _ } from '$lib/i18n';

  const a = get(account);
  let pin   = '';
  let error = '';

  async function attempt() {
    if (!pin.trim()) { error = $_('onboarding.unlock.error_empty'); return; }

    const stored = a?.pin ? localStorage.getItem(`mwt:device_pin:${a.pin}`) : null;
    if (stored) {
      let ok = pin.trim() === stored; // plain fallback (HTTP context)
      if (!ok && crypto.subtle) {
        try {
          const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin.trim()));
          const hashHex = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
          ok = hashHex === stored;
        } catch { ok = false; }
      }
      if (!ok) { error = $_('onboarding.unlock.error_wrong'); return; }
    }

    unlock();
    go('main');
  }

  function handleKey(e: KeyboardEvent) {
    if (e.key === 'Enter') attempt();
  }
</script>

<div class="wrap">
  <div class="card">
    <div class="avatar-slot">
      {#if a?.display_name}
        <div class="avatar-initial">{a.display_name[0].toUpperCase()}</div>
        <p class="name">{a.display_name}</p>
      {:else}
        <span class="bird">🐦</span>
      {/if}
    </div>

    <p class="prompt">{$_('onboarding.unlock.prompt')}</p>

    <input
      type="password"
      bind:value={pin}
      on:keydown={handleKey}
      placeholder={$_('onboarding.unlock.placeholder')}
      autocomplete="current-password"
    />

    {#if error}<p class="error">{error}</p>{/if}

    <button class="btn-primary" on:click={attempt}>{$_('onboarding.unlock.unlock')}</button>

    <button class="link" on:click={() => go('restore-account')}>
      {$_('onboarding.unlock.restore_link')}
    </button>
  </div>
</div>

<style>
.wrap {
  min-height: 100%;
  display: flex; align-items: center; justify-content: center;
  background: var(--panel-header); padding: 1.5rem;
}
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  padding: 2.5rem;
  max-width: 340px; width: 100%;
  box-shadow: var(--shadow-lg);
  text-align: center;
}
.avatar-slot { margin-bottom: 1.25rem; }
.avatar-initial {
  width: 64px; height: 64px;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  font-size: 28px;
  font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  margin: 0 auto .5rem;
}
.bird { font-size: 48px; }
.name { font-size: 17px; font-weight: 600; color: var(--text); }
.prompt { font-size: 13px; color: var(--text-muted); margin-bottom: 1rem; }
input {
  width: 100%;
  padding: .65rem .8rem;
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  color: var(--text);
  font-size: 15px;
  text-align: center;
  letter-spacing: .25em;
  margin-bottom: .5rem;
}
input:focus { outline: none; border-color: var(--accent); }
.error { color: #ef4444; font-size: 13px; margin-bottom: .75rem; }
.btn-primary {
  width: 100%; padding: .75rem;
  background: var(--accent); color: #fff;
  border-radius: var(--radius);
  font-size: 15px; font-weight: 600;
  transition: opacity .15s;
  margin-bottom: 1rem;
}
.btn-primary:hover { opacity: .9; }
.link { font-size: 12px; color: var(--text-muted); }
.link:hover { color: var(--text); }
</style>
