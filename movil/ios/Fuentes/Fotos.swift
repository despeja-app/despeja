// Despeja en el iPhone: cuántas fotos, videos y capturas hay y cuánto ocupan (PhotoKit). Corre fuera del hilo principal.
import Photos

enum Fotos {
    /// {ok, fotos, videos, capturas, tamano, soloEnIcloud} o {ok: false, codigo: "sin_permiso", error}.
    @MainActor
    static func resumen(_ listo: @escaping @MainActor ([String: Any]) -> Void) {
        PHPhotoLibrary.requestAuthorization(for: .readWrite) { estado in
            guard estado == .authorized || estado == .limited else {
                Task { @MainActor in
                    listo(["ok": false, "codigo": "sin_permiso", "error": Idioma.t("Para ver tus fotos necesito permiso.")])
                }
                return
            }
            DispatchQueue.global(qos: .userInitiated).async {
                let r = contar(limitado: estado == .limited)
                Task { @MainActor in listo(r) }
            }
        }
    }

    private static func contar(limitado: Bool) -> [String: Any] {
        let opciones = PHFetchOptions()
        opciones.includeHiddenAssets = false
        let todos = PHAsset.fetchAssets(with: opciones)
        var fotos = 0, videos = 0, capturas = 0, soloEnIcloud = 0
        var tamano: Int64 = 0
        todos.enumerateObjects { a, _, _ in
            switch a.mediaType {
            case .image:
                fotos += 1
                if a.mediaSubtypes.contains(.photoScreenshot) { capturas += 1 }
            case .video: videos += 1
            default: break
            }
            // El tamaño del original (lo que ocuparía respaldarlo). Si no está en el iPhone, cuenta como «solo en iCloud».
            let recursos = PHAssetResource.assetResources(for: a)
            if let original = recursos.first(where: { $0.type == .photo || $0.type == .video || $0.type == .fullSizePhoto }) ?? recursos.first {
                if let n = original.value(forKey: "fileSize") as? Int64 { tamano += n }
                if let local = original.value(forKey: "locallyAvailable") as? Bool, !local { soloEnIcloud += 1 }
            }
        }
        return ["ok": true, "fotos": fotos, "videos": videos, "capturas": capturas, "tamano": tamano,
                "soloEnIcloud": soloEnIcloud, "limitado": limitado]
    }
}
