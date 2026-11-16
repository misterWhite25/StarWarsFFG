export const PORTRAIT_POSITIONS=['left','right','top','bottom'];
export const PORTRAIT_SIZES={auto:null,small:100,medium:140,large:180,xlarge:220};

/** Fit all portraits into an edge band, keeping the preferred size whenever
 * possible. Extra rows/columns and smaller cards are chosen locally, so a
 * participant with a smaller screen still sees the same cast in the same order. */
export function fitPortraitGrid({count,width,height,position='right',size='auto',named=false}){
  width=Math.max(1,width);height=Math.max(1,height);
  if(!count)return {columns:0,rows:0,width:0,height:0,cardWidth:0,cardHeight:0,gap:0};
  const horizontal=['top','bottom'].includes(position);
  const target=PORTRAIT_SIZES[size]??Math.max(100,Math.min(170,Math.min(width*.16,height*.24)));
  const bandWidth=horizontal?width:Math.min(width,Math.max(100,Math.min(440,width*.34)));
  const bandHeight=horizontal?Math.min(height,Math.max(100,Math.min(360,height*.38))):height;
  function choose(gap){
    let best;
    for(let columns=1;columns<=count;columns++){
      const rows=Math.ceil(count/columns);
      // Reserve the label row even while names are hidden. Adding or removing a
      // public name must never resize an image or take space from its frame.
      const byWidth=(bandWidth-gap*(columns-1))/columns;
      const byHeight=(bandHeight-gap*(rows-1))/rows;
      const contentHeight=byHeight-2;
      const byImageHeight=contentHeight>=32*(1.78/.28)?(contentHeight-32)/1.5:contentHeight/1.78;
      const cardWidth=Math.min(target,byWidth,byImageHeight);
      if(cardWidth<=0)continue;
      const captionHeight=Math.min(32,cardWidth*.28),imageHeight=cardWidth*1.5;
      const cardHeight=imageHeight+captionHeight+2;
      const w=columns*cardWidth+(columns-1)*gap,h=rows*cardHeight+(rows-1)*gap;
      const depth=horizontal?h:w;
      if(!best||cardWidth>best.cardWidth+.01||(Math.abs(cardWidth-best.cardWidth)<.01&&depth<best.depth)){
        best={columns,rows,width:w,height:h,cardWidth,cardHeight,imageHeight,captionHeight,gap,depth};
      }
    }
    return best;
  }
  const preferred=choose(Math.min(width,height)<500?5:8);
  return preferred?.cardWidth>=48?preferred:choose(1)??choose(0);
}
