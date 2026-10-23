import {depreciationCategories} from './depreciation-reference';
export type AssetDepreciation={inServiceMonth:number;usefulLifeYears:number;depreciationAnnualRate:number;depreciationCategoryId?:string};
export function validateAssetDepreciation(raw:unknown,earliestMonth:number):AssetDepreciation{
 const p=raw as AssetDepreciation;
 if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!['inServiceMonth','usefulLifeYears','depreciationAnnualRate','depreciationCategoryId'].includes(k))||!Number.isInteger(p.inServiceMonth)||p.inServiceMonth<Math.max(1,earliestMonth)||p.inServiceMonth>360||!Number.isFinite(p.usefulLifeYears)||p.usefulLifeYears<1/12||p.usefulLifeYears>100||!Number.isFinite(p.depreciationAnnualRate)||p.depreciationAnnualRate<0||p.depreciationAnnualRate>100||Number(p.depreciationAnnualRate.toFixed(2))!==p.depreciationAnnualRate)throw new Error('Premissa inválida: depreciação individual do investimento.');
 if(p.depreciationCategoryId!==undefined){const category=depreciationCategories.find(c=>c.id===p.depreciationCategoryId);if(!category||category.reviewReason||p.depreciationAnnualRate!==category.annualRateBps/100)throw new Error('Premissa inválida: referência individual de depreciação.');}
 return p;
}
