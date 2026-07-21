# 拼首诗 — 部署到 Netlify（GitHub 自动部署）

本项目是 TanStack Start（SSR）框架，使用 Nitro 构建。适合部署到 Netlify，
仓库托管在 GitHub，Netlify 导入仓库后自动构建并给出公开网址。

## 方式：GitHub + Netlify（推荐，最贴合项目设计）

### 1. 推送代码到 GitHub
```bash
git init
git add .
git commit -m "init: 拼首诗"
# 在 github.com 新建一个空仓库（不要勾 README/.gitignore）
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git branch -M main
git push -u origin main
```

### 2. 在 Netlify 导入
1. 打开 https://app.netlify.com
2. 点 "Add new site" → "Import an existing project" → 选 GitHub
3. 授权并选择刚才的仓库
4. Netlify 会自动读取根目录的 `netlify.toml`：
   - Build command: `NITRO_PRESET=netlify vite build`
   - Publish directory: `.output/public`
5. 点 "Deploy site"，等待构建完成（约 1-3 分钟）

### 3. 得到网址
部署完成后 Netlify 会分配一个形如 `https://<随机名>.netlify.app` 的网址，
可公开点开。如需自定义域名，在 Netlify 的 "Domain settings" 中绑定。

之后每次 `git push` 到 main 分支，Netlify 会自动重新部署。

## 本地构建验证（可选）
```bash
NITRO_PRESET=netlify npx vite build
# 产物在 .output/public（静态资源）+ Nitro serverless 函数
```

## 注意
- GitHub 作为代码仓库，构建与托管由 Netlify 完成（推送即自动部署）。
- `.output/`、`node_modules/`、`.wrangler/` 等已在 `.gitignore` 中排除，不会被上传。
- 本项目为 SSR 应用，不支持纯静态托管（如 GitHub Pages），需 Netlify 等 serverless 平台。
