// Runs test/browser/index.html in a real headless browser and reports the
// results. The page POSTs its results back to this server, so no browser
// automation dependency is needed.
//
//   node test/browser/run.js [--browser <command>] [--timeout <ms>]
//
// The browser defaults to $BROWSER, then the first of firefox, chromium,
// chromium-browser or google-chrome found on PATH.

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, statSync, readFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { basename, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};

const timeoutMs = Number(option("--timeout") || 60000);
const browser = option("--browser") || process.env.BROWSER || findBrowser();

if (!browser) {
  console.error("No browser found. Pass --browser <command> or set BROWSER.");
  process.exit(2);
}

function findBrowser() {
  const candidates = ["firefox", "chromium", "chromium-browser", "google-chrome"];
  for (const dir of (process.env.PATH || "").split(":")) {
    for (const name of candidates) {
      const path = join(dir, name);
      if (existsSync(path)) return path;
    }
  }
  return null;
}

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8"
};

let finish;
const results = new Promise((resolvePromise) => {
  finish = resolvePromise;
});

const server = createServer((request, response) => {
  if (request.method === "POST" && request.url === "/__results") {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      response.end("ok");
      finish(JSON.parse(body));
    });
    return;
  }

  const path = normalize(join(root, decodeURIComponent(new URL(request.url, "http://x").pathname)));
  if (!path.startsWith(root) || !existsSync(path) || !statSync(path).isFile()) {
    response.statusCode = 404;
    response.end();
    return;
  }

  response.setHeader("Content-Type", types[extname(path)] || "application/octet-stream");
  response.setHeader("Cache-Control", "no-store");
  response.end(readFileSync(path));
});

await new Promise((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
const url = `http://127.0.0.1:${server.address().port}/test/browser/index.html`;

const profile = mkdtempSync(join(tmpdir(), "crossframe-browser-"));
const isFirefox = basename(browser).includes("firefox");
const browserArgs = isFirefox
  ? ["--headless", "--no-remote", "--profile", profile, "--window-size=1024,768", url]
  : ["--headless=new", `--user-data-dir=${profile}`, "--no-first-run", "--window-size=1024,768", url];

const child = spawn(browser, browserArgs, { stdio: "ignore", detached: true });
let browserExited = false;
child.on("exit", () => {
  browserExited = true;
});

const timer = setTimeout(() => finish({ timedOut: true }), timeoutMs);
const outcome = await results;
clearTimeout(timer);

if (!browserExited) {
  const exited = new Promise((resolvePromise) => child.once("exit", resolvePromise));
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
  await Promise.race([exited, new Promise((resolvePromise) => setTimeout(resolvePromise, 5000))]);
}
child.unref();
server.close();
rmSync(profile, { recursive: true, force: true });

if (outcome.timedOut) {
  console.error(`Timed out after ${timeoutMs} ms waiting for ${url} in ${browser}`);
  process.exit(1);
}

console.log(`# ${outcome.userAgent}`);
let failed = 0;
for (const result of outcome.results) {
  if (result.ok) {
    console.log(`ok - ${result.name}`);
  } else {
    failed += 1;
    console.log(`not ok - ${result.name}\n  ${String(result.error).replace(/\n/g, "\n  ")}`);
  }
}
console.log(`# ${outcome.results.length - failed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
