export interface RetryOptions {
  maxRetries?: number;        // Maximum number of retry attempts (default: 3)
  initialDelayMs?: number;    // Starting delay before first retry in ms (default: 200)
  maxDelayMs?: number;        // Maximum delay cap in ms (default: 3000)
  backoffFactor?: number;     // Multiplier for exponential backoff (default: 2)
  jitter?: boolean;           // Add random jitter to prevent thundering herds (default: true)
  shouldRetry?: (error: unknown) => boolean; // Predicate to control retryability
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Executes an asynchronous operation with exponential backoff and jitter.
 */
export async function retryWithBackoff<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const initialDelayMs = options.initialDelayMs ?? 200;
  const maxDelayMs = options.maxDelayMs ?? 3000;
  const backoffFactor = options.backoffFactor ?? 2;
  const jitter = options.jitter ?? true;
  const shouldRetry = options.shouldRetry ?? (() => true);

  let attempt = 0;

  while (true) {
    attempt++;
    try {
      return await operation(attempt);
    } catch (error) {
      if (attempt > maxRetries || !shouldRetry(error)) {
        throw error;
      }

      // Calculate exponential backoff delay: delay = initialDelay * (factor ^ (attempt - 1))
      let delay = initialDelayMs * Math.pow(backoffFactor, attempt - 1);
      delay = Math.min(delay, maxDelayMs);

      // Apply random full jitter (0 to delay) to distribute spikes
      if (jitter) {
        delay = Math.random() * delay;
      }

      await sleep(delay);
    }
  }
}
