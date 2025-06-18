import { Atom } from "./store";

export interface AtomMiddleware {
  onRead?: <T>(atom: Atom<T>, value: T) => T;
  onWrite?: <T>(atom: Atom<T>, value: T, next: (value: T) => void) => void;
  onSubscribe?: <T>(atom: Atom<T>, callback: () => void) => () => void;
}

// Redux-like middleware signature
export type ReduxMiddleware<S = unknown, A = { type: string; payload?: unknown }> = 
  (store: { getState: () => S; dispatch: (action: A) => A }) => 
  (next: (action: A) => A) => 
  (action: A) => A;

// Adapter to convert Redux middleware to Atomik middleware
export function adaptReduxMiddleware<S = unknown, A = { type: string; payload?: unknown }>(
  reduxMiddleware: ReduxMiddleware<S, A>
): AtomMiddleware {
  const store = {
    getState: () => ({} as S),
    dispatch: (action: A) => action,
  };
  
  const middleware = reduxMiddleware(store);
  
  return {
    onWrite: <T>(atom: Atom<T>, value: T, next: (value: T) => void) => {
      const action = {
        type: `${atom.debugLabel || String(atom.key)}/update`,
        payload: value,
      } as A;
      
      const result = middleware((v: A) => {
        next((v as unknown as { payload: T }).payload);
        return v;
      })(action);
      
      return (result as unknown as { payload: T }).payload;
    },
  };
}

// Logger middleware (similar to redux-logger)
export const logger: AtomMiddleware = {
  onWrite: <T>(atom: Atom<T>, value: T, next: (value: T) => void) => {
    const label = atom.debugLabel || String(atom.key);
    console.group(`Atom Update: ${label}`);
    console.log('Previous:', atom);
    console.log('Update:', value);
    next(value);
    console.log('Next:', atom);
    console.groupEnd();
  },
};

// DevTools middleware
export interface DevToolsConfig {
  name?: string;
  maxAge?: number;
}

export const devTools = (): AtomMiddleware => {
  return {
    onWrite: <T>(atom: Atom<T>, value: T, next: (value: T) => void) => {
      // Implementation moved to devtools.ts
      next(value);
    },
  };
};

// Persistence middleware
interface PersistConfig {
  key: string;
  storage?: Storage;
  serialize?: (value: unknown) => string;
  deserialize?: (value: string) => unknown;
}

export const persist = (
  config: string | PersistConfig
): AtomMiddleware => {
  const finalConfig: PersistConfig = typeof config === 'string' 
    ? { key: config }
    : config;

  const {
    key,
    storage = localStorage,
    serialize = JSON.stringify,
    deserialize = JSON.parse,
  } = finalConfig;

  return {
    onRead: <T>(atom: Atom<T>, value: T): T => {
      try {
        const stored = storage.getItem(key);
        if (stored !== null) {
          return deserialize(stored) as T;
        }
      } catch (error) {
        console.error('Error reading persisted state:', error);
      }
      return value;
    },
    onWrite: <T>(atom: Atom<T>, value: T, next: (value: T) => void) => {
      next(value);
      try {
        storage.setItem(key, serialize(value));
      } catch (error) {
        console.error('Error persisting state:', error);
      }
    },
  };
};

// Thunk middleware (similar to redux-thunk)
export const thunk: AtomMiddleware = {
  onWrite: <T>(atom: Atom<T>, value: T | ((next: (value: T) => void, getAtom: () => Atom<T>) => void), next: (value: T) => void) => {
    if (typeof value === 'function') {
      return (value as ((next: (value: T) => void, getAtom: () => Atom<T>) => void))(next, () => atom);
    }
    return next(value);
  },
};

// Batch middleware for optimizing updates
export const batch: AtomMiddleware = {
  onWrite: <T>(atom: Atom<T>, value: T | T[], next: (value: T) => void) => {
    if (!Array.isArray(value)) {
      return next(value);
    }
    
    // Batch multiple updates
    const lastValue = value[value.length - 1];
    next(lastValue);
  },
};

// Validation middleware
export function createValidator<T>(
  validate: (value: T) => boolean | string | Error
): AtomMiddleware {
  return {
    onWrite: <U>(atom: Atom<U>, value: U, next: (value: U) => void) => {
      const result = validate(value as unknown as T);
      if (result === true || result === undefined) {
        next(value);
      } else {
        const error = result instanceof Error 
          ? result 
          : new Error(String(result));
        throw error;
      }
    },
  };
}

// Computed values middleware (memoization)
export const computed = <T>(
  compute: (...args: unknown[]) => T,
  deps: Atom<unknown>[]
): AtomMiddleware => {
  let lastResult: T;
  let lastDeps: unknown[] = [];

  return {
    onRead: <U>(): U => {
      const currentDeps = deps.map(dep => dep);
      
      if (
        lastDeps.length === currentDeps.length &&
        lastDeps.every((dep, i) => dep === currentDeps[i])
      ) {
        return lastResult as unknown as U;
      }

      lastDeps = currentDeps;
      lastResult = compute(...currentDeps);
      return lastResult as unknown as U;
    },
  };
}; 