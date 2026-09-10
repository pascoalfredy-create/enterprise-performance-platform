"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiFetch } from "../lib/api-client";
import "./employee-documents.css";
type DocType = {
  id: string;
  code: string;
  name: string;
  category: string;
  requires_expiry: number;
  confidentiality: string;
  status: string;
};
type Doc = {
  id: string;
  employee_name: string;
  employee_number: string;
  organization_name: string;
  type_name: string;
  category: string;
  confidentiality: string;
  reference: string;
  issue_date: string;
  expiry_date?: string;
  file_name: string;
  file_size: number;
  evidence_hash: string;
  version_number: number;
  status: string;
  submitted_by: string;
};
type Data = {
  types: DocType[];
  documents: Doc[];
  employees: Array<{
    id: string;
    employee_number: string;
    name: string;
    organization_name: string;
  }>;
};
const empty: Data = { types: [], documents: [], employees: [] };
export function EmployeeDocumentsWorkspace() {
  const [data, setData] = useState<Data>(empty),
    [modal, setModal] = useState(""),
    [target, setTarget] = useState<Doc | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [filter, setFilter] = useState("Todos");
  const load = useCallback(
    () =>
      apiFetch("/api/v1/employee-documents")
        .then(async (r) => {
          const b = await r.json();
          if (!r.ok) throw new Error(b.error);
          setData(b);
        })
        .catch((e) => setError(e.message)),
    [],
  );
  useEffect(() => {
    load();
  }, [load]);
  async function command(payload: Record<string, string>) {
    setBusy(true);
    setError("");
    const r = await apiFetch("/api/v1/employee-documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }),
      b = await r.json();
    setBusy(false);
    if (!r.ok) {
      setError(b.error);
      return;
    }
    setData(b);
    setModal("");
    setTarget(null);
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (modal === "registerDocument") {
      setBusy(true);
      setError("");
      const response = await apiFetch("/api/v1/employee-documents", {
          method: "POST",
          body: new FormData(e.currentTarget),
        }),
        body = await response.json();
      setBusy(false);
      if (!response.ok) {
        setError(body.error);
        return;
      }
      setData(body);
      setModal("");
      return;
    }
    const fields = Object.fromEntries(
      new FormData(e.currentTarget).entries(),
    ) as Record<string, string>;
    await command({ type: modal, documentId: target?.id || "", ...fields });
  }
  async function download(document: Doc) {
    setError("");
    const response = await apiFetch(
      `/api/v1/employee-documents?download=${encodeURIComponent(document.id)}`,
    );
    if (!response.ok) {
      const body = await response.json();
      setError(body.error);
      return;
    }
    const blob = await response.blob(),
      url = URL.createObjectURL(blob),
      anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = document.file_name;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  // Wall-clock cutoffs for the expiry window; inherently impure, and not
  // memoized so a long-lived session keeps re-evaluating "soon" correctly.
  const today = new Date().toISOString().slice(0, 10),
    // eslint-disable-next-line react-hooks/purity
    soon = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    expiring = data.documents.filter(
      (x) =>
        x.status === "Aprovado" &&
        x.expiry_date &&
        x.expiry_date >= today &&
        x.expiry_date <= soon,
    ).length,
    expired = data.documents.filter(
      (x) => x.status === "Aprovado" && x.expiry_date && x.expiry_date < today,
    ).length,
    shown = data.documents.filter(
      (x) => filter === "Todos" || x.status === filter,
    );
  return (
    <section className="employee-docs">
      <header className="ed-top">
        <div>
          <span>HCM · EMPLOYEE DOCUMENTS</span>
          <h1>Dossiê documental, validade e evidência</h1>
          <p>
            Tipos configuráveis, versões imutáveis, confidencialidade e
            aprovação segregada por colaborador.
          </p>
        </div>
        <div>
          <button className="secundario" onClick={() => setModal("createType")}>
            ＋ Tipo documental
          </button>
          <button
            className="primario"
            disabled={!data.types.length || !data.employees.length}
            onClick={() => setModal("registerDocument")}
          >
            ＋ Registar documento
          </button>
        </div>
      </header>
      <section className="ed-kpis">
        <article>
          <span>Documentos aprovados</span>
          <strong>
            {data.documents.filter((x) => x.status === "Aprovado").length}
          </strong>
          <small>Evidência válida</small>
        </article>
        <article>
          <span>Pendentes</span>
          <strong>
            {data.documents.filter((x) => x.status === "Pendente").length}
          </strong>
          <small>Aguardam maker-checker</small>
        </article>
        <article className={expiring ? "attention" : ""}>
          <span>Expiram em 30 dias</span>
          <strong>{expiring}</strong>
          <small>Requerem renovação</small>
        </article>
        <article className={expired ? "risk" : ""}>
          <span>Expirados</span>
          <strong>{expired}</strong>
          <small>Fora de validade</small>
        </article>
      </section>
      <nav className="ed-filters">
        {["Todos", "Pendente", "Aprovado", "Rejeitado"].map((x) => (
          <button
            key={x}
            className={filter === x ? "active" : ""}
            onClick={() => setFilter(x)}
          >
            {x}
          </button>
        ))}
      </nav>
      <article className="cartao ed-table">
        <div className="cab">
          <div>
            <span>EMPLOYEE FILE</span>
            <h2>Documentos e versões</h2>
          </div>
          <em>{shown.length} registo(s)</em>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Colaborador</th>
                <th>Documento</th>
                <th>Referência</th>
                <th>Validade</th>
                <th>Ficheiro</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((x) => (
                <tr key={x.id}>
                  <td>
                    <b>{x.employee_name}</b>
                    <small>
                      {x.employee_number} · {x.organization_name}
                    </small>
                  </td>
                  <td>
                    <b>{x.type_name}</b>
                    <small>
                      {x.category} · {x.confidentiality} · v{x.version_number}
                    </small>
                  </td>
                  <td>
                    {x.reference}
                    <small>{x.evidence_hash.slice(0, 12)}…</small>
                  </td>
                  <td>{x.expiry_date || "Sem validade"}</td>
                  <td>
                    {x.file_name}
                    <small>{x.file_size.toLocaleString("pt-PT")} bytes</small>
                  </td>
                  <td>
                    <em className={`ed-status ${x.status.toLowerCase()}`}>
                      {x.status}
                    </em>
                  </td>
                  <td>
                    {x.status === "Pendente" ? (
                      <button
                        onClick={() => {
                          setTarget(x);
                          setModal("decideDocument");
                        }}
                      >
                        Decidir
                      </button>
                    ) : x.status === "Aprovado" ? (
                      <button onClick={() => download(x)}>Baixar</button>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
      {error && <p className="erro-global">{error}</p>}
      {modal && (
        <div className="modal-inline">
          <form onSubmit={submit}>
            <header>
              <div>
                <small>EMPLOYEE DOCUMENTS</small>
                <h2>
                  {modal === "createType"
                    ? "Novo tipo documental"
                    : modal === "registerDocument"
                      ? "Registar documento"
                      : "Decidir documento"}
                </h2>
              </div>
              <button type="button" onClick={() => setModal("")}>
                ×
              </button>
            </header>
            {modal === "createType" ? (
              <>
                <div>
                  <label>
                    Código
                    <input name="code" required />
                  </label>
                  <label>
                    Categoria
                    <input
                      name="category"
                      required
                      placeholder="Identificação, Contrato…"
                    />
                  </label>
                </div>
                <label>
                  Nome
                  <input name="name" required />
                </label>
                <div>
                  <label>
                    Confidencialidade
                    <select name="confidentiality">
                      <option>Normal</option>
                      <option>Confidencial</option>
                      <option>Restrito</option>
                    </select>
                  </label>
                  <label>
                    Exige validade?
                    <select name="requiresExpiry">
                      <option value="0">Não</option>
                      <option value="1">Sim</option>
                    </select>
                  </label>
                </div>
              </>
            ) : modal === "registerDocument" ? (
              <>
                <label>
                  Colaborador
                  <select name="employeeId" required>
                    {data.employees.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.employee_number} · {x.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Tipo documental
                  <select name="documentTypeId" required>
                    {data.types
                      .filter((x) => x.status === "Ativo")
                      .map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.code} · {x.name}
                        </option>
                      ))}
                  </select>
                </label>
                <div>
                  <label>
                    Referência
                    <input name="reference" required />
                  </label>
                  <label>
                    Data de emissão
                    <input name="issueDate" type="date" required />
                  </label>
                </div>
                <label>
                  Data de validade
                  <input name="expiryDate" type="date" />
                </label>
                <label>
                  Ficheiro privado
                  <input
                    name="file"
                    type="file"
                    accept="application/pdf,image/jpeg,image/png"
                    required
                  />
                </label>
                <p className="ed-storage-note">
                  PDF, JPG ou PNG até 10 MB. O ficheiro fica privado e o hash
                  SHA-256 é calculado diretamente a partir do conteúdo.
                </p>
              </>
            ) : (
              <>
                <p>
                  Decisão sobre <b>{target?.type_name}</b> de{" "}
                  {target?.employee_name}. O próprio autor não pode aprovar.
                </p>
                <label>
                  Decisão
                  <select name="decision">
                    <option>Aprovado</option>
                    <option>Rejeitado</option>
                  </select>
                </label>
                <label>
                  Nota
                  <textarea name="note" required />
                </label>
              </>
            )}
            <footer>
              <button
                type="button"
                className="secundario"
                onClick={() => setModal("")}
              >
                Cancelar
              </button>
              <button className="primario" disabled={busy}>
                Confirmar
              </button>
            </footer>
          </form>
        </div>
      )}
    </section>
  );
}
