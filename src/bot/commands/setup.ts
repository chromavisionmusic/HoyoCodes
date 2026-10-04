import {
	MessageFlags,
	PermissionFlagsBits,
	SlashCommandBuilder,
	type ChatInputCommandInteraction,
} from 'discord.js';
import { createSetupPanel } from '../setup/panel';
import type { Command } from '../types/Command';

const command: Command = {
	data: new SlashCommandBuilder()
		.setName('setup')
		.setDescription('Configure automatic HoYoverse code announcements')
		.setDMPermission(false)
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

	async execute(interaction: ChatInputCommandInteraction): Promise<void> {
		if (!interaction.inGuild() || !interaction.guild) {
			await interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
			return;
		}

		if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
			await interaction.reply({ content: 'You need `Manage Server` permission to use this command.', flags: MessageFlags.Ephemeral });
			return;
		}

		await interaction.reply({
			...(await createSetupPanel(interaction.guildId, interaction)),
			flags: MessageFlags.Ephemeral,
		});
	},
};

export default command;
