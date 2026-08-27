export type AssistedRow = {
  code: string;
  description: string;
  amount: string;
  rowNumber: number;
  errors: string[];
};

const headerAliases: Record<string, "code" | "description" | "amount"> = {
  codigo: "code",
  code: "code",
  conta: "code",
  account: "code",
  descricao: "description",
  description: "description",
  nome: "description",
  valor: "amount",
  amount: "amount",
  saldo: "amount",
  balance: "amount",
};

const cleanHeader = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

export function parseCsvLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      cells.push(current.trim());
      current = "";
    } else current += character;
  }
  cells.push(current.trim());
  return cells;
}

export function parseFinancialCsv(raw: string) {
  const lines = raw
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim());
  if (!lines.length)
    return { delimiter: ";", headers: [], rows: [], errors: ["O ficheiro está vazio."] };
  const first = lines[0];
  const delimiter =
    (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length
      ? ";"
      : ",";
  const sourceHeaders = parseCsvLine(first, delimiter);
  const mapped = sourceHeaders.map((header) => headerAliases[cleanHeader(header)]);
  const hasHeader = mapped.filter(Boolean).length >= 2;
  const positions = hasHeader
    ? {
        code: mapped.indexOf("code"),
        description: mapped.indexOf("description"),
        amount: mapped.indexOf("amount"),
      }
    : { code: 0, description: 1, amount: 2 };
  const errors: string[] = [];
  if (hasHeader && Object.values(positions).some((position) => position < 0))
    errors.push("Cabeçalhos obrigatórios: código, descrição e valor.");
  const rows = lines.slice(hasHeader ? 1 : 0).map((line, index) => {
    const cells = parseCsvLine(line, delimiter);
    const code = String(cells[positions.code] || "").trim();
    const description = String(cells[positions.description] || code).trim();
    const amount = String(cells[positions.amount] || "").trim();
    const normalizedAmount = amount
      .replace(/\s/g, "")
      .replace(/\.(?=\d{3}(?:\D|$))/g, "")
      .replace(",", ".");
    const rowErrors: string[] = [];
    if (!code) rowErrors.push("Código em falta");
    if (!description) rowErrors.push("Descrição em falta");
    if (!amount || !Number.isFinite(Number(normalizedAmount)))
      rowErrors.push("Valor inválido");
    return {
      code,
      description,
      amount: normalizedAmount,
      rowNumber: index + (hasHeader ? 2 : 1),
      errors: rowErrors,
    };
  });
  if (rows.length > 5000) errors.push("O máximo por lote é 5 000 linhas.");
  if (!rows.length) errors.push("O ficheiro não contém linhas de dados.");
  return { delimiter, headers: sourceHeaders, rows, errors };
}

export const financialCsvTemplate =
  "codigo;descricao;valor\n701;Receita de serviços;1500000,00\n611;Serviços de terceiros;-350000,00\n";
