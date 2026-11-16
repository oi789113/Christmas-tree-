import { TreeEngine } from './tree-engine.js?v=contact-depth-20261115';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const TYPES=[{id:'bauble',name:'玻璃彩球',short:'彩球',color:'#b84339'},{id:'bell',name:'金色铃铛',short:'铃铛',color:'#d7ad59'},{id:'bow',name:'丝绒蝴蝶结',short:'蝴蝶结',color:'#ad343b'},{id:'candy',name:'圣诞拐杖糖',short:'拐杖糖',color:'#c84543'},{id:'star',name:'金属星星',short:'星星',color:'#e2bd66'},{id:'snowflake',name:'晶莹雪花',short:'雪花',color:'#e2e8e6'},{id:'ginger',name:'姜饼伙伴',short:'姜饼人',color:'#c34c3f'},{id:'heart',name:'爱心挂饰',short:'爱心',color:'#bf7471'}];
const COLORS=[{color:'#b84339',name:'酒红'},{color:'#d7ad59',name:'香槟金'},{color:'#e2e8e6',name:'珍珠白'},{color:'#bf7471',name:'玫瑰金'},{color:'#6d9375',name:'松绿'},{color:'#6f9cb5',name:'冰蓝'}];
const TOPPERS=[{id:'star',name:'许愿星',color:'#e2bd66'},{id:'bow',name:'蝴蝶结',color:'#ad343b'},{id:'snowflake',name:'雪花',color:'#e2e8e6'},{id:'none',name:'留白',color:''}];
const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches,clone=o=>JSON.parse(JSON.stringify(o)),clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
let sequence=0;const uid=()=>`orn-${Date.now().toString(36)}-${++sequence}`;
const make=(type,x,y,color,size=42)=>({id:uid(),type,x,y,color,size,rotation:0});
const defaults=[make('bauble',-.18,.82,'#b84339'),make('bell',-.62,.65,'#d7ad59'),make('bauble',.55,.69,'#d7ad59',39),make('bow',.12,.59,'#ad343b',45),make('bauble',-.5,.47,'#b84339',47),make('snowflake',.62,.48,'#e2e8e6',42),make('star',.04,.36,'#d7ad59',39),make('candy',-.73,.26,'#c84543',47),make('bauble',.7,.28,'#b84339',46),make('bell',.32,.16,'#d7ad59',42),make('ginger',-.22,.15,'#c34c3f',43),make('heart',-.65,.07,'#bf7471',42),make('bauble',.8,.07,'#d7ad59',44),make('bauble',.05,.02,'#b84339',46)];
let storageOK=true,saved=null;
try{saved=JSON.parse(localStorage.getItem('winter-tree-3d')||'null');if(!saved){const old=JSON.parse(localStorage.getItem('winter-tree-v2')||'null');if(old?.ornaments){saved={...old,ornaments:old.ornaments.map(o=>({...o,id:uid(),x:clamp((o.x-370)/Math.max(14,(o.y-125)*.48),-.9,.9),y:clamp(1-(o.y-150)/510,.04,.9)})),night:true,snow:false};}}}catch{storageOK=false;}
function valid(o){return o&&typeof o.id==='string'&&/^[\w-]+$/.test(o.id)&&TYPES.some(t=>t.id===o.type)&&['x','y','size','rotation'].every(k=>Number.isFinite(o[k]))&&Math.abs(o.x)<=1&&o.y>=0&&o.y<=1&&o.size>=28&&o.size<=58&&/^#[a-f0-9]{6}$/i.test(o.color)&&(o.angle===undefined||Number.isFinite(o.angle));}
const state={ornaments:Array.isArray(saved?.ornaments)?saved.ornaments.filter(valid).slice(0,60).filter((o,i,a)=>a.findIndex(n=>n.id===o.id)===i):defaults,lights:{on:saved?.lights?.on!==false,color:['warm','candy','ice'].includes(saved?.lights?.color)?saved.lights.color:'warm',mode:['steady','breathe','twinkle'].includes(saved?.lights?.mode)?saved.lights.mode:'twinkle',brightness:Number.isFinite(saved?.lights?.brightness)?clamp(saved.lights.brightness,20,100):85},topper:TOPPERS.some(t=>t.id===saved?.topper)?saved.topper:'star',night:saved?.night!==false,weather:saved?.winterWeatherVersion===1&&['clear','snow','flurries'].includes(saved.weather)?saved.weather:'snow',winterWeatherVersion:1,quality:'high',snow:saved?.winterWeatherVersion===1?saved.weather!=='clear':true,bounce:saved?.focusVersion===1?saved.bounce!==false:true,focusVersion:1};
let engine,ready=false,selectedId=null,brush={type:'bauble',color:'#b84339',size:42},history=[],future=[],saveTimer,toastTimer,rangeBefore=null,lightBefore=null,trayDrag=null,moveRaf=0,suppressClick=false;
const info=t=>TYPES.find(v=>v.id===t)||TYPES[0],selected=()=>state.ornaments.find(o=>o.id===selectedId),design=()=>clone({ornaments:state.ornaments,lights:state.lights,topper:state.topper});
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3200);}
function persist(){clearTimeout(saveTimer);try{localStorage.setItem('winter-tree-3d',JSON.stringify(state));storageOK=true;$('#save-status').textContent='已自动保存';}catch{storageOK=false;$('#save-status').textContent='仅本次保留';}}
function save(){clearTimeout(saveTimer);$('#save-status').textContent='保存中';saveTimer=setTimeout(persist,240);}
function record(before){if(JSON.stringify(before)!==JSON.stringify(design())){history.push(before);if(history.length>40)history.shift();future=[];save();}sync();}
function applyDesign(){if(ready){engine.setOrnaments(state.ornaments);engine.setLights(state.lights);engine.setTopper(state.topper);}sync();save();}
function undo(){if(!history.length||trayDrag)return;future.push(design());Object.assign(state,history.pop());selectedId=null;engine?.setSelected(null);applyDesign();}
function redo(){if(!future.length||trayDrag)return;history.push(design());Object.assign(state,future.pop());selectedId=null;engine?.setSelected(null);applyDesign();}
function select(id){selectedId=id;const item=selected();if(item)brush={type:item.type,color:item.color,size:item.size};engine?.setSelected(id);sync();}
function setBrush(type){select(null);brush={type,color:info(type).color,size:42};sync();}
function syncWeather(){
 const titles={clear:'雪林 · 晴空',snow:'雪林 · 细雪',flurries:'雪林 · 风雪'},notes={clear:'雪停了，森林安静下来。',snow:'风很轻，雪慢慢落下。',flurries:'一阵风，捎来漫天雪花。'};
 $$('[data-weather]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.weather===state.weather)));
 $('#weather-title').textContent=titles[state.weather];$('#weather-note').textContent=reducedMotion?'动态已减弱，留住这一刻的雪景。':notes[state.weather];
 $('#snow-toggle').setAttribute('aria-label',state.weather==='clear'?'开始飘雪':'暂停飘雪');$('#snow-toggle').title=state.weather==='clear'?'开始飘雪':'暂停飘雪';
}
function setWeather(mode){state.weather=mode;state.snow=mode!=='clear';engine?.setWeather(mode);sync();save();}
function sync(){syncWeather();
 $('#ornament-count').textContent=state.ornaments.length;$('#undo-button').disabled=!history.length;$('#redo-button').disabled=!future.length;$('#clear-button').disabled=!state.ornaments.length;
 const item=selected();$('#inspector').hidden=!item;$('#selected-name').textContent=item?info(item.type).name:'';
 $$('.ornament-option').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.type===brush.type)));
 $$('.swatch').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.color===brush.color)));
 $('#ornament-size').value=brush.size;$('#size-value').textContent=brush.size;
 $('#action-hint').innerHTML=item?'<span class="hint-star">✧</span> 轻轻点它会摇晃。拖动，可以换个位置。':`<span class="hint-star">✧</span> 选好了${info(brush.type).short}，点到树上，或直接拖过去。`;
 $$('[data-light-color]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.lightColor===state.lights.color)));
 $$('[data-light-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.lightMode===state.lights.mode)));
 $('#brightness').value=state.lights.brightness;$('#lights-toggle').setAttribute('aria-pressed',String(state.lights.on));
 $$('[data-topper]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.topper===state.topper)));
 $('#night-toggle').setAttribute('aria-pressed',String(state.night));$('#snow-toggle').setAttribute('aria-pressed',String(state.snow));$('#placement-style').setAttribute('aria-pressed',String(state.bounce));
 $('#placement-style').innerHTML=`<span class="motion-dot"></span>${state.bounce?'镜头拉近':'轻放模式'}`;
}
function addAt(position){
 if(!ready||!position)return false;
 if(state.ornaments.length>=60){toast('枝头已挂上 60 份心意，取下一件，再继续装扮吧。');return false;}
 const before=design(),item=make(brush.type,clamp(position.x,-1,1),clamp(position.y,0,1),brush.color,brush.size);if(Number.isFinite(position.angle))item.angle=position.angle;
 state.ornaments.push(item);engine.addOrnament(item,{animate:state.bounce&&!reducedMotion});selectedId=item.id;engine.setSelected(item.id);record(before);return true;
}
function onDrop(drop){
 if(!ready)return;
 if(drop.id){const item=state.ornaments.find(o=>o.id===drop.id);if(!item)return;const before=design();item.x=clamp(drop.x,-1,1);item.y=clamp(drop.y,0,1);if(Number.isFinite(drop.angle))item.angle=drop.angle;engine.updateOrnament(item);select(item.id);if(state.bounce&&!reducedMotion)engine.focusOnOrnament(item.id);record(before);}
 else addAt(drop);
}
const icon=(type,color)=>`<svg viewBox="0 0 64 76" aria-hidden="true" style="color:${color}"><use href="#orn-${type}" width="64" height="76"/></svg>`;
TYPES.forEach(type=>{
 const b=document.createElement('button');b.type='button';b.className='ornament-option';b.dataset.type=type.id;b.setAttribute('aria-label',`选择${type.name}，可拖到树上`);b.innerHTML=icon(type.id,type.color)+`<span>${type.short}</span>`;
 b.addEventListener('click',()=>{if(!suppressClick)setBrush(type.id);});
 b.addEventListener('pointerdown',e=>{if(!ready||e.button!==0||trayDrag)return;setBrush(type.id);trayDrag={id:e.pointerId,startX:e.clientX,startY:e.clientY,x:e.clientX,y:e.clientY,moved:false,target:b};b.setPointerCapture?.(e.pointerId);});$('#ornament-grid').append(b);
});
function moveGhost(){moveRaf=0;if(!trayDrag?.moved)return;const g=$('#drag-ghost');g.hidden=false;if(!g.firstElementChild)g.innerHTML=icon(brush.type,brush.color);g.style.transform=`translate3d(${trayDrag.x-28}px,${trayDrag.y-26}px,0)`;g.style.opacity=engine.getDropPosition(trayDrag.x,trayDrag.y)?'1':'.5';}
window.addEventListener('pointermove',e=>{if(!trayDrag||e.pointerId!==trayDrag.id)return;trayDrag.x=e.clientX;trayDrag.y=e.clientY;if(Math.hypot(e.clientX-trayDrag.startX,e.clientY-trayDrag.startY)>5){trayDrag.moved=true;document.body.classList.add('is-dragging');}if(!moveRaf)moveRaf=requestAnimationFrame(moveGhost);},{passive:true});
function finishTray(e,cancelled=false){if(!trayDrag||e.pointerId!==trayDrag.id)return;const gesture=trayDrag;trayDrag=null;cancelAnimationFrame(moveRaf);moveRaf=0;
 if(gesture.moved){suppressClick=true;setTimeout(()=>suppressClick=false,100);if(!cancelled){const point=engine.getDropPosition(e.clientX,e.clientY);if(point)addAt(point);else toast('把挂饰放在树枝上，它就会弹跳着挂好。');}}
 $('#drag-ghost').hidden=true;$('#drag-ghost').replaceChildren();document.body.classList.remove('is-dragging');if(gesture.target.hasPointerCapture?.(gesture.id))gesture.target.releasePointerCapture(gesture.id);
}
window.addEventListener('pointerup',e=>finishTray(e));window.addEventListener('pointercancel',e=>finishTray(e,true));window.addEventListener('blur',()=>{if(trayDrag)finishTray({pointerId:trayDrag.id},true);});
COLORS.forEach(c=>{const b=document.createElement('button');b.className='swatch';b.dataset.color=c.color;b.style.setProperty('--color',c.color);b.setAttribute('aria-label',c.name);b.title=c.name;b.addEventListener('click',()=>{brush.color=c.color;const item=selected();if(item){const before=design();item.color=c.color;engine.updateOrnament(item);record(before);}sync();});$('#inspector-colors').append(b);});
$('#ornament-size').addEventListener('input',e=>{const item=selected();if(!item)return;rangeBefore||=design();brush.size=Number(e.target.value);item.size=brush.size;engine.updateOrnament(item);sync();});
$('#ornament-size').addEventListener('change',()=>{if(rangeBefore){record(rangeBefore);rangeBefore=null;}});
$('#rotate-selected').addEventListener('click',()=>{const item=selected();if(!item)return;const before=design();item.rotation=(item.rotation+30)%360;engine.updateOrnament(item);record(before);});
function remove(){const item=selected();if(!item)return;const before=design();engine.removeOrnament(item.id);state.ornaments=state.ornaments.filter(o=>o.id!==item.id);selectedId=null;engine.setSelected(null);record(before);}
$('#remove-selected').addEventListener('click',remove);$('#deselect').addEventListener('click',()=>select(null));
$('#undo-button').addEventListener('click',undo);$('#redo-button').addEventListener('click',redo);
$('#clear-button').addEventListener('click',()=>{const before=design();state.ornaments=[];selectedId=null;engine?.setSelected(null);engine?.setOrnaments([]);record(before);toast('树枝已腾空。点撤销，可以找回刚才的装扮。');});
function changeLights(action){const before=design();action();engine?.setLights(state.lights);record(before);}
$$('[data-light-color]').forEach(b=>b.addEventListener('click',()=>changeLights(()=>{state.lights.color=b.dataset.lightColor;state.lights.on=true;})));
$$('[data-light-mode]').forEach(b=>b.addEventListener('click',()=>changeLights(()=>state.lights.mode=b.dataset.lightMode)));
$('#brightness').addEventListener('input',e=>{lightBefore||=design();state.lights.brightness=Number(e.target.value);engine?.setLights(state.lights);});$('#brightness').addEventListener('change',()=>{if(lightBefore){record(lightBefore);lightBefore=null;}});
$('#lights-toggle').addEventListener('click',()=>changeLights(()=>state.lights.on=!state.lights.on));
TOPPERS.forEach(t=>{const b=document.createElement('button');b.className='topper-option';b.dataset.topper=t.id;b.innerHTML=(t.id==='none'?'<span class="empty-topper">∅</span>':icon(t.id,t.color))+`<span>${t.name}</span>`;b.addEventListener('click',()=>{const before=design();state.topper=t.id;engine?.setTopper(t.id);record(before);});$('#topper-grid').append(b);});
$('#night-toggle').addEventListener('click',()=>{state.night=!state.night;engine?.setNight(state.night);sync();save();});
$('#snow-toggle').addEventListener('click',()=>setWeather(state.weather==='clear'?'snow':'clear'));
$$('[data-weather]').forEach(b=>b.addEventListener('click',()=>setWeather(b.dataset.weather)));
$('#placement-style').addEventListener('click',()=>{state.bounce=!state.bounce;sync();save();});
function syncZoom(zoom=1){const requested=engine?.getZoom?.()??zoom;$('#zoom-value').textContent=`${Math.round(zoom*100)}%`;$('#zoom-in').disabled=!ready||requested>=3.999;$('#zoom-out').disabled=!ready||requested<=.751;$('#zoom-reset').disabled=!ready;}
$('#zoom-in').addEventListener('click',()=>{if(ready){engine.zoomBy(1.25);syncZoom(engine.reportedZoom??engine.getZoom());}});
$('#zoom-out').addEventListener('click',()=>{if(ready){engine.zoomBy(1/1.25);syncZoom(engine.reportedZoom??engine.getZoom());}});
$('#zoom-reset').addEventListener('click',()=>{if(ready)engine.setZoom(1);});
$('#reset-camera').addEventListener('click',()=>engine?.resetCamera());$('#retry-button').addEventListener('click',()=>location.reload());
function tab(name){$$('[data-tab]').forEach(b=>{const active=b.dataset.tab===name;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;});$$('.tab-panel').forEach(p=>p.hidden=p.id!==`panel-${name}`);}
$$('[data-tab]').forEach((b,i)=>{b.addEventListener('click',()=>tab(b.dataset.tab));b.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const buttons=$$('[data-tab]'),next=e.key==='Home'?0:e.key==='End'?2:(i+(e.key==='ArrowRight'?1:-1)+3)%3;tab(buttons[next].dataset.tab);buttons[next].focus();});});
document.addEventListener('keydown',e=>{if(e.target.matches('input,textarea'))return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();}else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redo();}else if(e.key==='Escape')select(null);else if(['Delete','Backspace'].includes(e.key)&&selected()){e.preventDefault();remove();}});
$('#tree-canvas').addEventListener('keydown',e=>{
 if(!ready)return;
 if(['+','=','-','_','0'].includes(e.key)){e.preventDefault();if(e.key==='0')engine.setZoom(1);else engine.zoomBy(e.key==='-'||e.key==='_'?1/1.25:1.25);return;}
 if(['Enter',' '].includes(e.key)){
  e.preventDefault();const point=engine.getViewPlacement();if(point)addAt(point);return;
 }
 if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){
  e.preventDefault();const item=selected(),step=e.shiftKey?.1:.025;
  if(item){
   const before=design();
   if(e.key==='ArrowLeft'||e.key==='ArrowRight'){item.angle=(Number.isFinite(item.angle)?item.angle:Math.asin(clamp(item.x,-1,1)*.995))+(e.key==='ArrowLeft'?-step:step);item.x=clamp(Math.sin(item.angle)/.995,-1,1);}
   else item.y=clamp(item.y+(e.key==='ArrowUp'?step:-step),0,1);
   engine.updateOrnament(item);record(before);
  }else engine.orbitBy(e.key==='ArrowLeft'?-.15:e.key==='ArrowRight'?.15:0,e.key==='ArrowUp'?.1:e.key==='ArrowDown'?-.1:0);
 }
});
$('#export-button').addEventListener('click',async()=>{if(!ready)return;const b=$('#export-button');b.disabled=true;b.setAttribute('aria-busy','true');try{persist();const data=await engine.exportPng();if(!data?.startsWith('data:image/png'))throw Error('No PNG');const a=document.createElement('a');a.href=data;a.download='我的3D圣诞树-圣诞之夜.png';document.body.append(a);a.click();a.remove();toast('这份闪闪发光的心意，已经存成图片。');}catch{toast('图片暂时没能生成，你的装扮仍然保留着。');}finally{b.disabled=false;b.removeAttribute('aria-busy');}});
window.addEventListener('pagehide',persist);document.addEventListener('visibilitychange',()=>{if(document.hidden){persist();if(trayDrag)finishTray({pointerId:trayDrag.id},true);}});
function fail(error){ready=false;$('#loading').hidden=true;$('#scene-error').hidden=false;$('#export-button').disabled=true;$$('.decoration-dock button,.decoration-dock input,.inspector button,.inspector input,.view-controls button,.weather-controls button,#night-toggle,#snow-toggle').forEach(el=>el.disabled=true);console.error('3D scene initialization failed',error?.message||error);}
sync();if(!storageOK)$('#save-status').textContent='仅本次保留';
try{engine=new TreeEngine({canvas:$('#tree-canvas'),onSelect:id=>select(id),onDrop,onError:fail,onZoomChange:syncZoom});engine.setQuality(state.quality);await engine.init();engine.setReducedMotion(reducedMotion);engine.setOrnaments(state.ornaments);engine.setLights(state.lights);engine.setTopper(state.topper);engine.setNight(state.night);engine.setWeather(state.weather);ready=true;if(engine.winter&&!engine.winter.displayLoaded)toast('雪林背景暂时未能载入，刷新页面可以重试。');syncZoom(engine.getZoom());$('#loading').classList.add('done');setTimeout(()=>$('#loading').hidden=true,600);save();}catch(error){fail(error);}
