(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  let book=null,cover=null,bookBusy=false,coverBusy=false,saving=false,bookRevision=0,coverRevision=0,previewUrl=null,downloadUrl=null;
  const size=bytes=>bytes<1024*1024?`${Math.max(1,Math.round(bytes/1024))} КБ`:`${(bytes/1024/1024).toLocaleString('ru-RU',{maximumFractionDigits:1,minimumFractionDigits:1})} МБ`;
  function clearDownload(){if(downloadUrl)URL.revokeObjectURL(downloadUrl);downloadUrl=null;$('ready-download').hidden=true;$('ready-download').removeAttribute('href');}
  function message(text,error=false){ $('status').textContent=text; $('status').classList.toggle('error',error); $('status').hidden=!text; }
  function sync(){
    const ready=!!(book&&cover&&!bookBusy&&!coverBusy&&!saving);
    $('save-button').disabled=!ready;
    $('save-label').textContent=saving?'Собираем книгу…':'Скачать EPUB с обложкой';
    $('step-count').textContent=ready?'ШАГ 3 ИЗ 3':book?'ШАГ 2 ИЗ 3':'ШАГ 1 ИЗ 3';
    $('book-done').hidden=!book; $('cover-done').hidden=!cover;
    $('reset-button').hidden=!book&&!cover;
    $('book-drop').classList.toggle('busy',bookBusy||saving); $('cover-drop').classList.toggle('busy',coverBusy||saving);
    $('choose-template').disabled=bookBusy||coverBusy||saving;
    $('book-input').disabled=bookBusy||saving; $('cover-input').disabled=coverBusy||saving; $('change-book').disabled=saving; $('reset-button').disabled=saving; $('include-page').disabled=saving;
    $('save-hint').textContent=saving?'Сохраняем текст, оглавление и новую обложку':ready?'Готово! Осталось скачать вашу книгу':!book?'Загрузите книгу и изображение, чтобы продолжить':'Теперь настройте обложку или выберите изображение';
  }
  function showCover(blob,description){
    if(previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl=blob?URL.createObjectURL(blob):null;
    $('book-object').closest('.preview-card').classList.toggle('has-template',!!(blob&&cover?.template));
    $('cover-preview').hidden=!blob; $('sample-cover').hidden=!!blob;
    if(blob) $('cover-preview').src=previewUrl; else $('cover-preview').removeAttribute('src');
    $('preview-description').textContent=description||'Так будет выглядеть книга с новой обложкой';
  }
  function acceptCover(next,label){
    cover=next;clearDownload();
    $('cover-label').textContent=label||'Своё изображение';
    $('cover-details').textContent=cover.template?'Обложка настроена · '+cover.width+' × '+cover.height+' px':`${cover.width} × ${cover.height} px · ${size(cover.blob.size)} · нажмите для замены`;
    $('cover-drop').style.borderColor='var(--wine)';
    showCover(cover.blob,'Новая обложка готова к вставке в EPUB');
    if(!cover.template){const ratio=cover.width/cover.height;$('book-object').style.width=`${Math.max(118,Math.min(220,250*ratio))}px`;}else $('book-object').style.width='';
  }
  $('choose-template').addEventListener('click',async()=>{
    if(saving||bookBusy||coverBusy)return;
    const next=await TemplateMenu.open(cover?.template||{title:book?.title,author:book?.author});
    if(!next||saving)return;
    coverRevision++;coverBusy=false;acceptCover(next,'Своё изображение');
    message(book?'Обложка вставлена. Можно скачать EPUB.':'Обложка готова. Загрузите EPUB — подставим его название и автора.');sync();
  });
  async function loadBook(file){
    if(!file||saving) return;
    const rev=++bookRevision; bookBusy=true; message('Открываем книгу…'); sync();
    try{
      const next=await EpubBook.load(file);
      const oldCover=await next.currentCover();
      if(rev!==bookRevision)return;
      book=next;clearDownload();
      $('book-drop').hidden=true; $('book-loaded').hidden=false;
      $('book-filename').textContent=book.file.name;
      $('book-details').textContent=`${size(file.size)} · EPUB ${book.version} · ${book.author}`;
      $('preview-title').textContent=book.title;
      if(cover?.template){
        const coverRev=coverRevision;
        try{
          const generated=await TemplateMenu.create({...cover.template,title:book.title,author:book.author==='Автор не указан'?'Имя автора':book.author});
          if(rev!==bookRevision||coverRev!==coverRevision)return;
          acceptCover(generated);
        }catch(e){
          if(rev!==bookRevision||coverRev!==coverRevision)return;
          cover=null;clearDownload();showCover(oldCover);message(e.message||'Выберите шаблон ещё раз.',true);return;
        }
      }
      if(!cover) showCover(oldCover,oldCover?'Текущая обложка · выберите изображение для замены':'В этой книге пока нет обложки');
      message(cover?'Готово к сохранению.':'Книга выбрана.');
    }catch(error){if(rev===bookRevision)message(error.message||'Не удалось открыть книгу.',true);}
    finally{if(rev===bookRevision){bookBusy=false;sync();$('book-input').value='';}}
  }
  async function loadCover(file){
    if(!file||saving)return;
    const rev=++coverRevision; coverBusy=true; message('Подготавливаем обложку…'); sync();
    try{
      if(file.size>20*1024*1024)throw new Error('Изображение больше 20 МБ. Выберите файл поменьше.');
      const bytes=new Uint8Array(await file.arrayBuffer());
      const png=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71;
      const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
      const webp=String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
      if(!png&&!jpeg&&!webp)throw new Error('Выберите изображение JPG, PNG или WebP.');
      const mime=png?'image/png':'image/jpeg';
      const image=new Image(),url=URL.createObjectURL(file);
      try{
        await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('Не удалось прочитать изображение. Выберите другой файл.'));image.src=url;});
        if(!image.naturalWidth||!image.naturalHeight)throw new Error('У изображения нет размеров.');
        if(image.naturalWidth*image.naturalHeight>60000000)throw new Error('Изображение слишком большое. Уменьшите его до 60 мегапикселей.');
        const scale=Math.min(1,3000/Math.max(image.naturalWidth,image.naturalHeight));
        const canvas=document.createElement('canvas');canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale);
        const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Браузер не поддерживает обработку изображений.');
        if(mime==='image/jpeg'){ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);}ctx.drawImage(image,0,0,canvas.width,canvas.height);
        const blob=await new Promise(resolve=>canvas.toBlob(resolve,mime,.94));if(!blob)throw new Error('Не удалось подготовить обложку.');
        const data=await blob.arrayBuffer();if(rev!==coverRevision)return;
        acceptCover({bytes:new Uint8Array(data),mime,width:canvas.width,height:canvas.height,blob},file.name);
        message(book?'Готово к сохранению.':'Обложка выбрана.');
      }finally{URL.revokeObjectURL(url);}
    }catch(error){if(rev===coverRevision)message(error.message||'Не удалось загрузить обложку.',true);}
    finally{if(rev===coverRevision){coverBusy=false;sync();$('cover-input').value='';}}
  }
  for(const [name,handler] of [['book',loadBook],['cover',loadCover]]){
    const drop=$(`${name}-drop`),input=$(`${name}-input`);
    input.addEventListener('change',()=>handler(input.files[0]));
    let depth=0;
    drop.addEventListener('dragenter',event=>{event.preventDefault();depth++;drop.classList.add('drag-over');});
    drop.addEventListener('dragover',event=>event.preventDefault());
    drop.addEventListener('dragleave',event=>{event.preventDefault();if(--depth<=0)drop.classList.remove('drag-over');});
    drop.addEventListener('drop',event=>{event.preventDefault();depth=0;drop.classList.remove('drag-over');if(event.dataTransfer.files.length>1){message('Добавляйте по одному файлу за раз.',true);return;}handler(event.dataTransfer.files[0]);});
  }
  document.addEventListener('dragover',event=>event.preventDefault());document.addEventListener('drop',event=>event.preventDefault());
  $('change-book').addEventListener('click',()=>$('book-input').click());
  $('include-page').addEventListener('change',()=>{
    clearDownload();
    $('include-page').closest('label').querySelector('small').textContent=$('include-page').checked?'Она появится и в библиотеке, и внутри книги':'Новая страница не добавится; существующая обложка обновится';
  });
  $('save-button').addEventListener('click',async()=>{
    if(!book||!cover||saving||bookBusy||coverBusy)return;
    saving=true;clearDownload();sync();message('Собираем EPUB с новой обложкой…');
    try{
      const blob=await book.withCover(cover,$('include-page').checked,percent=>{$('save-hint').textContent=`Собираем книгу · ${Math.round(percent)}%`;});
      const title=book.title.replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').replace(/^[.\s]+|[.\s]+$/g,'').replace(/\.epub$/i,'').trim()||'Книга';
      const filename=/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(title)?`${title} книга`:title;
      downloadUrl=URL.createObjectURL(blob);const link=$('ready-download');link.href=downloadUrl;link.download=filename+'.epub';link.hidden=false;link.click();
      message('EPUB готов. Если файл не скачался, нажмите «Скачать ещё раз».');
    }catch(error){message(error.message||'Не удалось сохранить EPUB. Попробуйте ещё раз.',true);}
    finally{saving=false;sync();}
  });
  $('reset-button').addEventListener('click',()=>{
    if(saving)return;bookRevision++;coverRevision++;book=null;cover=null;bookBusy=false;coverBusy=false;clearDownload();
    $('book-drop').hidden=false;$('book-loaded').hidden=true;$('book-input').value='';$('cover-input').value='';
    $('cover-label').textContent='Выбрать изображение';$('cover-details').textContent='JPG, PNG, WebP · до 20 МБ';$('cover-drop').style.borderColor='';
    $('preview-title').textContent='Ваша книга';$('book-object').style.width='';$('include-page').checked=true;$('include-page').closest('label').querySelector('small').textContent='Она появится и в библиотеке, и внутри книги';showCover(null);message('');sync();
  });
  sync();
})();
