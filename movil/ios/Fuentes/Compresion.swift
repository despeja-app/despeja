// Despeja en el iPhone: ahorrar sin borrar. Comprimir videos (HEVC hasta 1080p) y quitar el video escondido de las Live Photos.
// Siempre igual: se crea la versión nueva en la biblioteca con la misma fecha, ubicación y favorita, se comprueba que quedó, y
// recién ahí el original va a «Eliminados recientemente» (iOS pregunta una vez por tanda; ahí se puede recuperar 30 días).
// Si la versión nueva no ahorra al menos un 10 %, se descarta y el original no se toca.
import AVFoundation
import Foundation
import Photos

enum Compresion {
    struct Resultado { let nuevo: String; let ahorro: Int64 }

    /// Procesa una lista de fotos o videos y, al final, manda a «Eliminados recientemente» los originales que se reemplazaron.
    static func procesar(_ ids: [String], tipo: String, avance: @escaping @MainActor ([String: Any]) -> Void,
                         detenido: @escaping @MainActor () -> Bool) async -> [String: Any] {
        let assets = PHAsset.fetchAssets(withLocalIdentifiers: ids, options: nil)
        var lista: [PHAsset] = []
        assets.enumerateObjects { a, _, _ in lista.append(a) }
        var reemplazados: [PHAsset] = [], ahorro: Int64 = 0, fallas = 0
        for (i, a) in lista.enumerated() {
            if await detenido() { break }
            await avance(["hechos": i, "total": lista.count, "ahorro": ahorro])
            let r: Resultado? = tipo == "comprimir" ? await comprimir(a) : await sinVideo(a)
            if let r { reemplazados.append(a); ahorro += r.ahorro } else { fallas += 1 }
        }
        await avance(["hechos": lista.count, "total": lista.count, "ahorro": ahorro])
        guard !reemplazados.isEmpty else { return ["ok": true, "hechos": 0, "ahorro": 0, "fallas": fallas] }
        do {
            try await PHPhotoLibrary.shared().performChanges { PHAssetChangeRequest.deleteAssets(reemplazados as NSArray) }
            return ["ok": true, "hechos": reemplazados.count, "ahorro": ahorro, "fallas": fallas, "ids": reemplazados.map(\.localIdentifier)]
        } catch {
            // La persona dijo que no: quedan los dos (el original y la versión nueva). Se avisa para que decida.
            return ["ok": true, "hechos": reemplazados.count, "ahorro": 0, "fallas": fallas, "originalesQuedaron": true,
                    "ids": reemplazados.map(\.localIdentifier)]
        }
    }

    private static func tamano(_ a: PHAsset) -> Int64 {
        PHAssetResource.assetResources(for: a).reduce(Int64(0)) { $0 + ((($1.value(forKey: "fileSize") as? NSNumber)?.int64Value) ?? 0) }
    }

    /// Crea un asset nuevo desde un archivo, con la fecha, la ubicación y la favorita del original. Devuelve su id.
    private static func crear(desde url: URL, tipo: PHAssetResourceType, como original: PHAsset) async -> String? {
        var nuevo: String?
        do {
            try await PHPhotoLibrary.shared().performChanges {
                let r = PHAssetCreationRequest.forAsset()
                let op = PHAssetResourceCreationOptions()
                op.shouldMoveFile = false
                r.addResource(with: tipo, fileURL: url, options: op)
                r.creationDate = original.creationDate
                r.location = original.location
                r.isFavorite = original.isFavorite
                nuevo = r.placeholderForCreatedAsset?.localIdentifier
            }
        } catch { return nil }
        // Comprobar que quedó de verdad en la biblioteca antes de tocar el original.
        guard let id = nuevo, PHAsset.fetchAssets(withLocalIdentifiers: [id], options: nil).count == 1 else { return nil }
        return id
    }

    // MARK: Videos

    private static func comprimir(_ v: PHAsset) async -> Resultado? {
        let antes = tamano(v)
        let op = PHVideoRequestOptions()
        op.isNetworkAccessAllowed = true
        op.version = .current
        op.deliveryMode = .highQualityFormat
        let avasset: AVAsset? = await withCheckedContinuation { c in
            PHImageManager.default().requestAVAsset(forVideo: v, options: op) { a, _, _ in c.resume(returning: a) }
        }
        guard let avasset, let exp = AVAssetExportSession(asset: avasset, presetName: AVAssetExportPresetHEVC1920x1080) else { return nil }
        let salida = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".mov")
        defer { try? FileManager.default.removeItem(at: salida) }
        exp.shouldOptimizeForNetworkUse = false
        do { try await exp.export(to: salida, as: .mov) } catch { return nil }
        guard let despues = (try? FileManager.default.attributesOfItem(atPath: salida.path))?[.size] as? Int64,
              despues > 0, despues < antes * 9 / 10,
              await crear(desde: salida, tipo: .video, como: v) != nil else { return nil }
        return Resultado(nuevo: "", ahorro: antes - despues)
    }

    // MARK: Live Photos

    private static func sinVideo(_ a: PHAsset) async -> Resultado? {
        let recursos = PHAssetResource.assetResources(for: a)
        // La foto tal como se ve (con ediciones si las tiene); si no, la original.
        guard let foto = recursos.first(where: { $0.type == .fullSizePhoto }) ?? recursos.first(where: { $0.type == .photo }) else { return nil }
        let ext = (foto.originalFilename as NSString).pathExtension.isEmpty ? "heic" : (foto.originalFilename as NSString).pathExtension
        let tmp = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + "." + ext)
        defer { try? FileManager.default.removeItem(at: tmp) }
        let op = PHAssetResourceRequestOptions()
        op.isNetworkAccessAllowed = true
        let ok: Bool = await withCheckedContinuation { c in
            PHAssetResourceManager.default().writeData(for: foto, toFile: tmp, options: op) { e in c.resume(returning: e == nil) }
        }
        let antes = tamano(a)
        guard ok, let despues = (try? FileManager.default.attributesOfItem(atPath: tmp.path))?[.size] as? Int64, despues > 0,
              despues < antes * 9 / 10, await crear(desde: tmp, tipo: .photo, como: a) != nil else { return nil }
        return Resultado(nuevo: "", ahorro: antes - despues)
    }
}
