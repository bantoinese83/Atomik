import { useEffect, useState, useRef, useCallback } from 'react';
import { useSyncExternalStore } from 'react';
import { AtomNotFoundError, CircularDependencyError, InvalidAtomUpdateError } from './errors';
import { AtomMiddleware } from './middleware';
import { computationCache } from './cache';
import { performanceMiddleware } from './performance';

// --- Core Types and Interfaces ---

/**
 * Represents a state update action that can be either a new value or a function to compute the new value
 */
type SetStateAction<T> = T | ((prev: T) => T);

/**
 * A callback function that receives state updates
 */
type Subscriber<T> = (value: T) => void;

/**
 * Represents a read-only atom that holds a value of type T
 */
export interface Atom<T> {
  readonly key: symbol;
  read: (get: <V>(a: Atom<V>) => V) => T;
  debugLabel?: string;
}

/**
 * Represents a writable atom that can be both read and updated
 */
export interface WritableAtom<T> extends Atom<T> {
  set: (value: T | ((prev: T) => T)) => void;
}

interface AtomEntry<T> {
  value: T;
  subscribers: Set<Subscriber<T>>;
  lastAccessed?: number;
  version: number; // For optimistic updates
}

interface Store {
  atoms: Map<symbol, any>;
  subscribers: Map<symbol, Set<() => void>>;
  middleware: Array<(atom: Atom<any>, value: any) => any>;
  batchUpdates: boolean;
  pendingUpdates: Map<symbol, any>;
}

const store: Store = {
  atoms: new Map(),
  subscribers: new Map(),
  middleware: [performanceMiddleware()],
  batchUpdates: false,
  pendingUpdates: new Map(),
};

let batchDepth = 0;

// --- The Global Store ---
class Store {
  private state = new Map<symbol, AtomEntry<any>>();
  private readonly maxCircularDepth = 100;
  private accessStack = new Set<symbol>();
  private middleware: AtomMiddleware[] = [];
  private batchUpdates = new Set<symbol>();
  private isInBatch = false;

  constructor(middleware: AtomMiddleware[] = []) {
    this.middleware = middleware;
  }

  /**
   * Retrieves the current value of an atom
   * @throws {AtomNotFoundError} When atom is not found and cannot be initialized
   * @throws {CircularDependencyError} When circular dependency is detected
   */
  public get = <T>(atom: Atom<T>): T => {
    // Circular dependency detection
    if (this.accessStack.has(atom.key)) {
      throw new CircularDependencyError(atom.debugLabel);
    }
    if (this.accessStack.size >= this.maxCircularDepth) {
      throw new CircularDependencyError('Maximum dependency depth exceeded');
    }

    const entry = this.state.get(atom.key);
    if (entry) {
      entry.lastAccessed = Date.now();
      let value = entry.value;
      
      // Apply middleware
      for (const m of this.middleware) {
        if (m.onRead) {
          value = m.onRead(atom, value);
        }
      }
      
      return value;
    }

    try {
      this.accessStack.add(atom.key);
      const newValue = atom.read(this.get);
      this.accessStack.delete(atom.key);

      const entry = {
        value: newValue,
        subscribers: new Set(),
        lastAccessed: Date.now(),
        version: 0,
      };
      this.state.set(atom.key, entry);

      // Apply middleware
      for (const m of this.middleware) {
        if (m.onInit) {
          m.onInit(atom);
        }
      }

      return newValue;
    } catch (error) {
      this.accessStack.delete(atom.key);
      this.handleError(error);
      throw error;
    }
  };

