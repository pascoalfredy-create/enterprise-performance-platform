import test from "node:test";
import assert from "node:assert/strict";
import { payPayReadiness, payPaySandboxReference } from "../worker/paypay.ts";

test("PayPay defaults to a closed sandbox for a personal promoter", () => {
  const readiness = payPayReadiness({});
  assert.equal(readiness.mode, "sandbox");
  assert.equal(readiness.productionReady, false);
  assert.match(readiness.accountType, /Personal/);
  assert.equal(readiness.gates.find((x) => x.code === "PRODUCTION")?.ready, false);
});

test("PayPay production requires every protected integration parameter", () => {
  const partial = payPayReadiness({ PAYPAY_MODE: "production", PAYPAY_PARTNER_ID: "partner" });
  assert.equal(partial.productionReady, false);
  const complete = payPayReadiness({
    PAYPAY_MODE: "production",
    PAYPAY_API_URL: "https://payments.invalid",
    PAYPAY_PARTNER_ID: "partner",
    PAYPAY_API_KEY: "key",
    PAYPAY_API_SECRET: "secret",
    PAYPAY_WEBHOOK_SECRET: "webhook",
  });
  assert.equal(complete.productionReady, true);
  assert.equal(complete.gates.find((x) => x.code === "PRODUCTION")?.ready, true);
});

test("PayPay sandbox references are deterministic and visibly non-production", () => {
  assert.equal(
    payPaySandboxReference("12345678-1234-5678-9012-123456789012"),
    "PP-SBX-123456781234",
  );
});
