const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const path = require('node:path');
const decode = require('../lib/uri-decoder-compat');

test('patched decoder preserves synchronous query-string and router compatibility', () => {
  assert.equal(decode('hello%20world'), 'hello world');
  assert.equal(decode('%C2%B5'), 'µ');
  assert.equal(decode('%ZZ'), '%ZZ');
  assert.equal(decode('email%40example.test'), 'email@example.test');
  const mobileRequire = createRequire(path.resolve(__dirname, '../artifacts/ubuntusafe-mobile/package.json'));
  const routerRequire = createRequire(mobileRequire.resolve('expo-router'));
  const query = routerRequire('query-string');
  assert.equal(query.parse('email=email%40example.test&sent=0').email, 'email@example.test');
  assert.equal(query.stringify({ email: 'email@example.test' }), 'email=email%40example.test');
  const malformed = '%C0%AF'.repeat(1000);
  const started = Date.now();
  assert.equal(typeof decode(malformed), 'string');
  assert.ok(Date.now() - started < 2000, 'malformed decoding must remain bounded');
});
