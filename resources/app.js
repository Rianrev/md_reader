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
const rawContainer = document.getElementById('raw-container');
const recentFilesList = document.getElementById('recent-files-list');
const newFileBtn = document.getElementById('new-file-btn');
const openFileBtn = document.getElementById('open-file-btn');
const toggleViewBtn = document.getElementById('toggle-view-btn');
const toggleViewText = document.getElementById('toggle-view-text');
const toggleSplitBtn = document.getElementById('toggle-split-btn');
const copyRawBtn = document.getElementById('copy-raw-btn');
const dragOverlay = document.getElementById('drag-overlay');
const toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');
const saveFileBtn = document.getElementById('save-file-btn');
const saveAsBtn = document.getElementById('save-as-btn');
const sidebar = document.querySelector('.sidebar');
const editorContainer = document.getElementById('editor-container');
const highlightLayer = document.getElementById('highlight-layer');
const activeLineHighlight = document.getElementById('active-line-highlight');
const hiddenMeasurer = document.getElementById('hidden-measurer');

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

// Initialization
async function init() {
  Neutralino.init();
  Neutralino.events.on('windowClose', () => {
      Neutralino.app.exit();
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
      if (isSplitView) {
        activeTab.scrollPosRaw = rawContainer.scrollTop;
        activeTab.scrollPosPreview = markdownContainer.scrollTop;
      } else if (isRawView) {
        activeTab.scrollPosRaw = rawContainer.scrollTop;
      } else {
        activeTab.scrollPosPreview = markdownContainer.scrollTop;
      }
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
    copyRawBtn.style.display = 'flex';
    
    if (isSplitView) {
      editorContainer.classList.add('active');
      markdownContainer.classList.add('active');
      rawContainer.value = activeTab.content;
      let html = marked.parse(activeTab.content);
      markdownContainer.innerHTML = html;
      
      setTimeout(() => {
        rawContainer.scrollTop = activeTab.scrollPosRaw || 0;
        markdownContainer.scrollTop = activeTab.scrollPosPreview || 0;
        updateHighlightPosition();
      }, 50);
      interceptLinks();
    } else {
      if (isRawView) {
        markdownContainer.classList.remove('active');
        editorContainer.classList.add('active');
        rawContainer.value = activeTab.content;
        setTimeout(() => {
          rawContainer.scrollTop = activeTab.scrollPosRaw || 0;
          updateHighlightPosition();
        }, 50);
      } else {
        editorContainer.classList.remove('active');
        markdownContainer.classList.add('active');
        let html = marked.parse(activeTab.content);
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

async function closeTab(filePath, event) {
  if (event) event.stopPropagation();
  
  const index = openTabs.findIndex(t => t.path === filePath);
  if (index === -1) return;

  const tab = openTabs[index];
  if (tab.isDirty) {
    const proceed = await showConfirmModal(`File "${tab.filename}" has unsaved changes. Close anyway?`);
    if (!proceed) return;
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
    } else if (document.activeElement === rawContainer && e.ctrlKey && !e.shiftKey) {
      const k = e.key.toLowerCase();
      if (k === 'b' || k === 'i' || k === 'h' || k === 'k') {
        e.preventDefault();
        if (k === 'b') insertMarkdown('bold');
        else if (k === 'i') insertMarkdown('italic');
        else if (k === 'h') insertMarkdown('heading');
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
        activeTab.scrollPosRaw = rawContainer.scrollTop;
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
  const textarea = rawContainer;
  if (!textarea) return;
  
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  const selected = text.substring(start, end);
  
  let replacement = '';
  let selOffsetStart = 0;
  let selOffsetEnd = 0;
  
  switch (type) {
    case 'bold':
      replacement = `**${selected || 'bold text'}**`;
      selOffsetStart = 2;
      selOffsetEnd = selected ? selected.length + 2 : 11;
      break;
    case 'italic':
      replacement = `*${selected || 'italic text'}*`;
      selOffsetStart = 1;
      selOffsetEnd = selected ? selected.length + 1 : 12;
      break;
    case 'heading':
      const isStartOfLine = start === 0 || text.charAt(start - 1) === '\n';
      const prefix = isStartOfLine ? '### ' : '\n### ';
      replacement = `${prefix}${selected || 'Heading'}`;
      selOffsetStart = prefix.length;
      selOffsetEnd = selected ? prefix.length + selected.length : prefix.length + 7;
      break;
    case 'link':
      replacement = `[${selected || 'link text'}](https://)`;
      selOffsetStart = 1;
      selOffsetEnd = selected ? selected.length + 1 : 10;
      break;
    case 'image':
      replacement = `![${selected || 'image alt'}](image_url)`;
      selOffsetStart = 2;
      selOffsetEnd = selected ? selected.length + 2 : 11;
      break;
    case 'inline-code':
      replacement = `\`${selected || 'code'}\``;
      selOffsetStart = 1;
      selOffsetEnd = selected ? selected.length + 1 : 5;
      break;
    case 'code-block':
      const codePrefix = start === 0 || text.charAt(start - 1) === '\n' ? '' : '\n';
      replacement = `${codePrefix}\`\`\`markdown\n${selected || 'code'}\n\`\`\`\n`;
      selOffsetStart = codePrefix.length + 12;
      selOffsetEnd = selected ? codePrefix.length + 12 + selected.length : codePrefix.length + 16;
      break;
    case 'quote':
      const qPrefix = start === 0 || text.charAt(start - 1) === '\n' ? '' : '\n';
      replacement = `${qPrefix}> ${selected || 'quote text'}`;
      selOffsetStart = qPrefix.length + 2;
      selOffsetEnd = selected ? qPrefix.length + 2 + selected.length : qPrefix.length + 12;
      break;
    case 'list':
      const lPrefix = start === 0 || text.charAt(start - 1) === '\n' ? '' : '\n';
      replacement = `${lPrefix}- ${selected || 'bullet item'}`;
      selOffsetStart = lPrefix.length + 2;
      selOffsetEnd = selected ? lPrefix.length + 2 + selected.length : lPrefix.length + 13;
      break;
    case 'num-list':
      const nlPrefix = start === 0 || text.charAt(start - 1) === '\n' ? '' : '\n';
      replacement = `${nlPrefix}1. ${selected || 'numbered item'}`;
      selOffsetStart = nlPrefix.length + 3;
      selOffsetEnd = selected ? nlPrefix.length + 3 + selected.length : nlPrefix.length + 16;
      break;
    case 'task':
      const tPrefix = start === 0 || text.charAt(start - 1) === '\n' ? '' : '\n';
      replacement = `${tPrefix}- [ ] ${selected || 'task item'}`;
      selOffsetStart = tPrefix.length + 6;
      selOffsetEnd = selected ? tPrefix.length + 6 + selected.length : tPrefix.length + 15;
      break;
    case 'table':
      const tbPrefix = start === 0 || text.charAt(start - 1) === '\n' ? '' : '\n';
      replacement = `${tbPrefix}| Header 1 | Header 2 |\n| -------- | -------- |\n| Cell 1   | Cell 2   |\n`;
      selOffsetStart = tbPrefix.length + 2;
      selOffsetEnd = tbPrefix.length + 10;
      break;
    case 'hr':
      const hrPrefix = start === 0 || text.charAt(start - 1) === '\n' ? '' : '\n';
      replacement = `${hrPrefix}---\n`;
      selOffsetStart = replacement.length;
      selOffsetEnd = replacement.length;
      break;
  }
  
  textarea.focus();
  
  let success = false;
  try {
    success = document.execCommand('insertText', false, replacement);
  } catch (err) {
    success = false;
  }
  
  if (!success) {
    textarea.value = text.substring(0, start) + replacement + text.substring(end);
    const event = new Event('input', { bubbles: true });
    textarea.dispatchEvent(event);
  }
  
  textarea.setSelectionRange(start + selOffsetStart, start + selOffsetEnd);
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

let currentCursorY = 0;
let measurerTextNode = null;
let measurerMarkerSpan = null;
let lastTextBefore = null;

function updateHighlightPosition() {
  if ((!isRawView && !isSplitView) || !activeTabPath) return;
  const activeTab = openTabs.find(t => t.path === activeTabPath);
  if (!activeTab) return;
  
  const val = rawContainer.value;
  const sel = rawContainer.selectionStart;
  
  let start = val.lastIndexOf('\n', sel - 1);
  start = start === -1 ? 0 : start + 1;
  
  let end = val.indexOf('\n', sel);
  if (end === -1) end = val.length;
  
  const textBefore = val.substring(0, start);
  const currentLine = val.substring(start, end).replace(/\r$/, '');
  const clientWidth = rawContainer.clientWidth;

  if (!measurerTextNode || !measurerMarkerSpan) {
    hiddenMeasurer.innerHTML = '';
    measurerTextNode = document.createTextNode('');
    measurerMarkerSpan = document.createElement('span');
    hiddenMeasurer.appendChild(measurerTextNode);
    hiddenMeasurer.appendChild(measurerMarkerSpan);
  }

  const widthStr = clientWidth + 'px';
  if (hiddenMeasurer.style.width !== widthStr) {
    hiddenMeasurer.style.width = widthStr;
  }

  if (lastTextBefore !== textBefore) {
    measurerTextNode.nodeValue = textBefore;
    lastTextBefore = textBefore;
  }

  const markerText = currentLine || '\u200b';
  if (measurerMarkerSpan.textContent !== markerText) {
    measurerMarkerSpan.textContent = markerText;
  }
  
  currentCursorY = measurerMarkerSpan.offsetTop;
  const highlightHeight = measurerMarkerSpan.getBoundingClientRect().height;
  
  activeLineHighlight.style.display = 'block';
  activeLineHighlight.style.top = '0px';
  
  const heightStr = highlightHeight + 'px';
  if (activeLineHighlight.style.height !== heightStr) {
    activeLineHighlight.style.height = heightStr;
  }
  
  syncHighlightScroll();
}

function syncHighlightScroll() {
  if ((!isRawView && !isSplitView) || activeLineHighlight.style.display === 'none') return;
  const viewportY = currentCursorY - rawContainer.scrollTop;
  activeLineHighlight.style.transform = `translateY(${viewportY}px)`;
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
  rawContainer.addEventListener('input', (e) => {
    const activeTab = openTabs.find(t => t.path === activeTabPath);
    if (activeTab) {
      activeTab.content = e.target.value;
      if (!activeTab.isDirty) {
        activeTab.isDirty = true;
        renderTabs();
      }
      if (isSplitView) {
        updateLivePreview(e.target.value);
      }
    }
    updateHighlightPosition();
  });

  document.addEventListener('selectionchange', () => {
    if (document.activeElement === rawContainer) {
      updateHighlightPosition();
    }
  });
  
  rawContainer.addEventListener('scroll', syncHighlightScroll);

  saveFileBtn.addEventListener('click', saveActiveFile);
  saveAsBtn.addEventListener('click', saveAsActiveFile);
  newFileBtn.addEventListener('click', createNewFile);
  openFileBtn.addEventListener('click', handleOpenFileAction);
  toggleViewBtn.addEventListener('click', toggleViewMode);
  toggleSplitBtn.addEventListener('click', toggleSplitMode);
  toggleSidebarBtn.addEventListener('click', () => {
    sidebar.classList.toggle('hidden');
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
      insertMarkdown(type);
    });
  });

  setupDragAndDrop();
  setupKeyboardShortcuts();
}

init();
