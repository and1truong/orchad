# ADR 001: owned Node MCP sidecar

Use the official TypeScript MCP SDK 1.32.0 rather than adding a second Rust SDK implementation during this POC. Rust owns guest routing and webviews. A fixed Node child owns SDK Streamable HTTP lifecycle and policy execution; messages cross private inherited stdin/stdout, never a guest-accessible HTTP admin endpoint. Rust exposes only enumerated trusted actions and the correlated guest reply.

Both sidebar and external MCP use the same policy module. The sidecar is independent of Lime and Mango, needs no gateway, is not a global daemon, and shuts down with the shell. SDK tested protocol: 2025-11-25 (SDK default negotiated by test client).

JavaScript dependencies are bundled as a Tauri resource. Limitation: Node itself is currently a development prerequisite, not a packaged standalone sidecar executable. This does not satisfy a self-contained end-user installer. Complete per-platform Node packaging and native end-to-end testing before distribution; do not advertise the source build as packaged verification.
