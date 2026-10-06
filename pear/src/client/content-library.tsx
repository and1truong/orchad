import { DiscoveryMetadataEditor } from "./discovery-metadata.tsx";
import { StudyTimer } from "./study-timer.tsx";
import { UploadField, UploadedMedia } from "./media.tsx";
import type { Session } from "./api.ts";
import React, { useState } from "react";
import type { ContentItem } from "../shared/model.ts";
export interface ContentDraft {
  id: string;
  state: string;
  latest_version: number;
  draft: ContentItem;
  published: ContentItem | null;
}
const emptyItem = (): ContentItem => ({
  title: "",
  summary: "",
  language: "en",
  provider: "Pear Originals",
  license: "self-authored",
  aiProcessingAllowed: true,
  kind: "text",
  text: "",
});
export function ContentLibrary({
  session,
  items,
  busy,
  onSave,
  onAction,
  offset,
  nextOffset,
  onPage,
}: {
  session: Session;
  items: ContentDraft[];
  busy: boolean;
  onSave: (id: string, item: ContentItem, exists: boolean) => Promise<boolean>;
  onAction: (name: string, id: string) => void;
  offset: number;
  nextOffset: number | null;
  onPage: (offset: number) => void;
}) {
  const [editing, setEditing] = useState(false),
    [id, setId] = useState("");
  const [item, setItem] = useState<ContentItem>(emptyItem);
  return (
    <section className="panel" aria-label="Reusable content library">
      <h2>Standalone content library</h2>
      <p className="muted">
        Self-authored text, video, audio, document, interactive HTML or link.
        Publish exact reusable versions; source edits never rewrite enrolled
        courses. Standalone reading has no completion or certificate.
      </p>
      {items.map((row) => (
        <section className="learning-row" key={row.id}>
          <div>
            <h3>{row.draft.title}</h3>
            <p>
              {row.id} · {row.state} · Published version {row.latest_version}
            </p>
          </div>
          <div className="actions">
            <button
              className="ghost"
              disabled={busy}
              onClick={() => {
                setEditing(true);
                setId(row.id);
                setItem(structuredClone(row.draft));
              }}
            >
              Edit item draft
            </button>
            <button
              disabled={busy}
              onClick={() => onAction("learning_publish_content_item", row.id)}
            >
              Publish item
            </button>
            <button
              className="ghost"
              disabled={busy || row.state === "retired"}
              onClick={() => onAction("learning_retire_content_item", row.id)}
            >
              Retire item
            </button>
          </div>
        </section>
      ))}
      <div className="actions">
        <button
          className="ghost"
          disabled={offset === 0 || busy}
          onClick={() => onPage(Math.max(0, offset - 20))}
        >
          Previous items
        </button>
        <button
          className="ghost"
          disabled={nextOffset === null || busy}
          onClick={() => onPage(nextOffset!)}
        >
          Next items
        </button>
      </div>
      <h3>{editing ? "Edit standalone draft" : "Create standalone item"}</h3>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void onSave(id, item, editing).then((saved) => {
            if (saved) setEditing(true);
          });
        }}
      >
        <fieldset disabled={busy}>
          <legend>Item content and permissions</legend>
          <div className="editor">
            <label>
              Item ID
              <input
                required
                maxLength={64}
                disabled={editing}
                value={id}
                onChange={(e) => setId(e.target.value)}
              />
            </label>
            <label>
              Item title
              <input
                required
                maxLength={160}
                value={item.title}
                onChange={(e) => setItem({ ...item, title: e.target.value })}
              />
            </label>
            <label>
              Item summary
              <textarea
                required
                maxLength={600}
                value={item.summary}
                onChange={(e) => setItem({ ...item, summary: e.target.value })}
              />
            </label>
            <DiscoveryMetadataEditor value={item.discovery} onChange={value=>setItem(current=>{if(value)return {...current,discovery:value};const {discovery,...rest}=current;return rest;})} />
            <label>
              Item language
              <select
                value={item.language}
                onChange={(e) =>
                  setItem({
                    ...item,
                    language: e.target.value as ContentItem["language"],
                  })
                }
              >
                <option value="en">English</option>
                <option value="vi">Tiếng Việt</option>
              </select>
            </label>
            <label>
              Item provider
              <input
                required
                maxLength={100}
                value={item.provider}
                onChange={(e) => setItem({ ...item, provider: e.target.value })}
              />
            </label>
            <label>
              Item format
              <select
                value={item.kind}
                onChange={(e) =>
                  setItem({
                    ...item,
                    kind: e.target.value as ContentItem["kind"],
                    assetId: undefined,
                    url: undefined,
                    transcript: undefined,
                  })
                }
              >
                <option value="text">Text</option>
                <option value="video">HTTPS video</option>
                <option value="link">HTTPS link</option>
                <option value="audio">Uploaded audio</option>
                <option value="document">Uploaded PDF</option>
                <option value="interactive">Interactive HTML</option>
              </select>
            </label>
            <label>
              Item text
              <textarea
                required
                maxLength={2500}
                value={item.text}
                onChange={(e) => setItem({ ...item, text: e.target.value })}
              />
            </label>
            {["audio", "video", "document", "interactive"].includes(
              item.kind,
            ) && (
              <>
                <UploadField
                  key={item.kind}
                  session={session}
                  kind={item.kind}
                  onUploaded={(assetId) =>
                    setItem((current) => ({ ...current, assetId }))
                  }
                />
                {item.assetId && <p>Stored asset: {item.assetId}</p>}
              </>
            )}
            {["video", "link"].includes(item.kind) && !item.assetId && (
              <label>
                Item HTTPS URL
                <input
                  required
                  type="url"
                  maxLength={2048}
                  value={item.url ?? ""}
                  onChange={(e) => setItem({ ...item, url: e.target.value })}
                />
              </label>
            )}
            {["video", "audio", "interactive"].includes(item.kind) && (
              <label>
                Item transcript
                <textarea
                  required
                  maxLength={2500}
                  value={item.transcript ?? ""}
                  onChange={(e) =>
                    setItem({ ...item, transcript: e.target.value })
                  }
                />
              </label>
            )}
            <label className="choice">
              <input
                type="checkbox"
                checked={item.aiProcessingAllowed}
                onChange={(e) =>
                  setItem({ ...item, aiProcessingAllowed: e.target.checked })
                }
              />
              Allow model processing of this self-authored item
            </label>
          </div>
        </fieldset>
        <div className="actions">
          <button disabled={busy}>Save item draft</button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              setId("");
              setEditing(false);
              setItem(emptyItem());
            }}
          >
            New item
          </button>
        </div>
      </form>
    </section>
  );
}
export function StandaloneReader({
  session,
  item,
  onClose,
  onTrack,
  onComplete,
  busy = false,
}: {
  session: Session;
  item: any;
  onClose: () => void;
  onTrack?: () => void;
  onComplete?: () => void;
  busy?: boolean;
}) {
  const [confirmed, setConfirmed] = useState(false);
  return (
    <section className="panel" aria-label="Standalone item reader">
      <h2>{item.title}</h2>
      <p>
        Standalone item · Version {item.version} · No course progress or
        certificate
      </p>
      <p className="lesson-text">{item.text}</p>
      {item.itemEnrollmentId && <StudyTimer key={session.sessionEpoch+item.itemEnrollmentId} session={session} kind="item" targetId={item.itemEnrollmentId} busy={busy} />}
      {!item.itemEnrollmentId && onTrack && (
        <button disabled={busy} onClick={onTrack}>
          Track this standalone version
        </button>
      )}
      {item.itemEnrollmentId && (
        <p>
          {item.status === "completed"
            ? "Reading confirmed"
            : "Tracked · In progress"}
        </p>
      )}
      {item.itemEnrollmentId && item.status !== "completed" && onComplete && (
        <fieldset disabled={busy}>
          <legend>Confirm reading</legend>
          <label className="choice">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I confirm I have studied this standalone version.
          </label>
          <button disabled={!confirmed} onClick={onComplete}>
            Confirm standalone reading
          </button>
        </fieldset>
      )}
      <UploadedMedia
        session={session}
        content={item}
        context={
          item.itemEnrollmentId
            ? { itemEnrollmentId: item.itemEnrollmentId }
            : { itemId: item.id, version: item.version }
        }
      />
      {item.kind === "video" && !item.assetId && (
        <video controls preload="none" src={item.url} aria-label={item.title} />
      )}
      {item.kind === "link" && (
        <a href={item.url} target="_blank" rel="noopener noreferrer">
          Open content link
        </a>
      )}
      {item.transcript && (
        <details>
          <summary>Transcript</summary>
          <p className="lesson-text">{item.transcript}</p>
        </details>
      )}
      <button className="ghost" disabled={busy} onClick={onClose}>
        Close item
      </button>
    </section>
  );
}
