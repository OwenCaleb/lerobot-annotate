console.log('[App] Script starting...');


function showPushStatus(type, message, url = null) {
  console.log('[Push to Hub] Showing status:', type, message);
  
  const statusEl = document.getElementById('pushHubStatus');
  if (!statusEl) {
    console.error('[Push to Hub] Status element not found');
    alert(`${type}: ${message}`);
    return;
  }
  
  statusEl.className = `helper status-${type}`;
  
  if (type === 'loading') {
    statusEl.innerHTML = `<span class="spinner"></span> ${message}`;
  } else if (type === 'success') {
    statusEl.innerHTML = `
      <div class="status-box status-success">
        <span class="status-icon">✓</span>
        <div class="status-content">
          <strong>Success!</strong>
          <p>${message}</p>
          ${url ? `<a href="${url}" target="_blank" class="status-link">View on Hugging Face Hub →</a>` : ''}
        </div>
      </div>
    `;
  } else if (type === 'error') {
    statusEl.innerHTML = `
      <div class="status-box status-error">
        <span class="status-icon">✗</span>
        <div class="status-content">
          <strong>Error</strong>
          <p>${message}</p>
        </div>
      </div>
    `;
  }
}

async function handlePushToHub() {
  console.log('[Push to Hub] handlePushToHub called');
  
  const tokenEl = document.getElementById('hfToken');
  const statusEl = document.getElementById('pushHubStatus');
  const btnEl = document.getElementById('pushHubBtn');
  const inPlaceEl = document.getElementById('pushInPlace');
  const newRepoEl = document.getElementById('newRepoId');
  const privateEl = document.getElementById('privateRepo');
  const msgEl = document.getElementById('commitMessage');
  
  if (!tokenEl || !statusEl) {
    console.error('[Push to Hub] Missing DOM elements');
    alert('Error: Missing form elements. Please refresh the page.');
    return;
  }
  
  const token = tokenEl.value.trim();
  console.log('[Push to Hub] Token provided:', token ? 'Yes (hidden)' : 'No');
  
  if (!token) {
    showPushStatus('error', 'Please enter your Hugging Face token');
    return;
  }

  const pushInPlaceChecked = inPlaceEl ? inPlaceEl.checked : true;
  const newRepoIdValue = newRepoEl ? newRepoEl.value.trim() : '';
  
  if (!pushInPlaceChecked && !newRepoIdValue) {
    showPushStatus('error', 'Please enter a new repo ID or check "Push to original repo"');
    return;
  }

  // Show loading state
  console.log('[Push to Hub] Starting push...');
  showPushStatus('loading', 'Pushing to Hub... This may take a while for large datasets.');
  if (btnEl) {
    btnEl.disabled = true;
    btnEl.innerHTML = '<span class="spinner"></span> Pushing...';
  }

  try {
    const payload = {
      hf_token: token,
      push_in_place: pushInPlaceChecked,
      new_repo_id: pushInPlaceChecked ? null : newRepoIdValue,
      private: privateEl ? privateEl.checked : false,
      commit_message: (msgEl ? msgEl.value.trim() : '') || 'Add annotations from LeRobot Annotate',
    };
    
    console.log('[Push to Hub] Sending request with payload:', { ...payload, hf_token: '[HIDDEN]' });

    const res = await fetch('/api/push_to_hub', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    console.log('[Push to Hub] Response status:', res.status);
    const data = await res.json();
    console.log('[Push to Hub] Response data:', data);
    
    if (res.ok) {
      console.log('[Push to Hub] Success!');
      showPushStatus('success', `${data.message}`, data.url);
    } else {
      console.error('[Push to Hub] Failed:', data.detail);
      showPushStatus('error', data.detail || 'Push failed. Please check your token and try again.');
    }
  } catch (err) {
    console.error('[Push to Hub] Error:', err);
    showPushStatus('error', `Network error: ${err.message}. Please check your connection and try again.`);
  } finally {
    if (btnEl) {
      btnEl.disabled = false;
      btnEl.textContent = 'Push to Hub';
    }
  }
}

console.log('[App] handlePushToHub function defined');
// ============================================

const statusEl = document.getElementById('status');
const connectForm = document.getElementById('connectForm');
const sourceSelect = document.getElementById('sourceSelect');
const repoInput = document.getElementById('repoInput');
const localInput = document.getElementById('localInput');
const revisionInput = document.getElementById('revisionInput');
const videoKeySelect = document.getElementById('videoKeySelect');
const connectHelper = document.getElementById('connectHelper');

const workspace = document.getElementById('workspace');
const episodeList = document.getElementById('episodeList');
const episodeSearch = document.getElementById('episodeSearch');
const episodeTitle = document.getElementById('episodeTitle');
const episodeMeta = document.getElementById('episodeMeta');
const episodeVideo = document.getElementById('episodeVideo');
const timeline = document.getElementById('timeline');

const saveEpisodeBtn = document.getElementById('saveEpisode');
const resetEpisodeBtn = document.getElementById('resetEpisode');

const subtaskStart = document.getElementById('subtaskStart');
const subtaskEnd = document.getElementById('subtaskEnd');
const subtaskLabel = document.getElementById('subtaskLabel');
const subtaskSetStart = document.getElementById('subtaskSetStart');
const subtaskSetEnd = document.getElementById('subtaskSetEnd');
const addSubtask = document.getElementById('addSubtask');
const subtaskList = document.getElementById('subtaskList');

const hlStart = document.getElementById('hlStart');
const hlEnd = document.getElementById('hlEnd');
const hlUser = document.getElementById('hlUser');
const hlRobot = document.getElementById('hlRobot');
const hlSkill = document.getElementById('hlSkill');
const hlScenario = document.getElementById('hlScenario');
const hlResponse = document.getElementById('hlResponse');
const hlSetStart = document.getElementById('hlSetStart');
const hlSetEnd = document.getElementById('hlSetEnd');
const addHighLevel = document.getElementById('addHighLevel');
const highLevelList = document.getElementById('highLevelList');

const exportBtn = document.getElementById('exportBtn');
const outputDir = document.getElementById('outputDir');
const copyVideos = document.getElementById('copyVideos');
const exportStatus = document.getElementById('exportStatus');

// Push to Hub elements
const hfToken = document.getElementById('hfToken');
const pushInPlace = document.getElementById('pushInPlace');
const newRepoRow = document.getElementById('newRepoRow');
const newRepoId = document.getElementById('newRepoId');
const privateRepo = document.getElementById('privateRepo');
const commitMessage = document.getElementById('commitMessage');
const pushHubBtn = document.getElementById('pushHubBtn');
const pushHubStatus = document.getElementById('pushHubStatus');

console.log('[App] Push to Hub elements:', { 
  pushHubBtn: !!pushHubBtn, 
  hfToken: !!hfToken, 
  pushHubStatus: !!pushHubStatus,
  pushInPlace: !!pushInPlace 
});

const tabs = document.querySelectorAll('.tab');
const tabPanels = document.querySelectorAll('.tab-panel');

const state = {
  dataset: null,
  episodes: [],
  currentEpisode: null,
  currentEpisodeData: null, // Store the full episode data including video timing
  annotations: {},
};

function setStatus(text, ok = false) {
  statusEl.textContent = text;
  statusEl.style.color = ok ? '#22c55e' : '#f97316';
}

function setHelper(el, message, ok = false) {
  el.textContent = message;
  el.style.color = ok ? '#22c55e' : '#94a3b8';
}

function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return '';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}m ${secs}s`;
}

function currentTime() {
  // The server now returns trimmed videos, so currentTime is the actual episode time
  // Use 3 decimal places for millisecond precision
  return Number(episodeVideo.currentTime.toFixed(3));
}

function formatTimeWithMs(seconds) {
  // Format time as MM:SS.mmm for millisecond precision display
  if (!seconds && seconds !== 0) return '00:00.000';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

function updateTimeDisplay() {
  const currentTimeDisplay = document.getElementById('currentTimeDisplay');
  const totalTimeDisplay = document.getElementById('totalTimeDisplay');
  if (currentTimeDisplay) {
    currentTimeDisplay.textContent = formatTimeWithMs(episodeVideo.currentTime);
  }
  if (totalTimeDisplay && episodeVideo.duration) {
    totalTimeDisplay.textContent = formatTimeWithMs(episodeVideo.duration);
  }
}

function getEpisodeDuration() {
  // The server returns trimmed videos, so video duration = episode duration
  return episodeVideo.duration || 0;
}

function resetEpisodeForm() {
  subtaskStart.value = '';
  subtaskEnd.value = '';
  subtaskLabel.value = '';
  hlStart.value = '';
  hlEnd.value = '';
  hlUser.value = '';
  hlRobot.value = '';
  hlSkill.value = '';
  hlScenario.value = '';
  hlResponse.value = '';
}

function getEpisodeAnnotations(epIdx) {
  if (!state.annotations[epIdx]) {
    state.annotations[epIdx] = { subtasks: [], high_levels: [] };
  }
  return state.annotations[epIdx];
}

function renderEpisodes() {
  episodeList.innerHTML = '';
  const query = episodeSearch.value.trim();
  const filtered = state.episodes.filter(ep => ep.episode_index.toString().includes(query));
  filtered.forEach(ep => {
    const li = document.createElement('li');
    li.textContent = `Episode ${ep.episode_index}`;
    const span = document.createElement('span');
    span.textContent = formatDuration(ep.duration);
    li.appendChild(span);
    if (state.currentEpisode === ep.episode_index) {
      li.classList.add('active');
    }
    li.addEventListener('click', () => selectEpisode(ep.episode_index));
    episodeList.appendChild(li);
  });
}

function buildSubtaskIndexMap(annotations) {
  // Build a mapping from label to subtask_index (same logic as backend)
  // This creates consistent subtask indices based on alphabetically sorted unique labels
  const allLabels = new Set();
  for (const epAnn of Object.values(annotations)) {
    for (const seg of epAnn.subtasks || []) {
      if (seg.label) {
        allLabels.add(seg.label);
      }
    }
  }
  const sortedLabels = Array.from(allLabels).sort();
  const subtaskMap = {};
  sortedLabels.forEach((label, idx) => {
    subtaskMap[label] = idx;
  });
  return subtaskMap;
}

function renderTimeline() {
  timeline.innerHTML = '';
  if (state.currentEpisode == null) return;
  const ann = getEpisodeAnnotations(state.currentEpisode);
  const segments = ann.subtasks;
  // Use episode duration (not full video duration) for timeline
  const duration = getEpisodeDuration();
  if (!duration || segments.length === 0) return;

  // Build subtask index map based on all annotations (consistent with export)
  const subtaskMap = buildSubtaskIndexMap(state.annotations);

  segments.forEach((seg) => {
    const span = document.createElement('span');
    const width = ((seg.end - seg.start) / duration) * 100;
    span.style.width = `${Math.max(width, 2)}%`;
    // Get the actual subtask_index based on label
    const subtaskIndex = subtaskMap[seg.label] ?? '?';
    span.title = `subtask_index ${subtaskIndex}: ${seg.label} (${seg.start}s - ${seg.end}s)`;
    // Add subtask index as text inside the span
    span.textContent = subtaskIndex;
    span.style.display = 'flex';
    span.style.alignItems = 'center';
    span.style.justifyContent = 'center';
    span.style.fontSize = '10px';
    span.style.fontWeight = '600';
    span.style.color = '#0b0e14';
    timeline.appendChild(span);
  });
}

function renderSubtasks() {
  subtaskList.innerHTML = '';
  if (state.currentEpisode == null) return;
  const ann = getEpisodeAnnotations(state.currentEpisode);
  ann.subtasks.sort((a, b) => a.start - b.start);

  // Build subtask index map based on all annotations (consistent with export)
  const subtaskMap = buildSubtaskIndexMap(state.annotations);

  ann.subtasks.forEach((seg, idx) => {
    const row = document.createElement('div');
    row.className = 'segment-item';

    // Add subtask_index badge
    const indexBadge = document.createElement('span');
    const subtaskIndex = subtaskMap[seg.label] ?? '?';
    indexBadge.textContent = subtaskIndex;
    indexBadge.title = `subtask_index: ${subtaskIndex}`;
    indexBadge.style.cssText = 'display: flex; align-items: center; justify-content: center; min-width: 28px; height: 28px; background: var(--accent-2); color: #0b0e14; border-radius: 6px; font-weight: 600; font-size: 12px;';

    const startInput = document.createElement('input');
    startInput.type = 'number';
    startInput.step = '0.001';
    startInput.value = seg.start;
    startInput.addEventListener('change', () => {
      seg.start = Number(startInput.value);
      renderTimeline();
    });

    const endInput = document.createElement('input');
    endInput.type = 'number';
    endInput.step = '0.001';
    endInput.value = seg.end;
    endInput.addEventListener('change', () => {
      seg.end = Number(endInput.value);
      renderTimeline();
    });

    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.value = seg.label;
    labelInput.addEventListener('change', () => {
      seg.label = labelInput.value;
      // Re-render both to update subtask_index based on new label
      renderSubtasks();
      renderTimeline();
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'ghost';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => {
      ann.subtasks.splice(idx, 1);
      renderSubtasks();
      renderTimeline();
    });

    row.appendChild(indexBadge);
    row.appendChild(startInput);
    row.appendChild(endInput);
    row.appendChild(labelInput);
    row.appendChild(deleteBtn);

    subtaskList.appendChild(row);
  });
}

function renderHighLevels() {
  highLevelList.innerHTML = '';
  if (state.currentEpisode == null) return;
  const ann = getEpisodeAnnotations(state.currentEpisode);
  ann.high_levels.sort((a, b) => a.start - b.start);

  ann.high_levels.forEach((seg, idx) => {
    const row = document.createElement('div');
    row.className = 'segment-item';

    const startInput = document.createElement('input');
    startInput.type = 'number';
    startInput.step = '0.001';
    startInput.value = seg.start;
    startInput.addEventListener('change', () => {
      seg.start = Number(startInput.value);
    });

    const endInput = document.createElement('input');
    endInput.type = 'number';
    endInput.step = '0.001';
    endInput.value = seg.end;
    endInput.addEventListener('change', () => {
      seg.end = Number(endInput.value);
    });

    const promptInput = document.createElement('input');
    promptInput.type = 'text';
    promptInput.value = seg.user_prompt;
    promptInput.addEventListener('change', () => {
      seg.user_prompt = promptInput.value;
    });

    const robotInput = document.createElement('input');
    robotInput.type = 'text';
    robotInput.value = seg.robot_utterance;
    robotInput.addEventListener('change', () => {
      seg.robot_utterance = robotInput.value;
    });

    const skillInput = document.createElement('input');
    skillInput.type = 'text';
    skillInput.value = seg.skill || '';
    skillInput.addEventListener('change', () => {
      seg.skill = skillInput.value;
    });

    const scenarioInput = document.createElement('input');
    scenarioInput.type = 'text';
    scenarioInput.value = seg.scenario_type || '';
    scenarioInput.addEventListener('change', () => {
      seg.scenario_type = scenarioInput.value;
    });

    const responseInput = document.createElement('input');
    responseInput.type = 'text';
    responseInput.value = seg.response_type || '';
    responseInput.addEventListener('change', () => {
      seg.response_type = responseInput.value;
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'ghost';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => {
      ann.high_levels.splice(idx, 1);
      renderHighLevels();
    });

    row.appendChild(startInput);
    row.appendChild(endInput);
    row.appendChild(promptInput);
    row.appendChild(robotInput);
    row.appendChild(skillInput);
    row.appendChild(scenarioInput);
    row.appendChild(responseInput);
    row.appendChild(deleteBtn);

    highLevelList.appendChild(row);
  });
}

async function selectEpisode(epIdx) {
  state.currentEpisode = epIdx;
  episodeTitle.textContent = `Episode ${epIdx}`;
  const ep = state.episodes.find(e => e.episode_index === epIdx);
  state.currentEpisodeData = ep || null;
  episodeMeta.textContent = ep ? `${ep.length} frames • ${formatDuration(ep.duration)}` : '';

  const res = await fetch(`/api/episodes/${epIdx}/annotations`);
  const data = await res.json();
  state.annotations[epIdx] = {
    subtasks: data.subtasks || [],
    high_levels: data.high_levels || [],
  };

  // The server now handles video trimming for concatenated videos
  // It will return only the portion of video for this specific episode
  const videoUrl = `/api/video/${epIdx}?video_key=${encodeURIComponent(state.dataset.selected_video_key)}`;
  console.log(`Loading episode ${epIdx} video`);
  episodeVideo.src = videoUrl;
  
  resetEpisodeForm();
  renderEpisodes();
  renderSubtasks();
  renderHighLevels();
}

async function saveEpisode() {
  if (state.currentEpisode == null) return;
  const ann = getEpisodeAnnotations(state.currentEpisode);
  const payload = {
    episode_index: state.currentEpisode,
    subtasks: ann.subtasks,
    high_levels: ann.high_levels,
  };
  const res = await fetch(`/api/episodes/${state.currentEpisode}/annotations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (res.ok) {
    setHelper(connectHelper, 'Episode saved.', true);
  }
}

connectForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = {
    source: sourceSelect.value,
    repo_id: repoInput.value.trim() || null,
    revision: revisionInput.value.trim() || null,
    local_path: localInput.value.trim() || null,
    video_key: videoKeySelect.value || null,
  };

  setHelper(connectHelper, 'Loading dataset...');
  try {
    const res = await fetch('/api/dataset/load', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || 'Failed to load dataset');
    }
    state.dataset = data;
    state.episodes = data.episodes || [];
    setStatus(`Loaded ${data.repo_id || data.root}`, true);
    setHelper(connectHelper, `Loaded ${state.episodes.length} episodes.`, true);
    workspace.style.display = 'grid';
    populateVideoKeys(data.video_keys, data.selected_video_key);
    renderEpisodes();
  } catch (err) {
    setStatus('Disconnected');
    setHelper(connectHelper, err.message);
  }
});

function populateVideoKeys(keys, selected) {
  videoKeySelect.innerHTML = '';
  if (!keys) return;
  keys.forEach(key => {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = key;
    if (key === selected) option.selected = true;
    videoKeySelect.appendChild(option);
  });
}

subtaskSetStart.addEventListener('click', () => {
  subtaskStart.value = currentTime();
});

subtaskSetEnd.addEventListener('click', () => {
  subtaskEnd.value = currentTime();
});

