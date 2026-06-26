<script lang="ts">
  import { go } from '$lib/stores/router';
  import { invoke } from '$lib/utils/tauri';
  import { pendingWords, pendingPin, persistAccount, unlock } from '$lib/stores/auth';
  import { restoreFromBackupFile } from '$lib/utils/backup';
  import { loadHistory } from '$lib/stores/chats';
  import { _ } from '$lib/i18n';
  import LinkDeviceModal from '$lib/components/qr/LinkDeviceModal.svelte';

  let showLinkQr = false;

  let pin   = '';
  let input = '';
  let error = '';
  let loading = false;

  // Phrase restore
  async function restore() {
    const words = input.trim().toLowerCase().split(/\s+/);
    if (words.length !== 24) { error = $_('onboarding.restore.error_words'); return; }
    if (!pin.trim())          { error = $_('onboarding.restore.error_pin'); return; }
    loading = true; error = '';
    try {
      const result = await invoke<{ pin: string; words: string[]; sign_key_hex: string; dh_key_hex: string }>(
        'restore_account', { req: { pin: pin.trim(), words } }
      );
      pendingPin.set(result.pin);
      pendingWords.set(words);
      go('local-unlock-setup');
    } catch {
      error = $_('onboarding.restore.error_invalid');
    } finally {
      loading = false;
    }
  }

  // Backup file restore
  let fileInput: HTMLInputElement;

  async function handleBackupFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    loading = true; error = '';
    try {
      const account = await restoreFromBackupFile(file);
      loadHistory(account.pin);
      await persistAccount(account);
      unlock();
      go('main');
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to restore backup.';
    } finally {
      loading = false;
      fileInput.value = '';
    }
  }
</script>

<div class="wrap">
  <div class="card">
    <button class="back" on:click={() => go('welcome')}>{$_('onboarding.restore.back')}</button>
    <h2>{$_('onboarding.restore.title')}</h2>
    <p class="sub">{$_('onboarding.restore.subtitle')}</p>

    <div class="method-row">
      <div class="method">
        <p class="method-label">Restore from backup file</p>
        <p class="method-hint">Import a <code>.json</code> backup to recover your account, contacts and messages.</p>
        <input type="file" accept=".json" bind:this={fileInput} on:change={handleBackupFile} style="display:none" />
        <button class="btn-secondary" disabled={loading} on:click={() => fileInput.click()}>
          Import backup file
        </button>
      </div>

      <div class="divider"><span>or</span></div>

      <div class="method">
        <p class="method-label">Link from existing device</p>
        <p class="method-hint">On your other device open Settings, tap <strong>Link device</strong>, then scan the QR code shown here.</p>
        <button class="btn-secondary" on:click={() => showLinkQr = true}>
          Show link QR code
        </button>
      </div>

      <div class="divider"><span>or</span></div>

      <div class="method">
        <p class="method-label">Restore with recovery phrase</p>
        <div class="fields">
          <div class="field">
            <label for="pin">{$_('onboarding.restore.pin_label')}</label>
            <input id="pin" type="text" bind:value={pin}
                   placeholder={$_('onboarding.restore.pin_placeholder')} autocomplete="off" />
          </div>
          <div class="field">
            <label for="phrase">
              {$_('onboarding.restore.phrase_label')}
              <span class="hint">{$_('onboarding.restore.phrase_hint')}</span>
            </label>
            <textarea
              id="phrase"
              bind:value={input}
              placeholder={$_('onboarding.restore.phrase_placeholder')}
              rows="4"
              autocomplete="off"
              autocorrect="off"
              autocapitalize="none"
              spellcheck="false"
            ></textarea>
          </div>
        </div>
        <button class="btn-primary" on:click={restore} disabled={loading}>
          {loading ? $_('onboarding.restore.restoring') : $_('onboarding.restore.submit')}
        </button>
      </div>
    </div>

    {#if error}<p class="error">{error}</p>{/if}
  </div>
</div>

<LinkDeviceModal bind:open={showLinkQr} mode="show" />

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
  max-width: 480px; width: 100%;
  box-shadow: var(--shadow-lg);
}
.back { color: var(--text-muted); font-size: 13px; margin-bottom: 1.5rem; display: block; }
.back:hover { color: var(--text); }
h2 { font-size: 20px; font-weight: 700; margin-bottom: .4rem; }
.sub { font-size: 13px; color: var(--text-muted); line-height: 1.6; margin-bottom: 1.75rem; }

.method-row { display: flex; flex-direction: column; gap: 0; }
.method { display: flex; flex-direction: column; gap: .75rem; }
.method-label { font-size: 13px; font-weight: 700; color: var(--text-2); }
.method-hint { font-size: 12.5px; color: var(--text-muted); line-height: 1.5; margin: 0; }

.divider {
  display: flex; align-items: center; gap: .75rem;
  margin: 1.5rem 0; color: var(--text-faint); font-size: 12px;
}
.divider::before, .divider::after {
  content: ''; flex: 1; height: 1px; background: var(--border);
}

.fields { display: flex; flex-direction: column; gap: 1rem; }
.field { display: flex; flex-direction: column; gap: .3rem; }
label { font-size: 13px; font-weight: 600; color: var(--text-2); }
.hint { font-weight: 400; color: var(--text-faint); }
input, textarea {
  padding: .6rem .8rem;
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  color: var(--text);
  font-size: 14px;
  resize: none;
  line-height: 1.5;
}
input:focus, textarea:focus { outline: none; border-color: var(--accent); }
.error { color: #ef4444; font-size: 13px; margin-top: 1rem; }

.btn-primary {
  width: 100%; padding: .75rem;
  background: var(--accent); color: #fff;
  border-radius: var(--radius);
  font-size: 14.5px; font-weight: 600;
  transition: opacity .15s; margin-top: .25rem;
}
.btn-primary:hover:not(:disabled) { opacity: .9; }
.btn-primary:disabled { opacity: .4; cursor: not-allowed; }

.btn-secondary {
  width: 100%; padding: .75rem;
  background: var(--surface-2);
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  color: var(--text); font-size: 14.5px; font-weight: 600;
  cursor: pointer; transition: background .12s;
}
.btn-secondary:hover:not(:disabled) { background: var(--surface-3, var(--border)); }
.btn-secondary:disabled { opacity: .4; cursor: not-allowed; }

code { font-size: 11.5px; background: var(--surface-2); padding: 1px 4px; border-radius: 4px; }
</style>
