import * as vscode from "vscode";
import { HttpClient } from "../utils/httpClient.js";

export interface PackageInfo {
	name: string;
	version: string;
	description?: string;
	formattedString: string;
	raw: any;
}

export interface RepositoryConfig {
	name: string;
	icon: string;
	searchUrl: string;
	params: any;
	headers?: any;
	parseResponse: {
		items: string;
		name: string[];
		separator?: string;
		version: string[];
		format: string;
	};
}

export abstract class BaseModule {
	protected context: vscode.ExtensionContext;
	protected config: RepositoryConfig;

	constructor(context: vscode.ExtensionContext, config: RepositoryConfig) {
		this.context = context;
		this.config = config;
	}

	abstract getIcon(): vscode.ThemeIcon;

	async search(query: string): Promise<PackageInfo[]> {
		try {
			const params = this.buildParams(query);
			const url = HttpClient.buildUrl(this.config.searchUrl, params);

			const response = await HttpClient.get(url, this.config.headers || {});
			return this.parseResponse(response);
		} catch (error) {
			console.error(`Search error in ${this.config.name}:`, error);
			throw error;
		}
	}

	protected buildParams(query: string): any {
		const params: any = {};
		Object.keys(this.config.params).forEach((key) => {
			const value = this.config.params[key];
			params[key] = value.replace("${query}", query);
		});
		return params;
	}

	protected parseResponse(response: any): PackageInfo[] {
		const { items, name, version, format, separator } = this.config.parseResponse;

		// Navigate nested path
		const itemsPath = items.split(".");
		let results = response;
		itemsPath.forEach((path) => {
			results = results?.[path];
		});

		if (!results || !Array.isArray(results)) {
			return [];
		}

		return results.map((item: any) => {
			// Get name from nested path
			let packageName = item;
			name.forEach((key) => {
				packageName = packageName?.[key];
			});
			packageName = packageName || "Unknown";

			// Get version from nested path
			let packageVersion = item;
			version.forEach((key) => {
				packageVersion = packageVersion?.[key];
			});
			packageVersion = packageVersion || "Unknown";

			// Format the string
			const formattedString = this.formatString(format, item, packageName, packageVersion, separator);

			return {
				name: packageName,
				version: packageVersion,
				description: item.description || item.summary || "",
				formattedString,
				raw: item,
			};
		});
	}

	protected formatString(format: string, item: any, name: string, version: string, separator?: string): string {
		let result = format.replace(/\{name\}/g, name).replace(/\{version\}/g, version);

		// Handle Maven-specific format
		if (separator && name.includes(separator)) {
			const parts = name.split(separator);
			result = result.replace(/\{groupId\}/g, parts[0] || "").replace(/\{artifactId\}/g, parts[1] || "");
		}

		return result;
	}

	getRepositoryName(): string {
		return this.config.name;
	}
}
