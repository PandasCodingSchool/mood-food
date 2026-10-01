import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '../db/schema.js';

export const ENV = Symbol('ENV');
export const DB = Symbol('DB');
export const PG_POOL = Symbol('PG_POOL');
export const REDIS = Symbol('REDIS');

export type Database = NodePgDatabase<typeof schema>;
