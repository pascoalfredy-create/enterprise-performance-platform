// Production is corporate-email-only for commercial sign-up: a free/personal
// email provider cannot open a commerce account and subscribe a company.
// The owner's own personal address(es) are the sole exception, kept here so
// they can validate and demo the live product without a throwaway domain.
export const PERSONAL_EMAIL_ALLOWLIST = new Set(["pascoalfredy@gmail.com"]);

const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "ymail.com",
  "hotmail.com",
  "hotmail.co.uk",
  "outlook.com",
  "outlook.pt",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "protonmail.com",
  "proton.me",
  "gmx.com",
  "gmx.net",
  "mail.com",
  "zoho.com",
  "yandex.com",
  "yandex.ru",
  "qq.com",
  "163.com",
  "126.com",
  "web.de",
  "sapo.pt",
  "bol.com.br",
  "uol.com.br",
]);

export function isCorporateEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  if (PERSONAL_EMAIL_ALLOWLIST.has(normalized)) return true;
  const domain = normalized.split("@")[1] || "";
  return domain.length > 0 && !FREE_EMAIL_DOMAINS.has(domain);
}
