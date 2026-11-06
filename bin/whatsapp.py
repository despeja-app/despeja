#!/usr/bin/env python3
"""whatsapp — qué chats de WhatsApp ocupan más en el iPhone y guardar sus fotos y videos en el Mac, desde el respaldo local que
hace el Finder. Solo biblioteca estándar; solo lee el respaldo (nunca lo cambia) y nada sale del Mac.

  whatsapp.py respaldos <salida.json>                               → {ok, respaldos: [{id, nombre, fecha, cifrado}]}
  whatsapp.py analizar <entrada {respaldo}> <salida.json>          → {ok, chats: [{id, nombre, bytes, fotos, videos, audios, documentos, otros}], total}
  whatsapp.py guardar <entrada {respaldo, chat, destino}> <salida>  → {ok, copiados, bytes, carpeta}

Por qué así: iOS no deja que otra app lea WhatsApp. El respaldo local del Finder sí trae su base de datos (ChatStorage.sqlite) y
sus archivos. Un respaldo cifrado no se puede leer sin la contraseña: se dice. Para leer los respaldos, macOS pide «Acceso total
al disco» para Despeja. Los nombres de los chats se muestran solo aquí: nunca van a la IA.
"""
import datetime
import os
import plistlib
import re
import shutil
import sqlite3
import tempfile

import nucleo

DOMINIO = "AppDomainGroup-group.net.whatsapp.WhatsApp.shared"
TIPOS = {1: "fotos", 2: "videos", 3: "audios", 8: "documentos"}


def carpeta_respaldos():
    return os.environ.get("DESPEJA_RESPALDOS_IPHONE") or os.path.expanduser("~/Library/Application Support/MobileSync/Backup")


def _sin_acceso():
    return {"ok": False, "codigo": "sin_acceso", "error": "macOS no deja leer los respaldos del iPhone: dale a Despeja «Acceso total al disco»."}


def respaldos(_d):
    base = carpeta_respaldos()
    try:
        nombres = os.listdir(base)
    except PermissionError:
        return _sin_acceso()
    except FileNotFoundError:
        return {"ok": True, "respaldos": []}
    salida = []
    for n in nombres:
        ruta = os.path.join(base, n)
        if not re.fullmatch(r"[0-9A-Fa-f-]{24,40}", n) or not os.path.isfile(os.path.join(ruta, "Manifest.db")):
            continue
        try:
            with open(os.path.join(ruta, "Info.plist"), "rb") as f:
                info = plistlib.load(f)
            with open(os.path.join(ruta, "Manifest.plist"), "rb") as f:
                manifiesto = plistlib.load(f)
        except (OSError, plistlib.InvalidFileException):
            continue
        fecha = info.get("Last Backup Date")
        salida.append({"id": n, "nombre": str(info.get("Device Name") or "iPhone")[:80],
                       "fecha": fecha.isoformat() if isinstance(fecha, datetime.datetime) else "",
                       "cifrado": bool(manifiesto.get("IsEncrypted"))})
    salida.sort(key=lambda x: x["fecha"], reverse=True)
    return {"ok": True, "respaldos": salida}


def _respaldo(d):
    n = d.get("respaldo")
    if not isinstance(n, str) or not re.fullmatch(r"[0-9A-Fa-f-]{24,40}", n):
        raise ValueError("respaldo")
    ruta = os.path.join(carpeta_respaldos(), n)
    with open(os.path.join(ruta, "Manifest.plist"), "rb") as f:
        if plistlib.load(f).get("IsEncrypted"):
            raise PermissionError("cifrado")
    return ruta


def _manifiesto(ruta):
    return sqlite3.connect(f"file:{os.path.join(ruta, 'Manifest.db')}?mode=ro&immutable=1", uri=True)


def _archivo(ruta, file_id):
    return os.path.join(ruta, file_id[:2], file_id)


