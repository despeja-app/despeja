// Despeja en el iPhone: ver un video de la biblioteca antes de decidir (el reproductor del sistema, a pantalla completa).
// También los que están solo en iCloud: se bajan para verlos.
import AVKit
import Photos
import UIKit

@MainActor
enum Reproductor {
    static func ver(_ id: String, _ listo: @escaping @MainActor ([String: Any]) -> Void) {
        guard let a = PHAsset.fetchAssets(withLocalIdentifiers: [id], options: nil).firstObject, a.mediaType == .video else {
            return listo(["ok": false, "id": id])
        }
        let op = PHVideoRequestOptions()
        op.isNetworkAccessAllowed = true
        op.deliveryMode = .automatic
        PHImageManager.default().requestPlayerItem(forVideo: a, options: op) { item, _ in
            Task { @MainActor in
                guard let item, let raiz = arriba() else { return listo(["ok": false, "id": id]) }
                let vc = AVPlayerViewController()
                vc.player = AVPlayer(playerItem: item)
                raiz.present(vc, animated: true) { vc.player?.play() }
                listo(["ok": true, "id": id])
            }
        }
    }

    /// La pantalla que está encima de todo (para presentar el reproductor sobre la interfaz).
    private static func arriba() -> UIViewController? {
        let escena = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first { $0.activationState == .foregroundActive }
            ?? UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        var vc = escena?.windows.first { $0.isKeyWindow }?.rootViewController ?? escena?.windows.first?.rootViewController
        while let p = vc?.presentedViewController { vc = p }
        return vc
    }
}
