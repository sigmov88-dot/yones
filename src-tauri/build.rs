use std::process::Command;

fn main() {
    tauri_build::build();

    if std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default() == "windows" {
        let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
        let res_file = format!("{}/app_manifest.o", manifest_dir);
        let _ = Command::new("windres")
            .current_dir(&manifest_dir)
            .args(&["app.rc", "-o", "app_manifest.o"])
            .status();
        println!("cargo:rustc-link-arg={}", res_file);
    }
}
