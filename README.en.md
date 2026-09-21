<div align="center">

<a href="https://anyclass.heyaaron.asia/">
  <img src="assets/brand/anyclass-logo.svg" alt="AnyClass Logo" width="128" />
</a>

<h1>AnyClass</h1>

<p><strong>Wondering if you have class today? Open AnyClass and know right away.</strong></p>

<p>
  <a href="https://anyclass.heyaaron.asia/"><strong>Open AnyClass</strong></a>
  ·
  <a href="#features">Features</a>
  ·
  <a href="#roadmap">Roadmap</a>
</p>

<p>
  <img src="https://img.shields.io/badge/Web-AnyClass-1679F3?style=flat-square" alt="Web" />
  <img src="https://img.shields.io/badge/Local--first-Yes-25D1A7?style=flat-square" alt="Local-first" />
  <img src="https://img.shields.io/badge/ZhengFang%20V9-Verified-2ea44f?style=flat-square" alt="ZhengFang V9 Verified" />
  <img src="https://img.shields.io/badge/Codex-supported-9333ea?style=flat-square&labelColor=111827" alt="Codex supported" />
  <img src="https://img.shields.io/badge/License-Apache--2.0-blue?style=flat-square" alt="Apache-2.0 License" />
</p>

<p>
  <a href="README.md">简体中文</a> | English
</p>

</div>

---

**AnyClass** is a local-first timetable tool for students. It helps you quickly check today's classes, view your weekly timetable, import course data from academic systems, and export your schedule to your calendar.

**Web app:** https://anyclass.heyaaron.asia/

## Features

- Today's classes and current / next class
- Weekly timetable
- Academic-system timetable import
- Apple Calendar / iCalendar (ICS) export
- Course reminders
- Period and display-range settings
- Local-first: timetable data is stored on the current device by default

## Privacy

AnyClass follows a **local-first** design.

- Timetable data is stored locally in the browser by default.
- The current product does not upload timetable data to the AnyClass server.
- AnyClass does not require storing your school account password.
- The current import flow does not upload Cookies, Sessions, or authentication tokens.

See [PRIVACY.md](PRIVACY.md) for details.

## Compatibility

| Academic system | Status |
| --- | --- |
| ZhengFang V9 | ✅ Verified |
| QiangZhi | Not supported |
| Kingosoft | Not supported |
| URP | Not supported |
| Wisedu | Not supported |

“Verified” means the import flow has been validated in a real environment. Public project documentation does not use a specific school as compatibility promotion.

## Apple Calendar

On iPhone or iPad, the recommended flow is:

1. Export the timetable as an ICS file in AnyClass.
2. Let Safari open the Apple Calendar import interface.
3. Tap “Add All”.
4. Choose the destination calendar.

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

## Open-source status

**The public source for AnyClass v0.1.1 is now available in this repository.**

For normal use, the hosted [AnyClass web app](https://anyclass.heyaaron.asia/) remains the recommended entry point. This repository is primarily for source review, issue reporting, compatibility work, and development collaboration.


## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

Please never submit school account passwords, Cookies, Sessions, authentication tokens, or private student data in Issues or Pull Requests.

## Security

See [SECURITY.md](SECURITY.md).

## License

[Apache-2.0](LICENSE) · Copyright 2026 Aaron
