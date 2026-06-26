<script lang="ts">
  import { go } from '$lib/stores/router';
  import { invoke } from '$lib/utils/tauri';
  import { pendingWords, pendingPin, pendingRelayUrl } from '$lib/stores/auth';
  import LegalModal from '$lib/components/ui/LegalModal.svelte';
  import { _ } from '$lib/i18n';

  let ageChecked     = false;
  let termsChecked   = false;
  let privacyChecked = false;
  let loading        = false;
  let error          = '';
  let legalOpen: 'terms' | 'privacy' | null = null;

  $: canProceed = ageChecked && termsChecked && privacyChecked;

  function openLegal(type: 'terms' | 'privacy', e: Event) {
    e.preventDefault();
    e.stopPropagation();
    legalOpen = type;
  }

  async function proceed() {
    if (!canProceed) return;
    loading = true; error = '';
    try {
      const result = await invoke<{ pin: string; words: string[] }>('generate_account');
      pendingPin.set(result.pin);
      pendingWords.set(result.words);
      pendingRelayUrl.set('');
      go('relay-picker');
    } catch (e: any) {
      error = $_('onboarding.age_gate.error');
    } finally {
      loading = false;
    }
  }
</script>

{#if legalOpen}
  <LegalModal type={legalOpen} onClose={() => legalOpen = null} />
{/if}

<div class="wrap">
  <div class="card">
    <button class="back" on:click={() => go('welcome')}>{$_('onboarding.age_gate.back')}</button>

    <h2>{$_('onboarding.age_gate.title')}</h2>
    <p class="sub">{$_('onboarding.age_gate.subtitle')}</p>

    <div class="checks">
      <label class="check-row" class:checked={ageChecked}>
        <input type="checkbox" bind:checked={ageChecked} />
        <span>{$_('onboarding.age_gate.age_check')}</span>
      </label>

      <label class="check-row" class:checked={termsChecked}>
        <input type="checkbox" bind:checked={termsChecked} />
        <span>
          I have read and agree to the
          <button class="link" on:click={(e) => openLegal('terms', e)}>{$_('onboarding.age_gate.terms_link')}</button>.
          I understand Starling cannot read my messages and I am responsible for content I send.
        </span>
      </label>

      <label class="check-row" class:checked={privacyChecked}>
        <input type="checkbox" bind:checked={privacyChecked} />
        <span>
          I have read the
          <button class="link" on:click={(e) => openLegal('privacy', e)}>{$_('onboarding.age_gate.privacy_link')}</button>
          and understand how my data is processed under EU GDPR.
          Supervisory authority: Autoriteit Persoonsgegevens (Netherlands).
        </span>
      </label>
    </div>

    {#if error}<p class="error">{error}</p>{/if}

    <button class="btn-primary" disabled={!canProceed || loading} on:click={proceed}>
      {loading ? $_('onboarding.age_gate.creating') : $_('onboarding.age_gate.submit')}
    </button>
  </div>
</div>

<style>
.wrap {
  min-height: 100%;
  overflow-y: auto;
  display: flex; align-items: flex-start; justify-content: center;
  background: var(--bg); padding: 1.5rem;
}
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  padding: 1.75rem 2rem;
  max-width: 480px; width: 100%;
  box-shadow: var(--shadow-lg);
  margin: auto;
}
.back {
  color: var(--text-muted); font-size: 13px;
  margin-bottom: 1.25rem; display: block;
}
.back:hover { color: var(--text); }
h2 { font-size: 19px; font-weight: 700; margin-bottom: .3rem; }
.sub { color: var(--text-muted); font-size: 13px; margin-bottom: 1.25rem; }

.checks { display: flex; flex-direction: column; gap: .65rem; margin-bottom: 1.25rem; }
.check-row {
  display: flex; gap: .7rem; align-items: flex-start;
  cursor: pointer;
  padding: .75rem;
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  font-size: 12.5px; line-height: 1.55; color: var(--text-2);
  transition: border-color .15s, background .15s;
}
.check-row:hover { background: var(--surface-2); }
.check-row.checked { border-color: var(--accent); background: #f0fdf4; }
.check-row input[type=checkbox] {
  margin-top: 1px; flex-shrink: 0;
  width: 15px; height: 15px; accent-color: var(--accent);
}
.link {
  color: var(--accent); text-decoration: underline; font-size: inherit;
  display: inline;
}
.error { color: #ef4444; font-size: 13px; margin-bottom: 1rem; }
.btn-primary {
  width: 100%; padding: .8rem;
  background: var(--accent); color: #fff;
  border-radius: var(--radius); font-size: 15px; font-weight: 600;
  transition: opacity .15s;
}
.btn-primary:hover:not(:disabled) { opacity: .9; }
.btn-primary:disabled { opacity: .4; cursor: not-allowed; }
</style>
