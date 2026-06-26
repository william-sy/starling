<script lang="ts">
  import { get } from 'svelte/store';
  import { go } from '$lib/stores/router';
  import { invoke } from '$lib/utils/tauri';
  import { pendingPin, pendingWords, pendingRelayUrl, persistAccount } from '$lib/stores/auth';
  import { DEFAULT_RELAY_WS } from '$lib/stores/relay';
  import { _ } from '$lib/i18n';

  let displayName = '';
  let notifName   = '';
  let pin1        = '';
  let pin2        = '';
  let error       = '';
  let loading     = false;

  $: mismatch = pin1 && pin2 && pin1 !== pin2;

  async function finish() {
    if (!displayName.trim()) { error = $_('onboarding.local_unlock_setup.error_name'); return; }
    if (pin1.length < 4)     { error = $_('onboarding.local_unlock_setup.error_pin_short'); return; }
    if (pin1 !== pin2)       { error = $_('onboarding.local_unlock_setup.error_pin_match'); return; }
    loading = true;
    error   = '';
    try {
      const accountPin  = get(pendingPin);
      const words       = get(pendingWords);
      const relayUrl    = get(pendingRelayUrl) || DEFAULT_RELAY_WS;

      const result = await invoke<{ sign_key_hex: string; dh_key_hex: string; dh_priv_hex?: string }>('restore_account', {
        req: { pin: accountPin, words }
      });

      await persistAccount({
        pin:          accountPin,
        display_name: displayName.trim(),
        notif_name:   (notifName.trim() || displayName.trim()),
        sign_key_hex: result.sign_key_hex,
        dh_key_hex:   result.dh_key_hex,
        ...(result.dh_priv_hex ? { dh_priv_hex: result.dh_priv_hex } : {}),
        tier:         'pigeon',
        relay_url:    relayUrl,
      });

      // Store device PIN for unlock verification.
      // crypto.subtle requires a secure context (HTTPS/localhost); fall back to plain on HTTP.
      try {
        const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin1));
        const hashHex = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
        localStorage.setItem(`mwt:device_pin:${accountPin}`, hashHex);
      } catch {
        localStorage.setItem(`mwt:device_pin:${accountPin}`, pin1);
      }

      pendingWords.set([]);
      pendingPin.set('');
      pendingRelayUrl.set('');

      go('main');
    } catch (e: any) {
      error = e?.toString() ?? 'Setup failed';
    } finally {
      loading = false;
    }
  }
</script>

<div class="wrap">
  <div class="card">
    <h2>{$_('onboarding.local_unlock_setup.title')}</h2>
    <p class="sub">{$_('onboarding.local_unlock_setup.subtitle')}</p>

    <div class="fields">
      <div class="field">
        <label for="dname">{$_('onboarding.local_unlock_setup.display_name_label')}</label>
        <input id="dname" type="text" bind:value={displayName}
               placeholder={$_('onboarding.local_unlock_setup.display_name_placeholder')} maxlength="40" />
      </div>
      <div class="field">
        <label for="nname">
          {$_('onboarding.local_unlock_setup.notif_name_label')}
          <span class="hint">{$_('onboarding.local_unlock_setup.notif_name_hint')}</span>
        </label>
        <input id="nname" type="text" bind:value={notifName}
               placeholder={$_('onboarding.local_unlock_setup.notif_name_placeholder')} maxlength="40" />
      </div>

      <div class="divider"></div>

      <div class="field">
        <label for="p1">{$_('onboarding.local_unlock_setup.device_pin_label')}</label>
        <p class="field-hint">{$_('onboarding.local_unlock_setup.device_pin_hint')}</p>
        <input id="p1" type="password" bind:value={pin1}
               placeholder={$_('onboarding.local_unlock_setup.device_pin_placeholder')}
               autocomplete="new-password" />
      </div>
      <div class="field">
        <label for="p2">{$_('onboarding.local_unlock_setup.confirm_pin_label')}</label>
        <input
          id="p2" type="password" bind:value={pin2}
          placeholder={$_('onboarding.local_unlock_setup.confirm_pin_placeholder')}
          autocomplete="new-password"
          class:err={mismatch}
        />
        {#if mismatch}<span class="err-msg">{$_('onboarding.local_unlock_setup.pin_mismatch')}</span>{/if}
      </div>
    </div>

    {#if error}<p class="error">{error}</p>{/if}

    <button class="btn-primary" on:click={finish} disabled={loading || !!mismatch}>
      {loading ? $_('onboarding.local_unlock_setup.saving') : $_('onboarding.local_unlock_setup.start')}
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
}
h2 { font-size: 20px; font-weight: 700; margin-bottom: .4rem; }
.sub { font-size: 13px; color: var(--text-muted); line-height: 1.6; margin-bottom: 1.5rem; }
.fields { display: flex; flex-direction: column; gap: 1rem; margin-bottom: 1.5rem; }
.field { display: flex; flex-direction: column; gap: .3rem; }
label { font-size: 13px; font-weight: 600; color: var(--text-2); }
.hint { font-weight: 400; color: var(--text-faint); }
.field-hint { font-size: 12px; color: var(--text-muted); }
input {
  padding: .6rem .8rem;
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  color: var(--text);
  font-size: 14px;
  transition: border-color .15s;
}
input:focus { outline: none; border-color: var(--accent); }
input.err { border-color: #ef4444; }
.err-msg { font-size: 12px; color: #ef4444; }
.divider { border-top: 1px solid var(--border-subtle); margin: .25rem 0; }
.error { color: #ef4444; font-size: 13px; margin-bottom: 1rem; }
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
