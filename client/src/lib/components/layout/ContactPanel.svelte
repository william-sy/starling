<script lang="ts">
  import Avatar             from '$lib/components/ui/Avatar.svelte';
  import ColoredName        from '$lib/components/ui/ColoredName.svelte';
  import { stripColorCodes } from '$lib/utils/coloredName';
  import ContactGroup       from '$lib/components/contact/ContactGroup.svelte';
  import AddContactModal    from '$lib/components/contact/AddContactModal.svelte';
  import CreateGroupModal   from '$lib/components/contact/CreateGroupModal.svelte';
  import CreateBroadcastModal from '$lib/components/contact/CreateBroadcastModal.svelte';
  import { account }        from '$lib/stores/auth';
  import { grouped, activePin, archivedPins, contacts } from '$lib/stores/contacts';
  import { groups, activeGroupId } from '$lib/stores/groups';
  import { broadcasts, activeBroadcastId } from '$lib/stores/broadcasts';
  import { go }             from '$lib/stores/router';
  import { settings }       from '$lib/stores/settings';
  import type { Status }    from '$lib/stores/settings';
  import { relayBroadcastPresence } from '$lib/stores/relay';
  import { _ } from '$lib/i18n';

  let addOpen       = false;
  let groupOpen     = false;
  let broadcastOpen = false;
  let showArchived  = false;

  let search = '';

  type Filter = 'all' | 'unread' | 'nests' | 'flocks';
  let activeFilter: Filter = 'all';

  const FILTERS: { val: Filter; label: string }[] = [
    { val: 'all',    label: 'All'    },
    { val: 'unread', label: 'Unread' },
    { val: 'nests',  label: 'Nests'  },
    { val: 'flocks', label: 'Flocks' },
  ];

  $: statuses = [
    { label: $_('contacts.panel.status_online'),  value: 'online'  as Status },
    { label: $_('contacts.panel.status_away'),    value: 'away'    as Status },
    { label: $_('contacts.panel.status_busy'),    value: 'busy'    as Status },
    { label: $_('contacts.panel.status_offline'), value: 'offline' as Status },
  ];

  $: query = search.toLowerCase();

  $: allContacts = [
    ...($grouped.online  ?? []),
    ...($grouped.away    ?? []),
    ...($grouped.offline ?? []),
  ];

  $: visibleContacts = (() => {
    let base = allContacts.filter(c => !$archivedPins.has(c.pin) && c.display_name.toLowerCase().includes(query));
    if (activeFilter === 'unread') base = base.filter(c => c.unread > 0);
    if (activeFilter === 'flocks') base = [];
    return base;
  })();

  $: archivedContacts = $contacts.filter(c => $archivedPins.has(c.pin));

  $: visibleGroups = (() => {
    if (activeFilter === 'nests') return [];
    if (activeFilter === 'unread') return $groups.filter(g => g.unread > 0);
    return $groups.filter(g => g.name.toLowerCase().includes(query));
  })();

  $: filtered = {
    online:  visibleContacts.filter(c => c.status === 'online'),
    away:    visibleContacts.filter(c => c.status === 'away'),
    offline: visibleContacts.filter(c => c.status === 'offline'),
  };

  $: displayName = $settings.displayName || $account?.display_name || 'You';

  function onStatusChange(e: Event) {
    settings.save({ myStatus: (e.target as HTMLSelectElement).value as Status });
    relayBroadcastPresence();
  }
</script>

