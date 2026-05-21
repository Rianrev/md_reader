// State
let openTabs = [];
let activeTabPath = null;
let recentFiles = [];
let isRawView = false;
let isSplitView = false;
let untitledCount = 0;

// DOM Elements
const tabsList = document.getElementById('tabs-list');
const emptyState = document.getElementById('empty-state');
const markdownContainer = document.getElementById('markdown-container');
const rawEditorContainer = document.getElementById('raw-editor-container');
let editor = null;
const recentFilesList = document.getElementById('recent-files-list');
const newFileBtn = document.getElementById('menu-new');
const openFileBtn = document.getElementById('menu-open');
const toggleViewBtn = document.getElementById('toggle-view-btn');
const toggleViewText = document.getElementById('toggle-view-text');
const toggleSplitBtn = document.getElementById('toggle-split-btn');
const copyRawBtn = document.getElementById('copy-raw-btn');
const dragOverlay = document.getElementById('drag-overlay');
const toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');
const saveFileBtn = document.getElementById('menu-save');
const saveAsBtn = document.getElementById('menu-save-as');
const saveDivider = document.getElementById('menu-divider-save');
const undoBtn = document.getElementById('menu-undo');
const redoBtn = document.getElementById('menu-redo');
const exitBtn = document.getElementById('menu-exit');
const sidebar = document.querySelector('.sidebar');
const editorContainer = document.getElementById('editor-container');

// Initialize Marked.js
marked.setOptions({
  highlight: function(code, lang) {
    const language = hljs.getLanguage(lang) ? lang : 'plaintext';
    return hljs.highlight(code, { language }).value;
  },
  langPrefix: 'hljs language-'
});

const renderer = new marked.Renderer();

