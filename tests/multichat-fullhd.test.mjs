import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const overlay=readFileSync(new URL('../multichat-overlay.html',import.meta.url),'utf8');
const widgets=readFileSync(new URL('../widgets.html',import.meta.url),'utf8');

test('multichat uses a transparent full-viewport source with crisp DOM text',()=>{
  assert.match(overlay,/background:transparent!important/);
  assert.match(overlay,/\.stage\{\s*position:fixed;\s*inset:0;\s*width:100vw;\s*height:100vh/);
  assert.match(overlay,/text-rendering:optimizeLegibility/);
  assert.doesNotMatch(overlay,/\.stage\s*\{[^}]*transform:\s*scale\(/);
  assert.match(overlay,/function resizeVisibleMessage\(el\)/);
  assert.match(overlay,/resizeVisibleMessage\(el\);/);
  assert.match(overlay,/Math\.min\(2,Number\(cfg\.bubbleScale\?\?100\)\/100\)/);
});

test('multichat Full HD setup documents OBS source size and offers true DOM resizing',()=>{
  assert.match(widgets,/Multichat Full HD · 1920 × 1080/);
  assert.match(widgets,/Ancho: 1920/);
  assert.match(widgets,/Alto: 1080/);
  assert.match(widgets,/id="mcFont" max="56"/);
  assert.match(widgets,/id="mcName" max="46"/);
  assert.match(widgets,/id="mcScale" max="200" min="30"/);
  assert.match(widgets,/id="mcFullHD"/);
  assert.match(widgets,/getElementById\('mcFullHD'\)\.onclick/);
  assert.match(widgets,/\.preview\.chat\{height:auto;aspect-ratio:16\/9/);
});
