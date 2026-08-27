"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiFetch } from "../lib/api-client";
import {
  financialCsvTemplate,
  parseFinancialCsv,
  type AssistedRow,
} from "../lib/assisted-import";
import "./financial-data.css";
import "./assisted-import.css";
type Line = {
  id: string;
  code: string;
  name: string;
  classification: string;
  cash_flow_category: string;
  sign_mode: string;
};
type Mapping = {
  id: string;
  source_system: string;
  source_code: string;
  line_code: string;
  line_name: string;
  dimension_name?: string;
};
type Batch = {
  id: string;
  organization_name: string;
  period: string;
  currency: string;
  source_system: string;
  file_name: string;
  status: string;
  row_count: number;
  total_minor: number;
  input_hash: string;
  created_by: string;
};
type Row = {
  id: string;
  batch_id: string;
  row_number: number;
  source_code: string;
  source_description: string;
  amount_minor: number;
  mapping_status: string;
  line_code?: string;
  line_name?: string;
  row_hash: string;
};
type Data = {
  lines: Line[];
  mappings: Mapping[];
  batches: Batch[];
  rows: Row[];
  organizations: Array<{
    id: string;
    code: string;
    name: string;
    currency: string;
  }>;
  members: Array<{
    id: string;
    code: string;
    name: string;
    dimension_name: string;
  }>;
};
const empty: Data = {
  lines: [],
  mappings: [],
  batches: [],
  rows: [],
  organizations: [],
  members: [],
};
export function FinancialDataWorkspace() {
  const [data, setData] = useState<Data>(empty),
    [view, setView] = useState("Importações"),
    [selected, setSelected] = useState(""),
    [modal, setModal] = useState(""),
    [importFile, setImportFile] = useState(""),
    [importRows, setImportRows] = useState<AssistedRow[]>([]),
    [importErrors, setImportErrors] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const load = useCallback(
    () =>
      apiFetch(`/api/v1/financial-data${selected ? `?batch=${selected}` : ""}`)
        .then(async (r) => {
          const b = await r.json();
          if (!r.ok) throw new Error(b.error);
          setData(b);
        })
        .catch((e) => setError(e.message)),
    [selected],
  );
  useEffect(() => {
    load();
  }, [load]);
  async function command(payload: Record<string, string>) {
    setBusy(true);
    setError("");
    const r = await apiFetch(
        `/api/v1/financial-data${selected ? `?batch=${selected}` : ""}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      ),
      b = await r.json();
    setBusy(false);
    if (!r.ok) {
      setError(b.error);
      return;
    }
    setData(b);
    if (b.batches?.some((x: Batch) => x.id === b.rows?.[0]?.batch_id))
      setSelected(b.rows[0].batch_id);
    setModal("");
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fields = Object.fromEntries(
      new FormData(e.currentTarget).entries(),
    ) as Record<string, string>;
    if (modal === "createBatch") {
      if (!importRows.length || importErrors.length || importRows.some((x) => x.errors.length)) {
        setError("Corrija os erros do ficheiro antes de criar o lote.");
        return;
      }
      fields.rows = JSON.stringify(
        importRows.map(({ code, description, amount }) => ({ code, description, amount })),
      );
      fields.fileName = importFile;
    }
    await command({ type: modal, ...fields });
  }
  async function chooseImport(file?: File) {
    setError("");
    setImportRows([]);
    setImportErrors([]);
    setImportFile(file?.name || "");
    if (!file) return;
    if (!/\.csv$/i.test(file.name) || file.size > 5 * 1024 * 1024) {
      setImportErrors(["Selecione um CSV até 5 MB."]);
      return;
    }
    const result = parseFinancialCsv(await file.text());
    setImportRows(result.rows);
    setImportErrors(result.errors);
  }
  function downloadTemplate() {
    const url = URL.createObjectURL(
      new Blob([financialCsvTemplate], { type: "text/csv;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "template-actual-financeiro.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }
  const pending = data.rows.filter((x) => !x.line_code).length,
    total = data.batches.reduce((n, x) => n + x.row_count, 0),
    money = (n: number, c: string) =>
      new Intl.NumberFormat("pt-PT", {
        style: "currency",
        currency: c,
        maximumFractionDigits: 2,
      }).format(n / 100);
  return (
    <section className="financial-data">
      <header className="fd-top">
        <div>
          <span>FINANCE & FP&A · DATA FOUNDATION</span>
          <h1>Dados de qualquer ERP, com mapping antes do Actual</h1>
          <p>
            Catálogo financeiro próprio, códigos de origem, validação segregada
            e lineage até cada linha importada.
          </p>
        </div>
        <div>
          <button className="secundario" onClick={() => setModal("createLine")}>
            ＋ Linha financeira
          </button>
          <button
            className="primario"
            onClick={() => {
              setImportFile("");
              setImportRows([]);
              setImportErrors([]);
              setModal("createBatch");
            }}
          >
            ↑ Importação assistida
          </button>
        </div>
      </header>
      <section className="fd-kpis">
        <article>
          <span>Linhas financeiras</span>
          <strong>{data.lines.length}</strong>
          <small>Catálogo agnóstico</small>
        </article>
        <article>
          <span>Mappings</span>
          <strong>{data.mappings.length}</strong>
          <small>Códigos de sistemas externos</small>
        </article>
        <article>
          <span>Linhas importadas</span>
          <strong>{total}</strong>
          <small>Em todos os lotes</small>
        </article>
        <article className={pending ? "risk" : ""}>
          <span>Pendentes no lote</span>
          <strong>{pending}</strong>
          <small>Exigem mapping</small>
        </article>
      </section>
      <nav className="fd-tabs">
        {["Importações", "Mappings", "Catálogo"].map((x) => (
          <button
            key={x}
            className={view === x ? "active" : ""}
            onClick={() => setView(x)}
          >
            {x}
          </button>
        ))}
      </nav>
      {view === "Catálogo" ? (
        <article className="cartao fd-table">
          <div className="cab">
            <div>
              <span>MODELO FINANCEIRO</span>
              <h2>Linhas normalizadas</h2>
            </div>
            <em>{data.lines.length}</em>
          </div>
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Nome</th>
                <th>Classificação</th>
                <th>Cash-flow</th>
                <th>Sinal</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map((x) => (
                <tr key={x.id}>
                  <td>
                    <code>{x.code}</code>
                  </td>
                  <td>
                    <b>{x.name}</b>
                  </td>
                  <td>{x.classification}</td>
                  <td>{x.cash_flow_category}</td>
                  <td>{x.sign_mode}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      ) : view === "Mappings" ? (
        <article className="cartao fd-table">
          <div className="cab">
            <div>
              <span>TRADUÇÃO DE ORIGEM</span>
              <h2>Mappings por sistema</h2>
            </div>
            <button onClick={() => setModal("createMapping")}>
              ＋ Mapping
            </button>
          </div>
          <table>
            <thead>
              <tr>
                <th>Sistema</th>
                <th>Código origem</th>
                <th>Linha financeira</th>
                <th>Dimensão</th>
              </tr>
            </thead>
            <tbody>
              {data.mappings.map((x) => (
                <tr key={x.id}>
                  <td>{x.source_system}</td>
                  <td>
                    <code>{x.source_code}</code>
                  </td>
                  <td>
                    <b>{x.line_code}</b>
                    <small>{x.line_name}</small>
                  </td>
                  <td>{x.dimension_name || "Sem dimensão"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      ) : (
        <div className="fd-grid">
          <article className="cartao fd-batches">
            <div className="cab">
              <div>
                <span>LOTES ACTUAL</span>
                <h2>Validação e publicação</h2>
              </div>
              <em>{data.batches.length} lote(s)</em>
            </div>
            {data.batches.map((x) => (
              <section
                key={x.id}
                className={selected === x.id ? "selected" : ""}
              >
                <button
                  className="batch-main"
                  onClick={() => setSelected(x.id)}
                >
                  <i>
                    {x.status === "Publicado"
                      ? "✓"
                      : x.status === "Validado"
                        ? "◷"
                        : "◇"}
                  </i>
                  <span>
                    <b>{x.file_name}</b>
                    <small>
                      {x.organization_name} · {x.period} · {x.source_system}
                    </small>
                  </span>
                  <strong>{money(x.total_minor, x.currency)}</strong>
                  <em>{x.status}</em>
                </button>
                <nav>
                  {x.status === "Carregado" && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        command({ type: "validateBatch", batchId: x.id })
                      }
                    >
                      Validar
                    </button>
                  )}
                  {x.status === "Validado" && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        command({ type: "postBatch", batchId: x.id })
                      }
                    >
                      Publicar Actual
                    </button>
                  )}
                </nav>
              </section>
            ))}
          </article>
          <aside className="cartao fd-rows">
            <div className="cab">
              <div>
                <span>DRILL-THROUGH</span>
                <h2>Linhas do lote</h2>
              </div>
              <em>{data.rows.length}</em>
            </div>
            {data.rows.map((x) => (
              <div key={x.id}>
                <span>
                  <code>{x.source_code}</code>
                  <b>{x.source_description}</b>
                  <small>
                    {x.line_code
                      ? `${x.line_code} · ${x.line_name}`
                      : "Mapping pendente"}
                  </small>
                </span>
                <strong>{x.amount_minor.toLocaleString("pt-PT")}</strong>
                <i className={x.line_code ? "ok" : "pending"}>
                  {x.line_code ? "✓" : "!"}
                </i>
              </div>
            ))}
          </aside>
        </div>
      )}
      {error && !modal && <p className="erro-global">{error}</p>}
      {modal && (
        <div className="modal-inline">
          <form onSubmit={submit}>
            <header>
              <div>
                <small>FINANCIAL DATA</small>
                <h2>
                  {modal === "createLine"
                    ? "Nova linha financeira"
                    : modal === "createMapping"
                      ? "Novo mapping"
                      : "Importação assistida de Actual"}
                </h2>
              </div>
              <button type="button" onClick={() => setModal("")}>
                ×
              </button>
            </header>
            {modal === "createLine" ? (
              <>
                <div>
                  <label>
                    Código
                    <input name="code" required />
                  </label>
                  <label>
                    Classificação
                    <select name="classification">
                      <option>Receita</option>
                      <option>Custo</option>
                      <option>Ativo</option>
                      <option>Passivo</option>
                      <option>Capital</option>
                      <option>Caixa</option>
                      <option>Outro</option>
                    </select>
                  </label>
                </div>
                <label>
                  Nome
                  <input name="name" required />
                </label>
                <div>
                  <label>
                    Cash-flow
                    <select name="cashFlowCategory">
                      <option>Operacional</option>
                      <option>Investimento</option>
                      <option>Financiamento</option>
                      <option>Não aplicável</option>
                    </select>
                  </label>
                  <label>
                    Tratamento do sinal
                    <select name="signMode">
                      <option>Natural</option>
                      <option>Inverter</option>
                    </select>
                  </label>
                </div>
              </>
            ) : modal === "createMapping" ? (
              <>
                <label>
                  Sistema de origem
                  <input
                    name="sourceSystem"
                    required
                    placeholder="SAP, Primavera, Excel…"
                  />
                </label>
                <label>
                  Código na origem
                  <input name="sourceCode" required />
                </label>
                <label>
                  Linha financeira
                  <select name="lineId" required>
                    <option value="">Selecionar</option>
                    {data.lines.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.code} · {x.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Dimensão opcional
                  <select name="dimensionMemberId">
                    <option value="">Sem dimensão</option>
                    {data.members.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.dimension_name} · {x.code} · {x.name}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : (
              <>
                <div className="fd-import-steps" aria-label="Etapas da importação">
                  <span className={importFile ? "done" : "active"}>1 · Ficheiro</span>
                  <span className={importRows.length ? "done" : ""}>2 · Validar</span>
                  <span>3 · Aprovar e publicar</span>
                </div>
                <label>
                  Organização
                  <select name="organizationId" required>
                    <option value="">Selecionar</option>
                    {data.organizations.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.code} · {x.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div>
                  <label>
                    Período
                    <input name="period" type="month" required />
                  </label>
                  <label>
                    Moeda
                    <input
                      name="currency"
                      maxLength={3}
                      defaultValue="AOA"
                      required
                    />
                  </label>
                </div>
                <div>
                  <label>
                    Sistema de origem
                    <input
                      name="sourceSystem"
                      required
                      placeholder="ERP / Excel"
                    />
                  </label>
                </div>
                <section className="fd-dropzone">
                  <div>
                    <b>{importFile || "Selecione o balancete em CSV"}</b>
                    <small>Cabeçalhos reconhecidos: código, descrição e valor · máximo 5 MB</small>
                  </div>
                  <label className="primario">
                    Escolher CSV
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      onChange={(event) => chooseImport(event.target.files?.[0])}
                    />
                  </label>
                  <button type="button" className="secundario" onClick={downloadTemplate}>
                    ↓ Descarregar template
                  </button>
                </section>
                {!!(importErrors.length || importRows.some((x) => x.errors.length)) && (
                  <div className="fd-validation-errors" role="alert">
                    <b>Validação requer atenção</b>
                    {[...importErrors, ...importRows.flatMap((row) => row.errors.map((x) => `Linha ${row.rowNumber}: ${x}`))]
                      .slice(0, 6)
                      .map((message) => <span key={message}>{message}</span>)}
                  </div>
                )}
                {!!importRows.length && (
                  <div className="fd-preview">
                    <header>
                      <b>Pré-visualização determinística</b>
                      <em>{importRows.length} linha(s) · {importRows.filter((x) => !x.errors.length).length} válidas</em>
                    </header>
                    <table>
                      <thead><tr><th>Linha</th><th>Código</th><th>Descrição</th><th>Valor</th><th>Estado</th></tr></thead>
                      <tbody>{importRows.slice(0, 8).map((row) => (
                        <tr key={row.rowNumber}>
                          <td>{row.rowNumber}</td><td><code>{row.code || "—"}</code></td>
                          <td>{row.description || "—"}</td><td>{row.amount || "—"}</td>
                          <td className={row.errors.length ? "bad" : "good"}>{row.errors.length ? "Corrigir" : "Válida"}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}
              </>
            )}
            {error && <p className="erro-form">{error}</p>}
            <footer>
              <button
                type="button"
                className="secundario"
                onClick={() => setModal("")}
              >
                Cancelar
              </button>
              <button
                className="primario"
                disabled={busy || (modal === "createBatch" && (!importRows.length || !!importErrors.length || importRows.some((x) => x.errors.length)))}
              >
                {busy ? "A processar…" : "Confirmar"}
              </button>
            </footer>
          </form>
        </div>
      )}
    </section>
  );
}
