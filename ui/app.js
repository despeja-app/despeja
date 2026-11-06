// Despeja: la interfaz. La misma en el Mac (WKWebView), en el iPhone (host-ios, plataforma «movil») y en el navegador (vista
// previa con demo.json). En el Mac es el cerebro: ve el iPhone, su espacio y sus apps. En el iPhone son las manos: fotos y videos.
// La app manda el estado con window.Despeja.estado(json); la interfaz pide cosas con host.enviar(accion, datos).
// Las piezas de interfaz (host.js, i18n.js, tema.*, componentes.*, bienvenida.*) no se editan aquí: ver AGENTS.md → «Piezas».
(() => {
  "use strict";
  // ── Puente con la app: pieza «host-ui». host.plataforma es "mac" | "windows" | "linux" | "web" (vista previa: simular()). ──
  const host = PiezaHost.crearHost({ nombre: "despeja", global: "Despeja", simular: (accion, d, c) => simular(accion, d, c) });
  const NOMBRE = "Despeja";
  const REPO = "despeja-app/despeja";
  const ENLACES = { sitio: "https://despeja-app.github.io/despeja/", codigo: `https://github.com/${REPO}`, comunidad: `https://github.com/${REPO}/discussions`,
    aportar: `https://github.com/${REPO}/blob/main/CONTRIBUTING.md` };
  const E = { config: {}, version: "", ias: [], ajustes: false, iniciada: false,
    iphone: null, buscando: false, sinIphone: null, apps: null, revisandoApps: false, todasLasApps: false,
    fotos: null, revisandoFotos: false };
  // ?iphone en la vista previa muestra la pantalla del iPhone.
  const enIphone = host.plataforma === "movil" || (host.plataforma === "web" && new URLSearchParams(location.search).has("iphone"));
  const raiz = document.getElementById("app");
  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => "&#" + c.charCodeAt(0) + ";");

  // ── Idiomas: pieza «i18n». Las claves son la frase en español; el inglés, en idiomas/en.json (todo texto nuevo va ahí). ──
  const faltantes = new Set();   // pruebas/interfaz.mjs revisa que no quede nada sin traducir
  const i18n = PiezaI18n.crear({ faltantes });
  const { Tp } = i18n;
  let idiomaElegido = null;
  async function cargarIdioma(elegido) {
    // Lo recién elegido > ?idioma= (vista previa y pruebas) > lo guardado > el del sistema.
    if (elegido) idiomaElegido = elegido;
    await i18n.cargar(i18n.elegir({ elegido: idiomaElegido, config: E.config.idioma_ui }));
    document.documentElement.lang = i18n.idioma;
  }

  // ── Tema (sistema, claro u oscuro) y componentes (diálogos, avisos, Tu IA, actualizaciones, Acerca de) ──
  const tema = PiezaTema.crear({ guardar: (v) => { E.config.tema = v; host.enviar("config", { tema: v }); } });
  const ui = PiezaComponentes.crear({
    i18n, host, app: NOMBRE, repo: REPO, version: () => E.version, pintar, mantenerCampos: true,
    cerrar: () => { E.ajustes = false; pintar(); },   // Esc, el velo o ✕ sobre un diálogo de la app
    retener: (...a) => bv.retener(...a),               // mientras se elige el idioma, los avisos esperan
    elegirIA: (id) => { E.config.ia = id; host.enviar("config", { ia: id }); },
  });
  const toast = (frase, o) => ui.aviso(frase, o);

  // ── Bienvenida: pieza «bienvenida». El idioma siempre primero y solo en la pantalla; después, los pasos de la app. ──
  const bv = PiezaBienvenida.crear({
    i18n, pintar, mostrarAviso: (...a) => toast(...a),
    guardarIdioma: (c) => { E.config.idioma_ui = c; host.enviar("config", { idioma_ui: c }); },
    cargarIdioma: (c) => cargarIdioma(c),
    terminar: () => { E.config.bienvenida = true; host.enviar("config", { bienvenida: true }); },
  });
  bv.sumarPaso({ id: "hola", orden: 10, titulo: "Te damos la bienvenida", saltable: false,
    cuerpo: () => `<p><b data-sin-traducir>${esc(NOMBRE)}</b></p><p>Deja tu iPhone solo con lo necesario: ve qué ocupa espacio, respalda lo que vale la pena y borra lo que sobra.</p>
      <p class="suave">Todo queda entre tu Mac y tu iPhone. Nada pasa por un servidor nuestro.</p>` });
  if (!enIphone) {
    bv.sumarPaso({ id: "ia", orden: 20, titulo: "Elige tu IA", puede: () => !!E.config.ia,
      cuerpo: () => `<p>Tu IA revisa el resumen de tu iPhone y te propone qué hacer. Usa la que ya tienes, con tu cuenta.</p>${ui.filasIA({ ias: E.ias, elegida: E.config.ia })}` });
    bv.sumarPaso({ id: "conectar", orden: 30, titulo: "Conecta tu iPhone",
      cuerpo: () => `<ol class="pasos"><li>Conéctalo al Mac por cable y desbloquéalo.</li><li>Si pregunta, toca «Confiar» en el iPhone.</li>
        <li>Después también lo veo por Wi-Fi, sin cable.</li></ol>` });
  }

  // ── Lo que se ve ──
  const gb = (b) => new Intl.NumberFormat(i18n.idioma, { maximumFractionDigits: (b || 0) >= 1e10 ? 0 : 1 }).format((b || 0) / 1e9);
  const tamano = (b) => (b || 0) >= 1e9 ? Tp("{n} GB", { n: gb(b) }) : Tp("{n} MB", { n: new Intl.NumberFormat(i18n.idioma, { maximumFractionDigits: 0 }).format((b || 0) / 1e6) });
  const entero = (n) => new Intl.NumberFormat(i18n.idioma).format(n || 0);
  const barra = (titulo) => `<header class="barra"><h1 data-sin-traducir>${esc(NOMBRE)}</h1>${titulo || ""}
      <button type="button" class="pz-boton" id="abrir-ajustes">Ajustes</button></header>`;

  function tarjetaIphone() {
    const p = E.iphone;
    if (!p) {
      if (E.sinIphone === null) return `<section class="tarjeta" aria-busy="true"><p class="suave">Buscando tu iPhone…</p></section>`;
      return `<section class="tarjeta vacia" id="sin-iphone"><h2>Conecta tu iPhone</h2>
        <p data-sin-traducir>${esc(Tp(E.sinIphone.error || "No veo ningún iPhone. Conéctalo por cable o ponlo en la misma red Wi-Fi."))}</p>
        <ol class="pasos"><li>Conéctalo al Mac por cable y desbloquéalo.</li><li>Si pregunta, toca «Confiar» en el iPhone.</li></ol>
        <div class="pz-pie"><button type="button" class="pz-boton pz-principal" id="buscar"${E.buscando ? " disabled" : ""}>${E.buscando ? "Buscando…" : "Buscar de nuevo"}</button></div></section>`;
    }
    const usado = Math.max(0, p.capacidad - p.libre);
    const pct = p.capacidad ? Math.min(100, Math.round((usado / p.capacidad) * 100)) : 0;
    const poco = p.capacidad && p.libre / p.capacidad < 0.1;
    return `<section class="tarjeta" id="iphone">
      <div class="fila-titulo"><h2 data-sin-traducir>${esc(p.nombre)}</h2>
        <span class="chip" data-sin-traducir>${esc(Tp(p.conexion === "usb" ? "iOS {v} · por cable" : "iOS {v} · por Wi-Fi", { v: p.ios }))}</span></div>
      <div class="espacio${poco ? " poco" : ""}" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"
        aria-label="${esc(Tp("Espacio usado"))}" data-sin-traducir><span data-medida="${pct}"></span></div>
      <p class="cifras" data-sin-traducir><b>${esc(Tp("{n} GB libres", { n: gb(p.libre) }))}</b> · ${esc(Tp("{u} GB usados de {t} GB", { u: gb(usado), t: gb(p.capacidad) }))}</p>
      ${poco ? `<p class="aviso">Te queda poco espacio: iOS necesita espacio libre para actualizarse y funcionar bien.</p>` : ""}
    </section>`;
  }

  function tarjetaApps() {
    if (!E.iphone) return "";
    const a = E.apps;
    let cuerpo;
    if (E.revisandoApps) cuerpo = `<p class="suave" aria-busy="true">Revisando tus apps… calcular cuánto ocupa cada una toma unos minutos.</p>`;
    else if (!a) cuerpo = `<p class="suave">Mira cuánto ocupa cada app, de la más pesada a la más liviana.</p>
      <div class="pz-pie"><button type="button" class="pz-boton pz-principal" id="revisar-apps">Revisar apps</button></div>`;
    else {
      const max = a.apps[0] ? a.apps[0].tamano || 1 : 1;
      const lista = E.todasLasApps ? a.apps : a.apps.slice(0, 10);
      cuerpo = `<p class="cifras" data-sin-traducir>${esc(Tp("{n} apps ocupan {t}", { n: entero(a.apps.length), t: tamano(a.total) }))}</p>
        <ul class="apps">${lista.map((x) => `<li><span class="nombre" data-sin-traducir>${esc(x.nombre)}</span>
          <span class="medida" data-medida="${Math.max(2, Math.round((x.tamano / max) * 100))}" aria-hidden="true"></span>
          <span class="tam" data-sin-traducir>${esc(tamano(x.tamano))}</span></li>`).join("")}</ul>
        <div class="pz-pie">${a.apps.length > 10 ? `<button type="button" class="pz-boton" id="todas-apps">${E.todasLasApps ? "Ver menos" : "Ver todas"}</button>` : ""}
          <button type="button" class="pz-boton" id="revisar-apps">Revisar de nuevo</button></div>
        <p class="nota">Es lo que ocupa cada app. Lo que guarda adentro (chats, caché) iOS no lo informa: lo veremos aparte.</p>`;
    }
    return `<section class="tarjeta" id="apps"><h2>Apps</h2>${cuerpo}</section>`;
  }

  function tarjetaFotos() {
    const f = E.fotos;
    let cuerpo;
    if (E.revisandoFotos) cuerpo = `<p class="suave" aria-busy="true">Contando tus fotos y videos…</p>`;
    else if (f && !f.ok) cuerpo = `<p data-sin-traducir>${esc(Tp(f.error || "No pude revisar tus fotos."))}</p>
      ${f.codigo === "sin_permiso" ? `<p class="suave">Ábrelo en Ajustes del iPhone → Despeja → Fotos → «Acceso completo».</p>` : ""}
      <div class="pz-pie"><button type="button" class="pz-boton pz-principal" id="revisar-fotos">Intentar de nuevo</button></div>`;
    else if (!f) cuerpo = `<p class="suave">Mira cuántas fotos, videos y capturas tienes y cuánto ocupan. Te pediremos permiso para ver tus fotos; nada sale del iPhone.</p>
      <div class="pz-pie"><button type="button" class="pz-boton pz-principal" id="revisar-fotos">Revisar mis fotos</button></div>`;
    else cuerpo = `<dl class="resumen-fotos" data-sin-traducir>
        <div><dt>${esc(Tp("Fotos"))}</dt><dd>${esc(entero(f.fotos))}</dd></div>
        <div><dt>${esc(Tp("Videos"))}</dt><dd>${esc(entero(f.videos))}</dd></div>
        <div><dt>${esc(Tp("Capturas de pantalla"))}</dt><dd>${esc(entero(f.capturas))}</dd></div>
        <div><dt>${esc(Tp("Ocupan"))}</dt><dd>${esc(tamano(f.tamano))}</dd></div></dl>
      ${f.soloEnIcloud ? `<p class="nota" data-sin-traducir>${esc(Tp("{n} están solo en iCloud (en el iPhone queda una versión liviana).", { n: entero(f.soloEnIcloud) }))}</p>` : ""}
      <div class="pz-pie"><button type="button" class="pz-boton" id="revisar-fotos">Revisar de nuevo</button></div>`;
    return `<section class="tarjeta" id="fotos"><h2>Fotos y videos</h2>${cuerpo}</section>`;
  }

  function principal() {
    if (enIphone) return barra() + `<main class="contenido">${tarjetaFotos()}</main>`;
    return barra() + `<main class="contenido">${tarjetaIphone()}${tarjetaApps()}</main>`;
  }
  function ajustes() {
    const idiomas = [["es", "Español"], ["en", "English"]].map(([c, n]) =>
      `<button type="button" data-idioma="${c}" aria-pressed="${i18n.idioma === c}" lang="${c}" data-sin-traducir>${n}</button>`).join("");
    return `<h3>Idioma</h3><div class="pz-seg" role="group" aria-label="Idioma">${idiomas}</div>
      <h3>Apariencia</h3>${tema.selectorHTML()}
      ${enIphone ? "" : `<h3>Tu IA</h3>${ui.filasIA({ ias: E.ias, elegida: E.config.ia })}
      <h3>Actualizaciones</h3>${ui.filaActualizacion()}`}
      <h3>Acerca de</h3>${ui.acercaDe({ version: E.version, enlaces: ENLACES })}`;
  }
  function pintar() {
    if (bv.soloIdioma) {   // primer uso: el idioma, solo (sin la app detrás ni avisos)
      raiz.innerHTML = `<div class="pantalla-idioma">${bv.html()}</div>`;
      bv.enfocar();
      return;
    }
    raiz.innerHTML = principal()
      + (bv.activa ? ui.envolver(bv.html(), { id: "t-bv", sinEsc: true }) : "")
      + (E.ajustes ? ui.dialogo({ id: "t-ajustes", titulo: "Ajustes", cuerpo: ajustes(),
        pie: '<button type="button" class="pz-boton pz-principal" data-pz-cerrar>Listo</button>' }) : "")
      + ui.capas();
    i18n.traducirDOM(raiz);
    // La CSP no deja estilos en línea: el largo de cada barra se pone por CSSOM.
    for (const el of raiz.querySelectorAll("[data-medida]")) el.style.setProperty("--medida", `${Math.min(100, Number(el.dataset.medida) || 0)}%`);
    ui.despuesDePintar();
  }

  // ── Lo que hace la persona ──
  document.addEventListener("click", async (ev) => {
    if (bv.manejarClic(ev) || ui.manejarClic(ev)) return;
    if (tema.manejarClic(ev)) return pintar();
    const b = ev.target.closest("button");
    if (!b) return;
    if (b.id === "abrir-ajustes") { E.ajustes = true; pintar(); }
    else if (b.dataset.idioma) {
      E.config.idioma_ui = b.dataset.idioma;
      host.enviar("config", { idioma_ui: b.dataset.idioma });
      await cargarIdioma(b.dataset.idioma);
      pintar();
    } else if (b.id === "buscar") buscarIphone();
    else if (b.id === "revisar-apps") { E.revisandoApps = true; pintar(); host.enviar("iphoneApps"); }
    else if (b.id === "todas-apps") { E.todasLasApps = !E.todasLasApps; pintar(); }
    else if (b.id === "revisar-fotos") { E.revisandoFotos = true; pintar(); host.enviar("fotosResumen"); }
  });
  document.addEventListener("keydown", (ev) => { if (ui.manejarTecla(ev)) return; bv.manejarTecla(ev); });
  function buscarIphone() {
    if (enIphone) return;
    E.buscando = true;
    pintar();
    host.enviar("iphoneEstado");
  }

  // ── Lo que manda la app ──
  host.responder({
    async estado(e) {
      Object.assign(E, { config: e.config || {}, version: e.version || "" });
      await cargarIdioma();
      tema.aplicar(tema.elegir({ config: E.config.tema }));
      ui.actualizacionDisponible(e.actualizacion && e.actualizacion.hay ? e.actualizacion : null, { pintar: false });
      if (!E.iniciada) {
        E.iniciada = true;
        bv.abrir({ config: E.config, forzar: new URLSearchParams(location.search).has("bienvenida") });
        if (!enIphone) { host.enviar("listaIA"); buscarIphone(); }
      }
      pintar();
    },
    iphoneEstado(r) {
      E.buscando = false;
      if (r && r.ok && r.iphone) { E.iphone = r.iphone; E.sinIphone = false; }
      else { E.iphone = null; E.apps = null; E.sinIphone = r || {}; }
      pintar();
    },
    iphoneApps(r) {
      E.revisandoApps = false;
      if (r && r.ok) E.apps = { apps: r.apps || [], total: r.total || 0 };
      else toast((r && r.error) || "No pude revisar las apps.", { error: true });
      pintar();
    },
    fotosResumen(r) { E.revisandoFotos = false; E.fotos = r || { ok: false }; pintar(); },
    error(r) {
      E.revisandoFotos = E.revisandoApps = E.buscando = false;
      toast((r && r.error) || "No se pudo.", { error: true });
      pintar();
    },
    iaLista(r) { E.ias = (r && r.ias) || []; pintar(); },
    iaProbada: (r) => ui.iaProbada(r),
    actualizacionRevisada: (r) => ui.actualizacionRevisada(r, { pintar: !bv.soloIdioma }),
    actualizacionProgreso: (a) => ui.actualizacionProgreso(a),
    // Los menús de la app (host-mac / host-escritorio): «Ajustes…» abre Ajustes (nunca en medio de la bienvenida); «guardar»
    // (al cerrar o salir) no tiene nada pendiente aquí.
    menu(m) { if (m && m.accion === "ajustes" && !bv.activa) { E.ajustes = true; pintar(); } },
    _probar(f) { f(E); pintar(); },
    _pruebas: { ui, bv, i18n, faltantes, E },
  });

  // ── Vista previa en el navegador (datos ficticios de demo.json): c.responder("x", json) hace lo que la app ──
  let DEMO = null;
  const COMUNES = PiezaHost.simulacionesComunes();
  function simular(accion, d, c) {
    if (!DEMO) return;
    switch (accion) {
      case "listo": return c.responder("estado", DEMO);
      case "config": Object.assign(DEMO.config, d); return;
      case "iphoneEstado": return c.luego(300, () => c.responder("iphoneEstado", DEMO.iphone ? { ok: true, iphone: DEMO.iphone }
        : { ok: false, codigo: "sin_iphone", error: "No veo ningún iPhone. Conéctalo por cable o ponlo en la misma red Wi-Fi." }));
      case "iphoneApps": return c.luego(600, () => c.responder("iphoneApps", { ok: true, apps: DEMO.apps,
        total: DEMO.apps.reduce((t, a) => t + a.tamano, 0) }));
      case "fotosResumen": return c.luego(400, () => c.responder("fotosResumen", DEMO.fotos));
      case "listaIA": return c.responder("iaLista", { ias: DEMO.ias, elegida: DEMO.config.ia });
      default: return COMUNES[accion] ? COMUNES[accion](d, c) : undefined;
    }
  }

  async function iniciar() {
    if (host.plataforma === "web") {
      try { DEMO = await (await fetch("demo.json")).json(); } catch { DEMO = { config: {} }; }
      // ?bienvenida: el primer uso, desde el idioma.
      const q = new URLSearchParams(location.search);
      if (q.has("bienvenida")) DEMO.config.idioma_ui = "";
      if (q.has("sin-iphone")) DEMO.iphone = null;
    }
    host.enviar("listo");
  }
  iniciar();
})();
