import { derived, writable } from 'svelte/store';

import { MCP_LIMITS } from '$lib/mcp';
import type { ServerConfig } from '$lib/serverConfig';

/** Read at boot like the other governance answers, because the composer's tool menu is drawn from it: a switch that appears a moment after the page is worse than its absence. */
export interface McpConfig {
	/** Whether this account may add servers of its own. */
	canManage: boolean;
	isAdmin: boolean;
	limit: number;
	/** Whether any server is configured and switched on, which is what the menu asks. */
	hasServers: boolean;
}

/** Before the instance has answered: nothing offered, since this is a grant. */
const DEFAULT: McpConfig = {
	canManage: false,
	isAdmin: false,
	limit: MCP_LIMITS.perUser,
	hasServers: false
};

const fromServer = writable<McpConfig | null>(null);

/** Null leaves the store null, which reads as "nothing here". */
export function applyMcpConfig(config: ServerConfig | null): void {
	if (config) fromServer.set(config.mcp);
}

export const mcpConfig = derived(fromServer, ($server): McpConfig => $server ?? DEFAULT);
