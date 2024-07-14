import * as vscode from 'vscode';
import axios, { AxiosRequestConfig, head } from 'axios';
import { format } from 'path';
import * as fs from 'fs';
import * as path from 'path';
import FormData from 'form-data';
// import { config } from 'process';
// import { isStringLiteral } from 'typescript';

const ALLOWED_KEYS: { [key: string]: string[] } = {
	visibility: ["public", "home", "followers", "specified"],
	reactionAcceptance: ["likeOnly", "likeOnlyForRemote", "nonSensitiveOnly", "nonSensitiveOnlyForRemote"],
};

const KEYS_INFO_FORMAT = {
	string_specified: ["visibility", "reactionAcceptance"],
	string: ["cw", "replyId", "renoteId", "channelId"],
	boolean: ["localOnly", "noExtractMentions", "noExtractHashtags", "noExtractEmojis"],
	array: ["visibleUserIds", "fileIds", "mediaIds"],
	object: ["poll"],
};
interface IPostBody {
	visibleUserIds?: string[];
	cw: string | null;
	localOnly: boolean;
	visibility: (typeof ALLOWED_KEYS.visibility)[number] | null;
	reactionAcceptance?: (typeof ALLOWED_KEYS.reactionAcceptance)[number] | null;
	// [key in (typeof KEYS_INFO_FORMAT.string)[number]]?: string | null;
	// [key in KEYS_INFO_FORMAT.boolean]?: boolean;
	// [key in KEYS_INFO_FORMAT.array]?: string[];
	// [key in KEYS_INFO_FORMAT.object]?: { [key: string]: any };
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

const POST_BODY_DEFAULT: IPostBody = {
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



const MISSKEY_INSTANCE = 'https://misskey.io'; // MisskeyインスタンスのURL
const CONF = vscode.workspace.getConfiguration("simple_post_sns");

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

const sleep = async (ms: number) => {
	return new Promise((resolve) => setTimeout(resolve, ms));
};

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



// const upload_image = async (image_alt: string, image_path: string, post_body_new: IPostBody, editor_path: string) => {
// 	const API_KEY = CONF.misskey_token;

// 	const headers = {
// 		"Content-Type": "multipart/form-data"
// 	};

// 	let file_path_new: string = ((image_alt === "Alt text") ? path.basename(image_path) : image_alt);
// 	if (image_alt === "Alt text") {
// 		file_path_new = getCurrentFormattedTime() + "_" + path.basename(image_path);
// 	} else if (image_alt === "!raw") {
// 		file_path_new = path.basename(image_path);
// 	} else if (image_alt === "!dt") {
// 		file_path_new = getCurrentFormattedTime() + path.extname(image_path);
// 	}
// 	console.log(file_path_new);
// 	const form = new FormData();
// 	form.append("file", fs.createReadStream(path.resolve(path.dirname(editor_path), image_path)));
// 	form.append('name', file_path_new);
// 	form.append("i", API_KEY);
// 	if (CONF.misskey_folder_id) {
// 		form.append("folderId", CONF.misskey_folder_id);
// 	}
// 	const response = await axios.post(
// 		`${MISSKEY_INSTANCE}/api/drive/files/create`, form, {
// 		headers: headers
// 	}
// 	);
// 	console.log('Upload successful:', response.data);
// 	const media_id = await response.data.id;
// 	if (!post_body_new.mediaIds) {
// 		post_body_new.mediaIds = [];
// 	}
// 	post_body_new.mediaIds.push(media_id);
// }

class PostSns {
	public editor: vscode.TextEditor | null = null;
	public text: string = "";
	public mode: string = "file";
	public parser: Parser;

	constructor(mode: string = "file", text: string = "") {
		if (vscode.window.activeTextEditor) {
			this.editor = vscode.window.activeTextEditor;
		}
		this.mode = mode;
		this.set_text(text);
		console.log(this.text);
		this.parser = new Parser(this);
	}

	get api_key(): string {
		return CONF.misskey_token;
	}

	public set_text(text: string = "") {
		if (!this.editor) {
			return text;
		}
		switch (this.mode) {
			case "file":
				return this.editor.document.getText();
			case "selection":
				const selections = this.editor.selections;
				return selections.map(
					selection => this.editor?.document.getText(selection)
				).join("\n");
			default:
				return text;
		}
	}

	public async upload_image(image_alt: string, image_path: string): Promise<string | null> {
		if (!this.editor) {
			return null;
		}
		const headers = {
			"Content-Type": "multipart/form-data"
		};

		let file_path_new: string;
		switch (image_alt) {
			case "Alt text":
				file_path_new = getCurrentFormattedTime() + "_" + path.basename(image_path);
				break;
			case "!raw":
				file_path_new = path.basename(image_path);
				break;
			case "!dt":
				file_path_new = getCurrentFormattedTime() + path.extname(image_path);
				break;
			default:
				file_path_new = image_alt;
				break;
		}

		const form = new FormData();
		form.append("file", fs.createReadStream(path.resolve(path.dirname(this.editor.document.uri.fsPath), image_path)));
		form.append('name', file_path_new);
		form.append("i", this.api_key);
		if (CONF.misskey_folder_id) {
			form.append("folderId", CONF.misskey_folder_id);
		}
		const response = await axios.post(
			`${MISSKEY_INSTANCE}/api/drive/files/create`, form, {
			headers: headers
		}
		);
		console.log('Upload successful:', response.data);
		return response.data.id;
		// const media_id = await response.data.id;
		// if (!post_body_new.mediaIds) {
		// 	post_body_new.mediaIds = [];
		// }
		// post_body_new.mediaIds.push(media_id);
	}
	private post_note = async (options_axios: AxiosRequestConfig) => {
		try {
			const response = await axios(options_axios);
			console.log('Note posted successfully');
			return response;
		} catch (error) {
			console.error('Error posting note:', error);
			return null;
		}
	}
	public post_to_sns = async () => {

		// const post_body_default_merged: IPostBody = Object.assign(POST_BODY_DEFAULT, CONF.misskey_post_default || {});
	
		await this.parser.parse_all();
	
		const headers = {
			Authorization: `Bearer ${this.api_key}`,
			'Content-Type': 'application/json',
		};
		for (const post_body of this.parser.arr_post_bodys) {
			const options_axios: AxiosRequestConfig = {
				url: `${MISSKEY_INSTANCE}/api/notes/create`,
				method: 'post',
				headers: headers,
				data: post_body,
			};
			this.post_note(options_axios);
			await sleep(5000);
		}
		vscode.window.showInformationMessage('Posted to Misskey!');
	
	};

}
const REGEXS_LINE_TYPE = {
	"title": /^(#+)\s*(.*?)\s*$/,
	"image": /^\s*!\[.*\]\(.*\)\s*$/,
	"comment": /^\s*<!--\s*(.*?)\s*-->\s*$/,
}

interface ILineInfo {
	type: string;
	content: string[];
}
class Parser {
	public postSns: PostSns;
	public line: string | void = "";
	private linePos: number = 0;
	public title_level: number = 1;
	public title_level_before: number = 1;
	public title: string = "";
	public title_linePos: number = 0;
	public configs_per_level: { [key: number]: IPostBody } = { 1: this.post_body_default };
	private arr_stack_text: string[] = [];
	public arr_post_bodys: IPostBody[] = [];
	private mode: string = "text";
	private post_body_new: IPostBody;

	constructor(postSns: PostSns) {
		this.postSns = postSns;
		this.post_body_new = structuredClone(this.post_body_default);
	}
	get post_body_default(): IPostBody {
		return Object.assign(
			POST_BODY_DEFAULT, CONF.misskey_post_default || {}
		);
	}
	private *line_generator(): Generator<string, void, unknown> {
		for (const line of this.postSns.text.split('\n')) {
			yield line;
		}
	}
	public next_line = (): string | void => {
		this.line = this.line_generator().next().value;
		this.linePos += 1;
		return this.line;
	}
	private judge_line_type = (): ILineInfo => {

		if (typeof this.line !== "string") {
			return {
				type: "end",
				content: [""],
			};
		}
		for (const [line_type, line_regex] of Object.entries(REGEXS_LINE_TYPE)) {
			const res = this.line.match(line_regex);
			if (!res) {
				continue;
			}
			return {
				type: line_type,
				content: res.slice(1),
			};
		}
		return {
			type: "text",
			content: [this.line],
		};
	}
	public parse_all = async () => {
		while (typeof this.next_line() === "string") {
			await this.parse_line();
		}
	}
	get arr_stack_text_valid(): string[] {
		return this.arr_stack_text.map(
			(v) => v.trim()
		).filter(
			(v) => v.length > 0
		);
	}

	private parse_line = async () => {
		if (typeof this.line !== "string") {
			return;
		}
		const line_info = this.judge_line_type();
		switch (line_info.type) {
			case "end":
				break;
			case "title":
				this.title_level_before = this.title_level;
				this.title_level = line_info.content[0].length;
				this.title = line_info.content[1];
				this.title_linePos = this.linePos;
				if (this.mode === "text") {
					if (this.arr_stack_text_valid.length > 0) {
						this.arr_post_bodys.push(
							Object.assign(
								this.post_body_new,
								{ text: this.arr_stack_text_valid.join("\n") }
							)
						);
					}
					this.arr_stack_text = [];
				}
				if (this.title_level < this.title_level_before) {
					for (let i = this.title_level_before; i > this.title_level; i--) {
						this.configs_per_level[i] = structuredClone(this.post_body_default);
					}
				}
				if (this.title === "config") {
					this.mode = "config";
					this.configs_per_level[this.title_level] = structuredClone(this.post_body_default);
					break;
				} else {
					if (!(String(this.title_level) in this.configs_per_level)) {
						this.configs_per_level[this.title_level] = structuredClone(
							Object.entries(this.configs_per_level
							).filter(([k, v]) => Number(k) < this.title_level
							).sort((a, b) => Number(a[0]) - Number(b[0])
							).slice(-1)[0][1]);
					}
					this.post_body_new = structuredClone(this.configs_per_level[this.title_level]);
					this.mode = "text";
					if (this.title.length > 0 && this.title in ALLOWED_KEYS.visibility) {
						this.post_body_new.visibility = this.title as (typeof ALLOWED_KEYS.visibility)[number];
					}
				}
				this.arr_stack_text = [];
				break;
			case "image":
				const res_image = line_info.content;
				if (!res_image) {
					break;
				}
				const image_alt = res_image[1];
				const image_path = res_image[2];
				try {
					const data_id = await this.postSns.upload_image(image_alt, image_path);
					if (!data_id) {
						break;
					}
					if (!this.post_body_new.mediaIds) {
						this.post_body_new.mediaIds = [];
					}
					this.post_body_new.mediaIds.push(data_id);
				} catch (error) {
					console.error('Error uploading image:', error);
				}
				break;
			case "comment":
				const str_content = line_info.content[0];
				console.log(str_content);
				break;
			default:
				if (this.mode === "config") {
					this.update_config(this.line, structuredClone(this.configs_per_level[this.title_level]));
				} else {
					this.arr_stack_text.push(this.line);
				}
				break;

		}
	}

	private update_config = (line: string, config_now: IPostBody): IPostBody => {
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

}


// const perse_text = async (text: string, post_body_default: IPostBody, editor_path: string): Promise<IPostBody[]> => {
// 	let arr_post_bodys: IPostBody[] = [];
// 	let arr_stack_text: string[] = [];
// 	let mode = "text";
// 	let configs_per_level: { [key: number]: IPostBody } = { 1: post_body_default };
// 	let title_level = 1;
// 	let post_body_new: IPostBody = structuredClone(post_body_default);
// 	for (const line of text.split('\n')) {
// 		const res_check_title = line.match(/^(#+)\s*/);
// 		if (res_check_title) {
// 			const str_title = line.replace(res_check_title[0], "");
// 			const title_level_before = title_level;
// 			title_level = res_check_title[1].length;
// 			// console.log(mode, title_level, str_title, arr_stack_text);
// 			if (mode === "text") {
// 				const arr_stack_text_valid = arr_stack_text.map(
// 					(v) => v.trim()
// 				).filter(
// 					(v) => v.length > 0
// 				);
// 				if (arr_stack_text_valid.length > 0) {
// 					arr_post_bodys.push(
// 						Object.assign(
// 							post_body_new,
// 							{ text: arr_stack_text_valid.join("\n") }
// 						)
// 					);
// 				}
// 				arr_stack_text = [];
// 			}
// 			if (title_level < title_level_before) {
// 				for (let i = title_level_before; i > title_level; i--) {
// 					configs_per_level[i] = structuredClone(post_body_default);
// 				}
// 			}
// 			if (str_title === "config") {
// 				mode = "config";
// 				configs_per_level[title_level] = structuredClone(post_body_default);
// 				continue;
// 			} else {
// 				if (!Object.keys(configs_per_level).includes(String(title_level))) {
// 					configs_per_level[title_level] = structuredClone(Object.entries(configs_per_level
// 					).filter(([k, v]) => Number(k) < title_level
// 					).sort((a, b) => Number(a[0]) - Number(b[0])
// 					).slice(-1)[0][1]);
// 				}
// 				post_body_new = structuredClone(configs_per_level[title_level]);
// 				if (str_title.length > 0 && str_title in ALLOWED_KEYS.visibility) {
// 					post_body_new.visibility = str_title as "public" | "home" | "followers" | "specified";
// 				}
// 				mode = "text";
// 			}
// 			arr_stack_text = [];
// 		} else if (line.match(/^\s*!\[.*\]\(.*\)\s*$/)) {
// 			const res_image = line.match(/^\s*!\[(.*)\]\((.*)\)\s*$/);
// 			if (!res_image) {
// 				continue;
// 			}
// 			const image_alt = res_image[1];
// 			const image_path = res_image[2];
// 			try {
// 				await upload_image(image_alt, image_path, post_body_new, editor_path);
// 			} catch (error) {
// 				console.error('Error uploading image:', error);
// 			}

// 		} else if (line.match(/^\s*<!--.*-->\s*$/)) {
// 			// コメント行をコメントとして認識
// 			const str_content = line.replace(/^\s*<!--(.*)-->\s*$/, "$1").trim();
// 			console.log(str_content);
// 		} else {
// 			if (mode === "config") {
// 				configs_per_level[title_level] = update_config(line, structuredClone(configs_per_level[title_level]));

// 			} else {
// 				arr_stack_text.push(line);
// 			}
// 		}
// 	}
// 	return arr_post_bodys;
// };

// const update_config = (line: string, config_now: IPostBody): IPostBody => {
// 	const res_check_config = line.match(/^-?\s*(\S[^:]+):\s*(\S.*)/);
// 	if (!res_check_config) {
// 		return config_now;
// 	}

// 	const key_config = res_check_config[1] as keyof IPostBody;
// 	const value_config = res_check_config[2];

// 	if (key_config in ALLOWED_KEYS) {
// 		if (!ALLOWED_KEYS[key_config]?.includes(value_config)) {
// 			return config_now;
// 		}
// 	}

// 	switch (key_config) {
// 		case "visibility":
// 			config_now[key_config] = value_config as "public" | "home" | "followers" | "specified" | null;
// 			break;
// 		case "reactionAcceptance":
// 			config_now[key_config] = value_config as "likeOnly" | "likeOnlyForRemote" | "nonSensitiveOnly" | "nonSensitiveOnlyForRemote" | null;
// 			break;
// 		case "cw":
// 		case "replyId":
// 		case "renoteId":
// 		case "channelId":
// 			config_now[key_config] = value_config;
// 			break;
// 		case "localOnly":
// 		case "noExtractMentions":
// 		case "noExtractHashtags":
// 		case "noExtractEmojis":
// 			config_now[key_config] = (value_config === "true");
// 			break;
// 		case "visibleUserIds":
// 			config_now[key_config] = value_config.split(",");
// 			break;
// 		case "poll":
// 			config_now[key_config] = JSON.parse(value_config);
// 			break;
// 		default:
// 			// 未知のキーは無視する
// 			break;
// 	}

// 	return config_now;
// };
// const post_to_sns = async (editor: vscode.TextEditor, text: string) => {

// 	const post_body_default_merged: IPostBody = Object.assign(POST_BODY_DEFAULT, CONF.misskey_post_default || {});

// 	const arr_post_bodys = perse_text(text, post_body_default_merged, editor.document.uri.fsPath);

// 	const API_KEY = CONF.misskey_token;

// 	const headers = {
// 		Authorization: `Bearer ${API_KEY}`,
// 		'Content-Type': 'application/json',
// 	};
// 	for (const post_body of await arr_post_bodys) {
// 		const options_axios: AxiosRequestConfig = {
// 			url: `${MISSKEY_INSTANCE}/api/notes/create`,
// 			method: 'post',
// 			headers: headers,
// 			data: post_body,
// 		};
// 		// console.log(options_axios);
// 		// console.log(API_KEY);
// 		postNote(options_axios);
// 		await sleep(5000);
// 	}
// 	vscode.window.showInformationMessage('Posted to Misskey!');

// };

export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "simple-post-bsky" is now active!');
	// post_to_sns();
	vscode.window.showInformationMessage('Do you want to proceed?', 'Yes', 'No').then(selection => {
		if (selection === 'Yes') {
			vscode.window.showInformationMessage('You clicked Yes!');
		} else {
			vscode.window.showInformationMessage('You clicked No!');
		}
	})
	vscode.window.showInformationMessage('Posted to Misskey!25');
	//Write to output.

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	// let arr_disposables = [];
	context.subscriptions.push(vscode.commands.registerCommand('simple-post-sns.post-to-sns', async () => {
		const editor = vscode.window.activeTextEditor;

		if (!editor || editor.document.languageId !== 'markdown') {
			vscode.window.showErrorMessage('No active Markdown editor found.');
			return;
		}
		const postSns = new PostSns("file");
		postSns.post_to_sns();
		// const document = editor.document;
		// const text = document.getText() + "\n#";
		// post_to_sns(editor, text);
	}));
	context.subscriptions.push(vscode.commands.registerCommand('simple-post-sns.post-to-sns-with-selection', async () => {
		const editor = vscode.window.activeTextEditor;

		if (!editor || editor.document.languageId !== 'markdown') {
			vscode.window.showErrorMessage('No active Markdown editor found.');
			return;
		}
		const postSns = new PostSns("selection");
		postSns.post_to_sns();

		// const selections = editor.selections;
		// const text = selections.map(selection => editor.document.getText(selection)).join("\n") + "\n#";

		// post_to_sns(editor, text);
	}));

	// context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() { }
