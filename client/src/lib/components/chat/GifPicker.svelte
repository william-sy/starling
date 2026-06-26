<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';

  export let open      = false;
  export let anchorEl: HTMLElement | null = null;

  const dispatch = createEventDispatcher<{ pick: { url: string; title: string; isSticker: boolean } }>();

  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    if (anchorEl) {
      const r = anchorEl.getBoundingClientRect();
      node.style.position = 'fixed';
      node.style.bottom   = `${window.innerHeight - r.top + 6}px`;
      node.style.right    = `${window.innerWidth - r.right}px`;
      node.style.left     = 'auto';
      node.style.top      = 'auto';
    }
    return { destroy() {} };
  }

  function backdropPortal(node: HTMLElement) {
    document.body.appendChild(node);
    return { destroy() {} };
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') open = false;
  }

  // Klipy is Tenor-compatible — same API shape, just different base URL.
  // Key lives in .env.local (dev) and server-side on the relay (production).
  const KEY    = import.meta.env.VITE_KLIPY_KEY as string | undefined;
  const BASE   = 'https://api.klipy.com/v2';
  const hasKey = !!KEY;

  type Tab = 'gif' | 'sticker';

  interface MediaResult {
    id:      string;
    title:   string;
    url:     string;
    preview: string;
  }

  let tab: Tab       = 'gif';
  let query          = '';
  let results: MediaResult[] = [];
  let loading        = false;
  let disclosed      = false;
  let debounce: ReturnType<typeof setTimeout>;
  let initialized    = false;

  onMount(() => {
    disclosed = localStorage.getItem('mwt:gif-disclosed') === '1';
  });

  function acceptDisclosure() {
    localStorage.setItem('mwt:gif-disclosed', '1');
    disclosed = true;
    load('');
  }

  const FILTER: Record<Tab, string> = {
    gif:     'gif,tinygif',
    sticker: 'webp_transparent,transparent_webp',
  };

  async function load(q: string) {
    if (!hasKey) return;
    loading = true;
    results = [];
    try {
      const endpoint = q.trim() ? 'search' : 'featured';
      const params   = new URLSearchParams({
        key:          KEY!,
        client_key:   'mwt',
        limit:        '18',
        media_filter: FILTER[tab],
        ...(q.trim() ? { q } : {}),
      });
      const r    = await fetch(`${BASE}/${endpoint}?${params}`, { signal: AbortSignal.timeout(5000) });
      const data = await r.json();
      results = parseResults(data.results ?? []);
    } catch { results = []; }
    loading = false;
  }

  function parseResults(raw: any[]): MediaResult[] {
    return raw.map(item => {
      const fmt  = item.media_formats ?? {};
      const main = fmt.gif?.url ?? fmt.webp_transparent?.url ?? fmt.mp4?.url ?? '';
      const tiny = fmt.tinygif?.url ?? fmt.transparent_webp?.url ?? main;
      return { id: item.id, title: item.title ?? '', url: main, preview: tiny };
    }).filter(g => g.url);
  }

  function onQueryInput() {
    clearTimeout(debounce);
    debounce = setTimeout(() => load(query), 350);
  }

  function switchTab(t: Tab) {
    tab = t;
    results = [];
    load(query);
  }

  function pick(item: MediaResult) {
    dispatch('pick', { url: item.url, title: item.title, isSticker: tab === 'sticker' });
  }

  $: if (open && disclosed && hasKey && !initialized) {
    initialized = true;
    load(query);
  }
  $: if (!open) { query = ''; results = []; loading = false; initialized = false; }
</script>

<svelte:window on:keydown={onKey} />

