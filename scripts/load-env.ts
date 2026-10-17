// Loads .env*.local like Next does, before any module reads process.env.
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());
