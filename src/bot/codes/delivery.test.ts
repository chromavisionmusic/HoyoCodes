import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
import type { WebhookMessageCreateOptions } from 'discord.js';
import { openDatabase } from '../database';
import { CodeDeliveryService } from './delivery';
import type { SourceCode } from './source';
import { CodeStore } from './store';

let database: Database;
let store: CodeStore;

beforeEach(() => {
	database = openDatabase(':memory:');
	store = new CodeStore(database);
	store.saveGameSubscription({
		guildId: 'guild', game: 'genshin', channelId: 'channel',
		webhookId: 'webhook', webhookToken: 'token', expectedRevision: 0,
	});
	store.updateRole('guild', 'genshin', 'role', 1);
});

afterEach(() => database.close());

describe('code delivery', () => {
	test('mentions the configured role only on the first payload', async () => {
		store.reconcileCodes('genshin', Array.from({ length: 260 }, (_, index) => sourceCode(index)));
		const sent: WebhookMessageCreateOptions[] = [];
		const service = new CodeDeliveryService({
			store,
			webhookFactory: () => ({
				send: async (options) => {
					sent.push(options);
					return { id: `message-${sent.length}` };
				},
				destroy: () => {},
			}),
		});
		const route = store.getGameSubscription('guild', 'genshin');
		if (!route) throw new Error('Missing route');

		await service.deliverSubscription(route);

		expect(sent.length).toBeGreaterThan(1);
		expect(sent[0]?.content).toBe('<@&role>');
		expect(sent[0]?.allowedMentions).toEqual({ parse: [], roles: ['role'] });
		for (const payload of sent.slice(1)) {
			expect(payload.content).toBeUndefined();
			expect(payload.allowedMentions).toEqual({ parse: [] });
		}
	});

	test('records successful chunks and retries only failed remaining codes', async () => {
		store.reconcileCodes('genshin', Array.from({ length: 260 }, (_, index) => sourceCode(index)));
		let calls = 0;
		const route = store.getGameSubscription('guild', 'genshin');
		if (!route) throw new Error('Missing route');
		const service = new CodeDeliveryService({
			store,
			webhookFactory: () => ({
				send: async () => {
					calls += 1;
					if (calls === 2) throw new Error('temporary failure');
					return { id: `message-${calls}` };
				},
				destroy: () => {},
			}),
		});

		await expect(service.deliverSubscription(route)).rejects.toThrow('temporary failure');
		const remaining = store.getPendingCodes('guild', 'genshin').length;
		expect(remaining).toBeGreaterThan(0);
		expect(remaining).toBeLessThan(260);

		const retry = new CodeDeliveryService({
			store,
			webhookFactory: () => ({ send: async () => ({ id: 'retry' }), destroy: () => {} }),
		});
		await retry.deliverSubscription(route);
		expect(store.getPendingCodes('guild', 'genshin')).toHaveLength(0);
	});

	test('never sends another game through the selected route', async () => {
		store.reconcileCodes('genshin', [sourceCode(1)]);
		store.reconcileCodes('hkrpg', [{ ...sourceCode(2), game: 'hkrpg' }]);
		let sends = 0;
		const route = store.getGameSubscription('guild', 'genshin');
		if (!route) throw new Error('Missing route');
		const service = new CodeDeliveryService({
			store,
			webhookFactory: () => ({
				send: async () => ({ id: `message-${++sends}` }),
				destroy: () => {},
			}),
		});

		await service.deliverSubscription(route);
		expect(sends).toBe(1);
		expect(store.getPendingCodes('guild', 'genshin')).toHaveLength(0);
	});
});

function sourceCode(index: number): SourceCode {
	return {
		game: 'genshin',
		codeKey: `CODE${index}`,
		displayCode: `CODE${index}`,
		rewards: 'Primogem*60',
	};
}
