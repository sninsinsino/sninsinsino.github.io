/*
 * Lifo preview service worker.
 *
 *  - /<key>/...  -> the in-browser VM (port registered for <key>), via the editor tab's MessageChannel
 *  - requests from a preview page (client mapped to a key) -> the VM too, so root-absolute URLs
 *    (/src/main.js) work unmodified
 *  - everything else (the editor itself) -> network, with COOP/COEP added so the site is
 *    cross-origin isolated (GitHub Pages cannot send those headers itself)
 */
const VERSION = 'lifo-sw-2';
const REQUEST_TIMEOUT_MS = 30000;
const KEYS_CACHE = 'lifo-keys-v1';
const KEYS_URL = '/__lifo_keys__';

/** boxId -> MessagePort to that editor tab's bridge */
const hostPorts = new Map();
let activeBox = null;
const pending = new Map();
/** clientId -> { key, port } */
const clientBox = new Map();
const wsConnClient = new Map();
/** key -> port (lifo VM)  |  { server, port } (Wasmer sandbox route) */
let keys = null;
/** Wasmer HTTP routes: serverId -> { id, port, pending } (protocol of @wasmer/sdk's service worker) */
const wasmerRoutes = new Map();
let wasmerRecovery = null;

async function loadKeys() {
	if (keys) return keys;
	keys = new Map();
	try {
		const c = await caches.open(KEYS_CACHE);
		const r = await c.match(KEYS_URL);
		if (r) {
			const o = await r.json();
			for (const k of Object.keys(o)) keys.set(k, o[k]);
		}
	} catch { /* no saved keys */ }
	return keys;
}
async function saveKeys() {
	try {
		const c = await caches.open(KEYS_CACHE);
		await c.put(KEYS_URL, new Response(JSON.stringify(Object.fromEntries(keys)), { headers: { 'content-type': 'application/json' } }));
	} catch { /* ignore */ }
}

function withIsolation(resp) {
	if (!resp || resp.status === 0 || resp.type === 'opaque' || resp.type === 'opaqueredirect') return resp;
	const h = new Headers(resp.headers);
	h.set('Cross-Origin-Embedder-Policy', 'credentialless');
	h.set('Cross-Origin-Opener-Policy', 'same-origin');
	h.set('Cross-Origin-Resource-Policy', 'cross-origin');
	return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers: h });
}

/** Injected into VM-served HTML: keeps the /<key> prefix on client-side navigation so refresh always works. */
const historyShim = (key) => `(function(K){var P='/'+K,rp=history.pushState,rr=history.replaceState;
function fix(u){if(u==null)return u;try{var x=new URL(u,location.href);if(x.origin!==location.origin)return u;if(x.pathname===P||x.pathname.indexOf(P+'/')===0)return u;return P+x.pathname+x.search+x.hash}catch(e){return u}}
history.pushState=function(s,t,u){return rp.call(this,s,t,fix(u))};history.replaceState=function(s,t,u){return rr.call(this,s,t,fix(u))};
try{navigator.serviceWorker.register=function(){return Promise.reject(new Error('service workers are disabled inside previews'))}}catch(e){}
})(${JSON.stringify(key)});`;

