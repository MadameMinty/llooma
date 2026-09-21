import { derived, writable } from 'svelte/store';

import { DEFAULT_BOTS_PER_USER } from '$lib/integrations';
import { fetchServerConfig, type ServerConfig } from '$lib/serverConfig';

/** Read at boot rather than when the settings window opens, so the tab is either there or not from the first render. */
export interface IntegrationsConfig {
	/** Whether this account may run bots at all. */
	canManage: boolean;
	/** Whether it may also see and stop everybody else's. */
	isAdmin: boolean;
	/** How many one account may run. */
	limit: number;
}

/** Before the instance has answered: the closed reading, since this is a grant. */
const DEFAULT: IntegrationsConfig = {
	canManage: false,
	isAdmin: false,
	limit: DEFAULT_BOTS_PER_USER
};

const fromServer = writable<IntegrationsConfig | null>(null);

/** Null leaves the store null, which reads as "not allowed". */
export function applyIntegrationsConfig(config: ServerConfig | null): void {
	if (config) fromServer.set(config.integrations);
}

export async function loadIntegrationsConfig(): Promise<void> {
	applyIntegrationsConfig(await fetchServerConfig());
}

export const integrationsConfig = derived(
	fromServer,
	($server): IntegrationsConfig => $server ?? DEFAULT
);
