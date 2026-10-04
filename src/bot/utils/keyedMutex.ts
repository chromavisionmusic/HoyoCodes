export class KeyedMutex<Key> {
	private readonly tails = new Map<Key, Promise<void>>();

	async runExclusive<Result>(key: Key, operation: () => Promise<Result>): Promise<Result> {
		const previous = this.tails.get(key) ?? Promise.resolve();
		let release = () => {};
		const current = new Promise<void>((resolve) => {
			release = resolve;
		});
		this.tails.set(key, current);

		await previous.catch(() => {});

		try {
			return await operation();
		} finally {
			release();
			if (this.tails.get(key) === current) this.tails.delete(key);
		}
	}
}
