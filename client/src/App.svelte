<script lang="ts">
  import { onMount }               from 'svelte';
  import { route, go }             from '$lib/stores/router';
  import { loadPersistedAccount, unlocked } from '$lib/stores/auth';
  import { settings }              from '$lib/stores/settings';
  import { setupI18n }             from '$lib/i18n';
  import { waitLocale }            from 'svelte-i18n';
  import { isMobile }              from '$lib/stores/mobile';
  import { relayRegister, relayConnect, relayDisconnect, relayRegisterVisibility } from '$lib/stores/relay';
  import * as lockTimer from '$lib/stores/lockTimer';
  import { loadHistory } from '$lib/stores/chats';
  import { requestPermission, loadPushToken } from '$lib/stores/notifications';
  import ToastStack from '$lib/components/ui/ToastStack.svelte';

  setupI18n();

  // Screens
  import Loading          from './routes/onboarding/Loading.svelte';
  import Welcome          from './routes/onboarding/Welcome.svelte';
  import AgeGate          from './routes/onboarding/AgeGate.svelte';
  import RelayPicker      from './routes/onboarding/RelayPicker.svelte';
  import AccountCreated   from './routes/onboarding/AccountCreated.svelte';
  import RecoveryPhrase   from './routes/onboarding/RecoveryPhrase.svelte';
  import RecoveryConfirm  from './routes/onboarding/RecoveryConfirm.svelte';
  import LocalUnlockSetup from './routes/onboarding/LocalUnlockSetup.svelte';
  import Unlock           from './routes/onboarding/Unlock.svelte';
  import RestoreAccount   from './routes/onboarding/RestoreAccount.svelte';
  import Main             from './routes/main/Main.svelte';
  import Settings         from './routes/settings/Settings.svelte';

  // Apply color scheme to <html> so CSS [data-theme] selectors work
  $: {
    const scheme = $settings.colorScheme;
    if (scheme === 'system') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', scheme);
    }
  }

  // Apply accent hue — CSS derives all accent-related variables from this one value
  $: document.documentElement.style.setProperty('--accent-h', String($settings.accentHue));

  // Apply zoom via transform on #app so html/body viewport calculations are unaffected.
  // #app is sized at (100% / zoom) so after scale(zoom) it fills exactly the viewport.
  $: {
    const zooms: Record<string, number> = { small: 0.875, medium: 1, large: 1.15, xl: 1.3 };
    const z = zooms[$settings.fontSize] ?? 1;
    document.documentElement.style.removeProperty('zoom');
    document.documentElement.style.setProperty('--ui-zoom', String(z));
    isMobile.notifyZoomChange();
  }

  onMount(async () => {
    await waitLocale();
    const existing = await loadPersistedAccount();
    if (existing) {
      loadHistory(existing.pin);
      go('unlock');
    } else {
      go('welcome');
    }
  });

  // React to route changes — connect/disconnect relay when entering/leaving main app
  $: if ($route === 'main') {
    relayRegister().then(relayConnect).catch(console.error);
    relayRegisterVisibility();
  } else if ($route === 'welcome') {
    // Only disconnect when there is no account at all - relay stays alive while locked
    // so messages queue up in NATS and are delivered immediately on unlock
    relayDisconnect();
  }

  // Lock timer: run while unlocked, stop when locked
  $: if ($unlocked) lockTimer.start(); else lockTimer.stop();

  // Request notification permission and fetch push token once unlocked
  let _notifReady = false;
  $: if ($unlocked && !_notifReady) {
    _notifReady = true;
    requestPermission().catch(() => {});
    loadPushToken().catch(() => {});
  }
</script>

<ToastStack />

{#if $route === 'loading'}              <Loading />
{:else if $route === 'welcome'}         <Welcome />
{:else if $route === 'age-gate'}        <AgeGate />
{:else if $route === 'relay-picker'}    <RelayPicker />
{:else if $route === 'account-created'} <AccountCreated />
{:else if $route === 'recovery-phrase'} <RecoveryPhrase />
{:else if $route === 'recovery-confirm'}<RecoveryConfirm />
{:else if $route === 'local-unlock-setup'}<LocalUnlockSetup />
{:else if $route === 'unlock'}          <Unlock />
{:else if $route === 'restore-account'} <RestoreAccount />
{:else if $route === 'main'}            <Main />
{:else if $route === 'settings'}        <Settings />
{/if}
