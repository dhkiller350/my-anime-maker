/* ============================================================
   My Anime Maker – script.js
   Pure client-side anime movie / show planner.
   Supports projects up to 10 hours (36 000 seconds) of content.
   ============================================================ */

(function () {
  'use strict';

  /* ---------- constants ---------- */
  var MAX_DURATION_SEC = 36000; // 10 hours
  var AUTOSAVE_KEY = 'anime-maker-project';
  var COLORS = [
    '#e74c8b', '#6c5ce7', '#00b894', '#fdcb6e', '#0984e3',
    '#d63031', '#e17055', '#00cec9', '#a29bfe', '#55efc4'
  ];

  /* ---------- state ---------- */
  var project = defaultProject();
  var zoomLevel = 100;

  /* ---------- helpers ---------- */
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  }

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  function formatTime(totalSeconds) {
    var h = Math.floor(totalSeconds / 3600);
    var m = Math.floor((totalSeconds % 3600) / 60);
    var s = totalSeconds % 60;
    return (
      String(h).padStart(2, '0') + ':' +
      String(m).padStart(2, '0') + ':' +
      String(s).padStart(2, '0')
    );
  }

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
  }

  function defaultProject() {
    return {
      title: '',
      type: 'movie',
      genre: 'action',
      description: '',
      fps: '24',
      resolution: '1080p',
      episodes: [],
      scenes: [],
      characters: [],
      panels: []
    };
  }

  function totalDuration() {
    var total = 0;
    for (var i = 0; i < project.scenes.length; i++) {
      total += project.scenes[i].durationSec || 0;
    }
    return total;
  }

  function showToast(msg) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(el._timer);
    el._timer = setTimeout(function () {
      el.classList.add('hidden');
    }, 2500);
  }

  function autoSave() {
    try {
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(project));
    } catch (_) { /* quota exceeded – ignore */ }
  }

  function autoLoad() {
    try {
      var raw = localStorage.getItem(AUTOSAVE_KEY);
      if (raw) {
        var data = JSON.parse(raw);
        if (data && typeof data.title === 'string') {
          project = data;
          // Ensure arrays exist (backwards compat)
          project.episodes = project.episodes || [];
          project.scenes = project.scenes || [];
          project.characters = project.characters || [];
          project.panels = project.panels || [];
        }
      }
    } catch (_) { /* corrupt data – ignore */ }
  }

  /* ===================================================================
     Tab Navigation
     =================================================================== */
  function initTabs() {
    var buttons = document.querySelectorAll('.nav-btn');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener('click', function () {
        var target = this.getAttribute('data-tab');
        for (var j = 0; j < buttons.length; j++) {
          buttons[j].classList.remove('active');
        }
        this.classList.add('active');
        var panels = document.querySelectorAll('.tab-panel');
        for (var k = 0; k < panels.length; k++) {
          panels[k].classList.remove('active');
        }
        document.getElementById('tab-' + target).classList.add('active');
        if (target === 'timeline') renderTimeline();
        if (target === 'storyboard') refreshStoryboardFilter();
        if (target === 'scenes') refreshSceneEpisodeFilter();
      });
    }
  }

  /* ===================================================================
     Project Settings
     =================================================================== */
  function initProjectForm() {
    var form = document.getElementById('project-form');
    // Populate from state
    document.getElementById('project-title').value = project.title;
    document.getElementById('project-type').value = project.type;
    document.getElementById('project-genre').value = project.genre;
    document.getElementById('project-description').value = project.description;
    document.getElementById('project-fps').value = project.fps;
    document.getElementById('project-resolution').value = project.resolution;

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      project.title = document.getElementById('project-title').value.trim();
      project.type = document.getElementById('project-type').value;
      project.genre = document.getElementById('project-genre').value;
      project.description = document.getElementById('project-description').value.trim();
      project.fps = document.getElementById('project-fps').value;
      project.resolution = document.getElementById('project-resolution').value;
      autoSave();
      showToast('Project settings saved!');
    });
  }

  /* ===================================================================
     Episodes CRUD
     =================================================================== */
  function renderEpisodes() {
    var list = document.getElementById('episodes-list');
    list.innerHTML = '';
    if (project.episodes.length === 0) {
      list.innerHTML = '<p class="hint">No episodes yet. Click "+ Add Episode" to get started.</p>';
      return;
    }
    project.episodes.sort(function (a, b) { return a.number - b.number; });
    for (var i = 0; i < project.episodes.length; i++) {
      var ep = project.episodes[i];
      var scenesInEp = project.scenes.filter(function (s) { return s.episodeId === ep.id; });
      var dur = 0;
      for (var j = 0; j < scenesInEp.length; j++) dur += scenesInEp[j].durationSec || 0;
      var card = document.createElement('div');
      card.className = 'card';
      card.innerHTML =
        '<div class="card-title">' + escapeHtml('Ep ' + ep.number + ': ' + ep.name) + '</div>' +
        '<div class="card-meta">' + escapeHtml(scenesInEp.length + ' scenes · ' + formatTime(dur)) + '</div>' +
        '<div class="card-body">' + escapeHtml(ep.synopsis || '(no synopsis)') + '</div>' +
        '<div class="card-actions">' +
          '<button class="btn-small edit-ep" data-id="' + ep.id + '">Edit</button>' +
          '<button class="btn-danger delete-ep" data-id="' + ep.id + '">Delete</button>' +
        '</div>';
      list.appendChild(card);
    }
    // Bind
    list.querySelectorAll('.edit-ep').forEach(function (btn) {
      btn.addEventListener('click', function () { openEpisodeModal(this.dataset.id); });
    });
    list.querySelectorAll('.delete-ep').forEach(function (btn) {
      btn.addEventListener('click', function () { deleteEpisode(this.dataset.id); });
    });
  }

  function openEpisodeModal(id) {
    var modal = document.getElementById('episode-modal');
    var title = document.getElementById('episode-modal-title');
    document.getElementById('episode-form').reset();
    if (id) {
      var ep = project.episodes.find(function (e) { return e.id === id; });
      if (!ep) return;
      title.textContent = 'Edit Episode';
      document.getElementById('episode-id').value = ep.id;
      document.getElementById('episode-name').value = ep.name;
      document.getElementById('episode-number').value = ep.number;
      document.getElementById('episode-synopsis').value = ep.synopsis;
    } else {
      title.textContent = 'Add Episode';
      document.getElementById('episode-id').value = '';
      document.getElementById('episode-number').value = project.episodes.length + 1;
    }
    modal.classList.remove('hidden');
  }

  function closeEpisodeModal() {
    document.getElementById('episode-modal').classList.add('hidden');
  }

  function saveEpisode(e) {
    e.preventDefault();
    var id = document.getElementById('episode-id').value;
    var name = document.getElementById('episode-name').value.trim();
    var number = parseInt(document.getElementById('episode-number').value, 10) || 1;
    var synopsis = document.getElementById('episode-synopsis').value.trim();
    if (!name) return;
    if (id) {
      var ep = project.episodes.find(function (e) { return e.id === id; });
      if (ep) { ep.name = name; ep.number = number; ep.synopsis = synopsis; }
    } else {
      project.episodes.push({ id: uid(), name: name, number: number, synopsis: synopsis });
    }
    autoSave();
    closeEpisodeModal();
    renderEpisodes();
    showToast('Episode saved!');
  }

  function deleteEpisode(id) {
    if (!confirm('Delete this episode and all its scenes?')) return;
    project.episodes = project.episodes.filter(function (e) { return e.id !== id; });
    // Also remove scenes belonging to this episode
    project.scenes = project.scenes.filter(function (s) { return s.episodeId !== id; });
    autoSave();
    renderEpisodes();
    updateDuration();
    showToast('Episode deleted.');
  }

  function initEpisodes() {
    document.getElementById('add-episode-btn').addEventListener('click', function () {
      openEpisodeModal(null);
    });
    document.getElementById('episode-cancel-btn').addEventListener('click', closeEpisodeModal);
    document.getElementById('episode-form').addEventListener('submit', saveEpisode);
    renderEpisodes();
  }

  /* ===================================================================
     Characters CRUD
     =================================================================== */
  function renderCharacters() {
    var list = document.getElementById('characters-list');
    list.innerHTML = '';
    if (project.characters.length === 0) {
      list.innerHTML = '<p class="hint">No characters yet. Click "+ Add Character" to create one.</p>';
      return;
    }
    for (var i = 0; i < project.characters.length; i++) {
      var ch = project.characters[i];
      var card = document.createElement('div');
      card.className = 'card';
      card.innerHTML =
        '<div class="card-title"><span class="character-badge" style="background:' + escapeHtml(ch.color) + '">' + escapeHtml(ch.role) + '</span> ' + escapeHtml(ch.name) + '</div>' +
        '<div class="card-body">' + escapeHtml(ch.description || '(no description)') + '</div>' +
        (ch.traits ? '<div class="card-meta">Traits: ' + escapeHtml(ch.traits) + '</div>' : '') +
        '<div class="card-actions">' +
          '<button class="btn-small edit-ch" data-id="' + ch.id + '">Edit</button>' +
          '<button class="btn-danger delete-ch" data-id="' + ch.id + '">Delete</button>' +
        '</div>';
      list.appendChild(card);
    }
    list.querySelectorAll('.edit-ch').forEach(function (btn) {
      btn.addEventListener('click', function () { openCharacterModal(this.dataset.id); });
    });
    list.querySelectorAll('.delete-ch').forEach(function (btn) {
      btn.addEventListener('click', function () { deleteCharacter(this.dataset.id); });
    });
  }

  function openCharacterModal(id) {
    var modal = document.getElementById('character-modal');
    var title = document.getElementById('character-modal-title');
    document.getElementById('character-form').reset();
    if (id) {
      var ch = project.characters.find(function (c) { return c.id === id; });
      if (!ch) return;
      title.textContent = 'Edit Character';
      document.getElementById('character-id').value = ch.id;
      document.getElementById('character-name').value = ch.name;
      document.getElementById('character-role').value = ch.role;
      document.getElementById('character-color').value = ch.color;
      document.getElementById('character-description').value = ch.description;
      document.getElementById('character-trait').value = ch.traits || '';
    } else {
      title.textContent = 'Add Character';
      document.getElementById('character-id').value = '';
      document.getElementById('character-color').value = COLORS[project.characters.length % COLORS.length];
    }
    modal.classList.remove('hidden');
  }

  function closeCharacterModal() {
    document.getElementById('character-modal').classList.add('hidden');
  }

  function saveCharacter(e) {
    e.preventDefault();
    var id = document.getElementById('character-id').value;
    var name = document.getElementById('character-name').value.trim();
    var role = document.getElementById('character-role').value;
    var color = document.getElementById('character-color').value;
    var desc = document.getElementById('character-description').value.trim();
    var traits = document.getElementById('character-trait').value.trim();
    if (!name) return;
    if (id) {
      var ch = project.characters.find(function (c) { return c.id === id; });
      if (ch) {
        ch.name = name; ch.role = role; ch.color = color;
        ch.description = desc; ch.traits = traits;
      }
    } else {
      project.characters.push({
        id: uid(), name: name, role: role, color: color,
        description: desc, traits: traits
      });
    }
    autoSave();
    closeCharacterModal();
    renderCharacters();
    showToast('Character saved!');
  }

  function deleteCharacter(id) {
    if (!confirm('Delete this character?')) return;
    project.characters = project.characters.filter(function (c) { return c.id !== id; });
    // Remove from scenes
    for (var i = 0; i < project.scenes.length; i++) {
      project.scenes[i].characterIds = (project.scenes[i].characterIds || []).filter(function (cid) { return cid !== id; });
    }
    autoSave();
    renderCharacters();
    showToast('Character deleted.');
  }

  function initCharacters() {
    document.getElementById('add-character-btn').addEventListener('click', function () {
      openCharacterModal(null);
    });
    document.getElementById('character-cancel-btn').addEventListener('click', closeCharacterModal);
    document.getElementById('character-form').addEventListener('submit', saveCharacter);
    renderCharacters();
  }

  /* ===================================================================
     Scenes CRUD
     =================================================================== */
  function refreshSceneEpisodeFilter() {
    var sel = document.getElementById('scene-episode-filter');
    sel.innerHTML = '<option value="all">All Episodes</option>';
    for (var i = 0; i < project.episodes.length; i++) {
      var ep = project.episodes[i];
      sel.innerHTML += '<option value="' + ep.id + '">' + escapeHtml('Ep ' + ep.number + ': ' + ep.name) + '</option>';
    }
  }

  function renderScenes() {
    var list = document.getElementById('scenes-list');
    var filter = document.getElementById('scene-episode-filter').value;
    list.innerHTML = '';
    var scenes = project.scenes;
    if (filter !== 'all') {
      scenes = scenes.filter(function (s) { return s.episodeId === filter; });
    }
    if (scenes.length === 0) {
      list.innerHTML = '<p class="hint">No scenes yet. Click "+ Add Scene" to create one.</p>';
      return;
    }
    for (var i = 0; i < scenes.length; i++) {
      var sc = scenes[i];
      var ep = project.episodes.find(function (e) { return e.id === sc.episodeId; });
      var epLabel = ep ? 'Ep ' + ep.number : 'Unassigned';
      var charBadges = '';
      if (sc.characterIds) {
        for (var c = 0; c < sc.characterIds.length; c++) {
          var ch = project.characters.find(function (x) { return x.id === sc.characterIds[c]; });
          if (ch) charBadges += '<span class="character-badge" style="background:' + escapeHtml(ch.color) + '">' + escapeHtml(ch.name) + '</span>';
        }
      }
      var card = document.createElement('div');
      card.className = 'card';
      card.innerHTML =
        '<div class="card-title">' + escapeHtml(sc.name) + '</div>' +
        '<div class="card-meta">' + escapeHtml(epLabel + ' · ' + formatTime(sc.durationSec) + ' · ' + sc.mood) + '</div>' +
        (charBadges ? '<div style="margin-bottom:0.5rem">' + charBadges + '</div>' : '') +
        '<div class="card-body">' + escapeHtml(sc.dialogue || sc.action || '(no details)') + '</div>' +
        '<div class="card-actions">' +
          '<button class="btn-small edit-sc" data-id="' + sc.id + '">Edit</button>' +
          '<button class="btn-danger delete-sc" data-id="' + sc.id + '">Delete</button>' +
        '</div>';
      list.appendChild(card);
    }
    list.querySelectorAll('.edit-sc').forEach(function (btn) {
      btn.addEventListener('click', function () { openSceneModal(this.dataset.id); });
    });
    list.querySelectorAll('.delete-sc').forEach(function (btn) {
      btn.addEventListener('click', function () { deleteScene(this.dataset.id); });
    });
  }

  function populateSceneEpisodeDropdown() {
    var sel = document.getElementById('scene-episode');
    sel.innerHTML = '<option value="">(none)</option>';
    for (var i = 0; i < project.episodes.length; i++) {
      var ep = project.episodes[i];
      sel.innerHTML += '<option value="' + ep.id + '">' + escapeHtml('Ep ' + ep.number + ': ' + ep.name) + '</option>';
    }
  }

  function populateSceneCharacters(selected) {
    var container = document.getElementById('scene-characters');
    container.innerHTML = '';
    if (project.characters.length === 0) {
      container.innerHTML = '<span class="hint">Create characters first.</span>';
      return;
    }
    for (var i = 0; i < project.characters.length; i++) {
      var ch = project.characters[i];
      var checked = selected && selected.indexOf(ch.id) !== -1 ? 'checked' : '';
      var label = document.createElement('label');
      label.innerHTML = '<input type="checkbox" value="' + ch.id + '" ' + checked + '> ' + escapeHtml(ch.name);
      container.appendChild(label);
    }
  }

  function openSceneModal(id) {
    var modal = document.getElementById('scene-modal');
    var title = document.getElementById('scene-modal-title');
    document.getElementById('scene-form').reset();
    populateSceneEpisodeDropdown();
    if (id) {
      var sc = project.scenes.find(function (s) { return s.id === id; });
      if (!sc) return;
      title.textContent = 'Edit Scene';
      document.getElementById('scene-id').value = sc.id;
      document.getElementById('scene-name').value = sc.name;
      document.getElementById('scene-episode').value = sc.episodeId || '';
      document.getElementById('scene-location').value = sc.location || '';
      document.getElementById('scene-mood').value = sc.mood || 'neutral';
      document.getElementById('scene-duration-min').value = Math.floor((sc.durationSec || 0) / 60);
      document.getElementById('scene-duration-sec').value = (sc.durationSec || 0) % 60;
      document.getElementById('scene-dialogue').value = sc.dialogue || '';
      document.getElementById('scene-action').value = sc.action || '';
      populateSceneCharacters(sc.characterIds || []);
    } else {
      title.textContent = 'Add Scene';
      document.getElementById('scene-id').value = '';
      populateSceneCharacters([]);
    }
    modal.classList.remove('hidden');
  }

  function closeSceneModal() {
    document.getElementById('scene-modal').classList.add('hidden');
  }

  function saveScene(e) {
    e.preventDefault();
    var id = document.getElementById('scene-id').value;
    var name = document.getElementById('scene-name').value.trim();
    if (!name) return;
    var durationMin = parseInt(document.getElementById('scene-duration-min').value, 10) || 0;
    var durationSec = parseInt(document.getElementById('scene-duration-sec').value, 10) || 0;
    var sceneDur = clamp(durationMin * 60 + durationSec, 0, MAX_DURATION_SEC);

    // Check total duration limit
    var currentTotal = totalDuration();
    if (id) {
      var existing = project.scenes.find(function (s) { return s.id === id; });
      if (existing) currentTotal -= existing.durationSec || 0;
    }
    if (currentTotal + sceneDur > MAX_DURATION_SEC) {
      showToast('Cannot exceed 10-hour limit! Reduce duration.');
      return;
    }

    var charCheckboxes = document.querySelectorAll('#scene-characters input[type="checkbox"]');
    var charIds = [];
    for (var i = 0; i < charCheckboxes.length; i++) {
      if (charCheckboxes[i].checked) charIds.push(charCheckboxes[i].value);
    }

    var data = {
      name: name,
      episodeId: document.getElementById('scene-episode').value || '',
      location: document.getElementById('scene-location').value.trim(),
      mood: document.getElementById('scene-mood').value,
      durationSec: sceneDur,
      characterIds: charIds,
      dialogue: document.getElementById('scene-dialogue').value.trim(),
      action: document.getElementById('scene-action').value.trim()
    };

    if (id) {
      var sc = project.scenes.find(function (s) { return s.id === id; });
      if (sc) Object.assign(sc, data);
    } else {
      data.id = uid();
      project.scenes.push(data);
    }

    autoSave();
    closeSceneModal();
    renderScenes();
    updateDuration();
    showToast('Scene saved!');
  }

  function deleteScene(id) {
    if (!confirm('Delete this scene?')) return;
    project.scenes = project.scenes.filter(function (s) { return s.id !== id; });
    // Remove related panels
    project.panels = project.panels.filter(function (p) { return p.sceneId !== id; });
    autoSave();
    renderScenes();
    updateDuration();
    showToast('Scene deleted.');
  }

  function initScenes() {
    document.getElementById('add-scene-btn').addEventListener('click', function () {
      openSceneModal(null);
    });
    document.getElementById('scene-cancel-btn').addEventListener('click', closeSceneModal);
    document.getElementById('scene-form').addEventListener('submit', saveScene);
    document.getElementById('scene-episode-filter').addEventListener('change', renderScenes);
    refreshSceneEpisodeFilter();
    renderScenes();
  }

  /* ===================================================================
     Timeline
     =================================================================== */
  function renderTimeline() {
    var total = totalDuration();
    var maxSec = Math.max(total, 300); // At least 5 minutes shown
    var wrapper = document.getElementById('timeline-wrapper');
    var pixelsPerSec = (zoomLevel / 100) * 1.5;
    var totalWidth = Math.max(maxSec * pixelsPerSec, wrapper.clientWidth - 20);

    // Ruler
    var ruler = document.getElementById('timeline-ruler');
    ruler.innerHTML = '';
    ruler.style.width = totalWidth + 'px';
    var interval = 60; // Mark every minute by default
    if (pixelsPerSec < 0.3) interval = 600; // every 10 min
    else if (pixelsPerSec < 0.8) interval = 300; // every 5 min
    for (var t = 0; t <= maxSec; t += interval) {
      var mark = document.createElement('div');
      mark.className = 'ruler-mark';
      mark.style.left = (t * pixelsPerSec) + 'px';
      mark.textContent = formatTime(t);
      ruler.appendChild(mark);
    }

    // Tracks – group scenes by episode (or ungrouped)
    var tracks = document.getElementById('timeline-tracks');
    tracks.innerHTML = '';
    tracks.style.width = totalWidth + 'px';

    var filterVal = document.getElementById('timeline-episode-filter').value;
    var groups = {};
    for (var i = 0; i < project.scenes.length; i++) {
      var sc = project.scenes[i];
      if (filterVal !== 'all' && sc.episodeId !== filterVal) continue;
      var gKey = sc.episodeId || '_none';
      if (!groups[gKey]) groups[gKey] = [];
      groups[gKey].push(sc);
    }

    var groupKeys = Object.keys(groups);
    for (var g = 0; g < groupKeys.length; g++) {
      var key = groupKeys[g];
      var ep = project.episodes.find(function (e) { return e.id === key; });
      var label = ep ? 'Ep ' + ep.number : 'Unassigned';
      var scenesArr = groups[key];

      var track = document.createElement('div');
      track.className = 'timeline-track';

      var trackLabel = document.createElement('div');
      trackLabel.className = 'track-label';
      trackLabel.textContent = label;
      track.appendChild(trackLabel);

      var barContainer = document.createElement('div');
      barContainer.className = 'track-bar-container';
      barContainer.style.width = totalWidth + 'px';

      var offset = 0;
      for (var s = 0; s < scenesArr.length; s++) {
        var scene = scenesArr[s];
        var barWidth = Math.max(scene.durationSec * pixelsPerSec, 4);
        var bar = document.createElement('div');
        bar.className = 'track-bar';
        bar.style.left = (offset * pixelsPerSec) + 'px';
        bar.style.width = barWidth + 'px';
        bar.style.background = COLORS[s % COLORS.length];
        bar.title = scene.name + ' (' + formatTime(scene.durationSec) + ')';
        bar.textContent = scene.name;
        barContainer.appendChild(bar);
        offset += scene.durationSec;
      }

      track.appendChild(barContainer);
      tracks.appendChild(track);
    }

    if (groupKeys.length === 0) {
      tracks.innerHTML = '<p class="hint" style="padding:1rem">No scenes to display. Add scenes first.</p>';
    }

    // Stats
    document.getElementById('stat-duration').textContent = formatTime(total);
    document.getElementById('stat-scenes').textContent = String(project.scenes.length);
    document.getElementById('stat-remaining').textContent = formatTime(Math.max(0, MAX_DURATION_SEC - total));
  }

  function initTimeline() {
    document.getElementById('zoom-in-btn').addEventListener('click', function () {
      zoomLevel = clamp(zoomLevel + 25, 25, 400);
      document.getElementById('zoom-level').textContent = zoomLevel + '%';
      renderTimeline();
    });
    document.getElementById('zoom-out-btn').addEventListener('click', function () {
      zoomLevel = clamp(zoomLevel - 25, 25, 400);
      document.getElementById('zoom-level').textContent = zoomLevel + '%';
      renderTimeline();
    });
    // Episode filter for timeline
    var sel = document.getElementById('timeline-episode-filter');
    sel.addEventListener('change', renderTimeline);
  }

  function refreshTimelineEpisodeFilter() {
    var sel = document.getElementById('timeline-episode-filter');
    sel.innerHTML = '<option value="all">All Episodes</option>';
    for (var i = 0; i < project.episodes.length; i++) {
      var ep = project.episodes[i];
      sel.innerHTML += '<option value="' + ep.id + '">' + escapeHtml('Ep ' + ep.number + ': ' + ep.name) + '</option>';
    }
  }

  /* ===================================================================
     Storyboard
     =================================================================== */
  function refreshStoryboardFilter() {
    var sel = document.getElementById('storyboard-scene-filter');
    sel.innerHTML = '<option value="">Select a scene</option>';
    for (var i = 0; i < project.scenes.length; i++) {
      var sc = project.scenes[i];
      sel.innerHTML += '<option value="' + sc.id + '">' + escapeHtml(sc.name) + '</option>';
    }
  }

  function renderStoryboardPanels() {
    var sceneId = document.getElementById('storyboard-scene-filter').value;
    var container = document.getElementById('storyboard-panels');
    var addBtn = document.getElementById('add-panel-btn');
    container.innerHTML = '';
    if (!sceneId) {
      addBtn.disabled = true;
      container.innerHTML = '<p class="hint">Select a scene to view its storyboard panels.</p>';
      return;
    }
    addBtn.disabled = false;
    var panels = project.panels.filter(function (p) { return p.sceneId === sceneId; });
    if (panels.length === 0) {
      container.innerHTML = '<p class="hint">No panels yet for this scene.</p>';
      return;
    }
    for (var i = 0; i < panels.length; i++) {
      var p = panels[i];
      var card = document.createElement('div');
      card.className = 'panel-card';
      var imgHtml = p.imageData
        ? '<img src="' + p.imageData + '" alt="Panel sketch">'
        : '<div style="height:150px;background:var(--bg-input);display:flex;align-items:center;justify-content:center;color:var(--text-secondary);font-size:0.8rem">(no sketch)</div>';
      card.innerHTML =
        imgHtml +
        '<div class="panel-card-body">' +
          '<p class="panel-camera">' + escapeHtml(p.camera) + '</p>' +
          '<p>' + escapeHtml(p.description) + '</p>' +
          (p.dialogue ? '<p><em>' + escapeHtml(p.dialogue) + '</em></p>' : '') +
          (p.sfx ? '<p>🔊 ' + escapeHtml(p.sfx) + '</p>' : '') +
          '<div class="card-actions">' +
            '<button class="btn-small edit-pn" data-id="' + p.id + '">Edit</button>' +
            '<button class="btn-danger delete-pn" data-id="' + p.id + '">Delete</button>' +
          '</div>' +
        '</div>';
      container.appendChild(card);
    }
    container.querySelectorAll('.edit-pn').forEach(function (btn) {
      btn.addEventListener('click', function () { openPanelModal(this.dataset.id); });
    });
    container.querySelectorAll('.delete-pn').forEach(function (btn) {
      btn.addEventListener('click', function () { deletePanel(this.dataset.id); });
    });
  }

  /* --- Canvas drawing --- */
  var canvasDrawing = false;
  var canvasCtx = null;

  function initCanvasDrawing() {
    var canvas = document.getElementById('panel-canvas');
    canvasCtx = canvas.getContext('2d');

    function getPos(e) {
      var rect = canvas.getBoundingClientRect();
      var scaleX = canvas.width / rect.width;
      var scaleY = canvas.height / rect.height;
      var clientX, clientY;
      if (e.touches) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
      };
    }

    function startDraw(e) {
      canvasDrawing = true;
      var pos = getPos(e);
      canvasCtx.beginPath();
      canvasCtx.moveTo(pos.x, pos.y);
    }

    function draw(e) {
      if (!canvasDrawing) return;
      e.preventDefault();
      var pos = getPos(e);
      canvasCtx.lineWidth = document.getElementById('canvas-size').value;
      canvasCtx.strokeStyle = document.getElementById('canvas-color').value;
      canvasCtx.lineCap = 'round';
      canvasCtx.lineTo(pos.x, pos.y);
      canvasCtx.stroke();
    }

    function stopDraw() {
      canvasDrawing = false;
    }

    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDraw);
    canvas.addEventListener('mouseleave', stopDraw);
    canvas.addEventListener('touchstart', startDraw);
    canvas.addEventListener('touchmove', draw);
    canvas.addEventListener('touchend', stopDraw);

    document.getElementById('canvas-clear').addEventListener('click', function () {
      canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
    });
  }

  function openPanelModal(id) {
    var modal = document.getElementById('panel-modal');
    var title = document.getElementById('panel-modal-title');
    document.getElementById('panel-form').reset();
    var canvas = document.getElementById('panel-canvas');
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

    if (id) {
      var p = project.panels.find(function (x) { return x.id === id; });
      if (!p) return;
      title.textContent = 'Edit Panel';
      document.getElementById('panel-id').value = p.id;
      document.getElementById('panel-scene-id').value = p.sceneId;
      document.getElementById('panel-description').value = p.description;
      document.getElementById('panel-camera').value = p.camera;
      document.getElementById('panel-dialogue').value = p.dialogue || '';
      document.getElementById('panel-sfx').value = p.sfx || '';
      // Restore drawing
      if (p.imageData) {
        var img = new Image();
        img.onload = function () {
          canvasCtx.drawImage(img, 0, 0, canvas.width, canvas.height);
        };
        img.src = p.imageData;
      }
    } else {
      title.textContent = 'Add Panel';
      document.getElementById('panel-id').value = '';
      document.getElementById('panel-scene-id').value = document.getElementById('storyboard-scene-filter').value;
    }
    modal.classList.remove('hidden');
  }

  function closePanelModal() {
    document.getElementById('panel-modal').classList.add('hidden');
  }

  function savePanel(e) {
    e.preventDefault();
    var id = document.getElementById('panel-id').value;
    var sceneId = document.getElementById('panel-scene-id').value;
    var description = document.getElementById('panel-description').value.trim();
    if (!description || !sceneId) return;

    var canvas = document.getElementById('panel-canvas');
    var imageData = canvas.toDataURL('image/png');

    var data = {
      sceneId: sceneId,
      description: description,
      camera: document.getElementById('panel-camera').value,
      dialogue: document.getElementById('panel-dialogue').value.trim(),
      sfx: document.getElementById('panel-sfx').value.trim(),
      imageData: imageData
    };

    if (id) {
      var p = project.panels.find(function (x) { return x.id === id; });
      if (p) Object.assign(p, data);
    } else {
      data.id = uid();
      project.panels.push(data);
    }

    autoSave();
    closePanelModal();
    renderStoryboardPanels();
    showToast('Panel saved!');
  }

  function deletePanel(id) {
    if (!confirm('Delete this panel?')) return;
    project.panels = project.panels.filter(function (p) { return p.id !== id; });
    autoSave();
    renderStoryboardPanels();
    showToast('Panel deleted.');
  }

  function initStoryboard() {
    document.getElementById('storyboard-scene-filter').addEventListener('change', renderStoryboardPanels);
    document.getElementById('add-panel-btn').addEventListener('click', function () {
      openPanelModal(null);
    });
    document.getElementById('panel-cancel-btn').addEventListener('click', closePanelModal);
    document.getElementById('panel-form').addEventListener('submit', savePanel);
    initCanvasDrawing();
    refreshStoryboardFilter();
  }

  /* ===================================================================
     Export / Import
     =================================================================== */
  function downloadFile(content, filename, mime) {
    var blob = new Blob([content], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function exportJSON() {
    var json = JSON.stringify(project, null, 2);
    var title = project.title || 'anime-project';
    downloadFile(json, title.replace(/\s+/g, '-') + '.json', 'application/json');
    showToast('Project JSON downloaded!');
  }

  function exportText() {
    var lines = [];
    var title = project.title || 'Untitled Project';
    lines.push('='.repeat(60));
    lines.push(title.toUpperCase());
    lines.push('='.repeat(60));
    lines.push('Type: ' + project.type);
    lines.push('Genre: ' + project.genre);
    lines.push('FPS: ' + project.fps + '   Resolution: ' + project.resolution);
    lines.push('Total Duration: ' + formatTime(totalDuration()) + ' / 10:00:00');
    lines.push('');
    if (project.description) {
      lines.push('SYNOPSIS');
      lines.push('-'.repeat(40));
      lines.push(project.description);
      lines.push('');
    }

    // Characters
    if (project.characters.length) {
      lines.push('CHARACTERS');
      lines.push('-'.repeat(40));
      for (var c = 0; c < project.characters.length; c++) {
        var ch = project.characters[c];
        lines.push('  ' + ch.name + ' (' + ch.role + ')');
        if (ch.description) lines.push('    ' + ch.description);
        if (ch.traits) lines.push('    Traits: ' + ch.traits);
      }
      lines.push('');
    }

    // Episodes & Scenes
    var episodes = project.episodes.slice().sort(function (a, b) { return a.number - b.number; });
    if (episodes.length > 0) {
      for (var e = 0; e < episodes.length; e++) {
        var ep = episodes[e];
        lines.push('EPISODE ' + ep.number + ': ' + ep.name);
        lines.push('-'.repeat(40));
        if (ep.synopsis) lines.push(ep.synopsis);
        var epScenes = project.scenes.filter(function (s) { return s.episodeId === ep.id; });
        for (var s = 0; s < epScenes.length; s++) {
          var sc = epScenes[s];
          lines.push('');
          lines.push('  SCENE: ' + sc.name + '  [' + formatTime(sc.durationSec) + ']');
          if (sc.location) lines.push('  Location: ' + sc.location);
          lines.push('  Mood: ' + sc.mood);
          if (sc.dialogue) { lines.push('  Dialogue:'); lines.push('    ' + sc.dialogue); }
          if (sc.action) { lines.push('  Action:'); lines.push('    ' + sc.action); }
        }
        lines.push('');
      }
    }

    // Unassigned scenes
    var unassigned = project.scenes.filter(function (s) { return !s.episodeId; });
    if (unassigned.length > 0) {
      lines.push('UNASSIGNED SCENES');
      lines.push('-'.repeat(40));
      for (var u = 0; u < unassigned.length; u++) {
        var su = unassigned[u];
        lines.push('  SCENE: ' + su.name + '  [' + formatTime(su.durationSec) + ']');
        if (su.dialogue) { lines.push('  Dialogue:'); lines.push('    ' + su.dialogue); }
        if (su.action) { lines.push('  Action:'); lines.push('    ' + su.action); }
        lines.push('');
      }
    }

    downloadFile(lines.join('\n'), (project.title || 'anime-project').replace(/\s+/g, '-') + '-summary.txt', 'text/plain');
    showToast('Summary downloaded!');
  }

  function importJSON() {
    document.getElementById('import-file').click();
  }

  function handleImport(e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (ev) {
      try {
        var data = JSON.parse(ev.target.result);
        if (!data || typeof data.title !== 'string') {
          showToast('Invalid project file.');
          return;
        }
        project = data;
        project.episodes = project.episodes || [];
        project.scenes = project.scenes || [];
        project.characters = project.characters || [];
        project.panels = project.panels || [];
        autoSave();
        refreshAll();
        showToast('Project imported successfully!');
      } catch (_) {
        showToast('Failed to parse file.');
      }
    };
    reader.readAsText(file);
    // Reset so the same file can be re-imported
    e.target.value = '';
  }

  function initExport() {
    document.getElementById('export-json-btn').addEventListener('click', exportJSON);
    document.getElementById('export-text-btn').addEventListener('click', exportText);
    document.getElementById('import-btn').addEventListener('click', importJSON);
    document.getElementById('import-file').addEventListener('change', handleImport);
  }

  /* ===================================================================
     Duration Display
     =================================================================== */
  function updateDuration() {
    var total = totalDuration();
    document.getElementById('total-duration-display').textContent =
      'Total: ' + formatTime(total) + ' / ' + formatTime(MAX_DURATION_SEC);
    refreshTimelineEpisodeFilter();
  }

  /* ===================================================================
     Refresh Everything (after import or load)
     =================================================================== */
  function refreshAll() {
    initProjectForm();
    renderEpisodes();
    renderCharacters();
    refreshSceneEpisodeFilter();
    renderScenes();
    refreshTimelineEpisodeFilter();
    refreshStoryboardFilter();
    renderStoryboardPanels();
    updateDuration();
  }

  /* ===================================================================
     Boot
     =================================================================== */
  function init() {
    autoLoad();
    initTabs();
    initProjectForm();
    initEpisodes();
    initCharacters();
    initScenes();
    initTimeline();
    initStoryboard();
    initExport();
    updateDuration();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
