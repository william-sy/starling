<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher<{ pick: string }>();

  export let emojiOpen = false;

  type Cat = { id: string; icon: string; label: string; emojis: string[] };

  const categories: Cat[] = [
    {
      id: 'smileys', icon: '😊', label: 'Smileys',
      emojis: [
        '😀','😁','😂','🤣','😃','😄','😅','😆','😉','😊',
        '😋','😎','😍','🥰','😘','🙂','🤗','🤔','🙄','😏',
        '😣','😥','😮','🤐','😯','😪','😫','😴','😌','😛',
        '😜','😝','🤤','😒','😓','😔','😕','🙃','🤑','😲',
        '🙁','😖','😞','😟','😤','😢','😭','😦','😧','😨',
        '😩','🤯','😬','😰','😱','🥵','🥶','😳','🤪','😵',
        '🥴','😡','😠','🤬','😷','🤒','🤕','🤧','🥺','🥹',
        '😇','🤠','🥳','😈','👿',
      ],
    },
    {
      id: 'gestures', icon: '👍', label: 'Gestures',
      emojis: [
        '👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞',
        '🤟','🤘','🤙','👈','👉','👆','👇','☝️','👍','👎',
        '✊','👊','🤛','🤜','👏','🙌','🫶','👐','🤲','🙏',
        '🤝','💪','🦵','🦶','👀','👁️','👅','💅','🤳','🫵',
        '🫸','🫷','🫰','🫂',
      ],
    },
    {
      id: 'hearts', icon: '❤️', label: 'Hearts',
      emojis: [
        '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔',
        '❤️‍🔥','❤️‍🩹','💕','💞','💓','💗','💖','💘','💝','💟',
        '⭐','🌟','💫','✨','⚡','🔥','🌈','🎊','🎉','🎈',
        '🎁','🎀','🎆','🎇','🧨','💥','🌸','🌺','🌻','🌹',
        '☮️','🏆','🥇','🎯','💎','🔮','🍀','🌙','☀️','🌊',
      ],
    },
    {
      id: 'objects', icon: '💻', label: 'Objects',
      emojis: [
        '📱','💻','🖥️','⌨️','🖱️','📷','📸','🎥','📺','📻',
        '🎙️','📡','🔋','🔌','💡','🔦','🕯️','📦','✏️','📝',
        '📚','🔑','🗝️','🔒','🔓','🔨','🔧','🔩','🧲','🔭',
        '🔬','💊','🩺','🩻','🚑','🚒','🚓','🛸','🚀','✈️',
        '🏠','🏰','⛺','🗼','🎭','🎮','🎲','🎸','🎹','🎺',
      ],
    },
    {
      id: 'animals', icon: '🐱', label: 'Animals',
      emojis: [
        '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯',
        '🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐔','🐧',
        '🐦','🦆','🦅','🦉','🦇','🐺','🐗','🦄','🐝','🦋',
        '🐌','🐞','🐜','🐢','🦎','🐍','🐡','🐠','🦜','🦚',
        '🦩','🦢','🐘','🦒','🦏','🐪','🐆','🐅',
      ],
    },
    {
      id: 'food', icon: '🍕', label: 'Food',
      emojis: [
        '🍎','🍊','🍋','🍌','🍍','🥭','🍓','🫐','🍒','🍑',
        '🥝','🍅','🫒','🥑','🍆','🥦','🥕','🌽','🥒','🧄',
        '🍕','🍔','🌮','🌯','🥙','🥚','🍳','🥞','🧇','🥩',
        '🍗','🍖','🌭','🍟','🍿','🧀','🥗','🍝','🍜','🍣',
        '☕','🍵','🧃','🥤','🧋','🍺','🥂','🍷','🍾','🍫',
      ],
    },
  ];

  // Keyword search index — maps search terms to emoji characters
  const kw: Record<string, string[]> = {
    smile:      ['😊','😀','😁','😄','😃','🙂'],
    happy:      ['😊','😀','😁','😄','🥳','🎉'],
    laugh:      ['😂','🤣','😆','😅','😁'],
    lol:        ['😂','🤣','😆'],
    sad:        ['😢','😭','😞','😟','😔','🥺','😦'],
    cry:        ['😢','😭','😥','🥺'],
    angry:      ['😡','😠','🤬','😤','😒'],
    mad:        ['😡','😠','🤬'],
    love:       ['❤️','🥰','😍','💕','💖','😘','💗','💝'],
    heart:      ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','💕','💞','💓','💗','💖','💘','💝'],
    fire:       ['🔥'],
    hot:        ['🔥','🥵'],
    star:       ['⭐','🌟','💫','✨'],
    wow:        ['😲','🤯','😮','😯'],
    cool:       ['😎'],
    sick:       ['😷','🤒','🤧','🤕'],
    sleep:      ['😴'],
    scared:     ['😨','😱','😰','😦','😧'],
    kiss:       ['😘','😗','😙','😚'],
    party:      ['🎉','🥳','🎊','🎈'],
    celebrate:  ['🎉','🎊','🥳','🎈','🎆','🎇'],
    gift:       ['🎁','🎀'],
    wave:       ['👋'],
    thumbs:     ['👍','👎'],
    up:         ['👍','👆'],
    down:       ['👎','👇'],
    clap:       ['👏'],
    pray:       ['🙏'],
    ok:         ['👌','✌️'],
    strong:     ['💪'],
    muscle:     ['💪'],
    eyes:       ['👀','👁️'],
    think:      ['🤔'],
    shrug:      ['🤷'],
    dog:        ['🐶'],
    cat:        ['🐱'],
    bird:       ['🐦','🦜','🦅','🦆','🦉'],
    bear:       ['🐻','🐼','🐨'],
    panda:      ['🐼'],
    fox:        ['🦊'],
    lion:       ['🦁'],
    rabbit:     ['🐰'],
    tiger:      ['🐯','🐅'],
    unicorn:    ['🦄'],
    butterfly:  ['🦋'],
    snake:      ['🐍'],
    turtle:     ['🐢'],
    elephant:   ['🐘'],
    pizza:      ['🍕'],
    burger:     ['🍔'],
    taco:       ['🌮'],
    sushi:      ['🍣'],
    coffee:     ['☕'],
    tea:        ['🍵'],
    beer:       ['🍺'],
    wine:       ['🍷','🥂'],
    fruit:      ['🍎','🍊','🍋','🍌','🍓','🍒','🍑'],
    apple:      ['🍎'],
    banana:     ['🍌'],
    strawberry: ['🍓'],
    phone:      ['📱'],
    laptop:     ['💻','🖥️'],
    lock:       ['🔒','🔓','🔑'],
    rocket:     ['🚀'],
    music:      ['🎵','🎶','🎙️','🎸','🎹'],
    rainbow:    ['🌈'],
    sun:        ['☀️'],
    moon:       ['🌙'],
    flower:     ['🌸','🌺','🌻','🌹'],
    diamond:    ['💎'],
    trophy:     ['🏆'],
    camera:     ['📷','📸','🎥'],
    book:       ['📚','📝'],
  };

  let search = '';
  let activeId = categories[0].id;

  $: allEmojis = categories.flatMap(c => c.emojis);
  $: isSearching = search.trim().length > 0;

  $: searchResults = (() => {
    if (!isSearching) return [];
    const q = search.trim().toLowerCase();
    const found = new Set<string>();

    // Keyword index matches (key starts-with or includes query)
    for (const [key, emojis] of Object.entries(kw)) {
      if (key.startsWith(q) || key.includes(q)) {
        emojis.forEach(e => found.add(e));
      }
    }

    // Filter to only emojis in our actual set
    const inSet = new Set(allEmojis);
    return [...found].filter(e => inSet.has(e)).slice(0, 80);
  })();

  $: displayEmojis = isSearching
    ? searchResults
    : (categories.find(c => c.id === activeId)?.emojis ?? []);

  function pick(e: string) { dispatch('pick', e); }
