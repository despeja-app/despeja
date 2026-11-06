#!/usr/bin/env python3
"""iphone — Despeja habla con el iPhone desde el Mac, solo con la biblioteca estándar (sin pymobiledevice3 ni permisos de
administrador). El mismo canal que usa el Finder: usbmuxd (USB o Wi-Fi) → lockdownd con TLS y el registro de emparejamiento.

  iphone.py estado <salida.json>   → {ok, iphone: {nombre, tipo, ios, build, conexion, capacidad, libre}} o {ok: false, codigo}
  iphone.py apps <salida.json>     → {ok, apps: [{id, nombre, version, tamano}], total} (queda en catastro.json para el plan)
  iphone.py desinstalar <entrada {id}> <salida.json> → {ok, id} — solo una app que está en la última lista revisada

Códigos de error: «sin_iphone» (no hay ninguno conectado ni en la misma red), «sin_confianza» (el iPhone todavía no confía en
este Mac: conéctalo por cable, desbloquéalo y toca «Confiar»), «bloqueado» (desbloquéalo) y «conexion».
Aprendido en la prueba de concepto (poc/HALLAZGOS.md): en iOS 26 el espacio se pide clave por clave (el dominio entero no
responde) y el tamaño de los datos de cada app llega en 0, así que aquí solo va el de la app.
"""
import datetime
import json
import os
import plistlib
import socket
import ssl
import struct
import sys
import tempfile

import nucleo

USBMUXD = os.environ.get("DESPEJA_USBMUXD", "/var/run/usbmuxd")
LOCKDOWN = 62078
TIEMPO = 20


class Falla(Exception):
    def __init__(self, codigo, texto):
        super().__init__(texto)
        self.codigo = codigo


# ── usbmuxd: mensajes plist con una cabecera de 16 bytes (largo, versión 1, tipo 8 = plist, tag) ──

def _leer(s, n):
    d = b""
    while len(d) < n:
        parte = s.recv(n - len(d))
        if not parte:
            raise Falla("conexion", "El iPhone cortó la conexión.")
        d += parte
    return d


def _muxd():
    s = socket.socket(socket.AF_UNIX)
    s.settimeout(TIEMPO)
    try:
        s.connect(USBMUXD)
    except OSError:
        s.close()
        raise Falla("sin_iphone", "No encontré el servicio que conecta el iPhone con el Mac.")
    return s


def _muxd_pedir(s, msg):
    cuerpo = plistlib.dumps(dict(msg, ClientVersionString="despeja", ProgName="despeja", kLibUSBMuxVersion=3))
    s.sendall(struct.pack("<IIII", 16 + len(cuerpo), 1, 8, 1) + cuerpo)
    largo = struct.unpack("<I", _leer(s, 16)[:4])[0] - 16
    if not 0 <= largo <= 4 * 1024 * 1024:
        raise Falla("conexion", "Respuesta rara del iPhone.")
    return plistlib.loads(_leer(s, largo))


def dispositivos():
    """Los iPhone que ve el Mac: primero los de cable (más rápidos), después los de la red."""
    s = _muxd()
    try:
        lista = [x.get("Properties", {}) for x in _muxd_pedir(s, {"MessageType": "ListDevices"}).get("DeviceList", [])]
    finally:
        s.close()
    return sorted([d for d in lista if d.get("SerialNumber")], key=lambda d: d.get("ConnectionType") != "USB")


def registro(udid):
    s = _muxd()
    try:
        r = _muxd_pedir(s, {"MessageType": "ReadPairRecord", "PairRecordID": udid})
    finally:
        s.close()
    if "PairRecordData" not in r:
        raise Falla("sin_confianza", "El iPhone todavía no confía en este Mac.")
    return plistlib.loads(r["PairRecordData"])


def conectar(device_id, puerto):
    s = _muxd()
    r = _muxd_pedir(s, {"MessageType": "Connect", "DeviceID": device_id, "PortNumber": socket.htons(puerto)})
    if r.get("Number") != 0:
        s.close()
        raise Falla("conexion", "No pude conectarme al iPhone.")
    return s


