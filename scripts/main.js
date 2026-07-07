
const MODULE_ID="mosh-hacking-console";
const HH_MODULE_ID="mosh-hackers-handbook";
const OLD_HH_MODULE_ID="mosh-hackers-handbook-fr";
const SETTING="activeSession";
const SOCKET=`module.${MODULE_ID}`;
const DEFAULT_JOURNAL="Hacking Console — Demo Network";
const DEFAULT_TABLE="Intrusion Reaction — Standard";
let localSession=null;
const processedReactionRequests=new Set();
const processedClientIntents=new Set();
const seenSystemAlerts=new Set();

const esc=(v="")=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const slug=(v="")=>String(v??"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9_.-]+/g,"-").replace(/^-+|-+$/g,"");
function encodeSession(s){return btoa(unescape(encodeURIComponent(JSON.stringify(s))))}
function decodeSession(raw){return JSON.parse(decodeURIComponent(escape(atob(raw))))}
function textFromHtml(html=""){const d=document.createElement("div");d.innerHTML=String(html??"");d.querySelectorAll("br").forEach(b=>b.replaceWith("\n"));d.querySelectorAll("p,h1,h2,h3,h4,li,div").forEach(e=>e.append("\n"));return d.textContent.replace(/\u00a0/g," ").replace(/\n{3,}/g,"\n\n").trim();}
function field(t,labels,f=""){for(const l of (Array.isArray(labels)?labels:[labels])){const m=t.match(new RegExp(`^\\s*${l}\\s*:\\s*(.+?)\\s*$`,"im"));if(m)return m[1].trim()}return f}
function listField(t,labels){const v=field(t,labels,"");if(!v||/^—|-|aucun|none|null$/i.test(v))return[];return v.split(/[,;]+/).map(x=>x.trim()).filter(Boolean).slice(0,4)}
function section(t,names){const labels=(Array.isArray(names)?names:[names]).map(n=>n.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|");const m=t.match(new RegExp(`(?:^|\\n)\\s*(?:#{1,6}\\s*)?(?:${labels})\\s*\\n([\\s\\S]*?)(?=\\n\\s*(?:#{1,6}\\s*)?[A-ZÀ-Ÿa-zà-ÿ0-9 ._'’/-]+\\s*\\n|$)`,"i"));return m?m[1].trim():""}
function parseResponse(v){const m=String(v??"").match(/[+-]?\d+/);return m?Number(m[0]):0}
function normSec(v="UNSECURED"){
  v=String(v||"").toUpperCase().trim();
  // Important: UNSECURED contains the substring SECURE, so it must be tested first.
  if(/UNSEC|NON[- ]?SEC|NO SECURITY|OPEN/.test(v))return"UNSECURED";
  if(/RENFORC|HARDENED/.test(v))return"HARDENED";
  if(/CHIFFR|ENCRYPTED/.test(v))return"ENCRYPTED";
  if(/SECURE|SÉCUR/.test(v))return"SECURE";
  return v||"UNSECURED";
}
function pageText(p){return textFromHtml(p.text?.content??"")}
function parseConfig(j){const p=j.pages.find(p=>/^_?CONFIG$/i.test(p.name));if(!p)return{};const t=pageText(p);return{entryNode:field(t,["Nœud de départ","Entry node","Entry node","Entry point"],""),responseTableName:field(t,["Table de réponse","Reaction table","Response table","Table"],DEFAULT_TABLE),defaultNetwork:field(t,["Network par défaut","Default network"],"")}}

function isHackSystemJournal(j){
  if(j.getFlag?.(MODULE_ID,"hackSystem")) return true;
  const p=j.pages?.find?.(p=>/^_?CONFIG$/i.test(p.name));
  if(!p) return false;
  const t=pageText(p);
  return /(?:Console de Hack|Hack Console|System de Hack|Hack System)\s*:\s*(yes|yes|true|1)/i.test(t)
    || /Type\s*:\s*(HACK_SYSTEM|HACK SYSTEM|CONSOLE_HACK|HACK)/i.test(t);
}
function parseJournal(j){const cfg=parseConfig(j),nodes=[];for(const p of j.pages.contents){if(/^_?CONFIG$/i.test(p.name)||/^_?MAP$/i.test(p.name))continue;const t=pageText(p),pn=p.name.trim(),net=field(t,["Réseau","Network"],cfg.defaultNetwork||(pn.includes("/")?pn.split("/")[0].trim():"network.local")),name=field(t,["Nœud","Node"],pn.includes("/")?pn.split("/").slice(1).join("/").trim():pn),id=slug(`${net}.${name}`);nodes.push({id,name,network:net,function:field(t,["Function","Function"],"TERMINAL").toUpperCase(),security:normSec(field(t,["Sécurité","Security"],"UNSECURED")),response:parseResponse(field(t,["Réponse","Reaction","Response"],"0")),baseReaction:parseResponse(field(t,["Réponse","Reaction","Response"],"0")),state:"scanned",locked:false,grid:field(t,["Grille","Grid","Position"],""),connectionsRaw:listField(t,["Connexions","Connections","Liens"]),connections:[],journalUuid:p.uuid,gmDescription:section(t,["Description MJ","GM Description","Description"]),playerData:section(t,["Data","Data","Data révélées","Player Data"]),success:section(t,["Success","Success"]),failure:section(t,["Failure","Failure"])})}
 const byName=new Map(nodes.map(n=>[slug(n.name),n.id])), byNet=new Map(nodes.map(n=>[slug(`${n.network}.${n.name}`),n.id]));for(const n of nodes)n.connections=n.connectionsRaw.map(x=>byNet.get(slug(`${n.network}.${x}`))??byName.get(slug(x))??slug(`${n.network}.${x}`)).slice(0,4);for(const n of nodes){if(isFirewall(n))n.security="HARDENED";if(n.security==="ENCRYPTED")n.locked=true}return{config:cfg,nodes}}
function blank(){return{id:"active",journalId:"",journalName:"No system loaded",actorId:"",actorName:"—",deckId:"",deckName:"—",responseTableName:DEFAULT_TABLE,allowedUserIds:[],connectedUserIds:[],selectedNodeId:"",entryNodeId:"",nodes:[],initialNodes:[],conditions:[],systemAlert:null,ignoreNextReaction:false,revision:0,updatedAt:Date.now()}}
function canonical(){return foundry.utils.deepClone(game.settings.get(MODULE_ID,SETTING)??blank())}
function session(){return foundry.utils.deepClone(localSession??canonical())}
function remember(s){localSession=foundry.utils.deepClone(s??blank())}
function isAllowed(s){return game.user.isGM||!s.allowedUserIds?.length||s.allowedUserIds.includes(game.user.id)}
function consoleUserIds(s){
  const allowed=(s.allowedUserIds??[]).filter(id=>game.users.get(id)?.active);
  const connected=(s.connectedUserIds??[]).filter(id=>allowed.includes(id));
  // Target players who are actually connected to the console.
  // If presence has not reached the GM yet, fall back to active authorized players so the effect is not lost.
  return connected.length?connected:allowed;
}
async function markConsolePresence(userId,open=true){
  if(!game.user.isGM||!userId)return;
  const s=canonical();
  s.connectedUserIds??=[];
  const set=new Set(s.connectedUserIds);
  if(open)set.add(userId);else set.delete(userId);
  s.connectedUserIds=Array.from(set);
  await saveCanon(s,true);
  rerenderOpen();
}
function gmIds(){return game.users.filter(u=>u.isGM).map(u=>u.id)}
function isDevice(i){return i?.flags?.[HH_MODULE_ID]?.subtype==="hacking-device"}
function isSoftware(i){return (i?.flags?.[HH_MODULE_ID]?.subtype??i?.flags?.[OLD_HH_MODULE_ID]?.subtype)==="hacking-software"}
function hhData(i){return foundry.utils.deepClone(i?.flags?.[HH_MODULE_ID]??i?.flags?.[OLD_HH_MODULE_ID]??{})}
function softwareKey(item){
  const data=hhData(item);
  const key=data.activation?.effectKey??"";
  const name=String(item?.name??"").toLowerCase();
  if(key)return key;
  if(name.includes("ib++"))return"icebreakerPlus";
  if(name.includes("icebreaker"))return"icebreaker";
  if(name.includes("xmap"))return"mapNetwork";
  if(name.includes("coyboy"))return"reduceResponse";
  if(name.includes("maze"))return"ignoreResponse";
  if(name.includes("ripper"))return"bruteForcePassword";
  return"";
}
function consumeSoftwareItem(item){
  try{return item?.delete?.()}catch(e){console.warn(`${MODULE_ID} | Unable to delete software.`,e)}
}
function actorOf(s){return s.actorId?game.actors.get(s.actorId):(game.user.character??null)}
function softwareOf(actor,deckId){
  if(!actor)return[];
  return actor.items.filter(i=>{
    if(!isSoftware(i))return false;
    const data=hhData(i);
    // Without an explicitly selected deck, only software actually installed in a deck is shown.
    // Software merely present in the inventory but not installed is excluded.
    if(!deckId)return !!data.installedIn;
    return data.installedIn===deckId;
  });
}
function isSoftwareInstalledForConsole(item,deckId=""){
  const data=hhData(item);
  if(!isSoftware(item))return false;
  return deckId?data.installedIn===deckId:!!data.installedIn;
}
function addCondition(s,title,text,scope="system"){
  s.conditions??=[];
  s.conditions.unshift({id:foundry.utils.randomID(8),title,text,scope,at:Date.now()});
  s.conditions=s.conditions.slice(0,8);
}
function increaseAllReactions(s,amount=1,reason="Reaction +1"){
  for(const n of s.nodes??[])n.response=Number(n.response??0)+amount;
  addCondition(s,reason,`All system reactions increase by +${amount}.`,"reaction");
}
function showConsoleOverlay(message,kind="error",seconds=5){
  const existing=document.querySelector(".mhc-alert-overlay");
  if(existing)existing.remove();
  const el=document.createElement("div");
  el.className=`mhc-alert-overlay ${kind}`;
  const closing=Number(seconds)>0;
  el.innerHTML=`<div><h1>${esc(message)}</h1>${closing?`<p>Closing console in ${seconds} seconds…</p>`:`<p>System reaction in progress.</p>`}</div>`;
  document.body.appendChild(el);
  if(closing){
    setTimeout(()=>el.remove(),seconds*1000);
    setTimeout(()=>{for(const app of Object.values(ui.windows))if(app instanceof HackConsoleApp)app.close()},seconds*1000);
  }else{
    setTimeout(()=>el.remove(),4000);
  }
}
function setSystemAlert(s,message,kind="error",seconds=5,targetUserIds=null){
  const targets=targetUserIds??consoleUserIds(s);
  s.systemAlert={id:foundry.utils.randomID(8),message,kind,seconds,targetUserIds:targets,at:Date.now()};
}
function handleSystemAlert(s){
  const a=s?.systemAlert;
  if(!a?.id||seenSystemAlerts.has(a.id))return;
  if(game.user.isGM)return;
  if(a.targetUserIds?.length&&!a.targetUserIds.includes(game.user.id))return;
  seenSystemAlerts.add(a.id);
  showConsoleOverlay(a.message||"SYSTEM REACTION",a.kind||"error",Number(a.seconds??5));
}
async function addStress(actor,amount=1){
  if(!actor)return false;
  const candidates=["system.stress.value","system.stress","system.stats.stress.value","system.other.stress.value"];
  for(const path of candidates){
    const current=foundry.utils.getProperty(actor,path);
    if(typeof current==="number"){
      await actor.update({[path]:current+amount});
      return true;
    }
  }
  return false;
}
function reactionText(result){
  if(result<=1)return"Device is remotely powered off.";
  if(result===2)return"USER ACCOUNT locked out for 1d10 hours.";
  if(result===3)return"Security member dispatched to investigate. Arrives in 1d10 minutes.";
  if(result===4)return"NetSec Response.";
  if(result===5)return"The network and all linked networks are locked down for 1d10 hours.";
  if(result===6)return"This network and all linked networks increase security level by 1.";
  if(result===7)return"All linked networks increase RESPONSE +1.";
  if(result===8)return"Facility blackout. All non-essential electronics powered down.";
  return"TACTICAL RESPONSE TEAM deployed on Seek & Destroy mission. Arrives, heavily armed in 1d5 minutes.";
}
function netsecText(result){
  return [
    "DENIAL OF SERVICE: NetSec blocks connections from the hacker’s connected hardware by flooding the connection with garbage, making future hacking attempts slower.",
    "BACK HACK: NetSec attempts to control/destroy the terminal/deck/etc. being used in the attack.",
    "MALWARE ATTACK: NetSec uses a virus to disable the hacker’s hardware for some time.",
    "POWER OVERLOAD: NetSec pushes excessive voltage to the hacker’s hardware.",
    "IDENTITY TRACE: NetSec attempts to obtain identifying information about the hacker.",
    "NETWORK TRACE: NetSec attempts to locate the physical location of the hacker."
  ][Math.max(0,Math.min(5,result-1))];
}

function label(st){return st==="entry"?"POINT D’ENTRÉE":st==="open"?"OUVERT":st==="compromised"?"COMPROMIS":"SCANNÉ"}
function accessible(n){return n?.state==="open"||n?.state==="entry"}
function neighbor(s,n){const set=new Set(n.connections??[]);return s.nodes.find(o=>o.id!==n.id&&(set.has(o.id)||(o.connections??[]).includes(n.id))&&accessible(o))}
function isUnsecured(n){return ["UNSECURED","BROKEN"].includes(String(n?.security??"").toUpperCase())}
function isFirewall(n){return /FIREWALL|PARE-FEU|PAREFEU/.test(String(n?.function??"").toUpperCase())}
function hasOpenRouter(s){return (s.nodes??[]).some(n=>accessible(n)&&/ROUTER|HUB/.test(String(n.function??"").toUpperCase()))}
function nodeIsVisible(s,n){return game.user.isGM||n?.visible!==false}
function canReachForHack(s,n){
  if(!n||n.visible===false)return false;
  if(hasOpenRouter(s))return true;
  return !!neighbor(s,n);
}
function canHack(s,n){return !!n&&!accessible(n)&&!n.locked&&!isUnsecured(n)&&canReachForHack(s,n)}
function canOpenDirect(s,n){return !!n&&!accessible(n)&&!n.locked&&isUnsecured(n)&&canReachForHack(s,n)}
function hackModeForNode(n, requested=""){
  const sec=String(n?.security??"").toUpperCase();
  // Gameplay rule: a HARDENED / FIREWALL node always imposes Disadvantage [-].
  // The Hack [+] button cannot override this unless software first lowers the security level.
  if(isFirewall(n)||sec==="HARDENED")return"[-]";
  if(requested)return requested;
  if(sec==="ENCRYPTED")return"[-]";
  return"";
}
function securityClass(n){
  const sec=String(n?.security??"UNSECURED").toUpperCase();
  if(sec==="ENCRYPTED")return"sec-encrypted";
  if(sec==="HARDENED")return"sec-hardened";
  if(sec==="SECURE")return"sec-secure";
  return"sec-unsecured";
}
function revealConnected(s,node){if(!node)return;node.visible=true;for(const id of node.connections??[]){const target=s.nodes.find(n=>n.id===id);if(target)target.visible=true}for(const other of s.nodes??[]){if((other.connections??[]).includes(node.id))other.visible=true}}
function revealAll(s){for(const n of s.nodes??[])n.visible=true}
function hint(n){const f=String(n?.function??"").toUpperCase();if(/FIREWALL|PARE-FEU|PAREFEU/.test(f))return["Filter traffic","Allow or block a route","Force an access rule"];if(/DATA/.test(f))return["Download data","Copy logs","Search for an access key"];if(/ROUTER|HUB/.test(f))return["Trace connections","Open a route"];if(/TERMINAL/.test(f))return["Log in","Read local files"];if(/INFRASTRUCTURE|CONTROL|CTRL|ENGINE|LIFE/.test(f))return["Display system status","Modify a parameter"];return["Explore the node","Extract data"]}
async function saveCanon(s,b=true){if(!game.user.isGM)return false;s.revision=Number(s.revision??0)+1;s.updatedAt=Date.now();remember(s);await game.settings.set(MODULE_ID,SETTING,s);if(b)game.socket.emit(SOCKET,{type:"state",session:s});return true}
function applyState(s){
  if(!s)return;
  const cur=localSession;
  // Player updates may have the same revision as the local state.
  // Accept them to keep all consoles synchronized in real time.
  if(!cur||s.id===cur.id||Number(s.revision??0)>=Number(cur.revision??0)){
    remember(s);
    rerenderOpen();
    handleSystemAlert(s);
  }
}
function forceApplyState(s){
  if(!s)return;
  remember(s);
  rerenderOpen();
  handleSystemAlert(s);
}
async function broadcastStateFallback(s){
  const userIds=consoleUserIds(s);
  game.socket.emit(SOCKET,{type:"force-state",session:s,userIds});
  if(userIds.length){
    try{
      await ChatMessage.create({
        whisper:userIds,
        content:`<div class="mhc-state-payload" style="display:none" data-session="${encodeURIComponent(JSON.stringify(s))}"></div>`
      });
    }catch(err){
      console.warn(`${MODULE_ID} | Player state fallback failed`,err);
    }
  }
}
async function pushPlayerState(s){
  console.warn(`${MODULE_ID} | pushPlayerState ignoré : mode serveur authoritative`);
}

async function gmOnlyReactionMessage(content, speaker=null){
  if(game.user.isGM){
    return ChatMessage.create({speaker:speaker??ChatMessage.getSpeaker(),whisper:gmIds(),content});
  }
  // The player no longer creates the Reaction message: only the content is sent to the GM client.
  game.socket.emit(SOCKET,{type:"gm-reaction-log",content,speakerData:speaker,userId:game.user.id,userName:game.user.name});
}

async function requestGMReaction(s,n){
  const requestId=foundry.utils.randomID(16);
  const payload={type:"gm-reaction-resolve",requestId,session:s,nodeId:n?.id,userId:game.user.id,userName:game.user.name};
  // Primary channel: player socket -> GM.
  game.socket.emit(SOCKET,payload);
  // Fallback channel: private technical GM message, like the working sync fallback.
  try{
    await ChatMessage.create({
      whisper:gmIds(),
      content:`<div class="mhc-reaction-payload" style="display:none" data-request="${requestId}" data-node="${esc(n?.id??"")}" data-user="${esc(game.user.name)}" data-session="${encodeURIComponent(JSON.stringify(s))}"></div>`
    });
  }catch(err){
    console.warn(`${MODULE_ID} | Fallback chat reaction impossible`,err);
  }
}

async function resolveGMReactionPayload(p,source="socket"){
  if(!game.user.isGM||!p?.session)return;
  const requestId=p.requestId??`${p.userId??"unknown"}-${p.nodeId??"node"}-${p.session?.revision??0}`;
  if(processedReactionRequests.has(requestId))return;
  processedReactionRequests.add(requestId);

  const incoming=foundry.utils.deepClone(p.session);
  const current=canonical();
  incoming.connectedUserIds=current.connectedUserIds??incoming.connectedUserIds??[];
  incoming.allowedUserIds=current.allowedUserIds??incoming.allowedUserIds??[];
  incoming.revision=Math.max(Number(incoming.revision??0),Number(current.revision??0));
  remember(incoming);

  const app=Object.values(ui.windows).find(a=>a instanceof HackConsoleApp)??new HackConsoleApp();
  const node=incoming.nodes.find(n=>n.id===p.nodeId);
  if(!node){
    console.warn(`${MODULE_ID} | Node not found for reaction`,p.nodeId);
    return;
  }

  await app.rollResponse(incoming,node);
  await saveCanon(incoming,true);
  await broadcastStateFallback(incoming);
  ui.notifications.info(`Reaction resolved on GM side (${source}) for ${p.userName??"player"}.`);
}


function clientActorId(){
  return game.user.character?.id ?? canvas?.tokens?.controlled?.[0]?.actor?.id ?? "";
}
async function sendClientIntent(intent,payload={}){
  const msg={type:"client-intent",intent,requestId:foundry.utils.randomID(16),userId:game.user.id,userName:game.user.name,actorId:clientActorId(),...payload};
  game.socket.emit(SOCKET,msg);
  // Robust fallback: if the client -> GM socket fails, the GM reads this technical message.
  try{
    await ChatMessage.create({
      whisper:gmIds(),
      content:`<div class="mhc-intent-payload" style="display:none" data-intent="${encodeURIComponent(JSON.stringify(msg))}"></div>`
    });
  }catch(err){
    console.warn(`${MODULE_ID} | Chat intent fallback failed`,err);
  }
  ui.notifications.info("Action sent to the GM console.");
}
async function handleClientIntent(p,source="socket"){
  if(!game.user.isGM)return;
  if(p.requestId&&processedClientIntents.has(p.requestId))return;
  if(p.requestId)processedClientIntents.add(p.requestId);
  const s=canonical();
  s.connectedUserIds??=[];
  if(p.userId&&!s.connectedUserIds.includes(p.userId))s.connectedUserIds.push(p.userId);
  const app=Object.values(ui.windows).find(a=>a instanceof HackConsoleApp)??new HackConsoleApp();
  const n=s.nodes.find(n=>n.id===p.nodeId);
  if(!n)return ui.notifications.warn(`Node not found for intent ${p.intent}.`);
  ui.notifications.info(`Intent ${p.intent} received from ${p.userName??"player"} (${source}).`);

  if(p.intent==="open-direct"){
    if(!canOpenDirect(s,n))return ui.notifications.warn(`${p.userName??"Player"} is trying to open an inaccessible node.`);
    n.state="open";
    revealConnected(s,n);
    await ChatMessage.create({content:`<h2>Node opened</h2><p><strong>${esc(n.name)}</strong> is unsecured and opens without a hack.</p>`});
    await saveCanon(s,true);
    await broadcastStateFallback(s);
    return;
  }

  if(p.intent==="hack-result"){
    if(p.success){
      n.state="open";
      revealConnected(s,n);
      await ChatMessage.create({content:`<h2>Hack successful</h2><p>${esc(p.userName??"The hacker")} opens <strong>${esc(n.name)}</strong>.</p>`});
      await saveCanon(s,true);
      await broadcastStateFallback(s);
    }else{
      n.state="compromised";
      await ChatMessage.create({content:`<h2>Hack failed</h2><p>${esc(p.userName??"The hacker")} compromises <strong>${esc(n.name)}</strong>. GM reaction.</p>`});
      await app.rollResponse(s,n);
      await saveCanon(s,true);
      await broadcastStateFallback(s);
    }
    return;
  }

  if(p.intent==="software"){
    await app.useSoftware(s,n,p.itemId,p.actorId);
    return;
  }
}

function gridPos(n){const m=String(n.grid??"").match(/(-?\d+)\s*[,;xX ]\s*(-?\d+)/);return m?{x:Number(m[1]),y:Number(m[2])}:null}
function freeAround(o,occ,i=0){const dirs=[{x:1,y:0},{x:0,y:1},{x:0,y:-1},{x:-1,y:0}];for(let p=0;p<4;p++){const d=dirs[(i+p)%4],k=`${o.x+d.x},${o.y+d.y}`;if(!occ.has(k))return{x:o.x+d.x,y:o.y+d.y}}for(let r=2;r<12;r++)for(let dx=-r;dx<=r;dx++)for(let dy=-r;dy<=r;dy++){if(Math.abs(dx)+Math.abs(dy)!==r)continue;const k=`${o.x+dx},${o.y+dy}`;if(!occ.has(k))return{x:o.x+dx,y:o.y+dy}}return{x:o.x+1,y:o.y+1}}
function layout(s){const nodes=s.nodes??[],entryId=s.entryNodeId??nodes[0]?.id,adj=new Map(nodes.map(n=>[n.id,new Set()]));for(const n of nodes){n.connections=(n.connections??[]).slice(0,4);for(const c of n.connections){if(!adj.has(c))continue;adj.get(n.id).add(c);adj.get(c).add(n.id)}}const grid=new Map(),occ=new Set();for(const n of nodes){const p=gridPos(n);if(p){grid.set(n.id,p);occ.add(`${p.x},${p.y}`)}}const entry=nodes.find(n=>n.id===entryId)??nodes[0];if(entry&&!grid.has(entry.id)){grid.set(entry.id,{x:0,y:0});occ.add("0,0")}const q=entry?[entry.id]:[],seen=new Set(q);while(q.length){const id=q.shift(),o=grid.get(id)??{x:0,y:0};let slot=0;for(const nx of adj.get(id)??[]){if(!grid.has(nx)){const p=freeAround(o,occ,slot);grid.set(nx,p);occ.add(`${p.x},${p.y}`)}slot++;if(!seen.has(nx)){seen.add(nx);q.push(nx)}}}let iso=0;for(const n of nodes){if(grid.has(n.id))continue;let p;do{p={x:iso%6,y:4+Math.floor(iso/6)};iso++}while(occ.has(`${p.x},${p.y}`));grid.set(n.id,p);occ.add(`${p.x},${p.y}`)}const xs=[...grid.values()].map(p=>p.x),ys=[...grid.values()].map(p=>p.y),minX=Math.min(...xs,0),minY=Math.min(...ys,0),cell=132,size=74,pad=44,pos=new Map();for(const n of nodes){const gp=grid.get(n.id);pos.set(n.id,{x:pad+(gp.x-minX)*cell,y:pad+(gp.y-minY)*cell,w:size,h:size,gx:gp.x,gy:gp.y})}const lines=[],seenL=new Set();for(const n of nodes){const a=pos.get(n.id);if(!a)continue;for(const c of n.connections??[]){const b=pos.get(c);if(!b)continue;const key=[n.id,c].sort().join("|");if(seenL.has(key))continue;seenL.add(key);const ac={x:a.x+a.w/2,y:a.y+a.h/2},bc={x:b.x+b.w/2,y:b.y+b.h/2},dx=b.gx-a.gx,dy=b.gy-a.gy;let x1=ac.x,y1=ac.y,x2=bc.x,y2=bc.y;if(Math.abs(dx)>=Math.abs(dy)){x1=ac.x+Math.sign(dx||1)*a.w/2;y1=ac.y;x2=bc.x-Math.sign(dx||1)*b.w/2;y2=bc.y}else{x1=ac.x;y1=ac.y+Math.sign(dy||1)*a.h/2;x2=bc.x;y2=bc.y-Math.sign(dy||1)*b.h/2}const mid=Math.abs(x1-x2)>Math.abs(y1-y2)?`${(x1+x2)/2},${y1} ${(x1+x2)/2},${y2}`:`${x1},${(y1+y2)/2} ${x2},${(y1+y2)/2}`;lines.push({points:`${x1},${y1} ${mid} ${x2},${y2}`,open:accessible(n)&&accessible(nodes.find(nn=>nn.id===c)),visible:n.visible!==false&&nodes.find(nn=>nn.id===c)?.visible!==false,hidden:n.visible===false||nodes.find(nn=>nn.id===c)?.visible===false})}}return{positions:pos,lines,width:Math.max(720,...[...pos.values()].map(p=>p.x+p.w+pad)),height:Math.max(560,...[...pos.values()].map(p=>p.y+p.h+pad)),minX,minY,cell,pad}}

class HackConsoleApp extends Application{
 static get defaultOptions(){return foundry.utils.mergeObject(super.defaultOptions,{id:"mosh-hack-console",classes:["mosh-hack-console-app"],title:"Hacking Console",width:1180,height:790,resizable:true})}
 get title(){return`Hacking Console — ${session().journalName??"No system"}`}
 async _renderInner(){if(!game.user.isGM&&!this._mhcPresenceSent){this._mhcPresenceSent=true;game.socket.emit(SOCKET,{type:"console-presence",userId:game.user.id,open:true})}return $(this.renderContent(session()))}
 async close(options={}){if(!game.user.isGM&&this._mhcPresenceSent){this._mhcPresenceSent=false;game.socket.emit(SOCKET,{type:"console-presence",userId:game.user.id,open:false})}return super.close(options)}
 renderContent(s){const actor=actorOf(s),soft=softwareOf(actor,s.deckId),visibleNodes=game.user.isGM?(s.nodes??[]):(s.nodes??[]).filter(n=>n.visible!==false),node=visibleNodes.find(n=>n.id===s.selectedNodeId)??visibleNodes[0]??s.nodes[0],lay=layout(s),full=node&&(game.user.isGM||accessible(node));const lines=lay.lines.filter(l=>game.user.isGM||l.visible).map(l=>`<polyline class="mhc-link ${l.open?"open":""}${l.hidden?" hidden":""}" points="${l.points}"></polyline>`).join("");const nodes=visibleNodes.map(n=>{const p=lay.positions.get(n.id),access=canHack(s,n)?" accessible":"",hidden=game.user.isGM&&n.visible===false?" hidden-node":"";return`<button type="button" class="mhc-graph-node ${securityClass(n)} ${n.state}${n.locked?" locked":""}${n.id===s.selectedNodeId?" selected":""}${access}${hidden}" style="left:${p.x}px;top:${p.y}px;width:${p.w}px;height:${p.h}px" data-node-id="${esc(n.id)}" title="${esc(n.name)} — ${esc(n.security)}"><span class="mhc-node-rings"></span><span class="mhc-node-core"></span><strong>${esc(n.name)}</strong></button>`}).join("");const info=isAllowed(s)?this.info(s,node,full,soft):`<h2>Access denied</h2><p>The GM has not granted you access to this system yet.</p>`;return`<div class="mhc-root"><header class="mhc-top"><div><h1>${esc(s.journalName)}</h1><p><strong>Authorized hackers :</strong> ${esc((s.allowedUserIds??[]).map(id=>game.users.get(id)?.name).filter(Boolean).join(", ")||"—")}</p><p><strong>Connected to console :</strong> ${esc((s.connectedUserIds??[]).map(id=>game.users.get(id)?.name).filter(Boolean).join(", ")||"—")}</p><p><strong>Revision :</strong> ${Number(s.revision??0)} — <strong>Updated :</strong> ${new Date(s.updatedAt??Date.now()).toLocaleTimeString()}</p>${this.conditions(s)}</div>${game.user.isGM?this.config(s):`<div><p><strong>View :</strong> Hacker</p></div>`}</header><main class="mhc-main"><section class="mhc-map"><div class="mhc-stage" style="width:${lay.width}px;height:${lay.height}px"><svg class="mhc-svg" width="${lay.width}" height="${lay.height}" viewBox="0 0 ${lay.width} ${lay.height}" preserveAspectRatio="none">${lines}</svg>${nodes}</div></section><aside class="mhc-info">${info}</aside></main></div>`}
 conditions(s){return (s.conditions??[]).length?`<div class="mhc-conditions">${s.conditions.map(c=>`<span title="${esc(c.text)}">${esc(c.title)}</span>`).join("")}</div>`:""}
 config(s){
    const journals=game.journal.contents.filter(j=>j.pages?.size&&isHackSystemJournal(j)).sort((a,b)=>a.name.localeCompare(b.name));
    const users=game.users.contents.filter(u=>!u.isGM).sort((a,b)=>a.name.localeCompare(b.name));
    return`<div class="mhc-config">
      <label>System <select name="journalId">${journals.map(j=>`<option value="${j.id}" ${j.id===s.journalId?"selected":""}>${esc(j.name)}</option>`).join("")}</select></label>
      <div class="mhc-user-list">${users.map(u=>`<label><input type="checkbox" name="allowed-user" value="${u.id}" ${s.allowedUserIds?.includes(u.id)?"checked":""}> ${esc(u.name)}</label>`).join("")||"<em>No players</em>"}</div>
      <button type="button" data-action="load-system">Load / replace system</button>
      <button type="button" data-action="save-access">Update access</button>
      <button type="button" data-action="invite">Invitation</button>
      <button type="button" data-action="reset-system">Reset system</button>
      <button type="button" data-action="end-hack">End hack</button>
      <p class="mhc-config-note">Only journals marked <code>Type: HACK_SYSTEM</code> or <code>Hack Console: yes</code> on the <code>_CONFIG</code> page are listed.</p>
    </div>`}
 info(s,n,full,soft){if(!n)return`<h2>No node</h2><p>GM: choose a system file, then click <strong>Load / replace system</strong>.</p>`;return`<h2>${esc(n.name)}</h2><p><strong>Network:</strong> ${esc(n.network)}</p><p><strong>Type:</strong> ${esc(n.function)}</p><p><strong>Security:</strong> ${esc(n.security)}</p><p><strong>Reaction:</strong> ${n.response>0?"+":""}${n.response} ${game.user.isGM?`<button type="button" class="mini" data-action="response-minus">−</button><button type="button" class="mini" data-action="response-plus">+</button>`:""}</p>${n.locked?`<p class="mhc-warning"><strong>Locked</strong>${n.security==="ENCRYPTED"?" — PEK required":""}</p>`:""}<hr>${full?`<h3>Data</h3><div class="mhc-box">${esc(n.playerData||"No data.").replace(/\n/g,"<br>")}</div><h3>Available actions</h3><ul>${hint(n).map(a=>`<li>${esc(a)}</li>`).join("")}</ul>`:`<p>This node is scanned but not open yet.</p><p><strong>Access:</strong> ${canOpenDirect(s,n)?"direct opening available":canHack(s,n)?"hack possible from an adjacent open node":"no adjacent open node"}</p>`}${game.user.isGM?`<h3>GM Notes</h3><div class="mhc-box">${esc(n.gmDescription||"—").replace(/\n/g,"<br>")}</div>`:""}<div class="mhc-actions">${this.buttons(s,n)}</div>${soft.length?`<hr><h3>Software installed in a deck</h3><div class="mhc-actions">${soft.map(x=>`<button type="button" data-action="software" data-item-id="${x.id}">${esc(x.name)}</button>`).join("")}</div>`:""}`}
 buttons(s,n){if(game.user.isGM)return`<button data-action="set-entry">Entry point</button><button data-action="set-open">Open</button><button data-action="set-compromised">Compromise</button><button data-action="reset-node">Reset node</button><button data-action="reveal-all">Reveal all</button><button data-action="hide-node">Hide</button><button data-action="response">Reaction</button><button data-action="lock">Lock / PEK</button><button data-action="open-page">Page</button>`;return`${canOpenDirect(s,n)?`<button data-action="open-direct">Open without hack</button>`:""}${canHack(s,n)?`<button data-action="hack-normal">${(isFirewall(n)||String(n.security).toUpperCase()==="HARDENED")?"Hack [-]":"Hack"}</button>${(isFirewall(n)||String(n.security).toUpperCase()==="HARDENED")?"":`<button data-action="hack-adv">Hack [+]</button>`}`:""}`}
 activateListeners(html){super.activateListeners(html);html.find(".mhc-graph-node").on("click",e=>{const s=session();s.selectedNodeId=e.currentTarget.dataset.nodeId;remember(s);this.render(false)});html.find(".mhc-graph-node").on("contextmenu",e=>{e.preventDefault();const s=session();s.selectedNodeId=e.currentTarget.dataset.nodeId;remember(s);this.menu(e,s)});html.find("[data-action]").on("click",e=>{e.preventDefault();this.action(e.currentTarget.dataset.action,e.currentTarget.dataset.itemId??null,html)})}
 menu(e,s){$(".mhc-context-menu").remove();const n=s.nodes.find(n=>n.id===s.selectedNodeId),acts=game.user.isGM?[["set-entry","Entry point"],["set-open","Open"],["set-compromised","Compromise"],["reset-node","Reset node"],["response","Reaction"],["lock","Lock / PEK"],["open-page","Page"]]:[["open-direct","Open without hack"],["hack-normal","Hack"],["hack-adv","Hack [+]"]];const m=$(`<div class="mhc-context-menu"><strong>${esc(n?.name??"Node")}</strong>${acts.map(([a,l])=>`<button data-action="${a}">${esc(l)}</button>`).join("")}</div>`);m.css({left:e.pageX,top:e.pageY});$("body").append(m);m.find("[data-action]").on("click",ev=>{ev.preventDefault();this.action(ev.currentTarget.dataset.action);m.remove()});$(document).one("click",()=>m.remove())}
 async action(action,itemId=null,html=null){const s=session(),n=s.nodes.find(n=>n.id===s.selectedNodeId);if(action==="load-system")return this.loadSystem(s,html);if(action==="save-access")return this.saveAccess(s,html);if(action==="invite")return this.invite(s);if(action==="reset-system")return this.resetSystem(s);if(action==="end-hack")return this.endHack();if(action==="open-page"&&n){const p=await fromUuid(n.journalUuid);return p?.sheet?.render(true)}if(action==="software"&&n)return this.useSoftware(s,n,itemId);if(action==="open-direct"&&n)return this.openDirect(s,n);if(action?.startsWith("hack-")&&n)return this.hack(s,n,action);if(!game.user.isGM)return ui.notifications.warn("Seul le MJ peut modifier directement le réseau.");if(!n)return;if(action==="set-entry"){const old=s.nodes.find(x=>x.id===s.entryNodeId);if(old?.state==="entry")old.state="scanned";s.entryNodeId=n.id;n.state="entry";revealConnected(s,n)}if(action==="set-open"){n.state="open";revealConnected(s,n)}if(action==="set-compromised")n.state="compromised";if(action==="reset-node")this.resetNode(s,n);if(action==="reveal-all")revealAll(s);if(action==="hide-node")n.visible=false;if(action==="lock"){n.locked=!n.locked;if(!n.locked&&n.security==="ENCRYPTED")n.security="SECURE"}if(action==="response-plus")n.response+=1;if(action==="response-minus")n.response-=1;if(action==="response")await this.rollResponse(s,n);await saveCanon(s);this.render(false)}
 async loadSystem(s,html){
    if(!game.user.isGM)return;
    const journal=game.journal.get(html.find('[name="journalId"]').val());
    if(!journal)return ui.notifications.warn("Choose a system file marked HACK_SYSTEM.");
    const allowed=html.find('[name="allowed-user"]:checked').map((i,e)=>e.value).get();
    const {config,nodes}=parseJournal(journal);
    if(!nodes.length)return ui.notifications.warn("No nodes found in this system.");
    const entry=nodes.find(n=>slug(n.name)===slug(config.entryNode))?.id??nodes[0].id;
    for(const n of nodes){n.state=n.id===entry?"entry":"scanned";n.visible=false}const entryNode=nodes.find(n=>n.id===entry);revealConnected({nodes},entryNode);
    const next={id:"active",journalId:journal.id,journalName:journal.name,actorId:"",actorName:"—",deckId:"",deckName:"—",responseTableName:config.responseTableName??DEFAULT_TABLE,allowedUserIds:allowed,connectedUserIds:[],selectedNodeId:entry,entryNodeId:entry,nodes,initialNodes:foundry.utils.deepClone(nodes),conditions:[],systemAlert:null,ignoreNextReaction:false,revision:Number(s.revision??0),updatedAt:Date.now()};
    await saveCanon(next);
    this.render(false)
  }
  async saveAccess(s,html){
    if(!game.user.isGM)return;
    s.allowedUserIds=html.find('[name="allowed-user"]:checked').map((i,e)=>e.value).get();
    await saveCanon(s);
    this.render(false)
  }
  async invite(s){
    if(!game.user.isGM)return;
    if(!s.allowedUserIds?.length)return ui.notifications.warn("Select at least one player.");
    game.socket.emit(SOCKET,{type:"open",session:s,userIds:s.allowedUserIds});
    const encoded=encodeSession(s);
    await ChatMessage.create({whisper:s.allowedUserIds,content:`<h2>Hacking console invitation</h2><p>The GM invites you to open the console <strong>${esc(s.journalName)}</strong>.</p><p><button type="button" class="mhc-open-session" data-session="${encoded}">Open console</button></p>`});
    ui.notifications.info("Invitation sent to selected players.");
  }
 async openDirect(s,n){if(!canOpenDirect(s,n))return ui.notifications.warn("This unsecured node is not accessible.");if(!game.user.isGM)return sendClientIntent("open-direct",{nodeId:n.id});n.state="open";revealConnected(s,n);await ChatMessage.create({content:`<h2>Node opened</h2><p><strong>${esc(n.name)}</strong> is unsecured and opens without a hack.</p>`});await saveCanon(s,true);await broadcastStateFallback(s)}
 async hack(s,n,action){
    const actor=actorOf(s);
    if(!actor)return ui.notifications.warn("No hacker character is associated with this console.");
    if(!canHack(s,n))return ui.notifications.warn("This node is not accessible from the current entry point.");
    const requested=action==="hack-adv"?"[+]":"";
    const mode=hackModeForNode(n,requested);
    const r=await rollHacking(actor,n,mode);

    if(!game.user.isGM){
      return sendClientIntent("hack-result",{nodeId:n.id,success:r.success,total:r.total,target:r.target,crit:r.crit,actorId:actor.id});
    }

    if(r.success){
      n.state="open";
      revealConnected(s,n);
      await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),content:`<h2>Hack successful</h2><p>${esc(actor.name)} opens <strong>${esc(n.name)}</strong>.</p>`});
      await saveCanon(s,true);
      await broadcastStateFallback(s);
    }else{
      n.state="compromised";
      await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),content:`<h2>Hack failed</h2><p>${esc(actor.name)} compromises <strong>${esc(n.name)}</strong>. GM reaction.</p>`});
      await this.rollResponse(s,n);
      await saveCanon(s,true);
      await broadcastStateFallback(s);
    }
  }
 async sync(s){
    remember(s);
    if(game.user.isGM) await saveCanon(s,true);
    this.render(false)
  }
 async useSoftware(s,n,itemId,actorId=null){
    if(!game.user.isGM)return sendClientIntent("software",{nodeId:n.id,itemId,actorId:clientActorId()});const actor=actorId?game.actors.get(actorId):actorOf(s),item=itemId?actor?.items.get(itemId):null;
    if(!item||!isSoftware(item))return ui.notifications.warn("Software not found.");
    if(!isSoftwareInstalledForConsole(item,s.deckId))return ui.notifications.warn("This software is not installed in an active deck.");
    const data=hhData(item),key=softwareKey(item);
    let consumed=data.singleUse!==false;
    const before=n.security;

    if(key==="mapNetwork"){
      revealAll(s);
      await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),content:`<p><strong>${esc(item.name)}</strong> reveals all nodes in the system.</p>`})
    }else if(key==="reduceResponse"){
      const roll=await new Roll("1d5").evaluate();
      n.response=Math.max(0,Number(n.response??0)-roll.total);
      await roll.toMessage({speaker:ChatMessage.getSpeaker({actor}),flavor:`${item.name} reduces the Reaction of ${n.name}`})
    }else if(key==="icebreaker"){
      // Manuel : Icebreaker convertit un Node Sécurisé en Node Non sécurisé.
      if(n.security==="SECURE"){
        n.security="UNSECURED";
        await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),content:`<p><strong>${esc(item.name)}</strong> convertit <strong>${esc(n.name)}</strong> : SECURE → UNSECURED.</p>`})
      }else{
        consumed=false;
        await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),content:`<p><strong>${esc(item.name)}</strong> can only be used on a SECURE node. Current security: <strong>${esc(n.security)}</strong>.</p>`})
      }
    }else if(key==="icebreakerPlus"){
      // Icebreaker IB++ est une version supérieure : il fonctionne sur HARDENED / FIREWALL,
      // also works on SECURE and converts the node to UNSECURED.
      if(n.security==="HARDENED"||n.security==="SECURE"||isFirewall(n)){
        const oldSecurity=n.security;
        n.security="UNSECURED";
        await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),content:`<p><strong>${esc(item.name)}</strong> convertit <strong>${esc(n.name)}</strong> : ${esc(oldSecurity)} → UNSECURED.</p>`})
      }else{
        consumed=false;
        await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),content:`<p><strong>${esc(item.name)}</strong> can only be used on a SECURE, HARDENED, or FIREWALL node. Current security: <strong>${esc(n.security)}</strong>.</p>`})
      }
    }else if(key==="bruteForcePassword"&&n.security==="ENCRYPTED"){
      // Decryption: a decrypted ENCRYPTED node becomes SECURE and can then be attacked
      // or lowered by Icebreaker.
      n.security="SECURE";
      n.locked=false;
      await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),content:`<p><strong>${esc(item.name)}</strong> decrypts <strong>${esc(n.name)}</strong> : ENCRYPTED → SECURE. The node is no longer locked and can now be hacked or targeted by Icebreaker.</p>`})
    }else if(key==="bruteForcePassword"&&n.security!=="ENCRYPTED"){
      consumed=false;
      await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),content:`<p><strong>${esc(item.name)}</strong> can only be used on an ENCRYPTED node. Current security: <strong>${esc(n.security)}</strong>.</p>`})
    }else if(key==="ignoreResponse"){
      s.ignoreNextResponse=true;
      await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),content:`<p><strong>${esc(item.name)}</strong> will cancel the next Intrusion Reaction.</p>`})
    }else{
      consumed=false;
      await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),content:`<p><strong>${esc(item.name)}</strong> has no defined automation for ${esc(n.name)}.</p>`})
    }

    // If security drops to UNSECURED and the node is accessible, it can be opened without hacking.
    // It is not opened automatically: the player keeps the “Open without hack” action.
    if(consumed){
      try{await item.delete()}catch(e){console.warn(`${MODULE_ID} | Unable to delete software.`,e)}
      await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),content:`<p><em>${esc(item.name)} is consumed.</em>${before!==n.security?` Security: ${esc(before)} → ${esc(n.security)}.`:""}</p>`})
    }
    await saveCanon(s,true);await broadcastStateFallback(s)
  }
 resetNode(s,n){const i=s.initialNodes.find(x=>x.id===n.id);if(!i)return;Object.assign(n,foundry.utils.deepClone(i));if(n.id===s.entryNodeId)n.state="entry"}
 async resetSystem(s){if(!game.user.isGM)return;const entry=s.entryNodeId;s.nodes=foundry.utils.deepClone(s.initialNodes);for(const n of s.nodes){n.state=n.id===entry?"entry":"scanned";n.visible=false}revealConnected(s,s.nodes.find(n=>n.id===entry));s.selectedNodeId=entry;s.conditions=[];s.systemAlert=null;s.ignoreNextResponse=false;await saveCanon(s);this.render(false)}
 async endHack(){if(!game.user.isGM)return;game.socket.emit(SOCKET,{type:"close"});localSession=null;await game.settings.set(MODULE_ID,SETTING,blank());this.close()}
 async rollResponse(s,n){
    if(s.ignoreNextResponse){
      s.ignoreNextResponse=false;
      addCondition(s,"Reaction canceled",`The intrusion reaction from ${n.name} is canceled by Maze.`,"reaction");
      await gmOnlyReactionMessage(`<h2>Reaction canceled</h2><p>The intrusion reaction from ${esc(n.name)} is canceled by Maze.</p>`);
      return;
    }

    const actor=actorOf(s);
    const base=Number(n.response??0);

    // Null / 00 Reaction: no roll, automatic warning, whole system +1.
    if(base<=0){
      increaseAllReactions(s,1,"WARNING: Reaction +1");
      await gmOnlyReactionMessage(`<h2>Intrusion Reaction — Warning</h2>
          <p><strong>Node:</strong> ${esc(n.network)} / ${esc(n.name)}</p>
          <p>Reaction level 00: no roll.</p>
          <p><strong>Warning message.</strong> Network’s RESPONSE +1.</p>
          <p>All system nodes gain +1 Reaction.</p>`);
      return;
    }

    const roll=await new Roll(`1d10 + ${base}`).evaluate();
    const total=roll.total;
    const text=reactionText(total);
    let gmExtra="";
    let playerMessage="";
    let closePlayer=false;
    let conditionTitle=`Reaction ${total}`;

    if(total<=1){
      closePlayer=true;
      conditionTitle="Remote disconnection";
      gmExtra="Device is remotely powered off.";
      playerMessage="REMOTE DISCONNECTION";
    }else if(total===2){
      closePlayer=true;
      conditionTitle="Account locked";
      const lock=await new Roll("1d10").evaluate();
      gmExtra=`USER ACCOUNT locked out for ${lock.total} hours.`;
      playerMessage="USER ACCOUNT LOCKED";
    }else if(total===3){
      const minutes=await new Roll("1d10").evaluate();
      conditionTitle="Security incoming";
      gmExtra=`Security member dispatched to investigate. Arrives in ${minutes.total} minutes.`;
    }else if(total===4){
      const netsec=await new Roll("1d6").evaluate();
      const nt=netsecText(netsec.total);
      conditionTitle="Reaction NetSec";
      gmExtra=`NetSec Response ${netsec.total}: ${nt}`;
      setSystemAlert(s,"NETSEC REACTION IN PROGRESS","warning",0);
      const applied=await addStress(actor,1);
      gmExtra+=`<br><em>+1 Stress ${applied?"applied automatically":"to apply manually: stress path not found"}.</em>`;
    }else if(total===5){
      closePlayer=true;
      conditionTitle="Network lockdown";
      const hours=await new Roll("1d10").evaluate();
      gmExtra=`The network and all linked networks are locked down for ${hours.total} hours.`;
      playerMessage="NETWORK LOCKDOWN";
    }else if(total===6){
      conditionTitle="Security increased";
      const order=["UNSECURED","SECURE","HARDENED","ENCRYPTED"];
      for(const node of s.nodes??[]){
        const i=order.indexOf(node.security);
        if(i>=0&&i<order.length-1)node.security=order[i+1];
        if(node.security==="ENCRYPTED")node.locked=true;
      }
      gmExtra="This network increases security level by 1.";
    }else if(total===7){
      conditionTitle="Reaction +1";
      increaseAllReactions(s,1,"Network Reaction +1");
      gmExtra="All linked networks increase RESPONSE +1. Linked networks are not managed yet, so current system only: all nodes +1.";
    }else if(total===8){
      closePlayer=true;
      conditionTitle="Blackout";
      gmExtra="Facility blackout. All non-essential electronics powered down.";
      playerMessage="FACILITY BLACKOUT";
    }else{
      closePlayer=true;
      conditionTitle="Tactical team";
      const rounds=await new Roll("1d5").evaluate();
      gmExtra=`TACTICAL RESPONSE TEAM deployed on Seek & Destroy mission. Arrives, heavily armed in ${rounds.total} minutes.`;
      playerMessage="TACTICAL TEAM INCOMING";
    }

    addCondition(s,conditionTitle,gmExtra||text,"reaction");
    await gmOnlyReactionMessage(`<h2>Intrusion Reaction</h2>
        <p><strong>Node:</strong> ${esc(n.network)} / ${esc(n.name)}</p>
        <p><strong>Roll:</strong> ${total} <small>(1d10 + ${base})</small></p>
        <p><strong>Result:</strong> ${esc(text)}</p>
        <div class="mhc-box">${gmExtra}</div>`);

    if(closePlayer){
      const msg=playerMessage||"CONNECTION TERMINATED";
      setSystemAlert(s,msg,"error",5);
      if(game.user.isGM){
        game.socket.emit(SOCKET,{type:"disconnect-alert",userIds:consoleUserIds(s),message:msg});
      }else{
        showConsoleOverlay(msg,"error",5);
      }
    }
  }
}



