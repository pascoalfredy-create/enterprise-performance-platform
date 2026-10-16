/** Display only: payback calculations retain their original decimal-year precision. */
export function formatPaybackDuration(value:number|null,locale:'pt'|'en'|'es'|'fr'|'ru'='pt'):string {
 const index={pt:0,en:1,es:2,fr:3,ru:4}[locale];
 if(value===null||!Number.isFinite(value)||value<0)return ['Não recuperado no horizonte','Not recovered within horizon','No recuperado en el horizonte','Non récupéré sur l’horizon','Не окупается за период'][index];
 const total=Math.round(value*12),years=Math.floor(total/12),months=total%12;
 if(total===0&&value>0)return ['Menos de 1 mês','Less than 1 month','Menos de 1 mes','Moins de 1 mois','Менее 1 месяца'][index];
 const unit=(n:number,kind:'year'|'month')=>{
  const forms=kind==='year'?[['ano','anos'],['year','years'],['año','años'],['an','ans'],['год','года','лет']]:[['mês','meses'],['month','months'],['mes','meses'],['mois','mois'],['месяц','месяца','месяцев']];
  const category=new Intl.PluralRules(locale).select(n),form=locale==='ru'?(category==='one'?0:category==='few'?1:2):(n===1?0:1);
  return `${n} ${forms[index][form]}`;
 };
 const parts=[];if(years)parts.push(unit(years,'year'));if(months||!years)parts.push(unit(months,'month'));
 return parts.join([' e ',' and ',' y ',' et ',' и '][index]);
}
