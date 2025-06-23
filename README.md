# Vitest Browser Qwik

A modern testing setup demonstrating browser-based testing for Qwik components using Vitest. This project showcases how to effectively test Qwik components with both Client-Side Rendering (CSR) and Server-Side Rendering (SSR), making it perfect for testing complex UI behaviors and SSR scenarios.

## Getting Started

```bash
pnpm add vitest-browser-qwik
```

## Core Features

- **`render`** - Client-Side Rendering for interactive component testing
- **`renderSSR`** - Server-Side Rendering for testing SSR output and hydration
- **`renderHook`** - Hook testing utilities (currently only CSR supported)
- All functions are async for predictable testing behavior

### Client-Side Rendering Example

```tsx
import { render } from 'vitest-browser-qwik'
import { expect, test } from 'vitest'

test('renders counter with CSR', async () => {
  const screen = await render(<Counter initialCount={1} />);
  await expect.element(screen.getByText('Count is 1')).toBeVisible();
  await screen.getByRole('button', { name: 'Increment' }).click();
  await expect.element(screen.getByText('Count is 2')).toBeVisible();
});
```

### Server-Side Rendering Example

```tsx
import { renderSSR } from 'vitest-browser-qwik'
import { expect, test } from 'vitest'

test('renders counter with SSR', async () => {
  const screen = await renderSSR(<Counter initialCount={5} />);
  
  // Test the server-rendered HTML
  expect(screen.container.innerHTML).toContain('Count is 5');
  expect(screen.container.innerHTML).toContain('button');
  
  // Can also use DOM queries on SSR content
  await expect.element(screen.getByText('Count is 5')).toBeVisible();
});
```

### Hook Testing Example

```tsx
import { renderHook } from 'vitest-browser-qwik'
import { useSignal } from '@builder.io/qwik'

test('tests custom hook', async () => {
  const { result } = await renderHook(() => {
    const count = useSignal(0);
    return { count, increment: () => count.value++ };
  });
  
  expect(result.count.value).toBe(0);
  result.increment();
  expect(result.count.value).toBe(1);
});
```

## SSR vs CSR

Both `render` and `renderSSR` provide the same testing interface, but work differently under the hood:

- **`render` (CSR)**: Renders components in the browser context with full interactivity
- **`renderSSR` (SSR)**: Executes components in a Node.js context to generate server-side HTML, then provides that HTML for testing

The SSR approach is unique because it executes your components in a different context than your test files, simulating real server-side rendering behavior.

### Page Object Integration

You can also use the `page` object, as this library injects `.render` and `.renderServerHTML` methods:

```tsx
import { expect, test } from 'vitest'

test('renders counter with page object', async () => {
  const screen = await page.render(<Counter initialCount={1} />);
  await expect.element(screen.getByText('Count is 1')).toBeVisible();
});
```

## Render Options

The `render` function accepts an options object as its second parameter:

```ts
interface RenderOptions {
  // Optional HTMLElement where the component will be rendered
  container?: HTMLElement;
  // Optional HTMLElement that serves as the base element (defaults to document.body)
  baseElement?: HTMLElement;
}
```

Example with options:

```tsx
import { render } from 'vitest-browser-qwik'

test('renders with custom container', async () => {
  const customContainer = document.createElement('div');
  const screen = await render(<MyComponent />, { 
    container: customContainer 
  });
});
```

**Note**: `renderSSR` currently does not support custom render options due to its execution in a separate Node.js context.

## Important Notes

- **Always await**: All functions from `vitest-browser-qwik` are async and should be awaited for predictable behavior
- **SSR Context**: `renderSSR` executes components in a Node.js context separate from your test files, providing true server-side rendering simulation
- **Same Interface**: Both CSR and SSR provide the same testing interface, making it easy to test both rendering modes

## Contributing

Feel free to open issues and pull requests. All contributions are welcome!

## License

MIT 