const BUILDER_NODE_LIBRARY = [
  { key:"terminal", label:"Terminal", function:"TERMINAL", security:"UNSECURED", reaction:0, description:"User-facing terminal." },
  { key:"databank", label:"Databank", function:"DATABANK", security:"SECURE", reaction:1, description:"Local data storage." },
  { key:"router", label:"Router", function:"ROUTER", security:"SECURE", reaction:1, description:"Routing node. Once opened, it can provide alternate paths through the system." },
  { key:"firewall", label:"Firewall", function:"FIREWALL", security:"HARDENED", reaction:2, description:"Security barrier. Hardened by default." },
  { key:"infrastructure", label:"Infrastructure", function:"INFRASTRUCTURE", security:"SECURE", reaction:2, description:"Controls local infrastructure." },
  { key:"uplink", label:"Uplink", function:"UPLINK", security:"HARDENED", reaction:3, description:"External or corporate uplink." },
  { key:"mobile", label:"Mobile terminal", function:"MOBILE TERMINAL", security:"SECURE", reaction:1, description:"Portable or personal device." },
  { key:"encrypted", label:"Encrypted databank", function:"DATABANK", security:"ENCRYPTED", reaction:3, description:"Encrypted data storage. Requires decryption or a PEK." }
];

function makeBuilderNode(template, gx=0, gy=0, network="network.local", index=1){
  const base = template?.label ?? "Node";
  const name = `${String(base).toUpperCase().replace(/[^A-Z0-9]+/g,".")}.${index}`;
  const security = normSec(template?.security ?? "UNSECURED");
  return {
    id: slug(`${network}.${name}`),
    name,
    network,
    function: template?.function ?? "TERMINAL",
    security,
    response: Number(template?.reaction ?? 0),
    baseResponse: Number(template?.reaction ?? 0),
    state: "scanned",
    locked: security === "ENCRYPTED",
    grid: `${gx},${gy}`,
    connectionsRaw: [],
    connections: [],
    journalUuid: "",
    builderPageId: "",
    builderOriginalName: name,
    gmDescription: template?.description ?? "",
    playerData: "",
    success: "",
    failure: ""
  };
}

