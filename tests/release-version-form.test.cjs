'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');

test('El formulario de actualizaciones acepta 5.1.1 como versión válida',()=>{
  const html=readFileSync(join(__dirname,'..','license-admin.html'),'utf8');
  const input=html.match(/<input\b[^>]*\bid="releaseVersion"[^>]*>/)?.[0];
  assert.ok(input,'Falta el campo de versión');
  const pattern=input.match(/\bpattern="([^"]+)"/)?.[1];
  assert.ok(pattern,'Falta el patrón de versión');
  const regex=new RegExp('^(?:'+pattern+')$');
  assert.ok(regex.test('5.1.1'),'La versión 5.1.1 debe aceptarse');
  assert.ok(regex.test('6.2.100'),'Una versión válida debe aceptarse');
  assert.ok(!regex.test('5-1-1'),'El formato con guiones no debe aceptarse');
});
