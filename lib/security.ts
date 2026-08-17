export function belongsToTenant(resourceTenantId:string,contextTenantId:string){return resourceTenantId===contextTenantId}
export function hasPermission(permissions:readonly string[],required:string){return permissions.includes(required)}
