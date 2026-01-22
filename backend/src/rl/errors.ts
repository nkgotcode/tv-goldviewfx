export type RlServiceError = {
  message: string;
  status: number;
  code: string;
};

export function mapRlServiceError(error: unknown, fallbackStatus = 502): RlServiceError {
  if (error instanceof Error) {
    const match = error.message.match(/\((\d{3})\)/);
    const status = match ? Number(match[1]) : fallbackStatus;
    return {
      message: error.message,
      status,
      code: status >= 500 ? "rl_service_unavailable" : "rl_service_error",
    };
  }

  return {
    message: "RL service error",
    status: fallbackStatus,
    code: "rl_service_error",
  };
}
