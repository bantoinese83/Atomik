import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { createAtom, createDerivedAtom, useAtom } from './atoms';
import type { WritableAtom, Atom } from './store';
import { store } from './store.instance';
import React from 'react';

describe('Atomik Store', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe('createAtom', () => {
    it('should create a writable atom with initial value', () => {
      const countAtom = createAtom(0);
      const { result } = renderHook(() => useAtom(countAtom));
      const [value] = result.current;
      expect(value).toBe(0);
    });

    it('should update atom value', () => {
      const countAtom = createAtom(0);
      const { result } = renderHook(() => useAtom(countAtom));
      
      act(() => {
        const [, setValue] = result.current;
        setValue(1);
      });
      
      const [value] = result.current;
      expect(value).toBe(1);
    });

    it('should support functional updates', () => {
      const countAtom = createAtom(0);
      const { result } = renderHook(() => useAtom(countAtom));
      
      act(() => {
        const [, setValue] = result.current;
        setValue(prev => prev + 1);
      });
      
      const [value] = result.current;
      expect(value).toBe(1);
    });
  });

  describe('createDerivedAtom', () => {
    it('should create a read-only derived atom', () => {
      const baseAtom = createAtom(0);
      const doubledAtom = createDerivedAtom<number>({
        read: get => get(baseAtom) * 2,
        debugLabel: 'doubledAtom'
      });

      const { result } = renderHook(() => {
        const [value] = useAtom(baseAtom);
        const doubled = useAtom(doubledAtom);
        return { value, doubled };
      });

      expect(result.current.value).toBe(0);
      expect(result.current.doubled).toBe(0);

      act(() => {
        baseAtom.set(2);
      });

      expect(result.current.value).toBe(2);
      expect(result.current.doubled).toBe(4);
    });

    it('should create a writable derived atom', () => {
      const baseAtom = createAtom(0);
      const doubledAtom = createDerivedAtom<number>({
        read: get => get(baseAtom) * 2,
        write: (get, set, newValue: number) => {
          set(baseAtom, newValue / 2);
        },
        debugLabel: 'doubledAtom'
      });

      const { result } = renderHook(() => {
        const [baseValue] = useAtom(baseAtom);
        const [doubledValue, setDoubled] = useAtom(doubledAtom);
        return { baseValue, doubledValue, setDoubled };
      });

      expect(result.current.baseValue).toBe(0);
      expect(result.current.doubledValue).toBe(0);

      act(() => {
        result.current.setDoubled(4);
      });

      expect(result.current.baseValue).toBe(2);
      expect(result.current.doubledValue).toBe(4);
    });

    it('should detect circular dependencies', () => {
      // Create a base atom to avoid initialization issues
      const baseAtom = createAtom(0);

      // Create atom1 that depends on baseAtom initially
      const atom1 = createDerivedAtom<number>({
        read: get => get(baseAtom),
        debugLabel: 'atom1'
      });

      // Create atom2 that depends on atom1
      const atom2 = createDerivedAtom<number>({
        read: get => get(atom1),
        debugLabel: 'atom2'
      });

      // Initialize the atoms by reading them once
      store.get(atom1);
      store.get(atom2);

      // Now modify atom1's read function to depend on atom2, creating a circular dependency
      const originalRead = atom1.read;
      type GetFn = <V>(a: Atom<V>) => V;
      (atom1 as { read: (get: GetFn) => number }).read = (get: GetFn) => get(atom2);

      // Clear the cached values to force re-computation
      store.atoms.delete(atom1.key);
      store.atoms.delete(atom2.key);

      // Attempting to read either atom should throw
      expect(() => {
        store.get(atom2);
      }).toThrow(/Circular dependency detected/);

      // Restore atom1's original read function to avoid affecting other tests
      (atom1 as { read: (get: GetFn) => number }).read = originalRead;
    });

    it('should handle invalid updates', () => {
      const readOnlyAtom = createDerivedAtom<number>({
        read: () => 0,
        debugLabel: 'readOnlyAtom'
      });

      // Attempt to use the read-only atom as a writable atom
      const writableAtom = readOnlyAtom as WritableAtom<number>;
      
      // This should fail since the atom is read-only
      expect(() => {
        writableAtom.set(1);
      }).toThrow('set is not a function');

      // Verify the atom is still readable
      const { result } = renderHook(() => useAtom(readOnlyAtom));
      expect(result.current).toBe(0);
    });
  });

  describe('Performance', () => {
    it('should only notify subscribers when value actually changes', () => {
      const countAtom = createAtom(0);
      const callback = vi.fn();

      const { result } = renderHook(() => {
        const [count] = useAtom(countAtom);
        React.useEffect(() => {
          callback();
        }, [count]);
        return count;
      });

      // Initial render
      expect(callback).toHaveBeenCalledTimes(1);
      expect(result.current).toBe(0);

      // Same value - should not trigger callback
      act(() => {
        countAtom.set(0);
      });
      expect(callback).toHaveBeenCalledTimes(1);
      expect(result.current).toBe(0);

      // Different value - should trigger callback
      act(() => {
        countAtom.set(1);
      });
      expect(callback).toHaveBeenCalledTimes(2);
      expect(result.current).toBe(1);
    });

    it('should cleanup unused atoms', () => {
      const countAtom = createAtom(0);
      const derivedAtom = createDerivedAtom({
        read: get => get(countAtom),
        debugLabel: 'derivedAtom'
      });

      // Subscribe to both atoms
      const { result, unmount } = renderHook(() => {
        const [count] = useAtom(countAtom);
        const derived = useAtom(derivedAtom);
        return { count, derived };
      });

      expect(result.current.count).toBe(0);
      expect(result.current.derived).toBe(0);

      // Unsubscribe from both atoms
      unmount();

      // Verify we can still read the atoms after cleanup
      const { result: newResult } = renderHook(() => {
        const [count] = useAtom(countAtom);
        const derived = useAtom(derivedAtom);
        return { count, derived };
      });

      expect(newResult.current.count).toBe(0);
      expect(newResult.current.derived).toBe(0);
    });
  });
}); 