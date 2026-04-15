-- Seed a set of Anthropic-published reference skills into the marketplace so
-- the default view isn't empty. Each entry ships a short SKILL.md stub; teams
-- can fork/customize later via publish flow. Descriptions are original prose.
--
-- Skills stored as bytea require a non-empty blob; we inline minimal SKILL.md
-- placeholders. Real content is typically loaded at profile mount time.

-- Ensure an "official" author user exists so foreign key holds up.
INSERT INTO users (id, email, display_name, role)
VALUES (
  '00000000-0000-0000-0000-000000000010',
  'official@anthropic.skills',
  'Anthropic 公式',
  'admin'
)
ON CONFLICT (email) DO NOTHING;

-- Helper function style: insert with conflict-free idempotency via slug+version.
INSERT INTO skills (
  slug, version, author_id, title, description, content, content_sha256,
  status, category, install_count, reviewed_at
)
VALUES
  (
    'pdf',
    '0.1.0',
    '00000000-0000-0000-0000-000000000010',
    'PDF 読み取り / 生成',
    'PDF ファイルを読み込んでテキスト・表・画像を抽出したり、テンプレートから PDF を生成したりする公式スキル。レポート配布、契約書レビュー、数値転記などに。',
    convert_to('---\nname: pdf\ndescription: PDF の読み取り・生成を行う公式スキル\n---\n', 'UTF8'),
    'seed-pdf',
    'published', 'analysis', 0, now()
  ),
  (
    'xlsx',
    '0.1.0',
    '00000000-0000-0000-0000-000000000010',
    'Excel / スプレッドシート操作',
    'xlsx を読み込んでセルの値や数式を解析し、集計・グラフ化・別シートへの転記を自動化する公式スキル。月次レポート作成や大量ファイル突合に適しています。',
    convert_to('---\nname: xlsx\ndescription: Excel ファイルの読み書きを行う公式スキル\n---\n', 'UTF8'),
    'seed-xlsx',
    'published', 'analysis', 0, now()
  ),
  (
    'docx',
    '0.1.0',
    '00000000-0000-0000-0000-000000000010',
    'Word ドキュメント編集',
    '.docx ファイルに対して章立ての追加・置換・スタイル適用を行う公式スキル。議事録テンプレート展開、契約書の差し替え、社内規程の一括リビジョンに。',
    convert_to('---\nname: docx\ndescription: Word 文書の編集を行う公式スキル\n---\n', 'UTF8'),
    'seed-docx',
    'published', 'writing', 0, now()
  ),
  (
    'pptx',
    '0.1.0',
    '00000000-0000-0000-0000-000000000010',
    'PowerPoint スライド作成',
    '構造化された下書きからスライドを生成し、既存 pptx の改稿を行う公式スキル。週次定例資料、顧客向け提案書の初稿作成に。',
    convert_to('---\nname: pptx\ndescription: PowerPoint を生成・編集する公式スキル\n---\n', 'UTF8'),
    'seed-pptx',
    'published', 'writing', 0, now()
  ),
  (
    'mcp-builder',
    '0.1.0',
    '00000000-0000-0000-0000-000000000010',
    'MCP サーバー作成アシスタント',
    '社内ツールを MCP サーバー化する際の設計・実装ガイドラインをまとめた公式スキル。エンドポイント洗い出し、権限設計、テスト観点を順に支援します。',
    convert_to('---\nname: mcp-builder\ndescription: MCP サーバーの設計・実装を支援する公式スキル\n---\n', 'UTF8'),
    'seed-mcp-builder',
    'published', 'integration', 0, now()
  ),
  (
    'artifacts-builder',
    '0.1.0',
    '00000000-0000-0000-0000-000000000010',
    'Web Artifact 生成',
    'シングルページの React アプリや可視化ダッシュボードを即席で構築する公式スキル。デモ、社内ツールのプロトタイプに。',
    convert_to('---\nname: artifacts-builder\ndescription: Web アーティファクトを生成する公式スキル\n---\n', 'UTF8'),
    'seed-artifacts-builder',
    'published', 'workflow', 0, now()
  ),
  (
    'memory',
    '0.1.0',
    '00000000-0000-0000-0000-000000000010',
    'ファイルベース記憶',
    'プロジェクトディレクトリに Markdown で知識を蓄積し、次回以降のセッションで再利用する公式スキル。議事録の継承・継続タスクに。',
    convert_to('---\nname: memory\ndescription: セッションをまたぐ記憶を管理する公式スキル\n---\n', 'UTF8'),
    'seed-memory',
    'published', 'workflow', 0, now()
  )
ON CONFLICT (slug, version) DO NOTHING;
