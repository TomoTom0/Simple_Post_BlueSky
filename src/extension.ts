import * as vscode from 'vscode';
import axios, { AxiosRequestConfig, head } from 'axios';
// import { format } from 'path';
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

class PostSns {
	public editor: vscode.TextEditor;
	public text: string = "";
	public mode: string = "file";
	public parser: Parser;

	constructor(mode: string = "file", editor: vscode.TextEditor, text: string = "") {
		this.editor = editor;
		this.mode = mode;
		this.set_text(text);
		this.parser = new Parser(this);
	}

	get api_key(): string {
		return CONF.misskey_token;
	}

	public set_text = async (text: string = "") => {
		if (!this.editor) {
			this.text = text;
			return;
		}
		switch (this.mode) {
			case "file":
				this.text = this.editor.document.getText();
				break;
			case "selection":
				const selections = this.editor.selections;
				this.text = selections.map(
					selection => this.editor?.document.getText(selection)
				).join("\n");
				break;
			case "clipboard":
				this.text = await vscode.env.clipboard.readText();
				break;
			default:
				this.text = text;
				break;
		}
	};

	public async upload_image(image_alt: string, image_path: string): Promise<string | null> {
		if (!this.editor) {
			return null;
		}
		const headers = {
			"Content-Type": "multipart/form-data"
		};

		let file_path_new: string = (image_alt === "alt text") ? CONF.misskey_image_name_rule : image_alt;
		file_path_new = file_path_new.replace(
			/\{dt\}/, getCurrentFormattedTime()
		).replace(
			/\{name\}/, path.parse(image_path).name
		).replace(
			/\{ext\}/, path.parse(image_path).ext
		).replace(
			/\{base\}/, path.basename(image_path)
		).replace(
			/\{dir\}/, path.basename(path.dirname(image_path))
		);

		const form = new FormData();
		form.append("file", fs.createReadStream(
			path.resolve(
				path.dirname(this.editor.document.uri.fsPath), image_path)));
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
	};

	public post_to_sns = async () => {
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
			await this.post_note(options_axios);
			await sleep(5000);
		}
		this.confirm_clean_text();
	};
	private clean_text = () => {
		switch (this.mode) {
			case "selection":
				this.editor?.edit(editBuilder => {
					this.editor?.selections.forEach(selection => {
						editBuilder.replace(selection, '');
					});
				});
				break;
			case "file":
				this.editor?.edit(editBuilder => {
					editBuilder.replace(
						new vscode.Range(
							new vscode.Position(0, 0),
							new vscode.Position(this.editor.document.lineCount, 0)
						),
						''
					);
				});
				break;
		};
	};
	public confirm_clean_text = () => {
		if (CONF.clean_never) { return; }
		if (CONF.clean_always) { return this.clean_text(); }
		vscode.window.showInformationMessage('Do you want to clean editor about posts?', 'Yes', 'No').then(selection => {
			if (selection === 'Yes') {
				this.clean_text();
				removeMessage(vscode.window.showInformationMessage('Simple Post SNS: Cleaned'));
			} else {
				removeMessage(vscode.window.showInformationMessage('Simple Post SNS: Bye'));
			}
		});
	};
}

const removeMessage = (message: Thenable<string | undefined>, ms: number = 5000) => {
	setTimeout(() => {
		message.then(() => { });
	}, ms);
};

const REGEXS_LINE_TYPE = {
	"title": /^(#+)\s*(.*?)\s*$/,
	"image": /^\s*!\[(.*)\]\((.*)\)\s*$/,
	"comment": /^\s*<!--\s*(.*?)\s*-->\s*$/,
};

interface ILineInfo {
	type: string;
	content: string[];
}
class Parser {
	public postSns: PostSns;
	public line: string = "";
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
		for (const line of (this.postSns.text + "\n#").split('\n')) {
			this.linePos += 1;
			this.line = line;
			yield line;
		}
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
	};
	public parse_all = async () => {
		for (const _line of this.line_generator()) {
			await this.parse_line();
		}
	};
	get arr_stack_text_valid(): string[] {
		return this.arr_stack_text.map(
			(v) => v.trim()
		).filter(
			(v) => v.length > 0
		);
	}

	private parse_line = async () => {
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
				if (this.title === "config misskey") {
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
					if (this.title.length > 0 && ALLOWED_KEYS.visibility.indexOf(this.title)!==-1) {
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
				const image_alt = res_image[0];
				const image_path = res_image[1];
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
					this.update_config(this.line, this.configs_per_level[this.title_level]);
				} else {
					this.arr_stack_text.push(this.line);
				}
				break; 

		}
	};

	private update_config = (line: string, config_now: IPostBody): IPostBody => {
		const res_check_config = line.match(/^-?\s*(\S[^:]+):\s*(.*)/);
		if (!res_check_config) {
			return config_now;
		}

		const key_config = res_check_config[1].trim() as keyof IPostBody;
		const value_config = res_check_config[2].trim();

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

export function activate(context: vscode.ExtensionContext) {

	const main_post_sns = async (mode: string = "file") => {
		const editor = vscode.window.activeTextEditor;
		if (!editor || editor.document.languageId !== 'markdown') {
			vscode.window.showErrorMessage('No active Markdown editor found.');
			return;
		}
		if (!editor.document.fileName.match(RegExp(CONF.file_name_rule))){
			return;
		}
		const postSns = new PostSns(mode, editor);
		postSns.post_to_sns();
		removeMessage(vscode.window.showInformationMessage('Simple Post SNS: Posted'));
	};

	context.subscriptions.push(vscode.commands.registerCommand(
		'simple-post-sns.post-to-sns', async () => {
			main_post_sns("file");
		}
	));
	context.subscriptions.push(vscode.commands.registerCommand(
		'simple-post-sns.post-to-sns-with-selection', async () => {
			main_post_sns("selection");
		}
	));
	context.subscriptions.push(vscode.commands.registerCommand(
		'simple-post-sns.post-to-sns-with-clipboard', async () => {
			main_post_sns("clipboard");
		}
	));

}

export function deactivate() { }
