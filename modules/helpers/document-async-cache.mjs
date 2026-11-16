/** Coalesce asynchronous reads, with bounded storage and weak document ownership. */
export class DocumentAsyncCache {
  constructor(limit=64){this.limit=limit;this.documents=new WeakMap();}
  get(document,key,load){
    let entries=this.documents.get(document);
    if(!entries){entries=new Map();this.documents.set(document,entries);}
    if(entries.has(key)){const cached=entries.get(key);entries.delete(key);entries.set(key,cached);return cached;}
    const work=Promise.resolve().then(load).catch(error=>{if(entries.get(key)===work)entries.delete(key);throw error;});
    entries.set(key,work);
    while(entries.size>this.limit)entries.delete(entries.keys().next().value);
    return work;
  }
  invalidate(document){if(document)this.documents.delete(document);else this.documents=new WeakMap();}
}