function builderConfigHtml(entryNode="ENTRY", reactionTable=DEFAULT_TABLE){
  return `<p><strong>Type:</strong> HACK_SYSTEM</p>
<p><strong>Hack Console:</strong> yes</p>
<p><strong>Reaction table:</strong> ${esc(reactionTable)}</p>
<p><strong>Entry node:</strong> ${esc(entryNode)}</p>`;
}

function builderEntryNodeHtml(network="network.local", node="ENTRY"){
  return `<p><strong>Network:</strong> ${esc(network)}</p>
<p><strong>Node:</strong> ${esc(node)}</p>
<p><strong>Function:</strong> TERMINAL</p>
<p><strong>Security:</strong> UNSECURED</p>
<p><strong>Reaction:</strong> +0</p>
<p><strong>Grid:</strong> 0,0</p>
<p><strong>Connections:</strong></p>
<h2>GM Description</h2>
<p>Initial entry point.</p>
<h2>Data</h2>
<p></p>
<h2>Success</h2>
<p></p>
<h2>Failure</h2>
<p></p>`;
}

function builderPageHtml(n){
  return [
    `<p><strong>Network:</strong> ${esc(n.network)}</p>`,
    `<p><strong>Node:</strong> ${esc(n.name)}</p>`,
    `<p><strong>Function:</strong> ${esc(n.function)}</p>`,
    `<p><strong>Security:</strong> ${esc(n.security)}</p>`,
    `<p><strong>Reaction:</strong> ${Number(n.response ?? 0) >= 0 ? "+" : ""}${Number(n.response ?? 0)}</p>`,
    `<p><strong>Grid:</strong> ${esc(n.grid || "0,0")}</p>`,
    `<p><strong>Connections:</strong> ${esc((n.connectionsRaw ?? []).join(", "))}</p>`,
    `<h2>GM Description</h2>`,
    `<p>${esc(n.gmDescription || "")}</p>`,
    `<h2>Data</h2>`,
    `<p>${esc(n.playerData || "")}</p>`,
    `<h2>Success</h2>`,
    `<p>${esc(n.success || "")}</p>`,
    `<h2>Failure</h2>`,
    `<p>${esc(n.failure || "")}</p>`
  ].join("\n");
}

