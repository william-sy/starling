<script lang="ts">
  import { call, localStream, remoteStream, answerCall, hangUp, toggleMute, toggleCamera, toggleScreenShare } from '$lib/stores/calling';
  import { onDestroy } from 'svelte';

  let elapsed = 0;
  let ticker: ReturnType<typeof setInterval> | null = null;
  let remoteVideo: HTMLVideoElement;
  let localVideo:  HTMLVideoElement;

  $: if ($call.state === 'active' && $call.startedAt) {
    if (!ticker) ticker = setInterval(() => {
      elapsed = Math.floor((Date.now() - ($call.startedAt ?? 0)) / 1000);
    }, 1000);
  } else {
    if (ticker) { clearInterval(ticker); ticker = null; }
    elapsed = 0;
  }

  $: if (remoteVideo && $remoteStream) remoteVideo.srcObject = $remoteStream;
  $: if (localVideo  && $localStream)  localVideo.srcObject  = $localStream;

  function fmt(s: number) {
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, '0')}`;
  }

  const stateLabel: Record<string, string> = {
    outgoing:   'Calling...',
    incoming:   'Incoming call',
    connecting: 'Connecting...',
    active:     'On call',
  };

  onDestroy(() => { if (ticker) clearInterval(ticker); });
</script>

{#if $call.error}
  <div class="error-toast" role="alert">{$call.error}</div>
{/if}

{#if $call.state !== 'idle'}
  <div class="overlay" class:video-mode={$call.video} role="dialog" aria-label="Call">

    {#if $call.video && $call.state === 'active'}
      <!-- svelte-ignore a11y-media-has-caption -->
      <video class="remote-video" bind:this={remoteVideo} autoplay playsinline></video>
      <!-- svelte-ignore a11y-media-has-caption -->
      <video class="local-video"  bind:this={localVideo}  autoplay playsinline muted></video>
    {/if}

    <div class="card" class:video-card={$call.video && $call.state === 'active'}>
      {#if !($call.video && $call.state === 'active')}
        <div class="avatar">{$call.peerName.slice(0, 1).toUpperCase()}</div>
      {/if}

      <p class="peer-name">{$call.peerName}</p>
      <p class="state-label">
        {stateLabel[$call.state] ?? ''}
        {#if $call.state === 'active'}
          <span class="timer">{fmt(elapsed)}</span>
        {/if}
      </p>

      <div class="actions">
        {#if $call.state === 'incoming'}
          <button class="btn accept" on:click={answerCall} aria-label="Answer">
            <svg viewBox="0 0 20 20" width="22" height="22" fill="none" aria-hidden="true">
              <path d="M3 3.5C3 11.5 8.5 17 16.5 17l1-3-3.2-1.3-1.2 1.5a9.5 9.5 0 01-5.3-5.3l1.5-1.2L8 4.5 5 3.5z" fill="currentColor"/>
            </svg>
          </button>
          <button class="btn end" on:click={hangUp} aria-label="Decline">
            <svg viewBox="0 0 20 20" width="22" height="22" fill="none" aria-hidden="true">
              <path d="M17 16.5C17 8.5 11.5 3 3.5 3l-1 3 3.2 1.3 1.2-1.5a9.5 9.5 0 015.3 5.3l-1.5 1.2L13 15.5 16 16.5z" fill="currentColor"/>
            </svg>
          </button>
        {:else if $call.state === 'active'}
          <button class="btn mute" class:active={$call.muted} on:click={toggleMute} aria-label={$call.muted ? 'Unmute' : 'Mute'}>
            <svg viewBox="0 0 20 20" width="20" height="20" fill="none" aria-hidden="true">
              <rect x="7" y="3" width="6" height="10" rx="3" fill="currentColor" opacity={$call.muted ? '.3' : '1'}/>
              <path d="M4 10a6 6 0 0012 0" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              <path d="M10 16v2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              {#if $call.muted}
                <path d="M3 3l14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              {/if}
            </svg>
          </button>
          {#if $call.video}
            <button class="btn cam" class:active={$call.camOff} on:click={toggleCamera} aria-label={$call.camOff ? 'Turn camera on' : 'Turn camera off'}>
              <svg viewBox="0 0 20 20" width="20" height="20" fill="none" aria-hidden="true">
                <rect x="1" y="5" width="12" height="10" rx="2" stroke="currentColor" stroke-width="1.5" fill={$call.camOff ? 'currentColor' : 'none'} opacity={$call.camOff ? '.3' : '1'}/>
                <path d="M13 8l5-2.5v7L13 10" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
                {#if $call.camOff}
                  <path d="M2 2l16 16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                {/if}
              </svg>
            </button>
            <button class="btn share" class:active={$call.screenSharing} on:click={toggleScreenShare} aria-label={$call.screenSharing ? 'Stop sharing screen' : 'Share screen'} title={$call.screenSharing ? 'Stop sharing' : 'Share screen'}>
              <svg viewBox="0 0 20 20" width="20" height="20" fill="none" aria-hidden="true">
                <rect x="2" y="4" width="16" height="11" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
                <path d="M7 18h6M10 15v3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                {#if $call.screenSharing}
                  <path d="M6 8l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                {:else}
                  <path d="M6 10l4-3 4 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                {/if}
              </svg>
            </button>
          {/if}
          <button class="btn end" on:click={hangUp} aria-label="Hang up">
            <svg viewBox="0 0 20 20" width="22" height="22" fill="none" aria-hidden="true">
              <path d="M17 16.5C17 8.5 11.5 3 3.5 3l-1 3 3.2 1.3 1.2-1.5a9.5 9.5 0 015.3 5.3l-1.5 1.2L13 15.5 16 16.5z" fill="currentColor"/>
            </svg>
          </button>
        {:else}
          <button class="btn end" on:click={hangUp} aria-label="Cancel">
            <svg viewBox="0 0 20 20" width="22" height="22" fill="none" aria-hidden="true">
              <path d="M17 16.5C17 8.5 11.5 3 3.5 3l-1 3 3.2 1.3 1.2-1.5a9.5 9.5 0 015.3 5.3l-1.5 1.2L13 15.5 16 16.5z" fill="currentColor"/>
            </svg>
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
.overlay {
  position: fixed; inset: 0; z-index: 120;
  display: flex; align-items: center; justify-content: center;
  background: oklch(0 0 0 / 0.55);
  backdrop-filter: blur(6px);
  animation: fade-in .18s ease-out;
}
.overlay.video-mode { background: oklch(0 0 0 / 0.92); backdrop-filter: none; }
@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .overlay { animation: none; } }

.remote-video {
  position: absolute; inset: 0;
  width: 100%; height: 100%;
  object-fit: cover;
}
.local-video {
  position: absolute; bottom: 1.5rem; right: 1.5rem;
  width: 120px; height: 90px;
  object-fit: cover;
  border-radius: var(--radius);
  border: 2px solid oklch(1 0 0 / 0.2);
  z-index: 1;
}

.card {
  position: relative; z-index: 2;
  display: flex; flex-direction: column; align-items: center; gap: 1rem;
  padding: 2.5rem 3rem;
  border-radius: var(--radius-xl);
  background: var(--surface);
  box-shadow: 0 8px 40px oklch(0 0 0 / 0.22);
  min-width: 240px;
  text-align: center;
}
.card.video-card {
  background: oklch(0 0 0 / 0.5);
  box-shadow: none;
  padding: 1.5rem 2rem;
  margin-bottom: 6rem;
}

.avatar {
  width: 68px; height: 68px;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  font-size: 28px; font-weight: 700; line-height: 68px;
  text-align: center;
}

.peer-name {
  font-size: 18px; font-weight: 700;
  color: var(--text);
  letter-spacing: -0.02em;
}
.video-card .peer-name { color: #fff; }

.state-label {
  font-size: 13px; color: var(--text-muted);
  display: flex; align-items: center; gap: .4rem;
}
.video-card .state-label { color: oklch(1 0 0 / 0.6); }
.timer { font-variant-numeric: tabular-nums; font-weight: 600; color: var(--text-2); }
.video-card .timer { color: #fff; }

.actions { display: flex; gap: 1.25rem; margin-top: .5rem; }

.btn {
  width: 56px; height: 56px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  transition: opacity .12s, transform .12s;
}
.btn:active { transform: scale(.93); }

.accept { background: oklch(0.55 0.18 145); color: #fff; }
.accept:hover { opacity: .88; }
.end    { background: oklch(0.55 0.22 25);  color: #fff; }
.end:hover { opacity: .88; }
.mute, .cam, .share { background: var(--surface-2); color: var(--text-2); }
.mute.active, .cam.active { background: oklch(0.62 0.22 25 / 0.15); color: oklch(0.62 0.22 25); }
.share.active { background: oklch(0.55 0.18 270 / 0.15); color: oklch(0.55 0.18 270); }
.mute:hover, .cam:hover, .share:hover { opacity: .8; }
.video-card .mute, .video-card .cam, .video-card .share { background: oklch(1 0 0 / 0.15); color: #fff; }

.error-toast {
  position: fixed; bottom: 1.5rem; left: 50%; transform: translateX(-50%);
  z-index: 130;
  padding: .6rem 1.2rem;
  background: oklch(0.3 0.05 0);
  color: #fff;
  border-radius: var(--radius);
  font-size: 13px;
  pointer-events: none;
  animation: fade-in .15s ease-out;
}
</style>
