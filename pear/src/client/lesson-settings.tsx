import React from "react";
import type { Lesson } from "../shared/model.ts";
import type { EventSession } from "../shared/blended.ts";
export const newEventSession = (): EventSession => {
  const start = new Date(Date.now() + 86400000);
  return {
    id: "session-" + crypto.randomUUID().slice(0, 8),
    startsAt: start.toISOString(),
    endsAt: new Date(+start + 3600000).toISOString(),
    cutoffAt: new Date(+start - 3600000).toISOString(),
    timezone: "UTC",
    capacity: 20,
    location: "Internal workshop",
  };
};
export function LessonSettings({
  lesson,
  onChange,
}: {
  lesson: Lesson;
  onChange: (patch: Partial<Lesson>) => void;
}) {
  if (lesson.kind === "submission")
    return (
      <fieldset>
        <legend>Assignment submission policy</legend>
        <label>
          Submission rubric
          <textarea
            aria-label="Submission rubric"
            required
            maxLength={600}
            value={lesson.submission?.rubric ?? ""}
            onChange={(e) =>
              onChange({
                submission: { ...lesson.submission!, rubric: e.target.value },
              })
            }
          />
        </label>
        <label>
          Submission maximum attempts
          <input
            aria-label="Submission maximum attempts"
            type="number"
            min={1}
            max={10}
            value={lesson.submission?.maxAttempts ?? 1}
            onChange={(e) =>
              onChange({
                submission: {
                  ...lesson.submission!,
                  maxAttempts: Number(e.target.value),
                },
              })
            }
          />
        </label>
        <label>
          Submission pass score
          <input
            aria-label="Submission pass score"
            type="number"
            min={1}
            max={100}
            value={lesson.submission?.passScore ?? 70}
            onChange={(e) =>
              onChange({
                submission: {
                  ...lesson.submission!,
                  passScore: Number(e.target.value),
                },
              })
            }
          />
        </label>
      </fieldset>
    );
  if (lesson.kind !== "event") return null;
  const update = (i: number, key: string, value: unknown) =>
    onChange({
      sessions: lesson.sessions!.map((s, n) =>
        n === i ? { ...s, [key]: value } : s,
      ),
    });
  return (
    <fieldset>
      <legend>Instructor-led sessions</legend>
      <p>
        Use timestamps with Z or an explicit offset; timezone controls display.
        Published session IDs retain their time/capacity. Use a new ID to
        reschedule.
      </p>
      {lesson.sessions?.map((s, i) => (
        <fieldset key={i}>
          <legend>Session {i + 1}</legend>
          {(
            [
              ["id", "Session ID", 64],
              ["startsAt", "Session start", 40],
              ["endsAt", "Session end", 40],
              ["cutoffAt", "Booking cutoff", 40],
              ["timezone", "Session timezone", 80],
              ["location", "Session location", 200],
              ["joinUrl", "Session HTTPS join URL", 2048],
            ] as const
          ).map(([k, label, max]) => (
            <label key={k}>
              {label}
              <input
                aria-label={label}
                required={k !== "joinUrl"}
                maxLength={max}
                value={s[k] ?? ""}
                onChange={(e) => update(i, k, e.target.value || undefined)}
              />
            </label>
          ))}
          <label>
            Session capacity
            <input
              aria-label="Session capacity"
              type="number"
              min={1}
              max={500}
              value={s.capacity}
              onChange={(e) => update(i, "capacity", Number(e.target.value))}
            />
          </label>
          <button
            type="button"
            disabled={lesson.sessions!.length <= 1}
            onClick={() =>
              onChange({ sessions: lesson.sessions!.filter((_, n) => n !== i) })
            }
          >
            Remove session
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        disabled={(lesson.sessions?.length ?? 0) >= 8}
        onClick={() =>
          onChange({ sessions: [...lesson.sessions!, newEventSession()] })
        }
      >
        Add session
      </button>
    </fieldset>
  );
}
