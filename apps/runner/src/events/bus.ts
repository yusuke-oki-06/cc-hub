import { EventEmitter } from 'node:events';
import type { StoredEvent } from './store.js';

class TypedBus extends EventEmitter {
  emitForSession(sessionId: string, event: StoredEvent): boolean {
    return this.emit(`session:${sessionId}`, event);
  }
  onSession(sessionId: string, listener: (event: StoredEvent) => void): () => void {
    const channel = `session:${sessionId}`;
    this.on(channel, listener);
    return () => this.off(channel, listener);
  }
}

export const eventBus = new TypedBus();
eventBus.setMaxListeners(0);
