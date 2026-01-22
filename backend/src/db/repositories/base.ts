export function assertNoError<T>(response: { data: T | null; error: { message: string } | null }, context: string): T {
  if (response.error) {
    throw new Error(`${context}: ${response.error.message}`);
  }
  if (!response.data) {
    throw new Error(`${context}: missing data`);
  }
  return response.data;
}
