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
```

Cross-compile for other platforms with the `build:linux`, `build:macos`, and `build:windows` scripts in `src/bot/package.json`.

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
