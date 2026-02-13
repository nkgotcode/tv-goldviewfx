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

const E2E_RUN_ENABLED = ["1", "true", "yes", "on"].includes((process.env.E2E_RUN ?? "").trim().toLowerCase());

function parseChatIds(value: string | undefined) {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function isChannelEntity(entity: any) {
  if (!entity) return false;
  const className = String(entity.className ?? entity.constructor?.name ?? "").toLowerCase();
  if (className.includes("channel")) return true;
  return Boolean(entity.broadcast || entity.megagroup);
}

async function resolveFallbackEntities(client: TelegramClient, env: ReturnType<typeof loadEnv>) {
  const entities: any[] = [];
  const chatIds = parseChatIds(env.TELEGRAM_CHAT_IDS);
  for (const chatId of chatIds) {
    try {
      entities.push(await client.getEntity(chatId));
    } catch {
      continue;
    }
  }
  if (!E2E_RUN_ENABLED) {
    return entities;
  }
  const dialogs = await client.getDialogs({ limit: 30 });
  for (const dialog of dialogs) {
    if (isChannelEntity(dialog.entity)) {
      entities.push(dialog.entity);
    }
  }
  return entities;
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

function hasEditsAndRemovals(messages: TelegramMessage[]) {
  let hasEdited = false;
  let hasRemoved = false;
  for (const message of messages) {
    if (message.status === "edited") hasEdited = true;
    if (message.status === "removed") hasRemoved = true;
    if (hasEdited && hasRemoved) return true;
  }
  return false;
}

async function fetchMessagesForEntity(client: TelegramClient, entity: any, limit: number): Promise<TelegramMessage[]> {
  const messages = await client.getMessages(entity, { limit });
  return messages
    .map((message) => mapApiMessage(message))
    .filter((message): message is TelegramMessage => Boolean(message));
}

export async function fetchTelegramMessages(identifier: string, limit: number): Promise<TelegramMessage[]> {
  const env = loadEnv();
  if (env.TELEGRAM_MESSAGES_PATH) {
    return loadFixtureMessages(env.TELEGRAM_MESSAGES_PATH);
  }

  const client = await getTelegramClient();
  try {
    let entity: any;
    try {
      entity = await client.getEntity(identifier);
    } catch (error) {
      const fallbacks = await resolveFallbackEntities(client, env);
      if (fallbacks.length === 0) {
        throw error;
      }
      const targetLimit = E2E_RUN_ENABLED ? Math.max(limit, 50) : limit;
      let firstMessages: TelegramMessage[] | null = null;
      for (const candidate of fallbacks) {
        try {
          const messages = await fetchMessagesForEntity(client, candidate, targetLimit);
          if (!firstMessages) {
            firstMessages = messages;
          }
          if (!E2E_RUN_ENABLED || hasEditsAndRemovals(messages)) {
            return messages;
          }
        } catch {
          continue;
        }
      }
      if (firstMessages) {
        return firstMessages;
      }
      throw error;
    }
    return fetchMessagesForEntity(client, entity, limit);
  } finally {
    await client.disconnect();
  }
}
