import { ApiRepository } from './apiRepository';

/** The data repository: SQLite behind `/api/data`, asynchronous throughout. */
export const repository = new ApiRepository();

export type { Backup } from './repository';
