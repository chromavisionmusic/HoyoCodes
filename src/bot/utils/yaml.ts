import { YAML } from "bun";

const file = Bun.file("./config.yml");

const data = await file.text();
const botConfig = YAML.parse(data) as Record<string, unknown>;

export default botConfig;
