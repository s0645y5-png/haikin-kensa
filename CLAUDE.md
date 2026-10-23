# 配筋検査アプリ（アプリ本体・公開リポジトリ）

監理者（構造）の配筋検査をスマホで行う Web アプリ。GitHub Pages で配布：https://s0645y5-png.github.io/haikin-kensa/

## 絶対に守ること
- **このリポジトリは公開（Public）。工事の情報を入れない**：図面・構造図・設計値・符号・工事名・データファイル（.json）・写真・検査記録は置かない。
  工事データは非公開リポジトリ `s0645y5-png/haikin-data` で扱う。
- 利用者の検査記録は各自の端末（IndexedDB）にある。保存形式（`toStore` / `fromStoreData`、部材の固有ID `種別|符号|位置`）を変えると記録が読めなくなるので、変える場合は旧形式も読めるようにする。
- データファイルの形式（`format: "haikin-data"`）を変えるときは、`haikin-data` 側の作成ツールも合わせて直す。

## 構成
- `index.html` … アプリ本体（1ファイル。画面・確認項目・保存・Excel書き出し・断面リストの窓）。**これを直接編集する**
- `sw.js` … オフライン用キャッシュ（画面はネット優先、Excel部品 ExcelJS 4.4.0 は CDN から取得して保存）
- `manifest.webmanifest`, `icon-*.png`, `apple-touch-icon.png` … ホーム画面追加用

## 部材種別と確認項目
`index.html` の `SPEC`：slab 耐圧盤 / beam 地中梁 / girder 大梁 / sbeam 小梁 / floor 床 / col 柱 / wall 壁。
現行の紙の帳票（監理者（構造）配筋検査帳票）の行構成に合わせている。

## 動作確認
- `python -m http.server 8766` で開き、スマホ幅（375px）で確認する。データファイルがないと最初の画面（データファイルを選ぶ）しか出ないので、
  確認用のデータは `haikin-data` から作ったものを手元で使う（このリポジトリには入れない）。
- 変更後は main に反映すると数分で GitHub Pages に出る。利用者は電波のある場所でアプリを開くと新しい版になる。

## コミット
- 日本語で簡潔に。末尾に `Co-Authored-By: Claude <noreply@anthropic.com>` などの共同作成者の行を付ける。
