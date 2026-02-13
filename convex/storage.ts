import { action, mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const storeTextFile = action({
  args: {
    content: v.string(),
    contentType: v.string(),
    filename: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const blob = new Blob([args.content], { type: args.contentType });
    const storageId = await ctx.storage.store(blob);
    return { storageId };
  },
});

export const storeBinaryFile = action({
  args: {
    data: v.bytes(),
    contentType: v.string(),
    filename: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const blob = new Blob([args.data], { type: args.contentType });
    const storageId = await ctx.storage.store(blob);
    return { storageId };
  },
});

export const getFileUrl = query({
  args: { storageId: v.string() },
  handler: async (ctx, args) => {
    try {
      return await ctx.storage.getUrl(args.storageId);
    } catch {
      return null;
    }
  },
});

export const deleteFile = mutation({
  args: { storageId: v.string() },
  handler: async (ctx, args) => {
    await ctx.storage.delete(args.storageId);
    return { deleted: true };
  },
});
