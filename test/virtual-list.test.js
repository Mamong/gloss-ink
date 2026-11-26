'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const factory=vm.runInThisContext('('+require('./helpers/builtin-source.cjs').readSource('weapp-virtual-list.js')+')');
function fixture(){let updates=0;const lists=factory({innerHeight:640},{invalidate(){updates++;}}),element=Object.assign(new EventTarget(),{isConnected:true,clientHeight:200,scrollTop:0,getBoundingClientRect:()=>({height:200})}),rows=[0,1,2].map(()=>({getBoundingClientRect:()=>({height:40})}));return{lists,element,rows,updates:()=>updates};}

test('component list windows bound mounted items and preserve full spacer height without application state',async()=>{
 const f=fixture();f.lists.range('queue',10000);f.lists.attach('queue',f.element,f.rows);f.lists.flush();await Promise.resolve();
 for(const top of [0,1280,399800]){f.element.scrollTop=top;f.element.dispatchEvent(new Event('scroll'));const r=f.lists.range('queue',10000);assert(r.start>=0&&r.end<=10000);assert(r.end-r.start<=17);assert.equal(r.top+(r.end-r.start)*r.itemHeight+r.bottom,400000);}assert(f.updates()>0);f.lists.dispose();
});

test('component scroll-into-view resolves an unmounted keyed row before committing the viewport',()=>{
 const f=fixture();f.lists.range('queue',10000);f.lists.attach('queue',f.element,f.rows);f.lists.flush();const r=f.lists.range('queue',10000,{'scroll-into-view':'row-9999'},id=>Number(id.slice(4)));assert(r.start<=9999&&r.end>9999);f.lists.flush();assert.equal(f.element.scrollTop,399800);f.lists.dispose();
});

test('component list resize, variable-height fallback and disposal leave no stale scheduling',async()=>{
 const f=fixture();f.lists.range('queue',100);f.lists.attach('queue',f.element,[f.rows[0],{getBoundingClientRect:()=>({height:70})}]);f.lists.flush();const r=f.lists.range('queue',100);assert.equal(r.start,0);assert.equal(r.end,100);f.lists.dispose();await Promise.resolve();const count=f.updates();f.element.scrollTop=800;f.element.dispatchEvent(new Event('scroll'));await Promise.resolve();assert.equal(f.updates(),count);
});
