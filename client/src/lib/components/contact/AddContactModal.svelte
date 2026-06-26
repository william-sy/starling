<script lang="ts">
  import Modal        from '$lib/components/ui/Modal.svelte';
  import QrScanner    from '$lib/components/qr/QrScanner.svelte';
  import { contacts }                         from '$lib/stores/contacts';
  import { account }                          from '$lib/stores/auth';
  import { relaySendAddRequest, relayHttp, DEFAULT_RELAY_WS } from '$lib/stores/relay';
  import { parseQr }                          from '$lib/utils/qr';
  import { get }     from 'svelte/store';
  import type { Contact } from '$lib/stores/contacts';
  import { _ } from '$lib/i18n';

  export let open = false;

  type Tab = 'pin' | 'scan';
  let tab: Tab    = 'pin';
  let pin         = '';
  let name        = '';
  let error       = '';
  let loading     = false;
  let scanDone    = false;
  let pendingKey  = '';
  let pendingRelay = '';

  const ALPHA  = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const PIN_RE = /^[A-Z23456789]{4}-[A-Z23456789]{4}-[A-Z23456789]{4}-[A-Z23456789]{4}$/;

  $: if (!open) { pin = ''; name = ''; error = ''; loading = false; tab = 'pin'; scanDone = false; pendingKey = ''; pendingRelay = ''; }

  function formatPin(raw: string): string {
    const clean = raw.toUpperCase().split('').filter(c => ALPHA.includes(c)).slice(0, 16).join('');
    const parts: string[] = [];
    for (let i = 0; i < clean.length; i += 4) parts.push(clean.slice(i, i + 4));
    return parts.join('-');
  }

  function onPinInput(e: Event) {
    const el     = e.target as HTMLInputElement;
    const cursor = el.selectionStart ?? el.value.length;
    pin          = formatPin(el.value);
    el.value     = pin;
    const adjusted = pin.length < cursor ? pin.length : cursor;
    el.setSelectionRange(adjusted, adjusted);
    error = '';
  }

  function validateLocal(): string | null {
    if (!PIN_RE.test(pin))                  return $_('contacts.add_modal.error_format');
    if (pin === $account?.pin)              return $_('contacts.add_modal.error_self');
    if ($contacts.some(c => c.pin === pin)) return $_('contacts.add_modal.error_exists');
    return null;
  }

  async function add() {
    const localErr = validateLocal();
    if (localErr) { error = localErr; return; }

    loading = true; error = '';
    try {
      const res = await fetch(`${get(relayHttp)}/account/${encodeURIComponent(pin)}`, {
        signal: AbortSignal.timeout(4000),
      });
      if (res.status === 404) { error = $_('contacts.add_modal.error_not_found'); loading = false; return; }
    } catch {
      console.warn('[add-contact] relay unreachable, adding offline');
    }

    const displayName = name.trim() || `Starling ${pin.slice(-4)}`;
    const acct        = get(account);
    const primary     = acct?.colonies?.[0] ?? acct?.relay_url ?? DEFAULT_RELAY_WS;
    const newContact: Contact = {
      pin,
      display_name:    displayName,
      notif_name:      displayName,
      status:          'offline',
      personal_msg:    '',
      avatar_hash:     null,
      avatar_url:      null,
      is_close_friend: false,
      unread:          0,
      pub_key_hex:     pendingKey   || undefined,
      relay_url:       pendingRelay || undefined,
      via_colony:      primary,
    };
    contacts.update(cs => [...cs, newContact]);

    try {
      await relaySendAddRequest(pin);
    } catch {
      error = "Couldn't reach your relay - contact saved, will sync when reconnected.";
      loading = false;
      return;
    }

    loading = false;
    open    = false;
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && !loading) add();
  }

  function onScan(e: CustomEvent<string>) {
    const parsed = parseQr(e.detail);
    if (!parsed) { error = 'Unrecognised QR code.'; tab = 'pin'; return; }
    if (parsed.t !== 'c') { error = 'Not a contact QR code.'; tab = 'pin'; return; }
    pin          = parsed.p;
    name         = parsed.n ?? '';
    pendingKey   = parsed.k ?? '';
    pendingRelay = parsed.r ?? '';
    scanDone     = true;
    tab          = 'pin';
  }

  function onScanErr(e: CustomEvent<string>) {
    error = e.detail;
    tab   = 'pin';
  }
</script>

