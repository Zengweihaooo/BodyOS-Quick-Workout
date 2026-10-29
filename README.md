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
- 登录后会读取 Body.OS 发布的训练专用快照：首页显示今日推荐计划；第一次打开动作时带入最近一次训练中使用的最大重量、次数、组数和休息参数；“训练历史”可逐次查看并与上一场包含相同动作的训练比较。
- 双向同步只经过 Supabase：Pages 把新训练写入 `body_os_workout_uploads`，Body.OS 导入后把最近结构化训练发布回 `body_os_workout_uploads`，Pages 从上传表重建历史。只发布训练投影，不包含病历、药物、附件或其他健康档案。
- 本地同源运行时仍可使用“一键导入 Body.OS”，沿用 `workout-capture/recognize` → Apple Watch 场次选择 → `workout-capture/confirm`。

本地访问：`http://127.0.0.1:8766/quick-workout/`。

## GitHub Pages

把本文件夹作为仓库根目录推送到 GitHub，在仓库 Settings → Pages 中选择从默认分支根目录部署即可。所有网页资源、manifest 和 Service Worker 都使用相对路径，支持项目型 Pages 地址。

## Supabase

1. 在 Supabase SQL Editor 执行 [`supabase/schema.sql`](supabase/schema.sql)。脚本会创建 allowlist、训练上传表与训练快照表，启用 RLS，并明确撤销 `anon` 的表权限。
2. 在 Authentication 创建自己的邮箱密码用户，关闭公开注册，再按 SQL 脚本中的注释把该用户加入 `body_os_allowed_users`。没有进入 allowlist 的账号即使成功注册也不能写入。
3. 打开 PWA 的训练总结 →「上传到 Supabase」，填写 Project URL 和 publishable/anon key，再登录并上传。
4. Body.OS 本地端设置 `BODY_OS_SUPABASE_URL`、`BODY_OS_SUPABASE_SECRET_KEY`（或旧 `SERVICE_ROLE_KEY`）与 `BODY_OS_SUPABASE_USER_ID` 后，会在启动时及后台轮询该用户的未导入训练，并刷新训练快照。后端密钥只能保存在本机，绝不能写入本仓库或 GitHub Pages。

## 外部资料与许可

