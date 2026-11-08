// Despeja para Mac, sobre la pieza «host-tauri» (src/pieza/): la ventana con la interfaz de ui/, el puente con sus guardas,
// config e idioma desde app.json, menús, apariencia, actualizaciones y las acciones declaradas en acciones.json (iphoneEstado,
// iphoneApps, respaldoRecibir, planArmar, whatsapp…: solo corren un script de bin/). Aquí queda lo propio de Despeja: la
// carpeta donde quedan los respaldos y abrir el ajuste «Acceso total al disco». Reemplaza a app/Sources/Despeja (Swift).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod pieza;
#[path = "pieza/progreso.rs"]
mod progreso;
#[path = "pieza/actualizaciones.rs"]
mod actualizaciones;

use pieza::host::{arrancar, Opciones, OpcionesCarpeta};
use serde_json::json;
use std::sync::Arc;

fn main() {
    let op = Opciones {
        global: Some("Despeja".into()),
        sitio: Some("https://despeja-app.github.io/despeja/".into()),
        codigo: Some("https://github.com/despeja-app/despeja".into()),
        // Dónde quedan los respaldos (config.carpeta, "interfaz": false en app.json). Los scripts la reciben por el inyector
        // «carpetaActual»; sin carpeta, la acción responde este texto.
        carpeta: Some(OpcionesCarpeta {
            titulo: Some("Elige dónde guardar las fotos y videos del iPhone".into()),
            boton: Some("Guardar aquí".into()),
            falta: "Elige dónde guardar los respaldos.".into(),
            ..Default::default()
        }),
        // Pieza «trabajos»: el respaldo corre mientras late y avisa su avance (respaldoProgreso).
        lector_progreso: Some(Arc::new(progreso::Lector)),
        // Pieza «actualizaciones»: solo los Releases de despeja-app/despeja, con su .sha256.
        actualizaciones: actualizaciones::Actualizaciones::nuevas("despeja-app/despeja", "Despeja").ok().map(|a| Arc::new(a) as _),
        ..Default::default()
    };
    arrancar(tauri::generate_context!(), op, |host| {
        host.al_estado(|mut e, h| {
            if let Some(c) = h.carpeta_actual() {
                let nombre = c.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
                e.insert("destino".into(), json!({"nombre": nombre, "ruta": c.to_string_lossy()}));
            }
            e
        });
        host.registrar("elegirDestino", |_, h, _| {
            // Cancelar no cambia nada; igual se manda el estado, como antes.
            let _ = h.elegir_carpeta();
            h.enviar_estado();
        });
        // WhatsApp lee el respaldo local del Finder: macOS pide «Acceso total al disco». Se abre justo ese ajuste.
        host.registrar("abrirAccesoDisco", |_, _, _| {
            #[cfg(target_os = "macos")]
            {
                let _ = std::process::Command::new("/usr/bin/open")
                    .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles")
                    .spawn();
            }
        });
    });
}