function arrayBufferToBase64(buffer) {
  let binary = '';
  let bytes = new Uint8Array(buffer);
  let len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// Custom image rendering for local files
renderer.image = function(href, title, text) {
  if (typeof href === 'object' && href !== null) {
    text = href.text;
    title = href.title;
    href = href.href;
  }

  if (/^https?:\/\//i.test(href) || /^data:/i.test(href)) {
    return `<img src="${href}" alt="${text || ''}" title="${title || ''}">`;
  }
  
  let resolvedPath = href;
  if (!/^([a-zA-Z]:[\\\/]|\/)/.test(href)) {
    if (activeTabPath) {
      const isWin = activeTabPath.includes('\\');
      const sep = isWin ? '\\' : '/';
      const lastSepIndex = activeTabPath.lastIndexOf(sep);
      const dir = activeTabPath.substring(0, lastSepIndex);
      
      let parts = dir.split(sep).filter(Boolean);
      let drive = '';
      if (isWin && parts[0] && parts[0].endsWith(':')) {
         drive = parts.shift() + sep;
      } else if (!isWin && activeTabPath.startsWith('/')) {
         drive = '/';
      }
      
      const hrefParts = href.split(/[\\\/]/).filter(Boolean);
      for(const p of hrefParts) {
         if (p === '..') parts.pop();
         else if (p !== '.') parts.push(p);
      }
      
      resolvedPath = drive + parts.join(sep);
    }
  }
  
  const imgId = 'img-' + Math.random().toString(36).substr(2, 9);
  setTimeout(async () => {
    try {
      const arrayBuffer = await Neutralino.filesystem.readBinaryFile(resolvedPath);
      const base64 = arrayBufferToBase64(arrayBuffer);
      const ext = resolvedPath.split('.').pop().toLowerCase();
      const mime = ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'gif' ? 'image/gif' : ext === 'svg' ? 'image/svg+xml' : 'image/png';
      const el = document.getElementById(imgId);
      if (el) el.src = `data:${mime};base64,${base64}`;
    } catch(e) {
      console.error('Error loading image', resolvedPath, e);
    }
  }, 0);

  return `<img id="${imgId}" src="" alt="${text || ''}" title="${title || ''}">`;
};

// Add copy button to code blocks
renderer.code = function(code, language, isEscaped) {
  if (typeof code === 'object' && code !== null) {
    language = code.lang;
    isEscaped = code.escaped;
    code = code.text;
  }

  let highlighted;
  if (language && hljs.getLanguage(language)) {
    highlighted = hljs.highlight(code, { language }).value;
  } else {
    highlighted = hljs.highlightAuto(code).value;
  }
  const escapedCode = code.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<pre><button class="copy-btn" onclick="copyCode(this)" data-code="${escapedCode}">Copy</button><code class="hljs ${language || ''}">${highlighted}</code></pre>`;
};

marked.use({ renderer });

// Global copy function
window.copyCode = function(btn) {
  const code = btn.getAttribute('data-code');
  navigator.clipboard.writeText(code).then(() => {
    const originalText = btn.innerText;
    btn.innerText = 'Copied!';
    setTimeout(() => {
      btn.innerText = originalText;
    }, 2000);
  });
};

async function exitApp() {
  const dirtyTabs = openTabs.filter(t => t.isDirty);
  if (dirtyTabs.length > 0) {
    const noun = dirtyTabs.length > 1 ? 'files' : 'file';
    const proceed = await showConfirmModal(`You have unsaved changes in ${dirtyTabs.length} ${noun}. Exit anyway?`);
    if (!proceed) return;
  }
  try {
    await Neutralino.filesystem.removeFile('.tmp/app_instance.json');
  } catch (e) {}
  Neutralino.app.exit();
}

// Initialization
async function init() {
  Neutralino.init();
  Neutralino.events.on('windowClose', exitApp);
  
  const isMain = await handleSingleInstance();
  if (!isMain) return;
  
  editor = CodeMirror(rawEditorContainer, {
    mode: {
      name: 'markdown',
      tokenTypeOverrides: {
        code: 'code'
      }
    },
    lineWrapping: true,
    lineNumbers: false
  });

  editor.on('change', (cm) => {
    const activeTab = openTabs.find(t => t.path === activeTabPath);
    if (activeTab) {
      const val = cm.getValue();
      activeTab.content = val;
      if (!activeTab.isDirty) {
        activeTab.isDirty = true;
        renderTabs();
      }
      if (isSplitView) {
        updateLivePreview(val);
      }
    }
  });

  editor.on('cursorActivity', (cm) => {
    const activeTab = openTabs.find(t => t.path === activeTabPath);
    if (!activeTab) return;
    
    const cur = cm.getCursor();
    if (activeTab.lastActiveLineNum !== undefined && activeTab.lastActiveLineNum !== null && activeTab.lastActiveLineNum !== cur.line) {
      try {
        cm.removeLineClass(activeTab.lastActiveLineNum, 'background', 'CodeMirror-activeline-background');
      } catch (e) {}
    }
    cm.addLineClass(cur.line, 'background', 'CodeMirror-activeline-background');
    activeTab.lastActiveLineNum = cur.line;
  });

  await updateRecentsSidebar();
  setupEventListeners();

  let initialFilePath = null;
  if (window.NL_ARGS && window.NL_ARGS.length > 1) {
    initialFilePath = window.NL_ARGS.find(arg => arg.toLowerCase().endsWith('.md') || arg.toLowerCase().endsWith('.markdown'));
  }

  if (initialFilePath) {
    openFile(initialFilePath);
  }
}

async function updateRecentsSidebar() {
  try {
    const data = await Neutralino.storage.getData('recents');
    recentFiles = JSON.parse(data);
  } catch (e) {
    recentFiles = [];
  }
  
  // Filter out files that no longer exist
  const validRecents = [];
  let changed = false;
  for (const file of recentFiles) {
    try {
      await Neutralino.filesystem.getStats(file);
      validRecents.push(file);
    } catch (e) {
      changed = true;
    }
  }
  
  if (changed) {
    recentFiles = validRecents;
    await Neutralino.storage.setData('recents', JSON.stringify(recentFiles));
  }
  
  recentFilesList.innerHTML = '';
  recentFiles.forEach(filePath => {
    const filename = extractFilename(filePath);
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="recent-filename" title="${filename}">${filename}</div>
      <div class="recent-path" title="${filePath}">${filePath}</div>
    `;
    li.addEventListener('click', () => openFile(filePath));
    recentFilesList.appendChild(li);
  });
}

async function addRecent(filePath) {
  if (!filePath || filePath.startsWith('untitled:')) return;
  recentFiles = recentFiles.filter(p => p !== filePath);
  recentFiles.unshift(filePath);
  if (recentFiles.length > 10) {
    recentFiles = recentFiles.slice(0, 10);
  }
  await Neutralino.storage.setData('recents', JSON.stringify(recentFiles));
  await updateRecentsSidebar();
}

