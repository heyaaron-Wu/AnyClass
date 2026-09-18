<div align="center">

<a href="https://anyclass.heyaaron.asia/">
  <img src="assets/brand/anyclass-logo.svg" alt="AnyClass Logo" width="128" />
</a>

<h1>AnyClass / 有课吗</h1>

<p><strong>今天有课吗？打开就知道。</strong></p>

<p>
  <a href="https://anyclass.heyaaron.asia/"><strong>在线使用</strong></a>
  ·
  <a href="#功能">功能</a>
  ·
  <a href="#roadmap">Roadmap</a>
</p>

<p>
  <img src="https://img.shields.io/badge/Web-AnyClass-1679F3?style=flat-square" alt="Web" />
  <img src="https://img.shields.io/badge/Local--first-Yes-25D1A7?style=flat-square" alt="Local-first" />
  <img src="https://img.shields.io/badge/正方教务%20V9-已验证-2ea44f?style=flat-square" alt="正方教务 V9 已验证" />
  <img src="https://img.shields.io/badge/Codex-supported-9333ea?style=flat-square&labelColor=111827" alt="Codex supported" />
</p>

<p>
  简体中文 | <a href="README.en.md">English</a>
</p>

</div>

---

**AnyClass（有课吗）** 是一个面向学生的 Local-first 课程表工具。它帮助你快速查看今天的课程、浏览周课表、从教务系统导入课程，并将课表导出到系统日历。

**在线使用：** https://anyclass.heyaaron.asia/

## 功能

- 今日课程与当前 / 下一节课程
- 周课表
- 教务系统课表导入
- Apple 日历 / iCalendar（ICS）导出
- 课程提醒
- 节次与显示范围设置
- Local-first：课表数据默认保存在当前设备

## 隐私

AnyClass 采用 **Local-first** 设计。

- 课表数据默认保存在当前设备的浏览器中。
- 当前产品不会将课表数据上传到 AnyClass 服务器。
- AnyClass 不要求保存你的学校账号密码。
- 当前导入流程不会上传你的 Cookie、Session 或身份验证 Token。

更多信息见 [PRIVACY.md](PRIVACY.md)。

## 兼容性

| 教务系统 | 状态 |
| --- | --- |
| 正方教务 V9 | ✅ 已验证 |
| 强智教务 | 未支持 |
| 青果教务 | 未支持 |
| URP | 未支持 |
| 金智教务 | 未支持 |

“已验证”表示已完成真实环境导入验证。公开项目说明不使用具体学校作为兼容性宣传。

## Apple 日历

在 iPhone 或 iPad 上，推荐流程是：

1. 在 AnyClass 中导出课程表 ICS。
2. Safari 打开 Apple 日历导入界面。
3. 点击“全部加入”。
4. 选择目标日历。

快捷指令与“文件”App 导入作为备用方式保留。

## Roadmap

计划中的方向包括：

- Universal Shortcut / Bookmarklet 导入架构
- 更多教务系统 Adapter
- Android 日历体验
- 自定义课程
- 调课 / 补课
- Calendar Subscription
- 多学期管理

Roadmap 中的内容属于规划，并不代表当前版本已经提供。

## 开源状态

公开源码包、贡献文档、安全策略和首个 Release 正在准备中。

在公开源码审计完成之前，推荐直接使用线上版本。

## 贡献

请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

请勿在 Issue 或 Pull Request 中提交学校账号密码、Cookie、Session、身份验证 Token 或私人学生数据。

## 安全

请阅读 [SECURITY.md](SECURITY.md)。

## License

[Apache-2.0](LICENSE) · Copyright 2026 Aaron
