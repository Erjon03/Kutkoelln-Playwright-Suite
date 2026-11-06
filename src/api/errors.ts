import type { APIResponse } from '@playwright/test';

/**
 * Short description of a failed API response: status plus Shopware's error code and detail. Some shops answer
 * with debug traces (URLs, access keys, the whole request context) that must not end up in reports or CI logs.
 */
export async function apiError(res: APIResponse): Promise<string> {
  const text = await res.text().catch(() => '');
  try {
    const { errors } = JSON.parse(text) as { errors?: { code?: string; title?: string; detail?: string }[] };
    if (errors?.length) {
      return `${res.status()} ${errors.map((e) => [e.code, e.detail ?? e.title].filter(Boolean).join(': ')).join('; ')}`;
    }
  } catch {
    // not JSON → fall through
  }
  return `${res.status()} ${text.slice(0, 200)}`;
}
