/**
 * F30 · `npm run auth:set-password` — creates the login account in the database (DATABASE_URL from .env.local, i.e.
 * Supabase) or replaces its password. Asks for the password twice without echoing it; only the scrypt hash is stored.
 * There is no web sign-up: this command is the only way to create an account.
 */
import "./load-env";
import { Writable } from "node:stream";
import readline from "node:readline";
import { createDb } from "../src/db/client";
import { migrate } from "../src/db/migrate";
import type { AppDb } from "../src/db/types";
import { MIN_PASSWORD_LENGTH, setUserPassword } from "../src/lib/auth";

const DEFAULT_EMAIL = "anayajoen@gmail.com";

/** One readline for every question (a second one would miss input already buffered by the first). */
function makeAsk() {
  let muted = false;
  const out = new Writable({
    write(chunk, _enc, cb) {
      if (!muted) process.stdout.write(chunk);
      cb();
    },
  });
  const rl = readline.createInterface({ input: process.stdin, output: out, terminal: process.stdin.isTTY ?? false });
  const lines: string[] = [];
  const waiting: ((s: string) => void)[] = [];
  rl.on("line", (l) => {
    const w = waiting.shift();
    if (w) w(l);
    else lines.push(l);
  });
  const ask = (question: string, hidden: boolean) =>
    new Promise<string>((resolve) => {
      muted = false;
      process.stdout.write(question);
      muted = hidden;
      const ready = lines.shift();
      if (ready !== undefined) {
        process.stdout.write("\n");
        resolve(ready);
      } else
        waiting.push((l) => {
          process.stdout.write("\n");
          resolve(l);
        });
    });
  const askVisible = async (question: string) => {
    const v = await ask(question, false);
    return v;
  };
  return { ask: (q: string) => ask(q, true), askVisible, close: () => rl.close() };
}

async function main() {
  const { ask, askVisible, close } = makeAsk();
  const email = (await askVisible(`Correo [${DEFAULT_EMAIL}]: `)).trim() || DEFAULT_EMAIL;
  const a = await ask("Contraseña nueva: ");
  if (a.length < MIN_PASSWORD_LENGTH) {
    console.error(`Debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
    process.exit(1);
  }
  const b = await ask("Repítela: ");
  close();
  if (a !== b) {
    console.error("No coinciden.");
    process.exit(1);
  }
  const conn = createDb();
  try {
    await migrate(conn);
    const { created } = await setUserPassword(conn.db as unknown as AppDb, email, a);
    console.log(`\n${created ? "Usuario creado" : "Contraseña actualizada"} para ${email.trim().toLowerCase()} en la base ${conn.kind === "postgres" ? "de Supabase (DATABASE_URL)" : "local (PGlite)"}.`);
    console.log("Ya puedes entrar en /app/login con ese correo y esa contraseña.");
  } finally {
    await conn.close();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
