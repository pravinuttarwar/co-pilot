import lance from "vectordb";
import {
	ContextItem,
	ContextProviderDescription,
	ContextProviderExtras,
	ContextSubmenuItem,
	LoadSubmenuItemsArgs,
} from "../../";
import { getBasename } from "../../util";
import { getRemoteLanceDbPath } from "../../util/paths";
import { BaseContextProvider } from "../index.js";

const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_KEY = process.env.AWS_SECRET_KEY;

class RemoteCodebaseContextProvider extends BaseContextProvider {
	static description: ContextProviderDescription = {
		title: "remote-codebase",
		displayTitle: "Global",
		description: "Find relevant files a remote server",
		type: "submenu",
		dependsOnIndexing: true,
	};

	async getContextItems(
		query: string,
		extras: ContextProviderExtras,
	): Promise<ContextItem[]> {
		const { retrieveContextItemsFromRemoteLanceDb } = await import(
			"../retrieval/remoteRetrieval.js"
		);
		return retrieveContextItemsFromRemoteLanceDb(extras, this.options, query);
	}

	async loadSubmenuItems(
		args: LoadSubmenuItemsArgs,
	): Promise<ContextSubmenuItem[]> {
		const uri = getRemoteLanceDbPath();
		if (uri && AWS_SECRET_KEY && AWS_ACCESS_KEY_ID) {
			const lanceDb = await lance.connect({
				uri,
				awsRegion: "us-east-1",
				awsCredentials: {
					accessKeyId: AWS_ACCESS_KEY_ID,
					secretKey: AWS_SECRET_KEY,
				}
			});
			const existingLanceTables = await lanceDb.tableNames();
			return [{
				id: "all",
				title: "All remote projects",
				description: "",
			},...existingLanceTables.map((folder) => {
				return {
					id: folder,
					title: getBasename(folder),
					description: "",
				};
			})];
		}
		return [];
	}
}

export default RemoteCodebaseContextProvider;