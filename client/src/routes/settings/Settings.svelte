<script lang="ts">
  import { invoke }        from '$lib/utils/tauri';
  import { go }            from '$lib/stores/router';
  import { account, lock, persistAccount } from '$lib/stores/auth';
  import { contacts }      from '$lib/stores/contacts';
  import { messages }      from '$lib/stores/chats';
  import { settings }      from '$lib/stores/settings';
  import { playSound }     from '$lib/audio';
  import { relayStatus, relayHttp, relayRegister, relayConnect, relayBroadcastPresence, colonyStatuses } from '$lib/stores/relay';
  import type { NotifSound, ColorScheme, FontSize, LockMinutes } from '$lib/stores/settings';
  import { copyText } from '$lib/utils/clipboard';
  import { exportBackup, exportBackupWebDav, importBackup } from '$lib/utils/backup';
  import Avatar            from '$lib/components/ui/Avatar.svelte';
  import ColoredName       from '$lib/components/ui/ColoredName.svelte';
  import { NAME_COLORS, stripColorCodes } from '$lib/utils/coloredName';
  import LegalModal        from '$lib/components/legal/LegalModal.svelte';
  import MyQrModal         from '$lib/components/qr/MyQrModal.svelte';
  import LinkDeviceModal   from '$lib/components/qr/LinkDeviceModal.svelte';
  import SwitchRelayModal  from '$lib/components/settings/SwitchRelayModal.svelte';
  import { _ } from '$lib/i18n';
  import { isMobile } from '$lib/stores/mobile';

  let switchRelayOpen  = false;
  let leaveConfirmIdx  = -1;

  $: colonyList = (() => {
    const cs = $account?.colonies;
    if (cs?.length) return cs.map(url => ({ url, host: url.replace(/^wss?:\/\//, '').replace(/\/ws$/, '') }));
    if ($account?.relay_url) return [{ url: $account.relay_url, host: $account.relay_url.replace(/^wss?:\/\//, '').replace(/\/ws$/, '') }];
    return [{ url: $relayHttp, host: $relayHttp.replace(/^https?:\/\//, '') }];
  })();

  async function leaveColony(i: number) {
    const acct = $account;
    if (!acct) return;
    const existing = acct.colonies?.length ? acct.colonies : (acct.relay_url ? [acct.relay_url] : []);
    if (existing.length <= 1) return;
    const updated = existing.filter((_, idx) => idx !== i);
    await persistAccount({ ...acct, colonies: updated });
    leaveConfirmIdx = -1;
    if (i === 0) relayConnect();
  }

  $: themeOptions = [
    { label: $_('settings.appearance.theme_system'), value: 'system' as ColorScheme },
    { label: $_('settings.appearance.theme_light'),  value: 'light'  as ColorScheme },
    { label: $_('settings.appearance.theme_dark'),   value: 'dark'   as ColorScheme },
  ];

  $: fontSizeOptions = [
    { label: $_('settings.appearance.text_small'),  value: 'small'  as FontSize, size: '12px' },
    { label: $_('settings.appearance.text_medium'), value: 'medium' as FontSize, size: '14px' },
    { label: $_('settings.appearance.text_large'),  value: 'large'  as FontSize, size: '16px' },
    { label: $_('settings.appearance.text_xl'),     value: 'xl'     as FontSize, size: '18px' },
  ];

  const accentPresets: { name: string; hue: number }[] = [
    { name: 'Forest',  hue: 152 },
    { name: 'Teal',    hue: 185 },
    { name: 'Ocean',   hue: 220 },
    { name: 'Indigo',  hue: 265 },
    { name: 'Rose',    hue: 340 },
    { name: 'Crimson', hue: 15  },
    { name: 'Amber',   hue: 68  },
    { name: 'Lime',    hue: 125 },
  ];

  type Section = 'profile' | 'appearance' | 'notifications' | 'privacy' | 'account' | 'connection' | 'about';
  let active: Section = 'profile';


  $: relayStatusLabel = {
    connected:    $_('settings.connection.status_connected'),
    connecting:   $_('settings.connection.status_connecting'),
    disconnected: $_('settings.connection.status_disconnected'),
    error:        $_('settings.connection.status_error'),
  };

  function reconnect() {
    relayRegister().then(relayConnect).catch(console.error);
  }

  // Profile — local draft with explicit save
  let draftName = $settings.displayName || $account?.display_name || '';
  let draftMsg  = $settings.personalMsg;
  let profileSaved = false;
  let dnameInput: HTMLInputElement;

  const COLOR_SWATCHES = Object.entries(NAME_COLORS).map(([k, v]) => ({ idx: Number(k), color: v }));

  function insertColorCode(idx: number) {
    if (!dnameInput) return;
    const start = dnameInput.selectionStart ?? draftName.length;
    const tag   = `[c=${idx}]`;
    draftName   = draftName.slice(0, start) + tag + draftName.slice(start);
    setTimeout(() => {
      dnameInput.focus();
      const pos = start + tag.length;
      dnameInput.setSelectionRange(pos, pos);
    }, 0);
  }

  function saveProfile() {
    settings.save({ displayName: draftName, personalMsg: draftMsg });
    relayBroadcastPresence();
    profileSaved = true;
    setTimeout(() => profileSaved = false, 2000);
  }

  // Sound preview
  function previewSound() {
    const s = $settings.notifSound;
    if (s !== 'none') playSound(s);
  }

  $: soundOptions = [
    { value: 'ding'  as NotifSound, label: $_('settings.notifications.sound_ding')  },
    { value: 'chime' as NotifSound, label: $_('settings.notifications.sound_chime') },
    { value: 'pop'   as NotifSound, label: $_('settings.notifications.sound_pop')   },
    { value: 'boop'  as NotifSound, label: $_('settings.notifications.sound_boop')  },
    { value: 'bell'  as NotifSound, label: $_('settings.notifications.sound_bell')  },
    { value: 'none'  as NotifSound, label: $_('settings.notifications.sound_off')   },
  ];

  $: nav = [
    { id: 'profile'       as Section, label: $_('settings.nav.profile')       },
    { id: 'appearance'    as Section, label: $_('settings.nav.appearance')    },
    { id: 'notifications' as Section, label: $_('settings.nav.notifications') },
    { id: 'privacy'       as Section, label: $_('settings.nav.privacy')       },
    { id: 'account'       as Section, label: $_('settings.nav.account')       },
    { id: 'connection'    as Section, label: $_('settings.nav.connection')    },
    { id: 'about'         as Section, label: $_('settings.nav.about')         },
  ];

  // Avatar upload — resizes to 200px JPEG before storing in settings
  let fileInput: HTMLInputElement;
  let avatarError = '';

  async function handleAvatarChange(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    avatarError = '';
    if (file.size > 8 * 1024 * 1024) { avatarError = $_('settings.profile.avatar_error_size'); return; }
    if (!file.type.startsWith('image/')) { avatarError = $_('settings.profile.avatar_error_type'); return; }

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const MAX = 200;
      const scale = Math.min(MAX / img.width, MAX / img.height, 1);
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      settings.save({ avatarDataUrl: canvas.toDataURL('image/jpeg', 0.88) });
    };
    img.onerror = () => { avatarError = $_('settings.profile.avatar_error_read'); URL.revokeObjectURL(url); };
    img.src = url;
  }

  let showMyQr       = false;
  let showLinkDevice = false;

  // Legal modal
  let legalOpen = false;
  let legalTab: 'privacy' | 'terms' = 'privacy';

  function openLegal(tab: 'privacy' | 'terms') { legalTab = tab; legalOpen = true; }

  let pinCopied = false;
  function copyPin() {
    if (!$account?.pin) return;
    copyText($account.pin);
    pinCopied = true;
    setTimeout(() => pinCopied = false, 2000);
  }

  // Account actions
  let deleteConfirm = false;
  let exportState: 'idle' | 'busy' | 'done' | 'error' = 'idle';
  let exportMsg = '';
  let restoreState: 'idle' | 'busy' | 'done' | 'error' = 'idle';
  let restoreMsg = '';
  let restoreInput: HTMLInputElement;

  // WebDAV config
  let showWebDav  = false;
  let wdUrl       = '';
  let wdUser      = '';
  let wdPass      = '';
  let wdState: 'idle' | 'busy' | 'done' | 'error' = 'idle';
  let wdMsg       = '';

  function setLockMinutes(e: Event) {
    settings.save({ lockAfterMinutes: Number((e.currentTarget as HTMLSelectElement).value) as LockMinutes });
  }

  function signOut() {
    lock();
    go('unlock');
  }

  function deleteAccount() {
    account.set(null);
    contacts.set([]);
    messages.set({});
    try { localStorage.clear(); } catch {}
    go('welcome');
  }

  async function exportData() {
    if (exportState === 'busy') return;
    exportState = 'busy'; exportMsg = '';
    try {
      const path = await exportBackup();
      exportMsg   = path ? `Saved to ${path}` : '';
      exportState = path ? 'done' : 'idle';
      if (path) setTimeout(() => { exportState = 'idle'; exportMsg = ''; }, 5000);
    } catch (e) {
      exportMsg = String(e); exportState = 'error';
      setTimeout(() => { exportState = 'idle'; exportMsg = ''; }, 5000);
    }
  }

  async function exportWebDav() {
    if (!wdUrl || !wdUser) { wdMsg = 'URL and username are required.'; wdState = 'error'; return; }
    wdState = 'busy'; wdMsg = '';
    try {
      await exportBackupWebDav({ url: wdUrl, username: wdUser, password: wdPass });
      wdMsg = 'Uploaded successfully.'; wdState = 'done';
      setTimeout(() => { wdState = 'idle'; wdMsg = ''; }, 5000);
    } catch (e) {
      wdMsg = String(e); wdState = 'error';
      setTimeout(() => { wdState = 'idle'; wdMsg = ''; }, 5000);
    }
  }

  async function handleRestore(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    restoreState = 'busy';
    restoreMsg = '';
    try {
      restoreMsg = await importBackup(file);
      restoreState = 'done';
    } catch (err) {
      restoreMsg = err instanceof Error ? err.message : String(err);
      restoreState = 'error';
      setTimeout(() => { restoreState = 'idle'; restoreMsg = ''; }, 5000);
    }
    restoreInput.value = '';
  }
</script>

<div class="settings" class:mobile={$isMobile}>
  <header class="header">
    <button class="back-btn" on:click={() => go('main')} aria-label={$_('settings.back_aria')}>
      <svg viewBox="0 0 16 16" fill="none" width="14" height="14" aria-hidden="true">
        <path d="M10 3 L5 8 L10 13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      Back
    </button>
    <h1 class="title">{$_('settings.title')}</h1>
  </header>

  <div class="body">
    <nav class="nav" aria-label="Settings sections">
      {#each nav as item}
        <button
          class="nav-item"
          class:active={active === item.id}
          on:click={() => active = item.id}
          aria-current={active === item.id ? 'page' : undefined}
        >
          {item.label}
        </button>
      {/each}
    </nav>

    <div class="content">

      {#if active === 'profile'}
        <section class="section">
          <h2 class="section-title">{$_('settings.profile.title')}</h2>

          <div class="field">
            <label class="label" for="dname">{$_('settings.profile.display_name_label')}</label>
            <input id="dname" class="input" type="text" bind:this={dnameInput} bind:value={draftName}
                   placeholder={$_('settings.profile.display_name_placeholder')} maxlength="64" />
            <div class="color-picker-row" aria-label="Insert color code">
              <button
                class="color-swatch reset-swatch"
                title="Reset color"
                on:click={() => insertColorCode(0)}
                aria-label="Reset color"
              >×</button>
              {#each COLOR_SWATCHES as s}
                <button
                  class="color-swatch"
                  style="background:{s.color}"
                  title="Color {s.idx}"
                  on:click={() => insertColorCode(s.idx)}
                  aria-label="Insert color {s.idx}"
                ></button>
              {/each}
            </div>
            {#if draftName}
              <div class="name-preview" aria-label="Name preview">
                <ColoredName name={draftName} />
              </div>
            {/if}
            <span class="hint">{$_('settings.profile.display_name_hint')} Type [c=1] through [c=9] for colors.</span>
          </div>

          <div class="field">
            <label class="label" for="pmsg">{$_('settings.profile.personal_msg_label')}</label>
            <input id="pmsg" class="input" type="text" bind:value={draftMsg}
                   placeholder={$_('settings.profile.personal_msg_placeholder')} maxlength="64" />
            <span class="hint">{$_('settings.profile.personal_msg_hint')}</span>
          </div>

          <div class="field">
            <span class="label">{$_('settings.profile.avatar_label')}</span>
            <div class="avatar-row">
              <Avatar
                name={stripColorCodes($settings.displayName || $account?.display_name || '?')}
                size={52}
                src={$settings.avatarDataUrl || null}
                status={$settings.myStatus}
              />
              <div class="avatar-actions">
                <input
                  bind:this={fileInput}
                  type="file"
                  accept="image/*"
                  class="sr-only"
                  on:change={handleAvatarChange}
                  aria-label={$_('settings.profile.avatar_choose_aria')}
                />
                <button class="action-btn" on:click={() => fileInput.click()}>
                  {$settings.avatarDataUrl ? $_('settings.profile.avatar_change') : $_('settings.profile.avatar_upload')}
                </button>
                {#if $settings.avatarDataUrl}
                  <button
                    class="action-btn"
                    on:click={() => settings.save({ avatarDataUrl: '' })}
                  >{$_('settings.profile.avatar_remove')}</button>
                {/if}
              </div>
            </div>
            {#if avatarError}
              <span class="error">{avatarError}</span>
            {:else}
              <span class="hint">{$_('settings.profile.avatar_hint')}</span>
            {/if}
          </div>

          <div class="save-row">
            <button class="save-btn" on:click={saveProfile}>
              {#if profileSaved}{$_('settings.profile.saved')}{:else}{$_('settings.profile.save')}{/if}
            </button>
            {#if profileSaved}
              <span class="save-ok">{$_('settings.profile.save_ok')}</span>
            {/if}
          </div>
        </section>

      {:else if active === 'appearance'}
        <section class="section">
          <h2 class="section-title">{$_('settings.appearance.title')}</h2>

          <div class="field">
            <span class="label">{$_('settings.appearance.theme_label')}</span>
            <div class="chip-row">
              {#each themeOptions as opt}
                <button
                  class="chip"
                  class:active={$settings.colorScheme === opt.value}
                  on:click={() => settings.save({ colorScheme: opt.value })}
                >{opt.label}</button>
              {/each}
            </div>
            <span class="hint">{$_('settings.appearance.theme_hint')}</span>
          </div>

          <div class="field">
            <span class="label">{$_('settings.appearance.text_size_label')}</span>
            <div class="chip-row size-chips">
              {#each fontSizeOptions as opt}
                <button
                  class="chip size-chip"
                  class:active={$settings.fontSize === opt.value}
                  style="font-size: {opt.size}"
                  on:click={() => settings.save({ fontSize: opt.value })}
                >{opt.label}</button>
              {/each}
            </div>
            <span class="hint">{$_('settings.appearance.text_size_hint')}</span>
          </div>

          <div class="field">
            <span class="label">{$_('settings.appearance.accent_label')}</span>
            <div class="accent-swatches">
              {#each accentPresets as p}
                <button
                  class="swatch"
                  class:active={$settings.accentHue === p.hue}
                  style="--sw: oklch(0.56 0.16 {p.hue})"
                  title={p.name}
                  aria-label={p.name}
                  aria-pressed={$settings.accentHue === p.hue}
                  on:click={() => settings.save({ accentHue: p.hue })}
                ></button>
              {/each}
            </div>
            <div class="hue-row">
              <span class="hue-label">{$_('settings.appearance.accent_custom')}</span>
              <input
                type="range" min="0" max="359" step="1"
                value={$settings.accentHue}
                on:input={(e) => settings.save({ accentHue: +e.currentTarget.value })}
                class="hue-slider"
                aria-label={$_('settings.appearance.accent_custom_aria')}
              />
              <span class="hue-preview" style="background: oklch(0.56 0.16 {$settings.accentHue})"></span>
            </div>
            <span class="hint">{$_('settings.appearance.accent_hint')}</span>
          </div>

          <div class="field">
            <div class="toggle-row">
              <div>
                <span class="label">{$_('settings.appearance.classic_label')}</span>
                <span class="hint">{$_('settings.appearance.classic_hint')}</span>
              </div>
              <label class="toggle" aria-label={$_('settings.appearance.classic_aria')}>
                <input
                  type="checkbox"
                  checked={$settings.classicStyle}
                  on:change={(e) => settings.save({ classicStyle: e.currentTarget.checked })}
                />
                <span class="track"></span>
              </label>
            </div>
          </div>
          <p class="autosave-note">{$_('settings.appearance.autosave')}</p>
        </section>

      {:else if active === 'notifications'}
        <section class="section">
          <h2 class="section-title">{$_('settings.notifications.title')}</h2>

          <div class="field">
            <div class="toggle-row">
              <div>
                <span class="label">{$_('settings.notifications.enable_label')}</span>
                <span class="hint">{$_('settings.notifications.enable_hint')}</span>
              </div>
              <label class="toggle">
                <input
                  type="checkbox"
                  checked={$settings.notifEnabled}
                  on:change={(e) => settings.save({ notifEnabled: e.currentTarget.checked })}
                />
                <span class="track"></span>
              </label>
            </div>
          </div>

          <div class="field" class:muted={!$settings.notifEnabled}>
            <span class="label">{$_('settings.notifications.sound_label')}</span>
            <span class="hint">{$_('settings.notifications.sound_hint')}</span>
            <div class="sound-row">
              <div class="chip-row">
                {#each soundOptions as opt}
                  <button
                    class="chip"
                    class:active={$settings.notifSound === opt.value}
                    disabled={!$settings.notifEnabled}
                    on:click={() => settings.save({ notifSound: opt.value })}
                  >{opt.label}</button>
                {/each}
              </div>
              <button
                class="preview-btn"
                disabled={!$settings.notifEnabled || $settings.notifSound === 'none'}
                on:click={previewSound}
                title={$_('settings.notifications.sound_preview_title')}
                aria-label={$_('settings.notifications.sound_preview_aria')}
              >
                <svg viewBox="0 0 16 16" fill="none" width="13" height="13" aria-hidden="true">
                  <path d="M4 5 L4 11 L10 8 Z" fill="currentColor"/>
                  <path d="M12 5 Q14 8 12 11" stroke="currentColor" stroke-width="1.3"
                        stroke-linecap="round" fill="none"/>
                </svg>
                {$_('settings.notifications.sound_preview')}
              </button>
            </div>
          </div>
          <p class="autosave-note">{$_('settings.notifications.autosave')}</p>
        </section>

      {:else if active === 'privacy'}
        <section class="section">
          <h2 class="section-title">{$_('settings.privacy.title')}</h2>

          <div class="field">
            <div class="toggle-row">
              <div>
                <span class="label">{$_('settings.privacy.receipts_label')}</span>
                <span class="hint">{$_('settings.privacy.receipts_hint')}</span>
              </div>
              <label class="toggle">
                <input
                  type="checkbox"
                  checked={$settings.readReceipts}
                  on:change={(e) => settings.save({ readReceipts: e.currentTarget.checked })}
                />
                <span class="track"></span>
              </label>
            </div>
          </div>

          <div class="field">
            <div class="toggle-row">
              <div>
                <span class="label">{$_('settings.privacy.typing_label')}</span>
                <span class="hint">{$_('settings.privacy.typing_hint')}</span>
              </div>
              <label class="toggle">
                <input
                  type="checkbox"
                  checked={$settings.typingIndicator}
                  on:change={(e) => settings.save({ typingIndicator: e.currentTarget.checked })}
                />
                <span class="track"></span>
              </label>
            </div>
          </div>

          <div class="field">
            <div class="toggle-row">
              <div>
                <span class="label">Full-screen effects</span>
                <span class="hint">Show animations like peck, thunder, and confetti. Turn off to get a small text label instead.</span>
              </div>
              <label class="toggle">
                <input
                  type="checkbox"
                  checked={$settings.fullscreenEffects}
                  on:change={(e) => settings.save({ fullscreenEffects: e.currentTarget.checked })}
                />
                <span class="track"></span>
              </label>
            </div>
          </div>

          <div class="field">
            <div class="toggle-row">
              <div>
                <span class="label">Link previews</span>
                <span class="hint">Show title, image, and description when a message contains a URL. Fetched from your device - some sites may block this.</span>
              </div>
              <label class="toggle">
                <input
                  type="checkbox"
                  checked={$settings.linkPreviews}
                  on:change={(e) => settings.save({ linkPreviews: e.currentTarget.checked })}
                />
                <span class="track"></span>
              </label>
            </div>
          </div>

          <div class="field">
            <div class="toggle-row">
              <div>
                <span class="label">Last seen</span>
                <span class="hint">Show when you were last active to your contacts. Turn off to hide it from everyone (they will also be hidden from you).</span>
              </div>
              <label class="toggle">
                <input
                  type="checkbox"
                  checked={$settings.showLastSeen}
                  on:change={(e) => settings.save({ showLastSeen: e.currentTarget.checked })}
                />
                <span class="track"></span>
              </label>
            </div>
          </div>

          <div class="field">
            <span class="label">Lock after</span>
            <span class="hint">Require PIN after inactivity or when app is hidden</span>
            <select
              class="select"
              value={$settings.lockAfterMinutes}
              on:change={setLockMinutes}
            >
              <option value={0}>Never</option>
              <option value={1}>1 minute</option>
              <option value={5}>5 minutes</option>
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={60}>1 hour</option>
            </select>
          </div>

          <p class="autosave-note">{$_('settings.privacy.autosave')}</p>
        </section>

      {:else if active === 'account'}
        <section class="section">
          <h2 class="section-title">{$_('settings.account.title')}</h2>

          <div class="field">
            <span class="label">{$_('settings.account.pin_label')}</span>
            <div class="pin-row">
              <span class="pin-display">{$account?.pin ?? '-'}</span>
              <button class="action-btn small" on:click={copyPin}>
                {pinCopied ? $_('settings.account.pin_copied') : $_('settings.account.pin_copy')}
              </button>
              <button class="action-btn small" on:click={() => showMyQr = true}>
                <svg viewBox="0 0 16 16" fill="none" width="12" height="12" aria-hidden="true" style="display:inline;vertical-align:-1px;margin-right:.2rem">
                  <rect x="1.5" y="1.5" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.3"/>
                  <rect x="9.5" y="1.5" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.3"/>
                  <rect x="1.5" y="9.5" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.3"/>
                  <path d="M9.5 9.5h2v2h-2zM11.5 11.5h2v2h-2zM9.5 13.5h2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
                </svg>
                My QR
              </button>
            </div>
            <span class="hint">{$_('settings.account.pin_hint')}</span>
          </div>

          <div class="field">
            <span class="label">{$_('settings.account.devices_label')}</span>
            <div class="device-list">
              <div class="device-item">
                <svg viewBox="0 0 16 16" fill="none" width="13" height="13" aria-hidden="true">
                  <rect x="1.5" y="2" width="13" height="10" rx="1.5" stroke="currentColor" stroke-width="1.25"/>
                  <path d="M5 12 L5 13.5 L11 13.5 L11 12" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>
                </svg>
                <span class="device-name">{$_('settings.account.this_device')}</span>
                <span class="device-badge">{$_('settings.account.device_active')}</span>
              </div>
            </div>
            <button class="action-btn" on:click={() => showLinkDevice = true}>{$_('settings.account.link_device')}</button>
            <span class="hint">{$_('settings.account.devices_hint')}</span>
          </div>

          <div class="field">
            <span class="label">Backup</span>
            <span class="hint">Export all messages, contacts and settings. The file can be saved anywhere — local drive, NAS, or USB.</span>
            <div class="export-row">
              <button class="action-btn" disabled={exportState === 'busy'} on:click={exportData}>
                {exportState === 'busy' ? 'Saving...' : 'Save to file'}
              </button>
              <button class="action-btn" on:click={() => showWebDav = !showWebDav}>
                WebDAV / NAS
              </button>
            </div>
            {#if exportMsg}
              <span class="export-msg" class:export-ok={exportState === 'done'} class:export-err={exportState === 'error'}>
                {exportMsg}
              </span>
            {/if}
            {#if showWebDav}
              <div class="webdav-form">
                <input class="wd-input" type="url"      bind:value={wdUrl}  placeholder="https://nextcloud.example.com/remote.php/dav/files/user/" />
                <input class="wd-input" type="text"     bind:value={wdUser} placeholder="Username" autocomplete="off" />
                <input class="wd-input" type="password" bind:value={wdPass} placeholder="Password" autocomplete="new-password" />
                <button class="action-btn" disabled={wdState === 'busy'} on:click={exportWebDav}>
                  {wdState === 'busy' ? 'Uploading...' : 'Upload backup'}
                </button>
                {#if wdMsg}
                  <span class="export-msg" class:export-ok={wdState === 'done'} class:export-err={wdState === 'error'}>{wdMsg}</span>
                {/if}
              </div>
            {/if}
          </div>

          <div class="field">
            <span class="label">Restore</span>
            <span class="hint">Import a backup file to restore messages, contacts and settings.</span>
            <input type="file" accept=".json" bind:this={restoreInput} on:change={handleRestore} style="display:none" />
            <button class="action-btn" disabled={restoreState === 'busy'} on:click={() => restoreInput.click()}>
              {restoreState === 'busy' ? 'Restoring...' : 'Import backup'}
            </button>
            {#if restoreMsg}
              <span class="export-msg" class:export-ok={restoreState === 'done'} class:export-err={restoreState === 'error'}>
                {restoreMsg}
              </span>
            {/if}
          </div>

          <div class="field danger-zone">
            <span class="label danger">{$_('settings.account.danger_zone')}</span>

            <div class="acct-action-row">
              <div class="acct-action-info">
                <span class="acct-action-label">{$_('settings.account.sign_out')}</span>
                <span class="hint">{$_('settings.account.sign_out_hint')}</span>
              </div>
              <button class="action-btn" on:click={signOut}>{$_('settings.account.sign_out')}</button>
            </div>

            <div class="acct-action-row acct-delete-row">
              <div class="acct-action-info">
                <span class="acct-action-label danger">{$_('settings.account.delete_account')}</span>
                <span class="hint">{$_('settings.account.delete_hint')}</span>
              </div>
              {#if deleteConfirm}
                <div class="delete-confirm" role="alert">
                  <p class="confirm-warning">{$_('settings.account.delete_warning')}</p>
                  <div class="confirm-btns">
                    <button class="action-btn danger" on:click={deleteAccount}>{$_('settings.account.delete_confirm')}</button>
                    <button class="action-btn" on:click={() => deleteConfirm = false}>{$_('settings.account.cancel')}</button>
                  </div>
                </div>
              {:else}
                <button class="action-btn danger" on:click={() => deleteConfirm = true}>{$_('settings.account.delete_account')}</button>
              {/if}
            </div>
          </div>
        </section>

      {:else if active === 'connection'}
        <div class="section">
          <h3 class="section-title">{$_('settings.connection.title')}</h3>

          <div class="trust-note">
            <svg viewBox="0 0 16 16" fill="none" width="14" height="14" aria-hidden="true" style="flex-shrink:0;margin-top:1px">
              <path d="M8 1.5 L13 4 L13 8 C13 11.5 8 14.5 8 14.5 C8 14.5 3 11.5 3 8 L3 4 Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
            </svg>
            <span>
              Your colony routes encrypted messages between devices. It never sees message content - only you and your contacts hold the keys. Your data stays in the EU.
            </span>
          </div>

          <!-- Colony list -->
          <div class="colony-list">
            {#each colonyList as col, i}
              <div class="colony-row">
                <span class="colony-status-dot status-{$colonyStatuses[col.url] ?? $relayStatus}"></span>
                <div class="colony-info">
                  <span class="colony-host">{col.host}</span>
                  {#if i === 0}<span class="colony-badge">{$_('settings.connection.primary_badge')}</span>{/if}
                </div>
                {#if leaveConfirmIdx === i}
                  <div class="leave-confirm">
                    <span class="leave-warn">{$_('settings.connection.leave_warning', { values: { host: col.host } })}</span>
                    <div class="leave-actions">
                      <button class="btn-leave-confirm" on:click={() => leaveColony(i)}>{$_('settings.connection.leave_confirm')}</button>
                      <button class="btn-leave-cancel" on:click={() => leaveConfirmIdx = -1}>{$_('settings.connection.leave_cancel')}</button>
                    </div>
                  </div>
                {:else}
                  <button
                    class="colony-leave-btn"
                    on:click={() => leaveConfirmIdx = i}
                    disabled={colonyList.length <= 1}
                    title={colonyList.length <= 1 ? 'You must have at least one colony' : undefined}
                  >
                    {$_('settings.connection.leave_colony')}
                  </button>
                {/if}
              </div>
            {/each}
            {#if colonyList.length === 0}
              <p class="colony-empty">{$_('settings.connection.no_colonies')}</p>
            {/if}
          </div>

          <button class="action-btn colony-add-btn" on:click={() => switchRelayOpen = true}>
            + {$_('settings.connection.add_colony')}
          </button>

          {#if $account}
          <div class="conn-row" style="margin-top:.75rem">
            <span class="conn-label">{$_('settings.connection.pin_label')}</span>
            <span class="conn-value mono">{$account.pin}</span>
          </div>
          {/if}

          {#if $relayStatus !== 'connected'}
            <button class="action-btn" style="margin-top:.4rem" on:click={reconnect}>
              {$_('settings.connection.reconnect')}
            </button>
          {/if}
        </div>

      {:else if active === 'about'}
        <section class="section">
          <h2 class="section-title">{$_('settings.about.title')}</h2>
          <div class="about-block">
            <p class="about-name">{$_('settings.about.name')}</p>
            <p class="about-ver">{$_('settings.about.version')}</p>
            <p class="about-tag">{$_('settings.about.tagline')}</p>
          </div>
          <div class="field">
            <button class="action-btn" on:click={() => openLegal('privacy')}>{$_('settings.about.privacy_policy')}</button>
            <button class="action-btn" on:click={() => openLegal('terms')}>{$_('settings.about.terms')}</button>
            <button class="action-btn" disabled>{$_('settings.about.licenses')}</button>
          </div>
        </section>
      {/if}

    </div>
  </div>
</div>

<LegalModal       bind:open={legalOpen}        bind:tab={legalTab} />
<MyQrModal        bind:open={showMyQr} />
<LinkDeviceModal  bind:open={showLinkDevice}  mode="scan" />
<SwitchRelayModal bind:open={switchRelayOpen} />

<style>
.settings {
  display: flex; flex-direction: column;
  height: 100%; width: 100%;
  background: var(--bg);
  overflow: hidden;
}

.header {
  display: flex; align-items: center; gap: 1rem;
  padding: .85rem 1.25rem;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.back-btn {
  display: flex; align-items: center; gap: .35rem;
  font-size: 13px; font-weight: 500;
  color: var(--accent);
  padding: .35rem .6rem;
  border-radius: var(--radius);
  transition: background .12s;
}
.back-btn:hover { background: var(--surface-2); }
.title {
  font-size: 15px; font-weight: 700;
  letter-spacing: -0.02em;
}

.body {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
}

/* Default: horizontal scrollable tab bar (mobile-first) */
.nav {
  display: flex;
  flex-direction: row;
  flex-shrink: 0;
  width: 100%;
  max-height: 58px;
  border-bottom: 1px solid var(--border);
  padding: .35rem .5rem;
  gap: .15rem;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  -webkit-mask-image: linear-gradient(to right, black 82%, transparent 100%);
  mask-image: linear-gradient(to right, black 82%, transparent 100%);
}
.nav::-webkit-scrollbar { display: none; }

.nav-item {
  flex-shrink: 0;
  white-space: nowrap;
  text-align: left;
  padding: .5rem .75rem;
  min-height: 44px;
  display: flex;
  align-items: center;
  border-radius: var(--radius);
  font-size: 13px; font-weight: 500;
  color: var(--text-2);
  transition: background .12s, color .12s;
}
.nav-item:hover { background: var(--surface-2); color: var(--text); }
.nav-item.active {
  background: var(--surface-2);
  color: var(--accent);
  font-weight: 600;
}

/* Desktop: switch to vertical sidebar */
@media (min-width: 1024px) {
  .body { flex-direction: row; }
  .nav {
    flex-direction: column;
    width: 180px;
    max-height: none;
    flex-shrink: 0;
    border-bottom: none;
    border-right: 1px solid var(--border);
    padding: .75rem .5rem;
    overflow-x: hidden;
    overflow-y: auto;
    gap: .1rem;
    -webkit-mask-image: none;
    mask-image: none;
  }
  .nav-item {
    width: 100%;
    min-height: unset;
    white-space: normal;
    padding: .5rem .75rem;
  }
}

.content {
  flex: 1;
  overflow-y: auto;
  padding: 1rem 1.1rem;
  max-width: 100%;
  min-height: 0;
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}
.content::-webkit-scrollbar { width: 4px; }
.content::-webkit-scrollbar-track { background: transparent; }
.content::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
@media (min-width: 1024px) {
  .content { padding: 1.5rem 2rem; max-width: 560px; }
}

.section { display: flex; flex-direction: column; gap: 1.25rem; }
.section-title {
  font-size: 18px; font-weight: 700;
  letter-spacing: -0.03em;
  color: var(--text);
  padding-bottom: .75rem;
  border-bottom: 1px solid var(--border-subtle);
}

.field {
  display: flex; flex-direction: column; gap: .35rem;
}
.field.muted { opacity: .45; pointer-events: none; }
.field.danger-zone { margin-top: .5rem; padding-top: 1rem; border-top: 1px solid var(--border-subtle); }

.label {
  font-size: 13px; font-weight: 600;
  color: var(--text-2);
  letter-spacing: -0.01em;
}
.label.danger { color: oklch(0.62 0.22 25); }
.hint {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.55;
}

.color-picker-row {
  display: flex;
  align-items: center;
  gap: .3rem;
  flex-wrap: wrap;
  margin-top: .35rem;
}

.color-swatch {
  width: 20px; height: 20px;
  border-radius: 50%;
  border: 1.5px solid oklch(from currentColor l c h / 0.3);
  cursor: pointer;
  flex-shrink: 0;
  transition: transform .1s, box-shadow .1s;
}
.color-swatch:hover {
  transform: scale(1.25);
  box-shadow: 0 0 0 2px var(--accent);
}
.reset-swatch {
  background: var(--surface-2);
  border-color: var(--border);
  font-size: 13px; font-weight: 700;
  color: var(--text-muted);
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%;
}
.reset-swatch:hover { color: var(--text); }

.name-preview {
  font-size: 15px; font-weight: 600;
  padding: .4rem .6rem;
  border-radius: var(--radius);
  background: var(--surface-2);
  letter-spacing: -0.01em;
  min-height: 2rem;
  display: flex; align-items: center;
}

.input, .select {
  padding: .5rem .7rem;
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  font-size: 13px;
  transition: border-color .12s, background .12s;
  max-width: 320px;
  color: var(--text);
}
.input:focus, .select:focus { outline: none; border-color: var(--accent); }
.input::placeholder { color: var(--text-faint); }
.select { cursor: pointer; }

/* Avatar */
.avatar-row {
  display: flex; align-items: center; gap: .85rem;
  margin-top: .1rem;
}
.avatar-actions {
  display: flex; flex-direction: column; gap: .4rem;
}
.error {
  font-size: 11.5px;
  color: oklch(0.62 0.22 25);
}
.sr-only {
  position: absolute; width: 1px; height: 1px;
  padding: 0; margin: -1px; overflow: hidden;
  clip: rect(0,0,0,0); white-space: nowrap; border: 0;
}

/* Save row */
.save-row {
  display: flex; align-items: center; gap: .75rem;
  margin-top: .25rem;
}
.save-btn {
  padding: .5rem 1.1rem;
  background: var(--accent); color: #fff;
  border-radius: var(--radius);
  font-size: 13px; font-weight: 600;
  letter-spacing: -0.01em;
  transition: background .12s;
}
.save-btn:hover { background: var(--accent-hover); }
.save-ok {
  font-size: 12px;
  color: var(--status-online);
  font-weight: 500;
}
.autosave-note {
  font-size: 11px;
  color: var(--text-faint);
  padding-top: .5rem;
  border-top: 1px solid var(--border-subtle);
  margin-top: .25rem;
}

/* Toggle */
.toggle-row {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem;
}
.toggle {
  position: relative; flex-shrink: 0;
  width: 38px; height: 22px;
  cursor: pointer;
  margin-top: 1px;
}
.toggle input { opacity: 0; width: 0; height: 0; position: absolute; }
.track {
  position: absolute; inset: 0;
  background: var(--border);
  border-radius: 99px;
  transition: background .18s;
}
.track::after {
  content: '';
  position: absolute;
  left: 3px; top: 3px;
  width: 16px; height: 16px;
  border-radius: 50%;
  background: #fff;
  transition: transform .18s ease;
  box-shadow: 0 1px 3px oklch(0 0 0 / 0.25);
}
.toggle input:checked + .track { background: var(--accent); }
.toggle input:checked + .track::after { transform: translateX(16px); }
.toggle input:disabled + .track { opacity: .4; cursor: not-allowed; }

/* Chips */
.chip-row { display: flex; gap: .4rem; flex-wrap: wrap; margin-top: .15rem; }
.size-chips { gap: .5rem; }
.size-chip { padding: .35rem 1rem; min-width: 72px; text-align: center; }
.chip {
  font-size: 12px; font-weight: 500;
  padding: .3rem .75rem;
  border-radius: 99px;
  border: 1.5px solid var(--border);
  color: var(--text-muted);
  cursor: pointer;
  transition: border-color .12s, color .12s, background .12s;
}
.chip:not(:disabled):hover { border-color: var(--accent); color: var(--accent); }
.chip.active {
  border-color: var(--accent);
  color: var(--accent);
  background: oklch(from var(--accent) l c h / 0.08);
}
.chip:disabled { opacity: .4; cursor: not-allowed; }
/* static non-button chips */
span.chip { cursor: default; }
span.chip.disabled { opacity: .4; }

/* Accent swatches */
.accent-swatches {
  display: flex; gap: .45rem; flex-wrap: wrap;
  margin-top: .2rem;
}
.swatch {
  width: 26px; height: 26px;
  border-radius: 50%;
  background: var(--sw);
  border: 2.5px solid transparent;
  outline-offset: 2px;
  transition: transform .12s, border-color .12s;
  flex-shrink: 0;
}
.swatch:hover    { transform: scale(1.15); }
.swatch.active   { border-color: var(--text); transform: scale(1.1); }

/* Hue slider row */
.hue-row {
  display: flex; align-items: center; gap: .65rem;
  margin-top: .5rem;
}
.hue-label {
  font-size: 11.5px; font-weight: 500;
  color: var(--text-muted);
  flex-shrink: 0;
  width: 46px;
}
.hue-slider {
  flex: 1; height: 8px;
  border-radius: 4px;
  appearance: none; -webkit-appearance: none;
  background: linear-gradient(to right,
    oklch(0.56 0.16 0),   oklch(0.56 0.16 40),  oklch(0.56 0.16 80),
    oklch(0.56 0.16 120), oklch(0.56 0.16 152),  oklch(0.56 0.16 185),
    oklch(0.56 0.16 220), oklch(0.56 0.16 265),  oklch(0.56 0.16 300),
    oklch(0.56 0.16 340), oklch(0.56 0.16 359));
  cursor: pointer;
}
.hue-slider::-webkit-slider-thumb {
  appearance: none; -webkit-appearance: none;
  width: 18px; height: 18px; border-radius: 50%;
  background: var(--accent);
  border: 2.5px solid var(--surface);
  box-shadow: 0 0 0 1.5px var(--accent);
  cursor: pointer;
  transition: box-shadow .12s;
}
.hue-slider::-webkit-slider-thumb:hover {
  box-shadow: 0 0 0 3px oklch(from var(--accent) l c h / 0.3);
}
.hue-preview {
  width: 20px; height: 20px; border-radius: 50%; flex-shrink: 0;
  box-shadow: 0 0 0 1.5px oklch(0 0 0 / 0.12);
}

/* Sound row */
.sound-row {
  display: flex; align-items: center; gap: .75rem;
  flex-wrap: wrap;
}
.preview-btn {
  display: flex; align-items: center; gap: .3rem;
  font-size: 12px; font-weight: 500;
  color: var(--text-2);
  padding: .3rem .65rem;
  border: 1.5px solid var(--border);
  border-radius: 99px;
  transition: background .12s, border-color .12s, color .12s;
}
.preview-btn:hover:not(:disabled) { background: var(--surface-2); border-color: var(--accent); color: var(--accent); }
.preview-btn:disabled { opacity: .4; cursor: not-allowed; }

/* Action buttons */
.action-btn {
  font-size: 12.5px; font-weight: 500;
  color: var(--text-2);
  padding: .5rem .75rem;
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  text-align: left;
  transition: background .12s, border-color .12s;
  width: fit-content;
}
.action-btn:hover:not(:disabled) { background: var(--surface-2); }
.action-btn:disabled { opacity: .4; cursor: not-allowed; }
.action-btn.danger { color: oklch(0.62 0.22 25); border-color: oklch(0.62 0.22 25 / 0.35); }
.action-btn.danger:hover:not(:disabled) { background: oklch(0.62 0.22 25 / 0.08); }
.action-btn.small { font-size: 12px; padding: .3rem .6rem; }

.pin-row { display: flex; align-items: center; gap: .65rem; }
.pin-display {
  font-size: 14px; font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: .04em;
  color: var(--text);
}

.danger-row { display: flex; gap: .5rem; flex-wrap: wrap; }

/* Connection / Colony section */
.colony-list {
  display: flex; flex-direction: column; gap: .35rem;
  margin-bottom: .75rem;
}
.colony-row {
  display: flex; align-items: flex-start; gap: .65rem;
  padding: .6rem .75rem;
  background: var(--surface-2);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
}
.colony-status-dot {
  width: 8px; height: 8px; border-radius: 50%;
  flex-shrink: 0; margin-top: 4px;
  background: var(--text-faint);
}
.colony-status-dot.status-connected  { background: var(--status-online); }
.colony-status-dot.status-connecting { background: oklch(0.82 0.15 72); animation: conn-blink 1.2s ease-in-out infinite; }
.colony-status-dot.status-error      { background: oklch(0.62 0.22 25); }
.colony-info {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column; gap: .15rem;
}
.colony-host {
  font-size: 12.5px; font-weight: 600; color: var(--text);
  font-family: 'Menlo', 'Consolas', monospace;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.colony-badge {
  font-size: 10px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;
  color: var(--accent); background: oklch(from var(--accent) l c h / 0.12);
  border-radius: 99px; padding: .1rem .45rem;
  align-self: flex-start;
}
.colony-leave-btn {
  font-size: 11.5px; font-weight: 500; color: var(--text-faint);
  border: 1px solid var(--border-subtle); border-radius: var(--radius);
  padding: .2rem .55rem; flex-shrink: 0; margin-top: 1px;
  transition: color .1s, border-color .1s;
}
.colony-leave-btn:hover:not(:disabled) { color: oklch(0.55 0.20 25); border-color: oklch(0.75 0.12 25); }
.colony-leave-btn:disabled { opacity: .35; cursor: not-allowed; }
.leave-confirm {
  display: flex; flex-direction: column; gap: .45rem;
  padding: .35rem .5rem;
  background: oklch(0.97 0.04 25);
  border: 1px solid oklch(0.88 0.08 25);
  border-radius: var(--radius); flex: 1;
}
.leave-warn { font-size: 12px; color: oklch(0.45 0.12 25); line-height: 1.5; }
.leave-actions { display: flex; gap: .4rem; }
.btn-leave-confirm {
  padding: .28rem .75rem;
  background: oklch(0.55 0.20 25); color: #fff;
  border-radius: var(--radius); font-size: 12px; font-weight: 600;
}
.btn-leave-cancel {
  padding: .28rem .6rem;
  border: 1px solid var(--border); border-radius: var(--radius);
  font-size: 12px; color: var(--text-muted);
}
.colony-empty { font-size: 13px; color: var(--text-faint); padding: .5rem 0; }
.colony-add-btn { width: 100%; text-align: center; }

.trust-note {
  display: flex; gap: .55rem; align-items: flex-start;
  padding: .6rem .75rem;
  margin-bottom: .75rem;
  background: oklch(from var(--accent) l c h / 0.07);
  border: 1px solid oklch(from var(--accent) l c h / 0.18);
  border-radius: var(--radius);
  font-size: 12px;
  color: var(--text-2);
  line-height: 1.6;
}
.trust-note svg { color: var(--accent); opacity: .8; }

.conn-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: .55rem 0;
  border-bottom: 1px solid var(--border-subtle);
  font-size: 13px;
  gap: 1rem;
}
.conn-row:last-of-type { border-bottom: none; }
.conn-label { color: var(--text-muted); flex-shrink: 0; }
.conn-value { color: var(--text); font-weight: 500; display: flex; align-items: center; gap: 5px; }
.conn-value.mono { font-family: 'Menlo', 'Consolas', monospace; font-size: 11.5px; font-weight: 400; }

.status-dot {
  width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
  background: var(--text-faint);
}
.conn-value.status-connected    .status-dot { background: var(--status-online); }
.conn-value.status-connecting   .status-dot { background: oklch(0.82 0.15 72); animation: conn-blink 1.2s ease-in-out infinite; }
.conn-value.status-disconnected .status-dot { background: var(--text-faint); }
.conn-value.status-error        .status-dot { background: oklch(0.62 0.22 25); }
@keyframes conn-blink {
  0%, 100% { opacity: .4; }
  50%       { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) { .status-dot { animation: none; } }

.about-block {
  display: flex; flex-direction: column; gap: .4rem;
  padding: 1rem 1.25rem;
  border: 1.5px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
}
.about-name  { font-size: 15px; font-weight: 700; letter-spacing: -0.02em; }
.about-ver   { font-size: 12px; color: var(--text-muted); }
.about-tag   { font-size: 12px; color: var(--text-faint); line-height: 1.5; }

/* Linked devices */
.device-list {
  display: flex; flex-direction: column; gap: .35rem;
  margin-top: .1rem;
}
.device-item {
  display: flex; align-items: center; gap: .55rem;
  padding: .45rem .65rem;
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text-2);
}
.device-name {
  flex: 1;
  font-size: 12.5px; font-weight: 500;
}
.device-badge {
  font-size: 10.5px; font-weight: 600;
  padding: .1rem .45rem;
  border-radius: 99px;
  background: oklch(from var(--accent) l c h / 0.12);
  color: var(--accent);
  letter-spacing: .01em;
}

/* Account action rows in danger zone */
.acct-action-row {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 1rem;
  padding-top: .85rem;
  border-top: 1px solid var(--border-subtle);
  margin-top: .35rem;
  flex-wrap: wrap;
}
.acct-action-row:first-of-type { margin-top: .15rem; }
.acct-action-info {
  display: flex; flex-direction: column; gap: .25rem;
  flex: 1; min-width: 180px;
}
.acct-action-label {
  font-size: 13px; font-weight: 600;
  color: var(--text-2);
  letter-spacing: -0.01em;
}
.acct-action-label.danger { color: oklch(0.62 0.22 25); }

/* Delete confirmation */
.delete-confirm {
  display: flex; flex-direction: column; gap: .65rem;
  padding: .85rem;
  border: 1.5px solid oklch(0.62 0.22 25 / 0.30);
  border-radius: var(--radius);
  background: oklch(0.62 0.22 25 / 0.05);
  animation: confirm-in .12s ease;
  width: 100%;
}
@keyframes confirm-in {
  from { opacity: 0; transform: translateY(-3px); }
  to   { opacity: 1; transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) { .delete-confirm { animation: none; } }
.confirm-warning {
  font-size: 12px; line-height: 1.6;
  color: oklch(0.62 0.22 25);
}
.confirm-btns {
  display: flex; gap: .5rem; flex-wrap: wrap;
}

.export-msg {
  font-size: 11.5px; line-height: 1.5;
  word-break: break-all;
}
.export-ok  { color: var(--status-online); }
.export-err { color: oklch(0.62 0.22 25); }

.export-row { display: flex; gap: .5rem; flex-wrap: wrap; }
.export-row .action-btn { flex: 1; }

.webdav-form {
  display: flex; flex-direction: column; gap: .5rem;
  margin-top: .4rem;
  padding: .75rem;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.wd-input {
  padding: .5rem .7rem;
  border: 1.5px solid var(--border); border-radius: var(--radius);
  background: var(--surface); color: var(--text); font-size: 13px;
}
.wd-input:focus { outline: none; border-color: var(--accent); }

</style>
