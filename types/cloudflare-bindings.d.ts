declare module "cloudflare:workers" { export const env: {DB: import("../worker-configuration").D1Database}; }
