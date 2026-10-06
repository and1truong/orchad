import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture, data } from "./helpers.ts";
import { courses } from "../src/server/seed.ts";
import { createApp } from "../src/server/app.ts";
const origin = "http://127.0.0.1:4314",
  pdf = Buffer.from("%PDF-1.4\nfixture\n%%EOF"),
  html = Buffer.from(
    "<!doctype html><button onclick='this.textContent=42'>Practice</button>",
  );
function upload(
  f: ReturnType<typeof fixture>,
  mime = "application/pdf",
  bytes = pdf,
  key: string = crypto.randomUUID(),
) {
  return f.service.media.upload(
    f.service.principal("editor"),
    {
      filename: mime === "text/html" ? "practice.html" : "guide.pdf",
      mime,
      key,
      revision: String(f.service.context("editor", "library:demo").revision),
      confirmed: "true",
    },
    bytes,
  );
}
function publish(
  f: ReturnType<typeof fixture>,
  id: string,
  assetId: string,
  kind = "document",
) {
  data(
    f.call("editor", "learning_create_content_item", {
      itemId: id,
      item: {
        title: id,
        summary: "Original",
        language: "en",
        provider: "Pear Originals",
        license: "self-authored",
        aiProcessingAllowed: false,
        kind,
        text: "Read the original",
        assetId,
        ...(kind === "interactive"
          ? { transcript: "Practice with the button" }
          : {}),
      },
    }),
  );
  data(f.call("editor", "learning_publish_content_item", { itemId: id }));
}
test("uploads enforce authorization, signatures, CAS, exact retry and atomic audit", () => {
  const f = fixture();
  try {
    const a = upload(f, "application/pdf", pdf, "first");
    assert.equal(a.size, pdf.length);
    assert.equal(upload(f, "application/pdf", pdf, "first").id, a.id);
    assert.throws(
      () => upload(f, "application/pdf", Buffer.from("%PDF-changed"), "first"),
      /operation changed/,
    );
    const p = f.service.principal("editor"),
      args = {
        filename: "guide.pdf",
        mime: "application/pdf",
        key: "stale",
        revision: "0",
        confirmed: "true",
      };
    assert.throws(
      () => f.service.media.upload(p, args, pdf),
      /Library changed/,
    );
    assert.throws(
      () => f.service.media.upload(f.service.principal("learner-a"), args, pdf),
      /Content author/,
    );
    assert.throws(
      () => upload(f, "application/pdf", html),
      /signature mismatch/,
    );
    assert.throws(
      () => upload(f, "text/html", Buffer.from([255])),
      /signature mismatch/,
    );
    assert.throws(
      () => upload(f, "text/html", Buffer.alloc(65537, 65)),
      /signature mismatch/,
    );
    const revision = f.service.context("editor", "library:demo").revision;
    f.db.exec(
      "CREATE TRIGGER fail_media_audit BEFORE INSERT ON audit BEGIN SELECT RAISE(ABORT,'audit unavailable'); END",
    );
    assert.throws(() => upload(f), /audit unavailable/);
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM assets").get()!.n, 1);
    assert.equal(
      f.service.context("editor", "library:demo").revision,
      revision,
    );
    f.db.exec("DROP TRIGGER fail_media_audit");
    f.db.prepare("UPDATE accounts SET role='learner' WHERE id='editor'").run();
    assert.throws(
      () => f.service.media.upload(p, { ...args, key: "first" }, pdf),
      /Content author/,
    );
  } finally {
    f.db.close();
  }
});
test("asset reads enforce tenant, published item and pinned unlocked lesson", () => {
  const f = fixture();
  try {
    const a = upload(f),
      learner = f.service.principal("learner-a");
    assert.throws(() => f.service.media.read(learner, a.id, {}), /authorized/);
    publish(f, "guide", a.id);
    assert.equal(
      f.service.media.read(learner, a.id, { itemId: "guide", version: 1 }).id,
      a.id,
    );
    assert.throws(
      () =>
        f.service.media.read(f.service.principal("outsider"), a.id, {
          itemId: "guide",
          version: 1,
        }),
      /access denied/,
    );
    assert.equal(
      data(
        f.call("learner-a", "learning_get_content_item", { itemId: "guide" }),
      ).contentWithheld,
      true,
    );
    const c = structuredClone(courses["systems-basics"]);
    c.lessons[1] = { ...c.lessons[1], kind: "document", assetId: a.id };
    data(
      f.call("editor", "learning_create_course", {
        courseId: "media-course",
        course: c,
      }),
    );
    data(
      f.call("editor", "learning_publish_course", { courseId: "media-course" }),
    );
    const e = data(
        f.call("learner-a", "learning_enroll", {
          courseId: "media-course",
        }),
      ),
      eid = e.enrollmentId ?? e.id;
    assert.throws(
      () =>
        f.service.media.read(learner, a.id, {
          enrollmentId: eid,
          lessonId: c.lessons[1].id,
        }),
      /authorized/,
    );
    data(
      f.call(
        "learner-a",
        "human_complete_lesson",
        { enrollmentId: eid, lessonId: c.lessons[0].id },
        "human",
      ),
    );
    assert.equal(
      f.service.media.read(learner, a.id, {
        enrollmentId: eid,
        lessonId: c.lessons[1].id,
      }).id,
      a.id,
    );
    assert.throws(
      () =>
        f.service.media.read(f.service.principal("learner-b"), a.id, {
          enrollmentId: eid,
          lessonId: c.lessons[1].id,
        }),
      /authorized/,
    );
    data(f.call("editor", "learning_retire_content_item", { itemId: "guide" }));
    assert.throws(
      () =>
        f.service.media.read(learner, a.id, { itemId: "guide", version: 1 }),
      /authorized/,
    );
    assert.equal(
      f.service.media.read(learner, a.id, {
        enrollmentId: eid,
        lessonId: c.lessons[1].id,
      }).id,
      a.id,
    );
  } finally {
    f.db.close();
  }
});
async function login(app: any, id = "editor") {
  const r = await app.inject({
    method: "POST",
    url: "/api/login",
    headers: { host: "127.0.0.1:4314", origin },
    payload: { username: id, password: id + "-dev" },
  });
  assert.equal(r.statusCode, 200);
  const b = r.json();
  return {
    host: "127.0.0.1:4314",
    origin,
    cookie: r.headers["set-cookie"].split(";")[0],
    "x-csrf-token": b.csrf,
    "x-pear-epoch": b.sessionEpoch,
  };
}
test("binary HTTP preserves Bridge cap, CSRF, epoch, attachments and session-bound sandbox launch", async () => {
  const f = fixture(),
    { app } = await createApp({ db: f.db, origin, developmentAuth: true });
  try {
    const headers = await login(app),
      a = upload(f, "text/html", html);
    publish(f, "practice", a.id, "interactive");
    const launch = await app.inject({
      method: "POST",
      url: "/api/launch",
      headers,
      payload: { assetId: a.id, context: {} },
    });
    assert.equal(launch.statusCode, 200);
    const nav = { ...headers };
    delete (nav as any)["x-pear-epoch"];
    const opened = await app.inject({ url: launch.json().url, headers: nav });
    assert.equal(opened.statusCode, 200);
    assert.match(
      opened.headers["content-security-policy"]!,
      /sandbox allow-scripts/,
    );
    assert.doesNotMatch(
      opened.headers["content-security-policy"]!,
      /allow-same-origin/,
    );
    assert.match(
      opened.headers["content-security-policy"]!,
      /connect-src 'none'/,
    );
    assert.equal(opened.body, html.toString());
    assert.equal(
      (
        await app.inject({
          url: launch.json().url,
          headers: await login(app, "learner-a"),
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (await app.inject({ url: launch.json().url + "x", headers: nav }))
        .statusCode,
      403,
    );
    const now = Date.now;
    Date.now = () => now() + 61_000;
    try {
      assert.equal(
        (await app.inject({ url: launch.json().url, headers: nav })).statusCode,
        403,
      );
    } finally {
      Date.now = now;
    }
    const file = await app.inject({ url: "/api/assets/" + a.id, headers });
    assert.equal(file.statusCode, 200);
    assert.match(file.headers["content-disposition"]!, /attachment/);
    const q = new URLSearchParams({
        filename: "large.pdf",
        mime: "application/pdf",
        key: "http-upload",
        revision: String(f.service.context("editor", "library:demo").revision),
        confirmed: "true",
      }),
      bytes = Buffer.concat([pdf, Buffer.alloc(70000)]),
      binaryHeaders = {
        ...headers,
        "content-type": "application/octet-stream",
      };
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/uploads?" + q,
          headers: binaryHeaders,
          payload: bytes,
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/human/invoke",
          headers: binaryHeaders,
          payload: bytes,
        })
      ).statusCode,
      413,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/uploads?" + q,
          headers: { ...binaryHeaders, "x-csrf-token": "wrong" },
          payload: pdf,
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/uploads?" + q,
          headers: { ...binaryHeaders, "x-pear-epoch": "wrong" },
          payload: pdf,
        })
      ).statusCode,
      409,
    );
    f.db
      .prepare(
        "UPDATE accounts SET auth_version=auth_version+1 WHERE id='editor'",
      )
      .run();
    assert.equal(
      (await app.inject({ url: launch.json().url, headers: nav })).statusCode,
      401,
    );
  } finally {
    await app.close();
    f.db.close();
  }
});

