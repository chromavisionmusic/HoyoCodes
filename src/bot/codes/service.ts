import { GAMES, type Game } from './constants';
import type { CodeDeliveryService } from './delivery';
import type { CodeSourceClient } from './source';
import type {
	CodeStore,
	GameSubscription,
	SaveGameSubscriptionInput,
} from './store';
import { KeyedMutex } from '../utils/keyedMutex';

interface CodeServiceOptions {
	store: CodeStore;
	source: CodeSourceClient;
	delivery: CodeDeliveryService;
	deliveryConcurrency: number;
}

export interface ConfigureGameResult {
	previous: GameSubscription | null;
	refreshFailed: boolean;
	deliveryFailed: boolean;
}

export class CodeService {
	private readonly store: CodeStore;
	private readonly source: CodeSourceClient;
	private readonly delivery: CodeDeliveryService;
	private readonly deliveryConcurrency: number;
	private readonly gameLocks = new KeyedMutex<Game>();
	private readonly guildLocks = new KeyedMutex<string>();

	constructor(options: CodeServiceOptions) {
		this.store = options.store;
		this.source = options.source;
		this.delivery = options.delivery;
		this.deliveryConcurrency = Math.max(1, options.deliveryConcurrency);
	}

	async runCycle(signal?: AbortSignal): Promise<void> {
		await this.refreshGames([...GAMES], signal);
		if (!signal?.aborted) await this.deliverPending(signal);
		if (!signal?.aborted) await this.flushWebhookDeletions();
	}

	listGuildSubscriptions(guildId: string): GameSubscription[] {
		return this.store.listGuildSubscriptions(guildId);
	}

	async configureGame(
		input: SaveGameSubscriptionInput,
		signal?: AbortSignal,
	): Promise<ConfigureGameResult> {
		return this.guildLocks.runExclusive(input.guildId, async () => {
			const previous = this.store.saveGameSubscription(input);
			const refreshFailed = (await this.refreshGames([input.game], signal)).length > 0;
			let deliveryFailed = false;

			if (!signal?.aborted) {
				try {
					const subscription = this.store.getGameSubscription(input.guildId, input.game);
					if (subscription?.enabled) await this.delivery.deliverSubscription(subscription, signal);
				} catch (error) {
					deliveryFailed = true;
					console.error(`Failed initial ${input.game} delivery for guild ${input.guildId}:`, error);
				}
			}

			await this.flushWebhookDeletions();
			return { previous, refreshFailed, deliveryFailed };
		});
	}

	async updateGameRole(
		guildId: string,
		game: Game,
		roleId: string | null,
		expectedRevision: number,
	): Promise<void> {
		return this.guildLocks.runExclusive(guildId, async () => {
			this.store.updateRole(guildId, game, roleId, expectedRevision);
		});
	}

	async disableGame(
		guildId: string,
		game: Game,
		expectedRevision: number,
	): Promise<GameSubscription> {
		return this.guildLocks.runExclusive(guildId, async () => {
			const disabled = this.store.disableGameSubscription(guildId, game, expectedRevision);
			await this.flushWebhookDeletions();
			return disabled;
		});
	}

	async refreshGames(games: Game[], signal?: AbortSignal): Promise<Game[]> {
		const results = await Promise.allSettled(games.map((game) =>
			this.gameLocks.runExclusive(game, async () => {
				if (signal?.aborted) throw signal.reason;
				const codes = await this.source.fetchCodes(game, signal);
				this.store.reconcileCodes(game, codes);
			}),
		));
		const failedGames: Game[] = [];

		for (const [index, result] of results.entries()) {
			if (result.status === 'fulfilled') continue;
			const game = games[index];
			if (!game) continue;
			failedGames.push(game);
			if (!signal?.aborted) console.error(`Failed to refresh ${game} codes:`, result.reason);
		}

		return failedGames;
	}

	async deliverPending(signal?: AbortSignal): Promise<void> {
		const subscriptions = this.store.listEnabledSubscriptions();
		const guilds = [...new Set(subscriptions.map(({ guildId }) => guildId))];
		let nextIndex = 0;

		const worker = async () => {
			while (!signal?.aborted) {
				const guildId = guilds[nextIndex];
				nextIndex += 1;
				if (!guildId) return;

				await this.guildLocks.runExclusive(guildId, async () => {
					const routes = this.store.listGuildSubscriptions(guildId).filter(({ enabled }) => enabled);
					for (const route of routes) {
						if (signal?.aborted) return;
						try {
							await this.delivery.deliverSubscription(route, signal);
						} catch (error) {
							console.error(`Failed to deliver ${route.game} codes for guild ${guildId}:`, error);
						}
					}
				});
			}
		};

		await Promise.all(Array.from(
			{ length: Math.min(this.deliveryConcurrency, guilds.length) },
			() => worker(),
		));
	}

	async flushWebhookDeletions(): Promise<void> {
		for (const webhook of this.store.listPendingWebhookDeletions()) {
			try {
				await this.delivery.cleanupWebhook(webhook);
				this.store.completeWebhookDeletion(webhook.webhookId);
			} catch (error) {
				console.error(`Failed to delete obsolete webhook ${webhook.webhookId}:`, error);
			}
		}
	}
}
