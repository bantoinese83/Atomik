import { AtomMiddleware } from './middleware';
import { Atom } from './store';

interface PerformanceMetrics {
  reads: number;
  writes: number;
  subscribers: number;
  updateTime: number;
  lastUpdate: number;
  averageUpdateTime: number;
}

class PerformanceMonitor {
  private metrics = new Map<symbol, PerformanceMetrics>();
  private updateThreshold = 16; // 60fps threshold in ms
  private warningThreshold = 5; // Number of slow updates before warning

  private getOrCreateMetrics(atom: Atom<any>): PerformanceMetrics {
    let metrics = this.metrics.get(atom.key);
    if (!metrics) {
      metrics = {
        reads: 0,
        writes: 0,
        subscribers: 0,
        updateTime: 0,
        lastUpdate: 0,
        averageUpdateTime: 0,
      };
      this.metrics.set(atom.key, metrics);
    }
    return metrics;
  }

  public trackRead(atom: Atom<any>) {
    const metrics = this.getOrCreateMetrics(atom);
    metrics.reads++;
  }

  public trackWrite(atom: Atom<any>, duration: number) {
    const metrics = this.getOrCreateMetrics(atom);
    metrics.writes++;
    metrics.updateTime = duration;
    metrics.lastUpdate = Date.now();
    metrics.averageUpdateTime = (metrics.averageUpdateTime * (metrics.writes - 1) + duration) / metrics.writes;

    if (duration > this.updateThreshold) {
      console.warn(
        `Slow atom update detected${atom.debugLabel ? ` for "${atom.debugLabel}"` : ''}:\n`,
        `- Update time: ${duration.toFixed(2)}ms (threshold: ${this.updateThreshold}ms)\n`,
        `- Average update time: ${metrics.averageUpdateTime.toFixed(2)}ms\n`,
        `- Total updates: ${metrics.writes}\n`,
        `- Subscribers: ${metrics.subscribers}`
      );
    }
  }

  public trackSubscriber(atom: Atom<any>, count: number) {
    const metrics = this.getOrCreateMetrics(atom);
    metrics.subscribers = count;
  }

  public getMetrics(atom: Atom<any>): PerformanceMetrics {
    return this.getOrCreateMetrics(atom);
  }

  public resetMetrics(atom: Atom<any>) {
    this.metrics.delete(atom.key);
  }

  public getAllMetrics(): Map<symbol, PerformanceMetrics> {
    return new Map(this.metrics);
  }
}

const monitor = new PerformanceMonitor();

export const performanceMiddleware = (): AtomMiddleware => ({
  onRead: (atom, value) => {
    monitor.trackRead(atom);
    return value;
  },
  onWrite: (atom, update, next) => {
    const start = performance.now();
    next(update);
    const duration = performance.now() - start;
    monitor.trackWrite(atom, duration);
  },
  onSubscribe: (atom, callback) => {
    const metrics = monitor.getMetrics(atom);
    monitor.trackSubscriber(atom, metrics.subscribers + 1);
    return callback;
  },
});

// Utility hook for debugging performance
export function getAtomMetrics(atom: Atom<any>): PerformanceMetrics {
  return monitor.getMetrics(atom);
}

// Reset metrics for testing/debugging
export function resetMetrics(atom?: Atom<any>) {
  if (atom) {
    monitor.resetMetrics(atom);
  } else {
    monitor.getAllMetrics().forEach((_, key) => {
      monitor.resetMetrics({ key } as Atom<any>);
    });
  }
} 