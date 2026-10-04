import {
	Client,
	Collection,
	DiscordAPIError,
	Events,
	GatewayIntentBits,
	MessageFlags,
	type InteractionReplyOptions,
} from 'discord.js';
import commands from './commands';
import { CodeDeliveryService } from './codes/delivery';
import { CodePoller } from './codes/poller';
import { CodeService } from './codes/service';
import { CodeSourceClient } from './codes/source';
import { CodeStore } from './codes/store';
import { openDatabase } from './database';
import { handleSetupInteraction, isSetupInteraction } from './setup/panel';
import type { Command } from './types/Command';
import env from './utils/env';
import botConfig from './utils/yaml';

const database = openDatabase(env.databasePath);
const store = new CodeStore(database);
const source = new CodeSourceClient({
	baseUrl: botConfig.codes.apiUrl,
	timeoutMs: botConfig.codes.requestTimeoutMs,
});
const delivery = new CodeDeliveryService({ store });
const codeService = new CodeService({
	store,
	source,
	delivery,
	deliveryConcurrency: botConfig.codes.deliveryConcurrency,
});
const poller = new CodePoller(codeService, botConfig.codes.pollIntervalMs);

const client = new Client({
	intents: [GatewayIntentBits.Guilds],
});

client.commands = new Collection<string, Command>();
client.codeService = codeService;

for (const command of commands) {
	client.commands.set(command.data.name, command);
}

client.once(Events.ClientReady, (readyClient) => {
	console.log(`Ready! Logged in as ${readyClient.user.tag}`);
	poller.start();
});

client.on(Events.InteractionCreate, async (interaction) => {
	try {
		if (
			(
				interaction.isStringSelectMenu()
				|| interaction.isChannelSelectMenu()
				|| interaction.isRoleSelectMenu()
				|| interaction.isButton()
			)
			&& isSetupInteraction(interaction)
		) {
			await handleSetupInteraction(interaction);
			return;
		}

		if (!interaction.isChatInputCommand()) return;

		const command = client.commands.get(interaction.commandName);
		if (!command) {
			console.warn(`No command matching "${interaction.commandName}" was found.`);
			return;
		}

		await command.execute(interaction);
	} catch (error) {
		const name = interaction.isChatInputCommand()
			? interaction.commandName
			: interaction.isMessageComponent()
				? interaction.customId
				: 'interaction';
		if (error instanceof DiscordAPIError && error.code === 10_062) {
			console.warn(`Discord expired interaction "${name}" before it could be acknowledged. Check for duplicate bot processes or gateway delays.`);
			return;
		}

		console.error(`Error executing "${name}":`, error);

		if (!interaction.isRepliable()) return;

		const reply: InteractionReplyOptions = {
			content: 'There was an error while processing this interaction!',
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
	await poller.stop();
	database.close();
	client.destroy();
	process.exit(0);
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

client.login(env.botToken).catch((error) => {
	console.error('Failed to log in:', error);
	process.exit(1);
});
