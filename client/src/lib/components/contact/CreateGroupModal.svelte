<script lang="ts">
  import { contacts }  from '$lib/stores/contacts';
  import { groups }    from '$lib/stores/groups';
  import { relayGroupInvite, relayDistributeGroupKey } from '$lib/stores/relay';
  import { generateGroupKey, saveGroupKey } from '$lib/crypto/index';
  import { _ } from '$lib/i18n';

  export let open = false;

  let name        = '';
  let selected    = new Set<string>();
  let error       = '';

  function toggle(pin: string) {
    const next = new Set(selected);
    if (next.has(pin)) next.delete(pin); else next.add(pin);
    selected = next;
  }

  async function create() {
    error = '';
    if (!name.trim()) { error = $_('contacts.create_group_modal.error_name'); return; }
    if (selected.size === 0) { error = $_('contacts.create_group_modal.error_contacts'); return; }
    const group = groups.createGroup(name.trim(), [...selected]);
    const gk = generateGroupKey();
    saveGroupKey(group.id, gk);
    relayGroupInvite(group).catch(() => {});
    relayDistributeGroupKey(group, gk).catch(() => {});
    name     = '';
    selected = new Set();
    open     = false;
  }

  function close() {
    name     = '';
    selected = new Set();
    error    = '';
    open     = false;
  }

  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return { destroy() {} };
  }
</script>

{#if open}
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="overlay" use:portal on:click|self={close} on:keydown={e => e.key === 'Escape' && close()} role="dialog" aria-modal="true" aria-label={$_('contacts.create_group_modal.title')}>
    <div class="modal">
      <div class="header">
        <span class="title">{$_('contacts.create_group_modal.title')}</span>
        <button class="close-btn" on:click={close} aria-label={$_('contacts.create_group_modal.close_aria')}>
          <svg viewBox="0 0 12 12" fill="none" width="11" height="11">
            <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
          </svg>
        </button>
      </div>

      <div class="body">
        <label class="field-label" for="group-name">{$_('contacts.create_group_modal.name_label')}</label>
        <input
          id="group-name"
          class="text-input"
          class:error={!!error && !name.trim()}
          type="text"
          placeholder={$_('contacts.create_group_modal.name_placeholder')}
          maxlength="40"
          bind:value={name}
          on:keydown={e => e.key === 'Enter' && create()}
        />

        <p class="field-label" style="margin-top: .85rem">{$_('contacts.create_group_modal.contacts_label')}</p>
        <div class="contact-list" role="listbox" aria-multiselectable="true">
          {#each $contacts as c}
            <button
              class="contact-row"
              class:chosen={selected.has(c.pin)}
              role="option"
              aria-selected={selected.has(c.pin)}
              on:click={() => toggle(c.pin)}
            >
              <div class="check" aria-hidden="true">{selected.has(c.pin) ? '✓' : ''}</div>
              <span class="cname">{c.display_name}</span>
              <span class="cpin">{c.pin}</span>
            </button>
          {/each}
          {#if $contacts.length === 0}
            <p class="empty-hint">{$_('contacts.create_group_modal.empty')}</p>
          {/if}
        </div>

        {#if error}
          <p class="err-msg">{error}</p>
        {/if}
      </div>

      <div class="footer">
        <button class="btn-cancel" on:click={close}>{$_('contacts.create_group_modal.cancel')}</button>
        <button class="btn-create" on:click={create} disabled={!name.trim() || selected.size === 0}>
          {$_('contacts.create_group_modal.create')}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
.overlay {
  position: fixed; inset: 0;
  background: oklch(0 0 0 / 0.45);
  display: flex; align-items: center; justify-content: center;
  z-index: 200;
  padding: 1rem;
}
.modal {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  width: 100%; max-width: 360px;
  box-shadow: var(--shadow-lg);
  display: flex; flex-direction: column;
  overflow: hidden;
  animation: pop-in .15s cubic-bezier(0.25, 1, 0.5, 1);
}
@keyframes pop-in {
  from { opacity: 0; transform: scale(.95); }
  to   { opacity: 1; transform: scale(1); }
}
@media (prefers-reduced-motion: reduce) {
  .modal { animation: none; }
}
.header {
  display: flex; align-items: center;
  padding: .85rem 1rem .7rem;
  border-bottom: 1px solid var(--border-subtle);
}
.title {
  flex: 1;
  font-size: 14px; font-weight: 700;
  letter-spacing: -0.02em;
}
.close-btn {
  display: flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; border-radius: 50%;
  color: var(--text-muted);
  transition: color .1s, background .1s;
}
.close-btn:hover { color: var(--text); background: var(--surface-2); }

.body { padding: 1rem; display: flex; flex-direction: column; gap: .35rem; }

.field-label {
  font-size: 11px; font-weight: 600;
  color: var(--text-muted);
  letter-spacing: .02em;
  margin-bottom: .18rem;
}
.text-input {
  width: 100%;
  padding: .48rem .75rem;
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  font-size: 13.5px;
  transition: border-color .12s;
}
.text-input:focus { outline: none; border-color: var(--accent); }
.text-input.error { border-color: oklch(0.60 0.20 25); }

.contact-list {
  max-height: 180px;
  overflow-y: auto;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  margin-top: .15rem;
}
.contact-row {
  display: flex; align-items: center; gap: .6rem;
  width: 100%; padding: .48rem .65rem;
  font-size: 12.5px; text-align: left;
  transition: background .1s;
  border-bottom: 1px solid var(--border-subtle);
}
.contact-row:last-child { border-bottom: none; }
.contact-row:hover { background: var(--surface-2); }
.contact-row.chosen { background: oklch(from var(--accent) l c h / 0.08); }
.check {
  width: 16px; height: 16px; border-radius: 50%;
  border: 1.5px solid var(--border);
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 700;
  color: var(--accent); flex-shrink: 0;
  transition: border-color .1s, background .1s;
}
.contact-row.chosen .check {
  background: oklch(from var(--accent) l c h / 0.15);
  border-color: var(--accent);
}
.cname { flex: 1; font-weight: 600; color: var(--text); }
.cpin  { font-size: 10.5px; color: var(--text-faint); font-variant-numeric: tabular-nums; }
.empty-hint {
  font-size: 12px; color: var(--text-faint);
  text-align: center; padding: 1rem;
}

.err-msg {
  font-size: 11.5px; color: oklch(0.60 0.20 25);
  margin-top: .25rem;
}

.footer {
  display: flex; justify-content: flex-end; gap: .5rem;
  padding: .75rem 1rem;
  border-top: 1px solid var(--border-subtle);
}
.btn-cancel {
  padding: .42rem .85rem;
  font-size: 12.5px; color: var(--text-muted);
  border-radius: var(--radius);
  border: 1px solid var(--border);
  transition: background .1s, color .1s;
}
.btn-cancel:hover { background: var(--surface-2); color: var(--text); }
.btn-create {
  padding: .42rem .9rem;
  font-size: 12.5px; font-weight: 600;
  background: var(--accent); color: #fff;
  border-radius: var(--radius);
  transition: background .12s, opacity .12s;
}
.btn-create:hover:not(:disabled) { background: var(--accent-hover); }
.btn-create:disabled { opacity: .35; cursor: not-allowed; }
</style>
