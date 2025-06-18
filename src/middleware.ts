import { Atom, WritableAtom } from './store';

export interface AtomMiddleware {
  onRead?: (atom: Atom<any>, value: any) => any;
  onWrite?: (atom: Atom<any>, value: any, next: (value: any) => void) => void;
  onSubscribe?: (atom: Atom<any>, callback: () => void) => () => void;
}

// Redux-like middleware signature
export type ReduxMiddleware = (store: any) => (next: any) => (action: any) => any;

// Adapter to convert Redux middleware to Atomik middleware
export function adaptReduxMiddleware(reduxMiddleware: ReduxMiddleware): AtomMiddleware {
  const store = {
    getState: () => ({}),
    dispatch: (action: any) => action,
  };
  
  const middleware = reduxMiddleware(store);
  
  return {
    onWrite: (atom, value, next) => {
      const action = {
        type: `${atom.debugLabel || String(atom.key)}/update`,
        payload: value,
      };
      
      const result = middleware((v: any) => {
        next(v.payload);
        return v;
      })(action);
      
      return result.payload;
    },
  };
}

// Logger middleware (similar to redux-logger)
export const logger: AtomMiddleware = {
  onWrite: (atom, value, next) => {
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

export const devTools = (config?: DevToolsConfig): AtomMiddleware => {
  return {
    onWrite: (atom, value, next) => {
      // Implementation moved to devtools.ts
      next(value);
    },
  };
};

// Persistence middleware
interface PersistConfig {
  key: string;
  storage?: Storage;
  serialize?: (value: any) => string;
  deserialize?: (value: string) => any;
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
    onRead: (atom, value) => {
      try {
        const stored = storage.getItem(key);
        if (stored !== null) {
          return deserialize(stored);
        }
      } catch (error) {
        console.error('Error reading persisted state:', error);
      }
      return value;
    },
    onWrite: (atom, value, next) => {
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
  onWrite: (atom, value, next) => {
    if (typeof value === 'function') {
      return value(next, () => atom);
    }
    return next(value);
  },
};

// Batch middleware for optimizing updates
export const batch: AtomMiddleware = {
  onWrite: (atom, value, next) => {
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
    onWrite: (atom, value, next) => {
      const result = validate(value);
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
export const computed = (
  compute: (...args: any[]) => any,
  deps: Atom<any>[]
): AtomMiddleware => {
  let lastResult: any;
  let lastDeps: any[] = [];

  return {
    onRead: (atom, value) => {
      const currentDeps = deps.map(dep => dep);
      
      if (
        lastDeps.length === currentDeps.length &&
        lastDeps.every((dep, i) => dep === currentDeps[i])
      ) {
        return lastResult;
      }

      lastDeps = currentDeps;
      lastResult = compute(...currentDeps);
      return lastResult;
    },
  };
}; 