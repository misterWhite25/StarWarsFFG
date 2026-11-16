/** Use Foundry's native groups and separator, preserving each action and its
 * visibility checks. Steelers actions explicitly identify their own group. */
Hooks.on('getActorContextOptions',(_app,options)=>{
  for(const option of options)option.group??='foundry';
});
