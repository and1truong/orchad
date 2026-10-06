import {translateUI} from "./i18n.ts";
import React, { useEffect, useState } from "react";
export function completeResponse(q: any, a: any) {
  return (q.kind ?? "mcq") === "mcq"
    ? Number.isInteger(a)
    : q.kind === "long_answer"
      ? typeof a === "string" && !!a.trim()
      : Array.isArray(a) &&
        a.length === q.prompts.length &&
        a.every((v) =>
          q.kind === "matching"
            ? Number.isInteger(v) && v >= 0
            : typeof v === "string" && !!v.trim(),
        );
}
export function AssessmentQuestion({
  q,
  answer,
  disabled,
  save,
}: {
  q: any;
  answer: any;
  disabled: boolean;
  save: (answer: any) => void;
}) {
  const [draft, setDraft] = useState<any>(
    answer ??
      (q.kind === "long_answer"
        ? ""
        : q.kind === "mcq" || !q.kind
          ? undefined
          : q.prompts.map(() => (q.kind === "matching" ? -1 : ""))),
  );
  useEffect(() => {
    if (answer !== undefined) setDraft(answer);
  }, [answer]);
  return (
    <fieldset disabled={disabled}>
      <legend>
        {q.prompt} · {q.points ?? 1} points
      </legend>
      {(q.kind ?? "mcq") === "mcq" ? (
        q.options.map((o: string, i: number) => (
          <label className="choice" key={i}>
            <input
              type="radio"
              name={q.id}
              checked={answer === i}
              onChange={() => save(i)}
            />
            {o}
          </label>
        ))
      ) : q.kind === "long_answer" ? (
        <label>{translateUI("Your own written response")}<textarea
            aria-label={translateUI("Your own written response")}
            maxLength={4000}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        </label>
      ) : (
        q.prompts.map((prompt: string, i: number) => (
          <label key={i}>
            {prompt}
            {q.kind === "matching" ? (
              <select
                aria-label={prompt}
                value={draft[i]}
                onChange={(e) =>
                  setDraft(
                    draft.map((v: any, j: number) =>
                      j === i ? Number(e.target.value) : v,
                    ),
                  )
                }
              >
                <option value={-1}>{translateUI("Choose meaning")}</option>
                {q.options.map((o: string, j: number) => (
                  <option value={j} key={j}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input
                aria-label={prompt}
                maxLength={200}
                value={draft[i]}
                onChange={(e) =>
                  setDraft(
                    draft.map((v: any, j: number) =>
                      j === i ? e.target.value : v,
                    ),
                  )
                }
              />
            )}
          </label>
        ))
      )}
      {(q.kind ?? "mcq") !== "mcq" && (
        <>
          <button className="ghost" onClick={() => save(draft)}>{translateUI("Save response")}</button>
          <p>
            {JSON.stringify(answer) === JSON.stringify(draft)
              ? "Response saved."
              : "Save this response before submitting. Partial drafts survive reload after saving."}
          </p>
        </>
      )}
    </fieldset>
  );
}
