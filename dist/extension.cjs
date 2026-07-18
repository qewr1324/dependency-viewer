//#region rolldown:runtime
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") {
		for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
			key = keys[i];
			if (!__hasOwnProp.call(to, key) && key !== except) {
				__defProp(to, key, {
					get: ((k) => from[k]).bind(null, key),
					enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
				});
			}
		}
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));

//#endregion
let vscode = require("vscode");
vscode = __toESM(vscode);
let path = require("path");
path = __toESM(path);
let fs = require("fs");
fs = __toESM(fs);

//#region src/utils.ts
function loadRoutes(context) {
	const routePath = path.join(context.extensionPath, "route.json");
	if (fs.existsSync(routePath)) return JSON.parse(fs.readFileSync(routePath, "utf8"));
	const distPath = path.join(context.extensionPath, "dist", "route.json");
	if (fs.existsSync(distPath)) return JSON.parse(fs.readFileSync(distPath, "utf8"));
	return {};
}

//#endregion
//#region src/searchHandlers.ts
async function handleSearch(routes, language, query) {
	const languageRoutes = routes[language];
	if (!languageRoutes) return [];
	const results = [];
	for (const [repoName, config] of Object.entries(languageRoutes)) try {
		const repoResults = await searchRepo(config, query, repoName);
		results.push(...repoResults);
	} catch (error) {
		console.error(`Error searching ${repoName}:`, error);
		vscode.window.showErrorMessage(`Error searching ${repoName}: ${error}`);
	}
	return results.filter((item, index, self) => index === self.findIndex((t) => t.name === item.name && t.version === item.version));
}
async function searchRepo(config, query, repoName) {
	try {
		await new Promise((resolve) => setTimeout(resolve, 200));
		if (repoName === "rubygems") return await searchRubyGems(query, config);
		const params = { ...config.params };
		Object.keys(params).forEach((key) => {
			if (typeof params[key] === "string") params[key] = params[key].replace("${query}", encodeURIComponent(query));
		});
		const urlObj = new URL(config.searchUrl);
		Object.keys(params).forEach((key) => urlObj.searchParams.append(key, params[key]));
		const url = urlObj.toString();
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 1e4);
		const response = await fetch(url, {
			headers: {
				"User-Agent": "VSCode-Dependency-Viewer/1.0",
				...config.headers || {}
			},
			signal: controller.signal
		});
		clearTimeout(timeoutId);
		if (!response.ok) {
			console.error(`HTTP error ${response.status}: ${response.statusText}`);
			return [];
		}
		return parseResults(await response.json(), config, repoName);
	} catch (error) {
		if (error instanceof Error) if (error.name === "AbortError") {
			console.error(`Request timeout for ${repoName}`);
			vscode.window.showWarningMessage(`Timeout searching ${repoName}`);
		} else console.error(`Error in searchRepo for ${repoName}:`, error);
		return [];
	}
}
async function searchRubyGems(query, config) {
	try {
		const url = `https://rubygems.org/api/v1/search.json?query=${encodeURIComponent(query)}`;
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 1e4);
		const response = await fetch(url, {
			headers: {
				"User-Agent": "VSCode-Dependency-Viewer/1.0",
				Accept: "application/json"
			},
			signal: controller.signal
		});
		clearTimeout(timeoutId);
		if (!response.ok) return [];
		return (await response.json()).slice(0, 20).map((item) => {
			const pkgName = item.name || "unknown";
			const pkgVersion = item.version || "unknown";
			const formatted = config.parseResponse.format.replace(/\{name\}/g, pkgName).replace(/\{version\}/g, pkgVersion);
			return {
				name: pkgName,
				version: pkgVersion,
				description: item.info || item.description || "",
				formatted,
				repoName: config.name || "RubyGems"
			};
		});
	} catch (error) {
		if (error instanceof Error && error.name === "AbortError") {
			console.error("RubyGems request timeout");
			vscode.window.showWarningMessage("Timeout searching RubyGems");
		} else console.error("RubyGems search error:", error);
		return [];
	}
}
function buildMavenOutput(item, repoName) {
	const groupId = item.g || item.groupId || "unknown";
	const artifactId = item.a || item.artifactId || "unknown";
	const version = item.latestVersion || item.version || "unknown";
	const name = groupId + ":" + artifactId;
	const isBom = (item.p || "").toLowerCase() === "pom";
	let formatted = "";
	switch (repoName) {
		case "maven":
			formatted = "<dependency>\n";
			formatted += `    <groupId>${groupId}</groupId>\n`;
			formatted += `    <artifactId>${artifactId}</artifactId>\n`;
			formatted += `    <version>${version}</version>\n`;
			if (isBom) formatted += `    <type>pom</type>\n`;
			formatted += "</dependency>";
			break;
		case "maven-kotlin":
			if (isBom) formatted = `implementation(platform("${groupId}:${artifactId}:${version}"))`;
			else formatted = `implementation("${groupId}:${artifactId}:${version}")`;
			break;
		case "maven-groovy":
			if (isBom) formatted = `implementation platform("${groupId}:${artifactId}:${version}")`;
			else formatted = `implementation '${groupId}:${artifactId}:${version}'`;
			break;
		default:
			formatted = "<dependency>\n";
			formatted += `    <groupId>${groupId}</groupId>\n`;
			formatted += `    <artifactId>${artifactId}</artifactId>\n`;
			formatted += `    <version>${version}</version>\n`;
			if (isBom) formatted += `    <type>pom</type>\n`;
			formatted += "</dependency>";
	}
	return {
		name,
		version,
		formatted
	};
}
function parseResults(data, config, repoName) {
	const { items, version, format } = config.parseResponse;
	let itemsArray = data;
	const itemPath = items.split(".");
	for (const key of itemPath) itemsArray = itemsArray?.[key];
	if (!Array.isArray(itemsArray)) return [];
	return itemsArray.map((item) => {
		let pkgVersion = "Unknown";
		let temp = item;
		for (const key of version) temp = temp?.[key];
		pkgVersion = temp || "Unknown";
		let pkgName = "";
		let formatted = "";
		if (repoName === "maven" || repoName === "maven-kotlin" || repoName === "maven-groovy") {
			const result = buildMavenOutput(item, repoName);
			pkgName = result.name;
			pkgVersion = result.version;
			formatted = result.formatted;
		} else if (repoName === "nuget") {
			pkgName = item.id || item.title || "unknown";
			formatted = format.replace(/\{name\}/g, pkgName).replace(/\{version\}/g, pkgVersion);
		} else if (repoName === "npm" || repoName === "npm-types") {
			pkgName = item.package?.name || item.name || "unknown";
			formatted = format.replace(/\{name\}/g, pkgName).replace(/\{version\}/g, pkgVersion);
		} else if (repoName === "crates") {
			pkgName = item.name || item.id || "unknown";
			pkgVersion = item.max_version || item.version || "unknown";
			formatted = format.replace(/\{name\}/g, pkgName).replace(/\{version\}/g, pkgVersion);
		} else if (repoName === "rubygems") {
			pkgName = item.name || "unknown";
			formatted = format.replace(/\{name\}/g, pkgName).replace(/\{version\}/g, pkgVersion);
		} else {
			pkgName = item.name || item.id || "unknown";
			formatted = format.replace(/\{name\}/g, pkgName).replace(/\{version\}/g, pkgVersion);
		}
		return {
			name: pkgName,
			version: pkgVersion,
			description: item.description || item.summary || item.info || item.title || "",
			formatted,
			repoName: config.name || repoName
		};
	});
}

