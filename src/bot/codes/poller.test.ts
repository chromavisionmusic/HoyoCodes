import { describe, expect, test } from 'bun:test';
import type { CodeService } from './service';
import { CodePoller } from './poller';

function deferred(): { promise: Promise<void>; resolve: () => void } {
	let resolve = () => {};
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

describe('code poller', () => {
	test('does not overlap cycles and waits for shutdown', async () => {
		const cycle = deferred();
		let calls = 0;
		const service = {
			runCycle: async () => {
				calls += 1;
				await cycle.promise;
			},
		} as unknown as CodeService;
		const poller = new CodePoller(service, 1);

		poller.start();
		await Promise.resolve();
		expect(calls).toBe(1);

		let stopped = false;
		const stopping = poller.stop().then(() => {
			stopped = true;
		});
		await Promise.resolve();
		expect(stopped).toBe(false);
		expect(calls).toBe(1);

		cycle.resolve();
		await stopping;
		expect(stopped).toBe(true);
		expect(calls).toBe(1);
	});
});
