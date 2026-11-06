// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
import Foundation
import UIKit

// Pieza «host-ios»: la app de iPhone genérica (WKWebView). La misma interfaz de ui/ que en Mac, Windows y Linux, el mismo
// app.json, config.json e idioma; lo nativo de cada app (fotos, contactos…) se registra con `Puente.registrar`.
// En el iPhone no hay Python: las acciones declaradas (acciones.json) no corren aquí; la app las atiende en Swift o las pide
// al computador (pieza propia de cada app).

@MainActor
public enum Host {
    public struct Configuracion {
        /// El objeto de respuestas de la interfaz (`window.<App>`); por defecto el id con mayúscula.
        public var global: String?
        /// Página y código de la app (Acerca de).
        public var sitio: String?
        public var codigo: String?
        /// Carpeta con app.json y ui/ (para pruebas); por defecto `pieza/` dentro de la app.
        public var recursos: URL?
        public init(global: String? = nil, sitio: String? = nil, codigo: String? = nil, recursos: URL? = nil) {
            self.global = global; self.sitio = sitio; self.codigo = codigo; self.recursos = recursos
        }
    }

    public private(set) static var opciones = Configuracion()
    /// app.json tal cual (validado: id, nombre, config).
    public private(set) static var app: [String: Any] = [:]
    public private(set) static var id = ""
    public private(set) static var nombre = ""
    public private(set) static var recursos = URL(fileURLWithPath: "/")
    public private(set) static var datos = URL(fileURLWithPath: "/")
    private static var preparada = false

    /// Lee app.json y deja todo listo. false si la app no trae un app.json que sirva.
    @discardableResult
    public static func configurar(_ c: Configuracion = .init()) -> Bool {
        opciones = c
        guard let r = c.recursos ?? recursosEmpaquetados() else { return false }
        let a = Archivos.leerJSON(r.appendingPathComponent("app.json"))
        guard let i = a["id"] as? String, Texto.calza(i, "[a-z][a-z0-9]{0,30}") else { return false }
        var d = a
        if (d["nombre"] as? String ?? "").isEmpty { d["nombre"] = i.prefix(1).uppercased() + i.dropFirst() }
        if !(d["config"] is [String: Any]) { d["config"] = [String: Any]() }
        app = d
        id = i
        nombre = d["nombre"] as? String ?? i
        recursos = r
        // En el iPhone cada app tiene su propio espacio: los datos van en Application Support, fuera de los respaldos de iCloud
        // solo lo que la app marque (`excluirDeRespaldo`).
        guard let soporte = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else { return false }
        datos = soporte.appendingPathComponent(nombre, isDirectory: true)
        return true
    }

    /// `pieza/app.json` dentro de la app. En el iPhone la app es una carpeta plana y sin mayúsculas que distingan: una carpeta
    /// `<id>/` chocaría con el ejecutable `<Nombre>` (en Mac va en Contents/Resources/<id>/).
    private static func recursosEmpaquetados() -> URL? {
        guard let base = Bundle.main.resourceURL else { return nil }
        let r = base.appendingPathComponent("pieza", isDirectory: true)
        return Archivos.leerJSON(r.appendingPathComponent("app.json"))["id"] is String ? r : nil
    }

    /// La carpeta de datos, protegida mientras el iPhone está bloqueado (salvo el primer desbloqueo).
    public static func prepararDatos() {
        guard !preparada else { return }
        preparada = true
        try? FileManager.default.createDirectory(at: datos, withIntermediateDirectories: true,
                                                 attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
    }

    /// Prefijo de las variables («ana» → «ANA_»): el mismo que usan las otras plataformas en la interfaz (`window.ANA_HOST`).
    public static var prefijo: String { id.uppercased() + "_" }

    /// La versión de la app (Info.plist).
    public static var version: String { Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "" }

    /// Configura y deja que la app registre lo suyo, una sola vez. Se llama en el `init` de la app de SwiftUI; la ventana es
    /// `Host.Vista()`.
    public static func arrancar(_ c: Configuracion = .init(), preparar: @MainActor (Puente) -> Void) {
        guard app.isEmpty else { return }
        guard configurar(c) else { fatalError("No encontré un app.json que sirva dentro de la app (pieza/app.json).") }
        prepararDatos()
        preparar(Puente.shared)
        Puente.shared.observarCiclo()
    }
}

// MARK: - Archivos y texto (las mismas reglas que host-mac)

public enum Archivos {
    public static func leerJSON(_ url: URL, maximo: Int = 50 * 1024 * 1024) -> [String: Any] {
        guard let tam = (try? FileManager.default.attributesOfItem(atPath: url.path))?[.size] as? Int, tam <= maximo,
              let d = try? Data(contentsOf: url), let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any] else { return [:] }
        return j
    }

    /// JSON con claves ordenadas, escrito de una vez y protegido con la clave del iPhone.
    @discardableResult
    public static func escribirJSON(_ url: URL, _ valor: Any) -> Bool {
        try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        guard JSONSerialization.isValidJSONObject(valor),
              let d = try? JSONSerialization.data(withJSONObject: valor, options: [.prettyPrinted, .sortedKeys]),
              (try? d.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])) != nil else { return false }
        return true
    }
}

public enum Texto {
    /// Nombre de una acción o de una respuesta (el mismo que `Enchufe.nombre` en Mac y `ACCION` en host-ui).
    public static let accion = "[A-Za-z][A-Za-z0-9]{0,40}"