function extractFilename(filePath) {
  const sep = filePath.includes('\\') ? '\\' : '/';
  const parts = filePath.split(sep);
  return parts[parts.length - 1];
}

async function handleOpenFileAction() {
  let entries = await Neutralino.os.showOpenDialog('Open Markdown', {
    filters: [{name: 'Markdown', extensions: ['md', 'markdown']}]
  });
  if (entries.length > 0) {
    const filePath = entries[0];
    try {
      const content = await Neutralino.filesystem.readFile(filePath);
      await openFileResult(filePath, content);
    } catch (e) {
      alert(`Error reading file: ${e.message}`);
    }
  }
}

async function openFile(filePath) {
  const existingTabIndex = openTabs.findIndex(t => t.path === filePath);
  if (existingTabIndex !== -1) {
    switchTab(filePath);
    return;
  }

  try {
    const content = await Neutralino.filesystem.readFile(filePath);
    await openFileResult(filePath, content);
  } catch (error) {
    alert(`Error reading file: ${error.message}`);
  }
}

async function openFileResult(filePath, content) {
  if (openTabs.length >= 10) {
    alert("Maximum of 10 tabs allowed. Please close a tab first.");
    return;
  }

  const filename = extractFilename(filePath);
  const newTab = {
    path: filePath,
    filename,
    content,
    doc: new CodeMirror.Doc(content || '', { name: 'markdown', tokenTypeOverrides: { code: 'code' } }),
    scrollPosRaw: 0,
    scrollPosPreview: 0,
    isDirty: false
  };

  openTabs.push(newTab);
  await addRecent(filePath);
  switchTab(filePath);
}

function switchTab(filePath) {
  if (activeTabPath && activeTabPath !== filePath) {
    const activeTab = openTabs.find(t => t.path === activeTabPath);
    if (activeTab) {
      activeTab.scrollPosPreview = markdownContainer.scrollTop;
    }
  }

  activeTabPath = filePath;
  renderTabs();
  
  if (!filePath) {
    emptyState.classList.add('active');
    markdownContainer.classList.remove('active');
    editorContainer.classList.remove('active');
    
    const contentArea = document.getElementById('content-area');
    if (contentArea) {
      contentArea.classList.remove('split');
    }
    isSplitView = false;
    toggleSplitBtn.classList.remove('active');
    toggleViewBtn.style.pointerEvents = 'auto';
    toggleViewBtn.style.opacity = '1';

    toggleViewBtn.style.display = 'none';
    toggleSplitBtn.style.display = 'none';
    copyRawBtn.style.display = 'none';
    saveFileBtn.style.display = 'none';
    saveAsBtn.style.display = 'none';
    saveDivider.style.display = 'none';
    document.title = 'MD Reader';
    return;
  }

  const activeTab = openTabs.find(t => t.path === filePath);
  if (activeTab) {
    emptyState.classList.remove('active');
    toggleViewBtn.style.display = 'flex';
    toggleSplitBtn.style.display = 'flex';
    saveFileBtn.style.display = 'flex';
    saveAsBtn.style.display = 'flex';
    saveDivider.style.display = 'block';
    copyRawBtn.style.display = 'flex';
    
    if (editor) {
      editor.swapDoc(activeTab.doc);
      setTimeout(() => {
        editor.refresh();
      }, 50);
    }
    
    if (isSplitView) {
      editorContainer.classList.add('active');
      markdownContainer.classList.add('active');
      let html = marked.parse(activeTab.doc.getValue());
      markdownContainer.innerHTML = html;
      
      setTimeout(() => {
        markdownContainer.scrollTop = activeTab.scrollPosPreview || 0;
      }, 50);
      interceptLinks();
    } else {
      if (isRawView) {
        markdownContainer.classList.remove('active');
        editorContainer.classList.add('active');
      } else {
        editorContainer.classList.remove('active');
        markdownContainer.classList.add('active');
        let html = marked.parse(activeTab.doc.getValue());
        markdownContainer.innerHTML = html;
        
        setTimeout(() => {
          markdownContainer.scrollTop = activeTab.scrollPosPreview || 0;
        }, 50);
        interceptLinks();
      }
    }

    document.title = `${activeTab.filename} — MD Reader`;
  }
}

