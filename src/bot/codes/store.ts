import type { Database } from 'bun:sqlite';
import type { Game } from './constants';
import type { SourceCode } from './source';

export interface GameSubscription {
	guildId: string;
	game: Game;
	channelId: string;
	roleId: string | null;
	webhookId: string;
	webhookToken: string;
	enabled: boolean;
	lastError: string | null;
	revision: number;
}

export interface PendingCode extends SourceCode {
	firstSeenAt: number;
}

export interface SaveGameSubscriptionInput {
	guildId: string;
	game: Game;
	channelId: string;
	webhookId: string;
	webhookToken: string;
	expectedRevision: number;
}

export interface PendingWebhookDeletion {
	webhookId: string;
	webhookToken: string;
}

interface GameSubscriptionRow {
	guild_id: string;
	game: Game;
	channel_id: string;
	role_id: string | null;
	webhook_id: string;
	webhook_token: string;
	enabled: number;
	last_error: string | null;
	revision: number;
}

interface PendingCodeRow {
	game: Game;
	code_key: string;
	display_code: string;
	rewards: string;
	first_seen_at: number;
}

export class CodeStore {
	constructor(private readonly database: Database) {}

	reconcileCodes(game: Game, codes: SourceCode[], now = Date.now()): void {
		const deactivate = this.database.query('UPDATE source_codes SET active = 0 WHERE game = ?');
		const upsert = this.database.query(`
			INSERT INTO source_codes (
				game, code_key, display_code, rewards, active, first_seen_at, last_seen_at
			) VALUES (?, ?, ?, ?, 1, ?, ?)
			ON CONFLICT (game, code_key) DO UPDATE SET
				display_code = excluded.display_code,
				rewards = excluded.rewards,
				active = 1,
				last_seen_at = excluded.last_seen_at
		`);

		this.database.transaction(() => {
			deactivate.run(game);
			for (const code of codes) {
				upsert.run(game, code.codeKey, code.displayCode, code.rewards, now, now);
			}
		})();
	}

	saveGameSubscription(input: SaveGameSubscriptionInput, now = Date.now()): GameSubscription | null {
		const previous = this.getGameSubscription(input.guildId, input.game);
		const save = this.database.query(`
			INSERT INTO game_subscriptions (
				guild_id, game, channel_id, role_id, webhook_id, webhook_token,
				enabled, last_error, created_at, updated_at
			) VALUES (?, ?, ?, NULL, ?, ?, 1, NULL, ?, ?)
			ON CONFLICT (guild_id, game) DO UPDATE SET
				channel_id = excluded.channel_id,
				webhook_id = excluded.webhook_id,
				webhook_token = excluded.webhook_token,
				enabled = 1,
				last_error = NULL,
				updated_at = excluded.updated_at,
				revision = game_subscriptions.revision + 1
			WHERE game_subscriptions.revision = ?
		`);

		this.database.transaction(() => {
			save.run(
				input.guildId,
				input.game,
				input.channelId,
				input.webhookId,
				input.webhookToken,
				now,
				now,
				input.expectedRevision,
			);

			const current = this.getGameSubscription(input.guildId, input.game);
			if (!current || current.webhookId !== input.webhookId) {
				throw new StaleGameSubscriptionError();
			}

			if (previous && previous.webhookId !== input.webhookId) {
				this.queueWebhookIfUnreferenced(previous.webhookId, previous.webhookToken, now);
			}
		})();

		return previous;
	}

	getGameSubscription(guildId: string, game: Game): GameSubscription | null {
		const row = this.database.query<GameSubscriptionRow, [string, Game]>(`
			SELECT
				guild_id, game, channel_id, role_id, webhook_id,
				webhook_token, enabled, last_error, revision
			FROM game_subscriptions
			WHERE guild_id = ? AND game = ?
		`).get(guildId, game);

		return row ? mapGameSubscription(row) : null;
	}

	listGuildSubscriptions(guildId: string): GameSubscription[] {
		return this.database.query<GameSubscriptionRow, [string]>(`
			SELECT
				guild_id, game, channel_id, role_id, webhook_id,
				webhook_token, enabled, last_error, revision
			FROM game_subscriptions
			WHERE guild_id = ?
			ORDER BY CASE game WHEN 'genshin' THEN 1 WHEN 'hkrpg' THEN 2 ELSE 3 END
		`).all(guildId).map(mapGameSubscription);
	}

	listEnabledSubscriptions(): GameSubscription[] {
		return this.database.query<GameSubscriptionRow, []>(`
			SELECT
				guild_id, game, channel_id, role_id, webhook_id,
				webhook_token, enabled, last_error, revision
			FROM game_subscriptions
			WHERE enabled = 1
			ORDER BY guild_id, CASE game WHEN 'genshin' THEN 1 WHEN 'hkrpg' THEN 2 ELSE 3 END
		`).all().map(mapGameSubscription);
	}

