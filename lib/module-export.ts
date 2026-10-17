import {buildXlsxBlob} from './xlsx';
export function downloadBlob(blob:Blob,name:string){const link=document.createElement('a'),url=URL.createObjectURL(blob);link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
export function exportModuleExcel(root:HTMLElement,title:string){
 const tables=Array.from(root.querySelectorAll('table')).filter(table=>!table.closest('[role="dialog"],.fl-overlay,.modal-inline,[hidden],[aria-hidden="true"]'));
 const sheets=tables.map((table,index)=>({name:String(index+1),rows:Array.from(table.rows).map(row=>Array.from(row.cells).map(cell=>cell.innerText.trim()))}));
 const summary=Array.from(root.querySelectorAll('h1,h2,h3,p,figcaption,.fl-kpis strong,.fl-kpis span')).filter(node=>!node.closest('[role="dialog"],.fl-overlay,.modal-inline,.module-transfer-tools,[hidden]')).map(node=>[(node.textContent||'').trim()]).filter(row=>row[0]);
 if(sheets.length)sheets.unshift({name:'Resumo',rows:[[title],[new Date().toISOString()],...summary]});
 if(!sheets.length){const text=root.cloneNode(true) as HTMLElement;text.querySelectorAll('button,input,select,textarea,nav,.module-transfer-tools,.fl-overlay,.modal-inline,[hidden],[aria-hidden="true"]').forEach(node=>node.remove());sheets.push({name:'1',rows:[[title],...[...text.querySelectorAll('h1,h2,h3,p,strong,figcaption')].map(node=>[(node.textContent||'').trim()]).filter(row=>row[0])]})}
 downloadBlob(buildXlsxBlob(sheets),title.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]/g,'_')+'.xlsx');
}
/** Print only the chosen view using the browser's PDF destination. */
export async function exportModulePdf(root:HTMLElement,title:string){
 const frame=document.createElement('iframe');frame.style.cssText='position:fixed;width:1px;height:1px;left:-10000px;top:0;border:0';document.body.appendChild(frame);
 const doc=frame.contentDocument,win=frame.contentWindow;if(!doc||!win){frame.remove();throw new Error('PDF unavailable')}
 doc.open();doc.write('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');doc.close();doc.title=title;
 const heading=doc.createElement('h1');heading.textContent=title;doc.body.appendChild(heading);
 document.querySelectorAll('link[rel="stylesheet"],style').forEach(style=>doc.head.appendChild(style.cloneNode(true)));
 const report=root.matches('[data-feasibility-report="complete"],[data-executive-report="complete"]')?root:root.querySelector<HTMLElement>('[data-executive-report="complete"],[data-feasibility-report="complete"]');
 const content=(report||root).cloneNode(true) as HTMLElement;content.removeAttribute('hidden');content.removeAttribute('aria-hidden');content.querySelectorAll('button,input,select,textarea,nav,.module-transfer-tools,.fl-overlay,.modal-inline,.bank-file,[hidden],[aria-hidden="true"]').forEach(node=>node.remove());content.querySelectorAll('details').forEach(detail=>detail.open=true);doc.body.appendChild(content);
 const css=doc.createElement('style');css.textContent='@page{size:A4 landscape;margin:12mm}body{background:white;color:#173455;font:12px Arial,sans-serif}table{width:100%;border-collapse:collapse}td,th{padding:7px;border-bottom:1px solid #dde4ea;text-align:left}tr,figure,article{break-inside:avoid}h1{font-size:20px}*{overflow:visible!important;max-height:none!important;box-shadow:none!important}.feasibility-report{position:static!important;inset:auto!important;height:auto!important;padding:0!important;visibility:visible!important}.report-controls{display:none!important}body{visibility:visible!important}.fl-workspace{font-size:12px}.fl-scroll td,.fl-scroll th{white-space:normal!important;overflow-wrap:anywhere;font-size:10px}';doc.head.appendChild(css);
 await Promise.all(Array.from(doc.querySelectorAll('link[rel="stylesheet"]')).map(link=>new Promise<void>(resolve=>{if((link as HTMLLinkElement).sheet)return resolve();link.addEventListener('load',()=>resolve(),{once:true});link.addEventListener('error',()=>resolve(),{once:true});setTimeout(resolve,2500)})));
 await doc.fonts.ready;win.addEventListener('afterprint',()=>frame.remove(),{once:true});win.focus();win.print();setTimeout(()=>frame.remove(),60000);
}
