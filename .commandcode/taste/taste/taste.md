# Taste
- Uses Bun as the runtime and package manager for JS/TS projects and prefers Bun-native tooling/scripts. Confidence: 0.8
- Prefers splitting a project into separate packages by concern (e.g., a bot package and a web package) rather than one flat project. Confidence: 0.5
- Prefers production-friendly, scalable wiring where new units (e.g., commands, handlers) can be added with minimal effort — extension points/registries over quick one-off glue. Confidence: 0.5
- Prefers ship-ready apps as a single compiled binary named after the app (via `bun build --compile`). Confidence: 0.5
- Prefers full-stack Next.js for website/web-app deliverables. Confidence: 0.6
- Builds Discord bot features with discord.js in TypeScript; expects slash commands to reply with rich embeds (bot avatar thumbnail, inline stat fields) and link buttons (website, support server, invite). Confidence: 0.7
- States feature requests tersely as a short bulleted requirement list, expecting implementation without further discussion. Confidence: 0.4
