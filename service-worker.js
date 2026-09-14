const CACHE='tgr-pwa-v2';

const APP_SHELL=[
  './',
  './index.html',
  './manifest.json'
];

self.addEventListener('install',event=>{
  event.waitUntil(
    caches.open(CACHE).then(c=>c.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys().then(keys=>
      Promise.all(
        keys
          .filter(k=>k!==CACHE)
          .map(k=>caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch',event=>{
  const req=event.request;

  if(req.method!=='GET') return;

  const url=new URL(req.url);

  if(/\/(rotas\.csv|pix\.csv|Base%20de%20Clientes\.xlsx)$/i.test(url.pathname)){
    event.respondWith(
      fetch(req)
        .then(resp=>{
          const clone=resp.clone();

          caches.open(CACHE).then(c=>{
            c.put(req,clone);
          });

          return resp;
        })
        .catch(()=>{
          return caches.match(req);
        })
    );

    return;
  }

  event.respondWith(
    caches.match(req).then(cached=>{
      const network=fetch(req)
        .then(resp=>{
          if(resp && resp.ok){
            const clone=resp.clone();

            caches.open(CACHE).then(c=>{
              c.put(req,clone);
            });
          }

          return resp;
        })
        .catch(()=>cached);

      return cached || network;
    })
  );
});