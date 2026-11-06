// Despeja en el iPhone: respaldar fotos y videos en el Mac (verificados) y, después, borrar del iPhone solo lo verificado.
//
// El Mac (bin/respaldo.py) anuncia `_despeja._tcp` en la red y muestra un código de 8 letras. Aquí:
// 1. Se busca el Mac (Bonjour) y la persona escribe el código. El código nunca viaja: de él sale la llave (PBKDF2, igual que en
//    el Mac) con la que se comprueba que el certificado TLS es el del Mac (su huella viene firmada) y se firma cada archivo.
// 2. Cada foto o video se manda con TODOS sus recursos (una Live Photo es foto + video; una editada trae el original y el
//    ajuste), cada uno con su SHA-256. Una foto queda «respaldada» solo cuando el Mac confirmó todos sus recursos.
// 3. Borrar quita del iPhone solo lo confirmado (iOS pregunta). Va a «Eliminados recientemente»: la persona lo vacía.
import CommonCrypto
import CryptoKit
import Foundation
import Network
import Photos

/// Una marca que solo se toca desde `Respaldo.cola` (serial).
private final class Una: @unchecked Sendable { var hecho = false }

@MainActor
final class Respaldo: NSObject {
    nonisolated static let cola = DispatchQueue(label: "despeja.respaldo")
    static let shared = Respaldo()

    private var buscador: NWBrowser?
    private var macs: [String: NWEndpoint] = [:]
    private var servidor: URL?           // https://IP:puerto
    private var clave: SymmetricKey?
    private var huella: String?          // la del certificado que el Mac firmó
    private var vista: String?           // la del certificado que presentó la conexión
    private var detener = false
    private lazy var sesion = URLSession(configuration: {
        let c = URLSessionConfiguration.ephemeral
        c.timeoutIntervalForRequest = 120
        c.timeoutIntervalForResource = 6 * 3600
        c.waitsForConnectivity = false
        return c
    }(), delegate: self, delegateQueue: nil)

    // MARK: Registro local de lo verificado (Application Support/Despeja/respaldados.json)

    private var archivoRegistro: URL { Host.datos.appendingPathComponent("respaldados.json") }
    private(set) lazy var respaldados: [String: [String: Any]] = (Archivos.leerJSON(archivoRegistro)["fotos"] as? [String: [String: Any]]) ?? [:]
    private func guardarRegistro() { Archivos.escribirJSON(archivoRegistro, ["fotos": respaldados]) }

    /// Lo que la interfaz necesita para pintar: cuántas hay respaldadas y cuánto liberaría borrarlas.
    func resumen() -> [String: Any] {
        let ids = Array(respaldados.keys)
        let quedan = ids.isEmpty ? 0 : PHAsset.fetchAssets(withLocalIdentifiers: ids, options: nil).count
        let bytes = respaldados.values.reduce(Int64(0)) { $0 + (($1["bytes"] as? NSNumber)?.int64Value ?? 0) }
        return ["respaldadas": ids.count, "enElIphone": quedan, "bytes": bytes, "mac": servidor != nil ? (macNombre ?? "") : ""]
    }
    private var macNombre: String?

    // MARK: 1. Buscar el Mac

    func buscar(_ listo: @escaping @MainActor ([String: Any]) -> Void) {
        buscador?.cancel()
        macs = [:]
        let b = NWBrowser(for: .bonjour(type: "_despeja._tcp", domain: nil), using: .tcp)
        b.browseResultsChangedHandler = { resultados, _ in
            Task { @MainActor in
                var m: [String: NWEndpoint] = [:]
                for r in resultados { if case let .service(nombre, _, _, _) = r.endpoint { m[nombre] = r.endpoint } }
                self.macs = m
                listo(["ok": true, "macs": m.keys.sorted()])
            }
        }
        b.stateUpdateHandler = { estado in
            if case .failed = estado {
                Task { @MainActor in listo(["ok": false, "codigo": "red", "error": Idioma.t("No pude buscar en tu red Wi-Fi. Revisa que Despeja tenga permiso de Red local en Ajustes.")]) }
            }
        }
        b.start(queue: .main)
        buscador = b
    }

