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
    sugeridas: null, sugiriendo: false, elegidas: new Set(), desinstalando: [],
    analizando: false, analisisAvance: null, grupos: null, grupo: null, items: [], totalGrupo: 0, cargando: false,
    grande: null, borrandoGrupo: false, procesando: null, uno: null,
    tab: "limpiar",
    wa: null, waBuscando: false, waRespaldo: "", waAnalizando: false, waChats: null, waGuardando: null,   // iPhone: limpiar | respaldo | orden
    contactos: null, revisandoContactos: false, incompletosElegidos: new Set(), calendario: null, revisandoCalendario: false };
  // ?iphone en la vista previa muestra la pantalla del iPhone.
  const enIphone = host.plataforma === "movil" || (host.plataforma === "web" && new URLSearchParams(location.search).has("iphone"));
  if (enIphone) document.documentElement.classList.add("iphone");
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
  const barra = (titulo) => `<header class="barra"><h1 data-sin-traducir>${esc(titulo || NOMBRE)}</h1>
      <button type="button" class="pz-boton pz-chico boton-ajustes" id="abrir-ajustes">Ajustes</button></header>`;
  // iPhone: tres pestañas abajo, al alcance del pulgar
  const TABS = [["limpiar", "Limpiar"], ["respaldo", "Respaldo"], ["orden", "Orden"]];
  const tabbar = () => `<nav class="tabbar" aria-label="${esc(Tp("Secciones"))}" data-sin-traducir>${TABS.map(([k, t]) =>
    `<button type="button" data-tab="${k}" aria-current="${E.tab === k ? "page" : "false"}"><span class="tab-icono tab-${k}" aria-hidden="true"></span>${esc(Tp(t))}</button>`).join("")}</nav>`;

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
      <p class="cifras" data-sin-traducir><span class="cifra-grande${poco ? " poca" : ""}">${esc(Tp("{n} GB", { n: gb(p.libre) }))}</span>
        <span>${esc(Tp("libres de {t} GB", { t: gb(p.capacidad) }))}</span></p>
      <div class="espacio${poco ? " poco" : ""}" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"
        aria-label="${esc(Tp("Espacio usado"))}" data-sin-traducir><span data-medida="${pct}"></span></div>

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
    if (E.revisandoApps && !a) cuerpo = `<p class="suave" aria-busy="true">Revisando tus apps… calcular cuánto ocupa cada una toma unos minutos.</p>`;
    else if (!a) cuerpo = `<p class="suave">Mira cuánto ocupa cada app, de la más pesada a la más liviana.</p>
      <div class="pz-pie"><button type="button" class="pz-boton pz-principal" id="revisar-apps">Revisar apps</button></div>`;
    else {
      const max = a.apps[0] ? a.apps[0].tamano || 1 : 1;
      const lista = E.todasLasApps ? a.apps : a.apps.slice(0, 10);
      cuerpo = sugerencias(a) + `<p class="cifras" data-sin-traducir>${esc(Tp("{n} apps ocupan {t}", { n: entero(a.apps.length), t: tamano(a.total) }))}</p>
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

  /** WhatsApp desde el respaldo local del Finder: qué chats pesan más y guardar sus fotos y videos antes de borrarlos. */
  function tarjetaWhatsapp() {
    if (!E.iphone) return "";
    const w = E.wa;
    let cuerpo;
    if (E.waAnalizando) cuerpo = `<p class="suave" aria-busy="true">Leyendo WhatsApp en el respaldo…</p>`;
    else if (E.waChats) {
      const max = (E.waChats.chats[0] || {}).bytes || 1;
      cuerpo = `<p class="cifras" data-sin-traducir><span class="cifra-grande">${esc(tamano(E.waChats.total))}</span><span>${esc(Tp("en fotos, videos y archivos de {n} chats", { n: entero(E.waChats.n_chats) }))}</span></p>
        <ul class="apps wa">${E.waChats.chats.slice(0, 12).map((c) => `<li><span class="nombre" data-sin-traducir>${esc(c.nombre || Tp("(sin nombre)"))}<br>
          <span class="suave" data-sin-traducir>${esc(Tp("{f} fotos, {v} videos, {a} audios", { f: entero(c.fotos), v: entero(c.videos), a: entero(c.audios) }))}</span></span>
          <span class="medida" data-medida="${Math.max(2, Math.round((c.bytes / max) * 100))}" aria-hidden="true"></span>
          <span class="tam" data-sin-traducir>${esc(tamano(c.bytes))}</span>
          <button type="button" class="pz-boton pz-chico" data-wa-guardar="${c.id}"${E.destino && E.waGuardando === null ? "" : " disabled"} data-sin-traducir>${esc(E.waGuardando === c.id ? Tp("Guardando…") : Tp("Guardar"))}</button></li>`).join("")}</ul>
        <p class="guia">${esc("Guarda un chat en tu Mac y después bórralo en WhatsApp: Ajustes → Almacenamiento y datos → Administrar almacenamiento → el chat → Seleccionar → Eliminar.")}</p>
        ${E.destino ? "" : `<p class="nota">Elige una carpeta en «Respaldo en tu Mac» para poder guardar.</p>`}`;
    } else if (w && w.ok && w.respaldos.length) {
      cuerpo = `<p>Elige el respaldo de tu iPhone:</p><div class="lista-macs">${w.respaldos.map((r) => `<button type="button" class="pz-boton" data-wa-respaldo="${esc(r.id)}"${r.cifrado ? " disabled" : ""} data-sin-traducir>
          ${esc(r.nombre)} · ${esc(r.fecha ? new Date(r.fecha).toLocaleDateString(i18n.idioma, { day: "numeric", month: "short", year: "numeric" }) : "")}${r.cifrado ? " · " + esc(Tp("cifrado")) : ""}</button>`).join("")}</div>
        ${w.respaldos.some((r) => r.cifrado) ? `<p class="nota">Un respaldo cifrado no se puede leer sin su contraseña. En el Finder, desmarca «Cifrar respaldo local» y respalda de nuevo.</p>` : ""}`;
    } else {
      const sinAcceso = w && w.codigo === "sin_acceso";
      cuerpo = `<p class="suave">WhatsApp suele ser lo que más pesa y iOS no deja que otra app lo lea. Despeja lo lee del respaldo de tu iPhone en este Mac: te dice qué chats ocupan más y guarda sus fotos y videos antes de que los borres.</p>
        <ol class="pasos"><li>En el Finder, elige tu iPhone y toca «Respaldar ahora» (respaldo en este Mac, sin cifrar).</li>
          <li>Dale a Despeja «Acceso total al disco» para leer ese respaldo.</li></ol>
        ${sinAcceso ? `<p class="error">Falta el acceso total al disco.</p>` : w && w.ok ? `<p class="nota">No encontré respaldos en este Mac todavía.</p>` : ""}
        <div class="pz-pie izquierda"><button type="button" class="pz-boton" id="wa-acceso">Abrir Acceso total al disco</button>
          <button type="button" class="pz-boton pz-principal" id="wa-buscar"${E.waBuscando ? " disabled" : ""}>${E.waBuscando ? "Buscando…" : "Buscar respaldo"}</button></div>`;
    }
    return `<section class="tarjeta" id="whatsapp"><h2>WhatsApp</h2>${cuerpo}</section>`;
  }

  /** Lo que tu IA cree que podría sobrar, para elegir y desinstalar de una vez. */
  function sugerencias(a) {
    const nombreIA = (E.ias.find((x) => x.id === E.config.ia) || {}).nombre || Tp("Tu IA");
    if (E.sugiriendo) return `<div class="sugeridas"><p class="suave" aria-busy="true" data-sin-traducir>${esc(Tp("{ia} está viendo qué apps podrían sobrar…", { ia: nombreIA }))}</p></div>`;
    const porId = new Map(a.apps.map((x) => [x.id, x]));
    const lista = (E.sugeridas || []).filter((x) => porId.has(x.id));
    if (!E.sugeridas) return E.config.ia ? `<div class="pz-pie izquierda"><button type="button" class="pz-boton" id="sugerir">¿Cuáles podrían sobrar?</button></div>` : "";
    if (!lista.length) return `<p class="nota">Tu IA no encontró apps que claramente sobren.</p>`;
    const elegidas = lista.filter((x) => E.elegidas.has(x.id));
    const bytes = elegidas.reduce((t, x) => t + porId.get(x.id).tamano, 0);
    return `<div class="sugeridas"><h3>Podrías no necesitar</h3>
      <ul>${lista.map((x) => { const app = porId.get(x.id); const ocupada = E.desinstalando.includes(x.id);
        return `<li><label><input type="checkbox" data-elegir="${esc(x.id)}"${E.elegidas.has(x.id) ? " checked" : ""}${ocupada ? " disabled" : ""}>
          <span><b data-sin-traducir>${esc(app.nombre)}</b> <span class="suave" data-sin-traducir>· ${esc(tamano(app.tamano))}</span><br>
          <span class="suave" data-sin-traducir>${esc(x.motivo)}</span></span></label></li>`; }).join("")}</ul>
      <div class="pz-pie"><button type="button" class="pz-boton pz-principal pz-peligro" id="desinstalar-elegidas"${elegidas.length && !E.desinstalando.length ? "" : " disabled"} data-sin-traducir>${esc(E.desinstalando.length
        ? Tp("Desinstalando… quedan {n}", { n: entero(E.desinstalando.length) })
        : elegidas.length ? Tp("Desinstalar {n} ({b})", { n: entero(elegidas.length), b: tamano(bytes) }) : Tp("Elige las que quieras desinstalar"))}</button></div>
      <p class="nota">iOS no le dice a nadie cuánto usas cada app: esto es una sugerencia de tu IA según el tipo de app. Para que iOS quite solo las que de verdad no usas (y guarde sus datos): Ajustes → App Store → Descargar apps sin usar.</p></div>`;
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
    ["comprimidos", "Originales ya comprimidos", "Ya tienes la versión liviana de cada uno en tu biblioteca, con la misma fecha y lugar. Todos están marcados: bórralos y te quedas con la liviana."],
    ["repetidas", "Fotos repetidas", "La misma imagen guardada más de una vez. Se queda una; las demás están marcadas."],
    ["parecidas", "Fotos parecidas", "Varias tomas seguidas de lo mismo. Se queda la mejor; las demás están marcadas."],
    ["capturas", "Capturas de pantalla", "Todas están marcadas: desmarca las que quieras conservar."],
    ["rafagas", "Ráfagas", "Las fotos de cada ráfaga que no son la elegida."],
    ["videosRepetidos", "Videos repetidos", "El mismo video más de una vez. Se queda uno; los demás están marcados."],
    ["borrosas", "Fotos borrosas", "Fotos con muy poco detalle. Ninguna está marcada: revísalas antes, a veces es un fondo liso."],
    ["utiles", "Memes, documentos y recibos", "Imágenes que no parecen fotos tuyas. Ninguna está marcada: elige las que sobran."],
    ["videos", "Videos grandes", "Los de más de 100 MB, del más pesado al más liviano. Ninguno está marcado."],
  ];
  // Ahorrar sin borrar: el original se reemplaza por una versión más liviana (y va a «Eliminados recientemente»).
  const AHORRO = [
    ["comprimir", "Comprimir videos", "Se reemplazan por una versión HEVC de hasta 1080p, con la misma fecha, lugar y favorita. Se ven igual en el iPhone."],
    ["live", "Live Photos a fotos", "Se quita el video corto de cada Live Photo; la foto queda igual. Las favoritas no están marcadas."],
  ];
  const esAhorro = (k) => AHORRO.some(([x]) => x === k);
  const defGrupo = (k) => GRUPOS.concat(AHORRO).find(([x]) => x === k) || [k, k, ""];

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
      const fila = ([k, titulo]) => {
        const g = E.grupos[k];
        const ahorro = esAhorro(k);
        return `<li><button type="button" class="fila-grupo" data-grupo="${k}">
          <span class="g-titulo">${esc(titulo)}</span>
          <span class="g-cifras" data-sin-traducir>${esc(ahorro ? entero(g.n) : Tp("{n} · {b}", { n: entero(g.n), b: tamano(g.bytes) }))}</span>
          <span class="g-flecha" aria-hidden="true"></span>
          <span class="g-propuesta" data-sin-traducir>${g.marcadas ? esc(Tp(ahorro ? "Ahorra ~{b} con {m}" : "Borrar {m} libera {b}", { m: entero(g.marcadas), b: tamano(g.bytesMarcadas) })) : esc(Tp("Revisar"))}</span>
        </button></li>`;
      };
      const hay = ([k]) => E.grupos[k] && E.grupos[k].n;
      const filas = GRUPOS.filter(hay).map(fila).join("");
      const filasAhorro = AHORRO.filter(hay).map(fila).join("");
      const libera = Object.values(E.grupos).reduce((t, g) => t + (g.bytesMarcadas || 0), 0);
      cuerpo = filas || filasAhorro
        ? `<div class="heroe" data-sin-traducir><span class="heroe-cifra">${esc(tamano(libera))}</span>
             <span class="heroe-texto">${esc(Tp("puedes liberar con lo que está marcado"))}</span>
             ${E.fechaAnalisis ? `<span class="nota">${esc(Tp("Análisis del {f}", { f: new Date(E.fechaAnalisis).toLocaleDateString(i18n.idioma, { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) }))}</span>` : ""}</div>
           ${filas ? `<h2 class="sub">Para borrar</h2><ul class="grupos">${filas}</ul>` : ""}
           ${filasAhorro ? `<h2 class="sub">Ahorrar sin borrar</h2><ul class="grupos">${filasAhorro}</ul>` : ""}
           <div class="pz-pie"><button type="button" class="pz-boton" id="analizar">Analizar de nuevo</button></div>`
        : `<p class="hecho">No encontré nada que sobre. Tu biblioteca está ordenada.</p>
           <div class="pz-pie"><button type="button" class="pz-boton" id="analizar">Analizar de nuevo</button></div>`;
    }
    return `<section class="tarjeta sin-marco" id="limpiar">${cuerpo}</section>`;
  }

  function vistaGrupo() {
    const def = defGrupo(E.grupo);
    const g = (E.grupos || {})[E.grupo] || { n: 0, marcadas: 0, bytesMarcadas: 0 };
    const ahorro = esAhorro(E.grupo);
    if (E.uno !== null && E.items[E.uno]) return vistaUno(def);
    const cuadros = E.items.map((x) => `<li class="cuadro${x.marcada ? " marcada" : ""}${x.guardar ? " guardar" : ""}">
        <button type="button" class="cuadro-elegir" data-marcar="${esc(x.id)}" aria-pressed="${x.marcada}"
          aria-label="${esc(Tp(x.marcada ? "Desmarcar ({b})" : "Marcar para borrar ({b})", { b: tamano(x.bytes) }))}" data-sin-traducir>
          ${x.img ? `<img src="${esc(x.img)}" alt="" loading="lazy">` : `<span class="sin-img"></span>`}
          ${x.video ? `<span class="etiqueta" data-sin-traducir>${esc(duracion(x.duracion))}</span>` : ""}
          ${x.guardar ? `<span class="etiqueta queda" data-sin-traducir>${esc(Tp("Se queda"))}</span>` : ""}
          <span class="check" aria-hidden="true"></span></button>
        ${x.video ? `<button type="button" class="cuadro-ver" data-video="${esc(x.id)}" aria-label="${esc(Tp("Ver el video"))}" data-sin-traducir>▶</button>`
          : `<button type="button" class="cuadro-ver" data-ver="${esc(x.id)}" aria-label="${esc(Tp("Ver en grande"))}" data-sin-traducir>⤢</button>`}</li>`).join("");
    return `<header class="barra chica"><button type="button" class="pz-boton pz-chico" id="volver" data-sin-traducir>‹ ${esc(Tp("Volver"))}</button>
        <h1 data-sin-traducir>${esc(Tp(def[1]))}</h1><span></span></header>
      <main class="contenido grupo">
        <p class="suave">${esc(def[2])}</p>
        <div class="pz-pie izquierda"><button type="button" class="pz-boton pz-chico" id="marcar-todas">Marcar todas</button>
          <button type="button" class="pz-boton pz-chico" id="marcar-ninguna">Ninguna</button>
          ${E.items.length ? `<button type="button" class="pz-boton pz-chico" id="uno-por-uno">Uno por uno</button>` : ""}</div>
        <ul class="cuadros">${cuadros}</ul>
        ${E.items.length < E.totalGrupo ? `<div class="pz-pie"><button type="button" class="pz-boton" id="cargar-mas"${E.cargando ? " disabled" : ""}>${E.cargando ? "Cargando…" : "Ver más"}</button></div>`
          : E.cargando ? `<p class="suave" aria-busy="true">Cargando…</p>` : ""}
      </main>
      <div class="barra-borrar">${E.procesando ? `<div class="procesando"><div class="espacio" role="progressbar" aria-valuemin="0" aria-valuemax="100"
          aria-valuenow="${pctProceso()}" aria-label="${esc(Tp("Avance"))}" data-sin-traducir><span data-medida="${pctProceso()}"></span></div>
          <p data-sin-traducir>${esc(Tp("{h} de {t} · ahorrado {b}", { h: entero(E.procesando.hechos), t: entero(E.procesando.total), b: tamano(E.procesando.ahorro) }))}</p>
          <button type="button" class="pz-boton" id="parar-proceso">Detener</button></div>`
        : `<button type="button" class="pz-boton pz-principal${ahorro ? "" : " pz-peligro"}" id="${ahorro ? "procesar-grupo" : "borrar-grupo"}"${g.marcadas && !E.borrandoGrupo ? "" : " disabled"} data-sin-traducir>${esc(E.borrandoGrupo ? Tp("Borrando…")
        : !g.marcadas ? Tp(ahorro ? "Marca lo que quieras aligerar" : "Marca lo que quieras borrar")
        : ahorro ? Tp(E.grupo === "comprimir" ? "Comprimir {m} (ahorra ~{b})" : "Convertir {m} (ahorra ~{b})", { m: entero(g.marcadas), b: tamano(g.bytesMarcadas) })
        : Tp("Borrar {m} ({b})", { m: entero(g.marcadas), b: tamano(g.bytesMarcadas) }))}</button>`}</div>
      ${E.grande && !E.grande.soloUno ? ui.dialogo({ id: "t-grande", titulo: "Vista", cuerpo: E.grande.img ? `<img class="grande" src="${esc(E.grande.img)}" alt="">` : `<p class="suave" aria-busy="true">Cargando…</p>`,
        pie: '<button type="button" class="pz-boton pz-principal" data-pz-cerrar>Listo</button>' }) : ""}`;
  }
  const pctProceso = () => E.procesando && E.procesando.total ? Math.round((E.procesando.hechos / E.procesando.total) * 100) : 0;

  /** Uno por uno: una foto grande; «Borrar» o «Se queda» (también deslizando o con las flechas), y pasa a la siguiente. */
  function vistaUno(def) {
    const x = E.items[E.uno];
    const img = E.grande && E.grande.id === x.id && E.grande.img ? E.grande.img : x.img;
    const ahorro = esAhorro(E.grupo);
    return `<header class="barra chica"><button type="button" class="pz-boton pz-chico" id="uno-salir" data-sin-traducir>‹ ${esc(Tp("Cuadrícula"))}</button>
        <h1 data-sin-traducir>${esc(Tp("{i} de {t}", { i: entero(E.uno + 1), t: entero(E.totalGrupo) }))}</h1><span></span></header>
      <main class="contenido uno">
        <div class="tarjeta-uno${x.marcada ? " marcada" : ""}" id="tarjeta-uno" data-sin-traducir>
          <img src="${esc(img)}" alt="">
          ${x.guardar ? `<span class="etiqueta queda">${esc(Tp("La mejor del grupo"))}</span>` : ""}
          ${x.video ? `<button type="button" class="play" data-video="${esc(x.id)}" aria-label="${esc(Tp("Ver el video"))}">▶</button>` : ""}
          <span class="estado">${esc(Tp(x.marcada ? (ahorro ? "Se aligera" : "Se borra") : "Se queda"))} · ${esc(tamano(x.bytes))}${x.video ? " · " + esc(duracion(x.duracion)) : ""}</span>
        </div>
        <div class="botones-uno"><button type="button" class="pz-boton pz-peligro" id="uno-borrar" data-sin-traducir>← ${esc(Tp(ahorro ? "Aligerar" : "Borrar"))}</button>
          <button type="button" class="pz-boton" id="uno-quedar" data-sin-traducir>${esc(Tp("Se queda"))} →</button></div>
        <p class="nota">${ahorro ? "Desliza a la izquierda para aligerar y a la derecha para conservar." : "Desliza a la izquierda para borrar y a la derecha para conservar."}</p>
      </main>`;
  }
  function decidirUno(marcar) {
    const x = E.items[E.uno];
    if (!x) return;
    if (x.marcada !== marcar) { x.marcada = marcar; host.enviar("grupoMarcar", { grupo: E.grupo, id: x.id, marcada: marcar }); }
    E.uno += 1;
    if (E.uno >= E.items.length) {
      if (E.items.length < E.totalGrupo) { E.cargando = true; host.enviar("grupoVer", { grupo: E.grupo, desde: E.items.length }); }
      else { E.uno = null; toast("Listo: revisaste todo el grupo."); }
    }
    pedirGrande();
    pintar();
  }
  function pedirGrande() {
    const x = E.uno !== null && E.items[E.uno];
    if (x) { E.grande = { id: x.id, img: "", soloUno: true }; host.enviar("fotoGrande", { id: x.id }); }
  }
  // Deslizar en «Uno por uno»
  let inicioX = null;
  document.addEventListener("pointerdown", (ev) => { if (ev.target.closest("#tarjeta-uno")) inicioX = ev.clientX; });
  document.addEventListener("pointerup", (ev) => {
    if (inicioX === null) return;
    const d = ev.clientX - inicioX;
    inicioX = null;
    if (Math.abs(d) > 60) decidirUno(d < 0);
  });
  document.addEventListener("keydown", (ev) => {
    if (E.uno === null || ev.target.closest("input, textarea")) return;
    if (ev.key === "ArrowLeft") { ev.preventDefault(); decidirUno(true); }
    else if (ev.key === "ArrowRight") { ev.preventDefault(); decidirUno(false); }
  });

  function tarjetaOrden() {
    const c = E.contactos, k = E.calendario;
    let contactos;
    if (E.revisandoContactos) contactos = `<p class="suave" aria-busy="true">Revisando tus contactos…</p>`;
    else if (!c) contactos = `<div class="pz-pie izquierda"><button type="button" class="pz-boton" id="revisar-contactos">Revisar contactos</button></div>`;
    else if (!c.ok) contactos = `<p class="error" data-sin-traducir>${esc(Tp(c.error || "No se pudo."))}</p>`;
    else {
      const rep = c.repetidos || [], inc = c.incompletos || [];
      contactos = `<p data-sin-traducir>${esc(Tp("{n} contactos revisados.", { n: entero(c.total) }))}</p>
        ${rep.length ? `<p data-sin-traducir><b>${esc(Tp("{n} repetidos", { n: entero(rep.length) }))}</b></p>
          <ul class="lista-chica" data-sin-traducir>${rep.slice(0, 8).map((g) => `<li>${esc(g.nombres.filter(Boolean).join(" · ") || "—")}</li>`).join("")}</ul>
          ${rep.length > 8 ? `<p class="nota" data-sin-traducir>${esc(Tp("y {n} más", { n: entero(rep.length - 8) }))}</p>` : ""}
          <div class="pz-pie izquierda"><button type="button" class="pz-boton pz-principal" id="juntar-contactos">Juntar repetidos</button></div>
          <p class="nota">Queda el más completo, con todos los teléfonos y correos de los demás.</p>` : `<p class="suave">No hay contactos repetidos.</p>`}
        ${inc.length ? `<p data-sin-traducir><b>${esc(Tp("{n} sin teléfono ni correo", { n: entero(inc.length) }))}</b></p>
          <ul class="lista-chica">${inc.slice(0, 40).map((x) => `<li><label><input type="checkbox" data-incompleto="${esc(x.id)}"${E.incompletosElegidos.has(x.id) ? " checked" : ""}>
            <span data-sin-traducir>${esc(x.nombre || Tp("(sin nombre)"))}</span></label></li>`).join("")}</ul>
          <div class="pz-pie izquierda"><button type="button" class="pz-boton pz-peligro" id="borrar-incompletos"${E.incompletosElegidos.size ? "" : " disabled"} data-sin-traducir>${esc(Tp("Borrar {n}", { n: entero(E.incompletosElegidos.size) }))}</button></div>` : ""}`;
    }
    let calendario;
    if (E.revisandoCalendario) calendario = `<p class="suave" aria-busy="true">Revisando tu calendario…</p>`;
    else if (!k) calendario = `<div class="pz-pie izquierda"><button type="button" class="pz-boton" id="revisar-calendario">Revisar calendario</button></div>`;
    else if (!k.ok) calendario = `<p class="error" data-sin-traducir>${esc(Tp(k.error || "No se pudo."))}</p>`;
    else calendario = k.viejos
      ? `<p data-sin-traducir>${esc(Tp("{n} eventos de hace más de 2 años.", { n: entero(k.viejos) }))}</p>
         <div class="pz-pie izquierda"><button type="button" class="pz-boton pz-peligro" id="borrar-calendario">Borrar eventos viejos</button></div>
         <p class="nota">Ordena tu calendario; casi no libera espacio. Nunca toca calendarios suscritos ni cumpleaños.</p>`
      : `<p class="suave">No hay eventos viejos para borrar.</p>`;
    return `<section class="tarjeta" id="orden"><h2>Contactos</h2>${contactos}</section><section class="tarjeta" id="calendario"><h2>Calendario</h2>${calendario}</section>`;
  }

  const duracion = (s) => `${Math.floor((s || 0) / 60)}:${String((s || 0) % 60).padStart(2, "0")}`;

  function principal() {
    if (enIphone && E.grupo) return vistaGrupo();
    if (enIphone) {
      const titulo = Tp((TABS.find(([k]) => k === E.tab) || TABS[0])[1]);
      const cuerpo = E.tab === "respaldo" ? tarjetaEnviar() + tarjetaLiberar() : E.tab === "orden" ? tarjetaOrden() : tarjetaLimpiar();
      return barra(titulo) + `<main class="contenido con-tabs">${cuerpo}</main>` + tabbar();
    }
    return barra() + `<main class="contenido mac"><div class="columna">${tarjetaIphone()}${tarjetaPlan()}</div>
      <div class="columna">${tarjetaRecibir()}${tarjetaWhatsapp()}${tarjetaApps()}</div></main>`;
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
    else if (b.dataset.tab) { E.tab = b.dataset.tab; pintar(); window.scrollTo(0, 0); }
    else if (b.dataset.idioma) {
      E.config.idioma_ui = b.dataset.idioma;
      host.enviar("config", { idioma_ui: b.dataset.idioma });
      await cargarIdioma(b.dataset.idioma);
      pintar();
    } else if (b.id === "buscar") buscarIphone();
    else if (b.id === "revisar-apps") { E.revisandoApps = true; pintar(); host.enviar("iphoneApps"); }
    else if (b.id === "todas-apps") { E.todasLasApps = !E.todasLasApps; pintar(); }
    // Mac: plan, desinstalar, respaldo
    else if (b.id === "armar-plan") { E.armando = true; E.planError = null; pintar(); host.enviar("planArmar"); }
    else if (b.dataset.desinstalar) desinstalar(b.dataset.desinstalar);
    else if (b.id === "sugerir") sugerir();
    else if (b.id === "wa-acceso") host.enviar("abrirAccesoDisco");
    else if (b.id === "wa-buscar") { E.waBuscando = true; pintar(); host.enviar("whatsappRespaldos"); }
    else if (b.dataset.waRespaldo) { Object.assign(E, { waRespaldo: b.dataset.waRespaldo, waAnalizando: true }); pintar(); host.enviar("whatsappAnalizar", { respaldo: b.dataset.waRespaldo }); }
    else if (b.dataset.waGuardar) { E.waGuardando = Number(b.dataset.waGuardar); pintar(); host.enviar("whatsappGuardar", { respaldo: E.waRespaldo, chat: E.waGuardando }); }
    else if (b.id === "desinstalar-elegidas") desinstalarElegidas();
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
    } else if (b.dataset.video) {
      if (enIphone) { toast("Abriendo el video…"); host.enviar("verVideo", { id: b.dataset.video }); }
      else toast("Los videos se ven en el iPhone.");
    } else if (b.dataset.ver) { E.grande = { id: b.dataset.ver, img: "" }; pintar(); host.enviar("fotoGrande", { id: b.dataset.ver }); }
    else if (b.id === "marcar-todas" || b.id === "marcar-ninguna") {
      const todas = b.id === "marcar-todas";
      for (const x of E.items) x.marcada = todas && !x.guardar;
      pintar();
      host.enviar("grupoMarcar", { grupo: E.grupo, todas });
    } else if (b.id === "borrar-grupo") borrarGrupo();
    else if (b.id === "procesar-grupo") procesarGrupo();
    else if (b.id === "parar-proceso") host.enviar("procesoParar");
    else if (b.id === "uno-por-uno") { E.uno = 0; pedirGrande(); pintar(); window.scrollTo(0, 0); }
    else if (b.id === "uno-salir") { E.uno = null; E.grande = null; pintar(); }
    else if (b.id === "uno-borrar") decidirUno(true);
    else if (b.id === "uno-quedar") decidirUno(false);
    else if (b.id === "revisar-contactos") { E.revisandoContactos = true; pintar(); host.enviar("contactosAnalizar"); }
    else if (b.id === "juntar-contactos") juntarContactos();
    else if (b.id === "borrar-incompletos") borrarIncompletos();
    else if (b.id === "revisar-calendario") { E.revisandoCalendario = true; pintar(); host.enviar("calendarioAnalizar"); }
    else if (b.id === "borrar-calendario") borrarCalendario();
  });
  document.addEventListener("change", (ev) => {
    const inc = ev.target.dataset && ev.target.dataset.incompleto;
    if (inc) { if (ev.target.checked) E.incompletosElegidos.add(inc); else E.incompletosElegidos.delete(inc); return pintar(); }
    const id = ev.target.dataset && ev.target.dataset.elegir;
    if (!id) return;
    if (ev.target.checked) E.elegidas.add(id); else E.elegidas.delete(id);
    pintar();
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
  function sugerir() { if (!E.config.ia || E.sugiriendo) return; E.sugiriendo = true; pintar(); host.enviar("appsSugerir"); }
  async function desinstalarElegidas() {
    const porId = new Map(((E.apps && E.apps.apps) || []).map((x) => [x.id, x]));
    const ids = [...E.elegidas].filter((id) => porId.has(id));
    if (!ids.length) return;
    const si = await ui.confirmar({ titulo: "¿Desinstalar {n} apps?", valores: { n: entero(ids.length) }, peligro: true, si: "Desinstalar",
      texto: "Se borran del iPhone junto con lo que guardan adentro. Lo que no esté en la nube de cada app se pierde. Las puedes volver a bajar de la App Store." });
    if (!si) return;
    E.desinstalando = ids.slice();
    pintar();
    host.enviar("iphoneDesinstalar", { id: E.desinstalando[0] });   // de a una: el iPhone desinstala en orden
  }
  function abrirGrupo(k) {
    Object.assign(E, { grupo: k, items: [], totalGrupo: (E.grupos[k] || {}).n || 0, cargando: true });
    pintar();
    window.scrollTo(0, 0);
    host.enviar("grupoVer", { grupo: k, desde: 0 });
  }
  async function procesarGrupo() {
    const g = (E.grupos || {})[E.grupo] || {};
    const comprimir = E.grupo === "comprimir";
    const si = await ui.confirmar({ titulo: comprimir ? "¿Comprimir {m} videos?" : "¿Convertir {m} Live Photos en fotos?", valores: { m: entero(g.marcadas) },
      si: comprimir ? "Comprimir" : "Convertir",
      texto: "Se crea la versión liviana con la misma fecha y lugar y, cuando quedó bien, el original va a «Eliminados recientemente» (iOS pregunta). Deja Despeja abierto mientras trabaja." });
    if (!si) return;
    E.procesando = { hechos: 0, total: g.marcadas, ahorro: 0 };
    pintar();
    host.enviar("grupoProcesar", { grupo: E.grupo });
  }
  async function juntarContactos() {
    const n = ((E.contactos || {}).repetidos || []).length;
    const si = await ui.confirmar({ titulo: "¿Juntar {n} contactos repetidos?", valores: { n: entero(n) }, si: "Juntar",
      texto: "De cada grupo queda el más completo, con todos los teléfonos y correos de los demás. Los otros se borran." });
    if (si) { E.revisandoContactos = true; pintar(); host.enviar("contactosJuntar"); }
  }
  async function borrarIncompletos() {
    const ids = [...E.incompletosElegidos];
    const si = await ui.confirmar({ titulo: "¿Borrar {n} contactos?", valores: { n: entero(ids.length) }, peligro: true, si: "Borrar",
      texto: "No tienen teléfono ni correo. Se borran de tus contactos (y de iCloud si los sincronizas)." });
    if (si) { E.revisandoContactos = true; pintar(); host.enviar("contactosBorrar", { ids }); }
  }
  async function borrarCalendario() {
    const si = await ui.confirmar({ titulo: "¿Borrar {n} eventos viejos?", valores: { n: entero((E.calendario || {}).viejos) }, peligro: true, si: "Borrar",
      texto: "Eventos de hace más de dos años, solo de tus calendarios (nunca suscritos ni cumpleaños). Los que se repiten no se tocan." });
    if (si) { E.revisandoCalendario = true; pintar(); host.enviar("calendarioBorrar"); }
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
  // Comprimiste pero iOS no borró los originales (dijiste que no): quedan los dos. Se ofrece borrarlos de una; si no, quedan en
  // «Originales ya comprimidos» para cuando quieras.
  async function ofrecerOriginales() {
    const g = (E.grupos || {}).comprimidos;
    if (!g || !g.marcadas) return toast("Las versiones livianas quedaron, pero no se borraron los originales: ahora están los dos.", { error: true });
    const si = await ui.confirmar({ titulo: "Quedaron los originales", si: "Borrar originales", peligro: true,
      valores: { m: entero(g.marcadas), b: tamano(g.bytesMarcadas) },
      texto: "Ya tienes las versiones livianas, pero los {m} originales siguen en el iPhone ({b}). ¿Los borro? Si no, quedan en «Originales ya comprimidos»." });
    if (!si) return;
    E.grupo = "comprimidos";
    E.borrandoGrupo = true;
    pintar();
    host.enviar("grupoBorrar", { grupo: "comprimidos" });
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
    E.pidiendoEstado = true;
    host.enviar("iphoneEstado");
  }
  // Siempre al día: en el Mac, el estado del iPhone se vuelve a pedir cada 10 s mientras la ventana está a la vista (y al
  // volver a ella). Si lo conectas, aparece solo; si se libera espacio, la cifra cambia sola. Solo se repinta si algo cambió.
  function refrescar() {
    if (enIphone || document.hidden || E.pidiendoEstado || E.buscando || E.desinstalando.length || !E.iniciada) return;
    E.pidiendoEstado = true;
    host.enviar("iphoneEstado");
  }
  if (!enIphone) {
    setInterval(refrescar, 10000);
    document.addEventListener("visibilitychange", refrescar);
    window.addEventListener("focus", refrescar);
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
        if (!enIphone) { host.enviar("listaIA"); buscarIphone(); } else { host.enviar("respaldoEstado"); host.enviar("limpiezaEstado"); }
      }
      pintar();
    },
    iphoneEstado(r) {
      const antes = JSON.stringify([E.iphone, E.sinIphone, E.buscando]);
      const pedidoPorTi = E.buscando;
      E.buscando = false;
      E.pidiendoEstado = false;
      if (r && r.ok && r.iphone) {
        E.fallasEstado = 0;
        // Otro iPhone: lo de antes (apps, sugerencias, plan) era del anterior.
        const mismo = E.ultimoIphone && E.ultimoIphone.nombre === r.iphone.nombre && E.ultimoIphone.tipo === r.iphone.tipo;
        if (!mismo) Object.assign(E, { apps: null, sugeridas: null, plan: null, ios: null });
        else if (E.ultimoIphone.ios !== r.iphone.ios) { E.ios = null; host.enviar("iosRevisar"); }   // se actualizó
        // Cambió mucho el espacio (borraste o instalaste algo grande en el iPhone): las apps se vuelven a revisar, sin apuro.
        else if (E.apps && !E.revisandoApps && Math.abs((r.iphone.libre || 0) - (E.ultimoIphone.libre || 0)) > 1e9) { E.revisandoApps = true; host.enviar("iphoneApps"); }
        if (!E.iphone) {
          if (!E.ios) host.enviar("iosRevisar");   // una vez por iPhone: ¿hay una versión de iOS más nueva?
          // Y las apps solas (tarda unos minutos): al terminar, tu IA sugiere cuáles podrían sobrar.
          if (!E.apps && !E.revisandoApps) { E.revisandoApps = true; host.enviar("iphoneApps"); }
        }
        E.iphone = r.iphone;
        E.ultimoIphone = r.iphone;
        E.sinIphone = false;
      } else {
        // Un corte suelto del Wi-Fi no borra la pantalla: se espera a la segunda vez seguida (o a que lo pidas tú).
        E.fallasEstado = (E.fallasEstado || 0) + 1;
        if (pedidoPorTi || !E.iphone || E.fallasEstado >= 2) { E.iphone = null; E.sinIphone = r || {}; }
      }
      if (JSON.stringify([E.iphone, E.sinIphone, E.buscando]) !== antes) pintar();
    },
    whatsappRespaldos(r) {
      E.waBuscando = false;
      E.wa = r || { ok: false };
      // Un solo respaldo sin cifrar: se lee de una
      const usables = r && r.ok ? r.respaldos.filter((x) => !x.cifrado) : [];
      if (usables.length === 1 && r.respaldos.length === 1) { Object.assign(E, { waRespaldo: usables[0].id, waAnalizando: true }); host.enviar("whatsappAnalizar", { respaldo: usables[0].id }); }
      pintar();
    },
    whatsappAnalizado(r) {
      E.waAnalizando = false;
      if (r && r.ok) E.waChats = r;
      else { toast((r && r.error) || "No se pudo.", { error: true }); if (r && r.codigo === "sin_acceso") E.wa = r; }
      pintar();
    },
    whatsappGuardado(r) {
      E.waGuardando = null;
      if (r && r.ok) toast("Listo: {n} archivos guardados ({b}). Ya puedes borrarlos en WhatsApp.", { valores: { n: entero(r.copiados), b: tamano(r.bytes) } });
      else toast((r && r.error) || "No se pudo.", { error: true });
      pintar();
    },
    appsSugeridas(r) {
      E.sugiriendo = false;
      if (r && r.ok) E.sugeridas = r.apps || [];
      else toast(r && r.plantilla ? Tp(r.plantilla, r.valores || {}) : (r && r.error) || "No se pudo.", { error: true, traducido: !!(r && r.plantilla) });
      pintar();
    },
    iphoneApps(r) {
      E.revisandoApps = false;
      if (r && r.ok) { E.apps = { apps: r.apps || [], total: r.total || 0 }; if (!E.sugeridas) sugerir(); }
      else if (!E.apps) toast((r && r.error) || "No pude revisar las apps.", { error: true });   // si ya había lista, era una revisión de fondo
      pintar();
    },
    // Mac
    iosRevisado(r) { if (r && r.ok) { E.ios = r; pintar(); } },
    planListo(r) {
      E.armando = false;
      if (r && r.ok) { E.plan = r.plan; E.planError = null; }
      else E.planError = r && r.plantilla ? Tp(r.plantilla, r.valores || {}) : Tp((r && r.error) || "No pude armar el plan.");
      pintar();
    },
    appDesinstalada(r) {
      const enCola = E.desinstalando.length > 0;
      if (enCola) {
        E.desinstalando = E.desinstalando.filter((id) => id !== (r && r.id));
        if (r && r.id) E.elegidas.delete(r.id);
        if (r && r.ok && E.apps) { E.apps.apps = E.apps.apps.filter((x) => x.id !== r.id); E.apps.total = E.apps.apps.reduce((t, x) => t + x.tamano, 0); }
        if (r && !r.ok) toast((r && r.error) || "No se pudo.", { error: true });
        if (E.desinstalando.length) host.enviar("iphoneDesinstalar", { id: E.desinstalando[0] });
        else { toast("Listo: se desinstalaron las apps elegidas."); host.enviar("iphoneEstado"); }
        return pintar();
      }
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
      if (r && r.ok) { E.grupos = r.grupos || {}; E.fechaAnalisis = r.fecha || ""; }
      else toast((r && r.error) || "No se pudo.", { error: true });
      pintar();
    },
    grupoPagina(r) {
      E.cargando = false;
      if (!r || !r.ok || r.grupo !== E.grupo) return pintar();
      const ya = new Set(E.items.map((x) => x.id));
      E.items = E.items.concat((r.items || []).filter((x) => !ya.has(x.id) && (!x.img || /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(x.img))));
      E.totalGrupo = r.total || 0;
      if (E.uno !== null && E.uno >= E.items.length) E.uno = null;
      if (E.uno !== null) pedirGrande();
      pintar();
    },
    fotoGrande(r) {
      if (!E.grande || !r || r.id !== E.grande.id) return;
      E.grande.img = r.ok && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(r.img || "") ? r.img : "";
      if (!E.grande.img && !E.grande.soloUno) E.grande = null;
      pintar();
    },
    grupos(r) {
      if (!r || !r.ok) return;
      const nuevos = r.grupos || {};
      if (JSON.stringify(nuevos) === JSON.stringify(E.grupos)) return;
      E.grupos = nuevos;
      // Si la lista abierta cambió de tamaño (borraste algo en Fotos), se vuelve a pedir; si quedó vacía, se cierra.
      if (E.grupo && !E.procesando && !E.borrandoGrupo && ((nuevos[E.grupo] || {}).n || 0) !== E.totalGrupo) {
        if (!(nuevos[E.grupo] || {}).n) { E.grupo = null; E.items = []; E.uno = null; }
        else { Object.assign(E, { items: [], totalGrupo: nuevos[E.grupo].n, cargando: true, uno: null }); host.enviar("grupoVer", { grupo: E.grupo, desde: 0 }); }
      }
      pintar();
    },
    videoVisto(r) { if (!r || !r.ok) toast("No pude abrir ese video.", { error: true }); },
    procesoAvance(a) { if (E.procesando) { E.procesando = a; pintar(); } },
    procesoListo(r) {
      E.procesando = null;
      if (r && r.ok) {
        E.grupos = r.grupos || E.grupos;
        if (r.originalesQuedaron) ofrecerOriginales();
        else if (r.hechos) toast("Listo: {n} más livianos, ahorraste {b}. Los originales están en «Eliminados recientemente».", { valores: { n: entero(r.hechos), b: tamano(r.ahorro) } });
        else toast("No se pudo aligerar nada: ya estaban comprimidos o no se pudieron bajar de iCloud.");
        if (r.fallas && r.hechos) toast("{f} no se pudieron (ya estaban livianos o no se bajaron de iCloud).", { valores: { f: entero(r.fallas) } });
        E.grupo = null; E.items = [];
      } else toast((r && r.error) || "No se pudo.", { error: true });
      pintar();
    },
    contactosAnalizados(r) { E.revisandoContactos = false; E.contactos = r; E.incompletosElegidos = new Set(); pintar(); },
    contactosJuntados(r) {
      E.revisandoContactos = false;
      if (r && r.ok) { toast("Listo: juntaste {n} contactos repetidos.", { valores: { n: entero(r.juntados) } }); E.contactos = null; }
      pintar();
    },
    contactosBorrados(r) {
      E.revisandoContactos = false;
      if (r && r.ok) { toast("Se borraron {n} contactos.", { valores: { n: entero(r.borrados) } }); E.contactos = null; }
      pintar();
    },
    calendarioAnalizado(r) { E.revisandoCalendario = false; E.calendario = r; pintar(); },
    calendarioBorrado(r) {
      E.revisandoCalendario = false;
      if (r && r.ok) { toast("Se borraron {n} eventos.", { valores: { n: entero(r.borrados) } }); E.calendario = { ok: true, viejos: 0 }; }
      else toast((r && r.error) || "No se pudo.", { error: true });
      pintar();
    },
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
    respaldoEstado(r) {
      if (JSON.stringify(r || null) === JSON.stringify(E.resumen || null)) return;
      E.resumen = r || null;
      pintar();
    },
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
      case "whatsappRespaldos": return c.luego(300, () => c.responder("whatsappRespaldos", { ok: true, respaldos: [{ id: "00008101-000A1B2C3D4E5F60", nombre: "iPhone de Ana", fecha: "2026-11-05T22:10:00Z", cifrado: false }] }));
      case "whatsappAnalizar": return c.luego(500, () => c.responder("whatsappAnalizado", DEMO.whatsapp));
      case "whatsappGuardar": return c.luego(600, () => c.responder("whatsappGuardado", { ok: true, chat: d.chat, copiados: 412, bytes: 1.3e9 }));
      case "abrirAccesoDisco": return;
      case "appsSugerir": return c.luego(500, () => c.responder("appsSugeridas", { ok: true, apps: DEMO.sugeridas }));
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
      // ?analizado: como el iPhone, que recuerda el último análisis.
      case "limpiezaEstado": return new URLSearchParams(location.search).has("analizado") ? c.luego(100, () => c.responder("analisisListo", { ok: true, grupos: DEMO.grupos })) : undefined;
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
      case "verVideo": return c.luego(200, () => c.responder("videoVisto", { ok: true, id: d.id }));
      case "fotoGrande": return c.luego(200, () => c.responder("fotoGrande", { ok: true, id: d.id, img: DEMO.foto }));
      case "grupoProcesar": {
        const g = DEMO.grupos[d.grupo], n = g.marcadas, b = g.bytesMarcadas;
        c.luego(200, () => c.responder("procesoAvance", { hechos: Math.ceil(n / 2), total: n, ahorro: b / 2 }));
        const hechas = (DEMO.items[d.grupo] || []).filter((x) => x.marcada);
        DEMO.items[d.grupo] = (DEMO.items[d.grupo] || []).filter((x) => !x.marcada);
        Object.assign(g, { n: g.n - n, bytes: g.bytes - b, marcadas: 0, bytesMarcadas: 0 });
        // ?dice-no: como si en iOS dijeras «No permitir» al borrar los originales (quedan en «Originales ya comprimidos»).
        if (new URLSearchParams(location.search).has("dice-no")) {
          DEMO.items.comprimidos = (DEMO.items.comprimidos || []).concat(hechas.map((x) => ({ ...x, id: "q" + x.id, marcada: true })));
          const m = DEMO.items.comprimidos;
          DEMO.grupos.comprimidos = { n: m.length, bytes: m.reduce((t, x) => t + x.bytes, 0), marcadas: m.length, bytesMarcadas: m.reduce((t, x) => t + x.bytes, 0), guardadas: 0 };
          return c.luego(700, () => c.responder("procesoListo", { ok: true, hechos: n, ahorro: 0, fallas: 0, originalesQuedaron: true, grupo: d.grupo, grupos: DEMO.grupos }));
        }
        return c.luego(700, () => c.responder("procesoListo", { ok: true, hechos: n, ahorro: b, fallas: 0, grupo: d.grupo, grupos: DEMO.grupos }));
      }
      case "procesoParar": return;
      case "contactosAnalizar": return c.luego(300, () => c.responder("contactosAnalizados", DEMO.contactos));
      case "contactosJuntar": return c.luego(300, () => c.responder("contactosJuntados", { ok: true, juntados: DEMO.contactos.repetidos.length }));
      case "contactosBorrar": return c.luego(300, () => c.responder("contactosBorrados", { ok: true, borrados: d.ids.length }));
      case "calendarioAnalizar": return c.luego(300, () => c.responder("calendarioAnalizado", { ok: true, viejos: 214 }));
      case "calendarioBorrar": return c.luego(300, () => c.responder("calendarioBorrado", { ok: true, borrados: 214 }));
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
