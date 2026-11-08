"""Lo propio de Despeja para el contrato del puente (pruebas/contrato.py, de la pieza «contrato»; ver su README).

El Mac (app «host-tauri») es el cerebro y el iPhone son las manos: la misma interfaz pide cosas distintas según dónde corre (`enIphone` en
ui/app.js). Lo declarado (scripts del Mac) el contrato ya lo da por del computador; aquí va lo nativo de un solo lado.
"""
_IPHONE = "solo en el iPhone (PhotoKit y la conexión con el Mac viven en el teléfono); en el Mac la interfaz no la pide"
EXCEPCIONES = {
    "tauri:respaldoEstado": _IPHONE,
    "tauri:macBuscar": _IPHONE,
    "tauri:macConectar": _IPHONE,
    "tauri:respaldar": _IPHONE,
    "tauri:respaldoParar": _IPHONE,
    "tauri:borrarRespaldadas": _IPHONE,
    "tauri:analizar": _IPHONE,
    "tauri:limpiezaEstado": _IPHONE,
    "tauri:grupoVer": _IPHONE,
    "tauri:grupoMarcar": _IPHONE,
    "tauri:grupoBorrar": _IPHONE,
    "tauri:fotoGrande": _IPHONE,
    "tauri:verVideo": _IPHONE,
    "tauri:grupoProcesar": _IPHONE,
    "tauri:procesoParar": _IPHONE,
    "tauri:contactosAnalizar": _IPHONE,
    "tauri:contactosJuntar": _IPHONE,
    "tauri:contactosBorrar": _IPHONE,
    "tauri:calendarioAnalizar": _IPHONE,
    "tauri:calendarioBorrar": _IPHONE,
    "ios:abrirAccesoDisco": "solo en el Mac: el ajuste de Acceso total al disco para leer el respaldo de WhatsApp",
    "ios:elegirDestino": "solo en el Mac: la carpeta donde quedan los respaldos (en el iPhone la interfaz no la pide)",
}