addSubtask.addEventListener('click', () => {
  if (state.currentEpisode == null) return;
  const start = Number(subtaskStart.value);
  const end = Number(subtaskEnd.value);
  const label = subtaskLabel.value.trim();
  if (!label || Number.isNaN(start) || Number.isNaN(end) || end <= start) {
    return;
  }
  const ann = getEpisodeAnnotations(state.currentEpisode);
  ann.subtasks.push({ start, end, label });
  renderSubtasks();
  renderTimeline();
  subtaskLabel.value = '';
});

hlSetStart.addEventListener('click', () => {
  hlStart.value = currentTime();
});

hlSetEnd.addEventListener('click', () => {
  hlEnd.value = currentTime();
});

addHighLevel.addEventListener('click', () => {
  if (state.currentEpisode == null) return;
  const start = Number(hlStart.value);
  const end = Number(hlEnd.value);
  const userPrompt = hlUser.value.trim();
  const robotUtter = hlRobot.value.trim();
  if (!userPrompt || !robotUtter || Number.isNaN(start) || Number.isNaN(end) || end <= start) {
    return;
  }
  const ann = getEpisodeAnnotations(state.currentEpisode);
  ann.high_levels.push({
    start,
    end,
    user_prompt: userPrompt,
    robot_utterance: robotUtter,
    skill: hlSkill.value.trim() || null,
    scenario_type: hlScenario.value.trim() || null,
    response_type: hlResponse.value.trim() || null,
  });
  renderHighLevels();
  hlUser.value = '';
  hlRobot.value = '';
});