# ── lockdownd y sus servicios: plist con 4 bytes de largo (big-endian) ──

class Canal:
    def __init__(self, s):
        self.s = s

    def enviar(self, msg):
        b = plistlib.dumps(msg)
        self.s.sendall(struct.pack(">I", len(b)) + b)

    def recibir(self):
        largo = struct.unpack(">I", _leer(self.s, 4))[0]
        if largo > 32 * 1024 * 1024:
            raise Falla("conexion", "Respuesta rara del iPhone.")
        return plistlib.loads(_leer(self.s, largo))

    def pedir(self, msg):
        self.enviar(msg)
        return self.recibir()


def _tls(s, reg):
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE   # el iPhone usa los certificados del emparejamiento, no una autoridad pública
    try:
        ctx.set_ciphers("ALL:@SECLEVEL=0")
    except ssl.SSLError:
        pass
    # La llave del emparejamiento solo existe un momento en una carpeta propia (0700) y un archivo 0600.
    with tempfile.TemporaryDirectory() as tmp:
        cert, llave = os.path.join(tmp, "c.pem"), os.path.join(tmp, "k.pem")
        for ruta, datos in ((cert, reg["HostCertificate"]), (llave, reg["HostPrivateKey"])):
            fd = os.open(ruta, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, "wb") as f:
                f.write(datos)
        ctx.load_cert_chain(cert, llave)
    return ctx.wrap_socket(s, server_hostname=None)


class IPhone:
    def __init__(self):
        devs = dispositivos()
        if not devs:
            raise Falla("sin_iphone", "No veo ningún iPhone. Conéctalo por cable o ponlo en la misma red Wi-Fi.")
        self.d = devs[0]
        self.reg = registro(self.d["SerialNumber"])
        s = conectar(self.d["DeviceID"], LOCKDOWN)
        self.ld = Canal(s)
        r = self.ld.pedir({"Label": "despeja", "Request": "StartSession", "HostID": self.reg["HostID"], "SystemBUID": self.reg["SystemBUID"]})
        if "Error" in r:
            s.close()
            codigo = "bloqueado" if "Locked" in str(r["Error"]) else "sin_confianza"
            raise Falla(codigo, "El iPhone no me dejó entrar.")
        if r.get("EnableSessionSSL"):
            self.ld.s = _tls(s, self.reg)

    @property
    def conexion(self):
        return "usb" if self.d.get("ConnectionType") == "USB" else "red"

    def valor(self, clave, dominio=None):
        msg = {"Label": "despeja", "Request": "GetValue", "Key": clave}
        if dominio:
            msg["Domain"] = dominio
        return self.ld.pedir(msg).get("Value")

    def servicio(self, nombre):
        r = self.ld.pedir({"Label": "despeja", "Request": "StartService", "Service": nombre})
        if "Port" not in r:
            raise Falla("conexion", "El iPhone no abrió lo que necesito.")
        s = conectar(self.d["DeviceID"], r["Port"])
        s.settimeout(300)   # calcular el tamaño de cada app tarda
        return Canal(_tls(s, self.reg) if r.get("EnableServiceSSL") else s)

    def cerrar(self):
        try:
            self.ld.s.close()
        except OSError:
            pass


def _con_iphone(f):
    def envuelta(*extra):
        try:
            p = IPhone()
        except Falla as e:
            return {"ok": False, "codigo": e.codigo, "error": str(e)}
        except (OSError, ssl.SSLError, plistlib.InvalidFileException, KeyError, ValueError):
            return {"ok": False, "codigo": "conexion", "error": "No pude hablar con el iPhone. Desbloquéalo e intenta de nuevo."}
        try:
            return f(p, *extra[1:]) if f.__code__.co_argcount > 1 else f(p)
        except Falla as e:
            return {"ok": False, "codigo": e.codigo, "error": str(e)}
        except (OSError, ssl.SSLError, plistlib.InvalidFileException, KeyError, ValueError):
            return {"ok": False, "codigo": "conexion", "error": "Se cortó la conexión con el iPhone. Intenta de nuevo."}
        finally:
            p.cerrar()
    return envuelta


