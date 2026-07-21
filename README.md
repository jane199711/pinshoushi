# 拼首诗

一个拼贴诗歌创作 Web 应用——选择主题，词语如雪花飘落，拖拽拼贴成诗，一键生成完整诗句，导出海报送给 TA。

## 功能亮点

- **飘落设计**：词条如雪片从画布顶部飘落，自动避让已固定的词语和文本框，左右均衡分布
- **一键成诗**：基于已固定的词语作为种子，自动生成一首语义通顺、通俗易懂的六行短诗，并整体排布到画布
- **真实诗人灵魂注入**：六大主题各对应一位真实诗人（汪国真 / 骆一禾 / 张枣 / 舒婷 / 郑愁予 / 穆旦），词库按诗人语感定制，每首诗最多融入一句诗人标志性句式

## 六大主题

| 主题 | 诗人 | 风格 |
| --- | --- | --- |
| 生日 | 骆一禾 | 沉毅炽热，歌颂光、火、生命 |
| 纪念日 | 张枣 | 平静含蓄，时间流淌中捕捉永恒 |
| 告白 | 舒婷 | 独立深刻，平等并肩、根叶相触 |
| 感谢 | 汪国真 | 温暖真挚，富含哲理 |
| 思念 | 郑愁予 | 意象鲜明，岛与海，古典与现代交融 |
| 自由 | 穆旦 | 思辨坦诚，肯定肉体、自由与生命 |

## 技术栈

- **框架**：React 19 + TanStack Start（SSR）
- **构建**：Vite 8 + Nitro
- **样式**：Tailwind CSS v4
- **语言**：TypeScript
- **导出**：html-to-image（PNG 海报）+ jsPDF

## 本地开发

```bash
npm install
npm run dev          # 启动开发服务器（默认 http://localhost:5174）
```

## 部署

本项目为 SSR 应用，需部署到支持 serverless functions 的平台。推荐 **GitHub + Netlify**（推送代码即自动部署）。

详见 [DEPLOY.md](./DEPLOY.md)。

## 项目结构

```
src/
├── assets/decor/        # 拼贴装饰素材（PNG）
├── components/
│   ├── collage/         # 核心画布、飘落、素材库、AI 词条
│   └── ui/              # UI 基础组件（button, input）
├── lib/
│   ├── poetry.local.ts  # 诗歌生成引擎（词库 + 模板 + 诗人句式）
│   ├── work-storage.ts  # 本地存储（localStorage）
│   └── utils.ts         # 工具函数
├── routes/
│   ├── index.tsx        # 首页
│   ├── create.tsx       # 创建页（选主题/填信息）
│   └── studio.tsx       # 工作台（拼贴画布）
├── styles.css           # 全局样式 + Tailwind
└── server.ts            # SSR 入口
```
