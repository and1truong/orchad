#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    io::{BufRead, BufReader, Write},
    process::{Child, ChildStdin, Command, Stdio},
    sync::{Arc, Mutex},
    time::Duration,
};
use tauri::{webview::WebviewBuilder, Manager, Webview, WebviewUrl};
use tokio::sync::oneshot;
#[derive(Default)]
struct Native {
    input: Mutex<Option<ChildStdin>>,
    child: Mutex<Option<Child>>,
    pending: Mutex<HashMap<String, oneshot::Sender<Value>>>,
    replies: Mutex<HashMap<String, Value>>,
    nonce: Mutex<Option<String>>,
    target: Mutex<Option<Value>>,
}
fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}
fn send(s: &Native, v: Value) -> Result<(), String> {
    let mut input = lock(&s.input).take().ok_or("Sidecar disconnected")?;
    let r = writeln!(input, "{}", v).map_err(|e| e.to_string());
    if r.is_ok() {
        *lock(&s.input) = Some(input);
    }
    r
}
fn trusted(w: &Webview) -> Result<(), String> {
    if w.label() != "host" {
        return Err("FORBIDDEN".into());
    }
    let u = w.url().map_err(|e| e.to_string())?;
    if !(u.scheme() == "tauri"
        || u.as_str().starts_with("http://tauri.localhost/")
        || u.as_str().starts_with("https://tauri.localhost/")
        || (cfg!(debug_assertions) && u.origin().ascii_serialization() == "http://127.0.0.1:1420"))
    {
        return Err("Untrusted host origin".into());
    }
    Ok(())
}
fn allowed(u: &url::Url) -> bool {
    u.origin().ascii_serialization() == "http://127.0.0.1:4314"
}
fn invalidate(app: &tauri::AppHandle) {
    let s = app.state::<Arc<Native>>();
    if let Some(t) = lock(&s.target).take() {
        let _ = send(&s, json!({"kind":"closed","targetId":t["targetId"]}));
    }
    lock(&s.replies).clear();
    *lock(&s.nonce) = None;
}
#[tauri::command]
async fn host_request(
    webview: Webview,
    state: tauri::State<'_, Arc<Native>>,
    mut request: Value,
) -> Result<Value, String> {
    trusted(&webview)?;
    if serde_json::to_vec(&request)
        .map_err(|e| e.to_string())?
        .len()
        > 65536
    {
        return Err("Payload too large".into());
    }
    let action = request["action"].as_str().ok_or("Missing action")?;
    let host = webview.window();
    if ["heartbeat", "decide", "pair"].contains(&action)
        && (!host.is_visible().unwrap_or(false) || host.is_minimized().unwrap_or(true))
    {
        return Err("Trusted UI is inactive".into());
    }
    if !["heartbeat", "pair", "revoke", "decide", "cancel", "tool"].contains(&action) {
        return Err("FORBIDDEN".into());
    }
    let id = request["id"]
        .as_str()
        .map(str::to_owned)
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    request["id"] = json!(id);
    let (tx, rx) = oneshot::channel();
    lock(&state.pending).insert(id.clone(), tx);
    if let Err(e) = send(&state, request) {
        lock(&state.pending).remove(&id);
        return Err(e);
    }
    // Must outlast the sidecar's worst-case policy budget (~10s approval wait
    // plus two 10s guest dispatches) so a late reply is never orphaned.
    let r = tokio::time::timeout(Duration::from_secs(45), rx).await;
    lock(&state.pending).remove(&id);
    match r {
        Ok(Ok(v)) => Ok(v),
        Ok(Err(_)) => Err("Disconnected".into()),
        Err(_) => Err("TIMEOUT".into()),
    }
}
#[tauri::command]
fn guest_reply(
    webview: Webview,
    state: tauri::State<'_, Arc<Native>>,
    id: String,
    result: Value,
    document_nonce: String,
) -> Result<(), String> {
    if webview.label() != "guest" || !allowed(&webview.url().map_err(|e| e.to_string())?) {
        return Err("FORBIDDEN".into());
    }
    if serde_json::to_vec(&result)
        .map_err(|e| e.to_string())?
        .len()
        > 65536
    {
        return Err("Payload too large".into());
    }
    let pinned = lock(&state.replies).remove(&id).ok_or("Unknown request")?;
    if lock(&state.target).as_ref() != Some(&pinned) {
        return Err("STALE_CONTEXT".into());
    }
    if pinned["appId"] != "" && lock(&state.nonce).as_ref() != Some(&document_nonce) {
        return Err("STALE_CONTEXT".into());
    }
    if pinned["appId"] == "" {
        if result["ok"] == true {
            let data = &result["data"];
            if !data["appId"].is_string()
                || !data["documentId"].is_string()
                || !data["revision"].is_u64()
            {
                return Err("Invalid context".into());
            }
            *lock(&state.nonce) = Some(document_nonce);
            let mut t = pinned.clone();
            t["appId"] = data["appId"].clone();
            t["documentId"] = data["documentId"].clone();
            *lock(&state.target) = Some(t.clone());
            return send(&state, json!({"kind":"binding","target":t}));
        }
        return Ok(());
    }
    send(&state, json!({"kind":"reply","id":id,"result":result}))
}
#[tauri::command]
async fn open_guest(webview: Webview, app: tauri::AppHandle, url: String) -> Result<(), String> {
    trusted(&webview)?;
    let u = url::Url::parse(&url).map_err(|e| e.to_string())?;
    if !allowed(&u) || !u.username().is_empty() || u.password().is_some() {
        return Err("Origin not allowlisted".into());
    }
    invalidate(&app);
    if let Some(old) = app.get_webview("guest") {
        old.close().map_err(|e| e.to_string())?;
    }
    let nav = app.clone();
    let load = app.clone();
    let window = app.get_window("host").ok_or("Host missing")?;
    let builder=WebviewBuilder::new("guest",WebviewUrl::External(u)).on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny).initialization_script("Object.defineProperty(window,'__coconutNonce',{value:crypto.randomUUID(),writable:false,configurable:false});").on_navigation(move |_|{invalidate(&nav);true}).on_page_load(move |guest,payload|{if matches!(payload.event(),tauri::webview::PageLoadEvent::Finished)&&allowed(payload.url()) {let t=json!({"targetId":uuid::Uuid::new_v4().to_string(),"pageInstanceId":uuid::Uuid::new_v4().to_string(),"origin":payload.url().origin().ascii_serialization(),"appId":"","documentId":"","title":payload.url().as_str()});let s=load.state::<Arc<Native>>();*lock(&s.target)=Some(t.clone());let id=uuid::Uuid::new_v4().to_string();lock(&s.replies).insert(id.clone(),t);let script=bridge_script(&id,"getContext",&Value::Null,None);let _=guest.eval(&script);}});
    window
        .add_child(
            builder,
            tauri::LogicalPosition::new(0.0, 70.0),
            tauri::LogicalSize::new(760.0, 730.0),
        )
        .map_err(|e| e.to_string())?;
    Ok(())
}
fn bridge_script(id: &str, op: &str, call: &Value, nonce: Option<String>) -> String {
    let request = json!({"id":id,"op":op,"call":call,"nonce":nonce});
    include_str!("../../host/bridge.js").replacen(
        "__REQUEST__",
        &serde_json::to_string(&request).unwrap(),
        1,
    )
}

