'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const ui=require('../packages/builtin-components');
const {fixture}=require('./helpers/dom.cjs');
for(const name of ['disabled','hidden','inert'])test('named form control '+name+' does not disable sibling interactions',t=>{
 const f=fixture(t),form=f.document.createElement('form'),field=f.document.createElement('input'),named=f.document.createElement('input');
 named.name=name;named.id=name;form.append(field,named);f.document.body.append(form);
 // jsdom omits the browser HTMLFormElement named-property getter. Model the observed Chrome result explicitly.
 Object.defineProperty(form,name,{configurable:true,writable:true,value:named});
 const eventView={live:()=>true},parent={tag:'form',attrs:{},element:form,eventView},node={tag:'input',attrs:{},element:field,eventView};
 const interactions=ui.createWeappInteractions(f.root,{Error,path:()=>[node,parent],emit(){}});
 assert.equal(interactions.live(node),true,'a named DOM control is not a boolean disabled/hidden/inert state');
 form[name]=true;assert.equal(interactions.live(node),false,'a real boolean state must still block interactions');
 form[name]=false;assert.equal(interactions.live(node),true);
 field.disabled=true;assert.equal(interactions.live(node),false,'an actually disabled input stays blocked');
 field.disabled=false;parent.attrs.hidden=true;assert.equal(interactions.live(node),false,'logical hidden state stays blocked');
 interactions.disposeOwner('fixture');
});
