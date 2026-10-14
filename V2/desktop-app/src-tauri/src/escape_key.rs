//! Escape para cerrar la vista previa de un PDF.
//!
//! El visor de PDF de WebView2 retiene el teclado cuando el medico hace clic
//! dentro del documento: la tecla ya no llega a la pagina y Escape no cerraba
//! la vista previa. WebView2 avisa al anfitrion de las teclas aceleradoras de
//! todo el WebView (Escape siempre lo es) con `AcceleratorKeyPressed`; aqui se
//! escucha esa senal y se reenvia a la interfaz como evento. No se marca como
//! manejada: la pagina sigue recibiendo Escape cuando tiene el foco.

/// Evento que recibe la interfaz cuando se presiona Escape en la ventana.
pub const ESCAPE_EVENT: &str = "midoc://escape";

#[cfg(windows)]
pub fn watch(app: &tauri::App) {
    use tauri::{Emitter, Manager};
    use webview2_com::AcceleratorKeyPressedEventHandler;
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        COREWEBVIEW2_KEY_EVENT_KIND, COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN,
    };
    const VK_ESCAPE: u32 = 0x1B;

    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let handle = app.handle().clone();
    // Si no se puede registrar, la vista previa se sigue cerrando con el boton
    // o con clic fuera; no vale la pena impedir que la app arranque.
    let _ = window.with_webview(move |webview| {
        let handler = AcceleratorKeyPressedEventHandler::create(Box::new(move |_, args| {
            let Some(args) = args else {
                return Ok(());
            };
            let mut kind = COREWEBVIEW2_KEY_EVENT_KIND::default();
            let mut key = 0u32;
            // SAFETY: `args` es un puntero COM valido durante el callback.
            unsafe {
                args.KeyEventKind(&mut kind)?;
                args.VirtualKey(&mut key)?;
            }
            if kind == COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN && key == VK_ESCAPE {
                let _ = handle.emit(ESCAPE_EVENT, ());
            }
            Ok(())
        }));
        let mut token = 0i64;
        // SAFETY: el controlador pertenece a este WebView y vive mientras la ventana.
        let _ = unsafe {
            webview
                .controller()
                .add_AcceleratorKeyPressed(&handler, &mut token)
        };
    });
}

/// Fuera de Windows el visor de PDF no retiene el teclado de esta forma.
#[cfg(not(windows))]
pub fn watch(_app: &tauri::App) {}