class NetworkBuilderApp extends Application {
  static get defaultOptions(){return foundry.utils.mergeObject(super.defaultOptions,{id:"mosh-network-builder",classes:["mosh-hack-console-app","mosh-network-builder"],title:"Hacking Network Builder",width:1180,height:790,resizable:true})}
  constructor(options={}){super(options);this.builder={journalId:"",nodes:[],selectedNodeId:"",entryNodeId:"",mode:"select",pendingLink:null}}
  get title(){const j=game.journal.get(this.builder.journalId);return `Hacking Network Builder${j?` — ${j.name}`:""}`}
  loadJournal(journalId){const journal=game.journal.get(journalId);if(!journal)return;const parsed=parseJournal(journal);const entry=parsed.nodes.find(n=>n.name===parsed.config.entryNode||n.id===slug(parsed.config.entryNode))??parsed.nodes[0];this.builder={journalId,config:parsed.config,entryNodeId:entry?.id??"",nodes:parsed.nodes.map(n=>({...n,builderPageId:n.journalUuid?.split(".").pop(),builderOriginalName:n.name})),selectedNodeId:parsed.nodes[0]?.id??"",mode:this.builder.mode??"select",pendingLink:null}}
  renderContent(){
    const journals=game.journal.contents.filter(j=>j.pages?.size&&isHackSystemJournal(j)).sort((a,b)=>a.name.localeCompare(b.name));
    if(!this.builder.journalId&&journals[0])this.loadJournal(journals[0].id);
    const s={nodes:this.builder.nodes,entryNodeId:this.builder.entryNodeId,selectedNodeId:this.builder.selectedNodeId};
    const lay=layout(s),selected=this.builder.nodes.find(n=>n.id===this.builder.selectedNodeId)??this.builder.nodes[0];
    const lines=this.builderLines(lay);
    const nodes=this.builder.nodes.map(n=>{const p=lay.positions.get(n.id)??{x:0,y:0,w:104,h:64};return`<button type="button" class="mhc-graph-node ${securityClass(n)} ${n.id===this.builder.selectedNodeId?"selected":""}" style="left:${p.x}px;top:${p.y}px;width:${p.w}px;height:${p.h}px" data-node-id="${esc(n.id)}" title="${esc(n.name)} — ${esc(n.security)}"><span class="mhc-node-rings"></span><span class="mhc-node-core"></span><span class="mhc-port top" data-port="top" data-node-id="${esc(n.id)}"></span><span class="mhc-port right" data-port="right" data-node-id="${esc(n.id)}"></span><span class="mhc-port bottom" data-port="bottom" data-node-id="${esc(n.id)}"></span><span class="mhc-port left" data-port="left" data-node-id="${esc(n.id)}"></span><strong>${esc(n.name)}</strong></button>`}).join("");
    return`<div class="mhc-root mhc-builder-root"><header class="mhc-top"><div><h1>Hacking Network Builder</h1><p>Edit the source Journal. Active hacking sessions are unchanged until the GM reloads the system.</p></div><div class="mhc-config"><label>System Journal <select name="builder-journal">${journals.map(j=>`<option value="${j.id}" ${j.id===this.builder.journalId?"selected":""}>${esc(j.name)}</option>`).join("")}</select></label><button type="button" data-builder-action="new-system">New system</button><button type="button" data-builder-action="load">Load</button><button type="button" data-builder-action="save">Save to Journal</button><hr><div class="mhc-builder-modes"><button type="button" data-builder-mode="select" class="${this.builder.mode==="select"?"active":""}">Select / Move</button><button type="button" data-builder-mode="link" class="${this.builder.mode==="link"?"active":""}">Create link</button><button type="button" data-builder-mode="delete-link" class="${this.builder.mode==="delete-link"?"active":""}">Delete link</button></div>${this.builder.pendingLink?`<p class="mhc-link-pending">Link from ${esc(this.nodeName(this.builder.pendingLink.nodeId))} / ${esc(this.builder.pendingLink.port)} — click another port.</p>`:""}</div></header><main class="mhc-main"><section class="mhc-map"><div class="mhc-stage mhc-builder-stage" style="width:${lay.width}px;height:${lay.height}px" data-min-x="${lay.minX??0}" data-min-y="${lay.minY??0}" data-cell="${lay.cell??132}" data-pad="${lay.pad??44}"><svg class="mhc-svg" width="${lay.width}" height="${lay.height}" viewBox="0 0 ${lay.width} ${lay.height}" preserveAspectRatio="none">${lines}</svg>${nodes}</div></section><aside class="mhc-info">${this.nodeLibrary()}${selected?this.editor(selected):`<h2>No node</h2><p>Load a HACK_SYSTEM Journal first, or drag a node type onto the grid.</p>`}</aside></main></div>`
  }

