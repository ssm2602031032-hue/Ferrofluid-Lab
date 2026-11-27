(function(root){
 'use strict';
 const vertex=`#version 300 es
 in vec2 position;out vec2 uv;void main(){uv=position*.5+.5;gl_Position=vec4(position,0,1);}`;
 const fragment=`#version 300 es
 precision highp float;
 in vec2 uv;out vec4 frag;
 uniform vec2 resolution;uniform sampler2D dataTex;
 uniform float roughness,ior,exposure,angle,elevation,zoom,texel,cellGap;
 uniform int mode,amber,inclusion,showField;uniform vec3 magnet;
 const float PI=3.141592653589793;
 vec4 sampleData(vec2 p){vec2 pos=clamp((p+.5)/texel-.5,vec2(0),vec2(1./texel-1.));ivec2 a=ivec2(floor(pos)),lim=textureSize(dataTex,0)-1;vec2 f=fract(pos);return mix(mix(texelFetch(dataTex,a,0),texelFetch(dataTex,min(a+ivec2(1,0),lim),0),f.x),mix(texelFetch(dataTex,min(a+ivec2(0,1),lim),0),texelFetch(dataTex,min(a+ivec2(1,1),lim),0),f.x),f.y);}
 float heightAt(vec2 p){return mode==0?max(.0001,sampleData(p).r):.008+cellGap*.007;}
 float densityAt(vec2 p){return smoothstep(.18,.82,sampleData(p).r);}
 vec3 sky(vec3 d){
   vec3 c=mix(vec3(.045,.052,.058),vec3(.22,.235,.25),smoothstep(-.2,.8,d.y));
   float s1=1.-smoothstep(0.,.025,max(abs(d.x+.36)-.29,abs(d.z+.25)-.19));
   float s2=1.-smoothstep(0.,.016,max(abs(d.x-.62)-.055,abs(d.z-.05)-.47));
   float s3=1.-smoothstep(0.,.02,max(abs(d.x+.1)-.47,abs(d.z-.63)-.04));
   c+=vec3(4.2,4.05,3.8)*s1*smoothstep(.15,.7,d.y);
   c+=vec3(2.0,2.25,2.6)*s2*smoothstep(.05,.6,d.y);
   c+=vec3(1.8)*s3*smoothstep(.1,.7,d.y);return c;
 }
 vec3 envRough(vec3 r,float a){vec3 t=normalize(cross(r,abs(r.y)<.95?vec3(0,1,0):vec3(1,0,0))),b=cross(r,t);float spread=a*a*.9;return (sky(r)*2.+sky(normalize(r+t*spread))+sky(normalize(r-t*spread))+sky(normalize(r+b*spread))+sky(normalize(r-b*spread)))/6.;}
 vec3 fresnel(float cosine,float eta){float f=(eta-1.)/(eta+1.);f*=f;return vec3(f+(1.-f)*pow(1.-clamp(cosine,0.,1.),5.));}
 float G1(float nv,float a){float a2=a*a;return 2.*nv/(nv+sqrt(a2+(1.-a2)*nv*nv));}
 vec3 ggx(vec3 n,vec3 v,vec3 l,vec3 radiance,float a,float eta){
  vec3 h=normalize(v+l);float nl=max(dot(n,l),0.),nv=max(dot(n,v),.001),nh=max(dot(n,h),0.);a=max(.035,a*a);float den=nh*nh*(a*a-1.)+1.;float D=a*a/(PI*den*den);return radiance*fresnel(dot(v,h),eta)*(D*G1(nv,a)*G1(nl,a)/max(4.*nv*nl,.00001))*nl;
 }
 vec3 floorColor(vec2 p){float vign=1.-.14*min(1.,length(p));return vec3(.56,.57,.565)*vign;}
 float intersectPlane(vec3 ro,vec3 rd,float h){return (h-ro.y)/rd.y;}
 vec2 boxRange(vec3 ro,vec3 rd){vec3 a=(vec3(-.5,0,-.5)-ro)/rd,b=(vec3(.5,.26,.5)-ro)/rd;vec3 lo=min(a,b),hi=max(a,b);return vec2(max(max(lo.x,lo.y),lo.z),min(min(hi.x,hi.y),hi.z));}
 float hitSurface(vec3 ro,vec3 rd){
  vec2 rg=boxRange(ro,rd);float t=max(.001,rg.x),end=rg.y;if(end<t)return -1.;float prev=t;
  for(int i=0;i<210;i++){if(t>end)break;vec3 p=ro+rd*t;float diff=p.y-heightAt(p.xz);if(diff<.00025){float lo=prev,hi=t;for(int j=0;j<7;j++){float mid=(lo+hi)*.5;vec3 q=ro+rd*mid;if(q.y>heightAt(q.xz))lo=mid;else hi=mid;}return (lo+hi)*.5;}prev=t;t+=clamp(diff*.24,.00055,.012);}
  return -1.;
 }
 vec3 normalAt(vec2 p){float h=texel;float dx=heightAt(p+vec2(h,0))-heightAt(p-vec2(h,0)),dz=heightAt(p+vec2(0,h))-heightAt(p-vec2(0,h));return normalize(vec3(-dx,2.*h,-dz));}
 float shadow(vec3 p,vec3 l){float shade=1.,t=.004;for(int i=0;i<28;i++){vec3 q=p+l*t;if(max(abs(q.x),abs(q.z))>.5)break;float d=q.y-heightAt(q.xz);shade=min(shade,12.*d/t);t+=.008;}return clamp(shade,.12,1.);}
 vec3 topMaterial(vec3 p,vec3 rd){
  vec3 n=normalAt(p.xz),v=-rd;float nv=max(dot(n,v),.0001);vec3 F=fresnel(nv,ior);vec3 refl=envRough(reflect(rd,n),roughness);
  float occ=1.;for(int i=1;i<=3;i++){float h=float(i)*.012;float nearby=heightAt(p.xz+n.xz*h);occ-=max(nearby-p.y,0.)*.9;}
  vec3 col;
  if(mode==0){
   // Strongly absorbing, dielectric oil: finite Fresnel reflection, no chrome.
   col=refl*F*clamp(occ,.45,1.);
   vec3 l=normalize(vec3(-.4,1.,.6));col+=ggx(n,v,l,vec3(.8),roughness,ior)*shadow(p,l);
   col+=(vec3(.004,.003,.002)*(1.-F))*max(dot(n,l),0.);
  }else{
   vec3 refr=refract(rd,vec3(0,1,0),1./1.5);float path=cellGap*.001/max(abs(refr.y),.12);
   vec2 coord=p.xz+refr.xz*(.008/max(abs(refr.y),.1));float c=densityAt(coord);
   // Beer-Lambert: absorption in the fluid layer, separate from glass Fresnel.
   vec3 absorption=mix(amber==1?vec3(18.,190.,950.):vec3(2.,3.,5.),vec3(16000.,19000.,22000.),c);
   vec3 trans=exp(-absorption*path);vec3 backing=amber==1?vec3(1.9,.96,.06):vec3(.83,.85,.84);
   col=backing*trans*(1.-fresnel(nv,1.5))+refl*fresnel(nv,1.5);
   // Oil-rich domains are nearly opaque; use their smooth interface normals.
   float gx=densityAt(coord+vec2(texel,0))-densityAt(coord-vec2(texel,0));float gz=densityAt(coord+vec2(0,texel))-densityAt(coord-vec2(0,texel));
   vec3 meniscus=normalize(vec3(-gx*.12,1.,-gz*.12));col=mix(col,col+envRough(reflect(rd,meniscus),roughness)*fresnel(dot(meniscus,v),ior)*.35,4.*c*(1.-c));
  }
  if(showField==1){float pressure=sampleData(p.xz).b;col=mix(col,vec3(.18,.55,.65),clamp(abs(pressure)*.1,0.,.55));}
  return col;
 }
 bool sphere(vec3 ro,vec3 rd,vec3 center,float r,out float t){vec3 oc=ro-center;float b=dot(oc,rd),d=b*b-dot(oc,oc)+r*r;t=-b-sqrt(max(0.,d));return d>0.&&t>0.;}
 vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
 void main(){
  vec2 px=(uv*2.-1.);px.x*=resolution.x/resolution.y;
  vec3 ro=vec3(sin(angle)*cos(elevation),sin(elevation),cos(angle)*cos(elevation))*zoom+vec3(0,.02,0);vec3 forward=normalize(vec3(0,.015,0)-ro);vec3 right=normalize(cross(forward,vec3(0,1,0))),up=cross(right,forward);vec3 rd=normalize(forward*2.05+right*px.x+up*px.y);
  float tf=intersectPlane(ro,rd,-.008);vec3 fp=ro+rd*tf;vec3 color=floorColor(fp.xz);float ambientShadow=exp(-dot(fp.xz,fp.xz)*5.)*.22;color*=1.-ambientShadow;
  // Thin glass tray lip and its contact shadow, visible as a support.
  if(max(abs(fp.x),abs(fp.z))<.528&&max(abs(fp.x),abs(fp.z))>.497){vec3 n=vec3(0,1,0);color=mix(color,sky(reflect(rd,n)),.3)+vec3(.13);}
  float t=hitSurface(ro,rd);if(t>0.){vec3 p=ro+rd*t;color=topMaterial(p,rd);}
  if(mode==1&&inclusion==1){
   // Explicit optical reference: a fixed plano-convex lens ABOVE the cell,
   // not a claim that the unidentified transparent object is an air bubble.
   vec3 center=vec3(-.1,.012,.08);float radius=.09,ts;
   if(sphere(ro,rd,center,radius,ts)&&(t<0.||ts<t)){
    vec3 p=ro+rd*ts,n=normalize(p-center),ray=refract(rd,n,1./1.47);float outT=intersectPlane(p,ray,.012);vec3 exitP=p+ray*outT;vec3 outRay=refract(ray,vec3(0,1,0),1.47);
    if(dot(outRay,outRay)<.1){color=sky(reflect(ray,vec3(0,1,0)));}else{float plane=intersectPlane(exitP,outRay,.008);vec3 target=exitP+outRay*plane;vec3 under=topMaterial(vec3(target.x,.008,target.z),outRay);vec3 F=fresnel(max(dot(-rd,n),0.),1.47);color=under*(1.-F)*(1.-fresnel(max(-ray.y,0.),1.47))+sky(reflect(rd,n))*F;}
   }
  }
  color=pow(aces(max(color,0.)*exposure),vec3(1./2.2));frag=vec4(color,1.);
 }`;
 class Renderer{
  constructor(canvas,n){
   this.canvas=canvas;const gl=this.gl=canvas.getContext('webgl2',{antialias:false,preserveDrawingBuffer:true,alpha:false});if(!gl)throw Error('需要支持 WebGL2 的浏览器');
   const compile=(type,source)=>{let sh=gl.createShader(type);gl.shaderSource(sh,source);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(sh));return sh;};
   const program=this.program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
   gl.useProgram(program);const buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);const pos=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
   this.texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
   gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,n,n,0,gl.RGBA,gl.FLOAT,null);
   // Shader uses explicit bilinear fetches for portable float texture sampling.
   this.floatLinear=!!gl.getExtension('OES_texture_float_linear');if(this.floatLinear){gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);}
   this.uniforms={};for(const name of ['resolution','dataTex','roughness','ior','exposure','angle','elevation','zoom','texel','cellGap','mode','amber','inclusion','showField','magnet'])this.uniforms[name]=gl.getUniformLocation(program,name);this.n=n;this.angle=.35;this.elevation=.67;this.zoom=1.5;this.exposure=1.15;this.quality=1;this.showField=false;
  }
  draw(sim){const gl=this.gl,c=this.canvas;const ratio=Math.min(window.devicePixelRatio||1,1.5)*this.quality,w=Math.max(1,Math.floor(c.clientWidth*ratio)),h=Math.max(1,Math.floor(c.clientHeight*ratio));if(c.width!==w||c.height!==h){c.width=w;c.height=h;gl.viewport(0,0,w,h);}gl.useProgram(this.program);gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,this.n,this.n,gl.RGBA,gl.FLOAT,sim.updateTexture());const u=this.uniforms,p=sim.params;gl.uniform2f(u.resolution,w,h);gl.uniform1i(u.dataTex,0);for(const [key,val] of Object.entries({roughness:p.roughness,ior:p.ior,exposure:this.exposure,angle:this.angle,elevation:this.elevation,zoom:this.zoom,texel:1/this.n,cellGap:p.gap}))gl.uniform1f(u[key],val);gl.uniform1i(u.mode,p.mode==='cell'?1:0);gl.uniform1i(u.amber,p.amber?1:0);gl.uniform1i(u.inclusion,p.inclusion?1:0);gl.uniform1i(u.showField,this.showField?1:0);gl.uniform3f(u.magnet,sim.magnet.x,sim.magnet.z,sim.magnet.active?1:0);gl.drawArrays(gl.TRIANGLES,0,6);}
 }
 root.FerroLab.Renderer=Renderer;
})(globalThis);
