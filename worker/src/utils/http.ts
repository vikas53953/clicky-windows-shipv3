export function json(value: unknown, status: number, cors: HeadersInit): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      ...cors,
      "content-type": "application/json; charset=utf-8"
    }
  });
}

export function trimTrailingSlash(value: string): string {
  return value.replace(/\/$/, "");
}
