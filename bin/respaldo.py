#!/usr/bin/env python3
"""respaldo — el Mac recibe las fotos y videos que manda la app de iPhone, los verifica y los guarda. Solo biblioteca estándar
(más `openssl` y `dns-sd`, que vienen con macOS).

  respaldo.py recibir <entrada {destino}> <salida.json>   → corre hasta que el iPhone termina, la persona detiene o pasan 15 min
                                                             sin nada: {ok, recibidos, bytes, motivo}
  respaldo.py detener <salida.json>                        → {ok}

Cómo se protege lo que viaja por el Wi-Fi:
- TLS con un certificado nuevo en cada sesión (openssl, solo en la carpeta de datos, 0600).
- Un código de 8 letras que el Mac muestra y la persona escribe en el iPhone. Nunca viaja: de él sale una llave (PBKDF2-SHA256,
  200.000 vueltas) con la que el Mac firma la huella de su certificado (así el iPhone sabe que habla con ESTE Mac y no con otro
  en la misma red) y el iPhone firma cada archivo que manda (así solo el iPhone con el código puede dejar algo en tu carpeta).
- Cada archivo llega con su SHA-256: si lo que se escribió no calza, se descarta y el iPhone no lo marca como respaldado.
`POST /resumen` (firmado): el resumen del análisis del iPhone (cuántas fotos y cuánto ocupa cada grupo) para el plan de tu IA.
Eventos (DESPEJA_PROGRESO, una línea JSON cada uno): {"t": "esperando", "codigo"}, {"t": "conectado"}, {"t": "archivo", "n",
"bytes"}, {"t": "fin", "motivo"}. Mientras corre, toca DESPEJA_LATIDO cada 5 s (pieza «trabajos»: si deja de latir, el host lo corta).
"""
import datetime
import hashlib
import hmac
import http.server
import json
import os
import re
import secrets
import socket
import ssl
import subprocess
import threading
import time
import urllib.parse

import nucleo

ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"   # sin 0/O ni 1/I: se dicta y se escribe sin dudas
VUELTAS = 200_000
MAX_ARCHIVO = 30 * 1024 ** 3
ESPERA_MAX = 15 * 60


def carpeta_sesion():
    c = os.path.join(nucleo.carpeta_datos(), "respaldo")
    os.makedirs(c, mode=0o700, exist_ok=True)
    return c


def llave(codigo):
    return hashlib.pbkdf2_hmac("sha256", codigo.encode(), b"despeja-respaldo-1", VUELTAS)


def firma(clave, *partes):
    return hmac.new(clave, "|".join(str(p) for p in partes).encode(), hashlib.sha256).hexdigest()


def nombre_seguro(n):
    base = os.path.basename(str(n or "")).strip().replace("\x00", "")
    base = re.sub(r"[^\w.\- ]", "_", base)[:120].lstrip(".")
    return base or "archivo"


def destino_de(base, fecha, nombre):
    """AAAA/MM/nombre dentro del destino; si el nombre ya existe con otro contenido, se le suma « (2)», « (3)»…"""
    try:
        f = datetime.datetime.fromisoformat(str(fecha).replace("Z", "+00:00"))
        sub = os.path.join(f"{f.year:04d}", f"{f.month:02d}")
    except ValueError:
        sub = "sin-fecha"
    carpeta = os.path.join(base, sub)
    os.makedirs(carpeta, exist_ok=True)
    raiz, ext = os.path.splitext(nombre)
    ruta, i = os.path.join(carpeta, nombre), 2
    while os.path.exists(ruta):
        ruta, i = os.path.join(carpeta, f"{raiz} ({i}){ext}"), i + 1
    return ruta


def sha_archivo(ruta):
    h = hashlib.sha256()
    with open(ruta, "rb") as f:
        for bloque in iter(lambda: f.read(1024 * 1024), b""):
            h.update(bloque)
    return h.hexdigest()


class Sesion:
    def __init__(self, destino):
        self.destino = destino
        self.carpeta = carpeta_sesion()
        self.indice_ruta = os.path.join(self.carpeta, "indice.json")
        self.indice = self._leer_indice()
        self.codigo = "".join(secrets.choice(ALFABETO) for _ in range(8))
        self.clave = llave(self.codigo)
        self.recibidos = 0
        self.bytes = 0
        self.ultimo = time.time()
        self.fin = None
        self.lock = threading.Lock()

    def _leer_indice(self):
        try:
            with open(self.indice_ruta, encoding="utf-8") as f:
                d = json.load(f)
            return d if isinstance(d, dict) else {}
        except (OSError, ValueError):
            return {}

    def guardar_indice(self):
        nucleo.escribir_json(self.indice_ruta, self.indice)

    def tiene(self, ident):
        """Ya respaldado en este destino y el archivo sigue ahí con el mismo tamaño."""
        x = self.indice.get(ident)
        return bool(x and x.get("destino") == self.destino and os.path.isfile(x.get("ruta", "")) and os.path.getsize(x["ruta"]) == x.get("bytes"))


GRUPOS = ("repetidas", "parecidas", "capturas", "rafagas", "videosRepetidos", "borrosas", "utiles", "videos", "comprimir", "live")


