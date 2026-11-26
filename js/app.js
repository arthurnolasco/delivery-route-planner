/*
 * UI layer: screens, user actions, map and persistence.
 * Route optimisation lives in js/routing.js.
 *
 * The interface text is in Brazilian Portuguese (the app was built for a
 * delivery day in Guarapari, Brazil); code and comments are in English.
 *
 * Two modes:
 *  - Firebase: js/config.js filled in. Asks for a shared password and keeps
 *    the plan in Firestore, synced live across every device.
 *  - Demo: no config (or ?demo in the URL). Loads fictional sample data and
 *    saves to localStorage only.
 */
(() => {
"use strict";
const { PARAMS, distanceKm, parseCoord, hasCoord, groupStops, computeRoutes, routesAreValid, routeMetrics, mapsLinks } = window.Routing;

const CONFIG = window.APP_CONFIG || {};
const DEMO = !CONFIG.firebase || !CONFIG.firebase.apiKey || /YOUR_/.test(CONFIG.firebase.apiKey) || /[?&]demo\b/.test(location.search);
const COLORS = ["#e4572e","#1e88e5","#2e9d5b","#c98a00","#8e5bd6","#d63384","#00897b","#6d4c41"];
const STORAGE_DEMO = "route-planner-demo", STORAGE_TAB = "route-planner-tab";

let plan = null, planRef = null, loaded = false, signingIn = false, loginError = "";
let session = DEMO ? "in" : "checking";
const TABS = ["routes", "skipped", "settings"];
const tabFromHash = () => TABS.find(t => location.hash === "#" + t);
const ui = { tab: tabFromHash() || readStorage(STORAGE_TAB) || "routes", filter: "all", removing: null, editing: {}, drafts: {}, adding: false };

/* ---------- Helpers ---------- */
function readStorage(k){ try { return localStorage.getItem(k); } catch { return null; } }
function writeStorage(k, v){ try { localStorage.setItem(k, v); } catch {} }
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const fmt = (x, d = 1) => x.toLocaleString("pt-BR", {minimumFractionDigits: d, maximumFractionDigits: d});
const colorOf = i => COLORS[i % COLORS.length];
const stableJson = o => JSON.stringify(o, (k, v) => v && typeof v === "object" && !Array.isArray(v) ? Object.keys(v).sort().reduce((a, key) => (a[key] = v[key], a), {}) : v);
const itemLabel = () => (plan && plan.item) || {singular: "item", plural: "itens"};
const qtyText = q => `${q} ${q > 1 ? itemLabel().plural : itemLabel().singular}`;
const pinLink = p => `https://www.google.com/maps/search/?api=1&query=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
const searchLink = o => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.address + (CONFIG.city ? ", " + CONFIG.city : ""))}`;
const findOrder = (p, id) => p.orders.find(o => o.id === id);

/* ---------- Configurable header ---------- */
(function setupHeader(){
  const title = CONFIG.title || "Roteirizador de Entregas";
  document.title = title;
  document.getElementById("title").textContent = title;
  document.getElementById("eyebrow").textContent = CONFIG.eyebrow || "Roteirização de entregas";
  document.getElementById("subtitle").textContent = `Tempos estimados com ${PARAMS.MIN_PER_STOP} min por parada e ${PARAMS.SPEED_KMH} km/h de média.`;
  if (CONFIG.logo){
    const img = document.getElementById("logo");
    img.src = CONFIG.logo; img.alt = CONFIG.logoAlt || ""; img.hidden = false;
    document.getElementById("defaultLogo").remove();
  }
})();

/* ---------- Persistence ---------- */
let saving = false, saveQueued = false;
async function save(){
  if (saving){ saveQueued = true; return; }
  saving = true;
  try {
    if (DEMO) writeStorage(STORAGE_DEMO, JSON.stringify(plan));
    else await planRef.set(clone(plan));
  } catch (e) {
    toast(e && e.code === "permission-denied" ? "Sem permissão para salvar. Saia e entre de novo." : "Erro ao salvar. Verifique a conexão e tente novamente.");
  }
  saving = false;
  if (saveQueued){ saveQueued = false; save(); }
}
/** Applies a change to a copy of the plan, re-optimises if needed, renders and saves. */
function update(change, message, reoptimise = true){
  if (!plan) return;
  const next = clone(plan); change(next);
  if (reoptimise) next.routes = computeRoutes(next);
  next.updatedAt = new Date().toISOString();
  plan = next; render(); save(); if (message) toast(message);
}

/* ---------- Actions ---------- */
function skipOrder(id, reason){
  ui.removing = null;
  update(p => { const o = findOrder(p, id); o.status = "skipped"; o.reason = reason?.trim() || "Tirado da rota manualmente"; }, "Pedido tirado da rota. Rotas recalculadas.");
}
function routeOrder(id){
  update(p => { const o = findOrder(p, id); o.status = "routed"; o.reason = ""; }, "Pedido incluído. Rotas recalculadas.");
}
function saveCoord(id, c, addToRoute){
  delete ui.editing[id]; delete ui.drafts["coord" + id];
  update(p => { const o = findOrder(p, id); o.lat = c.lat; o.lng = c.lng; if (addToRoute){ o.status = "routed"; o.reason = ""; } },
    addToRoute ? "Coordenada salva e pedido incluído. Rotas recalculadas." : "Coordenada salva.", addToRoute);
}
function addCourier(name){
  update(p => { p.couriers.push({id: "c" + Date.now().toString(36), name: name.trim() || `Motoboy ${p.couriers.length + 1}`}); }, "Motoboy adicionado. Rotas recalculadas.");
}
function removeCourier(id){
  if (ui.filter === id) ui.filter = "all";
  update(p => { p.couriers = p.couriers.filter(c => c.id !== id); if (p.routes) delete p.routes[id]; }, "Motoboy removido. Rotas recalculadas.");
}
function renameCourier(id, name){
  const c = plan.couriers.find(x => x.id === id); name = name.trim();
  if (!c || !name || name === c.name) return;
  update(p => { p.couriers.find(x => x.id === id).name = name; }, "Nome salvo.", false);
}
function setDepot(name, c){
  update(p => { p.depot = {name: name.trim() || "Ponto de saída", lat: c.lat, lng: c.lng}; }, "Ponto de saída alterado. Rotas recalculadas.");
}
function newOrderIsValid(){
  const d = ui.drafts;
  return !!(parseCoord(d.newCoord || "") && (d.newName || "").trim() && (+d.newQty || 0) > 0);
}
function addOrder(){
  if (!newOrderIsValid()) return;
  const d = ui.drafts, c = parseCoord(d.newCoord);
  ui.adding = false;
  update(p => {
    const id = Math.max(0, ...p.orders.map(o => +o.id || 0)) + 1;
    p.orders.push({id, name: d.newName.trim(), phone: (d.newPhone || "").trim() || "Sem telefone", qty: Math.max(1, Math.round(+d.newQty)),
      address: (d.newAddress || "").trim() || "Endereço não informado", lat: c.lat, lng: c.lng, notes: (d.newNotes || "").trim(), status: "routed", reason: "", extra: true});
  }, "Entrega adicionada. Rotas recalculadas.");
  ["newName","newQty","newPhone","newAddress","newCoord","newNotes"].forEach(k => delete ui.drafts[k]);
}

/* ---------- Screens ---------- */
const app = document.getElementById("app");
function render(){
  document.querySelectorAll(".tab").forEach(t => t.setAttribute("aria-selected", String(t.dataset.tab === ui.tab)));
  document.querySelector(".tabs").hidden = session !== "in" || !plan;
  const show = html => { app.innerHTML = `<div class="wrap gutter">${html}</div>`; };
  if (session === "checking") return show(`<div class="empty">Abrindo…</div>`);
  if (session === "out") return show(loginView());
  if (!plan) return show(loaded ? importView() : `<div class="empty">Carregando pedidos…</div>`);

  const skipped = plan.orders.filter(o => o.status !== "routed" || !hasCoord(o));
  document.getElementById("skippedCount").textContent = skipped.length;
  let h = "";
  if (DEMO) h += `<div class="banner"><span>Demonstração com dados fictícios. As alterações ficam só neste navegador.</span><button class="btn btn-ghost btn-sm" data-reset>Restaurar exemplo</button></div>`;
  h += ui.tab === "routes" ? routesView() : ui.tab === "skipped" ? skippedView(skipped) : settingsView();
  show(h);
  if (ui.tab === "routes") drawMap();
}

function courierRoutes(){
  return plan.couriers.map((courier, i) => {
    const orders = (plan.routes[courier.id] || []).map(id => findOrder(plan, id)).filter(Boolean);
    return {courier, i, color: colorOf(i), orders, metrics: routeMetrics(orders, plan)};
  });
}

function routesView(){
  const R = courierRoutes();
  const nOrders = R.reduce((a, r) => a + r.orders.length, 0), nItems = R.reduce((a, r) => a + r.metrics.items, 0);
  const lastFinish = Math.max(0, ...R.map(r => r.metrics.minutes));
  let h = `<div class="summary">
    <div class="stat"><b>${nOrders}</b><span>pedidos na rota</span></div>
    <div class="stat"><b>${nItems}</b><span>${esc(itemLabel().plural)}</span></div>
    <div class="stat"><b>~${Math.round(lastFinish)} min</b><span>até a última entrega</span></div></div>`;
  if (plan.depot) h += `<div class="origin"><span class="pin"></span><span>Saída: <b>${esc(plan.depot.name)}</b>${plan.returnToDepot ? " · voltam ao final" : ""}</span></div>`;
  h += newOrderView();
  if (window.L) h += `<figure class="map-box"><div id="map" role="img" aria-label="Mapa das rotas"></div>
    <figcaption class="cap">Linhas retas entre as paradas, na ordem de entrega.</figcaption></figure>`;
  h += `<div class="chips" role="group" aria-label="Mostrar rota">
    <button class="chip" data-filter="all" aria-pressed="${ui.filter === "all"}">Todos</button>
    ${R.map(r => `<button class="chip" data-filter="${r.courier.id}" aria-pressed="${ui.filter === r.courier.id}"><span class="dot" style="background:${r.color}"></span>${esc(r.courier.name)}</button>`).join("")}</div>`;
  for (const r of R){
    if (ui.filter !== "all" && ui.filter !== r.courier.id) continue;
    const links = mapsLinks(r.orders, plan);
    h += `<section class="route" style="--c:${r.color}">
      <div class="route-head">
        <div class="route-title"><span class="badge">${r.i + 1}</span><h2>${esc(r.courier.name)}</h2></div>
        <div class="metrics"><span><b>${r.orders.length}</b> pedidos</span><span><b>${r.metrics.items}</b> ${esc(itemLabel().plural)}</span><span><b>~${fmt(r.metrics.km)}</b> km</span><span><b>~${Math.round(r.metrics.minutes)}</b> min</span></div>
        ${r.orders.length ? `<div class="actions">
          ${links.map((l, j) => `<a class="btn btn-primary grow" href="${l}" target="_blank" rel="noopener">${links.length > 1 ? `Rota no Maps · parte ${j + 1}/${links.length}` : "Abrir rota no Google Maps"}</a>`).join("")}
          <button class="btn btn-ghost grow" data-copy="${r.courier.id}">Copiar para WhatsApp</button></div>` : `<div class="hint">Sem entregas nesta rota.</div>`}
      </div>
      ${r.orders.length ? `<ol class="stops">${stopItems(r)}</ol>` : ""}
    </section>`;
  }
  return h;
}

function stopItems(r){
  return groupStops(r.orders).map((stop, k) => stop.ids.map(id => {
    const o = r.orders.find(x => x.id === id), confirming = ui.removing === id;
    return `<li class="stop"><span class="num">${k + 1}</span><div>
      <div class="who"><b>${esc(o.name)}</b><span class="qty">${qtyText(o.qty)}</span></div>
      <div class="addr">${esc(o.address)}</div>
      <div class="phone">${esc(o.phone)}</div>
      ${o.notes ? `<div class="notes">${esc(o.notes)}</div>` : ""}
      <div class="row-actions">
        <a class="btn btn-ghost btn-sm" href="${pinLink(o)}" target="_blank" rel="noopener">Ver no mapa</a>
        ${confirming ? "" : `<button class="btn btn-ghost btn-sm" data-skip="${id}">Tirar da rota</button>`}
      </div>
      ${confirming ? `<div class="confirm">
        <p>Tirar <b>${esc(o.name)}</b> da rota? O pedido vai para “Ignorados” e as rotas são recalculadas.</p>
        <textarea class="field" id="reason-${id}" placeholder="Motivo (opcional). Ex.: cliente vai retirar">${esc(ui.drafts["reason" + id] || "")}</textarea>
        <div class="inline"><button class="btn btn-danger grow" data-confirm-skip="${id}">Tirar da rota</button><button class="btn btn-ghost grow" data-cancel-skip>Cancelar</button></div>
      </div>` : ""}
    </div></li>`;
  }).join("")).join("");
}

function newOrderView(){
  if (!ui.adding) return `<button class="btn btn-ghost" data-new-order>+ Nova entrega</button>`;
  const d = ui.drafts, c = parseCoord(d.newCoord || "");
  return `<form class="card" id="newOrderForm">
    <b style="font-size:16px">Nova entrega</b>
    <div class="hint">Pedido fora da lista original. As rotas são recalculadas ao adicionar.</div>
    <label class="hint" for="newName">Nome de quem recebe *</label>
    <input class="field" id="newName" value="${esc(d.newName || "")}" autocomplete="off">
    <div class="inline">
      <div class="col" style="flex:0 0 110px"><label class="hint" for="newQty">Quantidade *</label>
        <input class="field" id="newQty" type="number" min="1" inputmode="numeric" value="${esc(d.newQty ?? "1")}"></div>
      <div class="col" style="flex:1 1 160px"><label class="hint" for="newPhone">Telefone</label>
        <input class="field" id="newPhone" inputmode="tel" value="${esc(d.newPhone || "")}" autocomplete="off"></div>
    </div>
    <label class="hint" for="newAddress">Endereço</label>
    <input class="field" id="newAddress" value="${esc(d.newAddress || "")}" placeholder="Rua, número, bairro" autocomplete="off">
    <label class="hint" for="newCoord">Coordenada ou link do Google Maps *</label>
    <input class="field" id="newCoord" value="${esc(d.newCoord || "")}" placeholder="-20.671234, -40.501234" autocomplete="off">
    <div class="hint ${c ? "ok" : d.newCoord ? "err" : ""}" id="newCoordHint">${coordHint(d.newCoord || "")}</div>
    <label class="hint" for="newNotes">Observação</label>
    <input class="field" id="newNotes" value="${esc(d.newNotes || "")}" placeholder="Ex.: pagamento em dinheiro" autocomplete="off">
    <div class="inline">
      <button class="btn btn-primary grow" type="submit" id="newOrderSubmit" ${newOrderIsValid() ? "" : "disabled"}>Adicionar e recalcular</button>
      <button class="btn btn-ghost grow" type="button" data-cancel-new>Cancelar</button>
    </div>
  </form>`;
}

function skippedView(list){
  if (!list.length) return `<div class="empty">Nenhum pedido ignorado. Todos estão nas rotas.</div>`;
  const total = list.reduce((a, o) => a + (+o.qty || 0), 0);
  let h = `<div class="skipped-total">${list.length} pedido${list.length > 1 ? "s" : ""} · ${qtyText(total)} fora das rotas.</div>`;
  for (const o of list){
    const located = hasCoord(o), editing = !!ui.editing[o.id], draft = ui.drafts["coord" + o.id] || "", parsed = parseCoord(draft);
    h += `<article class="card">
      <div class="who"><b>${esc(o.name)}</b><span class="qty">${qtyText(o.qty)}</span></div>
      <div class="addr">${esc(o.address)}</div>
      <div class="phone">${esc(o.phone)}</div>
      <span class="reason">${esc(o.reason || (located ? "Fora da rota" : "Sem coordenada"))}</span>
      <div class="coord">${located ? `Coordenada: ${o.lat.toFixed(6)}, ${o.lng.toFixed(6)}` : "Sem coordenada"}</div>
      <div class="row-actions">
        ${located ? `<button class="btn btn-primary btn-sm" data-route="${o.id}">Adicionar à rota</button>` : ""}
        ${editing ? "" : `<button class="btn btn-ghost btn-sm" data-edit="${o.id}">${located ? "Editar coordenada" : "Colocar coordenada"}</button>`}
        <a class="btn btn-ghost btn-sm" href="${located ? pinLink(o) : searchLink(o)}" target="_blank" rel="noopener">${located ? "Ver no mapa" : "Buscar endereço no Maps"}</a>
      </div>
      ${editing ? `<div class="edit-box">
        <label class="hint" for="coord-${o.id}">Cole a coordenada ou o link do Google Maps (ex.: -20.6712, -40.5012)</label>
        <input class="field" id="coord-${o.id}" autocomplete="off" value="${esc(draft)}" placeholder="-20.671234, -40.501234">
        <div class="hint ${parsed ? "ok" : draft ? "err" : ""}" id="coordHint-${o.id}">${coordHint(draft)}</div>
        <div class="inline">
          <button class="btn btn-primary grow" data-save-route="${o.id}" ${parsed ? "" : "disabled"}>Salvar e adicionar à rota</button>
          <button class="btn btn-ghost grow" data-save="${o.id}" ${parsed ? "" : "disabled"}>Só salvar</button>
          <button class="btn btn-ghost grow" data-close-edit="${o.id}">Cancelar</button>
        </div></div>` : ""}
    </article>`;
  }
  return h;
}
function coordHint(text){
  if (!text) return "No Google Maps, toque e segure no local para ver a coordenada.";
  const c = parseCoord(text);
  if (!c) return "Coordenada inválida. Use o formato -20.671234, -40.501234.";
  const dist = plan && plan.depot ? ` · a ${fmt(distanceKm(plan.depot, c) / PARAMS.ROAD_FACTOR)} km da saída` : "";
  return `Coordenada: ${c.lat.toFixed(6)}, ${c.lng.toFixed(6)}${dist}`;
}

function settingsView(){
  const d = ui.drafts;
  let h = `<div class="section-title">Motoboys</div><div class="card">`;
  plan.couriers.forEach((c, i) => {
    h += `<div class="courier-row"><span class="dot" style="background:${colorOf(i)};width:14px;height:14px"></span>
      <input class="field" id="name-${c.id}" data-rename="${c.id}" value="${esc(c.name)}" aria-label="Nome do motoboy ${i + 1}">
      <button class="btn btn-ghost btn-sm" data-remove-courier="${c.id}" ${plan.couriers.length < 2 ? "disabled" : ""} aria-label="Remover ${esc(c.name)}">Remover</button></div>`;
  });
  h += `<form class="inline" id="courierForm" style="margin-top:6px">
      <input class="field" id="newCourier" placeholder="Nome do novo motoboy" value="${esc(d.newCourier || "")}" autocomplete="off">
      <button class="btn btn-primary" type="submit">Adicionar motoboy</button></form>
    <div class="hint">Adicionar ou remover um motoboy recalcula as rotas.</div></div>`;

  const depot = plan.depot, draft = d.depotCoord ?? "", parsed = parseCoord(draft);
  h += `<div class="section-title">Ponto de saída</div><div class="card">
    ${depot ? `<div class="origin"><span class="pin"></span><span><b>${esc(depot.name)}</b><br>${depot.lat.toFixed(6)}, ${depot.lng.toFixed(6)}</span></div>
      <div class="row-actions"><a class="btn btn-ghost btn-sm" href="${pinLink(depot)}" target="_blank" rel="noopener">Ver no mapa</a></div>` : `<div class="hint">Sem ponto de saída: cada motoboy começa na primeira entrega.</div>`}
    <form class="edit-box" id="depotForm">
      <label class="hint" for="depotName">Nome do local</label>
      <input class="field" id="depotName" value="${esc(d.depotName ?? "")}" placeholder="Ex.: Sede" autocomplete="off">
      <label class="hint" for="depotCoord">Coordenada ou link do Google Maps</label>
      <input class="field" id="depotCoord" value="${esc(draft)}" placeholder="-20.641500, -40.514800" autocomplete="off">
      <div class="hint ${parsed ? "ok" : draft ? "err" : ""}" id="depotHint">${draft ? (parsed ? `Coordenada: ${parsed.lat.toFixed(6)}, ${parsed.lng.toFixed(6)}` : "Coordenada inválida.") : "Cole a coordenada do novo ponto."}</div>
      <button class="btn btn-primary" type="submit" id="depotSubmit" ${parsed ? "" : "disabled"}>Mudar saída e recalcular</button>
    </form>
    <label class="switch"><input type="checkbox" id="returnToDepot" ${plan.returnToDepot ? "checked" : ""}> Motoboys voltam ao ponto de saída no final</label>
  </div>`;
  if (!DEMO) h += `<div class="section-title">Este aparelho</div><div class="card">
    <div class="hint" style="font-size:13px">A senha será pedida no próximo acesso.</div>
    <button class="btn btn-ghost logout" data-logout>Sair deste aparelho</button></div>`;
  h += `<div class="section-title">Como as rotas são calculadas</div><div class="card"><div class="hint" style="font-size:13px">
    As entregas são divididas para que o último motoboy termine o mais cedo possível.
    Distâncias estimadas em linha reta com margem para as ruas (${PARAMS.MIN_PER_STOP} min por parada, ${PARAMS.SPEED_KMH} km/h). O trajeto exato fica com o Google Maps.</div></div>`;
  return h;
}

function loginView(){
  return `<form class="card login" id="loginForm">
    <h2>Entrar</h2>
    <p>Digite a senha para ver as rotas de entrega.</p>
    <label class="hint" for="password">Senha</label>
    <input class="field" id="password" type="password" autocomplete="current-password" required>
    ${loginError ? `<div class="hint err">${esc(loginError)}</div>` : ""}
    <button class="btn btn-primary" type="submit" ${signingIn ? "disabled" : ""}>${signingIn ? "Entrando…" : "Entrar"}</button>
  </form>`;
}
function importView(){
  return `<div class="card login">
    <h2>Nenhum pedido cadastrado</h2>
    <p>Escolha um arquivo .json com os pedidos (o formato está no README). A importação é feita uma única vez.</p>
    <label class="btn btn-primary" for="importFile">Escolher arquivo de pedidos</label>
    <input id="importFile" type="file" accept=".json,application/json" hidden>
    ${window.SAMPLE_DATA ? `<button class="btn btn-ghost" data-use-sample>Usar dados de exemplo</button>` : ""}
    ${DEMO ? "" : `<button class="btn btn-ghost logout" data-logout>Sair deste aparelho</button>`}
  </div>`;
}

/* ---------- Map (Leaflet + OpenStreetMap) ---------- */
let map = null;
function drawMap(){
  const el = document.getElementById("map");
  if (map){ map.remove(); map = null; }
  if (!el || !window.L) return;
  const theme = document.documentElement.dataset.theme;
  const dark = theme === "dark" || (theme !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
  el.classList.toggle("map-dark", dark);
  // One-finger drag scrolls the page on phones; pinch or the +/- buttons zoom the map.
  map = L.map(el, {scrollWheelZoom: false, dragging: !L.Browser.mobile, tap: false});
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>'
  }).addTo(map);
  const bounds = [];
  for (const r of courierRoutes()){
    if (ui.filter !== "all" && ui.filter !== r.courier.id) continue;
    const stops = groupStops(r.orders);
    const path = (plan.depot ? [plan.depot] : []).concat(stops);
    if (plan.depot && plan.returnToDepot && stops.length) path.push(plan.depot);
    if (path.length > 1) L.polyline(path.map(p => [p.lat, p.lng]), {color: r.color, weight: 4, opacity: .85}).addTo(map);
    stops.forEach((s, k) => {
      const orders = s.ids.map(id => findOrder(plan, id));
      L.marker([s.lat, s.lng], {icon: L.divIcon({className: "", html: `<div class="mk" style="--c:${r.color}">${k + 1}</div>`, iconSize: [26, 26], iconAnchor: [13, 13], popupAnchor: [0, -12]})})
        .bindPopup(`<b>${esc(r.courier.name)} · parada ${k + 1}</b><br>` + orders.map(o => `${esc(o.name)} (${o.qty})<br><span style="opacity:.75">${esc(o.address)}</span>`).join("<hr style='border:0;border-top:1px solid #ddd;margin:6px 0'>"))
        .addTo(map);
      bounds.push([s.lat, s.lng]);
    });
  }
  if (plan.depot){
    L.marker([plan.depot.lat, plan.depot.lng], {zIndexOffset: 1000, icon: L.divIcon({className: "", html: `<div class="mk-depot"></div>`, iconSize: [22, 22], iconAnchor: [11, 11]})})
      .bindPopup(`<b>Saída</b><br>${esc(plan.depot.name)}`).addTo(map);
    bounds.push([plan.depot.lat, plan.depot.lng]);
  }
  if (bounds.length) map.fitBounds(bounds, {padding: [24, 24], maxZoom: 16});
  else map.setView([-20.66, -40.50], 13);
}

/* ---------- WhatsApp text ---------- */
function whatsappText(courierId){
  const r = courierRoutes().find(x => x.courier.id === courierId); if (!r) return "";
  let t = `*${CONFIG.title || "Entregas"}: ${r.courier.name}*\n`;
  if (plan.depot) t += `Saída: ${plan.depot.name}\n`;
  t += `${r.orders.length} pedidos · ${qtyText(r.metrics.items)} · ~${Math.round(r.metrics.minutes)} min\n`;
  r.orders.forEach((o, i) => {
    t += `\n${i + 1}. ${o.name} (${qtyText(o.qty)})\n   ${o.address}\n   Tel: ${o.phone}\n   Mapa: ${pinLink(o)}\n`;
    if (o.notes) t += `   Obs: ${o.notes}\n`;
  });
  const links = mapsLinks(r.orders, plan);
  links.forEach((l, j) => t += `\nRota completa${links.length > 1 ? ` (parte ${j + 1}/${links.length})` : ""}: ${l}`);
  return t;
}
function showCopyFallback(text){
  const box = document.createElement("div");
  box.className = "card"; box.style.cssText = "position:fixed;inset:auto 12px calc(12px + env(safe-area-inset-bottom,0px)) 12px;z-index:1000;max-height:70vh";
  box.innerHTML = `<b>Selecione e copie o texto</b><textarea class="field" style="min-height:40vh">${esc(text)}</textarea><button class="btn btn-ghost">Fechar</button>`;
  document.body.appendChild(box); const ta = box.querySelector("textarea"); ta.focus(); ta.select();
  box.querySelector("button").onclick = () => box.remove();
}

let toastTimer;
function toast(message){ const el = document.getElementById("toast"); el.textContent = message; el.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 2600); }

