import { isGame, normalizeCode, type Game } from './constants';

export interface SourceCode {
	game: Game;
	codeKey: string;
	displayCode: string;
	rewards: string;
}

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

interface SourceClientOptions {
	baseUrl: string;
	timeoutMs: number;
	fetch?: Fetcher;
}

export class CodeSourceClient {
	private readonly baseUrl: string;
	private readonly timeoutMs: number;
	private readonly fetcher: Fetcher;

	constructor(options: SourceClientOptions) {
		this.baseUrl = options.baseUrl;
		this.timeoutMs = options.timeoutMs;
		this.fetcher = options.fetch ?? fetch;
	}

	async fetchCodes(game: Game, signal?: AbortSignal): Promise<SourceCode[]> {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(new Error('Code source request timed out')), this.timeoutMs);
		const abort = () => controller.abort(signal?.reason);
		signal?.addEventListener('abort', abort, { once: true });

		try {
			const url = new URL(this.baseUrl);
			url.searchParams.set('game', game);

			const response = await this.fetcher(url, { signal: controller.signal });
			if (!response.ok) {
				throw new Error(`Code source returned HTTP ${response.status}`);
			}

			return parseCodeResponse(await response.json(), game);
		} finally {
			clearTimeout(timeout);
			signal?.removeEventListener('abort', abort);
		}
	}
}

export function parseCodeResponse(value: unknown, expectedGame: Game): SourceCode[] {
	if (!isRecord(value) || value.game !== expectedGame || !Array.isArray(value.codes)) {
		throw new Error(`Invalid code source response for ${expectedGame}`);
	}

	const codes = new Map<string, SourceCode>();

	for (const item of value.codes) {
		if (
			!isRecord(item)
			|| typeof item.id !== 'number'
			|| item.status !== 'OK'
			|| item.game !== expectedGame
			|| typeof item.code !== 'string'
			|| typeof item.rewards !== 'string'
		) {
			throw new Error(`Invalid code entry for ${expectedGame}`);
		}

		const displayCode = item.code.trim().normalize('NFKC');
		const codeKey = normalizeCode(displayCode);
		if (!codeKey || codeKey.length > 128 || item.rewards.length > 2_000) {
			throw new Error(`Invalid code entry for ${expectedGame}`);
		}

		codes.set(codeKey, {
			game: expectedGame,
			codeKey,
			displayCode,
			rewards: item.rewards.trim(),
		});
	}

	return [...codes.values()];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
