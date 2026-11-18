/**
 * Shared error shape for the auth module: `{ error: { code, message } }`.
 * This mirrors the convention the project standardizes on API-wide in Step 11.
 */
export class AuthError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "AuthError";
    this.status = status;
    this.code = code;
  }

  toResponseBody() {
    return { error: { code: this.code, message: this.message } };
  }
}

/**
 * Generic, intentionally vague credential error. Used for both "no such
 * email" and "wrong password" so the API never reveals which one was wrong.
 */
export function invalidCredentialsError(): AuthError {
  return new AuthError(401, "INVALID_CREDENTIALS", "Invalid email or password.");
}

export function emailAlreadyRegisteredError(): AuthError {
  return new AuthError(409, "EMAIL_ALREADY_REGISTERED", "An account with this email already exists.");
}

export function validationError(message: string): AuthError {
  return new AuthError(400, "VALIDATION_ERROR", message);
}

export function unauthenticatedError(): AuthError {
  return new AuthError(401, "UNAUTHENTICATED", "Authentication required.");
}
