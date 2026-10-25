import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');

test('redes: borde fijo, nombres largos y rotación con entrada desde el lado elegido',()=>{
  const html=source('social-overlay.html');
  assert.match(html,/stage\.style\.justifyContent=edge==='right'\?'flex-end':'flex-start'/);
  assert.match(html,/stage\.style\.paddingLeft=/);
  assert.match(html,/stage\.style\.paddingRight=/);
  assert.match(html,/\.name\{[^}]*text-overflow:clip/);
  assert.match(html,/function fitNetworks\(\)/);
  assert.match(html,/const available=Math\.max\(30,stage\.clientWidth-offset-10\)/);
  assert.match(html,/scale\*=available\/Math\.max/);
  assert.match(html,/max-width:100%/);
  assert.match(html,/enterFromRight/);
});

test('contador: tres estilos conservan anclaje y configuración persistente',()=>{
  const overlay=source('viewers.html'),backend=source('server.mjs');
  assert.match(overlay,/style\.justifyContent=right\?'flex-end':'flex-start'/);
  assert.match(overlay,/style\.transformOrigin=right\?'right center':'left center'/);
  assert.match(backend,/counterEdge:settings\.edge,counterEdgeOffset:settings\.edgeOffset/);
  assert.match(backend,/counterEdge:autoPrefs\.counterEdge,counterEdgeOffset:autoPrefs\.counterEdgeOffset/);
});

test('chat: respeta lado y margen en cliente, servidor y panel',()=>{
  const overlay=source('multichat-overlay.html'),backend=source('chat-server.mjs'),ui=source('widgets.html');
  assert.match(overlay,/stage\.style\.alignItems=cfg\.direction==='right'\?'flex-end':'flex-start'/);
  assert.match(overlay,/edgeOffset:\[0,80\]/);
  assert.match(backend,/edgeOffset:\[0,80\]/);
  assert.match(ui,/id="mcEdgeOffset"/);
  assert.match(ui,/edgeOffset:\+mcEdgeOffset\.value/);
});

test('panel: configuración independiente para redes, contador y multichat',()=>{
  const ui=source('widgets.html'),backend=source('server.mjs');
  for(const name of ['counterEdge','counterEdgeOffset','sgEdge','sgEdgeOffset','mcDirection','mcEdgeOffset'])assert.ok(ui.includes('id="'+name+'"'),name+' missing');
  assert.match(backend,/socialSettings=\{\.\.\.socialDefaults,\.\.\.body,edge:/);
  assert.match(ui,/id="counterApplyBtn"/);
  assert.match(ui,/id="sgApplyBtn"/);
  assert.match(ui,/id="mcApplyBtn"/);
});
