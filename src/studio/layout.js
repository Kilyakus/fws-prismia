/** Move the old independent 2D pane into the 3D tab group once, leaving all
 * other areas, selections and surviving split weights untouched. */
export function migratePreviewLayout(config){
  function contains(node,id){return node?.type==='tab-area'?(node.widgets||[]).includes(id):(node?.children||[]).some(x=>contains(x,id));}
  function together(node){return node?.type==='tab-area'?(node.widgets||[]).includes('viewport')&&(node.widgets||[]).includes('preview'):(node?.children||[]).some(together);}
  if(!contains(config,'viewport')||!contains(config,'preview')||together(config))return config;
  function remove(node){
    if(node.type==='tab-area'){
      const widgets=node.widgets||[], selected=widgets[node.currentIndex||0], filtered=widgets.filter(id=>id!=='preview');
      if(!filtered.length)return null;
      return {...node,widgets:filtered,currentIndex:Math.max(0,filtered.indexOf(selected))};
    }
    const parts=(node.children||[]).map((child,i)=>({child:remove(child),size:node.sizes?.[i]??1})).filter(x=>x.child);
    if(!parts.length)return null;if(parts.length===1)return parts[0].child;
    return {...node,children:parts.map(x=>x.child),sizes:parts.map(x=>x.size)};
  }
  function add(node){
    if(node.type==='tab-area'){
      if(!node.widgets.includes('viewport'))return node;
      const widgets=[...node.widgets],index=widgets.indexOf('viewport');widgets.splice(index+1,0,'preview');
      return {...node,widgets,currentIndex:index};
    }
    return {...node,children:node.children.map(add)};
  }
  return add(remove(config));
}
