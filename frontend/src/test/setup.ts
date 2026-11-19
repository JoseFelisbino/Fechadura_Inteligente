import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/** EventSource falso para simular o SSE do backend nos testes. */
export class MockEventSource {
  static instances: MockEventSource[] = [];
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  readyState = 0;
  onerror: ((e: Event) => void) | null = null;
  private listeners = new Map<string, Set<(e: MessageEvent) => void>>();

  constructor(public url: string, public init?: EventSourceInit) {
    MockEventSource.instances.push(this);
  }
  addEventListener(type: string, fn: (e: MessageEvent) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
  }
  removeEventListener(type: string, fn: (e: MessageEvent) => void) {
    this.listeners.get(type)?.delete(fn);
  }
  emit(type: string, data: unknown = {}) {
    if (type === 'ready') this.readyState = 1;
    this.listeners.get(type)?.forEach((fn) => fn(new MessageEvent(type, { data: JSON.stringify(data) })));
  }
  fail() {
    this.readyState = 0;
    this.onerror?.(new Event('error'));
  }
  close() {
    this.readyState = 2;
  }
}

(globalThis as unknown as { EventSource: typeof MockEventSource }).EventSource = MockEventSource;

afterEach(() => {
  cleanup();
  MockEventSource.instances = [];
});
