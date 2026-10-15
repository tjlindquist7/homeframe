import { chmod, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const appDirectory = process.cwd();
const envPath = path.join(appDirectory, ".env.local");
const wranglerPath = path.join(appDirectory, "dist", "server", "wrangler.json");
const runtimeKeys = [
  "NJT_BUS_USERNAME",
  "NJT_BUS_PASSWORD",
  "GOOGLE_MAPS_API_KEY",
  "GOOGLE_CALENDAR_ICAL_URL",
  "COMMUTE_ORIGIN",
  "COMMUTE_DESTINATION",
  "HOMEFRAME_CLOSE_FILE",
];

process.loadEnvFile(envPath);

const config = JSON.parse(await readFile(wranglerPath, "utf8"));
config.vars ??= {};

for (const key of runtimeKeys) {
  const value = process.env[key];
  if (value) config.vars[key] = value;
}

const compatibilityFlags = new Set(config.compatibility_flags ?? []);
compatibilityFlags.add("nodejs_compat");
compatibilityFlags.add("nodejs_compat_populate_process_env");
config.compatibility_flags = [...compatibilityFlags];

await writeFile(wranglerPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
await chmod(wranglerPath, 0o600);
console.log(`Configured HomeFrame runtime with ${Object.keys(config.vars).length} private setting(s).`);
