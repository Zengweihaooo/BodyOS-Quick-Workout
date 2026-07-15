# Body.OS 极速训练 PWA

独立的移动端力量训练记录网页。它位于 PersonalSystem 仓库外，可以直接作为单独的 GitHub 仓库或 GitHub Pages 站点部署；Body.OS 本地仍会把它同源挂载在 `/quick-workout/`。

- 训练状态、动作库缓存和待导入数据保存在 IndexedDB。
- Service Worker 只缓存本目录的静态 GET，不缓存 `/api/` 或 POST。
- 训练完成后可下载 `body.os.quick-workout.v1` JSON 或 Markdown。
- GitHub Pages 上点击“复制 Body.OS JSON”，再粘贴到 Body.OS 的“智能训练捕获”。JSON 会绕过 AI 二次解析并直接进入结构化确认。
- 本地同源运行时仍可使用“一键导入 Body.OS”，沿用 `workout-capture/recognize` → Apple Watch 场次选择 → `workout-capture/confirm`。

本地访问：`http://127.0.0.1:8766/quick-workout/`。

## GitHub Pages

把本文件夹作为仓库根目录推送到 GitHub，在仓库 Settings → Pages 中选择从默认分支根目录部署即可。所有网页资源、manifest 和 Service Worker 都使用相对路径，支持项目型 Pages 地址。
