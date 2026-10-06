import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scryptSync, randomBytes } from "node:crypto";
import type { CourseStructure, ItemPayload } from "../shared/domain.ts";

const here = dirname(fileURLToPath(import.meta.url));
const migrations = join(here, "..", "..", "migrations");

export function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString("hex");
}

export function openDatabase(path: string, seed = true): DatabaseSync {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA busy_timeout=5000");
  db.exec("PRAGMA journal_mode=WAL");
  for (const file of readDirSql(migrations)) {
    db.exec(readFileSync(join(migrations, file), "utf8"));
  }
  if (seed) seedDatabase(db);
  return db;
}

function readDirSql(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
  } catch {
    return [];
  }
}

// Lessons are standalone published items; a quiz is an item whose payload
// carries `quiz`. Courses reference lessonIds and snapshot item payloads at
// publish time (pinned per enrollment — ADR 0002).
type LessonSeed = { id: string; payload: ItemPayload; minutes?: number };
const lessons: LessonSeed[] = [
  {
    id: "les-phishing",
    payload: {
      title: "Lừa đảo trực tuyến là gì",
      body:
        "Email lừa đảo (phishing) là tin nhắn giả mạo đơn vị tin cậy nhằm đánh cắp " +
        "thông tin đăng nhập hoặc dữ liệu cá nhân. Dấu hiệu thường gặp: địa chỉ " +
        "gửi lạ, giật gây hoảng sợ, yêu cầu hành động gấp, liên kết tên miền lệch " +
        "ký tự.",
      egress: "model_ok",
    },
    minutes: 5,
  },
  {
    id: "les-check-link",
    payload: {
      title: "Kiểm tra trước khi bấm",
      body:
        "Rê chuột lên liên kết để xem URL thật trước khi bấm. Không nhập mật khẩu " +
        "từ trang mở qua email. Khi nghi ngờ, truy cập dịch vụ qua địa chỉ đã lưu " +
        "hoặc hỏi đội IT.",
      egress: "model_ok",
    },
    minutes: 4,
  },
  {
    id: "les-password",
    payload: {
      title: "Mật khẩu mạnh",
      body:
        "Dùng cụm mật khẩu (passphrase) dài thay vì ký tự phức tạp ngắn. Không tái " +
        "sử dụng mật khẩu giữa các hệ thống. Ưu tiên trình quản lý mật khẩu.",
      egress: "model_ok",
    },
    minutes: 4,
  },
  {
    id: "les-mfa",
    payload: {
      title: "Xác thực đa yếu tố",
      body:
        "Bật MFA cho tài khoản quan trọng. Không chia sẻ mã OTP cho bất kỳ ai, kể " +
        "cả người tự xưng là IT nội bộ.",
      egress: "model_ok",
    },
    minutes: 4,
  },
  {
    id: "quiz-security",
    payload: {
      title: "Kiểm tra an ninh cơ bản",
      quiz: {
        title: "Kiểm tra an ninh cơ bản",
        passScore: 70,
        questions: [
          {
            id: "q1",
            prompt: "Dấu hiệu nào KHÔNG phải của email lừa đảo?",
            choices: [
              { id: "a", text: "Địa chỉ gửi lạ", correct: false },
              { id: "b", text: "Yêu cầu hành động gấp", correct: false },
              { id: "c", text: "Gửi vào giờ hành chính", correct: true },
              { id: "d", text: "Liên kết tên miền lệch ký tự", correct: false },
            ],
          },
          {
            id: "q2",
            prompt: "Khi nghi ngờ một email, hành động đúng là gì?",
            choices: [
              { id: "a", text: "Bấm thử liên kết để kiểm tra", correct: false },
              { id: "b", text: "Truy cập dịch vụ qua địa chỉ đã lưu", correct: true },
              { id: "c", text: "Trả lời email hỏi lại người gửi", correct: false },
            ],
          },
          {
            id: "q3",
            prompt: "Ai được phép xin mã OTP của bạn?",
            choices: [
              { id: "a", text: "Đội IT nội bộ", correct: false },
              { id: "b", text: "Quản lý trực tiếp", correct: false },
              { id: "c", text: "Không ai", correct: true },
            ],
          },
        ],
      },
      egress: "model_ok",
    },
    minutes: 8,
  },
  {
    id: "les-listen",
    payload: {
      title: "Nghe chủ động",
      body:
        "Nghe chủ động là tập trung hiểu ý người nói trước khi phản hồi: không " +
        "ngắt lời, ghi nhận cảm xúc lẫn nội dung, diễn giải lại để xác nhận.",
      egress: "model_ok",
    },
    minutes: 5,
  },
  {
    id: "les-openq",
    payload: {
      title: "Hỏi câu hỏi mở",
      body:
        "Câu hỏi mở bắt đầu bằng 'thế nào', 'tại sao' mời đối phương kể thêm. " +
        "Tránh chất vấn liên tiếp — xen câu hỏi đóng chỉ để chốt dữ kiện.",
      egress: "model_ok",
    },
    minutes: 5,
  },
  {
    id: "quiz-comm",
    payload: {
      title: "Kiểm tra giao tiếp",
      quiz: {
        title: "Kiểm tra giao tiếp",
        passScore: 60,
        questions: [
          {
            id: "q1",
            prompt: "Đâu là ví dụ của câu hỏi mở?",
            choices: [
              { id: "a", text: "Bạn có đồng ý không?", correct: false },
              { id: "b", text: "Bạn thấy phương án này thế nào?", correct: true },
              { id: "c", text: "Hạn chót là thứ Sáu đúng không?", correct: false },
            ],
          },
          {
            id: "q2",
            prompt: "Nghe chủ động KHÔNG bao gồm việc nào?",
            choices: [
              { id: "a", text: "Diễn giải lại ý người nói", correct: false },
              { id: "b", text: "Chuẩn bị câu đáp khi người kia đang nói", correct: true },
              { id: "c", text: "Không ngắt lời", correct: false },
            ],
          },
        ],
      },
      egress: "model_ok",
    },
    minutes: 6,
  },
  {
    id: "les-stats",
    payload: {
      title: "Trung bình, trung vị, phân phối",
      body:
        "Trung bình nhạy với giá trị ngoại lai; trung vị bền hơn khi dữ liệu lệch. " +
        "Luôn xem phân phối trước khi kết luận từ một con số tổng hợp.",
      egress: "model_ok",
    },
    minutes: 5,
  },
  {
    id: "les-causation",
    payload: {
      title: "Tương quan không phải nhân quả",
      body:
        "Hai chuỗi dữ liệu đồng biến không chứng minh một bên gây ra bên kia. Tìm " +
        "biến nhiễu và kiểm chứng bằng thí nghiệm hoặc dữ liệu bổ sung.",
      egress: "model_ok",
    },
    minutes: 5,
  },
  {
    id: "quiz-data",
    payload: {
      title: "Kiểm tra nhập môn dữ liệu",
      quiz: {
        title: "Kiểm tra nhập môn dữ liệu",
        passScore: 60,
        questions: [
          {
            id: "q1",
            prompt: "Khi dữ liệu lệch phải, đại lượng nào đại diện tốt hơn?",
            choices: [
              { id: "a", text: "Trung bình", correct: false },
              { id: "b", text: "Trung vị", correct: true },
            ],
          },
          {
            id: "q2",
            prompt: "Tương quan mạnh giữa A và B chứng minh điều gì?",
            choices: [
              { id: "a", text: "A gây ra B", correct: false },
              { id: "b", text: "B gây ra A", correct: false },
              { id: "c", text: "Chưa đủ chứng minh nhân quả", correct: true },
            ],
          },
        ],
      },
      egress: "model_ok",
    },
    minutes: 6,
  },
];

