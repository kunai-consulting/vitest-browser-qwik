import { dirname, relative, resolve } from "node:path";
import type { Plugin } from "vitest/config";

// Helper function to check if code contains renderSSR calls using semantic analysis
async function hasRenderSSRCall(
	code: string,
	filename: string,
): Promise<boolean> {
	try {
		const { parseSync } = await import("oxc-parser");
		const ast = parseSync(filename, code);

		// Track all renderSSR-related identifiers and their bindings
		const renderSSRIdentifiers = new Set<string>();
		renderSSRIdentifiers.add("renderSSR"); // Default name

		function walk(node: any): boolean {
			if (!node || typeof node !== "object") return false;

			// Check for renderSSR imports with possible aliases
			if (node.type === "ImportDeclaration" && node.source?.value) {
				if (node.specifiers) {
					for (const spec of node.specifiers) {
						if (spec.type === "ImportSpecifier") {
							// Check if importing renderSSR (could be aliased)
							if (spec.imported?.name === "renderSSR") {
								renderSSRIdentifiers.add(spec.local?.name || "renderSSR");
							}
						}
						// Handle default imports that might be renderSSR
						if (spec.type === "ImportDefaultSpecifier") {
							// This is a heuristic - could be improved with more context
							if (
								spec.local?.name &&
								spec.local.name.toLowerCase().includes("renderssr")
							) {
								renderSSRIdentifiers.add(spec.local.name);
							}
						}
					}
				}
			}

			// Check for variable declarations that might alias renderSSR
			if (node.type === "VariableDeclarator" && node.id?.name && node.init) {
				if (
					node.init.type === "Identifier" &&
					renderSSRIdentifiers.has(node.init.name)
				) {
					renderSSRIdentifiers.add(node.id.name);
				}
			}

			// Check for renderSSR function calls
			if (
				node.type === "CallExpression" &&
				node.callee?.type === "Identifier"
			) {
				if (renderSSRIdentifiers.has(node.callee.name)) {
					return true; // Found a renderSSR call
				}
			}

			// Recursively walk child nodes
			for (const key in node) {
				const child = node[key];
				if (Array.isArray(child)) {
					if (child.some(walk)) return true;
				} else if (child && typeof child === "object") {
					if (walk(child)) return true;
				}
			}

			return false;
		}

		return walk(ast);
	} catch (error) {
		// Fallback to string check if AST parsing fails
		console.warn(
			`Failed to parse ${filename} for renderSSR detection, falling back to string check:`,
			error,
		);
		return code.includes("renderSSR");
	}
}

// Vite plugin that transforms renderSSR(<Component />) calls to commands.renderSSR() calls
export function createSSRTransformPlugin(): Plugin {
	return {
		name: "vitest:ssr-transform",
		enforce: "pre",

		async transform(code, id) {
			if (!id.includes(".test.") && !id.includes(".spec.")) {
				return null;
			}

			// Use semantic analysis to detect renderSSR calls
			if (!(await hasRenderSSRCall(code, id))) {
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

				// Track renderSSR aliases (for proper transformation)
				const renderSSRIdentifiers = new Set<string>();
				renderSSRIdentifiers.add("renderSSR"); // Default name

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

									// Track renderSSR aliases
									if (spec.imported.name === "renderSSR") {
										renderSSRIdentifiers.add(spec.local?.name || "renderSSR");
									}
								}
								// Handle default imports
								if (spec.type === "ImportDefaultSpecifier") {
									if (
										spec.local?.name &&
										spec.local.name.toLowerCase().includes("renderssr")
									) {
										renderSSRIdentifiers.add(spec.local.name);
									}
								}
							}
						}
					}

					// Track variable declarations that alias renderSSR
					if (
						node.type === "VariableDeclarator" &&
						node.id?.name &&
						node.init
					) {
						if (
							node.init.type === "Identifier" &&
							renderSSRIdentifiers.has(node.init.name)
						) {
							renderSSRIdentifiers.add(node.id.name);
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

					// Find renderSSR calls with JSX (check all aliases)
					if (
						node.type === "CallExpression" &&
						node.callee?.type === "Identifier" &&
						renderSSRIdentifiers.has(node.callee.name)
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
										`🔄 Transforming: ${node.callee.name}(<${componentName} />) -> ${replacement}`,
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
