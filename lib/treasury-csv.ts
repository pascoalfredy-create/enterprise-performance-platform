import {parseCsvLine} from './assisted-import';
import {parseMoneyMinor} from './money';
import {validTreasuryDate} from './treasury-engine';
export const treasuryCsvTemplate='data;direcao;rubrica;descricao;valor;referencia\n2026-11-01;Entrada;Clientes;Recebimento previsto;1000.00;ERP-DOC-001\n';
export function parseTreasuryCsv(raw:string){
 const lines=raw.replace(/^\uFEFF/,'').split(/\r?\n/).filter(x=>x.trim());
 if(lines.length<2||lines.length>501)throw new Error('CSV: 1–500 linhas, com cabeçalho.');
 const delimiter=lines[0].includes(';')?';':',';
 if(parseCsvLine(lines[0],delimiter).map(x=>x.toLowerCase()).join(';')!=='data;direcao;rubrica;descricao;valor;referencia')throw new Error('CSV: data;direcao;rubrica;descricao;valor;referencia');
 return lines.slice(1).map((line,index)=>{const cells=parseCsvLine(line,delimiter);const [date,direction,category,description,amount,reference]=cells;if(cells.length!==6||!validTreasuryDate(date)||!['Entrada','Saída'].includes(direction)||!category||!description||!reference||parseMoneyMinor(amount)<=0)throw new Error('CSV: linha '+(index+2)+' inválida.');return{date,direction,category,description,amount,reference}});
}
