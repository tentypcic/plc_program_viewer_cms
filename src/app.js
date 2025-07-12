let editMode = false;
let editTarget = null;

const menuData = [
    {
        title: "Program blocks",
        icon: '<img class="icon" src="images/program_blocks.png">',
        items: []
    },
    {
        title: "PLC tags",
        icon: '<img class="icon" src="images/plc_tags.png">',
        items: []
    },
    {
        title: "PLC data types",
        icon: '<img class="icon" src="images/plc_data_types.png">',
        items: []
    }
];

const defaultMenuData = JSON.parse(JSON.stringify(menuData));
const savedData = localStorage.getItem("menuData");
if (savedData) {
    try {
        const savedMenuData = JSON.parse(savedData);
        if (Array.isArray(savedMenuData)) {
            menuData.length = 0;
            menuData.push(...savedMenuData);
        }
    } catch {}
}

const savedTitle = localStorage.getItem("pageTitle");
if (savedTitle) {
    document.getElementById("titleText").textContent = savedTitle;
}

document.querySelector(".title").addEventListener("click", (e) => {
    if (e.target.id === "editTitleBtn") return;
    document.getElementById("pdfViewer").src = "default.html";
    localStorage.removeItem("activePdf");
    document.querySelectorAll(".group-label.active").forEach(el => el.classList.remove("active"));
});

document.getElementById("editTitleBtn").onclick = () => {
    editTarget = { isTitle: true, text: document.getElementById("titleText").textContent };
    document.getElementById("editText").value = editTarget.text;
    document.getElementById("editLinkGroup").style.display = "none";
    document.getElementById("editOverlay").style.display = "flex";
};

function getIconSrc(text, sectionTitle = "", item = null) {
    if (sectionTitle === "PLC tags") return 'images/tag_table.png';
    if (item?.fblock && sectionTitle === "PLC data types") return 'images/f_udt.png';
    if (sectionTitle === "PLC data types") return 'images/udt.png';
    if (item?.fblock && text.includes('[OB')) return 'images/f_ob.png';
    if (item?.fblock && text.includes('[FB')) return 'images/f_fb.png';
    if (item?.fblock && text.includes('[FC')) return 'images/f_fc.png';
    if (item?.fblock && text.includes('[DB')) return 'images/f_db.png';
    if (text.includes('[OB')) return 'images/ob.png';
    if (text.includes('[FB')) return 'images/fb.png';
    if (text.includes('[FC')) return 'images/fc.png';
    if (text.includes('[DB')) return 'images/db.png';
    return 'images/unknown.png';
}

function loadPDF(link) {
    localStorage.setItem("activePdf", link); // <== zapisz
    document.getElementById("pdfViewer").src = link;
}

function buildItem(item, parentList, sectionTitle = "") {
    const li = document.createElement("li");
    li._data = item;
    li._parent = parentList;

    const row = document.createElement("div");
    row.className = "menu-row";

    const icon = document.createElement("img");
    icon.className = "icon";
    icon.src = getIconSrc(item.text, sectionTitle, item);

    const label = document.createElement("span");
    label.className = "group-label";
    label.textContent = item.text;

    // GRUPA
    let arrow;
    if (item.children) {
        li.classList.add("group");

        arrow = document.createElement("span");
        arrow.className = "arrow";
        arrow.textContent = "▶";

        row.appendChild(arrow); // strzałka
        row.appendChild(icon);  // ikona grupy
        row.appendChild(label); // nazwa

    } else {
        // BLOK
        row.appendChild(icon);  // ikona bloku
        row.appendChild(label); // nazwa
    }

    // PRZYCISKI EDYCJI
    if (editMode) {
        const controls = document.createElement("span");
        controls.className = "edit-controls";

        const editBtn = document.createElement("button");
        editBtn.textContent = "✏️";
        editBtn.onclick = () => {
            editTarget = item;
            document.getElementById("editText").value = item.text;
            document.getElementById("editLinkGroup").style.display = item.link !== undefined ? "block" : "none";
            document.getElementById("editLink").value = item.link || "";
            document.getElementById("editOverlay").style.display = "flex";
        };

        const delBtn = document.createElement("button");
        delBtn.textContent = "🗑";
        delBtn.onclick = () => {
            const idx = parentList.indexOf(item);
            if (idx > -1) parentList.splice(idx, 1);
            localStorage.setItem("menuData", JSON.stringify(menuData));
            renderMenu();
        };

        controls.appendChild(editBtn);
        controls.appendChild(delBtn);
        row.appendChild(controls);
    }

    li.appendChild(row);

    // Jeśli to grupa — submenu + toggle
    if (item.children) {
        const submenu = document.createElement("ul");
        submenu.classList.add("submenu");
        item.children.forEach(child => submenu.appendChild(buildItem(child, item.children)));
        li.appendChild(submenu);

        li.addEventListener("click", e => {
            if (e.target === li || e.target === row || e.target === label || e.target === arrow) {
                const isOpen = submenu.style.display === "block";
                submenu.style.display = isOpen ? "none" : "block";
                arrow.textContent = isOpen ? "▶" : "▼";
            }
        });

        icon.src = "images/group.png";
    } else {
        // Jeśli to blok
        label.style.cursor = "pointer";
        label.addEventListener("click", e => {
            e.preventDefault();
            document.querySelectorAll(".group-label").forEach(el => el.classList.remove("active"));
            label.classList.add("active");
            loadPDF(item.link);
        });
    }

    return li;
}

