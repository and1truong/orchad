import React, { useEffect, useRef, useState } from "react";
import { request, type Session } from "./api.ts";
import type { Lesson } from "../shared/model.ts";
export function UploadField({
  session,
  kind,
  onUploaded,
  scope,
  onUploading,
}: {
  session: Session;
  kind: Lesson["kind"];
  onUploaded: (id: string) => void;
  onUploading?: (busy: boolean) => void;
  scope?:
    | { enrollmentId: string; lessonId: string }
    | { awardEnrollmentId: string; criterionPath: string };
}) {
  const [status, setStatus] = useState(""),
    [uploading, setUploading] = useState(false),
    [confirmed, setConfirmed] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const types: Record<string, string> = {
    audio: "audio/wav,audio/mpeg",
    video: "video/mp4",
    document: "application/pdf",
    interactive: "text/html",
  };
  return (
    <fieldset disabled={uploading}>
      <legend>Upload self-authored content</legend>
      <label className="choice">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        I own this content and may upload it
      </label>
      <label>
        Content file
        <input
          type="file"
          accept={types[kind]}
          disabled={!confirmed}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const key = crypto.randomUUID();
            setUploading(true);
            onUploading?.(true);
            setStatus("Uploading…");
            void (async () => {
              if (!file.size || file.size > 8 * 1024 * 1024)
                throw new Error("File must contain 1 byte to 8 MiB");
              const doc = scope
                  ? `learning:${session.principal.tenant}:${session.principal.id}`
                  : "library:" + session.principal.tenant,
                ctx = await request<any>(
                  "/api/context?documentId=" + encodeURIComponent(doc),
                  session,
                );
              const mime =
                file.type === "audio/x-wav" ? "audio/wav" : file.type;
              const q = new URLSearchParams({
                filename: file.name,
                mime,
                key,
                revision: String(ctx.revision),
                confirmed: "true",
                ...(scope
                  ? {
                      purpose:
                        "awardEnrollmentId" in scope
                          ? "award_evidence"
                          : "submission",
                      ...scope,
                    }
                  : {}),
              });
              const r = await fetch("/api/uploads?" + q, {
                method: "POST",
                credentials: "same-origin",
                headers: {
                  "Content-Type": "application/octet-stream",
                  "X-CSRF-Token": session.csrf,
                  "X-Pear-Epoch": session.sessionEpoch,
                },
                body: file,
              });
              const result = await r.json();
              if (!r.ok)
                throw new Error(result.error?.message ?? "Upload failed");
              if (!mounted.current) return;
              onUploaded(result.id);
              setStatus(`Stored ${result.filename} (${result.size} bytes)`);
            })()
              .catch((e) => setStatus(e.message))
              .finally(() => {
                setUploading(false);
                onUploading?.(false);
              });
          }}
        />
      </label>
      <p role="status">{status}</p>
    </fieldset>
  );
}
export function UploadedMedia({
  session,
  content,
  context,
}: {
  session: Session;
  content: { assetId?: string; kind: string; title: string };
  context: {
    itemEnrollmentId?: string;
    recordId?: string;
    submissionId?: string;
    itemId?: string;
    version?: number;
    enrollmentId?: string;
    lessonId?: string;
  };
}) {
  const [url, setUrl] = useState(""),
    [error, setError] = useState("");
  const contextKey = JSON.stringify(context);
  useEffect(() => {
    let active = true,
      blobUrl = "";
    setUrl("");
    setError("");
    if (!content.assetId) return;
    void (async () => {
      if (content.kind === "interactive") {
        const r = await request<{ url: string }>("/api/launch", session, {
          assetId: content.assetId,
          context,
        });
        if (active) setUrl(r.url);
        return;
      }
      const query = new URLSearchParams(
        Object.entries(context).map(([k, v]) => [k, String(v)]),
      );
      const r = await fetch(
        "/api/assets/" + encodeURIComponent(content.assetId!) + "?" + query,
        {
          credentials: "same-origin",
          headers: { "X-Pear-Epoch": session.sessionEpoch },
        },
      );
      if (!r.ok) throw new Error("File access denied; refresh your session");
      const blob = await r.blob();
      if (!active) return;
      blobUrl = URL.createObjectURL(blob);
      setUrl(blobUrl);
    })().catch((e) => {
      if (active) setError(e.message);
    });
    return () => {
      active = false;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [session.sessionEpoch, content.assetId, content.kind, contextKey]);
  if (!content.assetId) return null;
  return (
    <section aria-label="Uploaded learning content">
      {error && <p role="alert">{error}</p>}
      {url &&
        (content.kind === "interactive" ? (
          <iframe
            title={content.title}
            src={url}
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
          />
        ) : content.kind === "audio" ? (
          <audio
            aria-label={content.title}
            src={url}
            controls
            preload="metadata"
          />
        ) : content.kind === "video" ? (
          <video
            aria-label={content.title}
            src={url}
            controls
            preload="metadata"
          />
        ) : (
          <a href={url} download={content.title + ".pdf"}>
            Download document
          </a>
        ))}
    </section>
  );
}
