import { google, Auth } from "googleapis";
import { readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { createServer, IncomingMessage, ServerResponse, Server } from "http";
import { parse } from "url";
import { exec } from "child_process";
import type { GoogleCredentials, TokenData } from "../types.js";
import { SETTINGS } from "../settings.js";
import { PortManager } from "../utils/index.js";

type OAuth2Client = Auth.OAuth2Client;

export class AuthService {
  private oAuth2Client?: OAuth2Client;
  private server?: Server;

  async authorize(): Promise<OAuth2Client> {
    const credentials = await this.loadCredentials();
    this.oAuth2Client = this.createOAuth2Client(credentials);
    const token = await this.loadToken();
    if (token) {
      this.oAuth2Client.setCredentials(token);
      return this.oAuth2Client;
    }
    await this.getNewToken();
    return this.oAuth2Client;
  }

  private async loadCredentials(): Promise<GoogleCredentials> {
    const clientId = process.env.CLIENT_ID;
    const clientSecret = process.env.CLIENT_SECRET;
    const projectId = process.env.PROJECT_ID;
    const authUri = process.env.AUTH_URI;
    const tokenUri = process.env.TOKEN_URI;
    const authProviderCertUrl = process.env.AUTH_PROVIDER_CERT_URL;
    if (
      !clientId ||
      !clientSecret ||
      !projectId ||
      !authUri ||
      !tokenUri ||
      !authProviderCertUrl
    ) {
      throw new Error(
        "Missing required environment variables. Please check .env file.",
      );
    }
    return {
      web: {
        client_id: clientId,
        project_id: projectId,
        auth_uri: authUri,
        token_uri: tokenUri,
        auth_provider_x509_cert_url: authProviderCertUrl,
        client_secret: clientSecret,
      },
    };
  }

  private async loadToken(): Promise<TokenData | null> {
    if (!existsSync(SETTINGS.TOKEN_PATH)) {
      return null;
    }
    const content = await readFile(SETTINGS.TOKEN_PATH, "utf-8");
    return JSON.parse(content);
  }

  private async saveToken(token: TokenData): Promise<void> {
    await writeFile(SETTINGS.TOKEN_PATH, JSON.stringify(token, null, 2));
    console.log("Token saved to:", SETTINGS.TOKEN_PATH);
  }

  private createOAuth2Client(credentials: GoogleCredentials): OAuth2Client {
    const { client_id, client_secret } = credentials.web;
    const redirectUri = `http://localhost:${SETTINGS.REDIRECT_PORT}`;
    return new google.auth.OAuth2(client_id, client_secret, redirectUri);
  }

  private async getNewToken(): Promise<void> {
    if (!this.oAuth2Client) {
      throw new Error("OAuth2 client not initialized");
    }
    await PortManager.ensurePortAvailable(SETTINGS.REDIRECT_PORT);
    const OAUTH_TIMEOUT = 10 * 60 * 1000;
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error("OAuth authentication timeout after 10 minutes"));
      }, OAUTH_TIMEOUT);
    });
    return Promise.race([this.startAuthServer(), timeoutPromise]);
  }

  private async startAuthServer(): Promise<void> {
    if (!this.oAuth2Client) {
      throw new Error("OAuth2 client not initialized");
    }
    return new Promise((resolve, reject) => {
      let serverClosed = false;
      const closeServer = () => {
        if (this.server && !serverClosed) {
          serverClosed = true;
          this.server.close();
        }
      };
      const handleSignal = () => {
        console.log("\nReceived interrupt signal. Cleaning up...");
        closeServer();
        process.exit(0);
      };
      process.on("SIGINT", handleSignal);
      process.on("SIGTERM", handleSignal);
      try {
        this.server = createServer(
          async (req: IncomingMessage, res: ServerResponse) => {
            if (!req.url) {
              return;
            }
            const queryData = parse(req.url, true).query;
            if (queryData.code) {
              const code = queryData.code as string;
              res.writeHead(200, { "Content-Type": "text/html" });
              res.end(
                "<h1>Authentication successful!</h1><p>You can close this window and return to the terminal.</p>",
              );
              closeServer();
              try {
                if (!this.oAuth2Client) {
                  throw new Error("OAuth2 client not initialized");
                }
                const { tokens } = await this.oAuth2Client.getToken(code);
                this.oAuth2Client.setCredentials(tokens);
                await this.saveToken(tokens as TokenData);
                console.log("\n✓ Authentication successful!\n");
                process.removeListener("SIGINT", handleSignal);
                process.removeListener("SIGTERM", handleSignal);
                resolve();
              } catch (err) {
                process.removeListener("SIGINT", handleSignal);
                process.removeListener("SIGTERM", handleSignal);
                reject(new Error("Error retrieving access token: " + err));
              }
            } else if (queryData.error) {
              res.writeHead(400, { "Content-Type": "text/html" });
              res.end(
                "<h1>Authentication failed!</h1><p>Error: " +
                  queryData.error +
                  "</p>",
              );
              closeServer();
              process.removeListener("SIGINT", handleSignal);
              process.removeListener("SIGTERM", handleSignal);
              reject(new Error("Authentication failed: " + queryData.error));
            }
          },
        );
        this.server.listen(SETTINGS.REDIRECT_PORT, () => {
          if (!this.oAuth2Client) {
            reject(new Error("OAuth2 client not initialized"));
            return;
          }
          const authUrl = this.oAuth2Client.generateAuthUrl({
            access_type: "offline",
            scope: SETTINGS.SCOPES,
          });
          console.log("\nOpening browser for authentication...");
          console.log(
            "If the browser does not open automatically, visit this URL:\n",
          );
          console.log(authUrl);
          console.log("\n");
          this.openBrowser(authUrl);
        });
        this.server.on("error", (err) => {
          process.removeListener("SIGINT", handleSignal);
          process.removeListener("SIGTERM", handleSignal);
          reject(new Error("Failed to start local server: " + err.message));
        });
      } catch (error) {
        closeServer();
        process.removeListener("SIGINT", handleSignal);
        process.removeListener("SIGTERM", handleSignal);
        reject(error);
      }
    });
  }

  private openBrowser(url: string): void {
    const platform = process.platform;
    const command =
      platform === "darwin"
        ? "open"
        : platform === "win32"
          ? "start"
          : "xdg-open";
    exec(
      `${command} "${url}"`,
      { timeout: SETTINGS.BROWSER_TIMEOUT },
      (error) => {
        if (error) {
          console.log(
            "\nCould not automatically open browser. Please visit this URL manually:\n",
          );
          console.log(url);
        }
      },
    );
  }
}
