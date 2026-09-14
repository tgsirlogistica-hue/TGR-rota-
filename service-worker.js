const CACHE='tgr-offline-completo-v1';

const LOCAL=[
  './',
  './index.html',
  './manifest.json',
  './leaflet.css',
  './leaflet.js'
];

const EXTERNAL=[
  'https://cdn.jsdelivr.net/npm/protomaps-leaflet@5.1.0/dist/protomaps-leaflet.js',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'
];

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const c=await caches.open(CACHE);
    await c.addAll(LOCAL);
    self.skipWaiting();
  })());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const nomes=await caches.keys();
    await Promise.all(nomes.filter(n=>n.startsWith('tgr-offline-') && n!==CACHE).map(n=>caches.delete(n)));
    await self.clients.claim();
  })());
});

function chaveNormalizada(url){
  const u=new URL(url);
  const nome=u.pathname.split('/').pop();
  if(['rotas.csv','pix.csv','Base%20de%20Clientes.xlsx','Base de Clientes.xlsx'].includes(nome)){
    u.search='';
  }
  return u.href;
}

async function respostaRangePmtiles(request){
  const c=await caches.open(CACHE);
  const base=new URL('./mapa_tgr_100km.pmtiles',self.location.href).href;
  let resp=await c.match(base) || await c.match('./mapa_tgr_100km.pmtiles');

  if(!resp){
    try{
      const rede=await fetch(base,{cache:'no-store'});
      if(rede.ok){
        await c.put(base,rede.clone());
        resp=rede;
      }
    }catch(e){}
  }
  if(!resp) return new Response('Mapa offline não disponível',{status:503});

  const range=request.headers.get('range');
  if(!range) return resp;

  const blob=await resp.blob();
  const m=/bytes=(\d+)-(\d*)/.exec(range);
  if(!m) return resp;

  const inicio=Number(m[1]);
  const fimSolicitado=m[2] ? Number(m[2]) : blob.size-1;
  if(inicio>=blob.size){
    return new Response(null,{status:416,headers:{'Content-Range':`bytes */${blob.size}`}});
  }

  const fim=Math.min(fimSolicitado,blob.size-1);
  const parte=blob.slice(inicio,fim+1);

  return new Response(parte,{
    status:206,
    statusText:'Partial Content',
    headers:{
      'Content-Type':'application/octet-stream',
      'Accept-Ranges':'bytes',
      'Content-Range':`bytes ${inicio}-${fim}/${blob.size}`,
      'Content-Length':String(parte.size)
    }
  });
}

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  const url=new URL(event.request.url);

  if(url.origin===self.location.origin && url.pathname.endsWith('/mapa_tgr_100km.pmtiles')){
    event.respondWith(respostaRangePmtiles(event.request));
    return;
  }

  event.respondWith((async()=>{
    const c=await caches.open(CACHE);

    // Data files are requested with ?v=Date.now(); ignore query when offline.
    if(url.origin===self.location.origin){
      const nome=decodeURIComponent(url.pathname.split('/').pop());
      if(['rotas.csv','pix.csv','Base de Clientes.xlsx'].includes(nome)){
        const semQuery=new URL(url.href);
        semQuery.search='';
        const salvo=await c.match(semQuery.href) || await c.match('./'+nome);
        try{
          const rede=await fetch(event.request);
          if(rede && rede.ok){
            await c.put(semQuery.href,rede.clone());
            return rede;
          }
        }catch(e){}
        if(salvo) return salvo;
      }
    }

    const cached=await c.match(event.request);
    if(cached) return cached;

    try{
      const rede=await fetch(event.request);
      if(rede && (rede.ok || rede.type==='opaque')){
        try{ await c.put(event.request,rede.clone()); }catch(e){}
      }
      return rede;
    }catch(e){
      if(event.request.mode==='navigate'){
        const pagina=await c.match('./index.html');
        if(pagina) return pagina;
      }
      throw e;
    }
  })());
});
