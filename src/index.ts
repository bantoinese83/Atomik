// Core functionality


// Atom creation and hooks
export { createAtom, createDerivedAtom, useAtom } from './atoms';

// Actions and Redux-like functionality
export {
  createReducerAtom,
  createSelector,
  createAsyncAction,
  createActionCreator,
  createAsyncAtom,
} from './actions';
export type { Action, ActionCreator, Reducer, AsyncState } from './actions';

// Middleware
export {
  adaptReduxMiddleware,
  devTools,
  persist,
  createValidator,
  computed,
} from './middleware';
export type { ReduxMiddleware, DevToolsConfig } from './middleware';

// Performance monitoring
export { getAtomMetrics, resetMetrics } from './performance';

// Cache system
export { computationCache } from './cache';

// Singleton store instance
export { store } from './store.instance';