  nodeName(id){return this.builder.nodes.find(n=>n.id===id)?.name??id}
  portPoint(pos,port){const cx=pos.x+pos.w/2,cy=pos.y+pos.h/2;if(port==="top")return{x:cx,y:pos.y};if(port==="right")return{x:pos.x+pos.w,y:cy};if(port==="bottom")return{x:cx,y:pos.y+pos.h};if(port==="left")return{x:pos.x,y:cy};return{x:cx,y:cy}}
  autoPort(a,b){const dx=b.gx-a.gx,dy=b.gy-a.gy;if(Math.abs(dx)>=Math.abs(dy))return dx>=0?["right","left"]:["left","right"];return dy>=0?["bottom","top"]:["top","bottom"]}
  builderLines(lay){
    const out=[],seen=new Set();
    for(const n of this.builder.nodes){
      const a=lay.positions.get(n.id);if(!a)continue;
      for(const c of n.connections??[]){
        const target=this.builder.nodes.find(x=>x.id===c),b=lay.positions.get(c);
        if(!target||!b)continue;
        const key=[n.id,c].sort().join("|");if(seen.has(key))continue;seen.add(key);
        const [ap,bp]=this.autoPort(a,b),p1=this.portPoint(a,ap),p2=this.portPoint(b,bp);
        const mid=Math.abs(p1.x-p2.x)>Math.abs(p1.y-p2.y)?`${(p1.x+p2.x)/2},${p1.y} ${(p1.x+p2.x)/2},${p2.y}`:`${p1.x},${(p1.y+p2.y)/2} ${p2.x},${(p1.y+p2.y)/2}`;
        out.push(`<polyline class="mhc-link mhc-builder-link ${this.builder.mode==="delete-link"?"deletable":""}" data-from="${esc(n.id)}" data-to="${esc(c)}" points="${p1.x},${p1.y} ${mid} ${p2.x},${p2.y}"></polyline>`);
      }
    }
    return out.join("");
  }
  setBuilderMode(mode){
    this.builder.mode=mode;
    this.builder.pendingLink=null;
    this.render(false);
  }
  connectNodes(fromId,toId){
    if(!fromId||!toId||fromId===toId)return false;
    const a=this.builder.nodes.find(n=>n.id===fromId),b=this.builder.nodes.find(n=>n.id===toId);
    if(!a||!b)return false;
    a.connectionsRaw??=[];b.connectionsRaw??=[];
    if(!a.connectionsRaw.includes(b.name))a.connectionsRaw.push(b.name);
    if(!b.connectionsRaw.includes(a.name))b.connectionsRaw.push(a.name);
    this.rebuildConnections();
    return true;
  }
  deleteLink(fromId,toId){
    const a=this.builder.nodes.find(n=>n.id===fromId),b=this.builder.nodes.find(n=>n.id===toId);
    if(!a||!b)return false;
    a.connectionsRaw=(a.connectionsRaw??[]).filter(x=>slug(x)!==slug(b.name)&&slug(`${a.network}.${x}`)!==b.id);
    b.connectionsRaw=(b.connectionsRaw??[]).filter(x=>slug(x)!==slug(a.name)&&slug(`${b.network}.${x}`)!==a.id);
    this.rebuildConnections();
    return true;
  }
  rebuildConnections(){
    const byName=new Map(this.builder.nodes.map(n=>[slug(n.name),n.id]));
    const byNet=new Map(this.builder.nodes.map(n=>[slug(`${n.network}.${n.name}`),n.id]));
    for(const n of this.builder.nodes)n.connections=(n.connectionsRaw??[]).map(x=>byNet.get(slug(`${n.network}.${x}`))??byName.get(slug(x))??slug(`${n.network}.${x}`)).slice(0,4);
  }
  nodeLibrary(){return`<section class="mhc-node-library"><h3>Node library</h3><p>Drag a node type onto the grid.</p><div class="mhc-node-library-list">${BUILDER_NODE_LIBRARY.map(t=>`<button type="button" class="mhc-library-node sec-${String(t.security).toLowerCase()}" draggable="true" data-template-key="${esc(t.key)}"><span>${esc(t.label)}</span><small>${esc(t.security)} · ${esc(t.function)}</small></button>`).join("")}</div></section><hr>`}
  editor(n){return`<h2>${esc(n.name)}</h2><div class="mhc-builder-form" data-node-id="${esc(n.id)}"><label>Node <input name="name" value="${esc(n.name)}"></label><label>Network <input name="network" value="${esc(n.network)}"></label><label>Function <input name="function" value="${esc(n.function)}"></label><label>Security <select name="security">${["UNSECURED","SECURE","HARDENED","ENCRYPTED"].map(v=>`<option value="${v}" ${n.security===v?"selected":""}>${v}</option>`).join("")}</select></label><label>Reaction <input name="response" type="number" value="${Number(n.response??0)}"></label><label>Grid <input name="grid" value="${esc(n.grid||"0,0")}"></label><label>Connections <input name="connectionsRaw" value="${esc((n.connectionsRaw??[]).join(", "))}"></label><label>GM Description <textarea name="gmDescription">${esc(n.gmDescription||"")}</textarea></label><label>Data <textarea name="playerData">${esc(n.playerData||"")}</textarea></label><label>Success <textarea name="success">${esc(n.success||"")}</textarea></label><label>Failure <textarea name="failure">${esc(n.failure||"")}</textarea></label></div>`}
  async _renderInner(){return $(this.renderContent())}
  activateListeners(html){super.activateListeners(html);html.find("[data-builder-mode]").on("click",ev=>{this.setBuilderMode(ev.currentTarget.dataset.builderMode)});html.find("[data-builder-action='new-system']").on("click",async()=>{await this.createNewSystem()});html.find("[data-builder-action='load']").on("click",()=>{this.loadJournal(html.find("[name='builder-journal']").val());this.render(false)});html.find("[data-builder-action='save']").on("click",async()=>{this.captureEditor(html);await this.saveToJournal()});html.find(".mhc-port").on("click",ev=>{ev.preventDefault();ev.stopPropagation();if(this.builder.mode!=="link")return;const port={nodeId:ev.currentTarget.dataset.nodeId,port:ev.currentTarget.dataset.port};if(!this.builder.pendingLink){this.builder.pendingLink=port;this.builder.selectedNodeId=port.nodeId;return this.render(false)}this.connectNodes(this.builder.pendingLink.nodeId,port.nodeId);this.builder.pendingLink=null;this.builder.selectedNodeId=port.nodeId;this.render(false)});html.find(".mhc-builder-link").on("click",ev=>{if(this.builder.mode!=="delete-link")return;ev.preventDefault();this.deleteLink(ev.currentTarget.dataset.from,ev.currentTarget.dataset.to);this.render(false)});html.find(".mhc-graph-node").on("click",ev=>{if(this.builder.mode==="delete-link")return;this.captureEditor(html);this.builder.selectedNodeId=ev.currentTarget.dataset.nodeId;this.render(false)});html.find(".mhc-builder-form input,.mhc-builder-form select,.mhc-builder-form textarea").on("change",()=>{this.captureEditor(html);this.render(false)});this.bindLibrary(html);this.bindDrag(html)}
  captureEditor(html){const form=html.find(".mhc-builder-form").first();if(!form.length)return;const node=this.builder.nodes.find(n=>n.id===form.data("node-id"));if(!node)return;node.name=form.find("[name='name']").val()?.trim()||node.name;node.network=form.find("[name='network']").val()?.trim()||node.network;node.function=form.find("[name='function']").val()?.trim()||node.function;node.security=normSec(form.find("[name='security']").val());node.response=parseResponse(form.find("[name='response']").val());node.baseResponse=node.response;node.grid=form.find("[name='grid']").val()?.trim()||"0,0";node.connectionsRaw=String(form.find("[name='connectionsRaw']").val()??"").split(/[,;]+/).map(x=>x.trim()).filter(Boolean).slice(0,4);node.gmDescription=form.find("[name='gmDescription']").val()??"";node.playerData=form.find("[name='playerData']").val()??"";node.success=form.find("[name='success']").val()??"";node.failure=form.find("[name='failure']").val()??"";node.id=slug(`${node.network}.${node.name}`);if(node.security==="ENCRYPTED")node.locked=true;this.rebuildConnections();this.builder.selectedNodeId=node.id}
  addNodeFromTemplate(templateKey,gx=0,gy=0){
    const template=BUILDER_NODE_LIBRARY.find(t=>t.key===templateKey)??BUILDER_NODE_LIBRARY[0];
    const selected=this.builder.nodes.find(n=>n.id===this.builder.selectedNodeId)??this.builder.nodes[0];
    const network=selected?.network??"network.local";
    let index=this.builder.nodes.length+1;
    let node=makeBuilderNode(template,gx,gy,network,index);
    while(this.builder.nodes.some(n=>n.id===node.id)){
      index++;
      node=makeBuilderNode(template,gx,gy,network,index);
    }
    this.builder.nodes.push(node);
    this.builder.selectedNodeId=node.id;
    return node;
  }
  bindLibrary(html){
    html.find(".mhc-library-node").on("dragstart",ev=>{
      ev.originalEvent.dataTransfer.setData("text/plain",ev.currentTarget.dataset.templateKey);
      ev.originalEvent.dataTransfer.effectAllowed="copy";
    });
    const stage=html.find(".mhc-builder-stage").first();
    if(!stage.length)return;
    stage.on("dragover",ev=>{ev.preventDefault();ev.originalEvent.dataTransfer.dropEffect="copy"});
    stage.on("drop",ev=>{
      ev.preventDefault();
      this.captureEditor(html);
      const key=ev.originalEvent.dataTransfer.getData("text/plain");
      if(!key)return;
      const sr=stage[0].getBoundingClientRect(),cell=Number(stage.data("cell")??132),pad=Number(stage.data("pad")??44),minX=Number(stage.data("min-x")??0),minY=Number(stage.data("min-y")??0);
      const gx=Math.round((ev.originalEvent.clientX-sr.left-pad)/cell+minX);
      const gy=Math.round((ev.originalEvent.clientY-sr.top-pad)/cell+minY);
      this.addNodeFromTemplate(key,gx,gy);
      this.render(false);
    });
  }
  bindDrag(html){const stage=html.find(".mhc-builder-stage").first();if(!stage.length)return;let drag=null;html.find(".mhc-graph-node").on("pointerdown",ev=>{if(this.builder.mode!=="select")return;ev.preventDefault();this.captureEditor(html);const el=ev.currentTarget,rect=el.getBoundingClientRect();drag={id:el.dataset.nodeId,el,dx:ev.clientX-rect.left,dy:ev.clientY-rect.top};el.setPointerCapture?.(ev.pointerId)});html.on("pointermove",ev=>{if(!drag)return;const sr=stage[0].getBoundingClientRect();drag.el.style.left=`${Math.max(0,ev.clientX-sr.left-drag.dx)}px`;drag.el.style.top=`${Math.max(0,ev.clientY-sr.top-drag.dy)}px`});html.on("pointerup",ev=>{if(!drag)return;const sr=stage[0].getBoundingClientRect(),cell=Number(stage.data("cell")??132),pad=Number(stage.data("pad")??44),minX=Number(stage.data("min-x")??0),minY=Number(stage.data("min-y")??0);const gx=Math.round((ev.clientX-sr.left-drag.dx-pad)/cell+minX),gy=Math.round((ev.clientY-sr.top-drag.dy-pad)/cell+minY);const node=this.builder.nodes.find(n=>n.id===drag.id);if(node){node.grid=`${gx},${gy}`;this.builder.selectedNodeId=node.id}drag=null;this.render(false)})}

