import test from "node:test";
import assert from "node:assert/strict";
import {isCorporateEmail,PERSONAL_EMAIL_ALLOWLIST} from "../lib/corporate-email.ts";

test("rejects known free/personal email providers",()=>{
 assert.equal(isCorporateEmail("ana@gmail.com"),false);
 assert.equal(isCorporateEmail("ana@YAHOO.COM"),false);
 assert.equal(isCorporateEmail("ana@hotmail.com"),false);
 assert.equal(isCorporateEmail("ana@outlook.com"),false);
 assert.equal(isCorporateEmail("ana@icloud.com"),false);
});
test("accepts any other domain as corporate",()=>{
 assert.equal(isCorporateEmail("ana@yelaperformance.com"),true);
 assert.equal(isCorporateEmail("ana@acme.co.ao"),true);
});
test("the owner's personal allowlisted email is accepted even though its domain is a free provider",()=>{
 for(const email of PERSONAL_EMAIL_ALLOWLIST)assert.equal(isCorporateEmail(email),true);
 assert.equal(isCorporateEmail("pascoalfredy@gmail.com"),true);
});
test("matching is case-insensitive and trims whitespace",()=>{
 assert.equal(isCorporateEmail(" Pascoalfredy@Gmail.com "),true);
 assert.equal(isCorporateEmail("OUTRO@GMAIL.COM"),false);
});
test("an address with no domain is rejected",()=>{
 assert.equal(isCorporateEmail("semdominio"),false);
});
