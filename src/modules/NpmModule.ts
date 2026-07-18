import * as vscode from "vscode";
import { BaseModule, RepositoryConfig } from "./BaseModule.js";

export class NpmModule extends BaseModule {
	constructor(context: vscode.ExtensionContext, config: RepositoryConfig) {
		super(context, config);
	}

	getIcon(): vscode.ThemeIcon {
		return new vscode.ThemeIcon("package");
	}
}