  async createNewSystem(){
    if(!game.user.isGM)return ui.notifications.warn("Only the GM can create hack systems.");
    const content=`<form class="hh-dialog">
      <div class="form-group"><label>System name</label><input name="systemName" value="Hacking Console — New System"></div>
      <div class="form-group"><label>Network</label><input name="network" value="network.local"></div>
      <div class="form-group"><label>Entry node</label><input name="entryNode" value="ENTRY"></div>
    </form>`;
    const data=await new Promise(resolve=>{
      new Dialog({
        title:"Create new hack system",
        content,
        buttons:{
          create:{label:"Create",icon:'<i class="fas fa-plus"></i>',callback:html=>resolve({
            systemName:html.find("[name='systemName']").val()?.trim()||"Hacking Console — New System",
            network:html.find("[name='network']").val()?.trim()||"network.local",
            entryNode:html.find("[name='entryNode']").val()?.trim()||"ENTRY"
          })},
          cancel:{label:"Cancel",callback:()=>resolve(null)}
        },
        default:"create",
        close:()=>resolve(null)
      }).render(true);
    });
    if(!data)return;
    const pages=[
      {name:"_CONFIG",type:"text",sort:100,title:{show:true,level:1},text:{format:1,content:builderConfigHtml(data.entryNode)}},
      {name:`${data.network} / ${data.entryNode}`,type:"text",sort:200,title:{show:true,level:1},text:{format:1,content:builderEntryNodeHtml(data.network,data.entryNode)}}
    ];
    const journal=await JournalEntry.create({name:data.systemName,flags:{[MODULE_ID]:{hackSystem:true}},pages},{renderSheet:false});
    this.loadJournal(journal.id);
    ui.notifications.info(`Created hack system ${journal.name}.`);
    this.render(false);
  }

