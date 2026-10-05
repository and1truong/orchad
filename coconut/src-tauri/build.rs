fn main() {
    // Single trusted app-origin for the guest webview, shared with the
    // generated guest capability and the sidebar launcher default.
    let origin = std::fs::read_to_string("../trusted-origin.txt")
        .expect("trusted-origin.txt missing")
        .trim()
        .to_owned();
    assert!(
        (origin.starts_with("http://") || origin.starts_with("https://"))
            && !origin.contains(' ')
            && origin.matches('/').count() == 2,
        "trusted origin must be a bare http(s) origin, got {origin:?}"
    );
    println!("cargo:rustc-env=TRUSTED_APP_ORIGIN={origin}");
    println!("cargo:rerun-if-changed=../trusted-origin.txt");
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "open_guest",
            "discover_guest",
            "host_request",
            "guest_reply",
        ]),
    ))
    .expect("Tauri build");
}
