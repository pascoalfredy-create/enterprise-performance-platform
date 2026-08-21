"use client";
import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "../lib/api-client";
import "./document-hub.css";
type Folder = { id: string; module_code: string; name: string };
type Doc = {
  id: string;
  module_code: string;
  folder_name: string;
  title: string;
  file_name: string;
  file_size: number;
  version_number: number;
  status: string;
  ocr_status: string;
  ocr_confidence_bps?: number;
  evidence_hash: string;
};
type Data = {
  folders: Folder[];
  documents: Doc[];
  modules: string[];
  ocrConfigured: boolean;
};
const names: Record<string, string> = {
  CORE: "Administração",
  "FINANCE_FP&A": "Finance & FP&A",
  HCM: "HCM",
  PAYROLL: "Payroll",
  WORKFORCE_PLANNING: "Workforce",
  PERFORMANCE_MANAGEMENT: "Performance",
  ANALYTICS_REPORTING: "Reporting",
  WORKFLOW: "Workflow",
  INTEGRATIONS: "Integrações",
};
export function DocumentHubWorkspace() {
  const [data, setData] = useState<Data>({
      folders: [],
      documents: [],
      modules: [],
      ocrConfigured: false,
    }),
    [module, setModule] = useState(""),
    [modal, setModal] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = () =>
    apiFetch("/api/v1/document-hub")
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw new Error(b.error);
        setData(b);
        setModule((x) => x || b.modules?.[0] || "");
      })
      .catch((e) => setError(e.message));
  useEffect(load, []);
  async function command(body: Record<string, string>) {
    setBusy(true);
    setError("");
    const r = await apiFetch("/api/v1/document-hub", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      b = await r.json();
    setBusy(false);
    if (!r.ok) {
      setError(b.error);
      return;
    }
    setData(b);
    setModal("");
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (modal === "upload") {
      setBusy(true);
      const r = await apiFetch("/api/v1/document-hub", {
          method: "POST",
          body: new FormData(e.currentTarget),
        }),
        b = await r.json();
      setBusy(false);
      if (!r.ok) {
        setError(b.error);
        return;
      }
      setData(b);
      setModal("");
      return;
    }
    await command({
      type: "createFolder",
      moduleCode: module,
      ...(Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<
        string,
        string
      >),
    });
  }
  async function download(d: Doc) {
    const r = await apiFetch(
      `/api/v1/document-hub?download=${encodeURIComponent(d.id)}`,
    );
    if (!r.ok) {
      setError((await r.json()).error);
      return;
    }
    const u = URL.createObjectURL(await r.blob()),
      a = document.createElement("a");
    a.href = u;
    a.download = d.file_name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
  }
  const docs = data.documents.filter((x) => x.module_code === module),
    folders = data.folders.filter((x) => x.module_code === module),
    pending = data.documents.filter((x) =>
      ["Pendente", "Falhou"].includes(x.ocr_status),
    ).length;
  return (
    <section className="document-hub">
      <header className="dh-hero">
        <div>
          <small>ENTERPRISE DOCUMENT HUB</small>
          <h1>Documentos organizados por módulo</h1>
          <p>
            Upload privado, versões, hash, OCR assistido e validação humana.
          </p>
        </div>
        <div>
          {!data.folders.length && (
            <button
              disabled={busy}
              onClick={() => command({ type: "provisionFolders" })}
            >
              Criar estrutura recomendada
            </button>
          )}
          <button onClick={() => setModal("folder")}>＋ Nova pasta</button>
          <button
            className="primary"
            disabled={!folders.length}
            onClick={() => setModal("upload")}
          >
            ↑ Upload
          </button>
        </div>
      </header>
      <section className="dh-kpis">
        <article>
          <span>Documentos</span>
          <strong>{data.documents.length}</strong>
          <small>Todos os módulos</small>
        </article>
        <article>
          <span>Pastas</span>
          <strong>{data.folders.length}</strong>
          <small>Estrutura governada</small>
        </article>
        <article className={pending ? "attention" : ""}>
          <span>Fila OCR</span>
          <strong>{pending}</strong>
          <small>
            {data.ocrConfigured ? "Motor configurado" : "Conector pendente"}
          </small>
        </article>
        <article>
          <span>Validados</span>
          <strong>
            {data.documents.filter((x) => x.status === "Validado").length}
          </strong>
          <small>Com revisão humana</small>
        </article>
      </section>
      <nav className="dh-modules">
        {data.modules.map((x) => (
          <button
            key={x}
            className={module === x ? "active" : ""}
            onClick={() => setModule(x)}
          >
            {names[x] || x}
            <small>
              {data.documents.filter((d) => d.module_code === x).length}
            </small>
          </button>
        ))}
      </nav>
      <div className="dh-layout">
        <aside>
          <div>
            <b>PASTAS</b>
            <button onClick={() => setModal("folder")}>＋</button>
          </div>
          {folders.map((x) => (
            <button key={x.id}>
              <span>▱</span>
              {x.name}
              <small>
                {docs.filter((d) => d.folder_name === x.name).length}
              </small>
            </button>
          ))}
          {!folders.length && <p>Crie a primeira pasta deste módulo.</p>}
        </aside>
        <article>
          <header>
            <div>
              <small>{names[module] || module}</small>
              <h2>Ficheiros e processamento</h2>
            </div>
            <em>{docs.length} documento(s)</em>
          </header>
          <div className="dh-table">
            <table>
              <thead>
                <tr>
                  <th>Documento</th>
                  <th>Pasta</th>
                  <th>Versão</th>
                  <th>OCR</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {docs.map((x) => (
                  <tr key={x.id}>
                    <td>
                      <b>{x.title}</b>
                      <small>
                        {x.file_name} · {(x.file_size / 1024).toFixed(1)} KB
                      </small>
                      <small>SHA-256 {x.evidence_hash.slice(0, 12)}…</small>
                    </td>
                    <td>{x.folder_name}</td>
                    <td>v{x.version_number}</td>
                    <td>
                      <em
                        className={`ocr ${x.ocr_status.toLowerCase().replaceAll(" ", "-")}`}
                      >
                        {x.ocr_status}
                      </em>
                      {x.ocr_confidence_bps != null && (
                        <small>
                          {(x.ocr_confidence_bps / 100).toFixed(1)}%
                        </small>
                      )}
                    </td>
                    <td>{x.status}</td>
                    <td>
                      <button onClick={() => download(x)}>↓</button>
                      {["Pendente", "Falhou"].includes(x.ocr_status) && (
                        <button
                          disabled={busy}
                          onClick={() =>
                            command({ type: "processOcr", documentId: x.id })
                          }
                        >
                          OCR
                        </button>
                      )}
                      {x.status === "Carregado" && (
                        <button
                          disabled={busy}
                          onClick={() =>
                            command({
                              type: "validate",
                              documentId: x.id,
                              note: "Documento e metadados conferidos.",
                            })
                          }
                        >
                          Validar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </div>
      {error && (
        <div className="dh-error">
          {error}
          <button onClick={() => setError("")}>×</button>
        </div>
      )}
      {modal && (
        <div className="modal-inline">
          <form onSubmit={submit}>
            <header>
              <div>
                <small>DOCUMENT HUB</small>
                <h2>
                  {modal === "folder" ? "Nova pasta" : "Carregar documento"}
                </h2>
              </div>
              <button type="button" onClick={() => setModal("")}>
                ×
              </button>
            </header>
            {modal === "folder" ? (
              <label>
                Nome da pasta
                <input
                  name="name"
                  required
                  placeholder="Ex.: Faturas de fornecedores"
                />
              </label>
            ) : (
              <>
                <input type="hidden" name="moduleCode" value={module} />
                <label>
                  Pasta
                  <select name="folderId" required>
                    <option value="">Selecionar</option>
                    {folders.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Título
                  <input name="title" required />
                </label>
                <label>
                  Ficheiro
                  <input
                    name="file"
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.csv,.txt,.xlsx"
                    required
                  />
                </label>
                <p>PDF, JPG e PNG entram na fila OCR. Limite: 20 MB.</p>
              </>
            )}
            <footer>
              <button type="button" onClick={() => setModal("")}>
                Cancelar
              </button>
              <button className="primary" disabled={busy}>
                {busy ? "A processar…" : "Confirmar"}
              </button>
            </footer>
          </form>
        </div>
      )}
    </section>
  );
}
