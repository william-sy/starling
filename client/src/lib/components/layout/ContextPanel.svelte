<script lang="ts">
  import Avatar    from '$lib/components/ui/Avatar.svelte';
  import StatusDot from '$lib/components/ui/StatusDot.svelte';
  import { activeContact, activePin, contacts } from '$lib/stores/contacts';
  import { getDisappearAfter, setDisappearAfter } from '$lib/utils/disappear';
  import { showMobileContext, isMobile } from '$lib/stores/mobile';
  import { settings } from '$lib/stores/settings';
  import { _ } from '$lib/i18n';

  let confirmBlock  = false;
  let confirmRemove = false;
  let disappearSecs = 0;

  $: if (!$activeContact) { confirmBlock = false; confirmRemove = false; }
  $: if ($activeContact) { disappearSecs = getDisappearAfter($activeContact.pin); }

  function muteFor(hours: number | null) {
    if (!$activeContact) return;
    // hours = null means always; 0 unmutes
    const until = hours === null ? 0 : hours === 0 ? null : Date.now() + hours * 3_600_000;
    contacts.mute($activeContact.pin, until);
  }

  $: isMuted = $activeContact ? contacts.isMuted($activeContact.pin) : false;

  function formatLastSeen(ts: number | undefined): string {
    if (!ts) return '';
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60_000);
    if (mins < 2)  return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)  return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days === 1) return 'yesterday';
    return `${days}d ago`;
  }

  function onDisappearChange(e: Event) {
    if (!$activeContact) return;
    disappearSecs = parseInt((e.target as HTMLSelectElement).value) || 0;
    setDisappearAfter($activeContact.pin, disappearSecs);
  }

  $: DISAPPEAR_OPTS = [
    { label: $_('settings.privacy.disappearing_off'), value: 0 },
    { label: $_('settings.privacy.disappearing_30s'), value: 30 },
    { label: $_('settings.privacy.disappearing_5m'),  value: 300 },
    { label: $_('settings.privacy.disappearing_1h'),  value: 3600 },
    { label: $_('settings.privacy.disappearing_1d'),  value: 86400 },
    { label: $_('settings.privacy.disappearing_7d'),  value: 604800 },
  ];
</script>

