/** Shared by server and client components of Pauta. */
export const money = (n: number | null, cur = "COP") => (n === null ? "—" : `${cur} ${Math.round(n).toLocaleString("es-CO")}`);
