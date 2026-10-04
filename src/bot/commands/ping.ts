import {
	EmbedBuilder,
	SlashCommandBuilder,
	type ChatInputCommandInteraction,
} from 'discord.js';
import type { Command } from '../types/Command';
import botConfig from '../utils/yaml';

const command: Command = {
	data: new SlashCommandBuilder()
		.setName('ping')
		.setDescription('Check bot latency'),

	async execute(interaction: ChatInputCommandInteraction): Promise<void> {
		const start = performance.now();

		await interaction.reply({ content: 'Pinging...' });

		const roundtrip = Math.round(performance.now() - start);

		const embed = new EmbedBuilder()
			.setTitle('Latency')
			.addFields(
				{ name: 'WebSocket', value: `\`${interaction.client.ws.ping}ms\``, inline: true },
				{ name: 'Roundtrip', value: `\`${roundtrip}ms\``, inline: true },
			)
			.setColor(botConfig.colors.primary)
			.setTimestamp();

		await interaction.editReply({ content: null, embeds: [embed] });
	},
};

export default command;
