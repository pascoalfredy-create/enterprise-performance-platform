import type {D1Database} from '../worker-configuration';

// Tenant membership does not grant access to every company inside that tenant.
export async function budgetOrganizationAccess(db:D1Database,tenantId:string,scope:string|null,claimed:unknown){
 const organizationId=typeof claimed==='string'?claimed:'';
 if(!organizationId||(scope&&scope!==organizationId)||!await db.prepare('SELECT id FROM organizations WHERE id=? AND tenant_id=?').bind(organizationId,tenantId).first())return Response.json({error:'Organização fora do âmbito autorizado.'},{status:403});
 return null;
}
export async function budgetResourceAccess(db:D1Database,tenantId:string,scope:string|null,kind:'mapping'|'assumption',id:unknown){
 if(typeof id!=='string'||!id)return Response.json({error:'Recurso fora do âmbito autorizado.'},{status:403});
 const table=kind==='mapping'?'financial_line_catalog_mappings':'budget_assumptions';
 const row=await db.prepare('SELECT organization_id FROM '+table+' WHERE id=? AND tenant_id=?').bind(id,tenantId).first<{organization_id:string}>();
 if(!row)return Response.json({error:'Recurso fora do âmbito autorizado.'},{status:403});
 return budgetOrganizationAccess(db,tenantId,scope,row.organization_id);
}