<Modal {open} title={$_('contacts.add_modal.title')} width="420px" on:close={() => open = false}>
  <div class="form">

    <div class="tabs" role="tablist">
      <button
        class="tab" class:active={tab === 'pin'}
        role="tab" aria-selected={tab === 'pin'}
        on:click={() => { tab = 'pin'; error = ''; }}
      >
        <svg viewBox="0 0 16 16" fill="none" width="13" height="13" aria-hidden="true">
          <rect x="1.5" y="3" width="13" height="10" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
          <path d="M4.5 7.5h7M4.5 10h4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
        </svg>
        Enter PIN
      </button>
      <button
        class="tab" class:active={tab === 'scan'}
        role="tab" aria-selected={tab === 'scan'}
        on:click={() => { tab = 'scan'; error = ''; scanDone = false; }}
      >
        <svg viewBox="0 0 16 16" fill="none" width="13" height="13" aria-hidden="true">
          <rect x="1.5" y="1.5" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.3"/>
          <rect x="9.5" y="1.5" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.3"/>
          <rect x="1.5" y="9.5" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.3"/>
          <path d="M9.5 9.5h2v2h-2zM11.5 11.5h2v2h-2zM9.5 13.5h2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
        </svg>
        Scan QR
      </button>
    </div>

    {#if tab === 'pin'}
      <p class="desc">{$_('contacts.add_modal.desc')}</p>

      {#if scanDone}
        <div class="scan-badge">
          <svg viewBox="0 0 16 16" fill="none" width="13" height="13" aria-hidden="true">
            <path d="M3 8l3.5 3.5 6.5-7" stroke="var(--status-online)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          QR scanned - review and confirm
        </div>
      {/if}

      <div class="field">
        <label class="label" for="ac-pin">{$_('contacts.add_modal.pin_label')}</label>
        <input
          id="ac-pin"
          class="input"
          class:invalid={!!error}
          type="text"
          placeholder={$_('contacts.add_modal.pin_placeholder')}
          maxlength="19"
          value={pin}
          on:input={onPinInput}
          on:keydown={onKey}
          autocomplete="off"
          spellcheck={false}
        />
        {#if error}
          <span class="feedback error">{error}</span>
        {:else}
          <span class="feedback hint">{$_('contacts.add_modal.pin_hint')}</span>
        {/if}
      </div>

      <div class="field">
        <label class="label" for="ac-name">
          {$_('contacts.add_modal.name_label')}
          <span class="opt">{$_('contacts.add_modal.name_optional')}</span>
        </label>
        <input
          id="ac-name"
          class="input"
          type="text"
          placeholder={$_('contacts.add_modal.name_placeholder')}
          maxlength="32"
          bind:value={name}
          on:keydown={onKey}
        />
        <span class="feedback hint">{$_('contacts.add_modal.name_hint')}</span>
      </div>

      <div class="actions">
        <button class="btn-add" on:click={add} disabled={loading}>
          {loading ? $_('contacts.add_modal.checking') : $_('contacts.add_modal.add')}
        </button>
        <button class="btn-cancel" on:click={() => open = false}>{$_('contacts.add_modal.cancel')}</button>
      </div>

    {:else}
      <div class="scan-wrap">
        <QrScanner on:scan={onScan} on:err={onScanErr} />
      </div>
      <p class="scan-hint">Ask your contact to open Starling and show their QR code.</p>
    {/if}

  </div>
</Modal>

<style>
.form {
  display: flex; flex-direction: column; gap: 1.1rem;
}

.tabs {
  display: flex; gap: .35rem;
  background: var(--surface-2);
  padding: .25rem;
  border-radius: var(--radius);
}
.tab {
  flex: 1;
  display: flex; align-items: center; justify-content: center; gap: .4rem;
  padding: .45rem .75rem;
  font-size: 12.5px; font-weight: 500;
  color: var(--text-muted);
  border-radius: calc(var(--radius) - 2px);
  transition: background .12s, color .12s;
}
.tab:hover { color: var(--text); }
.tab.active {
  background: var(--surface);
  color: var(--text);
  font-weight: 600;
  box-shadow: 0 1px 3px oklch(0 0 0 / 0.15);
}

.desc {
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.6;
}

.scan-badge {
  display: flex; align-items: center; gap: .45rem;
  padding: .45rem .7rem;
  background: oklch(from var(--status-online) l c h / 0.10);
  border: 1px solid oklch(from var(--status-online) l c h / 0.25);
  border-radius: var(--radius);
  font-size: 12px; font-weight: 500;
  color: var(--status-online);
}

.field {
  display: flex; flex-direction: column; gap: .3rem;
}

.label {
  font-size: 13px; font-weight: 600;
  color: var(--text-2);
  letter-spacing: -0.01em;
  display: flex; align-items: baseline; gap: .4rem;
}
.opt {
  font-size: 11px; font-weight: 400;
  color: var(--text-faint);
  letter-spacing: 0;
}

.input {
  padding: .52rem .75rem;
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  font-size: 14px;
  font-family: var(--font-msg);
  letter-spacing: .04em;
  transition: border-color .12s, background .12s;
}
.input:focus { outline: none; border-color: var(--accent); background: var(--surface); }
.input::placeholder { color: var(--text-faint); letter-spacing: .02em; }
.input.invalid { border-color: oklch(0.62 0.22 25); }

.feedback { font-size: 12px; line-height: 1.5; }
.hint  { color: var(--text-muted); }
.error { color: oklch(0.62 0.22 25); }

.actions {
  display: flex; gap: .6rem;
  padding-top: .25rem;
}
.btn-add {
  padding: .55rem 1.25rem;
  background: var(--accent); color: #fff;
  border-radius: var(--radius);
  font-size: 13px; font-weight: 600;
  letter-spacing: -0.01em;
  transition: background .12s;
}
.btn-add:hover { background: var(--accent-hover); }
.btn-cancel {
  padding: .55rem .9rem;
  font-size: 13px; font-weight: 500;
  color: var(--text-muted);
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  transition: background .12s, color .12s;
}
.btn-cancel:hover { background: var(--surface-2); color: var(--text); }

.scan-wrap {
  display: flex; justify-content: center;
}
.scan-hint {
  font-size: 12px;
  color: var(--text-muted);
  text-align: center;
  line-height: 1.55;
}
</style>
