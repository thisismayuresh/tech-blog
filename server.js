import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Static file server for local development only.
 * GitHub Pages hosts the same files with no server — this exists so
 * fetch() works in the browser (file:// blocks it). No API routes:
 * the post list is posts-index.json, bodies are posts/*.md.
 */

const currentFilePath = fileURLToPath(import.meta.url);
const projectRoot = path.dirname(currentFilePath);

const PORT = Number(process.env.PORT) || 3000;

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
};

function sendText(response, statusCode, text) {
  const body = Buffer.from(text, 'utf8');
  response.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': body.length,
  });
  response.end(body);
}

function serveStaticFile(pathname, response) {
  const relativePath = pathname === '/' ? 'index.html' : pathname.slice(1);
  const resolvedPath = path.resolve(projectRoot, relativePath);

  const isInsideProject =
    resolvedPath === projectRoot || resolvedPath.startsWith(projectRoot + path.sep);

  if (!isInsideProject) {
    sendText(response, 403, 'Forbidden: that path is outside the project directory.');
    return;
  }

  if (!fs.existsSync(resolvedPath)) {
    sendText(response, 404, 'Not found: no file matches that address.');
    return;
  }

  const fileStats = fs.statSync(resolvedPath);

  if (!fileStats.isFile()) {
    sendText(response, 404, 'Not found: no file matches that address.');
    return;
  }

  const extension = path.extname(resolvedPath).toLowerCase();
  const contentType = CONTENT_TYPES[extension] || 'application/octet-stream';
  const body = fs.readFileSync(resolvedPath);

  response.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': body.length,
  });
  response.end(body);
}

function handleRequest(request, response) {
  let requestUrl;

  try {
    requestUrl = new URL(request.url, 'http://localhost');
  } catch {
    sendText(response, 400, 'Bad request: the address could not be read.');
    return;
  }

  let pathname;

  try {
    pathname = decodeURIComponent(requestUrl.pathname);
  } catch {
    sendText(response, 400, 'Bad request: the address contains invalid characters.');
    return;
  }

  serveStaticFile(pathname, response);
}

const server = http.createServer((request, response) => {
  try {
    handleRequest(request, response);
  } catch (error) {
    console.error('Request handling failed:', error.message);
    sendText(response, 500, 'Something went wrong while handling that request.');
  }
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(
      `Port ${PORT} is already in use. Stop the other process, or start this one with PORT=<number> node server.js.`
    );
  } else {
    console.error('Server failed to start:', error.message);
  }
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`Tech blog is running at http://localhost:${PORT}`);
});
