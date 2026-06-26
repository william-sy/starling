<script lang="ts">
  import { go }                                    from '$lib/stores/router';
  import { pendingRelayUrl, pendingPassphrase }    from '$lib/stores/auth';
  import { DEFAULT_RELAY_WS }                      from '$lib/stores/relay';

  type Mode = 'default' | 'custom';
  let mode: Mode = 'default';

  let domainInput = '';
  let checking    = false;
  let checkState: 'idle' | 'ok' | 'fail' = 'idle';
  let checkTimer: ReturnType<typeof setTimeout> | null = null;

  let requiresPassphrase = false;
  let passphraseInput    = '';

  function normalizeToWs(raw: string): string {
    let s = raw.trim();
    // strip trailing /ws
    s = s.replace(/\/ws\/?$/, '');
    // strip scheme
    const noScheme = s.replace(/^(wss?|https?):\/\//, '');
    // if it's an IP (contains no dots that look like a domain, or has :port) use ws, else wss
    const isIp = /^[\d.:]+$/.test(noScheme.split('/')[0]);
    return `${isIp ? 'ws' : 'wss'}://${noScheme}/ws`;
  }

  function wsToHttp(ws: string): string {
    return ws.replace(/^ws/, 'http').replace(/\/ws$/, '');
  }

  async function testConnectivity(wsUrl: string): Promise<{ ok: boolean; requiresPassphrase: boolean }> {
    const httpUrl = wsToHttp(wsUrl);
    const ctrl    = new AbortController();
    const t       = setTimeout(() => ctrl.abort(), 4000);
    try {
      const [pingRes, infoRes] = await Promise.all([
        fetch(`${httpUrl}/account/TEST-TEST-TEST`, { signal: ctrl.signal }),
        fetch(`${httpUrl}/info`,                   { signal: ctrl.signal }),
      ]);
      const ok = pingRes.status < 500;
      let requiresPass = false;
      if (infoRes.ok) {
        const info = await infoRes.json() as { requires_passphrase?: boolean };
        requiresPass = info.requires_passphrase ?? false;
      }
      return { ok, requiresPassphrase: requiresPass };
    } catch {
      return { ok: false, requiresPassphrase: false };
    } finally {
      clearTimeout(t);
    }
  }

  function onDomainInput() {
    checkState = 'idle';
    requiresPassphrase = false;
    passphraseInput    = '';
    if (checkTimer) clearTimeout(checkTimer);
    if (!domainInput.trim()) return;
    checkTimer = setTimeout(async () => {
      checking = true;
      const wsUrl  = normalizeToWs(domainInput);
      const result = await testConnectivity(wsUrl);
      checking           = false;
      checkState         = result.ok ? 'ok' : 'fail';
      requiresPassphrase = result.requiresPassphrase;
    }, 600);
  }

  function proceed() {
    const relayUrl = mode === 'default' ? DEFAULT_RELAY_WS : normalizeToWs(domainInput);
    pendingRelayUrl.set(relayUrl);
    pendingPassphrase.set(passphraseInput.trim());
    go('account-created');
  }

  $: passphraseValid = !requiresPassphrase || passphraseInput.trim().length > 0;
  $: customValid = mode === 'custom'
    ? domainInput.trim().length > 3 && checkState === 'ok' && passphraseValid
    : true;

  $: defaultLabel = (() => {
    try {
      const u = new URL(DEFAULT_RELAY_WS.replace(/^ws/, 'http'));
      return u.hostname;
    } catch {
      return DEFAULT_RELAY_WS;
    }
  })();
</script>

<div class="wrap">
  <div class="card">
    <button class="back" on:click={() => go('age-gate')}>Back</button>

    <div class="icon-row">
      <div class="bird-icon" aria-hidden="true">
        <svg viewBox="0 0 32 32" fill="none" width="30" height="30">
          <path d="M4 20 C6 14, 12 10, 20 11 L28 8 L24 16 C20 22, 12 24, 6 22 Z"
                fill="currentColor" opacity=".15"/>
          <path d="M4 20 C6 14, 12 10, 20 11 L28 8 L24 16 C20 22, 12 24, 6 22 Z"
                stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
          <circle cx="22" cy="10" r="1.2" fill="currentColor"/>
          <path d="M14 18 C12 16, 8 17, 6 20" stroke="currentColor" stroke-width="1.2"
                stroke-linecap="round" opacity=".6"/>
        </svg>
      </div>
    </div>

    <h2>Choose your colony</h2>
    <p class="sub">Your colony routes messages between devices. Pick the hosted colony or connect to your own.</p>

    <div class="options">
      <button
        class="option"
        class:selected={mode === 'default'}
        on:click={() => mode = 'default'}
      >
        <div class="opt-radio"><div class="dot"></div></div>
        <div class="opt-body">
          <span class="opt-title">Starling <span class="badge">hosted</span></span>
          <span class="opt-sub">{defaultLabel}</span>
        </div>
      </button>

      <button
        class="option"
        class:selected={mode === 'custom'}
        on:click={() => { mode = 'custom'; }}
      >
        <div class="opt-radio"><div class="dot"></div></div>
        <div class="opt-body">
          <span class="opt-title">Custom colony</span>
          <span class="opt-sub">Self-hosted or company server</span>
        </div>
      </button>
    </div>

    {#if mode === 'custom'}
      <div class="domain-row">
        <div class="domain-input-wrap" class:ok={checkState === 'ok'} class:fail={checkState === 'fail'}>
          <input
            class="domain-input"
            type="text"
            placeholder="messages.yourserver.com"
            bind:value={domainInput}
            on:input={onDomainInput}
            spellcheck="false"
            autocomplete="off"
            autocorrect="off"
          />
          {#if checking}
            <span class="check-spin" aria-label="Checking...">
              <svg viewBox="0 0 16 16" fill="none" width="14" height="14">
                <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.8" opacity=".25"/>
                <path d="M8 2 A6 6 0 0 1 14 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              </svg>
            </span>
          {:else if checkState === 'ok'}
            <span class="check-icon ok" aria-label="Colony reachable">
              <svg viewBox="0 0 16 16" fill="none" width="14" height="14">
                <path d="M3 8 L6.5 11.5 L13 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </span>
          {:else if checkState === 'fail'}
            <span class="check-icon fail" aria-label="Colony not reachable">
              <svg viewBox="0 0 16 16" fill="none" width="14" height="14">
                <path d="M4 4 L12 12 M12 4 L4 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              </svg>
            </span>
          {/if}
        </div>
        {#if checkState === 'fail'}
          <p class="domain-hint fail">Could not reach that colony. Check the domain and try again.</p>
        {:else if checkState === 'ok'}
          <p class="domain-hint ok">Colony is reachable.</p>
        {:else}
          <p class="domain-hint">Enter a domain or IP. HTTPS is required for mobile apps.</p>
        {/if}
      </div>

      {#if requiresPassphrase}
        <div class="pass-row">
          <label class="pass-label" for="colony-pass">
            <svg viewBox="0 0 16 16" fill="none" width="13" height="13" aria-hidden="true">
              <rect x="3" y="7" width="10" height="8" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
              <path d="M5 7V5a3 3 0 0 1 6 0v2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
            </svg>
            Colony passphrase required
          </label>
          <input
            id="colony-pass"
            class="domain-input pass-input"
            type="password"
            placeholder="Enter passphrase"
            bind:value={passphraseInput}
            autocomplete="off"
          />
          <p class="domain-hint">This colony requires a passphrase to register. Ask your server admin.</p>
        </div>
      {/if}
    {/if}

    <button class="btn-primary" disabled={!customValid} on:click={proceed}>
      Continue
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

.icon-row {
  display: flex; justify-content: center;
  margin-bottom: 1rem;
}
.bird-icon {
  width: 48px; height: 48px;
  border-radius: 50%;
  background: var(--accent-subtle, oklch(0.96 0.05 145));
  display: flex; align-items: center; justify-content: center;
  color: var(--accent);
}

h2 { font-size: 19px; font-weight: 700; margin-bottom: .3rem; text-align: center; }
.sub { color: var(--text-muted); font-size: 13px; margin-bottom: 1.4rem; text-align: center; line-height: 1.55; }

.options {
  display: flex; flex-direction: column; gap: .55rem;
  margin-bottom: 1.25rem;
}

.option {
  display: flex; align-items: center; gap: .85rem;
  padding: .9rem 1rem;
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: border-color .15s, background .15s;
  width: 100%;
}
.option:hover { background: var(--surface-2); }
.option.selected {
  border-color: var(--accent);
  background: oklch(from var(--accent) l c h / 0.05);
}

.opt-radio {
  width: 17px; height: 17px; flex-shrink: 0;
  border-radius: 50%;
  border: 2px solid var(--border);
  display: flex; align-items: center; justify-content: center;
  transition: border-color .15s;
}
.option.selected .opt-radio {
  border-color: var(--accent);
}
.dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: var(--accent);
  opacity: 0;
  transition: opacity .15s;
}
.option.selected .dot { opacity: 1; }

.opt-body { display: flex; flex-direction: column; gap: .15rem; }
.opt-title {
  font-size: 14px; font-weight: 600;
  color: var(--text);
  display: flex; align-items: center; gap: .4rem;
}
.badge {
  font-size: 10px; font-weight: 700;
  padding: .1rem .4rem;
  border-radius: 99px;
  background: var(--accent);
  color: #fff;
  letter-spacing: .02em;
}
.opt-sub {
  font-size: 12px; color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

/* Custom domain input */
.domain-row {
  margin-bottom: 1.25rem;
  display: flex; flex-direction: column; gap: .4rem;
}
.domain-input-wrap {
  display: flex; align-items: center;
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  padding: 0 .75rem;
  transition: border-color .15s;
  gap: .5rem;
}
.domain-input-wrap:focus-within { border-color: var(--accent); }
.domain-input-wrap.ok  { border-color: var(--status-online, #22c55e); }
.domain-input-wrap.fail { border-color: oklch(0.60 0.20 25); }

.domain-input {
  flex: 1;
  padding: .65rem 0;
  font-size: 13.5px;
  color: var(--text);
  background: transparent;
  font-family: var(--font-mono, monospace);
}
.domain-input::placeholder { color: var(--text-faint); }
.domain-input:focus { outline: none; }

.check-spin { color: var(--text-muted); animation: spin .7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .check-spin { animation: none; } }

.check-icon { display: flex; }
.check-icon.ok   { color: var(--status-online, #22c55e); }
.check-icon.fail { color: oklch(0.60 0.20 25); }

.domain-hint {
  font-size: 12px; color: var(--text-muted); line-height: 1.5;
}
.domain-hint.ok   { color: var(--status-online, #22c55e); }
.domain-hint.fail { color: oklch(0.60 0.20 25); }

.pass-row {
  display: flex; flex-direction: column; gap: .4rem;
  margin-bottom: 1.25rem;
}
.pass-label {
  font-size: 12.5px; font-weight: 600; color: var(--text-muted);
  display: flex; align-items: center; gap: .35rem;
}
.pass-input {
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  padding: .65rem .75rem;
  width: 100%;
}
.pass-input:focus { outline: none; border-color: var(--accent); }

.btn-primary {
  width: 100%; padding: .8rem;
  background: var(--accent); color: #fff;
  border-radius: var(--radius); font-size: 15px; font-weight: 600;
  transition: opacity .15s;
}
.btn-primary:hover:not(:disabled) { opacity: .9; }
.btn-primary:disabled { opacity: .4; cursor: not-allowed; }
</style>
