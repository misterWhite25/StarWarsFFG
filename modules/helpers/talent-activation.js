import {talent_activations} from '../config/ffg-talents.js';

/** Resolve display keys without altering the activation stored on the talent. */
export function talentActivationKey(value,label){
 const raw=value?.value??value;
 const normalize=s=>String(s??'').toLowerCase().replace(/[^a-z]/g,'');
 const entries=Object.values(talent_activations);
 const known=entries.find(entry=>normalize(entry.value)===normalize(raw)||entry.label===raw);
 if(known)return known.label;
 const fallback=value?.label??label;
 if(entries.some(entry=>entry.label===fallback))return fallback;
 return String(raw??fallback??'');
}
