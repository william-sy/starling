<script lang="ts">
  import { go } from '$lib/stores/router';
  import BirdIcon from '$lib/components/ui/BirdIcon.svelte';
  import { _ } from '$lib/i18n';
</script>

<div class="wrap">
  <div class="card">
    <div class="hero">
      <div class="bird-wrap">
        <BirdIcon size={52} color="var(--accent)" />
      </div>
      <h1>{$_('onboarding.welcome.title')}</h1>
      <p class="tagline">{$_('onboarding.welcome.tagline')}</p>
    </div>

    <div class="actions">
      <button class="btn-primary" on:click={() => go('age-gate')}>
        {$_('onboarding.welcome.create_account')}
      </button>
      <button class="btn-ghost" on:click={() => go('restore-account')}>
        {$_('onboarding.welcome.restore_account')}
      </button>
    </div>

    <p class="footer">
      {$_('onboarding.welcome.footer')}
    </p>
  </div>
</div>

<style>
.wrap {
  min-height: 100%;
  display: flex; align-items: center; justify-content: center;
  background: var(--bg); padding: 1.5rem;
}
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  padding: 2.75rem 2.5rem;
  max-width: 400px; width: 100%;
  box-shadow: var(--shadow-lg);
  text-align: center;
}
.hero { margin-bottom: 2.25rem; }
.bird-wrap { display: flex; justify-content: center; margin-bottom: 1.1rem; }
h1 { font-size: 21px; font-weight: 700; color: var(--text); margin-bottom: .6rem; text-wrap: balance; }
.tagline { font-size: 13.5px; color: var(--text-muted); line-height: 1.6; text-wrap: pretty; }
.actions { display: flex; flex-direction: column; gap: .65rem; margin-bottom: 1.25rem; }
.btn-primary {
  width: 100%; padding: .8rem;
  background: var(--accent); color: #fff;
  border-radius: var(--radius); font-size: 15px; font-weight: 600;
  transition: opacity .15s;
}
.btn-primary:hover { opacity: .9; }
.btn-ghost {
  width: 100%; padding: .75rem;
  background: transparent; color: var(--text-2);
  border: 1px solid var(--border); border-radius: var(--radius);
  font-size: 14px; transition: background .15s;
}
.btn-ghost:hover { background: var(--surface-2); }
.footer { font-size: 12px; color: var(--text-faint); line-height: 1.5; text-wrap: pretty; }

@media (pointer: coarse) {
  .btn-primary { min-height: 48px; }
  .btn-ghost   { min-height: 44px; }
}
</style>
