import type {payrollSheetCopy} from './payroll-sheet-copy';
export type ProfileFieldOption={value:string;label:keyof typeof payrollSheetCopy};
export type DynamicOptionsKey='costCenter'|'department';
export type ProfileFieldDef={name:string;key:string;label:keyof typeof payrollSheetCopy;type?:'text'|'date'|'email'|'select'|'dynamic-select';required?:boolean;options?:ProfileFieldOption[];dynamicOptionsKey?:DynamicOptionsKey};
export type ProfileTabKey='identification'|'documents'|'fiscal'|'professional';
export const profileFieldGroups:Record<ProfileTabKey,ProfileFieldDef[]>={
 identification:[
  {name:'gender',key:'gender',label:'gender',type:'select',required:true,options:[{value:'Masculino',label:'genderMale'},{value:'Feminino',label:'genderFemale'},{value:'Outro',label:'genderOther'}]},
  {name:'birthDate',key:'birth_date',label:'birthDate',type:'date',required:true},
  {name:'shortName',key:'short_name',label:'shortName'},
  {name:'maritalStatus',key:'marital_status',label:'maritalStatus',type:'select',options:[{value:'Solteiro',label:'maritalSingle'},{value:'Casado',label:'maritalMarried'},{value:'Uniao',label:'maritalUnion'},{value:'Divorciado',label:'maritalDivorced'},{value:'Viuvo',label:'maritalWidowed'}]},
  {name:'nationality',key:'nationality',label:'nationality'},
  {name:'locality',key:'locality',label:'locality'},
  {name:'postalCode',key:'postal_code',label:'postalCode'},
  {name:'municipality',key:'municipality',label:'municipality'},
  {name:'province',key:'province',label:'province'},
  {name:'country',key:'country',label:'country'},
  {name:'mobilePhone',key:'mobile_phone',label:'mobilePhone'},
  {name:'email',key:'email',label:'email',type:'email'},
 ],
 documents:[
  {name:'idDocumentType',key:'id_document_type',label:'idDocumentType',type:'select',required:true,options:[{value:'BI',label:'idDocBi'},{value:'Cartao',label:'idDocCard'},{value:'Passaporte',label:'idDocPassport'}]},
  {name:'idDocumentNumber',key:'id_document_number',label:'idDocumentNumber',required:true},
  {name:'idDocumentIssuePlace',key:'id_document_issue_place',label:'idDocumentIssuePlace',required:true},
  {name:'idDocumentIssueDate',key:'id_document_issue_date',label:'idDocumentIssueDate',type:'date',required:true},
  {name:'idDocumentExpiryDate',key:'id_document_expiry_date',label:'idDocumentExpiryDate',type:'date',required:true},
  {name:'taxId',key:'tax_id',label:'taxId',required:true},
  {name:'socialSecurityNumber',key:'social_security_number',label:'socialSecurityNumber',required:true},
 ],
 fiscal:[
  {name:'financeOffice',key:'finance_office',label:'financeOffice'},
  {name:'incomeType',key:'income_type',label:'incomeType'},
  {name:'bankName',key:'bank_name',label:'bankName'},
  {name:'bankBranch',key:'bank_branch',label:'bankBranch'},
  {name:'bankIban',key:'bank_iban',label:'bankIban'},
 ],
 professional:[
  {name:'professionalCategory',key:'professional_category',label:'professionalCategory',required:true},
  {name:'educationInstitution',key:'education_institution',label:'educationInstitution',required:true},
  {name:'profession',key:'profession',label:'profession',required:true},
  {name:'educationLevel',key:'education_level',label:'educationLevel',required:true},
  {name:'costCenterMemberId',key:'cost_center_member_id',label:'costCenter',type:'dynamic-select',dynamicOptionsKey:'costCenter'},
  {name:'departmentOrganizationId',key:'department_organization_id',label:'department',type:'dynamic-select',dynamicOptionsKey:'department'},
 ],
};
export const profileTabs:[ProfileTabKey,keyof typeof payrollSheetCopy][]=[['identification','tabIdentification'],['documents','tabDocuments'],['fiscal','tabFiscalBanking'],['professional','tabProfessional']];
export const profileFieldNames:string[]=Object.values(profileFieldGroups).flat().map(f=>f.name);
