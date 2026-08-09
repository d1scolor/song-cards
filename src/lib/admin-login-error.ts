export async function adminLoginErrorMessage(response: Response) {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error.trim()) {
      return body.error;
    }
  } catch {
    // Next.js can return an HTML error page for an unexpected server failure.
  }

  if (response.status >= 500) {
    return `Song Cards could not check the password (server error ${response.status}). Check the server logs and its ADMIN_PASSWORD and SESSION_SECRET settings.`;
  }

  return `Unable to sign in (server response ${response.status}). Please try again.`;
}
