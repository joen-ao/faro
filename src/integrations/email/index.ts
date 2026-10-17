import { getEnv, resolveMode, type Env } from "@/lib/env";
import { createMockEmail } from "./mock";
import { createRealEmail } from "./real";
import type { EmailAdapter } from "./types";

export * from "./types";
export { createMockEmail } from "./mock";
export { createRealEmail, RESEND_ENDPOINT } from "./real";

/**
 * `real` only when EMAIL_MODE=real, credentials exist AND SEND_ENABLED=true.
 * In every other case the mock is returned (which never touches the network).
 */
export function getEmail(env: Env = getEnv()): EmailAdapter {
  if (env.SEND_ENABLED !== true || resolveMode("email", env) !== "real") return createMockEmail();
  return createRealEmail({ apiKey: env.RESEND_API_KEY ?? "", sendEnabled: true });
}
