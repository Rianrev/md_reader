# Changelog

All notable changes to the MD Reader project will be documented in this file.

## [1.1.2] - 2026-05-26

This patch release fixes window state restoration issues and window positioning behavior on file launch.

### Fixed
- **Startup Window Flash**: Disabled window state persistence (`useSavedState: false`) and added immediate window hiding on startup to prevent secondary instances from flashing a fullscreen/maximized window on launch.
- **Foreground Focus on Open**: Ensured that the application window is reliably brought to the foreground when opening a file from File Explorer, drag-and-drop, or menu actions.

## [1.1.1] - 2026-05-25

This patch release refines editor usability, startup behavior, and recent-file navigation after the 1.1.0 feature release.

### Added
- **Offline CodeMirror Markdown Editor**: Integrated CodeMirror 5 assets locally for Markdown syntax highlighting, isolated tab history, active-line highlighting, and improved editor spacing.
- **Save Confirmation Flow**: Added a custom Save, Don't Save, and Cancel confirmation modal when closing modified files.
- **Heading Selection Dropdown**: Added a toolbar dropdown for inserting H1, H2, and H3 headings.
- **File History Dashboard**: Added a searchable File History page with card removal support.
- **Expanded Recent Files Controls**: Added All/Less controls and support for storing up to 100 recent files.
- **Single-Instance Mode**: Added handling to prevent duplicate windows when opening files from the system.

### Fixed
- Resolved absolute instance and queue directory paths with `NL_PATH` and `NL_CWD` to avoid redundant windows.
- Prevented single-instance polling race conditions and duplicate instance-file deletion on exit.
- Started the window hidden until initialization completes to prevent startup flash.
- Disabled `exitProcessOnClose` so app shutdown and instance cleanup run reliably.

### Changed
- Removed the redundant back button from the File History page.

## [1.1.0] - 2026-05-20

This release elevates the application from a simple Markdown Viewer to a fully featured, highly optimized, and aesthetically premium **Markdown-specialized Text Editor**.

### Added
- **New File Creation**: Direct support for creating new documents (`Untitled-X.md`) with a header button or `Ctrl + N` shortcut. Automatically defaults to RAW editor mode.
- **Markdown Insertion Toolbar (Cheat Sheet)**: A pinned horizontal formatting toolbar with modern SVG icons for Bold, Italic, Headings, Links, Images, Inline Code, Code Blocks, Quotes, Bullet Lists, Numbered Lists, Checklists, Tables, and Horizontal Rules.
- **Smart Formatting Placement**: Insertion tool dynamically wraps selected text or inserts editable placeholder templates.
- **Full Undo/Redo History Support**: Integrated formatting toolbar insertion with browser's native history stack (`execCommand`), allowing all quick-insert formatting actions to be undone using `Ctrl + Z`.
- **Keyboard Shortcut Hooks**: Supports inline hotkeys: `Ctrl + B` (Bold), `Ctrl + I` (Italic), `Ctrl + H` (Heading), and `Ctrl + K` (Link) directly within the editor.
- **Middle-Click Tab Close**: Middle mouse button (scroll wheel) clicks on tabs close them instantly, with native auto-scroll cursor behavior suppressed.
- **VS Code Style Dirty Indicator**: Replaced plaintext asterisks `*` with a modern, 18px solid white bullet (`●`) that dynamically transforms into a close button (`×`) when hovered.
- **Custom Confirm Modal**: Replaced native browser popups with a sleek, dark-themed, centered modal confirmation dialog matching the app's aesthetic, stripping out internal local IP addresses.
- **Remote Image Loading Support**: Updated Content Security Policy (CSP) to allow loading HTTP and HTTPS remote images.

### Optimized
- **Debounced Markdown Live Preview**: Preview compiler runs with a 150ms debounce on keystrokes, completely removing input/typing lag.
- **High-Performance Line Highlight**: Implemented DOM caching for the active line measurer, preventing layout thrashing and reflow bottlenecks during fast pengetikan.

### Fixed
- **Split View Tab Closing Bug**: Fixed layout issue where closing the last remaining tab in Split View left editor/preview panels misaligned.

---

## [1.0.0] - 2026-05-19
- Initial release migrating the Markdown Reader app from Electron to Neutralino.js.
- Reduced overall application size to under 2 MB with Edge WebView2 integration.
- Added dark mode styling, tab system, and split-view rendering.
