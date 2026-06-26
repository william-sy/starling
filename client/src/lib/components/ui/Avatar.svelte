<script lang="ts">
  import type { Status } from '$lib/stores/contacts';
  export let src:    string | null = null;
  export let name:   string = '?';
  export let size:   number = 36;
  export let status: Status | null = null;
</script>

<div class="avatar" style="--sz:{size}px" data-status={status}>
  {#if src}
    <img {src} alt={name} draggable="false" />
  {:else}
    <span class="initial">{name[0]?.toUpperCase() ?? '?'}</span>
  {/if}
</div>

<style>
.avatar {
  position: relative;
  width: var(--sz); height: var(--sz);
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--accent);
  overflow: visible;
  transition: box-shadow 0.15s ease;
}
img {
  width: 100%; height: 100%;
  border-radius: 50%;
  object-fit: cover;
  display: block;
}
.initial {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  color: #fff;
  font-size: calc(var(--sz) * .38);
  font-weight: 600;
  border-radius: 50%;
  letter-spacing: -0.01em;
  user-select: none;
}

/* Presence rings via box-shadow — no layout impact */
.avatar[data-status="online"]  { box-shadow: 0 0 0 2px var(--status-online); }
.avatar[data-status="away"]    { box-shadow: 0 0 0 2px var(--status-away); }
.avatar[data-status="busy"]    { box-shadow: 0 0 0 2px var(--status-busy); }
.avatar[data-status="offline"] { box-shadow: 0 0 0 1.5px var(--status-offline); opacity: 0.6; }

@media (prefers-reduced-motion: reduce) {
  .avatar { transition: none; }
}
</style>
