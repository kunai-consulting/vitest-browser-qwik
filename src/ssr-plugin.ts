import { dirname, relative, resolve } from "node:path";
import type { Plugin } from "vitest/config";

// Vite plugin that transforms renderSSR(<Component />) calls to commands.renderSSR() calls
export function createSSRTransformPlugin(): Plugin {
	return {
		name: "vitest:ssr-transform",
		enforce: "pre",

		async transform(code, id) {
			// Only transform test files
			if (!id.includes(".test.") && !id.includes(".spec.")) {
				return null;
			}

			// Skip if no renderSSR calls
			if (!code.includes("renderSSR")) {
				return null;
			}

			console.log(`🔧 SSR Transform Plugin processing: ${id}`);

			try {
				const { parseSync } = await import("oxc-parser");
				const MagicString = (await import("magic-string")).default;

				const ast = parseSync(id, code);
				const s = new MagicString(code);

				// Track imports to resolve component paths
				const imports: Map<string, string> = new Map();
				let hasCommandsImport = false;

				// Walk the AST to find imports and renderSSR calls
				function walk(node: any) {
					if (!node || typeof node !== "object") return;

					// Track import declarations
					if (node.type === "ImportDeclaration" && node.source?.value) {
						const source = node.source.value;
						if (node.specifiers) {
							for (const spec of node.specifiers) {
								if (spec.type === "ImportSpecifier" && spec.imported?.name) {
									imports.set(spec.imported.name, source);
								}
							}
						}
					}

					// Check if commands is already imported
					if (
						node.type === "ImportDeclaration" &&
						node.source?.value === "@vitest/browser/context"
					) {
						if (
							node.specifiers?.some(
								(spec: any) =>
									spec.type === "ImportSpecifier" &&
									spec.imported?.name === "commands",
							)
						) {
							hasCommandsImport = true;
						}
					}

					// Find renderSSR calls with JSX
					if (
						node.type === "CallExpression" &&
						node.callee?.type === "Identifier" &&
						node.callee.name === "renderSSR"
					) {
						const jsxArg = node.arguments?.[0];
						if (jsxArg?.type === "JSXElement") {
							const componentName = jsxArg.openingElement?.name?.name;
							if (componentName) {
								const componentImportPath = imports.get(componentName);
								if (componentImportPath) {
									// Resolve the full path from the test file location
									let componentPath = componentImportPath;

									// If it's a relative import, resolve it relative to the test file
									if (componentPath.startsWith(".")) {
										const testFileDir = dirname(id);
										const resolvedPath = resolve(testFileDir, componentPath);
										// Convert back to relative path from project root
										const projectRoot = process.cwd();
										componentPath = "./" + relative(projectRoot, resolvedPath);
									}

									// Add .tsx extension if not present
									if (
										!componentPath.endsWith(".tsx") &&
										!componentPath.endsWith(".ts")
									) {
										componentPath += ".tsx";
									}

									console.log(
										`📁 Resolved path: ${componentImportPath} -> ${componentPath}`,
									);

									// Extract props from JSX attributes
									const props: Record<string, any> = {};
									const attributes = jsxArg.openingElement?.attributes || [];

									for (const attr of attributes) {
										if (attr.type === "JSXAttribute" && attr.name?.name) {
											const propName = attr.name.name;
											if (attr.value?.type === "JSXExpressionContainer") {
												// Handle expression values like {5}
												const expr = attr.value.expression;
												if (expr?.type === "Literal") {
													props[propName] = expr.value;
												}
											} else if (attr.value?.type === "Literal") {
												// Handle string literals
												props[propName] = attr.value.value;
											}
										}
									}

									// Generate the replacement
									const propsStr =
										Object.keys(props).length > 0
											? `, ${JSON.stringify(props)}`
											: "";

									const replacement = `commands.renderSSR("${componentPath}", "${componentName}"${propsStr})`;

									console.log(
										`🔄 Transforming: renderSSR(<${componentName} />) -> ${replacement}`,
									);

									s.overwrite(node.start, node.end, replacement);
								}
							}
						}
					}

					// Recursively walk child nodes
					for (const key in node) {
						const child = node[key];
						if (Array.isArray(child)) {
							child.forEach(walk);
						} else if (child && typeof child === "object") {
							walk(child);
						}
					}
				}

				walk(ast);

				// Add commands import if not present and we made transformations
				if (!hasCommandsImport && s.hasChanged()) {
					// Find the last import statement to add commands import after it
					let lastImportEnd = 0;
					function findLastImport(node: any) {
						if (!node || typeof node !== "object") return;

						if (node.type === "ImportDeclaration") {
							lastImportEnd = Math.max(lastImportEnd, node.end);
						}

						for (const key in node) {
							const child = node[key];
							if (Array.isArray(child)) {
								child.forEach(findLastImport);
							} else if (child && typeof child === "object") {
								findLastImport(child);
							}
						}
					}

					findLastImport(ast);

					if (lastImportEnd > 0) {
						s.appendLeft(
							lastImportEnd,
							'\nimport { commands } from "@vitest/browser/context";',
						);
					}
				}

				if (s.hasChanged()) {
					return {
						code: s.toString(),
						map: s.generateMap({ hires: true }),
					};
				}
			} catch (error) {
				console.warn(`Failed to transform ${id}:`, error);
			}

			return null;
		},
	};
}
