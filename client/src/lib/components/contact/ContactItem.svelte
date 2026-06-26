<script lang="ts">
  import Avatar       from '$lib/components/ui/Avatar.svelte';
  import ColoredName  from '$lib/components/ui/ColoredName.svelte';
  import { stripColorCodes } from '$lib/utils/coloredName';
  import type { Contact } from '$lib/stores/contacts';
  import { activePin } from '$lib/stores/contacts';
  import { activeGroupId } from '$lib/stores/groups';
  import { activeBroadcastId } from '$lib/stores/broadcasts';
  import { settings } from '$lib/stores/settings';

  export let contact: Contact;
  $: active = $activePin === contact.pin;

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

  $: subLine = (() => {
    if ($settings.showLastSeen && contact.status === 'offline' && contact.last_seen)
      return `last seen ${formatLastSeen(contact.last_seen)}`;
    return contact.personal_msg || contact.status;
  })();
</script>

<button
  class="item"
  class:active
  on:click={() => { activePin.set(contact.pin); activeGroupId.set(null); activeBroadcastId.set(null); }}
  title={stripColorCodes(contact.display_name)}
>
  <Avatar name={stripColorCodes(contact.display_name)} src={contact.avatar_url} size={34} status={contact.status} />
  <div class="info">
    <div class="row1">
      <span class="name"><ColoredName name={contact.display_name} /></span>
      {#if contact.is_bot}
        <span class="bot-chip" aria-label="Bot account">Bot</span>
      {/if}
      {#if contact.unread > 0}
        <span class="badge">{contact.unread > 9 ? '9+' : contact.unread}</span>
      {/if}
    </div>
    <span class="sub">{subLine}</span>
  </div>
</button>

<style>
.item {
  display: flex;
  align-items: center;
  gap: .6rem;
  width: 100%;
  padding: .45rem .7rem;
  border-radius: var(--radius);
  text-align: left;
  transition: background .12s ease;
  color: var(--text);
  min-height: 52px;
}

@media (pointer: coarse) {
  .item { min-height: 60px; padding: .6rem .7rem; }
}
.item:hover  { background: var(--surface-2); }
.item.active { background: var(--surface-3); }

.info { flex: 1; min-width: 0; }
.row1 { display: flex; align-items: center; justify-content: space-between; gap: .35rem; }

.name {
  font-size: 13px; font-weight: 600;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  letter-spacing: -0.01em;
}

.badge {
  background: var(--accent);
  color: #fff;
  font-size: 9.5px; font-weight: 700;
  border-radius: 99px;
  padding: 1px 5px;
  min-width: 16px; text-align: center;
  flex-shrink: 0;
  line-height: 14px;
}

.sub {
  font-size: 11px;
  color: var(--text-muted);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  display: block;
  margin-top: 1px;
}

.bot-chip {
  font-size: 9px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;
  color: oklch(0.55 0.15 280);
  background: oklch(0.55 0.15 280 / 0.12);
  border-radius: 99px;
  padding: 1px 5px;
  flex-shrink: 0;
  line-height: 14px;
}
</style>
