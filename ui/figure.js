// ZcashFlight walker v2: one solid ink silhouette built from tapered limbs.
// Faces +x. Ground is y=0, y grows downward. About 64 units tall standing.
(function(root){
  var D=Math.PI/180;
  function V(x,y){return {x:x,y:y}}
  function add(a,b){return V(a.x+b.x,a.y+b.y)}
  function mul(a,k){return V(a.x*k,a.y*k)}
  function dirFromVertical(deg){return V(Math.sin(deg*D),Math.cos(deg*D))} // 0 = straight down, + = forward
  function f(n){return n.toFixed(2)}
  // filled tapered capsule from a (width wa) to b (width wb)
  function cap(a,b,wa,wb){
    var dx=b.x-a.x,dy=b.y-a.y,l=Math.hypot(dx,dy)||1e-6,nx=-dy/l,ny=dx/l,ra=wa/2,rb=wb/2;
    var a1=V(a.x+nx*ra,a.y+ny*ra),a2=V(a.x-nx*ra,a.y-ny*ra),b1=V(b.x+nx*rb,b.y+ny*rb),b2=V(b.x-nx*rb,b.y-ny*rb);
    return 'M'+f(a1.x)+' '+f(a1.y)+'L'+f(b1.x)+' '+f(b1.y)+'A'+f(rb)+' '+f(rb)+' 0 0 0 '+f(b2.x)+' '+f(b2.y)+'L'+f(a2.x)+' '+f(a2.y)+'A'+f(ra)+' '+f(ra)+' 0 0 0 '+f(a1.x)+' '+f(a1.y)+'Z';
  }
  function circ(c,r){return 'M'+f(c.x-r)+' '+f(c.y)+'a'+f(r)+' '+f(r)+' 0 1 0 '+f(2*r)+' 0a'+f(r)+' '+f(r)+' 0 1 0 '+f(-2*r)+' 0Z'}
  function ell(c,rx,ry){return 'M'+f(c.x-rx)+' '+f(c.y)+'a'+f(rx)+' '+f(ry)+' 0 1 0 '+f(2*rx)+' 0a'+f(rx)+' '+f(ry)+' 0 1 0 '+f(-2*rx)+' 0Z'}
  function rot(v,deg){var c=Math.cos(deg*D),s=Math.sin(deg*D);return V(v.x*c+v.y*s,-v.x*s+v.y*c)} // + = counter-clockwise on screen
  // keyframe interpolation with smooth easing
  function kf(keys,t){t=((t%1)+1)%1;for(var i=0;i<keys.length-1;i++){var a=keys[i],b=keys[i+1];if(t>=a[0]&&t<=b[0]){var u=(t-a[0])/(b[0]-a[0]||1);u=(1-Math.cos(u*Math.PI))/2;return a[1]+(b[1]-a[1])*u}}return keys[0][1]}
  var THIGH=[[0,21],[0.3,5],[0.55,-15],[0.62,-16],[0.72,-3],[0.86,16],[1,21]];
  var KNEE=[[0,3],[0.12,11],[0.35,4],[0.55,14],[0.66,34],[0.74,40],[0.86,12],[1,3]];
  var FOOT=[[0,14],[0.1,0],[0.45,0],[0.6,-24],[0.7,-26],[0.82,-6],[0.92,8],[1,14]];
  var L1=16,L2=16.4,A1=10.8,A2=9.8;

  function leg(hip,a,k,fa){
    var knee=add(hip,mul(dirFromVertical(a),L1)), ank=add(knee,mul(dirFromVertical(a-k),L2));
    var heel=add(ank,rot(V(-1.1,1.5),fa)), toe=add(ank,rot(V(4.6,1.7),fa));
    return {hip:hip,knee:knee,ank:ank,heel:heel,toe:toe,low:Math.max(heel.y+0.9,toe.y+0.45)};
  }
  function legPath(g){
    return cap(g.hip,g.knee,4.4,3.1)+cap(g.knee,g.ank,3.2,1.75)+cap(V(g.heel.x,g.heel.y-0.25),g.toe,2.3,1.1)+cap(g.ank,V(g.heel.x+0.4,g.heel.y-0.35),1.9,2.1);
  }
  function arm(sh,a,k){
    var el=add(sh,mul(dirFromVertical(a),A1)), h=add(el,mul(dirFromVertical(a+k),A2));
    return cap(sh,el,2.7,2.0)+cap(el,h,2.0,1.45)+circ(add(h,mul(dirFromVertical(a+k),0.6)),1.2);
  }

  function pose(o){
    o=o||{};var kind=o.kind||'stand',p=o.p||0;
    var lean,legsA,armsA,hip,swing=[0,0],sit=kind==='sit';
    if(kind==='walk'){
      lean=3.5;
      legsA=[0,0.5].map(function(off){var t=p+off;return [kf(THIGH,t),kf(KNEE,t),kf(FOOT,t)]});
      armsA=[[-0.8*legsA[0][0],12+Math.max(0,-0.8*legsA[0][0])*0.7],[-0.8*legsA[1][0],12+Math.max(0,-0.8*legsA[1][0])*0.7]];
      swing=[legsA[0][0]*0.05,legsA[1][0]*0.05];
    }else if(sit){
      lean=-2;legsA=[[84,88,-18],[78,96,-24]];armsA=[[22,52],[16,58]];
    }else{
      lean=0.6;legsA=[[6,8,0],[-3,0,0]];armsA=[[-7,8],[6,12]];
    }
    // place hip so the lowest foot touches the ground (or sit on the line)
    var probe=legsA.map(function(l,i){return leg(V(i?-0.4:0.4,0),l[0],l[1],l[2])});
    var hy=sit?-1.5:-Math.max(probe[0].low,probe[1].low);
    hip=V(0,hy);
    var legs=legsA.map(function(l,i){return leg(V(hip.x+(i?-0.4:0.4),hip.y),l[0],l[1],l[2])});
    var U=V(Math.sin(lean*D),-Math.cos(lean*D)), R=V(Math.cos(lean*D),Math.sin(lean*D));
    function at(u,h){return add(hip,add(mul(R,u),mul(U,h)))}
    var sh=at(0.5,17.6), head=at(1.2+(kind==='walk'?0.5:0),25.1);
    // coat
    var hf=sit?at(13,-0.6):at(6.6+swing[0],-9.6), hb=sit?at(-4.6,-1.2):at(-6+swing[1],-9.2);
    var coat='M'+xy(at(-4.1,18.6))+'Q'+xy(at(0.3,20.9))+' '+xy(at(4.5,18.3))+'Q'+xy(at(5.1,13))+' '+xy(at(3.5,7.6))+'L'+xy(hf)+'Q'+xy(sit?at(5,-2.6):at(0.5,-11.2))+' '+xy(hb)+'L'+xy(at(-3.4,7.9))+'Q'+xy(at(-4.8,13))+' '+xy(at(-4.1,18.6))+'Z';
    function xy(v){return f(v.x)+' '+f(v.y)}
    var neck=cap(at(0.4,18.4),add(head,mul(U,-2.6)),3.1,2.5);
    var hd=ell(head,3.4,3.9)+ell(add(head,V(-0.8,-0.4)),3.45,3.75)+circ(add(head,add(mul(R,-3.4),mul(U,1.6))),1.95);
    var far=arm(at(0.2,17.2),armsA[1][0],armsA[1][1]), near=arm(sh,armsA[0][0],armsA[0][1]);
    var parts=[far,legPath(legs[1]),legPath(legs[0]),coat,neck,hd,near].join('').split('Z').filter(Boolean).map(function(d){return '<path d="'+d+'Z"/>'}).join('');
    var out='';
    if(!sit)out+='<g class="w-shadow" transform="matrix(1 0 1.3 -0.12 0 0)">'+parts+'</g>';
    out+='<g class="w-fill">'+parts+'</g>';
    // an original crown: five low points with round tips, ink only, floating just above the head
    var ct=-4*D, CR=V(R.x*Math.cos(ct)-R.y*Math.sin(ct),R.x*Math.sin(ct)+R.y*Math.cos(ct)), CU=V(U.x*Math.cos(ct)-U.y*Math.sin(ct),U.x*Math.sin(ct)+U.y*Math.cos(ct));
    function cw(u,h){return add(head,add(mul(CR,u),mul(CU,h+5.6+(o.float||0))))}
    // a Basquiat crown: three points, gold, a heavy dark outline and a few scratches, floating above the head
    var Z=1.6,K=[[-4,0],[-4,5.4],[-1.6,2.1],[0,6.0],[1.6,2.1],[4,5.4],[4,0]].map(function(k){return [k[0]*Z,k[1]*Z]}), cp='M'+K.map(function(k){return xy(cw(k[0],k[1]))}).join('L')+'Z';
    var sc=[[[-2.9,0.7],[1.3,2.6]],[[0.3,0.5],[1.9,2.9]],[[-1.2,2.1],[2.6,0.9]]].map(function(l){return 'M'+xy(cw(l[0][0]*Z,l[0][1]*Z))+'L'+xy(cw(l[1][0]*Z,l[1][1]*Z))}).join('');
    out+='<g class="w-crown"><path class="w-crown-fill" d="'+cp+'"/><path class="w-crown-scratch" d="'+sc+'"/></g>';
    return out;
  }
  var STYLE='.w-crown-fill{fill:#e3a13b;stroke:#141210;stroke-width:1.3;stroke-linejoin:round}.w-crown-scratch{fill:none;stroke:#141210;stroke-width:.6;stroke-linecap:round}.w-fill{fill:currentColor}.w-shadow{fill:currentColor;opacity:.2}.w-mark{fill:none;stroke:currentColor;stroke-width:1.3;stroke-linecap:round}';
  root.ZFWalker={pose:pose,STYLE:STYLE};
})(typeof window!=='undefined'?window:globalThis);
