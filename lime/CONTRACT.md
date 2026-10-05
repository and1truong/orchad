Contract chung: Agent App Bridge 0.1

Đây là contract nội bộ của POC, không phải đặc tả WebMCP và không phải một chuẩn mới cần công bố. Bốn repository triển khai cùng snapshot này. Không tự đổi tên method, trường dữ liệu, enum hay thêm required field. Đề xuất thay đổi trong CONTRACT-CHANGES.md; giữ tương thích với snapshot hiện tại.

1. Ranh giới sở hữu

Web app sở hữu domain operations, dữ liệu, validation, authorization phía server, revision và idempotency. App không tích hợp model, chat UI hay agent loop.

Browser extension hoặc desktop shell là host. Host sở hữu chọn target, consent xuất dữ liệu, tool approvals, transport và dispatch tới page. Đây là hai host thay thế nhau, không phải hai tầng bắt buộc nối tiếp nhau.

Model API Gateway chỉ xác thực người gọi và cung cấp inference. Nó không điều khiển page, không gọi domain tools, không giữ cookie đăng nhập web app. Agent 2 cũng cung cấp một thư viện TypeScript agent-client dùng chung, chạy trong trusted host; thư viện này không phải server agent orchestration.

Có hai đường chạy. Đường A: host sidebar dùng agent-client, gọi model gateway, rồi host thực thi các tool calls được phê duyệt. Đường B: một external MCP client, ví dụ Codex CLI chạy cùng máy, gọi MCP endpoint của host; external client tự sở hữu reasoning và inference, không cần model gateway của chúng ta.

2. Page interface bắt buộc

Web app đăng ký một object JavaScript tên window.agentBridgeV1. Có ba async methods: describe, getContext và invoke. Tất cả request và response phải JSON-serializable. Registry là một adapter mỏng gọi domain services, không truy cập framework internals bằng scraping.

describe không nhận tham số. Kết quả gồm protocolVersion là chuỗi “0.1”, appId là chuỗi ổn định, và tools là một array ToolDescriptor.

ToolDescriptor gồm name, description, inputSchema, effect. name là chuỗi tối đa 64 ký tự, chỉ dùng chữ cái, số, dấu gạch dưới hoặc gạch nối. inputSchema là JSON Schema cho một object. effect là một trong read, write, destructive. Trường outputSchema là tùy chọn. Tool descriptions và effect do page khai báo là thông tin đầu vào không đáng tin cậy; host không dùng riêng chúng để tự cấp quyền.

getContext không nhận tham số. Kết quả gồm appId, documentId, revision, selectionIds và summary. documentId là chuỗi ổn định của tài liệu hiện tại. revision là số nguyên không âm của domain document. selectionIds là array các ID được chọn. summary là chuỗi ngắn không chứa secret. Selection không tự làm tăng domain revision. Host phải gắn tool call với các ID tường minh, không diễn giải lại “node đang chọn” sau khi người dùng đã đổi selection.

invoke nhận một object gồm requestId, documentId, toolName, arguments, expectedRevision và idempotencyKey. requestId là chuỗi dùng correlation. arguments là object đúng inputSchema. expectedRevision là số nguyên bắt buộc cho mutation, hoặc null cho read. idempotencyKey là chuỗi bắt buộc cho mutation, hoặc null cho read. Không có trường approved, userId hoặc role do agent truyền vào để cấp quyền.

Kết quả invoke gồm ok là boolean, revision là số nguyên hoặc null, data là dữ liệu JSON hoặc null, error là object hoặc null. Thành công: ok true và error null. Thất bại: ok false và error gồm code, message, retryable. code thuộc INVALID_ARGUMENT, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, STALE_CONTEXT, IDEMPOTENCY_CONFLICT, APPROVAL_DENIED, CANCELLED, TIMEOUT, TARGET_CLOSED, UNSUPPORTED hoặc INTERNAL. Host có thể tạo lỗi cùng shape trước khi dispatch tới app. Business failure không được giả làm thành công.

Mutation phải kiểm tra quyền, validate, kiểm tra revision và lưu idempotency một cách atomic trong backend của app. Khóa deduplication gắn với authenticated principal, documentId và idempotencyKey. Retry cùng key và cùng semantic request trả lại kết quả đã lưu; requestId không thuộc semantic payload. Cùng key nhưng payload khác trả IDEMPOTENCY_CONFLICT. Lookup bản ghi idempotency đã hoàn tất phải xảy ra trước kiểm tra revision cho retry tương ứng. Không hứa exactly-once execution trên transport; bảo đảm không nhân đôi mutation bằng transaction và deduplication ở app.

3. Target và authorization