<aside class="panel">
  {#if $activeContact}
    {@const c = $activeContact}

    <!-- Hidden on desktop via CSS -->
    <button class="mobile-back" on:click={() => showMobileContext.set(false)} aria-label="Back to chat">
      <svg viewBox="0 0 18 18" fill="none" width="16" height="16" aria-hidden="true">
        <path d="M11 4 L6 9 L11 14" stroke="currentColor" stroke-width="1.8"
              stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      Back
    </button>

    <!-- Profile header — gradient matching the me-card to bracket the layout -->
    <div class="profile-header">
      <Avatar src={c.avatar_url} name={c.display_name} size={68} status={c.status} />
      <h3 class="cname">{c.display_name}</h3>
      {#if c.personal_msg}
        <p class="personal">"{c.personal_msg}"</p>
      {/if}
      <div class="status-row">
        <StatusDot status={c.status} />
        <span class="status-label">
          {#if $settings.showLastSeen && c.status === 'offline' && c.last_seen}
            last seen {formatLastSeen(c.last_seen)}
          {:else}
            {c.status}
          {/if}
        </span>
      </div>
    </div>

    <!-- Trust surface -->
    <div class="trust-section">
      <div class="e2e-badge">
        <svg viewBox="0 0 14 14" fill="none" width="13" height="13" aria-hidden="true">
          <rect x="2.5" y="6" width="9" height="7" rx="1.2" stroke="currentColor" stroke-width="1.25"/>
          <path d="M4.5 6V4.5a2.5 2.5 0 0 1 5 0V6" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>
        </svg>
        <span class="e2e-label">{$_('contacts.context_panel.e2e_label')}</span>
      </div>
      <p class="e2e-sub">{$_('contacts.context_panel.e2e_sub', { values: { name: c.display_name } })}</p>

      <div class="pin-block">
        <span class="field-label">{$_('contacts.context_panel.pin_label')}</span>
        <span class="pin-val">{c.pin}</span>
      </div>

      <div class="bot-row">
        <div class="bot-row-info">
          <span class="field-label">Bot account</span>
          <span class="bot-row-sub">Marks this contact as an automated bot</span>
        </div>
        <button
          class="toggle-btn"
          class:on={c.is_bot}
          on:click={() => contacts.toggleBot(c.pin)}
          role="switch"
          aria-checked={!!c.is_bot}
          aria-label="Mark as bot"
        >
          <span class="toggle-thumb"></span>
        </button>
      </div>
    </div>

    <!-- Disappearing messages -->
    <div class="disappear-section">
      <label class="field-label" for="disappear-select">{$_('settings.privacy.disappearing_label', { default: 'Disappearing messages' })}</label>
      <select id="disappear-select" class="disappear-select" value={disappearSecs} on:change={onDisappearChange}>
        {#each DISAPPEAR_OPTS as opt}
          <option value={opt.value}>{opt.label}</option>
        {/each}
      </select>
    </div>

    <!-- Mute -->
    <div class="mute-section">
      <span class="field-label">Notifications</span>
      <div class="mute-row">
        {#if isMuted}
          <button class="mute-btn mute-active" on:click={() => muteFor(0)}>
            <svg viewBox="0 0 16 16" fill="none" width="13" height="13" aria-hidden="true">
              <path d="M2 5h3l4-3v12l-4-3H2V5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
              <line x1="11" y1="5" x2="15" y2="11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
              <line x1="15" y1="5" x2="11" y2="11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
            </svg>
            Muted - tap to unmute
          </button>
        {:else}
          <button class="mute-btn" on:click={() => muteFor(24)}>Mute 24h</button>
          <button class="mute-btn" on:click={() => muteFor(null)}>Mute always</button>
        {/if}
      </div>
    </div>

    <!-- Actions -->
    <div class="actions">
      <button class="action-btn">
        <svg viewBox="0 0 16 16" fill="none" width="14" height="14" aria-hidden="true">
          <rect x="2" y="5" width="12" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
          <path d="M5 5 V3.5 A3 3 0 0 1 11 3.5 V5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        </svg>
        {$_('contacts.context_panel.safety_numbers')}
      </button>

      <div class="danger-zone">
        {#if confirmBlock}
          <div class="confirm-wrap">
            <span class="confirm-text">{$_('contacts.context_panel.block_confirm', { values: { name: c.display_name } })}</span>
            <button class="confirm-yes" on:click={() => { contacts.block(c.pin); activePin.set(null); confirmBlock = false; }}>{$_('contacts.context_panel.block')}</button>
            <button class="confirm-no" on:click={() => confirmBlock = false}>{$_('contacts.context_panel.cancel')}</button>
          </div>
        {:else}
          <button class="action-btn action-danger" on:click={() => confirmBlock = true}>
            <svg viewBox="0 0 16 16" fill="none" width="14" height="14" aria-hidden="true">
              <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.3"/>
              <path d="M5.5 5.5 L10.5 10.5M10.5 5.5 L5.5 10.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
            </svg>
            {$_('contacts.context_panel.block_contact')}
          </button>
        {/if}

        {#if confirmRemove}
          <div class="confirm-wrap">
            <span class="confirm-text">{$_('contacts.context_panel.remove_confirm', { values: { name: c.display_name } })}</span>
            <button class="confirm-yes" on:click={() => { contacts.remove(c.pin); activePin.set(null); confirmRemove = false; }}>{$_('contacts.context_panel.remove')}</button>
            <button class="confirm-no" on:click={() => confirmRemove = false}>{$_('contacts.context_panel.cancel')}</button>
          </div>
        {:else}
          <button class="action-btn action-danger" on:click={() => confirmRemove = true}>
            <svg viewBox="0 0 16 16" fill="none" width="14" height="14" aria-hidden="true">
              <path d="M3 4h10M6 4V2.5h4V4M13 4 L12 13.5 H4 L3 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            {$_('contacts.context_panel.remove_contact')}
          </button>
        {/if}
      </div>
    </div>

  {:else}
    <div class="empty">
      <svg viewBox="0 0 24 24" fill="none" width="28" height="28" aria-hidden="true">
        <circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.4"/>
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
      </svg>
      <p>{$_('contacts.context_panel.empty')}<br/>{$_('contacts.context_panel.empty_sub')}</p>
    </div>
  {/if}
</aside>

<style>
.panel {
  width: 240px;
  height: 100%;
  background: var(--surface);
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  flex-shrink: 0;
}

.empty {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: .65rem;
  font-size: 12px; color: var(--text-faint);
  padding: 1rem; text-align: center; line-height: 1.7;
}

/* ── Profile header — mirrors the me-card gradient ── */
.profile-header {
  display: flex; flex-direction: column; align-items: center;
  padding: 1.85rem 1rem 1.35rem;
  gap: .45rem;
  background: var(--panel-header);
  flex-shrink: 0;
}
.cname {
  font-size: 15px; font-weight: 700;
  color: #fff;
  text-align: center;
  letter-spacing: -0.025em;
  margin-top: .2rem;
}
.personal {
  font-size: 11.5px;
  color: oklch(1 0 0 / 0.65);
  font-style: italic; text-align: center;
  line-height: 1.45;
  padding: 0 .5rem;
}
.status-row {
  display: flex; align-items: center; gap: .35rem;
  margin-top: .05rem;
}
.status-label {
  font-size: 11px;
  color: oklch(1 0 0 / 0.68);
  font-weight: 500;
  letter-spacing: .01em;
}

/* ── Trust section ── */
.trust-section {
  padding: .95rem 1rem .85rem;
  border-bottom: 1px solid var(--border-subtle);
  display: flex; flex-direction: column; gap: .55rem;
}

.e2e-badge {
  display: flex; align-items: center; gap: .4rem;
  color: var(--status-online);
}
.e2e-label {
  font-size: 12px; font-weight: 700;
  letter-spacing: -0.01em;
}
.e2e-sub {
  font-size: 11px; color: var(--text-faint);
  line-height: 1.6;
}

.pin-block {
  display: flex; flex-direction: column; gap: .2rem;
  margin-top: .1rem;
}
.field-label {
  font-size: 10.5px; font-weight: 600;
  color: var(--text-muted);
  letter-spacing: .02em;
}
.pin-val {
  font-size: 12.5px; font-weight: 600;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
  letter-spacing: .03em;
}

.bot-row {
  display: flex; align-items: center; gap: .75rem;
  margin-top: .6rem;
}
.bot-row-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: .1rem; }
.bot-row-sub { font-size: 10.5px; color: var(--text-faint); }

.toggle-btn {
  width: 34px; height: 19px; border-radius: 99px;
  background: var(--border); border: none;
  position: relative; cursor: pointer; flex-shrink: 0;
  transition: background .15s;
}
.toggle-btn.on { background: oklch(0.55 0.15 280); }
.toggle-thumb {
  position: absolute; top: 2px; left: 2px;
  width: 15px; height: 15px; border-radius: 50%;
  background: #fff;
  transition: transform .15s;
  box-shadow: 0 1px 3px oklch(0 0 0 / 0.2);
}
.toggle-btn.on .toggle-thumb { transform: translateX(15px); }

/* ── Disappearing messages ── */
.disappear-section {
  padding: .75rem 1rem;
  border-bottom: 1px solid var(--border-subtle);
  display: flex; flex-direction: column; gap: .3rem;
}
.disappear-select {
  width: 100%;
  padding: .38rem .6rem;
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  font-size: 12.5px;
  color: var(--text-2);
  cursor: pointer;
  transition: border-color .12s;
  appearance: auto;
}
.disappear-select:focus { outline: none; border-color: var(--accent); }

/* ── Mute ── */
.mute-section {
  padding: .6rem .9rem .4rem;
  border-top: 1px solid var(--border);
}
.mute-row {
  display: flex; gap: .4rem; margin-top: .35rem; flex-wrap: wrap;
}
.mute-btn {
  display: flex; align-items: center; gap: .35rem;
  font-size: 11.5px; padding: .3rem .65rem;
  border: 1px solid var(--border); border-radius: 99px;
  background: none; color: var(--text-muted); cursor: pointer;
  transition: background .12s, color .12s;
}
.mute-btn:hover { background: var(--surface-2); color: var(--text); }
.mute-btn.mute-active {
  border-color: oklch(0.60 0.20 25 / 0.4);
  color: oklch(0.60 0.20 25);
  background: oklch(0.60 0.20 25 / 0.06);
}

/* ── Actions ── */
.actions {
  display: flex; flex-direction: column;
  padding: .4rem .5rem;
  gap: .12rem;
  flex: 1;
}

.action-btn {
  display: flex; align-items: center; gap: .55rem;
  width: 100%; text-align: left;
  padding: .52rem .65rem;
  font-size: 12.5px; font-weight: 500;
  color: var(--text-2);
  border-radius: var(--radius);
  transition: background .12s, color .12s;
}
.action-btn:hover { background: var(--surface-2); }

.danger-zone {
  margin-top: .35rem;
  padding-top: .55rem;
  border-top: 1px solid var(--border-subtle);
  display: flex; flex-direction: column; gap: .12rem;
}

.action-danger { color: oklch(0.60 0.20 25); }
.action-danger:hover { background: oklch(0.60 0.20 25 / 0.07); }

/* Inline confirmation */
.confirm-wrap {
  display: flex; align-items: center; gap: .35rem;
  padding: .45rem .65rem;
  background: oklch(0.60 0.20 25 / 0.06);
  border: 1px solid oklch(0.60 0.20 25 / 0.18);
  border-radius: var(--radius);
  animation: confirm-in 0.12s ease;
}
@keyframes confirm-in {
  from { opacity: 0; transform: translateY(-3px); }
  to   { opacity: 1; transform: translateY(0); }
}
.confirm-text {
  flex: 1;
  font-size: 11.5px; font-weight: 600;
  color: oklch(0.60 0.20 25);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.confirm-yes {
  font-size: 11px; font-weight: 700;
  padding: .22rem .52rem;
  background: oklch(0.60 0.20 25);
  color: #fff;
  border-radius: 4px;
  flex-shrink: 0;
  transition: background .1s;
}
.confirm-yes:hover { background: oklch(0.54 0.22 25); }
.confirm-no {
  font-size: 11px;
  color: var(--text-muted);
  padding: .22rem .3rem;
  border-radius: 4px;
  transition: color .1s, background .1s;
}
.confirm-no:hover { color: var(--text); background: var(--surface-2); }

@media (prefers-reduced-motion: reduce) {
  .confirm-wrap { animation: none; }
}

.mobile-back {
  display: flex;
  align-items: center; gap: .35rem;
  padding: .55rem .85rem;
  padding-top: calc(.55rem + var(--safe-top));
  font-size: 13px; font-weight: 500;
  color: var(--text-2);
  border-bottom: 1px solid var(--border-subtle);
  width: 100%;
  text-align: left;
  transition: color .12s, background .12s;
}
.mobile-back:hover { color: var(--text); background: var(--surface-2); }
@media (min-width: 1024px) { .mobile-back { display: none; } }
</style>
