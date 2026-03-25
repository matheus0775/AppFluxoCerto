/* =====================================================
   FluxoCerto — Service Worker
   Estratégia: Cache-First para arquivos estáticos.
   Todos os arquivos do app são cacheados na instalação,
   permitindo uso 100% offline após o primeiro acesso.
===================================================== */

const CACHE_NAME    = 'fluxocerto-v1';
const CACHE_VERSION = 1;

// Arquivos que serão cacheados na instalação do SW
const ARQUIVOS_ESTATICOS = [
  './index.html',
  './manifest.json',
  // CDNs externas (Chart.js e Google Fonts são cacheados dinamicamente)
];

/* -------------------------------------------------------
   INSTALL — cacheia os arquivos estáticos imediatamente
------------------------------------------------------- */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Cacheando arquivos estáticos...');
      return cache.addAll(ARQUIVOS_ESTATICOS);
    })
  );
  // Força o novo SW a ativar imediatamente sem aguardar
  self.skipWaiting();
});

/* -------------------------------------------------------
   ACTIVATE — remove caches antigos de versões anteriores
------------------------------------------------------- */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((chaves) => {
      return Promise.all(
        chaves
          .filter((chave) => chave !== CACHE_NAME)
          .map((chaveAntiga) => {
            console.log('[SW] Removendo cache antigo:', chaveAntiga);
            return caches.delete(chaveAntiga);
          })
      );
    })
  );
  // Toma controle de todas as abas imediatamente
  self.clients.claim();
});

/* -------------------------------------------------------
   FETCH — intercepta requisições de rede
   Estratégia: Cache-First → se não tiver no cache, vai
   à rede e salva no cache para a próxima vez.
------------------------------------------------------- */
self.addEventListener('fetch', (event) => {
  // Ignora requisições que não sejam GET
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((respostaCache) => {
      // Se encontrou no cache, retorna direto (offline-first)
      if (respostaCache) {
        return respostaCache;
      }

      // Senão, busca na rede e salva no cache dinamicamente
      return fetch(event.request)
        .then((respostaRede) => {
          // Só cacheia respostas válidas (status 200)
          if (!respostaRede || respostaRede.status !== 200 || respostaRede.type === 'opaque') {
            return respostaRede;
          }

          // Clona a resposta (só pode ser consumida uma vez)
          const respostaParaCache = respostaRede.clone();

          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, respostaParaCache);
          });

          return respostaRede;
        })
        .catch(() => {
          // Se estiver completamente offline e não tiver cache,
          // retorna o index.html como fallback
          if (event.request.destination === 'document') {
            return caches.match('./index.html');
          }
        });
    })
  );
});
