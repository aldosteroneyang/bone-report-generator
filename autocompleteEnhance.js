// ===========================
// autocompleteEnhance.js
// ===========================
(function (global) {
  // 存儲搜索緩存的對象，減少重複計算
  const searchCache = {
    lastQuery: '',
    lastCandidates: [],
    lastSortByLength: false,
    results: []
  };

  // 1. 優化後的 Fuzzy Search：增加權重計算和緩存
  function compactSearchText(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  function customFuzzySearch(query, candidate) {
    // 空查詢直接返回 true
    if (!query.trim()) return true;
    
    const tokens = query.toLowerCase().split(/\s+/).filter(token => token.trim().length > 0);
    const candidateLower = candidate.toLowerCase();
    const candidateCompact = compactSearchText(candidateLower);
    
    // 必須所有 tokens 都匹配
    return tokens.every(token => {
      const tokenCompact = compactSearchText(token);
      return candidateLower.includes(token) ||
        (tokenCompact !== '' && candidateCompact.includes(tokenCompact));
    });
  }

  function normalizedCandidateLength(candidate) {
    return String(candidate || '').replace(/\s+/g, ' ').trim().length;
  }

  function sortCandidatesByLength(candidateArray) {
    return candidateArray
      .map((item, index) => ({ item, index }))
      .sort((a, b) => {
        const lengthDiff = normalizedCandidateLength(a.item) - normalizedCandidateLength(b.item);
        return lengthDiff !== 0 ? lengthDiff : a.index - b.index;
      })
      .map(({ item }) => item);
  }

  // 2. 改良後的候選項來源 Factory：加入緩存機制，支持對象和數組
  function candidateSourceFactory(candidates, options = {}) {
    const sortByLength = options.sortByLength === true;

    return function(query, process) {
      // 存儲查詢，但使用閉包而非全局變數
      const currentQuery = query || "";
      
      // 將候選項轉換為數組（如果是對象則取鍵值）
      let candidateArray;
      if (Array.isArray(candidates)) {
        candidateArray = candidates;
      } else if (typeof candidates === 'object' && candidates !== null) {
        candidateArray = Object.keys(candidates);
      } else {
        candidateArray = [];
      }
      
      // 檢查緩存
      if (searchCache.lastQuery === currentQuery && 
          searchCache.lastCandidates === candidates &&
          searchCache.lastSortByLength === sortByLength) {
        process(searchCache.results);
        return;
      }
      
      // 沒有查詢詞時直接返回所有候選項
      if (!currentQuery) {
        searchCache.lastQuery = '';
        searchCache.lastCandidates = candidates;
        searchCache.lastSortByLength = sortByLength;
        searchCache.results = candidateArray;
        process(candidateArray);
        return;
      }
      
      // 過濾候選項
      const filtered = candidateArray.filter(item => customFuzzySearch(currentQuery, item));
      const results = sortByLength ? sortCandidatesByLength(filtered) : filtered;
      
      // 更新緩存
      searchCache.lastQuery = currentQuery;
      searchCache.lastCandidates = candidates;
      searchCache.lastSortByLength = sortByLength;
      searchCache.results = results;
      
      process(results);
    };
  }

  // 3. 優化的 Highlight 工具函式
  function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function escapeHtml(string) {
    return String(string).replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  // 緩存正則表達式以提高性能
  const regexCache = {};
  
  function highlightMatchingParts(candidate, query) {
    const tokens = query.split(/\s+/).filter(token => token.trim().length > 0);
    const source = String(candidate || '');
    if (tokens.length === 0) return escapeHtml(source);
    
    // 使用緩存的正則表達式
    const cacheKey = tokens.slice().sort().join('|');
    if (!regexCache[cacheKey]) {
      regexCache[cacheKey] = new RegExp(`(${tokens.map(escapeRegExp).join('|')})`, 'gi');
    }

    const regex = regexCache[cacheKey];
    let lastIndex = 0;
    let highlighted = '';

    source.replace(regex, (match, _group, offset) => {
      highlighted += escapeHtml(source.slice(lastIndex, offset));
      highlighted += `<span class="highlight">${escapeHtml(match)}</span>`;
      lastIndex = offset + match.length;
      return match;
    });

    highlighted += escapeHtml(source.slice(lastIndex));
    return highlighted;
  }

  // 4. 表格儲存格只用純文字 Renderer（選定後不高亮）
  function plainTextRenderer(instance, td, row, col, prop, value, cellProperties) {
    // 避免使用 apply 方法導致的上下文問題
    // Handsontable.renderers.TextRenderer.apply(this, arguments);
    
    // 直接操作 DOM 元素
    if (value !== null && value !== undefined) {
      td.textContent = value;
    } else {
      td.textContent = '';
    }
    
    return td;
  }

  function getDropdownVerticalSpaces(editor) {
    const view = editor?.hot?.view;
    const cellRect = editor?.getEditedCellRect?.();

    if (!view || !cellRect) {
      return { spaceAbove: 0, spaceBelow: Number.POSITIVE_INFINITY };
    }

    let spaceAbove = cellRect.top;
    if (typeof view.isVerticallyScrollableByWindow === 'function' &&
        typeof view.getTableOffset === 'function' &&
        view.isVerticallyScrollableByWindow()) {
      const topOffset = view.getTableOffset().top - (editor.hot.rootWindow?.scrollY || 0);
      spaceAbove = Math.max(spaceAbove + topOffset, 0);
    }

    const workspaceHeight = typeof view.getWorkspaceHeight === 'function'
      ? view.getWorkspaceHeight()
      : Number.POSITIVE_INFINITY;

    return {
      spaceAbove,
      spaceBelow: Math.max(workspaceHeight - spaceAbove - cellRect.height, 0)
    };
  }

  function keepDropdownBelowCell(editor) {
    const dropdownRoot = editor?.htEditor?.rootElement;
    if (!dropdownRoot) return;

    if (typeof editor.unflipDropdownVertically === 'function') {
      editor.unflipDropdownVertically();
      return;
    }

    dropdownRoot.style.position = 'absolute';
    dropdownRoot.style.top = '';
    editor.isFlippedVertically = false;
  }

  function getMinimumDropdownHeight(editor) {
    const choiceCount = editor?.strippedChoices?.length || editor?.htEditor?.countRows?.() || 0;
    if (choiceCount === 0) return 0;

    const rowHeight = editor?.htEditor?.stylesHandler?.getDefaultRowHeight?.() ||
      editor?.hot?.stylesHandler?.getDefaultRowHeight?.() ||
      23;

    return Math.min(choiceCount, 4) * rowHeight;
  }

  // 5. 封裝覆寫 AutocompleteEditor 的函式，使用局部變數替代全局變數
  function enhanceAutocompleteDropdown() {
    const AutocompleteEditor = Handsontable.editors.AutocompleteEditor;
    const originalOpen = AutocompleteEditor.prototype.open;
    const originalFinish = AutocompleteEditor.prototype.finishEditing;

    // Handsontable 會在下方空間不足時把 autocomplete list 翻到 cell 上方。
    // 這裡固定取消垂直翻轉，讓候選清單一律從目前 cell 下方展開。
    AutocompleteEditor.prototype.flipDropdownVerticallyIfNeeded = function() {
      const spaces = getDropdownVerticalSpaces(this);

      keepDropdownBelowCell(this);

      if (typeof this.limitDropdownIfNeeded === 'function' &&
          Number.isFinite(spaces.spaceBelow)) {
        this.limitDropdownIfNeeded(Math.max(spaces.spaceBelow, getMinimumDropdownHeight(this)));
        keepDropdownBelowCell(this);
      }

      return {
        isFlipped: false,
        spaceAbove: spaces.spaceAbove,
        spaceBelow: spaces.spaceBelow
      };
    };
    
    // 使用閉包保存查詢字符串，替代全局變數
    let lastQuery = '';

    // 覆寫 open：當下拉清單打開時，設定 htEditor 的外觀、renderer 等
    AutocompleteEditor.prototype.open = function() {
      originalOpen.apply(this, arguments);
      
      // 保存當前查詢字符串
      lastQuery = this.query || '';

      if (this.htEditor) {
        // 給下拉清單一個自訂 className，以便在 CSS 裡控制換行
        this.htEditor.updateSettings({
          className: 'myCustomDropdown',
          width: 600,       // 下拉清單寬度，可自行調整
          maxHeight: 400,   // 下拉清單最大高度，可自行調整
          wordWrap: true,
          autoWrapRow: true,
          colWidths: 600,   // 單欄情況下可直接指定欄寬
          // 下拉清單的 renderer：根據 query 做 highlight
          cells: (row, col) => ({
            renderer: (instance, td, row, col, prop, value) => {
              if (lastQuery && value) {
                // 使用純 DOM 操作方式設置內容，避免 TextRenderer 上下文問題
                td.innerHTML = highlightMatchingParts(value, lastQuery);
              } else {
                // 修正：直接設置內容，不調用 TextRenderer
                td.textContent = value || '';
              }
            }
          })
        });
      }
    };

    // 覆寫 finishEditing：選定後清除查詢緩存
    AutocompleteEditor.prototype.finishEditing = function(restoreOriginalValue, ctrlDown, callback) {
      lastQuery = '';
      originalFinish.apply(this, arguments);
    };
  }

  // 6. 清除緩存的方法 - 當窗口大小改變或者數據更新時使用
  function clearCaches() {
    searchCache.lastQuery = '';
    searchCache.lastCandidates = [];
    searchCache.lastSortByLength = false;
    searchCache.results = [];
    Object.keys(regexCache).forEach(key => delete regexCache[key]);
  }

  // 將這些函式掛到模組上，方便在別處引用
  global.autocompleteEnhance = {
    customFuzzySearch,
    candidateSourceFactory,
    highlightMatchingParts,
    plainTextRenderer,
    enhanceAutocompleteDropdown,
    clearCaches
  };

})(window);
