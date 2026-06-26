<script lang="ts">
  import Modal      from '$lib/components/ui/Modal.svelte';
  import QrDisplay  from '$lib/components/qr/QrDisplay.svelte';
  import { account }   from '$lib/stores/auth';
  import { settings }  from '$lib/stores/settings';
  import { relayHttp } from '$lib/stores/relay';
  import { copyText }  from '$lib/utils/clipboard';
  import { buildContactQr } from '$lib/utils/qr';

  export let open = false;

  let pinCopied = false;

  $: qrData = $account
    ? buildContactQr(
        $account.pin,
        $account.dh_key_hex,
        $relayHttp ?? $account.relay_url ?? '',
        $settings.displayName || $account.display_name,
      )
    : '';

  function copyPin() {
    if (!$account) return;
    copyText($account.pin);
    pinCopied = true;
    setTimeout(() => pinCopied = false, 2000);
  }
</script>

<Modal {open} title="My QR Code" width="320px" on:close={() => open = false}>
  <div class="body">
    <div class="qr-frame">
      {#if qrData}
        <QrDisplay data={qrData} size={224} />
      {/if}
    </div>

    <div class="pin-row">
      <span class="pin">{$account?.pin ?? ''}</span>
      <button class="copy-btn" on:click={copyPin}>
        {#if pinCopied}
          <svg viewBox="0 0 16 16" fill="none" width="13" height="13" aria-hidden="true">
            <path d="M3 8l3.5 3.5 6.5-7" stroke="var(--status-online)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Copied
        {:else}
          <svg viewBox="0 0 16 16" fill="none" width="13" height="13" aria-hidden="true">
            <rect x="5.5" y="1.5" width="9" height="11" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
            <path d="M3.5 4.5H2.5A1 1 0 0 0 1.5 5.5v9A1 1 0 0 0 2.5 15.5h7a1 1 0 0 0 1-1v-1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
          </svg>
          Copy PIN
        {/if}
      </button>
    </div>

    <p class="hint">Share this QR or your PIN so others can add you as a contact.</p>
  </div>
</Modal>

<style>
.body {
  display: flex; flex-direction: column;
  align-items: center; gap: 1.1rem;
}

.qr-frame {
  padding: .5rem;
  background: var(--surface-2);
  border: 1.5px solid var(--border);
  border-radius: var(--radius-lg);
}

.pin-row {
  display: flex; align-items: center; gap: .65rem;
}
.pin {
  font-size: 15px; font-weight: 700;
  letter-spacing: .06em;
  font-variant-numeric: tabular-nums;
  color: var(--text);
}
.copy-btn {
  display: flex; align-items: center; gap: .3rem;
  font-size: 12px; font-weight: 500;
  color: var(--text-muted);
  padding: .3rem .65rem;
  border: 1.5px solid var(--border);
  border-radius: 99px;
  transition: background .12s, border-color .12s, color .12s;
}
.copy-btn:hover { background: var(--surface-2); border-color: var(--accent); color: var(--accent); }

.hint {
  font-size: 12px;
  color: var(--text-muted);
  text-align: center;
  line-height: 1.6;
  max-width: 240px;
}
</style>
