export type PayPayEnv = {
  PAYPAY_MODE?: string;
  PAYPAY_API_URL?: string;
  PAYPAY_PARTNER_ID?: string;
  PAYPAY_API_KEY?: string;
  PAYPAY_API_SECRET?: string;
  PAYPAY_WEBHOOK_SECRET?: string;
  PAYPAY_ACCOUNT_TYPE?: string;
};

export function payPayReadiness(env: PayPayEnv) {
  const configured = {
    apiUrl: Boolean(env.PAYPAY_API_URL),
    partnerId: Boolean(env.PAYPAY_PARTNER_ID),
    apiKey: Boolean(env.PAYPAY_API_KEY),
    apiSecret: Boolean(env.PAYPAY_API_SECRET),
    webhookSecret: Boolean(env.PAYPAY_WEBHOOK_SECRET),
  };
  const productionReady = Object.values(configured).every(Boolean);
  return {
    provider: "PAYPAY_AO",
    mode: env.PAYPAY_MODE === "production" ? "production" : "sandbox",
    accountType: env.PAYPAY_ACCOUNT_TYPE || "Personal — em análise comercial",
    productionReady,
    configured,
    gates: [
      { code: "COMMERCIAL", label: "Aprovação comercial", ready: Boolean(env.PAYPAY_PARTNER_ID) },
      { code: "CREDENTIALS", label: "Credenciais protegidas", ready: Boolean(env.PAYPAY_API_KEY && env.PAYPAY_API_SECRET) },
      { code: "WEBHOOK", label: "Webhook autenticado", ready: Boolean(env.PAYPAY_WEBHOOK_SECRET) },
      { code: "PRODUCTION", label: "Pagamento real autorizado", ready: productionReady && env.PAYPAY_MODE === "production" },
    ],
  };
}

export function payPaySandboxReference(paymentId: string) {
  return `PP-SBX-${paymentId.replaceAll("-", "").slice(0, 12).toUpperCase()}`;
}
