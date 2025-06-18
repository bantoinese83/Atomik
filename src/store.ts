export interface AtomMiddleware {
  onRead?: <T>(atom: Atom<T>, value: T) => T;
  onWrite?: <T>(atom: WritableAtom<T>, value: T) => T;
  onError?: (error: Error) => void;
}

export interface Atom<T> {
  key: symbol;
  debugLabel?: string;
  read: (get: <V>(a: Atom<V>) => V) => T;
}

export interface WritableAtom<T> extends Atom<T> {
  set: (value: T | ((prev: T) => T)) => void;
}

export class Store {
  public atoms = new Map<symbol, unknown>();
  public subscribers = new Map<symbol, Set<() => void>>();
  private middleware: AtomMiddleware[] = [];
  private readonly maxCircularDepth = 100;
  private accessStack = new Set<symbol>();

  constructor(middleware: AtomMiddleware[] = []) {
    this.middleware = middleware;
  }

  private executeReadMiddleware<T>(atom: Atom<T>, value: T): T {
    return this.middleware.reduce(
      (acc, m) => (m.onRead ? m.onRead(atom, acc) : acc),
      value
    );
  }

  private executeWriteMiddleware<T>(atom: WritableAtom<T>, value: T): T {
    return this.middleware.reduce(
      (acc, m) => (m.onWrite ? m.onWrite(atom, acc) : acc),
      value
    );
  }

  public get<T>(atom: Atom<T>): T {
    if (this.accessStack.has(atom.key)) {
      throw new CircularDependencyError(
        `Circular dependency detected while reading ${atom.debugLabel || String(atom.key)}`
      );
    }

    if (this.accessStack.size >= this.maxCircularDepth) {
      throw new CircularDependencyError(
        `Maximum circular dependency depth of ${this.maxCircularDepth} exceeded`
      );
    }

    this.accessStack.add(atom.key);
    try {
      const value = this.atoms.get(atom.key);
      if (value === undefined) {
        const computed = atom.read(this.get.bind(this));
        this.atoms.set(atom.key, computed);
        return this.executeReadMiddleware(atom, computed);
      }
      return this.executeReadMiddleware(atom, value as T);
    } finally {
      this.accessStack.delete(atom.key);
    }
  }

  public set<T>(atom: WritableAtom<T>, value: T): void {
    const processedValue = this.executeWriteMiddleware(atom, value);
    this.atoms.set(atom.key, processedValue);
    const subscribers = this.subscribers.get(atom.key);
    if (subscribers) {
      subscribers.forEach((callback) => callback());
    }
  }

  public subscribe(key: symbol, callback: () => void): void {
    let subscribers = this.subscribers.get(key);
    if (!subscribers) {
      subscribers = new Set();
      this.subscribers.set(key, subscribers);
    }
    subscribers.add(callback);
  }

  public unsubscribe(key: symbol, callback: () => void): void {
    const subscribers = this.subscribers.get(key);
    if (subscribers) {
      subscribers.delete(callback);
      if (subscribers.size === 0) {
        this.subscribers.delete(key);
        this.atoms.delete(key);
      }
    }
  }

  public handleError(error: Error): void {
    for (const m of this.middleware) {
      if (m.onError) {
        m.onError(error);
      }
    }
  }
}

export class AtomNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AtomNotFoundError';
  }
}

export class CircularDependencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircularDependencyError';
  }
}

export class InvalidAtomUpdateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAtomUpdateError';
  }
} 