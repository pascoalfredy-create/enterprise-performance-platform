export type ApiErrorClassification={status:number;code:string;message:string};

export function classifyDataError(error:unknown,fallback:string):ApiErrorClassification{
 const detail=error instanceof Error?error.message:String(error||"");
 if(/linked financial source/i.test(detail))return{status:409,code:"FINANCIAL_SOURCE_LINKED",message:"Este valor já alimenta os mapas financeiros. Para alterar montante, período ou natureza, corrija primeiro o movimento em Saúde financeira e mapas. Categorias e descrições continuam editáveis."};
 if(/monthly payroll inputs are locked/i.test(detail))return{status:409,code:"PAYROLL_MONTH_LOCKED",message:"O mês já tem um processamento gravado. Para corrigir um rascunho, anule-o primeiro no histórico."};
 if(/matches_revision|UNIQUE constraint failed|duplicate employee payroll period|payroll settlement source changed|payroll monthly inputs changed|monthly payroll inputs are locked/i.test(detail))return{status:409,code:"CONFLICT",message:"O registo já existe ou a operação foi concluída em paralelo. Atualize os dados e confirme o resultado."};
 if(/immutable/i.test(detail))return{status:409,code:"IMMUTABLE_RECORD",message:"O registo está fechado ou emitido e já não pode ser alterado."};
 if(/not open|not closed|invalid .* transition/i.test(detail))return{status:409,code:"INVALID_STATE",message:"O estado atual do registo não permite esta operação."};
 if(/outside tenant/i.test(detail))return{status:403,code:"TENANT_SCOPE_VIOLATION",message:"A referência selecionada não pertence ao âmbito autorizado."};
 if(/invalid |must reconcile/i.test(detail))return{status:422,code:"DATA_INVARIANT",message:"Os dados não respeitam as regras determinísticas desta operação."};
 return{status:500,code:"INTERNAL_ERROR",message:fallback};
}