test("production upload gate denies unconfigured scanning and metadata/path/size/quota validation leaves no side effects", async () => {
  const f = fixture();
  let app: any;
  try {
    const p = f.service.principal("editor"),
      args = {
        filename: "guide.pdf",
        mime: "application/pdf",
        key: "limit",
        revision: "0",
        confirmed: "true",
      };
    for (const input of [
      { ...args, filename: "../../secret.pdf" },
      { ...args, filename: "bad\r\nheader.pdf" },
      { ...args, confirmed: "false" },
      { ...args, extra: "ignored" },
    ])
      assert.throws(
        () => f.service.media.upload(p, input, pdf),
        /Invalid upload/,
      );
    assert.throws(
      () => f.service.media.upload(p, args, Buffer.alloc(8 * 1024 * 1024 + 1)),
      /8 MiB/,
    );
    f.db.exec(
      "CREATE TRIGGER fake_quota AFTER INSERT ON assets BEGIN UPDATE assets SET bytes=zeroblob(134217728) WHERE id=NEW.id; END",
    );
    upload(f);
    assert.throws(() => upload(f), /quota reached/);
    f.db.exec("DROP TRIGGER fake_quota");
    const dev = await createApp({ db: f.db, origin, developmentAuth: true });
    const headers = await login(dev.app);
    await dev.app.close();
    app = (await createApp({ db: f.db, origin })).app;
    const r = await app.inject({
      method: "POST",
      url: "/api/uploads?" + new URLSearchParams(args),
      headers: { ...headers, "content-type": "application/octet-stream" },
      payload: pdf,
    });
    assert.equal(r.statusCode, 403);
    assert.match(r.json().error.message, /Production upload/);
  } finally {
    if (app) await app.close();
    f.db.close();
  }
});

