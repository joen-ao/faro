/**
 * F30 · `npm run auth:hash` — asks for the password twice (hidden), prints AUTH_PASSWORD_HASH and a fresh AUTH_SECRET.
 * The password itself is never printed, stored or sent anywhere.
 */
import { randomBytes } from "node:crypto";
import { Writable } from "node:stream";
import readline from "node:readline";
import { hashPassword, MIN_PASSWORD_LENGTH } from "../src/lib/auth";

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
  const ask = (question: string) =>
    new Promise<string>((resolve) => {
      muted = false;
      process.stdout.write(question);
      muted = true;
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
  return { ask, close: () => rl.close() };
}

async function main() {
  const { ask, close } = makeAsk();
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
  const hash = await hashPassword(a);
  console.log("\nPega estas variables en Vercel (Production) y en tu .env.local:\n");
  console.log(`AUTH_PASSWORD_HASH=${hash}`);
  console.log(`AUTH_SECRET=${randomBytes(48).toString("base64url")}`);
  console.log("\nAUTH_EMAIL=anayajoen@gmail.com  (si aún no está)");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
