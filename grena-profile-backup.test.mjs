import test from 'node:test';
import assert from 'node:assert/strict';
import {encryptProfileBackup,decryptProfileBackup,safeSettings} from './grena-profile-backup.mjs';
const passphrase='una frase larga y segura';
const files={'chat-settings.json':{theme:'dark-gold',oauthToken:'NO_EXPORTAR',nested:{fishApiKey:'NO_EXPORTAR',volume:4}},'../secret.json':{private:1}};
test('respaldo cifrado: restaura ajustes y omite secretos',()=>{
 const backup=encryptProfileBackup({userId:'grena_rd',passphrase,files});
 assert.ok(!backup.includes('dark-gold'));
 const restored=decryptProfileBackup({userId:'grena_rd',passphrase,backup});
 assert.deepEqual(JSON.parse(JSON.stringify(restored)),{'chat-settings.json':{theme:'dark-gold',nested:{volume:4}}});
});
test('no restaura información de otro GREÑA ID',()=>{
 const backup=encryptProfileBackup({userId:'grena_rd',passphrase,files});
 assert.throws(()=>decryptProfileBackup({userId:'otro',passphrase,backup}),/otro GREÑA ID/);
});
test('rechaza contraseña equivocada y autenticación manipulada',()=>{
 const backup=encryptProfileBackup({userId:'grena_rd',passphrase,files});
 assert.throws(()=>decryptProfileBackup({userId:'grena_rd',passphrase:'otra clave larga',backup}),/incorrecta/);
 const edited=JSON.parse(backup);edited.tag=Buffer.alloc(16).toString('base64');
 assert.throws(()=>decryptProfileBackup({userId:'grena_rd',passphrase,backup:JSON.stringify(edited)}),/alterado/);
});
test('no incluye rutas arbitrarias',()=>{
 assert.deepEqual(Object.keys(safeSettings(files)),['chat-settings.json']);
});
