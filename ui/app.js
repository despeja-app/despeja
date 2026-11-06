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
    fotos: null, revisandoFotos: false,
    // Mac: actualización de iOS, plan de la IA y respaldo (recibir del iPhone)
    ios: null, plan: null, armando: false, planError: null, destino: null,
    recibiendo: false, codigo: "", recibidos: 0, bytesRecibidos: 0, finRespaldo: null, conectado: false,
    // iPhone: respaldar en el Mac y borrar lo verificado
    macs: null, buscandoMac: false, mac: "", codigoEscrito: "", conectando: false, macConectado: "", errorMac: "",
    respaldando: false, avance: null, finEnvio: null, resumen: null, borrando: false, finBorrado: null,
    // iPhone: analizar y limpiar por grupos
    analizando: false, analisisAvance: null, grupos: null, grupo: null, items: [], totalGrupo: 0, cargando: false,
    grande: null, borrandoGrupo: false };
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
    cerrar: () => { E.ajustes = false; E.grande = null; pintar(); },   // Esc, el velo o ✕ sobre un diálogo de la app
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
      ${E.ios && E.ios.hay ? `<p class="aviso" id="ios-nuevo" data-sin-traducir>${esc(Tp(p.libre < 6e9
        ? "Hay una versión nueva: iOS {v}. Para instalarla conviene tener unos 6 GB libres; tu plan te dice de dónde sacarlos."
        : "Hay una versión nueva: iOS {v}. Instálala en Ajustes → General → Actualización de software.", { v: E.ios.ultima }))}</p>` : ""}
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
          <span class="tam" data-sin-traducir>${esc(tamano(x.tamano))}</span>
          <button type="button" class="pz-boton pz-chico quitar" data-desinstalar="${esc(x.id)}" aria-label="${esc(Tp("Desinstalar {app}", { app: x.nombre }))}" data-sin-traducir>${esc(Tp("Desinstalar"))}</button></li>`).join("")}</ul>
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
    else if (!f) cuerpo = `<p class="suave">Mira cuántas fotos, videos y capturas tienes y cuánto ocupan. Te pediremos permiso para ver tus fotos; este resumen no sale del iPhone.</p>
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

  // Lo que hace cada paso del plan cuando no lo puede hacer la app sola: dónde está, en palabras de la persona.
  const GUIAS = {
    whatsapp: "En WhatsApp: Ajustes → Almacenamiento y datos → Administrar almacenamiento. Ahí ves los chats más pesados y borras lo que no necesitas.",
    eliminados_recientemente: "En Fotos: Álbumes → Eliminados recientemente → Seleccionar → Eliminar todo. Hasta que lo vacíes, el espacio no se libera.",
    actualizar_ios: "En el iPhone: Ajustes → General → Actualización de software.",
    respaldar_fotos: "Abre Despeja en tu iPhone y toca «Respaldar en tu Mac»; aquí abajo, «Recibir fotos y videos».",
    borrar_respaldadas: "En Despeja en tu iPhone: «Liberar espacio» borra solo lo que tu Mac ya verificó.",
  };

  function tarjetaPlan() {
    if (!E.iphone) return "";
    const nombreIA = (E.ias.find((x) => x.id === E.config.ia) || {}).nombre || "";
    let cuerpo;
    if (E.armando) cuerpo = `<p class="suave" aria-busy="true" data-sin-traducir>${esc(Tp("{ia} está revisando tu iPhone…", { ia: nombreIA || Tp("Tu IA") }))}</p>`;
    else if (!E.plan) cuerpo = `<p class="suave">Tu IA revisa el espacio, las apps y lo respaldado, y te propone qué hacer primero. Solo ve tamaños y nombres de apps; nunca tus fotos.</p>
      ${E.apps ? "" : `<p class="nota">Para un plan más preciso, revisa antes las apps.</p>`}
      ${E.planError ? `<p class="error" data-sin-traducir>${esc(E.planError)}</p>` : ""}
      <div class="pz-pie"><button type="button" class="pz-boton pz-principal" id="armar-plan"${E.config.ia ? "" : " disabled"}>Armar mi plan</button></div>
      ${E.config.ia ? "" : `<p class="nota">Elige tu IA en Ajustes.</p>`}`;
    else cuerpo = `<p data-sin-traducir>${esc(E.plan.resumen)}</p><ol class="plan">${E.plan.pasos.map((x, i) => `<li>
        <div class="paso-titulo"><b data-sin-traducir>${esc(x.titulo)}</b>${x.libera_gb ? `<span class="chip" data-sin-traducir>${esc(Tp("~{n} GB", { n: gb(x.libera_gb * 1e9) }))}</span>` : ""}</div>
        <p class="suave" data-sin-traducir>${esc(x.detalle)}</p>
        ${x.tipo === "desinstalar_app" ? `<button type="button" class="pz-boton pz-peligro" data-desinstalar="${esc(x.app_id)}">Desinstalar</button>`
          : GUIAS[x.tipo] ? `<p class="guia">${esc(GUIAS[x.tipo])}</p>` : ""}</li>`).join("")}</ol>
      <div class="pz-pie"><button type="button" class="pz-boton" id="armar-plan">Armar de nuevo</button></div>`;
    return `<section class="tarjeta" id="plan"><h2>Tu plan</h2>${cuerpo}</section>`;
  }

  function tarjetaRecibir() {
    if (!E.iphone) return "";
    const d = E.destino;
    let cuerpo;
    if (E.recibiendo) {
      cuerpo = E.conectado || E.recibidos
        ? `<p aria-live="polite" data-sin-traducir><b>${esc(Tp("{n} archivos recibidos y verificados", { n: entero(E.recibidos) }))}</b> · ${esc(tamano(E.bytesRecibidos))}</p>
           <p class="suave">Deja Despeja abierto en el iPhone hasta que termine.</p>`
        : E.codigo ? `<p>En tu iPhone, abre Despeja, toca «Respaldar en tu Mac» y escribe este código:</p>
           <p class="codigo" data-sin-traducir aria-label="${esc(Tp("Código"))}">${esc(E.codigo)}</p>`
        : `<p class="suave" aria-busy="true">Preparando una conexión segura…</p>`;
      cuerpo += `<div class="pz-pie"><button type="button" class="pz-boton" id="detener-recibir">Detener</button></div>`;
    } else {
      cuerpo = `<p class="suave">Tus fotos y videos se guardan en tu Mac, ordenados por año y mes, y cada archivo se verifica antes de que el iPhone pueda borrarlo.</p>
        <p class="destino" data-sin-traducir>${d ? esc(Tp("Se guardan en «{c}»", { c: d.nombre })) : esc(Tp("Todavía no eliges dónde guardarlos."))}
          <button type="button" class="pz-boton pz-chico" id="elegir-destino">${d ? esc(Tp("Cambiar")) : esc(Tp("Elegir carpeta"))}</button></p>
        ${E.finRespaldo ? `<p class="hecho" data-sin-traducir>${esc(E.finRespaldo)}</p>` : ""}
        <div class="pz-pie"><button type="button" class="pz-boton pz-principal" id="recibir"${d ? "" : " disabled"}>Recibir fotos y videos</button></div>`;
    }
    return `<section class="tarjeta" id="recibir-tarjeta"><h2>Respaldo en tu Mac</h2>${cuerpo}</section>`;
  }

  function tarjetaEnviar() {
    let cuerpo;
    if (E.respaldando) {
      const a = E.avance || { hechos: 0, total: 0, bytes: 0 };
      const pct = a.total ? Math.round((a.hechos / a.total) * 100) : 0;
      cuerpo = `<div class="espacio" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="${esc(Tp("Avance"))}" data-sin-traducir><span data-medida="${pct}"></span></div>
        <p aria-live="polite" data-sin-traducir>${esc(Tp("{h} de {t} · {b} verificados", { h: entero(a.hechos), t: entero(a.total), b: tamano(a.bytes) }))}</p>
        <p class="suave">Deja Despeja abierto: la pantalla no se apagará mientras respalda.</p>
        <div class="pz-pie"><button type="button" class="pz-boton" id="parar-envio">Detener</button></div>`;
    } else if (E.macConectado) {
      cuerpo = `<p data-sin-traducir>${esc(Tp("Conectado con {mac}.", { mac: E.macConectado }))}</p>
        ${E.finEnvio ? `<p class="hecho" data-sin-traducir>${esc(E.finEnvio)}</p>` : `<p class="suave">Se manda todo lo que tu Mac todavía no tiene. Si se corta, sigue donde quedó.</p>`}
        <div class="pz-pie"><button type="button" class="pz-boton${E.finEnvio ? "" : " pz-principal"}" id="respaldar">${E.finEnvio ? "Respaldar de nuevo" : "Respaldar todo"}</button></div>`;
    } else if (E.mac) {
      cuerpo = `<p data-sin-traducir>${esc(Tp("Escribe el código que muestra Despeja en {mac}.", { mac: E.mac }))}</p>
        <label class="pz-campo"><span>Código</span><input id="codigo" class="codigo-campo" autocomplete="one-time-code" autocapitalize="characters"
          spellcheck="false" maxlength="9" inputmode="text" value="${esc(E.codigoEscrito)}" data-sin-traducir></label>
        ${E.errorMac ? `<p class="error" data-sin-traducir>${esc(E.errorMac)}</p>` : ""}
        <div class="pz-pie"><button type="button" class="pz-boton" id="otro-mac">Otro Mac</button>
          <button type="button" class="pz-boton pz-principal" id="conectar"${E.conectando ? " disabled" : ""}>${E.conectando ? "Conectando…" : "Conectar"}</button></div>`;
    } else if (E.buscandoMac) {
      const lista = E.macs || [];
      cuerpo = lista.length
        ? `<p>Elige tu Mac:</p><div class="lista-macs">${lista.map((m) => `<button type="button" class="pz-boton" data-mac="${esc(m)}" data-sin-traducir>${esc(m)}</button>`).join("")}</div>`
        : `<p class="suave" aria-busy="true">Buscando tu Mac en esta red Wi-Fi…</p><p class="nota">En el Mac, abre Despeja y toca «Recibir fotos y videos».</p>`;
      if (E.errorMac) cuerpo += `<p class="error" data-sin-traducir>${esc(E.errorMac)}</p>`;
    } else {
      cuerpo = `<p class="suave">Respalda tus fotos y videos en tu Mac antes de borrarlos. Viajan por tu Wi-Fi, cifrados, sin pasar por internet.</p>
        <div class="pz-pie"><button type="button" class="pz-boton pz-principal" id="buscar-mac">Respaldar en tu Mac</button></div>`;
    }
    return `<section class="tarjeta" id="enviar"><h2>Respaldar en tu Mac</h2>${cuerpo}</section>`;
  }

  function tarjetaLiberar() {
    const r = E.resumen;
    if (!r || !r.enElIphone) {
      return E.finBorrado ? `<section class="tarjeta" id="liberar"><h2>Liberar espacio</h2><p class="hecho" data-sin-traducir>${esc(E.finBorrado)}</p>
        <p class="guia">${esc(GUIAS.eliminados_recientemente)}</p></section>` : "";
    }
    return `<section class="tarjeta" id="liberar"><h2>Liberar espacio</h2>
      <p data-sin-traducir>${esc(Tp("{n} fotos y videos ya están verificados en tu Mac ({b}).", { n: entero(r.enElIphone), b: tamano(r.bytes) }))}</p>
      <p class="suave">Borrarlos del iPhone no toca la copia de tu Mac. iOS te va a preguntar antes de borrar.</p>
      <div class="pz-pie"><button type="button" class="pz-boton pz-principal pz-peligro" id="borrar-respaldadas"${E.borrando ? " disabled" : ""}>${E.borrando ? "Borrando…" : "Borrar del iPhone"}</button></div>
    </section>`;
  }

  // Los grupos que arma el análisis del iPhone (Limpieza.swift), en el orden en que conviene revisarlos.
  const GRUPOS = [
    ["repetidas", "Fotos repetidas", "La misma imagen guardada más de una vez. Se queda una; las demás están marcadas."],
    ["parecidas", "Fotos parecidas", "Varias tomas seguidas de lo mismo. Se queda la mejor; las demás están marcadas."],
    ["capturas", "Capturas de pantalla", "Todas están marcadas: desmarca las que quieras conservar."],
    ["rafagas", "Ráfagas", "Las fotos de cada ráfaga que no son la elegida."],
    ["utiles", "Memes, documentos y recibos", "Imágenes que no parecen fotos tuyas. Ninguna está marcada: elige las que sobran."],
    ["videos", "Videos grandes", "Los de más de 100 MB, del más pesado al más liviano. Ninguno está marcado."],
  ];

  function tarjetaLimpiar() {
    let cuerpo;
    if (E.analizando) {
      const a = E.analisisAvance || { hechos: 0, total: 0 };
      const pct = a.total ? Math.round((a.hechos / a.total) * 100) : 0;
      cuerpo = `<div class="espacio" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="${esc(Tp("Avance"))}" data-sin-traducir><span data-medida="${pct}"></span></div>
        <p aria-live="polite" data-sin-traducir>${esc(a.total ? Tp("Revisando {h} de {t} fotos…", { h: entero(a.hechos), t: entero(a.total) }) : Tp("Preparando el análisis…"))}</p>
        <p class="suave">Todo se analiza en tu iPhone. Nada sale de aquí.</p>`;
    } else if (!E.grupos) {
      cuerpo = `<p class="suave">Despeja busca fotos repetidas y parecidas, capturas, ráfagas, memes y videos grandes, y te propone qué borrar. Tú decides; nada sale del iPhone.</p>
        <div class="pz-pie"><button type="button" class="pz-boton pz-principal" id="analizar">Analizar mi iPhone</button></div>`;
    } else {
      const filas = GRUPOS.filter(([k]) => E.grupos[k] && E.grupos[k].n).map(([k, titulo]) => {
        const g = E.grupos[k];
        return `<li><button type="button" class="fila-grupo" data-grupo="${k}">
          <span class="g-titulo">${esc(titulo)}</span>
          <span class="g-cifras" data-sin-traducir>${esc(Tp("{n} · {b}", { n: entero(g.n), b: tamano(g.bytes) }))}</span>
          <span class="g-propuesta" data-sin-traducir>${g.marcadas ? esc(Tp("Borrar {m} libera {b}", { m: entero(g.marcadas), b: tamano(g.bytesMarcadas) })) : esc(Tp("Revisar"))}</span>
        </button></li>`;
      }).join("");
      const libera = Object.values(E.grupos).reduce((t, g) => t + (g.bytesMarcadas || 0), 0);
      cuerpo = filas
        ? `<p data-sin-traducir><b>${esc(Tp("Puedes liberar {b}", { b: tamano(libera) }))}</b> ${esc(Tp("con lo que está marcado."))}</p><ul class="grupos">${filas}</ul>
           <div class="pz-pie"><button type="button" class="pz-boton" id="analizar">Analizar de nuevo</button></div>`
        : `<p class="hecho">No encontré nada que sobre. Tu biblioteca está ordenada.</p>
           <div class="pz-pie"><button type="button" class="pz-boton" id="analizar">Analizar de nuevo</button></div>`;
    }
    return `<section class="tarjeta" id="limpiar"><h2>Limpiar fotos y videos</h2>${cuerpo}</section>`;
  }

  function vistaGrupo() {
    const def = GRUPOS.find(([k]) => k === E.grupo) || [E.grupo, E.grupo, ""];
    const g = (E.grupos || {})[E.grupo] || { n: 0, marcadas: 0, bytesMarcadas: 0 };
    const cuadros = E.items.map((x) => `<li class="cuadro${x.marcada ? " marcada" : ""}${x.guardar ? " guardar" : ""}">
        <button type="button" class="cuadro-elegir" data-marcar="${esc(x.id)}" aria-pressed="${x.marcada}"
          aria-label="${esc(Tp(x.marcada ? "Desmarcar ({b})" : "Marcar para borrar ({b})", { b: tamano(x.bytes) }))}" data-sin-traducir>
          ${x.img ? `<img src="${esc(x.img)}" alt="" loading="lazy">` : `<span class="sin-img"></span>`}
          ${x.video ? `<span class="etiqueta" data-sin-traducir>${esc(duracion(x.duracion))}</span>` : ""}
          ${x.guardar ? `<span class="etiqueta queda" data-sin-traducir>${esc(Tp("Se queda"))}</span>` : ""}
          <span class="check" aria-hidden="true"></span></button>
        <button type="button" class="cuadro-ver" data-ver="${esc(x.id)}" aria-label="${esc(Tp("Ver en grande"))}" data-sin-traducir>⤢</button></li>`).join("");
    return `<header class="barra"><button type="button" class="pz-boton" id="volver" data-sin-traducir>‹ ${esc(Tp("Volver"))}</button>
        <h1 data-sin-traducir>${esc(Tp(def[1]))}</h1><span></span></header>
      <main class="contenido grupo">
        <p class="suave">${esc(def[2])}</p>
        <div class="pz-pie izquierda"><button type="button" class="pz-boton pz-chico" id="marcar-todas">Marcar todas</button>
          <button type="button" class="pz-boton pz-chico" id="marcar-ninguna">Ninguna</button></div>
        <ul class="cuadros">${cuadros}</ul>
        ${E.items.length < E.totalGrupo ? `<div class="pz-pie"><button type="button" class="pz-boton" id="cargar-mas"${E.cargando ? " disabled" : ""}>${E.cargando ? "Cargando…" : "Ver más"}</button></div>`
          : E.cargando ? `<p class="suave" aria-busy="true">Cargando…</p>` : ""}
      </main>
      <div class="barra-borrar"><button type="button" class="pz-boton pz-principal pz-peligro" id="borrar-grupo"${g.marcadas && !E.borrandoGrupo ? "" : " disabled"} data-sin-traducir>${esc(E.borrandoGrupo ? Tp("Borrando…")
        : g.marcadas ? Tp("Borrar {m} ({b})", { m: entero(g.marcadas), b: tamano(g.bytesMarcadas) }) : Tp("Marca lo que quieras borrar"))}</button></div>
      ${E.grande ? ui.dialogo({ id: "t-grande", titulo: "Vista", cuerpo: E.grande.img ? `<img class="grande" src="${esc(E.grande.img)}" alt="">` : `<p class="suave" aria-busy="true">Cargando…</p>`,
        pie: '<button type="button" class="pz-boton pz-principal" data-pz-cerrar>Listo</button>' }) : ""}`;
  }
  const duracion = (s) => `${Math.floor((s || 0) / 60)}:${String((s || 0) % 60).padStart(2, "0")}`;

  function principal() {
    if (enIphone && E.grupo) return vistaGrupo();
    if (enIphone) return barra() + `<main class="contenido">${tarjetaLimpiar()}${tarjetaEnviar()}${tarjetaLiberar()}${tarjetaFotos()}</main>`;
    return barra() + `<main class="contenido">${tarjetaIphone()}${tarjetaPlan()}${tarjetaRecibir()}${tarjetaApps()}</main>`;
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
    // Mac: plan, desinstalar, respaldo
    else if (b.id === "armar-plan") { E.armando = true; E.planError = null; pintar(); host.enviar("planArmar"); }
    else if (b.dataset.desinstalar) desinstalar(b.dataset.desinstalar);
    else if (b.id === "elegir-destino") host.enviar("elegirDestino");
    else if (b.id === "recibir") {
      Object.assign(E, { recibiendo: true, codigo: "", recibidos: 0, bytesRecibidos: 0, finRespaldo: null, conectado: false });
      pintar();
      host.enviar("respaldoRecibir");
    } else if (b.id === "detener-recibir") host.enviar("respaldoDetener");
    // iPhone: buscar el Mac, conectar, respaldar, borrar
    else if (b.id === "buscar-mac") { Object.assign(E, { buscandoMac: true, macs: [], errorMac: "" }); pintar(); host.enviar("macBuscar"); }
    else if (b.dataset.mac) { Object.assign(E, { mac: b.dataset.mac, codigoEscrito: "", errorMac: "" }); pintar(); document.getElementById("codigo")?.focus(); }
    else if (b.id === "otro-mac") { Object.assign(E, { mac: "", errorMac: "" }); pintar(); }
    else if (b.id === "conectar") conectar();
    else if (b.id === "respaldar") { Object.assign(E, { respaldando: true, avance: null, finEnvio: null }); pintar(); host.enviar("respaldar"); }
    else if (b.id === "parar-envio") host.enviar("respaldoParar");
    else if (b.id === "borrar-respaldadas") borrarRespaldadas();
    // iPhone: analizar y limpiar por grupos
    else if (b.id === "analizar") { Object.assign(E, { analizando: true, analisisAvance: null }); pintar(); host.enviar("analizar"); }
    else if (b.dataset.grupo) abrirGrupo(b.dataset.grupo);
    else if (b.id === "volver") { E.grupo = null; E.items = []; pintar(); }
    else if (b.id === "cargar-mas") { E.cargando = true; pintar(); host.enviar("grupoVer", { grupo: E.grupo, desde: E.items.length }); }
    else if (b.dataset.marcar) {
      const x = E.items.find((i) => i.id === b.dataset.marcar);
      if (!x) return;
      x.marcada = !x.marcada;
      pintar();
      host.enviar("grupoMarcar", { grupo: E.grupo, id: x.id, marcada: x.marcada });
    } else if (b.dataset.ver) { E.grande = { id: b.dataset.ver, img: "" }; pintar(); host.enviar("fotoGrande", { id: b.dataset.ver }); }
    else if (b.id === "marcar-todas" || b.id === "marcar-ninguna") {
      const todas = b.id === "marcar-todas";
      for (const x of E.items) x.marcada = todas && !x.guardar;
      pintar();
      host.enviar("grupoMarcar", { grupo: E.grupo, todas });
    } else if (b.id === "borrar-grupo") borrarGrupo();
  });
  document.addEventListener("input", (ev) => {
    if (ev.target.id !== "codigo") return;
    // Se escribe como se ve en el Mac (K7P4-M2QX): mayúsculas y el guion solo.
    const v = ev.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
    ev.target.value = v.length > 4 ? `${v.slice(0, 4)}-${v.slice(4)}` : v;
    E.codigoEscrito = ev.target.value;
  });
  document.addEventListener("keydown", (ev) => { if (ev.key === "Enter" && ev.target.id === "codigo") conectar(); }, true);
  function conectar() {
    if (E.conectando || E.codigoEscrito.replace("-", "").length !== 8) { E.errorMac = Tp("El código tiene 8 letras y números, como lo ves en tu Mac."); return pintar(); }
    Object.assign(E, { conectando: true, errorMac: "" });
    pintar();
    host.enviar("macConectar", { mac: E.mac, codigo: E.codigoEscrito });
  }
  async function desinstalar(id) {
    const app = ((E.apps && E.apps.apps) || []).find((x) => x.id === id);
    const nombre = app ? app.nombre : id;
    const si = await ui.confirmar({ titulo: "¿Desinstalar {app}?", valores: { app: nombre }, peligro: true, si: "Desinstalar",
      texto: "Se borra del iPhone junto con lo que guarda adentro. Si tiene datos que no están en la nube, se pierden. La puedes volver a bajar de la App Store." });
    if (si) { toast("Desinstalando {app}…", { valores: { app: nombre } }); host.enviar("iphoneDesinstalar", { id }); }
  }
  function abrirGrupo(k) {
    Object.assign(E, { grupo: k, items: [], totalGrupo: (E.grupos[k] || {}).n || 0, cargando: true });
    pintar();
    window.scrollTo(0, 0);
    host.enviar("grupoVer", { grupo: k, desde: 0 });
  }
  async function borrarGrupo() {
    const g = (E.grupos || {})[E.grupo] || {};
    const si = await ui.confirmar({ titulo: "¿Borrar {m} del iPhone?", valores: { m: entero(g.marcadas) }, peligro: true, si: "Borrar",
      texto: "Van a «Eliminados recientemente» por 30 días: ahí todavía las puedes recuperar. iOS te va a preguntar una vez más." });
    if (!si) return;
    E.borrandoGrupo = true;
    pintar();
    host.enviar("grupoBorrar", { grupo: E.grupo });
  }
  async function borrarRespaldadas() {
    const r = E.resumen || {};
    const si = await ui.confirmar({ titulo: "¿Borrar {n} fotos y videos del iPhone?", valores: { n: entero(r.enElIphone) }, peligro: true, si: "Borrar del iPhone",
      texto: "Solo los que tu Mac ya verificó. Van a «Eliminados recientemente»: vacíalo para liberar el espacio." });
    if (!si) return;
    E.borrando = true;
    pintar();
    host.enviar("borrarRespaldadas");
  }
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
      Object.assign(E, { config: e.config || {}, version: e.version || "", destino: e.destino || null });
      await cargarIdioma();
      tema.aplicar(tema.elegir({ config: E.config.tema }));
      ui.actualizacionDisponible(e.actualizacion && e.actualizacion.hay ? e.actualizacion : null, { pintar: false });
      if (!E.iniciada) {
        E.iniciada = true;
        bv.abrir({ config: E.config, forzar: new URLSearchParams(location.search).has("bienvenida") });
        if (!enIphone) { host.enviar("listaIA"); buscarIphone(); } else host.enviar("respaldoEstado");
      }
      pintar();
    },
    iphoneEstado(r) {
      E.buscando = false;
      if (r && r.ok && r.iphone) {
        if (!E.iphone) host.enviar("iosRevisar");   // una vez por conexión: ¿hay una versión de iOS más nueva?
        E.iphone = r.iphone;
        E.sinIphone = false;
      }
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
    // Mac
    iosRevisado(r) { if (r && r.ok) { E.ios = r; pintar(); } },
    planListo(r) {
      E.armando = false;
      if (r && r.ok) { E.plan = r.plan; E.planError = null; }
      else E.planError = r && r.plantilla ? Tp(r.plantilla, r.valores || {}) : Tp((r && r.error) || "No pude armar el plan.");
      pintar();
    },
    appDesinstalada(r) {
      if (r && r.ok) {
        const app = ((E.apps && E.apps.apps) || []).find((x) => x.id === r.id);
        if (E.apps) { E.apps.apps = E.apps.apps.filter((x) => x.id !== r.id); E.apps.total = E.apps.apps.reduce((t, x) => t + x.tamano, 0); }
        if (E.plan) E.plan.pasos = E.plan.pasos.filter((x) => x.app_id !== r.id);
        toast("Listo: {app} ya no está en el iPhone.", { valores: { app: app ? app.nombre : r.id } });
        host.enviar("iphoneEstado");
      } else toast((r && r.error) || "No se pudo.", { error: true });
      pintar();
    },
    respaldoProgreso(p) {
      for (const e of (p && p.eventos) || []) {
        if (e.t === "esperando") E.codigo = String(e.codigo || "");
        else if (e.t === "conectado") E.conectado = true;
        else if (e.t === "archivo") { E.recibidos = e.n || 0; E.bytesRecibidos = e.bytes || 0; }
      }
      pintar();
    },
    respaldoTerminado(r) {
      E.recibiendo = false;
      if (r && r.ok) {
        E.finRespaldo = r.recibidos
          ? Tp("Listo: {n} archivos nuevos verificados ({b}).", { n: entero(r.recibidos), b: tamano(r.bytes) })
          : r.motivo === "listo" ? Tp("Listo: tu Mac ya tenía todo.") : r.motivo === "sin_actividad" ? Tp("Lo detuve: pasaron 15 minutos sin que llegara nada.") : "";
      } else toast((r && r.error) || "No se pudo.", { error: true });
      pintar();
    },
    respaldoDetenido() {},
    // iPhone: análisis y limpieza
    analisisAvance(a) { E.analisisAvance = a; pintar(); },
    analisisListo(r) {
      E.analizando = false;
      if (r && r.ok) E.grupos = r.grupos || {};
      else toast((r && r.error) || "No se pudo.", { error: true });
      pintar();
    },
    grupoPagina(r) {
      E.cargando = false;
      if (!r || !r.ok || r.grupo !== E.grupo) return pintar();
      const ya = new Set(E.items.map((x) => x.id));
      E.items = E.items.concat((r.items || []).filter((x) => !ya.has(x.id) && (!x.img || /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(x.img))));
      E.totalGrupo = r.total || 0;
      pintar();
    },
    fotoGrande(r) {
      if (!E.grande || !r || r.id !== E.grande.id) return;
      E.grande.img = r.ok && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(r.img || "") ? r.img : "";
      if (!E.grande.img) E.grande = null;
      pintar();
    },
    grupos(r) { if (r && r.ok) { E.grupos = r.grupos || {}; pintar(); } },
    grupoBorrado(r) {
      E.borrandoGrupo = false;
      if (r && r.ok) {
        E.grupos = r.grupos || {};
        if (r.borradas) toast("Se borraron {n} ({b}). Están en «Eliminados recientemente».", { valores: { n: entero(r.borradas), b: tamano(r.bytes) } });
        E.grupo = null;
        E.items = [];
      } else if (r && r.codigo !== "cancelado") toast((r && r.error) || "No se pudo.", { error: true });
      pintar();
    },
    // iPhone
    respaldoEstado(r) { E.resumen = r || null; pintar(); },
    macsEncontrados(r) {
      if (r && r.ok) E.macs = r.macs || [];
      else E.errorMac = Tp((r && r.error) || "No pude buscar en tu red Wi-Fi.");
      pintar();
    },
    macConectado(r) {
      E.conectando = false;
      if (r && r.ok) Object.assign(E, { macConectado: r.mac, errorMac: "", codigoEscrito: "" });
      else E.errorMac = (r && r.error) || Tp("No pude conectarme con tu Mac.");
      pintar();
    },
    respaldoAvance(a) { E.avance = a; pintar(); },
    respaldoListo(r) {
      E.respaldando = false;
      if (r && r.ok) {
        E.resumen = r.resumen || E.resumen;
        E.finEnvio = r.detenido ? Tp("Detenido: {h} de {t} revisadas. Lo que falta se manda la próxima vez.", { h: entero(r.hechos), t: entero(r.total) })
          : r.fallas ? Tp("Listo, pero {f} no se pudieron mandar (puede ser falta de conexión). Vuelve a respaldar para reintentarlas.", { f: entero(r.fallas) })
          : Tp("Listo: tus {t} fotos y videos están verificados en tu Mac.", { t: entero(r.total) });
      } else E.errorMac = (r && r.error) || Tp("No se pudo.");
      pintar();
    },
    borradas(r) {
      E.borrando = false;
      if (r && r.ok) {
        E.resumen = r.resumen || E.resumen;
        E.finBorrado = Tp("Se borraron {n} del iPhone ({b}).", { n: entero(r.borradas), b: tamano(r.bytes) });
      } else if (r && r.codigo !== "cancelado") toast((r && r.error) || "No se pudo.", { error: true });
      pintar();
    },
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
      case "iosRevisar": return c.luego(200, () => c.responder("iosRevisado", DEMO.ios));
      case "planArmar": return c.luego(700, () => c.responder("planListo", { ok: true, plan: DEMO.plan }));
      case "iphoneDesinstalar": return c.luego(500, () => c.responder("appDesinstalada", { ok: true, id: d.id }));
      case "elegirDestino": DEMO.destino = { nombre: "Respaldos iPhone", ruta: "~/Respaldos iPhone" }; return c.responder("estado", DEMO);
      case "respaldoRecibir":
        c.luego(200, () => c.responder("respaldoProgreso", { eventos: [{ t: "esperando", codigo: "K7P4-M2QX" }] }));
        DEMO._recibir = c.luego(1500, () => c.responder("respaldoProgreso", { eventos: [{ t: "conectado" }, { t: "archivo", n: 128, bytes: 3.2e9 }] }));
        return;
      case "respaldoDetener": clearTimeout(DEMO._recibir); return c.luego(200, () => c.responder("respaldoTerminado", { ok: true, recibidos: 128, bytes: 3.2e9, motivo: "detenido" }));
      case "respaldoEstado": return c.responder("respaldoEstado", DEMO.resumen);
      case "macBuscar": return c.luego(600, () => c.responder("macsEncontrados", { ok: true, macs: ["Despeja en Mac de Ana"] }));
      case "macConectar": return c.luego(500, () => c.responder("macConectado", String(d.codigo).replace("-", "") === "K7P4M2QX"
        ? { ok: true, mac: "Mac de Ana" } : { ok: false, codigo: "codigo", error: "El código no calza con el de tu Mac. Revísalo e intenta de nuevo." }));
      case "respaldar":
        c.luego(300, () => c.responder("respaldoAvance", { hechos: 4200, total: 9025, bytes: 14.1e9, fallas: 0 }));
        return c.luego(900, () => { DEMO.resumen = { respaldadas: 9025, enElIphone: 9025, bytes: 31.4e9 }; c.responder("respaldoListo", { ok: true, hechos: 9025, total: 9025, nuevos: 9025, fallas: 0, detenido: false, resumen: DEMO.resumen }); });
      case "respaldoParar": return;
      case "analizar":
        c.luego(200, () => c.responder("analisisAvance", { hechos: 4100, total: 9025 }));
        return c.luego(700, () => c.responder("analisisListo", { ok: true, grupos: DEMO.grupos }));
      case "grupoVer": {
        const todos = (DEMO.items[d.grupo] || []);
        return c.luego(250, () => c.responder("grupoPagina", { ok: true, grupo: d.grupo, desde: d.desde, total: todos.length, items: todos.slice(d.desde, d.desde + 60) }));
      }
      case "grupoMarcar": {
        const g = DEMO.grupos[d.grupo], todos = DEMO.items[d.grupo] || [];
        for (const x of todos) if (d.todas !== undefined) x.marcada = d.todas && !x.guardar; else if (x.id === d.id) x.marcada = d.marcada;
        const m = todos.filter((x) => x.marcada);
        Object.assign(g, { marcadas: m.length, bytesMarcadas: m.reduce((t, x) => t + x.bytes, 0) });
        return c.responder("grupos", { ok: true, grupos: DEMO.grupos });
      }
      case "fotoGrande": return c.luego(200, () => c.responder("fotoGrande", { ok: true, id: d.id, img: DEMO.foto }));
      case "grupoBorrar": {
        const g = DEMO.grupos[d.grupo], n = g.marcadas, b = g.bytesMarcadas;
        DEMO.items[d.grupo] = (DEMO.items[d.grupo] || []).filter((x) => !x.marcada);
        Object.assign(g, { n: g.n - n, bytes: g.bytes - b, marcadas: 0, bytesMarcadas: 0 });
        return c.luego(400, () => c.responder("grupoBorrado", { ok: true, grupo: d.grupo, borradas: n, bytes: b, grupos: DEMO.grupos }));
      }
      case "borrarRespaldadas": return c.luego(500, () => c.responder("borradas", { ok: true, borradas: 9025, bytes: 31.4e9, resumen: { respaldadas: 9025, enElIphone: 0, bytes: 31.4e9 } }));
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
      // ?completo (capturas de la página): con las apps, el plan y la carpeta ya listos.
      if (q.has("completo")) {
        E.apps = { apps: DEMO.apps, total: DEMO.apps.reduce((t, a) => t + a.tamano, 0) };
        E.plan = DEMO.plan;
        DEMO.destino = { nombre: "Respaldos iPhone", ruta: "~/Respaldos iPhone" };
      }
    }
    host.enviar("listo");
  }
  iniciar();
})();
