import { sqliteTable, text } from "drizzle-orm/sqlite-core";

const base = { id: text("id").primaryKey(), tenantId: text("tenant_id").notNull(), createdAt: text("created_at").notNull() };
export const organizations = sqliteTable("organizations", { ...base, code: text("code").notNull(), name: text("name").notNull(), kind: text("kind").notNull(), currency: text("currency").notNull(), status: text("status").notNull() });
export const platformUsers = sqliteTable("platform_users", { ...base, name: text("name").notNull(), email: text("email").notNull(), role: text("role").notNull(), organizationId: text("organization_id"), status: text("status").notNull() });
export const employees = sqliteTable("employees", { ...base, employeeNumber: text("employee_number").notNull(), firstName: text("first_name").notNull(), lastName: text("last_name").notNull(), organizationId: text("organization_id").notNull(), jobTitle: text("job_title").notNull(), hireDate: text("hire_date").notNull(), status: text("status").notNull() });
export const auditEvents = sqliteTable("audit_events", { ...base, action: text("action").notNull(), entityType: text("entity_type").notNull(), entityId: text("entity_id").notNull(), actor: text("actor").notNull(), summary: text("summary").notNull() });
