/** Mock reply for `ad_learnings`: deterministic and only cites numbers present in the payload. */
export function mockAdLearnings(payloadLine: string): string {
  let p: { findings?: { id: string; winner: string; runnerUp: string | null; winnerValuePct: string; runnerUpValuePct: string; confidence: string }[] } = {};
  try {
    p = JSON.parse(payloadLine);
  } catch {
    /* empty */
  }
  return JSON.stringify({
    learnings: (p.findings ?? []).map((f) => ({
      id: f.id,
      statement: `"${f.winner}" supera a "${f.runnerUp ?? "el resto"}" (${f.winnerValuePct} % frente a ${f.runnerUpValuePct} %), confianza ${f.confidence}. Úsalo como punto de partida en las próximas variantes.`,
    })),
  });
}