- [hasaneyldrm/exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset)：文本/元数据按其 MIT 许可使用；GIF/图片来自 Gym Visual，仍受源项目标注的独立媒体条款约束。本 PWA 只引用 `raw.githubusercontent.com` 的源文件。
- [wger](https://github.com/wger-project/wger)：应用代码为 AGPL-3.0-or-later；每条动作说明和视频的 Creative Commons 许可及作者独立保存。页面仅展示清洗后的纯文本说明，并按需跳转到 wger，不预载大型 MOV。
- 离线时第三方 GIF 与 wger 链接可能不可用，训练记录、动作名称、导出与用户自定义动作仍可使用。

默认云端为独立免费的 BodyOS-Workout 项目，只用于训练同步。旧默认项目的浏览器配置会自动迁移，并要求重新登录；本机训练保留，自定义项目配置保持不变。PersonalSystem 整体云备份应使用独立的 `PERSONAL_SYSTEM_CLOUD_BACKUP_*` 配置，避免占用训练项目额度。

### 动态渐进推荐

GitHub Pages 的训练历史继续从当前登录账号的 `body_os_workout_uploads` 重建。Mac 每 60 秒发布该账号的 `body_os_training_snapshots`，网页读取其中的下次 A/B 训练、组次数、RIR、上次参数、调整理由及生成时间；推荐投影不替换上传历史。推荐表缺失、为空或暂时不可读时，历史仍能查看，等待 Mac 发布推荐。静态肩部等组合仅为通用模板。

登录并联网后，结束训练自动上传；失败保留本地，联网或每 60 秒重试结束会话。正在记录的训练不会逐组上传。网页每 60 秒及返回前台刷新推荐，录入页、动作搜索及正在输入的表单不重绘；离线或推荐超过 24 小时会显示提醒。点击动态推荐选择动作会把推荐 A/B 标识保存在训练导出中，供后端完成训练后轮换。

Optional AI reviews follow the active model in the Mac API Hub. New structured workouts and model changes trigger asynchronous review; unchanged polls reuse cached results. AI advice requires confirmation for major plan changes and cannot overwrite the rule plan.

On the progressive recommendation screen, save a model choice directly from
the phone: follow the Hub, select a configured API profile, or use the signed-in
ChatGPT subscription through local Codex. The Mac receives this owner-scoped
choice and recomputes advice; it must be online. Subscription access uses Codex
plan limits and never silently falls back to a paid API.

### 替代动作、建议重量与恢复规划（2026-10-29）

逻辑集中在 [`guidance.js`](guidance.js)（纯函数，`tests/guidance.test.mjs`）。同源挂载时 Body.OS 直接读本目录，无需改后端。
- **替代动作**：动作库每张卡片、录入页可展开 ≤3 个替代。借鉴 [hasaneyldrm/exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset)（23k★）的细分 `target` 肌群：`scripts/build_muscle_targets.py` 生成 `catalog/muscle-targets.json`（95 个动作已对应）；替代项必须同目标肌、优先换器材。3 个尚无可核对数据集条目的器械型号（Supine Press、Converging Shoulder Press、俯身哑铃臂屈伸）回退到“同类别 + 同动作模式”。
- **建议重量**（仅供参考；Body.OS 规则计划仍不估 1RM、不编重量）：无本动作历史，或距上次 >28 天时在录入页给出建议。1RM 用已有的 Epley；目标 10 次（ACSM 2009 新手 8–12RM）并留 2–3 次余力，纯 Epley 代数反推，无额外系数。停训：Mujika & Padilla（全文）指出力量表现在不训练 4 周内大体保留，所以 ≤28 天沿用上次重量、余力 2；>28 天不按百分比扣重量（Izquierdo 的 6–9% 只有摘要，不作为系数），只改为你计划复训期的余力 3 起手。
- **跨动作换算（统一标准）**：没练过的动作，按你练过的同目标肌动作推荐起点。所有比较统一用“总外部重量 kg”：哑铃每手重量 ×2，每侧配重 ×2（杠铃另加 20 kg 空杆），辅助类不参与，磅自动换 kg。杠铃↔哑铃按同样总重量对等（Heinecke 2021：力竭次数 r=0.96，预测 1RM 总误差约 7–8%）；器械↔自由重量没有可靠的通用系数，只用你自己两类动作都练过的配对数据算比例，没有配对就不给数字。取最近一次的最好成绩，并显示该动作近期是上升/持平/回落；杠铃推荐不低于空杆。推荐值在录入页和历史页标“推荐值 · 非实测”，实测记录标“实测”；以推荐重量起手并保存的第一组会记 `weightBasis=suggested`。
- **恢复规划**（首页“恢复规划”，Body.OS 训练计划页也有同源摘要卡）：按本人的胸/背/腿三分化（`dayPlans` 中的动作归属，缺失时按名称），严格轮换、隔日一练、每周 3–4 次。只使用有出处的阈值：满 48 小时可再练（本人三分化计划自有的间隔）；每肌群每周至少 2 次（ACSM 2026 的建议；Schoenfeld 2019 的 25 项研究 meta 分析发现周组数相同时频率没有显著影响）、每周约 10 组（ACSM 2026、Schoenfeld 2017）；>4 周进入停训区（Mujika & Padilla 2000、Izquierdo 2007）。文献没有个人化的“超量恢复峰值”，所以不再标“最佳窗口”，只告诉你已满 48 小时，以及每周次数、组数离目标差多少。同一套状态由 Body.OS 后端 `workout_recommendations.build_recovery` 按正式计划计算并随训练快照发布（`recommendation.recovery`），页面优先使用后端值。
- 出处与核实状态见规划页“规则与出处”。已移除未能一手核实的引用（McMaster 2013 的“7 周约 15%”）。
- 数据仍来自 Supabase 训练快照，GitHub Pages 与 Body.OS 同源挂载共用同一份逻辑。Arch 的 `peer-code/storage/runtime/quick-workout` 同步副本需把 `guidance.js` 与 `catalog/muscle-targets.json` 一并同步。

### Exercise catalog review (2026-10-21)

Built-in picker categories use canonical IDs rather than display-name substring matching, so language changes cannot move an exercise between groups. Categories are browsing groups rather than an exclusive list of muscles worked: dips remain under chest, face pulls under back, back extensions under legs, and loaded carries under Other.

Confirmed unrelated wger descriptions have been removed from active guides. Their original source and license are retained in `unverifiedWger` for review; these fields are never used as instructions. Four mismatched or insufficiently specific animation variants are pending review and show the movement icon instead. The media matching helper now produces pending candidates, cannot assign an empty or non-English title to every exercise, never invents a license, and permits different movements to reference the same source when appropriate. A catalog row or a successful URL check does not prove a semantic media match.

Body OS capability flags describe supported choices. They do not override reviewed built-in load and bilateral execution defaults. Existing saved sets are preserved.

### 器材名称与自定义照片（2026-10-26）

动作库可搜索 Supine Press、Converging Shoulder Press、俯身哑铃臂屈伸及中英文别名。输入搜索词会在全动作库中查询，不受刚才选择的训练模板限制。两个具体器械型号的资料保留待核对状态；不会借用其他动作的动图。俯身哑铃臂屈伸的文字说明来自 [wger 655](https://wger.de/en/exercise/655)，按该条来源的 CC-BY-SA 3 许可标注。

“＋ 自定义”支持名称、器材备注和照片全部可选。可直接拍器材或选取最多四张照片；保存前在设备上压缩并去除原照片元数据。未命名动作会获得日期占位名称，保存后可重新编辑名称和照片。自定义动作及照片保留在这台设备的动作库中；照片不会随训练记录自动上传。清除浏览器数据或更换设备不会自动恢复本机照片。

### wger 全库分级检索（2026-10-26）

默认显示原常用库、自定义动作及已选择的来源动作；输入中文或英文会在其后搜索完整 wger 目录，也可切到“wger 全库”按部位浏览。当前快照为 932 项、48 项带官方中文，其余带有明确标记的辅助中文检索译名；保留全部英文原名，不把译名当作官方训练说明。

名称索引约 276 KB，首次搜索/浏览时才读取；默认每页 24 项。说明保存在 30 个内容寻址的小文件中，点选后加载对应一段，不预下载媒体。已经选过的来源动作沿用原 IndexedDB 动作库持久化；保留旧内置动作和自定义动作编号、照片。新来源身份以 wger UUID 为键，不按相似名称自动合并历史。首次没有已记参数时，先确认重量口径再允许保存一组。

公开文件位于 catalog/，许可及作者随各条目详情保存，见 catalog/NOTICE.txt。来源为 wger 公共 API，文本采用各条目的原 CC 许可。检索译名是辅助译名，描述内容仍是原始来源的纯文本。离线时，已缓存的索引/详情可用；首次未缓存部分需要联网。

更新快照时先获取完整 exerciseinfo 响应、license 响应和逐 ID 的中文名称映射，再运行：
python3 scripts/build_wger_catalog.py --raw <public-exerciseinfo.json> --translations <id-to-zh.json> --licenses <public-licenses.json>
生成器拒绝分页未取完的输入。保持旧内容寻址分段，避免已有缓存索引失效。发布时目录与前端、原生注册元数据必须来自同一快照；不从用户训练记录生成公开目录。
