import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
	SlashCommandBuilder,
	type ChatInputCommandInteraction,
} from 'discord.js';
import type { Command } from '../types/Command';
import { generateInviteUrl } from '../utils/links';
import botConfig from '../utils/yaml';
import type { BotConfig } from '../types/BotConfig';

const command: Command = {
	data: new SlashCommandBuilder()
		.setName('about')
		.setDescription('Learn more about the bot'),

	async execute(interaction: ChatInputCommandInteraction): Promise<void> {
		const { client } = interaction;

		const users = client.guilds.cache.reduce(
			(total, guild) => total + guild.memberCount,
			0,
    );

		const developers: BotConfig['developers'] = botConfig.developers;

		const embed = new EmbedBuilder()
			.setTitle(botConfig.name)
			.setDescription(botConfig.description)
			.setThumbnail(client.user.displayAvatarURL({ size: 256 }))
			.addFields(
				{ name: 'Version', value: `\`v${botConfig.version}\``, inline: true },
        { name: 'Latency', value: `\`${client.ws.ping}ms\``, inline: true },
				{ name: 'Developers', value: `${developers.map((d: BotConfig['developers'][number]) => `[${d.name}](https://discord.com/users/${d.uid})`).join(', ')}`, inline: true },
				{ name: 'Commands', value: `\`${client.commands.size}\``, inline: true },
				{ name: 'Users', value: `\`${users.toLocaleString('en-US')}\``, inline: true },
				{ name: 'Guilds', value: `\`${client.guilds.cache.size.toLocaleString('en-US')}\``, inline: true },
			)
			.setColor(botConfig.colors.primary)
			.setTimestamp();

		const buttons: ButtonBuilder[] = [];

		if (botConfig.links.website) {
			buttons.push(
				new ButtonBuilder()
					.setLabel('Website')
					.setStyle(ButtonStyle.Link)
					.setURL(botConfig.links.website),
			);
		}

		buttons.push(
			new ButtonBuilder()
				.setLabel('Server')
				.setStyle(ButtonStyle.Link)
				.setURL(botConfig.links.discord),
			new ButtonBuilder()
				.setLabel('Invite')
				.setStyle(ButtonStyle.Link)
				.setURL(generateInviteUrl()),
		);

		const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);

		await interaction.reply({ embeds: [embed], components: [row] });
	},
};

export default command;
