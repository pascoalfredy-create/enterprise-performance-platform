export type NumberLocale='pt'|'en'|'es'|'fr'|'ru';
export function numberSeparators(locale:NumberLocale){return {decimal:locale==='en'?'.':',',group:locale==='en'?',':locale==='pt'||locale==='es'?'.':'\u202f'}}
export function formatNumberValue(value:number,locale:NumberLocale,minimumFractionDigits=2,maximumFractionDigits=2){
 if(!Number.isFinite(value))return '';const {decimal,group}=numberSeparators(locale),raw=Math.abs(value).toFixed(maximumFractionDigits);let [integer,fraction='']=raw.split('.');while(fraction.length>minimumFractionDigits&&fraction.endsWith('0'))fraction=fraction.slice(0,-1);integer=integer.replace(/\B(?=(\d{3})+(?!\d))/g,group);return (value<0?'-':'')+integer+(fraction?decimal+fraction:'');
}
/** Drafts preserve a trailing decimal and never turn an invalid amount into zero. */
export function numberDraft(raw:string,locale:NumberLocale,maxFractionDigits=2,allowNegative=false){
 const {decimal,group}=numberSeparators(locale),compact=raw.replace(/[\s\u00a0\u202f]/g,'').split(group).join(''),normalized=compact.split(decimal).join('.');
 if(!new RegExp('^'+(allowNegative?'-?':'')+'\\d*(?:\\.\\d{0,'+maxFractionDigits+'})?$').test(normalized)||maxFractionDigits===0&&normalized.includes('.'))return {text:raw,value:NaN,valid:false};
 const negative=normalized.startsWith('-'),unsigned=normalized.replace(/^-/,'');let [integer,fraction]=unsigned.split('.');if(!integer&&fraction===undefined)return {text:negative?'-':'',value:NaN,valid:false};
 integer=(integer||'0').replace(/^0+(?=\d)/,'');const text=(negative?'-':'')+integer.replace(/\B(?=(\d{3})+(?!\d))/g,group)+(fraction!==undefined?decimal+fraction:'');const value=Number(normalized);
 const valid=Number.isFinite(value)&&Math.abs(value)*Math.pow(10,maxFractionDigits)<=Number.MAX_SAFE_INTEGER;return {text,value:valid?value:NaN,valid};
}
export function pastedNumber(raw:string,locale:NumberLocale,maxFractionDigits=2,allowNegative=false){
 const plain=raw.trim().replace(/[\s\u00a0\u202f]/g,'');let localized=plain;const {decimal,group}=numberSeparators(locale);
 // Both conventions can be pasted when the decimal mark is unambiguous.
 if(plain.includes('.')&&plain.includes(',')){const point=plain.lastIndexOf('.')>plain.lastIndexOf(',')?'.':',',thousands=point==='.'?',':'.',parts=plain.split(point);if(parts.length!==2||!new RegExp('^-?\\d{1,3}(\\'+thousands+'\\d{3})+$').test(parts[0]))return {text:raw,value:NaN,valid:false};localized=parts[0].split(thousands).join('')+decimal+parts[1];}
 else if(decimal===','&&/^[-]?\d+\.\d{1,2}$/.test(plain))localized=plain.replace('.',',');
 else if(decimal==='.'&&/^[-]?\d+,\d{1,2}$/.test(plain))localized=plain.replace(',','.');
 // Require conventional grouping on pasted grouped values; a draft already contains automatic groups.
 else if(group.trim()&&plain.includes(group)){const parts=plain.split(decimal);if(!new RegExp('^-?\\d{1,3}(\\'+group+'\\d{3})+$').test(parts[0]))return {text:raw,value:NaN,valid:false};}
 return numberDraft(localized,locale,maxFractionDigits,allowNegative);
}

/** Normalize only a newly typed decimal key; existing automatic group marks stay intact. */
export function typedDecimal(raw:string,cursor:number,inputData:string|null,locale:NumberLocale){
 const decimal=numberSeparators(locale).decimal;if((inputData==='.'||inputData===',')&&inputData!==decimal&&cursor>0&&raw[cursor-1]===inputData)return raw.slice(0,cursor-1)+decimal+raw.slice(cursor);return raw;
}
