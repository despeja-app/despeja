#!/usr/bin/env python3
"""plan — el catastro del iPhone y el plan que propone la IA de la persona (pieza «ia», con su cuenta). Solo biblioteca estándar.

  plan.py ios <salida.json>                        → {ok, actual, ultima, hay}: ¿hay una versión de iOS más nueva para este iPhone?
  plan.py armar <entrada {idioma}> <salida.json>   → {ok, plan: {resumen, pasos: [...]}, catastro}
  plan.py sugerir <entrada {idioma}> <salida.json> → {ok, apps: [{id, motivo}]}: las que la IA cree que podrían sobrar

El catastro sale de lo que ya se revisó (catastro.json: espacio, apps) y de lo respaldado (respaldo/indice.json). A la IA va solo
eso: tamaños y nombres de apps, nunca fotos, nombres de archivos ni nada del contenido. Su respuesta se valida antes de mostrarse:
solo pasos de los tipos conocidos, con textos cortos, y una app solo si está en la lista revisada. Nada se hace solo: cada paso
tiene su botón y lo decide la persona.
"""
import json
import os
import re

import ia
import iphone
import nucleo
import red

TIPOS = ("respaldar_fotos", "borrar_respaldadas", "desinstalar_app", "whatsapp", "eliminados_recientemente", "actualizar_ios", "otro")
IPSW = red.Red(["api.ipsw.me"], "ipsw.me")


def version_tupla(v):
    return tuple(int(x) for x in re.findall(r"\d+", str(v))[:3]) or (0,)


def ultima_ios(tipo):
    """La versión de iOS más nueva que Apple firma hoy para este modelo (api.ipsw.me, pública)."""
    if not re.fullmatch(r"iPhone\d{1,2},\d{1,2}", str(tipo or "")):
        return None
    d = IPSW.get(f"https://api.ipsw.me/v4/device/{tipo}?type=ipsw")
    firmadas = [f.get("version") for f in (d or {}).get("firmwares", []) if isinstance(f, dict) and f.get("signed")]
    return max(firmadas, key=version_tupla) if firmadas else None


def ios(_d):
    e = iphone.estado(None)
    if not e.get("ok"):
        return e
    actual = e["iphone"]["ios"]
    try:
        ultima = ultima_ios(e["iphone"]["tipo"])
    except red.ErrorRed as err:
        return {"ok": False, "codigo": "red", "error": str(err), "actual": actual}
    hay = bool(ultima and version_tupla(ultima) > version_tupla(actual))
    iphone.guardar_catastro({"ios_actual": actual, "ios_ultima": ultima})
    return {"ok": True, "actual": actual, "ultima": ultima, "hay": hay}


def respaldado():
    try:
        with open(os.path.join(nucleo.carpeta_datos(), "respaldo", "indice.json"), encoding="utf-8") as f:
            ind = json.load(f)
    except (OSError, ValueError):
        return {"archivos": 0, "bytes": 0}
    vivos = [x for x in ind.values() if isinstance(x, dict) and os.path.isfile(x.get("ruta", ""))]
    return {"archivos": len(vivos), "bytes": sum(int(x.get("bytes") or 0) for x in vivos)}


def catastro():
    c = iphone.leer_catastro()
    e = iphone.estado(None)
    gb = lambda b: round((b or 0) / 1e9, 2)
    salida = {"apps": [{"id": a["id"], "nombre": a["nombre"], "gb": gb(a["tamano"])} for a in c.get("apps", [])[:60]],
              "apps_revisadas": c.get("apps_revisadas"), "respaldado_gb": gb(respaldado()["bytes"]),
              "ios_actual": c.get("ios_actual"), "ios_ultima": c.get("ios_ultima"),
              # Lo que el análisis del iPhone encontró (solo cuántas y cuántos GB por grupo); lo manda la app del iPhone al conectarse.
              "fotos_analizadas": {k: {"n": v.get("n", 0), "gb": gb(v.get("bytes")), "gb_marcado": gb(v.get("bytesMarcadas"))}
                                   for k, v in (c.get("fotos") or {}).items()}}
    if e.get("ok"):
        p = e["iphone"]
        salida.update({"capacidad_gb": gb(p["capacidad"]), "libre_gb": gb(p["libre"]), "ios_actual": p["ios"]})
    return salida


PEDIDO = """Eres el asistente de Despeja, una app que ayuda a dejar un iPhone solo con lo necesario.
Responde SOLO con un JSON (sin texto antes ni después, sin ```), en {idioma}, con esta forma exacta:
{{"resumen": "<una o dos frases: cómo está el iPhone y qué es lo más urgente>",
 "pasos": [{{"tipo": "<uno de: {tipos}>", "titulo": "<corto, en imperativo>", "detalle": "<una o dos frases: por qué y qué ganar>",
            "libera_gb": <número o null>, "app_id": "<solo si tipo es desinstalar_app: el id exacto de la lista>"}}]}}
Reglas:
- Máximo 6 pasos, ordenados del que más ayuda al que menos.
- Sé concreto y honesto: no inventes cifras que no salgan de los datos; si no sabes cuánto libera algo, pon null.
- desinstalar_app solo para apps grandes que probablemente no son esenciales (nunca bancos, salud, autenticación ni mensajería
  principal), y dilo como sugerencia: la persona decide. Recuerda que desinstalar borra los datos de esa app en el iPhone.
- Si hay menos de 10% libre, lo primero es liberar espacio. Si hay una versión de iOS más nueva, di cuánto espacio libre conviene
  tener para instalarla (unos 6 GB) y el paso actualizar_ios.
- fotos_analizadas (si viene) es lo que encontró el análisis en el iPhone: repetidas, parecidas, capturas, ráfagas,
  videosRepetidos, borrosas, utiles (memes y documentos), videos (grandes), comprimir (gb = ahorro estimado comprimiendo) y live
  (gb = ahorro quitando el video de las Live Photos). Úsalo para decir cuánto libera cada paso. El tipo de esos pasos es «otro» y
  el título dice qué grupo revisar en la pestaña Limpiar de Despeja en el iPhone.
- respaldar_fotos y borrar_respaldadas se hacen con la app de Despeja en el iPhone; whatsapp y eliminados_recientemente son pasos
  que la persona hace en su iPhone (Despeja la guía).
Datos del iPhone (JSON):
{datos}"""