/* ---------- Events ---------- */
document.querySelector(".tabs").addEventListener("click", e => {
  const t = e.target.closest(".tab"); if (!t) return;
  ui.tab = t.dataset.tab; writeStorage(STORAGE_TAB, ui.tab);
  history.replaceState(null, "", "#" + ui.tab);
  render(); window.scrollTo({top: 0});
});
// Links like .../#skipped open straight on that tab.
window.addEventListener("hashchange", () => {
  const tab = tabFromHash();
  if (tab && tab !== ui.tab){ ui.tab = tab; render(); }
});

app.addEventListener("click", async e => {
  const el = e.target.closest("button"); if (!el) return;
  const d = el.dataset;
  if (d.filter){ ui.filter = d.filter; render(); return; }
  if (d.skip){ ui.removing = +d.skip; render(); document.getElementById("reason-" + d.skip)?.focus(); return; }
  if ("cancelSkip" in d){ ui.removing = null; render(); return; }
  if (d.confirmSkip){ const id = +d.confirmSkip; skipOrder(id, document.getElementById("reason-" + id)?.value); delete ui.drafts["reason" + id]; return; }
  if (d.route){ routeOrder(+d.route); return; }
  if (d.edit){
    const id = +d.edit, o = findOrder(plan, id); ui.editing[id] = true;
    if (hasCoord(o) && !ui.drafts["coord" + id]) ui.drafts["coord" + id] = `${o.lat}, ${o.lng}`;
    render(); document.getElementById("coord-" + id)?.focus(); return;
  }
  if (d.closeEdit){ delete ui.editing[+d.closeEdit]; delete ui.drafts["coord" + d.closeEdit]; render(); return; }
  if (d.save || d.saveRoute){ const id = +(d.save || d.saveRoute), c = parseCoord(ui.drafts["coord" + id]); if (c) saveCoord(id, c, !!d.saveRoute); return; }
  if (d.removeCourier){ removeCourier(d.removeCourier); return; }
  if ("newOrder" in d){ ui.adding = true; render(); document.getElementById("newName")?.focus(); return; }
  if ("cancelNew" in d){ ui.adding = false; render(); return; }
  if ("logout" in d){ firebase.auth().signOut(); return; }
  if ("reset" in d){ loadSample(); toast("Exemplo restaurado."); return; }
  if ("useSample" in d){ importPlan(clone(window.SAMPLE_DATA)); return; }
  if (d.copy){
    const text = whatsappText(d.copy);
    try { await navigator.clipboard.writeText(text); toast("Texto copiado."); }
    catch { showCopyFallback(text); }
  }
});

