import { readFile } from "node:fs/promises";
import { loadEnv } from "../../config/env";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";

export type TelegramMessage = {
  externalId: string;
  content: string;
  publishedAt: string | null;
  editedAt: string | null;
  status: "active" | "edited" | "removed";
};

type TelegramFixtureMessage = {
  id: string | number;
  text?: string | null;
  date?: string | null;
  edit_date?: string | null;
  status?: "active" | "edited" | "removed";
};

type TelegramFixture =
  | TelegramFixtureMessage[]
  | {
      messages: TelegramFixtureMessage[];
    };

function normalizeFixtureMessages(fixture: TelegramFixture): TelegramFixtureMessage[] {
  if (Array.isArray(fixture)) {
    return fixture;
  }
  return fixture.messages ?? [];
}

function mapFixtureMessage(message: TelegramFixtureMessage): TelegramMessage | null {
  const content = (message.text ?? "").trim();
  const status =
    message.status ??
    (content.length === 0 ? "removed" : message.edit_date ? "edited" : "active");
  if (!message.id) {
    return null;
  }
  return {
    externalId: String(message.id),
    content,
    publishedAt: message.date ?? null,
    editedAt: message.edit_date ?? null,
    status,
  };
}

async function loadFixtureMessages(path: string): Promise<TelegramMessage[]> {
  const raw = await readFile(path, "utf8");
  const fixture = JSON.parse(raw) as TelegramFixture;
  return normalizeFixtureMessages(fixture)
    .map(mapFixtureMessage)
    .filter((message): message is TelegramMessage => Boolean(message));
}

async function getTelegramClient() {
  const env = loadEnv();
  if (!env.TELEGRAM_API_ID || !env.TELEGRAM_API_HASH || !env.TELEGRAM_SESSION) {
    throw new Error("Telegram credentials are missing. Set TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_SESSION.");
  }
  const session = new StringSession(env.TELEGRAM_SESSION);
  const client = new TelegramClient(session, env.TELEGRAM_API_ID, env.TELEGRAM_API_HASH, {
    connectionRetries: 5,
  });
  await client.connect();
  return client;
}

function mapApiMessage(message: any): TelegramMessage | null {
  if (!message || typeof message !== "object") {
    return null;
  }
  const content = typeof message.message === "string" ? message.message.trim() : "";
  const publishedAt = message.date ? new Date(message.date * 1000).toISOString() : null;
  const editedAt = message.editDate ? new Date(message.editDate * 1000).toISOString() : null;
  const status =
    content.length === 0 ? "removed" : message.editDate ? "edited" : "active";
  if (!message.id) {
    return null;
  }
  return {
    externalId: String(message.id),
    content,
    publishedAt,
    editedAt,
    status,
  };
}

export async function fetchTelegramMessages(identifier: string, limit: number): Promise<TelegramMessage[]> {
  const env = loadEnv();
  if (env.TELEGRAM_MESSAGES_PATH) {
    return loadFixtureMessages(env.TELEGRAM_MESSAGES_PATH);
  }

  const client = await getTelegramClient();
  try {
    const entity = await client.getEntity(identifier);
    const messages = await client.getMessages(entity, { limit });
    return messages
      .map((message) => mapApiMessage(message))
      .filter((message): message is TelegramMessage => Boolean(message));
  } finally {
    await client.disconnect();
  }
}
