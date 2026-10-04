import { REST, Routes } from 'discord.js';
import commands from './commands';
import env from './utils/env';

const rest = new REST().setToken(env.botToken);

const route = env.devGuildId
	? Routes.applicationGuildCommands(env.botId, env.devGuildId)
	: Routes.applicationCommands(env.botId);

try {
	console.log(`Refreshing ${commands.length} application (/) commands...`);

	const data = (await rest.put(route, {
		body: commands.map((command) => command.data.toJSON()),
	})) as unknown[];

	console.log(`Successfully reloaded ${data.length} application (/) commands.`);
} catch (error) {
	console.error('Failed to reload application commands:', error);
	process.exit(1);
}
