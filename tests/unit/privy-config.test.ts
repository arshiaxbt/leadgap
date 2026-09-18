import assert from "node:assert/strict";
import test from "node:test";
import { privyAppId } from "../../src/lib/privy";

test("redacted auth configuration cannot mount a crashing Privy provider", () => {
  const previous = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  try {
    for (const value of ["", "   ", "[SENSITIVE]", "invalid"]) {
      process.env.NEXT_PUBLIC_PRIVY_APP_ID = value;
      assert.equal(privyAppId(), undefined);
    }
    const valid = "c" + "a".repeat(24);
    process.env.NEXT_PUBLIC_PRIVY_APP_ID = ` ${valid} `;
    assert.equal(privyAppId(), valid);
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_PRIVY_APP_ID;
    else process.env.NEXT_PUBLIC_PRIVY_APP_ID = previous;
  }
});
