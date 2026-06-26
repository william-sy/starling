<script lang="ts">
  import Modal       from '$lib/components/ui/Modal.svelte';
  import QrScanner   from '$lib/components/qr/QrScanner.svelte';
  import QrDisplay   from '$lib/components/qr/QrDisplay.svelte';
  import { parseQr, buildDeviceLinkQr } from '$lib/utils/qr';
  import { encryptSyncPayload, storePendingEkPriv } from '$lib/utils/sync';
  import { relaySendDeviceSync } from '$lib/stores/relay';
  import { account } from '$lib/stores/auth';
  import { get } from 'svelte/store';

  export let open = false;

  // 'scan'  = existing device scans the new device's QR
  // 'show'  = new device shows its QR to be scanned
  export let mode: 'scan' | 'show' = 'scan';

  type State = 'idle' | 'scanned' | 'error';
  let state: State    = 'idle';
  let stateMsg        = '';
  let qrData          = '';
  let loadingQr       = false;

  $: if (open && mode === 'show' && !qrData) generateQr();
  $: if (!open) { state = 'idle'; stateMsg = ''; qrData = ''; loadingQr = false; }

  async function generateQr() {
    loadingQr = true;
    try {
      const result = await buildDeviceLinkQr();
      storePendingEkPriv(result.privKeyHex);
      qrData = result.qrData;
    } catch {
      stateMsg = 'Could not generate QR code.';
      state    = 'error';
    } finally {
      loadingQr = false;
    }
  }

  async function onScan(e: CustomEvent<string>) {
    const parsed = parseQr(e.detail);
    if (!parsed || parsed.t !== 'd') {
      state    = 'error';
      stateMsg = 'Not a device-link QR. Ask the new device to show its link code.';
      return;
    }

    state    = 'scanned';
    stateMsg = 'Sending contacts to new device...';

    try {
      const acct = get(account);
      if (!acct?.dh_priv_hex || !acct?.pin) {
        stateMsg = 'Sync not available on this device yet. Re-link your account to enable it.';
        return;
      }

      const syncPayload = await encryptSyncPayload(acct.dh_priv_hex, parsed.ek);
      await relaySendDeviceSync(acct.pin, syncPayload, acct.dh_key_hex);

      stateMsg = 'Contacts sent. Complete setup on the new device to import them.';
    } catch {
      state    = 'error';
      stateMsg = 'Could not send sync - check your connection and try again.';
    }
  }

  function onScanErr(e: CustomEvent<string>) {
    state    = 'error';
    stateMsg = e.detail;
  }

  function reset() { state = 'idle'; stateMsg = ''; }
</script>

<Modal {open} title={mode === 'scan' ? 'Link New Device' : 'Link to Existing Device'} width="360px" on:close={() => open = false}>
  <div class="body">

    {#if mode === 'scan'}
      {#if state === 'idle'}
        <p class="desc">On the new device, open Starling, tap <strong>Restore account</strong>, then <strong>Link from existing device</strong> to show its QR code.</p>
        <div class="scanner-wrap">
          <QrScanner on:scan={onScan} on:err={onScanErr} />
        </div>
      {:else if state === 'scanned'}
        <div class="result success">
          <svg viewBox="0 0 24 24" fill="none" width="28" height="28" aria-hidden="true">
            <circle cx="12" cy="12" r="10" stroke="var(--status-online)" stroke-width="1.5"/>
            <path d="M7 12l3.5 3.5 6.5-7" stroke="var(--status-online)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <p>{stateMsg}</p>
          <button class="btn-secondary" on:click={reset}>Scan again</button>
        </div>
      {:else}
        <div class="result error-state">
          <svg viewBox="0 0 24 24" fill="none" width="28" height="28" aria-hidden="true">
            <circle cx="12" cy="12" r="10" stroke="oklch(0.62 0.22 25)" stroke-width="1.5"/>
            <path d="M12 8v4m0 4h.01" stroke="oklch(0.62 0.22 25)" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <p>{stateMsg}</p>
          <button class="btn-secondary" on:click={reset}>Try again</button>
        </div>
      {/if}

    {:else}
      <p class="desc">Show this QR to your existing device. Open Settings, tap <strong>Link device</strong>, then scan this code.</p>
      <div class="qr-wrap">
        {#if loadingQr}
          <div class="qr-skeleton"></div>
        {:else if qrData}
          <QrDisplay data={qrData} size={220} />
        {/if}
      </div>
      <p class="hint">This code expires when you leave this screen.</p>
    {/if}

  </div>
</Modal>

<style>
.body {
  display: flex; flex-direction: column;
  align-items: center; gap: 1rem;
}

.desc {
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.65;
  text-align: center;
}
.desc strong { color: var(--text-2); font-weight: 600; }

.scanner-wrap {
  width: 100%;
  display: flex; justify-content: center;
}

.result {
  display: flex; flex-direction: column;
  align-items: center; gap: .75rem;
  padding: 1.5rem 1rem;
  text-align: center;
}
.result p {
  font-size: 13px; line-height: 1.6;
  color: var(--text-muted);
  max-width: 240px;
}
.result.success p { color: var(--status-online); }
.result.error-state p { color: oklch(0.62 0.22 25); }

.btn-secondary {
  font-size: 12.5px; font-weight: 500;
  padding: .45rem .9rem;
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  color: var(--text-2);
  transition: background .12s;
}
.btn-secondary:hover { background: var(--surface-2); }

.qr-wrap {
  padding: .5rem;
  background: var(--surface-2);
  border: 1.5px solid var(--border);
  border-radius: var(--radius-lg);
}

.qr-skeleton {
  width: 220px; height: 220px;
  background: linear-gradient(90deg, #e8e8e8 25%, #f4f4f4 50%, #e8e8e8 75%);
  background-size: 200% 100%;
  animation: shimmer 1.2s infinite;
  border-radius: 6px;
}
@keyframes shimmer {
  from { background-position: 200% 0; }
  to   { background-position: -200% 0; }
}

.hint {
  font-size: 11.5px;
  color: var(--text-faint);
  text-align: center;
}
</style>
