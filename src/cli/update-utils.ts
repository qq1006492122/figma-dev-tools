const STABLE_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function isValidStableVersion(version: unknown): version is string {
  return typeof version === 'string' && STABLE_VERSION_PATTERN.test(version);
}

export function compareStableVersions(left: string, right: string): -1 | 0 | 1 {
  if (!isValidStableVersion(left) || !isValidStableVersion(right)) {
    throw new Error('版本号必须是稳定的 major.minor.patch SemVer');
  }
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);
  for (let index = 0; index < leftParts.length; index++) {
    if (leftParts[index]! > rightParts[index]!) return 1;
    if (leftParts[index]! < rightParts[index]!) return -1;
  }
  return 0;
}

export interface FetchLatestStableVersionOptions {
  fetchImpl?: typeof fetch;
  maxAttempts?: number;
  timeoutMs?: number;
  sleep?: (delayMs: number) => Promise<void>;
}

export async function fetchLatestStableVersion(
  url: string,
  options: FetchLatestStableVersionOptions = {},
): Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxAttempts = Math.max(1, Math.min(options.maxAttempts ?? 3, 5));
  const timeoutMs = Math.max(100, Math.min(options.timeoutMs ?? 15_000, 60_000));
  const sleep = options.sleep ?? ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)));
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, { signal: controller.signal });
      if (response.ok) {
        const data = (await response.json()) as { version?: unknown };
        if (!isValidStableVersion(data.version)) throw new Error('npm registry 返回的版本号无效');
        return data.version;
      }
      if (![408, 429, 500, 502, 503, 504].includes(response.status)) {
        throw new Error(`npm registry 请求失败 (HTTP ${response.status})`);
      }
      lastError = new Error(`npm registry 临时失败 (HTTP ${response.status})`);
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
    if (attempt < maxAttempts - 1) await sleep(250 * 2 ** attempt);
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export interface UpdateAttemptState {
  installSucceeded: boolean;
  fallbackSucceeded: boolean;
}

export function getUpdateExitCode(state: UpdateAttemptState): 0 | 1 {
  return state.installSucceeded || state.fallbackSucceeded ? 0 : 1;
}

export function canUseFallbackPackage(sourceVersion: unknown, targetVersion: unknown): boolean {
  return (
    isValidStableVersion(sourceVersion) &&
    isValidStableVersion(targetVersion) &&
    compareStableVersions(sourceVersion, targetVersion) === 0
  );
}
