import type { Atom, WritableAtom } from './store';
import { AtomMiddleware } from './middleware';
import { getAtomMetrics } from './performance';

interface DevToolsState {
  atoms: Map<symbol, any>;
  history: Array<{
    type: string;
    atomKey: symbol;
    value: any;
    timestamp: number;
    debugLabel?: string;
  }>;
  snapshots: Map<number, Map<symbol, any>>;
  lastSnapshot: number;
}

interface DevToolsInstance {
  init(defaultValue: any): void;
  send(action: string, state: any): void;
  subscribe(listener: (message: any) => void): () => void;
}

declare global {
  interface Window {
    __REDUX_DEVTOOLS_EXTENSION__?: {
      connect(options: any): DevToolsInstance;
    };
  }
}

class AtomikDevTools {
  private static instance: AtomikDevTools;
  private devTools?: DevToolsInstance;
  private state: DevToolsState = {
    atoms: new Map(),
    history: [],
    snapshots: new Map(),
    lastSnapshot: 0,
  };
  private snapshotInterval = 50; // Take a snapshot every 50 actions

  private constructor() {
    if (typeof window !== 'undefined' && window.__REDUX_DEVTOOLS_EXTENSION__) {
      this.devTools = window.__REDUX_DEVTOOLS_EXTENSION__.connect({
        name: 'Atomik State',
        features: {
          pause: true,
          lock: true,
          persist: true,
          export: true,
          import: 'custom',
          jump: true,
          skip: true,
          reorder: true,
          dispatch: true,
          test: true,
        },
      });

      this.devTools.init(this.getState());
      this.setupSubscription();
    }
  }

  public static getInstance(): AtomikDevTools {
    if (!AtomikDevTools.instance) {
      AtomikDevTools.instance = new AtomikDevTools();
    }
    return AtomikDevTools.instance;
  }

  private setupSubscription() {
    this.devTools?.subscribe((message: any) => {
      if (message.type === 'DISPATCH') {
        switch (message.payload.type) {
          case 'JUMP_TO_ACTION':
          case 'JUMP_TO_STATE':
            this.jumpToState(JSON.parse(message.state));
            break;
          case 'IMPORT_STATE':
            this.importState(message.payload.nextLiftedState);
            break;
          case 'RESET':
            this.reset();
            break;
        }
      }
    });
  }

  private getState() {
    const state: Record<string, any> = {};
    this.state.atoms.forEach((value, key) => {
      state[String(key)] = {
        value,
        metrics: getAtomMetrics({ key } as Atom<any>),
      };
    });
    return state;
  }

  private takeSnapshot() {
    this.state.lastSnapshot++;
    this.state.snapshots.set(
      this.state.lastSnapshot,
      new Map(this.state.atoms)
    );
  }

  private jumpToState(state: any) {
    Object.entries(state).forEach(([key, value]: [string, any]) => {
      const atomKey = Symbol.for(key);
      if (this.state.atoms.has(atomKey)) {
        this.state.atoms.set(atomKey, value.value);
      }
    });
  }

  private importState(liftedState: any) {
    this.state.atoms = new Map(
      Object.entries(liftedState.computedStates[liftedState.currentStateIndex])
        .map(([key, value]: [string, any]) => [Symbol.for(key), value])
    );
  }

  private reset() {
    this.state.atoms.clear();
    this.state.history = [];
    this.state.snapshots.clear();
    this.state.lastSnapshot = 0;
    this.devTools?.init(this.getState());
  }

  public recordAtomUpdate<T>(
    atom: Atom<T>,
    value: T,
    actionType: string = 'UPDATE'
  ) {
    if (!this.devTools) return;

    this.state.atoms.set(atom.key, value);
    this.state.history.push({
      type: actionType,
      atomKey: atom.key,
      value,
      timestamp: Date.now(),
      debugLabel: atom.debugLabel,
    });

    if (this.state.history.length % this.snapshotInterval === 0) {
      this.takeSnapshot();
    }

    this.devTools.send(
      {
        type: actionType,
        atom: atom.debugLabel || String(atom.key),
      },
      this.getState()
    );
  }
}

export const createDevTools = (config?: {
  snapshotInterval?: number;
}): AtomMiddleware => {
  const devTools = AtomikDevTools.getInstance();
  if (config?.snapshotInterval) {
    devTools['snapshotInterval'] = config.snapshotInterval;
  }

  return {
    onWrite: (atom, value, next) => {
      next(value);
      devTools.recordAtomUpdate(atom, value);
    },
  };
};

// Custom action creators for better DevTools integration
export const createDevToolsAction = <T>(
  type: string,
  atom: WritableAtom<T>
) => {
  return (payload: T) => {
    const devTools = AtomikDevTools.getInstance();
    atom.set(payload);
    devTools.recordAtomUpdate(atom, payload, type);
  };
}; 