/** Wasmer sandboxes can't stream or upgrade: WebSockets (Vite HMR) become HTTP long-polls to a bridge inside the guest. */
const wsPollShim = (target) => `(function(){var Orig=window.WebSocket,seq=0,T=${JSON.stringify(String(target))};
function LP(url,protocols){var u;try{u=new URL(url,location.href)}catch(e){return new Orig(url,protocols)}
if(!(u.host===location.host&&(u.protocol==='ws:'||u.protocol==='wss:')))return new Orig(url,protocols);
var self=this,closed=false,id='h'+Date.now().toString(36)+(seq++)+Math.random().toString(36).slice(2,6),
proto=Array.isArray(protocols)?protocols.join(','):(protocols||'');
this.url=u.href;this.readyState=0;this.bufferedAmount=0;this.extensions='';this.protocol=Array.isArray(protocols)?(protocols[0]||''):(protocols||'');this.binaryType='blob';
this.onopen=null;this.onmessage=null;this.onclose=null;this.onerror=null;this._l={open:[],message:[],close:[],error:[]};
this.__emit=function(type,init){var ev;try{ev=type==='message'?new MessageEvent('message',init):new(type==='close'?CloseEvent:Event)(type,init)}catch(_){ev={type:type};for(var k in init)ev[k]=init[k]}
var h=self['on'+type];if(h)try{h.call(self,ev)}catch(_){}self._l[type].forEach(function(f){try{f.call(self,ev)}catch(_){}})};
function finish(code){if(self.readyState===3)return;closed=true;self.readyState=3;self.__emit('close',{code:code||1006,reason:'',wasClean:code===1000})}
function poll(){if(closed)return;fetch('/__lifo_hmr/poll?id='+id,{cache:'no-store'}).then(function(r){return r.json()}).then(function(j){
(j.items||[]).forEach(function(m){if(m.t==='open'){self.readyState=1;self.__emit('open',{})}else if(m.t==='message'){self.__emit('message',{data:m.d})}else if(m.t==='close'){finish(m.code)}});
if(j.closed)finish(1006);else poll()}).catch(function(){if(!closed)setTimeout(poll,1000)})}
fetch('/__lifo_hmr/open?id='+id+'&target='+T+'&path='+encodeURIComponent(u.pathname+u.search)+'&proto='+encodeURIComponent(proto),{cache:'no-store'}).then(function(r){return r.json()}).then(function(){poll()}).catch(function(){finish(1006)});
this.send=function(d){fetch('/__lifo_hmr/send?id='+id,{method:'POST',body:typeof d==='string'?d:String(d)}).catch(function(){})};
this.close=function(c){if(self.readyState>=2)return;self.readyState=2;fetch('/__lifo_hmr/close?id='+id,{method:'POST'}).catch(function(){});finish(c||1000)};
this.addEventListener=function(t,f){if(self._l[t])self._l[t].push(f)};this.removeEventListener=function(t,f){if(self._l[t]){var i=self._l[t].indexOf(f);if(i>=0)self._l[t].splice(i,1)}};this.dispatchEvent=function(){return true};}
LP.CONNECTING=0;LP.OPEN=1;LP.CLOSING=2;LP.CLOSED=3;window.WebSocket=LP;})();`;

