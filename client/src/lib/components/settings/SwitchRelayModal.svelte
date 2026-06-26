<script lang="ts">
  import Modal           from '$lib/components/ui/Modal.svelte';
  import { get }         from 'svelte/store';
  import { account, persistAccount } from '$lib/stores/auth';
  import { relayRegister }           from '$lib/stores/relay';

  export let open = false;

  type Step = 'register' | 'done';

  const STEPS: { key: Step; label: string }[] = [
    { key: 'register', label: 'Register' },
    { key: 'done',     label: 'Done'     },
  ];

  function stepIndex(s: Step) { return STEPS.findIndex(x => x.key === s); }

  let step:       Step   = 'register';
  let relayUrl          = '';
  let urlError          = '';
  let testing           = false;
  let tested            = false;
  let registering       = false;

  $: if (!open) {
    step        = 'register';
    relayUrl    = '';
    urlError    = '';
    tested      = false;
    testing     = false;
    registering = false;
  }

  function normaliseUrl(raw: string): string {
    let u = raw.trim();
    if (!u.startsWith('ws://') && !u.startsWith('wss://') && !u.startsWith('http://') && !u.startsWith('https://')) {
      u = 'wss://' + u;
    }
    u = u.replace(/^http:\/\//, 'ws://').replace(/^https:\/\//, 'wss://');
    if (!u.endsWith('/ws')) u = u.replace(/\/$/, '') + '/ws';
    return u;
  }

  function displayHost(ws: string): string {
    return ws.replace(/^wss?:\/\//, '').replace(/\/ws$/, '');
  }

  async function testAndRegister() {
    urlError = '';
    const ws   = normaliseUrl(relayUrl);
    const http = ws.replace(/^ws/, 'http').replace(/\/ws$/, '');
    testing = true;
    try {
      const r = await fetch(`${http}/health`, { signal: AbortSignal.timeout(5000) });
      if (!r.ok) { urlError = `Colony returned ${r.status}. Check the URL.`; testing = false; return; }
    } catch {
      urlError = "Couldn't reach that colony. Check the URL and try again.";
      testing = false;
      return;
    }
    testing     = false;
    registering = true;
    const acct  = get(account);
    if (!acct) { urlError = 'Not signed in.'; registering = false; return; }

    const savedUrl     = acct.relay_url;
    const savedColonies = acct.colonies;
    try {
      await persistAccount({ ...acct, relay_url: ws, colonies: undefined });
      await relayRegister();
    } catch {
      urlError = "Colony reachable but registration failed. It may require an invite.";
      await persistAccount({ ...acct, relay_url: savedUrl, colonies: savedColonies });
      registering = false;
      return;
    }

    const existing = savedColonies?.length
      ? savedColonies
      : (savedUrl ? [savedUrl] : []);
    const colonies = existing.includes(ws) ? existing : [...existing, ws];
    await persistAccount({ ...acct, relay_url: savedUrl, colonies });
    registering = false;
    tested      = true;
    step        = 'done';
  }

  function close() { open = false; }
</script>

<Modal {open} title="Add colony" width="460px" on:close={close}>
  <div class="wizard">

    <!-- Step indicator -->
    <div class="steps" role="list" aria-label="Steps">
      {#each STEPS as s, i}
        <div class="step" class:active={step === s.key} class:past={i < stepIndex(step)} role="listitem">
          <span class="step-dot"></span>
          <span class="step-label">{s.label}</span>
        </div>
        {#if i < STEPS.length - 1}
          <div class="step-line" class:past={i < stepIndex(step)}></div>
        {/if}
      {/each}
    </div>

    {#if step === 'register'}
      <p class="desc">
        Your identity is portable. Register at a new colony to receive messages there too.
        Your existing colony keeps working.
      </p>

      <div class="field">
        <label class="label" for="ac-url">Colony URL</label>
        <div class="url-row">
          <input
            id="ac-url"
            class="input"
            class:invalid={!!urlError}
            type="text"
            placeholder="colony.example.com"
            bind:value={relayUrl}
            on:keydown={e => e.key === 'Enter' && testAndRegister()}
            spellcheck={false}
            autocomplete="off"
          />
          <button class="test-btn" on:click={testAndRegister} disabled={!relayUrl.trim() || testing || registering}>
            {#if testing}
              <span class="spinner" aria-hidden="true"></span> Testing...
            {:else if registering}
              <span class="spinner" aria-hidden="true"></span> Registering...
            {:else}
              Connect
            {/if}
          </button>
        </div>
        {#if urlError}
          <span class="feedback error">{urlError}</span>
        {:else}
          <span class="feedback hint">Protocol is auto-detected. You can paste just the domain.</span>
        {/if}
      </div>

      <div class="actions">
        <button class="btn-cancel" on:click={close}>Cancel</button>
      </div>

    {:else}
      <div class="done-state">
        <div class="done-circle" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" width="28" height="28">
            <path d="M5 12L10 17L19 7" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <p class="done-title">Colony added</p>
        <p class="done-sub">
          You are now registered at <strong>{displayHost(normaliseUrl(relayUrl))}</strong>.
          It appears in your colony list in Settings.
        </p>
      </div>
      <div class="actions">
        <button class="btn-primary" on:click={close}>Done</button>
      </div>
    {/if}

  </div>
</Modal>

<style>
.wizard {
  display: flex; flex-direction: column; gap: 1.2rem;
}

/* Steps */
.steps {
  display: flex; align-items: center;
}
.step {
  display: flex; align-items: center; gap: .4rem;
  font-size: 12px; font-weight: 500;
  color: var(--text-faint);
  transition: color .2s;
}
.step.active { color: var(--accent); font-weight: 700; }
.step.past   { color: var(--text-muted); }
.step-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--border);
  transition: background .2s; flex-shrink: 0;
}
.step.active .step-dot { background: var(--accent); }
.step.past   .step-dot { background: var(--text-faint); }
.step-line {
  flex: 1; height: 1px;
  background: var(--border-subtle);
  margin: 0 .5rem; min-width: 24px;
  transition: background .2s;
}
.step-line.past { background: var(--text-faint); }

.desc {
  font-size: 13px; color: var(--text-muted); line-height: 1.6;
}

.field { display: flex; flex-direction: column; gap: .35rem; }
.label { font-size: 13px; font-weight: 600; color: var(--text-2); }
.url-row { display: flex; gap: .5rem; }
.input {
  flex: 1;
  padding: .52rem .75rem;
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  font-size: 13.5px; font-family: 'Menlo', 'Consolas', monospace;
  transition: border-color .12s; min-width: 0;
}
.input:focus { outline: none; border-color: var(--accent); background: var(--surface); }
.input::placeholder { color: var(--text-faint); font-family: var(--font-ui, inherit); }
.input.invalid { border-color: oklch(0.62 0.22 25); }
.test-btn {
  display: flex; align-items: center; gap: .35rem;
  padding: .52rem 1rem;
  background: var(--surface-3);
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  font-size: 12.5px; font-weight: 600;
  color: var(--text-2); white-space: nowrap; flex-shrink: 0;
  transition: background .12s, border-color .12s;
}
.test-btn:hover:not(:disabled) { background: var(--surface-2); border-color: var(--accent); color: var(--accent); }
.test-btn:disabled { opacity: .55; cursor: not-allowed; }

.feedback { font-size: 12px; }
.hint  { color: var(--text-faint); }
.error { color: oklch(0.55 0.20 25); }

/* Done */
.done-state {
  display: flex; flex-direction: column; align-items: center;
  gap: .6rem; padding: .75rem 0;
}
.done-circle {
  width: 52px; height: 52px; border-radius: 50%;
  background: oklch(0.52 0.16 155);
  display: flex; align-items: center; justify-content: center;
}
.done-title { font-size: 17px; font-weight: 700; color: var(--text); }
.done-sub   { font-size: 13px; color: var(--text-muted); text-align: center; line-height: 1.55; }

/* Actions */
.actions { display: flex; gap: .6rem; padding-top: .1rem; }
.btn-primary {
  padding: .55rem 1.2rem;
  background: var(--accent); color: #fff;
  border-radius: var(--radius);
  font-size: 13px; font-weight: 600;
  transition: opacity .12s;
}
.btn-primary:hover { opacity: .9; }
.btn-cancel {
  padding: .55rem .9rem;
  font-size: 13px; font-weight: 500;
  color: var(--text-muted);
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  transition: background .12s, color .12s;
}
.btn-cancel:hover { background: var(--surface-2); color: var(--text); }

.spinner {
  display: inline-block; width: 11px; height: 11px;
  border: 1.5px solid currentColor; border-top-color: transparent;
  border-radius: 50%; animation: spin .7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }
</style>
