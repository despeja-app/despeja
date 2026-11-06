"""Lo propio de Despeja para el contrato del puente (pruebas/contrato.py, de la pieza «contrato»; ver su README).

El Mac es el cerebro y el iPhone son las manos: la misma interfaz pide cosas distintas según dónde corre (`enIphone` en
ui/app.js). Lo declarado (scripts del Mac) el contrato ya lo da por del computador; aquí va lo nativo de un solo lado.
"""
_IPHONE = "solo en el iPhone (PhotoKit y la conexión con el Mac viven en el teléfono); en el Mac la interfaz no la pide"
EXCEPCIONES = {
    "mac:fotosResumen": _IPHONE,
    "mac:respaldoEstado": _IPHONE,
    "mac:macBuscar": _IPHONE,
    "mac:macConectar": _IPHONE,
    "mac:respaldar": _IPHONE,
    "mac:respaldoParar": _IPHONE,
    "mac:borrarRespaldadas": _IPHONE,
    "ios:elegirDestino": "solo en el Mac: la carpeta donde quedan los respaldos (en el iPhone la interfaz no la pide)",
}
