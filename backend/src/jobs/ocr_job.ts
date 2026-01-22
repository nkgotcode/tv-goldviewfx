import { runOcrBatch } from "../services/ocr";

export async function runOcrJob() {
  return runOcrBatch(20);
}