fn main() {
    let state = Arc::new(Native::default());
    let setup_state = state.clone();
    tauri::Builder::default().manage(state).invoke_handler(tauri::generate_handler![open_guest,host_request,guest_reply]).setup(move |app|{let path=if cfg!(debug_assertions){std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../host/sidecar.mjs")}else{app.path().resource_dir()?.join("_up_/host/sidecar.bundle.mjs")};let mut child=Command::new("node").arg(path).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::inherit()).spawn()?;*lock(&setup_state.input)=child.stdin.take();let stdout=child.stdout.take().unwrap();*lock(&setup_state.child)=Some(child);let handle=app.handle().clone();let s=setup_state.clone();std::thread::spawn(move||{for line in BufReader::new(stdout).lines().map_while(Result::ok){let Ok(m)=serde_json::from_str::<Value>(&line)else{continue};let id=m["id"].as_str().unwrap_or("").to_owned();match m["kind"].as_str(){Some("response")=>{if let Some(tx)=s.pending.lock().unwrap().remove(&id){let _=tx.send(m["data"].clone());}},Some("dispatch-timeout")=>{lock(&s.replies).remove(&id);},Some("dispatch")=>{if m["operation"]=="invoke" && !handle.get_window("host").is_some_and(|w|w.is_visible().unwrap_or(false)&&!w.is_minimized().unwrap_or(true)){let _=send(&s,json!({"kind":"reply","id":id,"result":{"ok":false,"revision":null,"data":null,"error":{"code":"APPROVAL_DENIED","message":"Trusted UI inactive","retryable":false}}}));continue;}let t=m["target"].clone();if lock(&s.target).as_ref()!=Some(&t){let _=send(&s,json!({"kind":"reply","id":id,"result":{"ok":false,"revision":null,"data":null,"error":{"code":"STALE_CONTEXT","message":"Native binding changed","retryable":false}}}));continue;}if let Some(guest)=handle.get_webview("guest"){if guest.url().ok().as_ref().is_some_and(allowed){lock(&s.replies).insert(id.clone(),t);let _=guest.eval(&bridge_script(&id,m["operation"].as_str().unwrap_or(""),&m["call"],lock(&s.nonce).clone()));}}},_=>{}}}invalidate(&handle);});Ok(())}).on_window_event(|window,event|{if matches!(event,tauri::WindowEvent::Destroyed){invalidate(window.app_handle());let s=window.state::<Arc<Native>>();if let Some(child)=lock(&s.child).as_mut(){let _=child.kill();}}}).run(tauri::generate_context!()).expect("Coconut runtime");
}
