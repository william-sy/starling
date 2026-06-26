<script lang="ts">
  import type { PollData } from '$lib/stores/chats';
  import { castVote } from '$lib/stores/chats';
  import { account } from '$lib/stores/auth';
  import { activeContact, contacts } from '$lib/stores/contacts';
  import { relaySendVote } from '$lib/stores/relay';

  export let poll: PollData;
  export let pollId: string;
  export let isMe: boolean;

  $: myVote = (() => {
    if (!$account) return -1;
    for (const [idx, voters] of Object.entries(poll.votes)) {
      if (voters.includes($account.pin)) return +idx;
    }
    return -1;
  })();

  $: totalVotes = Object.values(poll.votes).reduce((s, v) => s + v.length, 0);

  function pct(idx: number): number {
    if (totalVotes === 0) return 0;
    return Math.round(((poll.votes[idx] ?? []).length / totalVotes) * 100);
  }

  function nameFor(pin: string): string {
    if ($account && pin === $account.pin) return 'You';
    return $contacts.find(c => c.pin === pin)?.display_name ?? pin.slice(0, 8);
  }

  function voterNames(idx: number): string {
    const pins = poll.votes[idx] ?? [];
    if (pins.length === 0) return '';
    return pins.map(nameFor).join(', ');
  }

  function vote(idx: number) {
    if (!$account || !$activeContact) return;
    castVote($activeContact.pin, pollId, idx, $account.pin);
    relaySendVote($activeContact.pin, pollId, idx).catch(console.error);
  }
</script>

<div class="poll" class:me={isMe}>
  <div class="poll-q">{poll.question}</div>
  <ul class="poll-options">
    {#each poll.options as option, idx}
      {@const count = (poll.votes[idx] ?? []).length}
      {@const p = pct(idx)}
      {@const voted = myVote === idx}
      <li>
        <button
          class="option"
          class:voted
          class:has-votes={count > 0}
          on:click={() => vote(idx)}
          aria-pressed={voted}
        >
          <span class="option-bar" style="--pct: {p / 100}"></span>
          <span class="option-label">{option}</span>
          <span class="option-count">{count > 0 ? count : ''}</span>
          {#if voted}
            <span class="option-check" aria-hidden="true">
              <svg viewBox="0 0 10 8" width="10" height="8" fill="none">
                <path d="M1 4l3 3 5-6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </span>
          {/if}
        </button>
        {#if count > 0}
          <p class="voters">{voterNames(idx)}</p>
        {/if}
      </li>
    {/each}
  </ul>
  <div class="poll-footer">
    {totalVotes === 1 ? '1 vote' : `${totalVotes} votes`}
  </div>
</div>

<style>
.poll {
  display: flex; flex-direction: column; gap: .55rem;
  min-width: 200px; max-width: 280px;
}

.poll-q {
  font-size: 13.5px;
  font-weight: 700;
  line-height: 1.35;
  letter-spacing: -0.01em;
}

.poll-options {
  display: flex; flex-direction: column; gap: 6px;
  list-style: none; padding: 0; margin: 0;
}

.option {
  position: relative;
  width: 100%;
  display: flex; align-items: center; gap: .4rem;
  padding: .38rem .55rem;
  border-radius: 7px;
  border: 1.5px solid oklch(0 0 0 / 0.12);
  background: oklch(0 0 0 / 0.05);
  text-align: left;
  font-size: 13px;
  overflow: hidden;
  transition: border-color .15s, background .15s;
  cursor: pointer;
}
.poll.me .option {
  border-color: oklch(1 0 0 / 0.18);
  background: oklch(1 0 0 / 0.08);
}
.option.voted {
  border-color: var(--accent);
  background: oklch(from var(--accent) l c h / 0.1);
}
.option:hover:not(.voted) {
  border-color: oklch(0 0 0 / 0.22);
  background: oklch(0 0 0 / 0.09);
}
.poll.me .option:hover:not(.voted) {
  border-color: oklch(1 0 0 / 0.3);
  background: oklch(1 0 0 / 0.13);
}

.option-bar {
  position: absolute;
  inset: 0;
  background: oklch(from var(--accent) l c h / 0.15);
  border-radius: 7px;
  transform: scaleX(var(--pct, 0));
  transform-origin: left center;
  transition: transform .35s cubic-bezier(.25, 1, .5, 1);
  pointer-events: none;
}
.option.voted .option-bar {
  background: oklch(from var(--accent) l c h / 0.22);
}

.option-label {
  position: relative;
  flex: 1;
  font-size: 13px;
  line-height: 1.3;
}

.option-count {
  position: relative;
  font-size: 11px;
  font-weight: 600;
  opacity: .55;
  min-width: 1.2ch;
  text-align: right;
}

.option-check {
  position: relative;
  display: flex; align-items: center;
  color: var(--accent);
  flex-shrink: 0;
}

.voters {
  font-size: 10.5px;
  opacity: .5;
  padding: 2px .55rem 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.poll-footer {
  font-size: 11px;
  opacity: .45;
  padding: 0 .1rem;
}
</style>
