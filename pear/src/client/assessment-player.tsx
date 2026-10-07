import {QuestionPrompt} from "./question-prompt.tsx";
import {translateUI} from "./i18n.ts";
import React, { useEffect, useState } from "react";
export function completeResponse(q: any, a: any) {
  return (q.kind ?? "mcq") === "mcq"
    ? q.multiple ? Array.isArray(a)&&a.length>0&&a.every(Number.isInteger) : Number.isInteger(a)
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
        {q.title||(q.promptFormat==="original_markup"?translateUI("Question"):q.prompt)} · {q.points ?? 1} points
      </legend>
      {(q.title||q.promptFormat==="original_markup")&&<QuestionPrompt q={q}/>}
      {(q.kind ?? "mcq") === "mcq" ? (
        q.options.map((o: string, i: number) => (
          <label className="choice" key={i}>
            <input
              type={q.multiple?"checkbox":"radio"}
              name={q.id}
              checked={q.multiple?(answer??[]).includes(i):answer === i}
              onChange={event => save(q.multiple?(event.target.checked?[...(answer??[]),i].sort((a,b)=>a-b):(answer??[]).filter((index:number)=>index!==i)):i)}
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
            ) : q.blankChoices?.[i]?.length ? (
              <select aria-label={prompt} value={draft[i]} onChange={e=>setDraft(draft.map((value:any,n:number)=>n===i?e.target.value:value))}>
               <option value="">{translateUI("Choose an answer")}</option>{q.blankChoices[i].map((choice:string)=><option key={choice} value={choice}>{choice}</option>)}
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
