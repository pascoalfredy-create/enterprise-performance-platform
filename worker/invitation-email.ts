export type InvitationEmailEnv = {
  RESEND_API_KEY?: string;
  INVITATION_FROM_EMAIL?: string;
  PUBLIC_APP_URL?: string;
};
export type InvitationDelivery = {
  status: "accepted" | "not_configured" | "failed";
  messageId?: string;
};

/** Provider acceptance is not proof of delivery to the recipient's inbox. */
export async function sendInvitationEmail(
  env: InvitationEmailEnv,
  invitation: { email: string; name: string; token: string; expiresAt: string; idempotencyKey: string },
  transport: typeof fetch = fetch,
): Promise<InvitationDelivery> {
  if (!env.RESEND_API_KEY || !env.INVITATION_FROM_EMAIL || !env.PUBLIC_APP_URL)
    return { status: "not_configured" };
  let origin: URL;
  try {
    origin = new URL(env.PUBLIC_APP_URL);
    if (origin.protocol !== "https:" || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/")
      return { status: "not_configured" };
  } catch { return { status: "not_configured" }; }
  if (!/^\S+@\S+\.\S+$/.test(invitation.email) || /[\r\n]/.test(env.INVITATION_FROM_EMAIL))
    return { status: "failed" };
  const url = new URL("/", origin);
  url.searchParams.set("invite", invitation.token);
  const text = `Olá, ${invitation.name}.\n\nRecebeu um convite para aceder à Enterprise Performance Platform.\nEntre com a conta ${invitation.email} e aceite o convite nesta ligação:\n${url.href}\n\nVálido até ${invitation.expiresAt}.\nSe não esperava este convite, ignore esta mensagem.`;
  try {
    const response = await transport("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json", "Idempotency-Key": invitation.idempotencyKey },
      body: JSON.stringify({ from: env.INVITATION_FROM_EMAIL, to: [invitation.email], subject: "Convite para a Enterprise Performance Platform", text }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return { status: "failed" };
    const body = await response.json() as { id?: unknown };
    return typeof body.id === "string" && body.id ? { status: "accepted", messageId: body.id } : { status: "failed" };
  } catch {
    // Never expose provider responses, API keys, invitation tokens or transport errors.
    return { status: "failed" };
  }
}
