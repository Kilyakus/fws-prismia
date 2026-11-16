/** Contract for hosts and scopes: snapshot, subscribe, whitelisted dispatch. */
const COMMANDS={graph:['select','previewNode','addNode','removeNode','moveNode','setParam','connect','disconnect','setSurface','setSurfaceValues','applySurfacePreset','setResolution','setSeed','rename','expose','unexpose','load','undo','redo'],view:['set','reset'],render:[]};
export function createScopeExchange(providers={}){
  let disposed=false;const subscriptions=new Set(),channels=new Map();
  function channel(name){
    if(disposed)throw new Error('Обмен scopes освобождён');if(channels.has(name))return channels.get(name);
    const provider=providers[name];if(!provider||!COMMANDS[name])throw new Error(`Неизвестный канал: ${name}`);
    const commands=COMMANDS[name];const api={
      get value(){if(disposed)throw new Error('Обмен scopes освобождён');return provider.value;},
      subscribe(fn,options){if(disposed)throw new Error('Обмен scopes освобождён');const off=provider.subscribe(fn,options);let alive=true;const cancel=()=>{if(!alive)return;alive=false;subscriptions.delete(cancel);off();};subscriptions.add(cancel);return cancel;},
      dispatch(command,...args){if(disposed)throw new Error('Обмен scopes освобождён');if(!commands.includes(command)||typeof provider[command]!=='function')throw new Error(`Команда «${command}» запрещена для канала ${name}`);return provider[command](...args);},
    };
    for(const cmd of commands)api[cmd]=(...args)=>api.dispatch(cmd,...args);
    Object.freeze(api);channels.set(name,api);return api;
  }
  return Object.freeze({channel,dispose(){if(disposed)return;disposed=true;for(const off of [...subscriptions])off();channels.clear();}});
}
