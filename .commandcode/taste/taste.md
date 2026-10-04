# Taste

## Tooling
- Uses Bun as the runtime and package manager for JS/TS projects and prefers Bun-native tooling/scripts. Confidence: 0.8

## Project structure
- Prefers splitting a project into separate packages by concern (e.g., a bot package and a web package) rather than one flat project. Confidence: 0.5

## Code architecture
- Prefers production-friendly, scalable wiring where new units (e.g., commands, handlers) can be added with minimal effort — extension points/registries over quick one-off glue. Confidence: 0.5

## Build & delivery
- Prefers ship-ready apps as a single compiled binary named after the app (via `bun build --compile`). Confidence: 0.5

## Web stack
- Prefers full-stack Next.js for website/web-app deliverables. Confidence: 0.6
