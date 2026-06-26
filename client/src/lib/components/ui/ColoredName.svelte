<script lang="ts">
  import { parseColoredName } from '$lib/utils/coloredName';

  export let name: string;
</script>

{#each parseColoredName(name) as seg (seg.text + seg.color)}{#if seg.color}<span style="color:{seg.color}">{seg.text}</span>{:else}{seg.text}{/if}{/each}
