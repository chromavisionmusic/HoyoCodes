import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ChannelSelectMenuBuilder,
	ChannelType,
	EmbedBuilder,
	MessageFlags,
	PermissionFlagsBits,
	RoleSelectMenuBuilder,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
	WebhookClient,
	type ButtonInteraction,
	type ChannelSelectMenuInteraction,
	type Guild,
	type MessageActionRowComponentBuilder,
	type RoleSelectMenuInteraction,
	type StringSelectMenuInteraction,
	type TextChannel,
	type NewsChannel,
} from 'discord.js';
import { GAME_DETAILS, GAMES, isGame, type Game } from '../codes/constants';
import { StaleGameSubscriptionError, type GameSubscription } from '../codes/store';
import botConfig from '../utils/yaml';

export type SetupInteraction =
	| StringSelectMenuInteraction
	| ChannelSelectMenuInteraction
	| RoleSelectMenuInteraction
	| ButtonInteraction;

interface PanelNotice {
	kind: 'success' | 'warning' | 'error';
	message: string;
}

export async function createSetupPanel(
	guildId: string,
	interaction: { client: SetupInteraction['client'] },
	selectedGame?: Game,
	notice?: PanelNotice,
) {
	const routes = interaction.client.codeService.listGuildSubscriptions(guildId);
	const activeGame = selectedGame ?? GAMES.find((game) => routes.some((route) => route.game === game)) ?? 'genshin';
	const activeRoute = routes.find((route) => route.game === activeGame);
	const embed = new EmbedBuilder()
		.setTitle('Code announcement setup')
		.setDescription([
			'Configure a channel and optional ping role for each game. Changes apply immediately.',
			notice ? formatNotice(notice) : null,
		].filter(Boolean).join('\n\n'))
		.setColor(botConfig.colors.primary)
		.addFields(GAMES.map((game) => gameField(game, routes.find((route) => route.game === game), game === activeGame)))
		.setFooter({ text: `Editing ${GAME_DETAILS[activeGame].name}` })
		.setTimestamp();

	const gameSelect = new StringSelectMenuBuilder()
		.setCustomId('setup:game')
		.setPlaceholder('Choose a game to configure')
		.addOptions(GAMES.map((game) => new StringSelectMenuOptionBuilder()
			.setLabel(GAME_DETAILS[game].name)
			.setValue(game)
			.setDefault(game === activeGame)
			.setDescription(routeDescription(routes.find((route) => route.game === game)))));

	const channelSelect = new ChannelSelectMenuBuilder()
		.setCustomId(`setup:channel:${activeGame}:${activeRoute?.revision ?? 0}`)
		.setPlaceholder(`Choose a channel for ${GAME_DETAILS[activeGame].name}`)
		.setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
		.setMinValues(1)
		.setMaxValues(1);
	if (activeRoute) channelSelect.setDefaultChannels(activeRoute.channelId);

	const roleSelect = new RoleSelectMenuBuilder()
		.setCustomId(`setup:role:${activeGame}:${activeRoute?.revision ?? 0}`)
		.setPlaceholder('Choose an optional ping role')
		.setMinValues(1)
		.setMaxValues(1)
		.setDisabled(!activeRoute);
	if (activeRoute?.roleId) roleSelect.setDefaultRoles(activeRoute.roleId);

	const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(`setup:clear-role:${activeGame}:${activeRoute?.revision ?? 0}`)
			.setLabel('Clear role')
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(!activeRoute?.roleId),
		new ButtonBuilder()
			.setCustomId(`setup:disable:${activeGame}:${activeRoute?.revision ?? 0}`)
			.setLabel('Disable game')
			.setStyle(ButtonStyle.Danger)
			.setDisabled(!activeRoute?.enabled),
	);

	return {
		embeds: [embed],
		components: [
			new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(gameSelect),
			new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(channelSelect),
			new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(roleSelect),
			buttons,
		] as ActionRowBuilder<MessageActionRowComponentBuilder>[],
	};
}

export async function handleSetupInteraction(interaction: SetupInteraction): Promise<void> {
	if (!interaction.customId.startsWith('setup:')) return;

	await interaction.deferUpdate();

	if (!interaction.inGuild() || !interaction.guild) {
		await interaction.editReply({ content: 'This control panel only works in a server.', embeds: [], components: [] });
		return;
	}

	if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
		await interaction.editReply({ content: 'You need Manage Server to use this control panel.', embeds: [], components: [] });
		return;
	}

	if (interaction.isStringSelectMenu() && interaction.customId === 'setup:game') {
		const game = interaction.values[0];
		if (!isGame(game)) {
			await interaction.editReply({ content: 'That game is not supported.', embeds: [], components: [] });
			return;
		}
		await interaction.editReply(await createSetupPanel(interaction.guild.id, interaction, game));
		return;
	}

	const context = parseRouteContext(interaction.customId);
	if (!context) {
		await interaction.editReply({ content: 'This setup control is no longer valid.', embeds: [], components: [] });
		return;
	}

	try {
		if (interaction.isChannelSelectMenu()) {
			await configureChannel(interaction, interaction.guild, context.game, context.revision);
			return;
		}

		if (interaction.isRoleSelectMenu()) {
			await configureRole(interaction, interaction.guild, context.game, context.revision);
			return;
		}

		if (interaction.isButton() && interaction.customId.startsWith('setup:clear-role:')) {
			await interaction.client.codeService.updateGameRole(
				interaction.guild.id,
				context.game,
				null,
				context.revision,
			);
			await interaction.editReply(await createSetupPanel(interaction.guild.id, interaction, context.game, {
				kind: 'success',
				message: `${GAME_DETAILS[context.game].name} will no longer ping a role.`,
			}));
			return;
		}

		if (interaction.isButton() && interaction.customId.startsWith('setup:disable:')) {
			await interaction.client.codeService.disableGame(
				interaction.guild.id,
				context.game,
				context.revision,
			);
			await interaction.editReply(await createSetupPanel(interaction.guild.id, interaction, context.game, {
				kind: 'success',
				message: `${GAME_DETAILS[context.game].name} announcements are disabled. Delivery history was preserved.`,
			}));
		}
	} catch (error) {
		if (error instanceof StaleGameSubscriptionError) {
			await interaction.editReply(await createSetupPanel(interaction.guild.id, interaction, context.game, {
				kind: 'warning',
				message: 'This panel was out of date, so no changes were applied. Review the latest settings and try again.',
			}));
			return;
		}
		throw error;
	}
}

