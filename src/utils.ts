import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

export function loadRoutes(context: vscode.ExtensionContext): any {
	const routePath = path.join(context.extensionPath, "route.json");
	if (fs.existsSync(routePath)) {
		return JSON.parse(fs.readFileSync(routePath, "utf8"));
	}

	const distPath = path.join(context.extensionPath, "dist", "route.json");
	if (fs.existsSync(distPath)) {
		return JSON.parse(fs.readFileSync(distPath, "utf8"));
	}

	return {};
}
