import "@testing-library/jest-dom";
import { vi } from "vitest";

process.env.TZ = "UTC";

vi.mock("next/navigation", () => {
  return {
    usePathname: () => "/",
  };
});