    /// La dirección IPv4 del Mac elegido (URLSession necesita una URL).
    private func resolver(_ endpoint: NWEndpoint) async -> URL? {
        let p = NWParameters.tcp
        (p.defaultProtocolStack.internetProtocol as? NWProtocolIP.Options)?.version = .v4
        let c = NWConnection(to: endpoint, using: p)
        return await withCheckedContinuation { (cont: CheckedContinuation<URL?, Never>) in
            let una = Una()   // la conexión avisa varios estados: se responde una sola vez (todo en la misma cola)
            c.stateUpdateHandler = { estado in
                guard !una.hecho else { return }
                switch estado {
                case .ready:
                    una.hecho = true
                    var url: URL?
                    if case let .hostPort(host, puerto)? = c.currentPath?.remoteEndpoint {
                        let h = "\(host)".split(separator: "%").first.map(String.init) ?? "\(host)"
                        url = URL(string: "https://\(h.contains(":") ? "[\(h)]" : h):\(puerto.rawValue)")
                    }
                    c.cancel()
                    cont.resume(returning: url)
                case .failed, .cancelled:
                    una.hecho = true
                    cont.resume(returning: nil)
                default: break
                }
            }
            c.start(queue: Respaldo.cola)
        }
    }

    // MARK: 2. Conectar con el código

    func conectar(mac: String, codigo: String) async -> [String: Any] {
        let limpio = codigo.uppercased().filter { $0.isLetter || $0.isNumber }
        guard limpio.count == 8 else { return falla("codigo", "El código tiene 8 letras y números, como lo ves en tu Mac.") }
        guard let ep = macs[mac], let url = await resolver(ep) else { return falla("red", "No pude llegar a tu Mac. Revisa que estén en la misma red Wi-Fi.") }
        servidor = url
        huella = nil
        vista = nil
        let k = Respaldo.llave(limpio)
        do {
            let (d, _) = try await sesion.data(from: url.appendingPathComponent("hola"))
            guard let j = try JSONSerialization.jsonObject(with: d) as? [String: Any], let h = j["huella"] as? String,
                  let f = j["firma"] as? String, h == vista, Respaldo.firma(k, ["hola", h]) == f else {
                servidor = nil
                return falla("codigo", "El código no calza con el de tu Mac. Revísalo e intenta de nuevo.")
            }
            clave = k
            huella = h
            macNombre = (j["nombre"] as? String).map { String($0.prefix(60)) }
            return ["ok": true, "mac": macNombre ?? mac]
        } catch {
            servidor = nil
            return falla("red", "No pude conectarme con tu Mac. Revisa que Despeja esté esperando en el Mac.")
        }
    }

    // MARK: 3. Respaldar

