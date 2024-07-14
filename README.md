# Simple Post SNS on VSCode

このVSCode拡張機能 "simple-post-sns" は、VSCode上からSNSへの投稿 (現状はMisskeyのみ) を可能にします。以下に、この拡張機能の主な機能と設定方法を説明します。

## Features

この拡張機能を使用すると、VSCodeのエディタ内から直接SNSへの投稿が可能になります。

### Post

たとえば下記の通りMarkdownに記入して、`Ctrl+Shift+P`でコマンドパレットを開いて`Simple Post SNS: Post with File`を選択すると、Misskeyに投稿されます。

```markdown
# test

aa

![Alt text](imgs/demo/image.png)

## config misskey

- cw: bb

##

demo
```

他の投稿方法として、選択範囲を指定して`Simple Post SNS: Post with Selection`を選択することで、選択範囲のみを投稿することも可能です。
- [ ] `Simple Post SNS: Post with Clipboard`

#### Title Content
各見出しの内容は、以下の通り解釈されます。

- `config misskey`: misskey投稿用の設定
- `visibility`に対する有効な値 (`public`, `home`, `followers`, `specified`): 投稿の公開範囲として解釈されたうえで、続きはPostとして投稿される
- その他および空白: 見出しの内容は無視されたうえで、続きの内容がPostとして投稿される

#### Title Depth

各見出しの深度は、以下の通り解釈されます。

- 見出しの深さが変わるごとに、投稿が切り替わる
- configは、その階層以下の続く投稿に対して有効
- [ ] level 3以上の見出しはlevel 2の見出しの連投として解釈される

### Config on Posting

#### Misskey

- Misskey投稿用の設定の既定は下記の通りです。
- 拡張機能の設定や投稿時の`config misskey`で設定を変更できます。

```ts
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
```

- 一部の項目には、以下のような制約があります。

```ts
const ALLOWED_KEYS: { [key: string]: string[] } = {
	visibility: ["public", "home", "followers", "specified"],
	reactionAcceptance: ["likeOnly", "likeOnlyForRemote", "nonSensitiveOnly", "nonSensitiveOnlyForRemote"],
};
```

## Install

vsixファイル~~または、VSCodeの拡張機能検索~~からインストールしてください。

## Conditions

この拡張機能を使用するには、VSCodeがインストールされていることが必要です。また、SNSへの投稿を行うためのアカウント情報およびそのサービスにおけるAPIトークンの取得が必要となります。

## Configuration of this Extension

この拡張機能の設定のうち、Misskey投稿時の設定を除いた内容は下記の通り。
- [ ] 詳細な説明の追加

```json
"simple_post_sns.misskey_token": {
  "type": "string",
  "description": "misskey token"
},
"simple_post_sns.misskey_folder_id": {
  "type": "string",
  "description": "misskey folder id"
},        
"simple_post_sns.misskey_image_name_rule": {
  "type": "string",
  "default": "{dt}_{name}{ext}",
  "description": "misskey image name rule if alt text is `Alt text`, {name}{ext} = {base}"
},
"simple_post_sns.file_name_rule": {
  "type": "string",
  "default": ".*",
  "description": "this extension only triggered when file name matches this rule"
},
"simple_post_sns.clean_always": {
  "type": "boolean",
  "default": false,
  "description": "clean text file or selection without after posting"
},
"simple_post_sns.clean_never": {
  "type": "boolean",
  "default": false,
  "description": "never clean text file or selection after posting"
}
```


## Future Work

- [ ] 連投の時間調整
- [x] optionの充実
- [ ] 投稿済みメッセージに追記
- [x] 投稿済みのclean
- [x] 選択して部分投稿
- [ ] preview?
- [x] ファイル名で絞り込み
- [ ] default tag
- [ ] README.mdの作成
- [ ] misskey REST APIのメモ
- [x] 構造体でrewrite
- [ ] post from clipboard
- [ ] 長文が自動分割される

## Release

### 0.1.0

- Misskeyへの投稿
- 画像の投稿
- 投稿後のclean
- 投稿時の設定調整
- 拡張機能の設定
