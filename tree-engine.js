import * as THREE from './vendor/three.module.js';
import { WinterEnvironment } from './winter-environment.js?v=contact-depth-20261115';
import { GROUND_Y, POT_HEIGHT, POT_BOTTOM_RADIUS, POT_TOP_RADIUS } from './scene-ground.js?v=contact-depth-20261115';
import { MOTION_TIMING, placementScale, placementSwing, cinematicProgress, cameraArc, dampedInertia, damp } from './motion-curves.js?v=contact-depth-20261115';

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const TAU=Math.PI*2;
const wrapAngle=value=>Math.atan2(Math.sin(value),Math.cos(value));
const UP=new THREE.Vector3(0,1,0);
const LIGHT_COLORS={warm:[0xffd080,0xffe5ac,0xffb863],candy:[0xff5c50,0xa8ef8e,0xffcd5f,0x86baff],ice:[0xc1e9ff,0xa7c6ff,0xfff1df]};
function rng(seed=1225){return()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};}
function mat(color,metal=.0,rough=.7){return new THREE.MeshStandardMaterial({color,metalness:metal,roughness:rough});}
function mesh(g,m){return new THREE.Mesh(g,m);}
function linkCylinder(a,b,r,material){const d=new THREE.Vector3().subVectors(b,a),m=mesh(new THREE.CylinderGeometry(r*.7,r,d.length(),6),material);m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(UP,d.normalize());return m;}
function shapeStar(){const s=new THREE.Shape();for(let i=0;i<10;i++){const a=Math.PI/2+i*Math.PI/5,r=i%2?.077:.18;const x=Math.cos(a)*r,y=Math.sin(a)*r;i?s.lineTo(x,y):s.moveTo(x,y);}s.closePath();return s;}
function shapeHeart(){const s=new THREE.Shape();s.moveTo(0,-.18);s.bezierCurveTo(-.10,-.10,-.24,.015,-.16,.12);s.bezierCurveTo(-.10,.21,-.015,.16,0,.095);s.bezierCurveTo(.02,.16,.11,.21,.17,.12);s.bezierCurveTo(.24,.015,.1,-.1,0,-.18);return s;}
function extrude(shape,depth=.045){const g=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.012,bevelThickness:.012,curveSegments:12});g.translate(0,0,-depth/2);return g;}
function makeGlowTexture(star=false){const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');const g=ctx.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,'rgba(255,246,212,1)');g.addColorStop(.12,'rgba(255,224,163,.95)');g.addColorStop(.35,'rgba(255,196,114,.24)');g.addColorStop(1,'rgba(255,186,93,0)');ctx.fillStyle=g;ctx.fillRect(0,0,128,128);if(star){ctx.fillStyle='rgba(255,249,229,.9)';ctx.beginPath();ctx.moveTo(64,9);ctx.quadraticCurveTo(69,59,116,64);ctx.quadraticCurveTo(69,69,64,119);ctx.quadraticCurveTo(59,69,12,64);ctx.quadraticCurveTo(59,59,64,9);ctx.fill();}const t=new THREE.CanvasTexture(c);return t;}
function mergeOrnamentMeshes(group){
 const buckets=new Map(),original=[];group.updateMatrixWorld(true);
 group.traverse(object=>{if(!object.isMesh||Array.isArray(object.material))return;const geometry=object.geometry.clone().applyMatrix4(object.matrixWorld);const entries=buckets.get(object.material)||[];entries.push(geometry);buckets.set(object.material,entries);original.push(object.geometry);});
 group.clear();
 for(const[material,geometries]of buckets){
  const vertexCount=geometries.reduce((n,g)=>n+g.getAttribute('position').count,0),indexCount=geometries.reduce((n,g)=>n+(g.index?.count||g.getAttribute('position').count),0);
  const positions=new Float32Array(vertexCount*3),normals=new Float32Array(vertexCount*3),uvs=new Float32Array(vertexCount*2),indices=new Uint32Array(indexCount);let vertexOffset=0,indexOffset=0;
  for(const g of geometries){const position=g.getAttribute('position'),normal=g.getAttribute('normal'),uv=g.getAttribute('uv');positions.set(position.array,vertexOffset*3);if(normal)normals.set(normal.array,vertexOffset*3);if(uv)uvs.set(uv.array,vertexOffset*2);for(let i=0;i<(g.index?.count||position.count);i++)indices[indexOffset++]=(g.index?g.index.getX(i):i)+vertexOffset;vertexOffset+=position.count;g.dispose();}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.BufferAttribute(normals,3));geometry.setAttribute('uv',new THREE.BufferAttribute(uvs,2));geometry.setIndex(new THREE.BufferAttribute(indices,1));geometry.computeBoundingSphere();group.add(mesh(geometry,material));
 }
 for(const g of original)g.dispose();return group;
}
function basketTexture(){const c=document.createElement('canvas');c.width=c.height=512;const x=c.getContext('2d');x.fillStyle='#88623c';x.fillRect(0,0,512,512);const r=rng(99);for(let row=0;row<40;row++){for(let col=0;col<32;col++){const y=row*13,xx=col*17+(row%2?8:0);x.fillStyle=`hsl(34 ${30+r()*18}% ${26+r()*20}%)`;x.fillRect(xx,y,15,10);x.fillStyle='rgba(242,205,141,.18)';x.fillRect(xx,y,14,2);x.fillStyle='rgba(31,22,10,.36)';x.fillRect(xx+14,y,2,11);}}const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(3,1.4);return t;}

