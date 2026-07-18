import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

let statusBarItem: vscode.StatusBarItem;
let currentLanguage: string = "";
let routes: any = {};

export function activate(context: vscode.ExtensionContext) {
	console.log("🍂 Dependency Viewer activated");

	// Load routes
	const routePath = path.join(context.extensionPath, "dist", "route.json");
	if (!fs.existsSync(routePath)) {
		const rootPath = path.join(context.extensionPath, "route.json");
		if (fs.existsSync(rootPath)) {
			routes = JSON.parse(fs.readFileSync(rootPath, "utf8"));
		}
	} else {
		routes = JSON.parse(fs.readFileSync(routePath, "utf8"));
	}

	// Status bar item - پایین سمت راست
	statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	statusBarItem.text = "$(package) Dependency Viewer";
	statusBarItem.tooltip = "Search dependencies";
	statusBarItem.command = "dependencyManager.quickPick";
	statusBarItem.show();

	// Register command for status bar click
	const quickPickCommand = vscode.commands.registerCommand("dependencyManager.quickPick", async () => {
		await showLanguagePicker();
	});

	// Register search command
	const searchCommand = vscode.commands.registerCommand("dependencyManager.searchPackage", async () => {
		if (!currentLanguage) {
			await showLanguagePicker();
		}
		if (currentLanguage) {
			await searchAndShowResults();
		}
	});

	context.subscriptions.push(statusBarItem, quickPickCommand, searchCommand);
}

async function showLanguagePicker() {
	const languages = Object.keys(routes);

	if (languages.length === 0) {
		vscode.window.showErrorMessage("No languages configured in route.json");
		return;
	}

	const selected = await vscode.window.showQuickPick(languages, {
		placeHolder: "Select programming language",
		title: "🍂 Dependency Viewer - Select Language",
	});

	if (selected) {
		currentLanguage = selected;
		statusBarItem.text = `$(package) ${selected}`;
		vscode.window.showInformationMessage(`✅ Selected: ${selected}`);
		await searchAndShowResults();
	}
}

async function searchAndShowResults() {
	const query = await vscode.window.showInputBox({
		prompt: `Search ${currentLanguage} packages`,
		placeHolder: "e.g., spring-boot, react, django",
		title: "🍂 Search Package",
	});

	if (!query) return;

	await vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: `Searching "${query}" in ${currentLanguage}...`,
			cancellable: false,
		},
		async () => {
			try {
				const results = await searchPackages(currentLanguage, query);

				if (results.length === 0) {
					vscode.window.showInformationMessage("No packages found");
					return;
				}

				// Show results in QuickPick
				const items = results.map((pkg: any) => ({
					label: `$(symbol-package) ${pkg.name}`,
					description: `v${pkg.version}`,
					detail: pkg.description || "",
					package: pkg,
				}));

				const selected = await vscode.window.showQuickPick(items, {
					matchOnDescription: true,
					matchOnDetail: true,
					placeHolder: "Select package to copy",
					title: `📦 ${currentLanguage} Packages - "${query}"`,
				});

				if (selected) {
					await vscode.env.clipboard.writeText(selected.package.formatted);
					vscode.window.showInformationMessage(`📋 ${selected.package.name} copied to clipboard!`);
				}
			} catch (error) {
				vscode.window.showErrorMessage(`Search failed: ${error}`);
			}
		},
	);
}

async function searchPackages(language: string, query: string): Promise<any[]> {
	const languageRoutes = routes[language];
	if (!languageRoutes) return [];

	const results: any[] = [];

	for (const [repoName, config] of Object.entries(languageRoutes)) {
		try {
			const repoResults = await searchRepo(config as any, query);
			results.push(...repoResults);
		} catch (error) {
			console.error(`Error searching ${repoName}:`, error);
		}
	}

	return results;
}

async function searchRepo(config: any, query: string): Promise<any[]> {
	const baseUrl = config.searchUrl;
	const params = { ...config.params };

	// Replace ${query} in params
	Object.keys(params).forEach((key) => {
		if (typeof params[key] === "string") {
			params[key] = params[key].replace("${query}", query);
		}
	});

	// Build URL
	const url = new URL(baseUrl);
	Object.keys(params).forEach((key) => {
		url.searchParams.append(key, params[key]);
	});

	console.log("Searching URL:", url.toString());

	// Fetch data
	const response = await fetch(url.toString(), {
		headers: {
			"User-Agent": "VSCode-Dependency-Viewer/1.0",
			...(config.headers || {}),
		},
	});
	const data = await response.json();

	console.log("Response data:", JSON.stringify(data).substring(0, 500));

	// Parse response
	const { items, name, version, format } = config.parseResponse;

	// Navigate to items array
	let itemsArray: any = data;
	const itemPath = items.split(".");
	for (const key of itemPath) {
		itemsArray = itemsArray?.[key];
	}

	if (!Array.isArray(itemsArray)) {
		console.log("Items array not found, got:", typeof itemsArray);
		return [];
	}

	console.log(`Found ${itemsArray.length} items`);

	return itemsArray.map((item: any) => {
		// Get name
		let pkgName = item;
		for (const key of name) {
			pkgName = pkgName?.[key];
		}

		// Get version
		let pkgVersion = item;
		for (const key of version) {
			pkgVersion = pkgVersion?.[key];
		}

		// Format string with proper replacement
		let formatted = format;

		// Handle Maven/Gradle format with groupId/artifactId
		if (item.g && item.a) {
			// Maven artifact
			formatted = formatted
				.replace("{groupId}", item.g || "")
				.replace("{artifact}", item.a || "")
				.replace("{artifactId}", item.a || "")
				.replace("{version}", pkgVersion || "");
		} else if (pkgName && config.parseResponse.separator && pkgName.includes(config.parseResponse.separator)) {
			// Custom separator format
			const parts = pkgName.split(config.parseResponse.separator);
			formatted = formatted
				.replace("{groupId}", parts[0] || "")
				.replace("{artifact}", parts[1] || "")
				.replace("{artifactId}", parts[1] || "")
				.replace("{version}", pkgVersion || "");
		} else {
			// Simple format
			formatted = formatted.replace("{name}", pkgName || "").replace("{version}", pkgVersion || "");
		}

		return {
			name: pkgName || "Unknown",
			version: pkgVersion || "Unknown",
			description: item.description || item.summary || "",
			formatted: formatted,
		};
	});
}

export function deactivate() {}