app.addEventListener("input", e => {
  const el = e.target, id = el.id;
  if (id.startsWith("reason-")) ui.drafts["reason" + id.slice(7)] = el.value;
  if (id.startsWith("coord-")){
    const orderId = id.slice(6), ok = !!parseCoord(el.value), hint = document.getElementById("coordHint-" + orderId);
    ui.drafts["coord" + orderId] = el.value;
    hint.textContent = coordHint(el.value); hint.className = "hint " + (ok ? "ok" : el.value ? "err" : "");
    el.closest(".card").querySelectorAll("[data-save],[data-save-route]").forEach(b => b.disabled = !ok);
  }
  if (id === "newCourier" || id === "depotName") ui.drafts[id] = el.value;
  if (id === "depotCoord"){
    ui.drafts.depotCoord = el.value; const c = parseCoord(el.value), hint = document.getElementById("depotHint");
    hint.textContent = el.value ? (c ? `Coordenada: ${c.lat.toFixed(6)}, ${c.lng.toFixed(6)}` : "Coordenada inválida.") : "Cole a coordenada do novo ponto.";
    hint.className = "hint " + (c ? "ok" : el.value ? "err" : ""); document.getElementById("depotSubmit").disabled = !c;
  }
  if (/^new(Name|Qty|Phone|Address|Coord|Notes)$/.test(id)){
    ui.drafts[id] = el.value;
    if (id === "newCoord"){
      const hint = document.getElementById("newCoordHint"), c = parseCoord(el.value);
      hint.textContent = coordHint(el.value); hint.className = "hint " + (c ? "ok" : el.value ? "err" : "");
    }
    document.getElementById("newOrderSubmit").disabled = !newOrderIsValid();
  }
});

