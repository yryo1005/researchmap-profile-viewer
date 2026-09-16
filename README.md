# researchmap Profile Viewer

大学教員の [researchmap](https://researchmap.jp/) 公開プロフィールから、論文・発表・経歴・所属学会などの業績情報を自動的に取得して表示する、汎用の埋め込み用ページです。

CMSの「埋め込みHTML」欄に、iframeと対象教員の researchmap permalink だけを記入すれば、業績一覧ページが表示されます。**教員を追加・変更するたびに、このリポジトリを変更したり再デプロイしたりする必要はありません。**

## 仕組み

1. このリポジトリを GitHub Pages で公開すると、`https://yryo1005.github.io/researchmap-profile-viewer/` という1つの汎用ページができます。
2. CMS側のiframeで、このページのURLに `?permalink=<対象教員のpermalink>` というクエリパラメータを付けて埋め込みます。
3. ページ自身のJavaScriptが、ブラウザ上で直接 `https://api.researchmap.jp/<permalink>/...` にアクセスし、取得結果をその場で描画します。

researchmap の公開APIはCORS（`Access-Control-Allow-Origin: *`）を許可しているため、中継サーバーを介さずブラウザから直接データを取得できます。

## permalink の調べ方

対象教員のresearchmapのプロフィールURLの末尾部分がpermalinkです。

例：`https://researchmap.jp/arai_noriko` の場合、permalinkは `arai_noriko` です。

数字だけのURL（例：`https://researchmap.jp/7000012026`）の場合は、`7000012026` がpermalinkです。

## 教員1人分をCMSに追加する手順

1. [`cms-shell-template.html`](cms-shell-template.html) の内容をコピーする。
2. `<iframe>` タグの `data-permalink="{{PERMALINK}}"` の値を、対象教員のpermalinkに書き換える（**1箇所だけ**）。
3. `BASE_URL` は、すでにこのリポジトリのGitHub Pages URL（`https://yryo1005.github.io/researchmap-profile-viewer/`）に設定済みなので、通常は書き換え不要。
4. 完成したHTMLを、CMSの「埋め込みHTML」欄にそのまま貼り付ける。

これだけで、このリポジトリに一切手を加えることなく、新しい教員のページを追加できます。

`cms-shell-template.html` 内の `<script>` は、次の2つの役割を持っています。CMS側でHTML欄内の `<script>` 実行が許可されていない場合は、これらが動作せず、iframeの高さが固定のままになったり、目次リンクをクリックしても埋め込み先ページ自体はスクロールされなかったりします（本文の表示自体は行われます）。

- ページの高さをiframeに自動反映させる
- ページ上部の目次リンクをクリックしたときに、埋め込み先ページごとその位置までスクロールさせる

## 表示される情報

researchmapの公開APIから取得できる範囲で、以下を表示します（該当する情報が登録されていない項目は表示されません）。表示されている項目はページ上部の目次からクリックしてジャンプできます。

- 氏名・所属・職位・学位・研究キーワード
- 経歴 / 学歴
- 所属学会
- 論文 / 著書 / その他の業績（MISC）
- 講演・発表
- 競争的資金・研究課題
- 委員歴 / 受賞

表示内容はすべて researchmap から取得した事実のみで構成されており、このツール側で推測や補完は行っていません。researchmap側で情報を修正・追加すると、このページの表示も次回アクセス時に自動的に更新されます（このリポジトリ側にはデータのキャッシュや保存を一切行いません）。

## ローカルでの動作確認

ビルドツールは使用していない素のHTML/CSS/JavaScriptなので、任意の静的サーバーで確認できます。

```bash
# Python が使える場合
python3 -m http.server 8000

# Node.js が使える場合
npx serve .
```

ブラウザで `http://localhost:8000/?permalink=7000012026` のようにアクセスして確認してください。

## GitHub Pagesへのデプロイ

`main` ブランチへのpush時に、`.github/workflows/deploy.yml` により自動でGitHub Pagesへデプロイされます。

初回のみ、GitHubリポジトリの Settings → Pages → Build and deployment の Source を **GitHub Actions** に設定してください。

## 注意事項

- researchmapの公開APIは現時点では認証不要でアクセスできますが、将来的に仕様変更や認証必須化が行われる可能性があります。その場合、このページは業績情報を取得できずエラー表示になりますが、埋め込み先のCMSページ自体が壊れることはありません。
- 本ツールはAI R&D Centerのホームページ（別リポジトリ）とは独立したプロジェクトであり、依存関係もありません。