<aside class="panel">
  <!-- Me card -->
  <div class="me-card">
    <div class="me-avatar">
      <Avatar name={stripColorCodes(displayName)} size={46} status={$settings.myStatus} src={$settings.avatarDataUrl || null} />
    </div>
    <div class="me-info">
      <span class="me-name">
        <ColoredName name={displayName} /><span class="me-status-inline"> ({$settings.myStatus})</span>
      </span>
      <span class="me-msg">{$settings.personalMsg}</span>
      <select
        class="status-sel"
        value={$settings.myStatus}
        on:change={onStatusChange}
        aria-label={$_('contacts.panel.status_aria')}
      >
        {#each statuses as s}
          <option value={s.value}>{s.label}</option>
        {/each}
      </select>
    </div>
  </div>

  <!-- Search -->
  <div class="search-wrap">
    <div class="search-inner">
      <svg class="search-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="6.5" cy="6.5" r="4" stroke="currentColor" stroke-width="1.4"/>
        <path d="M10 10 L13.5 13.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
      </svg>
      <input
        class="search"
        type="search"
        placeholder={$_('contacts.panel.search_placeholder')}
        bind:value={search}
        aria-label={$_('contacts.panel.search_aria')}
      />
    </div>
  </div>

  <!-- Filter tabs -->
  <div class="filter-tabs" role="tablist" aria-label="Filter conversations">
    {#each FILTERS as f}
      <button
        class="filter-tab"
        class:active={activeFilter === f.val}
        role="tab"
        aria-selected={activeFilter === f.val}
        on:click={() => activeFilter = f.val}
      >
        {f.label}
      </button>
    {/each}
  </div>

  <!-- Nests (1-on-1) -->
  <div class="list">
    <div class="section-header-row">
      <span class="section-label">{$_('contacts.panel.nests_label')}</span>
    </div>
    <ContactGroup label={$_('contacts.panel.group_online')}  contacts={filtered.online}  defaultOpen={true} />
    <ContactGroup label={$_('contacts.panel.group_away')}    contacts={filtered.away}    defaultOpen={true} />
    <ContactGroup label={$_('contacts.panel.group_offline')} contacts={filtered.offline} defaultOpen={false} />

    {#if filtered.online.length + filtered.away.length + filtered.offline.length === 0}
      <p class="empty">
        {#if search}
          {$_('contacts.panel.empty_search', { values: { query: search } })}
        {:else}
          {$_('contacts.panel.empty')}<br/>{$_('contacts.panel.empty_sub')}
        {/if}
      </p>
    {/if}

    {#if archivedContacts.length > 0}
      <button class="archived-toggle" on:click={() => showArchived = !showArchived}>
        <svg viewBox="0 0 14 14" fill="none" width="12" height="12" aria-hidden="true">
          <rect x=".5" y="3" width="13" height="10" rx="1.3" stroke="currentColor" stroke-width="1.2"/>
          <path d="M.5 5.5h13" stroke="currentColor" stroke-width="1.2"/>
          <path d="M3 1.5h8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
        </svg>
        Archived
        <span class="archived-count">{archivedContacts.length}</span>
        <svg class="chevron" class:open={showArchived} viewBox="0 0 10 10" fill="none" width="9" height="9">
          <path d="M2.5 3.5L5 6.5L7.5 3.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      {#if showArchived}
        <ContactGroup label="Archived" contacts={archivedContacts} defaultOpen={true} />
      {/if}
    {/if}
  </div>

  <!-- Groups section -->
  {#if visibleGroups.length > 0}
    <div class="group-section">
      <div class="group-header-row">
        <span class="group-label">{$_('contacts.panel.groups_label')}</span>
      </div>
      {#each visibleGroups as g}
        <button
          class="group-item"
          class:active={$activeGroupId === g.id}
          on:click={() => { activeGroupId.set(g.id); activePin.set(null); activeBroadcastId.set(null); }}
        >
          <div class="group-avatar" aria-hidden="true">{g.name[0].toUpperCase()}</div>
          <div class="group-info">
            <span class="group-name">{g.name}</span>
            <span class="group-sub">{$_('contacts.panel.member_count', { values: { count: g.member_pins.length } })}</span>
          </div>
          {#if g.unread > 0}
            <span class="unread-badge" aria-label="{g.unread} unread">{g.unread > 9 ? '9+' : g.unread}</span>
          {/if}
        </button>
      {/each}
    </div>
  {/if}

  <!-- Broadcasts section -->
  {#if $broadcasts.length > 0 && activeFilter !== 'nests' && activeFilter !== 'flocks'}
    <div class="group-section">
      <div class="group-header-row">
        <span class="group-label">Broadcasts</span>
      </div>
      {#each $broadcasts as bc}
        <button
          class="group-item"
          class:active={$activeBroadcastId === bc.id}
          on:click={() => { activeBroadcastId.set(bc.id); activeGroupId.set(null); activePin.set(null); }}
        >
          <div class="bc-avatar" aria-hidden="true">
            <svg viewBox="0 0 14 14" fill="none" width="14" height="14">
              <path d="M2 5h2l4-3v10l-4-3H2V5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
              <path d="M11 5c1 .6 1 3.4 0 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
            </svg>
          </div>
          <div class="group-info">
            <span class="group-name">{bc.name}</span>
            <span class="group-sub">{bc.recipient_pins.length} recipient{bc.recipient_pins.length !== 1 ? 's' : ''} - {bc.mode}</span>
          </div>
        </button>
      {/each}
    </div>
  {/if}

  <AddContactModal bind:open={addOpen} />
  <CreateGroupModal bind:open={groupOpen} />
  <CreateBroadcastModal bind:open={broadcastOpen} />

  <!-- Footer — mirrors the me-card gradient to bracket the list -->
  <div class="footer">
    <button class="add-btn" on:click={() => addOpen = true}>
      <svg viewBox="0 0 14 14" fill="none" width="12" height="12" aria-hidden="true">
        <path d="M7 2v10M2 7h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      </svg>
      {$_('contacts.panel.add_contact')}
    </button>
    <button class="add-btn group-btn" on:click={() => groupOpen = true} title={$_('contacts.panel.new_group_aria')} aria-label={$_('contacts.panel.new_group_aria')}>
      <svg viewBox="0 0 14 14" fill="none" width="12" height="12" aria-hidden="true">
        <circle cx="5" cy="5" r="2.5" stroke="currentColor" stroke-width="1.4"/>
        <circle cx="10" cy="5" r="2" stroke="currentColor" stroke-width="1.4"/>
        <path d="M1 12c0-2 1.8-3.5 4-3.5s4 1.5 4 3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
        <path d="M10 7c1.5 0 3 1 3 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
      </svg>
    </button>
    <button class="add-btn group-btn" on:click={() => broadcastOpen = true} title="New broadcast" aria-label="New broadcast">
      <svg viewBox="0 0 14 14" fill="none" width="12" height="12" aria-hidden="true">
        <path d="M2 5h2l4-3v10l-4-3H2V5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
        <path d="M11 5c1 .6 1 3.4 0 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        <path d="M7 2v-1.3M12.5 7h1.3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
      </svg>
    </button>
    <button class="icon-btn" on:click={() => go('settings')} title={$_('contacts.panel.settings_aria')} aria-label={$_('contacts.panel.settings_aria')}>
      <svg viewBox="0 0 18 18" fill="none" width="16" height="16" aria-hidden="true">
        <circle cx="9" cy="9" r="2.2" stroke="currentColor" stroke-width="1.4"/>
        <path d="M9 1.5v2M9 14.5v2M1.5 9h2M14.5 9h2M3.4 3.4l1.4 1.4M13.2 13.2l1.4 1.4M14.6 3.4l-1.4 1.4M4.8 13.2l-1.4 1.4"
              stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
      </svg>
    </button>
  </div>
</aside>

<style>
.panel {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border-right: 1px solid var(--border);
  overflow: hidden;
  flex-shrink: 0;
}

/* ── Me card ── */
.me-card {
  display: flex; align-items: flex-start; gap: .7rem;
  padding: 1rem .85rem .9rem;
  padding-top: calc(1rem + var(--safe-top));
  background: var(--panel-header);
  flex-shrink: 0;
}
.me-avatar { padding-top: 2px; }
.me-info {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column; gap: .12rem;
}
.me-name {
  display: block;
  font-size: 14px; font-weight: 700;
  color: #fff;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  letter-spacing: -0.02em;
  line-height: 1.3;
}
.me-status-inline {
  font-size: 11px; font-weight: 400;
  color: oklch(1 0 0 / 0.62);
  letter-spacing: 0;
}
.me-msg {
  display: block;
  font-size: 11px;
  color: oklch(1 0 0 / 0.65);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  line-height: 1.3;
}
.status-sel {
  font-family: var(--font-ui);
  font-size: 11px; font-weight: 500;
  color: oklch(1 0 0 / 0.80);
  background: oklch(1 0 0 / 0.10);
  border: 1px solid oklch(1 0 0 / 0.20);
  border-radius: 4px;
  padding: 2px 6px;
  cursor: pointer;
  margin-top: .15rem;
  width: fit-content;
  appearance: none;
  -webkit-appearance: none;
}
.status-sel option { color: var(--text); background: var(--surface); }
.status-sel:focus  { outline: none; border-color: oklch(1 0 0 / 0.50); }

/* ── Search ── */
.search-wrap {
  padding: .55rem .65rem .45rem;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border-subtle);
}
.search-inner {
  position: relative;
  display: flex; align-items: center;
}
.search-icon {
  position: absolute; left: .55rem;
  width: 13px; height: 13px;
  color: var(--text-faint);
  pointer-events: none;
}
.search {
  width: 100%;
  padding: .38rem .65rem .38rem 1.85rem;
  border: 1px solid var(--border);
  border-radius: 99px;
  background: var(--surface-2);
  font-size: 12px; font-weight: 400;
  transition: border-color .12s, background .12s;
}
.search:focus { outline: none; border-color: var(--accent); background: var(--surface); }
.search::placeholder { color: var(--text-faint); }
.search::-webkit-search-cancel-button { display: none; }

/* ── List ── */
.list {
  flex: 1; overflow-y: auto;
  padding: .4rem 0 .2rem;
}
.empty {
  font-size: 12px;
  color: var(--text-faint);
  text-align: center;
  padding: 2rem 1rem;
  line-height: 1.7;
}

/* ── Footer — gradient bracket, mirrors the me-card ── */
.footer {
  display: flex; align-items: center; gap: .25rem;
  padding: .6rem .55rem;
  flex-shrink: 0;
  min-height: 54px;
  /* reversed gradient of the me-card — blue-to-green at the bottom */
  background: linear-gradient(155deg, oklch(0.23 0.08 218) 0%, oklch(0.28 0.10 155) 100%);
  border-top: none;
}
.add-btn {
  flex: 1;
  display: flex; align-items: center; gap: .4rem;
  font-size: 12px; font-weight: 500;
  color: oklch(1 0 0 / 0.82);
  padding: .38rem .6rem;
  border: 1px solid oklch(1 0 0 / 0.22);
  border-radius: var(--radius);
  transition: background .12s, border-color .12s;
}
.add-btn:hover { background: oklch(1 0 0 / 0.10); border-color: oklch(1 0 0 / 0.40); }

.icon-btn {
  padding: .38rem;
  color: oklch(1 0 0 / 0.65);
  border-radius: var(--radius);
  transition: color .12s, background .12s;
  display: flex; align-items: center; justify-content: center;
}
.icon-btn:hover { color: oklch(1 0 0 / 0.90); background: oklch(1 0 0 / 0.10); }

/* ── Groups section ── */
.section-header-row {
  display: flex; align-items: center;
  padding: .45rem .85rem .1rem;
}
.section-label {
  font-size: 10.5px; font-weight: 700;
  color: var(--text-faint);
  letter-spacing: .05em;
  text-transform: uppercase;
}

.group-section {
  border-top: 1px solid var(--border-subtle);
  padding: .3rem 0 .2rem;
}
.group-header-row {
  display: flex; align-items: center;
  padding: .3rem .85rem .15rem;
}
.group-label {
  font-size: 10.5px; font-weight: 700;
  color: var(--text-faint);
  letter-spacing: .05em;
  text-transform: uppercase;
}
.group-item {
  display: flex; align-items: center; gap: .6rem;
  width: 100%; padding: .42rem .75rem;
  font-size: 12.5px; text-align: left;
  border-radius: 0;
  transition: background .1s;
  min-height: 44px;
}
.group-item:hover { background: var(--surface-2); }
.group-item.active { background: oklch(from var(--accent) l c h / 0.10); }
.group-avatar {
  width: 28px; height: 28px; border-radius: 50%;
  background: var(--accent);
  color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700;
  flex-shrink: 0;
}
.group-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: .06rem; }
.group-name {
  font-weight: 600; color: var(--text);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.group-sub { font-size: 10.5px; color: var(--text-faint); }
.unread-badge {
  font-size: 10px; font-weight: 700;
  background: var(--accent); color: #fff;
  border-radius: 99px; padding: 1px 6px;
  flex-shrink: 0;
}

.group-btn {
  flex: none;
  padding: .38rem .6rem;
  min-width: 36px;
  justify-content: center;
}

/* ── Filter tabs ── */
.filter-tabs {
  display: flex;
  padding: .3rem .5rem;
  gap: .2rem;
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
  overflow-x: auto;
  scrollbar-width: none;
}
.filter-tabs::-webkit-scrollbar { display: none; }
.filter-tab {
  flex-shrink: 0;
  padding: .25rem .65rem;
  font-size: 11.5px; font-weight: 500;
  color: var(--text-faint);
  border-radius: 99px;
  border: 1px solid transparent;
  transition: color .12s, background .12s, border-color .12s;
}
.filter-tab:hover { color: var(--text-muted); }
.filter-tab.active {
  background: oklch(from var(--accent) l c h / 0.10);
  color: var(--accent);
  border-color: oklch(from var(--accent) l c h / 0.25);
  font-weight: 600;
}

/* ── Broadcast avatar ── */
.bc-avatar {
  width: 28px; height: 28px; border-radius: 50%;
  background: oklch(0.55 0.18 320);
  color: #fff;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}

/* ── Archived section ── */
.archived-toggle {
  display: flex; align-items: center; gap: .45rem;
  width: 100%; padding: .5rem .7rem;
  font-size: 11.5px; font-weight: 500; color: var(--text-muted);
  border-top: 1px solid var(--border-subtle);
  margin-top: .25rem;
  transition: color .12s, background .12s;
}
.archived-toggle:hover { color: var(--text-2); background: var(--surface-2); border-radius: var(--radius); }
.archived-count {
  background: var(--surface-2); border-radius: 99px;
  font-size: 10px; font-weight: 600;
  padding: 1px 6px;
  margin-left: .1rem;
}
.chevron { margin-left: auto; transition: transform .15s; }
.chevron.open { transform: rotate(180deg); }

@media (pointer: coarse) {
  .add-btn  { min-height: 44px; }
  .icon-btn { min-width: 44px; min-height: 44px; }
  .status-sel { min-height: 36px; padding: 4px 8px; }
}
</style>