function renderMenu() {
    const container = document.getElementById("menuContainer");
    container.innerHTML = "";
    menuData.forEach(section => {
        const h4 = document.createElement("h4");
        h4.innerHTML = `${section.icon} ${section.title}`;
        container.appendChild(h4);

        const ul = document.createElement("ul");
        section.items.forEach(item => ul.appendChild(buildItem(item, section.items, section.title)));
        container.appendChild(ul);
    });
}

function setupDialogs() {
	document.getElementById("confirmEdit").onclick = () => {
		const newText = document.getElementById("editText").value.trim();
		const newLink = document.getElementById("editLink").value.trim();
		const errorBox = document.getElementById("editError");

		if (!newText || (editTarget?.link !== undefined && !newLink)) {
			errorBox.textContent = "Please fill in all fields.";
			errorBox.style.display = "block";
			setTimeout(() => errorBox.style.display = "none", 3000);
			return;
		}

		if (editTarget && editTarget.isTitle) {
			document.getElementById("titleText").textContent = newText;
			localStorage.setItem("pageTitle", newText);
		} else {
			editTarget.text = newText;
			if (editTarget.link !== undefined) editTarget.link = newLink;
			localStorage.setItem("menuData", JSON.stringify(menuData));
			renderMenu();
		}

		document.getElementById("editOverlay").style.display = "none";
	};


    document.getElementById("cancelEdit").onclick = () => {
        document.getElementById("editOverlay").style.display = "none";
    };
}

function highlightLastActive() {
    const lastPdf = localStorage.getItem("activePdf");
    if (lastPdf) {
        const labels = document.querySelectorAll(".menu .group-label");
        labels.forEach(label => {
            const item = label.parentElement.parentElement._data;
            if (item?.link === lastPdf) {
                label.classList.add("active");
            }
        });
        document.getElementById("pdfViewer").src = lastPdf;
    }
}

document.getElementById("toggleEdit").onclick = () => {
    editMode = !editMode;
    document.getElementById("saveJson").style.display = editMode ? "inline" : "none";
    document.getElementById("importJson").style.display = editMode ? "inline" : "none";
    document.getElementById("reset").style.display = editMode ? "inline" : "none";
    document.getElementById("editTitleBtn").style.display = editMode ? "inline" : "none";
    renderMenu();
};

document.getElementById("saveJson").onclick = () => {
    const blob = new Blob([JSON.stringify(menuData, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "menu-export.json";
    a.click();
};

document.getElementById("importJson").onclick = () => document.getElementById("fileInput").click();

document.getElementById("fileInput").onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const importedData = JSON.parse(reader.result);
            if (!Array.isArray(importedData)) throw new Error("Invalid format");
            menuData.length = 0;
            menuData.push(...importedData);
            localStorage.setItem("menuData", JSON.stringify(menuData));
            renderMenu();
        } catch {
            alert("Failed to import JSON.");
        }
    };
    reader.readAsText(file);
};

