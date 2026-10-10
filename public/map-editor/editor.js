(() => {
"use strict";
const KEY="school33_floor_editor_v1", VW=920,VH=705;
const clone=x=>JSON.parse(JSON.stringify(x));
const starter=()=>({version:1,floors:{"1":clone(window.SCHOOL_SEED||[]),"2":clone(window.SCHOOL_OTHER_FLOORS?.["2"]||[]),"3":clone(window.SCHOOL_OTHER_FLOORS?.["3"]||[]),"4":clone(window.SCHOOL_OTHER_FLOORS?.["4"]||[])},hidden:{}});
let data=starter();let customLayers={};let canEdit=false;let serverLoaded=false;
for(let f=1;f<=4;f++)data.floors[String(f)]??=[];
let floor="1",selected=null,edit=false,tool="select",scale=1,panX=0,panY=0,drag=null,space=false,history=[],future=[];
const $=s=>document.querySelector(s),viewport=$("#viewport"),canvas=$("#canvas"),ctx=canvas.getContext("2d");
const list=()=>data.floors[floor],find=()=>list().find(o=>o.id===selected);
const unique=()=>String(Date.now())+Math.random().toString(36).slice(2,8);
let saveTimer;
const token=()=>sessionStorage.getItem("school33-admin-token")||"";
async function verifyAdmin(){try{const r=await fetch("/api/admin/status",{headers:{"x-admin-token":token()}});const j=await r.json();canEdit=!!j.admin;}catch{canEdit=false;}$("#editToggle").hidden=!canEdit;$("#addLayer").hidden=!canEdit;if(!canEdit&&edit){edit=false;selected=null;$("#editToggle").classList.remove("active");}document.querySelectorAll(".tool").forEach(b=>b.disabled=!edit);return canEdit;}
async function loadRemote(){try{const r=await fetch("/api/school-map");if(!r.ok)throw Error("HTTP "+r.status);const j=await r.json();if(j.map?.floors){data=j.map;customLayers=data.customLayers||{};}serverLoaded=true;refresh();}catch(e){$("#status").textContent="Не удалось загрузить карту из D1: "+e.message;}}
const save=()=>{if(!canEdit||!serverLoaded)return;data.customLayers=customLayers;clearTimeout(saveTimer);$("#status").textContent="Сохранение…";saveTimer=setTimeout(async()=>{try{const r=await fetch("/api/school-map",{method:"PUT",headers:{"content-type":"application/json","x-admin-token":token()},body:JSON.stringify({map:data})});const j=await r.json();if(!r.ok)throw Error(j.error||"HTTP "+r.status);$("#status").textContent="Сохранено в D1";}catch(e){$("#status").textContent="Ошибка сохранения: "+e.message;}},550);};
function checkpoint(){data.customLayers=customLayers;history.push(clone(data));if(history.length>40)history.shift();future=[];}
function undo(){if(!history.length)return;future.push(clone(data));data=history.pop();customLayers=data.customLayers||{};selected=null;save();refresh();}
function redo(){if(!future.length)return;history.push(clone(data));data=future.pop();customLayers=data.customLayers||{};selected=null;save();refresh();}
function transform(){const s=Math.min(viewport.clientWidth/VW,viewport.clientHeight/VH)*.95*scale;return{s,x:(viewport.clientWidth-VW*s)/2+panX,y:(viewport.clientHeight-VH*s)/2+panY};}
function toWorld(e){const r=viewport.getBoundingClientRect(),t=transform();return{x:(e.clientX-r.left-t.x)/t.s,y:(e.clientY-r.top-t.y)/t.s};}
function strokeLine(o){ctx.strokeStyle=o.stroke||"#243449";ctx.lineWidth=o.width||2.5;ctx.lineCap="square";ctx.beginPath();ctx.moveTo(o.x,o.y);ctx.lineTo(o.x2,o.y2);ctx.stroke();}
const imageCache=new Map();
function draw(o){
 if(o.type==="wall"){strokeLine(o);return;}
 if(o.type==="room"){ctx.fillStyle=o.fill||"white";ctx.strokeStyle=o.stroke||"#94a3b8";ctx.lineWidth=1.4;ctx.fillRect(o.x,o.y,o.w,o.h);ctx.strokeRect(o.x,o.y,o.w,o.h);ctx.fillStyle="#1e293b";ctx.font="bold 14px system-ui";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(o.text||"",o.x+o.w/2,o.y+o.h/2);return;}
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
 for(const o of list()){if(o.visible===false||(o.layer!=="medical"&&data.hidden[o.layer||o.type]))continue;draw(o);}
 if(edit&&selected){const o=find();if(o){const b=bounds(o);ctx.strokeStyle="#2563eb";ctx.lineWidth=1.8/t.s;ctx.setLineDash([6/t.s,4/t.s]);ctx.strokeRect(b.x-3,b.y-3,b.w+6,b.h+6);ctx.setLineDash([]);const hx=b.x+b.w,hy=b.y+b.h;ctx.fillStyle="#2563eb";ctx.fillRect(hx-5/t.s,hy-5/t.s,10/t.s,10/t.s);}}
 $("#empty").hidden=list().length>0;
}
function resize(){const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(viewport.clientWidth*dpr);canvas.height=Math.round(viewport.clientHeight*dpr);render();}
function hit(p){for(const o of [...list()].reverse()){if(o.visible===false||(o.layer!=="medical"&&data.hidden[o.layer||o.type]))continue;const b=bounds(o);if(p.x>=b.x-6&&p.x<=b.x+b.w+6&&p.y>=b.y-6&&p.y<=b.y+b.h+6)return o;}return null;}
function updateProps(){
 const box=$("#props");box.replaceChildren();const o=find();
 if(!o)return;
 const fields=[["text","Название / надпись","text"],["x","X","number"],["y","Y","number"],["x2","Конец X","number"],["y2","Конец Y","number"],["w","Ширина","number"],["h","Высота","number"],["fontSize","Размер шрифта","number"],["width","Толщина линии","number"],["stroke","Цвет линии","color"],["fill","Заливка","color"],["color","Цвет текста","color"],["layer","Слой","text"]];
 const name=document.createElement("p");name.textContent="Объект: "+({wall:"Стена",room:"Кабинет",text:"Надпись",image:"Изображение"}[o.type]||o.type);box.append(name);
 for(const [key,title,type] of fields){if(!(key in o))continue;const label=document.createElement("label");label.className="prop";label.textContent=title;const inp=document.createElement("input");inp.type=type;inp.value=o[key];inp.disabled=!edit;inp.addEventListener("change",()=>{checkpoint();o[key]=type==="number"?Number(inp.value):inp.value;save();refresh(false);});label.append(inp);box.append(label);}
 const toggle=document.createElement("label");toggle.className="prop";toggle.textContent="Показывать объект ";const check=document.createElement("input");check.type="checkbox";check.checked=o.visible!==false;check.disabled=!edit;check.onchange=()=>{checkpoint();o.visible=check.checked;save();refresh();};toggle.append(check);box.append(toggle);
 if(edit){const dup=document.createElement("button");dup.textContent="Дублировать";dup.onclick=()=>{checkpoint();const c=clone(o);c.id=unique();c.x+=15;c.y+=15;if(c.type==="wall"){c.x2+=15;c.y2+=15;}list().push(c);selected=c.id;save();refresh();};box.append(dup);
 const del=document.createElement("button");del.textContent="Удалить объект";del.className="danger";del.onclick=removeSelected;box.append(del);}
}
function refresh(rebuild=true){if(rebuild){updateProps();buildLayers();}render();}
function buildLayers(){
 const box=$("#layers");box.replaceChildren();
 const names=[...new Set([...Object.keys(customLayers),...list().map(o=>o.layer||o.type),"walls","rooms","lift","wardrobes","personnel","fountains","stairs","exits"])];
 for(const layer of names){
 if(layer==="medical")continue;
 const l=document.createElement("div");l.className="layer";const sp=document.createElement("span");
 sp.textContent=(customLayers[layer]?.icon||"")+" "+(customLayers[layer]?.name||({walls:"Стены",rooms:"Кабинеты",lift:"Лифт",wardrobes:"Гардеробы",personnel:"Персонал",fountains:"Фонтанчики",stairs:"Лестницы",exits:"Выходы"}[layer]||layer));
 const cb=document.createElement("input");cb.type="checkbox";cb.checked=!data.hidden[layer];cb.onchange=()=>{data.hidden[layer]=!cb.checked;if(canEdit)save();render();};
 l.append(sp,cb);
 if(customLayers[layer]&&canEdit){const add=document.createElement("button");add.textContent="＋";add.title="Добавить объект этого элемента";add.onclick=()=>addCustomObject(layer);l.append(add);
 const rename=document.createElement("button");rename.textContent="✎";rename.title="Изменить имя и иконку";rename.onclick=()=>editLayer(layer);l.append(rename);}
 box.append(l);
 }
}
function editLayer(layer){
 if(!canEdit)return;
 const name=prompt("Название элемента:",customLayers[layer]?.name||layer);if(!name?.trim())return;
 const icon=prompt("Иконка элемента (эмодзи или символ):",customLayers[layer]?.icon||"📍");if(icon===null)return;
 checkpoint();customLayers[layer]={name:name.trim().slice(0,70),icon:icon.slice(0,8)};save();refresh();
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
 const icon=prompt("Иконка (эмодзи или символ):","📍");if(icon===null)return;
 const key="custom_"+unique();checkpoint();customLayers[key]={name:name.trim().slice(0,70),icon:icon.slice(0,8)};
 save();refresh();addCustomObject(key);
};
function removeSelected(){if(!edit||!selected)return;checkpoint();data.floors[floor]=list().filter(o=>o.id!==selected);selected=null;save();refresh();}
function setTool(t){if(!edit)return;tool=t;document.querySelectorAll(".tool").forEach(b=>b.classList.toggle("active",b.dataset.tool===tool));$("#status").textContent="Редактирование · "+({select:"выделение",wall:"рисование стен",room:"кабинет",text:"надпись",image:"изображение",erase:"удаление"}[t]||t);}
for(let f=1;f<=4;f++){const b=document.createElement("button");b.className="floor";b.textContent=f+" этаж";b.onclick=()=>{floor=String(f);selected=null;scale=1;panX=panY=0;document.querySelectorAll(".floor").forEach(x=>x.classList.toggle("active",x===b));$("#floorTitle").textContent=f+" этаж";refresh();};$("#floors").append(b);}document.querySelector(".floor").click();
$("#editToggle").onclick=async()=>{if(!await verifyAdmin())return;edit=!edit;$("#editToggle").classList.toggle("active",edit);$("#editToggle").textContent=edit?"✓ Завершить редактирование":"✎ Режим редактирования";if(!edit){tool="select";selected=null;}document.querySelectorAll(".tool").forEach(b=>b.disabled=!edit);$("#status").textContent=edit?"Редактирование включено":"Режим просмотра";refresh();};
document.querySelectorAll(".tool").forEach(b=>{b.disabled=true;b.onclick=()=>{if(b.dataset.tool==="image"){$("#imageUpload").click();return;}setTool(b.dataset.tool);};});
$("#imageUpload").onchange=e=>{const file=e.target.files[0];if(!file)return;if(!file.type.startsWith("image/")){alert("Выберите изображение.");return;}if(file.size>450*1024){alert("Изображение слишком большое. Выберите файл до 450 КБ.");return;}const reader=new FileReader();reader.onload=()=>{checkpoint();const o={id:unique(),type:"image",x:350,y:230,w:100,h:100,src:reader.result,layer:pendingLayer,visible:true};list().push(o);selected=o.id;setTool("select");save();refresh();};reader.readAsDataURL(file);e.target.value="";};
canvas.addEventListener("pointerdown",e=>{const p=toWorld(e);canvas.setPointerCapture(e.pointerId);
 if(space||!edit){drag={mode:"pan",x:e.clientX,y:e.clientY,px:panX,py:panY};return;}
 if(tool==="erase"){const o=hit(p);if(o){selected=o.id;removeSelected();}return;}
 if(tool==="text"){const value=prompt("Введите надпись:","Новая надпись");if(value===null)return;checkpoint();const o={id:unique(),type:"text",x:p.x,y:p.y,text:value,fontSize:18,color:"#15243b",layer:"text",visible:true};list().push(o);selected=o.id;save();refresh();return;}
 if(tool==="wall"||tool==="room"){checkpoint();const o=tool==="wall"?{id:unique(),type:"wall",x:p.x,y:p.y,x2:p.x,y2:p.y,stroke:"#243449",width:2.5,layer:"walls",visible:true}:{id:unique(),type:"room",x:p.x,y:p.y,w:1,h:1,text:prompt("Номер кабинета:","")||"",fill:"#ffffff",stroke:"#94a3b8",layer:"rooms",visible:true};list().push(o);selected=o.id;drag={mode:"draw",start:p,id:o.id};refresh();return;}
 const o=hit(p);selected=o?.id||null;if(o){const b=bounds(o),t=transform(),near=Math.hypot(p.x-(b.x+b.w),p.y-(b.y+b.h))<14/t.s;checkpoint();drag={mode:near?"resize":"move",start:p,old:clone(o),id:o.id};}refresh();
});
canvas.addEventListener("pointermove",e=>{if(!drag)return;const p=toWorld(e);
 if(drag.mode==="pan"){panX=drag.px+e.clientX-drag.x;panY=drag.py+e.clientY-drag.y;render();return;}
 const o=find();if(!o)return;const dx=p.x-drag.start.x,dy=p.y-drag.start.y;
 if(drag.mode==="draw"){if(o.type==="wall"){o.x2=p.x;o.y2=p.y;}else{o.x=Math.min(drag.start.x,p.x);o.y=Math.min(drag.start.y,p.y);o.w=Math.abs(dx);o.h=Math.abs(dy);}}
 if(drag.mode==="move"){o.x=drag.old.x+dx;o.y=drag.old.y+dy;if(o.type==="wall"){o.x2=drag.old.x2+dx;o.y2=drag.old.y2+dy;}}
 if(drag.mode==="resize"){if(o.type==="wall"){o.x2=drag.old.x2+dx;o.y2=drag.old.y2+dy;}else if(o.w!=null){o.w=Math.max(8,drag.old.w+dx);o.h=Math.max(8,drag.old.h+dy);}}
 render();
});
function finish(){if(!drag)return;const changed=drag.mode!=="pan";drag=null;if(changed){save();refresh();}}
canvas.addEventListener("pointerup",finish);canvas.addEventListener("pointercancel",finish);
viewport.addEventListener("wheel",e=>{e.preventDefault();scale=Math.max(.3,Math.min(6,scale*(e.deltaY<0?1.12:.89)));render();},{passive:false});
window.addEventListener("keydown",e=>{if(e.code==="Space"&&!(e.target instanceof HTMLInputElement)){space=true;e.preventDefault();}if(edit&&(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="z"&&!(e.target instanceof HTMLInputElement)&&!(e.target instanceof HTMLTextAreaElement)){e.preventDefault();e.shiftKey?redo():undo();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="x"&&!(e.target instanceof HTMLInputElement)&&!(e.target instanceof HTMLTextAreaElement)){if(edit){e.preventDefault();redo();}}if(edit&&["Delete","Backspace"].includes(e.key)&&!(e.target instanceof HTMLInputElement)){removeSelected();}});
window.addEventListener("keyup",e=>{if(e.code==="Space")space=false;});
$("#minus").onclick=()=>{scale=Math.max(.3,scale/1.2);render();};$("#plus").onclick=()=>{scale=Math.min(6,scale*1.2);render();};$("#zoomReset").onclick=()=>{scale=1;panX=panY=0;render();};
$("#undo").onclick=undo;$("#redo").onclick=redo;$("#save").onclick=()=>{if(canEdit)save();};
$("#download").onclick=()=>{const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="Карта школы 33.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$("#load").onchange=async e=>{const file=e.target.files[0];if(!file)return;try{const obj=JSON.parse(await file.text());if(!obj.floors||!["1","2","3","4"].every(f=>Array.isArray(obj.floors[f])))throw Error("Неверная структура файла");if(!confirm("Заменить текущую карту данными из файла?"))return;if(!canEdit){alert("Требуется режим администратора.");return;}checkpoint();data=obj;data.hidden??={};customLayers=data.customLayers||{};selected=null;save();refresh();}catch(err){alert("Не удалось загрузить карту: "+err.message);}e.target.value="";};
$("#clearFloor").onclick=()=>{if(!edit){alert("Сначала включите режим редактирования.");return;}if(!confirm("Удалить все объекты "+floor+" этажа?"))return;checkpoint();data.floors[floor]=[];selected=null;save();refresh();};
new ResizeObserver(resize).observe(viewport);resize();refresh();
$("#editToggle").hidden=true;$("#addLayer").hidden=true;
window.addEventListener("focus",verifyAdmin);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)verifyAdmin();});
verifyAdmin();loadRemote();
})();