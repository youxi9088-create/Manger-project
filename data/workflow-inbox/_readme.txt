工作流文件中转目录
===================

你的工作流工具无法通过 HTTP 连接到 OpenClaw，所以改用文件系统通信。

写入路径：
  F:\youxi\app\openclaw\data\workflow-inbox\

文件格式（JSON）：
  {
    "source": "你的工作流名称",
    "timestamp": "2026-06-09T12:00:00",
    "type": "text",
    "title": "输出标题",
    "content": "输出内容"
  }

文件名建议：
  latest.json              - 最新一条输出（覆盖写入）
  output_20260609_001.json - 带时间戳的命名（追加写入）

OpenClaw 会自动读取这个目录下的所有 .json 文件。
