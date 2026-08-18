import test from "node:test";
import assert from "node:assert/strict";
import {openApiDocument as spec} from "../lib/openapi.ts";
test("publishes OpenAPI 3.1 with stable v1 server",()=>{assert.equal(spec.openapi,"3.1.0");assert.equal(spec.servers[0].url,"/api/v1")});
test("documents every vertical slice API",()=>{for(const path of ["/session","/setup","/performance","/payroll","/workforce","/dashboard","/management-reports","/integrity"])assert.ok(spec.paths[path],path)});
test("documents tenant administration",()=>{assert.ok(spec.paths["/tenants"]?.get);assert.equal(spec.paths["/tenants"]?.post?.["x-permission"],"setup:write")});
test("documents invitation acceptance",()=>{assert.ok(spec.paths["/invitations/accept"]?.post);assert.ok(spec.paths["/invitations/accept"].post.responses["403"])});
test("write operations declare permissions and auth errors",()=>{for(const path of ["/setup","/performance","/payroll","/workforce","/management-reports"]){const post=spec.paths[path].post;assert.ok(post["x-permission"]);assert.ok(post.responses["401"]);assert.ok(post.responses["403"])}});
