import { useState, useEffect } from 'react';
import { store } from './store.instance';
import { WritableAtom, Atom, CircularDependencyError, InvalidAtomUpdateError } from './store';

/**
 * Creates a new writable atom with an initial value
 */
export function createAtom<T>(initialValue: T, debugLabel?: string): WritableAtom<T> {
  const key = Symbol(debugLabel);
  store.atoms.set(key, initialValue);
  store.subscribers.set(key, new Set());

  const atom: WritableAtom<T> = {
    key,
    debugLabel,
    read: () => store.get(atom),
    set: (value) => {
      const currentValue = store.get(atom);
      const newValue = typeof value === 'function' ? (value as (prev: T) => T)(currentValue) : value;
      store.set(atom, newValue);
    }
  };

  return atom;
}

type DerivedAtomConfig<T> = {
  read: (get: <V>(a: Atom<V>) => V) => T;
  write?: (get: <V>(a: Atom<V>) => V, set: <V>(a: WritableAtom<V>, value: V) => void, update: T) => void;
  debugLabel?: string;
};

/**
 * Creates a new derived atom that computes its value from other atoms
 */
export function createDerivedAtom<T>(
  config: DerivedAtomConfig<T>
): DerivedAtomConfig<T>['write'] extends undefined ? Atom<T> : WritableAtom<T> {
  const key = Symbol(config.debugLabel);
  const dependencies = new Set<symbol>();
  const visited = new Set<symbol>();
  
  const get = <V>(atom: Atom<V>): V => {
    if (visited.has(atom.key)) {
      throw new CircularDependencyError('Circular dependency detected in derived atom');
    }
    visited.add(atom.key);
    dependencies.add(atom.key);
    const value = store.get(atom);
    visited.delete(atom.key);
    return value;
  };

  const value = config.read(get);
  store.atoms.set(key, value);
  store.subscribers.set(key, new Set());

  dependencies.forEach((depKey) => {
    const subscribers = store.subscribers.get(depKey);
    if (subscribers) {
      subscribers.add(() => {
        try {
          const newValue = config.read(get);
          store.atoms.set(key, newValue);
          const subscribers = store.subscribers.get(key);
          if (subscribers) {
            subscribers.forEach((callback) => callback());
          }
        } catch (error) {
          if (error instanceof CircularDependencyError) {
            throw error;
          }
        }
      });
    }
  });

  const atom: Atom<T> = {
    key,
    debugLabel: config.debugLabel,
    read: () => config.read(get)
  };

  if (config.write) {
    const writableAtom: WritableAtom<T> = {
      ...atom,
      set: (value: T | ((prev: T) => T)) => {
        if (!config.write) {
          throw new InvalidAtomUpdateError('Cannot update read-only atom');
        }
        try {
          if (typeof value === 'function') {
            const prevValue = get(atom);
            const newValue = (value as (prev: T) => T)(prevValue);
            config.write(get, (targetAtom, value) => {
              if ('set' in targetAtom) {
                targetAtom.set(value);
              } else {
                throw new InvalidAtomUpdateError('Cannot update read-only atom');
              }
            }, newValue);
          } else {
            config.write(get, (targetAtom, value) => {
              if ('set' in targetAtom) {
                targetAtom.set(value);
              } else {
                throw new InvalidAtomUpdateError('Cannot update read-only atom');
              }
            }, value);
          }
        } catch (error) {
          if (error instanceof Error) {
            throw new InvalidAtomUpdateError(error.message);
          }
          throw error;
        }
      }
    };
    return writableAtom as DerivedAtomConfig<T>['write'] extends undefined ? Atom<T> : WritableAtom<T>;
  }

  return atom as DerivedAtomConfig<T>['write'] extends undefined ? Atom<T> : WritableAtom<T>;
}

/**
 * React hook to read and subscribe to atom values
 */
export function useAtom<T>(atom: WritableAtom<T>): [T, (value: T | ((prev: T) => T)) => void];
export function useAtom<T>(atom: Atom<T>): T;
export function useAtom<T>(atom: Atom<T> | WritableAtom<T>): T | [T, (value: T | ((prev: T) => T)) => void] {
  const [, forceUpdate] = useState({});

  useEffect(() => {
    const callback = () => forceUpdate({});
    store.subscribe(atom.key, callback);
    return () => store.unsubscribe(atom.key, callback);
  }, [atom.key]);

  const value = store.get(atom);

  if ('set' in atom) {
    return [value, atom.set] as [T, (value: T | ((prev: T) => T)) => void];
  }

  return value;
} 