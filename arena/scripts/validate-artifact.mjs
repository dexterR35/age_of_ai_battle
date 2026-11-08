import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const workerPath = resolve(projectRoot, "dist/server/index.js");
const manifestPath = resolve(projectRoot, "dist/.openai/hosting.json");

const [source, manifest] = await Promise.all([
  readFile(workerPath, "utf8"),
  readFile(manifestPath, "utf8"),
]);
JSON.parse(manifest);

// A data URL forces ESM parsing even though the generated output has no package.json.
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const workerModule = await import(moduleUrl);
assert.equal(
  typeof workerModule.default?.fetch,
  "function",
  `${pathToFileURL(workerPath)} must export default.fetch`,
);

console.log("Artifact is valid ESM and exports default.fetch");
const page=await workerModule.default.fetch(new Request('https://fixture.example/'),{});
assert.equal(page.status,200);
const html=await page.text();
assert.match(html,/<div id="root"><\/div>/);
const urls=[...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)].map(m=>m[1]);
assert.ok(urls.some(url=>url.endsWith('.js')),'React build must include a hashed JavaScript entry');
assert.ok(urls.some(url=>url.endsWith('.css')),'React build must include CSS');
for(const url of urls){const response=await workerModule.default.fetch(new Request('https://fixture.example'+url),{});assert.equal(response.status,200);}
const removed=await workerModule.default.fetch(new Request('https://fixture.example/app.mjs'),{});
assert.equal(removed.status,404,'The legacy app entry must not be served');
console.log('Vite React entry, hashed assets and removal of the legacy app verified.');