    public static func calza(_ s: String, _ patron: String) -> Bool {
        guard let re = try? NSRegularExpression(pattern: "^(?:\(patron))$") else { return false }
        return re.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)) != nil
    }

    public static func esBool(_ v: Any?) -> Bool {
        guard let v else { return false }
        return CFGetTypeID(v as CFTypeRef) == CFBooleanGetTypeID()
    }

    public static func entero(_ v: Any?) -> Int? {
        guard let n = v as? NSNumber, !esBool(n) else { return nil }
        let d = n.doubleValue
        guard d.rounded() == d, abs(d) < 9_007_199_254_740_992 else { return nil }
        return n.intValue
    }

    public static func global(_ id: String) -> String { id.prefix(1).uppercased() + id.dropFirst() }
}

// MARK: - Configuración (config.json en la carpeta de datos; mismas reglas que nucleo y host-mac)

@MainActor
public enum Config {
    public static var ruta: URL { Host.datos.appendingPathComponent("config.json") }
    public static var reglas: [String: Any] { Host.app["config"] as? [String: Any] ?? [:] }

    public static func leer() -> [String: Any] { limpiar(Archivos.leerJSON(ruta, maximo: 1024 * 1024)) }

    public static func limpiar(_ d: [String: Any]) -> [String: Any] {
        let r = reglas
        return d.filter { k, v in r[k].map { valida($0, v) } ?? false }
    }

    @discardableResult
    public static func guardar(_ cambios: [String: Any], desdeInterfaz: Bool = true) -> [String: Any] {
        let r = reglas
        let soloDeLaApp = { (k: String) -> Bool in
            guard let regla = r[k] as? [String: Any], let i = regla["interfaz"], Texto.esBool(i) else { return false }
            return (i as? Bool) == false
        }
        let limpios = limpiar(cambios).filter { k, _ in !(desdeInterfaz && soloDeLaApp(k)) }
        Host.prepararDatos()
        var d = Archivos.leerJSON(ruta, maximo: 1024 * 1024)
        for (k, v) in limpios { d[k] = v }
        Archivos.escribirJSON(ruta, d)
        return leer()
    }

    public static func texto(_ clave: String) -> String { (leer()[clave] as? String) ?? "" }

    public static func valida(_ regla: Any, _ valor: Any) -> Bool {
        if let r = regla as? [String: Any] {
            let max = Texto.entero(r["max"]).flatMap { $0 > 0 && $0 <= 5 * 1024 * 1024 ? $0 : nil } ?? 2000
            if r["tipo"] as? String == "texto", let patron = r["patron"] as? String {
                guard let s = valor as? String, s.count <= max else { return false }
                return Texto.calza(s, patron)
            }
            if r["tipo"] as? String == "texto", Texto.entero(r["max"]) != nil {
                guard let s = valor as? String else { return false }
                return s.count <= max
            }
            return r["tipo"].map { valida($0, valor) } ?? false
        }
        if let lista = regla as? [Any] {
            if let s = valor as? String { return lista.contains { ($0 as? String) == s } }
            if Texto.esBool(valor) { return false }
            if let n = valor as? NSNumber { return lista.contains { ($0 as? NSNumber).map { !Texto.esBool($0) && $0 == n } ?? false } }
            return false
        }
        switch regla as? String {
        case "bool": return Texto.esBool(valor)
        case "texto": return (valor as? String).map { $0.count <= 2000 } ?? false
        case "numero": return (valor as? NSNumber).map { !Texto.esBool($0) && $0.doubleValue.isFinite } ?? false
        default: return false
        }
    }
}

// MARK: - Idioma (las claves son el texto en español, igual que en ui/idiomas)

@MainActor
public enum Idioma {
    private static var cache: (codigo: String, textos: [String: String])?

    public static var idiomas: [String] {
        let l = (Config.reglas["idioma_ui"] as? [Any] ?? []).compactMap { $0 as? String }.filter { Texto.calza($0, "[a-z]{2,3}") }
        return l.isEmpty ? ["es", "en"] : l
    }

    public static var codigo: String {
        let lista = idiomas
        let e = Config.texto("idioma_ui")
        if lista.contains(e) { return e }
        let s = String((Locale.preferredLanguages.first ?? "").prefix(2)).lowercased()
        if lista.contains(s) { return s }
        return lista.contains("en") ? "en" : lista[0]
    }

    /// Ya hay idioma: lo eligió o terminó la bienvenida. Antes, nada corre solo ni se pide (ni permisos).
    public static var elegido: Bool {
        let c = Config.leer()
        return !Config.texto("idioma_ui").isEmpty || (Texto.esBool(c["bienvenida"]) && (c["bienvenida"] as? Bool) == true)
    }

    public static func t(_ texto: String) -> String {
        let c = codigo
        guard c != "es" else { return texto }
        if cache?.codigo != c {
            let j = Archivos.leerJSON(Host.recursos.appendingPathComponent("ui/idiomas/\(c).json"), maximo: 5 * 1024 * 1024)
            cache = (c, j["textos"] as? [String: String] ?? [:])
        }
        return cache?.textos[texto] ?? texto
    }

    public static func f(_ plantilla: String, _ valores: [String: String]) -> String {
        var t = self.t(plantilla)
        for (k, v) in valores { t = t.replacingOccurrences(of: "{\(k)}", with: v) }
        return t
    }

    public static func olvidar() { cache = nil }
}
