// La interfaz de Despeja en un navegador de verdad (Chromium con Playwright), servida con la misma CSP que la app y con los
// datos ficticios de ui/demo.json. Revisa: sin errores de JavaScript ni violaciones de la CSP; el primer uso parte por el idioma,
// solo en la pantalla; después, todo traducido al inglés (ningún texto sin traducir); el ejemplo de punta a punta; Ajustes; y
// nada se sale a 390 px. Con CAPTURAS=<carpeta> guarda capturas para mirarlas a ojo (en GitHub quedan como artefacto).
//   PLAYWRIGHT=/ruta/a/node_modules/playwright node pruebas/interfaz.mjs
// Lo propio de Despeja: el iPhone en el Mac, el plan, recibir el respaldo, y en el iPhone (?iphone) mandar y borrar.
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const UI = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), "ui");
const CAPTURAS = process.env.CAPTURAS || "";
const APP = "Despeja";

const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'";
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };
const servidor = http.createServer((q, r) => {
  const ruta = path.normalize(path.join(UI, decodeURIComponent(new URL(q.url, "http://x").pathname).replace(/^\/+/, "") || "index.html"));
  if (!ruta.startsWith(UI + path.sep) || !fs.existsSync(ruta) || fs.statSync(ruta).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "Content-Type": TIPOS[path.extname(ruta)] || "application/octet-stream", "Content-Security-Policy": CSP });
  fs.createReadStream(ruta).pipe(r);
});
await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
const BASE = `http://127.0.0.1:${servidor.address().port}/index.html`;