function showConfirmModal(message) {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirm-modal');
    const messageEl = document.getElementById('confirm-modal-message');
    const yesBtn = document.getElementById('confirm-modal-yes');
    const noBtn = document.getElementById('confirm-modal-no');

    messageEl.textContent = message;
    modal.classList.add('active');

    const cleanup = (value) => {
      modal.classList.remove('active');
      yesBtn.onclick = null;
      noBtn.onclick = null;
      resolve(value);
    };

    yesBtn.onclick = () => cleanup(true);
    noBtn.onclick = () => cleanup(false);
  });
}

function showSaveCloseConfirmModal(message) {
  return new Promise((resolve) => {
    const modal = document.getElementById('save-confirm-modal');
    const messageEl = document.getElementById('save-confirm-modal-message');
    const saveBtn = document.getElementById('save-confirm-save');
    const dontSaveBtn = document.getElementById('save-confirm-dontsave');
    const cancelBtn = document.getElementById('save-confirm-cancel');

    messageEl.textContent = message;
    modal.classList.add('active');

    const cleanup = (value) => {
      modal.classList.remove('active');
      saveBtn.onclick = null;
      dontSaveBtn.onclick = null;
      cancelBtn.onclick = null;
      resolve(value);
    };

    saveBtn.onclick = () => cleanup('save');
    dontSaveBtn.onclick = () => cleanup('dontsave');
    cancelBtn.onclick = () => cleanup('cancel');
  });
}

async function closeTab(filePath, event) {
  if (event) event.stopPropagation();
  
  const index = openTabs.findIndex(t => t.path === filePath);
  if (index === -1) return;

  const tab = openTabs[index];
  if (tab.isDirty) {
    const choice = await showSaveCloseConfirmModal(`Do you want to save the changes you made to ${tab.filename}?`);
    if (choice === 'cancel') {
      return;
    } else if (choice === 'save') {
      const prevActivePath = activeTabPath;
      if (activeTabPath !== filePath) {
        switchTab(filePath);
      }
      await saveActiveFile();
      if (tab.isDirty) {
        if (prevActivePath && prevActivePath !== filePath) {
          switchTab(prevActivePath);
        }
        return;
      }
    }
  }

  openTabs.splice(index, 1);
  
  if (openTabs.length === 0) {
    switchTab(null);
  } else if (filePath === activeTabPath) {
    const nextTab = openTabs[index] || openTabs[index - 1];
    switchTab(nextTab.path);
  } else {
    renderTabs();
  }
}

function renderTabs() {
  tabsList.innerHTML = '';
  openTabs.forEach(tab => {
    const li = document.createElement('li');
    li.className = `tab ${tab.path === activeTabPath ? 'active' : ''} ${tab.isDirty ? 'dirty' : ''}`;
    li.title = tab.path;
    
    const titleSpan = document.createElement('span');
    titleSpan.className = 'tab-title';
    titleSpan.textContent = tab.filename;
    
    const closeBtn = document.createElement('div');
    closeBtn.className = 'tab-close';
    closeBtn.title = "Close tab (Ctrl+W)";
    closeBtn.onclick = (e) => closeTab(tab.path, e);

    li.appendChild(titleSpan);
    li.appendChild(closeBtn);
    li.onclick = () => switchTab(tab.path);
    li.onmousedown = (e) => {
      if (e.button === 1) {
        e.preventDefault();
        closeTab(tab.path, e);
      }
    };
    
    tabsList.appendChild(li);
  });
}

function interceptLinks() {
  const links = markdownContainer.querySelectorAll('a');
  links.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const href = link.getAttribute('href');
      if (href && /^https?:\/\//i.test(href)) {
        Neutralino.os.open(href);
      }
    });
  });
}

