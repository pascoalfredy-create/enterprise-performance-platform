export function matchesFileSignature(buffer:ArrayBuffer,mime:string):boolean {
 const b=new Uint8Array(buffer),prefix=(bytes:number[])=>bytes.every((n,i)=>b[i]===n);
 if(mime==='application/pdf')return prefix([37,80,68,70,45]);
 if(mime==='image/png')return prefix([137,80,78,71,13,10,26,10]);
 if(mime==='image/jpeg')return prefix([255,216,255]);
 return false;
}
