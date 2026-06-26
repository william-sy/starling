<script lang="ts">
  export let src: string;
  export let duration: number = 0;
  export let isMe: boolean = false;

  let audio: HTMLAudioElement;
  let playing = false;
  let progress = 0;
  let current  = 0;
  let raf: number;

  const placeholder = src === '[voice message]';

  const SPEEDS = [1, 1.5, 2] as const;
  let speedIdx = 0;
  $: speed = SPEEDS[speedIdx];

  function cycleSpeed() {
    speedIdx = (speedIdx + 1) % SPEEDS.length;
    if (audio && !audio.paused) audio.playbackRate = speed;
  }

  function fmt(s: number) {
    const m = Math.floor(s / 60);
    const r = Math.floor(s % 60);
    return `${m}:${String(r).padStart(2, '0')}`;
  }

  function tick() {
    if (!audio) return;
    current  = audio.currentTime;
    progress = audio.duration ? (current / audio.duration) * 100 : 0;
    if (!audio.paused) raf = requestAnimationFrame(tick);
  }

  function toggle() {
    if (placeholder) return;
    if (audio.paused) {
      audio.playbackRate = speed;
      audio.play().then(() => { playing = true; raf = requestAnimationFrame(tick); }).catch(() => {});
    } else {
      audio.pause();
      playing = false;
      cancelAnimationFrame(raf);
    }
  }

  function onEnded() {
    playing  = false;
    current  = 0;
    progress = 0;
    cancelAnimationFrame(raf);
  }

  function seek(e: MouseEvent) {
    if (placeholder || !audio?.duration) return;
    const bar  = e.currentTarget as HTMLElement;
    const pct  = e.offsetX / bar.offsetWidth;
    audio.currentTime = pct * audio.duration;
    progress   = pct * 100;
    current    = audio.currentTime;
  }

  $: displayDuration = duration || 0;
</script>

{#if !placeholder}
  <audio bind:this={audio} {src} on:ended={onEnded} preload="metadata" />
{/if}

<div class="audio-bubble" class:me={isMe}>
  <button
    class="play-btn"
    on:click={toggle}
    disabled={placeholder}
    aria-label={playing ? 'Pause' : 'Play voice message'}
  >
    {#if playing}
      <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
        <rect x="3" y="2" width="3.5" height="12" rx="1"/>
        <rect x="9.5" y="2" width="3.5" height="12" rx="1"/>
      </svg>
    {:else}
      <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
        <path d="M4 2.5l10 5.5-10 5.5z"/>
      </svg>
    {/if}
  </button>

  <div class="audio-track">
    <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
    <div class="track-bar" on:click={seek} role="slider" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
      <div class="track-fill" style="transform: scaleX({progress / 100})"></div>
    </div>
    <span class="audio-time">
      {playing ? fmt(current) : fmt(displayDuration)}
    </span>
  </div>

  <button
    class="speed-btn"
    on:click={cycleSpeed}
    disabled={placeholder}
    aria-label="Playback speed: {speed}x"
    title="Playback speed"
  >{speed}x</button>

  <svg class="mic-icon" viewBox="0 0 14 14" fill="none" width="12" height="12" aria-hidden="true">
    <rect x="4.5" y="1" width="5" height="7.5" rx="2.5" stroke="currentColor" stroke-width="1.2"/>
    <path d="M2 7a5 5 0 0010 0" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
    <path d="M7 12v1.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
  </svg>
</div>

<style>
.audio-bubble {
  display: flex; align-items: center; gap: .5rem;
  padding: .1rem 0;
  min-width: 180px;
}

.play-btn {
  flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  width: 32px; height: 32px;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  transition: opacity .12s;
}
.play-btn:disabled { opacity: .45; cursor: default; }
.play-btn:not(:disabled):hover { opacity: .85; }

.audio-track {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column; gap: .25rem;
}

.track-bar {
  position: relative;
  height: 3px;
  border-radius: 2px;
  background: currentColor;
  opacity: .22;
  cursor: pointer;
}
.track-fill {
  position: absolute; inset: 0;
  background: currentColor;
  opacity: 5;
  border-radius: 2px;
  transform-origin: left center;
  transition: transform .08s linear;
}

.audio-time {
  font-size: 11px; font-weight: 600;
  font-variant-numeric: tabular-nums;
  opacity: .7;
  line-height: 1;
}

.speed-btn {
  font-size: 10px; font-weight: 700;
  letter-spacing: -.01em;
  padding: .18rem .38rem;
  border-radius: 4px;
  border: 1.2px solid currentColor;
  opacity: .5;
  transition: opacity .1s;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
.speed-btn:not(:disabled):hover { opacity: .85; }
.speed-btn:disabled { cursor: default; }

.mic-icon {
  flex-shrink: 0;
  opacity: .4;
}
</style>
