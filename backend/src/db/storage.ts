import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { loadEnv } from "../config/env";

const env = loadEnv();
let client: ConvexHttpClient<typeof anyApi> | null = null;

function getConvexStorageClient() {
  if (!env.CONVEX_URL) {
    throw new Error("CONVEX_URL is required for Convex storage operations.");
  }
  if (!client) {
    client = new ConvexHttpClient(env.CONVEX_URL);
  }
  return client;
}

type StoreResult = { storageId: string };

export async function storeTextFile(payload: { content: string; contentType: string; filename?: string }) {
  const result = await getConvexStorageClient().action(anyApi.storage.storeTextFile, payload);
  return result as StoreResult;
}

export async function storeBinaryFile(payload: {
  data: ArrayBuffer | Uint8Array;
  contentType: string;
  filename?: string;
}) {
  const data =
    payload.data instanceof ArrayBuffer
      ? payload.data
      : payload.data.buffer.slice(payload.data.byteOffset, payload.data.byteOffset + payload.data.byteLength);
  const result = await getConvexStorageClient().action(anyApi.storage.storeBinaryFile, {
    ...payload,
    data,
  });
  return result as StoreResult;
}

export async function getFileUrl(storageId: string) {
  const result = await getConvexStorageClient().query(anyApi.storage.getFileUrl, { storageId });
  return result as string | null;
}

export async function deleteFile(storageId: string) {
  const result = await getConvexStorageClient().mutation(anyApi.storage.deleteFile, { storageId });
  return result as { deleted: boolean };
}
