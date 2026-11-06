/* Editable 3:4 covers. Real lettering with the bundled Lora font. */
(function(root){
  'use strict';
  const W=1500,H=2000,CX=750,CY=990,RX=450,RY=220;
  const themes=[
    {id:'dark-large',label:'Тёмная',detail:'Для больших книг',bg:'#351e29',stripe:'#402631',spine:'#281720',panel:'#eee5d8',panelEdge:'#9a847c',ink:'#39272d',footer:'#e7dacd'},
    {id:'medium',label:'Дымчато-голубая',detail:'Для средних книг',bg:'#98a8b0',stripe:'#acbac1',spine:'#85969f',panel:'#f1eade',panelEdge:'#969d9d',ink:'#2e3c43',footer:'#35454d'},
    {id:'light-small',label:'Слоновая кость',detail:'Для небольших книг',bg:'#e7e0d5',stripe:'#f5f0e7',spine:'#d9d0c2',panel:'#faf6ed',panelEdge:'#b2a292',ink:'#3d302b',footer:'#57483e'}
  ];
  const rgb=s=>[1,3,5].map(i=>parseInt(s.slice(i,i+2),16));
  function wrap(c,text,width){
    const lines=[];
    for(const paragraph of String(text).split('\n')){
      let line='';
      for(const word of paragraph.trim().split(/\s+/).filter(Boolean)){
        if(c.measureText(word).width>width){
          if(line)lines.push(line);line='';
          for(const ch of word){if(line&&c.measureText(line+ch).width>width){lines.push(line);line='';}line+=ch;}
        }else if(!line)line=word;
        else if(c.measureText(line+' '+word).width<=width)line+=' '+word;
        else{lines.push(line);line=word;}
      }
      if(line)lines.push(line);
    }
    return lines;
  }
  const fonts=root.CoverFonts||[{id:'lora',name:'Lora',family:'LoraCover',weight:500}];
  const getFont=id=>fonts.find(f=>f.id===id)||fonts[0];
  function layout(c,title,author,options={}){
    const font=getFont(options.fontId);
    const fixedTitle=Number.isFinite(options.titleSize)?options.titleSize:null;
    const fixedAuthor=Number.isFinite(options.authorSize)?options.authorSize:null;
    if((fixedTitle!==null&&(fixedTitle<28||fixedTitle>150))||(fixedAuthor!==null&&(fixedAuthor<18||fixedAuthor>80)))throw new Error('Выберите размер названия от 28 до 150, автора — от 18 до 80.');
    const titleSizes=fixedTitle!==null?[fixedTitle]:Array.from({length:43},(_,i)=>112-i*2);
    for(const size of titleSizes){
      c.font=`${font.weight} ${size}px ${font.family}`;c.textAlign='left';c.textBaseline='alphabetic';
      const textWidth=2*(RX-95);
      if(title.split(/\s+/).some(word=>c.measureText(word).width>textWidth))continue;
      const titles=wrap(c,title,textWidth),lh=size*1.18;
      const normal=Math.min(48,Math.max(30,size*.46)),floor=fixedTitle!==null?18:30;
      const authorSizes=fixedAuthor!==null?[fixedAuthor]:Array.from({length:Math.max(1,Math.floor((normal-floor)/2)+1)},(_,i)=>normal-i*2);
      for(const as of authorSizes){
        c.font=`${font.weight} ${as}px ${font.family}`;
        if(author.split(/\s+/).some(word=>c.measureText(word).width>textWidth))continue;
        const authors=wrap(c,author,textWidth),ah=as*1.3,gap=Math.max(24,size*.32),lines=[];
        function line(text,fontSize,baseline,kind){
          c.font=`${font.weight} ${fontSize}px ${font.family}`;
          const m=c.measureText(text);
          return {text,size:fontSize,weight:font.weight,family:font.family,kind,baseline,
            x:CX+(m.actualBoundingBoxLeft-m.actualBoundingBoxRight)/2,
            ascent:m.actualBoundingBoxAscent,descent:m.actualBoundingBoxDescent,
            width:m.actualBoundingBoxLeft+m.actualBoundingBoxRight};
        }
        titles.forEach((text,i)=>lines.push(line(text,size,i*lh,'title')));
        const titleBottom=Math.max(...lines.map(l=>l.baseline+l.descent));
        authors.forEach((text,i)=>{
          const next=line(text,as,0,'author');
          next.baseline=i?lines[lines.length-1].baseline+ah:titleBottom+gap+next.ascent;lines.push(next);
        });
        const top=Math.min(...lines.map(l=>l.baseline-l.ascent));
        const bottom=Math.max(...lines.map(l=>l.baseline+l.descent));
        if(bottom-top>2*(RY-55))continue;
        const shift=CY-(top+bottom)/2;
        lines.forEach(l=>{l.baseline+=shift;l.y=l.baseline-l.ascent;l.height=l.ascent+l.descent;});
        if(lines.every(l=>{
          const dy=Math.max(Math.abs(l.y-CY),Math.abs(l.y+l.height-CY));
          const available=2*(RX-60)*Math.sqrt(Math.max(0,1-(dy/(RY-45))**2));
          return l.width<=available;
        }))return lines;
      }
    }
    throw new Error('Текст не помещается в овал. Уменьшите размер или нажмите «Авто».');
  }
  function text(c,line){
    c.font=`${line.weight} ${line.size}px ${line.family||'LoraCover'}`;c.textAlign='left';c.textBaseline='alphabetic';
    const m=c.measureText(line.text);
    const x=line.x??CX+(m.actualBoundingBoxLeft-m.actualBoundingBoxRight)/2;
    c.fillText(line.text,x,line.baseline??line.y+m.actualBoundingBoxAscent);
  }
  function emboss(c,mask,ink,paper){
    const image=c.getImageData(0,0,W,H),out=image.data,m=mask.getContext('2d').getImageData(0,0,W,H).data;
    const base=rgb(ink),p=rgb(paper);
    // Dark upper wall and lit lower wall stay inside each glyph, avoiding doubled text.
    for(let y=CY-RY;y<CY+RY;y++)for(let x=CX-RX;x<CX+RX;x++){
      const i=(y*W+x)*4,a=m[i+3]/255;if(!a)continue;
      const before=m[((y-2)*W+x-2)*4+3]/255,after=m[((y+2)*W+x+2)*4+3]/255;
      const shade=Math.max(0,a-before),light=Math.max(0,a-after);
      const grain=(((x*1973+y*9277)^(x*y*7))&15)/15-.5;
      for(let k=0;k<3;k++){
        const color=base[k]*.94+p[k]*.06-shade*24+light*30+grain*7;
        out[i+k]=Math.max(0,Math.min(255,out[i+k]*(1-a)+color*a));
      }
    }
    c.putImageData(image,0,0);
  }
  function grain(c){
    const im=c.getImageData(0,0,W,H),d=im.data;
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const i=(y*W+x)*4,n=(((x*1973+y*9277)^(x*y*7))&31)/31-.5;
      const gx=Math.floor(x/5),gy=Math.floor(y/7);
      const pulp=(((gx*1973+gy*9277)^(gx*gy*7))&31)/31-.5;
      const soft=Math.sin(x/270)*1.3+Math.cos(y/360)*1.2+Math.sin((x+y)/93)*.6;
      const variation=n*12+pulp*5+soft;
      for(let k=0;k<3;k++)d[i+k]=Math.max(0,Math.min(255,d[i+k]+variation));
    }c.putImageData(im,0,0);
  }
  function render(canvas,theme,options={}){
    const t=typeof theme==='string'?themes.find(v=>v.id===theme):theme;
    if(!t)throw new Error('Выберите шаблон обложки.');
    const c=canvas.getContext('2d',{willReadFrequently:true});
    const lines=layout(c,options.title?.trim()||'Название\nкниги',options.author?.trim()||'Имя автора',options);
    canvas.width=W;canvas.height=H;canvas.coverLayout=lines;
    c.fillStyle=t.bg;c.fillRect(0,0,W,H);c.fillStyle=t.stripe;
    for(let x=0;x<W;x+=128)c.fillRect(x,0,64,H);
    if(options.spine!==false){
      const g=c.createLinearGradient(0,0,44,0);g.addColorStop(0,t.spine);g.addColorStop(.65,t.bg);g.addColorStop(1,t.stripe);
      c.fillStyle=g;c.fillRect(0,0,44,H);
    }
    c.beginPath();c.ellipse(CX,CY,RX,RY,0,0,Math.PI*2);c.fillStyle=t.panel;c.fill();
    // A shallow pressed rim replaces the separate decorative frame.
    c.save();c.clip();c.globalAlpha=.17;c.strokeStyle=t.panelEdge;c.lineWidth=5;
    c.beginPath();c.ellipse(CX+1,CY+2,RX,RY,0,0,Math.PI*2);c.stroke();c.restore();
    grain(c);
    if(options.deboss!==false){
      const mask=options.createCanvas?options.createCanvas(W,H):document.createElement('canvas');mask.width=W;mask.height=H;
      const m=mask.getContext('2d');m.fillStyle='#fff';lines.forEach(line=>text(m,line));emboss(c,mask,t.ink,t.panel);
    }else{c.fillStyle=t.ink;lines.forEach(line=>text(c,line));}
    c.fillStyle=t.footer;text(c,{text:'ssdtati library',size:20,weight:400,y:1870});
    if(options.grayscale){const im=c.getImageData(0,0,W,H);for(let i=0;i<im.data.length;i+=4){const v=Math.round((.299*im.data[i]+.587*im.data[i+1]+.114*im.data[i+2])/17)*17;im.data[i]=im.data[i+1]=im.data[i+2]=v;}c.putImageData(im,0,0);}
    return canvas;
  }
  root.CoverTemplates={render,layout,getFont,fonts,themes,width:W,height:H,panel:{x:CX,y:CY,width:RX*2,height:RY*2}};
})(typeof window!=='undefined'?window:globalThis);
