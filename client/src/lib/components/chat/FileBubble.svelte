<script lang="ts">
  export let filename: string;
  export let filesize: number | undefined = undefined;
  export let body: string;
  export let isMe: boolean;

  const EXT_ICONS: Record<string, string> = {
    pdf:  '#e74c3c', doc: '#2980b9', docx: '#2980b9',
    xls:  '#27ae60', xlsx: '#27ae60', csv: '#27ae60',
    zip:  '#f39c12', rar: '#f39c12', '7z': '#f39c12', tar: '#f39c12', gz: '#f39c12',
    mp4:  '#8e44ad', mov: '#8e44ad', avi: '#8e44ad', mkv: '#8e44ad',
    mp3:  '#1abc9c', wav: '#1abc9c',
    txt:  '#95a5a6', md: '#95a5a6',
    ppt:  '#e67e22', pptx: '#e67e22',
  };

  $: ext = filename.split('.').pop()?.toLowerCase() ?? '';
  $: iconColor = EXT_ICONS[ext] ?? '#7f8c8d';

  function fmtSize(bytes: number | undefined): string {
    if (!bytes) return '';
    if (bytes < 1024)       return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function download() {
    if (!body || body === '[file]') return;
    const a = document.createElement('a');
    a.href     = body;
    a.download = filename;
    a.click();
  }
</script>

<button class="file-bubble" class:me={isMe} on:click={download} disabled={body === '[file]'} title={body === '[file]' ? 'File not available' : `Download ${filename}`}>
  <span class="file-icon" style="color: {iconColor}" aria-hidden="true">
    <svg viewBox="0 0 20 24" width="20" height="24" fill="none">
      <path d="M3 2h9l5 5v15a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" stroke-width="1.5" fill="currentColor" fill-opacity=".12"/>
      <path d="M12 2v5h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="4" y="18" font-size="5" font-weight="700" fill="currentColor" font-family="sans-serif" text-anchor="start">{ext.toUpperCase().slice(0,4)}</text>
    </svg>
  </span>
  <span class="file-info">
    <span class="file-name">{filename}</span>
    {#if filesize}
      <span class="file-size">{fmtSize(filesize)}</span>
    {/if}
  </span>
  {#if body !== '[file]'}
    <span class="dl-icon" aria-hidden="true">
      <svg viewBox="0 0 14 14" width="13" height="13" fill="none">
        <path d="M7 2v7M4 6l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M2 11h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
    </span>
  {/if}
</button>

<style>
.file-bubble {
  display: flex; align-items: center; gap: .6rem;
  padding: .5rem .65rem;
  border-radius: var(--radius);
  border: 1.5px solid oklch(0 0 0 / 0.1);
  background: oklch(0 0 0 / 0.04);
  text-align: left;
  cursor: pointer;
  transition: background .12s, border-color .12s;
  min-width: 180px; max-width: 260px;
  width: 100%;
}
.file-bubble.me {
  border-color: oklch(1 0 0 / 0.18);
  background: oklch(1 0 0 / 0.07);
}
.file-bubble:hover:not(:disabled) {
  background: oklch(0 0 0 / 0.09);
  border-color: oklch(0 0 0 / 0.18);
}
.file-bubble.me:hover:not(:disabled) {
  background: oklch(1 0 0 / 0.13);
}
.file-bubble:disabled { cursor: default; opacity: .6; }

.file-icon { flex-shrink: 0; line-height: 0; }
.file-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.file-name {
  font-size: 12.5px; font-weight: 600;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  line-height: 1.3;
}
.file-size { font-size: 10.5px; opacity: .5; }
.dl-icon { flex-shrink: 0; opacity: .55; line-height: 0; }
</style>
