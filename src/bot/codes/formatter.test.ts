import { describe, expect, test } from 'bun:test';
import type { APIEmbed } from 'discord.js';
import { buildDeliveryPayloads } from './formatter';
import type { PendingCode } from './store';

function code(index: number): PendingCode {
	return {
		game: 'genshin',
		codeKey: `CODE${index}`,
		displayCode: `CODE${index}`,
		rewards: `${'Reward '.repeat(100)}<@123>`,
		firstSeenAt: index,
	};
}

describe('code embed formatting', () => {
	test('chunks payloads within Discord limits and disables mentions', () => {
		const codes = Array.from({ length: 260 }, (_, index) => code(index));
		const payloads = buildDeliveryPayloads(codes);
		const delivered = payloads.flatMap((payload) => payload.codes);

		expect(delivered.map(({ codeKey }) => codeKey)).toEqual(codes.map(({ codeKey }) => codeKey));

		for (const payload of payloads) {
			expect(payload.options.allowedMentions).toEqual({ parse: [] });
			expect(payload.options.embeds?.length).toBeLessThanOrEqual(10);

			const characters = (payload.options.embeds as APIEmbed[]).reduce((total, embed) =>
				total
				+ (embed.title?.length ?? 0)
				+ (embed.description?.length ?? 0)
				+ (embed.footer?.text.length ?? 0)
				+ (embed.fields?.reduce((sum, field) => sum + field.name.length + field.value.length, 0) ?? 0), 0);
			expect(characters).toBeLessThanOrEqual(6_000);
		}
	});
});
