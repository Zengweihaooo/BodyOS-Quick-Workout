# Body.OS 极速训练 PWA

独立的移动端力量训练记录网页。它位于 PersonalSystem 仓库外，可以直接作为单独的 GitHub 仓库或 GitHub Pages 站点部署；Body.OS 本地仍会把它同源挂载在 `/quick-workout/`。

- 训练状态、动作库缓存和待导入数据保存在 IndexedDB。
- Service Worker 只缓存本目录的静态 GET，不缓存 `/api/` 或 POST。
- 训练完成后可下载 `body.os.quick-workout.v1` JSON 或 Markdown。
- 训练计时和休息计时均由用户手动开始、暂停；休息支持随时增加 30 秒。
- 重量支持点击数字直接输入，并可在 kg 与 lb（磅）之间快速切换。
- 动作库提供胸、背、肩、核心、有氧、手臂与腿部快捷分类；腿部按当前计划标记为暂停，记录页展示本次训练全部动作与组数。
- 动作名称支持中英双语：默认中文为主、英文为辅；右上角可一键切换主次语言。
- 每次保存后会显示上一组数据和本动作已完成组数的缩略进度；训练总结中的每个动作默认收起组明细，点击后展开。
- 资料库以 Body OS 稳定 canonical ID 为准，内置 53 个唯一匹配的 exercise dataset GIF；其中 32 个动作附有 wger 说明、视频或动作页。动作详情严格来自 wger，未同步时明确显示待同步，不用 dataset 文案替代。旧随机 ID 与重复名称会自动归并；引用清单随 `core.js` 静态发布，第三方媒体保持远程引用且不写入 Service Worker 缓存。
- 肩部动作池含推肩、哑铃/绳索侧平举、前平举、器械/哑铃后束飞鸟、肩外旋和面拉。2026-07-20 起正式肩部组合为：绳索侧平举 4 组、坐姿哑铃侧平举 3 组、反向飞鸟（器械）4 组、面拉 3 组；核心、有氧、胸和背也有按功能覆盖的推荐组合。
- 旧版 IndexedDB 动作库与训练中记录会自动迁移 canonical ID，新版内置资料会与用户自定义动作合并，不再被旧缓存覆盖。
- 首页和总结页可二次确认快速重置本次训练；已记录动作可整项删除，并可在提示条中一键撤销。重置不会清除动作库或离线资源。
- 背部动作库补齐引体、下拉、划船、直臂下拉/上拉与器械变式的中英文标准名；相关动作可逐组记录宽/中/窄握距及正/反/对握。
- 辅助引体在连接 Body.OS 时读取最新体重，并在导出层计算净作用重量；中间公式不占用快速记录界面。
- 520px 以下使用单栏重量/次数卡片，保证多位数字在手机浏览器中完整显示。
- GitHub Pages 上点击“复制 Body.OS JSON”，再粘贴到 Body.OS 的“智能训练捕获”。JSON 会绕过 AI 二次解析并直接进入结构化确认。
- GitHub Pages 已预置 BodyOS 的 Supabase Project URL 与公开 anon key，也可在训练总结中覆盖配置；使用 Supabase Auth 邮箱密码登录后即可幂等上传。密码不会持久化；数据库写入由 RLS 约束到登录用户，公开网页和 anon 角色均不能写入。
- 本地同源运行时仍可使用“一键导入 Body.OS”，沿用 `workout-capture/recognize` → Apple Watch 场次选择 → `workout-capture/confirm`。

本地访问：`http://127.0.0.1:8766/quick-workout/`。

## GitHub Pages

把本文件夹作为仓库根目录推送到 GitHub，在仓库 Settings → Pages 中选择从默认分支根目录部署即可。所有网页资源、manifest 和 Service Worker 都使用相对路径，支持项目型 Pages 地址。

## Supabase

1. 在 Supabase SQL Editor 执行 [`supabase/schema.sql`](supabase/schema.sql)。脚本会创建 allowlist 与 `body_os_workout_uploads`、启用 RLS，并明确撤销 `anon` 的表权限。
2. 在 Authentication 创建自己的邮箱密码用户，关闭公开注册，再按 SQL 脚本中的注释把该用户加入 `body_os_allowed_users`。没有进入 allowlist 的账号即使成功注册也不能写入。
3. 打开 PWA 的训练总结 →「上传到 Supabase」，填写 Project URL 和 publishable/anon key，再登录并上传。
4. Body.OS 本地端设置 `BODY_OS_SUPABASE_URL`、`BODY_OS_SUPABASE_SECRET_KEY`（或旧 `SERVICE_ROLE_KEY`）与 `BODY_OS_SUPABASE_USER_ID` 后，会在启动时及后台轮询该用户的未导入训练。后端密钥只能保存在本机，绝不能写入本仓库或 GitHub Pages。

## 外部资料与许可

- [hasaneyldrm/exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset)：文本/元数据按其 MIT 许可使用；GIF/图片来自 Gym Visual，仍受源项目标注的独立媒体条款约束。本 PWA 只引用 `raw.githubusercontent.com` 的源文件。
- [wger](https://github.com/wger-project/wger)：应用代码为 AGPL-3.0-or-later；每条动作说明和视频的 Creative Commons 许可及作者独立保存。页面仅展示清洗后的纯文本说明，并按需跳转到 wger，不预载大型 MOV。
- 离线时第三方 GIF 与 wger 链接可能不可用，训练记录、动作名称、导出与用户自定义动作仍可使用。
