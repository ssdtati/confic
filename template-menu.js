/* Local font and template editor. Generated images go directly into the EPUB. */
(function(){
  'use strict';
  const $=id=>document.getElementById(id),dialog=$('template-dialog'),canvas=$('template-canvas');
  const fontPromises=new Map(),patterns=CoverTemplates.patterns;
  let resolveChoice=null,selected='stripes',renderRevision=0,timer=null,lastRender=null,applying=false,returnFocus=null,titleSize=null,authorSize=null;
  function loadFont(id){
    const f=CoverTemplates.getFont(id);
    if(!fontPromises.has(f.id))fontPromises.set(f.id,(async()=>{
      const face=new FontFace(f.family,'url("'+encodeURI(f.file)+'")',{weight:f.weights});document.fonts.add(await face.load());
    })().catch(()=>{fontPromises.delete(f.id);throw new Error('Не удалось загрузить шрифт. Выберите его ещё раз.');}));
    return fontPromises.get(f.id);
  }
  function fonts(id){return Promise.all([loadFont('lora'),loadFont(id)]);}
  function status(text,error=false){$('template-status').textContent=text;$('template-status').classList.toggle('error',error);}
  function spec(){return {themeId:'custom',pattern:selected,color1:$('cover-color1').value,color2:$('cover-color2').value,panelColor:$('cover-panel-color').value,title:$('template-title').value.trim(),author:$('template-author').value.trim(),spine:$('template-spine').checked,fontId:$('template-font').value,titleSize,authorSize};}
  function validate(s){if(!s.title)throw new Error('Добавьте название книги.');if(!s.author)throw new Error('Добавьте имя автора.');}
  function busy(value){applying=value;dialog.classList.toggle('busy',value);$('template-close').disabled=value;$('template-apply').disabled=value;}
  function queue(){clearTimeout(timer);renderRevision++;lastRender=null;$('template-apply').disabled=true;timer=setTimeout(paint,120);}
  function sizes(){
    const lines=canvas.coverLayout;
    for(const kind of ['title','author']){
      const l=lines.find(l=>l.kind===kind);if(!l)continue;
      $(`template-${kind}-size`).value=String(Math.round(l.size));$(`template-${kind}-size-value`).textContent=String(Math.round(l.size));
    }
    $('template-auto').setAttribute('aria-pressed',String(titleSize===null&&authorSize===null));
  }
  async function paint(){
    const revision=++renderRevision;lastRender=null;$('template-apply').disabled=true;const s=spec();
    try{
      status('Готовим обложку…');await fonts(s.fontId);if(revision!==renderRevision||!dialog.open)return;
      CoverTemplates.render(canvas,s.themeId,{...s,grayscale:$('template-gray').checked});sizes();
      $('template-font').style.fontFamily='"'+CoverTemplates.getFont(s.fontId).family+'", Georgia, serif';
      validate(s);lastRender=JSON.stringify(s);dialog.classList.remove('invalid');status('');$('template-apply').disabled=applying;
    }catch(e){if(revision===renderRevision){dialog.classList.add('invalid');status(e.message||'Не удалось подготовить обложку.',true);}}
  }
  function close(value=null){
    if(applying)return;
    clearTimeout(timer);renderRevision++;dialog.close();document.body.classList.remove('template-modal-open');
    const done=resolveChoice;resolveChoice=null;if(done)done(value);returnFocus?.focus();
  }
  async function create(s){
    validate(s);await fonts(s.fontId);
    const output=document.createElement('canvas');CoverTemplates.render(output,s.themeId,s);
    const blob=await new Promise(resolve=>output.toBlob(resolve,'image/jpeg',.96));if(!blob)throw new Error('Не удалось подготовить обложку.');
    return {bytes:new Uint8Array(await blob.arrayBuffer()),mime:'image/jpeg',width:CoverTemplates.width,height:CoverTemplates.height,blob,template:{...s}};
  }
  CoverTemplates.fonts.forEach(f=>{const option=document.createElement('option');option.value=f.id;option.textContent=f.name;$('template-font').append(option);});
  patterns.forEach(p=>{
    const button=document.createElement('button'),swatch=document.createElement('span'),label=document.createElement('span');
    button.type='button';button.className='template-choice';button.dataset.pattern=p.id;button.setAttribute('aria-pressed','false');button.setAttribute('aria-label',p.label);
    swatch.className='pattern-swatch pattern-'+p.id;swatch.setAttribute('aria-hidden','true');label.className='pattern-label';label.textContent=p.label;button.append(swatch,label);
    button.onclick=()=>{selected=p.id;selectButtons();queue();};dialog.querySelector('.template-choices').append(button);
  });
  function selectButtons(){dialog.querySelectorAll('.template-choice').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.pattern===selected)));}
  function swatches(){dialog.querySelector('.template-choices').style.cssText='--cover-base:'+ $('cover-color1').value+';--cover-pattern:'+ $('cover-color2').value+';';}
  for(const id of ['cover-color1','cover-color2','cover-panel-color'])for(const event of ['input','change'])$(id).addEventListener(event,()=>{swatches();queue();});
  $('template-title').addEventListener('input',queue);$('template-author').addEventListener('input',queue);
  for(const id of ['template-spine','template-gray','template-font'])$(id).addEventListener('change',queue);
  $('template-title-size').addEventListener('input',()=>{titleSize=Number($('template-title-size').value);$('template-title-size-value').textContent=String(titleSize);$('template-auto').setAttribute('aria-pressed','false');queue();});
  $('template-author-size').addEventListener('input',()=>{authorSize=Number($('template-author-size').value);$('template-author-size-value').textContent=String(authorSize);$('template-auto').setAttribute('aria-pressed','false');queue();});
  $('template-auto').onclick=()=>{titleSize=null;authorSize=null;queue();};
  $('template-close').onclick=()=>close();dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();}});
  $('template-apply').onclick=async()=>{
    const s=spec();if(applying||!lastRender||lastRender!==JSON.stringify(s))return;
    busy(true);status('Вставляем обложку…');
    try{const cover=await create(s);busy(false);close(cover);}catch(e){busy(false);status(e.message||'Не удалось вставить обложку.',true);}
  };
  window.TemplateMenu={create,open(options={}){
    if(resolveChoice)return Promise.resolve(null);returnFocus=document.activeElement;
    const look=CoverTemplates.appearance(options);selected=look.pattern;
    $('cover-color1').value=look.color1;$('cover-color2').value=look.color2;$('cover-panel-color').value=look.panelColor;swatches();
    $('template-title').value=options.title||'';$('template-author').value=options.author==='Автор не указан'?'':options.author||'';
    $('template-spine').checked=options.spine!==false;$('template-gray').checked=false;
    $('template-font').value=CoverTemplates.getFont(options.fontId).id;
    titleSize=Number.isFinite(options.titleSize)?options.titleSize:null;authorSize=Number.isFinite(options.authorSize)?options.authorSize:null;
    selectButtons();dialog.classList.remove('invalid');
    const result=new Promise(resolve=>{resolveChoice=resolve;});dialog.showModal();document.body.classList.add('template-modal-open');dialog.scrollTop=0;paint();return result;
  }};
})();
