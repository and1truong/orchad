import {dropdownChoices,dropdownFields} from "../shared/assessments.ts";
import {translateUI} from "./i18n.ts";
import React from "react";
import type { Question } from "../shared/model.ts";
type Props = { q: Question; update: (next: Question) => void };
export function QuestionSettings({ q, update }: Props) {
  return (
    <>
      <label>{translateUI("Question type")}<select
          aria-label={translateUI("Question type")}
          value={q.kind ?? "mcq"}
          onChange={(e) => {
            const kind = e.target.value as Question["kind"];
            const common = {
              id: q.id,
              prompt: q.prompt,
              ...(q.title?{title:q.title}:{}),
              ...(q.promptFormat?{promptFormat:q.promptFormat}:{}),
              points: q.points ?? 1,
              kind,
              correct: 0,
            };
            update(
              kind === "mcq"
                ? { ...common, options: ["", ""] }
                : kind === "matching"
                  ? {
                      ...common,
                      options: ["First meaning", "Second meaning"],
                      prompts: ["First term", "Second term"],
                      matches: [0, 1],
                    }
                  : kind === "blanks"
                    ? {
                        ...common,
                        options: [],
                        prompts: ["Word"],
                        correctAnswers: [""],
                      }
                    : { ...common, options: [], rubric: "" },
            );
          }}
        >
          <option value="mcq">{translateUI("Multiple choice")}</option>
          <option value="matching">{translateUI("Matching")}</option>
          <option value="blanks">{translateUI("Fill blanks")}</option>
          <option value="long_answer">{translateUI("Long answer · human assessed")}</option>
        </select>
      </label>
      <label>{translateUI("Question points")}<input
          aria-label={translateUI("Question points")}
          type="number"
          min={1}
          max={20}
          value={q.points ?? 1}
          onChange={(e) => update({ ...q, points: Number(e.target.value) })}
        />
      </label>
    </>
  );
}
export function ExtendedQuestion({ q, update }: Props) {
  const k = q.kind;
  if (k === "long_answer")
    return (
      <><label>{translateUI("Essay score required to mark correct")}<input type="number" required min={0} max={100} value={q.passRate??100} onChange={e=>update({...q,passRate:Number(e.target.value)})}/></label><label>{translateUI("Assessment rubric")}<textarea
          aria-label={translateUI("Assessment rubric")}
          required
          maxLength={600}
          value={q.rubric ?? ""}
          onChange={(e) => update({ ...q, rubric: e.target.value })}
        />
      </label></>
    );
  const blankChoices=dropdownChoices(q);
  const prompts = q.prompts ?? [],
    answers =
      k === "matching"
        ? prompts.map((_, i) => q.options[q.matches![i]])
        : (q.correctAnswers ?? []);
  const rebuild = (ps: string[], as: string[],choices=blankChoices) =>
    update(
      k === "matching"
        ? { ...q, prompts: ps, options: as, matches: ps.map((_, i) => i) }
        : { ...q, prompts: ps, correctAnswers: as,...(choices?dropdownFields(choices):{}) },
    );
  return (
    <>
      {prompts.map((prompt, i) => (
        <div className="panel" key={i}>
          <label>
            {k === "matching" ? "Matching term" : "Blank label"} {i + 1}
            <input
              aria-label={`${k === "matching" ? "Matching term" : "Blank label"} ${i + 1}`}
              required
              maxLength={240}
              value={prompt}
              onChange={(e) =>
                rebuild(
                  prompts.map((v, j) => (j === i ? e.target.value : v)),
                  answers,
                )
              }
            />
          </label>
          <label>
            {k === "matching" ? "Matching meaning" : "Expected word"} {i + 1}
            <input
              aria-label={`${k === "matching" ? "Matching meaning" : "Expected word"} ${i + 1}`}
              required
              maxLength={k === "matching" ? 240 : 200}
              value={answers[i]}
              onChange={(e) =>
                rebuild(
                  prompts,
                  answers.map((v, j) => (j === i ? e.target.value : v)),
                )
              }
            />
          </label>
          {k==="blanks"&&<><label><input type="checkbox" checked={!!blankChoices?.[i]?.length} onChange={e=>{const choices=blankChoices??prompts.map(()=>[]);rebuild(prompts,answers,choices.map((values,n)=>n===i?(e.target.checked?[answers[i]??"",""]:[]):values));}}/>{translateUI("Use dropdown blank")} {i+1}</label>
          {!!blankChoices?.[i]?.length&&<label>{translateUI("Dropdown choices, one per line")} {i+1}<textarea aria-label={translateUI("Dropdown choices, one per line")+" "+(i+1)} required maxLength={1608} value={blankChoices[i]!.join("\n")} onChange={e=>{const choices=blankChoices!;rebuild(prompts,answers,choices.map((values,n)=>n===i?e.target.value.split("\n"):values));}}/></label>}</>}
          <button
            type="button"
            className="ghost"
            disabled={prompts.length <= (k === "matching" ? 2 : 1)}
            onClick={() =>
              rebuild(
                prompts.filter((_, j) => j !== i),
                answers.filter((_, j) => j !== i),
                blankChoices?.filter((_,j)=>j!==i),
              )
            }
          >{translateUI("Remove pair / blank")}{" "}{i + 1}
          </button>
        </div>
      ))}
      <button
        type="button"
        disabled={prompts.length >= 8}
        onClick={() => rebuild([...prompts, ""], [...answers, ""],blankChoices?[...blankChoices,[]]:undefined)}
      >{translateUI("Add")}{" "}{k === "matching" ? "matching pair" : "blank"}
      </button>
    </>
  );
}