export class TreeEngine{
 constructor({canvas,onSelect=()=>{},onDrop=()=>{},onReady=()=>{},onError=()=>{},onZoomChange=()=>{}}){Object.assign(this,{canvas,onSelect,onDrop,onReady,onError,onZoomChange});this.items=new Map();this.sparks=[];this.settings={on:true,color:'warm',mode:'twinkle',brightness:85};this.night=true;this.snowOn=true;this.reduced=false;this.selected=null;this.disposed=false;this.pointer=null;this.lastPointer=null;this.cameraYaw=0;this.cameraDistance=9.1;this.zoomRatio=1;this.viewTarget=new THREE.Vector3(0,2.8,0);this.viewPitch=Math.atan2(.32,9.1);this.cameraMotion=null;this.touchPoints=new Map();this.pinch=null;this.gestureWasPinch=false;this.qualityMode='high';this.performanceLevel=2;this.viewRoll=0;this.performanceEMA=16.7;this.slowFrames=0;this.fastFrames=0;this.lastQualityChange=0;this.hoverPending=null;this.lastHover=0;this.orbitInertia=null;this.scratch=new THREE.Vector3();this.treeCenter=new THREE.Vector3(0,2.7,0);this.bound=[];this.clock=new THREE.Clock();}
 async init(){try{
  this.renderer=new THREE.WebGLRenderer({canvas:this.canvas,antialias:true,alpha:false,preserveDrawingBuffer:false,powerPreference:'high-performance'});this.maxDpr=Math.max(1.5,Math.min(window.devicePixelRatio||1,2));this.currentDpr=this.maxDpr;this.renderer.setPixelRatio(this.currentDpr);this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.12;this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFShadowMap;this.renderer.shadowMap.autoUpdate=false;this.renderer.shadowMap.needsUpdate=true;
  this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#111b16');this.scene.fog=new THREE.FogExp2('#111b16',.043);
  this.sceneFraming=true;this.camera=new THREE.PerspectiveCamera(40,1,.1,100);this.cameraTarget=new THREE.Vector3(0,2.8,0);this.raycaster=new THREE.Raycaster();this.pointerNdc=new THREE.Vector2();
  this.glowTexture=makeGlowTexture();this.sparkTexture=makeGlowTexture(true);
  this.world=new THREE.Group();this.scene.add(this.world);
  this.hemi=new THREE.HemisphereLight(0xe0eddf,0x6a4222,1.6);this.scene.add(this.hemi);
  this.key=new THREE.DirectionalLight(0xffe5bb,3.9);this.key.position.set(-3.5,7,5);this.key.castShadow=true;Object.assign(this.key.shadow.camera,{left:-4,right:4,top:7,bottom:-2,near:.1,far:18});this.key.shadow.mapSize.set(1024,1024);this.key.shadow.bias=-.0002;this.key.shadow.normalBias=.006;this.key.shadow.radius=4;this.scene.add(this.key);
  this.rim=new THREE.DirectionalLight(0xb4d5c4,2.5);this.rim.position.set(4,4,-3);this.scene.add(this.rim);
  this.warm=new THREE.PointLight(0xffbc6b,13,12,2);this.warm.position.set(-3,2.4,2);this.scene.add(this.warm);
  this.buildFloor();this.buildTree();this.buildLights();this.setTopper('star');
  this.winter=new WinterEnvironment({scene:this.scene,renderer:this.renderer,camera:this.camera,floor:this.floor,reducedMotion:this.reduced});await this.winter.init();if(!this.winter.hdrLoaded&&this.winter.fallbackSky){const pmrem=new THREE.PMREMGenerator(this.renderer);this.env=pmrem.fromEquirectangular(this.winter.fallbackSky);this.scene.environment=this.env.texture;pmrem.dispose();}
  this.pickTree=mesh(new THREE.LatheGeometry(Array.from({length:30},(_,i)=>{const y=.88+i/29*4.32;return new THREE.Vector2(this.treeRadius(y)+.24,y);}),48),new THREE.MeshBasicMaterial({visible:false,side:THREE.DoubleSide}));this.scene.add(this.pickTree);
  this.bindPointers();this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(this.canvas);this.resize();this.applyRoom();this.applyPerformanceQuality();this.tick();this.onReady();return this;
 }catch(error){this.onError(error);throw error;}}
 treeRadius(y){const t=clamp((y-.86)/4.4,0,1);return .055+1.72*Math.pow(1-t,.84);}
 buildFloor(){
  const floorMat=mat('#27281d',.12,.82);this.floor=mesh(new THREE.PlaneGeometry(100,100),floorMat);this.floor.rotation.x=-Math.PI/2;this.floor.receiveShadow=true;this.scene.add(this.floor);
  const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d');const g=ctx.createRadialGradient(128,128,0,128,128,128);g.addColorStop(0,'rgba(0,0,0,.72)');g.addColorStop(.60,'rgba(0,0,0,.62)');g.addColorStop(.68,'rgba(0,0,0,.40)');g.addColorStop(.82,'rgba(0,0,0,.09)');g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(0,0,256,256);const contact=mesh(new THREE.PlaneGeometry(1.15,1.15),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c),transparent:true,depthWrite:false,toneMapped:false,fog:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}));contact.rotation.x=-Math.PI/2;contact.position.y=GROUND_Y;contact.renderOrder=-1700;contact.name='Planter contact shadow';this.contactShadow=contact;this.scene.add(contact);
  // A closed solid base rests exactly on the same physical plane as the snow.
  const basketSide=new THREE.MeshStandardMaterial({map:basketTexture(),roughness:.96,color:0xbfa278}),soil=mat('#352c1e',0,1),base=mat('#765435',0,.98);
  const basket=mesh(new THREE.CylinderGeometry(POT_TOP_RADIUS,POT_BOTTOM_RADIUS,POT_HEIGHT,64,1,false),[basketSide,soil,base]);
  basket.position.y=GROUND_Y+POT_HEIGHT/2;basket.castShadow=basket.receiveShadow=true;basket.name='Closed planter resting on snow';this.planter=basket;this.world.add(basket);
  for(const band of[{y:GROUND_Y+.022,r:POT_BOTTOM_RADIUS},{y:GROUND_Y+POT_HEIGHT-.045,r:POT_TOP_RADIUS-.012},{y:GROUND_Y+POT_HEIGHT,r:POT_TOP_RADIUS}]){
   const rim=mesh(new THREE.TorusGeometry(band.r,.022,8,64),mat('#8d673e',0,.88));rim.rotation.x=Math.PI/2;rim.position.y=band.y;rim.name='Planter rim';this.world.add(rim);
  }
  const trunk=mesh(new THREE.CylinderGeometry(.035,.12,4.75,12),mat('#695031',0,.96));trunk.position.y=2.8;trunk.castShadow=true;this.world.add(trunk);
 }
 buildTree(){
  const random=rng(1225);const foliage=[];const branches=[];const tmp=new THREE.Object3D();
  const needle=(p,d,length,tint)=>{foliage.push({p,d,length,tint});};
  for(let level=0;level<24;level++){
   const t=level/24,y=.84+t*4.45,rad=this.treeRadius(y),count=Math.round(13-8*t),turn=level*2.399;
   for(let j=0;j<count;j++){
    const a=turn+j/count*TAU+(random()-.5)*.22,span=rad*(.86+random()*.15),base=new THREE.Vector3(0,y+(random()-.5)*.09,0),direction=new THREE.Vector3(Math.sin(a),0,Math.cos(a));
    const end=new THREE.Vector3().copy(direction).multiplyScalar(span);end.y=y-.15*(1-t)+.045;
    branches.push([base,end,.018*(1-t)+.005]);
    const stations=7+Math.floor((1-t)*5);
    for(let k=1;k<=stations;k++){
     const u=k/stations;const center=base.clone().lerp(end,u);center.y+=Math.sin(u*Math.PI)*.09;
     for(const side of [-1,1]){
      const twiga=a+side*(.48+random()*.42),twigLength=(.1+(1-u)*.23)*(1-t*.65),twigDir=new THREE.Vector3(Math.sin(twiga),.2+random()*.25,Math.cos(twiga));
      const twigEnd=center.clone().addScaledVector(twigDir,twigLength);branches.push([center,twigEnd,.0035]);
      for(let n=0;n<4;n++){
       const v=n/3,p=center.clone().lerp(twigEnd,v);
       for(let ring=0;ring<4;ring++){
        const angle=twiga+(ring-1.5)*.8+(random()-.5)*.25;const d=new THREE.Vector3(Math.sin(angle),.25+random()*.95,Math.cos(angle)).normalize();
        const len=(.09+random()*.09)*(1-t*.25);needle(p.clone(),d,len,random());
       }
      }
     }
     for(let n=0;n<4;n++){const d=new THREE.Vector3(Math.sin(a+(random()-.5)*1.8),.3+random()*.7,Math.cos(a+(random()-.5)*1.8)).normalize();needle(center.clone(),d,.1+random()*.06,random());}
    }
   }
  }
  const shuffle=rng(7381);for(let i=foliage.length-1;i>0;i--){const j=Math.floor(shuffle()*(i+1));[foliage[i],foliage[j]]=[foliage[j],foliage[i]];}foliage.length=Math.min(42000,foliage.length);this.needleCapacity=foliage.length;
  // Four faceted triangles retain volume while reducing the full tree vertex work.
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([-.045,0,0,.045,0,0,0,1,.018,0,.45,.035],3));geometry.setIndex([0,1,3,1,2,3,2,0,3,0,2,1]);geometry.computeVertexNormals();
  const material=new THREE.MeshLambertMaterial({color:0xffffff,side:THREE.DoubleSide});this.needles=new THREE.InstancedMesh(geometry,material,foliage.length);this.needles.castShadow=true;this.needles.receiveShadow=false;
  const greens=[new THREE.Color('#1e4b31'),new THREE.Color('#285a39'),new THREE.Color('#396848'),new THREE.Color('#204832'),new THREE.Color('#4b7450')];
  foliage.forEach((n,i)=>{tmp.position.copy(n.p);tmp.quaternion.setFromUnitVectors(UP,n.d);tmp.scale.set(n.length,n.length,n.length);tmp.updateMatrix();this.needles.setMatrixAt(i,tmp.matrix);this.needles.setColorAt(i,greens[Math.floor(n.tint*greens.length)]);});this.needles.instanceMatrix.needsUpdate=true;this.needles.instanceColor.needsUpdate=true;this.needles.computeBoundingSphere();this.world.add(this.needles);this.updateTreeLOD();
  const twigMesh=new THREE.InstancedMesh(new THREE.CylinderGeometry(1,1,1,5),mat('#425034',0,.99),branches.length);branches.forEach(([a,b,r],i)=>{const d=new THREE.Vector3().subVectors(b,a);tmp.position.copy(a).add(b).multiplyScalar(.5);tmp.quaternion.setFromUnitVectors(UP,d.clone().normalize());tmp.scale.set(r,d.length(),r);tmp.updateMatrix();twigMesh.setMatrixAt(i,tmp.matrix);});twigMesh.instanceMatrix.needsUpdate=true;this.world.add(twigMesh);
 }
 buildLights(){
  const points=[];for(let i=0;i<=500;i++){const t=i/500,y=1.04+t*4.02,a=t*TAU*6.1+.3,r=this.treeRadius(y)+.11;points.push(new THREE.Vector3(Math.sin(a)*r,y,Math.cos(a)*r));}
  const curve=new THREE.CatmullRomCurve3(points);this.wire=mesh(new THREE.TubeGeometry(curve,580,.006,4,false),mat('#8b7945',.64,.43));this.world.add(this.wire);
  const count=132,tmp=new THREE.Object3D(),g=new THREE.SphereGeometry(.022,7,6);this.lamps=new THREE.InstancedMesh(g,new THREE.MeshStandardMaterial({color:0xffffff,emissive:0xffcd70,emissiveIntensity:2.3,roughness:.27}),count);this.bulbPositions=[];const pos=[],colors=[],phases=[];
  for(let i=0;i<count;i++){const p=curve.getPointAt((i+.5)/count);this.bulbPositions.push(p);tmp.position.copy(p);tmp.scale.setScalar(1);tmp.rotation.set(0,0,0);tmp.updateMatrix();this.lamps.setMatrixAt(i,tmp.matrix);this.lamps.setColorAt(i,new THREE.Color(LIGHT_COLORS.warm[i%3]));pos.push(p.x,p.y,p.z);const c=new THREE.Color(LIGHT_COLORS.warm[i%3]);colors.push(c.r,c.g,c.b);phases.push(i*.73);}
  this.world.add(this.lamps);const glowGeo=new THREE.BufferGeometry();glowGeo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));glowGeo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));glowGeo.setAttribute('phase',new THREE.Float32BufferAttribute(phases,1));
  this.lampGlow=new THREE.Points(glowGeo,new THREE.ShaderMaterial({uniforms:{map:{value:this.glowTexture},time:{value:0},opacity:{value:.8},mode:{value:2},pointScale:{value:380}},vertexShader:'attribute float phase; varying vec3 vColor; varying float vPulse; uniform float time; uniform float mode; uniform float pointScale; void main(){vColor=color;vPulse=mode<0.5?1.0:(mode<1.5?.65+.35*sin(time*1.5):.68+.32*sin(time*1.9+phase));vec4 mv=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mv;gl_PointSize=pointScale*.20/-mv.z;}',fragmentShader:'uniform sampler2D map;uniform float opacity;varying vec3 vColor;varying float vPulse;void main(){vec4 t=texture2D(map,gl_PointCoord);gl_FragColor=vec4(t.rgb*vColor,t.a*opacity*vPulse);}',transparent:true,depthWrite:false,vertexColors:true,blending:THREE.AdditiveBlending}));this.world.add(this.lampGlow);
 }
 buildSnow(){const r=rng(66),data=[];for(let i=0;i<180;i++)data.push((r()-.5)*9,r()*8,(r()-.5)*7);const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(data,3));this.snow=new THREE.Points(g,new THREE.PointsMaterial({color:0xf2efdf,size:.017,transparent:true,opacity:.38,depthWrite:false}));this.scene.add(this.snow);}
 addAtmosphere(){const r=rng(339),p=[],c=[];for(let i=0;i<32;i++){p.push((r()-.5)*15,.7+r()*7,-5-r()*3);const color=new THREE.Color(i%3?0xf4bc6c:0xd3dab5);c.push(color.r,color.g,color.b);}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('color',new THREE.Float32BufferAttribute(c,3));const bokeh=new THREE.Points(g,new THREE.PointsMaterial({map:this.glowTexture,size:.32,vertexColors:true,transparent:true,opacity:.16,blending:THREE.AdditiveBlending,depthWrite:false}));this.scene.add(bokeh);}
 materialFor(item){return item.type==='bauble'?new THREE.MeshPhysicalMaterial({color:item.color||'#b54d43',metalness:.58,roughness:.14,clearcoat:.7,clearcoatRoughness:.1}):new THREE.MeshStandardMaterial({color:item.color||'#b54d43',metalness:item.type==='bell'||item.type==='star'?.85:.12,roughness:item.type==='bow'?.61:.3});}
 ornamentModel(item){
  const group=new THREE.Group(),material=this.materialFor(item),gold=this.goldMaterial||(this.goldMaterial=new THREE.MeshStandardMaterial({color:0xd7b56a,metalness:.88,roughness:.25}));gold.userData.persistent=true;group.userData.colorMaterials=[material];
  if(item.type==='bauble'){
   const ball=mesh(new THREE.SphereGeometry(.155,24,16),material);group.add(ball);
   const stripe=mesh(new THREE.TorusGeometry(.154,.004,5,32),gold);stripe.rotation.x=Math.PI/2;stripe.position.y=-.02;group.add(stripe);
  }else if(item.type==='bell'){
   const profile=[[.04,.16],[.07,.13],[.085,.07],[.09,-.05],[.13,-.12],[.17,-.145],[.17,-.16]];group.add(mesh(new THREE.LatheGeometry(profile.map(a=>new THREE.Vector2(...a)),24),material));const rim=mesh(new THREE.TorusGeometry(.169,.009,8,32),gold);rim.rotation.x=Math.PI/2;rim.position.y=-.15;group.add(rim);const clapper=mesh(new THREE.SphereGeometry(.037,12,10),gold);clapper.position.y=-.18;group.add(clapper);
  }else if(item.type==='star'){group.add(mesh(extrude(shapeStar(),.055),material));
  }else if(item.type==='heart'){group.add(mesh(extrude(shapeHeart(),.06),material));
  }else if(item.type==='bow'){
   for(const side of [-1,1]){const loop=new THREE.Shape();loop.moveTo(0,0);loop.bezierCurveTo(side*.27,.28,side*.31,-.13,side*.13,-.09);loop.quadraticCurveTo(side*.08,-.07,0,0);const ribbon=mesh(extrude(loop,.025),material);ribbon.rotation.y=side*.17;group.add(ribbon);const tail=new THREE.Shape();tail.moveTo(side*.025,-.015);tail.lineTo(side*.14,-.23);tail.lineTo(side*.055,-.20);tail.lineTo(side*.035,-.25);tail.lineTo(side*.005,-.025);group.add(mesh(extrude(tail,.018),material));}group.add(mesh(new THREE.SphereGeometry(.049,16,12),material));
  }else if(item.type==='candy'){
   const p=[];for(let i=0;i<=15;i++)p.push(new THREE.Vector3(.065,-.21+i/15*.31,0));for(let i=1;i<=24;i++){const a=i/24*Math.PI;p.push(new THREE.Vector3(-.015+Math.cos(a)*.08,.10+Math.sin(a)*.08,0));}
   const c=document.createElement('canvas');c.width=256;c.height=32;const ctx=c.getContext('2d');ctx.fillStyle='#fff4d9';ctx.fillRect(0,0,256,32);ctx.fillStyle=item.color;for(let i=-32;i<290;i+=37){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i+16,0);ctx.lineTo(i+32,32);ctx.lineTo(i+16,32);ctx.fill();}const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;const candyMaterial=new THREE.MeshPhysicalMaterial({map:tex,roughness:.23,clearcoat:1});group.userData.candyMaterial=candyMaterial;group.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(p),64,.029,10,false),candyMaterial));
  }else if(item.type==='snowflake'){
   for(let i=0;i<6;i++){const a=i/6*TAU,d=new THREE.Vector3(Math.sin(a),Math.cos(a),0),end=d.clone().multiplyScalar(.19);group.add(linkCylinder(new THREE.Vector3(),end,.009,material));for(const side of [-1,1]){const mid=d.clone().multiplyScalar(.11),tip=mid.clone().add(new THREE.Vector3(Math.sin(a+side*.75),Math.cos(a+side*.75),0).multiplyScalar(.065));group.add(linkCylinder(mid,tip,.007,material));}}group.add(mesh(new THREE.SphereGeometry(.028,12,10),gold));
  }else if(item.type==='ginger'){
   const cookie=mat('#b37a42',0,.9);const dough=new THREE.Group();const body=mesh(new THREE.SphereGeometry(.085,16,12),cookie);body.scale.set(.9,1.45,.4);body.position.y=-.035;dough.add(body);const head=mesh(new THREE.SphereGeometry(.084,16,12),cookie);head.scale.z=.44;head.position.y=.13;dough.add(head);for(const side of [-1,1]){const arm=linkCylinder(new THREE.Vector3(side*.04,.015,0),new THREE.Vector3(side*.16,.055,0),.035,cookie);dough.add(arm);dough.add(linkCylinder(new THREE.Vector3(side*.035,-.1,0),new THREE.Vector3(side*.1,-.215,0),.037,cookie));}const icing=mat('#fff1d3',0,.6);for(const side of [-1,1]){const eye=mesh(new THREE.SphereGeometry(.009,8,6),mat('#422b1b',0,.7));eye.position.set(side*.028,.145,.036);dough.add(eye);}for(const y of [-.01,-.065]){const button=mesh(new THREE.SphereGeometry(.015,10,8),material);button.position.set(0,y,.035);dough.add(button);}const smileCurve=new THREE.QuadraticBezierCurve3(new THREE.Vector3(-.033,.105,.038),new THREE.Vector3(0,.07,.045),new THREE.Vector3(.033,.105,.038));dough.add(mesh(new THREE.TubeGeometry(smileCurve,12,.006,6,false),icing));group.add(dough);
  }else group.add(mesh(new THREE.SphereGeometry(.155,24,16),material));
  // Cache the visible body separately from its thin hanging hardware. Camera safety
  // can use these local-space bounds without traversing every ornament each frame.
  group.updateMatrixWorld(true);const bodyBounds=new THREE.Box3().setFromObject(group);
  group.userData.bodyBounds=bodyBounds.clone();this.ornamentBodyProfiles||=new Map();
  if(!this.ornamentBodyProfiles.has(item.type))this.ornamentBodyProfiles.set(item.type,bodyBounds.clone());
  const cap=mesh(new THREE.CylinderGeometry(.035,.041,.028,12),gold);cap.position.y=.17;group.add(cap);const hook=mesh(new THREE.TorusGeometry(.027,.004,6,16),gold);hook.position.y=.205;group.add(hook);const thread=linkCylinder(new THREE.Vector3(0,.23,0),new THREE.Vector3(0,.34,0),.0025,gold);group.add(thread);
  mergeOrnamentMeshes(group);group.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=false;}});return group;
 }
 angleFor(item){return Number.isFinite(item.angle)?wrapAngle(item.angle):Math.asin(clamp(Number(item.x)||0,-1,1)*.995);}
 positionFor(item){const y=.95+clamp(Number(item.y),0,1)*4.08,r=this.treeRadius(y)+.24,angle=this.angleFor(item);return new THREE.Vector3(Math.sin(angle)*r,y,Math.cos(angle)*r);}
 orientOrnament(root,item){root.rotation.set(0,this.angleFor(item),(item.rotation||0)*Math.PI/180,'YXZ');}
 getOrnamentCollisionBounds(itemOrId,{animated=true}={}){
  const entry=typeof itemOrId==='string'?this.items.get(itemOrId):this.items.get(itemOrId?.id);
  const item=entry?.item||(typeof itemOrId==='object'?itemOrId:null);if(!item)return null;
  const box=entry?.model?.userData?.bodyBounds||this.ornamentBodyProfiles?.get(item.type);if(!box||box.isEmpty())return null;
  const anchor=entry?entry.root.position.clone():this.positionFor(item),scale=entry?.scale||clamp((item.size||42)/42,.6,1.65);
  const rotation=entry?entry.root.quaternion:new THREE.Quaternion().setFromEuler(new THREE.Euler(0,this.angleFor(item),(item.rotation||0)*Math.PI/180,'YXZ'));
  const modelPosition=entry?.model?.position||new THREE.Vector3(0,-.23,0),bodyCenter=box.getCenter(new THREE.Vector3());
  const center=bodyCenter.clone().add(modelPosition).multiplyScalar(scale).applyQuaternion(rotation).add(anchor);
  const scales=animated?[scale*.28,scale*1.21]:[entry?.root.scale.x||scale],swings=animated?[-.22,0,.22]:[entry?.model.rotation.z||0];
  let radius=0,bodyMinY=Infinity,bodyMaxY=-Infinity;const point=new THREE.Vector3(),axis=new THREE.Vector3(0,0,1);
  for(const size of scales)for(const swing of swings)for(let corner=0;corner<8;corner++){
   point.set(corner&1?box.max.x:box.min.x,corner&2?box.max.y:box.min.y,corner&4?box.max.z:box.min.z);
   point.applyAxisAngle(axis,swing).add(modelPosition).multiplyScalar(size).applyQuaternion(rotation).add(anchor);
   radius=Math.max(radius,point.distanceTo(center));bodyMinY=Math.min(bodyMinY,point.y);bodyMaxY=Math.max(bodyMaxY,point.y);
  }
  return{center,radius:radius+.012,anchor,bodyMinY,bodyMaxY};
 }

 invalidateShadow(){if(this.renderer)this.renderer.shadowMap.needsUpdate=true;}
 setOrnaments(items=[]){const keep=new Set(items.map(x=>x.id));for(const id of this.items.keys())if(!keep.has(id))this.removeOrnament(id);for(const item of items)this.items.has(item.id)?this.updateOrnament(item):this.addOrnament(item,{animate:false});}
 addOrnament(item,{animate=true}={}){if(this.items.has(item.id)){this.updateOrnament(item);return;}const root=new THREE.Group(),model=this.ornamentModel(item);model.position.y=-.23;root.add(model);root.position.copy(this.positionFor(item));const hit=mesh(new THREE.SphereGeometry(.235,10,8),new THREE.MeshBasicMaterial({visible:false}));hit.position.y=-.23;hit.userData.ornamentId=item.id;root.add(hit);this.world.add(root);const entry={item:{...item},root,model,hit,scale:clamp((item.size||42)/42,.6,1.65),birth:animate?performance.now():-1,swing:animate?performance.now():-1,lastScale:animate&&!this.reduced?.08:clamp((item.size||42)/42,.6,1.65),lastSwing:0};this.items.set(item.id,entry);this.orientOrnament(root,item);root.scale.setScalar(animate&&!this.reduced?.28:entry.scale);if(animate&&!this.reduced){if(!this.focusOnOrnament(item.id,{placement:true}))this.spawnSpark(root.position.clone().add(new THREE.Vector3(0,-.18,.12).applyQuaternion(root.quaternion)));}}
 updateOrnament(item){const e=this.items.get(item.id);if(!e){this.addOrnament(item,{animate:false});return;}const rebuild=e.item.type!==item.type||(item.type==='candy'&&e.item.color!==item.color);if(rebuild){e.root.remove(e.model);this.disposeObject(e.model);e.model=this.ornamentModel(item);e.model.position.y=-.23;e.root.add(e.model);}else for(const m of e.model.userData.colorMaterials||[])m.color.set(item.color);e.item={...item};e.scale=clamp((item.size||42)/42,.6,1.65);e.root.position.copy(this.positionFor(item));this.orientOrnament(e.root,item);e.root.scale.setScalar(e.scale);e.lastScale=e.scale;e.lastSwing=e.model.rotation.z;}
 removeOrnament(id){if(this.cameraMotion?.kind==='focus'&&this.cameraMotion.id===id){const m=this.cameraMotion;this.cameraMotion={kind:'manual',start:performance.now(),duration:350,from:this.cameraPose(),to:m.returnPose};this.zoomRatio=m.baseView.zoom;this.cameraYaw=m.baseView.yaw;this.viewPitch=m.baseView.pitch;this.viewRoll=m.baseView.roll||0;this.viewTarget.copy(m.baseView.target);}const e=this.items.get(id);if(!e)return;this.world.remove(e.root);this.disposeObject(e.root);this.items.delete(id);if(this.selected===id)this.selected=null;}
 setSelected(id){this.selected=id;for(const [key,e]of this.items){if(e.selection)e.selection.visible=key===id;if(key===id&&!e.selection){const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:this.glowTexture,color:0xffd28b,transparent:true,opacity:.33,depthWrite:false,blending:THREE.AdditiveBlending}));sprite.scale.set(.66,.66,1);sprite.position.set(0,-.2,-.01);e.root.add(sprite);e.selection=sprite;}}}
 setLights(settings){this.settings={...this.settings,...settings};if(!this.lamps)return;const c=LIGHT_COLORS[this.settings.color]||LIGHT_COLORS.warm;this.lamps.visible=this.lampGlow.visible=!!this.settings.on;const attr=this.lampGlow.geometry.getAttribute('color');for(let i=0;i<this.bulbPositions.length;i++){const color=new THREE.Color(c[i%c.length]);this.lamps.setColorAt(i,color);attr.setXYZ(i,color.r,color.g,color.b);}this.lamps.instanceColor.needsUpdate=true;attr.needsUpdate=true;this.lampGlow.material.uniforms.opacity.value=clamp(this.settings.brightness/100,.1,1);this.lampGlow.material.uniforms.mode.value=this.reduced?0:({steady:0,breathe:1,twinkle:2}[this.settings.mode]??0);this.lamps.material.emissiveIntensity=this.settings.brightness/100*2.7;}
 setTopper(type){this.topperType=type;if(this.topper){this.world.remove(this.topper);this.disposeObject(this.topper);this.topper=null;}if(type==='none')return;const item={type:type==='snowflake'?'snowflake':type==='bow'?'bow':'star',color:type==='bow'?'#a23c32':type==='snowflake'?'#e6eaf0':'#e5b85f'};const group=this.ornamentModel(item);group.position.set(0,5.35,0);group.scale.setScalar(1.72);this.world.add(group);this.topper=group;group.traverse(o=>{if(o.isMesh)o.userData.topper=true;});const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:this.glowTexture,color:0xffc96c,transparent:true,opacity:.45,blending:THREE.AdditiveBlending,depthWrite:false}));glow.scale.set(1.05,1.05,1);glow.position.z=-.02;group.add(glow);this.topperGlow=glow;}
 setNight(value){this.night=!!value;if(this.scene)this.applyRoom();}
 applyRoom(){if(!this.scene)return;if(this.winter){this.hemi.color.set('#d8e9ff');this.hemi.groundColor.set('#9baebf');this.hemi.intensity=this.night?.85:1.5;this.key.color.set('#ffe5bb');this.key.intensity=this.night?2.5:3.3;this.rim.color.set('#b4d5f1');this.rim.intensity=this.night?1.8:2.2;this.warm.intensity=this.night?13:7;this.renderer.toneMappingExposure=this.night?1.05:1.12;this.winter.setNight(this.night);this.invalidateShadow();return;}const bg=this.night?'#111b16':'#51594b';this.scene.background.set(bg);this.scene.fog.color.set(bg);this.floor.material.color.set(this.night?'#27281d':'#747062');this.hemi.intensity=this.night?1.6:2.4;this.key.intensity=this.night?3.9:4.5;this.renderer.toneMappingExposure=this.night?1.12:1.2;}
 setWeather(mode){this.snowOn=mode!=='clear';this.winter?.setWeather(mode);if(!this.winter&&this.snow)this.snow.visible=this.snowOn&&!this.reduced;}
 setSnow(value){this.snowOn=!!value;if(this.winter)this.winter.setWeather(value?'snow':'clear');if(this.snow)this.snow.visible=this.snowOn&&!this.reduced;}
 setReducedMotion(value){this.reduced=!!value;if(this.reduced)this.stopOrbitInertia();this.winter?.setReducedMotion(this.reduced);if(this.reduced)this.cancelCameraMotion(true);if(this.snow)this.snow.visible=this.snowOn&&!this.reduced;this.setLights(this.settings);}
 getZoom(){return this.zoomRatio;}
 fitDistance(){return 9.1*Math.max(this.sceneFrameScale||1,.75/(this.camera?.aspect||1));}
 cameraPose(){return{position:this.camera.position.clone(),target:this.cameraTarget.clone(),up:new THREE.Vector3(0,1,0).applyQuaternion(this.camera.quaternion)};}
 cameraClearance(){const near=this.camera?.near||.1,tangent=Math.tan(THREE.MathUtils.degToRad(this.camera?.fov||40)/2),aspect=this.camera?.aspect||1;return Math.max(.2,near*Math.sqrt(1+tangent*tangent*(1+aspect*aspect))+.055);}
 cameraCollisionShapes(){
  const margin=this.cameraClearance(),key=[margin.toFixed(4),this.topperType||'star',...Array.from(this.items.values(),e=>[e.item.id,e.item.type,e.item.x,e.item.y,e.item.angle,e.item.size,e.item.rotation,e.root.position.x,e.root.position.y,e.root.position.z].join(':'))].join('|');
  if(this.cameraShapeCache?.key===key)return this.cameraShapeCache.shapes;
  const shape=(x,y,z,rx,ry,rz,name)=>({x,y,z,rx:rx+margin,ry:ry+margin,rz:rz+margin,name});
  const shapes=[shape(0,1.25,0,2.5,1,2.5,'lower branches'),shape(0,2.4,0,1.8,1.15,1.8,'middle branches'),shape(0,3.6,0,1.3,1.15,1.3,'upper branches'),shape(0,4.6,0,.75,.8,.75,'tree tip'),shape(0,.36,0,.7,.5,.7,'planter')];
  if(this.topperType!=='none')shapes.push(shape(0,5.5,0,.62,.65,.62,'topper'));
  for(const entry of this.items.values()){const b=this.getOrnamentCollisionBounds(entry.item.id);if(b)shapes.push(shape(b.center.x,b.center.y,b.center.z,b.radius,b.radius,b.radius,'ornament'));}
  this.cameraShapeCache={key,shapes};return shapes;
 }
 cameraRayInterval(target,dx,dy,dz,shape){
  const ox=(target.x-shape.x)/shape.rx,oy=(target.y-shape.y)/shape.ry,oz=(target.z-shape.z)/shape.rz,vx=dx/shape.rx,vy=dy/shape.ry,vz=dz/shape.rz,a=vx*vx+vy*vy+vz*vz,b=ox*vx+oy*vy+oz*vz,c=ox*ox+oy*oy+oz*oz-1,discriminant=b*b-a*c;
  if(discriminant<0||a<1e-12)return null;const root=Math.sqrt(discriminant);return{enter:(-b-root)/a,exit:(-b+root)/a};
 }
 cameraRayDistance(target,dx,dy,dz,distance,shapes=this.cameraCollisionShapes()){
  let safe=distance;const intervals=[];for(const shape of shapes){const interval=this.cameraRayInterval(target,dx,dy,dz,shape);if(interval&&interval.exit>0)intervals.push(interval);}
  for(let i=0;i<=intervals.length;i++){let changed=false;for(const interval of intervals){if(safe>=interval.enter-.0001&&safe<=interval.exit+.0001){const next=interval.exit+.002;if(next>safe+.0001){safe=next;changed=true;}}}if(!changed)break;}
  return safe;
 }
 cameraFloorPitch(yaw,distance,target=this.viewTarget,shapes=this.cameraCollisionShapes()){
  const floor=GROUND_Y+this.cameraClearance(),vertical=Math.max(.01,target.y-floor),sx=Math.sin(yaw),sz=Math.cos(yaw);
  const fits=pitch=>{const cp=Math.cos(pitch),sp=Math.sin(pitch),safe=this.cameraRayDistance(target,sx*cp,sp,sz*cp,distance,shapes);return sp>=0||safe<=vertical/-sp;};
  let blocked=-Math.PI/2+.00001,clear=0;if(fits(blocked))return blocked;for(let i=0;i<23;i++){const mid=(blocked+clear)/2;if(fits(mid))clear=mid;else blocked=mid;}return clear+.0001;
 }
 safePitch(value){
  if(!Number.isFinite(value))return this.viewPitch;const distance=this.fitDistance()/this.zoomRatio,shapes=this.cameraCollisionShapes(),turn=Math.round((this.viewPitch-Math.PI/2)/TAU),front=this.cameraFloorPitch(this.cameraYaw,distance,this.viewTarget,shapes),back=this.cameraFloorPitch(this.cameraYaw+Math.PI,distance,this.viewTarget,shapes);return clamp(value,front+turn*TAU,Math.PI-back+turn*TAU);
 }
 resolveCameraPosition(position,target){
  const offset=position.clone().sub(target),distance=offset.length();if(distance<1e-8)offset.set(0,0,1);else offset.multiplyScalar(1/distance);
  const shapes=this.cameraCollisionShapes(),floor=GROUND_Y+this.cameraClearance();let dx=offset.x,dy=offset.y,dz=offset.z,safe=this.cameraRayDistance(target,dx,dy,dz,Math.max(.25,distance),shapes);
  if(target.y+dy*safe<floor){const yaw=Math.atan2(dx,dz),pitch=this.cameraFloorPitch(yaw,Math.max(.25,distance),target,shapes),cp=Math.cos(pitch);dx=Math.sin(yaw)*cp;dy=Math.sin(pitch);dz=Math.cos(yaw)*cp;safe=this.cameraRayDistance(target,dx,dy,dz,Math.max(.25,distance),shapes);}
  return new THREE.Vector3(target.x+dx*safe,Math.max(floor,target.y+dy*safe),target.z+dz*safe);
 }
 isCameraClear(position){if(position.y<GROUND_Y+this.cameraClearance()-.0001)return false;for(const s of this.cameraCollisionShapes()){const x=(position.x-s.x)/s.rx,y=(position.y-s.y)/s.ry,z=(position.z-s.z)/s.rz;if(x*x+y*y+z*z<1-.0001)return false;}return true;}
 orbitUp(yaw,pitch,roll=0){const up=new THREE.Vector3(-Math.sin(yaw)*Math.sin(pitch),Math.cos(pitch),-Math.cos(yaw)*Math.sin(pitch));if(roll)up.multiplyScalar(Math.cos(roll)).addScaledVector(new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw)),Math.sin(roll));return up.normalize();}
 manualPose(){this.viewPitch=this.safePitch(this.viewPitch);const d=this.fitDistance()/this.zoomRatio,cp=Math.cos(this.viewPitch),position=this.viewTarget.clone().add(new THREE.Vector3(Math.sin(this.cameraYaw)*cp*d,Math.sin(this.viewPitch)*d,Math.cos(this.cameraYaw)*cp*d));return{position:this.resolveCameraPosition(position,this.viewTarget),target:this.viewTarget.clone(),up:this.orbitUp(this.cameraYaw,this.viewPitch,this.viewRoll)};}
 orbitBy(yawDelta,pitchDelta=0){this.stopOrbitInertia();if(!Number.isFinite(yawDelta)||!Number.isFinite(pitchDelta))return;this.cancelCameraMotion(true);this.cameraYaw+=yawDelta;this.viewPitch=this.safePitch(this.viewPitch+pitchDelta);this.updateCamera();}
 poseQuaternion(pose){return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(pose.position,pose.target,pose.up||this.camera.up));}
 applyCameraPose(pose){this.camera.position.copy(this.resolveCameraPosition(pose.position,pose.target));this.cameraTarget.copy(pose.target);if(pose.up)this.camera.up.copy(pose.up);this.camera.lookAt(this.cameraTarget);this.camera.up.set(0,1,0).applyQuaternion(this.camera.quaternion);this.camera.updateMatrixWorld();}
 adoptCameraPose(){
  const offset=this.camera.position.clone().sub(this.cameraTarget),distance=offset.length();if(distance<1e-8)return;
  const n=offset.multiplyScalar(1/distance),actualUp=new THREE.Vector3(0,1,0).applyQuaternion(this.camera.quaternion),horizontal=Math.hypot(n.x,n.z),principalPitch=Math.asin(clamp(n.y,-1,1));
  const near=(value,reference)=>reference+wrapAngle(value-reference);let yaw=this.cameraYaw,pitch;
  if(horizontal<1e-7){pitch=near(n.y>=0?Math.PI/2:-Math.PI/2,this.viewPitch);}
  else{const principalYaw=Math.atan2(n.x,n.z),candidates=[{yaw:near(principalYaw,this.cameraYaw),pitch:near(principalPitch,this.viewPitch)},{yaw:near(principalYaw+Math.PI,this.cameraYaw),pitch:near(Math.PI-principalPitch,this.viewPitch)}];const cost=c=>Math.abs(c.pitch-this.viewPitch)+Math.abs(c.yaw-this.cameraYaw);const best=cost(candidates[0])<=cost(candidates[1])?candidates[0]:candidates[1];yaw=best.yaw;pitch=best.pitch;}
  const baseUp=this.orbitUp(yaw,pitch),right=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));this.cameraYaw=yaw;this.viewPitch=pitch;this.viewRoll=Math.atan2(actualUp.dot(right),actualUp.dot(baseUp));this.viewTarget.copy(this.cameraTarget);this.zoomRatio=clamp(this.fitDistance()/distance,.75,4);
 }
 notifyZoom(){if(!this.camera)return;const ratio=this.fitDistance()/this.camera.position.distanceTo(this.cameraTarget);if(Math.abs(ratio-(this.reportedZoom||0))>.002){this.reportedZoom=ratio;this.onZoomChange(ratio);}}
 cancelCameraMotion(adopt=true){if(!this.cameraMotion)return;this.cameraMotion=null;if(adopt)this.adoptCameraPose();this.notifyZoom();}
 setZoom(value,{animate=true}={}){
  this.stopOrbitInertia();if(!Number.isFinite(value))return;
  const continuing=animate&&!this.reduced&&this.cameraMotion?.kind==='manual'&&this.cameraMotion.zoom;
  if(!continuing)this.cancelCameraMotion(this.cameraMotion?.kind==='focus');this.zoomRatio=clamp(value,.75,4);this.cameraDistance=9.1/this.zoomRatio;
  if(!this.camera)return;const to=this.manualPose(),now=performance.now();
  if(continuing){this.cameraMotion.to=to;this.cameraMotion.duration=Math.max(180,now-this.cameraMotion.start+90);}
  else if(animate&&!this.reduced)this.cameraMotion={kind:'manual',zoom:true,start:now,duration:180,from:this.cameraPose(),to};
  else{this.applyCameraPose(to);this.notifyZoom();}
 }
 zoomBy(factor){if(!Number.isFinite(factor)||factor<=0)return;if(this.cameraMotion?.kind==='focus')this.cancelCameraMotion(true);this.setZoom(this.zoomRatio*factor);}
 resetCamera(){
  this.stopOrbitInertia();this.cancelCameraMotion(true);const from=this.camera?this.cameraPose():null,fromYaw=this.cameraYaw,fromPitch=this.viewPitch,fromRoll=this.viewRoll;this.cameraMotion=null;this.cameraYaw=0;this.viewPitch=Math.atan2(.32,9.1);this.viewRoll=0;this.viewTarget.set(0,2.8,0);this.zoomRatio=1;this.cameraDistance=9.1;
  if(!this.camera)return;const to=this.manualPose();if(!this.reduced){const fromOffset=from.position.clone().sub(from.target),toOffset=to.position.clone().sub(to.target);this.cameraMotion={kind:'manual',start:performance.now(),duration:420,from,to,orbit:{fromYaw,toYaw:fromYaw+wrapAngle(-fromYaw),fromPitch,toPitch:fromPitch+wrapAngle(this.viewPitch-fromPitch),fromRoll,toRoll:fromRoll+wrapAngle(-fromRoll),fromDistance:fromOffset.length(),toDistance:toOffset.length()}};}else{this.applyCameraPose(to);this.notifyZoom();}
 }
 updateCamera(){if(!this.camera)return;this.applyCameraPose(this.manualPose());this.notifyZoom();}
 focusOnOrnament(id,{placement=false}={}){
  if(this.reduced||!this.camera)return false;this.stopOrbitInertia();const entry=this.items.get(id);if(!entry)return false;
  const previous=this.cameraMotion,from=this.cameraPose(),returnPose=previous?.kind==='focus'?previous.returnPose:this.manualPose();
  const baseView=previous?.kind==='focus'?previous.baseView:{zoom:this.zoomRatio,yaw:this.cameraYaw,pitch:this.viewPitch,roll:this.viewRoll,target:this.viewTarget.clone()};
  const offset=new THREE.Vector3(0,-.23*entry.scale,0).applyQuaternion(entry.root.quaternion);const target=entry.root.position.clone().add(offset);
  const direction=from.position.clone().sub(target);const distance=clamp(direction.length()*.56,this.fitDistance()/4,this.fitDistance()/1.7);
  const to={position:target.clone().add(direction.normalize().multiplyScalar(distance)),target,up:from.up.clone()};
  const start=performance.now();this.cameraMotion={kind:'focus',id,start,from,to,returnPose,baseView,inDuration:MOTION_TIMING.cameraIn*1000,hold:MOTION_TIMING.cameraHold*1000,outDuration:MOTION_TIMING.cameraOut*1000};
  if(placement){entry.birth=start+300;entry.root.scale.setScalar(entry.scale*.28);entry.lastScale=entry.scale*.28;entry.sparkAt=start+500;}entry.swing=start+420;return true;
 }
 advanceCamera(now){
  const m=this.cameraMotion;if(!m)return;let from,to,t,phase='return';
  if(m.kind==='manual'){from=m.from;to=m.to;t=clamp((now-m.start)/m.duration,0,1);}
  else{const elapsed=now-m.start;if(elapsed<m.inDuration){from=m.from;to=m.to;t=clamp(elapsed/m.inDuration,0,1);phase='in';}else if(elapsed<m.inDuration+m.hold){from=m.to;to=m.to;t=1;}else{from=m.to;to=m.returnPose;t=clamp((elapsed-m.inDuration-m.hold)/m.outDuration,0,1);}}
  const k=cinematicProgress(t,phase),target=from.target.clone().lerp(to.target,k);let position,up;
  if(m.orbit){const o=m.orbit,yaw=THREE.MathUtils.lerp(o.fromYaw,o.toYaw,k),pitch=THREE.MathUtils.lerp(o.fromPitch,o.toPitch,k),roll=THREE.MathUtils.lerp(o.fromRoll||0,o.toRoll||0,k),distance=THREE.MathUtils.lerp(o.fromDistance,o.toDistance,k);position=target.clone().add(new THREE.Vector3(Math.sin(yaw)*Math.cos(pitch)*distance,Math.sin(pitch)*distance,Math.cos(yaw)*Math.cos(pitch)*distance));up=this.orbitUp(yaw,pitch,roll);}
  else{position=from.position.clone().lerp(to.position,k);if(m.kind==='focus')position.y+=Math.min(.08,from.position.distanceTo(to.position)*.018)*cameraArc(t);if(m.rotationFromPose!==from||m.rotationToPose!==to){m.rotationFromPose=from;m.rotationToPose=to;m.fromOrientation=this.poseQuaternion(from);m.toOrientation=this.poseQuaternion(to);}up=new THREE.Vector3(0,1,0).applyQuaternion(m.fromOrientation.clone().slerp(m.toOrientation,k));}
  this.applyCameraPose({position,target,up});this.notifyZoom();
  const done=m.kind==='manual'?now-m.start>=m.duration:now-m.start>=m.inDuration+m.hold+m.outDuration;
  if(done){this.cameraMotion=null;if(m.kind==='focus'){this.zoomRatio=m.baseView.zoom;this.cameraYaw=m.baseView.yaw;this.viewPitch=m.baseView.pitch;this.viewRoll=m.baseView.roll||0;this.viewTarget.copy(m.baseView.target);}this.notifyZoom();}
 }
 stopOrbitInertia(){this.orbitInertia=null;}
 advanceOrbitInertia(dt){
  const motion=this.orbitInertia;if(!motion||this.pointer||this.cameraMotion)return;
  if(this.reduced){this.stopOrbitInertia();return;}
  const yaw=dampedInertia(motion.yaw,dt),pitch=dampedInertia(motion.pitch,dt);this.cameraYaw+=yaw.delta;
  const nextPitch=this.viewPitch+pitch.delta;this.viewPitch=this.safePitch(nextPitch);motion.yaw=yaw.velocity;motion.pitch=this.viewPitch===nextPitch?pitch.velocity:0;
  if(Math.abs(motion.yaw)+Math.abs(motion.pitch)<.004)this.stopOrbitInertia();this.updateCamera();
 }
 resize(){if(!this.renderer)return;const r=this.canvas.getBoundingClientRect();if(r.width<1||r.height<1)return;this.cancelCameraMotion(true);this.renderer.setSize(r.width,r.height,false);this.camera.aspect=r.width/r.height;if(this.sceneFraming){const top=r.width<600?64:70,bottom=r.width<600?223:r.width>=1600?212:190;this.sceneFrameScale=r.height/Math.max(200,r.height-top-bottom);this.sceneOffsetY=(bottom-top)/2;this.camera.setViewOffset(r.width,r.height,0,this.sceneOffsetY,r.width,r.height);}this.camera.updateProjectionMatrix();this.updateCamera();if(this.lampGlow)this.lampGlow.material.uniforms.pointScale.value=r.height*this.renderer.getPixelRatio();this.winter?.resize();}
 ray(clientX,clientY){const r=this.canvas.getBoundingClientRect();this.pointerNdc.set((clientX-r.left)/r.width*2-1,-(clientY-r.top)/r.height*2+1);this.raycaster.setFromCamera(this.pointerNdc,this.camera);return this.raycaster;}
 getDropPosition(clientX,clientY){if(!this.pickTree)return null;const hit=this.ray(clientX,clientY).intersectObject(this.pickTree,false)[0];if(!hit)return null;const p=hit.point;if(p.y<1.06||p.y>4.94)return null;const r=this.treeRadius(p.y)+.24;return{x:clamp(p.x/(r*.995),-1,1),y:clamp((p.y-.95)/4.08,.027,.978),angle:Math.atan2(p.x,p.z)};}
 getViewPlacement(){const rect=this.canvas.getBoundingClientRect(),angle=Math.atan2(this.camera.position.x,this.camera.position.z);return this.getDropPosition(rect.left+rect.width/2,rect.top+rect.height/2-(this.sceneOffsetY||0))||{x:clamp(Math.sin(angle)/.995,-1,1),y:.5,angle:wrapAngle(angle)};}
 pickOrnament(ray){
  const shellHit=this.pickTree?ray.intersectObject(this.pickTree,false)[0]:null;
  const hits=ray.intersectObjects([...this.items.values()].map(o=>o.hit),false);
  return hits.find(hit=>{const item=this.items.get(hit.object.userData.ornamentId);if(!item)return false;const anchor=item.root.getWorldPosition(new THREE.Vector3()),outward=new THREE.Vector3(anchor.x,0,anchor.z).normalize(),toCamera=this.camera.position.clone().sub(anchor).normalize();return outward.dot(toCamera)>-.08&&(!shellHit||hit.distance<=shellHit.distance+.32*item.scale);});
 }

 bind(target,event,handler,options){target.addEventListener(event,handler,options);this.bound.push(()=>target.removeEventListener(event,handler,options));}
 bindPointers(){
  this.canvas.style.touchAction='none';
  const cancelSingle=()=>{const p=this.pointer;if(p?.itemId&&p.original)this.updateOrnament(p.original);this.pointer=null;this.lastPointer=null;};
  const release=id=>{if(this.canvas.hasPointerCapture?.(id))this.canvas.releasePointerCapture(id);};
  this.bind(this.canvas,'pointerdown',e=>{
   if(e.button!==0)return;this.stopOrbitInertia();
   if(e.pointerType==='touch'){
    this.touchPoints.set(e.pointerId,{x:e.clientX,y:e.clientY});this.canvas.setPointerCapture(e.pointerId);
    if(this.touchPoints.size>=2){cancelSingle();this.cancelCameraMotion(true);const [a,b]=[...this.touchPoints.values()];this.pinch={distance:Math.max(10,Math.hypot(a.x-b.x,a.y-b.y)),zoom:this.zoomRatio,pending:null};this.gestureWasPinch=true;return;}
    if(this.gestureWasPinch)return;
   }
   if(this.pointer)return;this.cancelCameraMotion(true);
   const ray=this.ray(e.clientX,e.clientY),hit=this.pickOrnament(ray),itemId=hit?.object.userData.ornamentId;
   let topper=false;if(!itemId&&this.topper)topper=ray.intersectObject(this.topper,true).some(hit=>hit.object.isMesh);
   this.pointer={id:e.pointerId,x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,itemId,topper,moved:false,startYaw:this.cameraYaw,startPitch:this.viewPitch};
   if(itemId){this.setSelected(itemId);this.onSelect(itemId);const en=this.items.get(itemId);this.pointer.original={...en.item};const down=this.getDropPosition(e.clientX,e.clientY);this.pointer.offset=down?{angle:wrapAngle(this.angleFor(en.item)-down.angle),y:en.item.y-down.y}:{angle:0,y:0};}
   this.canvas.setPointerCapture(e.pointerId);
  });
  this.bind(this.canvas,'pointermove',e=>{
   if(this.touchPoints.has(e.pointerId))this.touchPoints.set(e.pointerId,{x:e.clientX,y:e.clientY});
   if(this.pinch){const [a,b]=[...this.touchPoints.values()];if(a&&b)this.pinch.pending=this.pinch.zoom*Math.hypot(a.x-b.x,a.y-b.y)/this.pinch.distance;return;}
   if(this.gestureWasPinch)return;
   if(this.pointer&&e.pointerId===this.pointer.id){this.lastPointer={x:e.clientX,y:e.clientY};if(Math.hypot(e.clientX-this.pointer.x,e.clientY-this.pointer.y)>4)this.pointer.moved=true;}
   else if(e.pointerType!=='touch')this.hoverPending={x:e.clientX,y:e.clientY};
  },{passive:true});
  const finish=(e,cancel=false)=>{
   if(this.gestureWasPinch){this.processPointer();this.touchPoints.delete(e.pointerId);release(e.pointerId);if(this.touchPoints.size<2)this.pinch=null;if(!this.touchPoints.size)this.gestureWasPinch=false;return;}
   this.touchPoints.delete(e.pointerId);const p=this.pointer;if(!p||p.id!==e.pointerId){release(e.pointerId);return;}
   if(e.clientX!==undefined)this.lastPointer={x:e.clientX,y:e.clientY};this.processPointer();if(!cancel&&!p.itemId&&p.moved&&!this.reduced&&performance.now()-(p.lastOrbitAt||0)<100)this.orbitInertia={yaw:p.velocityYaw||0,pitch:p.velocityPitch||0};this.pointer=null;this.lastPointer=null;
   if(p.itemId){const en=this.items.get(p.itemId);if(en){if(cancel)this.updateOrnament(p.original);else if(p.moved){en.swing=performance.now();this.onDrop({id:p.itemId,x:en.item.x,y:en.item.y,angle:this.angleFor(en.item),clientX:e.clientX,clientY:e.clientY});}else en.swing=performance.now();}}
   else if(!cancel&&!p.moved){if(p.topper){this.topperBirth=performance.now();this.spawnSpark(new THREE.Vector3(0,5.35,.1),true);}else{const drop=this.getDropPosition(e.clientX,e.clientY);if(drop)this.onDrop({...drop,clientX:e.clientX,clientY:e.clientY});else{this.setSelected(null);this.onSelect(null);}}}
   release(e.pointerId);this.canvas.style.cursor='default';
  };
  this.bind(this.canvas,'pointerup',e=>finish(e));this.bind(this.canvas,'pointercancel',e=>finish(e,true));
  this.bind(this.canvas,'wheel',e=>{e.preventDefault();const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?400:1);this.zoomBy(Math.exp(-clamp(delta,-200,200)*.002));},{passive:false});
  const cancelPointer=()=>{this.stopOrbitInertia();const id=this.pointer?.id;cancelSingle();if(id!==undefined)release(id);for(const key of this.touchPoints.keys())release(key);this.touchPoints.clear();this.pinch=null;this.gestureWasPinch=false;this.canvas.style.cursor='default';};
  this.bind(window,'blur',()=>{cancelPointer();this.cancelCameraMotion(true);});
  this.bind(document,'visibilitychange',()=>{if(document.hidden){cancelPointer();this.cancelCameraMotion(true);cancelAnimationFrame(this.raf);this.raf=0;}else if(!this.raf&&!this.disposed){this.lastTime=performance.now();this.tick();}});
  this.bind(this.canvas,'webglcontextlost',e=>{e.preventDefault();cancelPointer();cancelAnimationFrame(this.raf);this.raf=0;this.disposed=true;this.onError(new Error('WebGL context lost'));});
 }
 processPointer(){if(this.pinch?.pending!=null){const ratio=this.pinch.pending;this.pinch.pending=null;this.setZoom(ratio,{animate:false});return;}if(!this.pointer||!this.lastPointer)return;const p=this.pointer,last=this.lastPointer;this.lastPointer=null;if(!p.moved)return;
  if(p.itemId){const drop=this.getDropPosition(last.x,last.y),en=this.items.get(p.itemId);if(drop&&en){drop.angle=wrapAngle(drop.angle+(p.offset?.angle||0));drop.x=clamp(Math.sin(drop.angle)/.995,-1,1);drop.y=clamp(drop.y+(p.offset?.y||0),.035,.97);Object.assign(en.item,drop);en.root.position.copy(this.positionFor(en.item));this.orientOrnament(en.root,en.item);this.canvas.style.cursor='grabbing';}}
  else{
   const now=performance.now(),elapsed=clamp((now-(p.lastOrbitAt||now-16))/1000,.008,.08),yaw=p.startYaw-(last.x-p.x)*.005,requestedPitch=p.startPitch+(last.y-p.y)*.004,pitch=this.safePitch(requestedPitch);if(pitch!==requestedPitch)p.startPitch=pitch-(last.y-p.y)*.004;
   if(Math.abs(yaw-this.cameraYaw)+Math.abs(pitch-this.viewPitch)>1e-7){p.velocityYaw=damp(p.velocityYaw||0,clamp((yaw-this.cameraYaw)/elapsed,-1.2,1.2),18,elapsed);p.velocityPitch=damp(p.velocityPitch||0,clamp((pitch-this.viewPitch)/elapsed,-.6,.6),18,elapsed);p.lastOrbitAt=now;}
   this.cameraYaw=yaw;this.viewPitch=pitch;this.updateCamera();this.canvas.style.cursor='grabbing';
  }}
 spawnSpark(position,large=false){if(this.reduced)return;const count=large?28:16,positions=[],velocities=[];for(let i=0;i<count;i++){positions.push(position.x,position.y,position.z);const a=i/count*TAU;velocities.push(new THREE.Vector3(Math.cos(a)*(large?.9:.55),Math.sin(a)*(large?.8:.55)+.2,.15+Math.random()*.4));}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));const p=new THREE.Points(g,new THREE.PointsMaterial({map:this.sparkTexture,size:large?.16:.10,color:0xffdc96,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));this.scene.add(p);this.sparks.push({node:p,velocities,birth:performance.now()});if(this.sparks.length>6){const old=this.sparks.shift();this.scene.remove(old.node);this.disposeObject(old.node);}}
 tick(){if(this.disposed||document.hidden){this.raf=0;return;}const now=performance.now(),dt=Math.min((now-(this.lastTime||now))/1000,.045);this.measureFrame(now,this.lastTime);this.lastTime=now;this.advanceCamera(now);this.processPointer();this.advanceOrbitInertia(dt);this.processHover(now);this.winter?.update(dt);
  for(const e of this.items.values()){
   let s=1;if(!this.reduced&&e.birth>=0){const t=(now-e.birth)/1000;s=placementScale(t);if(t>=MOTION_TIMING.placement)e.birth=-1;}
   if(e.sparkAt&&now>=e.sparkAt){this.spawnSpark(e.root.position.clone().add(new THREE.Vector3(0,-.18,.12).applyQuaternion(e.root.quaternion)));e.sparkAt=0;}
   const nextScale=e.scale*s;if(nextScale!==e.lastScale){e.root.scale.setScalar(nextScale);e.lastScale=nextScale;}
   const swingElapsed=(now-e.swing)/1000,nextSwing=this.reduced||e.swing<0?0:placementSwing(swingElapsed);if(e.swing>=0&&swingElapsed>=MOTION_TIMING.swing)e.swing=-1;if(nextSwing!==e.lastSwing){e.model.rotation.z=nextSwing;e.lastSwing=nextSwing;}
  }
  if(this.topper&&this.topperBirth){const t=(now-this.topperBirth)/1000;this.topper.scale.setScalar(1.72*(t<.8&&!this.reduced?1+Math.sin(t/.8*Math.PI)*.28:1));if(t>.8)this.topperBirth=0;}
  if(this.topperGlow)this.topperGlow.material.opacity=this.reduced?.45:.38+Math.sin(now*.0015)*.08;
  if(this.lampGlow)this.lampGlow.material.uniforms.time.value=now/1000;
  if(this.snow&&this.snow.visible){const a=this.snow.geometry.getAttribute('position');for(let i=0;i<a.count;i++){a.array[i*3+1]-=dt*(.10+(i%7)*.012);a.array[i*3]+=dt*Math.sin(now*.0003+i)*.025;if(a.array[i*3+1]<.08)a.array[i*3+1]=7.5;}a.needsUpdate=true;}
  this.sparks=this.sparks.filter(s=>{const age=(now-s.birth)/1000;if(age>.85){this.scene.remove(s.node);this.disposeObject(s.node);return false;}const attr=s.node.geometry.getAttribute('position');s.velocities.forEach((v,i)=>{attr.array[i*3]+=v.x*dt;attr.array[i*3+1]+=v.y*dt;attr.array[i*3+2]+=v.z*dt;v.y-=dt*.9;});attr.needsUpdate=true;s.node.material.opacity=Math.pow(1-age/.85,1.7);return true;});
  // Tiny moving decorations do not redraw the static tree shadow.
  this.renderer.render(this.scene,this.camera);this.raf=requestAnimationFrame(()=>this.tick());
 }
 setQuality(){this.qualityMode='high';this.performanceLevel=2;this.applyPerformanceQuality();}
 getPerformanceStats(){return{mode:'high',fixedClarity:true,level:2,dpr:this.currentDpr||this.renderer?.getPixelRatio?.()||1.5,frameMs:this.performanceEMA,needleCount:this.needles?.count||0,needleCapacity:this.needleCapacity||0,needleTriangles:(this.needles?.count||0)*(this.needles?.geometry.index.count||0)/3,drawCalls:this.renderer?.info?.render?.calls??null};}
 updateTreeLOD(){if(this.needles)this.needles.count=this.needleCapacity||this.needles.instanceMatrix.count;}
 applyPerformanceQuality(){
  const desired=this.maxDpr||Math.max(1.5,Math.min(typeof window!=='undefined'?(window.devicePixelRatio||1):1,2));
  if(this.renderer?.setPixelRatio&&Math.abs(desired-(this.currentDpr||0))>.001){this.currentDpr=desired;this.renderer.setPixelRatio(desired);const r=this.canvas.getBoundingClientRect();this.renderer.setSize?.(r.width,r.height,false);if(this.lampGlow)this.lampGlow.material.uniforms.pointScale.value=r.height*desired;this.winter?.resize();}
  this.updateTreeLOD();this.winter?.setQuality?.('high');
 }
 measureFrame(now,previous){if(!previous)return;const interval=now-previous;if(interval>=3&&interval<=160)this.performanceEMA+=.045*(interval-this.performanceEMA);}
 processHover(now){if(!this.hoverPending||this.pointer||now-this.lastHover<33)return;const p=this.hoverPending;this.hoverPending=null;this.lastHover=now;const hit=this.pickOrnament(this.ray(p.x,p.y));this.canvas.style.cursor=hit?'grab':'default';}
 exportPng(){if(!this.renderer)throw new Error('Renderer is not ready');const hidden=[];for(const e of this.items.values())if(e.selection?.visible){e.selection.visible=false;hidden.push(e.selection);}this.renderer.render(this.scene,this.camera);let data;try{data=this.canvas.toDataURL('image/png');}finally{hidden.forEach(o=>o.visible=true);}return data;}
 disposeObject(object){object.traverse(o=>{o.geometry?.dispose();if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material]){if(m.userData?.persistent)continue;if(m.map&&!['SpriteMaterial','PointsMaterial'].includes(m.type))m.map.dispose();m.dispose();}}});}
 dispose(){this.disposed=true;cancelAnimationFrame(this.raf);this.observer?.disconnect();this.bound.forEach(f=>f());this.winter?.dispose();if(this.scene)this.disposeObject(this.scene);this.env?.dispose();this.glowTexture?.dispose();this.sparkTexture?.dispose();this.goldMaterial?.dispose();this.renderer?.dispose();}
}