	updateRole(
		guildId: string,
		game: Game,
		roleId: string | null,
		expectedRevision: number,
		now = Date.now(),
	): void {
		const result = this.database.query(`
			UPDATE game_subscriptions
			SET role_id = ?, updated_at = ?, revision = revision + 1
			WHERE guild_id = ? AND game = ? AND revision = ?
		`).run(roleId, now, guildId, game, expectedRevision);
		if (result.changes === 0) throw new StaleGameSubscriptionError();
	}

	getPendingCodes(guildId: string, game: Game): PendingCode[] {
		return this.database.query<PendingCodeRow, [string, Game]>(`
			SELECT code.game, code.code_key, code.display_code, code.rewards, code.first_seen_at
			FROM source_codes AS code
			JOIN game_subscriptions AS route
				ON route.game = code.game AND route.guild_id = ?
			LEFT JOIN deliveries AS delivery
				ON delivery.guild_id = route.guild_id
				AND delivery.game = code.game
				AND delivery.code_key = code.code_key
			WHERE code.game = ? AND code.active = 1 AND delivery.code_key IS NULL
			ORDER BY code.first_seen_at, code.code_key
		`).all(guildId, game).map((row) => ({
			game: row.game,
			codeKey: row.code_key,
			displayCode: row.display_code,
			rewards: row.rewards,
			firstSeenAt: row.first_seen_at,
		}));
	}

	recordDeliveries(guildId: string, codes: PendingCode[], messageId: string, now = Date.now()): void {
		const insert = this.database.query(`
			INSERT OR IGNORE INTO deliveries (
				guild_id, game, code_key, webhook_message_id, delivered_at
			) VALUES (?, ?, ?, ?, ?)
		`);

		this.database.transaction(() => {
			for (const code of codes) {
				insert.run(guildId, code.game, code.codeKey, messageId, now);
			}
		})();
	}

	pauseGameSubscription(guildId: string, game: Game, reason: string, now = Date.now()): void {
		this.database.query(`
			UPDATE game_subscriptions
			SET enabled = 0, last_error = ?, updated_at = ?, revision = revision + 1
			WHERE guild_id = ? AND game = ?
		`).run(reason.slice(0, 500), now, guildId, game);
	}

	disableGameSubscription(
		guildId: string,
		game: Game,
		expectedRevision: number,
		now = Date.now(),
	): GameSubscription {
		const route = this.getGameSubscription(guildId, game);
		if (!route || route.revision !== expectedRevision) throw new StaleGameSubscriptionError();

		this.database.transaction(() => {
			const result = this.database.query(`
				UPDATE game_subscriptions
				SET enabled = 0, last_error = NULL, updated_at = ?, revision = revision + 1
				WHERE guild_id = ? AND game = ? AND revision = ?
			`).run(now, guildId, game, expectedRevision);
			if (result.changes === 0) throw new StaleGameSubscriptionError();
			this.queueWebhookIfUnreferencedAfterDisable(route.webhookId, route.webhookToken, guildId, game, now);
		})();

		return route;
	}

	listPendingWebhookDeletions(): PendingWebhookDeletion[] {
		return this.database.query<{
			webhook_id: string;
			webhook_token: string;
		}, []>(`
			SELECT webhook_id, webhook_token
			FROM pending_webhook_deletions
			ORDER BY created_at
		`).all().map((row) => ({
			webhookId: row.webhook_id,
			webhookToken: row.webhook_token,
		}));
	}

	completeWebhookDeletion(webhookId: string): void {
		this.database.query('DELETE FROM pending_webhook_deletions WHERE webhook_id = ?').run(webhookId);
	}

	private queueWebhookIfUnreferencedAfterDisable(
		webhookId: string,
		webhookToken: string,
		guildId: string,
		game: Game,
		now: number,
	): void {
		this.database.query(`
			INSERT OR IGNORE INTO pending_webhook_deletions (webhook_id, webhook_token, created_at)
			SELECT ?, ?, ?
			WHERE NOT EXISTS (
				SELECT 1 FROM game_subscriptions
				WHERE webhook_id = ? AND enabled = 1 AND NOT (guild_id = ? AND game = ?)
			)
		`).run(webhookId, webhookToken, now, webhookId, guildId, game);
	}

	private queueWebhookIfUnreferenced(webhookId: string, webhookToken: string, now: number): void {
		this.database.query(`
			INSERT OR IGNORE INTO pending_webhook_deletions (webhook_id, webhook_token, created_at)
			SELECT ?, ?, ?
			WHERE NOT EXISTS (
				SELECT 1 FROM game_subscriptions WHERE webhook_id = ? AND enabled = 1
			)
		`).run(webhookId, webhookToken, now, webhookId);
	}
}

export class StaleGameSubscriptionError extends Error {
	constructor() {
		super('The setup panel is out of date.');
		this.name = 'StaleGameSubscriptionError';
	}
}

function mapGameSubscription(row: GameSubscriptionRow): GameSubscription {
	return {
		guildId: row.guild_id,
		game: row.game,
		channelId: row.channel_id,
		roleId: row.role_id,
		webhookId: row.webhook_id,
		webhookToken: row.webhook_token,
		enabled: row.enabled === 1,
		lastError: row.last_error,
		revision: row.revision,
	};
}
