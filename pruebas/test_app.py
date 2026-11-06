"""Pruebas de lo propio de Despeja en Python. Cada una corre con una carpeta temporal: nunca toca datos reales.

Una clase por script de bin/, con datos ficticios (Ana Pérez, Matías Soto). El iPhone se imita con un usbmuxd falso.
"""
import json
import os
import plistlib
import socket
import struct
import threading
import subprocess
import sys
import tempfile
import unittest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def correr(script, *args, entrada=None, entorno_extra=None):
    """Corre bin/<script> como lo corre el host: lo de la persona en un archivo de entrada y el último argumento es la salida."""
    with tempfile.TemporaryDirectory() as tmp:
        archivos = []
        if entrada is not None:
            ruta = os.path.join(tmp, "entrada.json")
            with open(ruta, "w", encoding="utf-8") as f:
                json.dump(entrada, f)
            archivos.append(ruta)
        salida = os.path.join(tmp, "salida.json")
        entorno = {**os.environ, "HOME": tmp, "DESPEJA_DATOS": os.path.join(tmp, "datos"), **(entorno_extra or {})}
        r = subprocess.run([sys.executable, os.path.join(RAIZ, "bin", script), *args, *archivos, salida],
                           capture_output=True, text=True, timeout=60, env=entorno)
        if r.returncode != 0:
            raise AssertionError(r.stderr)
        with open(salida, encoding="utf-8") as f:
            return json.load(f)


class UsbmuxdFalso:
    """Un usbmuxd de mentira en un socket Unix: responde ListDevices con la lista que se le da."""

    def __init__(self, carpeta, dispositivos):
        self.ruta = os.path.join(carpeta, "usbmuxd")
        self.dispositivos = dispositivos
        self.s = socket.socket(socket.AF_UNIX)
        self.s.bind(self.ruta)
        self.s.listen(4)
        threading.Thread(target=self._atender, daemon=True).start()

    def _atender(self):
        while True:
            try:
                c, _ = self.s.accept()
            except OSError:
                return
            with c:
                cab = c.recv(16)
                largo = struct.unpack("<I", cab[:4])[0] - 16
                msg = plistlib.loads(c.recv(largo))
                r = {"DeviceList": self.dispositivos} if msg.get("MessageType") == "ListDevices" else {"Number": 1}
                cuerpo = plistlib.dumps(r)
                c.sendall(struct.pack("<IIII", 16 + len(cuerpo), 1, 8, 1) + cuerpo)

    def cerrar(self):
        self.s.close()


class IPhone(unittest.TestCase):
    def test_sin_el_servicio_dice_sin_iphone(self):
        r = correr("iphone.py", "estado", entorno_extra={"DESPEJA_USBMUXD": "/no/existe/usbmuxd"})
        self.assertEqual((r["ok"], r["codigo"]), (False, "sin_iphone"))

    def test_sin_iphone_conectado(self):
        with tempfile.TemporaryDirectory(dir="/tmp") as tmp:
            falso = UsbmuxdFalso(tmp, [])
            try:
                r = correr("iphone.py", "apps", entorno_extra={"DESPEJA_USBMUXD": falso.ruta})
            finally:
                falso.cerrar()
        self.assertEqual((r["ok"], r["codigo"]), (False, "sin_iphone"))
        self.assertIn("Wi-Fi", r["error"])

    def test_iphone_sin_confianza(self):
        # Lo ve, pero usbmuxd no tiene su registro de emparejamiento: hay que tocar «Confiar».
        with tempfile.TemporaryDirectory(dir="/tmp") as tmp:
            falso = UsbmuxdFalso(tmp, [{"DeviceID": 7, "Properties": {"SerialNumber": "00000000-ANA", "ConnectionType": "USB", "DeviceID": 7}}])
            try:
                r = correr("iphone.py", "estado", entorno_extra={"DESPEJA_USBMUXD": falso.ruta})
            finally:
                falso.cerrar()
        self.assertEqual((r["ok"], r["codigo"]), (False, "sin_confianza"))

    def test_las_acciones_no_llevan_nada_de_la_persona(self):
        with open(os.path.join(RAIZ, "acciones.json"), encoding="utf-8") as f:
            a = json.load(f)["acciones"]
        for nombre in ("iphoneEstado", "iphoneApps"):
            self.assertEqual(a[nombre]["script"], "iphone.py")
            self.assertFalse(any(x.startswith("$") for x in a[nombre]["args"]), nombre)