app.addEventListener("change", async e => {
  const el = e.target;
  if (el.dataset.rename) renameCourier(el.dataset.rename, el.value);
  if (el.id === "returnToDepot") update(p => { p.returnToDepot = el.checked; }, el.checked ? "Rotas recalculadas com volta à saída." : "Rotas recalculadas sem volta.");
  if (el.id === "importFile" && el.files[0]){
    try { importPlan(JSON.parse(await el.files[0].text())); }
    catch { toast("Arquivo inválido. Confira o formato no README."); }
  }
});
app.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.dataset.rename) e.target.blur(); });

app.addEventListener("submit", async e => {
  e.preventDefault();
  const id = e.target.id;
  if (id === "courierForm"){ addCourier(ui.drafts.newCourier || ""); ui.drafts.newCourier = ""; render(); }
  if (id === "depotForm"){
    const c = parseCoord(ui.drafts.depotCoord); if (!c) return;
    setDepot(ui.drafts.depotName || "Ponto de saída", c); ui.drafts.depotName = ""; ui.drafts.depotCoord = ""; render();
  }
  if (id === "newOrderForm") addOrder();
  if (id === "loginForm"){
    signingIn = true; loginError = ""; const password = document.getElementById("password").value; render();
    try { await firebase.auth().signInWithEmailAndPassword(CONFIG.loginEmail, password); }
    catch (err) {
      const code = err.code || "";
      loginError = /wrong-password|invalid-credential|invalid-login|user-not-found/.test(code) ? "Senha incorreta. Confira com quem organiza as entregas."
        : code === "auth/too-many-requests" ? "Muitas tentativas. Aguarde alguns minutos."
        : code === "auth/network-request-failed" ? "Sem conexão. Tente novamente."
        : "Erro ao entrar. Tente novamente.";
    }
    signingIn = false; render();
  }
});

