import { Atom, WritableAtom, createDerivedAtom } from './store';

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
): [WritableAtom<S, A>, (action: A) => void] {
  const atom = createDerivedAtom({
    read: (get) => initialState,
    write: (get, set, action: A) => {
      const currentState = get(atom);
      const nextState = reducer(currentState, action);
      set(atom, nextState);
    },
    debugLabel,
  }) as WritableAtom<S, A>;

  const dispatch = (action: A) => {
    const currentState = atom.read((a) => a);
    const nextState = reducer(currentState, action);
    atom.write(() => {}, () => {}, action);
  };

  return [atom, dispatch];
}

export function createSelector<S, R>(
  atom: Atom<S>,
  selector: (state: S) => R,
  debugLabel?: string
): Atom<R> {
  return createDerivedAtom({
    read: (get) => selector(get(atom)),
    debugLabel,
  });
}

export function createAsyncAction<T extends string, P, R>(
  type: T,
  asyncFn: (payload: P) => Promise<R>
): ActionCreator<T, P> & { success: ActionCreator<`${T}_SUCCESS`, R>; error: ActionCreator<`${T}_ERROR`, Error> } {
  const actionCreator = ((payload: P) => ({ type, payload })) as ActionCreator<T, P>;
  actionCreator.success = ((payload: R) => ({ type: `${type}_SUCCESS` as const, payload })) as ActionCreator<
    `${T}_SUCCESS`,
    R
  >;
  actionCreator.error = ((payload: Error) => ({ type: `${type}_ERROR` as const, payload })) as ActionCreator<
    `${T}_ERROR`,
    Error
  >;
  return actionCreator;
}

export function createActionCreator<T extends string>(type: T): ActionCreator<T>;
export function createActionCreator<T extends string, P>(type: T): ActionCreator<T, P>;
export function createActionCreator<T extends string, P = void>(type: T): ActionCreator<T, P> {
  return ((payload?: P) => (payload === undefined ? { type } : { type, payload })) as ActionCreator<T, P>;
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

  const [atom, dispatch] = createReducerAtom<AsyncState<T>, any>(initialState, (state, action) => {
    switch (action.type) {
      case 'FETCH_START':
        return { ...state, loading: true, error: null };
      case 'FETCH_SUCCESS':
        return { data: action.payload, loading: false, error: null };
      case 'FETCH_ERROR':
        return { ...state, loading: false, error: action.payload };
      default:
        return state;
    }
  }, debugLabel);

  const fetch = async () => {
    dispatch({ type: 'FETCH_START' });
    try {
      const data = await asyncFn();
      dispatch({ type: 'FETCH_SUCCESS', payload: data });
    } catch (error) {
      dispatch({ type: 'FETCH_ERROR', payload: error instanceof Error ? error : new Error(String(error)) });
    }
  };

  return [atom, fetch];
} 