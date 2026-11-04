/* Local template chooser. Generated JPG stays in memory until the EPUB is saved. */
(function(){
  'use strict';
  const $=id=>document.getElementById(id),dialog=$('template-dialog'),canvas=$('template-canvas');
  let fontPromise,resolveChoice=null,selected='dark-large',renderRevision=0,timer=null,lastRender=null,applying=false,returnFocus=null;
  const themes=CoverTemplates.themes;
  function font(){
    if(!fontPromise)fontPromise=(async()=>{
      const face=new FontFace('LoraCover','url(fonts/Lora-Variable.ttf)',{weight:'400 700'});
      document.fonts.add(await face.load());
    })().catch(e=>{fontPromise=null;throw e;});
    return fontPromise;
  }
  function status(text,error=false){$('template-status').textContent=text;$('template-status').classList.toggle('error',error);}
  function spec(){return {themeId:selected,title:$('template-title').value.trim(),author:$('template-author').value.trim(),spine:$('template-spine').checked};}
  function validate(s){if(!s.title)throw new Error('Добавьте название книги.');if(!s.author)throw new Error('Добавьте имя автора.');}
  function busy(value){applying=value;dialog.classList.toggle('busy',value);$('template-close').disabled=value;$('template-apply').disabled=value;}
  function queue(){clearTimeout(timer);renderRevision++;lastRender=null;$('template-apply').disabled=true;timer=setTimeout(paint,180);}
  async function paint(){
    const revision=++renderRevision;lastRender=null;$('template-apply').disabled=true;
    const s=spec();
    try{
      status('Готовим обложку…');await font();if(revision!==renderRevision||!dialog.open)return;
      CoverTemplates.render(canvas,s.themeId,{...s,grayscale:$('template-gray').checked});
      validate(s);lastRender=JSON.stringify(s);status('');$('template-apply').disabled=applying;
    }catch(e){if(revision===renderRevision)status(e.message||'Не удалось подготовить обложку. Попробуйте ещё раз.',true);}
  }
  function close(value=null){
    if(applying)return;
    clearTimeout(timer);renderRevision++;dialog.close();document.body.classList.remove('template-modal-open');
    const done=resolveChoice;resolveChoice=null;if(done)done(value);returnFocus?.focus();
  }
  async function create(s){
    validate(s);await font();
    const output=document.createElement('canvas');CoverTemplates.render(output,s.themeId,s);
    const blob=await new Promise(resolve=>output.toBlob(resolve,'image/jpeg',.96));
    if(!blob)throw new Error('Не удалось подготовить обложку.');
    return {bytes:new Uint8Array(await blob.arrayBuffer()),mime:'image/jpeg',width:CoverTemplates.width,height:CoverTemplates.height,blob,template:{...s}};
  }
  themes.forEach(t=>{
    const button=document.createElement('button'),img=document.createElement('img'),label=document.createElement('span');
    button.type='button';button.className='template-choice';button.dataset.theme=t.id;button.setAttribute('aria-pressed','false');button.setAttribute('aria-label',t.label+' — '+t.detail);
    img.src='templates/'+t.id+'.jpg';img.alt='';img.width=150;img.height=200;label.textContent=t.label;button.append(img,label);
    button.onclick=()=>{selected=t.id;selectButtons();queue();};dialog.querySelector('.template-choices').append(button);
  });
  function selectButtons(){dialog.querySelectorAll('.template-choice').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.theme===selected)));}
  $('template-title').addEventListener('input',queue);$('template-author').addEventListener('input',queue);
  $('template-spine').addEventListener('change',queue);$('template-gray').addEventListener('change',queue);
  $('template-close').onclick=()=>close();
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();}});
  $('template-apply').onclick=async()=>{
    const s=spec();if(applying||!lastRender||lastRender!==JSON.stringify(s))return;
    busy(true);status('Вставляем обложку…');
    try{const cover=await create(s);busy(false);close(cover);}catch(e){busy(false);status(e.message||'Не удалось вставить обложку.',true);}
  };
  window.TemplateMenu={create,open(options={}){
    if(resolveChoice)return Promise.resolve(null);
    returnFocus=document.activeElement;
    selected=themes.some(t=>t.id===options.themeId)?options.themeId:'dark-large';
    $('template-title').value=options.title||'';$('template-author').value=options.author==='Автор не указан'?'':options.author||'';
    $('template-spine').checked=options.spine!==false;$('template-gray').checked=false;selectButtons();
    const result=new Promise(resolve=>{resolveChoice=resolve;});
    dialog.showModal();document.body.classList.add('template-modal-open');dialog.scrollTop=0;paint();return result;
  }};
})();
