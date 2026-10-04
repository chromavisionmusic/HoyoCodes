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
}
