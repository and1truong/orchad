#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    io::{BufRead, BufReader, Write},
    process::{Child, ChildStdin, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Condvar, Mutex,
    },
    time::Duration,
};
use tauri::{webview::WebviewBuilder, Emitter, Manager, Webview, WebviewUrl};
use tokio::sync::oneshot;
#[derive(Default)]
struct Native {
    input: Mutex<Option<ChildStdin>>,
    input_cv: Condvar,
    input_dead: AtomicBool,
    child: Mutex<Option<Child>>,
    pending: Mutex<HashMap<String, oneshot::Sender<Value>>>,
    replies: Mutex<HashMap<String, (Value, String)>>,
    nonce: Mutex<Option<String>>,
    target: Mutex<Option<Value>>,
}
fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}
fn send(s: &Native, v: Value) -> Result<(), String> {
    // Writes serialize by temporarily removing the stdin handle; a concurrent
    // caller waits (bounded) for it to be restored instead of failing spuriously.
    // input_dead records a failed write so later callers fail fast instead of
    // blocking on a handle that will never be restored.
    smoke_note("send", v["kind"].as_str().unwrap_or(""));
    if s.input_dead.load(Ordering::SeqCst) {
        return Err("Sidecar disconnected".into());
    }
    let guard = lock(&s.input);
    let (mut guard, _) = s
        .input_cv
        .wait_timeout_while(guard, Duration::from_secs(30), |o| {
            o.is_none() && !s.input_dead.load(Ordering::SeqCst)
        })
        .unwrap_or_else(|e| e.into_inner());
    let mut input = guard.take().ok_or("Sidecar disconnected")?;
    drop(guard);
    let r = writeln!(input, "{}", v).map_err(|e| e.to_string());
    if r.is_ok() {
        *lock(&s.input) = Some(input);
    } else {
        // Dead must change under the same mutex the wait predicate reads, or a
        // waiter can park after the notify and sleep out the full timeout.
        let _g = lock(&s.input);
        s.input_dead.store(true, Ordering::SeqCst);
    }
    s.input_cv.notify_all();
    r
}
fn trusted(w: &Webview) -> Result<(), String> {
    trusted_parts(w.label(), &w.url().map_err(|e| e.to_string())?)
}

// COCONUT_SMOKE=1 (debug builds only) opens a loopback control channel and
// emits `COCONUT_SMOKE:` markers on stderr so the native acceptance lane can
// assert on real runtime events — never compiled into release builds and
// never reachable outside 127.0.0.1.
fn smoke_on() -> bool {
    cfg!(debug_assertions) && std::env::var("COCONUT_SMOKE").ok().as_deref() == Some("1")
}
fn smoke_note(kind: &str, detail: &str) {
    if smoke_on() {
        eprintln!("COCONUT_SMOKE:{}:{}", kind, detail);
    }
}
// Pure form of `trusted()` so the gating predicates are unit-testable without
// a Tauri runtime: host label + expected host-webview origins.
fn trusted_parts(label: &str, u: &url::Url) -> Result<(), String> {
    if label != "host" {
        return Err("FORBIDDEN".into());
    }
    if !(u.scheme() == "tauri"
        || u.as_str().starts_with("http://tauri.localhost/")
        || u.as_str().starts_with("https://tauri.localhost/")
        || (cfg!(debug_assertions) && u.origin().ascii_serialization() == "http://127.0.0.1:1420"))
    {
        return Err("Untrusted host origin".into());
    }
    Ok(())
}
// Trusted app origin: single value from coconut/trusted-origin.txt, embedded
// at build time and shared by native authorization, the generated guest
// capability and the sidebar launcher default.
const TRUSTED_APP_ORIGIN: &str = env!("TRUSTED_APP_ORIGIN");
fn allowed(u: &url::Url) -> bool {
    allowed_at(u, TRUSTED_APP_ORIGIN)
}
fn allowed_at(u: &url::Url, trusted_origin: &str) -> bool {
    u.origin().ascii_serialization() == trusted_origin
}

