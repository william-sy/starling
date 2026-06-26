<script lang="ts">
  import { onMount } from 'svelte';
  import { fetchOg, type OgMeta } from '$lib/utils/og';

  export let url: string;
  export let isMe: boolean;

  let meta: OgMeta | null = null;
  let loading = true;

  onMount(async () => {
    meta    = await fetchOg(url);
    loading = false;
  });

  function hideImg(e: Event) {
    (e.currentTarget as HTMLImageElement).style.display = 'none';
  }
</script>

{#if loading}
  <div class="preview-skeleton" class:me={isMe}></div>
{:else if meta}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <a class="preview" class:me={isMe} href={url} target="_blank" rel="noopener noreferrer" title={url}>
    {#if meta.image}
      <img class="preview-img" src={meta.image} alt="" loading="lazy"
           on:error={hideImg} />
    {/if}
    <div class="preview-body">
      <span class="preview-domain">{meta.domain}</span>
      {#if meta.title}
        <span class="preview-title">{meta.title}</span>
      {/if}
      {#if meta.description}
        <span class="preview-desc">{meta.description}</span>
      {/if}
    </div>
  </a>
{/if}

<style>
.preview-skeleton {
  height: 56px;
  border-radius: var(--radius);
  background: oklch(0 0 0 / 0.06);
  animation: pulse 1.4s ease-in-out infinite;
  margin-top: .35rem;
}
.preview-skeleton.me { background: oklch(1 0 0 / 0.1); }
@keyframes pulse {
  0%, 100% { opacity: .5; }
  50%       { opacity: 1;  }
}
@media (prefers-reduced-motion: reduce) { .preview-skeleton { animation: none; } }

.preview {
  display: flex; flex-direction: column;
  margin-top: .35rem;
  border-radius: var(--radius);
  border: 1.5px solid oklch(0 0 0 / 0.1);
  overflow: hidden;
  text-decoration: none;
  transition: border-color .12s, background .12s;
  background: oklch(0 0 0 / 0.03);
}
.preview.me {
  border-color: oklch(1 0 0 / 0.18);
  background: oklch(1 0 0 / 0.06);
}
.preview:hover { border-color: var(--accent); }

.preview-img {
  width: 100%; max-height: 140px;
  object-fit: cover;
  display: block;
}

.preview-body {
  display: flex; flex-direction: column; gap: 2px;
  padding: .45rem .6rem;
}

.preview-domain {
  font-size: 10px; font-weight: 600; opacity: .5;
  text-transform: uppercase; letter-spacing: .04em;
}
.preview-title {
  font-size: 12.5px; font-weight: 700; line-height: 1.3;
  color: inherit;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden;
}
.preview-desc {
  font-size: 11.5px; opacity: .65; line-height: 1.35;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
