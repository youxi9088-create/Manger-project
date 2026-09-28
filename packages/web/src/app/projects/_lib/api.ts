const configuredApiBase = process.env.NEXT_PUBLIC_SERVER_API?.trim() || "";

export function projectApi(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${configuredApiBase.replace(/\/$/, "")}${normalizedPath}`;
}
