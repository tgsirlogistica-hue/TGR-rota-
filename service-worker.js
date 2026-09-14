const CACHE_NAME='tgr-offline-pmtiles-v1';

const LOCAIS=[
  './',
  './index.html',
  './manifest.json',
  './leaflet.css',
  './leaflet.js',
  './maplibre-gl.css',
  './maplibre-gl.js',
  './leaflet-maplibre-gl.js',
  './pmtiles.js',
  './mapa_tgr_100km.pmtiles'
];

const EXTERNOS=[
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'
];

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE_NAME);
    await cache.addAll(LOCAIS);
    for(const url of EXTERNOS){
      try{ await cache.add(url); }catch(e){ console.warn('Não foi possível pré-cachear',url,e); }
    }
    self.skipWaiting();
  })());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const nomes=await caches.keys();
    await Promise.all(nomes.filter(n=>n!==CACHE_NAME).map(n=>caches.delete(n)));
    await self.clients.claim();
  })());
});

async function responderRangeDoPmtiles(request){
  const cache=await caches.open(CACHE_NAME);
  let resp=await cache.match('./mapa_tgr_100km.pmtiles');
  if(!resp){
    resp=await fetch('./mapa_tgr_100km.pmtiles');
    if(resp.ok) await cache.put('./mapa_tgr_100km.pmtiles',resp.clone());
  }
  if(!resp) return fetch(request);

  const range=request.headers.get('range');
  if(!range) return resp;

  const blob=await resp.blob();
  const m=/bytes=(\d+)-(\d*)/.exec(range);
  if(!m) return resp;

  const inicio=Number(m[1]);
  const fim=m[2] ? Number(m[2]) : blob.size-1;
  if(inicio>=blob.size){
    return new Response(null,{
      status:416,
      headers:{'Content-Range':`bytes */${blob.size}`}
    });
  }

  const fimReal=Math.min(fim,blob.size-1);
  const parte=blob.slice(inicio,fimReal+1);
  return new Response(parte,{
    status:206,
    statusText:'Partial Content',
    headers:{
      'Content-Type':'application/octet-stream',
      'Accept-Ranges':'bytes',
      'Content-Range':`bytes ${inicio}-${fimReal}/${blob.size}`,
      'Content-Length':String(parte.size)
    }
  });
}

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;

  const url=new URL(event.request.url);

  if(url.origin===self.location.origin && url.pathname.endsWith('/mapa_tgr_100km.pmtiles')){
    event.respondWith(responderRangeDoPmtiles(event.request));
    return;
  }

  event.respondWith((async()=>{
    const cache=await caches.open(CACHE_NAME);
    const cached=await cache.match(event.request);
    if(cached) return cached;

    try{
      const rede=await fetch(event.request);
      if(rede && (rede.ok || rede.type==='opaque')){
        try{ await cache.put(event.request,rede.clone()); }catch(e){}
      }
      return rede;
    }catch(e){
      if(event.request.mode==='navigate'){
        const pagina=await cache.match('./index.html');
        if(pagina) return pagina;
      }
      throw e;
    }
  })());
});
