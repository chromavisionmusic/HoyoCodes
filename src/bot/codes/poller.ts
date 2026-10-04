import type { CodeService } from './service';

export class CodePoller {
	private timer: ReturnType<typeof setTimeout> | null = null;
	private controller: AbortController | null = null;
	private inFlight: Promise<void> | null = null;
	private stopped = true;

	constructor(
		private readonly service: CodeService,
		private readonly intervalMs: number,
	) {}

	start(): void {
		if (!this.stopped) return;
		this.stopped = false;
		this.controller = new AbortController();
		void this.runCycle();
	}

	async stop(): Promise<void> {
		if (this.stopped) return;
		this.stopped = true;

		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}

		this.controller?.abort(new Error('Code poller stopped'));
		await this.inFlight?.catch(() => {});
		this.controller = null;
	}

	private async runCycle(): Promise<void> {
		if (this.stopped || !this.controller) return;

		const operation = this.service.runCycle(this.controller.signal);
		this.inFlight = operation;

		try {
			await operation;
		} catch (error) {
			if (!this.controller.signal.aborted) {
				console.error('Code polling cycle failed:', error);
			}
		} finally {
			if (this.inFlight === operation) this.inFlight = null;
		}

		if (!this.stopped) {
			this.timer = setTimeout(() => {
				this.timer = null;
				void this.runCycle();
			}, this.intervalMs);
		}
	}
}
