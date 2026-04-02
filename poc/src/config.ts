import { config } from "dotenv";

config();

const requiredVars = [
  "CLIENT_ID",
  "CLIENT_SECRET",
  "PROJECT_ID",
  "AUTH_URI",
  "TOKEN_URI",
  "AUTH_PROVIDER_CERT_URL",
  "REDIRECT_PORT",
];

export const validateEnvironment = (): void => {
  const missingVars = requiredVars.filter((varName) => !process.env[varName]);
  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(", ")}`,
    );
  }
};
