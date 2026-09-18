# AnyClass / 有课吗

> 今天有课吗？打开就知道。

**AnyClass** is a local-first timetable tool for students. It helps you quickly check today's classes, view your weekly timetable, import course data, and export your schedule to a calendar.

**Web:** https://anyclass.heyaaron.asia/

## Features

- 今日课程与当前 / 下一节课程
- 周课表
- 教务系统课表导入
- Apple Calendar / iCalendar (ICS) 导出
- 课程提醒
- 节次与显示范围设置
- Local-first：课表数据默认保存在当前设备

## Privacy

AnyClass is designed around a local-first model.

- Timetable data is stored locally by default.
- The current product does not upload timetable data to the AnyClass server.
- AnyClass does not require storing your school account password.
- The current import flow does not upload your Cookie, Session, or authentication token.

## Compatibility

| Academic system | Status |
| --- | --- |
| 正方教务 V9 | ✅ 已验证 |
| 强智教务 | 未支持 |
| 青果教务 | 未支持 |
| URP | 未支持 |
| 金智教务 | 未支持 |

“已验证”表示已完成真实环境导入验证。公开项目说明不使用具体学校作为兼容性宣传。

## Calendar

On iPhone and iPad, the primary flow is:

1. Export the timetable as an ICS file in AnyClass.
2. Open the Apple Calendar import interface from Safari.
3. Add all events and choose the destination calendar.

Shortcut and Files-app import remain fallback options.

## Roadmap

Planned areas include:

- Universal Shortcut / Bookmarklet import architecture
- Additional academic-system adapters
- Android calendar experience
- Custom courses
- Schedule changes / make-up classes
- Calendar Subscription
- Multi-term management

Roadmap items are plans, not currently available features.

## Open source status

The public source package, contributor documentation, security policy, and first release notes are being prepared for the initial GitHub release.

Until that review is complete, the hosted web app remains the primary way to use AnyClass.

## Contributing

Contribution guidelines will be published with the first source release.

Please never submit school account passwords, Cookies, Sessions, authentication tokens, or private student data in issues or pull requests.

## License

A license will be selected before the first public source release.