const navegador = await chromium.launch();
const errores = [];
async function abrir(consulta, ancho = 1280) {
  const page = await navegador.newPage({ viewport: { width: ancho, height: 800 } });
  page.on("pageerror", (e) => errores.push(`${consulta}: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errores.push(`${consulta}: ${m.text()}`); });
  await page.addInitScript(() => document.addEventListener("securitypolicyviolation", (e) => console.error(`CSP: ${e.violatedDirective}`)));
  await page.goto(BASE + consulta);
  return page;
}
const capturar = async (page, nombre) => { if (CAPTURAS) { await page.waitForTimeout(400); fs.mkdirSync(CAPTURAS, { recursive: true }); await page.screenshot({ path: path.join(CAPTURAS, `${nombre}.png`) }); } };
const faltantes = (page) => page.evaluate((app) => [...window[app]._pruebas.faltantes], APP);
const sinDesborde = async (page, donde) => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${donde}: se sale a lo ancho`);

// 1. Primer uso: el idioma va primero y solo (nada de la app detrás).
let page = await abrir("?bienvenida");
await page.waitForSelector(".opciones-idioma");
assert.equal(await page.locator(".barra").count(), 0, "detrás del idioma no se pinta la app");
await capturar(page, "1-idioma");
await page.click('[data-bv-idioma="en"]');
await page.waitForSelector(".pieza-bv:not(.pieza-bv-idioma)");
await capturar(page, "2-bienvenida-en");
for (let i = 0; i < 10 && await page.locator(".pieza-bv [data-bv-ir].pz-principal").count(); i++) {
  await page.click(".pieza-bv [data-bv-ir].pz-principal");
}
await page.click(".pieza-bv [data-bv-fin]:not([data-bv-fin=despues])");
await page.waitForSelector("#iphone");

// 2. El iPhone y sus apps de punta a punta (en la vista previa responde simular(), como lo haría la app).
assert.match(await page.textContent("#iphone"), /1\.9 GB\s+free of 64 GB/);
assert.match(await page.textContent("#iphone"), /running low on space/);
await page.click("#revisar-apps");
await page.waitForSelector("#apps .apps li");
assert.equal(await page.locator("#apps .apps li").count(), 10);
await page.click("#todas-apps");
assert.equal(await page.locator("#apps .apps li").count(), 12);
await capturar(page, "3-principal-en");
// Lo que tu IA cree que podría sobrar: elegir dos y desinstalarlas de una vez.
await page.waitForSelector(".sugeridas [data-elegir]");
await page.check('[data-elegir="com.ejemplo.taxi"]');
await page.check('[data-elegir="com.ejemplo.tienda"]');
await page.waitForSelector("#desinstalar-elegidas:has-text('Uninstall 2')");
await capturar(page, "3a-sugeridas-en");
await page.click("#desinstalar-elegidas");
await page.click('[data-pz-confirmar="si"]');
await page.waitForFunction(() => !document.querySelector('[data-elegir="com.ejemplo.taxi"]') && !document.querySelector('[data-elegir="com.ejemplo.tienda"]'));
// El aviso de iOS, el plan de la IA y desinstalar (con confirmación).
await page.waitForSelector("#ios-nuevo");
await page.click("#armar-plan");
await page.waitForSelector("#plan .plan li");
assert.equal(await page.locator("#plan .plan li").count(), 4);
await page.click('#plan [data-desinstalar="com.ejemplo.fotos"]');
await page.waitForSelector("[role=alertdialog]");
await page.click('[data-pz-confirmar="si"]');
await page.waitForFunction(() => !document.querySelector('#plan [data-desinstalar="com.ejemplo.fotos"]'));
// Recibir del iPhone: carpeta, código, avance y detener.
await page.click("#elegir-destino");
await page.click("#recibir");
await page.waitForSelector(".codigo");
assert.equal((await page.textContent(".codigo")).trim(), "K7P4-M2QX");
await capturar(page, "3b-codigo-en");
await page.waitForSelector("text=128 files received and verified");
await page.click("#detener-recibir");
await page.waitForSelector("#recibir-tarjeta .hecho");
await capturar(page, "3c-plan-respaldo-en");
// WhatsApp desde el respaldo del Finder: buscar, leer (un solo respaldo: sola) y guardar un chat.
await page.click("#wa-buscar");
await page.waitForSelector("#whatsapp [data-wa-guardar]");
await page.click('#whatsapp [data-wa-guardar="12"]');
await page.waitForSelector('#whatsapp [data-wa-guardar="12"]:not([disabled])');
await capturar(page, "3d-whatsapp-en");
await page.click("#abrir-ajustes");
await page.waitForSelector("[role=dialog]");
await capturar(page, "4-ajustes-en");
assert.deepEqual(await faltantes(page), [], "textos sin traducir al inglés (súmalos a ui/idiomas/en.json)");

// 3. En español, sin la bienvenida (ya hecha en demo.json), y a lo ancho de un celular.
page = await abrir("?idioma=es", 390);
await page.waitForSelector("#iphone");
await sinDesborde(page, "inicio a 390 px");
await page.click("#abrir-ajustes");
await page.waitForSelector("[role=dialog]");
await sinDesborde(page, "Ajustes a 390 px");
await capturar(page, "5-ajustes-390");

// 4. Sin iPhone: dice cómo conectarlo y deja buscar de nuevo.
page = await abrir("?idioma=es&sin-iphone");
await page.waitForSelector("#sin-iphone #buscar");
await capturar(page, "6-sin-iphone");

// 5. La pantalla del iPhone (?iphone): buscar el Mac, código (uno malo y el bueno), respaldar, borrar; y fotos y videos.
page = await abrir("?idioma=en&iphone", 375);
// Analizar: grupos con lo propuesto, abrir uno, desmarcar, ver en grande y borrar lo marcado.
await page.click("#analizar");
await page.waitForSelector("#limpiar .grupos li");
await capturar(page, "6a-iphone-grupos-en");
await page.click('[data-grupo="capturas"]');
await page.waitForSelector(".cuadros li");
assert.equal(await page.locator(".cuadros li.marcada").count(), 14);
await page.click('[data-marcar="c0"]');
assert.equal(await page.locator(".cuadros li.marcada").count(), 13);
await page.waitForSelector("#borrar-grupo:has-text('Delete 13')");
await page.click('[data-ver="c1"]');
await page.waitForSelector("img.grande");
await capturar(page, "6b-iphone-grande-en");
await page.click("[data-pz-cerrar]");
await sinDesborde(page, "grupo a 390 px");
await capturar(page, "6c-iphone-grupo-en");
await page.click("#borrar-grupo");
await page.click('[data-pz-confirmar="si"]');
await page.waitForSelector("#limpiar .grupos");
assert.equal(await page.locator('[data-grupo="capturas"]').count(), 1);   // queda la que se desmarcó
await page.click('[data-grupo="repetidas"]');
await page.waitForSelector(".cuadros li.guardar");
assert.equal(await page.locator(".cuadros li.guardar.marcada").count(), 0, "lo que se queda nunca va marcado");
await page.click("#volver");
// Uno por uno en «parecidas»: deslizar con las flechas.
await page.click('[data-grupo="parecidas"]');
await page.waitForSelector("#uno-por-uno");
await page.click("#uno-por-uno");
await page.waitForSelector("#tarjeta-uno");
await page.keyboard.press("ArrowRight");
await page.waitForSelector("h1:has-text('2 of 5')");
await capturar(page, "6d-iphone-uno-en");
await page.click("#uno-salir");
await page.click("#volver");
// Ahorrar sin borrar: comprimir videos.
await page.click('[data-grupo="comprimir"]');
await page.waitForSelector("#procesar-grupo:not([disabled])");
await page.waitForSelector(".cuadros li");
assert.equal(await page.locator(".cuadros [data-video]").count(), 3, "cada video se puede ver");
await page.click('.cuadros [data-video="k1"]');
await page.click("#procesar-grupo");
await page.click('[data-pz-confirmar="si"]');
await page.waitForSelector("#limpiar .grupos");
// Contactos y calendario (pestaña «Orden»).
await page.click('[data-tab="orden"]');
await page.click("#revisar-contactos");
await page.waitForSelector("#juntar-contactos");
await page.check("[data-incompleto]");
await page.waitForSelector("#borrar-incompletos:not([disabled])");
await page.click("#revisar-calendario");
await page.waitForSelector("#borrar-calendario");
await sinDesborde(page, "contactos y calendario a 390 px");
await capturar(page, "6e-iphone-orden-en");
await page.click('[data-tab="respaldo"]');
await page.click("#buscar-mac");
await page.click("[data-mac]");
await page.fill("#codigo", "aaaa1111");
await page.click("#conectar");
await page.waitForSelector("#enviar .error");
await page.fill("#codigo", "k7p4m2qx");
assert.equal(await page.inputValue("#codigo"), "K7P4-M2QX");
await page.click("#conectar");
await page.click("#respaldar");
await page.waitForSelector("#liberar #borrar-respaldadas");
await capturar(page, "7a-iphone-respaldado-en");
await page.click("#borrar-respaldadas");
await page.click('[data-pz-confirmar="si"]');
await page.waitForSelector("#liberar .hecho");
await capturar(page, "7b-iphone-borrado-en");
await sinDesborde(page, "iPhone a 390 px");
assert.deepEqual(await faltantes(page), [], "textos sin traducir en la pantalla del iPhone");

await navegador.close();
servidor.close();
assert.deepEqual(errores, [], "errores de JavaScript o de la CSP");
console.log("Interfaz: todo bien");
