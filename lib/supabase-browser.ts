export type AuthResult = { ok: boolean; message?: string; data?: Record<string, unknown> };

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";

function configured() {
  return Boolean(url && key);
}

async function request(path: string, init: RequestInit = {}): Promise<AuthResult> {
  if (!configured()) return { ok: false, message: "O serviço de identidade ainda não está configurado neste ambiente." };
  try {
    const response = await fetch(`${url}/auth/v1${path}`, {
      ...init,
      headers: { apikey: key, "content-type": "application/json", ...(init.headers || {}) },
    });
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) return { ok: false, message: friendlyError(String(data.msg || data.message || data.error_description || "")) };
    return { ok: true, data };
  } catch {
    return { ok: false, message: "Não foi possível contactar o serviço de identidade. Tente novamente." };
  }
}

function friendlyError(detail: string) {
  const value = detail.toLowerCase();
  if (value.includes("already") || value.includes("registered")) return "Se existir uma conta com este e-mail, receberá as instruções necessárias.";
  if (value.includes("invalid login")) return "E-mail ou palavra-passe incorretos.";
  if (value.includes("password")) return "A palavra-passe deve ter pelo menos 8 caracteres.";
  if (value.includes("rate")) return "Foram efetuadas muitas tentativas. Aguarde alguns minutos.";
  return "Não foi possível concluir o pedido. Confirme os dados e tente novamente.";
}

export function signUp(payload: { email: string; password: string; data: Record<string, unknown>; redirectTo: string }) {
  return request(`/signup?redirect_to=${encodeURIComponent(payload.redirectTo)}`, {
    method: "POST",
    body: JSON.stringify({ email: payload.email.trim().toLowerCase(), password: payload.password, data: payload.data }),
  });
}

export function signIn(email: string, password: string) {
  return request("/token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
  });
}

export function requestPasswordReset(email: string, redirectTo: string) {
  return request(`/recover?redirect_to=${encodeURIComponent(redirectTo)}`, {
    method: "POST",
    body: JSON.stringify({ email: email.trim().toLowerCase() }),
  });
}

export function updatePassword(accessToken: string, password: string) {
  return request("/user", { method: "PUT", headers: { authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ password }) });
}

export function storeSession(data: Record<string, unknown>) {
  const accessToken = typeof data.access_token === "string" ? data.access_token : "";
  const refreshToken = typeof data.refresh_token === "string" ? data.refresh_token : "";
  if (accessToken) sessionStorage.setItem("ep_access_token", accessToken);
  if (refreshToken) localStorage.setItem("ep_refresh_token", refreshToken);
}
