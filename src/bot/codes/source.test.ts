import { describe, expect, test } from 'bun:test';
import { CodeSourceClient, parseCodeResponse } from './source';

const response = {
	game: 'genshin',
	codes: [
		{ id: 1, code: ' testcode ', status: 'OK', game: 'genshin', rewards: 'Primogem*60' },
		{ id: 2, code: 'TESTCODE', status: 'OK', game: 'genshin', rewards: 'Updated rewards' },
	],
};

describe('code source', () => {
	test('normalizes and deduplicates valid codes', () => {
		expect(parseCodeResponse(response, 'genshin')).toEqual([{
			game: 'genshin',
			codeKey: 'TESTCODE',
			displayCode: 'TESTCODE',
			rewards: 'Updated rewards',
		}]);
	});

	test('rejects malformed entries and wrong games', () => {
		expect(() => parseCodeResponse({ game: 'genshin', codes: [{ code: 'CODE' }] }, 'genshin')).toThrow();
		expect(() => parseCodeResponse(response, 'hkrpg')).toThrow();
	});

	test('rejects non-success responses', async () => {
		const client = new CodeSourceClient({
			baseUrl: 'https://example.com/codes',
			timeoutMs: 1_000,
			fetch: async () => new Response(null, { status: 503 }),
		});

		await expect(client.fetchCodes('genshin')).rejects.toThrow('HTTP 503');
	});
});
