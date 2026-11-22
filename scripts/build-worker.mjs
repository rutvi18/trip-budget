import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const template = readFileSync(join(root, "worker/index.js"), "utf8");
const assets = {
  "__INDEX_HTML__": readFileSync(join(root, "index.html"), "utf8"),
  "__STYLES_CSS__": readFileSync(join(root, "styles.css"), "utf8"),
  "__APP_JS__": readFileSync(join(root, "app.js"), "utf8")
};

let output = template;
for (const [placeholder, value] of Object.entries(assets)) {
  const token = JSON.stringify(placeholder);
  if (!output.includes(token)) throw new Error(`Missing build placeholder: ${placeholder}`);
  output = output.replace(token, JSON.stringify(value));
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, "server"), { recursive: true });
mkdirSync(join(dist, ".openai"), { recursive: true });
writeFileSync(join(dist, "server/index.js"), output);
cpSync(join(root, ".openai/hosting.json"), join(dist, ".openai/hosting.json"));
console.log("Built shared-savings Worker in dist/");