/** Tunnels same-host WebSockets (Vite HMR) through this worker to the in-VM server. */
const WS_SHIM = `(function(){
  var sw = navigator.serviceWorker;
  if (!sw || !sw.controller) return;
  var OrigWS = window.WebSocket;
  var conns = new Map();
  var seq = 0;
  function b64enc(u8){var s='';for(var i=0;i<u8.length;i++)s+=String.fromCharCode(u8[i]);return btoa(s);}
  function b64dec(b){var s=atob(b),u=new Uint8Array(s.length);for(var i=0;i<s.length;i++)u[i]=s.charCodeAt(i);return u;}
  sw.addEventListener('message', function(e){
    var m = e.data||{}; if(!m.connId) return;
    var c = conns.get(m.connId); if(!c) return;
    if(m.type==='ws-opened') c.__open();
    else if(m.type==='ws-message') c.__msg(m.data, m.binary);
    else if(m.type==='ws-close'){ conns.delete(m.connId); c.__close(1006,''); }
  });
  function LifoWebSocket(url, protocols){
    var u; try{ u = new URL(url, location.href); }catch(_){ return new OrigWS(url, protocols); }
    var sameHost = u.host === location.host && (u.protocol === 'ws:' || u.protocol === 'wss:');
    if(!sameHost) return new OrigWS(url, protocols);
    var self = this;
    this.url = u.href;
    this.readyState = 0;
    this.bufferedAmount = 0;
    this.extensions = '';
    this.protocol = Array.isArray(protocols)?(protocols[0]||''):(protocols||'');
    this.binaryType = 'blob';
    this.onopen=null; this.onmessage=null; this.onclose=null; this.onerror=null;
    this._listeners = {open:[],message:[],close:[],error:[]};
    this.connId = 'ws'+(seq++)+'-'+Math.random().toString(36).slice(2);
    conns.set(this.connId, this);
    navigator.serviceWorker.controller.postMessage({type:'ws-open',connId:this.connId,url:u.pathname+u.search,protocol:this.protocol});
    this.__open=function(){ self.readyState=1; self.__emit('open',{}); };
    this.__msg=function(b64,binary){
      var data;
      if(binary){ var buf=b64dec(b64).buffer; data = self.binaryType==='arraybuffer'?buf:new Blob([buf]); }
      else { data = new TextDecoder().decode(b64dec(b64)); }
      self.__emit('message',{data:data});
    };
    this.__close=function(code,reason){ if(self.readyState===3)return; self.readyState=3; self.__emit('close',{code:code||1000,reason:reason||'',wasClean:code===1000}); };
    this.__emit=function(type,init){
      var ev;
      try{ ev = type==='message'?new MessageEvent('message',init):new (type==='close'?CloseEvent:Event)(type,init); }
      catch(_){ ev={type:type}; for(var k in init) ev[k]=init[k]; }
      var h=self['on'+type]; if(h) try{h.call(self,ev);}catch(_){}
      self._listeners[type].forEach(function(fn){ try{fn.call(self,ev);}catch(_){} });
    };
  }
  LifoWebSocket.prototype.send=function(data){
    var u8;
    if(typeof data==='string') u8=new TextEncoder().encode(data);
    else if(data instanceof ArrayBuffer) u8=new Uint8Array(data);
    else if(ArrayBuffer.isView(data)) u8=new Uint8Array(data.buffer,data.byteOffset,data.byteLength);
    else u8=new TextEncoder().encode(String(data));
    navigator.serviceWorker.controller.postMessage({type:'ws-send',connId:this.connId,data:b64enc(u8),binary:typeof data!=='string'});
  };
  LifoWebSocket.prototype.close=function(code,reason){
    if(this.readyState>=2)return; this.readyState=2;
    navigator.serviceWorker.controller.postMessage({type:'ws-close',connId:this.connId});
    this.__close(code||1000,reason||'');
  };
  LifoWebSocket.prototype.addEventListener=function(t,fn){ if(this._listeners[t]) this._listeners[t].push(fn); };
  LifoWebSocket.prototype.removeEventListener=function(t,fn){ if(this._listeners[t]){var i=this._listeners[t].indexOf(fn); if(i>=0)this._listeners[t].splice(i,1);} };
  LifoWebSocket.prototype.dispatchEvent=function(){ return true; };
  LifoWebSocket.CONNECTING=0; LifoWebSocket.OPEN=1; LifoWebSocket.CLOSING=2; LifoWebSocket.CLOSED=3;
  window.WebSocket = LifoWebSocket;
})();`;

