import {
	EmbedBuilder,
	type APIEmbed,
	type WebhookMessageCreateOptions,
} from 'discord.js';
import { GAME_DETAILS, GAMES, type Game } from './constants';
import type { PendingCode } from './store';
import botConfig from '../utils/yaml';

const MAX_EMBEDS_PER_MESSAGE = 10;
const MAX_EMBED_CHARACTERS_PER_MESSAGE = 6_000;
const MAX_FIELDS_PER_EMBED = 25;
const MAX_FIELD_VALUE_LENGTH = 1_024;

export interface DeliveryPayload {
	options: WebhookMessageCreateOptions;
	codes: PendingCode[];
}

interface BuiltEmbed {
	embed: APIEmbed;
	codes: PendingCode[];
	characters: number;
}

export function buildDeliveryPayloads(codes: PendingCode[]): DeliveryPayload[] {
	const embeds = GAMES.flatMap((game) => buildGameEmbeds(game, codes.filter((code) => code.game === game)));
	const payloads: DeliveryPayload[] = [];
	let currentEmbeds: APIEmbed[] = [];
	let currentCodes: PendingCode[] = [];
	let currentCharacters = 0;

	const flush = () => {
		if (currentEmbeds.length === 0) return;
		payloads.push({
			options: {
				embeds: currentEmbeds,
				allowedMentions: { parse: [] },
			},
			codes: currentCodes,
		});
		currentEmbeds = [];
		currentCodes = [];
		currentCharacters = 0;
	};

	for (const built of embeds) {
		if (
			currentEmbeds.length >= MAX_EMBEDS_PER_MESSAGE
			|| currentCharacters + built.characters > MAX_EMBED_CHARACTERS_PER_MESSAGE
		) {
			flush();
		}

		currentEmbeds.push(built.embed);
		currentCodes.push(...built.codes);
		currentCharacters += built.characters;
	}

	flush();
	return payloads;
}

function buildGameEmbeds(game: Game, codes: PendingCode[]): BuiltEmbed[] {
	if (codes.length === 0) return [];

	const sortedCodes = [...codes].sort((left, right) =>
		left.firstSeenAt - right.firstSeenAt || left.codeKey.localeCompare(right.codeKey),
	);
	const embeds: BuiltEmbed[] = [];
	let chunk: PendingCode[] = [];

	for (const code of sortedCodes) {
		if (chunk.length >= MAX_FIELDS_PER_EMBED) {
			embeds.push(buildGameEmbed(game, chunk));
			chunk = [];
		}

		const candidate = buildGameEmbed(game, [...chunk, code]);
		if (chunk.length > 0 && candidate.characters > MAX_EMBED_CHARACTERS_PER_MESSAGE) {
			embeds.push(buildGameEmbed(game, chunk));
			chunk = [code];
		} else {
			chunk.push(code);
		}
	}

	if (chunk.length > 0) embeds.push(buildGameEmbed(game, chunk));
	return embeds;
}

function buildGameEmbed(game: Game, codes: PendingCode[]): BuiltEmbed {
  const details = GAME_DETAILS[game];
  let icon: string | null
	switch (game) {
		case 'genshin':
			icon = botConfig.logo.genshin;
			break;
		case 'hkrpg':
			icon = botConfig.logo.hsr;
			break;
		case 'nap':
			icon = botConfig.logo.zzz;
			break;
		default:
			icon = null;
	}
	const embed = new EmbedBuilder()
		.setTitle(`${details.name} — Active Codes`)
    .setDescription('New active redemption codes are available.')
    .setColor(details.color)
		.setThumbnail(icon)
		.addFields(codes.map((code) => ({
			name: sanitize(code.displayCode, 256),
			value: code.rewards
				? `\`${sanitize(code.codeKey, 128)}\`\n${sanitize(code.rewards, MAX_FIELD_VALUE_LENGTH - 132)}`
				: `\`${sanitize(code.codeKey, 128)}\`\nRewards not listed`,
			inline: false,
		})))
		.setTimestamp();
	const json = embed.toJSON();

	return {
		embed: json,
		codes,
		characters: countEmbedCharacters(json),
	};
}

function sanitize(value: string, maxLength: number): string {
	const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
	if (cleaned.length <= maxLength) return cleaned;
	return `${cleaned.slice(0, Math.max(0, maxLength - 1))}…`;
}

function countEmbedCharacters(embed: APIEmbed): number {
	return (embed.title?.length ?? 0)
		+ (embed.description?.length ?? 0)
		+ (embed.footer?.text.length ?? 0)
		+ (embed.author?.name.length ?? 0)
		+ (embed.fields?.reduce((total, field) => total + field.name.length + field.value.length, 0) ?? 0);
}
