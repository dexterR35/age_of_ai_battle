import {BUILDINGS,UNITS} from '../../rules.mjs';
const iso=(x,y)=>({x:(x-y)*8,y:(x+y)*4});
export class Sprites {
  polygon(g,points,fill,stroke){g.beginPath();g.moveTo(points[0].x,points[0].y);for(let i=1;i<points.length;i++)g.lineTo(points[i].x,points[i].y);g.closePath();g.fillStyle=fill;g.fill();if(stroke){g.strokeStyle=stroke;g.stroke();}}
  tree(g,q,r,n){
    g.fillStyle='#4e603322';g.beginPath();g.ellipse(q.x+2,q.y+1,r*1.3,r*.5,0,0,Math.PI*2);g.fill();g.fillStyle='#817552';g.fillRect(q.x-.6,q.y-r,1.3,r+1);
    if(n>.43){this.polygon(g,[{x:q.x-r,y:q.y-r*.4},{x:q.x,y:q.y-r*3},{x:q.x+r,y:q.y-r*.4}],n>.7?'#244d2a':'#326234');this.polygon(g,[{x:q.x,y:q.y-r*3},{x:q.x+r,y:q.y-r*.4},{x:q.x,y:q.y-r*.1}],'#193b2580');}
    else{g.fillStyle=n>.2?'#43813b':'#528a3a';g.beginPath();g.arc(q.x-r*.4,q.y-r*1.4,r*.8,0,Math.PI*2);g.arc(q.x+r*.4,q.y-r*1.7,r*.9,0,Math.PI*2);g.arc(q.x,q.y-r*2.3,r*.8,0,Math.PI*2);g.fill();g.fillStyle='#80b65070';g.beginPath();g.arc(q.x-r*.4,q.y-r*2,r*.6,0,Math.PI*2);g.fill();}
  }
  rock(g,x,y,r,c){this.polygon(g,[{x:x-r,y},{x:x-r*.5,y:y-r},{x:x+r*.4,y:y-r*1.3},{x:x+r,y:y-r*.3},{x:x+r*.4,y:y+r*.3}],c);this.polygon(g,[{x,y:y-r*1.2},{x:x+r*.4,y:y-r*1.3},{x:x+r,y:y-r*.3},{x,y:y+r*.1}],'#6a746c40');}
  block(g,x,y,w,d,h,roof='#945939',wall='#cbbd98'){
    const P=(a,b,z=0)=>({x:x+a-b,y:y+(a+b)*.5-z});
    this.polygon(g,[P(-w,-d),P(w,-d),P(w,d),P(-w,d)],'#655d4555');
    this.polygon(g,[P(-w,d),P(w,d),P(w,d,h),P(-w,d,h)],wall);
    this.polygon(g,[P(w,d),P(w,-d),P(w,-d,h),P(w,d,h)],'#8a8e79');
    this.polygon(g,[P(-w-1,d+1,h),P(w+1,d+1,h),P(w+1,0,h+5),P(-w-1,0,h+5)],roof);
    this.polygon(g,[P(-w-1,0,h+5),P(w+1,0,h+5),P(w+1,-d-1,h),P(-w-1,-d-1,h)],'#756650');
    g.fillStyle='#3e433b';g.fillRect(x+w-d-2,y+(w+d)*.5-5,3,5);
  }
  barrel(g,x,y,r=2){g.fillStyle='#9b7548';g.fillRect(x-r,y-5,r*2,5);g.strokeStyle='#4c5045';g.lineWidth=.6;g.strokeRect(x-r,y-4,r*2,3);g.fillStyle='#c0a776';g.beginPath();g.ellipse(x,y-5,r,1,0,0,Math.PI*2);g.fill();}
  fence(g,x,y,w){g.strokeStyle='#ae9160';g.lineWidth=.8;for(let i=0;i<=w;i+=4){g.beginPath();g.moveTo(x+i,y+i*.5);g.lineTo(x+i,y+i*.5-5);g.stroke();}g.beginPath();g.moveTo(x,y-3);g.lineTo(x+w,y+w*.5-3);g.stroke();}
  flag(g,x,y,color){g.strokeStyle='#746b51';g.lineWidth=.7;g.beginPath();g.moveTo(x,y);g.lineTo(x,y-13);g.stroke();this.polygon(g,[{x,y:y-13},{x:x+7,y:y-11},{x,y:y-8}],color);}
  building(g,b,color,time){
    const q=iso(b.x,b.y),t=b.type;g.save();g.translate(q.x,q.y);
    const r=t==='town'||t==='wonder'?24:['farm','range','stable','workshop','barracks'].includes(t)?21:15;
    this.polygon(g,[{x:-r,y:0},{x:0,y:-r*.5},{x:r,y:0},{x:0,y:r*.5}],t==='farm'?'#887342':'#b4a47a');
    g.strokeStyle='#d4c49766';g.lineWidth=.7;g.beginPath();g.moveTo(-r,0);g.lineTo(0,r*.5);g.lineTo(r,0);g.stroke();
    if(b.remaining>0){
      for(let i=-1;i<=1;i++){g.strokeStyle='#79552e';g.lineWidth=1.3;g.beginPath();g.moveTo(i*r*.7,4);g.lineTo(i*r*.7,-19);g.stroke();}
      g.strokeStyle='#c8a675';g.strokeRect(-r*.7,-17,r*1.4,11);g.beginPath();g.moveTo(-r*.7,2);g.lineTo(r*.7,-17);g.stroke();this.barrel(g,-10,5);this.flag(g,r-2,0,color);
      g.fillStyle='#353c32';g.fillRect(-r,14,r*2,3);g.fillStyle=color;g.fillRect(-r,14,r*2*Math.max(0,1-b.remaining/b.total),3);g.restore();return;
    }
    switch(t){
      case 'house':
        this.block(g,-3,0,6,5,9,'#ae6540');this.block(g,8,2,3,3,5,'#ba8e50');g.fillStyle='#d0c5a8';g.fillRect(-3,-18,2,7);this.fence(g,-13,2,10);g.fillStyle=color;g.fillRect(-5,-6,3,2);break;
      case 'farm':
        for(let i=0;i<8;i++){g.strokeStyle=i%2?'#d9be66':'#a4ab53';g.lineWidth=1.7;g.beginPath();g.moveTo(-17+i*2.7,-i*1.35);g.lineTo(-2+i*2.7,7.5-i*1.35);g.stroke();}
        this.block(g,-9,-7,3,3,5,'#8f683b');this.fence(g,-19,0,16);this.barrel(g,12,1);break;
      case 'town':
        this.block(g,0,0,12,10,17,color,'#c4c5ac');this.block(g,-15,1,5,5,10,color);this.block(g,15,1,5,5,10,color);this.tower(g,0,-14,5,color);g.fillStyle='#374b46';g.fillRect(-3,-7,6,10);g.fillStyle='#d0c2a0';g.fillRect(-7,8,14,2);g.fillRect(-9,10,18,2);break;
      case 'barracks':
        this.block(g,-6,-3,11,5,11,color,'#a3a68e');this.block(g,12,-1,4,4,15,color);this.fence(g,-17,3,22);
        for(let i=0;i<4;i++){g.strokeStyle='#695632';g.beginPath();g.moveTo(-7+i*4,9);g.lineTo(-7+i*4,-1);g.stroke();this.polygon(g,[{x:-8+i*4,y:0},{x:-7+i*4,y:-4},{x:-6+i*4,y:0}],'#d9ded0');}this.flag(g,18,-8,color);break;
      case 'range':
        this.block(g,-8,-6,9,3,6,'#55744d');for(let i=0;i<3;i++){const x=-3+i*7,y=i*2;g.fillStyle='#d4bc81';g.beginPath();g.ellipse(x,y-4,3,4,0,0,Math.PI*2);g.fill();g.strokeStyle='#ac4f3d';g.lineWidth=1.4;g.beginPath();g.ellipse(x,y-4,1.4,2,0,0,Math.PI*2);g.stroke();g.fillStyle='#826039';g.fillRect(x,y,1,4);}this.fence(g,-19,2,14);break;
      case 'stable':
        this.block(g,-7,-4,12,5,10,'#b5894c');for(let i=0;i<3;i++){g.fillStyle='#383e32';g.fillRect(-13+i*7,-7+i*1.5,4,6);}this.fence(g,-11,6,23);this.fence(g,12,-5,8);g.fillStyle='#6c4c32';g.fillRect(5,0,7,3);g.fillRect(10,-4,2,6);g.fillRect(5,2,1,4);g.fillRect(10,2,1,4);break;
      case 'workshop':
        this.block(g,-5,-4,12,8,13,'#676e71','#a4a18b');g.fillStyle='#283c3b';g.fillRect(-7,-7,10,10);g.strokeStyle='#c8ac72';g.lineWidth=2;g.beginPath();g.moveTo(8,4);g.lineTo(18,-5);g.stroke();for(const x of [8,17]){g.fillStyle='#5c4935';g.beginPath();g.arc(x,6,3,0,Math.PI*2);g.fill();g.strokeStyle='#d2b77b';g.stroke();}this.flag(g,14,-13,color);break;
      case 'forge':
        this.block(g,-5,0,7,6,9,'#635956','#aaa08b');g.fillStyle='#7c7668';g.fillRect(3,-25,5,20);g.fillStyle='#e89b37';g.fillRect(1,-7,5,5);g.fillStyle='#3f4d50';g.fillRect(8,1,8,2);g.fillRect(11,2,3,5);g.fillRect(7,-1,9,2);break;
      case 'refinery': case 'mint':
        this.block(g,-2,0,9,7,12,t==='mint'?'#bda35a':'#566b66','#aaa18a');for(let i=0;i<(t==='mint'?1:2);i++){g.fillStyle='#8b8371';g.fillRect(i*8,-29+i*5,4,21);g.fillStyle='#cf8d37';g.fillRect(-9+i*7,-5,4,4);g.fillStyle='#c5c3af55';g.beginPath();g.arc(i*8+2+Math.sin(time/800),-33+i*5,3,0,Math.PI*2);g.fill();}if(t==='mint'){g.fillStyle='#e6c34c';for(let i=0;i<3;i++)g.fillRect(9+i*2,4-i*2,4,2);}break;
      case 'quarry': case 'ironmine': case 'goldmine':
        this.rock(g,-8,-2,10,'#939b8c');this.rock(g,3,-5,11,'#717f79');g.fillStyle='#273630';g.fillRect(-3,-12,8,11);g.strokeStyle='#947342';g.lineWidth=2;g.strokeRect(-4,-13,10,13);g.strokeStyle='#b8a375';g.lineWidth=1;g.beginPath();g.moveTo(-1,0);g.lineTo(5,10);g.moveTo(4,-1);g.lineTo(10,9);g.stroke();if(t!=='quarry'){g.fillStyle=t==='goldmine'?'#e7bf47':'#cc8354';for(let i=0;i<4;i++)g.fillRect(-10+i*5,-7+(i%2)*4,3,2);}this.barrel(g,11,3);break;
      case 'lumbercamp':
        this.block(g,-6,-4,8,4,7,'#6e8050');for(let i=0;i<5;i++){g.strokeStyle='#785334';g.lineWidth=3;g.beginPath();g.moveTo(-4+i*3,5-i);g.lineTo(5+i*3,1-i);g.stroke();g.fillStyle='#dbbb7e';g.beginPath();g.arc(-4+i*3,5-i,1.5,0,Math.PI*2);g.fill();}break;
      case 'depot':
        this.block(g,-5,-3,9,5,8,'#85805e');for(let i=0;i<3;i++){g.fillStyle='#b08f55';g.fillRect(-5+i*6,3-i,4,4);g.strokeStyle='#665b3e';g.strokeRect(-5+i*6,3-i,4,4);}this.barrel(g,11,-2);break;
      case 'granary':
        for(const x of [-6,5]){g.fillStyle='#c3ad76';g.fillRect(x-4,-13,8,17);g.fillStyle='#8e794e';g.beginPath();g.ellipse(x,4,4,2,0,0,Math.PI*2);g.fill();this.polygon(g,[{x:x-5,y:-13},{x,y:-20},{x:x+5,y:-13}],'#b18c43');}this.barrel(g,11,6);break;
      case 'market':
        this.block(g,0,-6,7,5,9,'#a77d4d');for(let i=0;i<3;i++){let x=-14+i*10,y=4-Math.abs(i-1)*3;this.block(g,x,y,4,3,3,i%2?color:'#e3ce92');g.fillStyle=['#ce6e3d','#82a74a','#dfbf50'][i];g.fillRect(x-3,y-3,5,2);}break;
      case 'treasury':
        this.block(g,0,0,10,7,13,'#b19b54','#b5bba8');g.fillStyle='#3d4d48';g.fillRect(-4,-8,7,8);g.strokeStyle='#cfbf77';g.strokeRect(-3,-7,5,6);for(let i=0;i<3;i++){g.fillStyle='#e8c45c';g.fillRect(8+i*2,4-i*2,4,2);}break;
      case 'engineering':
        this.block(g,-5,0,8,6,11,'#5b7984');g.strokeStyle='#bd9d62';g.lineWidth=2;g.beginPath();g.moveTo(9,5);g.lineTo(9,-23);g.lineTo(20,-17);g.lineTo(9,-15);g.stroke();g.lineWidth=.6;g.beginPath();g.moveTo(18,-18);g.lineTo(18,-1);g.stroke();this.barrel(g,14,5);break;
      case 'embassy':
        this.block(g,0,0,9,7,13,'#81789d');this.flag(g,-12,-5,'#e5ce88');this.flag(g,12,-5,color);g.fillStyle='#e7dcb6';g.fillRect(-5,-8,2,7);g.fillRect(3,-4,2,7);break;
      case 'hospital':
        this.block(g,0,0,12,7,12,'#e2d6ae','#d4cfba');g.fillStyle='#497d69';g.fillRect(-2,-17,4,11);g.fillRect(-5,-14,10,4);g.fillStyle='#74914c';g.fillRect(10,4,8,3);break;
      case 'library':
        this.block(g,0,-2,10,6,12,'#54717d');for(let i=0;i<4;i++){g.fillStyle='#e0d5b5';g.fillRect(-10+i*5,-8+i*1.2,1.7,8);}g.fillStyle='#e7dbb1';g.fillRect(-3,-19,6,4);g.strokeStyle='#645641';g.beginPath();g.moveTo(0,-19);g.lineTo(0,-15);g.stroke();break;
      case 'academy':
        this.block(g,-8,-1,6,5,11,'#6f648a');this.block(g,9,-1,6,5,11,'#6f648a');this.block(g,0,-9,8,4,16,color);g.fillStyle='#d7bc63';g.beginPath();g.arc(0,-28,3,0,Math.PI*2);g.fill();break;
      case 'government':
        this.block(g,0,-1,12,7,15,color);for(let i=0;i<5;i++){g.fillStyle='#e2d8bb';g.fillRect(-13+i*5,-6+i,2,9);}g.fillStyle='#d4c09a';g.fillRect(-9,9,18,2);this.flag(g,0,-23,color);break;
      case 'temple':
        this.block(g,0,0,7,10,13,'#d5bc80');g.fillStyle='#d4cab0';g.fillRect(-4,-27,8,17);this.polygon(g,[{x:-6,y:-27},{x:0,y:-41},{x:6,y:-27}],color);g.fillStyle='#48554f';g.fillRect(-1,-22,2,4);break;
      case 'tower': case 'outpost': this.tower(g,0,0,t==='tower'?8:6,color);if(t==='outpost')this.fence(g,-12,3,16);break;
      case 'wall':
        this.block(g,0,0,14,2,12,'#b9b6a0','#a4aa9a');for(let i=0;i<6;i++){g.fillStyle='#d4cdb5';g.fillRect(-15+i*5,-15+i*2,3,4);}break;
      case 'keep':
        this.block(g,0,0,11,9,22,'#8c9590','#9da9a5');for(const x of [-14,14])this.tower(g,x,0,6,color);this.tower(g,0,-17,7,color);break;
      case 'wonder':
        for(let i=0;i<4;i++){const w=21-i*4;this.polygon(g,[{x:-w,y:-i*5},{x:0,y:-w*.5-i*5},{x:w,y:-i*5},{x:0,y:w*.5-i*5}],i%2?'#d2be87':'#e8d8a9');}g.fillStyle='#d3b05c';g.fillRect(-3,-42,6,25);this.polygon(g,[{x:-5,y:-42},{x:0,y:-51},{x:5,y:-42}],'#f0d98d');break;
      default:this.block(g,0,0,7,6,10,color);
    }
    if(!['town','farm','tower','outpost','wonder'].includes(t))this.flag(g,r-3,-2,color);
    if(b.level>1){g.fillStyle='#f5e8b7';g.font='bold 5px sans-serif';g.fillText('•'.repeat(b.level),-5,r*.5+4);}
    g.restore();
  }
  tower(g,x,y,r,color){
    this.polygon(g,[{x:x-r,y:y-4},{x,y:y-r*.5-4},{x:x+r,y:y-4},{x,y:y+r*.5-4}],'#e0d9bf');
    this.polygon(g,[{x:x-r,y:y-17},{x,y:y-14},{x,y:y+3},{x:x-r,y}],'#aab1b4');
    this.polygon(g,[{x,y:y-14},{x:x+r,y:y-17},{x:x+r,y},{x,y:y+3}],'#7b8790');
    this.polygon(g,[{x:x-r-1,y:y-17},{x,y:y-23},{x:x+r+1,y:y-17},{x,y:y-12}],color);
    g.fillStyle='#74775f';g.fillRect(x-3,y-10,2,4);g.strokeStyle='#72735a';g.lineWidth=.7;g.beginPath();g.moveTo(x,y-22);g.lineTo(x,y-32);g.stroke();g.fillStyle=color;g.beginPath();g.moveTo(x,y-32);g.lineTo(x+8,y-30);g.lineTo(x,y-27);g.fill();
  }
  unit(g,u,p,time){
    const q=iso(u.x,u.y);g.save();g.translate(q.x,q.y);
    const wave=Math.sin(time/110+Number(u.id.slice(1)))*.6;
    g.fillStyle='#3c4a2d27';g.beginPath();g.ellipse(0,1,u.type==='ram'?4:2.4,1.1,0,0,Math.PI*2);g.fill();
    if(u.type==='ram'){
      g.fillStyle='#6f654d';g.fillRect(-4,-5,8,4);g.strokeStyle='#bdb08d';g.lineWidth=1;g.beginPath();g.moveTo(-4,-6);g.lineTo(4,-3);g.stroke();g.fillStyle=p.color;g.fillRect(-2,-6,4,1);g.fillStyle='#535942';g.fillRect(-4,0,2,2);g.fillRect(3,-1,2,2);
    }else{
      if(['knight','scout'].includes(u.type)){g.fillStyle=u.type==='knight'?'#6b6554':'#9a8e6b';g.beginPath();g.ellipse(0,-2,4,2,0,0,Math.PI*2);g.fill();g.fillRect(2,-5,2,3);g.fillRect(-3,0,1,2+wave);g.fillRect(2,0,1,2-wave);}
      else{g.fillStyle='#676e52';g.fillRect(-1.4,-1,1,2+wave);g.fillRect(.7,-1,1,2-wave);}
      g.fillStyle=p.color;g.fillRect(-1.5,-5,3,4);
      g.fillStyle='#decba2';g.beginPath();g.arc(0,-6,1.4,0,Math.PI*2);g.fill();
      if(!['worker','scout'].includes(u.type)){g.fillStyle='#abb0a0';g.fillRect(-1.5,-7,3,1.2);}
      g.strokeStyle=u.type==='spearman'?'#6b6c53':'#a9ad93';g.lineWidth=.7;
      if(u.type==='spearman'){g.beginPath();g.moveTo(2,0);g.lineTo(3,-10);g.stroke();g.fillStyle='#c7c7ae';g.fillRect(2.6,-11,1,2);}
      if(u.type==='archer'){g.strokeStyle='#827c57';g.beginPath();g.arc(2,-4,2,-Math.PI/2,Math.PI/2);g.stroke();}
      if(u.type==='worker'&&u.job==='wood'&&!u.returning){g.strokeStyle='#846238';g.lineWidth=.9;g.beginPath();g.moveTo(2,-3);g.lineTo(5+Math.sin(time/140)*2,-7);g.stroke();g.fillStyle='#b7c1b6';g.fillRect(4+Math.sin(time/140)*2,-8,2,2);}
      if(u.type==='worker'&&u.job?.startsWith('department:')){g.fillStyle='#e1d5a4';g.fillRect(1,-5,3,2);}
      if(u.type==='worker'&&u.carry>2){g.fillStyle={wood:'#8f8056',stone:'#9b9b88',ore:'#8b8877',gold:'#c6aa63',food:'#c8b578'}[u.resource]||'#bbad81';g.fillRect(1,-4,2.5,3);}
    }
    if(u.hp<u.maxHp*.95){g.fillStyle='#e9e9d0';g.fillRect(-3,-10,6,.9);g.fillStyle=p.color;g.fillRect(-3,-10,6*u.hp/u.maxHp,.9);}
    g.restore();
  }
}