def _numero(v):
    return v if isinstance(v, int) and not isinstance(v, bool) and v >= 0 else 0


@_con_iphone
def estado(p):
    disco = "com.apple.disk_usage"
    return {"ok": True, "iphone": {
        "nombre": str(p.valor("DeviceName") or "iPhone")[:80],
        "tipo": str(p.valor("ProductType") or "")[:40],
        "ios": str(p.valor("ProductVersion") or "")[:20],
        "build": str(p.valor("BuildVersion") or "")[:20],
        "conexion": p.conexion,
        "capacidad": _numero(p.valor("TotalDiskCapacity", disco)),
        "libre": _numero(p.valor("AmountDataAvailable", disco)),
    }}


@_con_iphone
def apps(p):
    c = p.servicio("com.apple.mobile.installation_proxy")
    c.enviar({"Command": "Browse", "ClientOptions": {"ApplicationType": "User", "ReturnAttributes": [
        "CFBundleIdentifier", "CFBundleDisplayName", "CFBundleName", "CFBundleShortVersionString", "StaticDiskUsage"]}})
    lista = []
    while True:
        r = c.recibir()
        for a in r.get("CurrentList", []):
            ident = str(a.get("CFBundleIdentifier") or "")[:200]
            if not ident:
                continue
            nombre = str(a.get("CFBundleDisplayName") or a.get("CFBundleName") or ident).replace("‎", "").strip()[:80]
            lista.append({"id": ident, "nombre": nombre, "version": str(a.get("CFBundleShortVersionString") or "")[:30],
                          "tamano": _numero(a.get("StaticDiskUsage"))})
        if r.get("Status") == "Complete" or "Error" in r or len(lista) > 5000:
            break
    lista.sort(key=lambda a: a["tamano"], reverse=True)
    r = {"ok": True, "apps": lista, "total": sum(a["tamano"] for a in lista)}
    guardar_catastro({"apps": lista, "apps_total": r["total"], "apps_revisadas": nucleo_ahora()})
    return r


def ruta_catastro():
    return os.path.join(nucleo.carpeta_datos(), "catastro.json")


def leer_catastro():
    try:
        with open(ruta_catastro(), encoding="utf-8") as f:
            d = json.load(f)
        return d if isinstance(d, dict) else {}
    except (OSError, ValueError):
        return {}


def guardar_catastro(cambios):
    d = leer_catastro()
    d.update(cambios)
    os.makedirs(nucleo.carpeta_datos(), exist_ok=True)
    nucleo.escribir_json(ruta_catastro(), d)


def nucleo_ahora():
    return datetime.datetime.now().astimezone().isoformat(timespec="seconds")


def desinstalar(d):
    ident = d.get("id")
    conocidas = {a["id"] for a in leer_catastro().get("apps", []) if isinstance(a, dict)}
    if not isinstance(ident, str) or ident not in conocidas:
        return {"ok": False, "codigo": "datos", "error": "Esa app no está en la lista revisada. Revisa las apps de nuevo."}
    return _desinstalar(ident)


@_con_iphone
def _desinstalar_en(p, ident):
    c = p.servicio("com.apple.mobile.installation_proxy")
    c.enviar({"Command": "Uninstall", "ApplicationIdentifier": ident})
    while True:
        r = c.recibir()
        if "Error" in r:
            return {"ok": False, "codigo": "fallo", "error": "El iPhone no dejó desinstalar esa app."}
        if r.get("Status") == "Complete":
            break
    d = leer_catastro()
    d["apps"] = [a for a in d.get("apps", []) if a.get("id") != ident]
    guardar_catastro(d)
    return {"ok": True, "id": ident}


def _desinstalar(ident):
    return _desinstalar_en(None, ident)   # el primer argumento es la entrada (no se usa)


if __name__ == "__main__":
    nucleo.script({"estado": estado, "apps": apps, "desinstalar": desinstalar}, __doc__)