//#endregion
//#region src/DependencyPanel.ts
var DependencyPanel = class DependencyPanel {
	static currentPanel;
	_panel;
	_context;
	_disposables = [];
	static routes = {};
	static createOrShow(context) {
		const column = vscode.ViewColumn.Active;
		if (DependencyPanel.currentPanel) {
			DependencyPanel.currentPanel._panel.reveal(column);
			return;
		}
		DependencyPanel.routes = loadRoutes(context);
		DependencyPanel.currentPanel = new DependencyPanel(vscode.window.createWebviewPanel("dependencyViewer", "🍂 Dependency Viewer", column, {
			enableScripts: true,
			retainContextWhenHidden: true,
			localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "dist", "panel")]
		}), context);
	}
	constructor(panel, context) {
		this._panel = panel;
		this._context = context;
		this._loadWebviewContent();
		this._setupMessageHandlers();
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
	}
	_loadWebviewContent() {
		const htmlPath = path.join(this._context.extensionPath, "dist", "panel", "webview.html");
		const cssPath = path.join(this._context.extensionPath, "dist", "panel", "styles.css");
		const jsPath = path.join(this._context.extensionPath, "dist", "panel", "main.js");
		if (!fs.existsSync(htmlPath)) {
			vscode.window.showErrorMessage(`HTML file not found at: ${htmlPath}`);
			return;
		}
		const cssUri = this._panel.webview.asWebviewUri(vscode.Uri.file(cssPath));
		const jsUri = this._panel.webview.asWebviewUri(vscode.Uri.file(jsPath));
		let html = fs.readFileSync(htmlPath, "utf8");
		html = html.replace("${STYLES_CSS}", cssUri.toString());
		html = html.replace("${MAIN_JS}", jsUri.toString());
		this._panel.webview.html = html;
	}
	_setupMessageHandlers() {
		this._panel.webview.onDidReceiveMessage(async (message) => {
			switch (message.command) {
				case "getLanguages":
					this._panel.webview.postMessage({
						command: "setLanguages",
						languages: Object.keys(DependencyPanel.routes)
					});
					break;
				case "search":
					try {
						const results = await handleSearch(DependencyPanel.routes, message.language, message.query);
						this._panel.webview.postMessage({
							command: "searchResults",
							results
						});
					} catch (error) {
						this._panel.webview.postMessage({
							command: "searchError",
							error: String(error)
						});
					}
					break;
				case "copyToClipboard":
					await vscode.env.clipboard.writeText(message.text);
					break;
				case "close":
					this._panel.dispose();
					break;
			}
		}, null, this._disposables);
	}
	dispose() {
		DependencyPanel.currentPanel = void 0;
		this._panel.dispose();
		while (this._disposables.length) this._disposables.pop()?.dispose();
	}
};

//#endregion
//#region src/extension.ts
let statusBarItem;
function activate(context) {
	console.log("🍂 Dependency Viewer activated");
	statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
	statusBarItem.text = "$(circuit-board) DV";
	statusBarItem.tooltip = "Search and add dependencies";
	statusBarItem.command = "dependencyManager.openPanel";
	statusBarItem.show();
	const openPanelCommand = vscode.commands.registerCommand("dependencyManager.openPanel", () => {
		DependencyPanel.createOrShow(context);
	});
	context.subscriptions.push(statusBarItem, openPanelCommand);
}
function deactivate() {}

//#endregion
exports.activate = activate;
exports.deactivate = deactivate;