function setupDragAndDrop() {
  document.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      dragOverlay.classList.add('active');
    }
  });

  document.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.target === dragOverlay) {
      dragOverlay.classList.remove('active');
    }
  });

  document.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragOverlay.classList.remove('active');
    // Using Neutralino's windowDrop event instead of this handler to get valid file paths
  });
  
  Neutralino.events.on('windowDrop', (evt) => {
      dragOverlay.classList.remove('active');
      evt.detail.forEach(path => {
          if (path.toLowerCase().endsWith('.md') || path.toLowerCase().endsWith('.markdown')) {
              openFile(path);
          }
      });
  });
}

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      createNewFile();
    } else if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'o') {
      e.preventDefault();
      handleOpenFileAction();
    } else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 's') {
      e.preventDefault();
      saveAsActiveFile();
    } else if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 's') {
      e.preventDefault();
      saveActiveFile();
    } else if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'w') {
      e.preventDefault();
      if (activeTabPath) {
        closeTab(activeTabPath);
      }
    } else if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'q') {
      e.preventDefault();
      toggleViewMode();
    } else if (e.ctrlKey && e.key === 'Tab') {
      e.preventDefault();
      if (openTabs.length > 1 && activeTabPath) {
        const currentIndex = openTabs.findIndex(t => t.path === activeTabPath);
        if (e.shiftKey) {
          const prevIndex = (currentIndex - 1 + openTabs.length) % openTabs.length;
          switchTab(openTabs[prevIndex].path);
        } else {
          const nextIndex = (currentIndex + 1) % openTabs.length;
          switchTab(openTabs[nextIndex].path);
        }
      }
    } else if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'e') {
      e.preventDefault();
      toggleSplitMode();
    } else if (editor && editor.hasFocus() && e.ctrlKey && !e.shiftKey) {
      const k = e.key.toLowerCase();
      if (k === 'b' || k === 'i' || k === 'h' || k === 'k') {
        e.preventDefault();
        if (k === 'b') insertMarkdown('bold');
        else if (k === 'i') insertMarkdown('italic');
        else if (k === 'h') insertMarkdown('h3');
        else if (k === 'k') insertMarkdown('link');
      }
    }
  });
}

function toggleViewMode() {
  if (activeTabPath) {
    const activeTab = openTabs.find(t => t.path === activeTabPath);
    if (activeTab) {
      if (isRawView) {
        activeTab.scrollPosRaw = editor ? editor.getScrollInfo().top : 0;
      } else {
        activeTab.scrollPosPreview = markdownContainer.scrollTop;
      }
    }
  }
  isRawView = !isRawView;
  toggleViewText.textContent = isRawView ? 'Preview' : 'Raw';
  if (activeTabPath) switchTab(activeTabPath);
}

function toggleSplitMode() {
  isSplitView = !isSplitView;
  toggleSplitBtn.classList.toggle('active', isSplitView);
  
  const contentArea = document.getElementById('content-area');
  if (isSplitView) {
    contentArea.classList.add('split');
    toggleViewBtn.style.pointerEvents = 'none';
    toggleViewBtn.style.opacity = '0.4';
  } else {
    contentArea.classList.remove('split');
    toggleViewBtn.style.pointerEvents = 'auto';
    toggleViewBtn.style.opacity = '1';
  }
  
  if (activeTabPath) switchTab(activeTabPath);
}

function createNewFile() {
  if (openTabs.length >= 10) {
    alert("Maximum of 10 tabs allowed. Please close a tab first.");
    return;
  }
  untitledCount++;
  const tempPath = `untitled:${untitledCount}`;
  const filename = `Untitled-${untitledCount}.md`;
  const newTab = {
    path: tempPath,
    filename,
    content: '',
    doc: new CodeMirror.Doc('', { name: 'markdown', tokenTypeOverrides: { code: 'code' } }),
    scrollPosRaw: 0,
    scrollPosPreview: 0,
    isDirty: false
  };
  openTabs.push(newTab);
  
  if (!isRawView && !isSplitView) {
    isRawView = true;
    toggleViewText.textContent = 'Preview';
  }
  
  switchTab(tempPath);
}

async function saveActiveFile() {
  const activeTab = openTabs.find(t => t.path === activeTabPath);
  if (activeTab) {
    if (activeTab.path.startsWith('untitled:')) {
      await saveAsActiveFile();
    } else if (activeTab.isDirty) {
      try {
        await Neutralino.filesystem.writeFile(activeTab.path, activeTab.content);
        activeTab.isDirty = false;
        renderTabs();
      } catch (e) {
        alert(`Error saving file: ${e.message}`);
      }
    }
  }
}

