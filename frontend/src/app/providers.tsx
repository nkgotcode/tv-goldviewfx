"use client";

import { Refine } from "@refinedev/core";
import routerProvider from "@refinedev/nextjs-router/app";
import { dataProvider } from "../services/refine-data-provider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <Refine
      dataProvider={dataProvider}
      routerProvider={routerProvider}
      resources={[
        { name: "ideas" },
        { name: "signals" },
        { name: "trades" },
        { name: "telegram-posts" },
        { name: "telegram-sources" },
      ]}
      options={{ syncWithLocation: false, disableTelemetry: true }}
    >
      {children}
    </Refine>
  );
}
