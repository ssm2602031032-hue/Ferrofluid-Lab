(function (root) {
  'use strict';
  // Unit-normalised inverse transform; row/column work buffers are reused.
  class FFT2 {
    constructor(n) {
      if(n<4 || (n & (n-1))) throw Error('FFT size must be a power of two');
      this.n=n;this.tmpR=new Float64Array(n);this.tmpI=new Float64Array(n);
      this.reverse=new Uint32Array(n);const bits=Math.log2(n);
      for(let i=0;i<n;i++){let v=i,r=0;for(let j=0;j<bits;j++){r=(r<<1)|(v&1);v>>=1;}this.reverse[i]=r;}
    }
    line(r,im,inverse){
      const n=this.n;
      for(let i=0;i<n;i++){let j=this.reverse[i];if(j>i){[r[i],r[j]]=[r[j],r[i]];[im[i],im[j]]=[im[j],im[i]];}}
      for(let len=2;len<=n;len*=2){const a=(inverse?2:-2)*Math.PI/len,cr=Math.cos(a),ci=Math.sin(a);
        for(let st=0;st<n;st+=len){let wr=1,wi=0;for(let j=0;j<len/2;j++){const p=st+j,q=p+len/2,tr=wr*r[q]-wi*im[q],ti=wr*im[q]+wi*r[q];r[q]=r[p]-tr;im[q]=im[p]-ti;r[p]+=tr;im[p]+=ti;const w=wr;wr=w*cr-wi*ci;wi=w*ci+wi*cr;}}
      }
      if(inverse)for(let i=0;i<n;i++){r[i]/=n;im[i]/=n;}
    }
    transform(r,im,inverse=false){
      const n=this.n,rr=this.tmpR,ii=this.tmpI;
      for(let y=0;y<n;y++){const st=y*n;for(let x=0;x<n;x++){rr[x]=r[st+x];ii[x]=im[st+x];}this.line(rr,ii,inverse);for(let x=0;x<n;x++){r[st+x]=rr[x];im[st+x]=ii[x];}}
      for(let x=0;x<n;x++){for(let y=0;y<n;y++){rr[y]=r[y*n+x];ii[y]=im[y*n+x];}this.line(rr,ii,inverse);for(let y=0;y<n;y++){r[y*n+x]=rr[y];im[y*n+x]=ii[y];}}
      return r;
    }
  }
  root.FerroLab=root.FerroLab||{};root.FerroLab.FFT2=FFT2;
  if(typeof module!=='undefined')module.exports={FFT2};
})(globalThis);
