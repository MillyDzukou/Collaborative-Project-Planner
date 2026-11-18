export class HttpError extends Error {
  status: number;
  code: string;
  /** Extra machine-readable context (e.g. the current state on a 409 conflict). */
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function errorBody(code: string, message: string, details?: unknown) {
  return { error: { code, message, ...(details !== undefined ? { details } : {}) } };
}
