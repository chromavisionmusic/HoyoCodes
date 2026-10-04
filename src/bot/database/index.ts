import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { runMigrations } from './migrations';

export function openDatabase(path: string): Database {
	if (path !== ':memory:') {
		mkdirSync(dirname(resolve(path)), { recursive: true });
	}

	const database = new Database(path, { create: true, strict: true });
	database.exec('PRAGMA foreign_keys = ON');
	database.exec('PRAGMA busy_timeout = 5000');

	if (path !== ':memory:') {
		database.exec('PRAGMA journal_mode = WAL');
	}

	runMigrations(database);
	return database;
}