saveEpisodeBtn.addEventListener('click', () => saveEpisode());
resetEpisodeBtn.addEventListener('click', () => {
  if (state.currentEpisode == null) return;
  state.annotations[state.currentEpisode] = { subtasks: [], high_levels: [] };
  renderSubtasks();
  renderHighLevels();
  renderTimeline();
});

episodeSearch.addEventListener('input', renderEpisodes);

episodeVideo.addEventListener('loadedmetadata', () => {
  // Server now returns trimmed videos, just render the timeline
  renderTimeline();
  updateTimeDisplay();
});

// Update time display continuously during video playback
episodeVideo.addEventListener('timeupdate', updateTimeDisplay);

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    tabPanels.forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    const panel = document.getElementById(`${tab.dataset.tab}Panel`);
    if (panel) panel.classList.add('active');
  });
});

exportBtn.addEventListener('click', async () => {
  exportStatus.textContent = 'Exporting...';
  const payload = {
    output_dir: outputDir.value.trim() || null,
    copy_videos: copyVideos.checked,
  };
  const res = await fetch('/api/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (res.ok) {
    exportStatus.textContent = `Exported to ${data.output_dir} (subtasks: ${data.subtasks}, high-level: ${data.tasks_high_level})`;
  } else {
    exportStatus.textContent = data.detail || 'Export failed';
  }
});

// Toggle new repo input visibility based on push in place checkbox
if (pushInPlace && newRepoRow) {
  pushInPlace.addEventListener('change', () => {
    newRepoRow.style.display = pushInPlace.checked ? 'none' : 'flex';
  });
  // Initialize visibility
  newRepoRow.style.display = pushInPlace.checked ? 'none' : 'flex';
}

workspace.style.display = 'none';
if (pushHubBtn) {
  console.log('[App] Attaching event listener to pushHubBtn');
  pushHubBtn.addEventListener('click', handlePushToHub);
} else {
  console.error('[App] pushHubBtn element not found');
}
console.log('[App] Script fully loaded and initialized');

// --- plugin API surface (keep minimal) ---
window.LeRobotAnnotate = window.LeRobotAnnotate || {};
window.LeRobotAnnotate.state = state;
window.LeRobotAnnotate.selectEpisode = selectEpisode;
window.LeRobotAnnotate.saveEpisode = saveEpisode;
window.LeRobotAnnotate = { state, selectEpisode };
// --- end plugin API surface ---
