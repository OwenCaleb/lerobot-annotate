# LeRobot Annotate AI Plugin

在 `lerobot-annotate` 标注工具基础上，提供一个**可插拔 AI 插件**，用于自动生成：

1. **Subtask 标注**（时间段级别的子任务标签）
2. **Fake VQA 标注**（将 episode 内的视觉片段转化为英文 VQA 式问答监督信号）

该插件面向你的路线 B 目标：在不改 wall-oss 训练主框架的前提下，把 `lerobot-annotate` 的标注结果导出为 `lerobot_annotations.json`，用于后续混训或数据增强。

---

## 功能概览

### 1) AI Subtasks

* 输入：episode 视频 + 配置参数（Summary frames / Stride / Window frames 等）
* 输出：覆盖整个 episode 的时间段标注列表（start, end, label）
* 模式：可选择从头生成，或从上次最后一段继续生成（Resume）

### 2) AI Fake VQA

* 输入：episode 视频 + 配置参数（Mode 2, Stride, Window, Window frames 等）
* 输出：覆盖 episode 的英文 VQA 问答段落（user_prompt, robot_utterance），并写入 `high_levels`
* 目标：生成类似 “图像问答” 的文本监督信号，服务于 VLA 混训时的语言分支

---

## 目录结构

```
.
├── app.py                      # 原始标注后端（或兼容入口）
├── app_ai.py                   # 启用 AI 插件的入口
├── ai_plugin.py                # 插件注册入口，尽量薄
├── ai_plugin_impl/             # 插件实现（尽量解耦、可迁移）
│   ├── engine.py               # AIAnnotator：核心调度
│   ├── routes.py               # FastAPI routes: /api/ai/*
│   ├── schemas.py              # Pydantic 请求/响应 schema
│   ├── sampler.py              # 抽帧/拼视频 clip，依赖 ffmpeg
│   ├── strategy_subtask.py     # Subtask prompt 构造与解析
│   ├── strategy_vqa.py         # Fake VQA prompt 构造与解析
│   ├── client_openai.py        # OpenAI compatible client
│   ├── prompts_store.py        # 读写 prompts 与 demo
│   ├── config_store.py         # 读写 ai_config.json
│   └── ...
├── ai_prompts/
│   ├── ai_config.json          # 统一配置（不要依赖环境变量）
│   ├── subtask_prompt.txt      # Subtask demo (A 方案：每行一个 label demo)
│   └── vqa_prompt.txt          # VQA demo (两行一对 Q/A demo)
└── static/
    ├── index.html              # 前端页面
    ├── app.js                  # 原始前端逻辑
    ├── ai_plugin.js            # AI 插件注入脚本（动态加载 ai_ui.js/css）
    └── ai/
        ├── ai_ui.js            # AI UI 面板与按钮
        └── ai_ui.css
```

---

## 运行环境要求

### 必需

* Python 3.10+
* `ffmpeg`（用于抽帧与拼接视频 clip）
* GPU 推理服务：OpenAI compatible API（推荐 vLLM）

### 建议依赖

* `fastapi`, `uvicorn`, `pydantic`, `requests`
* `opencv-python` 或 `Pillow`（视采样实现而定）
* Linux 环境更稳（你当前就是）

---

## 快速启动

### Step 1: 启动 Qwen 推理服务（OpenAI compatible）

你现在用的是 Qwen 系列且 A800 x1，推荐优先：

* `Qwen2.5-VL-7B-Instruct`：效果更好，速度可接受
* `Qwen2.5-VL-3B-Instruct`：更快更省显存，但理解能力会弱一些

一个常见的 vLLM OpenAI server 启动示例（按你现有服务日志风格）：

```bash
python -m vllm.entrypoints.openai.api_server \
  --host 127.0.0.1 --port 8000 \
  --model Qwen/Qwen2.5-VL-7B-Instruct \
  --max-model-len 8192 \
  --gpu-memory-utilization 0.90
```

启动后应能访问：

* `http://127.0.0.1:8000/v1/chat/completions`

---

### Step 2: 配置 AI 插件（不依赖环境变量）

编辑：

`ai_prompts/ai_config.json`

关键字段示例：

```json
{
  "enabled": true,
  "base_url": "http://127.0.0.1:8000/v1",
  "model": "qwen2.5-vl-7b-instruct",
  "prompts_dir": "./ai_prompts",
  "image_max_side": 768
}
```

检查是否生效：

```bash
curl -s http://127.0.0.1:7860/api/ai/status | jq .
```

如果返回 `enabled/base_url/model/prompts_dir`，说明插件已启用。

---

### Step 3: 启动标注服务

使用 AI 入口（推荐）：

```bash
uvicorn app_ai:app --host 0.0.0.0 --port 7860
```

然后浏览器打开：

* `http://127.0.0.1:7860/`

---

## 前端 AI Mode 使用说明

进入任意 episode 后，在：

* `Subtasks` 页签
* `High-level prompts` 页签

可以切换 AI Mode（按钮或开关）。AI Mode 打开后会出现 AI 相关设置和生成按钮。

> 如果你更新了前端文件后 AI Mode 消失，优先看本文的 Troubleshooting。

---

## Subtasks 自动标注工作流

### 你当前的目标逻辑

你希望 Subtask 生成满足：

