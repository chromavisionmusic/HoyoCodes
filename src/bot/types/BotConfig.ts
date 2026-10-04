export interface BotConfig {
	name: string;
	version: string;
	description: string;
	developers: {
		name: string;
		uid: string;
	}[];
	colors: {
		primary: number;
	};
	codes: {
		apiUrl: string;
		pollIntervalMs: number;
		requestTimeoutMs: number;
		deliveryConcurrency: number;
		webhookName: string;
	};
	links: {
		website: string | null;
		github: string;
		issue: string;
		discord: string;
		invite: {
			url: string;
			permissions: number;
		};
  };
  logo: {
    genshin: string;
    hsr: string;
    zzz: string;
  };
}