class Respaldo(unittest.TestCase):
    """El Mac recibe como lo haría el iPhone: código, huella firmada, archivo firmado y verificado, y fin."""

    def test_recibe_verifica_y_ordena(self):
        import hashlib, hmac, http.client, ssl, time
        sys.path.insert(0, os.path.join(RAIZ, "bin"))
        import respaldo
        with tempfile.TemporaryDirectory() as tmp:
            destino = os.path.join(tmp, "Respaldos")
            os.makedirs(destino)
            progreso = os.path.join(tmp, "progreso.jsonl")
            open(progreso, "w").close()
            entrada = os.path.join(tmp, "entrada.json")
            with open(entrada, "w") as f:
                json.dump({"destino": destino}, f)
            entorno = {**os.environ, "HOME": tmp, "DESPEJA_DATOS": os.path.join(tmp, "datos"), "DESPEJA_PROGRESO": progreso}
            proc = subprocess.Popen([sys.executable, os.path.join(RAIZ, "bin", "respaldo.py"), "recibir", entrada, os.path.join(tmp, "salida.json")], env=entorno)
            try:
                codigo = None
                for _ in range(100):
                    for linea in open(progreso):
                        e = json.loads(linea)
                        if e.get("t") == "esperando":
                            codigo = e["codigo"].replace("-", "")
                    if codigo:
                        break
                    time.sleep(0.1)
                self.assertIsNotNone(codigo)
                puerto = None
                for _ in range(50):   # el puerto: el que abrió el proceso (en la prueba no hay Bonjour)
                    salida = subprocess.run(["lsof", "-Pan", "-p", str(proc.pid), "-iTCP", "-sTCP:LISTEN"], capture_output=True, text=True).stdout
                    m = [l.split()[-2].rsplit(":", 1)[1] for l in salida.splitlines()[1:]]
                    if m:
                        puerto = int(m[0])
                        break
                    time.sleep(0.1)
                if puerto is None:
                    self.skipTest("sin lsof para encontrar el puerto")
                ctx = ssl.create_default_context()
                ctx.check_hostname, ctx.verify_mode = False, ssl.CERT_NONE
                clave = respaldo.llave(codigo)
                c = http.client.HTTPSConnection("127.0.0.1", puerto, context=ctx, timeout=20)
                c.request("GET", "/hola")
                hola = json.loads(c.getresponse().read())
                der = c.sock.getpeercert(binary_form=True)
                self.assertEqual(hola["huella"], hashlib.sha256(der).hexdigest())
                self.assertEqual(hola["firma"], respaldo.firma(clave, "hola", hola["huella"]))
                datos = "una foto de Ana Pérez".encode()
                sha = hashlib.sha256(datos).hexdigest()
                cab = {"X-Despeja-Id": "ABC/L0/001", "X-Despeja-Sha256": sha, "X-Despeja-Nombre": "IMG_0001.HEIC",
                       "X-Despeja-Fecha": "2025-03-14T10:00:00Z", "Content-Length": str(len(datos))}
                # Sin la firma correcta no entra nada.
                c.request("POST", "/archivo", body=datos, headers={**cab, "X-Despeja-Firma": "0" * 64})
                r = c.getresponse(); r.read()
                self.assertEqual(r.status, 403)
                f = respaldo.firma(clave, "archivo", "ABC/L0/001", sha, len(datos), "IMG_0001.HEIC", "2025-03-14T10:00:00Z")
                c.request("POST", "/archivo", body=datos, headers={**cab, "X-Despeja-Firma": f})
                self.assertTrue(json.loads(c.getresponse().read())["ok"])
                self.assertTrue(os.path.isfile(os.path.join(destino, "2025", "03", "IMG_0001.HEIC")))
                # Un archivo que no calza con su SHA-256 se descarta.
                malo = {**cab, "X-Despeja-Id": "ABC/L0/002", "X-Despeja-Nombre": "IMG_0002.HEIC"}
                f2 = respaldo.firma(clave, "archivo", "ABC/L0/002", sha, len(datos), "IMG_0002.HEIC", "2025-03-14T10:00:00Z")
                c.request("POST", "/archivo", body=b"x" * len(datos), headers={**malo, "X-Despeja-Firma": f2})
                r = c.getresponse(); r.read()
                self.assertEqual(r.status, 422)
                self.assertFalse(os.path.exists(os.path.join(destino, "2025", "03", "IMG_0002.HEIC")))
                cuerpo = json.dumps({"ids": ["ABC/L0/001", "ABC/L0/002"]}).encode()
                h = hashlib.sha256(cuerpo).hexdigest()
                c.request("POST", "/tiene", body=cuerpo, headers={"X-Despeja-Firma": respaldo.firma(clave, "tiene", h)})
                self.assertEqual(json.loads(c.getresponse().read())["tiene"], ["ABC/L0/001"])
                c.request("POST", "/fin", body=b"", headers={"X-Despeja-Firma": respaldo.firma(clave, "fin")})
                c.getresponse().read()
                proc.wait(timeout=20)
                with open(os.path.join(tmp, "salida.json")) as f:
                    s = json.load(f)
                self.assertEqual((s["ok"], s["recibidos"], s["motivo"]), (True, 1, "listo"))
            finally:
                if proc.poll() is None:
                    proc.kill()


if __name__ == "__main__":
    unittest.main()
