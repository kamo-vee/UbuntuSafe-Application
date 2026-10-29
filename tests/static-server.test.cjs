const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { createAppServer } = require('../artifacts/ubuntusafe-mobile/server/serve.js');

test('static outputs and manifests are served without traversal or symlink disclosure', async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'ubuntu-static-'));
  const root = path.join(temporary, 'public');
  fs.mkdirSync(path.join(root, 'ios'), { recursive: true });
  fs.writeFileSync(path.join(root, 'app.js'), 'public bundle');
  fs.writeFileSync(path.join(root, 'ios', 'manifest.json'), '{"name":"test"}');
  fs.writeFileSync(path.join(root, '.env'), 'PRIVATE_DOTFILE');
  fs.writeFileSync(path.join(temporary, 'private.html'), 'PRIVATE_OUTSIDE');
  fs.symlinkSync(path.join(temporary, 'private.html'), path.join(root, 'link.html'));
  const templatePath = path.join(temporary, 'landing.html');
  fs.writeFileSync(templatePath, 'APP_NAME_PLACEHOLDER EXPS_URL_ATTRIBUTE_PLACEHOLDER');
  const server = createAppServer({ root, templatePath });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const request = (url, headers = {}) => new Promise((resolve, reject) => {
    http.get({ hostname: '127.0.0.1', port, path: url, headers }, (response) => {
      let body = '';
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body }));
    }).on('error', reject);
  });
  try {
    assert.equal((await request('/app.js')).body, 'public bundle');
    assert.equal((await request('/manifest', { 'expo-platform': 'ios' })).status, 200);
    for (const url of ['/../private.html', '/%2e%2e%2fprivate.html', '/%252e%252e/private.html', '/link.html', '/.env', '/%00', '/%GG', '/%5c..%5cprivate.html']) {
      const response = await request(url);
      assert.ok(response.status >= 400, url);
      assert.ok(!response.body.includes('PRIVATE'), url);
    }
    assert.equal((await request('/manifest', { 'expo-platform': '../' })).status, 404);
    assert.equal((await request('/', { 'x-forwarded-host': '<script>alert(1)</script>' })).status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