def guardar_resumen(d):
    """El resumen del análisis del iPhone (cuántas y cuánto por grupo) queda en catastro.json para el plan de la IA. Solo números."""
    import iphone
    limpio = {}
    for k, v in (d.get("grupos") or {}).items() if isinstance(d, dict) else []:
        if k in GRUPOS and isinstance(v, dict):
            limpio[k] = {c: int(v[c]) for c in ("n", "bytes", "marcadas", "bytesMarcadas") if isinstance(v.get(c), int) and not isinstance(v.get(c), bool) and 0 <= v[c] < 10 ** 14}
    iphone.guardar_catastro({"fotos": limpio, "fotos_fecha": datetime.datetime.now().astimezone().isoformat(timespec="seconds")})


def evento(**e):
    ruta = os.environ.get("DESPEJA_PROGRESO")
    if ruta:
        with open(ruta, "a", encoding="utf-8") as f:
            f.write(json.dumps(e, ensure_ascii=False) + "\n")


def latir(sesion, detener):
    """Hasta que termine: late cada 5 s (el host corta lo que deja de latir) y mira si la persona pidió detener."""
    ruta = os.environ.get("DESPEJA_LATIDO")
    vuelta = 0
    while sesion.fin is None:
        if ruta and vuelta % 5 == 0:
            with open(ruta, "a"):
                pass
            os.utime(ruta, None)
        if os.path.exists(detener):
            sesion.fin = "detenido"
        elif time.time() - sesion.ultimo > ESPERA_MAX:
            sesion.fin = "sin_actividad"
        else:
            time.sleep(1)
            vuelta += 1


def certificado(carpeta):
    cert, clave = os.path.join(carpeta, "cert.pem"), os.path.join(carpeta, "clave.pem")
    for r in (cert, clave):
        if os.path.exists(r):
            os.remove(r)
    subprocess.run(["/usr/bin/openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "2", "-subj", "/CN=despeja",
                    "-keyout", clave, "-out", cert], check=True, capture_output=True, timeout=60)
    os.chmod(clave, 0o600)
    der = ssl.PEM_cert_to_DER_cert(open(cert, encoding="ascii").read())
    return cert, clave, hashlib.sha256(der).hexdigest()


