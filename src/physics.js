(function(root){
  'use strict';
  const FFT2=root.FerroLab?.FFT2 || (typeof require!=='undefined'?require('./fft.js').FFT2:null);
  const MU0=4e-7*Math.PI,clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
  // Stable small-argument Langevin function, with a saturation asymptote.
  function langevin(a){if(Math.abs(a)<1e-3)return a/3-a*a*a/45+2*a**5/945;if(a>30)return 1-1/a;return 1/Math.tanh(a)-1/a;}
  function magnetization(h,ms=35000,chi=1.55){return ms*langevin(3*chi*Math.max(0,h)/ms);}
  function magneticState(bMilliTesla,ms=35000,chi=1.55){
    // Normal field, infinite flat layer: B_n continuous, H_internal+M= B_air/mu0.
    const ha=Math.max(0,bMilliTesla)*1e-3/MU0;let lo=0,hi=ha;
    for(let i=0;i<44;i++){const mid=(lo+hi)/2;if(mid+magnetization(mid,ms,chi)>ha)hi=mid;else lo=mid;}
    const h=(lo+hi)/2,m=magnetization(h,ms,chi);return {h,m,mu:1+(h>1e-8?m/h:chi),appliedH:ha};
  }
  function depthFactor(kd,mu){
    if(kd<1e-5)return (1+1/mu)/2;
    if(kd>30)return 1;
    const f=(1-mu)*Math.exp(-kd)/((1+mu/Math.tanh(kd))*Math.sinh(kd));
    return (1+1/mu)/(1+(1/mu)/(1+f));
  }
  // L2 projection onto a bounded fixed-mass set. This is an explicit numerical
  // safeguard, measured separately; it is not a substitute for a physical flux.
  function projectMass(a,target,lo,hi){
    let left=Infinity,right=-Infinity;
    for(const v of a){if(!Number.isFinite(v))throw Error('Non-finite solver state');left=Math.min(left,v-hi);right=Math.max(right,v-lo);}
    for(let j=0;j<42;j++){const shift=(left+right)/2;let s=0;for(const v of a)s+=clamp(v-shift,lo,hi);if(s>target*a.length)left=shift;else right=shift;}
    const shift=(left+right)/2;let correction=0;for(let i=0;i<a.length;i++){const next=clamp(a[i]-shift,lo,hi);correction+=Math.abs(next-a[i]);a[i]=next;}return correction/a.length;
  }
  class Simulation {
    constructor(n=64){
      this.n=n;this.size=n*n;this.fft=new FFT2(n);this.q=new Float64Array(this.size);this.r=new Float64Array(this.size);this.im=new Float64Array(this.size);this.nr=new Float64Array(this.size);this.ni=new Float64Array(this.size);this.pressure=new Float64Array(this.size);this.texture=new Float32Array(this.size*4);
      this.params={mode:'surface',field:14,viscosity:18,sigma:29,density:1210,depth:0.85,gap:0.35,fraction:0.48,roughness:0.12,ior:1.47,amber:true,inclusion:false,gradient:0,seed:17};
      this.magnet={active:false,x:0,z:0};this.reset('surface');
    }
    random(){this.seed=(Math.imul(1664525,this.seed)+1013904223)>>>0;return this.seed/4294967296;}
    scales(){const p=this.params,lc=Math.sqrt(p.sigma*.001/(p.density*9.81)),tc=Math.sqrt(lc/9.81);return {lc,tc,f:p.viscosity*.001/p.density*tc/(lc*lc),d:p.depth*.001/lc};}
    state(){const p=this.params,s=this.scales(),m=magneticState(p.field);return {...m,...s,coefficient:MU0*m.mu/(m.mu+1)*m.m*m.m/Math.sqrt(p.density*9.81*p.sigma*.001)};}
    reset(mode=this.params.mode){
      this.params.mode=mode;this.seed=this.params.seed;this.time=0;this.steps=0;this.projection=0;this.maxProjection=0;this.failed=false;const n=this.n;
      for(let y=0;y<n;y++)for(let x=0;x<n;x++){
        const i=y*n+x;
        // One-time, deterministic zero-mean perturbation: no per-frame noise force.
        this.q[i]=mode==='surface'? (this.random()-.5)*.002 : 2*this.params.fraction-1+(this.random()-.5)*.14;
      }
      this.target=mode==='surface'?0:2*this.params.fraction-1;
      const offset=mean(this.q)-this.target;for(let i=0;i<this.size;i++)this.q[i]-=offset;
      this.initialMass=this.target;this.magnet.active=false;this.updateTexture();
    }
    wave(kx,ky){const s=this.state(),k=Math.hypot(kx,ky);if(!k)return {rate:0,energy:0,mobility:0};const energy=1+k*k-s.coefficient*depthFactor(k*s.d,s.mu)*k;const mobility=1/(3*s.f/s.d**3+2*s.f*k**3);return {rate:-mobility*k*k*energy,energy,mobility};}
    step(dt=.08){
      if(this.failed)return;dt=clamp(dt,1e-5,.16);const p=this.params,n=this.n,st=this.state(),cell=p.mode==='cell';
      // x,z domain: surface = 22 capillary lengths; cell = 64 reference units.
      const domain=cell?64:22,dx=domain/n,base=st.d;
      const beta=cell?4.9*Math.min(2,st.coefficient/2):0;
      const gapUnits=4*p.gap/.35,alpha=4,kappa=.8,stabilizer=cell?8:18;
      let pMean=0;
      for(let y=0;y<n;y++)for(let x=0;x<n;x++){
        const i=y*n+x,q=this.q[i],xx=x/n-.5,zz=y/n-.5;
        let force=0;
        if(this.magnet.active){const rr=(xx-this.magnet.x)**2+(zz-this.magnet.z)**2;
          // Local external magnetic-pressure well, a calibrated compact pole
          // surrogate, not an arbitrary hand force and not a solved coil field.
          force=(cell?5:1.8)*st.coefficient*Math.exp(-rr/.01625);
        }
        if(p.gradient)force+=(cell?1.2:.45)*st.coefficient*p.gradient*xx;
        this.pressure[i]=force;pMean+=force;
        this.nr[i]=cell?alpha*q*q*q-force : 16*q*q*q-4*q*q-force;
        this.r[i]=q;this.im[i]=0;this.ni[i]=0;
      }
      this.fft.transform(this.r,this.im);this.fft.transform(this.nr,this.ni);
      for(let y=0;y<n;y++)for(let x=0;x<n;x++){
        const i=y*n+x,kx=2*Math.PI*(x<=n/2?x:x-n)/domain,kz=2*Math.PI*(y<=n/2?y:y-n)/domain,k=Math.hypot(kx,kz),k2=k*k;
        if(i===0){this.r[i]=this.target*this.size;this.im[i]=0;continue;}
        // 2/3 de-aliasing prevents cubic products from folding high frequencies.
        if(Math.abs(x<=n/2?x:x-n)>n/3||Math.abs(y<=n/2?y:y-n)>n/3){this.r[i]=this.im[i]=0;continue;}
        let mobility,positive,negative;
        if(cell){mobility=.85*(18/p.viscosity)*(p.gap/.35)**2;const kernel=k*gapUnits<1e-5?1:-Math.expm1(-k*gapUnits)/(k*gapUnits);positive=kappa*(p.sigma/29)*k2+beta*kernel+stabilizer;negative=alpha+stabilizer;}
        else{mobility=1/(3*st.f/base**3+2*st.f*k**3);positive=1+k2+stabilizer;negative=st.coefficient*depthFactor(k*base,st.mu)*k+stabilizer;}
        const a=dt*mobility*k2,den=1+a*positive;
        this.r[i]=((1+a*negative)*this.r[i]-a*this.nr[i])/den;
        this.im[i]=((1+a*negative)*this.im[i]-a*this.ni[i])/den;
      }
      this.fft.transform(this.r,this.im,true);this.q.set(this.r);
      this.projection=projectMass(this.q,this.target,cell?-1:-base*.96,cell?1:Math.max(base*3,2));this.maxProjection=Math.max(this.maxProjection,this.projection);
      this.time+=cell?dt*.03:dt*st.tc;this.steps++;
    }
    updateTexture(){const cell=this.params.mode==='cell',s=this.scales();for(let i=0;i<this.size;i++){const v=this.q[i];this.texture[i*4]=cell?clamp((v+1)*.5,0,1):(s.d+v)/22;this.texture[i*4+1]=v;this.texture[i*4+2]=this.pressure[i];this.texture[i*4+3]=1;}return this.texture;}
    metrics(){const s=this.scales(),m=mean(this.q);let min=Infinity,max=-Infinity,varSum=0;for(const v of this.q){min=Math.min(min,v);max=Math.max(max,v);varSum+=(v-this.target)**2;}return {massError:Math.abs(m-this.target),rms:Math.sqrt(varSum/this.size),min,max,projection:this.projection,maxProjection:this.maxProjection,time:this.time,steps:this.steps,capillaryLengthMm:s.lc*1000,referenceWavelengthMm:2*Math.PI*s.lc*1000,...this.state()};}
  }
  root.FerroLab=root.FerroLab||{};Object.assign(root.FerroLab,{Simulation,magnetization,magneticState,depthFactor,projectMass,MU0,langevin});
  if(typeof module!=='undefined')module.exports={Simulation,magnetization,magneticState,depthFactor,projectMass,MU0,langevin};
})(globalThis);
