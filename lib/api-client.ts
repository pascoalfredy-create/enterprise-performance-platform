export function apiFetch(input:RequestInfo|URL,init:RequestInit={}){
 const headers=new Headers(init.headers);
 if(typeof window!=="undefined"){
  const token=sessionStorage.getItem("ep_access_token");
  if(token&&!headers.has("authorization"))headers.set("authorization",`Bearer ${token}`);
  const tenant=localStorage.getItem("ep_active_tenant");
  if(tenant&&!headers.has("x-tenant-id"))headers.set("x-tenant-id",tenant);
 }
 return fetch(input,{...init,headers});
}

export async function readApiJson<T=Record<string,unknown>>(response:Response):Promise<T>{
 const contentType=response.headers.get("content-type")||"";
 const text=await response.text();
 if(!contentType.toLowerCase().includes("application/json"))
  throw new Error(response.status===401?"A sessão expirou. Entre novamente.":"O serviço devolveu uma resposta inválida. Atualize a página; se persistir, contacte o suporte.");
 try{return JSON.parse(text) as T}catch{throw new Error("O serviço devolveu dados incompletos. Atualize a página e tente novamente.")}
}
