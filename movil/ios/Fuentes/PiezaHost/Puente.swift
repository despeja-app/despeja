// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
import SwiftUI
import UIKit
import WebKit

/// El puente entre la interfaz (ui/, con host-ui) y la app de iPhone. Misma forma que host-mac: la interfaz manda
/// `{accion, datos}` por `webkit.messageHandlers.<id>` y la app responde con `window.<App>.<funcion>(json)`.
@MainActor
public final class Puente: NSObject, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
    public typealias Datos = [String: Any]
    public static let shared = Puente()

    public private(set) var web: WKWebView?
    public private(set) var lista = false

    private var registradas: [String: @MainActor (Datos) -> Void] = [:]
    private var internas: [String: @MainActor (Datos) -> Void] = [:]
    private var ocupadas = 0
    private var tareasIniciadas = false
    private var tareaFondo: UIBackgroundTaskIdentifier = .invalid

    /// Suma lo propio al estado que recibe la interfaz al abrir (`listo`).
    public var estado: (@MainActor (Datos, @escaping @MainActor (Datos) -> Void) -> Void)?
    /// Lo que corre solo, recién cuando el idioma está elegido (nunca un permiso antes de eso).
    public var tareas: (@MainActor () -> Void)?
    public var alCambiarConfig: (@MainActor (Datos, Datos) -> Void)?
    /// La app pasa a segundo plano (después de pedirle a la interfaz que guarde) y vuelve.
    public var alIrseAlFondo: (@MainActor () -> Void)?
    public var alVolver: (@MainActor () -> Void)?
    public var alConfigurarWeb: (@MainActor (WKWebViewConfiguration) -> Void)?

    private override init() {
        super.init()
        internas["listo"] = { [unowned self] _ in self.lista = true; self.enviarEstado() }
        internas["config"] = { [unowned self] d in self.guardarConfig(d) }
        internas["abrirEnlace"] = { [unowned self] d in self.abrirEnlace(d["url"]) }
        internas["copiar"] = { [unowned self] d in self.llamar("copiado", ["ok": self.copiar(d["texto"])]) }
    }

    // MARK: Lo que usa la app

    /// Una acción propia (fotos, contactos…). Gana sobre lo que trae el host.
    public func registrar(_ accion: String, _ fn: @escaping @MainActor (Datos) -> Void) {
        precondition(Texto.calza(accion, Texto.accion), "acción rara: \(accion)")
        registradas[accion] = fn
    }

    public static func registrar(_ accion: String, _ fn: @escaping @MainActor (Datos) -> Void) { shared.registrar(accion, fn) }

    public var acciones: [String] { Array(Set(registradas.keys).union(internas.keys)).sorted() }

    /// Hacia la interfaz: `window.<App>.<funcion>(json)`. Solo nombres simples y JSON; nada antes de `listo`.
    public func llamar(_ funcion: String, _ datos: Any) { intentarLlamar(funcion, datos) }

    @discardableResult
    public func intentarLlamar(_ funcion: String, _ datos: Any) -> Bool {
        let global = Host.opciones.global ?? Texto.global(Host.id)
        guard lista, let web, Texto.calza(funcion, Texto.accion), Texto.calza(global, "[A-Z][A-Za-z0-9]{0,40}"),
              JSONSerialization.isValidJSONObject(["x": datos]),
              let d = try? JSONSerialization.data(withJSONObject: ["x": datos]), let json = String(data: d, encoding: .utf8) else { return false }
        web.evaluateJavaScript("window.\(global) && typeof window.\(global).\(funcion) === 'function' && window.\(global).\(funcion)((\(json)).x)")
        return true
    }

    /// Corre una acción como si la hubiera pedido la interfaz.
    public func despachar(_ accion: String, _ datos: Datos) {
        guard Texto.calza(accion, Texto.accion) else { return }
        if let f = registradas[accion] { return f(datos) }
        if let f = internas[accion] { return f(datos) }
        // Una acción que el iPhone no atiende: la interfaz se entera (nunca queda esperando).
        llamar("error", ["ok": false, "codigo": "falta", "accion": accion, "texto": "Esto no se puede hacer en el iPhone.",
                         "valores": [String: String](), "error": Idioma.t("Esto no se puede hacer en el iPhone.")])
    }

    /// Algo largo en curso (una transferencia): la pantalla no se apaga y, si la persona sale de la app, iOS da unos segundos
    /// para terminar lo que va. `soltar()` cuando termina.
    public var ocupada: Bool { ocupadas > 0 }
    public func ocupar() {
        ocupadas += 1
        UIApplication.shared.isIdleTimerDisabled = true
    }
    public func soltar() {
        ocupadas = max(0, ocupadas - 1)
        if ocupadas == 0 {
            UIApplication.shared.isIdleTimerDisabled = false
            terminarTareaFondo()
        }
    }

    public func iniciarTareas() {
        guard !tareasIniciadas else { return }
        tareasIniciadas = true
        tareas?()
    }

    /// Pide a la interfaz que guarde lo pendiente (igual que al cerrar la ventana en Mac).
    public func guardarTodo() { llamar("menu", ["accion": "guardar"]) }

    // MARK: La vista (WKWebView a pantalla completa)

    private var carpetaUI: URL { Host.recursos.appendingPathComponent("ui") }
    private var prefijoUI: String { carpetaUI.resolvingSymlinksInPath().path + "/" }

    func crearWeb() -> WKWebView {
        if let web { return web }
        let control = WKUserContentController()
        control.add(self, name: Host.id)
        // host-ui lee la plataforma de aquí: «movil» (la misma interfaz se adapta al celular).
        control.addUserScript(WKUserScript(source: "window.\(Host.prefijo)HOST = 'movil';", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        let conf = WKWebViewConfiguration()
        conf.userContentController = control
        conf.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")
        conf.allowsInlineMediaPlayback = true
        conf.dataDetectorTypes = []
        alConfigurarWeb?(conf)
        let w = WKWebView(frame: .zero, configuration: conf)
        w.navigationDelegate = self
        w.uiDelegate = self
        w.isOpaque = false
        w.backgroundColor = .systemBackground
        w.scrollView.contentInsetAdjustmentBehavior = .never   // la interfaz usa env(safe-area-inset-*)
        w.scrollView.bounces = false
        w.allowsLinkPreview = false
        web = w
        aplicarApariencia()
        w.loadFileURL(carpetaUI.appendingPathComponent("index.html"), allowingReadAccessTo: carpetaUI)
        return w
    }

    /// config.tema (pieza «tema»): sistema, claro u oscuro.
    public func aplicarApariencia() {
        let estilo: UIUserInterfaceStyle
        switch Config.texto("tema") {
        case "claro": estilo = .light
        case "oscuro": estilo = .dark
        default: estilo = .unspecified
        }
        for escena in UIApplication.shared.connectedScenes {
            for v in (escena as? UIWindowScene)?.windows ?? [] { v.overrideUserInterfaceStyle = estilo }
        }
    }

    // MARK: Ciclo de vida

    func observarCiclo() {
        let n = NotificationCenter.default
        n.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { _ in
            MainActor.assumeIsolated {
                let p = Puente.shared
                p.guardarTodo()
                if p.ocupada { p.empezarTareaFondo() }
                p.alIrseAlFondo?()
            }
        }
        n.addObserver(forName: UIApplication.willEnterForegroundNotification, object: nil, queue: .main) { _ in
            MainActor.assumeIsolated {
                Puente.shared.terminarTareaFondo()
                Puente.shared.alVolver?()
            }
        }
    }

    private func empezarTareaFondo() {
        guard tareaFondo == .invalid else { return }
        tareaFondo = UIApplication.shared.beginBackgroundTask(withName: Host.id) { [weak self] in
            MainActor.assumeIsolated { self?.terminarTareaFondo() }
        }
    }

    private func terminarTareaFondo() {
        guard tareaFondo != .invalid else { return }
        UIApplication.shared.endBackgroundTask(tareaFondo)
        tareaFondo = .invalid
    }

    // MARK: Navegación: solo la interfaz que viene dentro de la app

    public func webView(_ webView: WKWebView, decidePolicyFor accion: WKNavigationAction) async -> WKNavigationActionPolicy {
        guard let u = accion.request.url else { return .cancel }
        if u.isFileURL, u.resolvingSymlinksInPath().path.hasPrefix(prefijoUI) { return .allow }
        if u.scheme == "https", accion.navigationType == .linkActivated { despachar("abrirEnlace", ["url": u.absoluteString]) }
        return .cancel
    }

    /// Ventanas nuevas (`target=_blank`, window.open): nunca dentro de la app.
    public func webView(_ webView: WKWebView, createWebViewWith c: WKWebViewConfiguration, for accion: WKNavigationAction,
                        windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let u = accion.request.url, u.scheme == "https" { despachar("abrirEnlace", ["url": u.absoluteString]) }
        return nil
    }

    public func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        lista = false
        webView.loadFileURL(carpetaUI.appendingPathComponent("index.html"), allowingReadAccessTo: carpetaUI)
    }

    // MARK: Desde la interfaz

    public func userContentController(_ c: WKUserContentController, didReceive mensaje: WKScriptMessage) {
        // Solo la interfaz local: el marco principal, con un archivo de ui/. Una página de internet o un iframe, nunca.
        guard mensaje.frameInfo.isMainFrame, mensaje.frameInfo.securityOrigin.protocol == "file",
              let u = mensaje.frameInfo.request.url, u.isFileURL, u.resolvingSymlinksInPath().path.hasPrefix(prefijoUI),
              let m = mensaje.body as? [String: Any], let accion = m["accion"] as? String, Texto.calza(accion, Texto.accion) else { return }
        despachar(accion, m["datos"] as? Datos ?? [:])
    }

    // MARK: Lo que trae el host

    public func enviarEstado() {
        guard lista else { return }
        var b: Datos = [:]
        b["version"] = Host.version
        b["idioma"] = Idioma.codigo
        b["plataforma"] = "movil"
        b["config"] = Config.leer()
        if let extra = estado { extra(b) { self.llamar("estado", $0) } } else { llamar("estado", b) }
    }

    private func guardarConfig(_ d: Datos) {
        let antes = Config.leer()
        let ahora = Config.guardar(d)
        if (antes["idioma_ui"] as? String) != (ahora["idioma_ui"] as? String) { Idioma.olvidar() }
        if (antes["tema"] as? String) != (ahora["tema"] as? String) { aplicarApariencia() }
        alCambiarConfig?(ahora, antes)
        if Idioma.elegido { iniciarTareas() }
    }

    /// Solo https (sin usuario ni clave), fuera de la app.
    public func abrirEnlace(_ valor: Any?) {
        guard let s = valor as? String, let u = URL(string: s), u.scheme == "https", u.host?.isEmpty == false, u.user == nil, u.password == nil else { return }
        UIApplication.shared.open(u)
    }

    public func copiar(_ valor: Any?) -> Bool {
        guard let t = valor as? String, !t.isEmpty, t.utf8.count <= 50 * 1024 * 1024 else { return false }
        UIPasteboard.general.string = t
        return true
    }
}

// MARK: - SwiftUI

extension Host {
    /// La interfaz a pantalla completa: `WindowGroup { Host.Vista() }`.
    public struct Vista: UIViewRepresentable {
        public init() {}
        public func makeUIView(context: Context) -> WKWebView { Puente.shared.crearWeb() }
        public func updateUIView(_ v: WKWebView, context: Context) {}
    }
}
