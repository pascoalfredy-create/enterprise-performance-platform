export type ApprovalAction = { allowed: boolean; reason: string | null };
const sameUser = (left: unknown, right: string) => String(left || "").trim().toLowerCase() === right.trim().toLowerCase();
export function financialBatchActions(batch: { status: string; created_by: unknown }, email: string, role: string) {
  const canWrite = ["Administrador", "Financeiro", "Gestor"].includes(role);
  const action = (status: string, selfReason: string): ApprovalAction => {
    if (!canWrite) return { allowed: false, reason: "O seu perfil permite apenas consulta." };
    if (batch.status !== status) return { allowed: false, reason: "O estado atual não permite esta ação." };
    if (sameUser(batch.created_by, email)) return { allowed: false, reason: selfReason };
    return { allowed: true, reason: null };
  };
  return {
    validate: action("Carregado", "Outro utilizador autorizado deve validar este lote, porque foi criado por si."),
    publish: action("Validado", "Outro utilizador autorizado deve publicar este lote, porque foi criado por si."),
  };
}
export function integrationRunActions(run: { status: string; validated_by?: unknown }, email: string, role: string) {
  const canWrite = ["Administrador", "Financeiro"].includes(role);
  const validate: ApprovalAction = !canWrite ? { allowed: false, reason: "O seu perfil permite apenas consulta." } : { allowed: run.status === "Recebida", reason: run.status === "Recebida" ? null : "O estado atual não permite esta ação." };
  const decide: ApprovalAction = !canWrite ? { allowed: false, reason: "O seu perfil permite apenas consulta." } : run.status !== "Validada" ? { allowed: false, reason: "A execução deve estar validada antes da decisão." } : !run.validated_by ? { allowed: false, reason: "A execução não tem um validador registado." } : sameUser(run.validated_by, email) ? { allowed: false, reason: "Outro utilizador autorizado deve decidir esta execução, porque foi validada por si." } : { allowed: true, reason: null };
  return { validate, decide };
}
