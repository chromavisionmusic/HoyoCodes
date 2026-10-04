import env from './env';
import botConfig from './yaml';

const clientId = env.botId;
const permissionInt = botConfig.links.invite.permissions;

export function generateInviteUrl(): string {
	return `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=${permissionInt}&integration_type=0&scope=bot+applications.commands`;
}
