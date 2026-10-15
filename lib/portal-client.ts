import { apiFetch, readApiJson } from "./api-client";

// Keep form handlers recoverable on network errors and invalid gateway responses.
// Do not retry mutations automatically: the server may already have accepted them.
export async function portalFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  try {
    const response = await apiFetch(input, { ...init, cache: "no-store" });
    const body = await readApiJson<Record<string, unknown>>(response);
    if (!response.ok && !body.error) {
      body.error = response.status === 401
        ? "A sessão expirou. Entre novamente."
        : "Não foi possível concluir o pedido.";
    }
    return { ok: response.ok, json: async () => body };
  } catch {
    return {
      ok: false,
      json: async () => ({ error: "Não foi possível confirmar o resultado. Atualize os dados antes de tentar novamente." }),
    };
  }
}
