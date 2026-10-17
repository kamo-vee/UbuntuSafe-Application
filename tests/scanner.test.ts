import assert from "node:assert/strict";
import { scanOffline } from "../artifacts/ubuntusafe-mobile/lib/scanner/index.ts";

const dangerous = scanOffline(
  "message",
  "Urgent: send money and share your OTP now",
);
assert.equal(dangerous.status, "danger");
assert.ok(dangerous.signals.length > 0);

const safe = scanOffline(
  "message",
  "The community meeting starts at ten tomorrow.",
);
assert.equal(safe.status, "safe");

const blockedLink = scanOffline(
  "link",
  "https://secure-login-check.example/account",
);
assert.equal(blockedLink.status, "danger");

assert.equal(
  scanOffline("message", "Romela madi le khoutu ya sephiri").status,
  "danger",
);
assert.equal(
  scanOffline("message", "Romela tšhelete gomme o romele khoutu").status,
  "danger",
);
assert.equal(scanOffline("message", "Rhumela mali na paswedi ya wena").status, "danger");
assert.equal(scanOffline("message", "Thumela imali uze uthumele ikhodi").status, "danger");
assert.notEqual(scanOffline("message", "ikhowudi yokuqinisekisa").status, "safe");
assert.notEqual(scanOffline("message", "ikhodi yokuqinisekisa").status, "safe");

assert.throws(() => scanOffline("message", "https://example.org/login"), /not a message/i);
assert.throws(() => scanOffline("link", "Please open https://example.org"), /links only/i);
assert.throws(() => scanOffline("voice", "https://example.org"), /words spoken/i);
assert.throws(() => scanOffline("job", "Send me your password now"), /job advertisements/i);
assert.equal(scanOffline("link", "https://sars.gov.za").status, "safe");
assert.equal(scanOffline("link", "https://unfamiliar.example/path").status, "warning");
assert.equal(
  scanOffline("job", "Guaranteed job: pay a registration fee to apply").status,
  "danger",
);

console.log(
  "scanner tests passed: types, link allow/block handling, and supported-language signals",
);
