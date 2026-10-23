"use client";
import {useEffect,useState} from 'react';
import {apiFetch,readApiJson} from '../lib/api-client';
import {usePlatformLocale} from './use-platform-locale';
import {buildXlsxBlob} from '../lib/xlsx';
import {downloadBlob} from '../lib/module-export';
import {budgetMinorDecimal} from '../lib/budget-map-import';

const copy = {
 title:['Investimentos e caixa previstos','Planned investments and cash','Inversiones y caja previstas','Investissements et trésorerie prévus','План инвестиций и денежных потоков'],
 help:['Ligue linhas de um plano mensal aprovado. Investimento e depreciação alimentam rubricas distintas. Pagamentos e financiamento ficam separados do mapa económico.','Link lines from an approved monthly plan. Investment and depreciation feed separate lines. Payments and financing remain separate from the economic map.','Vincule líneas de un plan mensual aprobado. Inversión y depreciación alimentan partidas distintas. Pagos y financiación se separan del mapa económico.','Liez des lignes d’un plan mensuel approuvé. Investissement et amortissement alimentent des rubriques distinctes. Paiements et financement restent séparés du budget économique.','Свяжите строки утверждённого месячного плана. Инвестиции и амортизация идут в разные статьи. Платежи и финансирование отделены от экономического бюджета.'],
 model:['Plano aprovado','Approved plan','Plan aprobado','Plan approuvé','Утверждённый план'],
 line:['Linha de origem','Source line','Línea de origen','Ligne source','Строка источника'],
 channel:['Finalidade','Purpose','Finalidad','Finalité','Назначение'],
 CAPEX:['Investimento por competência','Accrued investment','Inversión por devengo','Investissement engagé','Инвестиции по начислению'],
 Depreciacao:['Depreciação mensal','Monthly depreciation','Depreciación mensual','Amortissement mensuel','Месячная амортизация'],
 Pagamento:['Pagamento do investimento','Investment payment','Pago de inversión','Paiement de l’investissement','Оплата инвестиций'],
 Financiamento:['Entrada / reembolso de financiamento','Financing receipt / repayment','Entrada / reembolso de financiación','Encaissement / remboursement du financement','Получение / погашение финансирования'],
 select:['Selecionar','Select','Seleccionar','Sélectionner','Выбрать'],
 noModels:['Não existem planos mensais aprovados nesta empresa.','No approved monthly plans exist for this company.','No hay planes mensuales aprobados en esta empresa.','Aucun plan mensuel approuvé pour cette entreprise.','В этой компании нет утверждённых месячных планов.'],
 selectTarget:['Selecione uma rubrica no mapa e uma dimensão para configurar a ligação.','Select a map line and a dimension to configure the link.','Seleccione una partida y una dimensión para configurar el vínculo.','Sélectionnez une rubrique et une dimension pour configurer le lien.','Выберите статью и аналитику для настройки связи.'],
 target:['Rubrica de destino','Destination line','Partida de destino','Rubrique cible','Целевая статья'],
 depHelp:['Confirmo que a linha de Custo selecionada contém depreciações mensais aprovadas. Não será gerado pagamento nem presumida uma vida útil.','I confirm the selected Cost line contains approved monthly depreciation. No payment or assumed useful life will be generated.','Confirmo que la línea de Coste contiene depreciaciones mensuales aprobadas. No se genera pago ni vida útil supuesta.','Je confirme que la ligne de Coût contient des amortissements mensuels approuvés. Aucun paiement ni durée de vie supposée ne sera créé.','Подтверждаю, что строка затрат содержит утверждённую месячную амортизацию. Платёж и предполагаемый срок службы не создаются.'],
 policy:['Atualizações','Updates','Actualizaciones','Mises à jour','Обновления'],
 Manual:['Aplicar manualmente','Apply manually','Aplicar manualmente','Appliquer manuellement','Применять вручную'],
 ComConfirmacao:['Exigir confirmação','Require confirmation','Exigir confirmación','Exiger une confirmation','Требовать подтверждение'],
 Automatica:['Aceitar na sincronização','Accept on sync','Aceptar al sincronizar','Accepter lors de la synchronisation','Принимать при синхронизации'],
 relation:['Relação com outras fontes','Relation to other sources','Relación con otras fuentes','Relation aux autres sources','Связь с другими источниками'],
 Exclusiva:['Fonte exclusiva','Exclusive source','Fuente exclusiva','Source exclusive','Единственный источник'],
 Soma:['Somar componentes distintos','Add distinct components','Sumar componentes distintos','Additionner des composantes distinctes','Суммировать разные компоненты'],
 replace:['Substituir ligação','Replace link','Sustituir vínculo','Remplacer le lien','Заменить связь'],
 create:['Ligar origem','Link source','Vincular origen','Lier la source','Связать источник'],
 sync:['Verificar origem','Check source','Verificar origen','Vérifier la source','Проверить источник'],
 confirm:['Confirmar alterações','Confirm changes','Confirmar cambios','Confirmer les modifications','Подтвердить изменения'],
 apply:['Aplicar ao rascunho','Apply to draft','Aplicar al borrador','Appliquer au brouillon','Применить к черновику'],
 unlink:['Retirar ligação do rascunho','Remove link from draft','Retirar vínculo del borrador','Retirer le lien du brouillon','Удалить связь из черновика'],
 reactivate:['Reativar ligação','Reactivate link','Reactivar vínculo','Réactiver le lien','Восстановить связь'],
 saved:['Operação concluída.','Operation completed.','Operación completada.','Opération terminée.','Операция выполнена.'],
 pending:['Valor confirmado → valor proposto','Confirmed amount → proposed amount','Importe confirmado → propuesto','Montant confirmé → proposé','Подтверждённая → предлагаемая сумма'],
 cash:['Movimentos de caixa aplicados nesta versão','Cash movements applied to this version','Movimientos de caja aplicados a esta versión','Mouvements de trésorerie appliqués à cette version','Денежные потоки этой версии'],
 noCash:['Ainda não existem movimentos de caixa aplicados neste contexto.','No cash movements have been applied in this context.','No hay movimientos de caja aplicados en este contexto.','Aucun mouvement de trésorerie appliqué dans ce contexte.','В этом контексте ещё нет применённых денежных потоков.'],
 partial:['Estes movimentos não representam o saldo de tesouraria: não incluem saldo inicial nem outras entradas e saídas.','These movements are not a treasury balance: opening cash and other receipts and payments are not included.','Estos movimientos no representan el saldo de tesorería: no incluyen saldo inicial ni otros cobros y pagos.','Ces mouvements ne constituent pas un solde de trésorerie : solde initial et autres flux exclus.','Эти потоки не являются остатком денег: начальный остаток и прочие потоки не включены.'],
 outside:['Há pagamentos previstos fora do exercício selecionado. Continuam na origem e podem ser aplicados ao orçamento do ano correspondente.','Some payments fall outside the selected fiscal year. They remain at source and can be applied to the corresponding year’s budget.','Hay pagos fuera del ejercicio. Se conservan en origen y pueden aplicarse al presupuesto del año correspondiente.','Certains paiements sont hors exercice. Ils restent dans la source et peuvent alimenter le budget de l’année correspondante.','Есть платежи вне выбранного года. Они сохранены в источнике для бюджета соответствующего года.'],
 period:['Mês','Month','Mes','Mois','Месяц'], amount:['Montante','Amount','Importe','Montant','Сумма'],
 origin:['Origem','Source','Origen','Source','Источник'], export:['Exportar caixa Excel','Export cash Excel','Exportar caja Excel','Exporter trésorerie Excel','Экспорт потоков в Excel'],
 noHistory:['Detalhe histórico não preservado.','Historical detail not retained.','Detalle histórico no conservado.','Détail historique non conservé.','Исторические сведения не сохранены.'],
 close:['Fechar detalhe','Close details','Cerrar detalle','Fermer le détail','Закрыть сведения'],
 } as const;
