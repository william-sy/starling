<script lang="ts">
  import type { Status } from '$lib/stores/contacts';
  export let status: Status = 'offline';
</script>

<span class="dot {status}" title={status}></span>

<style>
.dot {
  display: inline-block;
  width: 9px; height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
}
.online  { background: var(--status-online); }
.away    { background: var(--status-away); }
.busy    { background: var(--status-busy); }
.offline { background: var(--status-offline); }
</style>