function statusPage(title, body, reloadWhenUp) {
	return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#16161e;color:#c0caf5;font-family:ui-monospace,Menlo,monospace}
.card{text-align:center;padding:2rem;max-width:36rem}h1{font-size:1rem;margin:.5rem 0}p{font-size:.8rem;color:#7a82a8;line-height:1.6}code{color:#7aa2f7;background:#1a1b26;padding:.1rem .4rem;border-radius:4px}
.dot{display:inline-block;width:.5em;height:.5em;border-radius:50%;background:#e0af68;margin-right:.4em;animation:p 1.2s ease-in-out infinite}@keyframes p{50%{opacity:.25}}</style></head>
<body><div class="card"><h1>${title}</h1>${body}</div>${reloadWhenUp ? `<script>(function poll(){setTimeout(function(){fetch(location.href,{cache:'no-store'}).then(function(r){if(r.headers.get('x-lifo')!=='no-server'&&r.status!==503)location.reload();else poll()}).catch(poll)},1500)})()</script>` : ''}</body></html>`;
}
const htmlHeaders = (extra) => Object.assign({ 'content-type': 'text/html; charset=utf-8' }, extra || {});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

async function routeToClient(connId, msg) {
	const clientId = wsConnClient.get(connId);
	if (!clientId) return;
	const client = await self.clients.get(clientId);
	if (client) client.postMessage(msg);
	if (msg.type === 'ws-close') wsConnClient.delete(connId);
}

async function keyFromClient(clientId) {
	if (!clientId) return null;
	if (clientBox.has(clientId)) return clientBox.get(clientId);
	const client = await self.clients.get(clientId);
	if (!client) return null;
	const b = await boxFromUrl(client.url);
	if (b) clientBox.set(clientId, b);
	return b;
}
async function boxFromUrl(href) {
	let u;
	try { u = new URL(href); } catch { return null; }
	if (u.origin !== self.location.origin) return null;
	const seg = u.pathname.split('/')[1];
	const ks = await loadKeys();
	return seg && ks.has(seg) ? { key: seg, port: ks.get(seg) } : null;
}

self.addEventListener('message', (event) => {
	const data = event.data || {};

	if (data.type === 'lifo-connect' && event.ports && event.ports[0] && data.boxId) {
		const boxId = data.boxId;
		const prev = hostPorts.get(boxId);
		if (prev) { try { prev.close(); } catch { /* closed */ } }
		const port = event.ports[0];
		hostPorts.set(boxId, port);
		activeBox = boxId;
		port.onmessage = (ev) => {
			const msg = ev.data || {};
			if (msg.type === 'response') {
				const entry = pending.get(msg.requestId);
				if (entry) { pending.delete(msg.requestId); clearTimeout(entry.timer); entry.resolve(msg); }
			} else if (msg.type === 'ws-opened' || msg.type === 'ws-message' || msg.type === 'ws-close') {
				void routeToClient(msg.connId, msg);
			}
		};
		port.postMessage({ type: 'lifo-connected' });
		return;
	}

	if (data.type === 'wasmer-sdk:http-register' && event.ports && event.ports[0] && typeof data.serverId === 'string') {
		const port = event.ports[0];
		registerWasmerRoute(data.serverId, port);
		port.postMessage({ type: 'wasmer-sdk:http-ready', serverId: data.serverId });
		return;
	}

	if (data.type === 'lifo-keys' && data.keys) {
		event.waitUntil((async () => {
			keys = new Map(Object.entries(data.keys));
			clientBox.clear();
			await saveKeys();
			if (event.source) event.source.postMessage({ type: 'lifo-keys-ack', nonce: data.nonce });
		})());
		return;
	}

	if (data.type === 'ws-open' && event.source) {
		const client = event.source;
		event.waitUntil((async () => {
			const box = await keyFromClient(client.id);
			if (!box || !(await ensureHost())) {
				client.postMessage({ type: 'ws-close', connId: data.connId });
				return;
			}
			wsConnClient.set(data.connId, client.id);
			let url = data.url;
			if (url === '/' + box.key || url.indexOf('/' + box.key + '/') === 0) url = url.slice(box.key.length + 1) || '/';
			hostPorts.get(activeBox).postMessage({ type: 'ws-open', connId: data.connId, port: box.port, url, protocol: data.protocol });
		})());
		return;
	}
	if ((data.type === 'ws-send' || data.type === 'ws-close') && data.connId) {
		const p = activeBox ? hostPorts.get(activeBox) : null;
		if (p) p.postMessage(data);
		if (data.type === 'ws-close') wsConnClient.delete(data.connId);
		return;
	}
});

function bufToB64(buf) {
	const bytes = new Uint8Array(buf);
	let bin = '';
	for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
	return btoa(bin);
}
function b64ToBuf(b64) {
	const bin = atob(b64);
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return bytes;
}

/** The SW may have been revived from idle with no host: ask the editor tab(s) to reconnect. */
async function editorAlive() {
	const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
	return cs.some((c) => { try { const p = new URL(c.url).pathname; return p === '/' || p === '/index.html'; } catch { return false; } });
}
async function ensureHost(timeoutMs = 5000) {
	// A closed editor tab leaves a dead MessagePort behind; don't wait on it.
	if (!(await editorAlive())) { hostPorts.clear(); activeBox = null; return false; }
	if (activeBox && hostPorts.has(activeBox)) return true;
	const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
	for (const c of clients) c.postMessage({ type: 'lifo-need-host' });
	const deadline = Date.now() + timeoutMs;
	while (!(activeBox && hostPorts.has(activeBox)) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 40));
	return !!(activeBox && hostPorts.has(activeBox));
}

function vmRequest(port, path, request, bodyB64) {
	return new Promise((resolve) => {
		const host = activeBox ? hostPorts.get(activeBox) : null;
		if (!host) { resolve(null); return; }
		const requestId = Math.random().toString(36).slice(2) + Date.now().toString(36);
		const timer = setTimeout(() => { pending.delete(requestId); resolve(null); }, REQUEST_TIMEOUT_MS);
		pending.set(requestId, { resolve, timer });
		const headers = {};
		for (const [k, v] of request.headers.entries()) headers[k] = v;
		if (bodyB64 && headers['content-length'] == null && headers['transfer-encoding'] == null) {
			headers['content-length'] = String(b64ToBuf(bodyB64).length);
		}
		host.postMessage({ type: 'request', requestId, port, method: request.method, url: path, headers, body: bodyB64 });
	});
}

const STRIP_HEADERS = new Set(['set-cookie', 'content-encoding', 'content-length', 'transfer-encoding', 'connection', 'keep-alive']);

async function serveFromVm(event, key, port, path) {
	let bodyB64 = '';
	if (event.request.method !== 'GET' && event.request.method !== 'HEAD') bodyB64 = bufToB64(await event.request.arrayBuffer());
	const wantsHtml = event.request.destination === 'document' || event.request.destination === 'iframe'
		|| (event.request.headers.get('accept') || '').includes('text/html');
	if (!(await ensureHost())) {
		return withIsolation(new Response(
			wantsHtml ? statusPage('VM is not running', '<p>Open the editor at <code>/</code> in another tab and keep it open &mdash; it hosts the virtual machine.</p><p><span class="dot"></span>this page reloads automatically</p>', true) : 'Lifo VM is not connected',
			{ status: 503, headers: wantsHtml ? htmlHeaders() : { 'content-type': 'text/plain' } },
		));
	}
	const res = await vmRequest(port, path, event.request, bodyB64);
	if (!res) return withIsolation(new Response('Lifo VM did not answer', { status: 504, headers: { 'content-type': 'text/plain' } }));
	const headers = {};
	let contentType = '';
	let lifoMarker = '';
	for (const [k, v] of Object.entries(res.headers || {})) {
		if (STRIP_HEADERS.has(k.toLowerCase())) continue;
		headers[k] = v;
		if (k.toLowerCase() === 'content-type') contentType = String(v).toLowerCase();
		if (k.toLowerCase() === 'x-lifo') lifoMarker = String(v);
	}
	if (res.statusCode === 404 && lifoMarker === 'no-server' && wantsHtml) {
		return withIsolation(new Response(
			statusPage('Nothing is running on port ' + port, '<p>Start a dev server in the terminal, e.g. <code>npx vite &amp;</code></p><p><span class="dot"></span>this page reloads automatically</p>', true),
			{ status: 404, headers: htmlHeaders({ 'x-lifo': 'no-server' }) },
		));
	}
	const bodyBuf = res.bodyBuffer instanceof ArrayBuffer ? new Uint8Array(res.bodyBuffer) : (res.body ? b64ToBuf(res.body) : null);
	if (contentType.includes('text/html') && bodyBuf) {
		let html = new TextDecoder().decode(bodyBuf);
		const tag = `<script>${historyShim(key)}</script><script>${WS_SHIM}</script>`;
		const m = html.match(/<head[^>]*>/i);
		html = m ? html.slice(0, m.index + m[0].length) + tag + html.slice(m.index + m[0].length) : tag + html;
		delete headers['Content-Length'];
		return withIsolation(new Response(html, { status: res.statusCode || 200, headers }));
	}
	const nullBody = res.statusCode === 204 || res.statusCode === 205 || res.statusCode === 304;
	return withIsolation(new Response(nullBody ? null : bodyBuf, { status: res.statusCode || 200, headers }));
}

// ---- Wasmer HTTP routes (same message protocol as @wasmer/sdk's own service worker) ----
function registerWasmerRoute(id, port) {
	const route = { id, port, pending: new Map() };
	wasmerRoutes.set(id, route);
	port.addEventListener('message', (event) => receiveWasmerResponse(route, event.data));
	port.start();
	return route;
}
function receiveWasmerResponse(route, m) {
	if (!m || typeof m !== 'object') return;
	if (m.type === 'wasmer-sdk:http-close' && m.serverId === route.id) {
		for (const p of route.pending.values()) { clearTimeout(p.timer); p.reject(new Error('the Wasmer server was closed')); }
		wasmerRoutes.delete(route.id);
		return;
	}
	if (m.type !== 'wasmer-sdk:http-response' || m.serverId !== route.id || typeof m.requestId !== 'string') return;
	const p = route.pending.get(m.requestId);
	if (!p) return;
	route.pending.delete(m.requestId);
	clearTimeout(p.timer);
	if (m.error) p.reject(new Error(m.error)); else p.resolve(m);
}
/** After a worker restart the routes are gone; the page that owns the sandbox (/.wasmer/host.html) can hand them back. */
async function recoverWasmerRoutes() {
	if (wasmerRecovery) return wasmerRecovery;
	wasmerRecovery = (async () => {
		const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
		const hosts = clients.filter((c) => { try { return new URL(c.url).pathname === '/.wasmer/host.html'; } catch { return false; } });
		await Promise.all(hosts.map((client) => new Promise((resolve) => {
			const channel = new MessageChannel();
			const timer = setTimeout(() => { channel.port1.close(); resolve(); }, 5000);
			channel.port1.onmessage = (ev) => {
				for (const r of (ev.data && ev.data.routes) || []) { const port = ev.ports[r.index]; if (port && !wasmerRoutes.has(r.serverId)) registerWasmerRoute(r.serverId, port); }
				clearTimeout(timer); channel.port1.close(); resolve();
			};
			client.postMessage({ type: 'wasmer-sdk:http-recover' }, [channel.port2]);
		})));
	})().finally(() => { wasmerRecovery = null; });
	return wasmerRecovery;
}
async function wasmerRouteFor(id) {
	if (!wasmerRoutes.has(id)) await recoverWasmerRoutes();
	return wasmerRoutes.get(id) || null;
}
async function serveFromWasmer(event, key, target, path) {
	const request = event.request;
	const route = await wasmerRouteFor(target.server);
	const wantsHtml = request.destination === 'document' || request.destination === 'iframe' || (request.headers.get('accept') || '').includes('text/html');
	if (!route) {
		return withIsolation(new Response(
			wantsHtml ? statusPage('Sandbox is not running', '<p>Open the editor at <code>/</code> in another tab and keep it open &mdash; it hosts the sandbox.</p><p><span class="dot"></span>this page reloads automatically</p>', true) : 'sandbox not connected',
			{ status: 503, headers: wantsHtml ? htmlHeaders() : { 'content-type': 'text/plain' } }));
	}
	const requestId = crypto.randomUUID();
	const body = new Uint8Array(await request.arrayBuffer());
	const response = new Promise((resolve, reject) => {
		const timer = setTimeout(() => { route.pending.delete(requestId); reject(new Error('the sandbox did not answer within 300s')); }, 300000);
		route.pending.set(requestId, { resolve, reject, timer });
	});
	route.port.postMessage({ type: 'wasmer-sdk:http-request', serverId: route.id, requestId, method: request.method, path, headers: [...request.headers.entries()], body }, [body.buffer]);
	let m;
	try { m = await response; } catch (e) { return withIsolation(new Response(String(e && e.message || e), { status: 502, headers: { 'content-type': 'text/plain; charset=utf-8' } })); }
	const status = m.status || 502;
	const headers = new Headers(m.headers);
	headers.delete('content-length'); headers.delete('content-encoding'); headers.delete('transfer-encoding');
	const bodyAllowed = status >= 200 && status !== 204 && status !== 205 && status !== 304;
	let bytes = bodyAllowed && m.body ? Uint8Array.from(m.body) : null;
	if (bytes && (headers.get('content-type') || '').toLowerCase().includes('text/html')) {
		let html = new TextDecoder().decode(bytes);
		const tag = `<script>${historyShim(key)}</script><script>${wsPollShim(target.port)}</script>`;
		const h = html.match(/<head[^>]*>/i);
		html = h ? html.slice(0, h.index + h[0].length) + tag + html.slice(h.index + h[0].length) : tag + html;
		bytes = new TextEncoder().encode(html);
	}
	return withIsolation(new Response(bytes, { status, statusText: m.statusText, headers }));
}

function serveTarget(event, key, target, path) {
	return typeof target === 'number' ? serveFromVm(event, key, target, path) : serveFromWasmer(event, key, target, path);
}

function stripKey(pathname, key) {
	const p = '/' + key;
	if (pathname === p) return '/';
	return pathname.indexOf(p + '/') === 0 ? pathname.slice(p.length) : pathname;
}

self.addEventListener('fetch', (event) => {
	const req = event.request;
	if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') return;
	const url = new URL(req.url);
	if (url.origin !== self.location.origin) return;
	if (url.pathname === '/sw.js') return;

	event.respondWith((async () => {
		const ks = await loadKeys();
		const seg = url.pathname.split('/')[1];

		// 0. HMR bridge for Wasmer sandboxes (long-poll endpoints served by a script inside the guest)
		if (seg === '__lifo_hmr' && ks.has('__hmr')) {
			return serveFromWasmer(event, '__hmr', ks.get('__hmr'), url.pathname + url.search);
		}

		// 1. /<key>/... entry (navigation, or any request addressed to the key)
		if (seg && ks.has(seg) && seg !== '__hmr') {
			if (url.pathname === '/' + seg) return Response.redirect(url.origin + '/' + seg + '/' + url.search, 302);
			const port = ks.get(seg);
			if (req.mode === 'navigate' && event.resultingClientId) clientBox.set(event.resultingClientId, { key: seg, port });
			return serveTarget(event, seg, port, stripKey(url.pathname, seg) + url.search);
		}

		// 2. request made by a preview page (root-absolute URLs)
		let box = event.clientId ? await keyFromClient(event.clientId) : null;
		if (!box && req.mode === 'navigate' && req.referrer) box = await boxFromUrl(req.referrer);
		if (box) {
			// a link inside the preview to "/about": send the tab to /<key>/about so it stays refreshable
			if (req.mode === 'navigate') {
				return Response.redirect(url.origin + '/' + box.key + url.pathname + url.search, 302);
			}
			return serveTarget(event, box.key, box.port, url.pathname + url.search);
		}

		// 3. the editor site itself: network, with isolation headers
		try {
			return withIsolation(await fetch(req));
		} catch (e) {
			return new Response('offline', { status: 503 });
		}
	})());
});
