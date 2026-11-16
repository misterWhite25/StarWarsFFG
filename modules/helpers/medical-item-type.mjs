/** Recognize medical items by their explicit setting or stable catalogue identity. */
export function medicalItemType(item){
 if(item?.type!=='gear')return 0;
 const flags=item.flags??{},config=flags.starwarsffg?.config??{};
 if(config.medicalType!==undefined&&config.medicalType!==null&&config.medicalType!==''){
  const kind=Number(config.medicalType);return [1,2].includes(kind)?kind:0;
 }
 const identities=new Map([['gear.stimpack',1],['gear.ogg-erp',2]]);
 const key=flags['swffg-compendium-bilingual']?.key??String(flags.starwarsffg?.ffgimportid??'').replace(/^BILINGUAL:/,'');
 if(identities.has(key))return identities.get(key);
 const sources=[item._stats?.compendiumSource,flags.starwarsffg?.ffgUuid,flags.core?.sourceId];
 for(const source of sources){
  const match=/^Compendium\.swffg-compendium-bilingual(?:-steelers-equipment)?\.en-items\.Item\.(ecbe824175760495|e9750b767b4521fb)$/.exec(source??'');
  if(match)return match[1]==='ecbe824175760495'?1:2;
 }
 return 0;
}
