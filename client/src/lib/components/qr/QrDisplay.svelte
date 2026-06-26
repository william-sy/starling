<script lang="ts">
  import QRCode from 'qrcode';

  export let data: string;
  export let size: number = 220;

  let svgHtml = '';
  let error   = false;

  $: if (data) {
    error = false;
    QRCode.toString(data, {
      type:   'svg',
      width:  size,
      margin: 2,
      color:  { dark: '#000000ff', light: '#ffffffff' },
    })
      .then(s  => { svgHtml = s; })
      .catch(() => { error = true; });
  }
</script>

<div class="qr-wrap" style="width:{size}px;height:{size}px">
  {#if error}
    <span class="err">QR unavailable</span>
  {:else if svgHtml}
    {@html svgHtml}
  {:else}
    <div class="skeleton"></div>
  {/if}
</div>

<style>
.qr-wrap {
  background: #fff;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}
.qr-wrap :global(svg) { display: block; }
.skeleton {
  width: 100%; height: 100%;
  background: linear-gradient(90deg, #e8e8e8 25%, #f4f4f4 50%, #e8e8e8 75%);
  background-size: 200% 100%;
  animation: shimmer 1.2s infinite;
}
@keyframes shimmer {
  from { background-position: 200% 0; }
  to   { background-position: -200% 0; }
}
.err {
  font-size: 12px;
  color: #888;
}
</style>
