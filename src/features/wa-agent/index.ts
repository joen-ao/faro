import { getOutreachAnthropic } from "@/integrations/anthropic";
import { getEmail } from "@/integrations/email";
import { getWaCloud } from "@/integrations/wa-cloud";
import { getEnv, type Env } from "@/lib/env";
import type { AppDb } from "@/db/types";
import { closeConversation, type CloseDeps } from "./close";
import type { AgentDeps } from "./engine";
import { getAgentLlm } from "./llm";
import { getMokubBooking } from "./mokub";
import { createOwnerNotifier } from "./notify";

export function getCloseDeps(env: Env = getEnv()): CloseDeps {
  return { env, summarizer: getOutreachAnthropic(env), track: true };
}

/** Everything the agent needs, from the environment (mock unless WA_AGENT_MODE=real with credentials). */
export function getAgentDeps(env: Env = getEnv()): AgentDeps {
  const closeDeps = getCloseDeps(env);
  return {
    llm: getAgentLlm(env),
    wa: getWaCloud(env),
    booking: getMokubBooking(env),
    notify: createOwnerNotifier({ email: getEmail(env), from: env.EMAIL_FROM, to: env.OWNER_EMAIL, appUrl: env.NEXT_PUBLIC_APP_URL }),
    close: async (db: AppDb, id: string) => {
      await closeConversation(db, closeDeps, id);
    },
    debounceMs: env.WA_AGENT_DEBOUNCE_S * 1000,
  };
}

export { closeConversation, closeIdleConversations } from "./close";
export { applyStatus, recordInbound, replyTo, sendAs, setStatus, inServiceWindow } from "./engine";
