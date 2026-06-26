<script lang="ts">
  import ContactItem from './ContactItem.svelte';
  import type { Contact } from '$lib/stores/contacts';

  export let label:    string;
  export let contacts: Contact[];
  export let defaultOpen = true;

  let open = defaultOpen;

  // Auto-open whenever a contact arrives in this group (catches offline→online moves)
  let prevCount = contacts.length;
  $: {
    if (contacts.length > prevCount && defaultOpen) open = true;
    prevCount = contacts.length;
  }
</script>

{#if contacts.length > 0}
  <div class="group">
    <button class="header" on:click={() => open = !open} aria-expanded={open}>
      <svg class="chevron" class:open viewBox="0 0 10 10" fill="none" aria-hidden="true">
        <path d="M2 3.5 L5 6.5 L8 3.5" stroke="currentColor" stroke-width="1.5"
              stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span class="label">{label}</span>
      <span class="count">{contacts.length}</span>
    </button>
    <div class="list-wrap" class:open>
      <div class="list">
        {#each contacts as c (c.pin)}
          <ContactItem contact={c} />
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
.group { margin-bottom: .1rem; }

.header {
  display: flex; align-items: center; gap: .4rem;
  width: 100%; padding: .3rem .75rem .3rem .6rem;
  color: var(--text-faint);
  font-size: 10.5px; font-weight: 700;
  text-transform: uppercase; letter-spacing: .08em;
  transition: color .12s ease;
}
.header:hover { color: var(--text-muted); }

.chevron {
  width: 10px; height: 10px; flex-shrink: 0;
  transition: transform .18s ease;
  transform: rotate(-90deg);
}
.chevron.open { transform: rotate(0deg); }

.count {
  margin-left: auto;
  font-size: 10px; font-weight: 600;
  opacity: .65;
  font-variant-numeric: tabular-nums;
}

/* Smooth collapse via grid-template-rows */
.list-wrap {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows .2s ease;
}
.list-wrap.open { grid-template-rows: 1fr; }

.list {
  min-height: 0;
  overflow: hidden;
  padding: 0 .3rem;
}
</style>
