// Despeja en el iPhone: analizar la biblioteca y proponer qué borrar, agrupado. Todo se calcula en el teléfono; nada sale de ahí.
//
// Grupos (cada uno con lo que se propone borrar ya marcado y, si corresponde, lo que se guarda):
// - capturas: capturas de pantalla (todas marcadas: la persona decide).
// - repetidas: la misma imagen más de una vez (huella dHash 8×8 igual o casi igual). Se guarda una: la favorita, la de más
//   resolución o la más antigua; las demás marcadas.
// - parecidas: tomas seguidas de lo mismo (menos de 3 minutos entre una y otra y huellas cercanas). Se guarda la mejor (iOS 18:
//   la de mejor puntaje estético de Vision; antes, la favorita o la de más resolución); las demás marcadas.
// - rafagas: las fotos de una ráfaga que no son la elegida.
// - utiles: memes, documentos, recibos (iOS 18: Vision dice «isUtility»), solo entre imágenes sin ubicación (las del cámara
//   suelen tenerla). Sin marcar: es una sugerencia.
// - videos: de más de 100 MB, de mayor a menor. Sin marcar.
// Una foto favorita nunca se marca sola.
import Foundation
import Photos
import UIKit
import Vision

@MainActor
final class Limpieza {
    static let shared = Limpieza()

    struct Item { let id: String; let bytes: Int64; var marcada: Bool; let guardar: Bool }
    private(set) var grupos: [String: [Item]] = [:]
    private var analizando = false

    // MARK: Analizar

    func analizar(avance: @escaping @MainActor ([String: Any]) -> Void) async -> [String: Any] {
        guard await Limpieza.permiso() else {
            return ["ok": false, "codigo": "sin_permiso", "error": Idioma.t("Para ver tus fotos necesito permiso.")]
        }
        guard !analizando else { return ["ok": false, "codigo": "ocupado", "error": Idioma.t("Ya estoy analizando.")] }
        analizando = true
        defer { analizando = false }
        let r = await Task.detached(priority: .userInitiated) { Limpieza.calcular { hechos, total in
            Task { @MainActor in avance(["hechos": hechos, "total": total]) }
        } }.value
        grupos = r
        return ["ok": true, "grupos": resumen()]
    }

    /// {id: {n, bytes, marcadas, bytesMarcadas}} por grupo.
    func resumen() -> [String: Any] {
        var s: [String: Any] = [:]
        for (k, v) in grupos where !v.isEmpty {
            let m = v.filter(\.marcada)
            s[k] = ["n": v.count, "bytes": v.reduce(0) { $0 + $1.bytes }, "marcadas": m.count, "bytesMarcadas": m.reduce(0) { $0 + $1.bytes },
                    "guardadas": v.filter(\.guardar).count]
        }
        return s
    }

    nonisolated private static func permiso() async -> Bool {
        let e = await PHPhotoLibrary.requestAuthorization(for: .readWrite)
        return e == .authorized || e == .limited
    }

    nonisolated private static func bytes(_ a: PHAsset) -> Int64 {
        let r = PHAssetResource.assetResources(for: a)
        return r.reduce(Int64(0)) { $0 + ((($1.value(forKey: "fileSize") as? NSNumber)?.int64Value) ?? 0) }
    }

