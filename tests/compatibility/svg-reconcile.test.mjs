import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileSvg,reconcileSvgChildren} from '../../modules/space-combat/svg-reconcile.mjs';

class Element {
  constructor(localName,attributes={}){this.localName=localName;this.attributes={...attributes};this.children=[];this._text='';}
  getAttributeNames(){return Object.keys(this.attributes);}
  getAttribute(name){return this.attributes[name]??null;}
  setAttribute(name,value){this.attributes[name]=value;}
  removeAttribute(name){delete this.attributes[name];}
  get textContent(){return this._text;}
  set textContent(value){this._text=value;this.children=[];}
  append(node){node.parent=this;this.children.push(node);}
  replaceChild(next,previous){next.parent=this;this.children[this.children.indexOf(previous)]=next;previous.parent=null;}
  remove(){this.parent.children.splice(this.parent.children.indexOf(this),1);this.parent=null;}
}

test('SVG updates preserve image nodes while changing geometry, text and obsolete attributes',()=>{
  const current=new Element('g',{transform:'translate(10 20)',old:'value'}),image=new Element('image',{href:'ship.webp',width:'50'}),label=new Element('text');label.textContent='V 2';current.append(image);current.append(label);
  const next=new Element('g',{transform:'translate(20 30)'}),nextImage=new Element('image',{href:'ship.webp',width:'75'}),nextLabel=new Element('text');nextLabel.textContent='V 3';next.append(nextImage);next.append(nextLabel);
  reconcileSvg(current,next);
  assert.equal(current.children[0],image);assert.equal(current.children[1],label);
  assert.equal(image.getAttribute('width'),'75');assert.equal(label.textContent,'V 3');assert.equal(current.getAttribute('old'),null);
});

test('empty overlays remove their old shapes even when they contain no text',()=>{
  const overlay=new Element('g');overlay.append(new Element('circle'));reconcileSvgChildren(overlay,new Element('g'));assert.equal(overlay.children.length,0);
});

test('a changed SVG element kind is replaced and surplus siblings are removed',()=>{
  const overlay=new Element('g'),first=new Element('path'),second=new Element('circle');overlay.append(first);overlay.append(second);
  const next=new Element('g'),label=new Element('text');label.textContent='Destination';next.append(label);
  reconcileSvgChildren(overlay,next);assert.deepEqual(overlay.children,[label]);assert.equal(label.parent,overlay);
});
