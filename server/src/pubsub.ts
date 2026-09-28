import { PubSub } from 'graphql-subscriptions';

/**
 * Shared PubSub instance and subscription channel names.
 *
 * These live here rather than in index.ts so that importing a resolver does
 * not pull in index.ts — which calls startServer() at module load, opening a
 * MongoDB connection and an HTTP/WebSocket listener as an import side effect.
 * Keeping them separate lets resolvers be imported (and tested) in isolation.
 */
export const pubsub = new PubSub();

export const SYNC_PROGRESS_UPDATED = 'SYNC_PROGRESS_UPDATED';
export const SYNC_HISTORY_UPDATED = 'SYNC_HISTORY_UPDATED';
