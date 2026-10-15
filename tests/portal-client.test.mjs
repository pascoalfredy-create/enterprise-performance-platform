import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
registerHooks({resolve(s,c,n){try{return n(s,c)}catch(e){if(e.code==='ERR_MODULE_NOT_FOUND'&&s.startsWith('.')&&!s.endsWith('.ts'))return n(s+'.ts',c);throw e}}});
const { portalFetch } = await import("../lib/portal-client.ts");
test("portal mutations preserve payload and surface server errors without caching", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls++;
    assert.equal(init.cache, "no-store");
    assert.equal(init.method, "POST");
    assert.equal(init.body, '{"type":"leaveRequest"}');
    return Response.json({error:"Saldo insuficiente"},{status:409});
  };
  try {
    const response=await portalFetch("/api/self-service",{method:"POST",body:'{"type":"leaveRequest"}'});
    assert.equal(response.ok,false);
    assert.equal((await response.json()).error,"Saldo insuficiente");
    assert.equal(calls,1);
  } finally { globalThis.fetch=original; }
});
test("portal network and invalid JSON failures resolve once without retrying writes", async () => {
  const original=globalThis.fetch;
  try {
    for (const mode of ["network","html","json"]) {
      let calls=0;
      globalThis.fetch=async()=>{calls++;if(mode==="network")throw new Error("offline");if(mode==="html")return new Response("Gateway",{status:502});return new Response("{",{headers:{"content-type":"application/json"}})};
      const response=await portalFetch("/api/self-service",{method:"POST"});
      assert.equal(response.ok,false);
      assert.match((await response.json()).error,/Atualize os dados/);
      assert.equal(calls,1);
    }
  } finally { globalThis.fetch=original; }
});
test("expired portal sessions cannot be mistaken for successful data",async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>Response.json({},{status:401});
  try{const response=await portalFetch("/api/self-service");assert.equal(response.ok,false);assert.match((await response.json()).error,/sessão expirou/)}finally{globalThis.fetch=original}
});
