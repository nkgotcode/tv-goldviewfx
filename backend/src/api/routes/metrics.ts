import { Hono } from "hono";
import { metricsHandler } from "../../services/metrics";

export const metricsRoutes = new Hono();

metricsRoutes.get("/", (c) => metricsHandler());
