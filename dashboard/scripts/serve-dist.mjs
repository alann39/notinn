import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const host = option("--host", "127.0.0.1");
const port = Number(option("--port", "4173"));
const distRoot = resolve(fileURLToPath(new URL("../dist", import.meta.url)));

const contentTypes = {
  ".avif": "image/avif",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".xml": "application/xml; charset=utf-8",
};

const appRoute = /^(?:\/login|\/auth\/callback|\/notes(?:\/.*)?|\/usage|\/settings|\/admin(?:\/.*)?)\/?$/;

function routeFile(pathname) {
  if (pathname === "/") return "index.html";
  if (pathname === "/privacy" || pathname === "/privacy/") return "privacy/index.html";
  if (pathname === "/terms" || pathname === "/terms/") return "terms/index.html";
  if (appRoute.test(pathname)) return "app.html";
  if (pathname === "/sitemap.xml") return "sitemap.xml";
  if (pathname === "/robots.txt") return "robots.txt";
  const assetPath = pathname.replace(/^\/+/, "");
  const assetFile = safeFilePath(assetPath);
  if (assetFile && existsSync(assetFile) && statSync(assetFile).isFile()) return assetPath;
  if (pathname.endsWith(".html")) return assetPath;
  return `${assetPath.replace(/\/$/, "")}.html`;
}

function safeFilePath(relativePath) {
  const candidate = resolve(distRoot, relativePath);
  if (candidate !== distRoot && !candidate.startsWith(`${distRoot}${sep}`)) return null;
  return candidate;
}

function parseMediaRange(value, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2]) || size === 0) return null;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
    (match[1] && start >= size) || start > end ||
    (!match[1] && Number(match[2]) === 0)) return null;
  return { start, end };
}

const server = createServer((request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end();
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url ?? "/", `http://${host}`).pathname);
  } catch {
    response.writeHead(400);
    response.end("Bad request");
    return;
  }

  const filePath = safeFilePath(routeFile(pathname));
  if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const isMedia = extname(filePath) === ".mp4";
  const size = statSync(filePath).size;
  const range = isMedia && request.headers.range
    ? parseMediaRange(request.headers.range, size)
    : null;
  if (isMedia && request.headers.range && !range) {
    response.writeHead(416, {
      "Accept-Ranges": "bytes",
      "Content-Range": `bytes */${size}`,
      "Content-Length": "0",
    });
    response.end();
    return;
  }
  response.writeHead(range ? 206 : 200, {
    "Cache-Control": "no-store",
    "Content-Type": contentTypes[extname(filePath)] ?? "application/octet-stream",
    "Content-Length": range ? range.end - range.start + 1 : size,
    ...(isMedia ? { "Accept-Ranges": "bytes" } : {}),
    ...(range ? { "Content-Range": `bytes ${range.start}-${range.end}/${size}` } : {}),
    "X-Content-Type-Options": "nosniff",
  });

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  createReadStream(filePath, range ?? undefined).pipe(response);
});

server.listen(port, host, () => {
  console.log(`Notinn preview listening on http://${host}:${port}`);
});