1. 当 Summary frames 足够多（>16）时，将这些帧拼成视频输入，供模型做全局理解
2. Stride(s)=t：每一步给模型一个 “从 a 到 a+t 的视频 clip”
3. 模型输出该 clip 对应 subtask label
4. 标注覆盖整个 episode，直至结束

### UI 参数说明

* **Summary frames**
  用于 episode 全局语义理解。如果数量 >16，系统会拼接成视频 clip 给模型看。
* **Stride(s)**
  标注推进步长。例：3 秒意味着 0–3, 3–6, 6–9...
* **Window frames**
  clip 采样帧数，用于拼 clip（越大越慢，越小越粗糙）
* **Resume from last segment**
  从上次最后一个 end 继续生成（建议配合 append 模式）

### Subtask demo（A 方案）

`ai_prompts/subtask_prompt.txt`：每行一个 label demo，用于强约束输出风格。例如：

```
pick up blue ball
place blue ball into black basket
move toy car to the right
release object
```

---

## Fake VQA 自动生成工作流（Mode 2）

### 你当前的目标逻辑

你希望 Fake VQA（Mode 2）满足：

1. 不要求全局理解 episode（可选）
2. 按 Stride(s) 进行抽样
3. 对每个起点 a，取 `[a, a + window]` 的视频 clip（window < stride），把 clip 拼接给模型理解
4. 模型在严格 prompt 约束下生成英文 VQA 问答，且尽量问 “位置关系前后不变” 的信息
5. 标注覆盖整个 episode

### UI 参数说明

* **Stride(s)**
  推进步长
* **Window(s)**
  每个片段的视频时长，必须小于等于 stride
* **Window frames**
  clip 采样帧数（视频理解输入的稠密度）
* **Scenario type / Response type / Skill**
  会写入 high_level 段落字段，便于后续筛选和训练路由

### VQA demo（两行一对）

`ai_prompts/vqa_prompt.txt`：两行一对 Q/A demo，例如：

```
May I ask where object A is relative to object B?
Object A is to the right of object B.
```

系统会把 demo 注入 `{qa_demos}` 类占位符中，用于强约束输出格式与问题类型。

---

## 导出与产物

### 标注保存

* 在 UI 中生成后会写回本地 annotation 状态
* 点击 “Save episode” 会持久化到 `lerobot_annotations.json`（或同等路径）

### 导出

在页面底部 `Export annotated dataset` 区域导出即可。

---

## API 端点（调试用）

* `GET /api/ai/status`
  查看插件是否启用与当前 base_url/model/prompts_dir

* `POST /api/ai/subtasks`
  生成 subtask segments

* `POST /api/ai/fake_vqa`
  生成 high-level Fake VQA segments

---

## Troubleshooting

### 1) AI Mode 看不到

最常见原因：`ai_ui.js` 是 **动态注入**，如果它只监听 `DOMContentLoaded` 会导致晚加载不启动。

自检：

打开浏览器 Console 输入：

```js
window.__AI_UI_LOADED__
```

* `true`：ai_ui.js 已执行
* `undefined`：没执行，通常是缓存或加载顺序问题

处理：

1. 浏览器硬刷新：`Ctrl+Shift+R`
2. 确认 `static/ai_plugin.js` 在 `index.html` 被引入
3. 确认网络里能加载到 `/static/ai/ai_ui.js` 和 `/static/ai/ai_ui.css`

---

### 2) Resume 后前面的段落消失

原因：前端在 resume 时用了 `mode="replace"`，后端会覆盖存量 segments。

修复思路：

* Resume 时用 `mode="append"`
* 非 Resume 时才用 `replace`

---

### 3) Fake VQA 输出全是 undefined

通常是字段名不一致：

* 前端渲染用的是 `robot_utterance`
* 后端或模型输出可能是 `robot_response`

确保后端写回时统一字段名，或在前端做兼容映射。

---

### 4) ffmpeg 报错：height not divisible by 2

H.264 编码要求宽高为偶数。解决：

在 `-vf` 里增加 padding 或再次 scale，例如：

* `pad=ceil(iw/2)*2:ceil(ih/2)*2`

---

### 5) JSON parse error: Expecting ',' delimiter

模型没有按要求输出 JSON。解决：

* prompt 里强制 “Return JSON only”
* 在解析器里做容错：从文本中提取第一个 `{...}` JSON 块再解析
* 降低 temperature，增加 stop tokens

---

### 6) 生成覆盖不完整，缺段

原因可能是：

* 后端生成策略内部过滤导致跳段
* 或 max_steps 太小

修复思路：

* 后端强制 “每个 stride 输出 1 段”
* 或前端循环调用直到覆盖 episode 末尾

---

## 开发与移植

这个插件的目标是 **最小侵入式集成**：

* 原始标注 UI 与后端逻辑尽量不动
* AI 插件集中在：

  * `ai_plugin_impl/`（后端）
  * `static/ai*`（前端）

移植到另一份 `lerobot-annotate` 时，通常只需要：

1. 复制 `ai_plugin_impl/`
2. 复制 `ai_prompts/`
3. 复制 `static/ai/*` 与 `static/ai_plugin.js`
4. 在 `index.html` 中引入 `ai_plugin.js`
5. 在后端入口（如 `app_ai.py`）里调用插件注册函数，挂载 `/api/ai/*` routes

---

## 许可与声明

* 本插件仅是标注增强工具
* 模型输出存在不确定性，请在关键数据集上抽样人工复核

