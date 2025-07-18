# Vitest Browser Qwik

A modern testing setup demonstrating browser-based testing for Qwik components using Vitest. This project showcases how to effectively test Qwik components with both Client-Side Rendering (CSR) and Server-Side Rendering (SSR), making it perfect for testing complex UI behaviors across environments.

## Getting Started

```bash
npm install -D vitest-browser-qwik
```

## Core Features

- **`render`** - Client-Side Rendering for interactive component testing
- **`renderSSR`** - Server-Side Rendering for testing SSR output and environment contexts
- **`renderHook`** - Hook testing utilities (currently only CSR supported)
- All functions are async for predictable testing behavior

### Client-Side Rendering Example

```tsx
import { render } from 'vitest-browser-qwik'
import { expect, test } from 'vitest'
import { Counter } from './components/counter'

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
import { Counter } from './components/counter'

test('renders counter with SSR', async () => {
  const screen = await renderSSR(<Counter initialCount={5} />);
  
  // Test the server-rendered HTML
  expect(screen.container.innerHTML).toContain('Count is 5');
  expect(screen.container.innerHTML).toContain('button');
  
  // Can also use DOM queries on the content initially rendered by SSR
  await expect.element(screen.getByText('Count is 5')).toBeVisible();
});
```

### Hook Testing Example

```tsx
import { useSignal } from "@builder.io/qwik";
import { expect, test } from "vitest";
import { renderHook } from "vitest-browser-qwik";
import { useCounter } from "./fixtures/useCounter";

test("should increment counter", async () => {
	const { result } = await renderHook(() =>
		useCounter({ countSignal: useSignal(0) }),
	);

	console.log("RESULT", result);

	await result.increment$();

	expect(result.count.value).toBe(1);
});
```

## SSR vs CSR

Both `render` and `renderSSR` provide the same testing interface, but work differently under the hood:

- **`render` (CSR)**: Renders components in the browser context
- **`renderSSR` (SSR)**: Executes components in a Node.js context to generate server-side HTML, then provides that HTML for testing

The SSR approach is unique because it executes your components in a different context than your test files, real server-side rendering behavior in Vitest.

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

## Compatibility
In testing, we have observed render issues with Vite 5.x. We recommend using Vite 6+. Qwik 1 currently specifies Vite 5.x,
but Vite 6.x should work as well.

## Limitations

- For `renderSSR` you must always import the component from another file, local components are not supported. This is because this would require importing the vitest context, or moving local components into separate files dynamically, which involves a lot of unwanted complexity.

- In the vitest config there is a hardcoded value for whether or not browser mode is headless. This is because when relying on environment variables, it seems there is an additional cost in the vitest core side that introduces potential race conditions.

## Contributing

Feel free to open issues and pull requests. All contributions are welcome!

## License

MIT 
