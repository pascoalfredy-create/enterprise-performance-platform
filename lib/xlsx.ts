// Minimal, dependency-free .xlsx (OOXML) reader/writer. Writes every part
// as an uncompressed ("stored") ZIP entry, which Excel/LibreOffice/Google
// Sheets all accept; reading tolerates both stored and deflate-compressed
// entries (every real spreadsheet tool compresses), using the browser's
// native DecompressionStream so no inflate implementation is needed here.

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();
const crc32 = (bytes: Uint8Array) => {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++)
    c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const textToBytes = (text: string) => new TextEncoder().encode(text);
const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const colLetters = (index: number) => {
  let n = index + 1,
    letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
};

export type XlsxCell=string|number|{formula?:string;value:string|number;style?:number};
export type SheetInput={name:string;rows:XlsxCell[][];rowNotes?:Record<number,{formula:string;note:string;unit?:string}>;protect?:boolean;signedRanges?:string[];signedTotalRanges?:string[];widths?:number[];freeze?:boolean;hiddenColumns?:number[];hiddenRows?:number[];validations?:{range:string;type:'decimal'|'whole'|'list';min?:number;max?:number|string;values?:string}[]};

function buildZip(parts: Array<{ path: string; data: Uint8Array }>) {
  const chunks: Uint8Array[] = [];
  const centralRecords: Uint8Array[] = [];
  let offset = 0;
  const dosTime = 0,
    dosDate = 0x21;
  for (const part of parts) {
    const nameBytes = textToBytes(part.path),
      crc = crc32(part.data),
      size = part.data.length;
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0, true);
    local.setUint16(8, 0, true);
    local.setUint16(10, dosTime, true);
    local.setUint16(12, dosDate, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true);
    local.setUint32(22, size, true);
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true);
    chunks.push(new Uint8Array(local.buffer), nameBytes, part.data);
    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, 0, true);
    central.setUint16(10, 0, true);
    central.setUint16(12, dosTime, true);
    central.setUint16(14, dosDate, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, size, true);
    central.setUint32(24, size, true);
    central.setUint16(28, nameBytes.length, true);
    central.setUint16(30, 0, true);
    central.setUint16(32, 0, true);
    central.setUint16(34, 0, true);
    central.setUint16(36, 0, true);
    central.setUint32(38, 0, true);
    central.setUint32(42, offset, true);
    centralRecords.push(new Uint8Array(central.buffer), nameBytes);
    offset += local.buffer.byteLength + nameBytes.length + size;
  }
  const centralStart = offset;
  for (const record of centralRecords) offset += record.length;
  const centralSize = offset - centralStart;
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(4, 0, true);
  end.setUint16(6, 0, true);
  end.setUint16(8, parts.length, true);
  end.setUint16(10, parts.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, centralStart, true);
  end.setUint16(20, 0, true);
  return new Blob([...chunks.map(x=>new Uint8Array(x)), ...centralRecords.map(x=>new Uint8Array(x)), new Uint8Array(end.buffer)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function signedRules(sheet:SheetInput){return [sheet.signedRanges,sheet.signedTotalRanges].map((ranges,i)=>ranges?.length?`<conditionalFormatting sqref="${escapeXml(ranges.join(' '))}"><cfRule type="cellIs" dxfId="${i*2}" priority="${i*2+1}" operator="lessThanOrEqual"><formula>-0.005</formula></cfRule><cfRule type="cellIs" dxfId="${i*2+1}" priority="${i*2+2}" operator="greaterThanOrEqual"><formula>0.005</formula></cfRule></conditionalFormatting>`:'').join('')}
function sheetXml(sheet:SheetInput) {
  const rows=sheet.rows;
  const rowsXml = rows
    .map((row, rIndex) => {
      const cells = row
        .map((value, cIndex) => {
          const ref = `${colLetters(cIndex)}${rIndex + 1}`;
          if(typeof value==='object'&&value?.formula&&value.formula.length>8192)throw new Error('A fórmula excede o limite do Excel.');
          const cell=typeof value==='object'&&value!==null?value:{value},v=cell.value,style=cell.style??0,f=cell.formula?`<f>${escapeXml(cell.formula.replace(/^=/,''))}</f>`:'';
          if(typeof v==='number')return Number.isFinite(v)?`<c r="${ref}" s="${style}">${f}<v>${v}</v></c>`:`<c r="${ref}" s="${style}" t="e">${f}<v>#N/A</v></c>`;
          const text=v===null||v===undefined?'':String(v);
          return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`;
        })
        .join("");
      return `<row r="${rIndex + 1}"${sheet.hiddenRows?.includes(rIndex+1)?' hidden="1"':''}>${cells}</row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${sheet.freeze?'<sheetViews><sheetView workbookViewId="0"><pane xSplit="2" ySplit="2" topLeftCell="C3" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>':''}${sheet.widths?'<cols>'+sheet.widths.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('')+(sheet.hiddenColumns||[]).map(i=>`<col min="${i+1}" max="${i+1}" hidden="1"/>`).join('')+'</cols>':''}<sheetData>${rowsXml}</sheetData>${sheet.protect?'<sheetProtection sheet="1" objects="1" scenarios="1"/>':''}${signedRules(sheet)}${sheet.validations?.length?'<dataValidations count="'+sheet.validations.length+'">'+sheet.validations.map(v=>`<dataValidation type="${v.type}" ${v.type==='list'?'':'operator="between" '}allowBlank="0" showErrorMessage="1" errorStyle="stop" sqref="${escapeXml(v.range)}"><formula1>${v.type==='list'?'&quot;'+escapeXml(v.values||'')+'&quot;':v.min??0}</formula1>${v.type==='list'?'':`<formula2>${v.max??1000000000000}</formula2>`}</dataValidation>`).join('')+'</dataValidations>':''}</worksheet>`;
}

export function buildXlsxBlob(sheets: SheetInput[]) {
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets
    .map(
      (_, i) =>
        `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join("")}</Types>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
    )
    .join("")}<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets
    .map(
      (sheet, i) =>
        `<sheet name="${escapeXml(sheet.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
    )
    .join("")}</sheets><calcPr calcId="191029" calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>`;
  const styles=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="3"><numFmt numFmtId="164" formatCode="#,##0.00;(#,##0.00);&quot;—&quot;"/><numFmt numFmtId="165" formatCode="0.00&quot;%&quot;"/><numFmt numFmtId="166" formatCode="0.00&quot;×&quot;"/></numFmts><fonts count="3"><font><sz val="11"/><name val="Calibri"/><color rgb="FF173455"/></font><font><b/><sz val="11"/><name val="Calibri"/><color rgb="FFFFFFFF"/></font><font><b/><sz val="11"/><name val="Calibri"/><color rgb="FF173455"/></font></fonts><fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE4EFFA"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF07574C"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE9F2EF"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE7EEF6"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="13"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/><xf numFmtId="4" fontId="0" fillId="2" borderId="0" applyNumberFormat="1" applyProtection="1"><protection locked="0"/></xf><xf numFmtId="0" fontId="1" fillId="3" borderId="0"/><xf numFmtId="0" fontId="0" fillId="2" borderId="0" applyProtection="1"><protection locked="0"/></xf><xf numFmtId="1" fontId="0" fillId="2" borderId="0" applyProtection="1"><protection locked="0"/></xf><xf numFmtId="164" fontId="2" fillId="4" borderId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="1" fillId="3" borderId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="2" fillId="5" borderId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/><xf numFmtId="166" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="4"><dxf><font><color rgb="FFB42318"/></font></dxf><dxf><font><color rgb="FF137447"/></font></dxf><dxf><font><color rgb="FFFFB4B4"/></font></dxf><dxf><font><color rgb="FF86EFAC"/></font></dxf></dxfs></styleSheet>`;
  const parts: Array<{ path: string; data: Uint8Array }> = [
    { path: "[Content_Types].xml", data: textToBytes(contentTypes) },
    { path: "_rels/.rels", data: textToBytes(rootRels) },
    { path: "xl/workbook.xml", data: textToBytes(workbook) },
    { path: "xl/_rels/workbook.xml.rels", data: textToBytes(workbookRels) },
    { path: "xl/styles.xml", data: textToBytes(styles) },
    ...sheets.map((sheet, i) => ({
      path: `xl/worksheets/sheet${i + 1}.xml`,
      data: textToBytes(sheetXml(sheet)),
    })),
  ];
  return buildZip(parts);
}

async function inflateIfNeeded(bytes: Uint8Array, method: number) {
  if (method === 0) return bytes;
  const stream = new Blob([new Uint8Array(bytes)])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function readZipEntry(buffer: ArrayBuffer, name: string) {
  const view = new DataView(buffer),
    bytes = new Uint8Array(buffer);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0 && i >= bytes.length - 22 - 65536; i--)
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw new Error("Ficheiro xlsx inválido.");
  const entryCount = view.getUint16(eocd + 10, true),
    centralStart = view.getUint32(eocd + 16, true);
  let pointer = centralStart;
  for (let i = 0; i < entryCount; i++) {
    if (view.getUint32(pointer, true) !== 0x02014b50)
      throw new Error("Ficheiro xlsx inválido.");
    const method = view.getUint16(pointer + 10, true),
      compressedSize = view.getUint32(pointer + 20, true),
      nameLength = view.getUint16(pointer + 28, true),
      extraLength = view.getUint16(pointer + 30, true),
      commentLength = view.getUint16(pointer + 32, true),
      localOffset = view.getUint32(pointer + 42, true),
      entryName = new TextDecoder().decode(
        bytes.subarray(pointer + 46, pointer + 46 + nameLength),
      );
    if (entryName === name) {
      const localNameLength = view.getUint16(localOffset + 26, true),
        localExtraLength = view.getUint16(localOffset + 28, true),
        dataStart = localOffset + 30 + localNameLength + localExtraLength;
      return {
        method,
        data: bytes.slice(dataStart, dataStart + compressedSize),
      };
    }
    pointer += 46 + nameLength + extraLength + commentLength;
  }
  return null;
}

function cellsFromRowXml(rowXml: string) {
  const cells = new Map<number, { type: string; value: string }>();
  const cellPattern = /<c\b[^>]*r="([A-Z]+)\d+"[^>]*?(?:\/>|>([\s\S]*?)<\/c>)/g;
  const typePattern = /\bt="([a-zA-Z]+)"/;
  let match: RegExpExecArray | null;
  while ((match = cellPattern.exec(rowXml))) {
    const [full, colRef, inner] = match,
      typeMatch = full.match(typePattern),
      type = typeMatch ? typeMatch[1] : "n";
    let value = "";
    if (inner) {
      if (type === "inlineStr") {
        const texts = [...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)];
        value = texts.map((t) => t[1]).join("");
      } else {
        const valueMatch = inner.match(/<v>([\s\S]*?)<\/v>/);
        value = valueMatch ? valueMatch[1] : "";
      }
    }
    let col = 0;
    for (const ch of colRef) col = col * 26 + (ch.charCodeAt(0) - 64);
    cells.set(col - 1, { type, value });
  }
  return cells;
}

export async function parseXlsxFile(file: File) {
  const buffer = await file.arrayBuffer();
  const sheetEntry = readZipEntry(buffer, "xl/worksheets/sheet1.xml");
  if (!sheetEntry) throw new Error("O ficheiro não contém uma folha de cálculo válida.");
  const sheetBytes = await inflateIfNeeded(sheetEntry.data, sheetEntry.method),
    sheetText = new TextDecoder("utf-8").decode(sheetBytes);
  let sharedStrings: string[] = [];
  const sharedEntry = readZipEntry(buffer, "xl/sharedStrings.xml");
  if (sharedEntry) {
    const sharedBytes = await inflateIfNeeded(sharedEntry.data, sharedEntry.method),
      sharedText = new TextDecoder("utf-8").decode(sharedBytes);
    sharedStrings = [...sharedText.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((si) =>
      [...si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(""),
    );
  }
  const decodeEntities = (value: string) =>
    value
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&");
  const rows: string[][] = [];
  for (const rowMatch of sheetText.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = cellsFromRowXml(rowMatch[1]);
    const maxCol = cells.size ? Math.max(...cells.keys()) : -1,
      row: string[] = [];
    for (let i = 0; i <= maxCol; i++) {
      const cell = cells.get(i);
      if (!cell) {
        row.push("");
        continue;
      }
      row.push(
        decodeEntities(
          cell.type === "s" ? sharedStrings[Number(cell.value)] || "" : cell.value,
        ),
      );
    }
    rows.push(row);
  }
  return rows;
}