def validar(texto, apps_ids):
    m = re.search(r"\{.*\}", texto or "", re.S)
    if not m:
        return None
    try:
        d = json.loads(m.group(0))
    except ValueError:
        return None
    if not isinstance(d, dict) or not isinstance(d.get("pasos"), list):
        return None
    corto = lambda v, n: v.strip()[:n] if isinstance(v, str) and v.strip() else None
    pasos = []
    for x in d["pasos"][:6]:
        if not isinstance(x, dict) or x.get("tipo") not in TIPOS or not corto(x.get("titulo"), 120):
            continue
        p = {"tipo": x["tipo"], "titulo": corto(x["titulo"], 120), "detalle": corto(x.get("detalle"), 400) or ""}
        g = x.get("libera_gb")
        p["libera_gb"] = round(float(g), 1) if isinstance(g, (int, float)) and not isinstance(g, bool) and 0 < g < 2000 else None
        if p["tipo"] == "desinstalar_app":
            if x.get("app_id") not in apps_ids:
                continue
            p["app_id"] = x["app_id"]
        pasos.append(p)
    resumen = corto(d.get("resumen"), 400)
    return {"resumen": resumen or "", "pasos": pasos} if pasos or resumen else None


def armar(d):
    c = catastro()
    if "libre_gb" not in c:
        return {"ok": False, "codigo": "sin_iphone", "error": "Conecta tu iPhone para armar el plan.", "catastro": c}
    idioma = "inglés" if d.get("idioma") == "en" else "español de Chile neutro"
    pedido = PEDIDO.format(idioma=idioma, tipos=", ".join(TIPOS), datos=json.dumps(c, ensure_ascii=False))
    texto, error = ia.preguntar(pedido, timeout=300)
    if error:
        return {"ok": False, "codigo": error.get("codigo"), "error": ia.frase(error), "plantilla": error.get("plantilla"),
                "valores": error.get("valores"), "catastro": c}
    plan = validar(texto, {a["id"] for a in c["apps"]})
    if not plan:
        return {"ok": False, "codigo": "respuesta", "error": "La IA respondió algo que no pude usar. Intenta de nuevo.", "catastro": c}
    iphone.guardar_catastro({"plan": plan})
    return {"ok": True, "plan": plan, "catastro": c}


SUGERIR = """Eres el asistente de Despeja. iOS no informa cuánto se usa cada app, así que no lo sabes: solo puedes juzgar por
el tipo de app y su tamaño. De esta lista de apps instaladas en un iPhone con poco espacio, elige las que MUY probablemente no son
necesarias para la mayoría de las personas o tienen alternativa en el navegador (máximo 8). Nunca sugieras: bancos, billeteras,
pagos, salud, autenticación o claves, mensajería principal (WhatsApp, Mensajes), trabajo, ni apps del sistema.
Responde SOLO con un JSON (sin texto antes ni después, sin ```), en {idioma}:
{{"apps": [{{"app_id": "<id exacto de la lista>", "motivo": "<una frase corta: por qué podría sobrar>"}}]}}
Apps (id, nombre, GB):
{datos}"""


def sugerir(d):
    apps = iphone.leer_catastro().get("apps", [])
    if not apps:
        return {"ok": False, "codigo": "sin_apps", "error": "Revisa las apps primero."}
    idioma = "inglés" if d.get("idioma") == "en" else "español de Chile neutro"
    lista = [{"id": a["id"], "nombre": a["nombre"], "gb": round(a["tamano"] / 1e9, 2)} for a in apps[:80]]
    texto, error = ia.preguntar(SUGERIR.format(idioma=idioma, datos=json.dumps(lista, ensure_ascii=False)), timeout=240)
    if error:
        return {"ok": False, "codigo": error.get("codigo"), "error": ia.frase(error), "plantilla": error.get("plantilla"), "valores": error.get("valores")}
    m = re.search(r"\{.*\}", texto or "", re.S)
    try:
        r = json.loads(m.group(0)) if m else {}
    except ValueError:
        r = {}
    ids = {a["id"] for a in lista}
    salida, vistos = [], set()
    for x in (r.get("apps") if isinstance(r, dict) and isinstance(r.get("apps"), list) else [])[:8]:
        if isinstance(x, dict) and x.get("app_id") in ids and x["app_id"] not in vistos and isinstance(x.get("motivo"), str):
            vistos.add(x["app_id"])
            salida.append({"id": x["app_id"], "motivo": x["motivo"].strip()[:200]})
    iphone.guardar_catastro({"sugeridas": salida})
    return {"ok": True, "apps": salida}


if __name__ == "__main__":
    nucleo.script({"ios": ios, "armar": armar, "sugerir": sugerir}, __doc__)
