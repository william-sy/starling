<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import jsQR from 'jsqr';

  const dispatch = createEventDispatcher<{ scan: string; err: string }>();

  let videoEl: HTMLVideoElement;
  let canvasEl: HTMLCanvasElement;
  let stream: MediaStream | null = null;
  let rafId: number;
  let alive = true;
  let camErr = '';

  onMount(async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      videoEl.srcObject = stream;
      await videoEl.play();
      scan();
    } catch (e: any) {
      camErr = e?.name === 'NotAllowedError' ? 'Camera permission denied.' : 'Camera not available.';
      dispatch('err', camErr);
    }
  });

  onDestroy(stop);

  function stop() {
    alive = false;
    cancelAnimationFrame(rafId);
    stream?.getTracks().forEach(t => t.stop());
  }

  function scan() {
    if (!alive) return;
    rafId = requestAnimationFrame(() => {
      if (!alive) return;
      if (videoEl?.readyState === HTMLMediaElement.HAVE_ENOUGH_DATA) {
        const ctx = canvasEl.getContext('2d')!;
        canvasEl.width  = videoEl.videoWidth;
        canvasEl.height = videoEl.videoHeight;
        ctx.drawImage(videoEl, 0, 0);
        const img  = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);
        const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
        if (code?.data) {
          stop();
          dispatch('scan', code.data);
          return;
        }
      }
      scan();
    });
  }
</script>

<div class="scanner">
  {#if camErr}
    <div class="cam-err">
      <svg viewBox="0 0 24 24" fill="none" width="32" height="32" aria-hidden="true">
        <path d="M12 8v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
              stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      <span>{camErr}</span>
    </div>
  {:else}
    <video bind:this={videoEl} muted playsinline class="video"></video>
    <canvas bind:this={canvasEl} class="canvas"></canvas>
    <div class="overlay" aria-hidden="true">
      <div class="frame">
        <span class="corner tl"></span>
        <span class="corner tr"></span>
        <span class="corner bl"></span>
        <span class="corner br"></span>
      </div>
      <p class="hint">Point at a Starling QR code</p>
    </div>
  {/if}
</div>

<style>
.scanner {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  background: #000;
  border-radius: var(--radius-lg);
  overflow: hidden;
  max-width: 320px;
}

.video {
  width: 100%; height: 100%;
  object-fit: cover;
  display: block;
}
.canvas { display: none; }

.overlay {
  position: absolute; inset: 0;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 1rem;
}

.frame {
  position: relative;
  width: 60%; aspect-ratio: 1;
}
.corner {
  position: absolute;
  width: 20px; height: 20px;
  border-color: #fff;
  border-style: solid;
  opacity: 0.9;
}
.corner.tl { top: 0; left: 0;  border-width: 2.5px 0 0 2.5px; border-radius: 3px 0 0 0; }
.corner.tr { top: 0; right: 0; border-width: 2.5px 2.5px 0 0; border-radius: 0 3px 0 0; }
.corner.bl { bottom: 0; left: 0;  border-width: 0 0 2.5px 2.5px; border-radius: 0 0 0 3px; }
.corner.br { bottom: 0; right: 0; border-width: 0 2.5px 2.5px 0; border-radius: 0 0 3px 0; }

.hint {
  font-size: 12px; font-weight: 500;
  color: rgba(255,255,255,0.75);
  text-shadow: 0 1px 3px rgba(0,0,0,0.6);
  letter-spacing: 0.01em;
}

.cam-err {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: .65rem;
  height: 100%;
  color: var(--text-muted);
  font-size: 13px;
  padding: 1.5rem;
  text-align: center;
}
</style>
