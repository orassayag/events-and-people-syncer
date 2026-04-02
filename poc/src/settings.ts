import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { ValidationSchemas } from "./validators/validationSchemas.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const portEnv = process.env.REDIRECT_PORT || "3000";
const portResult = ValidationSchemas.redirectPort.safeParse(
  parseInt(portEnv, 10),
);

if (!portResult.success) {
  throw new Error(
    `Invalid REDIRECT_PORT: ${portResult.error.issues[0].message}`,
  );
}

export const SETTINGS = {
  API_PAGE_SIZE: 1000,
  DISPLAY_PAGE_SIZE: 15,
  TOP_CONTACTS_DISPLAY: 10,
  REDIRECT_PORT: portResult.data,
  BROWSER_TIMEOUT: 240000,
  API_STATS_FILE_PATH: join(__dirname, "..", "api-stats.json"),
  TOKEN_PATH: join(__dirname, "..", "token.json"),
  SCOPES: ["https://www.googleapis.com/auth/contacts"],
};
