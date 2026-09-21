import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { getConfig } from '$lib/server/db/config';
import { resolveShared, type Sharing } from '$lib/server/sharing';
import type { Settings } from '$lib/settings';

export interface ResolvedSearch {
	url: string;
	backend: string;
	token: string;
	editable: boolean;
	source: 'env' | 'admin' | 'user' | 'none';
	/** The admin's shared default (for the "restore" action), when applicable. */
	adminUrl: string;
	adminBackend: string;
}

const envUrl = () => publicEnv.PUBLIC_SEARCH_URL?.trim() || '';
const envBackend = () => publicEnv.PUBLIC_SEARCH_BACKEND?.trim() || 'degoog';
const envToken = () => privateEnv.SEARCH_TOKEN?.trim() || '';

/**
 * The effective web-search config for a user: env (locked), then the user's own
 * (admins always), then the admin-shared config. It is configured in one place,
 * Chat settings, and Admin only chooses the sharing.
 */
export function resolveSearch(userSettings: Settings | null, isAdmin: boolean): ResolvedSearch {
	const own = {
		url: userSettings?.searchUrl?.trim() || '',
		backend: userSettings?.searchBackend || 'degoog',
		token: userSettings?.searchToken || ''
	};

	if (envUrl()) {
		return {
			url: envUrl(),
			backend: envBackend(),
			token: envToken(),
			editable: false,
			source: 'env',
			adminUrl: '',
			adminBackend: ''
		};
	}

	const admin = {
		url: getConfig('searchUrl') || '',
		backend: getConfig('searchBackend') || 'degoog',
		token: getConfig('searchToken') || ''
	};
	// Anything but a recognised sharing mode, or sharing without an address, shares
	// nothing: each user keeps their own.
	const mode = getConfig('searchSharing');
	const sharing: Sharing =
		admin.url && (mode === 'locked' || mode === 'overridable') ? mode : 'off';
	const shared = resolveShared({
		own,
		admin: () => admin,
		empty: { url: '', backend: '', token: '' },
		sharing,
		isAdmin,
		hasContent: (value) => !!value.url
	});

	return {
		...shared.value,
		editable: shared.editable,
		source: shared.source,
		adminUrl: shared.adminValue.url,
		adminBackend: shared.adminValue.backend
	};
}
