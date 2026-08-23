import {
  CircuitBreaker,
  CircuitBreakerError,
  CircuitBreakerState,
  retryWithBackoff,
} from '@ecommerce/shared';

describe('Resilience Utilities', () => {
  describe('CircuitBreaker', () => {
    let breaker: CircuitBreaker;

    beforeEach(() => {
      breaker = new CircuitBreaker({
        name: 'TestBreaker',
        failureThreshold: 3,
        resetTimeoutMs: 50,
      });
    });

    it('should stay CLOSED on successful executions', async () => {
      const result = await breaker.execute(async () => 'success');
      expect(result).toBe('success');
      expect(breaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('should trip to OPEN when failure threshold is reached', async () => {
      const failingFn = jest.fn().mockRejectedValue(new Error('Downstream failure'));

      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(failingFn)).rejects.toThrow('Downstream failure');
      }

      expect(breaker.getState()).toBe(CircuitBreakerState.OPEN);

      // Subsequent calls should fail fast with CircuitBreakerError without executing failingFn again
      await expect(breaker.execute(failingFn)).rejects.toThrow(CircuitBreakerError);
      expect(failingFn).toHaveBeenCalledTimes(3); // Not called a 4th time
    });

    it('should transition from OPEN to HALF_OPEN after resetTimeoutMs and recover to CLOSED on success', async () => {
      const failingFn = jest.fn().mockRejectedValue(new Error('Downstream failure'));

      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(failingFn)).rejects.toThrow('Downstream failure');
      }

      expect(breaker.getState()).toBe(CircuitBreakerState.OPEN);

      // Wait for reset timeout
      await new Promise((resolve) => setTimeout(resolve, 60));

      expect(breaker.getState()).toBe(CircuitBreakerState.HALF_OPEN);

      // Successful test request in HALF_OPEN recovers circuit to CLOSED
      const recoverResult = await breaker.execute(async () => 'recovered');
      expect(recoverResult).toBe('recovered');
      expect(breaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('should execute fallback function when provided and circuit is OPEN', async () => {
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(async () => { throw new Error('fail'); })).rejects.toThrow();
      }

      expect(breaker.getState()).toBe(CircuitBreakerState.OPEN);

      const fallbackResult = await breaker.execute(
        async () => 'normal',
        async () => 'cached_fallback',
      );

      expect(fallbackResult).toBe('cached_fallback');
    });
  });

  describe('retryWithBackoff', () => {
    it('should return result on first attempt if successful', async () => {
      const fn = jest.fn().mockResolvedValue('ok');
      const result = await retryWithBackoff(fn, { maxRetries: 3 });

      expect(result).toBe('ok');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on transient failures and succeed', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('Transient 1'))
        .mockRejectedValueOnce(new Error('Transient 2'))
        .mockResolvedValue('ok on attempt 3');

      const result = await retryWithBackoff(fn, {
        maxRetries: 3,
        initialDelayMs: 10,
        jitter: false,
      });

      expect(result).toBe('ok on attempt 3');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should throw error after exhausting max retries', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Persistent error'));

      await expect(
        retryWithBackoff(fn, {
          maxRetries: 2,
          initialDelayMs: 5,
          jitter: false,
        }),
      ).rejects.toThrow('Persistent error');

      expect(fn).toHaveBeenCalledTimes(3); // Initial attempt + 2 retries
    });
  });
});
