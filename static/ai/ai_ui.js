/*
AI plugin UI layer.

Goals:
- Keep changes portable: do not require deep edits in app.js.
- Provide an "AI mode" panel for Subtasks and High-level prompts.
- Expose prompt/config editors (subtask_prompt.txt, vqa_prompt.txt, system/user templates).

This file assumes app.js provides window.LeRobotAnnotate.selectEpisode(...) and state.currentEpisode.
*/

(() => {
  window.__AI_UI_LOADED__ = true;
  const API = {
    status: '/api/ai/status',
    config: '/api/ai/config',
    promptsSubtask: '/api/ai/prompts/subtask',
    promptsVqa: '/api/ai/prompts/vqa',
    subtasks: '/api/ai/subtasks',
    fakeVqa: '/api/ai/fake_vqa',
  };

  const state = {
    available: false,
    cfg: null,
    promptSubtask: '',
    promptVqa: '',
  };

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') node.className = v;
      else if (k === 'style') node.setAttribute('style', v);
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else if (v !== undefined && v !== null) node.setAttribute(k, v);
    }
    const arr = Array.isArray(children) ? children : [children];
    for (const c of arr) {
      if (c === undefined || c === null) continue;
      if (typeof c === 'string') node.appendChild(document.createTextNode(c));
      else node.appendChild(c);
    }
    return node;
  }

  async function fetchJSON(url, options = {}) {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    const text = await res.text();
    let obj = null;
    try { obj = text ? JSON.parse(text) : null; } catch (e) { obj = { _raw: text }; }
    if (!res.ok) {
      const msg = (obj && (obj.detail || obj.error)) || `${res.status} ${res.statusText}`;
      throw new Error(msg);
    }
    return obj;
  }

  function getEpisodeIndex() {
    const api = window.LeRobotAnnotate || window.leRobotAnnotate || null;
    if (!api || !api.state) {
      // Fallbacks for older app.js (global binding or window property)
      const st = (typeof state !== 'undefined') ? state : (window.state || window.APP_STATE || null);
      if (!st) throw new Error('LeRobotAnnotate not loaded');
      const ep = st.currentEpisode;
    if (ep === null || ep === undefined) throw new Error('No episode selected');
    return ep;
  }
    const ep = api.state.currentEpisode;
    if (ep === null || ep === undefined) throw new Error('No episode selected');
    return ep;
  }

  async function reloadEpisode(ep) {
    const api = window.LeRobotAnnotate || window.leRobotAnnotate || null;
    if (api && typeof api.selectEpisode === 'function') {
      await api.selectEpisode(ep);
      return;
    }
    if (typeof window.selectEpisode === 'function') {
      await window.selectEpisode(ep);
    }
  }

  function setStatus(statusEl, ok, msg) {
    statusEl.className = 'ai-status ' + (ok ? 'ok' : 'err');
    statusEl.textContent = msg;
  }

  // ===============================
  // Episode list AI shortcuts (per-episode buttons + batch run)
  // ===============================

  function _readFloat(id, fallback) {
    const n = parseFloat((document.getElementById(id) || {}).value);
    return Number.isFinite(n) ? n : fallback;
  }
  function _readInt(id, fallback) {
    const n = parseInt((document.getElementById(id) || {}).value, 10);
    return Number.isFinite(n) ? n : fallback;
  }
  function _readStr(id, fallback) {
    const v = (document.getElementById(id) || {}).value;
    return (v !== undefined && v !== null && String(v).trim() !== '') ? String(v) : fallback;
  }

  function parseEpisodeIndexFromLi(li) {
    if (!li) return null;
    const t = (li.firstChild && li.firstChild.nodeType === Node.TEXT_NODE) ? li.firstChild.textContent : li.textContent;
    const m = String(t || '').match(/Episode\s+(\d+)/i);
    return m ? parseInt(m[1], 10) : null;
  }

  function getEpisodeIndicesFromDOM() {
    const list = document.getElementById('episodeList');
    if (!list) return [];
    const out = [];
    list.querySelectorAll('li').forEach((li) => {
      const idx = parseEpisodeIndexFromLi(li);
      if (Number.isFinite(idx)) out.push(idx);
    });
    // Unique + sorted
    return Array.from(new Set(out)).sort((a, b) => a - b);
  }

  function getEpisodeIndices() {
    // Prefer app-exported state, fallback to DOM
    const api = window.LeRobotAnnotate || window.leRobotAnnotate || null;
    if (api && api.state && Array.isArray(api.state.episodes)) {
      const xs = api.state.episodes.map((e) => e.episode_index).filter((x) => Number.isFinite(x));
      if (xs.length) return Array.from(new Set(xs)).sort((a, b) => a - b);
    }
    // Global binding fallback (non-window const)
    try {
      // eslint-disable-next-line no-undef
      if (typeof state !== 'undefined' && Array.isArray(state.episodes)) {
        // eslint-disable-next-line no-undef
        const xs = state.episodes.map((e) => e.episode_index).filter((x) => Number.isFinite(x));
        if (xs.length) return Array.from(new Set(xs)).sort((a, b) => a - b);
      }
    } catch (_) {}
    const st = window.state || window.APP_STATE || null;
    if (st && Array.isArray(st.episodes)) {
      const xs = st.episodes.map((e) => e.episode_index).filter((x) => Number.isFinite(x));
      if (xs.length) return Array.from(new Set(xs)).sort((a, b) => a - b);
    }
    return getEpisodeIndicesFromDOM();
  }

  function ensureEpisodeBatchUI() {
    const header = document.querySelector('.episodes-header');
    if (!header) return;
    if (header.querySelector('#aiEpisodeBatchBar')) return;

    const bar = el('div', { id: 'aiEpisodeBatchBar', class: 'ai-batch-actions' }, [
      el('button', { class: 'btn ghost ai-batch-btn', type: 'button', id: 'aiBatchSubtasksAll' }, ['SubtaskAI all']),
      el('button', { class: 'btn ghost ai-batch-btn', type: 'button', id: 'aiBatchVqaAll' }, ['Fake VQA all']),
      el('button', { class: 'btn ghost ai-batch-btn', type: 'button', id: 'aiBatchCancel', style: 'display:none' }, ['Cancel']),
      el('div', { id: 'aiBatchStatus', class: 'ai-batch-status' }, ['']),
    ]);
    header.appendChild(bar);

    const btnSub = bar.querySelector('#aiBatchSubtasksAll');
    const btnVqa = bar.querySelector('#aiBatchVqaAll');
    const btnCancel = bar.querySelector('#aiBatchCancel');

    btnSub.addEventListener('click', () => runBatchAll('subtasks'));
    btnVqa.addEventListener('click', () => runBatchAll('fake_vqa'));
    btnCancel.addEventListener('click', () => {
      _batchAbort = true;
      setBatchStatus('Canceling...');
    });
  }

  function setBatchStatus(msg) {
    const elx = document.getElementById('aiBatchStatus');
    if (elx) elx.textContent = msg || '';
  }

  function injectEpisodeRowButtons() {
    const list = document.getElementById('episodeList');
    if (!list) return;

    list.querySelectorAll('li').forEach((li) => {
      if (li.querySelector('.ai-ep-actions')) return;

      const idx = parseEpisodeIndexFromLi(li);
      if (!Number.isFinite(idx)) return;

      const dur = li.querySelector('span');
      if (!dur) return;

      // Wrap duration + buttons into a right-aligned flex container,
      // keeping the original left text node intact.
      const wrap = el('div', { class: 'ai-ep-actions' }, []);
      dur.replaceWith(wrap);
      wrap.appendChild(dur);

      const bSub = el('button', { class: 'btn ghost ai-ep-btn', type: 'button', title: 'Run Subtask AI for this episode' }, ['S-AI']);
      const bVqa = el('button', { class: 'btn ghost ai-ep-btn', type: 'button', title: 'Run Fake VQA for this episode' }, ['V-AI']);

      bSub.addEventListener('click', (e) => {
        e.stopPropagation();
        runEpisodeAI('subtasks', idx, { mode: 'replace', resume: false }).catch(() => {});
      });
      bVqa.addEventListener('click', (e) => {
        e.stopPropagation();
        runEpisodeAI('fake_vqa', idx, { mode: 'replace', resume: false }).catch(() => {});
      });

      wrap.appendChild(bSub);
      wrap.appendChild(bVqa);
    });
  }

  let _batchRunning = false;
  let _batchAbort = false;

  async function runEpisodeAI(kind, episodeIndex, opts = {}) {
    if (!state.available) throw new Error('AI plugin not enabled');

    if (kind === 'subtasks') {
      const cfg = (state.cfg && state.cfg.subtasks) || {};
      const body = {
        episode_index: episodeIndex,
        stride_s: _readFloat('ai_sub_stride_s', cfg.stride_s ?? 2.0),
        summary_frames: _readInt('ai_sub_summary_frames', cfg.summary_frames ?? 16),
        segment_frames: _readInt('ai_sub_segment_frames', cfg.segment_frames ?? 6),
        max_steps: _readInt('ai_sub_max_steps', cfg.max_steps ?? 60),
        mode: opts.mode || (opts.resume ? 'append' : 'replace'),
        resume_from_last: !!opts.resume,
        merge_adjacent: (cfg.merge_adjacent ?? true),
        language: _readStr('ai_sub_language', cfg.language ?? 'zh'),
      };
      if (opts.start_time_s !== undefined && opts.start_time_s !== null) body.start_time_s = opts.start_time_s;
      await fetchJSON(API.subtasks, { method: 'POST', body: JSON.stringify(body) });
    } else if (kind === 'fake_vqa') {
      const cfg = (state.cfg && state.cfg.fake_vqa) || {};
      const body = {
        episode_index: episodeIndex,
        stride_s: _readFloat('ai_vqa_stride_s', cfg.stride_s ?? 6.0),
        window_s: _readFloat('ai_vqa_window_s', cfg.window_s ?? 2.0),
        window_frames: _readInt('ai_vqa_window_frames', cfg.window_frames ?? 3),
        mode: opts.mode || (opts.resume ? 'append' : 'replace'),
        resume_from_last: !!opts.resume,
        start_time_s: (opts.start_time_s !== undefined ? opts.start_time_s : null),
        language: _readStr('ai_vqa_language', cfg.language ?? 'en'),
        scenario_type: _readStr('ai_vqa_scenario_type', cfg.scenario_type ?? 'vqa'),
        response_type: _readStr('ai_vqa_response_type', cfg.response_type ?? 'answer'),
        skill: _readStr('ai_vqa_skill', cfg.skill ?? 'fake_vqa'),
      };
      await fetchJSON(API.fakeVqa, { method: 'POST', body: JSON.stringify(body) });
    } else {
      throw new Error(`Unknown AI kind: ${kind}`);
    }

    // Refresh current episode if needed (avoid switching episodes during batch).
    try {
      const cur = getEpisodeIndex();
      if (cur === episodeIndex) await reloadEpisode(episodeIndex);
    } catch (_) {}
  }

  async function runBatchAll(kind) {
    if (_batchRunning) return;
    _batchRunning = true;
    _batchAbort = false;

    ensureEpisodeBatchUI();
    const bar = document.getElementById('aiEpisodeBatchBar');
    const btnSub = document.getElementById('aiBatchSubtasksAll');
    const btnVqa = document.getElementById('aiBatchVqaAll');
    const btnCancel = document.getElementById('aiBatchCancel');

    if (btnSub) btnSub.disabled = true;
    if (btnVqa) btnVqa.disabled = true;
    if (btnCancel) btnCancel.style.display = '';
    setBatchStatus('Starting...');

    const indices = getEpisodeIndices();
    if (!indices.length) {
      setBatchStatus('No episodes found.');
      if (btnSub) btnSub.disabled = false;
      if (btnVqa) btnVqa.disabled = false;
      if (btnCancel) btnCancel.style.display = 'none';
      _batchRunning = false;
      return;
    }

    for (let i = 0; i < indices.length; i++) {
      if (_batchAbort) break;
      const ep = indices[i];
      setBatchStatus(`${kind}  ${i + 1}/${indices.length}  Episode ${ep} ...`);
      try {
        await runEpisodeAI(kind, ep, { mode: 'replace', resume: false });
      } catch (e) {
        setBatchStatus(`${kind}  Episode ${ep} failed: ${String(e && e.message ? e.message : e)}`);
        // continue
      }
      // allow UI to breathe
      await new Promise((r) => setTimeout(r, 50));
    }

    if (_batchAbort) setBatchStatus('Canceled.');
    else setBatchStatus('Done.');

    if (btnSub) btnSub.disabled = false;
    if (btnVqa) btnVqa.disabled = false;
    if (btnCancel) btnCancel.style.display = 'none';
    _batchRunning = false;
  }

  function patchEpisodeListHooks() {
    ensureEpisodeBatchUI();

    // Patch renderEpisodes so we can add per-episode AI buttons after it runs.
    try {
      if (typeof window.renderEpisodes === 'function' && !window.__AI_PATCHED_RENDER_EPISODES__) {
        const orig = window.renderEpisodes;
        window.renderEpisodes = function patchedRenderEpisodes() {
          const out = orig.apply(this, arguments);
          try {
            ensureEpisodeBatchUI();
            injectEpisodeRowButtons();
          } catch (_) {}
          return out;
        };
        window.__AI_PATCHED_RENDER_EPISODES__ = true;
      }
    } catch (_) {}

    // MutationObserver fallback
    const list = document.getElementById('episodeList');
    if (list && !list.__aiObserverAttached) {
      const mo = new MutationObserver(() => {
        try {
          ensureEpisodeBatchUI();
          injectEpisodeRowButtons();
        } catch (_) {}
      });
      mo.observe(list, { childList: true, subtree: false });
      list.__aiObserverAttached = true;
    }

    // One-time initial injection
    injectEpisodeRowButtons();
  }


  async function loadPluginState() {
    try {
      await fetchJSON(API.status);
      state.available = true;
    } catch (e) {
      state.available = false;
      return;
    }

    const cfgPayload = await fetchJSON(API.config);
    state.cfg = (cfgPayload && cfgPayload.config) ? cfgPayload.config : cfgPayload;
    const p1 = await fetchJSON(API.promptsSubtask);
    const p2 = await fetchJSON(API.promptsVqa);
    state.promptSubtask = (p1 && p1.text) || '';
    state.promptVqa = (p2 && p2.text) || '';
  }

  function mountSubtasksPanel() {
    const panel = document.getElementById('subtasksPanel');
    if (!panel) return;

    const segForm = panel.querySelector('.segment-form');
    if (!segForm) return;

    const actionsRow =
      (segForm.querySelector('#addSubtask') && segForm.querySelector('#addSubtask').closest('.row')) ||
      (segForm.querySelector('.row.actions')) ||
      (segForm.querySelectorAll('.row').length ? segForm.querySelectorAll('.row')[segForm.querySelectorAll('.row').length - 1] : null);
    if (!actionsRow) return;

    // Avoid double-mount.
    if (panel.querySelector('#aiSubtasksPanel')) return;

    const toggleBtn = el('button', { class: 'btn secondary ai-mode-toggle', type: 'button' }, ['AI mode']);
    actionsRow.appendChild(toggleBtn);

    // Build AI panel.
    const cfg = (state.cfg && state.cfg.subtasks) || {};

    const baseUrl = el('input', { type: 'text', value: (state.cfg && state.cfg.openai_base_url) || '' });
    const modelName = el('input', { type: 'text', value: (state.cfg && state.cfg.model) || '' });
    const apiKey = el('input', { type: 'password', value: (state.cfg && state.cfg.openai_api_key) || '' });

    const stride = el('input', { id: 'ai_sub_stride_s', type: 'number', step: '0.1', value: cfg.stride_s ?? 2.0 });
    const summaryFrames = el('input', { id: 'ai_sub_summary_frames', type: 'number', step: '1', value: cfg.summary_frames ?? 6 });
    const segmentFrames = el('input', { id: 'ai_sub_segment_frames', type: 'number', step: '1', value: cfg.segment_frames ?? 8 });
    const maxSteps = el('input', { id: 'ai_sub_max_steps', type: 'number', step: '1', value: cfg.max_steps ?? 200 });
    const language = el('input', { id: 'ai_sub_language', type: 'text', value: cfg.language ?? 'auto' });
    const resumeFromLast = el('input', { type: 'checkbox' });
    const mergeAdjacent = el('input', { type: 'checkbox' });
    mergeAdjacent.checked = true;

    const systemPrompt = el('textarea', { rows: '5' }, [(cfg.system_prompt || '').trim()]);
    const userTemplate = el('textarea', { rows: '6' }, [(cfg.user_prompt_template || '').trim()]);
    const demoTxt = el('textarea', { rows: '10' }, [state.promptSubtask || '']);

    const status = el('div', { class: 'ai-status' }, ['']);

    const saveCfgBtn = el('button', { class: 'btn secondary', type: 'button' }, ['Save settings']);
    saveCfgBtn.addEventListener('click', async () => {
      try {
        const newCfg = JSON.parse(JSON.stringify(state.cfg || {}));
        newCfg.openai_base_url = (baseUrl.value || '').trim();
        newCfg.model = (modelName.value || '').trim();
        newCfg.openai_api_key = (apiKey.value || '').trim();
        newCfg.subtasks = newCfg.subtasks || {};
        newCfg.subtasks.stride_s = parseFloat(stride.value || '2');
        newCfg.subtasks.summary_frames = parseInt(summaryFrames.value || '6', 10);
        newCfg.subtasks.segment_frames = parseInt(segmentFrames.value || '8', 10);
        newCfg.subtasks.max_steps = parseInt(maxSteps.value || '200', 10);
        newCfg.subtasks.language = (language.value || 'auto').trim();
        newCfg.subtasks.system_prompt = systemPrompt.value;
        newCfg.subtasks.user_prompt_template = userTemplate.value;
        await fetchJSON(API.config, { method: 'PUT', body: JSON.stringify({ config: newCfg }) });
        const cfgPayload = await fetchJSON(API.config);
    state.cfg = (cfgPayload && cfgPayload.config) ? cfgPayload.config : cfgPayload;
        setStatus(status, true, 'Saved subtasks settings.');
      } catch (e) {
        setStatus(status, false, `Save settings failed: ${e.message}`);
      }
    });

    const saveDemoBtn = el('button', { class: 'btn secondary', type: 'button' }, ['Save subtask_prompt.txt']);
    saveDemoBtn.addEventListener('click', async () => {
      try {
        await fetchJSON(API.promptsSubtask, { method: 'PUT', body: JSON.stringify({ text: demoTxt.value }) });
        setStatus(status, true, 'Saved subtask_prompt.txt.');
      } catch (e) {
        setStatus(status, false, `Save subtask_prompt.txt failed: ${e.message}`);
      }
    });

    const runBtn = el('button', { class: 'btn primary', type: 'button' }, ['Generate AI Subtasks']);
    runBtn.addEventListener('click', async () => {
      try {
        const ep = getEpisodeIndex();
        const body = {
          episode_index: ep,
          stride_s: parseFloat(stride.value || '2'),
          summary_frames: parseInt(summaryFrames.value || '6', 10),
          segment_frames: parseInt(segmentFrames.value || '8', 10),
          max_steps: parseInt(maxSteps.value || '200', 10),
          mode: (resumeFromLast.checked ? 'append' : 'replace'),
          resume_from_last: !!resumeFromLast.checked,
          merge_adjacent: !!mergeAdjacent.checked,
          language: (language.value || 'auto').trim(),
        };
        await fetchJSON(API.subtasks, { method: 'POST', body: JSON.stringify(body) });
        setStatus(status, true, 'Subtasks generated and saved.');
        await reloadEpisode(ep);
      } catch (e) {
        setStatus(status, false, `AI subtasks failed: ${e.message}`);
      }
    });

    const aiPanel = el('div', { id: 'aiSubtasksPanel', class: 'ai-panel hidden' }, [
      el('div', { class: 'ai-section-title' }, ['AI Subtasks settings']),
      el('div', { class: 'ai-section-title', style: 'margin-top:10px;' }, ['Backend settings']),
      el('div', { class: 'ai-grid', style: 'margin-top:10px;' }, [
        el('label', {}, ['Base URL', baseUrl]),
        el('label', {}, ['Model', modelName]),
        el('label', {}, ['API key', apiKey]),
      ]),
      el('div', { class: 'ai-grid' }, [
        el('label', {}, ['Stride (s)', stride]),
        el('label', {}, ['Summary frames', summaryFrames]),
        el('label', {}, ['Max steps', maxSteps]),
        el('label', {}, ['Language (auto/zh/en)', language]),
        el('label', { class: 'ai-row' }, [resumeFromLast, el('span', {}, ['Resume from last segment'])]),
        el('label', { class: 'ai-row' }, [mergeAdjacent, el('span', {}, ['Merge adjacent same labels'])]),
      ]),
      el('div', { class: 'ai-section-title', style: 'margin-top:12px;' }, ['Prompts (editable)']),
      el('div', { class: 'ai-grid-1' }, [
        el('label', {}, ['System prompt', systemPrompt]),
        el('label', {}, ['User prompt template (placeholders: {episode_summary} {examples} {time_s} {language})', userTemplate]),
        el('label', {}, ['subtask_prompt.txt (one label example per line)', demoTxt]),
      ]),
      el('div', { class: 'ai-grid', style: 'margin-top:10px;' }, [
        el('div', {}, [saveCfgBtn, el('span', { class: 'ai-hint' }, ['  saves JSON config'])]),
        el('div', {}, [saveDemoBtn, el('span', { class: 'ai-hint' }, ['  saves txt demos'])]),
      ]),
      el('div', { style: 'margin-top:10px;' }, [runBtn]),
      status,
    ]);

    segForm.insertAdjacentElement('afterend', aiPanel);

    toggleBtn.addEventListener('click', () => {
      aiPanel.classList.toggle('hidden');
      toggleBtn.textContent = aiPanel.classList.contains('hidden') ? 'AI mode' : 'Manual mode';
    });
  }

  function mountHighLevelPanel() {
    const panel = document.getElementById('highlevelsPanel') || document.getElementById('highLevelPanel');
    if (!panel) return;

    const segForm = panel.querySelector('.segment-form');
    if (!segForm) return;

    const actionsRow =
      (segForm.querySelector('#addHighLevel') && segForm.querySelector('#addHighLevel').closest('.row')) ||
      (segForm.querySelector('.row.actions')) ||
      (segForm.querySelectorAll('.row').length ? segForm.querySelectorAll('.row')[segForm.querySelectorAll('.row').length - 1] : null);
    if (!actionsRow) return;

    if (panel.querySelector('#aiHighLevelPanel')) return;

    const toggleBtn = el('button', { class: 'btn secondary ai-mode-toggle', type: 'button' }, ['AI mode']);
    actionsRow.appendChild(toggleBtn);

    const cfg = (state.cfg && state.cfg.fake_vqa) || {};

    const baseUrl2 = el('input', { type: 'text', value: (state.cfg && state.cfg.openai_base_url) || '' });
    const modelName2 = el('input', { type: 'text', value: (state.cfg && state.cfg.model) || '' });
    const apiKey2 = el('input', { type: 'password', value: (state.cfg && state.cfg.openai_api_key) || '' });

    const stride = el('input', { id: 'ai_vqa_stride_s', type: 'number', step: '0.1', value: cfg.stride_s ?? 6.0 });
    const windowS = el('input', { id: 'ai_vqa_window_s', type: 'number', step: '0.1', value: cfg.window_s ?? 2.0 });
    const windowFrames = el('input', { id: 'ai_vqa_window_frames', type: 'number', step: '1', value: cfg.window_frames ?? 3 });
    const language = el('input', { id: 'ai_vqa_language', type: 'text', value: cfg.language ?? 'en' });

    const scenarioType = el('input', { id: 'ai_vqa_scenario_type', type: 'text', value: cfg.scenario_type ?? 'vqa' });
    const responseType = el('input', { id: 'ai_vqa_response_type', type: 'text', value: cfg.response_type ?? 'answer' });
    const skill = el('input', { id: 'ai_vqa_skill', type: 'text', value: cfg.skill ?? 'fake_vqa' });

    const resumeFromLast = el('input', { type: 'checkbox' });

    const systemPrompt = el('textarea', { rows: '6' }, [(cfg.system_prompt || '').trim()]);
    const userTemplate = el('textarea', { rows: '7' }, [(cfg.user_prompt_template || '').trim()]);
    const demoTxt = el('textarea', { rows: '10' }, [state.promptVqa || '']);

    const status = el('div', { class: 'ai-status' }, ['']);

    const saveCfgBtn = el('button', { class: 'btn secondary', type: 'button' }, ['Save settings']);
    saveCfgBtn.addEventListener('click', async () => {
      try {
        const newCfg = JSON.parse(JSON.stringify(state.cfg || {}));
        newCfg.openai_base_url = (baseUrl2.value || '').trim();
        newCfg.model = (modelName2.value || '').trim();
        newCfg.openai_api_key = (apiKey2.value || '').trim();
        newCfg.fake_vqa = newCfg.fake_vqa || {};
        newCfg.fake_vqa.stride_s = parseFloat(stride.value || '6');
        newCfg.fake_vqa.window_s = parseFloat(windowS.value || '2');
        newCfg.fake_vqa.window_frames = parseInt(windowFrames.value || '3', 10);
        newCfg.fake_vqa.language = (language.value || 'en').trim();
        newCfg.fake_vqa.scenario_type = (scenarioType.value || 'vqa').trim();
        newCfg.fake_vqa.response_type = (responseType.value || 'answer').trim();
        newCfg.fake_vqa.skill = (skill.value || 'fake_vqa').trim();
        newCfg.fake_vqa.system_prompt = systemPrompt.value;
        newCfg.fake_vqa.user_prompt_template = userTemplate.value;
        await fetchJSON(API.config, { method: 'PUT', body: JSON.stringify({ config: newCfg }) });
        const cfgPayload = await fetchJSON(API.config);
    state.cfg = (cfgPayload && cfgPayload.config) ? cfgPayload.config : cfgPayload;
        setStatus(status, true, 'Saved high-level settings.');
      } catch (e) {
        setStatus(status, false, `Save settings failed: ${e.message}`);
      }
    });

    const saveDemoBtn = el('button', { class: 'btn secondary', type: 'button' }, ['Save vqa_prompt.txt']);
    saveDemoBtn.addEventListener('click', async () => {
      try {
        await fetchJSON(API.promptsVqa, { method: 'PUT', body: JSON.stringify({ text: demoTxt.value }) });
        setStatus(status, true, 'Saved vqa_prompt.txt.');
      } catch (e) {
        setStatus(status, false, `Save vqa_prompt.txt failed: ${e.message}`);
      }
    });

    const runBtn = el('button', { class: 'btn primary', type: 'button' }, ['Generate AI Fake VQA']);
    runBtn.addEventListener('click', async () => {
      try {
        const ep = getEpisodeIndex();
        const strideVal = parseFloat(stride.value || '6');
        const windowVal = parseFloat(windowS.value || '2');
        if (windowVal > strideVal) {
          setStatus(status, false, 'window_s must be <= stride_s (Mode 2).');
          return;
        }
        const body = {
          episode_index: ep,
          stride_s: strideVal,
          window_s: windowVal,
          window_frames: parseInt(windowFrames.value || '3', 10),
          mode: (resumeFromLast.checked ? 'append' : 'replace'),
          resume_from_last: !!resumeFromLast.checked,
          language: (language.value || 'en').trim(),
          scenario_type: (scenarioType.value || 'vqa').trim(),
          response_type: (responseType.value || 'answer').trim(),
          skill: (skill.value || 'fake_vqa').trim(),
        };
        await fetchJSON(API.fakeVqa, { method: 'POST', body: JSON.stringify(body) });
        setStatus(status, true, 'Fake VQA generated and saved.');
        await reloadEpisode(ep);
      } catch (e) {
        setStatus(status, false, `AI Fake VQA failed: ${e.message}`);
      }
    });

    const aiPanel = el('div', { id: 'aiHighLevelPanel', class: 'ai-panel hidden' }, [
      el('div', { class: 'ai-section-title' }, ['AI Fake VQA settings (Mode 2)']),
      el('div', { class: 'ai-section-title', style: 'margin-top:10px;' }, ['Backend settings (shared)']),
      el('div', { class: 'ai-grid', style: 'margin-top:10px;' }, [
        el('label', {}, ['Base URL', baseUrl2]),
        el('label', {}, ['Model', modelName2]),
        el('label', {}, ['API key', apiKey2]),
      ]),
      el('div', { class: 'ai-hint' }, ['Mode 2: model checks a short window for stability, but labels apply to the full stride interval for image-only training coverage.']),
      el('div', { class: 'ai-grid', style: 'margin-top:10px;' }, [
        el('label', {}, ['Stride (s)', stride]),
        el('label', {}, ['Window (s) <= stride', windowS]),
        el('label', {}, ['Window frames', windowFrames]),
        el('label', {}, ['Language (en)', language]),
        el('label', {}, ['Scenario type', scenarioType]),
        el('label', {}, ['Response type', responseType]),
        el('label', {}, ['Skill', skill]),
        el('label', { class: 'ai-row' }, [resumeFromLast, el('span', {}, ['Resume from last segment'])]),
      ]),
      el('div', { class: 'ai-section-title', style: 'margin-top:12px;' }, ['Prompts (editable)']),
      el('div', { class: 'ai-grid-1' }, [
        el('label', {}, ['System prompt', systemPrompt]),
        el('label', {}, ['User prompt template (placeholders: {qa_demos} {time_s} {window_s} {stride_s} {language})', userTemplate]),
        el('label', {}, ['vqa_prompt.txt (two lines per Q/A pair)', demoTxt]),
      ]),
      el('div', { class: 'ai-grid', style: 'margin-top:10px;' }, [
        el('div', {}, [saveCfgBtn, el('span', { class: 'ai-hint' }, ['  saves JSON config'])]),
        el('div', {}, [saveDemoBtn, el('span', { class: 'ai-hint' }, ['  saves txt demos'])]),
      ]),
      el('div', { style: 'margin-top:10px;' }, [runBtn]),
      status,
    ]);

    segForm.insertAdjacentElement('afterend', aiPanel);

    toggleBtn.addEventListener('click', () => {
      aiPanel.classList.toggle('hidden');
      toggleBtn.textContent = aiPanel.classList.contains('hidden') ? 'AI mode' : 'Manual mode';
    });
  }

  async function main() {
    await loadPluginState();
    if (!state.available) return;
    // Delay mount until base UI is constructed.
    const mount = () => {
      try {
        mountSubtasksPanel();
        mountHighLevelPanel();
    patchEpisodeListHooks();
  } catch (e) {
        // Silently ignore; base UI may not be ready.
      }
    };
    mount();
    // Try again after a short delay (first paint).
    setTimeout(mount, 300);
  }

  function startMutationObserver() {
    if (state.__observerStarted) return;
    state.__observerStarted = true;

    let scheduled = false;
    const tick = () => {
      scheduled = false;
      try { mountSubtasksPanel(); } catch (_) {}
      try { mountHighLevelPanel(); } catch (_) {}
      try { patchEpisodeListHooks(); } catch (_) {}
    };

    const mo = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      // Debounce into a microtask
      Promise.resolve().then(tick);
    });

    mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
    state.__observer = mo;

    // Also run once in case elements already exist
    tick();
  }


  function boot() {
    main().then(() => {
      startMutationObserver();
    }).catch(() => {});
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();