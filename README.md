# hoyocodes

A Discord bot that automatically sends active HoYoverse redeem codes to your server, so your community never misses a new code.

This repo is a [Bun workspace](https://bun.com/docs/pm/workspaces) with two packages:

- **`src/bot`** — the Discord bot, compiled to a single executable named `bot`
- **`src/web`** — the Next.js website for the bot

## Setup

```bash
bun install
```

## Bot

```bash
bun run bot:dev     # run in watch mode
bun run bot:build   # compile to bin/bot (bin/bot.exe on Windows)
bun run bot:deploy  # register slash commands with Discord
```

Cross-compile for other platforms with the `build:linux`, `build:macos`, and `build:windows` scripts in `src/bot/package.json`.

The bot stores guild subscriptions and delivered-code history in SQLite. Set `DATABASE_PATH` to a writable persistent location; it defaults to `./data/hoyocodes.sqlite` relative to the process working directory. Protect this file and its backups because it contains Discord webhook tokens.

### Adding a command

1. Create `src/bot/commands/<name>.ts` (copy `ping.ts` as a template).
2. Add it to the registry in `src/bot/commands/index.ts`.
3. Run `bun run bot:deploy` to register it with Discord — set `DEV_GUILD_ID` in `src/bot/.env` to deploy to a single dev server for instant updates.

Commands are imported statically so they get bundled into the compiled binary.

## Website

```bash
bun run web:dev     # dev server on http://localhost:3000
bun run web:build   # production build
bun run web:start   # serve the production build
```

## Running everything

```bash
bun run dev         # bot watcher + web dev server, in parallel
```
