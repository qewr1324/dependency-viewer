import * as https from "https";
import * as http from "http";

export class HttpClient {
	static async get(url: string, headers: any = {}): Promise<any> {
		return new Promise((resolve, reject) => {
			const client = url.startsWith("https") ? https : http;

			const options = {
				headers: {
					"User-Agent": "VSCode-Dependency-Manager/1.0",
					...headers,
				},
			};

			client
				.get(url, options, (res) => {
					let data = "";

					res.on("data", (chunk: string) => {
						data += chunk;
					});

					res.on("end", () => {
						try {
							const parsed = JSON.parse(data);
							resolve(parsed);
						} catch (e) {
							reject(new Error("Failed to parse response"));
						}
					});
				})
				.on("error", (error: Error) => {
					reject(error);
				});
		});
	}

	static buildUrl(baseUrl: string, params: any): string {
		const url = new URL(baseUrl);
		Object.keys(params).forEach((key) => {
			url.searchParams.append(key, params[key]);
		});
		return url.toString();
	}
}
