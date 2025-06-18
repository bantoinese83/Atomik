import { Atom, WritableAtom } from './store';
import { AtomMiddleware } from './middleware';
import { getAtomMetrics } from './performance';

interface DevToolsMessage {
  type: string;
  payload?: {
    type: string;
    nextLiftedState?: unknown;
  };
  state?: string;
}

interface DevToolsState {
  atoms: Map<symbol, unknown>;
  history: Array<{
    type: string;
    atomKey: symbol;
    value: unknown;
    timestamp: number;
    debugLabel?: string;
  }>;
  snapshots: Map<number, Map<symbol, unknown>>;
  lastSnapshot: number;
}

interface DevToolsInstance {
  init(defaultValue: unknown): void;
  send(action: string | { type: string; atom: string }, state: unknown): void;
  subscribe(listener: (message: DevToolsMessage) => void): () => void;
}

declare global {
  interface Window {
    __REDUX_DEVTOOLS_EXTENSION__?: {
      connect(options?: { name?: string; maxAge?: number }): DevToolsInstance;
    };
  }
}

interface DevToolsConfig {
  name?: string;
  maxAge?: number;
}

export const devTools = (config?: DevToolsConfig): AtomMiddleware => {
  const devToolsInstance = typeof window !== 'undefined' 
    ? window.__REDUX_DEVTOOLS_EXTENSION__?.connect(config)
    : undefined;

  if (!devToolsInstance) {
    return {};
  }

  const state: DevToolsState = {
    atoms: new Map(),
    history: [],
    snapshots: new Map(),
    lastSnapshot: 0,
  };

  let isTimeTraveling = false;

  devToolsInstance.init(state);

  devToolsInstance.subscribe((message: DevToolsMessage) => {
    if (message.type === 'DISPATCH' && message.payload) {
      switch (message.payload.type) {
        case 'JUMP_TO_STATE':
        case 'JUMP_TO_ACTION': {
          isTimeTraveling = true;
          const nextStateStr = message.state;
          if (nextStateStr) {
            const nextState = JSON.parse(nextStateStr) as DevToolsState;
            state.atoms = new Map(Object.entries(nextState.atoms).map(([key, value]) => [Symbol(key), value]));
          }
          break;
        }
        default:
          break;
      }
    }
  });

  return {
    onWrite: <T>(atom: Atom<T>, value: T, next: (value: T) => void): void => {
      if (!isTimeTraveling) {
        state.atoms.set(atom.key, value);
        state.history.push({
          type: 'UPDATE',
          atomKey: atom.key,
          value,
          timestamp: Date.now(),
          debugLabel: atom.debugLabel,
        });

        devToolsInstance.send(
          {
            type: 'UPDATE',
            atom: atom.debugLabel || String(atom.key),
          },
          {
            atoms: Object.fromEntries(
              Array.from(state.atoms.entries()).map(([key, value]) => [
                String(key),
                value,
              ])
            ),
            history: state.history,
            snapshots: state.snapshots,
            lastSnapshot: state.lastSnapshot,
            metrics: getAtomMetrics({ key: atom.key } as Atom<T>),
          }
        );
      }

      next(value);
      isTimeTraveling = false;
    },
  };
};

export const createDevToolsAction = <T>(
  type: string,
  atom: WritableAtom<T>
) => {
  return (payload: T) => {
    const devTools = typeof window !== 'undefined' 
      ? window.__REDUX_DEVTOOLS_EXTENSION__?.connect({ name: 'Atomik State' })
      : undefined;

    if (devTools) {
      atom.set(payload);
      devTools.send(
        {
          type,
          atom: atom.debugLabel || String(atom.key),
        },
        {
          value: payload,
          metrics: getAtomMetrics({ key: atom.key } as Atom<T>),
        }
      );
    }
  };
}; 