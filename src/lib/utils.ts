import { get } from 'svelte/store';

import { locale } from '$i18n/i18n-svelte';

/**
 * A device driven by a finger, which is also one with a soft keyboard: focusing
 * a field there costs half the screen, so anything that focuses the composer on
 * its own behalf has to check first.
 */
export function isTouchPrimary() {
	return typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
}

export function generateRandomId() {
	return Math.random().toString(36).substring(2, 8); // E.g. `z7avx9`
}

export function getUpdatedAtDate() {
	return new Date().toISOString();
}

/** Largest unit first would need the whole ladder anyway: each step divides by the next, so the first that still fits is the one to say it in. */
const DIVISIONS: { amount: number; unit: Intl.RelativeTimeFormatUnit }[] = [
	{ amount: 60, unit: 'second' },
	{ amount: 60, unit: 'minute' },
	{ amount: 24, unit: 'hour' },
	{ amount: 7, unit: 'day' },
	{ amount: 4.34524, unit: 'week' },
	{ amount: 12, unit: 'month' },
	{ amount: Number.POSITIVE_INFINITY, unit: 'year' }
];

/**
 * In the interface's language, not the machine's: `Intl` defaults to the OS
 * locale, which has nothing to do with the language picker.
 */
export function formatTimestampToNow(timestamp: string) {
	let delta = (new Date(timestamp).getTime() - Date.now()) / 1000;
	const format = new Intl.RelativeTimeFormat(get(locale), { numeric: 'always' });

	for (const { amount, unit } of DIVISIONS) {
		if (Math.abs(delta) < amount) return format.format(Math.round(delta), unit);
		delta /= amount;
	}
	return '';
}

/** Under a minute is not worth a number, so the caller passes the word. */
export function formatTimestampToNowShort(timestamp: string, justNow: string) {
	const elapsed = Date.now() - new Date(timestamp).getTime();
	if (elapsed < 60_000) return justNow;
	return formatTimestampToNow(timestamp);
}
