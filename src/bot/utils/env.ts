function requireEnv(name: string): string {
	const value = process.env[name];

	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`);
	}

	return value;
}

const env = {
	botToken: requireEnv('BOT_TOKEN'),
	botId: requireEnv('BOT_ID'),
	devGuildId: process.env.DEV_GUILD_ID,
	databasePath: process.env.DATABASE_PATH ?? './data/hoyocodes.sqlite',
};

export default env;
