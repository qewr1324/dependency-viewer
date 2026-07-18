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

//#region src/extension.ts
let statusBarItem;
let currentLanguage = "";
let routes = {};
function activate(context) {
	console.log("🍂 Dependency Viewer activated");
	const routePath = path.join(context.extensionPath, "dist", "route.json");
	if (!fs.existsSync(routePath)) {
		const rootPath = path.join(context.extensionPath, "route.json");
		if (fs.existsSync(rootPath)) routes = JSON.parse(fs.readFileSync(rootPath, "utf8"));
	} else routes = JSON.parse(fs.readFileSync(routePath, "utf8"));
	statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	statusBarItem.text = "$(package) Dependency Viewer";
	statusBarItem.tooltip = "Search dependencies";
	statusBarItem.command = "dependencyManager.quickPick";
	statusBarItem.show();
	const quickPickCommand = vscode.commands.registerCommand("dependencyManager.quickPick", async () => {
		await showLanguagePicker();
	});
	const searchCommand = vscode.commands.registerCommand("dependencyManager.searchPackage", async () => {
		if (!currentLanguage) await showLanguagePicker();
		if (currentLanguage) await searchAndShowResults();
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
		title: "🍂 Dependency Viewer - Select Language"
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
		title: "🍂 Search Package"
	});
	if (!query) return;
	await vscode.window.withProgress({
		location: vscode.ProgressLocation.Notification,
		title: `Searching "${query}" in ${currentLanguage}...`,
		cancellable: false
	}, async () => {
		try {
			const results = await searchPackages(currentLanguage, query);
			if (results.length === 0) {
				vscode.window.showInformationMessage("No packages found");
				return;
			}
			const items = results.map((pkg) => ({
				label: `$(symbol-package) ${pkg.name}`,
				description: `v${pkg.version}`,
				detail: pkg.description || "",
				package: pkg
			}));
			const selected = await vscode.window.showQuickPick(items, {
				matchOnDescription: true,
				matchOnDetail: true,
				placeHolder: "Select package to copy",
				title: `📦 ${currentLanguage} Packages - "${query}"`
			});
			if (selected) {
				await vscode.env.clipboard.writeText(selected.package.formatted);
				vscode.window.showInformationMessage(`📋 ${selected.package.name} copied to clipboard!`);
			}
		} catch (error) {
			vscode.window.showErrorMessage(`Search failed: ${error}`);
		}
	});
}
async function searchPackages(language, query) {
	const languageRoutes = routes[language];
	if (!languageRoutes) return [];
	const results = [];
	for (const [repoName, config] of Object.entries(languageRoutes)) try {
		const repoResults = await searchRepo(config, query);
		results.push(...repoResults);
	} catch (error) {
		console.error(`Error searching ${repoName}:`, error);
	}
	return results;
}
async function searchRepo(config, query) {
	const baseUrl = config.searchUrl;
	const params = { ...config.params };
	Object.keys(params).forEach((key) => {
		if (typeof params[key] === "string") params[key] = params[key].replace("${query}", query);
	});
	const url = new URL(baseUrl);
	Object.keys(params).forEach((key) => {
		url.searchParams.append(key, params[key]);
	});
	console.log("Searching URL:", url.toString());
	const data = await (await fetch(url.toString(), { headers: {
		"User-Agent": "VSCode-Dependency-Viewer/1.0",
		...config.headers || {}
	} })).json();
	console.log("Response data:", JSON.stringify(data).substring(0, 500));
	const { items, name, version, format } = config.parseResponse;
	let itemsArray = data;
	const itemPath = items.split(".");
	for (const key of itemPath) itemsArray = itemsArray?.[key];
	if (!Array.isArray(itemsArray)) {
		console.log("Items array not found, got:", typeof itemsArray);
		return [];
	}
	console.log(`Found ${itemsArray.length} items`);
	return itemsArray.map((item) => {
		let pkgName = item;
		for (const key of name) pkgName = pkgName?.[key];
		let pkgVersion = item;
		for (const key of version) pkgVersion = pkgVersion?.[key];
		let formatted = format;
		if (item.g && item.a) formatted = formatted.replace("{groupId}", item.g || "").replace("{artifact}", item.a || "").replace("{artifactId}", item.a || "").replace("{version}", pkgVersion || "");
		else if (pkgName && config.parseResponse.separator && pkgName.includes(config.parseResponse.separator)) {
			const parts = pkgName.split(config.parseResponse.separator);
			formatted = formatted.replace("{groupId}", parts[0] || "").replace("{artifact}", parts[1] || "").replace("{artifactId}", parts[1] || "").replace("{version}", pkgVersion || "");
		} else formatted = formatted.replace("{name}", pkgName || "").replace("{version}", pkgVersion || "");
		return {
			name: pkgName || "Unknown",
			version: pkgVersion || "Unknown",
			description: item.description || item.summary || "",
			formatted
		};
	});
}
function deactivate() {}

//#endregion
exports.activate = activate;
exports.deactivate = deactivate;