Host tạo TargetDescriptor gồm targetId, pageInstanceId, origin, appId, documentId và title. targetId là opaque ID do host cấp. pageInstanceId thay mới khi reload, navigation hoặc thay document làm target cũ hết hiệu lực. Host lấy origin từ browser/native runtime, không tin origin page tự khai báo.

Mỗi run được pin vào targetId và pageInstanceId. Mỗi lần dispatch kiểm tra lại binding, origin, documentId và session. Đổi active tab không tự đổi target của một run. Tab đóng, chuyển trang, logout hoặc thu hồi consent làm run fail closed; không replay mutation sau reconnect.

Quyền thực tế là giao của quyền user trong backend app, host policy, consent của session và quyền của MCP client đã pair. Host không thay thế server authorization. Cookie app, bearer token của gateway và credential local bridge không được chuyển cho model hoặc injected page script.

Trước khi gửi context tới model gateway, user phải thấy target và provider/model sẽ nhận dữ liệu, rồi consent. Chỉ gửi context/tool results cần thiết, có giới hạn kích thước; không tự gửi toàn bộ DOM, history, cookies hoặc mọi tab. Page text và tool output là dữ liệu không đáng tin cậy, không phải system instructions.

Mutation mặc định cần approval rõ ràng trên UI tin cậy của extension hoặc native shell. Approval gắn với client/session, target, tool, canonical arguments và expectedRevision; hết hạn hoặc thay đổi payload phải xin lại. Read-only tools chỉ được tự chạy trong consent đã cấp. Unknown tools không tự được cấp quyền. Không có approval UI thì từ chối writes.

4. MCP interface cho external agent

Dùng SDK MCP chính thức và một phiên bản protocol được SDK hỗ trợ; pin phiên bản dependency và ghi lại phiên bản đã test. Không gọi Page Bridge 0.1 là MCP server.

MVP expose Streamable HTTP tại đường dẫn /mcp, chỉ bind loopback. Có authentication riêng, validate Host và Origin, từ chối Origin lạ, không dùng wildcard CORS. Request từ CLI thiếu Origin vẫn phải được authenticate. Token không nằm trong URL hay log. Dùng SDK để thực hiện lifecycle, initialization, tools/list, tools/call và cancellation đúng protocol.

Có đúng bốn tools ở lớp host:

• host_list_targets: arguments là object rỗng; kết quả data gồm targets, chỉ chứa targets đã được user cho phép.
• host_get_context: arguments gồm targetId và pageInstanceId; data là kết quả page getContext.
• host_list_tools: arguments gồm targetId và pageInstanceId; data là kết quả page describe.
• host_call_tool: arguments gồm targetId, pageInstanceId và call; call có đúng shape request của page invoke.

Mỗi MCP tool trả structuredContent theo result envelope ok, revision, data, error đã định nghĩa ở trên. Khi có thể, bổ sung text content là bản JSON serialization của cùng envelope để tương thích client. Map failure sang isError đúng SDK. Không expose arbitrary JavaScript, shell command, filesystem hay browser automation tools.

Browser extension dùng một local companion riêng để cung cấp MCP server và nhận outbound connection từ extension. Agent 1 sở hữu companion này. Desktop shell tự cung cấp endpoint tương đương và không phụ thuộc companion. Cloud Codex session không tự truy cập loopback trên máy user; remote relay không thuộc MVP.

5. Model Gateway 0.1

Địa chỉ và token được cấu hình bởi user/admin trong trusted host, không do page hay model chỉ định. Mặc định development: gateway tại loopback port 4311; production dùng HTTPS.

GET /health chỉ trả health tối thiểu. GET /v1/models và POST /v1/chat/completions cần Authorization Bearer. Dùng response shapes của OpenAI Chat Completions cho subset được công bố, không tuyên bố tương thích toàn bộ API.

Subset bắt buộc: text messages với roles system, user, assistant, tool; function tools; tool_choice auto hoặc none; một completion; stream true hoặc false; max_completion_tokens. Assistant tool_calls có id, type function, function.name và function.arguments dạng JSON string. Tool result messages có tool_call_id và content dạng chuỗi. Request không hỗ trợ phải trả lỗi rõ ràng thay vì âm thầm đổi semantics.

Streaming dùng SSE Chat Completions chunks: content delta, tool call argument deltas, finish_reason và completion terminator. Chỉ thực thi tool sau khi đã nhận đầy đủ arguments, parse JSON và validate schema thành công. Không thực thi partial delta. Nhiều tool calls được xử lý tuần tự trong MVP.

