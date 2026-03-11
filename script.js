/* ============================================================
   My Anime Maker – script.js
   Pure client-side anime movie / show planner.
   Supports projects up to 10 hours (36 000 seconds) of content.
   ============================================================ */

(function () {
  'use strict';

  /* ---------- constants ---------- */
  var MAX_DURATION_SEC = 36000; // 10 hours – maximum project length per requirements
  var AUTOSAVE_KEY = 'anime-maker-project';
  var EPISODE_DURATION_SEC = 6600;  // 1 h 50 min per episode for shows
  var MOVIE_DURATION_SEC  = 10200;  // 2 h 50 min for movies
  var MAX_EPISODES = 50;
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
     Genre-aware scene templates
     =================================================================== */
  var GENRE_TEMPLATES = {
    action: {
      characters: [
        { name: 'Hero', role: 'protagonist', description: 'A determined warrior driven by justice.', traits: 'brave, strong, relentless' },
        { name: 'Rival', role: 'antagonist', description: 'A powerful opponent with a personal grudge.', traits: 'cunning, fierce, proud' },
        { name: 'Ally', role: 'supporting', description: 'A loyal friend who fights alongside the hero.', traits: 'loyal, clever, resourceful' }
      ],
      movieScenes: [
        { name: 'Opening – The Calm Before', mood: 'tense', location: 'Quiet village at dawn', pct: 6, dialogue: 'Narrator: Peace is always fragile…', action: 'Establishing shot of the village. Slow pan over rooftops.' },
        { name: 'Act 1 – The Incident', mood: 'action', location: 'Village square', pct: 15, dialogue: 'Hero: What was that explosion?!', action: 'Explosion rocks the village. Hero rushes to the scene.' },
        { name: 'Act 1 – Call to Arms', mood: 'tense', location: 'Ruins of the village gate', pct: 12, dialogue: 'Ally: We can\'t just stand here. We have to fight back!', action: 'Hero gathers weapons and rallies survivors.' },
        { name: 'Act 2 – The Journey Begins', mood: 'neutral', location: 'Forest trail', pct: 14, dialogue: 'Hero: The enemy base is beyond the mountains.', action: 'Montage of the group traveling through varied terrain.' },
        { name: 'Act 2 – First Battle', mood: 'action', location: 'Mountain pass ambush', pct: 12, dialogue: 'Rival: You dare enter my domain?', action: 'Intense sword fight on a narrow mountain bridge.' },
        { name: 'Act 3 – Training & Resolve', mood: 'neutral', location: 'Hidden waterfall camp', pct: 10, dialogue: 'Ally: You need to master the technique before we face him again.', action: 'Training montage with dramatic power-up moment.' },
        { name: 'Climax – Final Confrontation', mood: 'action', location: 'Enemy fortress throne room', pct: 18, dialogue: 'Hero: This ends now!\nRival: You\'re not strong enough!', action: 'Epic multi-stage battle. Explosions, clashing swords, power bursts.' },
        { name: 'Resolution – Victory', mood: 'happy', location: 'Crumbling fortress rooftop, sunrise', pct: 8, dialogue: 'Hero: It\'s over…\nAlly: We did it.', action: 'Hero stands victorious as the sun rises. Slow emotional music.' },
        { name: 'Ending – A New Dawn', mood: 'neutral', location: 'Rebuilt village', pct: 5, dialogue: 'Narrator: And so, peace returned… for now.', action: 'Panoramic shot of the rebuilt village. Credits begin.' }
      ],
      episodeScenes: [
        { name: 'Cold Open', mood: 'tense', location: 'Unknown battlefield (flashback)', pct: 5, dialogue: '', action: 'Quick flashback teaser of an upcoming battle.' },
        { name: 'Opening – Daily Life', mood: 'neutral', location: 'Hero\'s home', pct: 8, dialogue: 'Hero: Another quiet morning…', action: 'Slice-of-life opening, establishing the hero\'s routine.' },
        { name: 'Act 1 – The Threat Appears', mood: 'tense', location: 'Town center', pct: 15, dialogue: 'Ally: Did you see that? Something is coming!', action: 'A mysterious threat emerges. Townspeople panic.' },
        { name: 'Act 1 – Gearing Up', mood: 'neutral', location: 'Armory / training grounds', pct: 12, dialogue: 'Hero: I need to be ready.', action: 'Preparation sequence. Gathering equipment and intel.' },
        { name: 'Act 2 – Confrontation', mood: 'action', location: 'Abandoned warehouse district', pct: 20, dialogue: 'Rival: You\'re too late, hero!\nHero: We\'ll see about that!', action: 'Major fight sequence with dynamic camera work.' },
        { name: 'Act 2 – Setback', mood: 'sad', location: 'Rooftop at dusk', pct: 10, dialogue: 'Hero: I wasn\'t strong enough…', action: 'Hero reflects on the loss. Emotional flashback.' },
        { name: 'Climax – Turning Point', mood: 'action', location: 'Bridge over the river', pct: 18, dialogue: 'Hero: I won\'t give up! Not now, not ever!', action: 'Hero powers up and turns the tide of the battle.' },
        { name: 'Resolution', mood: 'happy', location: 'Sunset hilltop', pct: 7, dialogue: 'Ally: You really pulled through.', action: 'Calm aftermath. Characters regroup.' },
        { name: 'Ending – Cliffhanger', mood: 'mysterious', location: 'Dark alley', pct: 5, dialogue: 'Unknown voice: This is only the beginning…', action: 'Shadowy figure watches from afar. Fade to black.' }
      ]
    },
    adventure: {
      characters: [
        { name: 'Explorer', role: 'protagonist', description: 'A curious traveler seeking the unknown.', traits: 'curious, brave, optimistic' },
        { name: 'Guide', role: 'supporting', description: 'A mysterious local who knows the land.', traits: 'wise, secretive, kind' },
        { name: 'Guardian', role: 'antagonist', description: 'Ancient protector of the forbidden treasure.', traits: 'powerful, ancient, just' }
      ],
      movieScenes: [
        { name: 'Opening – The Map', mood: 'mysterious', location: 'Old library', pct: 6, dialogue: 'Explorer: This map… it leads somewhere no one has ever returned from.', action: 'Close-up on an ancient map. Dust particles in the light.' },
        { name: 'Act 1 – Setting Out', mood: 'happy', location: 'Harbor at sunrise', pct: 14, dialogue: 'Explorer: Adventure awaits!', action: 'Departure montage. Ship sailing across the ocean.' },
        { name: 'Act 1 – Strange Lands', mood: 'mysterious', location: 'Uncharted jungle island', pct: 12, dialogue: 'Guide: Stay close. This place has a mind of its own.', action: 'Exploring dense jungle. Strange creatures appear.' },
        { name: 'Act 2 – The First Trial', mood: 'tense', location: 'Temple of puzzles', pct: 14, dialogue: 'Explorer: There has to be a pattern…', action: 'Solving ancient puzzles. Traps spring to life.' },
        { name: 'Act 2 – Bonding', mood: 'happy', location: 'Campfire in a cave', pct: 10, dialogue: 'Guide: Let me tell you the legend of this place.', action: 'Quiet campfire scene. Story within a story.' },
        { name: 'Act 3 – The Guardian Awakens', mood: 'tense', location: 'Heart of the temple', pct: 14, dialogue: 'Guardian: Who dares disturb the sacred vault?', action: 'Massive guardian rises. Dramatic confrontation.' },
        { name: 'Climax – The Choice', mood: 'tense', location: 'Treasure chamber', pct: 16, dialogue: 'Explorer: The treasure isn\'t gold… it\'s knowledge.', action: 'Explorer must choose between taking the treasure or saving the Guide.' },
        { name: 'Resolution – Homeward Bound', mood: 'happy', location: 'Ship deck, open ocean', pct: 9, dialogue: 'Explorer: The real treasure was the journey itself.', action: 'Sailing home with new wisdom. Peaceful ocean vista.' },
        { name: 'Ending – Next Horizon', mood: 'neutral', location: 'Explorer\'s study', pct: 5, dialogue: 'Explorer: Now… where to next?', action: 'Explorer pins a new map on the wall. Smile. Credits.' }
      ],
      episodeScenes: [
        { name: 'Cold Open', mood: 'mysterious', location: 'Ancient ruins', pct: 5, dialogue: '', action: 'Teaser of a mysterious discovery.' },
        { name: 'Opening – Preparation', mood: 'happy', location: 'Explorer\'s camp', pct: 10, dialogue: 'Explorer: Today we head into the unknown!', action: 'Packing gear, studying maps.' },
        { name: 'Act 1 – Into the Wild', mood: 'neutral', location: 'Dense forest path', pct: 15, dialogue: 'Guide: Watch your step here.', action: 'Navigating treacherous terrain.' },
        { name: 'Act 2 – Discovery', mood: 'mysterious', location: 'Hidden cavern', pct: 20, dialogue: 'Explorer: Look at these markings!', action: 'Finding clues, ancient inscriptions.' },
        { name: 'Act 2 – Danger Strikes', mood: 'tense', location: 'Collapsing cave', pct: 15, dialogue: 'Guide: Run! Now!', action: 'Escape sequence through crumbling passages.' },
        { name: 'Climax – The Revelation', mood: 'tense', location: 'Underground lake', pct: 18, dialogue: 'Explorer: So this is what the legends spoke of…', action: 'Major discovery. Dramatic reveal.' },
        { name: 'Resolution', mood: 'happy', location: 'Cliffside camp, sunset', pct: 10, dialogue: 'Explorer: One step closer to the truth.', action: 'Reflecting on the day\'s events.' },
        { name: 'Ending – What Lies Ahead', mood: 'mysterious', location: 'Distant mountains', pct: 7, dialogue: 'Narrator: But the journey was far from over…', action: 'Camera pulls back to reveal vast unexplored landscape.' }
      ]
    },
    comedy: {
      characters: [
        { name: 'Goofball', role: 'protagonist', description: 'A well-meaning but clumsy student who attracts chaos.', traits: 'funny, kind, clumsy' },
        { name: 'Straight Man', role: 'supporting', description: 'The sensible friend who always gets dragged into schemes.', traits: 'sarcastic, smart, patient' },
        { name: 'Prankster', role: 'supporting', description: 'The class troublemaker with a heart of gold.', traits: 'mischievous, creative, loyal' }
      ],
      movieScenes: [
        { name: 'Opening – Morning Chaos', mood: 'comedic', location: 'Protagonist\'s messy bedroom', pct: 6, dialogue: 'Goofball: I\'m late! Again!', action: 'Alarm clock flies across the room. Frantic morning routine.' },
        { name: 'Act 1 – The Big Idea', mood: 'comedic', location: 'School cafeteria', pct: 14, dialogue: 'Prankster: I have the greatest plan ever!\nStraight Man: Your last "great plan" got us banned from the pool.', action: 'Flashback gag to previous disasters.' },
        { name: 'Act 1 – Plan in Motion', mood: 'comedic', location: 'School hallways', pct: 12, dialogue: 'Goofball: What could possibly go wrong?', action: 'Montage of increasingly absurd preparation.' },
        { name: 'Act 2 – Everything Goes Wrong', mood: 'comedic', location: 'School gymnasium', pct: 16, dialogue: 'Straight Man: I told you this would happen.\nGoofball: Technically, this is going exactly as planned!', action: 'Chain reaction of comedic failures.' },
        { name: 'Act 2 – The Chase', mood: 'comedic', location: 'Across the entire school', pct: 14, dialogue: 'Prankster: Run! The principal saw everything!', action: 'Slapstick chase sequence through the school.' },
        { name: 'Act 3 – Unlikely Redemption', mood: 'happy', location: 'School auditorium', pct: 12, dialogue: 'Goofball: Wait… what if we use this disaster for the school festival?', action: 'The mess accidentally becomes art.' },
        { name: 'Climax – The Show', mood: 'happy', location: 'School stage', pct: 14, dialogue: 'Audience: This is amazing!', action: 'The chaotic creation wins the festival. Crowd goes wild.' },
        { name: 'Resolution – Friends Forever', mood: 'happy', location: 'Rooftop at sunset', pct: 7, dialogue: 'Straight Man: I can\'t believe that actually worked.\nGoofball: Never doubt the power of chaos!', action: 'Friends laughing together on the rooftop.' },
        { name: 'Ending – Next Disaster', mood: 'comedic', location: 'School entrance, next day', pct: 5, dialogue: 'Prankster: So… I have another idea…\nStraight Man: NO.', action: 'Freeze frame. Credits roll with blooper reel.' }
      ],
      episodeScenes: [
        { name: 'Cold Open – Gag', mood: 'comedic', location: 'Random location', pct: 5, dialogue: '', action: 'Quick sight gag or callback to previous episode.' },
        { name: 'Opening – Setup', mood: 'comedic', location: 'Classroom', pct: 10, dialogue: 'Goofball: Guess what happened to me today!', action: 'Establishing the episode\'s comedic premise.' },
        { name: 'Act 1 – The Scheme', mood: 'comedic', location: 'School grounds', pct: 18, dialogue: 'Prankster: Trust me, this will be hilarious!', action: 'Hatching a ridiculous plan.' },
        { name: 'Act 2 – Escalation', mood: 'comedic', location: 'Various school locations', pct: 22, dialogue: 'Straight Man: How did it get this bad this fast?', action: 'Plan spirals out of control with escalating gags.' },
        { name: 'Climax – Maximum Chaos', mood: 'comedic', location: 'Main hall', pct: 18, dialogue: 'Everyone: WHAT IS HAPPENING?!', action: 'Everything comes to a head in spectacular fashion.' },
        { name: 'Resolution – Lesson Learned', mood: 'happy', location: 'Usual hangout spot', pct: 15, dialogue: 'Goofball: We probably shouldn\'t do that again.\nPrankster: Agreed. Let\'s do something worse.', action: 'Friends reconcile. Quick heartfelt moment before final gag.' },
        { name: 'Ending – Stinger', mood: 'comedic', location: 'After credits', pct: 12, dialogue: '', action: 'Post-credits gag that sets up next episode.' }
      ]
    },
    romance: {
      characters: [
        { name: 'Protagonist', role: 'protagonist', description: 'A shy student hiding deep feelings.', traits: 'kind, shy, thoughtful' },
        { name: 'Love Interest', role: 'supporting', description: 'The popular, warm-hearted classmate.', traits: 'warm, confident, caring' },
        { name: 'Best Friend', role: 'supporting', description: 'The protagonist\'s encouraging confidant.', traits: 'supportive, funny, perceptive' }
      ],
      movieScenes: [
        { name: 'Opening – Cherry Blossoms', mood: 'neutral', location: 'School entrance, spring', pct: 6, dialogue: 'Narrator: It all started on the first day of spring.', action: 'Cherry blossoms falling. Protagonist walks to school alone.' },
        { name: 'Act 1 – First Encounter', mood: 'romantic', location: 'School hallway', pct: 14, dialogue: 'Love Interest: Oh! Sorry, I didn\'t see you there.\nProtagonist: N-no, it\'s my fault!', action: 'Accidental collision. Books scatter. Eyes meet.' },
        { name: 'Act 1 – Growing Closer', mood: 'happy', location: 'Library, rooftop, park', pct: 12, dialogue: 'Best Friend: You keep staring at them, you know.', action: 'Montage of small interactions building connection.' },
        { name: 'Act 2 – The Festival Date', mood: 'romantic', location: 'Summer festival, lantern-lit street', pct: 16, dialogue: 'Love Interest: I\'m glad we came together.\nProtagonist: Me too…', action: 'Festival date. Fireworks, goldfish scooping, shared moments.' },
        { name: 'Act 2 – Misunderstanding', mood: 'sad', location: 'School rooftop, rainy day', pct: 12, dialogue: 'Protagonist: Maybe they don\'t feel the same way…', action: 'A misunderstanding drives them apart. Rainy montage.' },
        { name: 'Act 3 – Heart to Heart', mood: 'sad', location: 'Best Friend\'s room', pct: 10, dialogue: 'Best Friend: You need to tell them how you feel. No more running.', action: 'Emotional conversation. Protagonist makes a decision.' },
        { name: 'Climax – Confession', mood: 'romantic', location: 'School rooftop at sunset', pct: 16, dialogue: 'Protagonist: I… I\'ve liked you for a long time!\nLove Interest: I\'ve been waiting for you to say that.', action: 'Dramatic confession scene. Wind blows. Sun sets. Tears of joy.' },
        { name: 'Resolution – Together', mood: 'happy', location: 'Walking home, golden hour', pct: 9, dialogue: 'Love Interest: Walk me home?\nProtagonist: Always.', action: 'Holding hands for the first time. Warm golden light.' },
        { name: 'Ending – New Beginning', mood: 'happy', location: 'School entrance, next spring', pct: 5, dialogue: 'Narrator: And that was just the beginning of their story.', action: 'Cherry blossoms again. They walk in together. Credits.' }
      ],
      episodeScenes: [
        { name: 'Cold Open', mood: 'romantic', location: 'Dream sequence', pct: 5, dialogue: '', action: 'Soft, dreamy opening. Protagonist imagines a perfect moment.' },
        { name: 'Opening – School Day', mood: 'neutral', location: 'Classroom', pct: 10, dialogue: 'Best Friend: You\'re spacing out again!', action: 'Establishing daily routine. Glances across the room.' },
        { name: 'Act 1 – Encounter', mood: 'romantic', location: 'School grounds', pct: 18, dialogue: 'Love Interest: Want to walk together?', action: 'A chance meeting that brightens the day.' },
        { name: 'Act 2 – Together', mood: 'happy', location: 'Café / park / library', pct: 22, dialogue: 'Protagonist: This is nice…', action: 'Spending time together. Small tender moments.' },
        { name: 'Act 2 – Doubt', mood: 'sad', location: 'Protagonist\'s room at night', pct: 12, dialogue: 'Protagonist: Do they really like spending time with me?', action: 'Internal conflict. Overthinking.' },
        { name: 'Climax – Moment of Truth', mood: 'romantic', location: 'Meaningful location', pct: 18, dialogue: 'Love Interest: You mean a lot to me.', action: 'An honest moment that deepens their bond.' },
        { name: 'Resolution', mood: 'happy', location: 'Walking home', pct: 10, dialogue: 'Protagonist: See you tomorrow?', action: 'Warm farewell. Lingering smiles.' },
        { name: 'Ending – Preview', mood: 'mysterious', location: 'School shoe lockers', pct: 5, dialogue: 'Unknown: A letter?!', action: 'A mysterious letter appears. Tease for next episode.' }
      ]
    },
    drama: {
      characters: [
        { name: 'Lead', role: 'protagonist', description: 'A person facing a life-changing crisis.', traits: 'resilient, emotional, determined' },
        { name: 'Mentor', role: 'supporting', description: 'A wise figure with their own pain.', traits: 'wise, scarred, compassionate' },
        { name: 'Antagonist', role: 'antagonist', description: 'Someone whose goals clash with the lead.', traits: 'driven, cold, complex' }
      ],
      movieScenes: [
        { name: 'Opening – Status Quo', mood: 'neutral', location: 'Lead\'s apartment', pct: 7, dialogue: 'Lead: Same routine, same silence.', action: 'Quiet morning. Establishing the emptiness of daily life.' },
        { name: 'Act 1 – The Disruption', mood: 'tense', location: 'Workplace / school', pct: 14, dialogue: 'Mentor: Something is about to change for you.', action: 'An event shatters the lead\'s comfortable routine.' },
        { name: 'Act 1 – Denial', mood: 'sad', location: 'City streets, night', pct: 11, dialogue: 'Lead: This can\'t be happening.', action: 'Lead wanders in denial. Flashbacks to happier times.' },
        { name: 'Act 2 – Struggle', mood: 'tense', location: 'Various locations', pct: 16, dialogue: 'Lead: I have to face this.', action: 'Confronting obstacles. Setbacks and small victories.' },
        { name: 'Act 2 – Confrontation', mood: 'tense', location: 'Antagonist\'s office', pct: 14, dialogue: 'Antagonist: You don\'t have what it takes.', action: 'Heated argument. Raw emotions surface.' },
        { name: 'Act 3 – Breaking Point', mood: 'sad', location: 'Rain-soaked park bench', pct: 10, dialogue: 'Lead: Maybe they\'re right…', action: 'Lead at their lowest point. Mentor arrives.' },
        { name: 'Climax – Resolve', mood: 'tense', location: 'Courtroom / boardroom / stage', pct: 16, dialogue: 'Lead: I\'m not giving up. Not for anyone.', action: 'Lead makes their stand. Powerful speech or action.' },
        { name: 'Resolution', mood: 'happy', location: 'Quiet café', pct: 7, dialogue: 'Mentor: I\'m proud of you.', action: 'Peaceful resolution. New understanding.' },
        { name: 'Ending – Moving Forward', mood: 'neutral', location: 'Open road', pct: 5, dialogue: 'Lead: One step at a time.', action: 'Lead walks forward into a new chapter.' }
      ],
      episodeScenes: [
        { name: 'Cold Open', mood: 'tense', location: 'Flashback', pct: 5, dialogue: '', action: 'Emotional flashback to a pivotal past moment.' },
        { name: 'Opening – Daily Routine', mood: 'neutral', location: 'Home', pct: 10, dialogue: 'Lead: Another day.', action: 'Morning routine establishing current emotional state.' },
        { name: 'Act 1 – Inciting Event', mood: 'tense', location: 'Public place', pct: 18, dialogue: 'Lead: What do you mean?', action: 'News or event that disrupts the status quo.' },
        { name: 'Act 2 – Dealing With It', mood: 'sad', location: 'Various', pct: 22, dialogue: 'Mentor: You can\'t run from this.', action: 'Struggling with the new reality.' },
        { name: 'Climax – Emotional Peak', mood: 'tense', location: 'Confrontation setting', pct: 20, dialogue: 'Lead: I need to say this!', action: 'Emotional confrontation or revelation.' },
        { name: 'Resolution', mood: 'neutral', location: 'Quiet space', pct: 15, dialogue: 'Lead: I understand now.', action: 'Processing and acceptance.' },
        { name: 'Ending', mood: 'neutral', location: 'Home', pct: 10, dialogue: '', action: 'Quiet ending. Reflection.' }
      ]
    },
    fantasy: {
      characters: [
        { name: 'Chosen One', role: 'protagonist', description: 'A young person with a hidden magical destiny.', traits: 'determined, naive, powerful' },
        { name: 'Dark Lord', role: 'antagonist', description: 'An ancient evil seeking to conquer the realm.', traits: 'terrifying, intelligent, ruthless' },
        { name: 'Companion', role: 'supporting', description: 'A magical creature bonded to the hero.', traits: 'loyal, playful, wise' }
      ],
      movieScenes: [
        { name: 'Opening – Prophecy', mood: 'mysterious', location: 'Ancient tower, stormy night', pct: 6, dialogue: 'Elder: The prophecy speaks of one who will rise…', action: 'Dramatic opening narration over mystical imagery.' },
        { name: 'Act 1 – Ordinary Life', mood: 'happy', location: 'Small village', pct: 12, dialogue: 'Chosen One: I wonder what lies beyond the forest.', action: 'Peaceful village life. Hints of magic.' },
        { name: 'Act 1 – The Awakening', mood: 'mysterious', location: 'Enchanted forest', pct: 14, dialogue: 'Companion: You have been chosen. There\'s no turning back.', action: 'Hero discovers their power. Meeting the companion.' },
        { name: 'Act 2 – Quest Begins', mood: 'action', location: 'Mountain kingdom', pct: 14, dialogue: 'Chosen One: We must reach the Crystal Citadel.', action: 'Traveling through magical lands. Encountering obstacles.' },
        { name: 'Act 2 – Dark Forces', mood: 'dark', location: 'Corrupted forest', pct: 14, dialogue: 'Dark Lord: Your journey ends here, child.', action: 'Ambush by dark creatures. First encounter with the villain.' },
        { name: 'Act 3 – The Trial', mood: 'tense', location: 'Crystal Citadel', pct: 10, dialogue: 'Spirit: To wield this power, you must prove your heart.', action: 'Magical trial testing the hero\'s resolve.' },
        { name: 'Climax – Final Battle', mood: 'action', location: 'Dark Lord\'s fortress', pct: 18, dialogue: 'Chosen One: I won\'t let you destroy this world!', action: 'Epic magical battle. Spells clash. World trembles.' },
        { name: 'Resolution', mood: 'happy', location: 'Restored kingdom', pct: 7, dialogue: 'Companion: You did it. Peace has returned.', action: 'Celebration. The land heals.' },
        { name: 'Ending – Legacy', mood: 'mysterious', location: 'Ancient tower', pct: 5, dialogue: 'Elder: But the darkness never truly dies…', action: 'Hint of future threats. Credits.' }
      ],
      episodeScenes: [
        { name: 'Cold Open', mood: 'mysterious', location: 'Unknown realm', pct: 5, dialogue: '', action: 'Mysterious magical event as teaser.' },
        { name: 'Opening – Village Life', mood: 'happy', location: 'Village', pct: 10, dialogue: 'Chosen One: Another peaceful day.', action: 'Daily life with hints of magical world.' },
        { name: 'Act 1 – Quest', mood: 'action', location: 'Magical terrain', pct: 18, dialogue: 'Companion: This way! I sense something!', action: 'Embarking on the episode\'s quest.' },
        { name: 'Act 2 – Challenge', mood: 'tense', location: 'Enchanted location', pct: 22, dialogue: 'Chosen One: How do we get past this?', action: 'Magical puzzle or enemy encounter.' },
        { name: 'Climax – Power Unleashed', mood: 'action', location: 'Battle arena', pct: 20, dialogue: 'Chosen One: I can feel the magic surging!', action: 'Hero uses new power. Dramatic transformation.' },
        { name: 'Resolution', mood: 'happy', location: 'Camp under the stars', pct: 15, dialogue: 'Companion: You\'re getting stronger.', action: 'Rest and reflection. Bond deepens.' },
        { name: 'Ending – Omen', mood: 'dark', location: 'Dark Lord\'s lair', pct: 10, dialogue: 'Dark Lord: Interesting…', action: 'Villain reacts to hero\'s growth. Ominous tease.' }
      ]
    },
    horror: {
      characters: [
        { name: 'Survivor', role: 'protagonist', description: 'An ordinary person thrust into a nightmare.', traits: 'resourceful, fearful, determined' },
        { name: 'Entity', role: 'antagonist', description: 'A malevolent supernatural force.', traits: 'terrifying, relentless, unknowable' },
        { name: 'Friend', role: 'supporting', description: 'A companion who may not make it.', traits: 'loyal, nervous, brave' }
      ],
      movieScenes: [
        { name: 'Opening – Normalcy', mood: 'neutral', location: 'Suburban neighborhood', pct: 6, dialogue: 'Survivor: It started like any other day.', action: 'Peaceful establishing shot. Something feels slightly off.' },
        { name: 'Act 1 – First Sign', mood: 'mysterious', location: 'Old house', pct: 14, dialogue: 'Friend: Did you hear that?', action: 'Strange occurrences begin. Creaking, shadows, whispers.' },
        { name: 'Act 1 – Investigation', mood: 'tense', location: 'Basement / attic', pct: 12, dialogue: 'Survivor: There has to be an explanation.', action: 'Investigating the source. Finding disturbing clues.' },
        { name: 'Act 2 – It Escalates', mood: 'dark', location: 'House at night', pct: 16, dialogue: 'Friend: We need to leave. NOW.', action: 'Full manifestation. Terror ramps up dramatically.' },
        { name: 'Act 2 – Trapped', mood: 'tense', location: 'Sealed house', pct: 14, dialogue: 'Survivor: The doors won\'t open!', action: 'Attempts to escape fail. The entity is in control.' },
        { name: 'Act 3 – Discovery', mood: 'dark', location: 'Hidden room', pct: 10, dialogue: 'Survivor: So that\'s what happened here…', action: 'Uncovering the entity\'s origin story.' },
        { name: 'Climax – Confrontation', mood: 'dark', location: 'Heart of the house', pct: 16, dialogue: 'Survivor: I\'m not afraid of you anymore!', action: 'Face-to-face with the entity. Desperate struggle.' },
        { name: 'Resolution', mood: 'tense', location: 'Outside at dawn', pct: 7, dialogue: 'Survivor: Is it really over?', action: 'Escape. Dawn breaks. But something lingers.' },
        { name: 'Ending – It\'s Not Over', mood: 'dark', location: 'New location', pct: 5, dialogue: '', action: 'Final scare. The entity has followed them.' }
      ],
      episodeScenes: [
        { name: 'Cold Open', mood: 'dark', location: 'Unknown', pct: 5, dialogue: '', action: 'Terrifying cold open. A victim encounters the entity.' },
        { name: 'Opening', mood: 'neutral', location: 'Safe space', pct: 10, dialogue: 'Survivor: Let\'s figure out what happened.', action: 'Characters regroup after previous events.' },
        { name: 'Act 1 – New Clue', mood: 'mysterious', location: 'Investigation site', pct: 18, dialogue: 'Friend: Look at this…', action: 'Discovering new information about the threat.' },
        { name: 'Act 2 – Terror Builds', mood: 'dark', location: 'Creepy location', pct: 22, dialogue: 'Survivor: Something is very wrong here.', action: 'Escalating horror. Jump scares. Atmosphere thickens.' },
        { name: 'Climax – Attack', mood: 'dark', location: 'Cornered', pct: 20, dialogue: 'Friend: Behind you!', action: 'Entity attacks. Desperate survival.' },
        { name: 'Resolution', mood: 'tense', location: 'Temporary safety', pct: 15, dialogue: 'Survivor: We barely made it.', action: 'Catching breath. Planning next move.' },
        { name: 'Ending – Dread', mood: 'dark', location: 'Mirror / window', pct: 10, dialogue: '', action: 'Unsettling final shot. The entity watches.' }
      ]
    },
    mecha: {
      characters: [
        { name: 'Pilot', role: 'protagonist', description: 'A young recruit chosen to pilot a giant mech.', traits: 'brave, reckless, talented' },
        { name: 'Commander', role: 'supporting', description: 'A battle-hardened leader of the mech division.', traits: 'strict, experienced, caring' },
        { name: 'Enemy Ace', role: 'antagonist', description: 'The enemy\'s top pilot with a mysterious past.', traits: 'skilled, cold, honorable' }
      ],
      movieScenes: [
        { name: 'Opening – The Threat', mood: 'tense', location: 'Military command center', pct: 6, dialogue: 'Commander: The enemy fleet has been spotted.', action: 'Radar screens light up. Alarms blare.' },
        { name: 'Act 1 – First Sortie', mood: 'action', location: 'Mech hangar', pct: 14, dialogue: 'Pilot: This is it. My first real mission!', action: 'Mech launch sequence. Thrusters ignite.' },
        { name: 'Act 1 – Battle', mood: 'action', location: 'City outskirts', pct: 13, dialogue: 'Pilot: There\'s so many of them!', action: 'First large-scale mech battle. Explosions.' },
        { name: 'Act 2 – Aftermath', mood: 'sad', location: 'Medical bay', pct: 10, dialogue: 'Commander: We lost good people today.', action: 'Dealing with losses. Questioning the mission.' },
        { name: 'Act 2 – Upgrade', mood: 'neutral', location: 'R&D lab', pct: 12, dialogue: 'Engineer: The new system is ready.', action: 'Mech upgrade sequence. Testing new weapons.' },
        { name: 'Act 2 – Rival Encounter', mood: 'tense', location: 'Neutral zone', pct: 12, dialogue: 'Enemy Ace: You have potential, kid.', action: 'Unexpected meeting with the enemy ace.' },
        { name: 'Climax – Final Battle', mood: 'action', location: 'Enemy fortress, space', pct: 18, dialogue: 'Pilot: I\'ll protect everyone!\nEnemy Ace: Show me what you\'ve got!', action: 'Epic final mech duel. Maximum power.' },
        { name: 'Resolution', mood: 'happy', location: 'Base, victory celebration', pct: 10, dialogue: 'Commander: You did well, pilot.', action: 'Celebration. Honors. Quiet moment of gratitude.' },
        { name: 'Ending', mood: 'neutral', location: 'Hangar', pct: 5, dialogue: 'Pilot: Until next time.', action: 'Pilot looks at the mech one last time. Credits.' }
      ],
      episodeScenes: [
        { name: 'Cold Open', mood: 'action', location: 'Battlefield', pct: 5, dialogue: '', action: 'Quick action teaser from later in the episode.' },
        { name: 'Opening – Briefing', mood: 'tense', location: 'Command center', pct: 10, dialogue: 'Commander: Here\'s the mission.', action: 'Mission briefing with tactical displays.' },
        { name: 'Act 1 – Launch', mood: 'action', location: 'Mech hangar', pct: 15, dialogue: 'Pilot: Systems online. Launching!', action: 'Dramatic mech launch sequence.' },
        { name: 'Act 2 – Combat', mood: 'action', location: 'Battlefield', pct: 25, dialogue: 'Pilot: Contact! Engaging!', action: 'Extended battle sequence with multiple enemies.' },
        { name: 'Climax – Boss Fight', mood: 'action', location: 'Enemy stronghold', pct: 20, dialogue: 'Enemy Ace: Impressive… but not enough!', action: 'One-on-one mech duel.' },
        { name: 'Resolution', mood: 'neutral', location: 'Base', pct: 15, dialogue: 'Pilot: That was close.', action: 'Debriefing. Maintenance. Character moments.' },
        { name: 'Ending', mood: 'tense', location: 'Enemy fleet', pct: 10, dialogue: 'Enemy Commander: Deploy the new weapon.', action: 'Enemy prepares next attack. Cliffhanger.' }
      ]
    },
    'sci-fi': {
      characters: [
        { name: 'Captain', role: 'protagonist', description: 'Leader of a deep-space exploration vessel.', traits: 'decisive, curious, compassionate' },
        { name: 'AI', role: 'supporting', description: 'The ship\'s artificial intelligence.', traits: 'logical, evolving, loyal' },
        { name: 'Unknown', role: 'antagonist', description: 'A mysterious alien intelligence.', traits: 'alien, vast, unknowable' }
      ],
      movieScenes: [
        { name: 'Opening – Deep Space', mood: 'mysterious', location: 'Bridge of the starship', pct: 6, dialogue: 'Captain: Status report.\nAI: All systems nominal. We are alone.', action: 'Vast starfield. Ship drifts silently through space.' },
        { name: 'Act 1 – The Signal', mood: 'mysterious', location: 'Communications array', pct: 14, dialogue: 'AI: Captain, I\'m detecting an anomalous signal.', action: 'Strange signal discovered. Crew investigates.' },
        { name: 'Act 1 – First Contact', mood: 'tense', location: 'Unknown planet surface', pct: 12, dialogue: 'Captain: We\'re not alone out here.', action: 'Landing on alien world. Finding structures.' },
        { name: 'Act 2 – Discovery', mood: 'mysterious', location: 'Alien ruins', pct: 15, dialogue: 'AI: These structures predate human civilization by millions of years.', action: 'Exploring alien technology. Sense of wonder.' },
        { name: 'Act 2 – Danger', mood: 'tense', location: 'Ship interior', pct: 13, dialogue: 'Captain: Something got aboard the ship!', action: 'Alien entity infiltrates. Systems malfunction.' },
        { name: 'Act 3 – Understanding', mood: 'mysterious', location: 'Ship\'s core', pct: 10, dialogue: 'AI: It\'s trying to communicate, not attack.', action: 'Realizing the alien\'s true intent.' },
        { name: 'Climax – Communication', mood: 'tense', location: 'Bridge', pct: 18, dialogue: 'Captain: If we get this wrong, it could mean war.', action: 'Attempting first true communication. Stakes at maximum.' },
        { name: 'Resolution', mood: 'happy', location: 'Orbit above alien world', pct: 7, dialogue: 'Captain: Today we made history.', action: 'Successful first contact. A new era begins.' },
        { name: 'Ending – The Unknown', mood: 'mysterious', location: 'Deep space', pct: 5, dialogue: 'AI: Captain… there are more signals.', action: 'Ship heads deeper into space. Credits.' }
      ],
      episodeScenes: [
        { name: 'Cold Open', mood: 'mysterious', location: 'Space anomaly', pct: 5, dialogue: '', action: 'Teaser of a strange space phenomenon.' },
        { name: 'Opening – Ship Life', mood: 'neutral', location: 'Ship corridors', pct: 10, dialogue: 'Captain: Morning report, AI.', action: 'Daily ship operations. Establishing crew dynamics.' },
        { name: 'Act 1 – Mission', mood: 'tense', location: 'Bridge', pct: 18, dialogue: 'AI: New readings detected.', action: 'New discovery or mission objective.' },
        { name: 'Act 2 – Exploration', mood: 'mysterious', location: 'New environment', pct: 22, dialogue: 'Captain: Fascinating…', action: 'Investigating the unknown. Science and wonder.' },
        { name: 'Climax – Crisis', mood: 'tense', location: 'Ship / planet', pct: 20, dialogue: 'Captain: We need a solution, now!', action: 'Technical or alien crisis that must be solved.' },
        { name: 'Resolution', mood: 'neutral', location: 'Ship lounge', pct: 15, dialogue: 'AI: Mission parameters fulfilled.', action: 'Reflecting on what was learned.' },
        { name: 'Ending', mood: 'mysterious', location: 'Star map', pct: 10, dialogue: 'Captain: Set course for the next star.', action: 'Ship jumps to new destination.' }
      ]
    },
    'slice-of-life': {
      characters: [
        { name: 'Main Character', role: 'protagonist', description: 'An everyday student finding joy in small things.', traits: 'gentle, observant, cheerful' },
        { name: 'Close Friend', role: 'supporting', description: 'Always there to share the day.', traits: 'energetic, caring, spontaneous' },
        { name: 'Neighbor', role: 'supporting', description: 'The kind neighbor with surprising wisdom.', traits: 'warm, quirky, wise' }
      ],
      movieScenes: [
        { name: 'Opening – Sunrise', mood: 'happy', location: 'Bedroom, morning light', pct: 6, dialogue: 'Main Character: A new day.', action: 'Gentle morning. Sunlight through curtains.' },
        { name: 'Act 1 – The Routine', mood: 'happy', location: 'Neighborhood streets', pct: 14, dialogue: 'Close Friend: Morning! Walk together?', action: 'Walking to school. Chatting about nothing important.' },
        { name: 'Act 1 – Small Discovery', mood: 'happy', location: 'Park / riverside', pct: 12, dialogue: 'Main Character: Look, the flowers bloomed!', action: 'Noticing small beautiful things in daily life.' },
        { name: 'Act 2 – Something New', mood: 'neutral', location: 'School / community center', pct: 16, dialogue: 'Neighbor: Why don\'t you try something different today?', action: 'Trying a new activity or hobby. Gentle exploration.' },
        { name: 'Act 2 – Challenge', mood: 'sad', location: 'Quiet room', pct: 12, dialogue: 'Main Character: I\'m not sure I\'m good at this.', action: 'Small personal challenge. Self-doubt.' },
        { name: 'Act 3 – Support', mood: 'happy', location: 'Friend\'s home', pct: 12, dialogue: 'Close Friend: You don\'t have to be good at it. You just have to enjoy it.', action: 'Friends encourage each other. Heartwarming scene.' },
        { name: 'Climax – The Moment', mood: 'happy', location: 'Festival / school event', pct: 16, dialogue: 'Main Character: I\'m so glad I tried.', action: 'A small but meaningful achievement. Tears of happiness.' },
        { name: 'Resolution', mood: 'happy', location: 'Walking home at sunset', pct: 7, dialogue: 'Close Friend: Same time tomorrow?', action: 'Golden hour. Walking home together.' },
        { name: 'Ending – Stargazing', mood: 'neutral', location: 'Rooftop at night', pct: 5, dialogue: 'Main Character: Today was a good day.', action: 'Looking at stars. Peaceful ending. Credits.' }
      ],
      episodeScenes: [
        { name: 'Opening – Morning', mood: 'happy', location: 'Home', pct: 8, dialogue: 'Main Character: Good morning!', action: 'Cheerful morning routine.' },
        { name: 'Act 1 – Daily Life', mood: 'happy', location: 'School / neighborhood', pct: 18, dialogue: 'Close Friend: Guess what happened!', action: 'Everyday events. Conversations.' },
        { name: 'Act 2 – Something Happens', mood: 'neutral', location: 'Various', pct: 24, dialogue: 'Main Character: Hmm, interesting…', action: 'A small event that changes the day\'s course.' },
        { name: 'Act 2 – Reflection', mood: 'neutral', location: 'Quiet spot', pct: 15, dialogue: 'Neighbor: Life is in the little things.', action: 'Thoughtful moment. Wisdom shared.' },
        { name: 'Climax – Small Joy', mood: 'happy', location: 'Special place', pct: 15, dialogue: 'Main Character: This makes me happy.', action: 'A small, genuinely touching moment.' },
        { name: 'Resolution', mood: 'happy', location: 'Home', pct: 12, dialogue: 'Main Character: See you tomorrow!', action: 'Wrapping up the day. Warm feelings.' },
        { name: 'Ending', mood: 'neutral', location: 'Night sky', pct: 8, dialogue: '', action: 'Peaceful ending shot.' }
      ]
    },
    sports: {
      characters: [
        { name: 'Athlete', role: 'protagonist', description: 'A passionate competitor striving to be the best.', traits: 'driven, passionate, competitive' },
        { name: 'Coach', role: 'supporting', description: 'A tough but caring mentor figure.', traits: 'demanding, wise, experienced' },
        { name: 'Rival Athlete', role: 'antagonist', description: 'The reigning champion and main rival.', traits: 'talented, confident, respectable' }
      ],
      movieScenes: [
        { name: 'Opening – The Dream', mood: 'neutral', location: 'Empty stadium', pct: 6, dialogue: 'Athlete: One day, I\'ll stand on that stage.', action: 'Athlete stares at the championship stage. Determination.' },
        { name: 'Act 1 – Humble Beginnings', mood: 'happy', location: 'Local training facility', pct: 14, dialogue: 'Coach: You\'ve got raw talent, but talent isn\'t enough.', action: 'Initial training. Establishing skill level and team.' },
        { name: 'Act 1 – First Competition', mood: 'tense', location: 'Regional tournament', pct: 12, dialogue: 'Athlete: I can do this!', action: 'First real match. Exciting but imperfect performance.' },
        { name: 'Act 2 – Training Montage', mood: 'action', location: 'Training grounds', pct: 14, dialogue: 'Coach: Again! Faster! Stronger!', action: 'Intense training montage. Pushing limits.' },
        { name: 'Act 2 – Setback', mood: 'sad', location: 'Hospital / sideline', pct: 12, dialogue: 'Athlete: My body gave out…', action: 'Injury or major loss. Questioning everything.' },
        { name: 'Act 3 – Comeback', mood: 'tense', location: 'Training facility', pct: 10, dialogue: 'Coach: The question isn\'t whether you can. It\'s whether you will.', action: 'Rehabilitation and renewed determination.' },
        { name: 'Climax – Championship', mood: 'action', location: 'National stadium', pct: 18, dialogue: 'Rival Athlete: Show me what you\'ve got!\nAthlete: This is everything I\'ve worked for!', action: 'Epic championship match. Back-and-forth tension.' },
        { name: 'Resolution – Victory', mood: 'happy', location: 'Winner\'s podium', pct: 9, dialogue: 'Coach: You earned this.', action: 'Celebration. Tears. Team embrace.' },
        { name: 'Ending – Next Challenge', mood: 'neutral', location: 'Training facility', pct: 5, dialogue: 'Athlete: This is just the beginning.', action: 'Already training for the next goal. Credits.' }
      ],
      episodeScenes: [
        { name: 'Cold Open', mood: 'action', location: 'Match highlight', pct: 5, dialogue: '', action: 'Exciting flash-forward to the episode\'s big moment.' },
        { name: 'Opening – Practice', mood: 'neutral', location: 'Training ground', pct: 10, dialogue: 'Coach: Let\'s work on your weakness.', action: 'Regular practice session.' },
        { name: 'Act 1 – Preparation', mood: 'tense', location: 'Locker room', pct: 15, dialogue: 'Athlete: Today\'s the day.', action: 'Pre-match preparation and strategy.' },
        { name: 'Act 2 – The Match', mood: 'action', location: 'Arena / field', pct: 30, dialogue: 'Athlete: I won\'t lose!', action: 'Extended match sequence with ups and downs.' },
        { name: 'Climax – Decisive Moment', mood: 'action', location: 'Arena / field', pct: 18, dialogue: 'Athlete: NOW!', action: 'The crucial play or moment that decides the outcome.' },
        { name: 'Resolution', mood: 'happy', location: 'After the match', pct: 12, dialogue: 'Coach: Good game.', action: 'Post-match cooldown. Team bonding.' },
        { name: 'Ending – Next Opponent', mood: 'tense', location: 'Scoreboard / bracket', pct: 10, dialogue: 'Rival Athlete: See you in the finals.', action: 'Reveal of the next challenge.' }
      ]
    },
    supernatural: {
      characters: [
        { name: 'Medium', role: 'protagonist', description: 'Someone who can see between worlds.', traits: 'perceptive, brave, empathetic' },
        { name: 'Spirit', role: 'supporting', description: 'A benevolent ghost bound to the medium.', traits: 'mysterious, protective, sad' },
        { name: 'Dark Force', role: 'antagonist', description: 'A malicious supernatural entity.', traits: 'manipulative, powerful, ancient' }
      ],
      movieScenes: [
        { name: 'Opening – The Gift', mood: 'mysterious', location: 'Medium\'s childhood room', pct: 6, dialogue: 'Medium: I\'ve always seen things others can\'t.', action: 'Flashback to childhood. Seeing spirits for the first time.' },
        { name: 'Act 1 – Living With It', mood: 'neutral', location: 'City streets', pct: 13, dialogue: 'Medium: Just ignore them. They\'ll go away.', action: 'Daily life while seeing supernatural beings everywhere.' },
        { name: 'Act 1 – The Spirit Appears', mood: 'mysterious', location: 'Abandoned shrine', pct: 13, dialogue: 'Spirit: Please… help me.', action: 'Meeting the spirit. A request that changes everything.' },
        { name: 'Act 2 – Investigation', mood: 'tense', location: 'Old town, archives', pct: 14, dialogue: 'Medium: Who were you? What happened to you?', action: 'Researching the spirit\'s past. Uncovering dark history.' },
        { name: 'Act 2 – Dark Interference', mood: 'dark', location: 'Medium\'s apartment at night', pct: 14, dialogue: 'Dark Force: Stop digging. Or suffer.', action: 'Dark force attacks. Supernatural horror elements.' },
        { name: 'Act 3 – The Truth', mood: 'sad', location: 'Spirit\'s former home', pct: 10, dialogue: 'Spirit: Now you know everything.', action: 'Full revelation of the spirit\'s tragic past.' },
        { name: 'Climax – Banishment', mood: 'action', location: 'Sacred grounds', pct: 18, dialogue: 'Medium: I won\'t let you hurt anyone else!', action: 'Ritual to banish the dark force. Supernatural showdown.' },
        { name: 'Resolution', mood: 'happy', location: 'Shrine at peace', pct: 7, dialogue: 'Spirit: Thank you. I can finally rest.', action: 'Spirit finds peace. Emotional farewell.' },
        { name: 'Ending', mood: 'mysterious', location: 'City street', pct: 5, dialogue: 'New Spirit: Excuse me… can you see me?', action: 'A new spirit approaches. The cycle continues.' }
      ],
      episodeScenes: [
        { name: 'Cold Open', mood: 'dark', location: 'Haunted location', pct: 5, dialogue: '', action: 'Creepy supernatural event teaser.' },
        { name: 'Opening', mood: 'neutral', location: 'Medium\'s home', pct: 10, dialogue: 'Medium: Another quiet morning… hopefully.', action: 'Establishing the medium\'s current situation.' },
        { name: 'Act 1 – New Case', mood: 'mysterious', location: 'Client\'s location', pct: 18, dialogue: 'Client: Strange things keep happening here.', action: 'A new supernatural case to investigate.' },
        { name: 'Act 2 – Investigation', mood: 'tense', location: 'Haunted site', pct: 22, dialogue: 'Spirit: Be careful. This one is dangerous.', action: 'Investigating the supernatural disturbance.' },
        { name: 'Climax – Confrontation', mood: 'dark', location: 'Between worlds', pct: 20, dialogue: 'Medium: Show yourself!', action: 'Face-to-face with the supernatural threat.' },
        { name: 'Resolution', mood: 'neutral', location: 'Peaceful location', pct: 15, dialogue: 'Medium: Another spirit at peace.', action: 'Resolving the case. Moment of reflection.' },
        { name: 'Ending', mood: 'mysterious', location: 'Unknown', pct: 10, dialogue: '', action: 'Hint of a larger supernatural force at work.' }
      ]
    },
    thriller: {
      characters: [
        { name: 'Detective', role: 'protagonist', description: 'A sharp investigator with a troubled past.', traits: 'analytical, obsessive, just' },
        { name: 'Suspect', role: 'antagonist', description: 'A charming figure hiding dark secrets.', traits: 'charismatic, deceptive, intelligent' },
        { name: 'Partner', role: 'supporting', description: 'The detective\'s trusted colleague.', traits: 'reliable, cautious, loyal' }
      ],
      movieScenes: [
        { name: 'Opening – The Crime', mood: 'dark', location: 'Crime scene at night', pct: 6, dialogue: 'Detective: What happened here?', action: 'Arriving at a disturbing crime scene. Forensics at work.' },
        { name: 'Act 1 – Investigation Begins', mood: 'tense', location: 'Police station', pct: 14, dialogue: 'Partner: The evidence doesn\'t add up.', action: 'Examining clues. Building a case board.' },
        { name: 'Act 1 – First Lead', mood: 'tense', location: 'Suspect\'s office', pct: 12, dialogue: 'Suspect: I have nothing to hide, detective.', action: 'First interview. Suspect is unnervingly calm.' },
        { name: 'Act 2 – Going Deeper', mood: 'tense', location: 'City streets, archives', pct: 14, dialogue: 'Detective: There\'s a pattern here.', action: 'Connecting dots. Discovering similar past cases.' },
        { name: 'Act 2 – The Twist', mood: 'tense', location: 'Detective\'s home', pct: 14, dialogue: 'Detective: Wait… it\'s been right in front of me.', action: 'Major revelation that changes everything.' },
        { name: 'Act 3 – The Trap', mood: 'tense', location: 'Warehouse / meeting point', pct: 10, dialogue: 'Partner: Are you sure about this?', action: 'Setting up a sting operation.' },
        { name: 'Climax – Showdown', mood: 'dark', location: 'Isolated location', pct: 18, dialogue: 'Suspect: You figured it out. But it\'s too late.\nDetective: It\'s never too late.', action: 'Tense confrontation. Mind games. Action climax.' },
        { name: 'Resolution', mood: 'neutral', location: 'Police station', pct: 7, dialogue: 'Partner: It\'s over.\nDetective: Is it?', action: 'Case closed. But lingering questions remain.' },
        { name: 'Ending', mood: 'dark', location: 'Detective\'s office', pct: 5, dialogue: 'Detective: Who sent this?', action: 'A mysterious message arrives. Sequel bait.' }
      ],
      episodeScenes: [
        { name: 'Cold Open', mood: 'dark', location: 'Crime scene', pct: 5, dialogue: '', action: 'A new crime is discovered.' },
        { name: 'Opening', mood: 'tense', location: 'Police station', pct: 10, dialogue: 'Detective: Briefing, now.', action: 'Getting assigned to the case.' },
        { name: 'Act 1 – Clues', mood: 'tense', location: 'Investigation sites', pct: 18, dialogue: 'Partner: Found something.', action: 'Collecting evidence. Interviewing witnesses.' },
        { name: 'Act 2 – Pursuit', mood: 'tense', location: 'City', pct: 22, dialogue: 'Detective: We\'re getting closer.', action: 'Following leads. Cat-and-mouse with the suspect.' },
        { name: 'Climax – Confrontation', mood: 'dark', location: 'Suspect\'s territory', pct: 20, dialogue: 'Detective: It\'s over.', action: 'Tense takedown or revelation.' },
        { name: 'Resolution', mood: 'neutral', location: 'Station', pct: 15, dialogue: 'Partner: Good work.', action: 'Case wrap-up. Filing reports.' },
        { name: 'Ending – New Mystery', mood: 'dark', location: 'Unknown', pct: 10, dialogue: 'Detective: Something doesn\'t fit…', action: 'A clue points to a larger conspiracy.' }
      ]
    }
  };

  /* Return the template for a genre, falling back to the action template */
  function getGenreTemplate(genre) {
    return GENRE_TEMPLATES[genre] || GENRE_TEMPLATES.action;
  }

  /* Build scene objects from a template list, scaling percentages to targetSec */
  function buildScenes(templateScenes, targetSec, episodeId, titlePrefix) {
    var scenes = [];
    for (var i = 0; i < templateScenes.length; i++) {
      var t = templateScenes[i];
      var dur = Math.round(targetSec * t.pct / 100);
      scenes.push({
        id: uid(),
        name: (titlePrefix ? titlePrefix + ' – ' : '') + t.name,
        episodeId: episodeId,
        location: t.location,
        mood: t.mood,
        durationSec: dur,
        characterIds: [],
        dialogue: t.dialogue,
        action: t.action
      });
    }
    return scenes;
  }

  /* Prefix each scene's location with the user's setting if provided */
  function applySettingToScenes(scenes, setting) {
    if (!setting) return;
    for (var i = 0; i < scenes.length; i++) {
      scenes[i].location = setting + ' – ' + scenes[i].location;
    }
  }

  /* -----------------------------------------------------------
     Start Creating – open the wizard modal for user customization
     ----------------------------------------------------------- */
  function startCreating() {
    // Read current form values and save settings
    var title = document.getElementById('project-title').value.trim() || 'My Anime Project';
    var type  = document.getElementById('project-type').value;
    var genre = document.getElementById('project-genre').value;
    var desc  = document.getElementById('project-description').value.trim();

    project.title       = title;
    project.type        = type;
    project.genre       = genre;
    project.description = desc;
    project.fps         = document.getElementById('project-fps').value;
    project.resolution  = document.getElementById('project-resolution').value;

    // Warn if content already exists
    if (project.scenes.length > 0 || project.episodes.length > 0 || project.characters.length > 0) {
      if (!confirm('This will replace all existing episodes, scenes, characters, and storyboard panels. Continue?')) return;
    }

    // Show / hide episode count field based on type
    var epGroup = document.getElementById('wizard-episode-group');
    if (type === 'show') {
      epGroup.style.display = '';
      document.getElementById('wizard-episode-count').value = 1;
    } else {
      epGroup.style.display = 'none';
    }

    // Pre-fill setting from description if user provided one
    document.getElementById('wizard-setting').value = '';
    document.getElementById('wizard-notes').value = desc;

    // Populate character rows from the genre template defaults
    var template = getGenreTemplate(genre);
    var container = document.getElementById('wizard-characters');
    container.innerHTML = '';
    for (var i = 0; i < template.characters.length; i++) {
      addWizardCharRow(template.characters[i]);
    }

    document.getElementById('wizard-modal').classList.remove('hidden');
  }

  function addWizardCharRow(defaults) {
    var container = document.getElementById('wizard-characters');
    var row = document.createElement('div');
    row.className = 'wizard-char-row';
    var d = defaults || { name: '', role: 'supporting', description: '', traits: '' };
    row.innerHTML =
      '<div class="form-group">' +
        '<label>Name</label>' +
        '<input type="text" class="wiz-char-name" value="' + escapeHtml(d.name) + '" placeholder="Character name" maxlength="100">' +
      '</div>' +
      '<div class="form-group">' +
        '<label>Role</label>' +
        '<select class="wiz-char-role">' +
          '<option value="protagonist"' + (d.role === 'protagonist' ? ' selected' : '') + '>Protagonist</option>' +
          '<option value="antagonist"' + (d.role === 'antagonist' ? ' selected' : '') + '>Antagonist</option>' +
          '<option value="supporting"' + (d.role === 'supporting' ? ' selected' : '') + '>Supporting</option>' +
          '<option value="minor"' + (d.role === 'minor' ? ' selected' : '') + '>Minor</option>' +
        '</select>' +
      '</div>' +
      '<div class="form-group">' +
        '<label>Description</label>' +
        '<input type="text" class="wiz-char-desc" value="' + escapeHtml(d.description) + '" placeholder="Brief description" maxlength="300">' +
      '</div>' +
      '<div class="form-group">' +
        '<label>Traits</label>' +
        '<input type="text" class="wiz-char-traits" value="' + escapeHtml(d.traits) + '" placeholder="e.g. brave, kind" maxlength="200">' +
      '</div>' +
      '<button type="button" class="btn-danger wiz-remove-char">✕</button>';
    container.appendChild(row);
    row.querySelector('.wiz-remove-char').addEventListener('click', function () {
      row.remove();
    });
  }

  function closeWizardModal() {
    document.getElementById('wizard-modal').classList.add('hidden');
  }

  /* -----------------------------------------------------------
     Generate project from the wizard form
     ----------------------------------------------------------- */
  function generateFromWizard(e) {
    e.preventDefault();

    var type  = project.type;
    var genre = project.genre;
    var template = getGenreTemplate(genre);

    var setting = document.getElementById('wizard-setting').value.trim();
    var notes   = document.getElementById('wizard-notes').value.trim();
    var epCount = 1;
    if (type === 'show') {
      epCount = parseInt(document.getElementById('wizard-episode-count').value, 10) || 1;
      epCount = clamp(epCount, 1, MAX_EPISODES);
    }

    // Read character rows from wizard
    var charRows = document.querySelectorAll('#wizard-characters .wizard-char-row');
    project.characters = [];
    var skippedCount = 0;
    for (var c = 0; c < charRows.length; c++) {
      var nameVal = charRows[c].querySelector('.wiz-char-name').value.trim();
      if (!nameVal) { skippedCount++; continue; }
      project.characters.push({
        id: uid(),
        name: nameVal,
        role: charRows[c].querySelector('.wiz-char-role').value,
        color: COLORS[c % COLORS.length],
        description: charRows[c].querySelector('.wiz-char-desc').value.trim(),
        traits: charRows[c].querySelector('.wiz-char-traits').value.trim()
      });
    }
    if (skippedCount > 0) {
      showToast(skippedCount + ' character(s) skipped (empty name).');
    }

    // If no characters were added, use template defaults
    if (project.characters.length === 0) {
      for (var tc = 0; tc < template.characters.length; tc++) {
        var tch = template.characters[tc];
        project.characters.push({
          id: uid(),
          name: tch.name,
          role: tch.role,
          color: COLORS[tc % COLORS.length],
          description: tch.description,
          traits: tch.traits
        });
      }
    }

    // Store notes in project description if provided
    if (notes) {
      project.description = notes;
    }

    // --- Generate episodes & scenes ---
    project.episodes = [];
    project.scenes   = [];
    project.panels   = [];

    if (type === 'movie') {
      // Single movie – 2 h 50 min
      var movieEp = { id: uid(), name: project.title || 'Movie', number: 1, synopsis: project.description || 'Full-length anime movie.' };
      project.episodes.push(movieEp);
      var movieScenes = buildScenes(template.movieScenes, MOVIE_DURATION_SEC, movieEp.id, '');
      applySettingToScenes(movieScenes, setting);
      project.scenes = movieScenes;
    } else {
      // Show – generate the requested number of episodes, each 1 h 50 min
      for (var ep = 0; ep < epCount; ep++) {
        var epNum = ep + 1;
        var epObj = {
          id: uid(),
          name: 'Episode ' + epNum + (epNum === 1 ? ' – Pilot' : ''),
          number: epNum,
          synopsis: epNum === 1 ? (project.description || 'The story begins.') : 'Episode ' + epNum + '.'
        };
        project.episodes.push(epObj);
        var epScenes = buildScenes(template.episodeScenes, EPISODE_DURATION_SEC, epObj.id, 'Ep' + epNum);
        applySettingToScenes(epScenes, setting);
        project.scenes = project.scenes.concat(epScenes);
      }
    }

    // Assign all characters to every scene
    var allCharIds = project.characters.map(function (ch) { return ch.id; });
    for (var s = 0; s < project.scenes.length; s++) {
      project.scenes[s].characterIds = allCharIds.slice();
    }

    // Replace character placeholder names in dialogue with actual names
    replaceDialoguePlaceholders(template);

    autoSave();
    closeWizardModal();
    refreshAll();
    showToast('🚀 Project created with ' + project.episodes.length + ' episode(s) and ' + project.characters.length + ' character(s)! Edit anything freely.');
  }

  /* Replace template character names in dialogue/action with the user's custom names */
  function replaceDialoguePlaceholders(template) {
    // Build a mapping: template name -> user name
    var nameMap = {};
    for (var i = 0; i < template.characters.length; i++) {
      var tName = template.characters[i].name;
      // Find the corresponding user character (by index if within range)
      if (i < project.characters.length) {
        nameMap[tName] = project.characters[i].name;
      }
    }
    // Apply replacements to all scenes
    var templateNames = Object.keys(nameMap);
    for (var s = 0; s < project.scenes.length; s++) {
      var sc = project.scenes[s];
      for (var n = 0; n < templateNames.length; n++) {
        var oldName = templateNames[n];
        var newName = nameMap[oldName];
        if (oldName === newName) continue;
        var regex = new RegExp('\\b' + escapeRegExp(oldName) + '\\b', 'g');
        if (sc.dialogue) sc.dialogue = sc.dialogue.replace(regex, newName);
        if (sc.action) sc.action = sc.action.replace(regex, newName);
      }
    }
  }

  function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function initWizard() {
    document.getElementById('wizard-cancel-btn').addEventListener('click', closeWizardModal);
    document.getElementById('wizard-form').addEventListener('submit', generateFromWizard);
    document.getElementById('wizard-add-char-btn').addEventListener('click', function () {
      addWizardCharRow(null);
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

  /* --- MP4 / Video Export --- */
  function exportMP4() {
    var btn = document.getElementById('export-mp4-btn');
    var progressEl = document.getElementById('mp4-progress');
    var barEl = document.getElementById('mp4-progress-bar');
    var textEl = document.getElementById('mp4-progress-text');
    btn.disabled = true;
    progressEl.classList.remove('hidden');
    barEl.style.width = '0%';
    textEl.textContent = 'Preparing…';

    var WIDTH = 1280;
    var HEIGHT = 720;
    var FRAME_MS = 2000; // 2 seconds per slide
    var canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    var ctx = canvas.getContext('2d');

    // Build slides (each slide is a draw function)
    var slides = [];

    // --- Title slide ---
    slides.push(function () {
      drawBackground(ctx, WIDTH, HEIGHT, '#0d0d1a');
      ctx.fillStyle = '#e74c8b';
      ctx.font = 'bold 52px Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(project.title || 'My Anime Project', WIDTH / 2, HEIGHT / 2 - 40);
      ctx.fillStyle = '#9999bb';
      ctx.font = '26px Segoe UI, sans-serif';
      ctx.fillText(capitalize(project.type) + ' • ' + capitalize(project.genre), WIDTH / 2, HEIGHT / 2 + 20);
      ctx.fillText(project.fps + ' FPS • ' + project.resolution, WIDTH / 2, HEIGHT / 2 + 60);
      if (project.description) {
        ctx.font = '18px Segoe UI, sans-serif';
        ctx.fillStyle = '#eaeaff';
        wrapText(ctx, project.description, WIDTH / 2, HEIGHT / 2 + 120, WIDTH - 200, 24);
      }
    });

    // --- Characters slide ---
    if (project.characters.length > 0) {
      slides.push(function () {
        drawBackground(ctx, WIDTH, HEIGHT, '#0d0d1a');
        drawHeading(ctx, WIDTH, 'Characters');
        var y = 160;
        for (var i = 0; i < project.characters.length && y < HEIGHT - 40; i++) {
          var ch = project.characters[i];
          ctx.fillStyle = ch.color || '#e74c8b';
          ctx.font = 'bold 24px Segoe UI, sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(ch.name + ' (' + ch.role + ')', 80, y);
          if (ch.description) {
            ctx.fillStyle = '#9999bb';
            ctx.font = '18px Segoe UI, sans-serif';
            y += 30;
            wrapText(ctx, ch.description, 80, y, WIDTH - 160, 22, 'left');
            y += Math.ceil(ch.description.length / 60) * 22;
          }
          y += 40;
        }
      });
    }

    // --- Episode + Scene slides ---
    var sortedEpisodes = project.episodes.slice().sort(function (a, b) { return a.number - b.number; });
    for (var e = 0; e < sortedEpisodes.length; e++) {
      (function (ep) {
        slides.push(function () {
          drawBackground(ctx, WIDTH, HEIGHT, '#161625');
          drawHeading(ctx, WIDTH, 'Episode ' + ep.number);
          ctx.fillStyle = '#eaeaff';
          ctx.font = 'bold 32px Segoe UI, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(ep.name, WIDTH / 2, 200);
          if (ep.synopsis) {
            ctx.fillStyle = '#9999bb';
            ctx.font = '20px Segoe UI, sans-serif';
            wrapText(ctx, ep.synopsis, WIDTH / 2, 260, WIDTH - 200, 26);
          }
        });

        var epScenes = project.scenes.filter(function (s) { return s.episodeId === ep.id; });
        for (var s = 0; s < epScenes.length; s++) {
          (function (sc) {
            slides.push(function () {
              drawSceneSlide(ctx, WIDTH, HEIGHT, sc);
            });
            // If scene has panels, add a slide for each
            var scenePanels = project.panels.filter(function (p) { return p.sceneId === sc.id; });
            for (var pi = 0; pi < scenePanels.length; pi++) {
              (function (panel) {
                slides.push(function () {
                  drawPanelSlide(ctx, WIDTH, HEIGHT, panel, sc.name);
                });
              })(scenePanels[pi]);
            }
          })(epScenes[s]);
        }
      })(sortedEpisodes[e]);
    }

    // --- Unassigned scenes ---
    var unassigned = project.scenes.filter(function (s) { return !s.episodeId; });
    for (var u = 0; u < unassigned.length; u++) {
      (function (sc) {
        slides.push(function () {
          drawSceneSlide(ctx, WIDTH, HEIGHT, sc);
        });
        var scenePanels = project.panels.filter(function (p) { return p.sceneId === sc.id; });
        for (var pi = 0; pi < scenePanels.length; pi++) {
          (function (panel) {
            slides.push(function () {
              drawPanelSlide(ctx, WIDTH, HEIGHT, panel, sc.name);
            });
          })(scenePanels[pi]);
        }
      })(unassigned[u]);
    }

    // --- End slide ---
    slides.push(function () {
      drawBackground(ctx, WIDTH, HEIGHT, '#0d0d1a');
      ctx.fillStyle = '#e74c8b';
      ctx.font = 'bold 48px Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('End', WIDTH / 2, HEIGHT / 2 - 10);
      ctx.fillStyle = '#9999bb';
      ctx.font = '22px Segoe UI, sans-serif';
      ctx.fillText('Made with My Anime Maker', WIDTH / 2, HEIGHT / 2 + 40);
    });

    if (slides.length === 0) {
      btn.disabled = false;
      progressEl.classList.add('hidden');
      showToast('Nothing to export – add some content first.');
      return;
    }

    // Determine supported MIME type
    var mimeType = 'video/webm;codecs=vp9';
    if (typeof MediaRecorder !== 'undefined') {
      if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
        mimeType = 'video/webm;codecs=vp9';
      } else if (MediaRecorder.isTypeSupported('video/webm')) {
        mimeType = 'video/webm';
      }
    }

    var stream = canvas.captureStream(30);
    var recorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType: mimeType });
    } catch (recErr) {
      btn.disabled = false;
      progressEl.classList.add('hidden');
      showToast('Video recording is not supported in this browser.');
      return;
    }
    var chunks = [];
    recorder.ondataavailable = function (ev) { if (ev.data.size > 0) chunks.push(ev.data); };
    recorder.onstop = function () {
      var fileExt = mimeType.indexOf('webm') !== -1 ? '.webm' : '.mp4';
      var blob = new Blob(chunks, { type: mimeType });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = (project.title || 'anime-project').replace(/\s+/g, '-') + fileExt;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      btn.disabled = false;
      progressEl.classList.add('hidden');
      showToast('Video downloaded!');
    };
    recorder.onerror = function () {
      btn.disabled = false;
      progressEl.classList.add('hidden');
      showToast('Error during video recording.');
    };

    recorder.start();

    var slideIndex = 0;
    function nextSlide() {
      if (slideIndex >= slides.length) {
        barEl.style.width = '100%';
        textEl.textContent = 'Finalizing…';
        recorder.stop();
        return;
      }
      var pct = Math.round(((slideIndex + 1) / slides.length) * 100);
      barEl.style.width = pct + '%';
      textEl.textContent = 'Rendering slide ' + (slideIndex + 1) + ' / ' + slides.length;
      slides[slideIndex]();
      slideIndex++;
      setTimeout(nextSlide, FRAME_MS);
    }
    nextSlide();
  }

  /* --- MP4 helper drawing functions --- */
  function capitalize(str) {
    return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
  }

  function drawBackground(ctx, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
  }

  function drawHeading(ctx, w, text) {
    ctx.fillStyle = '#e74c8b';
    ctx.font = 'bold 40px Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, w / 2, 80);
    ctx.strokeStyle = '#2a2a44';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(80, 100);
    ctx.lineTo(w - 80, 100);
    ctx.stroke();
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight, align) {
    ctx.textAlign = align || 'center';
    var words = text.split(' ');
    var line = '';
    for (var i = 0; i < words.length; i++) {
      var testLine = line + words[i] + ' ';
      if (ctx.measureText(testLine).width > maxWidth && i > 0) {
        ctx.fillText(line.trim(), x, y);
        line = words[i] + ' ';
        y += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line.trim(), x, y);
  }

  function drawSceneSlide(ctx, w, h, sc) {
    drawBackground(ctx, w, h, '#1e1e33');
    drawHeading(ctx, w, 'Scene: ' + (sc.name || 'Untitled'));
    var y = 140;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#9999bb';
    ctx.font = '20px Segoe UI, sans-serif';
    ctx.fillText('Duration: ' + formatTime(sc.durationSec || 0), 80, y); y += 32;
    if (sc.location) { ctx.fillText('Location: ' + sc.location, 80, y); y += 32; }
    ctx.fillText('Mood: ' + (sc.mood || 'neutral'), 80, y); y += 40;
    if (sc.dialogue) {
      ctx.fillStyle = '#eaeaff';
      ctx.font = 'italic 18px Segoe UI, sans-serif';
      wrapText(ctx, sc.dialogue, 80, y, w - 160, 24, 'left');
      y += Math.ceil(sc.dialogue.length / 70) * 24 + 20;
    }
    if (sc.action) {
      ctx.fillStyle = '#6c5ce7';
      ctx.font = '18px Segoe UI, sans-serif';
      wrapText(ctx, sc.action, 80, Math.min(y, h - 100), w - 160, 24, 'left');
    }
  }

  function drawPanelSlide(ctx, w, h, panel, sceneName) {
    drawBackground(ctx, w, h, '#0d0d1a');
    ctx.fillStyle = '#6c5ce7';
    ctx.font = 'bold 16px Segoe UI, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Scene: ' + (sceneName || ''), 20, 30);
    ctx.fillText('Camera: ' + (panel.camera || ''), 20, 52);

    if (panel.imageData) {
      var img = new Image();
      img.src = panel.imageData;
      // Draw synchronously since data URIs load instantly
      try {
        var imgW = Math.min(w - 80, 800);
        var imgH = Math.min(h - 180, 450);
        var imgX = (w - imgW) / 2;
        ctx.drawImage(img, imgX, 70, imgW, imgH);
      } catch (_) { /* ignore draw errors */ }
    }

    var bottomY = h - 80;
    if (panel.description) {
      ctx.fillStyle = '#eaeaff';
      ctx.font = '18px Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      wrapText(ctx, panel.description, w / 2, bottomY, w - 100, 22);
    }
    if (panel.sfx) {
      ctx.fillStyle = '#f0a500';
      ctx.font = '16px Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🔊 ' + panel.sfx, w / 2, h - 20);
    }
  }

  /* --- Reset Project --- */
  function resetProject() {
    if (!confirm('Are you sure you want to reset? All project data will be permanently lost.')) {
      return;
    }
    project = defaultProject();
    try { localStorage.removeItem(AUTOSAVE_KEY); } catch (_) { /* ignore */ }
    refreshAll();
    showToast('Project has been reset.');
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
    document.getElementById('export-mp4-btn').addEventListener('click', exportMP4);
    document.getElementById('import-btn').addEventListener('click', importJSON);
    document.getElementById('import-file').addEventListener('change', handleImport);
    document.getElementById('reset-project-btn').addEventListener('click', resetProject);
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
    initWizard();
    updateDuration();
    document.getElementById('start-creating-btn').addEventListener('click', startCreating);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
