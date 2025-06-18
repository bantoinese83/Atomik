import { createDerivedAtom } from './atoms';
import { WritableAtom, Atom } from './store';


export type Action<T extends string = string, P = void> = P extends void
  ? { type: T }
  : { type: T; payload: P };

export type ActionCreator<T extends string, P = void> = P extends void
  ? () => Action<T>
  : (payload: P) => Action<T, P>;

export type Reducer<S, A extends Action> = (state: S, action: A) => S;

export function createReducerAtom<S, A extends Action = Action>(
  initialState: S,
  reducer: Reducer<S, A>,
  debugLabel?: string
): [WritableAtom<S>, (action: A) => void] {
  const atom = createDerivedAtom<S>({
    read: () => initialState,
    write: (get, set, update: A | S) => {
      const currentState = get(atom);
      if (update instanceof Object && 'type' in update) {
        const nextState = reducer(currentState, update as A);
        set(atom, nextState);
      } else {
        set(atom, update as S);
      }
    },
    debugLabel,
  });

  const dispatch = (action: A): void => {
    atom.set((prev: S) => reducer(prev, action));
  };

  return [atom, dispatch];
}

export function createSelector<S, R>(
  atom: Atom<S>,
  selector: (state: S) => R,
  debugLabel?: string
): Atom<R> {
  return createDerivedAtom<R>({
    read: (get) => selector(get(atom)),
    debugLabel,
  });
}

export type AsyncActionCreator<T extends string, P, R> = ActionCreator<T, P> & {
  success: ActionCreator<`${T}_SUCCESS`, R>;
  error: ActionCreator<`${T}_ERROR`, Error>;
};

export function createAsyncAction<T extends string, P, R>(
  type: T
): AsyncActionCreator<T, P, R> {
  const actionCreator = ((payload: P) => ({ type, payload })) as ActionCreator<T, P>;
  const success = ((payload: R) => ({ type: `${type}_SUCCESS` as const, payload })) as ActionCreator<`${T}_SUCCESS`, R>;
  const error = ((payload: Error) => ({ type: `${type}_ERROR` as const, payload })) as ActionCreator<`${T}_ERROR`, Error>;
  
  return Object.assign(actionCreator, { success, error });
}

export function createActionCreator<T extends string>(type: T): ActionCreator<T>;
export function createActionCreator<T extends string, P>(type: T): ActionCreator<T, P>;
export function createActionCreator<T extends string, P = void>(
  type: T
): ActionCreator<T, P> {
  return ((payload?: P) =>
    payload === undefined ? { type } : { type, payload }) as ActionCreator<T, P>;
}

export type AsyncState<T> = {
  data: T | null;
  loading: boolean;
  error: Error | null;
};

export function createAsyncAtom<T>(
  asyncFn: () => Promise<T>,
  debugLabel?: string
): [Atom<AsyncState<T>>, () => Promise<void>] {
  const initialState: AsyncState<T> = {
    data: null,
    loading: false,
    error: null,
  };

  const atom = createDerivedAtom<AsyncState<T>>({
    read: () => initialState,
    write: (get, set, state: AsyncState<T>) => {
      set(atom, state);
    },
    debugLabel,
  });

  const fetch = async (): Promise<void> => {
    try {
      atom.set({ ...initialState, loading: true });
      const data = await asyncFn();
      atom.set({ data, loading: false, error: null });
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      atom.set({ data: null, loading: false, error: errorObj });
    }
  };

  return [atom, fetch];
} 