async function configureChannel(
	interaction: ChannelSelectMenuInteraction,
	guild: Guild,
	game: Game,
	expectedRevision: number,
): Promise<void> {
	const channelId = interaction.values[0];
	const channel = channelId ? await guild.channels.fetch(channelId) : null;

	if (!channel || (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)) {
		await renderError(interaction, game, 'Choose a text or announcement channel from this server.');
		return;
	}

	const target = channel as TextChannel | NewsChannel;
	const permissions = target.permissionsFor(interaction.client.user);
	if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageWebhooks])) {
		await renderError(interaction, game, 'I need View Channel and Manage Webhooks in that channel.');
		return;
	}

	const webhook = await target.createWebhook({
		name: botConfig.codes.webhookName,
		reason: `Configured by ${interaction.user.tag}`,
	});
	if (!webhook.token) {
		await webhook.delete('Webhook token was unavailable').catch(() => {});
		await renderError(interaction, game, 'Discord did not return a usable webhook. Try another channel.');
		return;
	}

	const result = await interaction.client.codeService.configureGame({
		guildId: guild.id,
		game,
		channelId: target.id,
		webhookId: webhook.id,
		webhookToken: webhook.token,
		expectedRevision,
	}).catch(async (error) => {
		await webhook.delete('Setup failed before configuration completed').catch(() => {});
		throw error;
	});
	const warnings = [
			result.refreshFailed ? 'The latest codes could not be refreshed yet.' : null,
			result.deliveryFailed ? 'Initial delivery failed and will retry automatically.' : null,
	].filter(Boolean).join(' ');

	await interaction.editReply(await createSetupPanel(guild.id, interaction, game, {
		kind: warnings ? 'warning' : 'success',
		message: warnings || `${GAME_DETAILS[game].name} will post in <#${target.id}>.`,
	}));
}

async function configureRole(
	interaction: RoleSelectMenuInteraction,
	guild: Guild,
	game: Game,
	expectedRevision: number,
): Promise<void> {
	const route = interaction.client.codeService
		.listGuildSubscriptions(guild.id)
		.find((subscription) => subscription.game === game);
	if (!route) {
		await renderError(interaction, game, 'Choose a channel before adding a ping role.');
		return;
	}

	const roleId = interaction.values[0];
	const role = roleId ? await guild.roles.fetch(roleId) : null;
	if (!role || role.id === guild.id || !role.mentionable) {
		await renderError(interaction, game, 'Choose a mentionable role other than @everyone.');
		return;
	}

	await interaction.client.codeService.updateGameRole(guild.id, game, role.id, expectedRevision);
	await interaction.editReply(await createSetupPanel(guild.id, interaction, game, {
		kind: 'success',
		message: `${role} will be pinged for new ${GAME_DETAILS[game].name} codes.`,
	}));
}

async function renderError(interaction: SetupInteraction, game: Game, message: string): Promise<void> {
	if (!interaction.guildId) return;
	await interaction.editReply(await createSetupPanel(interaction.guildId, interaction, game, {
		kind: 'error',
		message,
	}));
}

function gameField(game: Game, route: GameSubscription | undefined, selected: boolean) {
	const status = !route ? 'Not configured' : route.enabled ? 'Active' : 'Paused';
	const lines = [
		`**Status:** ${status}`,
		`**Channel:** ${route ? `<#${route.channelId}>` : 'Not set'}`,
		`**Ping role:** ${route?.roleId ? `<@&${route.roleId}>` : 'None'}`,
	];
	if (route?.lastError) lines.push(`**Issue:** ${sanitize(route.lastError)}`);

	return {
		name: `${selected ? '› ' : ''}${GAME_DETAILS[game].name}`,
		value: lines.join('\n'),
		inline: false,
	};
}

function routeDescription(route: GameSubscription | undefined): string {
	if (!route) return 'Not configured';
	return route.enabled ? 'Active' : 'Paused — choose a channel to repair';
}

function formatNotice(notice: PanelNotice): string {
	const label = notice.kind === 'success' ? 'Updated' : notice.kind === 'warning' ? 'Attention' : 'Could not update';
	return `**${label}:** ${sanitize(notice.message)}`;
}

function parseRouteContext(customId: string): { game: Game; revision: number } | null {
	const parts = customId.split(':');
	const game = parts.at(-2);
	const revision = Number(parts.at(-1));
	return isGame(game) && Number.isSafeInteger(revision) && revision >= 0
		? { game, revision }
		: null;
}

function sanitize(value: string): string {
	return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
}

export function isSetupInteraction(interaction: { customId?: string }): boolean {
	return interaction.customId?.startsWith('setup:') ?? false;
}
