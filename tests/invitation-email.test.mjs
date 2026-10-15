import test from 'node:test';
import assert from 'node:assert/strict';
import {sendInvitationEmail} from '../worker/invitation-email.ts';
const env={RESEND_API_KEY:'test-key',INVITATION_FROM_EMAIL:'Platform <invites@example.test>',PUBLIC_APP_URL:'https://app.example.test'};
const invite={email:'recipient@example.test',name:'Recipient',token:'test-invitation',expiresAt:'2026-10-22T00:00:00Z',idempotencyKey:'invitation/test-hash'};
test('invitation email sends only when configured and uses a trusted application URL',async()=>{
 let calls=0;const transport=async()=>{calls++;return Response.json({id:'mail-test'})};
 assert.deepEqual(await sendInvitationEmail({},invite,transport),{status:'not_configured'});
 for(const PUBLIC_APP_URL of ['http://app.example.test','https://app.example.test/?redirect=other','https://user:password@app.example.test','invalid'])
  assert.deepEqual(await sendInvitationEmail({...env,PUBLIC_APP_URL},invite,transport),{status:'not_configured'});
 assert.equal(calls,0);
});
test('provider acceptance uses the exact recipient, text invitation and stable idempotency header',async()=>{
 const result=await sendInvitationEmail(env,invite,async(url,options)=>{
  assert.equal(url,'https://api.resend.com/emails');assert.equal(options.headers['Idempotency-Key'],invite.idempotencyKey);
  const body=JSON.parse(options.body);assert.deepEqual(body.to,[invite.email]);assert.equal(body.from,env.INVITATION_FROM_EMAIL);
  assert.ok(body.text.includes('https://app.example.test/?invite=test-invitation'));assert.ok(body.text.includes(invite.expiresAt));
  assert.ok(!JSON.stringify(body).includes(env.RESEND_API_KEY));return Response.json({id:'mail-test'});
 });assert.deepEqual(result,{status:'accepted',messageId:'mail-test'});
});
test('provider rejection, malformed response and transport failure never report email as sent',async()=>{
 for(const transport of [async()=>Response.json({error:'private provider details'},{status:403}),async()=>Response.json({}),async()=>{throw Error('private details')}])
  assert.deepEqual(await sendInvitationEmail(env,invite,transport),{status:'failed'});
});
