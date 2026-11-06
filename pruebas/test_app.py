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



if __name__ == "__main__":
    unittest.main()
