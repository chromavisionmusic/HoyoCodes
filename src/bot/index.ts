import {
	Client,
	Collection,
	Events,
	GatewayIntentBits,
	MessageFlags,
	type InteractionReplyOptions,
} from 'discord.js';
import commands from './commands';
import type { Command } from './types/Command';
import env from './utils/env';

const client = new Client({
	intents: [GatewayIntentBits.Guilds],
});

client.commands = new Collection<string, Command>();

for (const command of commands) {
	client.commands.set(command.data.name, command);
}

client.once(Events.ClientReady, (readyClient) => {
	console.log(`Ready! Logged in as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
	if (!interaction.isChatInputCommand()) return;

	const command = client.commands.get(interaction.commandName);

	if (!command) {
		console.warn(`No command matching "${interaction.commandName}" was found.`);
		return;
	}

	try {
		await command.execute(interaction);
	} catch (error) {
		console.error(`Error executing "${interaction.commandName}":`, error);

		const reply: InteractionReplyOptions = {
			content: 'There was an error while executing this command!',
			flags: MessageFlags.Ephemeral,
		};

		if (interaction.replied || interaction.deferred) {
			await interaction.followUp(reply);
		} else {
			await interaction.reply(reply);
		}
	}
});

let shuttingDown = false;

async function shutdown(): Promise<void> {
	if (shuttingDown) return;
	shuttingDown = true;

	console.log('Shutting down...');
	await client.destroy();
	process.exit(0);
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

client.login(env.botToken).catch((error) => {
	console.error('Failed to log in:', error);
	process.exit(1);
});
