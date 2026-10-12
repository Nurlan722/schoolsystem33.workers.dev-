(() => {
"use strict";
const KEY="school33_floor_editor_v1", VW=920,VH=705;
const clone=x=>JSON.parse(JSON.stringify(x));
const starter=()=>({version:1,floors:{"1":clone(window.SCHOOL_SEED||[]),"2":clone(window.SCHOOL_OTHER_FLOORS?.["2"]||[]),"3":clone(window.SCHOOL_OTHER_FLOORS?.["3"]||[]),"4":clone(window.SCHOOL_OTHER_FLOORS?.["4"]||[])},hidden:{}});
let data=starter();let customLayers={};let canEdit=false;let serverLoaded=false;
for(let f=1;f<=4;f++)data.floors[String(f)]??=[];
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
 if(!previous&&canEdit){edit=true;tool="select";$("#editToggle").classList.add("active");$("#editToggle").textContent="✓ Завершить редактирование";$("#status").textContent="Редактирование включено";document.querySelectorAll(".tool").forEach(b=>b.disabled=false);}
 if(previous!==canEdit){refresh();requestAnimationFrame(resize);}lastToken=current;return canEdit;
}
function enrichRoomClasses(){
 const mapping=window.SCHOOL_ROOM_CLASSES||{};
 for(const objects of Object.values(data.floors||{}))for(const o of objects){
  if(o.type==='room'&&mapping[String(o.text||'').trim()]&&!o.roomClass)o.roomClass=mapping[String(o.text).trim()];
 }
}
async function syncSchoolTeachers(){
 try{
  const r=await fetch('/api/state',{cache:'no-store'});if(!r.ok)return;
  const state=await r.json();if(!Array.isArray(state.classes)||!Array.isArray(state.teachers))return;
  const teachers=new Map(state.teachers.map(t=>[String(t.id),t]));
  const byName=new Map(state.classes.map(c=>[String(c.name||'').replace(/\s+/g,'').toLocaleUpperCase('ru'),c]));
  for(const objects of Object.values(data.floors||{}))for(const o of objects){
   if(o.type!=='room'||!o.roomClass)continue;
   const c=byName.get(String(o.roomClass).replace(/\s+/g,'').toLocaleUpperCase('ru'));
   const t=c&&teachers.get(String(c.teacher_id));
   if(t){if(!o.roomTeacher||o.roomTeacherAuto){o.roomTeacher=t.name||'';o.roomTeacherAuto=true;}
    if(!o.roomSubject||o.roomSubjectAuto){o.roomSubject=t.subject||'';o.roomSubjectAuto=true;}}
  }
  refresh();
 }catch(e){console.warn('Class/teacher details not loaded',e);}
}
function restoreMissingPlanObjects(){
 const template=starter().floors;
 const additions=window.SCHOOL_PLAN_ADDITIONS||[];
 let added=0;
 for(let f=1;f<=4;f++){
  const key=String(f), existing=data.floors[key]||(data.floors[key]=[]);
  // Only repair clearly incomplete floors; don't overwrite an intentionally edited full plan.
  const hasEnoughStructure=existing.filter(o=>o.type==="wall"||o.type==="room").length>=25;
  if(hasEnoughStructure)continue;
  const ids=new Set(existing.map(o=>o.id));
  const base=[...(template[key]||[]),...additions.filter(o=>o.id.startsWith(`floor7-${f}-`)||o.id.startsWith(`floor7-label-${f}-`))];
  for(const o of base){if(!ids.has(o.id)){existing.push(clone(o));ids.add(o.id);added++;}}
 }
 return added;
}
async function loadRemote(){
 try{
  const r=await fetch(new URL("/api/school-map",location.origin),{cache:"no-store"});
  if(!r.ok)throw Error("HTTP "+r.status);
  const j=await r.json();
  if(j.map?.floors){data=j.map;customLayers=data.customLayers||{};}
  for(let f=1;f<=4;f++)data.floors[String(f)]??=[];
  const added=restoreMissingPlanObjects();
  enrichRoomClasses();serverLoaded=true;refresh();syncSchoolTeachers();
  if(added){
   $("#status").textContent=`Восстановлены недостающие детали схемы: ${added}. Для сохранения войдите как администратор и нажмите «Сохранить».`;
  }else{$("#status").textContent="Карта загружена из D1";}
 }catch(e){
  const added=restoreMissingPlanObjects();enrichRoomClasses();refresh();
  $("#status").textContent="Показана встроенная схема"+(added?` (добавлено ${added} деталей)`:"")+". D1 недоступна: "+e.message;
 }
}
const save=()=>{if(!canEdit||!serverLoaded)return;data.customLayers=customLayers;clearTimeout(saveTimer);$("#status").textContent="Сохранение…";saveTimer=setTimeout(async()=>{try{const r=await fetch("/api/school-map",{method:"PUT",headers:{"content-type":"application/json","x-admin-token":token()},body:JSON.stringify({map:data})});const j=await r.json();if(!r.ok)throw Error(j.error||"HTTP "+r.status);$("#status").textContent="Сохранено в D1";}catch(e){$("#status").textContent="Ошибка сохранения: "+e.message;}},550);};
window.flushSchoolMap=async()=>{
 if(!canEdit||!serverLoaded)return true;
 clearTimeout(saveTimer);data.customLayers=customLayers;
 try{const r=await fetch("/api/school-map",{method:"PUT",headers:{"content-type":"application/json","x-admin-token":token()},body:JSON.stringify({map:data})});if(!r.ok)throw Error("HTTP "+r.status);$("#status").textContent="Сохранено в D1";return true;}catch(e){$("#status").textContent="Ошибка сохранения: "+e.message;return false;}
};
function checkpoint(){data.customLayers=customLayers;history.push(clone(data));if(history.length>40)history.shift();future=[];}
function undo(){if(!history.length)return;future.push(clone(data));data=history.pop();customLayers=data.customLayers||{};selected=null;save();refresh();}
function redo(){if(!future.length)return;history.push(clone(data));data=future.pop();customLayers=data.customLayers||{};selected=null;save();refresh();}
function transform(){const s=Math.min(viewport.clientWidth/VW,viewport.clientHeight/VH)*.95*scale;return{s,x:(viewport.clientWidth-VW*s)/2+panX,y:(viewport.clientHeight-VH*s)/2+panY};}
function toWorld(e){const r=viewport.getBoundingClientRect(),t=transform();return{x:(e.clientX-r.left-t.x)/t.s,y:(e.clientY-r.top-t.y)/t.s};}
function strokeLine(o){ctx.strokeStyle=o.stroke||"#243449";ctx.lineWidth=o.width??2.5;ctx.globalAlpha=o.opacity??1;ctx.lineCap="square";ctx.beginPath();ctx.moveTo(o.x,o.y);ctx.lineTo(o.x2,o.y2);ctx.stroke();ctx.globalAlpha=1;}
const imageCache=new Map();
function draw(o){
 if(o.type==="wall"){strokeLine(o);return;}
 if(o.type==="room"){ctx.fillStyle=o.fill||"white";ctx.strokeStyle=o.stroke||"#94a3b8";ctx.lineWidth=o.width??1.4;ctx.globalAlpha=o.opacity??1;ctx.fillRect(o.x,o.y,o.w,o.h);ctx.strokeRect(o.x,o.y,o.w,o.h);ctx.fillStyle=o.color||"#1e293b";ctx.globalAlpha=1;ctx.font=`${o.bold===false?"":"bold "}${o.fontSize||14}px ${o.fontFamily||"system-ui"}`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(o.text||"",o.x+o.w/2,o.y+o.h/2);return;}
 if(o.type==="text"){ctx.font=`${o.bold?"bold ":""}${o.fontSize||18}px system-ui`;ctx.textAlign="left";ctx.textBaseline="top";ctx.fillStyle=o.color||"#15243b";ctx.fillText(o.text||"",o.x,o.y);return;}
 if(o.type==="image"){
 let im=imageCache.get(o.src);if(!im){im=new Image();im.src=o.src;im.onload=render;imageCache.set(o.src,im);}
 if(im.complete&&im.naturalWidth)ctx.drawImage(im,o.x,o.y,o.w,o.h);
 }
}
function bounds(o){if(o.type==="wall")return{x:Math.min(o.x,o.x2)-5,y:Math.min(o.y,o.y2)-5,w:Math.abs(o.x2-o.x)+10,h:Math.abs(o.y2-o.y)+10};if(o.type==="text"){ctx.font=`${o.fontSize||18}px system-ui`;return{x:o.x,y:o.y,w:Math.max(20,ctx.measureText(o.text||"").width),h:(o.fontSize||18)*1.3};}return{x:o.x,y:o.y,w:o.w,h:o.h};}
function render(){
 const dpr=Math.min(devicePixelRatio||1,2);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,viewport.clientWidth,viewport.clientHeight);
 const t=transform();ctx.translate(t.x,t.y);ctx.scale(t.s,t.s);
 for(const o of [...list().filter(o=>o.type!=="wall"),...list().filter(o=>o.type==="wall")]){if(o.visible===false||(o.layer!=="medical"&&data.hidden[o.layer||o.type]))continue;draw(o);}
 if(edit&&(selected||selectedIds.size)){for(const o of list().filter(o=>selectedIds.has(o.id))){const b=bounds(o);ctx.strokeStyle="#2563eb";ctx.lineWidth=1.8/t.s;ctx.setLineDash([6/t.s,4/t.s]);ctx.strokeRect(b.x-3,b.y-3,b.w+6,b.h+6);ctx.setLineDash([]);if(o.type==="wall"){ctx.fillStyle="#2563eb";for(const [hx,hy] of [[o.x,o.y],[o.x2,o.y2]]){ctx.fillRect(hx-6/t.s,hy-6/t.s,12/t.s,12/t.s);}}else{const hx=b.x+b.w,hy=b.y+b.h;ctx.fillStyle="#2563eb";ctx.fillRect(hx-5/t.s,hy-5/t.s,10/t.s,10/t.s);}}}
 $("#empty").hidden=list().length>0;
}
function resize(){const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(viewport.clientWidth*dpr);canvas.height=Math.round(viewport.clientHeight*dpr);render();}
function locked(o){return !!(o.locked||data.lockedGroups?.[o.layer||o.type]);}
function hit(p,editable=false){for(const o of [...list().filter(o=>o.type!=="wall"),...list().filter(o=>o.type==="wall")].reverse()){if(o.visible===false||(o.layer!=="medical"&&data.hidden[o.layer||o.type])||(editable&&locked(o)))continue;if(o.type==="wall"){const dx=o.x2-o.x,dy=o.y2-o.y,len2=dx*dx+dy*dy;const u=len2?Math.max(0,Math.min(1,((p.x-o.x)*dx+(p.y-o.y)*dy)/len2)):0;if(Math.hypot(p.x-(o.x+u*dx),p.y-(o.y+u*dy))<=Math.max(7,(o.width||2)/2+4))return o;continue;}const b=bounds(o);if(p.x>=b.x-6&&p.x<=b.x+b.w+6&&p.y>=b.y-6&&p.y<=b.y+b.h+6)return o;}return null;}
function updateProps(){
 const box=$("#props");box.replaceChildren();const o=find();
 if(o&&locked(o)){const note=document.createElement("p");note.textContent="🔒 Объект заблокирован";box.append(note);return;}
 if(selectedIds.size>1){const title=document.createElement("p");title.textContent=`Выбрано объектов: ${selectedIds.size}`;box.append(title);
 const pick=document.createElement("select");for(const layer of Object.keys(customLayers).concat(["walls","rooms","lift","wardrobes","personnel","fountains","stairs","exits"])){if(layer==="medical")continue;const opt=document.createElement("option");opt.value=layer;opt.textContent=customLayers[layer]?.name||layer;pick.append(opt);}box.append(pick);
 const group=document.createElement("button");group.textContent="Добавить выбранные в группу";group.disabled=!edit;group.onclick=()=>{checkpoint();for(const item of list())if(selectedIds.has(item.id))item.layer=pick.value;save();refresh();};box.append(group);
 const color=document.createElement("input");color.type="color";color.value="#2563eb";box.append(color);const recolor=document.createElement("button");recolor.textContent="Применить цвет к выбранным";recolor.disabled=!edit;recolor.onclick=()=>{checkpoint();for(const item of list())if(selectedIds.has(item.id)){if(item.type==="text")item.color=color.value;else item.stroke=color.value;}save();refresh();};box.append(recolor);return;}
 if(!o)return;
 const fields=[["opacity","Прозрачность (0–1)","number"],["bold","Жирный шрифт","checkbox"],["fontFamily","Шрифт","text"],["text","Номер кабинета / надпись","text"],["x","X","number"],["y","Y","number"],["x2","Конец X","number"],["y2","Конец Y","number"],["w","Ширина","number"],["h","Высота","number"],["fontSize","Размер шрифта","number"],["width","Толщина линии","number"],["stroke","Цвет линии","color"],["fill","Заливка","color"],["color","Цвет текста","color"],["layer","Слой","text"]];
 const name=document.createElement("p");name.textContent="Объект: "+({wall:"Стена",room:"Кабинет",text:"Надпись",image:"Изображение"}[o.type]||o.type);box.append(name);
 for(const [key,title,type] of fields){if(!(key in o)&&!(o.type==="wall"&&["opacity"].includes(key))&&!(o.type==="room"&&["opacity","bold","fontFamily","fontSize","color","width"].includes(key)))continue;const label=document.createElement("label");label.className="prop";label.textContent=title;const inp=document.createElement("input");inp.type=type;inp.value=o[key]??(key==="fontSize"?14:key==="opacity"?1:key==="fontFamily"?"system-ui":key==="width"?1.4:key==="color"?"#1e293b":"");if(type==="checkbox")inp.checked=o[key]!==false;inp.disabled=!edit;inp.addEventListener("change",()=>{checkpoint();o[key]=type==="checkbox"?inp.checked:type==="number"?Number(inp.value):inp.value;save();refresh(false);});label.append(inp);box.append(label);}
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
function refresh(rebuild=true){if(rebuild){updateProps();buildLayers();}render();}
const expandedGroups=new Set(["rooms","walls"]);
data.lockedGroups??={};
const groupLabels={walls:"Стены",rooms:"Кабинеты",lift:"Лифт",wardrobes:"Гардеробы",personnel:"Персонал",fountains:"Фонтанчики",stairs:"Лестницы",exits:"Выходы",ungrouped:"Без группы"};
function groupName(layer){return customLayers[layer]?.name||groupLabels[layer]||layer;}
function groupSelected(layer){if(!edit||!selectedIds.size)return;checkpoint();for(const o of list())if(selectedIds.has(o.id)&&!locked(o))o.layer=layer;save();refresh();}
function buildLayers(){
 const box=$("#layers");box.replaceChildren();
 const names=[...new Set([...Object.keys(customLayers),...list().map(o=>o.layer||o.type),"walls","rooms","lift","wardrobes","personnel","fountains","stairs","exits"])];
 for(const layer of names){if(layer==="medical")continue;
 const objects=list().filter(o=>(o.layer||o.type)===layer);
 const wrap=document.createElement("div");wrap.className="tree-group";
 const head=document.createElement("div");head.className="tree-head";
 const arrow=document.createElement("button");arrow.type="button";arrow.className="tree-arrow";arrow.textContent=expandedGroups.has(layer)?"▾":"▸";arrow.title="Раскрыть группу";arrow.onclick=()=>{expandedGroups.has(layer)?expandedGroups.delete(layer):expandedGroups.add(layer);buildLayers();};head.append(arrow);
 const title=document.createElement("span");title.className="tree-title";title.textContent=groupName(layer)+" ("+objects.length+")";title.onclick=()=>{expandedGroups.add(layer);selectedIds=new Set(objects.filter(o=>!locked(o)).map(o=>o.id));selected=[...selectedIds][0]||null;updateProps();render();buildLayers();};head.append(title);
 const cb=document.createElement("input");cb.type="checkbox";cb.title="Видимость группы";cb.checked=!data.hidden[layer];cb.onchange=()=>{data.hidden[layer]=!cb.checked;if(canEdit)save();render();};head.append(cb);
 if(canEdit){const lock=document.createElement("button");lock.textContent=data.lockedGroups[layer]?"🔒":"🔓";lock.title="Заблокировать / разблокировать группу";lock.onclick=()=>{checkpoint();data.lockedGroups[layer]=!data.lockedGroups[layer];selectedIds.clear();selected=null;save();refresh();};head.append(lock);}
 if(canEdit){const add=document.createElement("button");add.textContent="+";add.title="Добавить объект";add.onclick=()=>addCustomObject(layer);head.append(add);
 const rename=document.createElement("button");rename.textContent="✎";rename.title="Переименовать группу";rename.onclick=()=>editLayer(layer);head.append(rename);
 const del=document.createElement("button");del.textContent="×";del.title="Удалить группу";del.onclick=()=>deleteLayer(layer);head.append(del);}
 wrap.append(head);
 if(expandedGroups.has(layer)){
 const children=document.createElement("div");children.className="tree-children";
 for(const [i,o] of objects.entries()){
 const line=document.createElement("div");line.className="tree-object";if(selectedIds.has(o.id))line.classList.add("selected");
 const label=document.createElement("button");label.className="tree-object-label";label.textContent=({wall:"╱ Стена",room:"▢ Кабинет",image:"▧ Изображение",text:"T Надпись"}[o.type]||"Объект")+" "+(o.text||o.name||"№"+(i+1));
 label.onclick=e=>{if(!edit||locked(o))return;if(e.shiftKey){selectedIds.has(o.id)?selectedIds.delete(o.id):selectedIds.add(o.id);}else{selectedIds=new Set([o.id]);}selected=o.id;refresh();};line.append(label);
 const visible=document.createElement("input");visible.type="checkbox";visible.title="Показать объект";visible.checked=o.visible!==false;visible.disabled=!canEdit;visible.onchange=()=>{checkpoint();o.visible=visible.checked;save();refresh();};line.append(visible);
 if(canEdit){const lock=document.createElement("button");lock.textContent=o.locked?"🔒":"🔓";lock.title="Заблокировать / разблокировать объект";lock.onclick=()=>{checkpoint();o.locked=!o.locked;selectedIds.delete(o.id);if(selected===o.id)selected=null;save();refresh();};line.append(lock);const up=document.createElement("button");up.textContent="↑";up.title="На передний план";up.onclick=()=>{const arr=list(),idx=arr.indexOf(o);if(idx<arr.length-1){checkpoint();arr.splice(idx,1);arr.push(o);save();refresh();}};line.append(up);
 const down=document.createElement("button");down.textContent="↓";down.title="На задний план";down.onclick=()=>{const arr=list(),idx=arr.indexOf(o);if(idx>0){checkpoint();arr.splice(idx,1);arr.unshift(o);save();refresh();}};line.append(down);}
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
for(let f=1;f<=4;f++){const b=document.createElement("button");b.className="floor";b.textContent=f+" этаж";b.onclick=()=>{floor=String(f);selected=null;selectedIds.clear();scale=1;panX=panY=0;document.querySelectorAll(".floor").forEach(x=>x.classList.toggle("active",x===b));$("#floorTitle").textContent=f+" этаж";$("#floorMenuButton").innerHTML=f+" этаж <span aria-hidden=\"true\">▾</span>";$("#floorMenu").hidden=true;$("#floorMenuButton").setAttribute("aria-expanded","false");refresh();};$("#floors").append(b);}document.querySelector(".floor").click();
$("#floorMenuButton").onclick=()=>{const menu=$("#floorMenu");menu.hidden=!menu.hidden;$("#floorMenuButton").setAttribute("aria-expanded",String(!menu.hidden));};
document.addEventListener("click",e=>{if(!e.target.closest(".floor-dropdown")){$("#floorMenu").hidden=true;$("#floorMenuButton").setAttribute("aria-expanded","false");}});
$("#editToggle").onclick=async()=>{if(!await verifyAdmin())return;edit=!edit;$("#editToggle").classList.toggle("active",edit);$("#editToggle").textContent=edit?"✓ Завершить редактирование":"✎ Режим редактирования";if(!edit){scale=1;panX=panY=0;tool="select";selected=null;selectedIds.clear();}document.querySelectorAll(".tool").forEach(b=>b.disabled=!edit);$("#status").textContent=edit?"Редактирование включено":"Режим просмотра";refresh();};
document.querySelectorAll(".tool").forEach(b=>{b.disabled=true;b.onclick=()=>{if(b.dataset.tool==="image"){pendingLayer="images";$("#imageUpload").click();return;}setTool(b.dataset.tool);};});
$("#imageUpload").onchange=e=>{const file=e.target.files[0];if(!file)return;if(!file.type.startsWith("image/")){alert("Выберите изображение.");return;}const reader=new FileReader();reader.onload=()=>{checkpoint();const o={id:unique(),type:"image",x:350,y:230,w:100,h:100,src:reader.result,layer:pendingLayer,visible:true};list().push(o);selected=o.id;setTool("select");save();refresh();};reader.readAsDataURL(file);e.target.value="";};
canvas.addEventListener("contextmenu",e=>e.preventDefault());
canvas.addEventListener("pointerdown",e=>{const p=toWorld(e);
 if(e.button===2){if(!edit)return;e.preventDefault();canvas.setPointerCapture(e.pointerId);drag={mode:"pan",x:e.clientX,y:e.clientY,px:panX,py:panY};return;}
 if(e.button!==0)return;canvas.setPointerCapture(e.pointerId);
 if(!edit){const o=[...list()].reverse().find(item=>item.layer==="lift"&&item.visible!==false&&(()=>{const b=bounds(item);return p.x>=b.x-10&&p.x<=b.x+b.w+10&&p.y>=b.y-10&&p.y<=b.y+b.h+10;})())||hit(p);if(o&&(o.layer==="lift"||/лифт/i.test(o.text||""))){const next=prompt("Лифт: выберите этаж (1–4)",floor);if(next&&/^[1-4]$/.test(next))document.querySelectorAll(".floor")[Number(next)-1]?.click();}return;}
 if(tool==="erase"){const o=hit(p,true);if(o){selected=o.id;removeSelected();}return;}
 if(tool==="text"){const value=prompt("Введите надпись:","Новая надпись");if(value===null)return;checkpoint();const o={id:unique(),type:"text",x:p.x,y:p.y,text:value,fontSize:18,color:"#15243b",layer:"text",visible:true};list().push(o);selected=o.id;save();refresh();return;}
 if(tool==="wall"||tool==="room"){checkpoint();const o=tool==="wall"?{id:unique(),type:"wall",x:p.x,y:p.y,x2:p.x,y2:p.y,stroke:"#243449",width:2.5,layer:"walls",opacity:1,visible:true}:{id:unique(),type:"room",x:p.x,y:p.y,w:1,h:1,text:prompt("Номер кабинета:","")||"",fill:"#ffffff",stroke:"#94a3b8",layer:"rooms",fontSize:14,fontFamily:"system-ui",bold:true,color:"#1e293b",visible:true};list().push(o);selected=o.id;drag={mode:"draw",start:p,id:o.id};refresh();return;}
 const o=hit(p,true);
 if(e.shiftKey){if(o){if(selectedIds.has(o.id))selectedIds.delete(o.id);else selectedIds.add(o.id);selected=o.id;}refresh();return;}
 selectedIds.clear();selected=o?.id||null;if(o){selectedIds.add(o.id);const b=bounds(o),t=transform();const radius=15/t.s;const end=o.type==="wall"?Math.hypot(p.x-o.x2,p.y-o.y2)<radius:Math.hypot(p.x-(b.x+b.w),p.y-(b.y+b.h))<radius;const start=o.type==="wall"&&Math.hypot(p.x-o.x,p.y-o.y)<radius;checkpoint();drag={mode:start?"resizeStart":end?"resize":"move",start:p,old:clone(o),id:o.id};}refresh();
});
canvas.addEventListener("pointermove",e=>{if(!drag)return;const p=toWorld(e);
 if(drag.mode==="pan"){panX=drag.px+e.clientX-drag.x;panY=drag.py+e.clientY-drag.y;render();return;}
 const o=find();if(!o)return;const dx=p.x-drag.start.x,dy=p.y-drag.start.y;
 if(drag.mode==="draw"){if(o.type==="wall"){o.x2=p.x;o.y2=p.y;}else{o.x=Math.min(drag.start.x,p.x);o.y=Math.min(drag.start.y,p.y);o.w=Math.abs(dx);o.h=Math.abs(dy);}}
 if(drag.mode==="move"){o.x=drag.old.x+dx;o.y=drag.old.y+dy;if(o.type==="wall"){o.x2=drag.old.x2+dx;o.y2=drag.old.y2+dy;}}
 if(drag.mode==="resizeStart"&&o.type==="wall"){o.x=drag.old.x+dx;o.y=drag.old.y+dy;}
 if(drag.mode==="resize"){if(o.type==="wall"){o.x2=drag.old.x2+dx;o.y2=drag.old.y2+dy;}else if(o.w!=null){o.w=Math.max(8,drag.old.w+dx);o.h=Math.max(8,drag.old.h+dy);}}
 render();
});
canvas.addEventListener("pointermove",e=>{
 const tip=$("#roomTooltip");if(drag){tip.hidden=true;return;}
 const o=hit(toWorld(e));if(!o||o.type!=="room"){tip.hidden=true;return;}
 const escape=v=>String(v||"—").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
 tip.innerHTML=`<strong>Кабинет №${escape(o.text)}</strong><div>Класс: ${escape(o.roomClass)}</div><div>Преподаватель: ${escape(o.roomTeacher)}</div><div>Предмет: ${escape(o.roomSubject)}</div>`;
 const r=viewport.getBoundingClientRect();tip.style.left=Math.min(e.clientX-r.left+15,viewport.clientWidth-240)+"px";tip.style.top=Math.min(e.clientY-r.top+12,viewport.clientHeight-110)+"px";tip.hidden=false;
});
canvas.addEventListener("pointerleave",()=>{$("#roomTooltip").hidden=true;});
function finish(){if(!drag)return;const changed=drag.mode!=="pan";drag=null;if(changed){save();refresh();}}
canvas.addEventListener("pointerup",finish);canvas.addEventListener("pointercancel",finish);
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
$("#minus").onclick=()=>{scale=Math.max(.3,scale/1.2);render();};$("#plus").onclick=()=>{scale=Math.min(6,scale*1.2);render();};$("#zoomReset").onclick=()=>{scale=1;panX=panY=0;render();};
$("#undo").onclick=undo;$("#redo").onclick=redo;$("#save").onclick=()=>{if(canEdit)save();};
$("#download").onclick=()=>{const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="Карта школы 33.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$("#load").onchange=async e=>{const file=e.target.files[0];if(!file)return;try{const obj=JSON.parse(await file.text());if(!obj.floors||!["1","2","3","4"].every(f=>Array.isArray(obj.floors[f])))throw Error("Неверная структура файла");if(!confirm("Заменить текущую карту данными из файла?"))return;if(!canEdit){alert("Требуется режим администратора.");return;}checkpoint();data=obj;data.hidden??={};customLayers=data.customLayers||{};selected=null;save();refresh();}catch(err){alert("Не удалось загрузить карту: "+err.message);}e.target.value="";};
$("#clearFloor").onclick=()=>{if(!edit){alert("Сначала включите режим редактирования.");return;}if(!confirm("Удалить все объекты "+floor+" этажа?"))return;checkpoint();data.floors[floor]=[];selected=null;save();refresh();};
new ResizeObserver(resize).observe(viewport);resize();refresh();
$("#editToggle").hidden=true;$("#addLayer").hidden=true;
window.addEventListener("focus",verifyAdmin);
 window.addEventListener("message",e=>{if(e.origin===location.origin&&e.data?.type==="school33-admin-changed")verifyAdmin();});
 setInterval(()=>{if(token()!==lastToken||(!token()&&canEdit))verifyAdmin();},400);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)verifyAdmin();});
function syncTheme(theme){document.documentElement.dataset.theme=theme==="dark"?"dark":"light";}
window.addEventListener("message",e=>{if(e.origin===location.origin&&e.data?.type==="school33-theme")syncTheme(e.data.theme);});
try{syncTheme(parent.document.documentElement.dataset.theme || localStorage.getItem("school33-theme"));}catch{syncTheme(localStorage.getItem("school33-theme"));}
try{new MutationObserver(()=>syncTheme(parent.document.documentElement.dataset.theme)).observe(parent.document.documentElement,{attributes:true,attributeFilter:["data-theme"]});}catch{}
verifyAdmin();loadRemote();
})();