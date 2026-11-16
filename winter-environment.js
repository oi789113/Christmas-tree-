import * as THREE from './vendor/three.module.js';
import { RGBELoader } from './vendor/RGBELoader.js';
import { GROUND_Y } from './scene-ground.js?v=contact-depth-20261115';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function random(seed=7041){return()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};}

/** Full-resolution distant photograph, real local snow and bounded GPU snowfall. */
export class WinterEnvironment {
 constructor({scene,renderer,camera,floor,reducedMotion=false}){
  Object.assign(this,{scene,renderer,camera,floor});
  this.reduced=!!reducedMotion;this.night=true;this.weather='snow';this.time=0;this.drift=0;
  this.amount=.56;this.targetAmount=.56;this.wind=.12;this.targetWind=.12;this.quality='high';
  this.mobile=typeof window!=='undefined'&&window.innerWidth<600;
  this.previous={background:scene.background,environment:scene.environment,fog:scene.fog};
 }
 async init({hdrUrl='assets/winter/snowy_forest_path_01_2k.hdr',displayUrl='assets/winter/forest-display-8k.jpg'}={}){
  this.buildGround();this.buildParticles();this.buildFallbackSky();
  const display=displayUrl;
  const [displayResult,hdrResult]=await Promise.allSettled([
   new THREE.TextureLoader().loadAsync(display),new RGBELoader().loadAsync(hdrUrl)
  ]);
  if(displayResult.status==='fulfilled'){
   this.buildPhotographicBackdrop(displayResult.value);this.displayLoaded=true;
  }else{this.displayLoaded=false;this.loadError=displayResult.reason;}
  if(hdrResult.status==='fulfilled'){
   this.hdr=hdrResult.value;this.hdr.mapping=THREE.EquirectangularReflectionMapping;
   try{const pmrem=new THREE.PMREMGenerator(this.renderer);this.environmentTarget=pmrem.fromEquirectangular(this.hdr);pmrem.dispose();this.scene.environment=this.environmentTarget.texture;this.hdrLoaded=true;}
   catch(error){this.hdrLoaded=false;this.environmentError=error;}
  }else{this.hdrLoaded=false;this.environmentError=hdrResult.reason;}
  // A failed lighting map need not conceal a successfully loaded forest photograph.
  if(!this.displayLoaded&&this.hdr){this.scene.background=this.hdr;}
  this.resize();this.setNight(this.night);this.setWeather(this.weather);return this;
 }
 buildPhotographicBackdrop(texture){
  this.displayTexture=texture;texture.colorSpace=THREE.SRGBColorSpace;texture.mapping=THREE.UVMapping;
  texture.anisotropy=Math.min(16,this.renderer.capabilities?.getMaxAnisotropy?.()||1);
  // Only a camera-centered sphere samples the panorama. Forest trunks are never
  // projected onto geometry near the tree or onto the local snow surface.
  const geometry=new THREE.SphereGeometry(70,96,64);geometry.scale(1,1,-1);
  this.sky=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({map:texture,depthWrite:false,depthTest:false,fog:false,toneMapped:false}));
  this.sky.renderOrder=-2000;this.sky.frustumCulled=false;this.sky.name='Original8K distant forest panorama';this.scene.add(this.sky);
  this.scene.background=new THREE.Color('#24313e');this.scene.backgroundBlurriness=0;
  this.buildSnowSurfaceTexture(texture.image);this.updateBackdrop();
 }
 updateBackdrop(){
  // Translation has no effect on an infinitely distant environment. In particular,
  // no second background mesh or camera-height-dependent opacity can switch in.
  if(this.sky&&this.camera)this.sky.position.copy(this.camera.position);
 }
 buildSnowSurfaceTexture(image){
  if(!image||!this.groundMaterial)return;
  const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;if(!width||!height)return;
  // Inspected, snow-only patch in the lower-left of the captured image. The crop
  // lies below all trunks and avoids the panorama's lower stitching pole.
  const crop={x:.055,y:.625,width:.145,height:.08};
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1024;
  const ctx=canvas.getContext('2d'),sx=width*crop.x,sy=height*crop.y,sw=width*crop.width,sh=height*crop.height;
  // Four mirrored copies share matching borders, so repetition does not produce
  // hard seams. It is a local snow texture, never a world/panorama projection.
  for(let row=0;row<2;row++)for(let col=0;col<2;col++){
   ctx.save();ctx.translate(col?1024:0,row?1024:0);ctx.scale(col?-1:1,row?-1:1);ctx.drawImage(image,sx,sy,sw,sh,0,0,512,512);ctx.restore();
  }
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
  map.wrapS=map.wrapT=THREE.RepeatWrapping;map.repeat.set(2,2);map.anisotropy=Math.min(16,this.renderer.capabilities?.getMaxAnisotropy?.()||1);
  map.userData.snowOnlyCrop={...crop,sourceWidth:width,sourceHeight:height};
  this.groundTexture?.dispose();this.groundTexture=map;this.groundMaterial.map=map;this.groundMaterial.needsUpdate=true;
 }
 buildGround(){
  // A continuous physical ground pass occludes below-ground geometry even beyond
  // the decorative snow patch. It writes depth without painting over the photograph.
  const depthGeometry=new THREE.PlaneGeometry(400,400);depthGeometry.rotateX(-Math.PI/2);for(let i=0;i<depthGeometry.getAttribute('position').count;i++){depthGeometry.getAttribute('position').setY(i,0);depthGeometry.getAttribute('normal').setXYZ(i,0,1,0);}
  const depthMaterial=new THREE.MeshBasicMaterial({colorWrite:false,depthWrite:true,depthTest:true,toneMapped:false,fog:false});
  this.depthGround=new THREE.Mesh(depthGeometry,depthMaterial);this.depthGround.position.y=GROUND_Y-.001;this.depthGround.renderOrder=-1900;this.depthGround.name='Continuous snow depth occluder';this.depthGround.frustumCulled=false;this.scene.add(this.depthGround);
  const geometry=new THREE.PlaneGeometry(16,16,32,32);geometry.rotateX(-Math.PI/2);
  const positions=geometry.getAttribute('position');for(let i=0;i<positions.count;i++)positions.setY(i,GROUND_Y);
  geometry.computeVertexNormals();
  // The snow photo is already tonemapped. Use the exact same color treatment as
  // the distant photo, then add real tree shadows in a separate transparent pass.
  this.groundMaterial=new THREE.MeshBasicMaterial({color:'#ffffff',toneMapped:false,fog:false,transparent:true,depthWrite:true});
  this.groundMaterial.onBeforeCompile=shader=>{
   shader.vertexShader='varying vec2 vSnowWorld;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvSnowWorld=(modelMatrix*vec4(transformed,1.0)).xz;');
   shader.fragmentShader='varying vec2 vSnowWorld;\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <tonemapping_fragment>','gl_FragColor.a*=1.0-smoothstep(3.8,7.6,length(vSnowWorld));\n#include <tonemapping_fragment>');
  };
  this.groundMaterial.customProgramCacheKey=()=> 'snow-only-local-surface-v2';
  this.ground=new THREE.Mesh(geometry,this.groundMaterial);this.ground.renderOrder=-1800;this.ground.name='Local snow-only surface without forest projection';this.scene.add(this.ground);
  this.shadowMaterial=new THREE.ShadowMaterial({color:'#152635',opacity:.32,toneMapped:false,fog:false,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});this.shadowMaterial.onBeforeCompile=this.groundMaterial.onBeforeCompile;this.shadowMaterial.customProgramCacheKey=()=> 'snow-only-shadow-feather-v2';
  this.shadowGround=new THREE.Mesh(geometry.clone(),this.shadowMaterial);this.shadowGround.position.y=0;this.shadowGround.renderOrder=-1600;this.shadowGround.receiveShadow=true;this.shadowGround.name='Tree shadow on local snow';this.scene.add(this.shadowGround);
  if(this.floor){this.floorVisible=this.floor.visible;this.floor.visible=false;}
 }
 buildFallbackSky(){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;const ctx=canvas.getContext('2d');
  const gradient=ctx.createLinearGradient(0,0,0,256);gradient.addColorStop(0,'#101c2b');gradient.addColorStop(.45,'#3e5465');gradient.addColorStop(.6,'#7b8d99');gradient.addColorStop(1,'#91a1ad');ctx.fillStyle=gradient;ctx.fillRect(0,0,512,256);
  this.fallbackSky=new THREE.CanvasTexture(canvas);this.fallbackSky.mapping=THREE.EquirectangularReflectionMapping;this.fallbackSky.colorSpace=THREE.SRGBColorSpace;this.scene.background=this.fallbackSky;
 }
 buildParticles(){
  this.particleCount=900;
  const rand=random(119),positions=[],sizes=[],speeds=[],seeds=[];
  for(let i=0;i<this.particleCount;i++){
   positions.push((rand()-.5)*48,rand()*13.5,(rand()-.5)*48);
   sizes.push(.022+Math.pow(rand(),2)*.043);speeds.push(.25+rand()*.40);seeds.push(rand(),rand(),rand());
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('snowSize',new THREE.Float32BufferAttribute(sizes,1));geometry.setAttribute('fallSpeed',new THREE.Float32BufferAttribute(speeds,1));geometry.setAttribute('seed',new THREE.Float32BufferAttribute(seeds,3));
  const mask=document.createElement('canvas');mask.width=mask.height=32;const ctx=mask.getContext('2d'),gradient=ctx.createRadialGradient(16,16,0,16,16,16);
  gradient.addColorStop(0,'rgba(255,255,255,.95)');gradient.addColorStop(.28,'rgba(255,255,255,.82)');gradient.addColorStop(.72,'rgba(255,255,255,.28)');gradient.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,32,32);this.snowMask=new THREE.CanvasTexture(mask);
  const uniforms={time:{value:0},drift:{value:0},amount:{value:this.amount},wind:{value:this.wind},viewportHeight:{value:700},mask:{value:this.snowMask},tint:{value:new THREE.Color('#cedce8')},opacity:{value:.73}};
  this.particleMaterial=new THREE.ShaderMaterial({uniforms,transparent:true,depthWrite:false,depthTest:true,blending:THREE.NormalBlending,
   vertexShader:`
    attribute float snowSize;attribute float fallSpeed;attribute vec3 seed;
    uniform float time;uniform float drift;uniform float viewportHeight;
    varying float vDistance;varying float vRank;varying float vWarm;varying float vSoft;
    void main(){
     vec3 p=position;
     p.y=mod(position.y-time*fallSpeed+13.5,13.5);
     p.x=mod(position.x+drift*(.4+seed.x)+sin(time*.32+seed.z*6.283)*.27+24.0,48.0)-24.0;
     p.z=mod(position.z+sin(time*.20+seed.y*6.283)*.24+24.0,48.0)-24.0;
     vec4 mv=modelViewMatrix*vec4(p,1.0);vDistance=-mv.z;vRank=seed.x;vSoft=seed.y;
     vWarm=(1.0-smoothstep(1.2,4.0,length(p.xz)))*(1.0-smoothstep(4.0,6.5,p.y));
     float projected=snowSize*viewportHeight*projectionMatrix[1][1]/max(.7,-mv.z);
     gl_PointSize=clamp(projected,1.0,12.0);gl_Position=projectionMatrix*mv;
    }`,
   fragmentShader:`
    uniform sampler2D mask;uniform float amount;uniform float opacity;uniform vec3 tint;
    varying float vDistance;varying float vRank;varying float vWarm;varying float vSoft;
    void main(){
     float coverage=1.0-smoothstep(amount-.06,amount+.06,vRank);
     float nearFade=smoothstep(.9,2.0,vDistance);float farFade=1.0-smoothstep(21.0,35.0,vDistance);
     float alpha=texture2D(mask,(gl_PointCoord-.5)*vec2(1.07,.93)+.5).a*coverage*nearFade*farFade*opacity*(.57+.25*vSoft);
     if(alpha<.012)discard;
     gl_FragColor=vec4(mix(tint,vec3(1.0,.88,.70),vWarm*.30),alpha);
     #include <tonemapping_fragment>
     #include <colorspace_fragment>
    }`
  });
  this.particles=new THREE.Points(geometry,this.particleMaterial);this.particles.frustumCulled=false;this.particles.name='Batched depth layered snowfall';this.scene.add(this.particles);this.resize();
 }
 setQuality(){
  // Image resolution and weather detail are fixed; compatibility calls never lower quality.
  this.quality='high';this.particles?.geometry.setDrawRange(0,this.particleCount);
 }
 setWeather(mode){
  if(!['snow','flurries','clear'].includes(mode))mode='snow';this.weather=mode;
  this.targetAmount=mode==='clear'?0:mode==='flurries'?1:.56;
  this.targetWind=mode==='flurries'?.43:mode==='clear'?.06:.12;
  if(this.reduced){this.amount=this.targetAmount;this.wind=this.targetWind;this.applyWeatherUniforms();}
 }
 setNight(value){
  this.night=!!value;this.scene.backgroundBlurriness=0;this.scene.backgroundIntensity=this.night?.55:.96;
  this.scene.environmentIntensity=this.night?.58:.87;
  this.scene.fog=new THREE.FogExp2(this.night?'#293e50':'#a9bbc8',this.night?.012:.008);
  // Display panorama is already tonemapped; shade it once in linear space, keeping snow detail.
  if(this.sky)this.sky.material.color.setRGB(this.night?.43:.97,this.night?.57:.99,this.night?.76:1.0);
  if(this.groundMaterial)this.groundMaterial.color.setRGB(this.night?.43:.97,this.night?.57:.99,this.night?.76:1.0);if(this.shadowMaterial)this.shadowMaterial.opacity=this.night?.32:.26;
  if(this.particleMaterial){this.particleMaterial.uniforms.tint.value.set(this.night?'#d2dfec':'#eff5fa');this.particleMaterial.uniforms.opacity.value=this.night?.73:.63;}
 }
 setReducedMotion(value){this.reduced=!!value;this.setWeather(this.weather);}
 applyWeatherUniforms(){if(!this.particleMaterial)return;this.particleMaterial.uniforms.amount.value=this.amount;this.particleMaterial.uniforms.wind.value=this.wind;this.particles.visible=this.amount>.002;}
 update(dt){
  const step=clamp(Number(dt)||0,0,.06),blend=1-Math.exp(-step*5.5);
  this.amount+=(this.targetAmount-this.amount)*blend;this.wind+=(this.targetWind-this.wind)*blend;
  if(Math.abs(this.targetAmount-this.amount)<.002)this.amount=this.targetAmount;
  if(!this.reduced){this.time+=step;this.drift+=this.wind*step;}
  if(this.particleMaterial){this.particleMaterial.uniforms.time.value=this.time;this.particleMaterial.uniforms.drift.value=this.drift;this.applyWeatherUniforms();}this.updateBackdrop(step);
 }
 resize(){if(this.particleMaterial){const height=this.renderer.domElement?.clientHeight||700,dpr=this.renderer.getPixelRatio?.()||1;this.particleMaterial.uniforms.viewportHeight.value=height*dpr;}}
 dispose(){
  this.scene.remove(this.ground,this.shadowGround,this.depthGround,this.particles,this.sky);
  this.depthGround?.geometry.dispose();this.depthGround?.material.dispose();
  this.ground?.geometry.dispose();this.groundMaterial?.dispose();this.shadowGround?.geometry.dispose();this.shadowMaterial?.dispose();this.particles?.geometry.dispose();this.particleMaterial?.dispose();this.sky?.geometry.dispose();this.sky?.material.dispose();
  this.groundTexture?.dispose();this.snowMask?.dispose();this.hdr?.dispose();this.displayTexture?.dispose();this.environmentTarget?.dispose();this.fallbackSky?.dispose();
  if(this.floor)this.floor.visible=this.floorVisible;
 }
}
