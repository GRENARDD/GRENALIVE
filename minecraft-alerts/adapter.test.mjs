import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeMinecraftAlert,chooseMinecraftGiftVisual,createMinecraftAlertDeduper} from './adapter.mjs';
test('normaliza regalo de Starvios',()=>{
 const e=normalizeMinecraftAlert({id:'a1',platform:'starvios',type:'gift',username:'Fan',gift:{id:'1',name:'Rosa',quantity:3}});
 assert.equal(e.gift.quantity,3); assert.equal(chooseMinecraftGiftVisual(e).kind,'flower');
});
test('regalo desconocido conserva imagen original',()=>{
 const e=normalizeMinecraftAlert({id:'a2',platform:'tiktok',type:'gift',gift:{name:'Regalo nuevo',imageUrl:'https://example.com/gift.png'}});
 assert.equal(chooseMinecraftGiftVisual(e).kind,'custom');
 assert.equal(chooseMinecraftGiftVisual(e).sourceImage,'https://example.com/gift.png');
});
test('no admite URLs peligrosas ni plataformas desconocidas',()=>{
 assert.equal(normalizeMinecraftAlert({platform:'otra',type:'gift'}),null);
 const e=normalizeMinecraftAlert({platform:'kick',type:'gift',gift:{imageUrl:'javascript:alert(1)'}});
 assert.equal(e.gift.imageUrl,null);
});
test('no repite eventos y permite otros nuevos',()=>{
 const d=createMinecraftAlertDeduper();assert.equal(d({id:'uno'},100),true);
 assert.equal(d({id:'uno'},101),false);assert.equal(d({id:'dos'},101),true);
});
