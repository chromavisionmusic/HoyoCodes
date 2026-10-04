import {
	SlashCommandBuilder,
	ChatInputCommandInteraction,
} from 'discord.js';
import type { Command } from '../types/Command';

const command: Command = {
	data: new SlashCommandBuilder()
		.setName('ping')
		.setDescription('Replies with Pong!'),

	async execute(interaction: ChatInputCommandInteraction): Promise<void> {
		await interaction.reply('Pong!');
	},
};

export default command;
