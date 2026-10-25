(() => {
"use strict";
const KEY="school33_floor_editor_v1", VW=920,VH=705;
const clone=x=>JSON.parse(JSON.stringify(x));
const starter=()=>({version:1,floors:{"1":clone(window.SCHOOL_SEED||[]),"2":clone(window.SCHOOL_OTHER_FLOORS?.["2"]||[]),"3":clone(window.SCHOOL_OTHER_FLOORS?.["3"]||[]),"4":clone(window.SCHOOL_OTHER_FLOORS?.["4"]||[])},hidden:{}});
let data=starter();let customLayers={};
function normalizeMap(){data.hidden??={};data.lockedGroups??={};data.customLayers??={};for(let i=1;i<=4;i++)data.floors[String(i)]??=[];}let canEdit=false;let serverLoaded=false;
for(let f=1;f<=4;f++)data.floors[String(f)]??=[];
let magnifierActive=false;
let selectedIds=new Set();let floor="1",selected=null,edit=false,tool="select",scale=1,panX=0,panY=0,drag=null,space=false,history=[],future=[];
const $=s=>document.querySelector(s),viewport=$("#viewport"),canvas=$("#canvas"),ctx=canvas.getContext("2d");
const list=()=>data.floors[floor],find=()=>list().find(o=>o.id===selected);
const unique=()=>String(Date.now())+Math.random().toString(36).slice(2,8);
let saveTimer;
const token=()=>sessionStorage.getItem("school33-admin-token")||"";
let lastToken=token();
async function verifyAdmin(){
 const current=token();const previous=canEdit;
 try{const r=await fetch("/api/admin/status",{headers:{"x-admin-token":current},cache:"no-store"});const j=await r.json();canEdit=!!j.admin;}catch{canEdit=false;}
 if(previous&&!canEdit){clearTimeout(saveTimer);scale=1;panX=panY=0;edit=false;drag=null;selected=null;selectedIds.clear();tool="select";$("#editToggle").classList.remove("active");$("#editToggle").textContent="✎ Режим редактирования";$("#status").textContent="Режим просмотра";}
 $("#editToggle").hidden=!canEdit;$("#addLayer").hidden=!canEdit;
 document.querySelectorAll(".tool").forEach(b=>b.disabled=!edit);
 document.body.classList.toggle("admin-visible",canEdit);
 $("#clearFloor").hidden=!canEdit;$("#load").disabled=!canEdit;
 if(!previous&&canEdit){expandedGroups.clear();edit=true;tool="select";$("#editToggle").classList.add("active");$("#editToggle").textContent="✓ Завершить редактирование";$("#status").textContent="Редактирование включено";document.querySelectorAll(".tool").forEach(b=>b.disabled=false);}
 if(previous!==canEdit){refresh();requestAnimationFrame(resize);}lastToken=current;return canEdit;
}
function enrichRoomClasses(){
 const mapping=window.SCHOOL_ROOM_CLASSES||{};
 for(const objects of Object.values(data.floors||{}))for(const o of objects){
  if(o.type==='room'&&mapping[String(o.text||'').trim()]&&!o.roomClass)o.roomClass=mapping[String(o.text).trim()];
 }
}
const SCHOOL_ROOM_SUBJECTS={
 "401":"Кабинет информатики","402":"Кабинет географии","403":"Кабинет английского языка","404":"Кабинет английского языка","405":"Кабинет английского языка","407":"Кабинет физики","408":"Кабинет физики","409":"Кабинет истории","410":"Кабинет казахского языка и литературы","411":"Кабинет казахского языка","412":"Кабинет казахского языка и литературы","413":"Кабинет казахского языка и литературы","414":"Кабинет казахского языка и литературы","415":"Кабинет казахского языка и литературы","416":"Кабинет казахского языка и литературы","417":"Кабинет английского языка","418":"Кабинет математики","419":"Кабинет математики","420":"Кабинет математики","421":"Кабинет математики","422":"Кабинет математики","423":"Кабинет математики","424":"Кабинет математики","425":"Кабинет информатики","426":"Кабинет информатики",
 "301":"Кабинет информатики","302":"Кабинет истории","303":"Кабинет английского языка","304":"Кабинет английского языка","305":"Кабинет английского языка","306":"Кабинет английского языка","307":"Кабинет биологии","308":"Кабинет биологии","309":"Кабинет истории","317":"Кабинет английского языка","318":"Кабинет казахского языка","319":"Кабинет истории","320":"Кабинет географии","321":"Кабинет биологии","322":"Кабинет географии","323":"Кабинет биологии","325":"Кабинет информатики","326":"Кабинет информатики",
 "201":"Кабинет русского языка и литературы","202":"Кабинет русского языка и литературы","203":"Кабинет русского языка и литературы","204":"Кабинет русского языка и литературы","205":"Кабинет русского языка и литературы","206":"Кабинет русского языка и литературы","207":"Кабинет химии","208":"Кабинет химии","209":"Кабинет истории","226":"Начальные классы","229":"Кабинет русского языка и литературы","108":"Кабинет бухгалтера","110":"Кабинет администрации"};
const primaryRoom=n=>(n>=115&&n<=120)||(n>=210&&n<=216)||(n>=218&&n<=224)||(n>=310&&n<=316)||n===226;
function roomTitle(n){return primaryRoom(Number(n))?"Начальные классы":SCHOOL_ROOM_SUBJECTS[n]||"";}
function prepareIcons(){
 data.iconsInitializedV83??=false;
 if(data.iconsInitializedV83)return;
 const a=data.floors["1"]||(data.floors["1"]=[]);
 if(!Object.values(data.floors).some(items=>items.some(o=>o.id==="taza-kazakhstan-icon"))){
  a.push({id:"taza-kazakhstan-icon",type:"icon",layer:"icons",x:550,y:260,w:64,h:64,src:"/map-editor/taza-kazakhstan.png",iconTitle:"Таза Қазақстан",iconDescription:"Экологическая инициатива «Таза Қазақстан»",visible:false});
 }
 data.iconsInitializedV83=true;
}
function prepareSchoolRooms(){
 // Initialize exactly once per stored map. Do not resurrect rooms that an administrator deletes.
 if(data.schoolRoomsInitializedV8)return 0;
 let count=0;
 for(const [num,title] of Object.entries(SCHOOL_ROOM_SUBJECTS)){
  const f=num[0],objects=data.floors[f];if(!objects)continue;
  const existing=objects.find(o=>o.type==="room"&&String(o.text||"").trim()===num);
  if(existing){existing.roomSubject=roomTitle(num);existing.roomSubjectAuto=false;continue;}
  const ix=count++;objects.push({id:"school-room-v8-"+num,type:"room",text:num,x:100+(ix%8)*55,y:90+Math.floor(ix/8)*44,w:46,h:32,fill:"#ffffff",stroke:"#94a3b8",fontSize:14,fontFamily:"system-ui",bold:true,color:"#1e293b",layer:"rooms",visible:false,roomSubject:roomTitle(num),roomSubjectAuto:false,roomClass:(window.SCHOOL_ROOM_CLASSES||{})[num]||""});
 }
 // Rooms with a class but no specific subject also receive an editable hidden template.
 for(const [num,cls] of Object.entries(window.SCHOOL_ROOM_CLASSES||{})){
  const f=num[0],objects=data.floors[f];if(!objects||objects.some(o=>o.type==="room"&&String(o.text||"").trim()===num))continue;
  const ix=count++;objects.push({id:"school-room-v8-"+num,type:"room",text:num,x:100+(ix%8)*55,y:90+Math.floor(ix/8)*44,w:46,h:32,fill:"#ffffff",stroke:"#94a3b8",layer:"rooms",visible:false,roomClass:cls,roomSubject:roomTitle(num),roomSubjectAuto:false});
 }
 data.schoolRoomsInitializedV8=true;return count;
}
async function syncSchoolTeachers(){
 try{
  const r=await fetch('/api/state',{cache:'no-store'});if(!r.ok)return;
  const state=await r.json();if(!Array.isArray(state.classes)||!Array.isArray(state.teachers))return;
  const teachers=new Map(state.teachers.map(t=>[String(t.id),t]));
  const byName=new Map(state.classes.map(c=>[String(c.name||'').replace(/\s+/g,'').replace(/[\"«»]/g,'').toLocaleUpperCase('ru'),c]));
  for(const objects of Object.values(data.floors||{}))for(const o of objects){
   if(o.type!=='room'||!o.roomClass)continue;
   const c=byName.get(String(o.roomClass).replace(/\s+/g,'').replace(/[\"«»]/g,'').toLocaleUpperCase('ru'));
   const t=c&&teachers.get(String(c.teacherId||c.teacher_id||""));
   if(t){if(!o.roomTeacher||o.roomTeacherAuto){o.roomTeacher=t.name||'';o.roomTeacherAuto=true;}
    if(!roomTitle(String(o.text||""))&&(!o.roomSubject||o.roomSubjectAuto)){o.roomSubject=t.subject||'';o.roomSubjectAuto=true;}}
  }
  refresh();
 }catch(e){console.warn('Class/teacher details not loaded',e);}
}
function applyFirstFloorBlueprint(){
 const existing=data.floors["1"]||(data.floors["1"]=[]);
 const blueprint=window.SCHOOL_SEED||[];
 const ids=new Set(existing.map(o=>o.id));
 const hasBlueprint=existing.some(o=>String(o.id).startsWith("pdf8-"));
 if(hasBlueprint)return 0;
 // Retain manually drawn objects; discard only previously generated prototype geometry.
 const manual=existing.filter(o=>!(/^w\d+$|^r\d+$|^floor7-1-|^floor7-label-1-/.test(String(o.id))));
 data.floors["1"]=[...manual,...blueprint.filter(o=>!manual.some(m=>m.id===o.id)).map(clone)];
 return blueprint.length;
}
function removeLegacyOuterFrames(){
 let changed=0;
 for(let f=2;f<=4;f++){
  const key=String(f), arr=data.floors[key]||[];
  const before=arr.length;
  // The old PDF page border was imported as four walls at the page perimeter.
  data.floors[key]=arr.filter(o=>{
   if(o.type!=="wall"||!String(o.id).startsWith(`cdr8-${f}-`))return true;
   const x=o.x,y=o.y,x2=o.x2,y2=o.y2;
   return !((Math.abs(x-x2)<.2&&(Math.abs(x)<.2||Math.abs(x-1190.52)<.5)&&Math.abs(y-y2)>500)||
    (Math.abs(y-y2)<.2&&(Math.abs(y)<.2||Math.abs(y-841.86)<.5)&&Math.abs(x-x2)>750));
  });
  changed+=before-data.floors[key].length;
 }
 return changed;
}
function restoreMissingPlanObjects(){
 const pdfAdded=applyFirstFloorBlueprint();
 const removedFrames=removeLegacyOuterFrames();
 const template=starter().floors;
 const additions=window.SCHOOL_PLAN_ADDITIONS||[];
 let added=pdfAdded+removedFrames;
 for(let f=2;f<=4;f++){
  const key=String(f), existing=data.floors[key]||(data.floors[key]=[]);
  const blueprint=window.SCHOOL_FLOOR_BLUEPRINTS?.[key]||[];
  if(!blueprint.length)continue;
  const existingIds=new Set(existing.map(o=>o.id));
  const hasBlueprint=existing.some(o=>String(o.id).startsWith(`cdr8-${f}-`));
  if(hasBlueprint){for(const o of blueprint)if(!existingIds.has(o.id)){existing.push(clone(o));added++;}continue;}
  // Replace only generated prototype geometry; never remove manually created objects.
  const manual=existing.filter(o=>!(/^w\d+$|^r\d+$|^floor7-|^floor7-label-/.test(String(o.id))));
  data.floors[key]=[...manual,...blueprint.filter(o=>!manual.some(m=>m.id===o.id)).map(clone)];
  added+=blueprint.length;
 }

 removeLegacyOuterFrames();
 return added;
}
async function loadRemote(){
 try{
  const r=await fetch(new URL("/api/school-map",location.origin),{cache:"no-store"});
  if(!r.ok)throw Error("HTTP "+r.status);
  const j=await r.json();
  if(j.map?.floors){data=j.map;normalizeMap();customLayers=data.customLayers||{};}
  for(let f=1;f<=4;f++)data.floors[String(f)]??=[];
  const added=restoreMissingPlanObjects();
  prepareIcons();const newRooms=prepareSchoolRooms();enrichRoomClasses();serverLoaded=true;refresh();syncSchoolTeachers();
  if(added||newRooms){
   $("#status").textContent=`Добавлены детали схемы: ${added}; скрытые кабинеты: ${newRooms}. Для сохранения войдите как администратор и нажмите «Сохранить».`;
  }else{$("#status").textContent="Карта загружена из D1";}
 }catch(e){
  const added=restoreMissingPlanObjects();prepareIcons();prepareSchoolRooms();enrichRoomClasses();refresh();
  $("#status").textContent="Показана встроенная схема"+(added?` (добавлено ${added} деталей)`:"")+". D1 недоступна: "+e.message;
 }
}
// Serialize map writes so an older request cannot overwrite a newer edit.
let saveQueue=Promise.resolve();
let changeVersion=0;
const DRAFT_KEY="school33-map-unsaved-draft-v83";
function keepDraft(payload){
 try{localStorage.setItem(DRAFT_KEY,payload);return true;}catch{return false;}
}
let lastSaveError="";
async function externalizeMapImages(){
 // Embedded data URLs rapidly exceed the D1 map payload limit. Keep each image
 // in a separate D1 record, and only its stable URL in the map JSON.
 const items=Object.values(data.floors).flat().filter(o=>
  (o.type==="image"||o.type==="icon")&&typeof o.src==="string"&&o.src.startsWith("data:image/"));
 for(const o of items){
  const response=await fetch("/api/school-map/image",{
   method:"POST",headers:{"content-type":"application/json","x-admin-token":token()},
   body:JSON.stringify({src:o.src})
  });
  const raw=await response.text();let result={};try{result=JSON.parse(raw);}catch{}
  if(!response.ok)throw Error(result.error||`Загрузка изображения: HTTP ${response.status}`);
  // Keep the decoded image alive under its new persistent URL before repaint.
  const oldSrc=o.src;
  if(imageCache.has(oldSrc))imageCache.set(result.url,imageCache.get(oldSrc));
  else {const cached=new Image();cached.src=oldSrc;cached.onload=render;imageCache.set(result.url,cached);}
  o.src=result.url;
 }
}
async function writeMap(version){
 try{
  await externalizeMapImages();
  data.customLayers=customLayers;
  const payload=JSON.stringify(data);
  keepDraft(payload);
  const r=await fetch("/api/school-map",{method:"PUT",headers:{"content-type":"application/json","x-admin-token":token()},body:JSON.stringify({map:data})});
  const raw=await r.text();let j={};try{j=JSON.parse(raw);}catch{}
  if(!r.ok)throw Error(j.error||`HTTP ${r.status}: ${raw.slice(0,180)}`);
  lastSaveError="";
  if(version===changeVersion){$("#status").textContent="Сохранено в D1";try{localStorage.removeItem(DRAFT_KEY);}catch{}}
  return true;
 }catch(e){
  lastSaveError=e.message||String(e);
  const draftStored=keepDraft(JSON.stringify(data));
  $("#status").textContent="Ошибка сохранения карты: "+lastSaveError+(draftStored?" · Черновик сохранён в браузере.":" · Скачайте JSON перед закрытием страницы.");
  console.error("school-map save failed",e);
  return false;
 }
}
function queueSave(){
 const version=++changeVersion;
 $("#status").textContent="Сохранение…";
 saveQueue=saveQueue.catch(()=>false).then(()=>writeMap(version));
 return saveQueue;
}
const save=()=>{if(!canEdit||!serverLoaded)return;clearTimeout(saveTimer);saveTimer=setTimeout(queueSave,700);};
window.flushSchoolMap=async()=>{
 if(!serverLoaded){lastSaveError="Карта ещё не загружена с сервера";return false;}
 if(!canEdit){lastSaveError="Режим администратора не подтверждён";return false;}
 clearTimeout(saveTimer);
 return await queueSave();
};
window.getSchoolMapSaveError=()=>lastSaveError;
function checkpoint(){data.customLayers=customLayers;history.push(clone(data));if(history.length>40)history.shift();future=[];}
function undo(){if(!history.length)return;future.push(clone(data));data=history.pop();normalizeMap();customLayers=data.customLayers||{};selected=null;save();refresh();}
function redo(){if(!future.length)return;history.push(clone(data));data=future.pop();normalizeMap();customLayers=data.customLayers||{};selected=null;save();refresh();}
function mapExtents(){const base=list().filter(o=>o.type==="wall"&&o.layer==="walls"&&(String(o.id).startsWith("pdf8-")||String(o.id).startsWith("cdr8-")));const objects=base.length?base:list().filter(o=>o.visible!==false);if(!objects.length)return{x:0,y:0,w:VW,h:VH};let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;for(const o of objects){const b=bounds(o);minX=Math.min(minX,b.x);minY=Math.min(minY,b.y);maxX=Math.max(maxX,b.x+b.w);maxY=Math.max(maxY,b.y+b.h);}return{x:minX,y:minY,w:Math.max(200,maxX-minX),h:Math.max(200,maxY-minY)};}
function transform(){const b=mapExtents(),margin=30;const fit=Math.min((viewport.clientWidth-2*margin)/b.w,(viewport.clientHeight-2*margin)/b.h);const s=Math.max(.01,fit)*scale;return{s,x:(viewport.clientWidth-b.w*s)/2-b.x*s+(edit?panX:0),y:(viewport.clientHeight-b.h*s)/2-b.y*s+(edit?panY:0)};}
function snapWall(ax,ay,bx,by){const dx=bx-ax,dy=by-ay;if(Math.abs(dy)<=Math.max(8,Math.abs(dx)*.18))by=ay;else if(Math.abs(dx)<=Math.max(8,Math.abs(dy)*.18))bx=ax;return{x:bx,y:by};}
function toWorld(e){const r=viewport.getBoundingClientRect(),t=transform();return{x:(e.clientX-r.left-t.x)/t.s,y:(e.clientY-r.top-t.y)/t.s};}
function strokeLine(o){ctx.strokeStyle=darkMap()&&isDefaultColor(o.stroke,["#243449","#1b293b","#26364b","#253447"])?"#7388a2":o.stroke||"#243449";ctx.lineWidth=o.width??2.5;ctx.globalAlpha=o.opacity??1;ctx.lineCap="square";ctx.beginPath();ctx.moveTo(o.x,o.y);ctx.lineTo(o.x2,o.y2);ctx.stroke();ctx.globalAlpha=1;}
const imageCache=new Map();
function darkMap(){return document.documentElement.dataset.theme==="dark"||document.documentElement.classList.contains("dark")||document.body.classList.contains("dark")||getComputedStyle(document.body).backgroundColor==="rgb(15, 23, 42)"||window.matchMedia("(prefers-color-scheme: dark)").matches&&document.body.classList.contains("dark-mode");}
function isDefaultColor(value, defaults){return !value||defaults.includes(String(value).toLowerCase());}
function draw(o){
 if(o.type==="wall"){strokeLine(o);return;}
 if(o.type==="room"){const dm=darkMap();ctx.fillStyle=dm&&isDefaultColor(o.fill,["#ffffff","white"])?"#263a53":o.fill||"white";ctx.strokeStyle=dm&&isDefaultColor(o.stroke,["#94a3b8"])?"#64748b":o.stroke||"#94a3b8";ctx.lineWidth=o.width??1.4;ctx.globalAlpha=o.opacity??1;ctx.fillRect(o.x,o.y,o.w,o.h);ctx.strokeRect(o.x,o.y,o.w,o.h);ctx.fillStyle=dm&&isDefaultColor(o.color,["#1e293b","#15243b"])?"#f1f5fa":o.color||"#1e293b";ctx.globalAlpha=1;ctx.font=`${o.bold===false?"":"bold "}${o.fontSize||14}px ${o.fontFamily||"system-ui"}`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(o.text||"",o.x+o.w/2,o.y+o.h/2);return;}
 if(o.type==="text"){ctx.font=`${o.bold?"bold ":""}${o.fontSize||18}px system-ui`;ctx.textAlign="left";ctx.textBaseline="top";ctx.fillStyle=darkMap()&&isDefaultColor(o.color,["#15243b","#1e293b"])?"#f1f5fa":o.color||"#15243b";ctx.fillText(o.text||"",o.x,o.y);return;}
 if(o.type==="image"||o.type==="icon"){
 let im=imageCache.get(o.src);if(!im){im=new Image();im.onload=render;im.onerror=()=>{console.warn("Не удалось загрузить изображение карты:",o.src);};imageCache.set(o.src,im);im.src=o.src;}
 if(im.complete&&im.naturalWidth)ctx.drawImage(im,o.x,o.y,o.w,o.h);
 }
}
function bounds(o){if(o.type==="wall")return{x:Math.min(o.x,o.x2)-5,y:Math.min(o.y,o.y2)-5,w:Math.abs(o.x2-o.x)+10,h:Math.abs(o.y2-o.y)+10};if(o.type==="text"){ctx.font=`${o.fontSize||18}px system-ui`;return{x:o.x,y:o.y,w:Math.max(20,ctx.measureText(o.text||"").width),h:(o.fontSize||18)*1.3};}return{x:o.x,y:o.y,w:o.w,h:o.h};}
// Prototype 9: route network. Links are manually validated by the school administrator;
// the navigator never assumes that a straight line through a wall is passable.
let navOpen=false,navMode='',navSelected=null,navLinkStart=null,navRoute=[],navVisualPicks=[],navPickTarget='A',navDragMarker=null;
function navGraph(){data.navigation??={nodes:[],edges:[]};data.navigation.nodes??=[];data.navigation.edges??=[];return data.navigation;}
let navAutoPoints=[];const navNode=id=>navAutoPoints.find(n=>n.id===id)||navGraph().nodes.find(n=>n.id===id);
function navVisibleNodes(){return navGraph().nodes.filter(n=>n.floor===floor);}
function navCaption(n){return ({room:'Кабинет',stairs:'Лестница',lift:'Лифт',entrance:'Вход',waypoint:'Коридор'})[n.kind]+' '+(n.label||n.id.slice(-4))+' · '+n.floor+' этаж';}
function navOptions(){
 const nodes=navGraph().nodes.filter(n=>n.kind!=='waypoint').sort((a,b)=>Number(a.floor)-Number(b.floor)||navCaption(a).localeCompare(navCaption(b),'ru'));
 for(const id of ['#navFrom','#navTo']){const select=$(id),old=select.value;select.replaceChildren(new Option('Выберите точку…',''));for(const n of nodes)select.add(new Option(navCaption(n),n.id));select.value=nodes.some(n=>n.id===old)?old:'';}
}
function navInfo(message){$('#navInfo').textContent=message;}
function navChangeFloor(target){if(floor===String(target))return;const btn=[...document.querySelectorAll('#floors .floor')][Number(target)-1];btn?.click();}
// Automatic corridor routing: a grid cell is blocked where a wall passes through it.
function navAutomaticRoute(a,b){
 if(a.floor!==b.floor)return null;
 const walls=(data.floors[String(a.floor)]||[]).filter(o=>o.type==='wall'&&[o.x,o.y,o.x2,o.y2].every(Number.isFinite));
 if(!walls.length)return null;
 const step=12,margin=48;
 const xs=[a.x,b.x,...walls.flatMap(w=>[w.x,w.x2])],ys=[a.y,b.y,...walls.flatMap(w=>[w.y,w.y2])];
 const minX=Math.min(...xs)-margin,minY=Math.min(...ys)-margin,maxX=Math.max(...xs)+margin,maxY=Math.max(...ys)+margin;
 const cols=Math.ceil((maxX-minX)/step)+1,rows=Math.ceil((maxY-minY)/step)+1;
 if(cols*rows>120000)return null;
 const blocked=new Uint8Array(cols*rows),idx=(x,y)=>y*cols+x;
 // Mark wall segments with a small clearance; leave real gaps passable.
 for(const w of walls){const dx=w.x2-w.x,dy=w.y2-w.y,n=Math.ceil(Math.hypot(dx,dy)/3);for(let i=0;i<=n;i++){const t=n?i/n:0,x=Math.round((w.x+dx*t-minX)/step),y=Math.round((w.y+dy*t-minY)/step);if(x>=0&&x<cols&&y>=0&&y<rows)blocked[idx(x,y)]=1;}}
 const cell=p=>[Math.max(0,Math.min(cols-1,Math.round((p.x-minX)/step))),Math.max(0,Math.min(rows-1,Math.round((p.y-minY)/step)))];
 function nearestOpen(p){const [x,y]=cell(p);for(let r=0;r<12;r++)for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){if(Math.abs(dx)!==r&&Math.abs(dy)!==r)continue;const xx=x+dx,yy=y+dy;if(xx>=0&&yy>=0&&xx<cols&&yy<rows&&!blocked[idx(xx,yy)])return idx(xx,yy);}return -1;}
 const start=nearestOpen(a),end=nearestOpen(b);if(start<0||end<0)return null;
 const parent=new Int32Array(cols*rows);parent.fill(-1);parent[start]=start;const queue=new Int32Array(cols*rows);let head=0,tail=0;queue[tail++]=start;
 while(head<tail&&parent[end]<0){const u=queue[head++],x=u%cols,y=Math.floor(u/cols);for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=cols||yy>=rows)continue;const v=idx(xx,yy);if(blocked[v]||parent[v]>=0)continue;parent[v]=u;queue[tail++]=v;}}
 if(parent[end]<0)return null;
 const path=[];for(let u=end;u!==start;u=parent[u])path.push(u);path.push(start);path.reverse();
 const reduced=path.filter((_,i)=>i===0||i===path.length-1||i%3===0).map(u=>({x:minX+(u%cols)*step,y:minY+Math.floor(u/cols)*step,floor:a.floor}));
 return [a,...reduced,b];
}
function navFindRoute(){
 const aPick=navVisualPicks.find(p=>p.letter==='A'),bPick=navVisualPicks.find(p=>p.letter==='B');
 navRoute=[];navAutoPoints=[];
 if(!aPick||!bPick){navInfo('Установите на карте обе точки: А и Б.');render();return;}
 const auto=navAutomaticRoute(aPick,bPick);if(auto){navAutoPoints=auto.slice(1,-1).map((p,i)=>({...p,id:'auto-'+i}));navRoute=['__A',...navAutoPoints.map(p=>p.id),'__B'];navInfo('Синий маршрут построен по проходам карты. Проверьте его перед использованием.');render();return;}
 const graph=navGraph(),nodes=[...graph.nodes],adj=new Map(nodes.map(n=>[n.id,[]]));
 for(const e of graph.edges){const a=navNode(e.a),b=navNode(e.b);if(!a||!b)continue;
  if(a.floor!==b.floor&&!(['stairs','lift'].includes(a.kind)&&a.kind===b.kind&&a.connector&&a.connector===b.connector))continue;
  const weight=a.floor===b.floor?Math.hypot(a.x-b.x,a.y-b.y):250*Math.abs(Number(a.floor)-Number(b.floor));adj.get(a.id).push([b.id,weight]);adj.get(b.id).push([a.id,weight]);
 }
 // A marker may be placed anywhere; only snap it to an existing verified route node
 // when that node is nearby. Do not invent a path through walls.
 const attach=(pick,id)=>{
  const nearest=nodes.filter(n=>String(n.floor)===String(pick.floor)).map(n=>({n,d:Math.hypot(n.x-pick.x,n.y-pick.y)})).sort((a,b)=>a.d-b.d)[0];
  if(!nearest||nearest.d>85)return false;
  adj.set(id,[[nearest.n.id,nearest.d]]);adj.get(nearest.n.id).push([id,nearest.d]);return true;
 };
 if(!attach(aPick,'__A')||!attach(bPick,'__B')){navInfo('Маркеры установлены. Для построения безопасного маршрута настройте маршрутные точки в коридорах рядом с А и Б.');render();return;}
 const start='__A',end='__B';
 const distance=new Map([[start,0]]),prev=new Map(),seen=new Set();
 while(true){let current=null,best=Infinity;for(const [id,d] of distance)if(!seen.has(id)&&d<best){best=d;current=id;}if(!current||current===end)break;seen.add(current);for(const [id,w] of adj.get(current)||[]){if(best+w<(distance.get(id)??Infinity)){distance.set(id,best+w);prev.set(id,current);}}}
 if(!distance.has(end)){navInfo('Маршрут пока не настроен. Администратору нужно соединить точки по реальным коридорам и переходам между этажами.');render();return;}
 let cursor=end;navRoute=[cursor];while(cursor!==start){cursor=prev.get(cursor);if(!cursor){navRoute=[];break;}navRoute.unshift(cursor);}
 const first=aPick;navChangeFloor(first.floor);const floors=[...new Set(navRoute.map(id=>id==='__A'?aPick.floor:id==='__B'?bPick.floor:navNode(id)?.floor))];navInfo('Маршрут построен: '+navRoute.length+' точек, этажи: '+floors.join(' → ')+'. Переключайте этажи для просмотра участков пути.');render();
}
function navDraw(){
 if(!navOpen)return;const t=transform(),nodes=navGraph().nodes,edges=navGraph().edges;
 ctx.lineCap='round';ctx.lineJoin='round';
 if(canEdit){for(const e of edges){const a=navNode(e.a),b=navNode(e.b);if(!a||!b||a.floor!==floor||b.floor!==floor)continue;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.strokeStyle='#10b98199';ctx.lineWidth=2.5/t.s;ctx.setLineDash([7/t.s,5/t.s]);ctx.stroke();ctx.setLineDash([]);}}
 for(let i=1;i<navRoute.length;i++){const a=navRoute[i-1]==='__A'?navVisualPicks.find(p=>p.letter==='A'):navRoute[i-1]==='__B'?navVisualPicks.find(p=>p.letter==='B'):navNode(navRoute[i-1]),b=navRoute[i]==='__A'?navVisualPicks.find(p=>p.letter==='A'):navRoute[i]==='__B'?navVisualPicks.find(p=>p.letter==='B'):navNode(navRoute[i]);if(!a||!b||a.floor!==floor||b.floor!==floor)continue;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.strokeStyle='#1677ff';ctx.lineWidth=5/t.s;ctx.stroke();}
 for(const pick of navVisualPicks.filter(n=>String(n.floor)===String(floor))){ctx.beginPath();ctx.arc(pick.x,pick.y,11/t.s,0,Math.PI*2);ctx.fillStyle='#1677ff';ctx.fill();ctx.lineWidth=2/t.s;ctx.strokeStyle='#ffffff';ctx.stroke();ctx.fillStyle='#ffffff';ctx.font=`bold ${12/t.s}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(pick.letter,pick.x,pick.y);}
 if(canEdit)for(const n of nodes.filter(n=>n.floor===floor)){
  ctx.beginPath();ctx.arc(n.x,n.y,Math.max(4,7/t.s),0,Math.PI*2);ctx.fillStyle=n.id===navSelected?'#f97316':n.kind==='room'?'#2563eb':n.kind==='stairs'?'#f59e0b':n.kind==='lift'?'#8b5cf6':'#10b981';ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=1.5/t.s;ctx.stroke();
 }
 if(navRoute.length){for(const id of [navRoute[0],navRoute[navRoute.length-1]]){const n=id==='__A'?navVisualPicks.find(p=>p.letter==='A'):id==='__B'?navVisualPicks.find(p=>p.letter==='B'):navNode(id);if(!n||n.floor!==floor)continue;ctx.beginPath();ctx.arc(n.x,n.y,8/t.s,0,Math.PI*2);ctx.fillStyle='#1677ff';ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=2/t.s;ctx.stroke();}}
}
function navSetPickTarget(target){
 navPickTarget=target;
 for(const id of ['A','B'])document.getElementById('navPick'+id)?.classList.toggle('active',id===target);
 navInfo(target==='A'?'Нажмите на карте, чтобы установить точку А.':'Нажмите на карте, чтобы установить точку Б.');
}
function navPutMarker(p,target=navPickTarget){
 const existing=navVisualPicks.find(x=>x.letter===target);
 const point={x:p.x,y:p.y,floor:String(floor),letter:target};
 if(existing)Object.assign(existing,point);else navVisualPicks.push(point);
 const obj=hit(p);
 const number=obj?.type==='room'?String(obj.text||'').trim():'';
 const matching=navGraph().nodes.filter(n=>String(n.floor)===String(floor)&&n.kind==='room'&&n.label===number);
 const sel=$(target==='A'?'#navFrom':'#navTo');sel.value=matching[0]?.id||'';
 navRoute=[];
 if(target==='A')navSetPickTarget('B');
 else {navPickTarget='A';navInfo('Точки А и Б установлены. Нажмите «Построить маршрут». Следующее нажатие начнёт новый маршрут.');}
 render();
}
function navClick(p){
 if(navOpen&&!navMode){if(navVisualPicks.length===2&&navPickTarget==='A'){navVisualPicks=[];navRoute=[];}navPutMarker(p);return true;}
 if(!navOpen||!canEdit||!navMode)return false;
 const nearby=navVisibleNodes().map(n=>({n,d:Math.hypot(n.x-p.x,n.y-p.y)})).sort((a,b)=>a.d-b.d)[0];
 if(navMode==='add'){
  const kind=$('#navKind').value,label=$('#navLabel').value.trim(),connector=$('#navConnector').value.trim();
  if(kind==='room'&&!label){navInfo('Укажите номер кабинета перед размещением точки.');return true;}
  if(['stairs','lift'].includes(kind)&&!connector){navInfo('Укажите одинаковый код для переходов между этажами, например A.');return true;}
  checkpoint();const n={id:'nav-'+unique(),floor,kind,label,connector,x:p.x,y:p.y};navGraph().nodes.push(n);navSelected=n.id;navInfo('Добавлена точка: '+navCaption(n)+'. Соедините её с соседними проходимыми точками.');navOptions();save();render();return true;
 }
 if(!nearby||nearby.d>Math.max(15,17/transform().s)){navInfo('Нажмите непосредственно на маршрутную точку.');return true;}
 const n=nearby.n;navSelected=n.id;
 if(navMode==='delete'){checkpoint();const g=navGraph();g.nodes=g.nodes.filter(x=>x.id!==n.id);g.edges=g.edges.filter(e=>e.a!==n.id&&e.b!==n.id);navSelected=null;navRoute=[];navOptions();navInfo('Точка удалена.');save();render();return true;}
 if(navMode==='link'){
  if(!navLinkStart){navLinkStart=n.id;navInfo('Первая точка: '+navCaption(n)+'. Нажмите вторую точку.');render();return true;}
  if(navLinkStart===n.id){navLinkStart=null;navInfo('Выберите две разные точки.');return true;}
  const a=navNode(navLinkStart);if(a.floor!==n.floor){navInfo('Для связи между этажами используйте одинаковый код лестницы/лифта и кнопку «Связать этажи».');navLinkStart=null;return true;}
  checkpoint();const g=navGraph();if(!g.edges.some(e=>e.a===a.id&&e.b===n.id||e.a===n.id&&e.b===a.id))g.edges.push({a:a.id,b:n.id});navInfo('Соединено: '+navCaption(a)+' → '+navCaption(n));navLinkStart=null;save();render();return true;
 }
 return false;
}
function navSetup(){
 $('#navToggle').onclick=()=>{navOpen=!navOpen;$('#navPanel').hidden=!navOpen;$('#navToggle').classList.toggle('active',navOpen);navMode='';navOptions();navSetPickTarget('A');render();};
 $('#navClose').onclick=()=>{$('#navToggle').click();};
 $('#navSwap').onclick=()=>{for(const p of navVisualPicks)p.letter=p.letter==='A'?'B':'A';const a=$('#navFrom'),b=$('#navTo'),v=a.value;a.value=b.value;b.value=v;navRoute=[];render();navInfo('Точки А и Б поменяны местами.');};$('#navFind').onclick=navFindRoute;$('#navClear').onclick=()=>{navVisualPicks=[];$('#navFrom').value='';$('#navTo').value='';navRoute=[];navSetPickTarget('A');navInfo('Маршрут сброшен.');render();};
 $('#navPickA').onclick=()=>navSetPickTarget('A');$('#navPickB').onclick=()=>navSetPickTarget('B');
 const activate=mode=>{if(!canEdit){navInfo('Настройка маршрутов доступна только администратору.');return;}navMode=navMode===mode?'':mode;navLinkStart=null;for(const [id,m] of [['#navAdd','add'],['#navLink','link'],['#navDelete','delete']])$(id).classList.toggle('active',navMode===m);navInfo(navMode==='add'?'Нажмите на карте, чтобы разместить точку.':navMode==='link'?'Нажмите две точки на одном этаже, чтобы соединить их.':navMode==='delete'?'Нажмите точку, чтобы удалить её.':'Выберите действие.');};
 $('#navAdd').onclick=()=>activate('add');$('#navLink').onclick=()=>activate('link');$('#navDelete').onclick=()=>activate('delete');
 const connect=document.createElement('button');connect.textContent='Связать этажи';connect.type='button';connect.title='Соединяет точки лестниц или лифтов с одинаковым кодом на соседних этажах';connect.onclick=()=>{
  if(!canEdit)return;const g=navGraph();let count=0;checkpoint();for(let i=0;i<g.nodes.length;i++)for(let j=i+1;j<g.nodes.length;j++){
   const a=g.nodes[i],b=g.nodes[j];if(!['stairs','lift'].includes(a.kind)||a.kind!==b.kind||!a.connector||a.connector!==b.connector||Math.abs(Number(a.floor)-Number(b.floor))!==1)continue;
   if(!g.edges.some(e=>e.a===a.id&&e.b===b.id||e.a===b.id&&e.b===a.id)){g.edges.push({a:a.id,b:b.id});count++;}
  }save();navInfo('Добавлено межэтажных соединений: '+count+'. Убедитесь, что коды обозначают одну и ту же лестницу или лифт.');render();
 };$('#navDelete').after(connect);
}

function render(){
 const dpr=Math.min(devicePixelRatio||1,2);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,viewport.clientWidth,viewport.clientHeight);
 const t=transform();ctx.translate(t.x,t.y);ctx.scale(t.s,t.s);
 for(const o of [...list().filter(o=>o.layer==="stairs"),...list().filter(o=>o.layer!=="stairs"&&o.type!=="wall"),...list().filter(o=>o.layer!=="stairs"&&o.type==="wall")]){if(o.visible===false||(o.layer!=="medical"&&data.hidden[o.layer||o.type]))continue;draw(o);}
 navDraw();
 if(edit&&(selected||selectedIds.size)){for(const o of list().filter(o=>selectedIds.has(o.id))){const b=bounds(o);ctx.strokeStyle="#2563eb";ctx.lineWidth=1.8/t.s;ctx.setLineDash([6/t.s,4/t.s]);ctx.strokeRect(b.x-3,b.y-3,b.w+6,b.h+6);ctx.setLineDash([]);if(o.type==="wall"){ctx.fillStyle="#2563eb";for(const [hx,hy] of [[o.x,o.y],[o.x2,o.y2]]){ctx.fillRect(hx-6/t.s,hy-6/t.s,12/t.s,12/t.s);}}else{const hx=b.x+b.w,hy=b.y+b.h;ctx.fillStyle="#2563eb";ctx.fillRect(hx-5/t.s,hy-5/t.s,10/t.s,10/t.s);}}}
 $("#empty").hidden=list().length>0;$("#zoomReset").textContent=Math.round(scale*100)+"%";
}
function resize(){const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(viewport.clientWidth*dpr);canvas.height=Math.round(viewport.clientHeight*dpr);render();}
function locked(o){return !!(o.locked||data.lockedGroups?.[o.layer||o.type]);}
function hit(p,editable=false){for(const o of [...list().filter(o=>o.layer==="stairs"),...list().filter(o=>o.layer!=="stairs"&&o.type!=="wall"),...list().filter(o=>o.layer!=="stairs"&&o.type==="wall")].reverse()){if(o.visible===false||(o.layer!=="medical"&&data.hidden[o.layer||o.type])||(editable&&locked(o)))continue;if(o.type==="wall"){const dx=o.x2-o.x,dy=o.y2-o.y,len2=dx*dx+dy*dy;const u=len2?Math.max(0,Math.min(1,((p.x-o.x)*dx+(p.y-o.y)*dy)/len2)):0;if(Math.hypot(p.x-(o.x+u*dx),p.y-(o.y+u*dy))<=Math.max(7,(o.width||2)/2+4))return o;continue;}const b=bounds(o);if(p.x>=b.x-6&&p.x<=b.x+b.w+6&&p.y>=b.y-6&&p.y<=b.y+b.h+6)return o;}return null;}
function updateProps(){
 const box=$("#props");box.replaceChildren();const o=find();
 if(o&&locked(o)){const note=document.createElement("p");note.textContent="🔒 Объект заблокирован";box.append(note);return;}
 if(selectedIds.size>1){const title=document.createElement("p");title.textContent=`Выбрано объектов: ${selectedIds.size}`;box.append(title);
 const pick=document.createElement("select");for(const layer of Object.keys(customLayers).concat(["walls","rooms","lift","wardrobes","personnel","fountains","stairs","exits","icons"])){if(layer==="medical")continue;const opt=document.createElement("option");opt.value=layer;opt.textContent=customLayers[layer]?.name||layer;pick.append(opt);}box.append(pick);
 const group=document.createElement("button");group.textContent="Добавить выбранные в группу";group.disabled=!edit;group.onclick=()=>{checkpoint();for(const item of list())if(selectedIds.has(item.id))item.layer=pick.value;save();refresh();};box.append(group);
 const color=document.createElement("input");color.type="color";color.value="#2563eb";box.append(color);const recolor=document.createElement("button");recolor.textContent="Применить цвет к выбранным";recolor.disabled=!edit;recolor.onclick=()=>{checkpoint();for(const item of list())if(selectedIds.has(item.id)){if(item.type==="text")item.color=color.value;else item.stroke=color.value;}save();refresh();};box.append(recolor);return;}
 if(!o)return;
 const fields=[["opacity","Прозрачность (0–1)","number"],["bold","Жирный шрифт","checkbox"],["fontFamily","Шрифт","text"],["text","Номер кабинета / надпись","text"],["x","X","number"],["y","Y","number"],["x2","Конец X","number"],["y2","Конец Y","number"],["w","Ширина","number"],["h","Высота","number"],["fontSize","Размер шрифта","number"],["width","Толщина линии","number"],["stroke","Цвет линии","color"],["fill","Заливка","color"],["color","Цвет текста","color"],["layer","Слой","text"]];
 const name=document.createElement("p");name.textContent="Объект: "+({wall:"Стена",room:"Кабинет",text:"Надпись",image:"Изображение"}[o.type]||o.type);box.append(name);
 for(const [key,title,type] of fields){if(!(key in o)&&!(o.type==="wall"&&["opacity"].includes(key))&&!(o.type==="room"&&["opacity","bold","fontFamily","fontSize","color","width"].includes(key)))continue;const label=document.createElement("label");label.className="prop";label.textContent=title;const inp=document.createElement("input");inp.type=type;inp.value=o[key]??(key==="fontSize"?14:key==="opacity"?1:key==="fontFamily"?"system-ui":key==="width"?1.4:key==="color"?"#1e293b":"");if(type==="checkbox")inp.checked=o[key]!==false;inp.disabled=!edit;inp.addEventListener("change",()=>{checkpoint();o[key]=type==="checkbox"?inp.checked:type==="number"?Number(inp.value):inp.value;save();refresh(false);});label.append(inp);box.append(label);}
 if(o.layer==='lift'){
 tip.innerHTML='<strong style="color:#0284c7">Лифт · Информация по этажам</strong>'+[
 ['4','Математика; Физика; Қазақ тілі; Информатика'],
 ['3','Информатика; Биология; География; Ағылшын тілі; Бастауыш сыныптар'],
 ['2','Дене шынықтыру залы; Мәжіліс залы; Химия; Орыс тілі; Тарих; Бастауыш сыныптар'],
 ['1','Асхана; Кіші дене шынықтыру залы; Кітапхана; Хореография залы; Шеберханалар; Робототехника; Музыка; Скульптура']
 ].map(([n,txt])=>'<div style="padding:5px 0;color:#0284c7"><b>'+n+' этаж</b> — '+txt+'</div>').join('');
 tip.style.maxWidth='370px';const r=viewport.getBoundingClientRect();tip.style.left=Math.max(5,Math.min(e.clientX-r.left+15,viewport.clientWidth-380))+'px';tip.style.top=Math.max(5,Math.min(e.clientY-r.top+12,viewport.clientHeight-270))+'px';tip.hidden=false;return;
 }
 if(o.type==="icon"){
  for(const [key,title,multi] of [["iconTitle","Название значка",false],["iconDescription","Информация при наведении",true]]){
   const label=document.createElement("label");label.className="prop";label.textContent=title;
   const inp=document.createElement(multi?"textarea":"input");if(!multi)inp.type="text";inp.value=o[key]||"";inp.disabled=!edit;
   inp.addEventListener("change",()=>{checkpoint();o[key]=inp.value.trim();save();refresh(false);});label.append(inp);box.append(label);
  }
 }
 if(o.type==="room"){
  for(const [key,title] of [["roomClass","Класс"],["roomTeacher","Преподаватель"],["roomSubject","Предмет"]]){
   const label=document.createElement("label");label.className="prop";label.textContent=title;
   const inp=document.createElement("input");inp.type="text";inp.value=o[key]||"";inp.disabled=!edit;
   inp.addEventListener("change",()=>{checkpoint();o[key]=inp.value.trim();if(key==="roomTeacher"||key==="roomSubject")o[key+"Auto"]=false;save();refresh(false);});label.append(inp);box.append(label);
  }
 }
 const toggle=document.createElement("label");toggle.className="prop";toggle.textContent="Показывать объект ";const check=document.createElement("input");check.type="checkbox";check.checked=o.visible!==false;check.disabled=!edit;check.onchange=()=>{checkpoint();o.visible=check.checked;save();refresh();};toggle.append(check);box.append(toggle);
 if(edit){const dup=document.createElement("button");dup.textContent="Дублировать";dup.onclick=()=>{checkpoint();const c=clone(o);c.id=unique();c.x+=15;c.y+=15;if(c.type==="wall"){c.x2+=15;c.y2+=15;}list().push(c);selected=c.id;save();refresh();};box.append(dup);
 const del=document.createElement("button");del.textContent="Удалить объект";del.className="danger";del.onclick=removeSelected;box.append(del);}
}
function refresh(rebuild=true){normalizeMap();if(rebuild){updateProps();buildLayers();}render();}
const expandedGroups=new Set();
data.lockedGroups??={};
const groupLabels={icons:"Значки",walls:"Стены",rooms:"Кабинеты",lift:"Лифт",wardrobes:"Гардеробы",personnel:"Персонал",fountains:"Фонтанчики",stairs:"Лестницы",exits:"Выходы",ungrouped:"Без группы"};
function groupName(layer){return customLayers[layer]?.name||groupLabels[layer]||layer;}
function groupSelected(layer){if(!edit||!selectedIds.size)return;checkpoint();for(const o of list())if(selectedIds.has(o.id)&&!locked(o))o.layer=layer;save();refresh();}
function buildLayers(){
 normalizeMap();
 const box=$("#layers");box.replaceChildren();
 const names=[...new Set(["walls","rooms","lift","wardrobes","personnel","fountains","stairs","exits","icons",...Object.keys(customLayers),...list().map(o=>o.layer||o.type)])];
 for(const layer of names){if(layer==="medical")continue;
 const objects=list().filter(o=>(o.layer||o.type)===layer);
 const wrap=document.createElement("div");wrap.className="tree-group";
 const head=document.createElement("div");head.className="tree-head";
 const arrow=document.createElement("button");arrow.type="button";arrow.className="tree-arrow";arrow.textContent=expandedGroups.has(layer)?"▾":"▸";arrow.title="Раскрыть группу";arrow.onclick=()=>{expandedGroups.has(layer)?expandedGroups.delete(layer):expandedGroups.add(layer);buildLayers();};head.append(arrow);
 const title=document.createElement("span");title.className="tree-title";title.textContent=groupName(layer)+" ("+objects.length+")";title.onclick=()=>{expandedGroups.add(layer);selectedIds=new Set(objects.filter(o=>!locked(o)).map(o=>o.id));selected=[...selectedIds][0]||null;updateProps();render();buildLayers();};head.append(title);
 const cb=document.createElement("input");cb.type="checkbox";cb.title="Видимость группы";cb.checked=!data.hidden[layer];cb.onchange=()=>{data.hidden[layer]=!cb.checked;if(canEdit)save();render();};head.append(cb);
 const actions=document.createElement("div");actions.className="tree-actions";
 if(canEdit){const lock=document.createElement("button");lock.textContent=data.lockedGroups[layer]?"🔒":"🔓";lock.title="Заблокировать / разблокировать группу";lock.onclick=()=>{checkpoint();data.lockedGroups[layer]=!data.lockedGroups[layer];selectedIds.clear();selected=null;save();refresh();};actions.append(lock);}
 if(canEdit){const add=document.createElement("button");add.textContent="+";add.title="Добавить объект";add.onclick=()=>addCustomObject(layer);actions.append(add);
 const rename=document.createElement("button");rename.textContent="✎";rename.title="Переименовать группу";rename.onclick=()=>editLayer(layer);actions.append(rename);
 const del=document.createElement("button");del.textContent="×";del.title="Удалить группу";del.onclick=()=>deleteLayer(layer);actions.append(del);}
 if(canEdit)head.append(actions);
 wrap.append(head);
 if(expandedGroups.has(layer)){
 const children=document.createElement("div");children.className="tree-children";
 for(const [i,o] of objects.entries()){
 const line=document.createElement("div");line.className="tree-object";if(selectedIds.has(o.id))line.classList.add("selected");
 const label=document.createElement("button");label.className="tree-object-label";label.textContent=({wall:"╱ Стена",room:"▢ Кабинет",image:"▧ Изображение",icon:"✦ Значок",text:"T Надпись"}[o.type]||"Объект")+" "+(o.iconTitle||o.text||o.name||"№"+(i+1));
 label.onclick=e=>{if(!edit||locked(o))return;if(e.shiftKey){selectedIds.has(o.id)?selectedIds.delete(o.id):selectedIds.add(o.id);}else{selectedIds=new Set([o.id]);}selected=o.id;refresh();};line.append(label);
 const visible=document.createElement("input");visible.type="checkbox";visible.title="Показать объект";visible.checked=o.visible!==false;visible.disabled=!canEdit;visible.onchange=()=>{checkpoint();o.visible=visible.checked;save();refresh();};line.append(visible);
 if(canEdit){const lock=document.createElement("button");lock.textContent=o.locked?"🔒":"🔓";lock.title="Заблокировать / разблокировать объект";lock.onclick=()=>{checkpoint();o.locked=!o.locked;selectedIds.delete(o.id);if(selected===o.id)selected=null;save();refresh();};line.append(lock);const up=document.createElement("button");up.textContent="↑";up.title="На передний план";up.onclick=()=>{const arr=list(),idx=arr.indexOf(o);if(idx<arr.length-1){checkpoint();arr.splice(idx,1);arr.push(o);save();refresh();}};line.append(up);
 const down=document.createElement("button");down.textContent="↓";down.title="На задний план";down.onclick=()=>{const arr=list(),idx=arr.indexOf(o);if(idx>0){checkpoint();arr.splice(idx,1);arr.unshift(o);save();refresh();}};line.append(down);}
 if(canEdit){const remove=document.createElement("button");remove.textContent="×";remove.title="Удалить объект";remove.disabled=locked(o);remove.onclick=()=>{if(!edit||locked(o))return;selected=o.id;selectedIds=new Set([o.id]);removeSelected();};line.append(remove);}
 children.append(line);
 }
 if(edit&&selectedIds.size){const move=document.createElement("button");move.className="group-selected";move.textContent="＋ Поместить выделенные сюда";move.onclick=()=>groupSelected(layer);children.append(move);}
 wrap.append(children);
 }
 box.append(wrap);
 }
}
function deleteLayer(layer){
 if(!canEdit||layer==="medical")return;
 const count=Object.values(data.floors).flat().filter(o=>o.layer===layer).length;
 if(!confirm(`Удалить категорию «${customLayers[layer]?.name||layer}»? Объекты (${count}) останутся на карте и будут перенесены в категорию «Без группы».`))return;
 checkpoint();for(const objects of Object.values(data.floors))for(const o of objects)if(o.layer===layer)o.layer="ungrouped";
 delete customLayers[layer];delete data.hidden[layer];save();refresh();
}
function editLayer(layer){
 if(!canEdit)return;
 const name=prompt("Название элемента:",customLayers[layer]?.name||({walls:"Стены",rooms:"Кабинеты",lift:"Лифт",wardrobes:"Гардеробы",personnel:"Персонал",fountains:"Фонтанчики",stairs:"Лестницы",exits:"Выходы"}[layer]||layer));if(!name?.trim())return;
 checkpoint();customLayers[layer]={name:name.trim().slice(0,70)};save();refresh();
}
function addCustomObject(layer){
 if(!canEdit)return;
 if(layer==="icons"){
  pendingLayer="icons";
  $("#imageUpload").click();
  return;
 }

 const choice=confirm("Добавить изображение? Нажмите ОК для изображения, Отмена — для надписи.");
 if(choice){pendingLayer=layer;$("#imageUpload").click();}
 else{const text=prompt("Текст объекта:",customLayers[layer]?.name||"");if(text===null)return;checkpoint();const o={id:unique(),type:"text",x:300,y:230,text,fontSize:20,color:"#15243b",layer,visible:true};list().push(o);selected=o.id;save();refresh();}
}
let pendingLayer="images";
$("#addLayer").onclick=()=>{
 if(!canEdit)return;
 const name=prompt("Название нового элемента:");if(!name?.trim())return;
 const key="custom_"+unique();checkpoint();customLayers[key]={name:name.trim().slice(0,70)};
 save();refresh();addCustomObject(key);
};
function removeSelected(){if(!edit||(!selected&&!selectedIds.size))return;checkpoint();const ids=new Set([...selectedIds].filter(id=>{const o=list().find(x=>x.id===id);return o&&!locked(o);}));if(selected){const o=find();if(o&&!locked(o))ids.add(selected);}data.floors[floor]=list().filter(o=>!ids.has(o.id));selected=null;selectedIds.clear();save();refresh();}
function setTool(t){if(!edit)return;tool=t;document.querySelectorAll(".tool").forEach(b=>b.classList.toggle("active",b.dataset.tool===tool));$("#status").textContent="Редактирование · "+({select:"выделение",wall:"рисование стен",room:"кабинет",text:"надпись",image:"изображение",erase:"удаление"}[t]||t);}
for(let f=1;f<=4;f++){const b=document.createElement("button");b.className="floor";b.textContent=f+" этаж";b.onclick=()=>{floor=String(f);selected=null;selectedIds.clear();scale=1;panX=panY=0;document.querySelectorAll(".floor").forEach(x=>x.classList.toggle("active",x===b));$("#floorTitle").textContent=f+" этаж";$("#floorMenuButton").innerHTML=f+" этаж <span aria-hidden=\"true\">▾</span>";$("#floorMenu").hidden=true;liftPopup.hidden=true;$("#floorMenuButton").setAttribute("aria-expanded","false");refresh();};$("#floors").append(b);}document.querySelector(".floor").click();
$("#floorMenuButton").onclick=()=>{const menu=$("#floorMenu");menu.hidden=!menu.hidden;$("#floorMenuButton").setAttribute("aria-expanded",String(!menu.hidden));};
document.addEventListener("click",e=>{if(!e.target.closest(".floor-dropdown")){$("#floorMenu").hidden=true;$("#floorMenuButton").setAttribute("aria-expanded","false");}});
$("#editToggle").onclick=async()=>{if(!await verifyAdmin())return;edit=!edit;$("#editToggle").classList.toggle("active",edit);$("#editToggle").textContent=edit?"✓ Завершить редактирование":"✎ Режим редактирования";if(!edit){scale=1;panX=panY=0;tool="select";selected=null;selectedIds.clear();}document.querySelectorAll(".tool").forEach(b=>b.disabled=!edit);$("#status").textContent=edit?"Редактирование включено":"Режим просмотра";refresh();};
document.querySelectorAll(".tool").forEach(b=>{b.disabled=true;b.onclick=()=>{if(b.dataset.tool==="image"){pendingLayer="images";$("#imageUpload").click();return;}setTool(b.dataset.tool);};});
async function compactMapImage(file){
 const url=URL.createObjectURL(file);
 try{
  const img=new Image();img.src=url;await img.decode();
  const factor=Math.min(1,512/Math.max(img.naturalWidth,img.naturalHeight));
  const c=document.createElement("canvas");c.width=Math.max(1,Math.round(img.naturalWidth*factor));c.height=Math.max(1,Math.round(img.naturalHeight*factor));
  c.getContext("2d").drawImage(img,0,0,c.width,c.height);
  return c.toDataURL("image/webp",.78);
 }finally{URL.revokeObjectURL(url);}
}
$("#imageUpload").onchange=async e=>{const file=e.target.files[0];e.target.value="";if(!file)return;
 if(!file.type.startsWith("image/")){alert("Выберите изображение.");return;}
 try{const src=await compactMapImage(file);checkpoint();const o={id:unique(),type:pendingLayer==="icons"?"icon":"image",x:350,y:230,w:100,h:100,src,layer:pendingLayer,visible:true,iconTitle:"",iconDescription:""};list().push(o);selected=o.id;setTool("select");save();refresh();}
 catch(err){alert("Не удалось обработать изображение: "+err.message);}
};
const liftPopup=document.createElement("div");liftPopup.id="liftPopup";liftPopup.hidden=true;liftPopup.setAttribute("role","menu");liftPopup.style.cssText="position:absolute;z-index:50;display:flex;gap:5px;padding:9px;border:1px solid #a8b9ce;border-radius:12px;background:var(--lift-bg,#fff);box-shadow:0 8px 30px #0003";viewport.append(liftPopup);
function showLiftMenu(e){liftPopup.replaceChildren();for(let i=1;i<=4;i++){const b=document.createElement("button");b.textContent=i+" этаж";b.type="button";b.onclick=()=>{document.querySelectorAll(".floor")[i-1]?.click();liftPopup.hidden=true;};liftPopup.append(b);}const r=viewport.getBoundingClientRect();liftPopup.style.left=Math.min(Math.max(5,e.clientX-r.left),Math.max(5,viewport.clientWidth-300))+"px";liftPopup.style.top=Math.min(Math.max(5,e.clientY-r.top),Math.max(5,viewport.clientHeight-65))+"px";liftPopup.hidden=false;}
document.addEventListener("pointerdown",e=>{if(!liftPopup.contains(e.target)&&e.target!==canvas)liftPopup.hidden=true;});
canvas.addEventListener("contextmenu",e=>e.preventDefault());
canvas.addEventListener("pointerdown",e=>{const p=toWorld(e);
 if(e.button===0&&navOpen&&!navMode){
  const marker=navVisualPicks.find(m=>String(m.floor)===String(floor)&&Math.hypot(m.x-p.x,m.y-p.y)<17/transform().s);
  if(marker){navDragMarker=marker.letter;canvas.setPointerCapture(e.pointerId);return;}
 }
 if(e.button===0&&navClick(p))return;
 if(e.button===2){if(!edit)return;e.preventDefault();canvas.setPointerCapture(e.pointerId);drag={mode:"pan",x:e.clientX,y:e.clientY,px:panX,py:panY};return;}
 if(e.button!==0)return;if(edit)canvas.setPointerCapture(e.pointerId);
 if(!edit&&magnifierActive){scale=Math.min(6,scale*1.5);render();return;}
 if(!edit){const o=[...list()].reverse().find(item=>item.layer==="lift"&&item.visible!==false&&(()=>{const b=bounds(item);return p.x>=b.x-10&&p.x<=b.x+b.w+10&&p.y>=b.y-10&&p.y<=b.y+b.h+10;})())||hit(p);if(o&&(o.layer==="lift"||/лифт/i.test(o.text||""))){showLiftMenu(e);}return;}
 if(tool==="erase"){const o=hit(p,true);if(o){selected=o.id;selectedIds=new Set([o.id]);removeSelected();}return;}
 if(tool==="text"){const value=prompt("Введите надпись:","Новая надпись");if(value===null)return;checkpoint();const o={id:unique(),type:"text",x:p.x,y:p.y,text:value,fontSize:18,color:"#15243b",layer:"text",visible:true};list().push(o);selected=o.id;save();refresh();return;}
 if(tool==="wall"||tool==="room"){const creatingRoom=tool==="room";const roomNumber=creatingRoom?prompt("Номер кабинета или название (например, Кадры):",""):null;if(creatingRoom&&(roomNumber===null||!roomNumber.trim())){setTool("select");return;}checkpoint();const o=tool==="wall"?{id:unique(),type:"wall",x:p.x,y:p.y,x2:p.x,y2:p.y,stroke:"#243449",width:2.5,layer:"walls",opacity:1,visible:true}:{id:unique(),type:"room",x:p.x,y:p.y,w:1,h:1,text:roomNumber.trim(),fill:"#ffffff",stroke:"#94a3b8",layer:"rooms",fontSize:14,fontFamily:"system-ui",bold:true,color:"#1e293b",visible:true};list().push(o);selected=o.id;drag={mode:"draw",start:p,id:o.id};refresh();return;}
 let o=hit(p,true);
 if(selected&&tool==="select"&&!e.shiftKey){const previous=find();if(previous?.type==="wall"&&!locked(previous)){const t=transform(),r=17/t.s;if(Math.hypot(p.x-previous.x,p.y-previous.y)<r||Math.hypot(p.x-previous.x2,p.y-previous.y2)<r)o=previous;}}
 if(e.shiftKey){if(o){if(selectedIds.has(o.id))selectedIds.delete(o.id);else selectedIds.add(o.id);selected=o.id;}refresh();return;}
 selectedIds.clear();selected=o?.id||null;if(o){selectedIds.add(o.id);const b=bounds(o),t=transform();const radius=15/t.s;const end=o.type==="wall"?Math.hypot(p.x-o.x2,p.y-o.y2)<radius:Math.hypot(p.x-(b.x+b.w),p.y-(b.y+b.h))<radius;const start=o.type==="wall"&&Math.hypot(p.x-o.x,p.y-o.y)<radius;checkpoint();drag={mode:start?"resizeStart":end?"resize":"move",start:p,old:clone(o),id:o.id};}refresh();
});
canvas.addEventListener("pointermove",e=>{if(!drag)return;const p=toWorld(e);
 if(drag.mode==="pan"){panX=drag.px+e.clientX-drag.x;panY=drag.py+e.clientY-drag.y;render();return;}
 const o=find();if(!o)return;const dx=p.x-drag.start.x,dy=p.y-drag.start.y;
 if(drag.mode==="draw"){if(o.type==="wall"){const q=snapWall(o.x,o.y,p.x,p.y);o.x2=q.x;o.y2=q.y;}else{o.x=Math.min(drag.start.x,p.x);o.y=Math.min(drag.start.y,p.y);o.w=Math.abs(dx);o.h=Math.abs(dy);}}
 if(drag.mode==="move"){o.x=drag.old.x+dx;o.y=drag.old.y+dy;if(o.type==="wall"){o.x2=drag.old.x2+dx;o.y2=drag.old.y2+dy;}}
 if(drag.mode==="resizeStart"&&o.type==="wall"){const q=snapWall(o.x2,o.y2,drag.old.x+dx,drag.old.y+dy);o.x=q.x;o.y=q.y;}
 if(drag.mode==="resize"){if(o.type==="wall"){const q=snapWall(o.x,o.y,drag.old.x2+dx,drag.old.y2+dy);o.x2=q.x;o.y2=q.y;}else if(o.w!=null){o.w=Math.max(8,drag.old.w+dx);o.h=Math.max(8,drag.old.h+dy);}}
 render();
});
function positionRoomTooltip(e){
 const tip=$("#roomTooltip"),r=viewport.getBoundingClientRect(),pad=8;
 tip.hidden=false;
 const w=tip.offsetWidth,h=tip.offsetHeight;
 let x=e.clientX-r.left+16,y=e.clientY-r.top+14;
 if(x+w>r.width-pad)x=e.clientX-r.left-w-16;
 if(y+h>r.height-pad)y=e.clientY-r.top-h-16;
 tip.style.left=Math.max(pad,Math.min(x,r.width-w-pad))+"px";
 tip.style.top=Math.max(pad,Math.min(y,r.height-h-pad))+"px";
}
canvas.addEventListener("pointermove",e=>{
 if(navDragMarker){const p=toWorld(e),m=navVisualPicks.find(x=>x.letter===navDragMarker);if(m){m.x=p.x;m.y=p.y;m.floor=String(floor);navRoute=[];render();}return;}
 const tip=$("#roomTooltip");if(drag){tip.hidden=true;return;}
 const o=hit(toWorld(e));if(!o||(o.type!=="room"&&o.type!=="icon"&&o.layer!=="lift")){tip.hidden=true;return;}
 const escape=v=>String(v||"—").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
 if(o.type==="icon"){
  if(!String(o.iconTitle||"").trim()&&!String(o.iconDescription||"").trim()){tip.hidden=true;return;}
  tip.replaceChildren();if(String(o.iconTitle||"").trim()){const title=document.createElement("strong");title.textContent=o.iconTitle;tip.append(title);}
  if(o.iconDescription){const detail=document.createElement("div");detail.textContent=o.iconDescription;detail.style.whiteSpace="pre-wrap";tip.append(detail);}
  positionRoomTooltip(e);return;
 }
 const subject=roomTitle(String(o.text||""))||o.roomSubject||"";
 tip.innerHTML=`<strong>${/^\d+$/.test(String(o.text||"").trim())?"Кабинет №"+escape(o.text):escape(o.text)}</strong>${o.roomClass?`<div>Класс: ${escape(o.roomClass)}</div>`:""}${o.roomTeacher?`<div>Преподаватель: ${escape(o.roomTeacher)}</div>`:""}${subject?`<div>${escape(subject)}</div>`:""}`;
 positionRoomTooltip(e);
});
canvas.addEventListener("pointerleave",()=>{$("#roomTooltip").hidden=true;});
function finish(){if(navDragMarker){navDragMarker=null;navInfo("Маркер перемещён. Постройте маршрут заново.");render();return;}if(!drag)return;const wasRoom=drag.mode==="draw"&&find()?.type==="room";const changed=drag.mode!=="pan";drag=null;if(wasRoom)setTool("select");if(changed){save();refresh();}}
canvas.addEventListener("pointerup",finish);canvas.addEventListener("pointercancel",()=>{drag=null;navDragMarker=null;});
viewport.addEventListener("wheel",e=>{if(!edit)return;e.preventDefault();scale=Math.max(.3,Math.min(6,scale*(e.deltaY<0?1.12:.89)));render();},{passive:false});
function mapShortcut(e){
 const target=e.target;const typing=target?.isContentEditable||["INPUT","TEXTAREA","SELECT"].includes(target?.tagName);
 if(!edit||!canEdit||typing||!(e.ctrlKey||e.metaKey)||e.altKey)return false;
 const key=e.code==="KeyZ"?"z":e.code==="KeyX"?"x":e.code==="KeyY"?"y":e.key.toLowerCase();
 if(key==="z"){e.preventDefault();e.stopPropagation();e.shiftKey?redo():undo();return true;}
 if(key==="x"||key==="y"){e.preventDefault();e.stopPropagation();redo();return true;}
 return false;
}
window.addEventListener("keydown",e=>{if(mapShortcut(e))return;if(e.code==="Space"&&!(["INPUT","TEXTAREA"].includes(e.target?.tagName))){space=true;e.preventDefault();}if(edit&&["Delete","Backspace"].includes(e.key)&&!(e.target instanceof HTMLInputElement))removeSelected();},true);
window.addEventListener("message",e=>{if(e.origin!==location.origin||e.data?.type!=="school33-map-shortcut")return;if(!edit||!canEdit)return;if(e.data.key==="z")e.data.shift?redo():undo();else if(e.data.key==="x"||e.data.key==="y")redo();});
window.addEventListener("keyup",e=>{if(e.code==="Space")space=false;});
$("#minus").onclick=()=>{scale=Math.max(.3,scale/1.2);render();};$("#plus").onclick=()=>{scale=Math.min(6,scale*1.2);render();};$("#zoomReset").onclick=()=>{scale=1;panX=panY=0;render();};$("#magnifier").onclick=()=>{magnifierActive=!magnifierActive;$("#magnifier").classList.toggle("active",magnifierActive);$("#magnifier").setAttribute("aria-pressed",String(magnifierActive));canvas.style.cursor=magnifierActive?"zoom-in":"crosshair";};
$("#undo").onclick=undo;$("#redo").onclick=redo;$("#save").onclick=async()=>{if(canEdit){const b=$("#save");b.disabled=true;try{await window.flushSchoolMap();}finally{b.disabled=false;}}};
$("#download").onclick=()=>{const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="Карта школы 33.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$("#load").onchange=async e=>{const file=e.target.files[0];if(!file)return;try{const obj=JSON.parse(await file.text());if(!obj.floors||!["1","2","3","4"].every(f=>Array.isArray(obj.floors[f])))throw Error("Неверная структура файла");if(!confirm("Заменить текущую карту данными из файла?"))return;if(!canEdit){alert("Требуется режим администратора.");return;}checkpoint();data=obj;normalizeMap();customLayers=data.customLayers||{};selected=null;navRoute=[];navOptions();save();refresh();}catch(err){alert("Не удалось загрузить карту: "+err.message);}e.target.value="";};
$("#clearFloor").onclick=()=>{if(!edit){alert("Сначала включите режим редактирования.");return;}if(!confirm("Удалить все объекты "+floor+" этажа?"))return;checkpoint();data.floors[floor]=[];selected=null;save();refresh();};
navSetup();new ResizeObserver(resize).observe(viewport);resize();refresh();
$("#editToggle").hidden=true;$("#addLayer").hidden=true;
window.addEventListener("focus",verifyAdmin);
 window.addEventListener("message",e=>{if(e.origin===location.origin&&e.data?.type==="school33-admin-changed")verifyAdmin();});
 setInterval(()=>{if(token()!==lastToken||(!token()&&canEdit))verifyAdmin();},400);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)verifyAdmin();});
function syncTheme(theme){document.documentElement.dataset.theme=theme==="dark"?"dark":"light";requestAnimationFrame(render);}
window.addEventListener("message",e=>{if(e.origin===location.origin&&e.data?.type==="school33-theme")syncTheme(e.data.theme);});
try{syncTheme(parent.document.documentElement.dataset.theme || localStorage.getItem("school33-theme"));}catch{syncTheme(localStorage.getItem("school33-theme"));}
try{new MutationObserver(()=>syncTheme(parent.document.documentElement.dataset.theme)).observe(parent.document.documentElement,{attributes:true,attributeFilter:["data-theme"]});}catch{}
verifyAdmin();loadRemote();
})();