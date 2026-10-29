const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { goBackOrReplace } = require("../artifacts/ubuntusafe-mobile/lib/navigation.ts");

test("Back uses existing navigation history without replacing the route", () => {
  const calls = [];
  goBackOrReplace({
    canGoBack: () => true,
    back: () => calls.push("back"),
    replace: (href) => calls.push(href),
  }, "/role-select");
  assert.deepEqual(calls, ["back"]);
});

const destinations = {
  "admin-sign-in": "/role-select",
  "user-access": "/role-select",
  "role-select": "/",
  "community": "/(tabs)",
  "community-feedback": "/admin-dashboard",
  "tool": "/(tabs)",
  "report": "/community",
  "feedback": "/settings",
};

for (const [screen, fallback] of Object.entries(destinations)) {
  test(`${screen} without history replaces with ${fallback} and never dispatches GO_BACK`, () => {
    const calls = [];
    goBackOrReplace({
      canGoBack: () => false,
      back: () => assert.fail("Cannot dispatch Back without history"),
      replace: (href) => calls.push(href),
    }, fallback);
    assert.deepEqual(calls, [fallback]);
    const source = readFileSync(path.join(__dirname,
      "../artifacts/ubuntusafe-mobile/app", `${screen}.tsx`), "utf8");
    assert.ok(source.includes(`goBackOrReplace(router, "${fallback}")`));
    assert.doesNotMatch(source, /\brouter\.back\(\)/);
  });
}
