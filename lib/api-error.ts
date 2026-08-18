export type ApiErrorClassification={status:number;code:string;message:string};

export function classifyDataError(error:unknown,fallback:string):ApiErrorClassification{
 const detail=error instanceof Error?error.message:String(error||"");
 if(/UNIQUE constraint failed/i.test(detail))return{status:409,code:"CONFLICT",message:"O registo já existe ou a operação foi concluída em paralelo. Atualize os dados e confirme o resultado."};
 if(/immutable/i.test(detail))return{status:409,code:"IMMUTABLE_RECORD",message:"O registo está fechado ou emitido e já não pode ser alterado."};
 if(/outside tenant/i.test(detail))return{status:403,code:"TENANT_SCOPE_VIOLATION",message:"A referência selecionada não pertence ao âmbito autorizado."};
 if(/invalid |must reconcile/i.test(detail))return{status:422,code:"DATA_INVARIANT",message:"Os dados não respeitam as regras determinísticas desta operação."};
 return{status:500,code:"INTERNAL_ERROR",message:fallback};
}