  /**
   * Updates the value of a writable atom
   * @throws {InvalidAtomUpdateError} When update operation fails
   */
  public set = <T>(atom: WritableAtom<T>, update: T) => {
    try {
      // Apply middleware
      for (const m of this.middleware) {
        if (m.onWrite) {
          m.onWrite(atom, update, (nextUpdate) => {
            this.performUpdate(atom, nextUpdate);
          });
          return;
        }
      }

      this.performUpdate(atom, update);
    } catch (error) {
      this.handleError(error);
      throw new InvalidAtomUpdateError(
        `Failed to update atom${atom.debugLabel ? ` "${atom.debugLabel}"` : ''}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };

  private performUpdate<T>(atom: WritableAtom<T>, update: T) {
    atom.set(update);
    const newComputedValue = atom.read(this.get);
    const entry = this.state.get(atom.key);

    if (!entry) {
      throw new AtomNotFoundError(atom.debugLabel);
    }

    if (!Object.is(entry.value, newComputedValue)) {
      entry.value = newComputedValue;
      entry.lastAccessed = Date.now();
      entry.version++;

      if (this.isInBatch) {
        this.batchUpdates.add(atom.key);
      } else {
        this.notifySubscribers(atom.key, entry);
      }
    }
  }

  private notifySubscribers(key: symbol, entry: AtomEntry<any>) {
    entry.subscribers.forEach((callback) => callback(entry.value));
  }

  /**
   * Subscribes to atom changes
   * @returns Unsubscribe function
   */
  public subscribe = <T>(atom: Atom<T>, callback: Subscriber<T>): (() => void) => {
    let entry = this.state.get(atom.key);
    if (!entry) {
      this.get(atom);
      entry = this.state.get(atom.key)!;
    }

    // Apply middleware
    let wrappedCallback = callback;
    for (const m of this.middleware) {
      if (m.onSubscribe) {
        wrappedCallback = m.onSubscribe(atom, wrappedCallback);
      }
    }

    entry.subscribers.add(wrappedCallback);
    return () => {
      const currentEntry = this.state.get(atom.key);
      if (currentEntry) {
        currentEntry.subscribers.delete(wrappedCallback);
        // Cleanup if no subscribers and not accessed recently
        if (currentEntry.subscribers.size === 0 && 
            currentEntry.lastAccessed && 
            Date.now() - currentEntry.lastAccessed > 60000) {
          this.state.delete(atom.key);
        }
      }
    };
  };

  /**
   * Batches multiple updates into a single notification
   */
  public batch = (callback: () => void) => {
    if (this.isInBatch) {
      callback();
      return;
    }

    this.isInBatch = true;
    this.batchUpdates.clear();
    
    try {
      callback();
    } finally {
      this.isInBatch = false;
      // Notify all subscribers after batch completes
      this.batchUpdates.forEach((key) => {
        const entry = this.state.get(key);
        if (entry) {
          this.notifySubscribers(key, entry);
        }
      });
      this.batchUpdates.clear();
    }
  };

  private handleError(error: unknown) {
    for (const m of this.middleware) {
      if (m.onError && error instanceof Error) {
        m.onError(error);
      }
    }
  }
}

// Singleton store instance with middleware support
export const createStore = (middleware: AtomMiddleware[] = []) => new Store(middleware);
const globalStore = createStore();

// --- Atom Creators ---

/**
 * Creates a new writable atom with an initial value
 */
export function createAtom<T>(initialValue: T, debugLabel?: string): WritableAtom<T> {
  const key = Symbol(debugLabel || 'atom');
  store.atoms.set(key, initialValue);
  store.subscribers.set(key, new Set());

  return {
    key,
    debugLabel,
    set: (value) => {
      const currentValue = store.atoms.get(key);
      const newValue = typeof value === 'function' ? (value as (prev: T) => T)(currentValue) : value;

      if (store.batchUpdates) {
        store.pendingUpdates.set(key, newValue);
      } else {
        store.atoms.set(key, newValue);
        computationCache.invalidate(key);
        notifySubscribers(key);
      }
    },
  };
}

/**
 * Creates a new derived atom that computes its value from other atoms
 */
export function createDerivedAtom<T>(
  dependencies: Atom<any>[],
  compute: (...deps: any[]) => T,
  debugLabel?: string
): Atom<T> {
  const key = Symbol(debugLabel);
  const depKeys = new Set(dependencies.map((dep) => dep.key));

  // Check for circular dependencies
  const visited = new Set<symbol>();
  function checkCircular(atomKey: symbol) {
    if (visited.has(atomKey)) {
      throw new CircularDependencyError('Circular dependency detected in derived atom');
    }
    visited.add(atomKey);
    const dependents = store.subscribers.get(atomKey);
    if (dependents) {
      dependents.forEach(checkCircular);
    }
  }
  depKeys.forEach(checkCircular);

  // Subscribe to dependencies
  depKeys.forEach((depKey) => {
    const subscribers = store.subscribers.get(depKey);
    if (subscribers) {
      subscribers.add(() => {
        computationCache.invalidate(key);
        notifySubscribers(key);
      });
    }
  });

  // Compute initial value
  const depValues = dependencies.map((dep) => store.atoms.get(dep.key));
  store.atoms.set(key, compute(...depValues));
  store.subscribers.set(key, new Set());

  return { key, debugLabel };
}

function notifySubscribers(key: symbol) {
  const subscribers = store.subscribers.get(key);
  if (subscribers) {
    subscribers.forEach((callback) => callback());
  }
}

// --- React Hooks ---

/**
 * React hook to read and subscribe to atom values
 */
export function useAtom<T>(atom: Atom<T>): [T, (value: T | ((prev: T) => T)) => void] {
  const [, forceUpdate] = useState({});
  const valueRef = useRef<T>();

  useEffect(() => {
    const subscribers = store.subscribers.get(atom.key);
    if (!subscribers) {
      throw new AtomNotFoundError(`Atom with key ${String(atom.key)} not found`);
    }

    const callback = () => forceUpdate({});
    subscribers.add(callback);
    return () => {
      subscribers.delete(callback);
    };
  }, [atom.key]);

  const value = store.atoms.get(atom.key);
  valueRef.current = value;

  const setValue = useCallback(
    (newValue: T | ((prev: T) => T)) => {
      if ('set' in atom) {
        (atom as WritableAtom<T>).set(newValue);
      } else {
        throw new AtomNotFoundError('Cannot set value of read-only atom');
      }
    },
    [atom]
  );

  return [value, setValue];
}

/**
 * React hook for batching multiple atom updates
 */
export function useBatchUpdates() {
  return useCallback((callback: () => void) => {
    batchDepth++;
    store.batchUpdates = true;
    try {
      callback();
    } finally {
      batchDepth--;
      if (batchDepth === 0) {
        store.batchUpdates = false;
        // Apply all pending updates
        store.pendingUpdates.forEach((value, key) => {
          store.atoms.set(key, value);
          computationCache.invalidate(key);
          notifySubscribers(key);
        });
        store.pendingUpdates.clear();
      }
    }
  }, []);
}

/**
 * React hook for creating a memoized selector
 */
export function useAtomSelector<T, R>(atom: Atom<T>, selector: (value: T) => R): R {
  const [, forceUpdate] = useState({});
  const selectorRef = useRef(selector);
  const previousValueRef = useRef<R>();

  useEffect(() => {
    selectorRef.current = selector;
  });

  useEffect(() => {
    const subscribers = store.subscribers.get(atom.key);
    if (!subscribers) {
      throw new AtomNotFoundError(`Atom with key ${String(atom.key)} not found`);
    }

    const callback = () => {
      const newValue = selectorRef.current(store.atoms.get(atom.key));
      if (newValue !== previousValueRef.current) {
        previousValueRef.current = newValue;
        forceUpdate({});
      }
    };

    subscribers.add(callback);
    return () => {
      subscribers.delete(callback);
    };
  }, [atom.key]);

  const value = selector(store.atoms.get(atom.key));
  previousValueRef.current = value;
  return value;
}