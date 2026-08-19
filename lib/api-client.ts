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