document.getElementById("reset").onclick = () => {
    menuData.length = 0;
    menuData.push(...JSON.parse(JSON.stringify(defaultMenuData)));
    localStorage.removeItem("menuData");
    renderMenu();
};

setupDialogs();
renderMenu();
highlightLastActive();

function populateTargetOptions() {
    const select = document.getElementById("targetPath");
    select.innerHTML = "";
    const placeholderOption = document.createElement("option");
    placeholderOption.value = "";
    placeholderOption.textContent = "Select target location...";
    placeholderOption.disabled = true;
    placeholderOption.selected = true;
    select.appendChild(placeholderOption);
    menuData.forEach(section => {
        select.appendChild(new Option(section.title, section.title));
        section.items.forEach(item => addGroupOptions(item, section.title));
    });

    function addGroupOptions(item, basePath) {
        if (item.children) {
            const fullPath = basePath + " > " + item.text;
            select.appendChild(new Option(fullPath, fullPath));
            item.children.forEach(child => addGroupOptions(child, fullPath));
        }
    }
}

function openAddDialog(type) {
    document.getElementById("dialogTitle").textContent = (type === "group") ? "Add Group" : "Add Block";
    document.getElementById("nameLabel").textContent = (type === "group") ? "Group Name:" : "Block Name:";
    document.getElementById("newName").value = "";
    document.getElementById("newLink").value = "";
    document.getElementById("linkField").style.display = (type === "group") ? "none" : "";
    document.getElementById("fbOptions").style.display = (type === "block") ? "block" : "none";
    document.getElementById("createFBlock").checked = false;
    document.getElementById("overlay").dataset.type = type;
    populateTargetOptions();
    document.getElementById("overlay").style.display = "flex";
}

document.getElementById("addBlock").onclick = () => openAddDialog("block");
document.getElementById("addGroup").onclick = () => openAddDialog("group");

document.getElementById("confirmAdd").onclick = () => {
    const overlay = document.getElementById("overlay");
    const type = overlay.dataset.type;
    const targetPath = document.getElementById("targetPath").value;
    const newName = document.getElementById("newName").value.trim();
    const newLink = document.getElementById("newLink").value.trim();
    const errorBox = document.getElementById("formError");

    if (!targetPath || !newName || (type === "block" && !newLink)) {
        errorBox.textContent = "Please fill in all fields.";
        errorBox.style.display = "block";
        setTimeout(() => errorBox.style.display = "none", 3000);
        return;
    }

    errorBox.style.display = "none";
    const parts = targetPath.split(" > ");
    const section = menuData.find(sec => sec.title === parts[0]);
    if (!section) return;

    let parentArray = section.items;
    for (let i = 1; i < parts.length; i++) {
        const groupName = parts[i];
        const item = parentArray.find(it => it.text === groupName);
        if (!item) return;
        if (!item.children) item.children = [];
        parentArray = item.children;
    }

    if (type === "block") {
        const isFBlock = document.getElementById("createFBlock").checked;
        parentArray.push({ text: newName, link: newLink, fblock: isFBlock });
    } else {
        parentArray.push({ text: newName, children: [] });
    }

    parentArray.sort((a, b) => {
	const isGroupA = !!a.children;
	const isGroupB = !!b.children;

	if (isGroupA && !isGroupB) return 1;
	if (!isGroupA && isGroupB) return -1;

	function getPriority(text) {
		if (text.includes('[OB')) return 1;
		if (text.includes('[FC')) return 2;
		if (text.includes('[FB')) return 3;
		if (text.includes('[DB')) return 4;
		return 5;
	}

	return getPriority(a.text) - getPriority(b.text) || a.text.localeCompare(b.text);
    });

    document.getElementById("overlay").style.display = "none";
    localStorage.setItem("menuData", JSON.stringify(menuData));
    renderMenu();
};

document.getElementById("cancelAdd").onclick = () => {
    document.getElementById("overlay").style.display = "none";
};
