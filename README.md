# PLC Programme Viewer CMS

<p align="center">
  <img src="/screenshot.png">
</p>
<p align="center">
	Project code in pure HTML + CSS + JS
	<br />
	<a href="https://tentypcic.github.io/plc_program_viewer_cms/">View demo</a>
	·
	<a href="https://github.com/tentypcic/plc_program_viewer_cms/issues">Report Bug</a>
</p>

---

## 🧠 About The Project

A lightweight, in-browser CMS for organizing and displaying PLC program documentation (PDFs) exported from Siemens TIA Portal.

This template allows engineers to structure, edit, and visualize automation projects — directly in the browser, without a backend.

---

## 🛠 Features

- 📁 Add and organize **groups** and **program blocks**
- ✏️ Inline editing of names, titles, and links
- 📄 View **PDF files** within embedded viewer (e.g. OB/FB/FC/DB documentation)
- 💾 Save and import project structure as JSON
- 🔁 Restore default template
- 🧠 No backend required – works offline using `localStorage`

---

## 🧩 Structure

The CMS consists of:

- A sidebar menu for navigation
- PDF viewer pane (embedded `<iframe>`)
- JSON-based structure storage
- Title editor with persistent state
- Dialogs for adding blocks and groups dynamically

---

## 🚀 Getting Started

1. Clone or download this repository  
2. Open `plc_programme_viewer.html` in any modern browser  
3. Use the `Edit Mode` button to unlock full functionality  

> All data is saved locally in your browser (`localStorage`) – no server needed.

---

## 📁 File types

| Icon           | Meaning              |
|----------------|----------------------|
| `[OB]`         | Organization block   |
| `[FB]`         | Function block       |
| `[FC]`         | Function             |
| `[DB]`         | Data block           |
| `Input/Output` | PLC tag table        |

---

## 🧑‍💻 Author

Created by [tentypcic](https://github.com/tentypcic)  
© 2025 – Free for personal and commercial use under MIT license

---

## 📄 License

MIT License