const course1: CourseStructure = {
  modules: [
    { title: "Nhận diện rủi ro", lessonIds: ["les-phishing", "les-check-link"] },
    {
      title: "Mật khẩu và xác thực",
      lessonIds: ["les-password", "les-mfa", "quiz-security"],
      prerequisiteModuleIndexes: [0],
    },
  ],
  completionPolicy: "all_lessons_and_quiz",
  attemptCap: 3,
};

const course2: CourseStructure = {
  modules: [
    {
      title: "Nghe và hỏi",
      lessonIds: ["les-listen", "les-openq", "quiz-comm"],
    },
  ],
  completionPolicy: "all_lessons_and_quiz",
  attemptCap: 3,
};

const course3: CourseStructure = {
  modules: [
    {
      title: "Đọc dữ liệu",
      lessonIds: ["les-stats", "les-causation", "quiz-data"],
    },
  ],
  completionPolicy: "all_lessons_and_quiz",
  attemptCap: 3,
};

function seedDatabase(db: DatabaseSync): void {
  const row = db.prepare("SELECT COUNT(*) AS c FROM accounts").get() as {
    c: number;
  };
  if (row.c > 0) return;
  const now = new Date().toISOString();
  db.exec("BEGIN IMMEDIATE");
  try {
    const insAccount = db.prepare(
      "INSERT INTO accounts(id,password_hash,salt,role,org_id,manager_id,name) VALUES(?,?,?,?,?,?,?)",
    );
    const account = (
      id: string,
      password: string,
      role: string,
      managerId: string | null,
      name: string,
    ) => {
      const salt = randomBytes(16).toString("hex");
      insAccount.run(
        id,
        hashPassword(password, salt),
        salt,
        role,
        "org-demo",
        managerId,
        name,
      );
    };
    account("learner1", "learner-dev", "learner", "manager", "Lan Learner");
    account("learner2", "learner-dev", "learner", "manager", "Tùng Learner");
    account("manager", "manager-dev", "manager", null, "Mai Manager");
    account("cadmin", "content-dev", "content_admin", null, "Cường Content");
    account("admin", "admin-dev", "admin", null, "Anh Admin");

    const insGroup = db.prepare(
      "INSERT INTO groups(id,org_id,name,kind) VALUES(?,?,?,?)",
    );
    const insMember = db.prepare(
      "INSERT INTO group_members(group_id,user_id) VALUES(?,?)",
    );
    insGroup.run("grp-engineering", "org-demo", "Engineering", "static");
    insMember.run("grp-engineering", "learner1");
    insMember.run("grp-engineering", "learner2");

    const insContent = db.prepare(
      "INSERT INTO content(id,org_id,type,title,summary,provider,duration_minutes,level,language,skills,topics,industry,accessibility,status,egress,license,draft,draft_revision,latest_version,created_by,updated)" +
        " VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    );
    const insVersion = db.prepare(
      "INSERT INTO content_versions(id,content_id,org_id,version,payload,published_at,published_by) VALUES(?,?,?,?,?,?,?)",
    );
    const insAgg = db.prepare(
      "INSERT OR IGNORE INTO aggregates(id,org_id,revision) VALUES(?,?,0)",
    );

    // Publish all lesson/quiz items first so course snapshots resolve.
    for (const l of lessons) {
      const draft = JSON.stringify(l.payload);
      insContent.run(
        l.id, "org-demo", "item", l.payload.title,
        l.payload.body ?? l.payload.quiz?.title ?? l.payload.title,
        "Pear Studio", l.minutes ?? 5, "beginner", "vi", "[]",
        JSON.stringify(["bài học"]), "", 1, "published",
        l.payload.egress ?? "model_ok", "synthetic", draft, 1, 1,
        "admin", Date.now(),
      );
      insVersion.run(`${l.id}-v1`, l.id, "org-demo", 1, draft, now, "admin");
    }

    const publishCourse = (
      id: string,
      title: string,
      summary: string,
      duration: number,
      level: string,
      skills: string[],
      topics: string[],
      structure: CourseStructure,
    ) => {
      // Snapshot referenced item payloads into the published version so
      // enrollments pin immutable lesson content (ADR 0002).
      const lessonsSnap: Record<string, ItemPayload> = {};
      for (const m of structure.modules)
        for (const lid of m.lessonIds) {
          const item = db
            .prepare(
              "SELECT cv.payload FROM content_versions cv JOIN content c ON c.id=cv.content_id WHERE cv.content_id=? AND cv.version=c.latest_version",
            )
            .get(lid) as { payload: string } | undefined;
          if (!item) throw new Error(`seed: lesson ${lid} chưa publish`);
          lessonsSnap[lid] = JSON.parse(item.payload);
        }
      const draft = JSON.stringify(structure);
      const payload = JSON.stringify({ ...structure, lessons: lessonsSnap });
      insContent.run(
        id, "org-demo", "course", title, summary, "Pear Studio", duration,
        level, "vi", JSON.stringify(skills), JSON.stringify(topics), "",
        1, "published", "model_ok", "synthetic", draft, 1, 1, "admin",
        Date.now(),
      );
      insVersion.run(
        `${id}-v1`, id, "org-demo", 1, payload, now, "admin",
      );
      insAgg.run(`course:${id}`, "org-demo");
    };

    publishCourse(
      "course-security",
      "An ninh thông tin cơ bản",
      "Nhận diện lừa đảo, dùng mật khẩu và xác thực đa yếu tố đúng cách.",
      25, "beginner", ["an ninh", "nhận thức"], ["an toàn thông tin"],
      course1,
    );
    publishCourse(
      "course-communication",
      "Kỹ năng giao tiếp",
      "Nghe chủ động và đặt câu hỏi mở trong trao đổi công việc.",
      20, "beginner", ["giao tiếp"], ["kỹ năng mềm"],
      course2,
    );
    publishCourse(
      "course-data",
      "Nhập môn dữ liệu",
      "Đọc hiểu các đại lượng thống kê cơ bản và bẫy tương quan.",
      20, "beginner", ["dữ liệu", "phân tích"], ["dữ liệu"],
      course3,
    );

    // Standalone read items (Lo) learners can consume outside a course.
    const item = (
      id: string, title: string, summary: string, duration: number,
      topics: string[], body: string,
    ) => {
      const payload = JSON.stringify({ title, body } satisfies ItemPayload);
      insContent.run(
        id, "org-demo", "item", title, summary, "Pear Studio", duration,
        "beginner", "vi", "[]", JSON.stringify(topics), "", 1, "published",
        "model_ok", "synthetic", payload, 1, 1, "admin", Date.now(),
      );
      insVersion.run(`${id}-v1`, id, "org-demo", 1, payload, now, "admin");
    };
    item(
      "item-onboarding",
      "Chào mừng đến Pear",
      "Giới thiệu nền tảng học tập Pear trong 5 phút.",
      5, ["định hướng"],
      "Pear là LMS nội bộ: tìm khóa học trong catalog, ghi danh, học theo " +
        "module, làm quiz và nhận chứng nhận hoàn thành.",
    );
    item(
      "item-policy",
      "Quy định sử dụng LMS",
      "Quy định về giờ học, điểm qua môn và chia sẻ tài khoản.",
      5, ["quy định"],
      "Mỗi nhân viên tự hoàn thành khóa học của mình. Không chia sẻ tài " +
        "khoản, không nhờ người khác làm quiz thay. Điểm qua môn tối thiểu " +
        "theo cấu hình từng khóa.",
    );

    // Aggregates for workspaces + org.
    for (const uid of ["learner1", "learner2", "manager", "cadmin", "admin"])
      insAgg.run(`workspace:${uid}`, "org-demo");
    insAgg.run("org:org-demo", "org-demo");

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
