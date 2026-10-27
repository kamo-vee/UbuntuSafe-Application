/**
 * Standalone production server for Expo static builds.
 *
 * Serves the output of build.js (static-build/) with two special routes:
 * - GET / or /manifest with expo-platform header → platform manifest JSON
 * - GET / without expo-platform → landing page HTML
 * Everything else falls through to static file serving from ./static-build/.
 *
 * Zero external dependencies — uses only Node.js built-ins (http, fs, path).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const STATIC_ROOT = path.resolve(__dirname, '..', 'static-build');
const TEMPLATE_PATH = path.resolve(__dirname, 'templates', 'landing-page.html');
const basePath = (process.env.BASE_PATH || '/').replace(/\/+$/, '');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.map': 'application/json',
};

function getAppName() {
  try {
    const appJsonPath = path.resolve(__dirname, '..', 'app.json');
    const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf-8'));
    return typeof appJson.expo?.name === 'string'
      ? appJson.expo.name
      : 'App Landing Page';
  } catch {
    return 'App Landing Page';
  }
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function toScriptString(value) {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026');
}

// Index trusted build outputs once. Request data is never passed to a filesystem read.
// Symlinks and dotfiles are deliberately not indexed, including symlinked directories.
function loadStaticAssets(root) {
  const assets = new Map();
  if (!fs.existsSync(root) || fs.lstatSync(root).isSymbolicLink()) return assets;
  const visit = (directory, prefix = '') => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
      const filename = path.join(directory, entry.name);
      const key = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) visit(filename, key);
      else if (entry.isFile()) {
        const extension = path.extname(entry.name).toLowerCase();
        if (extension && !MIME_TYPES[extension] && !['.bundle', '.webp', '.avif', '.wasm', '.mp3', '.wav', '.m4a'].includes(extension)) continue;
        assets.set(key, {
          content: fs.readFileSync(filename),
          contentType: MIME_TYPES[extension] || (extension === '.bundle' ? 'application/javascript' : 'application/octet-stream'),
        });
      }
    }
  };
  visit(root);
  return assets;
}

function serveManifest(platform, res, assets) {
  const manifest = platform === 'ios' ? assets.get('/ios/manifest.json')
    : platform === 'android' ? assets.get('/android/manifest.json') : undefined;
  if (!manifest) {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({ error: `Manifest not found for platform: ${platform}` }),
    );
    return;
  }

  res.writeHead(200, {
    'content-type': 'application/json',
    'expo-protocol-version': '1',
    'expo-sfv-version': '0',
  });
  res.end(manifest.content);
}

function serveLandingPage(req, res, landingPageTemplate, appName) {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const protocol = forwardedProto === 'http' ? 'http' : 'https';
  const host = req.headers['x-forwarded-host'] || req.headers['host'];
  if (typeof host !== 'string' || !/^[a-zA-Z0-9.-]+(?::\d{1,5})?$/.test(host)) {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `exps://${host}${basePath}`;

  const html = landingPageTemplate
    .replace(/BASE_URL_PLACEHOLDER/g, escapeHtml(baseUrl))
    .replace(/EXPS_URL_ATTRIBUTE_PLACEHOLDER/g, escapeHtml(expsUrl))
    .replace(/EXPS_URL_JSON_PLACEHOLDER/g, toScriptString(expsUrl))
    .replace(/APP_NAME_PLACEHOLDER/g, escapeHtml(appName));

  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
}

function serveStaticFile(urlPath, res, assets) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(urlPath);
  } catch {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }
  if (decodedPath.includes('\0') || decodedPath.includes('\\')) {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }
  if (decodedPath.split('/').some((part) => part === '..' || part === '.')) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const asset = assets.get(decodedPath);
  if (!asset) {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  res.writeHead(200, { 'content-type': asset.contentType, 'x-content-type-options': 'nosniff' });
  res.end(asset.content);
}

function createAppServer({ root = STATIC_ROOT, templatePath = TEMPLATE_PATH } = {}) {
const assets = loadStaticAssets(root);
const landingPageTemplate = fs.readFileSync(templatePath, 'utf-8');
const appName = getAppName();
return http.createServer((req, res) => {
  let url;
  try { url = new URL(req.url || '/', 'http://localhost'); }
  catch { res.writeHead(400); res.end('Bad Request'); return; }
  let pathname = url.pathname;

  if (basePath && (pathname === basePath || pathname.startsWith(`${basePath}/`))) {
    pathname = pathname.slice(basePath.length) || '/';
  }

  if (pathname === '/' || pathname === '/manifest') {
    const platform = req.headers['expo-platform'];
    if (platform === 'ios' || platform === 'android') {
      return serveManifest(platform, res, assets);
    }

    if (pathname === '/') {
      return serveLandingPage(req, res, landingPageTemplate, appName);
    }
  }

  serveStaticFile(pathname, res, assets);
});
}

if (require.main === module) {
const port = parseInt(process.env.PORT || '3000', 10);
createAppServer().listen(port, '0.0.0.0', () => {
  console.log(`Serving static Expo build on port ${port}`);
});
}
module.exports = { createAppServer, loadStaticAssets };
