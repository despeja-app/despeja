// Despeja en el iPhone: lo que se ve en pantalla, siempre al día. Cuando cambia la biblioteca de fotos (borraste algo en Fotos,
// llegó una foto nueva, iOS terminó de borrar) o la app vuelve a primer plano, se actualizan los grupos y el respaldo y se
// avisa a la interfaz. Espera un momento antes de avisar para juntar varios cambios seguidos en uno.
import Photos
import UIKit

@MainActor
final class Vigia: NSObject, PHPhotoLibraryChangeObserver {
    static let shared = Vigia()
    private var avisar: (() -> Void)?
    private var mirando = false
    private var pendiente: DispatchWorkItem?

    /// Empieza a mirar (solo con permiso de Fotos ya dado: mirar no debe pedirlo).
    func empezar(_ avisar: @escaping () -> Void) {
        self.avisar = avisar
        NotificationCenter.default.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { _ in
            MainActor.assumeIsolated { Vigia.shared.mirarSiSePuede(); Vigia.shared.pronto() }
        }
        mirarSiSePuede()
    }

    private func mirarSiSePuede() {
        let e = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        guard !mirando, e == .authorized || e == .limited else { return }
        mirando = true
        PHPhotoLibrary.shared().register(self)
    }

    nonisolated func photoLibraryDidChange(_ cambio: PHChange) {
        Task { @MainActor in Vigia.shared.pronto() }
    }

    func pronto() {
        mirarSiSePuede()
        pendiente?.cancel()
        let t = DispatchWorkItem { [weak self] in self?.avisar?() }
        pendiente = t
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5, execute: t)
    }
}