    func respaldar(avance: @escaping @MainActor ([String: Any]) -> Void) async -> [String: Any] {
        guard let servidor, let clave else { return falla("sin_mac", "Primero conecta tu Mac.") }
        detener = false
        let opciones = PHFetchOptions()
        opciones.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: true)]
        let todos = PHAsset.fetchAssets(with: opciones)
        var fotos: [PHAsset] = []
        todos.enumerateObjects { a, _, _ in if a.mediaType == .image || a.mediaType == .video { fotos.append(a) } }

        // Qué ya tiene el Mac (por recurso): se retoma donde quedó.
        var recursos: [String: [(String, PHAssetResource)]] = [:]
        for a in fotos {
            recursos[a.localIdentifier] = PHAssetResource.assetResources(for: a).enumerated().map { ("\(a.localIdentifier)#\($0.offset)", $0.element) }
        }
        let tiene = await preguntarTiene(Array(recursos.values.joined().map(\.0)), servidor: servidor, clave: clave)
        let total = fotos.count
        var hechos = 0, fallas = 0, nuevos = 0
        var bytes: Int64 = 0
        for a in fotos {
            if detener { break }
            let lista = recursos[a.localIdentifier] ?? []
            var todoOk = !lista.isEmpty
            var bytesFoto: Int64 = 0
            for (id, r) in lista {
                if detener { todoOk = false; break }
                let tam = (r.value(forKey: "fileSize") as? NSNumber)?.int64Value ?? 0
                if tiene.contains(id) { bytesFoto += tam; continue }
                if let n = await mandar(r, id: id, fecha: a.creationDate, servidor: servidor, clave: clave) { bytesFoto += n; nuevos += 1 } else { todoOk = false }
            }
            hechos += 1
            if todoOk {
                respaldados[a.localIdentifier] = ["bytes": bytesFoto, "fecha": ISO8601DateFormatter().string(from: Date())]
                bytes += bytesFoto
            } else if !detener { fallas += 1 }
            if hechos % 5 == 0 || hechos == total {
                guardarRegistro()
                avance(["hechos": hechos, "total": total, "bytes": bytes, "fallas": fallas])
            }
        }
        guardarRegistro()
        if !detener { await terminarEnMac(servidor: servidor, clave: clave) }
        return ["ok": true, "hechos": hechos, "total": total, "nuevos": nuevos, "fallas": fallas, "detenido": detener, "resumen": resumen()]
    }

    func pararRespaldo() { detener = true }

    private func preguntarTiene(_ ids: [String], servidor: URL, clave: SymmetricKey) async -> Set<String> {
        guard let cuerpo = try? JSONSerialization.data(withJSONObject: ["ids": ids]) else { return [] }
        var q = URLRequest(url: servidor.appendingPathComponent("tiene"))
        q.httpMethod = "POST"
        q.setValue(Respaldo.firma(clave, ["tiene", Respaldo.sha(cuerpo)]), forHTTPHeaderField: "X-Despeja-Firma")
        guard let (d, r) = try? await sesion.upload(for: q, from: cuerpo), (r as? HTTPURLResponse)?.statusCode == 200,
              let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any] else { return [] }
        return Set((j["tiene"] as? [String]) ?? [])
    }

    /// Exporta un recurso a un archivo temporal (bajándolo de iCloud si hace falta), lo manda firmado y devuelve su tamaño si
    /// el Mac confirmó el mismo SHA-256.
    private func mandar(_ r: PHAssetResource, id: String, fecha: Date?, servidor: URL, clave: SymmetricKey) async -> Int64? {
        let tmp = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: tmp) }
        let op = PHAssetResourceRequestOptions()
        op.isNetworkAccessAllowed = true
        let escrito: Bool = await withCheckedContinuation { cont in
            PHAssetResourceManager.default().writeData(for: r, toFile: tmp, options: op) { error in cont.resume(returning: error == nil) }
        }
        guard escrito, let largo = (try? FileManager.default.attributesOfItem(atPath: tmp.path))?[.size] as? Int64,
              let sha = Respaldo.sha(archivo: tmp) else { return nil }
        let nombre = r.originalFilename.addingPercentEncoding(withAllowedCharacters: .alphanumerics.union(CharacterSet(charactersIn: "._-"))) ?? "archivo"
        let f = fecha.map { ISO8601DateFormatter().string(from: $0) } ?? ""
        var q = URLRequest(url: servidor.appendingPathComponent("archivo"))
        q.httpMethod = "POST"
        q.setValue(id, forHTTPHeaderField: "X-Despeja-Id")
        q.setValue(sha, forHTTPHeaderField: "X-Despeja-Sha256")
        q.setValue(nombre, forHTTPHeaderField: "X-Despeja-Nombre")
        q.setValue(f, forHTTPHeaderField: "X-Despeja-Fecha")
        q.setValue(Respaldo.firma(clave, ["archivo", id, sha, String(largo), nombre, f]), forHTTPHeaderField: "X-Despeja-Firma")
        for _ in 0..<2 {   // un corte de Wi-Fi: un reintento
            if let (d, resp) = try? await sesion.upload(for: q, fromFile: tmp), (resp as? HTTPURLResponse)?.statusCode == 200,
               let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any], j["ok"] as? Bool == true, j["sha256"] as? String == sha {
                return largo
            }
        }
        return nil
    }

    private func terminarEnMac(servidor: URL, clave: SymmetricKey) async {
        var q = URLRequest(url: servidor.appendingPathComponent("fin"))
        q.httpMethod = "POST"
        q.setValue(Respaldo.firma(clave, ["fin"]), forHTTPHeaderField: "X-Despeja-Firma")
        _ = try? await sesion.upload(for: q, from: Data())
    }

    // MARK: 4. Borrar lo verificado

    func borrar() async -> [String: Any] {
        let ids = Array(respaldados.keys)
        let assets = PHAsset.fetchAssets(withLocalIdentifiers: ids, options: nil)
        guard assets.count > 0 else { return ["ok": true, "borradas": 0, "bytes": 0] }
        var bytes: Int64 = 0
        var borrar: [String] = []
        assets.enumerateObjects { a, _, _ in
            borrar.append(a.localIdentifier)
            bytes += (self.respaldados[a.localIdentifier]?["bytes"] as? NSNumber)?.int64Value ?? 0
        }
        do {
            try await PHPhotoLibrary.shared().performChanges { PHAssetChangeRequest.deleteAssets(assets) }
            return ["ok": true, "borradas": borrar.count, "bytes": bytes, "resumen": resumen()]
        } catch {
            // La persona tocó «No permitir» en la pregunta de iOS: no es un error.
            return ["ok": false, "codigo": "cancelado", "error": Idioma.t("No se borró nada."), "resumen": resumen()]
        }
    }

    // MARK: Criptografía (las mismas reglas que bin/respaldo.py)

    nonisolated static func llave(_ codigo: String) -> SymmetricKey {
        var salida = [UInt8](repeating: 0, count: 32)
        let sal = Array("despeja-respaldo-1".utf8)
        _ = codigo.withCString { c in
            CCKeyDerivationPBKDF(CCPBKDFAlgorithm(kCCPBKDF2), c, strlen(c), sal, sal.count,
                                 CCPseudoRandomAlgorithm(kCCPRFHmacAlgSHA256), 200_000, &salida, salida.count)
        }
        return SymmetricKey(data: salida)
    }

    nonisolated static func firma(_ k: SymmetricKey, _ partes: [String]) -> String {
        HMAC<SHA256>.authenticationCode(for: Data(partes.joined(separator: "|").utf8), using: k).map { String(format: "%02x", $0) }.joined()
    }

    nonisolated static func sha(_ d: Data) -> String { SHA256.hash(data: d).map { String(format: "%02x", $0) }.joined() }

    nonisolated static func sha(archivo: URL) -> String? {
        guard let h = try? FileHandle(forReadingFrom: archivo) else { return nil }
        defer { try? h.close() }
        var s = SHA256()
        while let d = try? h.read(upToCount: 1 << 20), !d.isEmpty { s.update(data: d) }
        return s.finalize().map { String(format: "%02x", $0) }.joined()
    }

    private func falla(_ codigo: String, _ texto: String) -> [String: Any] { ["ok": false, "codigo": codigo, "error": Idioma.t(texto)] }
}

// MARK: TLS: se acepta solo el certificado cuya huella firmó el Mac con la llave del código

extension Respaldo: URLSessionDelegate {
    nonisolated func urlSession(_ session: URLSession, didReceive challenge: URLAuthenticationChallenge) async
        -> (URLSession.AuthChallengeDisposition, URLCredential?) {
        guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
              let confianza = challenge.protectionSpace.serverTrust,
              let cadena = SecTrustCopyCertificateChain(confianza) as? [SecCertificate], let hoja = cadena.first else {
            return (.cancelAuthenticationChallenge, nil)
        }
        let h = Respaldo.sha(SecCertificateCopyData(hoja) as Data)
        return await MainActor.run {
            if let esperada = self.huella {   // ya conectados: solo ese certificado
                return h == esperada ? (.useCredential, URLCredential(trust: confianza)) : (.cancelAuthenticationChallenge, nil)
            }
            self.vista = h                    // /hola: se acepta para leer la firma, que se revisa después
            return (.useCredential, URLCredential(trust: confianza))
        }
    }
}
