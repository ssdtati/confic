/* EPUB archive processing. Files remain in the browser; no network requests. */
(function () {
  'use strict';
  const OPF = 'http://www.idpf.org/2007/opf';
  const DC = 'http://purl.org/dc/elements/1.1/';
  const xml = (text, label) => {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length || /<!ENTITY\b/i.test(text)) throw new Error(`${label}: повреждён XML. Попробуйте другую книгу.`);
    return doc;
  };
  const nodes = (node, name) => Array.from(node.getElementsByTagNameNS('*', name));
  const hasToken = (node, name, token) => (node.getAttribute(name) || '').split(/\s+/).includes(token);
  function resolve(base, href) {
    if (!href || /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) return null;
    let value;
    try { value = decodeURIComponent(href.split('#')[0].split('?')[0]); } catch { value = href.split('#')[0].split('?')[0]; }
    if (value.startsWith('/')) throw new Error('В книге обнаружен неподдерживаемый абсолютный путь.');
    const parts = base.split('/').slice(0, -1);
    for (const p of value.split('/')) { if (p === '..') { if (!parts.length) throw new Error('Некорректные пути внутри EPUB.'); parts.pop(); } else if (p && p !== '.') parts.push(p); }
    return parts.join('/');
  }
  function relative(base, target) {
    const from = base.split('/').slice(0, -1), to = target.split('/');
    while (from.length && to.length && from[0] === to[0]) { from.shift(); to.shift(); }
    return [...from.map(() => '..'), ...to.map(encodeURIComponent)].join('/');
  }
  const escape = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  function make(doc, name, attrs = {}) {
    const node = doc.createElementNS(OPF, name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    return node;
  }
  class EpubBook {
    static async load(file) {
      if (!/\.epub$/i.test(file.name)) throw new Error('Выберите книгу в формате .epub.');
      if (file.size > 100 * 1024 * 1024) throw new Error('Книга больше 100 МБ. Выберите файл поменьше.');
      let zip;
      try { zip = await JSZip.loadAsync(await file.arrayBuffer()); } catch { throw new Error('Не удалось открыть EPUB. Файл повреждён или защищён паролем.'); }
      const entries = Object.values(zip.files);
      if (entries.length > 15000 || entries.reduce((sum, item) => sum + (item._data?.uncompressedSize || 0), 0) > 400 * 1024 * 1024) throw new Error('Распакованная книга слишком большая для обработки в браузере.');
      if (entries.some(e => e.unsafeOriginalName && e.unsafeOriginalName !== e.name)) throw new Error('В EPUB обнаружены некорректные пути файлов.');
      if (!zip.file('mimetype') || (await zip.file('mimetype').async('string')).trim() !== 'application/epub+zip') throw new Error('В файле нет структуры EPUB. Выберите другую книгу.');
      if (zip.file('META-INF/signatures.xml')) throw new Error('Эта книга содержит цифровую подпись. Редактирование подписанных EPUB пока не поддерживается.');
      if (zip.file('META-INF/encryption.xml')) {
        const encryption = xml(await zip.file('META-INF/encryption.xml').async('string'), 'Защита книги');
        const allowed = ['http://www.idpf.org/2008/embedding', 'http://ns.adobe.com/pdf/enc#RC'];
        if (nodes(encryption, 'EncryptionMethod').some(e => !allowed.includes(e.getAttribute('Algorithm')))) throw new Error('Книга защищена DRM. Для редактирования нужен EPUB без защиты.');
      }
      const containerFile = zip.file('META-INF/container.xml');
      if (!containerFile) throw new Error('В EPUB отсутствует описание структуры книги.');
      const container = xml(await containerFile.async('string'), 'Структура книги');
      const roots = nodes(container, 'rootfile');
      if (roots.length !== 1) throw new Error('EPUB с несколькими вариантами книги пока не поддерживается.');
      const opfPath = resolve('', roots[0].getAttribute('full-path'));
      if (!opfPath || !zip.file(opfPath)) throw new Error('Не найден основной файл книги.');
      const opf = xml(await zip.file(opfPath).async('string'), 'Описание книги');
      const manifest = nodes(opf, 'manifest')[0], metadata = nodes(opf, 'metadata')[0], spine = nodes(opf, 'spine')[0];
      if (!manifest || !metadata || !spine) throw new Error('В EPUB не хватает обязательных разделов.');
      const version = opf.documentElement.getAttribute('version') || '';
      if (!/^[23](\.|$)/.test(version)) throw new Error('Поддерживаются книги EPUB 2 и EPUB 3.');
      const book = Object.assign(new EpubBook(), {zip, opf, opfPath, file, version, manifest, metadata, spine});
      const items = nodes(manifest, 'item');
      const coverMeta = nodes(metadata, 'meta').find(e => e.getAttribute('name') === 'cover');
      book.coverItem = items.find(e => hasToken(e, 'properties', 'cover-image')) || items.find(e => e.getAttribute('id') === coverMeta?.getAttribute('content'));
      const guideCover = nodes(opf, 'reference').find(e => hasToken(e, 'type', 'cover'));
      const guidePath = guideCover && resolve(opfPath, guideCover.getAttribute('href'));
      book.coverPage = items.find(e => e.getAttribute('media-type') === 'application/xhtml+xml' && resolve(opfPath, e.getAttribute('href')) === guidePath);
      if (!book.coverPage) {
        const firstRef = nodes(spine, 'itemref')[0];
        const first = items.find(e => e.getAttribute('id') === firstRef?.getAttribute('idref'));
        if (first?.getAttribute('media-type') === 'application/xhtml+xml') {
          const path = resolve(opfPath, first.getAttribute('href'));
          if (zip.file(path)) {
            const firstDoc = xml(await zip.file(path).async('string'), 'Первая страница');
            const body = nodes(firstDoc, 'body')[0];
            const images = [...nodes(firstDoc, 'img'), ...nodes(firstDoc, 'image')];
            const plainText = body ? body.textContent.replace(/\s+/g, '').length : 999;
            const imagePath = images.length === 1 && resolve(path, images[0].getAttribute('src') || images[0].getAttribute('href') || images[0].getAttributeNS('http://www.w3.org/1999/xlink', 'href'));
            const oldPath = book.coverItem && resolve(opfPath, book.coverItem.getAttribute('href'));
            if (images.length === 1 && plainText < 60 && (imagePath === oldPath || /cover|обложк/i.test(first.getAttribute('id') + ' ' + first.getAttribute('href')))) book.coverPage = first;
          }
        }
      }
      if (!book.coverItem && book.coverPage) {
        const path = resolve(opfPath, book.coverPage.getAttribute('href'));
        if (zip.file(path)) {
          const coverDoc = xml(await zip.file(path).async('string'), 'Обложка');
          const image = [...nodes(coverDoc, 'img'), ...nodes(coverDoc, 'image')][0];
          const imagePath = image && resolve(path, image.getAttribute('src') || image.getAttribute('href') || image.getAttributeNS('http://www.w3.org/1999/xlink', 'href'));
          book.coverItem = items.find(e => resolve(opfPath, e.getAttribute('href')) === imagePath);
        }
      }
      book.title = opf.getElementsByTagNameNS(DC, 'title')[0]?.textContent?.trim() || file.name.replace(/\.epub$/i, '');
      book.author = opf.getElementsByTagNameNS(DC, 'creator')[0]?.textContent?.trim() || 'Автор не указан';
      return book;
    }
    async currentCover() {
      if (!this.coverItem) return null;
      const mime = this.coverItem.getAttribute('media-type');
      if (!['image/jpeg','image/png','image/gif','image/webp'].includes(mime)) return null;
      const entry = this.zip.file(resolve(this.opfPath, this.coverItem.getAttribute('href')));
      if (!entry || entry._data?.uncompressedSize > 20 * 1024 * 1024) return null;
      return new Blob([await entry.async('uint8array')], {type:mime});
    }
    async withCover(cover, includePage = true, onProgress = () => {}) {
      const zip = new JSZip();
      // OCF requires mimetype to be the first, uncompressed entry.
      zip.file('mimetype', 'application/epub+zip', {compression:'STORE'});
      for (const entry of Object.values(this.zip.files)) {
        if (entry.name !== 'mimetype' && !entry.dir) zip.file(entry.name, await entry.async('uint8array'), {createFolders:false});
      }
      const opf = this.opf.cloneNode(true), manifest = nodes(opf, 'manifest')[0], metadata = nodes(opf, 'metadata')[0], spine = nodes(opf, 'spine')[0];
      const is3 = this.version.startsWith('3');
      const ids = new Set(Array.from(opf.getElementsByTagName('*')).map(e => e.getAttribute('id')).filter(Boolean));
      const newId = prefix => { let id=prefix, n=1; while(ids.has(id)) id=`${prefix}-${n++}`; ids.add(id); return id; };
      const base = this.opfPath.includes('/') ? this.opfPath.slice(0, this.opfPath.lastIndexOf('/') + 1) : '';
      let folder = `${base}pereplet`, index=1;
      while (Object.keys(zip.files).some(path => path === folder || path.startsWith(folder + '/'))) folder = `${base}pereplet-${index++}`;
      const imagePath = `${folder}/cover.${cover.mime === 'image/png' ? 'png':'jpg'}`;
      zip.file(imagePath, cover.bytes, {createFolders:false});
      const imageId = newId('pereplet-cover-image');
      for (const item of nodes(manifest, 'item')) {
        const properties = (item.getAttribute('properties') || '').split(/\s+/).filter(p => p && p !== 'cover-image');
        if (properties.length) item.setAttribute('properties', properties.join(' ')); else item.removeAttribute('properties');
      }
      manifest.appendChild(make(opf, 'item', {id:imageId, href:relative(this.opfPath,imagePath), 'media-type':cover.mime, ...(is3?{properties:'cover-image'}:{})}));
      nodes(metadata, 'meta').filter(e => e.getAttribute('name') === 'cover').forEach(e => e.remove());
      metadata.appendChild(make(opf, 'meta', {name:'cover', content:imageId}));
      if (is3) {
        let modified = nodes(metadata, 'meta').find(e => e.getAttribute('property') === 'dcterms:modified');
        if (!modified) { modified=make(opf,'meta',{property:'dcterms:modified'}); metadata.appendChild(modified); }
        modified.textContent = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
      }
      if (includePage || this.coverPage) {
        const existingId = this.coverPage?.getAttribute('id');
        let pageItem = nodes(manifest,'item').find(e => e.getAttribute('id') === existingId);
        const pagePath = pageItem ? resolve(this.opfPath, pageItem.getAttribute('href')) : `${folder}/cover.xhtml`;
        if (!pageItem) { pageItem=make(opf,'item',{id:newId('pereplet-cover-page'),href:relative(this.opfPath,pagePath),'media-type':'application/xhtml+xml'}); manifest.appendChild(pageItem); }
        // The new page is simple XHTML, so obsolete SVG/script declarations must be cleared.
        pageItem.removeAttribute('properties'); pageItem.removeAttribute('media-overlay');
        const pageId=pageItem.getAttribute('id');
        let ref=nodes(spine,'itemref').find(e=>e.getAttribute('idref')===pageId);
        if (includePage) { if(ref) ref.remove(); ref=make(opf,'itemref',{idref:pageId}); spine.insertBefore(ref, spine.firstChild); }
        const page = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml"${is3?' xmlns:epub="http://www.idpf.org/2007/ops"':''} xml:lang="ru" lang="ru"><head><title>Обложка — ${escape(this.title)}</title><meta name="viewport" content="width=${cover.width}, height=${cover.height}"/><style type="text/css">html,body{margin:0;padding:0;width:100%;height:100%;background:transparent}body{text-align:center}div{height:100%;width:100%;page-break-after:always}img{max-width:100%;max-height:100%;height:auto;width:auto;object-fit:contain}</style></head><body${is3?' epub:type="cover"':''}><div><img src="${escape(relative(pagePath,imagePath))}" alt="${escape('Обложка книги «'+this.title+'»')}"/></div></body></html>`;
        zip.file(pagePath,page,{createFolders:false});
        let guide=nodes(opf,'guide')[0];
        if(!guide){ guide=make(opf,'guide'); const firstCollection=nodes(opf,'collection')[0]; opf.documentElement.insertBefore(guide,firstCollection||null); }
        nodes(guide,'reference').filter(e=>hasToken(e,'type','cover')).forEach(e=>e.remove());
        guide.appendChild(make(opf,'reference',{type:'cover',title:'Обложка',href:relative(this.opfPath,pagePath)}));
      }
      zip.file(this.opfPath, new XMLSerializer().serializeToString(opf), {createFolders:false});
      return zip.generateAsync({type:'blob',mimeType:'application/epub+zip',compression:'DEFLATE',compressionOptions:{level:6}}, meta=>onProgress(meta.percent));
    }
  }
  window.EpubBook=EpubBook;
})();
