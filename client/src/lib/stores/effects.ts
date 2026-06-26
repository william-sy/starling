import { writable } from 'svelte/store';
import type { EffectType } from '$lib/types/effects';

export const pendingTrigger = writable<EffectType | null>(null);

// Pending effects per contact PIN - fired when you open that chat
export const effectQueue = writable<Record<string, EffectType>>({});
