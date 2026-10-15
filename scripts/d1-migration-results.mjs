// Fail closed: a missing or malformed result must never replay migrations.
export function parseMigrationResults(output) {
  const statements = JSON.parse(output);
  if (!Array.isArray(statements) || statements.length !== 1) {
    throw new Error("Expected one migration tracking query result");
  }
  const statement = statements[0];
  if (statement.success !== true || !Array.isArray(statement.results)) {
    throw new Error("Migration tracking query did not succeed");
  }
  const filenames = new Set();
  for (const row of statement.results) {
    if (typeof row.filename !== "string" || !row.filename.endsWith(".sql")) {
      throw new Error("Invalid migration tracking row");
    }
    filenames.add(row.filename);
  }
  return filenames;
}
