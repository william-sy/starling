import { register, init, getLocaleFromNavigator } from 'svelte-i18n';

export function setupI18n() {
  register('en', () => import('./en.json'));
  init({
    fallbackLocale: 'en',
    initialLocale: getLocaleFromNavigator() ?? 'en',
  });
}

export { locale } from 'svelte-i18n';
export { _ } from 'svelte-i18n';
