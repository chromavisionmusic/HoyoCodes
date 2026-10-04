import type { Database } from 'bun:sqlite';

const migrations = [
	`CREATE TABLE subscriptions (
		guild_id TEXT PRIMARY KEY,
		channel_id TEXT NOT NULL,
		webhook_id TEXT NOT NULL UNIQUE,
		webhook_token TEXT NOT NULL,
		enabled INTEGER NOT NULL DEFAULT 1,
		last_error TEXT,
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL
	);

	CREATE TABLE subscription_games (
		guild_id TEXT NOT NULL,
		game TEXT NOT NULL CHECK (game IN ('genshin', 'hkrpg', 'nap')),
		PRIMARY KEY (guild_id, game),
		FOREIGN KEY (guild_id) REFERENCES subscriptions(guild_id) ON DELETE CASCADE
	);

	CREATE TABLE source_codes (
		game TEXT NOT NULL CHECK (game IN ('genshin', 'hkrpg', 'nap')),
		code_key TEXT NOT NULL,
		display_code TEXT NOT NULL,
		rewards TEXT NOT NULL DEFAULT '',
		active INTEGER NOT NULL DEFAULT 1,
		first_seen_at INTEGER NOT NULL,
		last_seen_at INTEGER NOT NULL,
		PRIMARY KEY (game, code_key)
	);

	CREATE TABLE deliveries (
		guild_id TEXT NOT NULL,
		game TEXT NOT NULL,
		code_key TEXT NOT NULL,
		webhook_message_id TEXT NOT NULL,
		delivered_at INTEGER NOT NULL,
		PRIMARY KEY (guild_id, game, code_key),
		FOREIGN KEY (guild_id) REFERENCES subscriptions(guild_id) ON DELETE CASCADE,
		FOREIGN KEY (game, code_key) REFERENCES source_codes(game, code_key)
	);

	CREATE INDEX source_codes_active_idx ON source_codes (game, active);
	CREATE INDEX subscriptions_enabled_idx ON subscriptions (enabled);
	CREATE INDEX subscription_games_game_idx ON subscription_games (game, guild_id);`,
	`CREATE TABLE game_subscriptions (
		guild_id TEXT NOT NULL,
		game TEXT NOT NULL CHECK (game IN ('genshin', 'hkrpg', 'nap')),
		channel_id TEXT NOT NULL,
		role_id TEXT,
		webhook_id TEXT NOT NULL,
		webhook_token TEXT NOT NULL,
		enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
		last_error TEXT,
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL,
		PRIMARY KEY (guild_id, game)
	);

	INSERT INTO game_subscriptions (
		guild_id, game, channel_id, role_id, webhook_id, webhook_token,
		enabled, last_error, created_at, updated_at
	)
	SELECT
		subscription.guild_id,
		selected.game,
		subscription.channel_id,
		NULL,
		subscription.webhook_id,
		subscription.webhook_token,
		subscription.enabled,
		subscription.last_error,
		subscription.created_at,
		subscription.updated_at
	FROM subscriptions AS subscription
	JOIN subscription_games AS selected ON selected.guild_id = subscription.guild_id;

	CREATE TABLE deliveries_v2 (
		guild_id TEXT NOT NULL,
		game TEXT NOT NULL,
		code_key TEXT NOT NULL,
		webhook_message_id TEXT NOT NULL,
		delivered_at INTEGER NOT NULL,
		PRIMARY KEY (guild_id, game, code_key),
		FOREIGN KEY (guild_id, game)
			REFERENCES game_subscriptions(guild_id, game) ON DELETE CASCADE,
		FOREIGN KEY (game, code_key) REFERENCES source_codes(game, code_key)
	);

	INSERT INTO deliveries_v2 (
		guild_id, game, code_key, webhook_message_id, delivered_at
	)
	SELECT
		delivery.guild_id,
		delivery.game,
		delivery.code_key,
		delivery.webhook_message_id,
		delivery.delivered_at
	FROM deliveries AS delivery
	JOIN game_subscriptions AS route
		ON route.guild_id = delivery.guild_id AND route.game = delivery.game;

	DROP TABLE deliveries;
	DROP TABLE subscription_games;
	DROP TABLE subscriptions;
	ALTER TABLE deliveries_v2 RENAME TO deliveries;

	CREATE TABLE pending_webhook_deletions (
		webhook_id TEXT PRIMARY KEY,
		webhook_token TEXT NOT NULL,
		created_at INTEGER NOT NULL
	);

	CREATE INDEX game_subscriptions_enabled_idx
		ON game_subscriptions (enabled, guild_id, game);
	CREATE INDEX game_subscriptions_webhook_idx
		ON game_subscriptions (webhook_id);
	CREATE INDEX deliveries_route_idx
		ON deliveries (guild_id, game);`,
	`ALTER TABLE game_subscriptions
		ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;`,
];

export function runMigrations(database: Database): void {
	const currentVersion = database.query<{ user_version: number }, []>('PRAGMA user_version').get()?.user_version ?? 0;

	for (let index = currentVersion; index < migrations.length; index += 1) {
		const migration = migrations[index];
		if (!migration) continue;

		database.transaction(() => {
			database.exec(migration);
			const violations = database.query('PRAGMA foreign_key_check').all();
			if (violations.length > 0) {
				throw new Error(`Migration ${index + 1} introduced foreign key violations`);
			}
			database.exec(`PRAGMA user_version = ${index + 1}`);
		})();
	}
}
