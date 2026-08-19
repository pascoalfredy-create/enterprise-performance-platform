export const CATALOG_VERSION = "AO-2026-01";
export const ANNUAL_MONTHS_CHARGED = 10;

export type BillingInterval = "monthly" | "annual";
export type BundleCode = "FINANCE" | "PEOPLE" | "PERFORMANCE" | "ENTERPRISE";

export type Bundle = {
  code: BundleCode;
  name: string;
  description: string;
  monthlyMinor: number;
  includedUsers: number;
  includedEmployees: number | null;
  highlight?: boolean;
  capabilities: string[];
};

export const bundles: Bundle[] = [
  {code:"FINANCE",name:"Finance & FP&A",description:"Controlo financeiro e planeamento para equipas que estão a sair das folhas de cálculo.",monthlyMinor:4_990_000,includedUsers:5,includedEmployees:null,capabilities:["Actual, Budget e Forecast","Cenários e dimensões","Dashboards e reporting","Workflow financeiro"]},
  {code:"PEOPLE",name:"HCM & Payroll",description:"Gestão integrada de pessoas e processamento salarial preparado para Angola.",monthlyMinor:5_990_000,includedUsers:5,includedEmployees:25,capabilities:["Employee Master e contratos","Payroll e payslips","Assiduidade e ausências","Angola Payroll Pack incluído"]},
  {code:"PERFORMANCE",name:"Enterprise Performance",description:"Planeamento financeiro ligado a força de trabalho, objetivos e analytics avançado.",monthlyMinor:9_990_000,includedUsers:8,includedEmployees:null,highlight:true,capabilities:["Finance & FP&A","Workforce Planning","Performance Management","Analytics Advanced"]},
  {code:"ENTERPRISE",name:"Enterprise Suite",description:"Plataforma completa para organizações que querem finanças e pessoas numa visão governada.",monthlyMinor:14_990_000,includedUsers:10,includedEmployees:50,capabilities:["Todos os módulos","HCM & Payroll","Integration Hub","Limites superiores"]},
];

export const ADDITIONAL_USER_MONTHLY_MINOR = 250_000;
export const ADDITIONAL_EMPLOYEE_MONTHLY_MINOR = 100_000;

export function subscriptionTotal(input:{bundle:Bundle;interval:BillingInterval;users:number;employees:number}){
  const extraUsers=Math.max(0,Math.trunc(input.users)-input.bundle.includedUsers);
  const employeeLimit=input.bundle.includedEmployees;
  const extraEmployees=employeeLimit===null?0:Math.max(0,Math.trunc(input.employees)-employeeLimit);
  const monthly=input.bundle.monthlyMinor+extraUsers*ADDITIONAL_USER_MONTHLY_MINOR+extraEmployees*ADDITIONAL_EMPLOYEE_MONTHLY_MINOR;
  return {monthlyMinor:monthly,totalMinor:input.interval==="annual"?monthly*ANNUAL_MONTHS_CHARGED:monthly,extraUsers,extraEmployees};
}

export function formatAOA(minor:number){return new Intl.NumberFormat("pt-AO",{style:"currency",currency:"AOA",maximumFractionDigits:0}).format(minor/100)}