function insertMarkdown(type) {
  if (!editor) return;
  
  const selection = editor.getSelection();
  const doc = editor.getDoc();
  const cursor = doc.getCursor();
  
  let replacement = '';
  let selectionOffset = null;
  
  switch (type) {
    case 'bold':
      replacement = `**${selection || 'bold text'}**`;
      selectionOffset = { start: 2, end: selection ? selection.length + 2 : 11 };
      break;
    case 'italic':
      replacement = `*${selection || 'italic text'}*`;
      selectionOffset = { start: 1, end: selection ? selection.length + 1 : 12 };
      break;
    case 'h1': {
      const isStartOfLine = cursor.ch === 0;
      const prefix = isStartOfLine ? '# ' : '\n# ';
      replacement = `${prefix}${selection || 'Heading 1'}`;
      selectionOffset = { start: prefix.length, end: selection ? prefix.length + selection.length : prefix.length + 9 };
      break;
    }
    case 'h2': {
      const isStartOfLine = cursor.ch === 0;
      const prefix = isStartOfLine ? '## ' : '\n## ';
      replacement = `${prefix}${selection || 'Heading 2'}`;
      selectionOffset = { start: prefix.length, end: selection ? prefix.length + selection.length : prefix.length + 9 };
      break;
    }
    case 'h3': {
      const isStartOfLine = cursor.ch === 0;
      const prefix = isStartOfLine ? '### ' : '\n### ';
      replacement = `${prefix}${selection || 'Heading 3'}`;
      selectionOffset = { start: prefix.length, end: selection ? prefix.length + selection.length : prefix.length + 9 };
      break;
    }
    case 'link':
      replacement = `[${selection || 'link text'}](https://)`;
      selectionOffset = { start: 1, end: selection ? selection.length + 1 : 10 };
      break;
    case 'image':
      replacement = `![${selection || 'image alt'}](image_url)`;
      selectionOffset = { start: 2, end: selection ? selection.length + 2 : 11 };
      break;
    case 'inline-code':
      replacement = `\`${selection || 'code'}\``;
      selectionOffset = { start: 1, end: selection ? selection.length + 1 : 5 };
      break;
    case 'code-block':
      const isSOLCode = cursor.ch === 0;
      const codePrefix = isSOLCode ? '' : '\n';
      replacement = `${codePrefix}\`\`\`markdown\n${selection || 'code'}\n\`\`\`\n`;
      selectionOffset = { start: codePrefix.length + 12, end: selection ? codePrefix.length + 12 + selection.length : codePrefix.length + 16 };
      break;
    case 'quote':
      const isSOLQ = cursor.ch === 0;
      const qPrefix = isSOLQ ? '' : '\n';
      replacement = `${qPrefix}> ${selection || 'quote text'}`;
      selectionOffset = { start: qPrefix.length + 2, end: selection ? qPrefix.length + 2 + selection.length : qPrefix.length + 12 };
      break;
    case 'list':
      const isSOLL = cursor.ch === 0;
      const lPrefix = isSOLL ? '' : '\n';
      replacement = `${lPrefix}- ${selection || 'bullet item'}`;
      selectionOffset = { start: lPrefix.length + 2, end: selection ? lPrefix.length + 2 + selection.length : lPrefix.length + 13 };
      break;
    case 'num-list':
      const isSOLNL = cursor.ch === 0;
      const nlPrefix = isSOLNL ? '' : '\n';
      replacement = `${nlPrefix}1. ${selection || 'numbered item'}`;
      selectionOffset = { start: nlPrefix.length + 3, end: selection ? nlPrefix.length + 3 + selection.length : nlPrefix.length + 16 };
      break;
    case 'task':
      const isSOLT = cursor.ch === 0;
      const tPrefix = isSOLT ? '' : '\n';
      replacement = `${tPrefix}- [ ] ${selection || 'task item'}`;
      selectionOffset = { start: tPrefix.length + 6, end: selection ? tPrefix.length + 6 + selection.length : tPrefix.length + 15 };
      break;
    case 'table':
      const isSOLTb = cursor.ch === 0;
      const tbPrefix = isSOLTb ? '' : '\n';
      replacement = `${tbPrefix}| Header 1 | Header 2 |\n| -------- | -------- |\n| Cell 1   | Cell 2   |\n`;
      selectionOffset = { start: tbPrefix.length + 2, end: tbPrefix.length + 10 };
      break;
    case 'hr':
      const isSOLHr = cursor.ch === 0;
      const hrPrefix = isSOLHr ? '' : '\n';
      replacement = `${hrPrefix}---\n`;
      selectionOffset = { start: replacement.length, end: replacement.length };
      break;
  }
  
  editor.focus();
  
  const anchor = doc.getCursor("anchor");
  const head = doc.getCursor("head");
  let startCursor = anchor;
  if (anchor.line > head.line || (anchor.line === head.line && anchor.ch > head.ch)) {
    startCursor = head;
  }
  
  doc.replaceSelection(replacement);
  
  if (selectionOffset) {
    const lines = replacement.substring(0, selectionOffset.start).split('\n');
    const startLine = startCursor.line + lines.length - 1;
    const startCh = (lines.length > 1 ? 0 : startCursor.ch) + lines[lines.length - 1].length;
    
    const endLines = replacement.substring(0, selectionOffset.end).split('\n');
    const endLine = startCursor.line + endLines.length - 1;
    const endCh = (endLines.length > 1 ? 0 : startCursor.ch) + endLines[endLines.length - 1].length;
    
    doc.setSelection({ line: startLine, ch: startCh }, { line: endLine, ch: endCh });
  }
}

