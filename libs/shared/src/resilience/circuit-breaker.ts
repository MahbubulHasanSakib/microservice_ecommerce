/**
 * CircuitBreakerState
 *
 * CLOSED: Normal operation. Requests pass through.
 * OPEN: Failure threshold exceeded. Fast-fails immediately with ServiceUnavailable.
 * HALF_OPEN: Testing if downstream dependency has recovered.
 */
export enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerOptions {
  failureThreshold?: number; // Number of consecutive failures before opening circuit (default: 5)
  resetTimeoutMs?: number;   // Time in ms to wait before attempting recovery (default: 10000)
  name?: string;             // Identifier for logging
  onStateChange?: (state: CircuitBreakerState, name: string) => void;
}

export class CircuitBreakerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitBreakerError';
  }
}

export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount: number = 0;
  private lastFailureTime?: number;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly name: string;
  private readonly onStateChange?: (state: CircuitBreakerState, name: string) => void;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 10000;
    this.name = options.name ?? 'CircuitBreaker';
    this.onStateChange = options.onStateChange;
  }

  private transitionTo(newState: CircuitBreakerState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.onStateChange?.(newState, this.name);
    }
  }

  getState(): CircuitBreakerState {
    if (this.state === CircuitBreakerState.OPEN && this.lastFailureTime) {
      const now = Date.now();
      if (now - this.lastFailureTime >= this.resetTimeoutMs) {
        this.transitionTo(CircuitBreakerState.HALF_OPEN);
      }
    }
    return this.state;
  }

  async execute<T>(action: () => Promise<T>, fallback?: () => Promise<T>): Promise<T> {
    const currentState = this.getState();

    if (currentState === CircuitBreakerState.OPEN) {
      if (fallback) {
        return fallback();
      }
      throw new CircuitBreakerError(
        `[${this.name}] Circuit is OPEN. Fast-failing downstream request to prevent cascading failures.`,
      );
    }

    try {
      const result = await action();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      if (fallback) {
        return fallback();
      }
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.transitionTo(CircuitBreakerState.CLOSED);
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.failureThreshold || this.state === CircuitBreakerState.HALF_OPEN) {
      this.transitionTo(CircuitBreakerState.OPEN);
    }
  }

  getMetrics() {
    return {
      name: this.name,
      state: this.getState(),
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime ? new Date(this.lastFailureTime).toISOString() : null,
    };
  }

  reset(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.lastFailureTime = undefined;
  }
}