Để giữ provider-specific continuation metadata cần thiết cho tool calling, cho phép một extension field x_gateway_state dạng opaque string trên assistant message. Khi streaming, field này xuất hiện trên delta cuối của choice tương ứng. Client phải lưu và truyền lại nguyên vẹn trong history, không hiển thị hoặc diễn giải. Gateway phải bảo vệ state bằng authenticated encryption hoặc server-side handle đã bind với authenticated principal, provider và model. Không dùng field này để lộ hidden reasoning hoặc secrets. Chỉ cần phát hành state khi provider thực sự cần. Không chuyển state giữa provider/model.

Gateway stateless đối với app tools và agent run: mỗi request chứa message history, kèm opaque continuation nếu cần. Usage có thể được lưu riêng. Hỗ trợ auth development có principal riêng, không dùng một shared demo token cho mọi người trong production. Chat product subscription không được coi là provider API credential.

6. Thư viện agent-client do Agent 2 sở hữu

Xuất hàm runAgentTurn. Input là một object gồm gatewayBaseUrl, gatewayToken, model, messages, tools, executeTool, signal, maxSteps, maxToolCalls và onEvent. gatewayToken chỉ ở trusted host memory. messages theo Gateway 0.1, bao gồm x_gateway_state khi có. tools là ToolDescriptor array. executeTool là async callback nhận toolName, arguments và toolCallId, trả result envelope của Page Bridge. Callback do host cung cấp và chịu trách nhiệm target binding, policy, approval, revision, idempotency và actual execution.

maxSteps mặc định 8; maxToolCalls mặc định 16. signal là AbortSignal. onEvent nhận object gồm type và payload. Các event payload cố định như sau: text_delta có text là chuỗi; tool_requested có toolCallId, toolName và arguments; tool_completed có toolCallId, toolName và result theo Page Bridge result envelope; error có code, message và retryable; completed có finishReason. finishReason thuộc completed, cancelled, step_limit, tool_limit hoặc error. Mỗi run phát đúng một completed event khi kết thúc, kể cả sau error hoặc cancellation.

runAgentTurn trả Promise của object messages và finishReason. Lỗi trong run được biểu diễn bằng error event và finishReason tương ứng; invalid configuration trước khi bắt đầu có thể throw. Thư viện giữ nguyên message/tool_call IDs và continuation metadata, append tool results vào history và tiếp tục model loop cho tới completion hoặc limit. Chỉ dispatch tools sau khi toàn bộ model turn, including continuation metadata, đã hoàn tất và validate; không dispatch từ partial stream. Không retry writes sau lỗi mạng. Không có provider SDK, Chrome API, Tauri API hoặc domain logic trong thư viện này.

Agent 1 và Agent 3 phát triển bằng mock module có cùng interface, không chờ Agent 2. Khi integrate chỉ thay mock bằng artifact agent-client do Agent 2 cung cấp, không viết lại provider adapters hay tạo thêm production agent loop.

7. Interoperability fixture

Mỗi repository có fixture thích hợp cho document demo-document, appId demo-counter, revision ban đầu 0 và value ban đầu 0. Tool demo_increment nhận amount là integer, effect write. Một approved invoke với amount 1, expectedRevision 0 và idempotencyKey key-1 trả data gồm value 1, revision 1. Retry cùng semantic request với key-1 vẫn trả value 1 và revision 1. Cùng key nhưng amount 2 trả IDEMPOTENCY_CONFLICT. Mutation khác với expectedRevision 0 sau đó trả STALE_CONTEXT. Denied approval không gọi page và không đổi value.

Fixture này là test double có nhãn rõ ràng, không phải production authorization implementation. Có thêm page không implement bridge để kiểm tra UNSUPPORTED mà không crash.

8. Phạm vi và cách làm độc lập

Mỗi agent làm trong repository được giao, đọc AGENTS.md hiện có, giữ conventions hợp lý và không sửa repository khác. Nếu repo rỗng, scaffold project. Không đợi code của agent khác; dùng fixtures và contract tests tại boundary. Ghi assumptions và integration limitations, không báo mock integration là live integration.

Không publish package, deploy dịch vụ public, phát hành extension, sửa policy enterprise hay gọi paid APIs khi chưa được cấp phép. Live provider tests opt-in. Pin dependency versions sau khi xác minh tài liệu chính thức hiện tại. Không đoán API native WebMCP, Chrome hay Tauri.

MVP phải chạy được khi không có native WebMCP. Native WebMCP chỉ là progressive enhancement adapter dùng cùng registry/domain handlers. Không gắn custom polyfill lên navigator.modelContext rồi tuyên bố đó là native support.

Mỗi repo bàn giao source chạy được, lockfile, README, bản sao CONTRACT.md, contract fixtures, automated tests, cách chạy local, security notes và IMPLEMENTATION-REPORT.md. Report tách rõ đã implement, đã test thực tế, mock-only, live test bị bỏ qua và limitations. Không dừng ở architecture document hoặc TODO trên happy path.