    nonisolated private static func calcular(_ avance: @escaping (Int, Int) -> Void) -> [String: [Item]] {
        let op = PHFetchOptions()
        op.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: true)]
        op.includeAllBurstAssets = true
        let todos = PHAsset.fetchAssets(with: op)
        var imagenes: [PHAsset] = [], videos: [PHAsset] = []
        todos.enumerateObjects { a, _, _ in
            if a.mediaType == .image { imagenes.append(a) } else if a.mediaType == .video { videos.append(a) }
        }
        var g: [String: [Item]] = [:]
        var tam: [String: Int64] = [:]
        func t(_ a: PHAsset) -> Int64 { if let x = tam[a.localIdentifier] { return x }; let x = bytes(a); tam[a.localIdentifier] = x; return x }

        // Capturas
        g["capturas"] = imagenes.filter { $0.mediaSubtypes.contains(.photoScreenshot) }
            .map { Item(id: $0.localIdentifier, bytes: t($0), marcada: !$0.isFavorite, guardar: false) }

        // Ráfagas: lo que no es la foto elegida de cada ráfaga
        g["rafagas"] = imagenes.filter { $0.burstIdentifier != nil && !$0.burstSelectionTypes.contains(.userPick) && !$0.representsBurst }
            .map { Item(id: $0.localIdentifier, bytes: t($0), marcada: !$0.isFavorite, guardar: false) }

        // Huellas (dHash) de todas las imágenes que no son capturas ni ráfagas: repetidas y parecidas
        let candidatas = imagenes.filter { !$0.mediaSubtypes.contains(.photoScreenshot) && $0.burstIdentifier == nil }
        let gestor = PHImageManager.default()
        let pedido = PHImageRequestOptions()
        pedido.isSynchronous = true
        pedido.deliveryMode = .fastFormat
        pedido.resizeMode = .fast
        pedido.isNetworkAccessAllowed = false     // solo lo que ya está en el iPhone: rápido y sin gastar datos
        var huellas: [String: UInt64] = [:]
        let total = candidatas.count
        for (i, a) in candidatas.enumerated() {
            autoreleasepool {
                _ = gestor.requestImage(for: a, targetSize: CGSize(width: 64, height: 64), contentMode: .aspectFill, options: pedido) { img, _ in
                    if let cg = img?.cgImage, let h = dHash(cg) { huellas[a.localIdentifier] = h }
                }
            }
            if i % 50 == 0 { avance(i, total) }
        }
        avance(total, total)

        // Repetidas: misma huella (distancia ≤ 2) en cualquier fecha
        var porHuella: [UInt64: [PHAsset]] = [:]
        for a in candidatas { if let h = huellas[a.localIdentifier] { porHuella[h, default: []].append(a) } }
        var repetidas: [Item] = [], yaEnGrupo = Set<String>()
        // Primero iguales exactas; después se juntan las que difieren en ≤ 2 bits (re-comprimidas al reenviarlas)
        var claves = Array(porHuella.keys)
        var unidas: [[PHAsset]] = []
        var usada = Set<UInt64>()
        claves.sort()
        for k in claves where !usada.contains(k) {
            var grupo = porHuella[k] ?? []
            usada.insert(k)
            for k2 in claves where !usada.contains(k2) && (k ^ k2).nonzeroBitCount <= 2 {
                grupo += porHuella[k2] ?? []
                usada.insert(k2)
            }
            if grupo.count > 1 { unidas.append(grupo) }
            if claves.count > 20000 { break }   // bibliotecas enormes: solo iguales exactas (lo de arriba ya las juntó)
        }
        for grupo in unidas {
            let mejor = grupo.max { puntaje($0) < puntaje($1) }!
            for a in grupo {
                let guardar = a == mejor
                repetidas.append(Item(id: a.localIdentifier, bytes: t(a), marcada: !guardar && !a.isFavorite, guardar: guardar))
                yaEnGrupo.insert(a.localIdentifier)
            }
        }
        g["repetidas"] = repetidas

        // Parecidas: tomas seguidas (≤ 3 min) con huellas cercanas (≤ 10 bits), sin las que ya están en «repetidas»
        var parecidas: [Item] = []
        var racha: [PHAsset] = []
        func cerrar() {
            if racha.count > 1 {
                let mejor = racha.max { puntaje($0) < puntaje($1) }!
                for a in racha { parecidas.append(Item(id: a.localIdentifier, bytes: t(a), marcada: a != mejor && !a.isFavorite, guardar: a == mejor)) }
            }
            racha = []
        }
        for a in candidatas where !yaEnGrupo.contains(a.localIdentifier) {
            guard let h = huellas[a.localIdentifier] else { cerrar(); continue }
            if let ultima = racha.last, let hu = huellas[ultima.localIdentifier],
               let f1 = ultima.creationDate, let f2 = a.creationDate, f2.timeIntervalSince(f1) <= 180, (h ^ hu).nonzeroBitCount <= 10 {
                racha.append(a)
            } else {
                cerrar()
                racha = [a]
            }
        }
        cerrar()
        g["parecidas"] = parecidas

        // Memes, documentos y recibos (iOS 18): imágenes sin ubicación que Vision considera «de utilidad»
        if #available(iOS 18.0, *) {
            var utiles: [Item] = []
            let sinUbicacion = candidatas.filter { $0.location == nil && !yaEnGrupo.contains($0.localIdentifier) }
            for a in sinUbicacion {
                autoreleasepool {
                    _ = gestor.requestImage(for: a, targetSize: CGSize(width: 360, height: 360), contentMode: .aspectFit, options: pedido) { img, _ in
                        guard let cg = img?.cgImage else { return }
                        let r = VNCalculateImageAestheticsScoresRequest()
                        try? VNImageRequestHandler(cgImage: cg).perform([r])
                        if let o = r.results?.first, o.isUtility {
                            utiles.append(Item(id: a.localIdentifier, bytes: t(a), marcada: false, guardar: false))
                        }
                    }
                }
            }
            g["utiles"] = utiles
        }

        // Videos grandes
        g["videos"] = videos.map { ($0, t($0)) }.filter { $0.1 > 100_000_000 }.sorted { $0.1 > $1.1 }
            .map { Item(id: $0.0.localIdentifier, bytes: $0.1, marcada: false, guardar: false) }
        return g
    }

    /// Para elegir cuál se guarda de un grupo: favorita > más resolución > más antigua.
    nonisolated private static func puntaje(_ a: PHAsset) -> Double {
        (a.isFavorite ? 1e12 : 0) + Double(a.pixelWidth * a.pixelHeight) - (a.creationDate?.timeIntervalSince1970 ?? 0) / 1e10
    }

    /// dHash 8×8: compara cada píxel con el de su derecha en una versión de 9×8 en gris. Igual para la misma imagen aunque cambie
    /// de tamaño o de compresión.
    nonisolated private static func dHash(_ img: CGImage) -> UInt64? {
        let w = 9, h = 8
        var px = [UInt8](repeating: 0, count: w * h)
        guard let ctx = CGContext(data: &px, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w,
                                  space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue) else { return nil }
        ctx.interpolationQuality = .medium
        ctx.draw(img, in: CGRect(x: 0, y: 0, width: w, height: h))
        var hash: UInt64 = 0
        for y in 0..<h { for x in 0..<(w - 1) { hash = (hash << 1) | (px[y * w + x] > px[y * w + x + 1] ? 1 : 0) } }
        return hash
    }

    // MARK: Ver y marcar

    /// Una página de miniaturas de un grupo: [{id, img (data:image/jpeg), bytes, marcada, guardar, video, fecha}].
    func pagina(_ grupo: String, desde: Int, cuantas: Int = 60) async -> [String: Any] {
        guard let lista = grupos[grupo] else { return ["ok": false, "codigo": "datos"] }
        let trozo = Array(lista.dropFirst(max(0, desde)).prefix(max(1, min(cuantas, 120))))
        let datos = await Task.detached(priority: .userInitiated) { () -> [[String: Any]] in
            let assets = PHAsset.fetchAssets(withLocalIdentifiers: trozo.map(\.id), options: nil)
            var porId: [String: PHAsset] = [:]
            assets.enumerateObjects { a, _, _ in porId[a.localIdentifier] = a }
            let op = PHImageRequestOptions()
            op.isSynchronous = true
            op.deliveryMode = .opportunistic
            op.resizeMode = .fast
            op.isNetworkAccessAllowed = true
            return trozo.compactMap { it in
                guard let a = porId[it.id] else { return nil }
                var img = ""
                autoreleasepool {
                    _ = PHImageManager.default().requestImage(for: a, targetSize: CGSize(width: 220, height: 220), contentMode: .aspectFill, options: op) { i, _ in
                        if let d = i?.jpegData(compressionQuality: 0.6) { img = "data:image/jpeg;base64," + d.base64EncodedString() }
                    }
                }
                return ["id": it.id, "img": img, "bytes": it.bytes, "marcada": it.marcada, "guardar": it.guardar,
                        "video": a.mediaType == .video, "duracion": Int(a.duration),
                        "fecha": a.creationDate.map { ISO8601DateFormatter().string(from: $0) } ?? ""]
            }
        }.value
        return ["ok": true, "grupo": grupo, "desde": desde, "total": lista.count, "items": datos]
    }

    /// Una foto en grande para decidir.
    func grande(_ id: String) async -> [String: Any] {
        let img = await Task.detached(priority: .userInitiated) { () -> String in
            guard let a = PHAsset.fetchAssets(withLocalIdentifiers: [id], options: nil).firstObject else { return "" }
            let op = PHImageRequestOptions()
            op.isSynchronous = true
            op.deliveryMode = .highQualityFormat
            op.isNetworkAccessAllowed = true
            var s = ""
            PHImageManager.default().requestImage(for: a, targetSize: CGSize(width: 1200, height: 1200), contentMode: .aspectFit, options: op) { i, _ in
                if let d = i?.jpegData(compressionQuality: 0.75) { s = "data:image/jpeg;base64," + d.base64EncodedString() }
            }
            return s
        }.value
        return ["ok": !img.isEmpty, "id": id, "img": img]
    }

    /// Marca o desmarca una foto, o todas las del grupo (las que se guardan nunca se marcan con «todas»).
    func marcar(_ grupo: String, id: String?, marcada: Bool?, todas: Bool?) {
        guard var lista = grupos[grupo] else { return }
        if let todas {
            for i in lista.indices { lista[i].marcada = todas && !lista[i].guardar }
        } else if let id, let marcada, let i = lista.firstIndex(where: { $0.id == id }) {
            lista[i].marcada = marcada
        }
        grupos[grupo] = lista
    }

    // MARK: Borrar

    /// Borra lo marcado de un grupo (iOS pregunta). Lo borrado sale de todos los grupos.
    func borrar(_ grupo: String) async -> [String: Any] {
        guard let lista = grupos[grupo] else { return ["ok": false, "codigo": "datos"] }
        let marcadas = lista.filter(\.marcada)
        guard !marcadas.isEmpty else { return ["ok": true, "borradas": 0, "bytes": 0, "grupos": resumen()] }
        let assets = PHAsset.fetchAssets(withLocalIdentifiers: marcadas.map(\.id), options: nil)
        do {
            try await PHPhotoLibrary.shared().performChanges { PHAssetChangeRequest.deleteAssets(assets) }
        } catch {
            return ["ok": false, "codigo": "cancelado", "error": Idioma.t("No se borró nada."), "grupos": resumen()]
        }
        let ids = Set(marcadas.map(\.id))
        for k in grupos.keys {
            grupos[k] = grupos[k]?.filter { !ids.contains($0.id) }
            // Un grupo de repetidas o parecidas que quedó con una sola foto ya no es grupo
            if (k == "repetidas" || k == "parecidas"), let l = grupos[k], l.count == 1 { grupos[k] = [] }
        }
        return ["ok": true, "grupo": grupo, "borradas": marcadas.count, "bytes": marcadas.reduce(0) { $0 + $1.bytes }, "grupos": resumen()]
    }
}