/* ---------- Loading ---------- */
function receive(data){
  const next = clone(data);
  if (!Array.isArray(next.orders) || !Array.isArray(next.couriers)) return false;
  if (!routesAreValid(next)) next.routes = computeRoutes(next);
  if (ui.filter !== "all" && !next.couriers.some(c => c.id === ui.filter)) ui.filter = "all";
  plan = next; loaded = true; render();
  return true;
}
function importPlan(data){
  if (!data || !Array.isArray(data.orders) || !Array.isArray(data.couriers)){ toast("Arquivo sem pedidos ou motoboys. Confira o formato no README."); return; }
  if (!routesAreValid(data)) data.routes = computeRoutes(data);
  data.updatedAt = new Date().toISOString();
  if (DEMO){ receive(data); save(); }
  else planRef.set(clone(data)).then(() => toast("Pedidos importados."), () => toast("Erro ao salvar os pedidos."));
}
function loadSample(){
  if (window.SAMPLE_DATA){ receive(window.SAMPLE_DATA); save(); }
  else { loaded = true; render(); }
}

function startDemo(){
  const stored = readStorage(STORAGE_DEMO);
  if (stored){ try { if (receive(JSON.parse(stored))) return; } catch {} }
  loadSample();
}

function startFirebase(){
  if (!window.firebase){ app.innerHTML = `<div class="wrap gutter"><div class="empty">Erro ao carregar o Firebase. Verifique a conexão e recarregue a página.</div></div>`; return; }
  firebase.initializeApp(CONFIG.firebase);
  planRef = firebase.firestore().doc(CONFIG.document || "app/plan");
  let unsubscribe = null, loadTimer = null;
  firebase.auth().onAuthStateChanged(user => {
    if (unsubscribe){ unsubscribe(); unsubscribe = null; }
    clearTimeout(loadTimer); plan = null; loaded = false;
    if (!user){ session = "out"; render(); return; }
    session = "in"; render();
    loadTimer = setTimeout(() => { if (!loaded) app.innerHTML = `<div class="wrap gutter"><div class="empty">Os pedidos ainda não carregaram. Verifique a conexão; a página tenta novamente sozinha.</div></div>`; }, 10000);
    unsubscribe = planRef.onSnapshot(snap => {
      if (snap.metadata.hasPendingWrites) return;   // our own write echoing back
      clearTimeout(loadTimer); loaded = true;
      if (!snap.exists){ plan = null; render(); return; }
      if (plan && stableJson(plan) === stableJson(snap.data())) return;
      receive(snap.data());
    }, err => {
      clearTimeout(loadTimer); loaded = true;
      app.innerHTML = `<div class="wrap gutter"><div class="empty">${err.code === "permission-denied" ? "Este login não tem acesso aos pedidos." : "Erro ao carregar os pedidos. Recarregue a página."}</div></div>`;
    });
  });
}

render();
if (DEMO) startDemo(); else startFirebase();
})();