type Channel='CAPEX'|'Depreciacao'|'Pagamento'|'Financiamento';
type Mapping={id:string;line_id:string;dimension_member_id:string|null;currency:string;status:string;code:string;name:string;reference:{modelId:string;sourceLineId:string;channel:Channel}|null};
type Cash={id:string;mapping_id:string;line_id:string;dimension_member_id:string|null;currency:string;period:string;integration_amount_minor:number;movement_count:number;source_reference:string;snapshot_code:string|null;snapshot_name:string|null;cell_snapshot_json:string|null;movements_json:string|null};
type Snapshot={models:{id:string;name:string;currency:string;version_number:number}[];lines:{id:string;code:string;name:string;line_type:string}[];mappings:Mapping[];pending:{id:string;mapping_id:string;period:string;amount_minor:number;pending_amount_minor:number}[];cash:Cash[];outside:{mapping_id:string;period:string;amount_minor:number}[]};
type Props={versionId:string;organizationId:string;dimensionMemberId:string;currency:string;approved:boolean;line:{id:string;code:string;name:string}|null;onApplied:()=>void};
export function BudgetInvestmentsPanel(props:Props){
 const locale=usePlatformLocale(),ix={pt:0,en:1,es:2,fr:3,ru:4}[locale],t=(key:keyof typeof copy)=>copy[key][ix];
 const [data,setData]=useState<Snapshot|null>(null),[modelId,setModelId]=useState(''),[channel,setChannel]=useState<Channel>('CAPEX'),[sourceLineId,setSourceLineId]=useState(''),[revision,setRevision]=useState(0),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),[detail,setDetail]=useState<Cash|null>(null);
 const money=(n:number)=>(n/100).toLocaleString(locale,{maximumFractionDigits:2});
 const exactDimension=props.dimensionMemberId==='__NONE__'?null:props.dimensionMemberId;
 const visible=(row:{dimension_member_id:string|null;currency:string})=>row.currency===props.currency&&(!props.dimensionMemberId||row.dimension_member_id===exactDimension);
 const mappings=(data?.mappings||[]).filter(visible),cash=(data?.cash||[]).filter(visible).filter(c=>c.integration_amount_minor!==0||c.movement_count>0);
 useEffect(()=>{let cancelled=false;setData(null);setDetail(null);const q=new URLSearchParams({organizationId:props.organizationId,versionId:props.versionId,modelId});apiFetch('/api/v1/investment-budget?'+q).then(async r=>{const json=await readApiJson<Snapshot&{error?:string}>(r);if(!r.ok||json.error)throw new Error(json.error||String(r.status));return json;}).then(json=>{if(!cancelled){setData(json);setError('');}}).catch(e=>{if(!cancelled)setError(String(e.message||e));});return()=>{cancelled=true;};},[props.organizationId,props.versionId,modelId,revision]);
 useEffect(()=>{setSourceLineId('');},[modelId,channel]);
 async function action(type:string,extra:Record<string,unknown>={}){setBusy(true);setMessage('');setError('');try{const r=await apiFetch('/api/v1/investment-budget',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type,organizationId:props.organizationId,versionId:props.versionId,...extra})});const json=await readApiJson<{error?:string}>(r);if(!r.ok||json.error)throw new Error(json.error||String(r.status));setRevision(n=>n+1);setMessage(t('saved'));if(type==='apply'||type==='unlink')props.onApplied();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
 const editable=!props.approved&&!!props.dimensionMemberId;
 function evidence(row:Cash){return row.movements_json?JSON.parse(row.movements_json) as {component_label:string;source_movement_reference:string;amount_minor:number;source_status:string}[]:null;}
 function cashLabel(row:Cash){const frozen=row.cell_snapshot_json?JSON.parse(row.cell_snapshot_json):{};return `${row.snapshot_code||frozen.code||''} · ${row.snapshot_name||frozen.name||''}`;}
 return <details className="budget-map-assumptions-panel budget-investments-panel">
  <summary>{t('title')}</summary>
  <header>{cash.length?<button onClick={()=>downloadBlob(buildXlsxBlob([{name:'Cash',rows:[[t('period'),t('target'),t('amount'),t('origin')],...cash.map(c=>[c.period,cashLabel(c),budgetMinorDecimal(c.integration_amount_minor),c.source_reference])]}]),'budget-cash.xlsx')}>{t('export')}</button>:null}</header>
  <p>{t('help')}</p>{message?<p role="status">{message}</p>:null}{error?<p role="alert">{error}</p>:null}
  {editable&&props.line&&!props.line.id.startsWith('legacy:')?<form className="budget-map-assumption-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void action('create',{lineId:props.line!.id,modelId,sourceLineId,channel,dimensionMemberId:exactDimension,syncPolicy:f.get('policy'),relationPolicy:f.get('relation'),supersedesMappingId:f.get('supersedes')||undefined,confirmDepreciation:f.get('dep')==='on'});}}>
   <p>{t('target')}: <strong>{props.line.code} · {props.line.name}</strong></p>
   <label>{t('model')}<select required value={modelId} onChange={e=>setModelId(e.target.value)}><option value="">{t('select')}</option>{data?.models.filter(m=>m.currency===props.currency).map(m=><option key={m.id} value={m.id}>{m.name} · v{m.version_number} · {m.currency}</option>)}</select></label>
   <label>{t('channel')}<select value={channel} onChange={e=>setChannel(e.target.value as Channel)}>{(['CAPEX','Depreciacao','Pagamento','Financiamento'] as const).map(c=><option key={c} value={c}>{t(c)}</option>)}</select></label>
   <label>{t('line')}<select required value={sourceLineId} onChange={e=>setSourceLineId(e.target.value)}><option value="">{t('select')}</option>{data?.lines.filter(l=>l.line_type===(channel==='Depreciacao'?'Custo':channel==='Financiamento'?'Financiamento':'CAPEX')).map(l=><option key={l.id} value={l.id}>{l.code} · {l.name}</option>)}</select></label>
   {channel==='Depreciacao'?<label><input name="dep" type="checkbox" required/>{t('depHelp')}</label>:null}
   <label>{t('policy')}<select name="policy" defaultValue="ComConfirmacao">{(['ComConfirmacao','Manual','Automatica'] as const).map(c=><option key={c} value={c}>{t(c)}</option>)}</select></label>
   <label>{t('relation')}<select name="relation">{(['Exclusiva','Soma'] as const).map(c=><option key={c} value={c}>{t(c)}</option>)}</select></label>
   <label>{t('replace')}<select name="supersedes"><option value="">{t('select')}</option>{mappings.filter(m=>m.status==='Ativo'&&m.line_id===props.line!.id&&m.reference?.channel===channel).map(m=><option key={m.id} value={m.id}>{m.code} · {m.reference?.modelId}</option>)}</select></label>
   <button disabled={busy||!data||!sourceLineId} type="submit">{t('create')}</button>
  </form>:(!props.approved?<p>{t('selectTarget')}</p>:null)}
  {data&&!data.models.length&&!props.approved?<p>{t('noModels')}</p>:null}
  {!props.approved?mappings.map(m=><div className="budget-investment-link" key={m.id}>
    <strong>{m.code} · {m.name} · {m.reference?t(m.reference.channel):t('noHistory')} · {data?.models.find(p=>p.id===m.reference?.modelId)?.name}</strong>
    {data?.pending.filter(p=>p.mapping_id===m.id).map(p=><p key={p.id}>{p.period} · {t('pending')}: {money(p.amount_minor)} → {money(p.pending_amount_minor)}</p>)}
    {editable?m.status==='Ativo'?<div className="budget-investment-actions"><button disabled={busy} onClick={()=>action('sync',{mappingId:m.id})}>{t('sync')}</button>{data?.pending.some(p=>p.mapping_id===m.id)?<button disabled={busy} onClick={()=>action('confirm',{mappingId:m.id})}>{t('confirm')}</button>:null}<button disabled={busy||!data||data.pending.some(p=>p.mapping_id===m.id)} onClick={()=>action('apply',{mappingId:m.id})}>{t('apply')}</button><button disabled={busy} onClick={()=>action('unlink',{mappingId:m.id})}>{t('unlink')}</button></div>:<button disabled={busy} onClick={()=>action('reactivate',{mappingId:m.id})}>{t('reactivate')}</button>:null}
   </div>):null}
  <h4>{t('cash')}</h4><p>{t('partial')}</p>
  {cash.length?<div className="budget-map-table-wrap"><table><thead><tr><th>{t('period')}</th><th>{t('target')}</th><th>{t('amount')} · {props.currency}</th><th>{t('origin')}</th></tr></thead><tbody>{cash.map(c=><tr key={c.id}><td>{c.period}</td><td>{cashLabel(c)}</td><td className={c.integration_amount_minor<0?'budget-investment-negative':c.integration_amount_minor>0?'budget-investment-positive':''}>{money(c.integration_amount_minor)}</td><td><button onClick={()=>setDetail(c)}>{t('origin')}</button></td></tr>)}</tbody></table></div>:<p>{t('noCash')}</p>}
  {data?.outside.some(x=>mappings.some(m=>m.id===x.mapping_id))?<p role="status">{t('outside')}</p>:null}
  {detail?<div className="budget-investment-evidence"><h4>{detail.period} · {cashLabel(detail)}</h4><button onClick={()=>setDetail(null)}>{t('close')}</button>{evidence(detail)?.map((m,i)=><p key={i}>{m.component_label} · {m.source_movement_reference} · {money(m.amount_minor)} · {m.source_status}</p>)||<p>{t('noHistory')}</p>}</div>:null}
 </details>;
}