  async saveToJournal(){const journal=game.journal.get(this.builder.journalId);if(!journal)return ui.notifications.warn("No Journal selected.");if(!game.user.isGM)return ui.notifications.warn("Only the GM can save hack systems.");const updates=[],creates=[];let sort=300+journal.pages.size*100;for(const n of this.builder.nodes){const page=journal.pages.get(n.builderPageId);const data={name:`${n.network} / ${n.name}`,type:"text",sort:sort+=100,title:{show:true,level:1},text:{format:1,content:builderPageHtml(n)}};if(page)updates.push({_id:page.id,name:data.name,text:data.text});else creates.push(data)}if(updates.length)await journal.updateEmbeddedDocuments("JournalEntryPage",updates);if(creates.length){const made=await journal.createEmbeddedDocuments("JournalEntryPage",creates);for(const p of made){const node=this.builder.nodes.find(n=>`${n.network} / ${n.name}`===p.name);if(node){node.builderPageId=p.id;node.journalUuid=p.uuid}}}ui.notifications.info(`Saved ${updates.length} page(s), created ${creates.length} page(s) in ${journal.name}.`)}
}
export function launchBuilder(){new NetworkBuilderApp().render(true)}

async function rollHacking(actor,node,mode=""){const skill=actor.items.find(i=>i.type==="skill"&&/hacking|piratage/i.test(i.name)),skillName=skill?.name??"Hacking",bonus=Number(skill?.system?.bonus??0),stat=actor.system?.stats?.intellect??{},target=Number(stat.value??0)+Number(stat.mod??0)+bonus,formula=typeof actor.parseRollString==="function"?actor.parseRollString(`1d100 ${mode}`.trim(),"low"):(mode==="[+]"?"{1d100,1d100}kl":mode==="[-]"?"{1d100,1d100}kh":"1d100"),roll=await new Roll(formula).evaluate(),total=roll.total,success=total<target&&total<90,crit=total%11===0;await roll.toMessage({speaker:ChatMessage.getSpeaker({actor}),flavor:`<h2>Hacking roll</h2><p><strong>Node:</strong> ${esc(node.name)} — ${esc(node.security)}</p><p><strong>Check:</strong> Intellect + ${esc(skillName)} = ${target}</p><p><strong>Result:</strong> ${success?"Success":"Failure"}${crit?" critical":""}</p>`});return{success,total,target,crit}}
function rerenderOpen(){for(const app of Object.values(ui.windows))if(app instanceof HackConsoleApp)app.render(false)}
export function launchConsole(){remember(canonical());new HackConsoleApp().render(true)}
Hooks.once("init",()=>{game.settings.register(MODULE_ID,SETTING,{name:"Canonical hacking console state",scope:"world",config:false,type:Object,default:blank()})})
Hooks.once("ready",()=>{remember(canonical());game.socket.on(SOCKET,async p=>{try{if(!p)return;if(p.type==="console-presence"&&game.user.isGM)await markConsolePresence(p.userId,p.open!==false);if(p.type==="state"&&p.session)applyState(p.session);if(p.type==="force-state"&&p.session&&(!p.userIds?.length||p.userIds.includes(game.user.id)))forceApplyState(p.session);if(p.type==="open"&&p.session&&p.userIds?.includes(game.user.id)){remember(p.session);new HackConsoleApp().render(true)}if(p.type==="player-state"&&game.user.isGM&&p.session){console.warn(`${MODULE_ID} | player-state ignored in authoritative server mode`,p.userName)}if(p.type==="client-intent"&&game.user.isGM){await handleClientIntent(p,"socket")}if(p.type==="gm-reaction-resolve"&&game.user.isGM&&p.session){await resolveGMReactionPayload(p,"socket")}if(p.type==="gm-reaction-log"&&game.user.isGM&&p.content){await ChatMessage.create({speaker:p.speakerData??ChatMessage.getSpeaker(),whisper:gmIds(),content:p.content});ui.notifications.info(`Reaction received from ${p.userName??"player"}.`)}if(p.type==="disconnect-alert"&&(!p.userIds?.length||p.userIds.includes(game.user.id)))showConsoleOverlay(p.message||"CONNECTION TERMINATED","error",5);if(p.type==="close"){localSession=null;for(const app of Object.values(ui.windows))if(app instanceof HackConsoleApp)app.close()}}catch(err){console.error(`${MODULE_ID} | Socket error`,err)}});Hooks.on("updateSetting",s=>{if(s.key!==`${MODULE_ID}.${SETTING}`)return;remember(s.value??blank());rerenderOpen()});Hooks.on("createChatMessage",async msg=>{try{const html=String(msg.content??"");if(!html.includes("mhc-sync-payload")&&!html.includes("mhc-reaction-payload")&&!html.includes("mhc-state-payload")&&!html.includes("mhc-intent-payload"))return;const div=document.createElement("div");div.innerHTML=html;const statePayload=div.querySelector(".mhc-state-payload");if(statePayload){const raw=statePayload.dataset.session;if(raw)forceApplyState(JSON.parse(decodeURIComponent(raw)));return}if(!game.user.isGM)return;const intentPayload=div.querySelector(".mhc-intent-payload");if(intentPayload){const raw=intentPayload.dataset.intent;if(raw)await handleClientIntent(JSON.parse(decodeURIComponent(raw)),"fallback chat");return}const syncPayload=div.querySelector(".mhc-sync-payload");if(syncPayload){const raw=syncPayload.dataset.session;if(!raw)return;const incoming=JSON.parse(decodeURIComponent(raw));const current=canonical();incoming.revision=Math.max(Number(incoming.revision??0),Number(current.revision??0));await saveCanon(incoming,true);ui.notifications.info(`Hack console synchronized via chat fallback.`);return}const reactionPayload=div.querySelector(".mhc-reaction-payload");if(reactionPayload){const raw=reactionPayload.dataset.session;if(!raw)return;await resolveGMReactionPayload({type:"gm-reaction-resolve",requestId:reactionPayload.dataset.request,session:JSON.parse(decodeURIComponent(raw)),nodeId:reactionPayload.dataset.node,userName:reactionPayload.dataset.user},"fallback chat")}}catch(err){console.error(`${MODULE_ID} | Chat fallback sync/reaction/state error`,err)}});$(document).off(`click.${MODULE_ID}-open-session`).on(`click.${MODULE_ID}-open-session`,".mhc-open-session",ev=>{ev.preventDefault();const s=decodeSession(ev.currentTarget.dataset.session);remember(s);new HackConsoleApp().render(true)})})
async function createDefaults(){if(!game.user.isGM)return;if(!game.journal.getName(DEFAULT_JOURNAL)){const mk=(name,html,sort)=>({name,type:"text",sort,title:{show:true,level:1},text:{format:1,content:html.trim()}}),page=(net,node,sec,fn,resp,con,grid,body,sort)=>mk(`${net} / ${node}`,`<p><strong>Network:</strong> ${net}</p><p><strong>Node:</strong> ${node}</p><p><strong>Function:</strong> ${fn}</p><p><strong>Security:</strong> ${sec}</p><p><strong>Reaction:</strong> ${resp}</p><p><strong>Grid:</strong> ${grid}</p><p><strong>Connections:</strong> ${con}</p><h2>GM Description</h2><p>${body}</p><h2>Data</h2><ul><li>Usable data.</li></ul>`,sort);await JournalEntry.create({name:DEFAULT_JOURNAL,flags:{[MODULE_ID]:{hackSystem:true}},pages:[mk("_CONFIG",`<p><strong>Type:</strong> HACK_SYSTEM</p><p><strong>Hack Console:</strong> yes</p><p><strong>Reaction table:</strong> ${DEFAULT_TABLE}</p><p><strong>Entry node:</strong> INTRANET</p>`,100),page("crew.net","INTRANET","UNSECURED","DATABANK","0","INTRANET.HUB, GUEST.PC","0,0","Entry point.",200),page("crew.net","GUEST.PC","UNSECURED","TERMINAL","0","INTRANET","0,1","Guest terminal.",300),page("crew.net","INTRANET.HUB","SECURE","ROUTER","+1","INTRANET, CAPTAIN.PC","1,0","Router.",400),page("crew.net","CAPTAIN.PC","ENCRYPTED","TERMINAL","+3","INTRANET.HUB, CAPTAIN.PDA","2,0","Captain’s computer.",500),page("crew.net","CAPTAIN.PDA","SECURE","MOBILE TERMINAL","+1","CAPTAIN.PC","3,0","PDA.",600)]},{renderSheet:false})}if(!game.journal.getName("Hacking Console — Cargo Bay Check")){
    const mk=(name,html,sort)=>({name,type:"text",sort,title:{show:true,level:1},text:{format:1,content:html.trim()}});
    const page=(net,node,sec,fn,resp,con,grid,body,sort)=>mk(`${net} / ${node}`,`<p><strong>Network:</strong> ${net}</p><p><strong>Node:</strong> ${node}</p><p><strong>Function:</strong> ${fn}</p><p><strong>Security:</strong> ${sec}</p><p><strong>Reaction:</strong> ${resp}</p><p><strong>Grid:</strong> ${grid}</p><p><strong>Connections:</strong> ${con}</p><h2>GM Description</h2><p>${body}</p><h2>Data</h2><ul><li>Cargo Bay test data.</li></ul>`,sort);
    await JournalEntry.create({name:"Hacking Console — Cargo Bay Check",flags:{[MODULE_ID]:{hackSystem:true}},pages:[
      mk("_CONFIG",`<p><strong>Type:</strong> HACK_SYSTEM</p><p><strong>Hack Console:</strong> yes</p><p><strong>Reaction table:</strong> ${DEFAULT_TABLE}</p><p><strong>Entry node:</strong> CARGO.TERM</p>`,100),
      page("cargo.net","CARGO.TERM","UNSECURED","TERMINAL","0","CARGO.HUB","0,0","Exposed cargo-handling terminal.",200),
      page("cargo.net","CARGO.HUB","SECURE","ROUTER","+1","CARGO.TERM, DOOR.CTRL, MANIFEST.DB","1,0","Local cargo bay router.",300),
      page("cargo.net","DOOR.CTRL","SECURE","INFRASTRUCTURE","+2","CARGO.HUB","1,1","Cargo door and airlock control.",400),
      page("cargo.net","MANIFEST.DB","ENCRYPTED","DATABANK","+3","CARGO.HUB, CORP.UPLINK","2,0","Manifest database.",500),
      page("cargo.net","CORP.UPLINK","HARDENED","UPLINK","+4","MANIFEST.DB","3,0","Remote corporate uplink.",600)
    ]},{renderSheet:false})
  }if(!game.tables.getName(DEFAULT_TABLE)){await RollTable.create({name:DEFAULT_TABLE,formula:"1d10",replacement:true,displayRoll:true,results:["Warning message. Reaction +1.","Device remotely powered off.","User account locked for 1d10 hours.","Security member dispatched.","Decoy directories and security investigation.","Network locked down for 1d10 hours.","Network security increased by 1.","Linked networks Reaction +1.","Facility blackout. Non-essential systems powered down.","Tactical team deployed in 1d5 rounds."].map((t,i)=>({type:"text",weight:1,range:[i+1,i+1],name:t,img:"icons/svg/d20-black.svg",description:`<p>${t}</p>`,drawn:false,flags:{}}))})}}
Hooks.once("ready",createDefaults);
globalThis.MoshHackingConsole={launchConsole,launchBuilder};
