import type { Command } from '../types/Command';
import about from './about';
import ping from './ping';
import setup from './setup';

const commands: Command[] = [ping, about, setup];

export default commands;
