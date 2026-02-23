import type { CrudFilters, DataProvider, CustomParams, Pagination } from "@refinedev/core";
import { getApiBaseUrl, getApiHeaders } from "./api";

const resourcePaths: Record<string, string> = {
  ideas: "/ideas",
  signals: "/signals",
  trades: "/trades",
  "telegram-posts": "/telegram/posts",
  "telegram-sources": "/telegram/sources",
};

function buildQuery(filters?: CrudFilters, pagination?: Pagination) {
  const params = new URLSearchParams();
  if (!filters) {
    if (pagination) {
      const page = pagination.currentPage ?? (pagination as { current?: number }).current ?? 1;
      params.set("page", String(page));
      params.set("page_size", String(pagination.pageSize ?? 10));
    }
    return params;
  }
  for (const filter of filters) {
    if (!("field" in filter)) {
      continue;
    }
    const value = filter.value;
    if (value === undefined || value === null || value === "") {
      continue;
    }
    params.set(filter.field, String(value));
  }
  if (pagination) {
    const page = pagination.currentPage ?? (pagination as { current?: number }).current ?? 1;
    params.set("page", String(page));
    params.set("page_size", String(pagination.pageSize ?? 10));
  }
  return params;
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...getApiHeaders(),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const dataProvider: DataProvider = {
  getApiUrl: () => getApiBaseUrl(),
  getList: async ({ resource, filters, pagination }) => {
    const path = resourcePaths[resource];
    if (!path) {
      throw new Error(`Unknown resource: ${resource}`);
    }
    const query = buildQuery(filters, pagination);
    const queryString = query.toString();
    const payload = await fetchJson<any>(queryString ? `${path}?${queryString}` : path);
    if (Array.isArray(payload)) {
      return { data: payload, total: payload.length };
    }
    const data = Array.isArray(payload?.data) ? payload.data : [];
    const total = typeof payload?.total === "number" ? payload.total : data.length;
    return { data, total };
  },
  getOne: async ({ resource, id }) => {
    const path = resourcePaths[resource];
    if (!path) {
      throw new Error(`Unknown resource: ${resource}`);
    }
    const data = await fetchJson<any>(`${path}/${id}`);
    return { data };
  },
  create: async ({ resource, variables }) => {
    const path = resourcePaths[resource];
    if (!path) {
      throw new Error(`Unknown resource: ${resource}`);
    }
    const data = await fetchJson<any>(path, {
      method: "POST",
      body: JSON.stringify(variables ?? {}),
    });
    return { data };
  },
  custom: async ({ url, method, payload, query }: CustomParams) => {
    const queryParams = query ? new URLSearchParams(query as Record<string, string>).toString() : "";
    const path = queryParams ? `${url}?${queryParams}` : url;
    const data = await fetchJson<any>(path, {
      method: method?.toUpperCase() ?? "GET",
      body: payload ? JSON.stringify(payload) : undefined,
    });
    return { data };
  },
  update: async () => {
    throw new Error("Update not implemented");
  },
  deleteOne: async () => {
    throw new Error("Delete not implemented");
  },
  getMany: async () => {
    throw new Error("getMany not implemented");
  },
};
