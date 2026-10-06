import {translateUI} from "./i18n.ts";
import React, { useEffect, useRef, useState } from "react";
import { request, type Session } from "./api.ts";
import {parseCaptions} from "../shared/captions.ts";
import type {CaptionTrack} from "../shared/model.ts";
import type { Lesson } from "../shared/model.ts";
export function UploadField({
  session,
  kind,
  onUploaded,
  scope,
  onUploading,
}: {
  session: Session;
  kind: Lesson["kind"] | "caption";
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
    caption: "text/vtt,.vtt",
    audio: "audio/wav,audio/mpeg",
    video: "video/mp4",
    document: "application/pdf",
    interactive: "text/html",
  };
  return (
    <fieldset disabled={uploading}>
      <legend>{translateUI("Upload self-authored content")}</legend>
      <label className="choice">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />{translateUI("I own this content and may upload it")}</label>
      <label>{translateUI("Content file")}<input
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
                kind==="caption" ? "text/vtt" : file.type === "audio/x-wav" ? "audio/wav" : file.type;
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
  content: { assetId?: string; kind: string; title: string; captions?:CaptionTrack[] };
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
  const [tracks,setTracks]=useState<Array<CaptionTrack&{url:string;text:string}>>([]);
  const [url, setUrl] = useState(""),
    [error, setError] = useState("");
  const contextKey = JSON.stringify(context),tracksKey=JSON.stringify(content.captions??[]);
  useEffect(()=>{
    let active=true;const urls:string[]=[];setTracks([]);
    void (async()=>{
      const query=new URLSearchParams(Object.entries(context).map(([k,v])=>[k,String(v)]));
      const loaded=[];
      for(const track of content.captions??[]){
        const r=await fetch("/api/assets/"+encodeURIComponent(track.assetId)+"?"+query,{credentials:"same-origin",headers:{"X-Pear-Epoch":session.sessionEpoch}});
        if(!r.ok)throw new Error("Caption access denied; refresh your session");
        const text=await r.text();const cues=parseCaptions(text);
        if(!active)return;const url=URL.createObjectURL(new Blob([text],{type:"text/vtt"}));urls.push(url);
        loaded.push({...track,url,text:cues.map(c=>c.text).join("\n")});
      }
      if(active)setTracks(loaded);
    })().catch(e=>{if(active)setError(e.message);});
    return()=>{active=false;for(const url of urls)URL.revokeObjectURL(url);};
  },[session.sessionEpoch,tracksKey,contextKey]);
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
    <section aria-label={translateUI("Uploaded learning content")}>
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
          >{tracks.map((t,i)=><track key={t.assetId} kind="captions" src={t.url} srcLang={t.language} label={t.label} default={i===0}/>)}</audio>
        ) : content.kind === "video" ? (
          <video
            aria-label={content.title}
            src={url}
            controls
            preload="metadata"
          >{tracks.map((t,i)=><track key={t.assetId} kind="captions" src={t.url} srcLang={t.language} label={t.label} default={i===0}/>)}</video>
        ) : (
          <a href={url} download={content.title + ".pdf"}>{translateUI("Download document")}</a>
        ))}
      {tracks.map(t=><details key={t.assetId}><summary>{translateUI("Caption transcript ·")}{" "}{t.label}</summary><p style={{whiteSpace:"pre-wrap"}}>{t.text}</p></details>)}
    </section>
  );
}
