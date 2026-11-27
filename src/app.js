(function(){
 'use strict';
 const $=id=>document.getElementById(id),canvas=$('scene');let sim,renderer;
 try{sim=new FerroLab.Simulation(64);renderer=new FerroLab.Renderer(canvas,64);}catch(e){$('error').hidden=false;$('error').textContent='预览初始化失败：'+e.message;throw e;}
 const presets={
  rest:{mode:'surface',field:0},onset:{mode:'surface',field:15.4},peaks:{mode:'surface',field:17.4},
  labyrinth:{mode:'cell',field:15.2,fraction:.48,inclusion:false,amber:true},
  drops:{mode:'cell',field:15.2,fraction:.26,inclusion:false,amber:true},
  video:{mode:'cell',field:15.2,fraction:.49,inclusion:true,amber:true}
 };
 let paused=false,speed=1,last=0,accumulator=0,frames=0,fpsStart=0,audioLevel=0,audioEnabled=false,pausedByHost=false,audioBase=17.4,pointer=null,lastMetric=0;
 const units={field:['mT',1],viscosity:['mPa·s',0],sigma:['mN/m',0],depth:['mm',2],gap:['mm',2],fraction:['%',0],gradient:['',2],roughness:['',2],ior:['',2]};
 function sync(){const p=sim.params,cell=p.mode==='cell';for(const [key,[unit,digits]] of Object.entries(units)){const val=p[key];$(key).value=val;$(key+'Value').textContent=(key==='fraction'?val*100:val).toFixed(digits)+(unit?' '+unit:'');}
  $('surfaceSettings').hidden=cell;$('cellSettings').hidden=!cell;$('cellOptics').hidden=!cell;$('amber').checked=p.amber;$('inclusion').checked=p.inclusion;
  $('surfaceMode').classList.toggle('active',!cell);$('cellMode').classList.toggle('active',cell);$('sceneIndex').textContent=cell?'02 / CONFINED FILM':'01 / FREE SURFACE';$('sceneTitle').textContent=cell?'界面，自成秩序。':'让磁场显形。';$('sceneDescription').textContent=cell?'磁性液相 · 非磁性载液 · 非局域相互作用':'平静液面 → 失稳起峰 → 撤场回落';
  $('exposure').value=renderer.exposure;$('exposureValue').textContent=renderer.exposure.toFixed(2);$('modelStatus').textContent=cell?'守恒相场 · 薄腔 · 周期边界':'守恒自由液面 · 黏性降阶 · 周期边界';
 }
 function preset(name,warm=true){const patch=presets[name];Object.assign(sim.params,{gradient:0,viscosity:18,sigma:29,depth:.85,gap:.35,inclusion:false},patch);audioBase=sim.params.field;sim.reset();if(warm){const steps=patch.mode==='cell'?420:650;for(let i=0;i<steps;i++)sim.step(.12);}renderer.elevation=patch.mode==='cell'?1.17:.6;renderer.angle=.22;renderer.zoom=patch.mode==='cell'?1.25:1.4;document.querySelectorAll('[data-preset]').forEach(b=>b.classList.toggle('selected',b.dataset.preset===name));sync();renderer.draw(sim);}
 for(const key of Object.keys(units))$(key).addEventListener('input',()=>{sim.params[key]=Number($(key).value);if(key==='field')audioBase=sim.params.field;if(['fraction','depth'].includes(key))sim.reset();document.querySelectorAll('[data-preset]').forEach(b=>b.classList.remove('selected'));sync();});
 document.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>preset(b.dataset.preset)));
 $('surfaceMode').onclick=()=>preset('peaks');$('cellMode').onclick=()=>preset('labyrinth');
 $('removeField').onclick=()=>{sim.params.field=0;audioBase=0;audioEnabled=false;$('audio').checked=false;sync();};
 $('pause').onclick=()=>{paused=!paused;$('pause').textContent=paused?'继续':'暂停';};$('reset').onclick=()=>sim.reset();
 for(const key of ['amber','inclusion'])$(key).onchange=()=>sim.params[key]=$(key).checked;
 $('fieldOverlay').onchange=()=>renderer.showField=$('fieldOverlay').checked;
 $('exposure').oninput=()=>{renderer.exposure=Number($('exposure').value);$('exposureValue').textContent=renderer.exposure.toFixed(2);};
 $('quality').onchange=()=>renderer.quality=Number($('quality').value);$('speed').oninput=()=>{speed=Number($('speed').value);$('speedValue').textContent=speed+'×';};
 function clean(v){document.body.classList.toggle('clean',v);$('restore').hidden=!v;} $('clean').onclick=()=>clean(true);$('restore').onclick=()=>clean(false);document.addEventListener('keydown',e=>{if(e.key==='Escape')clean(false);});
 function save(blob,name){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 $('capture').onclick=()=>{renderer.draw(sim);canvas.toBlob(b=>save(b,'ferrofluid-'+sim.params.mode+'-'+Date.now()+'.png'));};
 $('exportState').onclick=()=>save(new Blob([JSON.stringify({params:sim.params,metrics:sim.metrics(),model:'reduced-model-v1',grid:sim.n},null,2)],{type:'application/json'}),'ferrofluid-experiment.json');
 function rayPoint(e){const r=canvas.getBoundingClientRect(),px=((e.clientX-r.left)/r.width*2-1)*(r.width/r.height),py=1-(e.clientY-r.top)/r.height*2;const a=renderer.angle,el=renderer.elevation,z=renderer.zoom;
  const ro=[Math.sin(a)*Math.cos(el)*z,Math.sin(el)*z+.02,Math.cos(a)*Math.cos(el)*z];const normalize=v=>{let l=Math.hypot(...v);return v.map(x=>x/l);},cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const f=normalize([-ro[0],.015-ro[1],-ro[2]]),right=normalize(cross(f,[0,1,0])),up=cross(right,f),rd=normalize(f.map((v,i)=>v*2.05+right[i]*px+up[i]*py)),t=(.02-ro[1])/rd[1];return [ro[0]+rd[0]*t,ro[2]+rd[2]*t];}
 canvas.oncontextmenu=e=>e.preventDefault();canvas.onpointerdown=e=>{canvas.setPointerCapture(e.pointerId);pointer={x:e.clientX,y:e.clientY,orbit:e.button===2||e.shiftKey};if(!pointer.orbit){const p=rayPoint(e);sim.magnet={active:true,x:p[0],z:p[1]};}};
 canvas.onpointermove=e=>{if(!pointer)return;if(pointer.orbit){renderer.angle-=(e.clientX-pointer.x)*.006;renderer.elevation=Math.max(.22,Math.min(1.5,renderer.elevation+(e.clientY-pointer.y)*.005));}else{const p=rayPoint(e);sim.magnet.x=Math.max(-.48,Math.min(.48,p[0]));sim.magnet.z=Math.max(-.48,Math.min(.48,p[1]));}pointer.x=e.clientX;pointer.y=e.clientY;};
 const release=()=>{sim.magnet.active=false;pointer=null;};canvas.onpointerup=release;canvas.onpointercancel=release;canvas.onlostpointercapture=release;window.addEventListener('blur',release);canvas.addEventListener('wheel',e=>{e.preventDefault();renderer.zoom=Math.max(.85,Math.min(2.7,renderer.zoom+e.deltaY*.001));},{passive:false});
 const reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)');paused=reduceMotion.matches;$('pause').textContent=paused?'继续':'暂停';
 if(typeof window.wallpaperRegisterAudioListener==='function'){window.wallpaperRegisterAudioListener(data=>{let sum=0;for(let i=0;i<12;i++)sum+=Math.max(0,data[i]||0);audioLevel=Math.min(1,sum/12);});$('audioNote').textContent='低频能量平滑后作用于磁场，不随机移动物体。';}
 $('audio').onchange=()=>{audioEnabled=$('audio').checked;audioBase=sim.params.field;if(typeof window.wallpaperRegisterAudioListener!=='function'){audioEnabled=false;$('audio').checked=false;$('audioNote').textContent='当前浏览器没有 Wallpaper Engine 音频接口。';}};
 window.wallpaperPropertyListener={applyUserProperties(props){if(props.field)sim.params.field=Number(props.field.value);if(props.viscosity)sim.params.viscosity=Number(props.viscosity.value);if(props.mode)preset(Number(props.mode.value)===1?'labyrinth':'peaks');if(props.clean)clean(!!props.clean.value);if(props.audio){audioEnabled=!!props.audio.value;$('audio').checked=audioEnabled;}if(props.quality)renderer.quality=Number(props.quality.value);audioBase=sim.params.field;sync();},setPaused(value){pausedByHost=!!value;last=0;accumulator=0;}};
 function updateMetrics(now){if(now-lastMetric<300)return;lastMetric=now;const m=sim.metrics();$('mass').textContent=m.massError.toExponential(1);$('simTime').textContent=m.time.toFixed(2)+(sim.params.mode==='surface'?' s':' 相场时间');$('amplitude').textContent=sim.params.mode==='surface'?(m.rms*m.lc*1000).toFixed(3)+' mm':m.rms.toFixed(3);$('capillary').textContent=m.capillaryLengthMm.toFixed(2)+' mm';if(m.projection>.0002)$('modelStatus').textContent='强非线性：限幅修正已激活，形状仅作定性参考';}
 function frame(now){requestAnimationFrame(frame);const dt=last?Math.min((now-last)/1000,.05):0;last=now;if(document.hidden||pausedByHost){accumulator=0;return;}if(!paused){accumulator+=dt*speed;let loops=0;try{while(accumulator>=1/120&&loops<12){if(audioEnabled){const target=Math.min(20,audioBase*(.65+.35*audioLevel));sim.params.field+=(target-sim.params.field)*(1-Math.exp(-1/120/.12));}for(let j=0;j<3;j++)sim.step(.08);accumulator-=1/120;loops++;}if(loops===12)accumulator=0;}catch(e){paused=true;sim.failed=true;$('error').hidden=false;$('error').textContent='数值状态异常，模拟已暂停。请重新实验。';console.error(e);}}
  renderer.draw(sim);updateMetrics(now);frames++;if(now-fpsStart>=1000){$('fps').textContent=Math.round(frames*1000/(now-fpsStart))+' FPS';frames=0;fpsStart=now;}}
 // Reproducible programmatic interface for checks and the user's AI events.
 window.ferroApp={sim,renderer,preset,setPaused:v=>paused=!!v,step:(count,dt=.08)=>{for(let i=0;i<count;i++)sim.step(dt);renderer.draw(sim);return sim.metrics();},setInput(level,x=0,z=0){sim.params.field=Math.max(0,Math.min(20,20*Number(level||0)));sim.magnet={active:level>0,x:Math.max(-.48,Math.min(.48,x)),z:Math.max(-.48,Math.min(.48,z))};sync();}};
 const query=new URLSearchParams(location.search),name=query.get('preset');preset(presets[name]?name:'peaks',query.get('warm')!=='0');if(query.get('paused')==='1'){paused=true;$('pause').textContent='继续';}if(query.get('clean')==='1')clean(true);requestAnimationFrame(frame);
})();
