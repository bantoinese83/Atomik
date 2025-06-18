# Atomik

A lightweight, powerful, and developer-friendly state management library for React applications.

[![npm version](https://badge.fury.io/js/atomik.svg)](https://badge.fury.io/js/atomik)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- 🚀 **Lightweight & Fast**: Zero dependencies, tiny bundle size
- 🔄 **Familiar API**: Similar to React's useState and Redux patterns
- 🛠 **Developer Tools**: Time-travel debugging, state inspection, and performance monitoring
- 🎯 **TypeScript First**: Built with TypeScript for excellent type safety
- ⚡ **High Performance**: Automatic batching, caching, and optimized re-renders
- 🔌 **Middleware System**: Extensible with plugins for logging, persistence, etc.
- 🎨 **Flexible**: Supports both simple and complex state management patterns

## Quick Start

```bash
npm install atomik
# or
yarn add atomik
```

### Basic Usage

```typescript
import { createAtom, useAtom } from 'atomik';

// Create an atom (similar to useState)
const counterAtom = createAtom(0);

function Counter() {
  const [count, setCount] = useAtom(counterAtom);
  
  return (
    <button onClick={() => setCount(c => c + 1)}>
      Count: {count}
    </button>
  );
}
```

### Redux-like Pattern

```typescript
import { createReducerAtom, createActionCreator } from 'atomik';

// Define actions
const increment = createActionCreator('INCREMENT');
const decrement = createActionCreator('DECREMENT');
const add = createActionCreator<number>('ADD');

// Create a reducer atom
const counterAtom = createReducerAtom(
  0,
  (state, action) => {
    switch (action.type) {
      case 'INCREMENT':
        return state + 1;
      case 'DECREMENT':
        return state - 1;
      case 'ADD':
        return state + action.payload;
      default:
        return state;
    }
  }
);

function Counter() {
  const [count, dispatch] = useAtom(counterAtom);
  
  return (
    <div>
      <button onClick={() => dispatch(increment())}>+</button>
      <span>{count}</span>
      <button onClick={() => dispatch(decrement())}>-</button>
      <button onClick={() => dispatch(add(10))}>+10</button>
    </div>
  );
}
```

### Computed Values (Selectors)

```typescript
import { createAtom, createDerivedAtom, useAtom } from 'atomik';

const todosAtom = createAtom([
  { id: 1, text: 'Learn Atomik', completed: false },
  { id: 2, text: 'Build app', completed: true },
]);

const completedTodosAtom = createDerivedAtom(
  [todosAtom],
  (todos) => todos.filter(todo => todo.completed)
);

function CompletedTodos() {
  const [completedTodos] = useAtom(completedTodosAtom);
  return <div>Completed: {completedTodos.length}</div>;
}
```

### Async Actions

```typescript
import { createAsyncAtom, useAtom } from 'atomik';

const userAtom = createAsyncAtom(
  async (userId: string) => {
    const response = await fetch(`/api/users/${userId}`);
    return response.json();
  }
);

function UserProfile({ userId }: { userId: string }) {
  const [{ data, loading, error }] = useAtom(userAtom);
  
  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  return <div>Welcome, {data.name}!</div>;
}
```

### DevTools Integration

```typescript
import { createStore, createDevTools } from 'atomik';

const store = createStore();
store.use(createDevTools());

// Now you can use Redux DevTools to inspect state and time-travel debug!
```

### Performance Monitoring

```typescript
import { getAtomMetrics, performanceMiddleware } from 'atomik';

const store = createStore();
store.use(performanceMiddleware());

// Later, check performance metrics
const metrics = getAtomMetrics(myAtom);
console.log(metrics);
/*
{
  reads: number,
  writes: number,
  subscribers: number,
  updateTime: number,
  lastUpdate: number,
  averageUpdateTime: number
}
*/
```

### Persistence

```typescript
import { persist } from 'atomik';

const settingsAtom = createAtom(
  { theme: 'light', fontSize: 14 },
  {
    middleware: [
      persist('app-settings') // Automatically saves to localStorage
    ]
  }
);
```

## Advanced Features

### Batch Updates

```typescript
import { useBatchUpdates } from 'atomik';

function TodoList() {
  const batchUpdate = useBatchUpdates();
  
  const completeAll = () => {
    batchUpdate(() => {
      // All these updates will cause only one re-render
      todos.forEach(todo => {
        todoAtom.set(todo.id, { ...todo, completed: true });
      });
    });
  };
}
```

### Custom Middleware

```typescript
import { type AtomMiddleware } from 'atomik';

const loggingMiddleware: AtomMiddleware = {
  onRead: (atom, value) => {
    console.log(`Reading ${atom.debugLabel}:`, value);
    return value;
  },
  onWrite: (atom, value, next) => {
    console.log(`Writing ${atom.debugLabel}:`, value);
    next(value);
  }
};

const store = createStore();
store.use(loggingMiddleware);
```

### Type-Safe Selectors

```typescript
import { createSelector } from 'atomik';

interface Todo {
  id: number;
  text: string;
  completed: boolean;
}

const todosAtom = createAtom<Todo[]>([]);

const selectCompletedTodos = createSelector(
  [todosAtom],
  (todos): Todo[] => todos.filter(todo => todo.completed)
);

function CompletedTodos() {
  // Type-safe: Todo[]
  const completedTodos = useAtomSelector(todosAtom, selectCompletedTodos);
}
```

## Best Practices

1. **Use Descriptive Labels**
```typescript
const userAtom = createAtom(null, { debugLabel: 'currentUser' });
```

2. **Organize Related State**
```typescript
const authAtom = createAtom({
  user: null,
  token: null,
  isAuthenticated: false
});
```

3. **Leverage TypeScript**
```typescript
interface User {
  id: string;
  name: string;
  email: string;
}

const userAtom = createAtom<User | null>(null);
```

4. **Modular State Management**
```typescript
// auth/atoms.ts
export const authAtom = createAtom({ /*...*/ });

// todos/atoms.ts
export const todosAtom = createAtom({ /*...*/ });
```

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## License

MIT © [Your Name]