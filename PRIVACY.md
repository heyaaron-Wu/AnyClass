# Privacy

AnyClass follows a **local-first** model.

## Current behavior

- Timetable data is stored locally in the browser by default.
- The current product does not upload timetable data to the AnyClass server as part of normal timetable storage.
- AnyClass does not require storing your school account password.
- Current public import flows are designed not to upload Cookies, Sessions, or authentication tokens to AnyClass.
- Generic import flows may process timetable text, files, page-derived course data, or AI-prepared Course data locally/in the browser before the user confirms save.
- Imported data enters the AnyClass preview/validation flow before it is written to the selected local timetable.
- Generic imports do not fabricate a stable school ID when one is unavailable.

## Public vs private integrations

Public AnyClass documentation and source should contain only generic integration logic and sanitized fixtures.

School-specific or otherwise private integration material must not be exposed through the public repository, public Issues, or Pull Requests.

## When reporting bugs

Do **not** include:

- school account passwords
- Cookies
- Sessions
- authentication tokens
- student numbers
- private timetable data
- private school-specific integration details
- screenshots containing sensitive personal information unless they are sanitized first

Prefer synthetic or sanitized examples whenever possible.

## Local-data considerations

Because timetable data is local-first:

- clearing site data may remove locally stored timetables
- private/incognito browsing may not preserve data
- moving to another browser or device does not automatically move local timetable data

Export or otherwise retain any data you need before clearing browser storage.

## Future features

Future features such as calendar subscription, additional sync capabilities, or optional cloud-backed functions may have different data requirements. If introduced, their privacy behavior must be documented before release.
