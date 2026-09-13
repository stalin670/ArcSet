export type ArcExecutionOutcome<T> = { id: string; status: "complete" | "pending"; value: T };

export type ArcExecutionState<T> = { outcomes: ArcExecutionOutcome<T>[]; running: boolean; needsRecording?: boolean; submissionUncertain?: boolean };

export class ArcSubmissionUncertainError extends Error {
  constructor(cause?: unknown) {
    super("The wallet submission outcome is unknown. Verify wallet activity or ArcScan before starting another transaction. This plan is paused to prevent duplicate submissions.", { cause });
    this.name = "ArcSubmissionUncertainError";
  }
}

/** Retain this state for the reviewed plan, including after presentation or storage errors. */
export function createArcExecutionState<T>(outcomes: ArcExecutionOutcome<T>[] = []): ArcExecutionState<T> {
  return { outcomes: [...outcomes], running: false };
}

/** A submitted outcome is retained before any fallible recording or presentation work. */
export async function executeArcBasketSteps<Step, Quote, Result>(options: {
  state: ArcExecutionState<Result>;
  steps: readonly Step[];
  id: (step: Step) => string;
  quote: (step: Step) => Promise<Quote>;
  execute: (step: Step, quote: Quote) => Promise<{ status: "complete" | "pending"; value: Result }>;
  record: (outcomes: ArcExecutionOutcome<Result>[], complete: boolean) => void | Promise<void>;
}) {
  const { state, steps } = options;
  if (state.running) return { status: "busy" as const };
  if (state.submissionUncertain) throw new ArcSubmissionUncertainError();
  state.running = true;
  try {
    if (state.needsRecording) {
      try {
        await options.record([...state.outcomes], steps.every((step) => state.outcomes.some((outcome) => outcome.id === options.id(step) && outcome.status === "complete")));
        state.needsRecording = false;
      } catch (error) {
        return { status: "recording-failed" as const, error };
      }
    }
    if (state.outcomes.some((outcome) => outcome.status === "pending")) return { status: "pending" as const };
    for (const step of steps) {
      const id = options.id(step);
      if (state.outcomes.some((outcome) => outcome.id === id)) continue;
      const quote = await options.quote(step);
      let result: { status: "complete" | "pending"; value: Result };
      try {
        result = await options.execute(step, quote);
      } catch (error) {
        // The adapter may have submitted before failing without returning a hash.
        // Only quote errors are safe to retry automatically.
        state.submissionUncertain = true;
        throw new ArcSubmissionUncertainError(error);
      }
      state.outcomes.push({ id, ...result });
      state.needsRecording = true;
      const complete = steps.every((candidate) => state.outcomes.some((outcome) => outcome.id === options.id(candidate) && outcome.status === "complete"));
      try {
        await options.record([...state.outcomes], complete);
        state.needsRecording = false;
      } catch (error) {
        return { status: "recording-failed" as const, error };
      }
      if (result.status === "pending") return { status: "pending" as const };
    }
    return { status: "complete" as const };
  } finally {
    state.running = false;
  }
}
