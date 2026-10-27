'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
const root=path.join(__dirname,'..');
test('Kick: parche Desktop preserva OAuth broker y admite credenciales propias locales',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'grena-kick-oauth-test-'));
 const output=path.join(tmp,'server.mjs');
 try{
  fs.copyFileSync(path.join(root,'server.mjs'),output);
  const cmd=process.platform==='win32'?'python':'python3';
  const patch=spawnSync(cmd,[path.join(root,'desktop-build','fix_kick_auth.py'),tmp],{encoding:'utf8'});
  assert.equal(patch.status,0,patch.stderr||patch.stdout||'No se pudo ejecutar el parche');
  const content=fs.readFileSync(output,'utf8');
  assert.match(content,/localKickReady=platform==='kick'/);
  assert.match(content,/AUTH_SERVICE_URL&&!localKickReady/);
  assert.match(content,/kick\?\.clientSecret\)oauthConfig\.kick/);
  assert.match(content,/s\.verifier\?\{code_verifier:s\.verifier\}/);
  assert.match(content,/Kick no entrego un codigo/);
  assert.match(content,/no significa que Kick este caido/);
  const syntax=spawnSync(process.execPath,['--check',output],{encoding:'utf8'});
  assert.equal(syntax.status,0,syntax.stderr);
  const rerun=spawnSync(cmd,[path.join(root,'desktop-build','fix_kick_auth.py'),tmp],{encoding:'utf8'});
  assert.notEqual(rerun.status,0,'No aplicar el mismo parche dos veces sin una version nueva');
 }finally{fs.rmSync(tmp,{recursive:true,force:true})}
});
