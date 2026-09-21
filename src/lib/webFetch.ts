import { writable } from 'svelte/store';

import type { ServerConfig } from '$lib/serverConfig';

/** Web search hands the model a sentence or two per result and asks for a factual answer. This closes the gap: when the user names a URL, the model gets the page. */

export interface WebFetchConfig {
	available: boolean;
	editable: boolean;
	maxPages: number;
	maxChars: number;
}

export const webFetchConfig = writable<WebFetchConfig>({
	available: false,
	editable: true,
	maxPages: 3,
	maxChars: 20_000
});

/** The policy comes from the instance, which is also the one that enforces it. */
export function applyWebFetchConfig(config: ServerConfig | null): void {
	if (!config) {
		webFetchConfig.set({ available: false, editable: false, maxPages: 3, maxChars: 20_000 });
		return;
	}
	const resolved = config.webFetch;
	webFetchConfig.set({
		available: !!resolved.webFetch,
		editable: !!resolved.editable,
		maxPages: resolved.maxPages,
		maxChars: resolved.maxChars
	});
}
