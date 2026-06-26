<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';

  const dispatch = createEventDispatcher<{ send: { dataUrl: string; duration: number } }>();

  let recording  = false;
  let seconds    = 0;
  let mediaRec: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let ticker: ReturnType<typeof setInterval> | null = null;
  let error = '';

  const MAX_SECONDS = 300;

  function fmt(s: number) {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
  }

  async function startRecording() {
    error = '';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      chunks = [];
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      mediaRec = new MediaRecorder(stream, { mimeType: mime });
      mediaRec.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      mediaRec.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        finalise();
      };
      mediaRec.start(100);
      recording = true;
      seconds   = 0;
      ticker = setInterval(() => {
        seconds++;
        if (seconds >= MAX_SECONDS) stopRecording();
      }, 1000);
    } catch {
      error = 'Microphone access denied';
    }
  }

  function stopRecording() {
    if (!mediaRec || mediaRec.state === 'inactive') return;
    mediaRec.stop();
    recording = false;
    if (ticker) { clearInterval(ticker); ticker = null; }
  }

  function cancel() {
    stopRecording();
    chunks = [];
    seconds = 0;
  }

  function finalise() {
    if (!chunks.length) return;
    const blob = new Blob(chunks, { type: chunks[0].type });
    const dur  = seconds;
    const reader = new FileReader();
    reader.onload = () => {
      dispatch('send', { dataUrl: reader.result as string, duration: dur });
      chunks = [];
      seconds = 0;
    };
    reader.readAsDataURL(blob);
  }

  // Touch/pointer events for hold-to-record
  function onPointerDown(e: PointerEvent) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    startRecording();
  }
  function onPointerUp() { if (recording) stopRecording(); }

  onDestroy(cancel);
</script>

<div class="recorder">
  {#if error}
    <span class="rec-error">{error}</span>
  {:else if recording}
    <span class="rec-time">{fmt(seconds)}</span>
    <span class="rec-dot" aria-hidden="true"></span>
  {/if}

  <button
    class="rec-btn"
    class:active={recording}
    on:pointerdown={onPointerDown}
    on:pointerup={onPointerUp}
    on:pointercancel={onPointerUp}
    title={recording ? 'Release to send' : 'Hold to record'}
    aria-label={recording ? 'Release to send voice message' : 'Record voice message'}
  >
    {#if recording}
      <svg viewBox="0 0 18 18" fill="none" width="17" height="17" aria-hidden="true">
        <rect x="4" y="4" width="10" height="10" rx="1.5" fill="currentColor"/>
      </svg>
    {:else}
      <svg viewBox="0 0 18 18" fill="none" width="17" height="17" aria-hidden="true">
        <rect x="6" y="1" width="6" height="10" rx="3" stroke="currentColor" stroke-width="1.4"/>
        <path d="M3 9a6 6 0 0012 0" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
        <path d="M9 15v2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
      </svg>
    {/if}
  </button>
</div>

<style>
.recorder {
  display: flex; align-items: center; gap: .4rem;
  flex-shrink: 0;
}
.rec-btn {
  position: relative;
  display: flex; align-items: center; justify-content: center;
  padding: .35rem;
  border-radius: var(--radius);
  color: var(--text-muted);
  transition: color .12s, background .12s;
  touch-action: none;
  user-select: none;
}
.rec-btn:hover  { color: var(--text-2); background: var(--surface-2); }
.rec-btn.active { color: oklch(0.62 0.22 25); background: oklch(0.62 0.22 25 / 0.10); }
@media (max-width: 767px) { .rec-btn { min-width: 40px; min-height: 40px; } }

.rec-time {
  font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums;
  color: oklch(0.62 0.22 25);
  min-width: 2.8ch;
}
.rec-dot {
  width: 7px; height: 7px;
  border-radius: 50%;
  background: oklch(0.62 0.22 25);
  animation: blink 1s ease-in-out infinite;
  flex-shrink: 0;
}
@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: .2; } }
@media (prefers-reduced-motion: reduce) { .rec-dot { animation: none; } }

.rec-error {
  font-size: 11px; color: oklch(0.62 0.22 25);
  max-width: 120px; line-height: 1.3;
}
</style>