def _chats(ruta, tmp):
    """(sesiones, medios): los chats y cada archivo con su chat, tipo, ruta en el respaldo y fecha."""
    con = _manifiesto(ruta)
    try:
        fila = con.execute("SELECT fileID FROM Files WHERE domain = ? AND relativePath = 'ChatStorage.sqlite'", (DOMINIO,)).fetchone()
        if not fila:
            return None, None
        copia = os.path.join(tmp, "ChatStorage.sqlite")
        shutil.copyfile(_archivo(ruta, fila[0]), copia)
        por_ruta = {r: f for f, r in con.execute(
            "SELECT fileID, relativePath FROM Files WHERE domain = ? AND relativePath LIKE 'Message/Media/%'", (DOMINIO,))}
    finally:
        con.close()
    db = sqlite3.connect(f"file:{copia}?mode=ro", uri=True)
    try:
        sesiones = {pk: (nombre or jid or "") for pk, nombre, jid in db.execute("SELECT Z_PK, ZPARTNERNAME, ZCONTACTJID FROM ZWACHATSESSION")}
        medios = []
        for chat, tipo, local, tam, fecha in db.execute(
                "SELECT m.ZCHATSESSION, m.ZMESSAGETYPE, mi.ZMEDIALOCALPATH, mi.ZFILESIZE, m.ZMESSAGEDATE FROM ZWAMEDIAITEM mi "
                "JOIN ZWAMESSAGE m ON m.Z_PK = mi.ZMESSAGE WHERE mi.ZMEDIALOCALPATH IS NOT NULL"):
            file_id = por_ruta.get("Message/" + local.lstrip("/")) if local else None
            if not file_id:
                continue
            archivo = _archivo(ruta, file_id)
            try:
                tam = os.path.getsize(archivo)
            except OSError:
                continue
            medios.append({"chat": chat, "tipo": TIPOS.get(tipo, "otros"), "archivo": archivo, "nombre": os.path.basename(local),
                           "bytes": tam, "fecha": fecha})
        return sesiones, medios
    finally:
        db.close()


def _con_respaldo(f):
    def envuelta(d):
        try:
            ruta = _respaldo(d)
        except PermissionError as e:
            if str(e) == "cifrado":
                return {"ok": False, "codigo": "cifrado", "error": "Ese respaldo está cifrado. Haz uno sin cifrar en el Finder (desmarca «Cifrar respaldo local») o elige otro."}
            return _sin_acceso()
        except (OSError, ValueError, plistlib.InvalidFileException):
            return {"ok": False, "codigo": "respaldo", "error": "No encontré ese respaldo."}
        with tempfile.TemporaryDirectory() as tmp:
            try:
                sesiones, medios = _chats(ruta, tmp)
            except PermissionError:
                return _sin_acceso()
            except (sqlite3.Error, OSError):
                return {"ok": False, "codigo": "formato", "error": "No pude leer WhatsApp en ese respaldo."}
            if sesiones is None:
                return {"ok": False, "codigo": "sin_whatsapp", "error": "Ese respaldo no trae WhatsApp."}
            return f(d, ruta, sesiones, medios)
    return envuelta


@_con_respaldo
def analizar(_d, _ruta, sesiones, medios):
    chats = {}
    for m in medios:
        c = chats.setdefault(m["chat"], {"id": m["chat"], "nombre": sesiones.get(m["chat"], "")[:80], "bytes": 0,
                                         "fotos": 0, "videos": 0, "audios": 0, "documentos": 0, "otros": 0})
        c["bytes"] += m["bytes"]
        c[m["tipo"]] += 1
    lista = sorted(chats.values(), key=lambda c: c["bytes"], reverse=True)
    return {"ok": True, "chats": lista[:60], "total": sum(c["bytes"] for c in lista), "n_chats": len(lista)}


EPOCA_APPLE = datetime.datetime(2001, 1, 1, tzinfo=datetime.timezone.utc)


@_con_respaldo
def guardar(d, _ruta, sesiones, medios):
    destino = d.get("destino")
    chat = d.get("chat")
    if not isinstance(destino, str) or not os.path.isdir(destino) or not isinstance(chat, int) or chat not in sesiones:
        return {"ok": False, "codigo": "datos", "error": "Elige dónde guardar los respaldos."}
    nombre = re.sub(r"[^\w .-]", "_", sesiones[chat] or "chat").strip(". ")[:60] or "chat"
    base = os.path.realpath(os.path.join(destino, "WhatsApp", nombre))
    if not base.startswith(os.path.realpath(destino) + os.sep):
        return {"ok": False, "codigo": "datos", "error": "Elige dónde guardar los respaldos."}
    copiados = bytes_ = 0
    for m in (x for x in medios if x["chat"] == chat):
        try:
            f = EPOCA_APPLE + datetime.timedelta(seconds=float(m["fecha"] or 0))
            sub = f"{f.year:04d}-{f.month:02d}"
        except (TypeError, ValueError, OverflowError):
            sub = "sin-fecha"
        carpeta = os.path.join(base, sub)
        os.makedirs(carpeta, exist_ok=True)
        n = re.sub(r"[^\w .-]", "_", m["nombre"])[:120] or "archivo"
        dst = os.path.join(carpeta, n)
        if os.path.exists(dst) and os.path.getsize(dst) == m["bytes"]:
            continue   # ya estaba: no se copia dos veces
        shutil.copyfile(m["archivo"], dst)
        copiados += 1
        bytes_ += m["bytes"]
    return {"ok": True, "copiados": copiados, "bytes": bytes_, "carpeta": base}


if __name__ == "__main__":
    nucleo.script({"respaldos": respaldos, "analizar": analizar, "guardar": guardar}, __doc__)
