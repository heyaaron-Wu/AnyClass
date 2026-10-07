<div align="center">

<a href="https://anyclass.heyaaron.asia/">
  <img src="app/assets/brand/AnyClass_Logo_Horizontal.svg" alt="AnyClass Logo" width="128" />
</a>

<h1>AnyClass</h1>

<p><strong>Wondering if you have class today? Open AnyClass and know right away.</strong></p>

<p>
  <a href="https://anyclass.heyaaron.asia/"><strong>Open AnyClass</strong></a>
  ·
  <a href="#features">Features</a>
  ·
  <a href="#compatibility">Compatibility</a>
  ·
  <a href="#roadmap">Roadmap</a>
</p>

<p>
  <img src="https://img.shields.io/badge/Hosted-v0.2.1-1679F3?style=flat-square" alt="Hosted v0.2.1" />
  <img src="https://img.shields.io/badge/Local--first-Yes-25D1A7?style=flat-square" alt="Local-first" />
  <img src="https://img.shields.io/badge/ZhengFang%20V9-Verified-2ea44f?style=flat-square" alt="ZhengFang V9 Verified" />
  <img src="https://img.shields.io/badge/License-Apache--2.0-blue?style=flat-square" alt="Apache-2.0 License" />
</p>

<p>
  <a href="README.md">简体中文</a> | English
</p>

</div>

---

**AnyClass** is a local-first timetable tool for students. It helps you check today's classes, view weekly schedules, import course data, manage multiple timetables, and export schedules to the system calendar.

**Web app:** https://anyclass.heyaaron.asia/

> Hosted Production is currently **v0.2.1**. The [**v0.2.0**](https://github.com/heyaaron-Wu/AnyClass/releases/tag/v0.2.0) source release is published on GitHub. The repository's `main` branch contains the reconciled **public v0.2.1 source baseline**; the v0.2.1 source release has not been published yet. Source-release identity remains separate from the Hosted Production deployment build identity.

## Features

- Today's classes and current / next class
- Weekly timetable
- Multiple timetable management and active timetable switching
- Course editing and local timetable metadata editing
- Unified Preview for imports
- Academic-system / Bookmark / file / clipboard / AI-assisted import flows
- The currently selected timetable is the default import target
- Duplicate-course and conflict checks
- Apple Calendar / iCalendar (ICS) export
- Course reminders
- Period and display-range settings
- Local-first: timetable data is stored on the current device by default

## Import behavior

AnyClass v0.2.0 treats **Course data** as the core import model:

- Imported data enters Unified Preview before being saved.
- The currently selected timetable is the default destination; source identity does not silently redirect to another timetable.
- Generic imports do not fabricate school IDs just to satisfy validation.
- Required missing metadata, such as school name, must be confirmed before save.
- AI-assisted import produces AnyClass course data only; it does not directly create system calendar events.
- **ICS import has been removed; ICS export remains available.**

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

AnyClass currently keeps **ICS export**.

On iPhone or iPad, the ICS file exported by AnyClass can be handed off to the system calendar for import. AnyClass no longer provides ICS-file import back into the timetable.

## Roadmap

Planned areas include:

- Additional academic-system adapters
- Android calendar experience
- Schedule changes / make-up classes
- Exam arrangements
- Calendar Subscription
- More complete multi-term management
- Student utilities such as campus maps / classroom navigation

Roadmap items are plans, not currently available features.

## Open-source status

**The public source release for AnyClass v0.2.0 is available:** [AnyClass v0.2.0](https://github.com/heyaaron-Wu/AnyClass/releases/tag/v0.2.0)

**AnyClass v0.2.1 is deployed to the hosted Production app; the corresponding GitHub source release has not been published yet.**

For normal use, the hosted [AnyClass web app](https://anyclass.heyaaron.asia/) remains the recommended entry point. This repository is primarily for source review, issue reporting, compatibility work, and development collaboration.

> **Repository source status:** the current `main` branch contains the reconciled AnyClass v0.2.1 public source baseline. The GitHub v0.2.0 source release is published; the v0.2.1 source release is not yet published. Its source identity is `v0.2.1`, while Hosted Production uses a separate deployment build identity.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

Please never submit school account passwords, Cookies, Sessions, authentication tokens, or private student data in Issues or Pull Requests.

## Security

See [SECURITY.md](SECURITY.md).

## License

[Apache-2.0](LICENSE) · Copyright 2026 Aaron
