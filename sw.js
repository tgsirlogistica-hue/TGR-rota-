const CACHE='tgr-rota-offline-v7';
const PM='mapa_tgr_200km.pmtiles';

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    try{
      const url=new URL('./index.html',self.registration.scope);
      const resposta=await fetch(new Request(url.href,{cache:'reload'}));
      if(resposta.ok)await cache.put(url.href,resposta);
    }catch(e){console.warn('TGR: pré-cache do aplicativo indisponível',e);}
  })());
  self.skipWaiting();
});

self.addEventListener('activate',event=>{
  event.waitUntil(self.clients.claim());
});

async function pmtilesRangeResponse(saved, rangeHeader){
  const blob = await saved.blob();
  const size = blob.size;
  const match = /^bytes=(\d+)-(\d*)$/i.exec(rangeHeader || '');

  if(!match){
    return new Response(blob,{
      status:200,
      headers:{
        'Content-Type':'application/octet-stream',
        'Content-Length':String(size),
        'Accept-Ranges':'bytes'
      }
    });
  }

  const start = Number(match[1]);
  let end = match[2] ? Number(match[2]) : size - 1;
  end = Math.min(end, size - 1);

  if(!Number.isFinite(start) || start < 0 || start >= size || end < start){
    return new Response(null,{
      status:416,
      headers:{
        'Content-Range':`bytes */${size}`,
        'Accept-Ranges':'bytes'
      }
    });
  }

  const part = blob.slice(start, end + 1);
  return new Response(part,{
    status:206,
    statusText:'Partial Content',
    headers:{
      'Content-Type':'application/octet-stream',
      'Content-Range':`bytes ${start}-${end}/${size}`,
      'Content-Length':String(part.size),
      'Accept-Ranges':'bytes',
      'Cache-Control':'no-store'
    }
  });
}

self.addEventListener('fetch',event=>{
  const request = event.request;
  if(request.method !== 'GET') return;

  const url = new URL(request.url);

  if(url.pathname.endsWith('/' + PM)){
    event.respondWith((async()=>{
      const cache = await caches.open(CACHE);
      const canonical = new Request(new URL('./' + PM, self.registration.scope).href);
      let saved = await cache.match(canonical, {ignoreSearch:true});
      if(!saved){
        for(const nome of await caches.keys()){
          if(nome===CACHE || !nome.startsWith('tgr-rota-offline-'))continue;
          const antigo = await caches.open(nome);
          saved = await antigo.match(canonical, {ignoreSearch:true});
          if(saved)break;
        }
      }

      if(saved){
        const range = request.headers.get('range');
        return range ? pmtilesRangeResponse(saved, range) : pmtilesRangeResponse(saved, '');
      }

      try{
        return await fetch(request);
      }catch(err){
        return new Response('Mapa offline ainda não foi baixado.',{
          status:503,
          headers:{'Content-Type':'text/plain; charset=utf-8'}
        });
      }
    })());
    return;
  }

  event.respondWith((async()=>{
    const cache = await caches.open(CACHE);

    if(request.mode === 'navigate'){
      try{
        return await fetch(request);
      }catch(err){
        const indexUrl = new URL('./index.html', self.registration.scope).href;
        return (await cache.match(indexUrl, {ignoreSearch:true})) || Response.error();
      }
    }

    try{
      return await fetch(request);
    }catch(err){
      return (await cache.match(request, {ignoreSearch:true})) || Response.error();
    }
  })());
});
