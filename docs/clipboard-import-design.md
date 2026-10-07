# v0.2 Clipboard import design note

The centralized source selector follows the useful *shape* of Notion's import entry: select a supported source, validate it, and map it to the application's own model. It does not copy Notion's interface or wording. See https://www.notion.com/help/import-data-into-notion.

The Clipboard API is only a convenience. Secure-context and browser-specific permission/user-activation constraints mean `readText()` may fail. A labeled manual paste field is always available, and failure does not block it. See https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API and https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/readText.

Both file and clipboard JSON call `AnyClassTimetableFile.parseText`, then the existing NormalizedImport, preview, timetable routing, Schema 4 storage and Phase 4 review. Raw clipboard text is neither uploaded nor persisted by the new feature. The AI helper is only a versioned prompt template; the user chooses an external AI service and must review its untrusted JSON through the same validator and preview. No screenshot is processed by AnyClass.
