import { Atom } from "./store";

interface CacheEntry<T> {
  value: T;
  dependencies: Set<symbol>;
  lastComputed: number;
  computeTime: number;
}

class ComputationCache {
  private cache = new Map<symbol, CacheEntry<unknown>>();
  private maxCacheSize = 1000;
  private maxCacheAge = 5 * 60 * 1000; // 5 minutes
  private gcInterval = 60 * 1000; // 1 minute
  private dependencyGraph = new Map<symbol, Set<symbol>>();

  constructor() {
    // Run garbage collection periodically
    setInterval(() => this.runGC(), this.gcInterval);
  }

  public get<T>(atom: Atom<T>): CacheEntry<T> | undefined {
    const entry = this.cache.get(atom.key);
    if (entry) {
      entry.lastComputed = Date.now();
    }
    return entry as CacheEntry<T> | undefined;
  }

  public set<T>(
    atom: Atom<T>,
    value: T,
    dependencies: Set<symbol>,
    computeTime: number
  ) {
    // Enforce cache size limit
    if (this.cache.size >= this.maxCacheSize) {
      this.evictOldest();
    }

    const entry: CacheEntry<T> = {
      value,
      dependencies,
      lastComputed: Date.now(),
      computeTime,
    };

    this.cache.set(atom.key, entry);

    // Update dependency graph
    dependencies.forEach((depKey) => {
      let dependents = this.dependencyGraph.get(depKey);
      if (!dependents) {
        dependents = new Set();
        this.dependencyGraph.set(depKey, dependents);
      }
      dependents.add(atom.key);
    });
  }

  public invalidate(atomKey: symbol) {
    // Invalidate the atom itself
    this.cache.delete(atomKey);

    // Invalidate all dependent atoms
    const dependents = this.dependencyGraph.get(atomKey);
    if (dependents) {
      dependents.forEach((depKey) => {
        this.invalidate(depKey);
      });
    }
  }

  private evictOldest() {
    let oldestKey: symbol | undefined;
    let oldestTime = Infinity;

    this.cache.forEach((entry, key) => {
      if (entry.lastComputed < oldestTime) {
        oldestTime = entry.lastComputed;
        oldestKey = key;
      }
    });

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  private runGC() {
    const now = Date.now();
    const keysToDelete: symbol[] = [];

    this.cache.forEach((entry, key) => {
      if (now - entry.lastComputed > this.maxCacheAge) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach((key) => {
      this.cache.delete(key);
      // Clean up dependency graph
      this.dependencyGraph.delete(key);
      this.dependencyGraph.forEach((dependents) => {
        dependents.delete(key);
      });
    });
  }

  public getCacheStats() {
    return {
      size: this.cache.size,
      dependencyGraphSize: this.dependencyGraph.size,
    };
  }

  public clear() {
    this.cache.clear();
    this.dependencyGraph.clear();
  }
}

export const computationCache = new ComputationCache(); 