// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import axios, { AxiosRequestConfig, head } from 'axios';
import { format } from 'path';
import * as fs from 'fs';
import * as path from 'path';
import FormData from 'form-data';
import { config } from 'process';

interface IPostBody {
	visibility: "public"| "home"| "followers"| "specified" | null;
	visibleUserIds?: string[];
	cw: string | null;
	localOnly: boolean;
	reactionAcceptance?: "likeOnly"| "likeOnlyForRemote"| "nonSensitiveOnly"| "nonSensitiveOnlyForRemote" | null;
	noExtractMentions?: boolean;
	noExtractHashtags?: boolean;
	noExtractEmojis?: boolean;
	replyId?: string | null;
	renoteId?: string | null;
	channelId?: string | null;
	text: string | null;
	fileIds?: string[];
	mediaIds?: string[];
	poll?: { [key: string]: any };
}

const ALLOWED_KEYS: { [key: string]: string[] } = {
	visibility: ["public", "home", "followers", "specified"],
	reactionAcceptance: ["likeOnly", "likeOnlyForRemote", "nonSensitiveOnly", "nonSensitiveOnlyForRemote"],
};

const MISSKEY_INSTANCE = 'https://misskey.io'; // MisskeyインスタンスのURL
const conf = vscode.workspace.getConfiguration("simple_post_sns");

function readBinaryFile(filePath: string): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		fs.readFile(filePath, (err, data) => {
			if (err) {
				reject(err);
			} else {
				resolve(data);
			}
		});
	});
}

const sleep = async(ms: number) => {
	return new Promise((resolve) => setTimeout(resolve, ms));
  }

