export class AtomikError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AtomikError';
  }
}

export class AtomNotFoundError extends AtomikError {
  constructor(atomLabel?: string) {
    super(`Atom${atomLabel ? ` "${atomLabel}"` : ''} not found in store`);
    this.name = 'AtomNotFoundError';
  }
}

export class InvalidAtomUpdateError extends AtomikError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAtomUpdateError';
  }
}

export class CircularDependencyError extends AtomikError {
  constructor(atomLabel?: string) {
    super(`Circular dependency detected${atomLabel ? ` in atom "${atomLabel}"` : ''}`);
    this.name = 'CircularDependencyError';
  }
} 