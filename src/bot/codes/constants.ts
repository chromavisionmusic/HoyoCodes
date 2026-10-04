export const GAMES = ['genshin', 'hkrpg', 'nap'] as const;

export type Game = (typeof GAMES)[number];

export const GAME_DETAILS: Record<Game, { name: string; color: number }> = {
	genshin: { name: 'Genshin Impact', color: 0x382c50 },
	hkrpg: { name: 'Honkai: Star Rail', color: 0x80f4ff },
	nap: { name: 'Zenless Zone Zero', color: 0xf07b10 },
};

export function isGame(value: unknown): value is Game {
	return typeof value === 'string' && GAMES.includes(value as Game);
}

export function normalizeCode(code: string): string {
	return code.trim().normalize('NFKC').toUpperCase();
}
