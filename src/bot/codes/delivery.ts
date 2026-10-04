import { DiscordAPIError, WebhookClient, type WebhookMessageCreateOptions } from 'discord.js';
import { buildDeliveryPayloads } from './formatter';
import type {
	CodeStore,
	GameSubscription,
	PendingWebhookDeletion,
} from './store';

interface WebhookSender {
	send(options: WebhookMessageCreateOptions): Promise<{ id: string }>;
	destroy(): void;
}

type WebhookFactory = (subscription: GameSubscription) => WebhookSender;

interface DeliveryServiceOptions {
	store: CodeStore;
	webhookFactory?: WebhookFactory;
	webhookDeleter?: (webhook: PendingWebhookDeletion) => Promise<void>;
}

export class CodeDeliveryService {
	private readonly store: CodeStore;
	private readonly webhookFactory: WebhookFactory;
	private readonly webhookDeleter: (webhook: PendingWebhookDeletion) => Promise<void>;

	constructor(options: DeliveryServiceOptions) {
		this.store = options.store;
		this.webhookFactory = options.webhookFactory ?? ((subscription) => new WebhookClient({
			id: subscription.webhookId,
			token: subscription.webhookToken,
		}));
		this.webhookDeleter = options.webhookDeleter ?? deleteWebhook;
	}

	async deliverSubscription(subscription: GameSubscription, signal?: AbortSignal): Promise<void> {
		const pending = this.store.getPendingCodes(subscription.guildId, subscription.game);
		if (pending.length === 0 || signal?.aborted) return;

		const webhook = this.webhookFactory(subscription);

		try {
			for (const [index, payload] of buildDeliveryPayloads(pending).entries()) {
				if (signal?.aborted) return;

				const options: WebhookMessageCreateOptions = subscription.roleId && index === 0
					? {
						...payload.options,
						content: `<@&${subscription.roleId}>`,
						allowedMentions: { parse: [], roles: [subscription.roleId] },
					}
					: payload.options;

				try {
					const message = await webhook.send(options);
					this.store.recordDeliveries(subscription.guildId, payload.codes, message.id);
				} catch (error) {
					if (isTerminalWebhookError(error)) {
						this.store.pauseGameSubscription(
							subscription.guildId,
							subscription.game,
							'The configured webhook is no longer valid.',
						);
					}
					throw error;
				}
			}
		} finally {
			webhook.destroy();
		}
	}

	async cleanupWebhook(webhook: PendingWebhookDeletion): Promise<void> {
		await this.webhookDeleter(webhook);
	}
}

async function deleteWebhook(webhook: PendingWebhookDeletion): Promise<void> {
	const client = new WebhookClient({ id: webhook.webhookId, token: webhook.webhookToken });
	try {
		await client.delete('HoyoCodes configuration changed');
	} catch (error) {
		if (!isTerminalWebhookError(error)) throw error;
	} finally {
		client.destroy();
	}
}

function isTerminalWebhookError(error: unknown): boolean {
	if (error instanceof DiscordAPIError) {
		return error.status === 401 || error.status === 404 || error.code === 10_015;
	}

	return false;
}
