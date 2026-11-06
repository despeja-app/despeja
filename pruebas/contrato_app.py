"""Lo propio de Despeja para el contrato del puente (pruebas/contrato.py, de la pieza «contrato»; ver su README).

El Mac es el cerebro y el iPhone son las manos: la misma interfaz pide cosas distintas según dónde corre (`enIphone` en
ui/app.js). Lo declarado (scripts del Mac) el contrato ya lo da por del computador; aquí va lo nativo de un solo lado.
"""
EXCEPCIONES = {
    "mac:fotosResumen": "solo en el iPhone: las fotos se leen con PhotoKit en el teléfono (en el Mac la interfaz no la pide)",
}
