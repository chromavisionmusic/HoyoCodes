import type { Command } from '../types/Command';
import about from './about';
import ping from './ping';

const commands: Command[] = [ping, about];

export default commands;
