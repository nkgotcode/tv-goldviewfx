import app from "../../src/api/routes/index";

export async function rlApiRequest(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers ?? {});
  const token = process.env.API_TOKEN;
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return app.request(path, {
    ...init,
    headers,
  });
}