async function saveAsActiveFile() {
  const activeTab = openTabs.find(t => t.path === activeTabPath);
  if (activeTab) {
    try {
      const newPath = await Neutralino.os.showSaveDialog('Save Markdown As', {
        defaultPath: activeTab.filename,
        filters: [{name: 'Markdown', extensions: ['md', 'markdown']}]
      });
      if (newPath) {
        await Neutralino.filesystem.writeFile(newPath, activeTab.content);
        activeTab.path = newPath;
        activeTabPath = newPath;
        activeTab.filename = extractFilename(newPath);
        activeTab.isDirty = false;
        await addRecent(newPath);
        renderTabs();
        document.title = `${activeTab.filename} — MD Reader`;
      }
    } catch (e) {
      alert(`Error saving file: ${e.message}`);
    }
  }
}



let previewTimeout = null;
function updateLivePreview(content) {
  if (previewTimeout) clearTimeout(previewTimeout);
  previewTimeout = setTimeout(() => {
    markdownContainer.innerHTML = marked.parse(content);
    interceptLinks();
  }, 150);
}

function setupEventListeners() {
  saveFileBtn.addEventListener('click', saveActiveFile);
  saveAsBtn.addEventListener('click', saveAsActiveFile);
  newFileBtn.addEventListener('click', createNewFile);
  openFileBtn.addEventListener('click', handleOpenFileAction);
  toggleViewBtn.addEventListener('click', toggleViewMode);
  toggleSplitBtn.addEventListener('click', toggleSplitMode);
  toggleSidebarBtn.addEventListener('click', () => {
    sidebar.classList.toggle('hidden');
  });
  
  undoBtn.addEventListener('click', () => {
    if (editor) {
      editor.focus();
      editor.undo();
    }
  });
  
  redoBtn.addEventListener('click', () => {
    if (editor) {
      editor.focus();
      editor.redo();
    }
  });

  exitBtn.addEventListener('click', exitApp);

  // Menu bar dropdown interactivity logic
  const menuItems = document.querySelectorAll('.menu-item');
  let isMenuOpen = false;

  menuItems.forEach(item => {
    item.addEventListener('click', (e) => {
      // If click was inside the dropdown menu, close it and stop toggling
      if (e.target.closest('.dropdown-menu')) {
        menuItems.forEach(mi => mi.classList.remove('active'));
        isMenuOpen = false;
        return;
      }

      e.stopPropagation();
      const isActive = item.classList.contains('active');
      
      // Close all first
      menuItems.forEach(mi => mi.classList.remove('active'));
      
      if (!isActive) {
        item.classList.add('active');
        isMenuOpen = true;
      } else {
        isMenuOpen = false;
      }
    });

    item.addEventListener('mouseenter', () => {
      if (isMenuOpen) {
        menuItems.forEach(mi => mi.classList.remove('active'));
        item.classList.add('active');
      }
    });
  });

  // Heading dropdown interactivity
  const headingBtn = document.getElementById('tb-heading-btn');
  const headingDropdown = document.querySelector('.tb-dropdown');
  const headingDropdownItems = document.querySelectorAll('.tb-dropdown-item');

  if (headingBtn && headingDropdown) {
    headingBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Close top menus
      menuItems.forEach(mi => mi.classList.remove('active'));
      isMenuOpen = false;
      
      headingDropdown.classList.toggle('active');
    });

    headingDropdownItems.forEach(item => {
      item.addEventListener('click', (e) => {
        const type = item.getAttribute('data-type');
        if (type) insertMarkdown(type);
        headingDropdown.classList.remove('active');
      });
    });
  }

  // Close menus when clicking outside
  document.addEventListener('click', () => {
    menuItems.forEach(mi => mi.classList.remove('active'));
    isMenuOpen = false;
    if (headingDropdown) {
      headingDropdown.classList.remove('active');
    }
  });

  copyRawBtn.addEventListener('click', () => {
    const activeTab = openTabs.find(t => t.path === activeTabPath);
    if (activeTab) {
      navigator.clipboard.writeText(activeTab.content).then(() => {
        const originalHtml = copyRawBtn.innerHTML;
        copyRawBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!`;
        setTimeout(() => {
          copyRawBtn.innerHTML = originalHtml;
        }, 2000);
      });
    }
  });
  
  document.querySelectorAll('.tb-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const type = btn.getAttribute('data-type');
      if (type) {
        insertMarkdown(type);
      }
    });
  });

  setupDragAndDrop();
  setupKeyboardShortcuts();
}

async function isPidRunning(pid) {
  try {
    let cmd = '';
    if (window.NL_OS === 'Windows') {
      cmd = `tasklist /FI "PID eq ${pid}"`;
    } else {
      cmd = `ps -p ${pid}`;
    }
    const res = await Neutralino.os.execCommand(cmd);
    return res.stdout && res.stdout.includes(pid.toString());
  } catch (e) {
    return false;
  }
}

async function handleSingleInstance() {
  try {
    await Neutralino.filesystem.createDirectory('.tmp');
  } catch (e) {}
  try {
    await Neutralino.filesystem.createDirectory('.tmp/open_queue');
  } catch (e) {}

  let argFilePath = null;
  if (window.NL_ARGS && window.NL_ARGS.length > 1) {
    argFilePath = window.NL_ARGS.find(arg => arg.toLowerCase().endsWith('.md') || arg.toLowerCase().endsWith('.markdown'));
  }

  let existingInstance = null;
  try {
    const fileContent = await Neutralino.filesystem.readFile('.tmp/app_instance.json');
    existingInstance = JSON.parse(fileContent);
  } catch (e) {}

  if (existingInstance && existingInstance.pid) {
    const isRunning = await isPidRunning(existingInstance.pid);
    if (isRunning) {
      if (argFilePath) {
        const queueFile = `.tmp/open_queue/q_${Date.now()}_${Math.floor(Math.random() * 1000)}.json`;
        try {
          await Neutralino.filesystem.writeFile(queueFile, JSON.stringify({ path: argFilePath }));
        } catch (e) {
          console.error("Failed to write to open queue:", e);
        }
      }
      Neutralino.app.exit();
      return false;
    }
  }

  try {
    await Neutralino.filesystem.writeFile('.tmp/app_instance.json', JSON.stringify({ pid: window.NL_PID }));
  } catch (e) {
    console.error("Failed to write app instance file:", e);
  }

  try {
    const files = await Neutralino.filesystem.readDirectory('.tmp/open_queue');
    for (const file of files) {
      if (file.entry !== '.' && file.entry !== '..') {
        await Neutralino.filesystem.removeFile(`.tmp/open_queue/${file.entry}`);
      }
    }
  } catch (e) {}

  setInterval(async () => {
    try {
      const files = await Neutralino.filesystem.readDirectory('.tmp/open_queue');
      let focused = false;
      for (const file of files) {
        if (file.entry.startsWith('q_') && file.type === 'FILE') {
          const filePath = `.tmp/open_queue/${file.entry}`;
          try {
            const contentStr = await Neutralino.filesystem.readFile(filePath);
            const data = JSON.parse(contentStr);
            if (data && data.path) {
              openFile(data.path);
              if (!focused) {
                await Neutralino.window.focus();
                focused = true;
              }
            }
          } catch (e) {
            console.error("Error reading queue file:", e);
          }
          try {
            await Neutralino.filesystem.removeFile(filePath);
          } catch (e) {}
        }
      }
    } catch (e) {}
  }, 500);

  return true;
}

init();