const getCurrentFormattedTime = (): string => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day}T${hours}-${minutes}-${seconds}`;
};



async function postNote(options_axios: AxiosRequestConfig) {

	try {
		const response = await axios(options_axios);

		console.log('Note posted successfully');
	} catch (error) {
		console.error('Error posting note:', error);
	}
}

const perse_text = async (text: string, post_body_default: IPostBody, editor_path: string): Promise<IPostBody[]> => {
	let arr_post_bodys: IPostBody[] = [];
	let arr_stack_text: string[] = [];
	let mode = "text";
	let configs_per_level: { [key: number]: IPostBody } = { 1: post_body_default };
	let title_level = 1;
	let post_body_new: IPostBody = structuredClone(post_body_default);
	for (const line of text.split('\n')) {
		const res_check_title = line.match(/^(#+)\s*/);
		if (res_check_title) {
			const str_title = line.replace(res_check_title[0], "");
			const title_level_before = title_level;
			title_level = res_check_title[1].length;
			console.log(mode, title_level, str_title, arr_stack_text);
			if (mode === "text") {
				const arr_stack_text_valid = arr_stack_text.map(
					(v) => v.trim()
				).filter(
					(v) => v.length > 0
				);
				if (arr_stack_text_valid.length > 0) {
					arr_post_bodys.push(
						Object.assign(
							post_body_new,
							{ text: arr_stack_text_valid.join("\n") }
						)
					);
				}
				arr_stack_text = [];
			}
			if (title_level < title_level_before) {
				for (let i = title_level_before; i > title_level; i--) {
					configs_per_level[i] = structuredClone(post_body_default);
				}
			}
			if (str_title === "config") {
				mode = "config";
				configs_per_level[title_level] = structuredClone(post_body_default);
				continue;
			} else {
				if (!Object.keys(configs_per_level).includes(String(title_level))) {
					configs_per_level[title_level] = structuredClone(Object.entries(configs_per_level
					).filter(([k, v]) => Number(k) < title_level
					).sort((a, b) => Number(a[0]) - Number(b[0])
					).slice(-1)[0][1]);
				}
				post_body_new = structuredClone(configs_per_level[title_level]);
				if (str_title.length > 0 && str_title in ALLOWED_KEYS.visibility) {
					post_body_new.visibility = str_title as "public" | "home" | "followers" | "specified";
				}
				mode = "text";
			}
			arr_stack_text = [];

		} else if (line.match(/^\s*!\[.*\]\(.*\)\s*$/)) {
			const res_image = line.match(/^\s*!\[(.*)\]\((.*)\)\s*$/);
			console.log(res_image);
			if (!res_image) {
				continue;
			}
			const API_KEY = conf.misskey_token;

			const headers = {
				// Authorization: `Bearer ${API_KEY}`,
				"Content-Type": "multipart/form-data"
				// 'Content-Type': 'application/json',
			};
			const image_alt = res_image[1];
			const image_path = res_image[2];
			try {
				let file_path_new: string = ((image_alt === "Alt text") ? path.basename(image_path) : image_alt);
				if (image_alt === "Alt text") {
					file_path_new = getCurrentFormattedTime()+"_"+path.basename(image_path);
				} else if (image_alt === "!raw") {
					file_path_new = path.basename(image_path);
				} else if (image_alt === "!dt") {
					file_path_new = getCurrentFormattedTime() + path.extname(image_path);
				}
				console.log(file_path_new);
				const form = new FormData();
				form.append("file", fs.createReadStream(path.resolve(path.dirname(editor_path),image_path)));	
				form.append('name', file_path_new);
				form.append("i", API_KEY);
				if (conf.misskey_folder_id){
					form.append("folderId", conf.misskey_folder_id);
				}
				// console.log(API_KEY);
				// AxiosでPOSTリクエストを送信
				const response = await axios.post(
					`${MISSKEY_INSTANCE}/api/drive/files/create`, form, {
						headers: headers
					}
				);
				console.log('Upload successful:', response.data);
				const media_id = await response.data.id;
				console.log(media_id);
				if (!post_body_new.mediaIds) {
					post_body_new.mediaIds = [];
				}
				post_body_new.mediaIds.push(media_id);
			} catch (error) {
				console.error('Error uploading image:', error);
			}

			// readBinaryFile(image_path).then((data) => {
			// 	const options_axios: AxiosRequestConfig = {
			// 		url: `${MISSKEY_INSTANCE}/api/drive/files/create`,
			// 		method: 'post',
			// 		headers: headers,
			// 		data: data,
			// 		params: {fileName: data}

			// }).catch((err) => {
			// 	console.error(err);
			// });


		} else {
			if (mode === "config") {
				configs_per_level[title_level] = update_config(line, structuredClone(configs_per_level[title_level]));

			} else {
				arr_stack_text.push(line);
			}
		}
	}
	return arr_post_bodys;
};

const KEYS_INFO_FORMAT: { [key: string]: (keyof IPostBody)[] } = {
	string: ["visibility", "cw", "reactionAcceptance", "replyId", "renoteId", "channelId"],
	boolean: ["localOnly", "noExtractMentions", "noExtractHashtags", "noExtractEmojis"],
	array: ["visibleUserIds"],
	object: ["poll"],
};

const update_config = (line: string, config_now: IPostBody): IPostBody => {
	const res_check_config = line.match(/^-?\s*(\S[^:]+):\s*(\S.*)/);
	if (!res_check_config) {
		return config_now;
	}

	const key_config = res_check_config[1] as keyof IPostBody;
	const value_config = res_check_config[2];

	if (key_config in ALLOWED_KEYS) {
		if (!ALLOWED_KEYS[key_config]?.includes(value_config)) {
			return config_now;
		}
	}


	switch (key_config) {
		case "visibility":
			config_now[key_config] = value_config as "public" | "home" | "followers" | "specified" | null;
			break;
		case "reactionAcceptance":
			config_now[key_config] = value_config as "likeOnly" | "likeOnlyForRemote" | "nonSensitiveOnly" | "nonSensitiveOnlyForRemote" | null;
			break;
		case "cw":
		case "replyId":
		case "renoteId":
		case "channelId":
			config_now[key_config] = value_config;
			break;
		case "localOnly":
		case "noExtractMentions":
		case "noExtractHashtags":
		case "noExtractEmojis":
			config_now[key_config] = (value_config === "true");
			break;
		case "visibleUserIds":
			config_now[key_config] = value_config.split(",");
			break;
		case "poll":
			config_now[key_config] = JSON.parse(value_config);
			break;
		default:
			// 未知のキーは無視する
			break;
	}

	return config_now;
};
const post_to_sns = async () => {
	const editor = vscode.window.activeTextEditor;

	if (!editor || editor.document.languageId !== 'markdown') {
		vscode.window.showErrorMessage('No active Markdown editor found.');
		return;
	}
	const document = editor.document;
	const text = document.getText() + "\n#";

	const post_body_default: IPostBody = {
		visibility: 'specified',
		visibleUserIds: [],
		cw: null,
		localOnly: false,
		reactionAcceptance: null,
		noExtractMentions: false,
		noExtractHashtags: false,
		noExtractEmojis: false,
		replyId: null,
		renoteId: null,
		channelId: null,
		text: "There is something wrong with VSCode Ext.",
	};

	const post_body_default_merged: IPostBody = Object.assign(post_body_default, conf.misskey_post_default || {});

	const arr_post_bodys = perse_text(text, post_body_default_merged, editor.document.uri.fsPath);



	// コンソールにMarkdownファイルの内容を出力
	// console.log(arr_post_bodys);
	console.log(arr_post_bodys);

	// 必要に応じて、VSCodeのメッセージウィンドウに内容を表示することもできます
	vscode.window.showInformationMessage('Markdown content read successfully!');

	// const API_KEY = process.env.MISSKEY_TOKEN; // あなたのAPIキーを設定
	const API_KEY = conf.misskey_token;

	const headers = {
		Authorization: `Bearer ${API_KEY}`,
		'Content-Type': 'application/json',
	};
	for (const post_body of await arr_post_bodys) {
		const options_axios: AxiosRequestConfig = {
			url: `${MISSKEY_INSTANCE}/api/notes/create`,
			method: 'post',
			headers: headers,
			data: post_body,
		};
		// console.log(options_axios);
		// console.log(API_KEY);
		postNote(options_axios);
		await sleep(300);
	}
	// const options_axios: AxiosRequestConfig = {
	// 	url: `${MISSKEY_INSTANCE}/api/notes/create`,
	// 	method: 'post',
	// 	headers: headers,
	// 	data: post_body,
	// };
	// // console.log(options_axios);
	// console.log(API_KEY);
	// await postNote(options_axios);
	vscode.window.showInformationMessage('Posted to Misskey!');

};

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "simple-post-bsky" is now active!');
	post_to_sns();
	vscode.window.showInformationMessage('Posted to Misskey!25');
	//Write to output.

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('simple-post-sns.postToSns', async () => {
		;
		post_to_sns();

	});

	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() { }
