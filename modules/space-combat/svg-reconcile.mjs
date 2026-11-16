/** Update SVG geometry while preserving live token nodes, image elements and keyboard focus. */
export function reconcileSvg(current,next) {
  const incoming=new Set(next.getAttributeNames());
  for(const name of current.getAttributeNames())if(!incoming.has(name))current.removeAttribute(name);
  for(const name of incoming){const value=next.getAttribute(name);if(current.getAttribute(name)!==value)current.setAttribute(name,value);}
  reconcileSvgChildren(current,next);
  return current;
}

export function reconcileSvgChildren(current,next) {
  const previous=Array.from(current.children),incoming=Array.from(next.children);
  if(!incoming.length){if(previous.length||current.textContent!==next.textContent)current.textContent=next.textContent;return;}
  if(!previous.length&&current.textContent)current.textContent='';
  for(const [index,node]of incoming.entries()) {
    const old=previous[index];
    if(old?.localName===node.localName)reconcileSvg(old,node);
    else if(old)current.replaceChild(node,old);
    else current.append(node);
  }
  for(let index=incoming.length;index<previous.length;index++)previous[index].remove();
}
