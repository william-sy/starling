<script lang="ts">
  import Modal from '$lib/components/ui/Modal.svelte';
  import { contacts } from '$lib/stores/contacts';
  import { createBroadcast, type BroadcastMode } from '$lib/stores/broadcasts';

  export let open = false;

  type Step = 'info' | 'recipients';
  let step: Step          = 'info';
  let name                = '';
  let mode: BroadcastMode = 'private';
  let selectedPins        = new Set<string>();
  let nameError           = '';

  $: if (!open) { step = 'info'; name = ''; mode = 'private'; selectedPins = new Set(); nameError = ''; }

  function nextStep() {
    if (!name.trim()) { nameError = 'Give your broadcast a name.'; return; }
    nameError = '';
    step = 'recipients';
  }

  function togglePin(pin: string) {
    const s = new Set(selectedPins);
    if (s.has(pin)) s.delete(pin); else s.add(pin);
    selectedPins = s;
  }

  function create() {
    if (selectedPins.size === 0) return;
    createBroadcast(name.trim(), mode, [...selectedPins]);
    open = false;
  }
</script>

<Modal {open} title="New broadcast" width="440px" on:close={() => open = false}>
  <div class="wizard">

    {#if step === 'info'}
      <div class="field">
        <label class="label" for="bc-name">Broadcast name</label>
        <input
          id="bc-name"
          class="input"
          class:invalid={!!nameError}
          type="text"
          placeholder="e.g. Team updates"
          maxlength="40"
          bind:value={name}
          on:keydown={e => e.key === 'Enter' && nextStep()}
          autocomplete="off"
        />
        {#if nameError}
          <span class="feedback error">{nameError}</span>
        {/if}
      </div>

      <div class="field">
        <span class="label">Mode</span>
        <div class="mode-cards">
          <label class="mode-card" class:selected={mode === 'private'}>
            <input type="radio" bind:group={mode} value="private" />
            <div class="mode-body">
              <span class="mode-title">Private</span>
              <span class="mode-desc">Lands as a direct message in each recipient's Nest. They can reply normally.</span>
            </div>
          </label>
          <label class="mode-card" class:selected={mode === 'channel'}>
            <input type="radio" bind:group={mode} value="channel" />
            <div class="mode-body">
              <span class="mode-title">Channel</span>
              <span class="mode-desc">Recipients see it as a one-way broadcast. No replies.</span>
            </div>
          </label>
        </div>
      </div>

      <div class="actions">
        <button class="btn-primary" on:click={nextStep}>Next: add recipients</button>
        <button class="btn-cancel" on:click={() => open = false}>Cancel</button>
      </div>

    {:else}
      <p class="desc">Choose who receives messages sent to this broadcast.</p>

      <div class="recipient-list">
        {#each $contacts as c}
          <label class="recipient-item" class:checked={selectedPins.has(c.pin)}>
            <input type="checkbox" checked={selectedPins.has(c.pin)} on:change={() => togglePin(c.pin)} />
            <div class="rec-avatar">{c.display_name.charAt(0).toUpperCase()}</div>
            <span class="rec-name">{c.display_name}</span>
          </label>
        {/each}
        {#if $contacts.length === 0}
          <p class="empty">Add some contacts first.</p>
        {/if}
      </div>

      <div class="actions">
        <button class="btn-primary" on:click={create} disabled={selectedPins.size === 0}>
          Create ({selectedPins.size} recipient{selectedPins.size !== 1 ? 's' : ''})
        </button>
        <button class="btn-cancel" on:click={() => step = 'info'}>Back</button>
      </div>
    {/if}

  </div>
</Modal>

<style>
.wizard { display: flex; flex-direction: column; gap: 1.1rem; }
.field  { display: flex; flex-direction: column; gap: .35rem; }
.label  { font-size: 13px; font-weight: 600; color: var(--text-2); }
.input {
  padding: .52rem .75rem;
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  font-size: 14px;
  transition: border-color .12s;
}
.input:focus { outline: none; border-color: var(--accent); }
.input.invalid { border-color: oklch(0.62 0.22 25); }
.feedback { font-size: 12px; }
.error { color: oklch(0.62 0.22 25); }
.desc  { font-size: 13px; color: var(--text-muted); }

.mode-cards { display: flex; flex-direction: column; gap: .5rem; }
.mode-card {
  display: flex; align-items: flex-start; gap: .75rem;
  padding: .7rem .85rem;
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  cursor: pointer;
  transition: border-color .12s, background .12s;
}
.mode-card input[type=radio] { margin-top: .15rem; flex-shrink: 0; accent-color: var(--accent); }
.mode-card.selected { border-color: var(--accent); background: oklch(from var(--accent) l c h / 0.12); }
.mode-body { display: flex; flex-direction: column; gap: .2rem; }
.mode-title { font-size: 13.5px; font-weight: 600; color: var(--text); }
.mode-desc  { font-size: 12px; color: var(--text-muted); line-height: 1.5; }

.recipient-list {
  display: flex; flex-direction: column; gap: .2rem;
  max-height: 220px; overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: .3rem;
}
.recipient-item {
  display: flex; align-items: center; gap: .6rem;
  padding: .45rem .6rem;
  border-radius: calc(var(--radius) - 2px);
  cursor: pointer;
  transition: background .08s;
}
.recipient-item:hover, .recipient-item.checked { background: var(--surface-2); }
.recipient-item input { accent-color: var(--accent); flex-shrink: 0; }
.rec-avatar {
  width: 26px; height: 26px; border-radius: 50%;
  background: var(--accent); color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 700; flex-shrink: 0;
}
.rec-name { font-size: 13px; font-weight: 500; color: var(--text); }
.empty { font-size: 13px; color: var(--text-faint); padding: 1rem; text-align: center; }

.actions { display: flex; gap: .6rem; padding-top: .2rem; }
.btn-primary {
  padding: .55rem 1.2rem;
  background: var(--accent); color: #fff;
  border-radius: var(--radius);
  font-size: 13px; font-weight: 600;
  transition: opacity .12s;
}
.btn-primary:hover:not(:disabled) { opacity: .9; }
.btn-primary:disabled { opacity: .45; cursor: not-allowed; }
.btn-cancel {
  padding: .55rem .9rem;
  font-size: 13px; font-weight: 500;
  color: var(--text-muted);
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  transition: background .12s, color .12s;
}
.btn-cancel:hover { background: var(--surface-2); color: var(--text); }
</style>
