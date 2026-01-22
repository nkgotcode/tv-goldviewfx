import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import readline from "node:readline";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";

function loadDotEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) {
    return;
  }
  const contents = readFileSync(envPath, "utf8");
  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const match = trimmed.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (!match) {
      continue;
    }
    const [, key, rawValue] = match;
    if (process.env[key]) {
      continue;
    }
    let value = rawValue.trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function createPrompt() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const ask = (question: string) =>
    new Promise<string>((resolveAnswer) => {
      rl.question(question, (answer) => resolveAnswer(answer.trim()));
    });
  return { rl, ask };
}

async function main() {
  loadDotEnv();

  const apiIdRaw = process.env.TELEGRAM_API_ID;
  const apiHash = process.env.TELEGRAM_API_HASH;
  if (!apiIdRaw || !apiHash) {
    throw new Error("Set TELEGRAM_API_ID and TELEGRAM_API_HASH in backend/.env first.");
  }

  const apiId = Number(apiIdRaw);
  if (!Number.isFinite(apiId)) {
    throw new Error("TELEGRAM_API_ID must be a number.");
  }

  let session: StringSession;
  try {
    session = new StringSession(process.env.TELEGRAM_SESSION ?? "");
  } catch (error) {
    console.warn("Invalid TELEGRAM_SESSION detected; starting a fresh session.");
    session = new StringSession("");
  }
  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 5,
  });

  const { rl, ask } = createPrompt();
  try {
    await client.start({
      phoneNumber: async () => ask("Phone number (include country code): "),
      phoneCode: async () => ask("Code from Telegram: "),
      password: async () => {
        const value = await ask("2FA password (press Enter if none): ");
        return value || undefined;
      },
      onError: (err) => {
        console.error("Telegram login error:", err);
      },
    });

    const saved = client.session.save();
    console.log("TELEGRAM_SESSION=" + saved);
  } finally {
    rl.close();
    await client.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