</script>

{#if emojiOpen}
  <div class="picker" role="dialog" aria-label="Emoji picker">
    <div class="search-wrap">
      <svg class="search-icon" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <circle cx="5.5" cy="5.5" r="3.5" stroke="currentColor" stroke-width="1.3"/>
        <path d="M8.5 8.5L11.5 11.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
      </svg>
      <input
        class="search"
        type="search"
        placeholder="Search emojis..."
        bind:value={search}
        aria-label="Search emojis"
        autocomplete="off"
        spellcheck="false"
      />
      {#if search}
        <button class="clear-btn" on:click={() => search = ''} aria-label="Clear search">×</button>
      {/if}
    </div>

    {#if !isSearching}
      <div class="tabs" role="tablist" aria-label="Emoji categories">
        {#each categories as cat}
          <button
            class="tab"
            class:active={activeId === cat.id}
            role="tab"
            aria-selected={activeId === cat.id}
            title={cat.label}
            on:click={() => activeId = cat.id}
          >{cat.icon}</button>
        {/each}
      </div>
    {:else}
      <div class="search-hint">
        {searchResults.length > 0 ? `${searchResults.length} result${searchResults.length === 1 ? '' : 's'}` : 'No matches — try another word'}
      </div>
    {/if}

    <div
      class="grid"
      role="group"
      aria-label={isSearching ? 'Search results' : (categories.find(c => c.id === activeId)?.label ?? '')}
    >
      {#each displayEmojis as e (e)}
        <button class="em" on:click={() => pick(e)} title={e} aria-label={e}>{e}</button>
      {/each}
      {#if isSearching && searchResults.length === 0}
        <p class="no-results">Nothing found</p>
      {/if}
    </div>
  </div>
{/if}

<style>
.picker {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: .45rem .45rem .4rem;
  box-shadow: var(--shadow-lg);
  z-index: 100;
  width: 288px;
  overflow: hidden; /* prevent horizontal overflow from wide emoji glyphs */
}

.search-wrap {
  position: relative;
  display: flex; align-items: center;
  margin-bottom: .35rem;
}
.search-icon {
  position: absolute; left: .55rem;
  width: 11px; height: 11px;
  color: var(--text-faint);
  pointer-events: none;
}
.search {
  width: 100%;
  padding: .35rem .65rem .35rem 1.75rem;
  border: 1px solid var(--border);
  border-radius: 99px;
  background: var(--surface-2);
  font-size: 12px;
  transition: border-color .12s, background .12s;
}
.search:focus { outline: none; border-color: var(--accent); background: var(--surface); }
.search::placeholder { color: var(--text-faint); }
.search::-webkit-search-cancel-button { display: none; }
.clear-btn {
  position: absolute; right: .55rem;
  font-size: 15px; line-height: 1;
  color: var(--text-faint); padding: 2px 4px;
  border-radius: 3px; transition: color .1s;
}
.clear-btn:hover { color: var(--text-2); }

.tabs {
  display: flex; gap: 2px;
  padding: 0 .1rem .3rem;
  border-bottom: 1px solid var(--border-subtle);
  margin-bottom: .35rem;
}
.tab {
  flex: 1;
  padding: .3rem 0;
  font-size: 15px;
  border-radius: 6px;
  line-height: 1;
  transition: background .1s;
}
.tab:hover  { background: var(--surface-2); }
.tab.active { background: var(--surface-3); }

.search-hint {
  font-size: 10.5px;
  color: var(--text-faint);
  padding: .1rem .2rem .3rem;
}

.grid {
  display: grid;
  grid-template-columns: repeat(9, 1fr); /* 9 cols avoids overflow when scrollbar appears */
  gap: 1px;
  max-height: 234px;
  overflow-y: auto;
  overflow-x: hidden; /* belt-and-suspenders against wide glyphs */
}
.grid::-webkit-scrollbar { width: 3px; }
.grid::-webkit-scrollbar-thumb { background: var(--border); border-radius: 99px; }

.em {
  font-size: 17px;
  line-height: 1;
  padding: 4px 0;
  border-radius: 4px;
  transition: background .1s;
  cursor: pointer;
  text-align: center;
  width: 100%;
  overflow: hidden; /* clip any individual wide glyph */
}
.em:hover { background: var(--surface-2); }

.no-results {
  grid-column: 1 / -1;
  text-align: center;
  font-size: 12px;
  color: var(--text-faint);
  padding: 1.25rem 0;
}
</style>
