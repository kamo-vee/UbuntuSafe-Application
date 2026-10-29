// Keep query-string's synchronous CommonJS API while using the fixed upstream
// decoder. Node >=20.19 and Metro both support this synchronous ESM interop.
const decoder = require('decode-uri-component');
module.exports = typeof decoder === 'function' ? decoder : decoder.default;
