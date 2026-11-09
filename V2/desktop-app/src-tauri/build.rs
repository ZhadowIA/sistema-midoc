fn main() {
    copy_sherpa_dlls_next_to_test_binaries();
    tauri_build::build()
}

/// Con `diarization-local` en Windows, el build script de `sherpa-onnx-sys` deja
/// las DLL de sherpa-onnx en `target/<perfil>/`, junto al ejecutable de la app,
/// pero no en `target/<perfil>/deps/`, donde viven los ejecutables de las pruebas.
/// Ahi Windows encontraba otra `onnxruntime.dll` (System32 trae una de 2.8 KB) y la
/// prueba no arrancaba (0xc000007b). Se copian tambien a `deps/`. Al instalador no
/// le afecta: lleva sus propias DLL verificadas (`scripts/tauri-diarize.mjs`).
fn copy_sherpa_dlls_next_to_test_binaries() {
    const DLLS: [&str; 4] = [
        "onnxruntime.dll",
        "onnxruntime_providers_shared.dll",
        "sherpa-onnx-c-api.dll",
        "sherpa-onnx-cxx-api.dll",
    ];
    if std::env::var_os("CARGO_FEATURE_DIARIZATION_LOCAL").is_none()
        || std::env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("windows")
    {
        return;
    }
    // OUT_DIR = target/<perfil>/build/<crate>-<hash>/out
    let Some(out_dir) = std::env::var_os("OUT_DIR") else {
        return;
    };
    let Some(profile_dir) = std::path::Path::new(&out_dir).ancestors().nth(3) else {
        return;
    };
    let deps_dir = profile_dir.join("deps");
    for dll in DLLS {
        let source = profile_dir.join(dll);
        println!("cargo:rerun-if-changed={}", source.display());
        if !source.is_file() {
            continue;
        }
        let target = deps_dir.join(dll);
        // Borrar antes de copiar: si `target` fuera un hard link a otra copia (los
        // build scripts de sherpa los usan), copiar encima escribiria a traves de el.
        let _ = std::fs::remove_file(&target);
        if let Err(error) = std::fs::copy(&source, &target) {
            println!("cargo:warning=no se pudo copiar {dll} a deps: {error}");
        }
    }
}
