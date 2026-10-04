import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { openDatabase } from '../database';
import { runMigrations } from '../database/migrations';
import type { SourceCode } from './source';
import { CodeStore } from './store';

let database: Database;
let store: CodeStore;

const firstCode: SourceCode = {
	game: 'genshin',
	codeKey: 'FIRST',
	displayCode: 'FIRST',
	rewards: 'Primogem*60',
};

beforeEach(() => {
	database = openDatabase(':memory:');
	store = new CodeStore(database);
});

afterEach(() => database.close());

describe('code store', () => {
	test('reconciles active codes without losing first-seen state', () => {
		store.reconcileCodes('genshin', [firstCode], 100);
		store.reconcileCodes('genshin', [], 200);
		store.reconcileCodes('genshin', [{ ...firstCode, rewards: 'Primogem*100' }], 300);

		const row = database.query<{
			active: number;
			first_seen_at: number;
			last_seen_at: number;
			rewards: string;
		}, []>('SELECT active, first_seen_at, last_seen_at, rewards FROM source_codes').get();

		expect(row).toEqual({
			active: 1,
			first_seen_at: 100,
			last_seen_at: 300,
			rewards: 'Primogem*100',
		});
	});

	test('preserves delivery history across channel and role changes', () => {
		store.reconcileCodes('genshin', [firstCode], 100);
		store.saveGameSubscription({
			guildId: 'guild', game: 'genshin', channelId: 'channel',
			webhookId: 'webhook-1', webhookToken: 'token-1', expectedRevision: 0,
		}, 100);
		const pending = store.getPendingCodes('guild', 'genshin');
		store.recordDeliveries('guild', pending, 'message', 200);

		store.updateRole('guild', 'genshin', 'role', 1, 250);
		store.saveGameSubscription({
			guildId: 'guild', game: 'genshin', channelId: 'other',
			webhookId: 'webhook-2', webhookToken: 'token-2', expectedRevision: 2,
		}, 300);

		expect(store.getPendingCodes('guild', 'genshin')).toHaveLength(0);
		expect(store.getGameSubscription('guild', 'genshin')?.roleId).toBe('role');
		expect(store.listPendingWebhookDeletions().map(({ webhookId }) => webhookId)).toEqual(['webhook-1']);
	});

	test('disabling preserves history and cleans a shared webhook after the last active route', () => {
		store.reconcileCodes('genshin', [firstCode], 100);
		store.reconcileCodes('hkrpg', [{ ...firstCode, game: 'hkrpg' }], 100);
		for (const game of ['genshin', 'hkrpg'] as const) {
			store.saveGameSubscription({
				guildId: 'guild', game, channelId: 'channel',
				webhookId: 'shared', webhookToken: 'token', expectedRevision: 0,
			}, 100);
			store.recordDeliveries('guild', store.getPendingCodes('guild', game), `${game}-message`, 200);
		}

		store.disableGameSubscription('guild', 'genshin', 1, 300);
		expect(store.listPendingWebhookDeletions()).toHaveLength(0);
		expect(store.getPendingCodes('guild', 'hkrpg')).toHaveLength(0);

		store.disableGameSubscription('guild', 'hkrpg', 1, 400);
		expect(store.listPendingWebhookDeletions()).toEqual([{ webhookId: 'shared', webhookToken: 'token' }]);

		store.saveGameSubscription({
			guildId: 'guild', game: 'genshin', channelId: 'channel',
			webhookId: 'new', webhookToken: 'new-token', expectedRevision: 2,
		}, 500);
		expect(store.getPendingCodes('guild', 'genshin')).toHaveLength(0);
		expect(store.getGameSubscription('guild', 'genshin')?.enabled).toBe(true);
	});

	test('queues a shared webhook when its last active route is replaced', () => {
		for (const game of ['genshin', 'hkrpg'] as const) {
			store.saveGameSubscription({
				guildId: 'guild', game, channelId: 'channel',
				webhookId: 'shared', webhookToken: 'token', expectedRevision: 0,
			});
		}

		store.disableGameSubscription('guild', 'genshin', 1);
		store.saveGameSubscription({
			guildId: 'guild', game: 'hkrpg', channelId: 'new-channel',
			webhookId: 'new-webhook', webhookToken: 'new-token', expectedRevision: 1,
		});

		expect(store.listPendingWebhookDeletions()).toEqual([{ webhookId: 'shared', webhookToken: 'token' }]);
	});

	test('rejects stale route mutations', () => {
		store.saveGameSubscription({
			guildId: 'guild', game: 'nap', channelId: 'channel',
			webhookId: 'webhook', webhookToken: 'token', expectedRevision: 0,
		});
		store.updateRole('guild', 'nap', 'role', 1);

		expect(() => store.updateRole('guild', 'nap', null, 1)).toThrow('out of date');
		expect(() => store.disableGameSubscription('guild', 'nap', 1)).toThrow('out of date');
	});
});

