import type { ServerConfig } from '../routes/api/config/+server';

export type { ServerConfig };

/** Null when the request failed: each reader decides what that means for its own store. */
export async function fetchServerConfig(): Promise<ServerConfig | null> {
	try {
		const response = await fetch('/api/config');
		return response.ok ? await response.json() : null;
	} catch {
		return null;
	}
}