{#if open}
  <div class="gif-backdrop" use:backdropPortal on:click={() => (open = false)}></div>
  <div class="panel" use:portal role="dialog" aria-label="GIF and sticker picker">
    {#if !hasKey}
      <div class="message-state">
        <p class="state-title">GIF search not configured</p>
        <p class="state-body">
          Add <code>VITE_KLIPY_KEY</code> to <code>.env.local</code>.<br/>
          Get a free key at <strong>partner.klipy.com</strong>.<br/>
          In production the relay holds the key — it never ships in the app.
        </p>
      </div>

    {:else if !disclosed}
      <div class="message-state">
        <p class="state-title">GIFs and stickers</p>
        <p class="state-body">
          Searches are sent to <strong>Klipy</strong>. Your queries and IP are processed by their servers according to their privacy policy.
        </p>
        <button class="accept-btn" on:click={acceptDisclosure}>Got it — enable GIF search</button>
      </div>

    {:else}
      <div class="top-bar">
        <div class="tabs">
          <button class="tab" class:active={tab === 'gif'}     on:click={() => switchTab('gif')}>GIFs</button>
          <button class="tab" class:active={tab === 'sticker'} on:click={() => switchTab('sticker')}>Stickers</button>
        </div>
        <input
          class="search"
          type="search"
          placeholder="Search..."
          bind:value={query}
          on:input={onQueryInput}
          autocomplete="off"
        />
      </div>

      <div class="grid" class:loading>
        {#if loading}
          <span class="spinner"></span>
        {:else if results.length === 0}
          <p class="empty">No results</p>
        {:else}
          {#each results as item (item.id)}
            <button class="item-btn" on:click={() => pick(item)} title={item.title} aria-label={item.title || 'GIF'}>
              <img src={item.preview} alt={item.title} loading="lazy" />
            </button>
          {/each}
        {/if}
      </div>

      <div class="credit">Powered by Klipy</div>
    {/if}
  </div>
{/if}

<style>
.gif-backdrop {
  position: fixed;
  inset: 0;
  z-index: 599;
}

.panel {
  position: fixed;
  width: min(304px, calc(100vw - 1rem));
  max-height: 340px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg);
  display: flex; flex-direction: column;
  overflow: hidden;
  z-index: 600;
}

@media (max-width: 767px) {
  .panel {
    bottom: 0 !important;
    left: 0 !important;
    right: 0 !important;
    top: auto !important;
    width: 100% !important;
    max-height: 55vh;
    border-radius: var(--radius-xl) var(--radius-xl) 0 0;
  }
}

/* Message states */
.message-state {
  padding: 1.1rem;
  display: flex; flex-direction: column; gap: .6rem;
}
.state-title {
  font-size: 13px; font-weight: 700;
  color: var(--text);
  letter-spacing: -0.02em;
}
.state-body {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.65;
}
.state-body code {
  font-family: 'Menlo', 'Consolas', monospace;
  font-size: 11px;
  background: var(--surface-2);
  padding: 1px 5px;
  border-radius: 4px;
}
.accept-btn {
  align-self: flex-start;
  padding: .38rem .9rem;
  background: var(--accent); color: #fff;
  border-radius: var(--radius);
  font-size: 12px; font-weight: 600;
  transition: background .12s;
}
.accept-btn:hover { background: var(--accent-hover); }

/* Top bar */
.top-bar {
  display: flex; align-items: center; gap: .5rem;
  padding: .5rem .55rem .4rem;
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
}
.tabs {
  display: flex; gap: .2rem;
  flex-shrink: 0;
}
.tab {
  font-size: 11.5px; font-weight: 600;
  padding: .2rem .55rem;
  border-radius: 99px;
  color: var(--text-muted);
  transition: color .1s, background .1s;
}
.tab:hover  { color: var(--text); }
.tab.active {
  background: oklch(from var(--accent) l c h / 0.12);
  color: var(--accent);
}
.search {
  flex: 1;
  padding: .28rem .6rem;
  border: 1.5px solid var(--border);
  border-radius: 99px;
  background: var(--surface-2);
  font-size: 12px;
  min-width: 0;
  transition: border-color .12s;
}
.search:focus { outline: none; border-color: var(--accent); }
.search::placeholder { color: var(--text-faint); }
.search::-webkit-search-cancel-button { display: none; }

/* Grid - CSS columns for natural-aspect masonry */
.grid {
  flex: 1;
  columns: 3;
  column-gap: 3px;
  padding: 4px;
  overflow-y: auto;
  min-height: 80px;
  align-content: start;
}
.grid.loading {
  display: flex; align-items: center; justify-content: center;
}

.item-btn {
  break-inside: avoid;
  display: block;
  width: 100%;
  margin-bottom: 3px;
  border-radius: 6px;
  overflow: hidden;
  background: var(--surface-2);
  transition: opacity .1s;
}
.item-btn:hover { opacity: .78; }
.item-btn img {
  width: 100%; height: auto;
  display: block;
}

.empty {
  column-span: all;
  font-size: 12px; color: var(--text-faint);
  text-align: center;
  padding: 1.5rem;
}

.spinner {
  width: 20px; height: 20px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin .7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }

.credit {
  font-size: 10px;
  color: var(--text-faint);
  text-align: center;
  padding: .28rem;
  border-top: 1px solid var(--border-subtle);
  flex-shrink: 0;
}
</style>
