import { json } from '@sveltejs/kit';

import { env as privateEnv } from '$env/dynamic/private';
import { MCP_LIMITS } from '$lib/mcp';
import { requireUser } from '$lib/server/api';
import { resolveAppPrompts } from '$lib/server/appPromptsResolver';
import { resolveChatDefaults } from '$lib/server/chatDefaultsResolver';
import { getSettings } from '$lib/server/db/collections';
import {
	allowUserIntegrations,
	allowUserMcp,
	allowUserPersonas,
	botsPerUser,
	personaAutoUpdateForced,
	personaMemoryEnabled,
	personaStoreMode,
	storeUrl
} from '$lib/server/db/config';
import { sharedCatalogIds, sharedPersonas } from '$lib/server/db/sharedPersonas';
import { sharedCatalogPlaybookIds, sharedPlaybooks } from '$lib/server/db/sharedPlaybooks';
import { hasMcpServers } from '$lib/server/mcp/session';
import { resolveSearch } from '$lib/server/searchResolver';
import { resolveSystemPrompts } from '$lib/server/systemPromptsResolver';
import { resolveTools } from '$lib/server/toolsResolver';
import { DEFAULT_STORE } from '$lib/store';

function configFor(user: { id: string; role: 'admin' | 'user' }) {
	const settings = getSettings(user.id);
	const isAdmin = user.role === 'admin';
	// The token is never returned, only whether one is set.
	const { token, ...search } = resolveSearch(settings, isAdmin);
	// An admin always sees the whole catalogue: it is the source they choose from.
	// What the mode decides is what everyone else's store contains.
	const storeMode = isAdmin ? 'open' : personaStoreMode();

	return {
		search: { ...search, hasToken: !!token },
		// Advisory: a run resolves it again before offering the tool.
		webFetch: resolveTools(settings, isAdmin),
		prompts: {
			systemPrompts: resolveSystemPrompts(settings, isAdmin),
			appPrompts: resolveAppPrompts(settings, isAdmin)
		},
		chatDefaults: resolveChatDefaults(settings, isAdmin),
		personas: {
			shared: sharedPersonas(),
			sharedFromStore: sharedCatalogIds(),
			canCreate: isAdmin || allowUserPersonas(),
			storeMode,
			canShare: isAdmin,
			autoUpdateForced: personaAutoUpdateForced(),
			memoryEnabled: personaMemoryEnabled(),
			storeUrl: storeUrl() ?? privateEnv.STORE_URL ?? DEFAULT_STORE,
			canEditStore: isAdmin
		},
		playbooks: {
			shared: sharedPlaybooks(),
			sharedFromStore: sharedCatalogPlaybookIds(),
			storeMode,
			canShare: isAdmin
		},
		integrations: {
			canManage: isAdmin || allowUserIntegrations(),
			isAdmin,
			limit: botsPerUser()
		},
		mcp: {
			canManage: isAdmin || allowUserMcp(),
			isAdmin,
			limit: MCP_LIMITS.perUser,
			// Whether there is anything to switch on, which differs from whether this
			// account may add one.
			hasServers: hasMcpServers(user.id, isAdmin)
		}
	};
}

export type ServerConfig = ReturnType<typeof configFor>;

/** Every per-account policy the interface reads, in one round trip. */
export async function GET(event) {
	return json(configFor(await requireUser(event)));
}
