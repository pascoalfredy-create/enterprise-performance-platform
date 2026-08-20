CREATE TABLE IF NOT EXISTS performance_cycles (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('Rascunho','Ativo','Fechado')), created_by TEXT NOT NULL, created_at TEXT NOT NULL,
 activated_by TEXT, activated_at TEXT, closed_at TEXT, UNIQUE(tenant_id,name,start_date,end_date)
);
CREATE TABLE IF NOT EXISTS performance_goals (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, cycle_id TEXT NOT NULL, organization_id TEXT NOT NULL, owner_email TEXT NOT NULL,
 title TEXT NOT NULL, description TEXT, metric_name TEXT NOT NULL, unit TEXT NOT NULL,
 direction TEXT NOT NULL CHECK(direction IN ('Aumentar','Reduzir')), start_scaled INTEGER NOT NULL, target_scaled INTEGER NOT NULL,
 scale INTEGER NOT NULL DEFAULT 100 CHECK(scale IN (1,10,100,1000)), weight_bps INTEGER NOT NULL CHECK(weight_bps BETWEEN 1 AND 10000),
 status TEXT NOT NULL CHECK(status IN ('Rascunho','Ativo','Concluído','Cancelado')), created_by TEXT NOT NULL, created_at TEXT NOT NULL,
 completed_at TEXT, FOREIGN KEY(cycle_id) REFERENCES performance_cycles(id), FOREIGN KEY(organization_id) REFERENCES organizations(id)
);
CREATE TABLE IF NOT EXISTS performance_goal_checkins (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, goal_id TEXT NOT NULL, value_scaled INTEGER NOT NULL,
 note TEXT, evidence TEXT, checked_by TEXT NOT NULL, checked_at TEXT NOT NULL, FOREIGN KEY(goal_id) REFERENCES performance_goals(id),
 UNIQUE(tenant_id,goal_id,checked_at)
);
CREATE INDEX IF NOT EXISTS performance_goals_scope_idx ON performance_goals(tenant_id,organization_id,cycle_id,status,owner_email);
CREATE INDEX IF NOT EXISTS goal_checkins_timeline_idx ON performance_goal_checkins(tenant_id,goal_id,checked_at);
CREATE TRIGGER IF NOT EXISTS performance_goal_reference_guard BEFORE INSERT ON performance_goals
WHEN NOT EXISTS(SELECT 1 FROM performance_cycles c JOIN organizations o ON o.tenant_id=c.tenant_id JOIN platform_users u ON u.tenant_id=c.tenant_id WHERE c.id=NEW.cycle_id AND c.tenant_id=NEW.tenant_id AND c.status='Rascunho' AND o.id=NEW.organization_id AND o.status='Ativa' AND lower(u.email)=lower(NEW.owner_email) AND u.status='Ativo') OR (NEW.direction='Aumentar' AND NEW.target_scaled<=NEW.start_scaled) OR (NEW.direction='Reduzir' AND NEW.target_scaled>=NEW.start_scaled)
BEGIN SELECT RAISE(ABORT,'invalid performance goal reference or target'); END;
CREATE TRIGGER IF NOT EXISTS performance_cycle_transition_guard BEFORE UPDATE ON performance_cycles
WHEN NEW.id<>OLD.id OR NEW.tenant_id<>OLD.tenant_id OR NEW.name<>OLD.name OR NEW.start_date<>OLD.start_date OR NEW.end_date<>OLD.end_date OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at OR NOT ((OLD.status='Rascunho' AND NEW.status='Ativo') OR (OLD.status='Ativo' AND NEW.status='Fechado'))
BEGIN SELECT RAISE(ABORT,'invalid performance cycle transition'); END;
CREATE TRIGGER IF NOT EXISTS performance_cycle_activates_goals AFTER UPDATE ON performance_cycles
WHEN OLD.status='Rascunho' AND NEW.status='Ativo'
BEGIN UPDATE performance_goals SET status='Ativo' WHERE cycle_id=NEW.id AND tenant_id=NEW.tenant_id AND status='Rascunho'; END;
CREATE TRIGGER IF NOT EXISTS goal_checkin_reference_guard BEFORE INSERT ON performance_goal_checkins
WHEN NOT EXISTS(SELECT 1 FROM performance_goals g WHERE g.id=NEW.goal_id AND g.tenant_id=NEW.tenant_id AND g.status='Ativo')
BEGIN SELECT RAISE(ABORT,'check-in requires active goal'); END;
CREATE TRIGGER IF NOT EXISTS goal_checkin_append_only_update BEFORE UPDATE ON performance_goal_checkins BEGIN SELECT RAISE(ABORT,'goal check-ins are append only'); END;
CREATE TRIGGER IF NOT EXISTS goal_checkin_append_only_delete BEFORE DELETE ON performance_goal_checkins BEGIN SELECT RAISE(ABORT,'goal check-ins are append only'); END;
CREATE TRIGGER IF NOT EXISTS performance_goal_no_delete BEFORE DELETE ON performance_goals BEGIN SELECT RAISE(ABORT,'performance goals cannot be deleted'); END;
CREATE TRIGGER IF NOT EXISTS performance_goal_transition_guard BEFORE UPDATE ON performance_goals
WHEN NEW.id<>OLD.id OR NEW.tenant_id<>OLD.tenant_id OR NEW.cycle_id<>OLD.cycle_id OR NEW.organization_id<>OLD.organization_id OR NEW.owner_email<>OLD.owner_email OR NEW.title<>OLD.title OR NEW.metric_name<>OLD.metric_name OR NEW.unit<>OLD.unit OR NEW.direction<>OLD.direction OR NEW.start_scaled<>OLD.start_scaled OR NEW.target_scaled<>OLD.target_scaled OR NEW.scale<>OLD.scale OR NEW.weight_bps<>OLD.weight_bps OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at OR NOT ((OLD.status='Rascunho' AND NEW.status='Ativo') OR (OLD.status='Ativo' AND NEW.status IN ('Concluído','Cancelado')))
BEGIN SELECT RAISE(ABORT,'invalid performance goal transition'); END;
CREATE TRIGGER IF NOT EXISTS performance_goal_completion_guard BEFORE UPDATE ON performance_goals
WHEN NEW.status='Concluído' AND NOT EXISTS(SELECT 1 FROM performance_goal_checkins c WHERE c.goal_id=NEW.id AND c.tenant_id=NEW.tenant_id AND c.checked_at=(SELECT MAX(x.checked_at) FROM performance_goal_checkins x WHERE x.goal_id=NEW.id AND x.tenant_id=NEW.tenant_id) AND ((NEW.direction='Aumentar' AND c.value_scaled>=NEW.target_scaled) OR (NEW.direction='Reduzir' AND c.value_scaled<=NEW.target_scaled)))
BEGIN SELECT RAISE(ABORT,'goal target not reached'); END;