def manejador(sesion, huella):
    class M(http.server.BaseHTTPRequestHandler):
        server_version = "Despeja"
        protocol_version = "HTTP/1.1"   # una sola conexión TLS para todos los archivos
        sys_version = ""

        def log_message(self, *a):
            pass

        def responder(self, codigo, datos):
            if codigo in (400, 403, 404):
                self.close_connection = True   # el cuerpo quedó sin leer: esta conexión ya no sirve
            b = json.dumps(datos).encode()
            self.send_response(codigo)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(b)))
            if self.close_connection:
                self.send_header("Connection", "close")
            self.end_headers()
            self.wfile.write(b)

        def autorizado(self, *partes):
            f = self.headers.get("X-Despeja-Firma", "")
            return hmac.compare_digest(f, firma(sesion.clave, *partes))

        def leer_json(self, maximo=4 * 1024 * 1024):
            n = int(self.headers.get("Content-Length") or 0)
            if not 0 <= n <= maximo:
                raise ValueError("demasiado grande")
            return json.loads(self.rfile.read(n) or b"{}"), n

        def do_GET(self):
            sesion.ultimo = time.time()
            if self.path == "/hola":
                evento(t="conectado")
                return self.responder(200, {"nombre": socket.gethostname().split(".")[0][:60], "huella": huella,
                                            "firma": firma(sesion.clave, "hola", huella)})
            self.responder(404, {"ok": False})

        def do_POST(self):
            sesion.ultimo = time.time()
            try:
                if self.path == "/tiene":
                    n = int(self.headers.get("Content-Length") or 0)
                    if not 0 <= n <= 32 * 1024 * 1024:
                        return self.responder(400, {"ok": False, "codigo": "datos"})
                    crudo = self.rfile.read(n)
                    cuerpo = hashlib.sha256(crudo).hexdigest()   # la firma cubre los bytes tal como llegaron
                    if not self.autorizado("tiene", cuerpo):
                        return self.responder(403, {"ok": False, "codigo": "firma"})
                    d = json.loads(crudo or b"{}")
                    ids = [i for i in d.get("ids", []) if isinstance(i, str)][:200000]
                    return self.responder(200, {"ok": True, "tiene": [i for i in ids if sesion.tiene(i)]})
                if self.path == "/resumen":
                    n = int(self.headers.get("Content-Length") or 0)
                    if not 0 <= n <= 256 * 1024:
                        return self.responder(400, {"ok": False, "codigo": "datos"})
                    crudo = self.rfile.read(n)
                    if not self.autorizado("resumen", hashlib.sha256(crudo).hexdigest()):
                        return self.responder(403, {"ok": False, "codigo": "firma"})
                    guardar_resumen(json.loads(crudo or b"{}"))
                    return self.responder(200, {"ok": True})
                if self.path == "/archivo":
                    return self.archivo()
                if self.path == "/fin":
                    if not self.autorizado("fin"):
                        return self.responder(403, {"ok": False, "codigo": "firma"})
                    sesion.fin = "listo"
                    return self.responder(200, {"ok": True, "recibidos": sesion.recibidos})
            except (ValueError, OSError) as e:
                return self.responder(400, {"ok": False, "error": str(e)[:200]})
            self.responder(404, {"ok": False})

        def archivo(self):
            h = self.headers
            ident, sha, fecha = h.get("X-Despeja-Id", ""), h.get("X-Despeja-Sha256", "").lower(), h.get("X-Despeja-Fecha", "")
            crudo = h.get("X-Despeja-Nombre", "")   # va con %XX (los encabezados son ASCII); la firma cubre lo que llegó
            nombre = nombre_seguro(urllib.parse.unquote(crudo))
            largo = int(h.get("Content-Length") or -1)
            if not (0 < len(ident) <= 300 and re.fullmatch(r"[0-9a-f]{64}", sha) and 0 <= largo <= MAX_ARCHIVO):
                return self.responder(400, {"ok": False, "codigo": "datos"})
            if not self.autorizado("archivo", ident, sha, largo, crudo, fecha):
                return self.responder(403, {"ok": False, "codigo": "firma"})
            if sesion.tiene(ident) and sesion.indice[ident].get("sha256") == sha:
                self.close_connection = True   # no se lee el cuerpo: ya está respaldado y verificado
                return self.responder(200, {"ok": True, "sha256": sha, "ya": True})
            tmp_dir = os.path.join(sesion.destino, ".despeja-recibiendo")
            os.makedirs(tmp_dir, exist_ok=True)
            tmp = os.path.join(tmp_dir, secrets.token_hex(8))
            hs, falta = hashlib.sha256(), largo
            with open(tmp, "wb") as f:
                while falta:
                    b = self.rfile.read(min(1024 * 1024, falta))
                    if not b:
                        break
                    hs.update(b)
                    f.write(b)
                    falta -= len(b)
                    sesion.ultimo = time.time()
                f.flush()
                os.fsync(f.fileno())
            if falta or hs.hexdigest() != sha:
                os.remove(tmp)
                return self.responder(422, {"ok": False, "codigo": "no_calza"})
            with sesion.lock:
                ruta = destino_de(sesion.destino, fecha, nombre)
                os.replace(tmp, ruta)
                # Se vuelve a leer del disco: lo que se marca como respaldado es lo que quedó escrito.
                if sha_archivo(ruta) != sha:
                    os.remove(ruta)
                    return self.responder(422, {"ok": False, "codigo": "no_calza"})
                sesion.indice[ident] = {"ruta": ruta, "sha256": sha, "bytes": largo, "destino": sesion.destino,
                                        "fecha": datetime.datetime.now().astimezone().isoformat(timespec="seconds")}
                sesion.guardar_indice()
                sesion.recibidos += 1
                sesion.bytes += largo
            evento(t="archivo", n=sesion.recibidos, bytes=sesion.bytes)
            self.responder(200, {"ok": True, "sha256": sha})
    return M


def recibir(d):
    destino = d.get("destino")
    if not isinstance(destino, str) or not os.path.isabs(destino) or not os.path.isdir(destino):
        return {"ok": False, "codigo": "destino", "error": "Elige dónde guardar los respaldos."}
    sesion = Sesion(os.path.realpath(destino))
    detener = os.path.join(sesion.carpeta, "detener")
    if os.path.exists(detener):
        os.remove(detener)
    try:
        cert, clave, huella = certificado(sesion.carpeta)
    except (OSError, subprocess.SubprocessError):
        return {"ok": False, "codigo": "certificado", "error": "No pude preparar la conexión segura."}
    servidor = http.server.ThreadingHTTPServer(("0.0.0.0", 0), manejador(sesion, huella))
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.minimum_version = ssl.TLSVersion.TLSv1_2
    ctx.load_cert_chain(cert, clave)
    servidor.socket = ctx.wrap_socket(servidor.socket, server_side=True)
    puerto = servidor.server_address[1]
    anuncio = None
    try:
        anuncio = subprocess.Popen(["/usr/bin/dns-sd", "-R", f"Despeja en {socket.gethostname().split('.')[0][:40]}", "_despeja._tcp",
                                    "local", str(puerto)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except OSError:
        pass
    hilo = threading.Thread(target=servidor.serve_forever, daemon=True)
    hilo.start()
    evento(t="esperando", codigo=sesion.codigo[:4] + "-" + sesion.codigo[4:])
    try:
        latir(sesion, detener)
    finally:
        servidor.shutdown()
        if anuncio:
            anuncio.terminate()
        for r in (cert, clave, detener):
            if os.path.exists(r):
                os.remove(r)
    evento(t="fin", motivo=sesion.fin)
    return {"ok": True, "recibidos": sesion.recibidos, "bytes": sesion.bytes, "motivo": sesion.fin}


def detener(_d):
    open(os.path.join(carpeta_sesion(), "detener"), "w").close()
    return {"ok": True}


if __name__ == "__main__":
    nucleo.script({"recibir": recibir, "detener": detener}, __doc__)
