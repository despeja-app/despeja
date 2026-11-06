"""Lo propio de Despeja para el contrato del puente (pruebas/contrato.py, de la pieza «contrato»; ver su README).

El Mac es el cerebro y el iPhone son las manos: la misma interfaz pide cosas distintas según dónde corre (`enIphone` en
ui/app.js), así que cada lado tiene acciones que el otro nunca pide.
"""
_SOLO_MAC = "solo en el Mac: en el iPhone la interfaz no la pide (enIphone en ui/app.js)"
EXCEPCIONES = {
    "mac:fotosResumen": "solo en el iPhone: las fotos se leen con PhotoKit en el teléfono (en el Mac la interfaz no la pide)",
    "ios:iphoneEstado": _SOLO_MAC + "; el Mac habla con el iPhone por usbmuxd",
    "ios:iphoneApps": _SOLO_MAC + "; la lista de apps sale de installation_proxy desde el Mac",
    "ios:listaIA": _SOLO_MAC + "; la IA corre en el computador (pieza «ia»)",
    "ios:probarIA": _SOLO_MAC + "; la IA corre en el computador (pieza «ia»)",
    "ios:buscarActualizacion": _SOLO_MAC + "; en el iPhone la app se actualiza desde Xcode o la App Store (Ajustes no muestra la fila)",
    "ios:actualizar": _SOLO_MAC + "; en el iPhone la app se actualiza desde Xcode o la App Store (Ajustes no muestra la fila)",
}
