import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function moduleUnderTest(){
  const source=fs.readFileSync(new URL('../assets/ascension-alerts.js',import.meta.url),'utf8');
  const document={createElement(tag){
    return {tag,children:[],appendChild(child){this.children.push(child)},setAttribute(name,value){(this.attrs??={})[name]=value},attachShadow(){
      this.shadowRoot={children:[],appendChild(child){this.children.push(child)}};return this.shadowRoot;
    }};
  }};
  const window={};
  vm.runInNewContext(source,{window,document,console});
  return window.GrenaAscension;
}
test('Ascension supports 6 events x 5 platforms with creator-specific names',()=>{
  const app=moduleUnderTest();
  for(const event of ['gift','follow','sub','raid','share','likes']){
    for(const platform of ['TIKTOK','TWITCH','KICK','STARVIOS','YOUTUBE']){
      const node=app.create(event,{name:'Luna_97',gift:'Rosa de oro',amount:12},{platform,ownerName:'Sofía',layout:'vertical'});
      const html=node.shadowRoot.children[1].innerHTML;
      assert.match(html,/Sofía/);assert.match(html,/Luna_97/);
      assert.ok(html.includes(platform));assert.doesNotMatch(html,/Team Greña|GREÑA RD|GREÑERO/i);
    }
  }
});
test('Ascension does not default to the app developer name',()=>{
  const node=moduleUnderTest().create('follow',{name:'Ana'},{platform:'KICK'});
  const html=node.shadowRoot.children[1].innerHTML;
  assert.match(html,/EN DIRECTO/);assert.doesNotMatch(html,/GREÑA/i);
});
test('Ascension safely escapes usernames and gift names',()=>{
  const node=moduleUnderTest().create('gift',{name:'<img src=x>',gift:'<script>',amount:3},{platform:'TIKTOK',ownerName:'<b>Sofía</b>'});
  const html=node.shadowRoot.children[1].innerHTML;
  assert.doesNotMatch(html,/<img|<script>|<b>Sofía<\/b>/);
  assert.match(html,/&lt;img/);assert.match(html,/&lt;script&gt;/);
});
