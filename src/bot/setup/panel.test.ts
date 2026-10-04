import { describe, expect, test } from 'bun:test';
import { ComponentType } from 'discord.js';
import setup from '../commands/setup';
import type { GameSubscription } from '../codes/store';
import { createSetupPanel, handleSetupInteraction, isSetupInteraction } from './panel';

function route(overrides: Partial<GameSubscription> = {}): GameSubscription {
	return {
		guildId: 'guild',
		game: 'genshin',
		channelId: 'channel',
		roleId: 'role',
		webhookId: 'webhook',
		webhookToken: 'token',
		enabled: true,
		lastError: null,
		revision: 1,
		...overrides,
	};
}

describe('setup panel', () => {
	test('registers plain /setup without options or subcommands', () => {
		const json = setup.data.toJSON();
		expect(json.name).toBe('setup');
		expect(json.options ?? []).toHaveLength(0);
	});

	test('renders all games and native controls for the selected route', async () => {
		const client = {
			codeService: { listGuildSubscriptions: () => [route()] },
		} as never;
		const panel = await createSetupPanel('guild', { client }, 'genshin');
		const embed = panel.embeds[0]?.toJSON();
		const rows = panel.components.map((row) => row.toJSON());

		expect(embed?.fields?.map(({ name }) => name)).toEqual([
			'› Genshin Impact',
			'Honkai: Star Rail',
			'Zenless Zone Zero',
		]);
		expect(embed?.fields?.[0]?.value).toContain('<#channel>');
		expect(embed?.fields?.[0]?.value).toContain('<@&role>');
		expect(rows.map((row) => row.components[0]?.type)).toEqual([
			ComponentType.StringSelect,
			ComponentType.ChannelSelect,
			ComponentType.RoleSelect,
			ComponentType.Button,
		]);
	});

	test('disables role and destructive controls for an unconfigured game', async () => {
		const client = {
			codeService: { listGuildSubscriptions: () => [] },
		} as never;
		const panel = await createSetupPanel('guild', { client }, 'nap');
		const rows = panel.components.map((row) => row.toJSON());

		expect(rows[2]?.components[0]?.disabled).toBe(true);
		expect(rows[3]?.components.every((component) => component.disabled)).toBe(true);
	});

	test('acknowledges components before validating their context', async () => {
		const calls: string[] = [];
		const interaction = {
			customId: 'setup:channel:genshin:0',
			deferUpdate: async () => { calls.push('defer'); },
			inGuild: () => { calls.push('validate'); return false; },
			guild: null,
			editReply: async () => { calls.push('edit'); },
		} as never;

		await handleSetupInteraction(interaction);
		expect(calls).toEqual(['defer', 'validate', 'edit']);
	});

	test('recognizes only setup custom IDs', () => {
		expect(isSetupInteraction({ customId: 'setup:channel:genshin:0' })).toBe(true);
		expect(isSetupInteraction({ customId: 'other:channel' })).toBe(false);
	});
});
