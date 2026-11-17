'use strict';
/* The browser and Windows installer share one and only one gold G source SVG. */
const {readFileSync,writeFileSync,existsSync}=require('node:fs');
const {resolve}=require('node:path');
const {Resvg}=require('@resvg/resvg-js');
const input=resolve(process.argv[2]||'favicon.svg');
const output=resolve(process.argv[3]||'build/grena-g.png');
if(!existsSync(input))throw Error('Missing gold favicon SVG: '+input);
const svg=readFileSync(input,'utf8');
if(!svg.includes('G Dorada')||!svg.includes('<linearGradient id="body"'))
  throw Error('Refusing to rasterize the old BLUE icon');
const rendered=new Resvg(svg,{fitTo:{mode:'width',value:256}}).render();
if(rendered.width!==256||rendered.height!==256)throw Error('Unexpected image size');
const image=rendered.asPng();
writeFileSync(output,image);
console.log('GREÑA G gold SVG -> transparent 256px PNG:',output);
