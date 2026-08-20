CREATE TABLE IF NOT EXISTS industry_packs (
 code TEXT PRIMARY KEY,name TEXT NOT NULL,description TEXT NOT NULL,methodology_name TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('Ativo','Piloto','Inativo')),version_number INTEGER NOT NULL,created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS industry_sectors (
 code TEXT PRIMARY KEY,name TEXT NOT NULL,pack_code TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('Ativo','Inativo')),FOREIGN KEY(pack_code) REFERENCES industry_packs(code)
);
CREATE TABLE IF NOT EXISTS industry_pack_metrics (
 pack_code TEXT NOT NULL,metric_code TEXT NOT NULL,weight_bps INTEGER NOT NULL CHECK(weight_bps>0 AND weight_bps<=10000),PRIMARY KEY(pack_code,metric_code),FOREIGN KEY(pack_code) REFERENCES industry_packs(code)
);
CREATE TABLE IF NOT EXISTS industry_pack_rules (
 id TEXT PRIMARY KEY,metric_code TEXT NOT NULL,min_value_bps INTEGER,max_value_bps INTEGER,score_bps INTEGER NOT NULL CHECK(score_bps BETWEEN 0 AND 10000),severity TEXT NOT NULL CHECK(severity IN ('Saudável','Atenção','Crítica')),recommendation TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tenant_business_profiles (
 tenant_id TEXT PRIMARY KEY,sector_code TEXT NOT NULL,industry_pack_code TEXT NOT NULL,core_business TEXT NOT NULL,country_code TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
 FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(sector_code) REFERENCES industry_sectors(code),FOREIGN KEY(industry_pack_code) REFERENCES industry_packs(code)
);
CREATE TABLE IF NOT EXISTS tenant_industry_pack_installations (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,pack_code TEXT NOT NULL,pack_version INTEGER NOT NULL,framework_id TEXT,installed_by TEXT NOT NULL,installed_at TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('Instalado','Substituído')),FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(pack_code) REFERENCES industry_packs(code),FOREIGN KEY(framework_id) REFERENCES diagnostic_frameworks(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_one_installed_industry_pack ON tenant_industry_pack_installations(tenant_id) WHERE status='Instalado';

INSERT OR IGNORE INTO industry_packs VALUES
 ('GENERAL','Empresas — Geral','Referência equilibrada para empresas sem pack especializado.','Diagnóstico Financeiro Geral','Ativo',1,'2026-08-20'),
 ('SERVICE','Serviços','Maior peso em margem, rentabilidade e conversão operacional.','Performance de Serviços','Ativo',1,'2026-08-20'),
 ('TRADE','Comércio e Distribuição','Maior peso em liquidez, inventário e rotação dos ativos.','Performance Comercial','Ativo',1,'2026-08-20'),
 ('CAPITAL','Operações Intensivas em Capital','Maior peso em solvência, autonomia, dívida e retorno dos ativos.','Performance Capital-Intensive','Ativo',1,'2026-08-20'),
 ('FINANCIAL','Serviços Financeiros','Pack inicial não regulatório; requer adaptação à supervisão aplicável.','Performance Financeira Não Regulatória','Piloto',1,'2026-08-20');

INSERT OR IGNORE INTO industry_sectors VALUES
 ('PROFESSIONAL_SERVICES','Serviços profissionais','SERVICE','Ativo'),('TECHNOLOGY','Tecnologia e software','SERVICE','Ativo'),('HEALTH','Saúde','SERVICE','Ativo'),('EDUCATION','Educação','SERVICE','Ativo'),('HOSPITALITY','Hotelaria e restauração','SERVICE','Ativo'),
 ('RETAIL','Comércio retalhista','TRADE','Ativo'),('WHOLESALE','Comércio grossista e distribuição','TRADE','Ativo'),
 ('MANUFACTURING','Indústria transformadora','CAPITAL','Ativo'),('MINING','Mineração e recursos naturais','CAPITAL','Ativo'),('CONSTRUCTION','Construção e engenharia','CAPITAL','Ativo'),('TRANSPORT','Transportes e logística','CAPITAL','Ativo'),('AGRICULTURE','Agricultura e agroindústria','CAPITAL','Ativo'),('ENERGY','Energia e utilities','CAPITAL','Ativo'),
 ('FINANCIAL_SERVICES','Serviços financeiros','FINANCIAL','Ativo'),('OTHER','Outro / diversificado','GENERAL','Ativo');

INSERT OR IGNORE INTO industry_pack_metrics VALUES
 ('GENERAL','CURRENT_RATIO',1500),('GENERAL','QUICK_RATIO',1000),('GENERAL','SOLVENCY',1000),('GENERAL','AUTONOMY',1000),('GENERAL','DEBT_RATIO',1000),('GENERAL','NET_MARGIN',1500),('GENERAL','ROA',1000),('GENERAL','ROE',1000),('GENERAL','ASSET_TURNOVER',1000),
 ('SERVICE','CURRENT_RATIO',1000),('SERVICE','QUICK_RATIO',1000),('SERVICE','CASH_RATIO',500),('SERVICE','SOLVENCY',1000),('SERVICE','AUTONOMY',1000),('SERVICE','DEBT_RATIO',500),('SERVICE','NET_MARGIN',2000),('SERVICE','ROA',1000),('SERVICE','ROE',1000),('SERVICE','ASSET_TURNOVER',1000),
 ('TRADE','CURRENT_RATIO',1500),('TRADE','QUICK_RATIO',1500),('TRADE','CASH_RATIO',500),('TRADE','SOLVENCY',500),('TRADE','AUTONOMY',500),('TRADE','DEBT_RATIO',1000),('TRADE','NET_MARGIN',1500),('TRADE','ROA',500),('TRADE','ROE',500),('TRADE','ASSET_TURNOVER',2000),
 ('CAPITAL','CURRENT_RATIO',1000),('CAPITAL','QUICK_RATIO',500),('CAPITAL','CASH_RATIO',500),('CAPITAL','SOLVENCY',1500),('CAPITAL','AUTONOMY',1500),('CAPITAL','DEBT_RATIO',1500),('CAPITAL','NET_MARGIN',1000),('CAPITAL','ROA',1000),('CAPITAL','ROE',1000),('CAPITAL','ASSET_TURNOVER',500),
 ('FINANCIAL','CURRENT_RATIO',1000),('FINANCIAL','QUICK_RATIO',500),('FINANCIAL','CASH_RATIO',1000),('FINANCIAL','SOLVENCY',1000),('FINANCIAL','AUTONOMY',1500),('FINANCIAL','DEBT_RATIO',1000),('FINANCIAL','NET_MARGIN',1000),('FINANCIAL','ROA',1000),('FINANCIAL','ROE',1000),('FINANCIAL','ASSET_TURNOVER',1000);

INSERT OR IGNORE INTO industry_pack_rules VALUES
 ('CURRENT_CRIT','CURRENT_RATIO',NULL,9999,2000,'Crítica','Reforçar fundo de maneio e rever obrigações de curto prazo.'),('CURRENT_WARN','CURRENT_RATIO',10000,14999,6000,'Atenção','Acompanhar capital circulante e melhorar a conversão em caixa.'),('CURRENT_OK','CURRENT_RATIO',15000,NULL,9000,'Saudável','Manter disciplina de capital circulante e monitorizar a tendência.'),
 ('QUICK_CRIT','QUICK_RATIO',NULL,6999,2000,'Crítica','Reduzir dependência de inventários para cumprir obrigações correntes.'),('QUICK_WARN','QUICK_RATIO',7000,9999,6000,'Atenção','Melhorar cobranças e disponibilidade financeira de curto prazo.'),('QUICK_OK','QUICK_RATIO',10000,NULL,9000,'Saudável','Preservar a cobertura corrente sem acumular caixa improdutivo.'),
 ('CASH_CRIT','CASH_RATIO',NULL,1999,2000,'Crítica','Preparar medidas imediatas de liquidez e contingência de tesouraria.'),('CASH_WARN','CASH_RATIO',2000,4999,6000,'Atenção','Reforçar previsões de tesouraria e limites mínimos de caixa.'),('CASH_OK','CASH_RATIO',5000,NULL,9000,'Saudável','Manter reserva de liquidez alinhada ao ciclo operacional.'),
 ('SOLVENCY_CRIT','SOLVENCY',NULL,11999,2000,'Crítica','Reestruturar passivos e avaliar reforço dos capitais próprios.'),('SOLVENCY_WARN','SOLVENCY',12000,17999,6000,'Atenção','Controlar o crescimento da dívida e proteger a base patrimonial.'),('SOLVENCY_OK','SOLVENCY',18000,NULL,9000,'Saudável','Manter equilíbrio entre ativos, passivos e retorno do capital.'),
 ('AUTONOMY_CRIT','AUTONOMY',NULL,1999,2000,'Crítica','Avaliar recapitalização e redução da dependência de capital alheio.'),('AUTONOMY_WARN','AUTONOMY',2000,3999,6000,'Atenção','Reforçar retenção de resultados e disciplina de endividamento.'),('AUTONOMY_OK','AUTONOMY',4000,NULL,9000,'Saudável','Preservar autonomia sem comprometer o custo ótimo de capital.'),
 ('DEBT_OK','DEBT_RATIO',NULL,5999,9000,'Saudável','Manter dívida compatível com geração de caixa e retorno esperado.'),('DEBT_WARN','DEBT_RATIO',6000,7999,6000,'Atenção','Rever maturidades, custo da dívida e capacidade de serviço.'),('DEBT_CRIT','DEBT_RATIO',8000,NULL,2000,'Crítica','Executar plano de desalavancagem e renegociação dos compromissos.'),
 ('MARGIN_CRIT','NET_MARGIN',NULL,-1,2000,'Crítica','Rever preços, mix, produtividade e estrutura de custos.'),('MARGIN_WARN','NET_MARGIN',0,999,6000,'Atenção','Proteger margem através de eficiência e disciplina comercial.'),('MARGIN_OK','NET_MARGIN',1000,NULL,9000,'Saudável','Sustentar a margem e validar sua conversão em fluxo de caixa.'),
 ('ROA_CRIT','ROA',NULL,-1,2000,'Crítica','Rever ativos improdutivos e a rentabilidade das operações.'),('ROA_WARN','ROA',0,499,6000,'Atenção','Aumentar utilização dos ativos e resultado operacional.'),('ROA_OK','ROA',500,NULL,9000,'Saudável','Manter produtividade dos ativos e disciplina de investimento.'),
 ('ROE_CRIT','ROE',NULL,-1,2000,'Crítica','Recuperar a rentabilidade e rever a estrutura de capital.'),('ROE_WARN','ROE',0,999,6000,'Atenção','Melhorar resultado sem aumentar desproporcionalmente o risco.'),('ROE_OK','ROE',1000,NULL,9000,'Saudável','Manter retorno aos proprietários com risco financeiro controlado.'),
 ('TURNOVER_CRIT','ASSET_TURNOVER',NULL,4999,2000,'Crítica','Reavaliar ativos ociosos, capacidade e utilização operacional.'),('TURNOVER_WARN','ASSET_TURNOVER',5000,9999,6000,'Atenção','Elevar receitas por unidade de ativo e rever alocação de capital.'),('TURNOVER_OK','ASSET_TURNOVER',10000,NULL,9000,'Saudável','Preservar utilização eficiente dos ativos e capacidade instalada.');

CREATE TRIGGER IF NOT EXISTS tenant_business_profile_immutable_tenant BEFORE UPDATE ON tenant_business_profiles WHEN NEW.tenant_id<>OLD.tenant_id OR NEW.created_at<>OLD.created_at BEGIN SELECT RAISE(ABORT,'tenant business profile identity is immutable'); END;
CREATE TRIGGER IF NOT EXISTS industry_pack_installation_no_delete BEFORE DELETE ON tenant_industry_pack_installations BEGIN SELECT RAISE(ABORT,'industry pack installations cannot be deleted'); END;