// Action gate for `host_request`: privileged actions (heartbeat/decide/
// pair/consent — anything that grants or keeps authority alive) additionally
// require an active trusted UI.
fn action_allowed(action: &str, host_active: bool) -> Result<(), String> {
    if ["heartbeat", "decide", "pair", "consent"].contains(&action) && !host_active {
        return Err("Trusted UI is inactive".into());
    }
    if ![
        "heartbeat",
        "pair",
        "revoke",
        "decide",
        "cancel",
        "tool",
        "consent",
    ]
    .contains(&action)
    {
        return Err("FORBIDDEN".into());
    }
    Ok(())
}

// Predicates for `guest_reply`: whether a provisional-binding context reply
// carries a valid context payload.
fn valid_context_data(data: &Value) -> bool {
    data["appId"].is_string() && data["documentId"].is_string() && data["revision"].is_u64()
}

// Whether a bound-app getContext reply signals an SPA rebind (documentId or
// sessionEpoch changed for the same app). Tool results never rebind.
fn rebind_needed(op: &str, result: &Value, pinned: &Value) -> Option<Value> {
    if op != "getContext" || result["ok"] != true || result["data"]["appId"] != pinned["appId"] {
        return None;
    }
    let epoch = result["data"]
        .get("sessionEpoch")
        .cloned()
        .unwrap_or(Value::Null);
    let doc_changed = result["data"]["documentId"].is_string()
        && result["data"]["documentId"] != pinned["documentId"];
    let epoch_changed = epoch != pinned.get("sessionEpoch").cloned().unwrap_or(Value::Null);
    if !(doc_changed || epoch_changed) {
        return None;
    }
    let mut t = pinned.clone();
    if result["data"]["documentId"].is_string() {
        t["documentId"] = result["data"]["documentId"].clone();
    }
    t["sessionEpoch"] = epoch;
    Some(t)
}
fn invalidate(s: &Native) {
    if let Some(t) = lock(&s.target).take() {
        let _ = send(s, json!({"kind":"closed","targetId":t["targetId"]}));
    }
    lock(&s.replies).clear();
    *lock(&s.nonce) = None;
}
// Shared request path for the sidebar command and the smoke control
// channel: same cap, same action gate, same kind-stripping, same sidecar
// round-trip. host_active arrives precomputed so each caller applies its own
// UI-visibility source (the command uses the calling webview's window).
async fn dispatch_request(
    state: &Arc<Native>,
    mut request: Value,
    host_active: bool,
) -> Result<Value, String> {
    if serde_json::to_vec(&request)
        .map_err(|e| e.to_string())?
        .len()
        > 65536
    {
        return Err("Payload too large".into());
    }
    let action = request["action"].as_str().ok_or("Missing action")?;
    action_allowed(action, host_active)?;
    // Sidebar requests are action-only; 'kind' envelopes are native->sidecar
    // events (binding/reply/closed/dispatch) and must not be injectable.
    if let Some(o) = request.as_object_mut() {
        o.remove("kind");
    }
    let id = request["id"]
        .as_str()
        .map(str::to_owned)
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    request["id"] = json!(id);
    let (tx, rx) = oneshot::channel();
    lock(&state.pending).insert(id.clone(), tx);
    if let Err(e) = send(state, request) {
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
async fn host_request(
    webview: Webview,
    state: tauri::State<'_, Arc<Native>>,
    request: Value,
) -> Result<Value, String> {
    trusted(&webview)?;
    let host = webview.window();
    dispatch_request(
        &state,
        request,
        host.is_visible().unwrap_or(false) && !host.is_minimized().unwrap_or(true),
    )
    .await
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
    let (pinned, op) = lock(&state.replies).remove(&id).ok_or("Unknown request")?;
    if lock(&state.target).as_ref() != Some(&pinned) {
        return Err("STALE_CONTEXT".into());
    }
    if pinned["appId"] != "" && lock(&state.nonce).as_ref() != Some(&document_nonce) {
        return Err("STALE_CONTEXT".into());
    }
    if pinned["appId"] == "" {
        if result["ok"] == true {
            let data = &result["data"];
            if !valid_context_data(data) {
                return Err("Invalid context".into());
            }
            *lock(&state.nonce) = Some(document_nonce);
            let mut t = pinned.clone();
            t["appId"] = data["appId"].clone();
            t["documentId"] = data["documentId"].clone();
            // Pin the app's opaque session epoch (null when the app binds no
            // session) into the binding so a later login, logout, account
            // switch or session rotation is detected as identity change.
            t["sessionEpoch"] = data.get("sessionEpoch").cloned().unwrap_or(Value::Null);
            *lock(&state.target) = Some(t.clone());
            return send(&state, json!({"kind":"binding","target":t}));
        }
        return Ok(());
    }
    // Rebind without navigation: a getContext reply reports a different
    // documentId or a changed sessionEpoch for the same app. Rotation, not a
    // patch — the new document/session gets a fresh pageInstanceId, and
    // installing the new binding before forwarding makes the sidecar revoke
    // the old identity's authority (pairings, cached tools, pending
    // approvals) before it can see or act on this reply. Only context
    // replies may rebind — a tool result carrying these fields is data, not
    // a claim that the active document or session changed.
    if let Some(mut t) = rebind_needed(&op, &result, &pinned) {
        t["pageInstanceId"] = json!(uuid::Uuid::new_v4().to_string());
        *lock(&state.target) = Some(t.clone());
        let _ = send(&state, json!({"kind":"binding","target":t}));
    }
    send(&state, json!({"kind":"reply","id":id,"result":result}))
}
// Trusted re-discovery for the current guest: an SPA login or a late
// bridge install never triggers a page load, so a page whose first probe
// failed would otherwise stay undiscoverable. Re-probing is allowed only
// while the binding is provisional or absent — never silently rebinds a
// live target — and dispatches a bare getContext, so nothing pending can
// replay as part of rediscovery. Shared by the sidebar command and the
// smoke control channel.
fn do_discover_guest(app: &tauri::AppHandle) -> Result<(), String> {
    let Some(guest) = app.get_webview("guest") else {
        return Err("No guest".into());
    };
    let state = app.state::<Arc<Native>>();
    let u = guest.url().map_err(|e| e.to_string())?;
    if !allowed(&u) {
        return Err("Origin not allowlisted".into());
    }
    if lock(&state.target)
        .as_ref()
        .is_some_and(|t| t["appId"] != "")
    {
        return Err("Target already bound".into());
    }
    let t = json!({"targetId":uuid::Uuid::new_v4().to_string(),"pageInstanceId":uuid::Uuid::new_v4().to_string(),"origin":u.origin().ascii_serialization(),"appId":"","documentId":"","sessionEpoch":null,"title":u.as_str()});
    *lock(&state.target) = Some(t.clone());
    let id = uuid::Uuid::new_v4().to_string();
    lock(&state.replies).insert(id.clone(), (t, "getContext".to_string()));
    let _ = guest.eval(&bridge_script(&id, "getContext", &Value::Null, None));
    Ok(())
}
#[tauri::command]
fn discover_guest(webview: Webview, app: tauri::AppHandle) -> Result<(), String> {
    trusted(&webview)?;
    do_discover_guest(&app)
}
// The guest-open path minus the trust gate, so both the sidebar command and
// the smoke control channel run the identical code.
fn do_open_guest(app: &tauri::AppHandle, url: String) -> Result<(), String> {
    let u = url::Url::parse(&url).map_err(|e| e.to_string())?;
    if !allowed(&u) || !u.username().is_empty() || u.password().is_some() {
        return Err("Origin not allowlisted".into());
    }
    invalidate(&app.state::<Arc<Native>>());
    if let Some(old) = app.get_webview("guest") {
        old.close().map_err(|e| e.to_string())?;
    }
    let load = app.clone();
    let window = app.get_window("host").ok_or("Host missing")?;
    let builder=WebviewBuilder::new("guest",WebviewUrl::External(u)).on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny).initialization_script("Object.defineProperty(window,'__coconutNonce',{value:crypto.randomUUID(),writable:false,configurable:false});").on_navigation(|_|true).on_page_load(move |guest,payload|{match payload.event(){tauri::webview::PageLoadEvent::Started=>{smoke_note("guest","started");invalidate(&load.state::<Arc<Native>>())},tauri::webview::PageLoadEvent::Finished=>{smoke_note("guest","finished");if allowed(payload.url()) {let t=json!({"targetId":uuid::Uuid::new_v4().to_string(),"pageInstanceId":uuid::Uuid::new_v4().to_string(),"origin":payload.url().origin().ascii_serialization(),"appId":"","documentId":"","sessionEpoch":null,"title":payload.url().as_str()});let s=load.state::<Arc<Native>>();*lock(&s.target)=Some(t.clone());let id=uuid::Uuid::new_v4().to_string();lock(&s.replies).insert(id.clone(),(t, "getContext".to_string()));let script=bridge_script(&id,"getContext",&Value::Null,None);let _=guest.eval(&script);}},_=>{}}});
    window
        .add_child(
            builder,
            tauri::LogicalPosition::new(0.0, 70.0),
            tauri::LogicalSize::new(760.0, 730.0),
        )
        .map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
async fn open_guest(webview: Webview, app: tauri::AppHandle, url: String) -> Result<(), String> {
    trusted(&webview)?;
    do_open_guest(&app, url)
}
fn bridge_script(id: &str, op: &str, call: &Value, nonce: Option<String>) -> String {
    let request = json!({"id":id,"op":op,"call":call,"nonce":nonce});
    include_str!("../../host/bridge.js").replacen(
        "__REQUEST__",
        &serde_json::to_string(&request).unwrap(),
        1,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn url(s: &str) -> url::Url {
        url::Url::parse(s).unwrap()
    }

    #[test]
    fn allowed_matches_exact_origin_only() {
        assert!(allowed_at(
            &url("http://127.0.0.1:4314/app?x=1"),
            "http://127.0.0.1:4314"
        ));
        assert!(!allowed_at(
            &url("http://127.0.0.1.evil.example:4314"),
            "http://127.0.0.1:4314"
        ));
        assert!(!allowed_at(
            &url("http://127.0.0.1:4315"),
            "http://127.0.0.1:4314"
        ));
        assert!(!allowed_at(
            &url("https://127.0.0.1:4314"),
            "http://127.0.0.1:4314"
        ));
        // Origin comparison ignores path/query and credentials-in-URL
        // (matching `new URL(u).origin` semantics in the webviews).
        assert!(allowed_at(
            &url("http://user@127.0.0.1:4314"),
            "http://127.0.0.1:4314"
        ));
    }

    #[test]
    fn trusted_requires_host_label_and_host_origin() {
        assert!(trusted_parts("host", &url("tauri://localhost/")).is_ok());
        assert!(trusted_parts("host", &url("http://tauri.localhost/index.html")).is_ok());
        assert_eq!(
            trusted_parts("guest", &url("tauri://localhost/")).unwrap_err(),
            "FORBIDDEN"
        );
        assert_eq!(
            trusted_parts("host", &url("https://evil.example/")).unwrap_err(),
            "Untrusted host origin"
        );
        #[cfg(debug_assertions)]
        assert!(trusted_parts("host", &url("http://127.0.0.1:1420/")).is_ok());
    }

    #[test]
    fn action_gate_enforces_ui_and_allowlist() {
        assert!(action_allowed("tool", false).is_ok());
        assert!(action_allowed("heartbeat", true).is_ok());
        assert!(action_allowed("consent", true).is_ok());
        assert_eq!(
            action_allowed("pair", false).unwrap_err(),
            "Trusted UI is inactive"
        );
        assert_eq!(
            action_allowed("consent", false).unwrap_err(),
            "Trusted UI is inactive"
        );
        assert_eq!(action_allowed("open_guest", true).unwrap_err(), "FORBIDDEN");
        assert_eq!(action_allowed("dispatch", true).unwrap_err(), "FORBIDDEN");
    }

    #[test]
    fn context_data_shape_is_checked() {
        assert!(valid_context_data(
            &json!({"appId":"a","documentId":"d","revision":0})
        ));
        assert!(!valid_context_data(
            &json!({"appId":"a","documentId":"d","revision":-1})
        ));
        assert!(!valid_context_data(&json!({"appId":"a","revision":0})));
        assert!(!valid_context_data(
            &json!({"appId":1,"documentId":"d","revision":0})
        ));
    }

    #[test]
    fn rebind_only_on_getcontext_identity_change() {
        let pinned = json!({"targetId":"t","pageInstanceId":"p","origin":"http://x","appId":"a","documentId":"d","sessionEpoch":"e1","title":"t"});
        let doc_ctx = |doc: &str, epoch: Value| json!({"ok":true,"data":{"appId":"a","documentId":doc,"sessionEpoch":epoch,"revision":2}});
        // Document change rebinds with rotated identity.
        let t = rebind_needed("getContext", &doc_ctx("d2", json!("e1")), &pinned).unwrap();
        assert_eq!(t["documentId"], json!("d2"));
        assert_eq!(t["sessionEpoch"], json!("e1"));
        // Caller rotates the page instance; the predicate keeps the old one.
        assert_eq!(t["pageInstanceId"], pinned["pageInstanceId"]);
        // Session-epoch change alone rebinds too.
        assert!(rebind_needed("getContext", &doc_ctx("d", json!("e2")), &pinned).is_some());
        assert!(rebind_needed("getContext", &doc_ctx("d", Value::Null), &pinned).is_some());
        // Same document + same epoch: no rebind.
        assert!(rebind_needed("getContext", &doc_ctx("d", json!("e1")), &pinned).is_none());
        // Tool results and other apps never rebind.
        assert!(rebind_needed("invoke", &doc_ctx("d2", json!("e2")), &pinned).is_none());
        let foreign = json!({"ok":true,"data":{"appId":"b","documentId":"d2","sessionEpoch":"e2"}});
        assert!(rebind_needed("getContext", &foreign, &pinned).is_none());
        assert!(rebind_needed("getContext", &json!({"ok":false,"data":{}}), &pinned).is_none());
    }
}

fn main() {
    smoke_note("boot", "main");
    if std::env::args().any(|a| a == "--version" || a == "-V") {
        println!("coconut {}", env!("CARGO_PKG_VERSION"));
        return;
    }
    let state = Arc::new(Native::default());
    let setup_state = state.clone();
    tauri::Builder::default().manage(state).invoke_handler(tauri::generate_handler![open_guest,discover_guest,host_request,guest_reply]).setup(move |app|{let path=if cfg!(debug_assertions){std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../host/sidecar.mjs")}else{app.path().resource_dir()?.join("_up_/host/sidecar.bundle.mjs")};let mut child=Command::new("node").arg(path).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::inherit()).spawn()?;smoke_note("setup","sidecar-spawned");*lock(&setup_state.input)=child.stdin.take();let stdout=child.stdout.take().unwrap();*lock(&setup_state.child)=Some(child);let handle=app.handle().clone();let s=setup_state.clone();std::thread::spawn(move||{for line in BufReader::new(stdout).lines().map_while(Result::ok){let Ok(m)=serde_json::from_str::<Value>(&line)else{continue};smoke_note("recv",m["kind"].as_str().unwrap_or(""));let id=m["id"].as_str().unwrap_or("").to_owned();match m["kind"].as_str(){Some("response")=>{if let Some(tx)=lock(&s.pending).remove(&id){let _=tx.send(m["data"].clone());}},Some("dispatch-timeout")=>{lock(&s.replies).remove(&id);},Some("durable-status")=>{let _=handle.emit("durable-status",m["status"].clone());},Some("dispatch")=>{if m["operation"]=="invoke" && !handle.get_window("host").is_some_and(|w|w.is_visible().unwrap_or(false)&&!w.is_minimized().unwrap_or(true)){let _=send(&s,json!({"kind":"reply","id":id,"result":{"ok":false,"revision":null,"data":null,"error":{"code":"APPROVAL_DENIED","message":"Trusted UI inactive","retryable":false}}}));continue;}let t=m["target"].clone();if lock(&s.target).as_ref()!=Some(&t){let _=send(&s,json!({"kind":"reply","id":id,"result":{"ok":false,"revision":null,"data":null,"error":{"code":"STALE_CONTEXT","message":"Native binding changed","retryable":false}}}));continue;}if let Some(guest)=handle.get_webview("guest"){if guest.url().ok().as_ref().is_some_and(allowed){lock(&s.replies).insert(id.clone(),(t, m["operation"].as_str().unwrap_or("").to_owned()));let _=guest.eval(&bridge_script(&id,m["operation"].as_str().unwrap_or(""),&m["call"],lock(&s.nonce).clone()));}}},_=>{}}}invalidate(&handle.state::<Arc<Native>>());for(_,tx)in lock(&s.pending).drain(){drop(tx);}{let _g=lock(&s.input);s.input_dead.store(true,Ordering::SeqCst);}s.input_cv.notify_all();smoke_note("recv","eof");});
// Debug-only smoke control channel for the native acceptance lane: newline-
// delimited JSON on 127.0.0.1:4319. `request` ops run through the exact
// dispatch_request path the sidebar uses (same action gate, same sidecar
// round-trip); `open_guest` runs the same guest-open path. `heartbeat` sent
// here exercises the real UI-lease requirement — approvals stay gated on a
// live trusted UI, so the lane proves heartbeat, not a stub.
if smoke_on(){let listener=std::net::TcpListener::bind("127.0.0.1:4319")?;let smoke_app=app.handle().clone();std::thread::spawn(move||{for stream in listener.incoming(){let Ok(mut st)=stream else{continue};let h=smoke_app.clone();std::thread::spawn(move||{let mut line=String::new();let mut br=BufReader::new(st.try_clone().unwrap());let mut respond=|v:Value|{let _=writeln!(st,"{}",v);};loop{line.clear();if br.read_line(&mut line).unwrap_or(0)==0{return}let Ok(m)=serde_json::from_str::<Value>(line.trim())else{respond(json!({"ok":false,"error":"bad json"}));continue};let out=match m["op"].as_str(){Some("ping")=>Ok(json!(true)),Some("open_guest")=>do_open_guest(&h,m["url"].as_str().unwrap_or("").to_owned()).map(|_|json!(true)),Some("discover")=>do_discover_guest(&h).map(|_|json!(true)),Some("hide")=>h.get_window("host").ok_or_else(||"Host missing".to_string()).and_then(|w|w.hide().map_err(|e|e.to_string())).map(|_|json!(true)),Some("show")=>h.get_window("host").ok_or_else(||"Host missing".to_string()).and_then(|w|{w.show().map_err(|e|e.to_string())?;w.unminimize().map_err(|e|e.to_string())}).map(|_|json!(true)),Some("request")=>{let st2=h.state::<Arc<Native>>().inner().clone();let active=h.get_window("host").is_some_and(|w|w.is_visible().unwrap_or(false)&&!w.is_minimized().unwrap_or(true));let (tx,rx)=std::sync::mpsc::channel();let req=m["request"].clone();tauri::async_runtime::spawn(async move{let _=tx.send(dispatch_request(&st2,req,active).await);});rx.recv_timeout(Duration::from_secs(60)).unwrap_or_else(|_|Err("SMOKE_TIMEOUT".into()))},Some("quit")=>{h.exit(0);Ok(json!(true))},_=>Err("Unknown op".into()),};respond(match out{Ok(v)=>json!({"ok":true,"result":v}),Err(e)=>json!({"ok":false,"error":e})});}});}});}
Ok(())}).on_window_event(|window,event|{if matches!(event,tauri::WindowEvent::Destroyed){invalidate(&window.state::<Arc<Native>>());let s=window.state::<Arc<Native>>();if let Some(child)=lock(&s.child).as_mut(){let _=child.kill();};}}).run(tauri::generate_context!()).expect("Coconut runtime");
}
