import type { Collection } from 'discord.js';
import type { Command } from './Command';
import type { CodeService } from '../codes/service';

declare module 'discord.js' {
	interface Client {
		commands: Collection<string, Command>;
		codeService: CodeService;
	}
}