describe('subscription migration', () => {
	test('converts legacy selected games and deliveries to independent routes', () => {
		const legacy = new Database(':memory:', { strict: true });
		legacy.exec('PRAGMA foreign_keys = ON');
		legacy.exec(`
			CREATE TABLE subscriptions (
				guild_id TEXT PRIMARY KEY, channel_id TEXT NOT NULL,
				webhook_id TEXT NOT NULL UNIQUE, webhook_token TEXT NOT NULL,
				enabled INTEGER NOT NULL, last_error TEXT,
				created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
			);
			CREATE TABLE subscription_games (
				guild_id TEXT NOT NULL, game TEXT NOT NULL,
				PRIMARY KEY (guild_id, game),
				FOREIGN KEY (guild_id) REFERENCES subscriptions(guild_id) ON DELETE CASCADE
			);
			CREATE TABLE source_codes (
				game TEXT NOT NULL, code_key TEXT NOT NULL, display_code TEXT NOT NULL,
				rewards TEXT NOT NULL, active INTEGER NOT NULL,
				first_seen_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL,
				PRIMARY KEY (game, code_key)
			);
			CREATE TABLE deliveries (
				guild_id TEXT NOT NULL, game TEXT NOT NULL, code_key TEXT NOT NULL,
				webhook_message_id TEXT NOT NULL, delivered_at INTEGER NOT NULL,
				PRIMARY KEY (guild_id, game, code_key),
				FOREIGN KEY (guild_id) REFERENCES subscriptions(guild_id) ON DELETE CASCADE,
				FOREIGN KEY (game, code_key) REFERENCES source_codes(game, code_key)
			);
			INSERT INTO subscriptions VALUES ('guild', 'channel', 'shared', 'token', 0, 'broken', 1, 2);
			INSERT INTO subscription_games VALUES ('guild', 'genshin'), ('guild', 'hkrpg');
			INSERT INTO source_codes VALUES ('genshin', 'CODE', 'CODE', '', 1, 1, 1);
			INSERT INTO deliveries VALUES ('guild', 'genshin', 'CODE', 'message', 3);
			PRAGMA user_version = 1;
		`);

		runMigrations(legacy);
		const migrated = new CodeStore(legacy);
		const routes = migrated.listGuildSubscriptions('guild');

		expect(routes).toHaveLength(2);
		expect(routes.every(({ webhookId }) => webhookId === 'shared')).toBe(true);
		expect(routes.every(({ enabled, lastError }) => !enabled && lastError === 'broken')).toBe(true);
		expect(legacy.query('SELECT * FROM deliveries').all()).toHaveLength(1);
		expect(legacy.query('PRAGMA foreign_key_check').all()).toHaveLength(0);
		expect(legacy.query<{ user_version: number }, []>('PRAGMA user_version').get()?.user_version).toBe(3);
		legacy.close();
	});
});
