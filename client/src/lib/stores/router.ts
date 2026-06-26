import { writable } from 'svelte/store';

export type Route =
  | 'loading'
  | 'welcome'
  | 'age-gate'
  | 'relay-picker'
  | 'account-created'
  | 'recovery-phrase'
  | 'recovery-confirm'
  | 'local-unlock-setup'
  | 'unlock'
  | 'restore-account'
  | 'main'
  | 'settings'
  | 'upgrade';

export const route = writable<Route>('loading');

export function go(r: Route) {
  route.set(r);
}