test("reusable media pins authoritative bytes and permission across edits and database restart", () => {
  const path = "/tmp/orchad-media-" + crypto.randomUUID() + ".sqlite";
  let f = fixture(path);
  try {
    const first = upload(f),
      second = upload(f, "application/pdf", Buffer.from("%PDF-2 replacement"));
    publish(f, "pinned-doc", first.id);
    const c = structuredClone(courses["systems-basics"]);
    c.lessons[0] = {
      ...c.lessons[0],
      kind: "document",
      assetId: second.id,
      contentRef: { itemId: "pinned-doc", version: 1 },
    };
    data(
      f.call("editor", "learning_create_course", {
        courseId: "pinned-media",
        course: c,
      }),
    );
    data(
      f.call("editor", "learning_publish_course", { courseId: "pinned-media" }),
    );
    const e = data(
        f.call("learner-a", "learning_enroll", { courseId: "pinned-media" }),
      ),
      eid = e.enrollmentId ?? e.id;
    const item = data(
      f.call("editor", "learning_get_content_drafts", {}, "human"),
    ).items.find((x: any) => x.id === "pinned-doc").draft;
    data(
      f.call("editor", "learning_update_content_item", {
        itemId: "pinned-doc",
        item: { ...item, assetId: second.id },
      }),
    );
    data(
      f.call("editor", "learning_publish_content_item", {
        itemId: "pinned-doc",
      }),
    );
    const ctx = { enrollmentId: eid, lessonId: c.lessons[0].id };
    assert.equal(
      f.service.media.read(f.service.principal("learner-a"), first.id, ctx)
        .sha256,
      first.sha256,
    );
    assert.throws(
      () =>
        f.service.media.read(f.service.principal("learner-a"), second.id, ctx),
      /authorized/,
    );
    assert.equal(
      data(f.call("learner-a", "learning_get_lesson", ctx)).contentWithheld,
      true,
    );
    assert.equal(
      data(f.call("learner-a", "learning_get_lesson", ctx, "human")).assetId,
      first.id,
    );
    f.db.close();
    f = fixture(path);
    assert.equal(
      Buffer.from(
        f.service.media.read(f.service.principal("learner-a"), first.id, ctx)
          .bytes,
      ).equals(pdf),
      true,
    );
    assert.equal(f.db.prepare("PRAGMA foreign_key_check").all().length, 0);
  } finally {
    f.db.close();
  }
});
