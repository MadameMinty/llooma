import type { StorageKey } from './keys';

/** Distinct from a read that failed: a failure has to be shouted about, since an empty sidebar looks like an empty account, while being signed out is not a failure at all. Saving stays suspended either way. */
export class NotAuthenticatedError extends Error {
	constructor() {
		super('Not signed in');
		this.name = 'NotAuthenticatedError';
	}
}

/** A portable backup, keyed by `StorageKey` for compatibility with files exported by earlier versions. */
export type Backup = Partial<Record<StorageKey, unknown>>;
