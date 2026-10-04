declare module '*.yml' {
	const config: import('./BotConfig').BotConfig;
	export default config;
}
