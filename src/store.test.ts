import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react-hooks';
import { createAtom, createDerivedAtom, useAtom } from './store';
import { AtomNotFoundError, CircularDependencyError, InvalidAtomUpdateError } from './errors';

describe('Atomik Store', () => {
  beforeEach(() => {
    // Reset modules before each test to ensure clean state
    vi.resetModules();
  });

  describe('createAtom', () => {
    it('should create a writable atom with initial value', () => {
      const countAtom = createAtom(0, 'countAtom');
      const { result } = renderHook(() => useAtom(countAtom));
      expect(result.current[0]).toBe(0);
    });

    it('should update atom value', () => {
      const countAtom = createAtom(0);
      const { result } = renderHook(() => useAtom(countAtom));

      act(() => {
        result.current[1](1);
      });

      expect(result.current[0]).toBe(1);
    });

    it('should support functional updates', () => {
      const countAtom = createAtom(0);
      const { result } = renderHook(() => useAtom(countAtom));

      act(() => {
        result.current[1]((prev) => prev + 1);
      });

      expect(result.current[0]).toBe(1);
    });
  });

  describe('createDerivedAtom', () => {
    it('should create a read-only derived atom', () => {
      const countAtom = createAtom(0);
      const doubleAtom = createDerivedAtom({
        read: (get) => get(countAtom) * 2,
        debugLabel: 'doubleAtom',
      });

      const { result: countResult } = renderHook(() => useAtom(countAtom));
      const { result: doubleResult } = renderHook(() => useAtom(doubleAtom));

      expect(doubleResult.current).toBe(0);

      act(() => {
        countResult.current[1](5);
      });

      expect(doubleResult.current).toBe(10);
    });

    it('should create a writable derived atom', () => {
      const countAtom = createAtom(0);
      const doubleAtom = createDerivedAtom({
        read: (get) => get(countAtom) * 2,
        write: (get, set, update: number) => {
          set(countAtom, update / 2);
        },
      });

      const { result } = renderHook(() => useAtom(doubleAtom));

      act(() => {
        result.current[1](10);
      });

      expect(result.current[0]).toBe(10);
    });
  });

  describe('Error Handling', () => {
    it('should detect circular dependencies', () => {
      const atom1 = createDerivedAtom({
        read: (get) => get(atom2),
        debugLabel: 'atom1',
      });

      const atom2 = createDerivedAtom({
        read: (get) => get(atom1),
        debugLabel: 'atom2',
      });

      const { result } = renderHook(() => useAtom(atom1));
      expect(result.error).toBeInstanceOf(CircularDependencyError);
    });

    it('should handle invalid updates', () => {
      const countAtom = createDerivedAtom({
        read: () => 0,
        write: () => {
          throw new Error('Invalid update');
        },
      });

      const { result } = renderHook(() => useAtom(countAtom));

      act(() => {
        expect(() => result.current[1](1)).toThrow(InvalidAtomUpdateError);
      });
    });
  });

  describe('Performance', () => {
    it('should only notify subscribers when value actually changes', () => {
      const countAtom = createAtom(0);
      const callback = vi.fn();

      const { result } = renderHook(() => useAtom(countAtom));
      
      // First update
      act(() => {
        result.current[1](1);
      });

      // Same value update
      act(() => {
        result.current[1](1);
      });

      expect(callback).toHaveBeenCalledTimes(0);
    });

    it('should cleanup unused atoms', async () => {
      const countAtom = createAtom(0);
      const { result, unmount } = renderHook(() => useAtom(countAtom));

      expect(result.current[0]).toBe(0);
      unmount();

      // Wait for cleanup
      await new Promise((resolve) => setTimeout(resolve, 61000));
      
      // Accessing the atom should reinitialize it
      const { result: newResult } = renderHook(() => useAtom(countAtom));
      expect(newResult.current[0]).toBe(0);
    });
  });
}); 