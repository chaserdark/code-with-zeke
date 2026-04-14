/* ============================================================
   CODE WITH ZEKE — script.js
   Full game engine: Screen Router, Shooter, Bug Hunter,
   Code Guesser, Dashboard, Save System
   ============================================================ */

'use strict';

/* ============================================================
   1. SAVE SYSTEM (localStorage)
   ============================================================ */
const Save = {
  KEY: 'cwz_save',
  defaults() {
    return {
      highScores: { shooter: 0, bugHunter: 0, guesser: 0 },
      worlds:     { html: true, css: false, js: false },
      gamesPlayed: 0,
      totalScore:  0
    };
  },
  load() {
    try {
      return JSON.parse(localStorage.getItem(this.KEY)) || this.defaults();
    } catch { return this.defaults(); }
  },
  save(data) {
    localStorage.setItem(this.KEY, JSON.stringify(data));
  },
  get()  { return this.load(); },
  set(fn) {
    const d = this.load();
    fn(d);
    this.save(d);
  }
};

/* ============================================================
   2. SCREEN ROUTER
   ============================================================ */
const Router = {
  current: 'start',
  go(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById('screen-' + id);
    if (el) { el.classList.add('active'); this.current = id; }
  }
};

/* ============================================================
   3. GLOBAL STATE
   ============================================================ */
const State = {
  mode:  null,   // 'shooter' | 'bugHunter' | 'guesser'
  world: null,   // 'html' | 'css' | 'js'
  _lastMode: null,
  _lastWorld: null,
  score: 0,
  combo: 1,
  maxCombo: 1,
  lives: 3,
  timer: 0,
  timerInterval: null,
  correct: 0,
  total:   0,
  resultsOpts: null
};

function resetState() {
  State.score    = 0;
  State.combo    = 1;
  State.maxCombo = 1;
  State.lives    = 3;
  State.correct  = 0;
  State.total    = 0;
  State.resultsOpts = null;
  clearInterval(State.timerInterval);
}

function quitGame() {
  clearInterval(State.timerInterval);
  const accuracy = State.total > 0 ? Math.round((State.correct / State.total) * 100) : 0;
  const timeBonus = State.timer * 10;
  const finalScore = State.score + timeBonus;
  State.resultsOpts = {
    score: State.score,
    correct: State.correct,
    total: State.total,
    maxCombo: State.maxCombo,
    timeLeft: State.timer,
    mode: State.mode,
    world: State.world
  };
  loadLearning(State.mode, State.world);
}

/* ══════════════════════════════════════════════════════════════
   BACKGROUND SYSTEM (5-LAYER ANIMATED)
══════════════════════════════════════════════════════════════ */

/* Canvas references */
const bgCanvas        = document.getElementById('bg');
const gridCanvas      = document.getElementById('grid');
const starCanvas      = document.getElementById('stars');
const particleCanvas  = document.getElementById('particles');
const scanlineCanvas  = document.getElementById('scanlines');

const bgCtx       = bgCanvas.getContext('2d');
const gridCtx     = gridCanvas.getContext('2d');
const starCtx     = starCanvas.getContext('2d');
const particleCtx = particleCanvas.getContext('2d');
const scanCtx     = scanlineCanvas.getContext('2d');

/* Neon particle colors */
const NEON_COLORS = [
  [0,   255, 136],   /* neon green  #00ff88 */
  [0,   229, 255],   /* neon cyan   #00e5ff */
  [191,  95, 255],   /* neon purple #bf5fff */
  [255, 226,  52],   /* neon yellow #ffe234 */
];

/* State */
let bgStars     = [];
let bgParticles = [];
let bgW = window.innerWidth;
let bgH = window.innerHeight;

/* LAYER 1 — Radial Gradient Background */
function drawBackground() {
  bgCanvas.width  = bgW;
  bgCanvas.height = bgH;

  const grad = bgCtx.createRadialGradient(
    bgW / 2, bgH / 2, 0,
    bgW / 2, bgH / 2, Math.max(bgW, bgH) * 0.75
  );
  grad.addColorStop(0,   '#0e0e20');
  grad.addColorStop(0.5, '#09090f');
  grad.addColorStop(1,   '#05050c');

  bgCtx.fillStyle = grad;
  bgCtx.fillRect(0, 0, bgW, bgH);
}

/* LAYER 2 — Pixel Grid */
function drawGrid() {
  gridCanvas.width  = bgW;
  gridCanvas.height = bgH;
  gridCtx.clearRect(0, 0, bgW, bgH);

  const CELL = 40;
  gridCtx.strokeStyle = 'rgba(0, 255, 136, 0.04)';
  gridCtx.lineWidth   = 1;

  for (let x = 0; x <= bgW; x += CELL) {
    gridCtx.beginPath();
    gridCtx.moveTo(x, 0);
    gridCtx.lineTo(x, bgH);
    gridCtx.stroke();
  }

  for (let y = 0; y <= bgH; y += CELL) {
    gridCtx.beginPath();
    gridCtx.moveTo(0, y);
    gridCtx.lineTo(bgW, y);
    gridCtx.stroke();
  }
}

/* LAYER 3 — Twinkling Stars */
function initStars() {
  starCanvas.width  = bgW;
  starCanvas.height = bgH;

  const tints = ['180,200,255', '200,180,255', '180,230,255'];
  bgStars = Array.from({ length: 130 }, () => ({
    x:     Math.random() * bgW,
    y:     Math.random() * bgH,
    r:     Math.random() * 1.4 + 0.2,
    speed: Math.random() * 0.25 + 0.04,
    phase: Math.random() * Math.PI * 2,
    color: tints[Math.floor(Math.random() * tints.length)]
  }));
}

function drawStars(timestamp) {
  starCtx.clearRect(0, 0, bgW, bgH);

  bgStars.forEach(s => {
    s.y += s.speed;
    if (s.y > bgH) {
      s.y = 0;
      s.x = Math.random() * bgW;
    }

    const alpha = 0.35 + 0.65 * Math.abs(Math.sin(timestamp * 0.0008 + s.phase));

    starCtx.beginPath();
    starCtx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    starCtx.fillStyle = `rgba(${s.color}, ${alpha})`;
    starCtx.fill();
  });
}

/* LAYER 4 — Floating Neon Particles */
function makeParticle(startAtBottom = false) {
  const col = NEON_COLORS[Math.floor(Math.random() * NEON_COLORS.length)];
  return {
    x:         Math.random() * bgW,
    y:         startAtBottom ? bgH + 10 : Math.random() * bgH,
    r:         Math.random() * 2.2 + 0.6,
    vx:        (Math.random() - 0.5) * 0.4,
    vy:        -(Math.random() * 0.5 + 0.1),
    col,
    alpha:     Math.random() * 0.5 + 0.3,
    life:      Math.random() * Math.PI * 2,
    lifeSpeed: 0.008 + Math.random() * 0.012,
  };
}

function initParticles() {
  particleCanvas.width  = bgW;
  particleCanvas.height = bgH;
  bgParticles = Array.from({ length: 38 }, () => makeParticle(false));
}

function drawParticles() {
  particleCtx.clearRect(0, 0, bgW, bgH);

  bgParticles.forEach((p, i) => {
    p.x    += p.vx;
    p.y    += p.vy;
    p.life += p.lifeSpeed;

    if (p.y < -10 || p.x < -10 || p.x > bgW + 10) {
      bgParticles[i] = makeParticle(true);
      return;
    }

    const a = p.alpha * Math.abs(Math.sin(p.life));
    const rgb = p.col.join(',');

    const glow = particleCtx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 5);
    glow.addColorStop(0, `rgba(${rgb}, ${a * 0.7})`);
    glow.addColorStop(1, `rgba(${rgb}, 0)`);

    particleCtx.beginPath();
    particleCtx.arc(p.x, p.y, p.r * 5, 0, Math.PI * 2);
    particleCtx.fillStyle = glow;
    particleCtx.fill();

    particleCtx.beginPath();
    particleCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    particleCtx.fillStyle = `rgba(${rgb}, ${Math.min(1, a + 0.3)})`;
    particleCtx.fill();
  });
}

/* LAYER 5 — CRT Scanlines */
function drawScanlines() {
  scanlineCanvas.width  = bgW;
  scanlineCanvas.height = bgH;

  const tile = document.createElement('canvas');
  tile.width  = 1;
  tile.height = 4;
  const tCtx = tile.getContext('2d');
  tCtx.fillStyle = 'rgba(0, 0, 0, 0.22)';
  tCtx.fillRect(0, 2, 1, 2);

  const pattern = scanCtx.createPattern(tile, 'repeat');
  scanCtx.fillStyle = pattern;
  scanCtx.fillRect(0, 0, bgW, bgH);
}

/* Background resize handler */
function onBgResize() {
  bgW = window.innerWidth;
  bgH = window.innerHeight;
  drawBackground();
  drawGrid();
  initStars();
  initParticles();
  drawScanlines();
}

/* Background animation loop */
let bgRaf = null;
function bgLoop(timestamp) {
  drawStars(timestamp);
  drawParticles();
  bgRaf = requestAnimationFrame(bgLoop);
}

/* Initialize background */
function initBackground() {
  drawBackground();
  drawGrid();
  initStars();
  initParticles();
  drawScanlines();
  bgRaf = requestAnimationFrame(bgLoop);
  window.addEventListener('resize', onBgResize);
}

function stopBackground() {
  if (bgRaf) cancelAnimationFrame(bgRaf);
}

/* Initialize background on page load */
document.addEventListener('DOMContentLoaded', initBackground);

/* ============================================================
   5. NOTIFICATION
   ============================================================ */
let notifTimer = null;
function showNotif(msg) {
  const el = document.getElementById('notif');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(notifTimer);
  notifTimer = setTimeout(() => el.classList.add('hidden'), 2200);
}

/* ============================================================
   6. EXPLOSION EFFECT
   ============================================================ */
function spawnExplosion(x, y, color = '#00ff88') {
  const layer = document.getElementById('explosion-layer');
  const el = document.createElement('div');
  el.className = 'pixel-explosion';
  el.style.left = (x - 24) + 'px';
  el.style.top  = (y - 24) + 'px';
  el.style.background = color;
  el.style.clipPath = 'polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)';
  el.style.boxShadow = `0 0 16px ${color}`;
  layer.appendChild(el);
  setTimeout(() => el.remove(), 520);
}

/* ============================================================
   7. SCREEN SHAKE
   ============================================================ */
function screenShake() {
  const app = document.getElementById('app');
  const explosionLayer = document.getElementById('explosion-layer');
  
  app.classList.remove('shake');
  void app.offsetWidth; // reflow
  app.classList.add('shake');
  
  if (explosionLayer) {
    explosionLayer.classList.remove('flash');
    void explosionLayer.offsetWidth; // reflow
    explosionLayer.classList.add('flash');
  }
  
  setTimeout(() => {
    app.classList.remove('shake');
    if (explosionLayer) explosionLayer.classList.remove('flash');
  }, 400);
}

function showLoadingScreen(duration = 4200, subtitle = 'PREPARING YOUR ADVENTURE...', tip = '', callback = null) {
  Router.go('loading');
  const progressEl   = document.getElementById('loading-progress');
  const subtitleEl   = document.getElementById('loading-subtitle');
  const tipEl        = document.getElementById('loading-tip');
  const loadingText  = document.getElementById('loading-text');
  let progress = 0;
  if (subtitleEl) subtitleEl.textContent = subtitle;
  if (tipEl) tipEl.textContent = tip ? 'TIP: ' + tip : 'TIP: Stay sharp and read each line of code.';
  if (loadingText) loadingText.textContent = 'GET READY...';
  if (progressEl) progressEl.style.width = '0%';
  const timer = setInterval(() => {
    progress = Math.min(100, progress + 8 + Math.random() * 12);
    if (progressEl) progressEl.style.width = progress + '%';
    if (progress >= 96) clearInterval(timer);
  }, 220);
  setTimeout(() => {
    if (progressEl) progressEl.style.width = '100%';
    clearInterval(timer);
    if (callback) callback();
    else Router.go('start');
  }, duration);
}

const LOADING_TIPS = {
  html: [
    'Use semantic tags like <header>, <main>, and <footer> for better structure.',
    'A paragraph tag is <p>. Use it for normal text blocks.',
    'Lists use <ul> or <ol> with <li> items inside.',
    'The <img> tag needs a src and alt for images and accessibility.'
  ],
  css: [
    'Use color, background-color, and border to style boxes.',
    'flexbox helps center items horizontally and vertically.',
    'Use margin for outside spacing and padding for inside spacing.',
    'The z-index property controls which layer appears on top.'
  ],
  js: [
    'Use console.log() to print values while debugging.',
    'Variables declared with const cannot be reassigned.',
    'Functions can return values to use later in your code.',
    'Arrays start at index 0, so the first item is arr[0].'
  ],
  common: [
    'Read the question carefully before typing your answer.',
    'Practice makes the fastest fingers and the sharpest logic.',
    'A good bug fix starts with understanding what the code should do.'
  ]
};

function getLoadingTip(world) {
  const tips = LOADING_TIPS[world] || LOADING_TIPS.common;
  return tips[Math.floor(Math.random() * tips.length)];
}

function loadGame(mode, world) {
  State._lastMode = mode;
  State._lastWorld = world;
  const worldLabel = world.toUpperCase() + ' WORLD';
  const tipText = getLoadingTip(world);
  showLoadingScreen(3200, 'LOADING ' + worldLabel + '...', tipText, () => startMode(mode, world));
}

/* ============================================================
   8. QUESTION BANKS
   ============================================================ */

// ---------- SHOOTER QUESTIONS ----------
const SHOOTER_QS = {
  html: [
    { q: "What tag creates a hyperlink?",           a: "<a>",       hint: "anchor", explanation: "The <a> tag defines a hyperlink, used to link from one page to another. The href attribute specifies the URL of the page the link goes to." },
    { q: "What tag makes the biggest heading?",      a: "<h1>",      hint: "h1-h6", explanation: "The <h1> tag represents the highest level heading in HTML. Headings range from <h1> (most important) to <h6> (least important)." },
    { q: "Tag for unordered list:",                  a: "<ul>",      hint: "ul/ol", explanation: "The <ul> tag defines an unordered (bulleted) list. Use <li> tags inside it for list items." },
    { q: "Tag for paragraph:",                       a: "<p>",       hint: "p", explanation: "The <p> tag defines a paragraph of text. Browsers automatically add space before and after paragraphs." },
    { q: "Self-closing tag for image:",              a: "<img>",     hint: "img", explanation: "The <img> tag embeds an image in the HTML page. It requires a src attribute with the image URL and an alt attribute for accessibility." },
    { q: "Tag that wraps all visible content:",      a: "<body>",    hint: "body", explanation: "The <body> tag contains all the visible content of an HTML document, such as text, images, and links." },
    { q: "Tag to include CSS file:",                 a: "<link>",    hint: "link rel", explanation: "The <link> tag links external resources like CSS files. Use rel='stylesheet' and href to specify the CSS file path." },
    { q: "Tag for a table row:",                     a: "<tr>",      hint: "tr", explanation: "The <tr> tag defines a row in an HTML table. It contains <td> or <th> elements for cells." },
    { q: "Tag for a table data cell:",               a: "<td>",      hint: "td", explanation: "The <td> tag defines a standard cell in an HTML table. It holds data within a table row." },
    { q: "Tag for bold text:",                       a: "<strong>",  hint: "strong", explanation: "The <strong> tag indicates strong importance, usually displayed as bold text. It's semantic and better than <b> for accessibility." }
  ],
  css: [
    { q: "Property to change text color:",           a: "color",             hint: "not background", explanation: "The color property sets the color of text. It accepts color names, hex codes, RGB, etc." },
    { q: "Property for element width:",              a: "width",             hint: "box model", explanation: "The width property sets the width of an element. It's part of the CSS box model along with height, padding, border, and margin." },
    { q: "Display value for inline flexible box:",   a: "flex",              hint: "display: ?", explanation: "Setting display: flex creates a flex container, enabling flexible layouts with properties like justify-content and align-items." },
    { q: "Property to round corners:",               a: "border-radius",     hint: "rounded", explanation: "The border-radius property rounds the corners of an element's border. You can specify different radii for each corner." },
    { q: "Property for element spacing inside:",     a: "padding",           hint: "inner space", explanation: "Padding is the space between an element's content and its border. It adds internal spacing without affecting layout." },
    { q: "Value for no text decoration:",            a: "none",              hint: "text-decoration: ?", explanation: "Setting text-decoration: none removes underlines, overlines, or line-through from text, often used for links." },
    { q: "Property for stacking order:",             a: "z-index",           hint: "layers", explanation: "The z-index property controls the stacking order of positioned elements. Higher values appear on top." },
    { q: "Property to make text bold:",              a: "font-weight",       hint: "weight", explanation: "The font-weight property sets the weight (boldness) of text. Values include normal, bold, or numeric weights like 400." },
    { q: "CSS selector for a class:",                a: ".",                 hint: "prefix", explanation: "The class selector (.) targets elements with a specific class attribute. Classes can be reused across multiple elements." },
    { q: "CSS selector for an id:",                  a: "#",                 hint: "hash", explanation: "The id selector (#) targets a unique element with a specific id attribute. IDs must be unique within a page." }
  ],
  js: [
    { q: "Output: console.log(2 + '3')",             a: "23",        hint: "concatenation", explanation: "In JavaScript, the + operator concatenates strings. When one operand is a string, the other is converted to string." },
    { q: "Output: console.log(typeof null)",         a: "object",    hint: "famous bug", explanation: "typeof null returns 'object' due to a historical bug in JavaScript. null is a primitive type, not an object." },
    { q: "Output: console.log(1 == '1')",            a: "true",      hint: "loose equality", explanation: "The == operator performs type coercion. It converts '1' to number 1, so 1 == 1 is true." },
    { q: "Output: console.log(1 === '1')",           a: "false",     hint: "strict equality", explanation: "The === operator checks value and type without coercion. 1 (number) !== '1' (string)." },
    { q: "Declare a constant: __ x = 5;",            a: "const",     hint: "immutable", explanation: "const declares a constant variable that cannot be reassigned. Use const for values that don't change." },
    { q: "Output: [1,2,3].length",                   a: "3",         hint: "array length", explanation: "The length property returns the number of elements in an array. Arrays are zero-indexed." },
    { q: "Output: Math.max(3, 7, 2)",                a: "7",         hint: "max value", explanation: "Math.max() returns the largest number from the arguments provided." },
    { q: "Output: 'hello'.toUpperCase()",            a: "HELLO",     hint: "string method", explanation: "The toUpperCase() method converts a string to uppercase letters." },
    { q: "Output: Boolean(0)",                       a: "false",     hint: "falsy", explanation: "Boolean() converts a value to true or false. 0, '', null, undefined, NaN are falsy." },
    { q: "Output: [1,2,3].indexOf(2)",               a: "1",         hint: "zero-based index", explanation: "indexOf() returns the first index of an element. Arrays start at index 0, so 2 is at index 1." }
  ]
};

// ---------- BUG HUNTER LEVELS ----------
const BUG_LEVELS = {
  html: [
    {
      file: 'index.html',
      lines: [
        '<!DOCTYPE html>',
        '<html>',
        '<head>',
        '  <titel>My Page</titel>',   // BUG: titel → title
        '</head>',
        '<body>',
        '  <h1>Hello World</h1>',
        '</body>',
        '</html>'
      ],
      bugs: [{ line: 3, wrong: '  <titel>My Page</titel>', right: '  <title>My Page</title>', hint: 'Tag is misspelled' }],
      explanation: "The <title> tag defines the title of the document, shown in the browser tab. It's essential for SEO and user experience."
    },
    {
      file: 'index.html',
      lines: [
        '<ul>',
        '  <li>Item 1<li>',           // BUG: missing closing slash
        '  <li>Item 2</li>',
        '  <li>Item 3</li>',
        '</ul>'
      ],
      bugs: [{ line: 1, wrong: '  <li>Item 1<li>', right: '  <li>Item 1</li>', hint: 'Closing tag is missing /' }],
      explanation: "HTML tags must be properly closed. The <li> tag requires a closing </li> to define list items correctly."
    }
  ],
  css: [
    {
      file: 'style.css',
      lines: [
        'body {',
        '  backgrond-color: #fff;',   // BUG: typo
        '  font-size: 16px;',
        '  margin: 0;',
        '}'
      ],
      bugs: [{ line: 1, wrong: '  backgrond-color: #fff;', right: '  background-color: #fff;', hint: 'Property name is misspelled' }],
      explanation: "CSS property names must be spelled correctly. 'background-color' sets the background color of an element."
    },
    {
      file: 'style.css',
      lines: [
        '.box {',
        '  width: 200px;',
        '  height 100px;',            // BUG: missing colon
        '  background: cyan;',
        '}'
      ],
      bugs: [{ line: 2, wrong: '  height 100px;', right: '  height: 100px;', hint: 'Missing colon after property name' }],
      explanation: "CSS declarations require a colon (:) between the property name and value. 'height: 100px;' sets the element's height."
    }
  ],
  js: [
    {
      file: 'app.js',
      lines: [
        'function greet(name) {',
        '  return "Hello, " + Name;',  // BUG: Name → name
        '}',
        'console.log(greet("Zeke"));'
      ],
      bugs: [{ line: 1, wrong: '  return "Hello, " + Name;', right: '  return "Hello, " + name;', hint: 'Variable name is case-sensitive' }],
      explanation: "JavaScript is case-sensitive. 'name' and 'Name' are different variables. Always match the case of your variable declarations."
    },
    {
      file: 'app.js',
      lines: [
        'let nums = [1, 2, 3];',
        'for (let i = 0; i <= nums.length; i++) {',   // BUG: <= → <
        '  console.log(nums[i]);',
        '}'
      ],
      bugs: [{ line: 1, wrong: 'for (let i = 0; i <= nums.length; i++) {', right: 'for (let i = 0; i < nums.length; i++) {', hint: 'Off-by-one error in loop condition' }],
      explanation: "Array indices start at 0. For an array of length 3, valid indices are 0, 1, 2. Using <= length causes an out-of-bounds access."
    }
  ]
};

// ---------- CODE GUESSER QUESTIONS ----------
const GUESSER_QS = {
  html: [
    {
      type: 'category',
      code: '<div class="box">\n  <p>Hello</p>\n</div>',
      question: 'What does this code represent?',
      options: ['HTML Structure','CSS Style','JS Logic','SQL Query'],
      answer: 'HTML Structure',
      explanation: 'This is HTML markup using <div> and <p> tags to structure content on a web page.'
    },
    {
      type: 'world',
      code: '<img src="photo.jpg" alt="A photo">',
      question: 'Which language is this?',
      options: ['HTML','CSS','JavaScript','Python'],
      answer: 'HTML',
      explanation: 'The <img> tag is an HTML element used to embed images in web pages.'
    },
    {
      type: 'output',
      code: '<h1>Code With Zeke</h1>',
      question: 'What does this render on screen?',
      options: ['Large bold heading','Small italic text','A link','An image'],
      answer: 'Large bold heading',
      explanation: 'The <h1> tag creates the largest heading level in HTML, typically displayed as large, bold text.'
    }
  ],
  css: [
    {
      type: 'output',
      code: 'p {\n  color: red;\n  font-size: 20px;\n}',
      question: 'What does this style do?',
      options: ['Makes paragraphs red, size 20px','Hides paragraphs','Changes background','Sets width'],
      answer: 'Makes paragraphs red, size 20px',
      explanation: 'This CSS rule sets the text color to red and font size to 20px for all <p> elements.'
    },
    {
      type: 'category',
      code: '.container {\n  display: flex;\n  justify-content: center;\n}',
      question: 'What layout technique is used?',
      options: ['Flexbox','Grid','Float','Table'],
      answer: 'Flexbox',
      explanation: 'display: flex creates a flex container, enabling CSS Flexbox layout with properties like justify-content.'
    },
    {
      type: 'world',
      code: 'body { background-color: #000; }',
      question: 'Which language is this?',
      options: ['CSS','HTML','JavaScript','Ruby'],
      answer: 'CSS',
      explanation: 'CSS uses selectors like body and properties like background-color to style HTML elements.'
    }
  ],
  js: [
    {
      type: 'output',
      code: 'let x = 5;\nlet y = 3;\nconsole.log(x + y);',
      question: 'What is the output?',
      options: ['8','53','xy','undefined'],
      answer: '8',
      explanation: 'Numbers are added mathematically. 5 + 3 = 8.'
    },
    {
      type: 'output',
      code: 'let arr = [10, 20, 30];\nconsole.log(arr[1]);',
      question: 'What is the output?',
      options: ['20','10','30','undefined'],
      answer: '20',
      explanation: 'Array indices start at 0. arr[0] = 10, arr[1] = 20, arr[2] = 30.'
    },
    {
      type: 'category',
      code: 'document.getElementById("btn")\n  .addEventListener("click", fn);',
      question: 'What concept is demonstrated?',
      options: ['DOM Manipulation','Array Method','CSS Selector','HTML Tag'],
      answer: 'DOM Manipulation',
      explanation: 'getElementById selects an HTML element by ID, and addEventListener attaches event handlers for user interactions.'
    },
    {
      type: 'output',
      code: 'function add(a, b) {\n  return a + b;\n}\nconsole.log(add(4, 6));',
      question: 'What is the output?',
      options: ['10','46','undefined','NaN'],
      answer: '10',
      explanation: 'The function add returns 4 + 6 = 10, which is logged to the console.'
    },
    {
      type: 'array',
      code: 'let arr = [1, 2, 3, 4];\nlet r = arr.filter(x => x > 2);\nconsole.log(r);',
      question: 'What does r contain?',
      options: ['[3, 4]','[1, 2]','[1, 2, 3, 4]','[]'],
      answer: '[3, 4]',
      explanation: 'filter() creates a new array with elements that pass the test (x > 2). So [3, 4].'
    }
  ]
};

/* ============================================================
   9. RESULTS SCREEN
   ============================================================ */
function showResults(opts = {}) {
  const { score=0, correct=0, total=1, maxCombo=1, timeLeft=0, mode='shooter', world='html' } = opts;
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
  const timeBonus = timeLeft * 10;
  const finalScore = score + timeBonus;

  // rank
  let rank = 'D';
  if      (accuracy >= 95) rank = 'S';
  else if (accuracy >= 80) rank = 'A';
  else if (accuracy >= 65) rank = 'B';
  else if (accuracy >= 50) rank = 'C';

  document.getElementById('res-score').textContent    = finalScore;
  document.getElementById('res-accuracy').textContent = accuracy + '%';
  document.getElementById('res-combo').textContent    = 'x' + maxCombo;
  document.getElementById('res-time').textContent     = '+' + timeBonus;
  document.getElementById('results-title').textContent =
    accuracy >= 70 ? 'MISSION COMPLETE!' : 'MISSION FAILED!';

  const rankEl = document.getElementById('results-rank');
  rankEl.textContent = rank;
  rankEl.className   = 'results-rank rank-' + rank;

  // save high score
  Save.set(d => {
    if (finalScore > d.highScores[mode]) d.highScores[mode] = finalScore;
    d.gamesPlayed++;
    d.totalScore += finalScore;
    // unlock worlds
    if (accuracy >= 60) {
      if (world === 'html') d.worlds.css = true;
      if (world === 'css')  d.worlds.js  = true;
    }
  });

  Router.go('results');

  // store last game info for retry
  State._lastMode  = mode;
  State._lastWorld = world;
}

/* ============================================================
   10. LEARNING SCREEN
   ============================================================ */
function loadLearning(mode, world) {
  const content = document.getElementById('learning-content');
  content.innerHTML = '';

  let items = [];
  if (mode === 'shooter') {
    items = SHOOTER_QS[world];
  } else if (mode === 'bugHunter') {
    items = BUG_LEVELS[world];
  } else if (mode === 'guesser') {
    items = GUESSER_QS[world];
  }

  items.forEach(item => {
    const div = document.createElement('div');
    div.className = 'learning-item';

    if (mode === 'shooter') {
      div.innerHTML = `
        <h3>${item.q}</h3>
        <p><strong>Answer:</strong> ${item.a}</p>
        <p><strong>Explanation:</strong> ${item.explanation}</p>
      `;
    } else if (mode === 'bugHunter') {
      div.innerHTML = `
        <h3>Bug in ${item.file}</h3>
        <pre>${item.lines.join('\n')}</pre>
        <p><strong>Bug:</strong> ${item.bugs[0].hint}</p>
        <p><strong>Fix:</strong> Change "${item.bugs[0].wrong}" to "${item.bugs[0].right}"</p>
        <p><strong>Explanation:</strong> ${item.explanation}</p>
      `;
    } else if (mode === 'guesser') {
      div.innerHTML = `
        <h3>${item.question}</h3>
        <pre>${item.code}</pre>
        <p><strong>Answer:</strong> ${item.answer}</p>
        <p><strong>Explanation:</strong> ${item.explanation}</p>
      `;
    }

    content.appendChild(div);
  });

  Router.go('learning');
}

/* ============================================================
   11. TIMER UTILITY
   ============================================================ */
function startTimer(seconds, displayId, onTick, onEnd) {
  clearInterval(State.timerInterval);
  let t = seconds;
  document.getElementById(displayId).textContent = t;
  State.timerInterval = setInterval(() => {
    t--;
    document.getElementById(displayId).textContent = t;
    if (onTick) onTick(t);
    if (t <= 0) {
      clearInterval(State.timerInterval);
      if (onEnd) onEnd();
    }
  }, 1000);
  return () => t; // getter
}

/* ============================================================
   11. SHOOTER MODE
   ============================================================ */
const Shooter = (() => {
  let canvas, ctx, enemies = [], currentQ = null;
  let qIndex = 0, qs = [], timeLeft = 60;
  let animId = null;

  const ENEMY_COLORS = ['#ff3c5a','#bf00ff','#ff7c00','#00e5ff'];

  function init(world) {
    resetState();
    qs       = shuffle([...SHOOTER_QS[world]]);
    qIndex   = 0;
    enemies  = [];
    timeLeft = 60;

    document.getElementById('shooter-score').textContent = '0';
    document.getElementById('shooter-combo').textContent = 'x1';
    document.getElementById('shooter-lives').textContent = '❤️❤️❤️';
    document.getElementById('shooter-input').value = '';
    document.getElementById('shooter-feedback').textContent = '';

    canvas = document.getElementById('shooter-canvas');
    ctx    = canvas.getContext('2d');
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    Router.go('shooter');
    nextQuestion();
    spawnEnemy();

    startTimer(60, 'shooter-timer', (t) => {
      timeLeft = t;
      if (t <= 10) document.getElementById('shooter-timer').style.color = 'var(--red)';
    }, endGame);

    cancelAnimationFrame(animId);
    loop();
  }

  function resizeCanvas() {
    const arena = document.getElementById('shooter-arena');
    canvas.width  = arena.clientWidth;
    canvas.height = arena.clientHeight || 260;
  }

  function nextQuestion() {
    if (qIndex >= qs.length) qIndex = 0;
    currentQ = qs[qIndex++];
    document.getElementById('shooter-question-text').textContent = currentQ.q;
    State.total++;
  }

  function spawnEnemy() {
    if (Router.current !== 'shooter') return;
    const speed = 0.4 + (State.score / 800);
    enemies.push({
      x: canvas.width + 40,
      y: 40 + Math.random() * (canvas.height - 100),
      vx: -(speed + Math.random() * 0.5),
      color: ENEMY_COLORS[Math.floor(Math.random() * ENEMY_COLORS.length)],
      size: 28,
      hp: 1,
      alive: true
    });
    const delay = Math.max(1800, 3500 - State.score * 2);
    setTimeout(() => { if (Router.current === 'shooter') spawnEnemy(); }, delay);
  }

  function loop() {
    if (Router.current !== 'shooter') return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGrid();

    enemies.forEach((e, i) => {
      if (!e.alive) return;
      e.x += e.vx;
      // crossed left edge → lose life
      if (e.x < -e.size) {
        e.alive = false;
        loseLife();
        return;
      }
      drawBug(e);
    });

    enemies = enemies.filter(e => e.alive || e.x > -100);
    animId = requestAnimationFrame(loop);
  }

  function drawGrid() {
    ctx.strokeStyle = 'rgba(42,42,69,0.4)';
    ctx.lineWidth = 1;
    const gs = 40;
    for (let x = 0; x < canvas.width;  x += gs) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,canvas.height); ctx.stroke(); }
    for (let y = 0; y < canvas.height; y += gs) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvas.width,y); ctx.stroke(); }
  }

  function drawBug(e) {
    ctx.save();
    ctx.shadowColor = e.color;
    ctx.shadowBlur  = 14;
    ctx.fillStyle   = e.color;
    // pixel bug shape (simple)
    const s = e.size;
    ctx.fillRect(e.x - s/2, e.y - s/2, s, s);
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(e.x - s/4, e.y - s/4, s/5, s/5);   // left eye
    ctx.fillRect(e.x + s/8, e.y - s/4, s/5, s/5);   // right eye
    // antennae
    ctx.strokeStyle = e.color;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(e.x - s/4, e.y - s/2); ctx.lineTo(e.x - s/2, e.y - s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(e.x + s/4, e.y - s/2); ctx.lineTo(e.x + s/2, e.y - s); ctx.stroke();
    ctx.restore();
  }

  function fire(answer) {
    const input = document.getElementById('shooter-input');
    const ans   = answer.trim().toLowerCase();
    const corr  = currentQ.a.trim().toLowerCase();

    if (ans === corr) {
      // hit nearest enemy
      if (enemies.length > 0) {
        const e = enemies.reduce((a, b) => (a.x > b.x ? a : b));
        spawnExplosion(e.x, e.y + 60, e.color);
        e.alive = false;
      }
      State.score  += 100 * State.combo;
      State.combo   = Math.min(State.combo + 1, 8);
      State.correct++;
      State.maxCombo = Math.max(State.maxCombo, State.combo);
      setFeedback('shooter-feedback', '✓ CORRECT! +' + (100 * (State.combo-1)), 'ok');
      spawnEnemy();
    } else {
      State.combo = 1;
      setFeedback('shooter-feedback', '✗ WRONG! Hint: ' + currentQ.hint, 'err');
      screenShake();
    }

    updateHUD_shooter();
    input.value = '';
    nextQuestion();
  }

  function loseLife() {
    State.lives--;
    State.combo = 1;
    screenShake();
    const hearts = ['','❤️','❤️❤️','❤️❤️❤️'];
    document.getElementById('shooter-lives').textContent = hearts[Math.max(0,State.lives)] || '💀';
    if (State.lives <= 0) endGame();
    updateHUD_shooter();
  }

  function updateHUD_shooter() {
    document.getElementById('shooter-score').textContent = State.score;
    document.getElementById('shooter-combo').textContent = 'x' + State.combo;
  }

  function endGame() {
    cancelAnimationFrame(animId);
    clearInterval(State.timerInterval);
    window.removeEventListener('resize', resizeCanvas);
    showResults({
      score: State.score, correct: State.correct,
      total: State.total, maxCombo: State.maxCombo,
      timeLeft, mode: 'shooter', world: State.world
    });
  }

  return { init };
})();

/* ============================================================
   12. BUG HUNTER MODE
   ============================================================ */
const BugHunter = (() => {
  let levels = [], levelIdx = 0, currentLevel = null;
  let bugsFixed = 0, bugsTotal = 0, selectedLine = null, timeLeft = 90;

  function init(world) {
    resetState();
    levels    = shuffle([...BUG_LEVELS[world]]);
    levelIdx  = 0;
    bugsFixed = 0;
    timeLeft  = 90;

    document.getElementById('bug-score').textContent = '0';
    document.getElementById('bug-combo').textContent = 'x1';
    document.getElementById('bug-feedback').textContent = '';

    Router.go('bugHunter');
    loadLevel();

    startTimer(90, 'bug-timer', (t) => {
      timeLeft = t;
      if (t <= 15) document.getElementById('bug-timer').style.color = 'var(--red)';
    }, endGame);
  }

  function loadLevel() {
    if (levelIdx >= levels.length) { endGame(); return; }
    currentLevel = levels[levelIdx];
    bugsTotal    = currentLevel.bugs.length;
    State.total += bugsTotal;
    selectedLine = null;

    document.getElementById('editor-filename').textContent = currentLevel.file;
    document.getElementById('bug-hint-text').textContent   = '';
    document.getElementById('bug-fix-panel').classList.add('hidden');
    document.getElementById('bug-feedback').textContent    = '';
    document.getElementById('bug-count').textContent       = (bugsTotal - bugsFixed) + ' bug(s)';

    renderEditor();
  }

  function renderEditor() {
    const body = document.getElementById('editor-body');
    body.innerHTML = '';
    currentLevel.lines.forEach((line, i) => {
      const row = document.createElement('div');
      row.className = 'code-line';
      row.dataset.lineIndex = i;

      // check if this line has a bug
      const bug = currentLevel.bugs.find(b => b.line === i);
      if (bug && !bug.fixed) row.classList.add('buggy');
      if (bug && bug.fixed)  row.classList.add('fixed');

      row.innerHTML = `<span class="line-num">${i + 1}</span><span class="line-code">${syntaxHighlight(line)}</span>`;
      row.addEventListener('click', () => selectLine(i, bug));
      body.appendChild(row);
    });
  }

  function selectLine(i, bug) {
    // clear selection
    document.querySelectorAll('.code-line.selected').forEach(el => el.classList.remove('selected'));
    const row = document.querySelector(`[data-line-index="${i}"]`);
    if (!row) return;

    if (!bug || bug.fixed) {
      setFeedback('bug-feedback', '✓ This line looks fine!', 'ok');
      return;
    }

    row.classList.add('selected');
    selectedLine = i;
    document.getElementById('bug-hint-text').textContent = '💡 Hint: ' + bug.hint;
    document.getElementById('bug-fix-input').value = currentLevel.lines[i];
    document.getElementById('bug-fix-panel').classList.remove('hidden');
    document.getElementById('bug-fix-input').focus();
  }

  function submitFix() {
    if (selectedLine === null) return;
    const input  = document.getElementById('bug-fix-input').value.trim();
    const bug    = currentLevel.bugs.find(b => b.line === selectedLine);
    if (!bug || bug.fixed) return;

    if (input === bug.right.trim()) {
      bug.fixed = true;
      currentLevel.lines[selectedLine] = bug.right;
      bugsFixed++;
      State.correct++;
      State.score += 200 * State.combo;
      State.combo  = Math.min(State.combo + 1, 8);
      State.maxCombo = Math.max(State.maxCombo, State.combo);
      setFeedback('bug-feedback', '🔧 BUG FIXED! +' + (200 * (State.combo-1)), 'ok');
      spawnExplosion(window.innerWidth/2, window.innerHeight/2, '#00ff88');
      renderEditor();
      document.getElementById('bug-fix-panel').classList.add('hidden');
      document.getElementById('bug-count').textContent = (bugsTotal - bugsFixed) + ' bug(s)';
      updateHUD_bug();

      // Check if all bugs fixed
      if (currentLevel.bugs.every(b => b.fixed)) {
        showNotif('✅ ALL BUGS FIXED! Next level...');
        setTimeout(() => { levelIdx++; loadLevel(); }, 1200);
      }
    } else {
      State.combo = 1;
      setFeedback('bug-feedback', '✗ That\'s not quite right. Try again!', 'err');
      screenShake();
      updateHUD_bug();
    }
  }

  function updateHUD_bug() {
    document.getElementById('bug-score').textContent = State.score;
    document.getElementById('bug-combo').textContent = 'x' + State.combo;
  }

  function endGame() {
    clearInterval(State.timerInterval);
    showResults({
      score: State.score, correct: State.correct,
      total: State.total, maxCombo: State.maxCombo,
      timeLeft, mode: 'bugHunter', world: State.world
    });
  }

  return { init, submitFix };
})();

/* ============================================================
   13. CODE GUESSER MODE
   ============================================================ */
const Guesser = (() => {
  let qs = [], qIndex = 0, currentQ = null, timeLeft = 30;
  let answered = false;

  function init(world) {
    resetState();
    qs      = shuffle([...GUESSER_QS[world]]);
    qIndex  = 0;
    timeLeft= 30;

    document.getElementById('guess-score').textContent = '0';
    document.getElementById('guess-combo').textContent = 'x1';
    document.getElementById('guess-feedback').textContent = '';
    document.getElementById('guess-timer').style.color = '';

    Router.go('guesser');
    loadQuestion();
  }

  function loadQuestion() {
    if (qIndex >= qs.length) { endGame(); return; }
    currentQ = qs[qIndex];
    answered = false;
    State.total++;
    timeLeft = 30;

    document.getElementById('guess-qnum').textContent  = (qIndex+1) + '/' + qs.length;
    document.getElementById('guess-type-label').textContent = currentQ.type.toUpperCase() + ' CHALLENGE';
    document.getElementById('guess-code-display').innerHTML = syntaxHighlight(currentQ.code);
    document.getElementById('guess-question-text').textContent = currentQ.question;
    document.getElementById('guess-feedback').textContent = '';
    document.getElementById('guess-timer').style.color = '';

    // Options
    const optBox = document.getElementById('guess-options');
    optBox.innerHTML = '';
    currentQ.options.forEach(opt => {
      const btn = document.createElement('button');
      btn.className   = 'guess-option';
      btn.textContent = opt;
      btn.addEventListener('click', () => selectOption(opt, btn));
      optBox.appendChild(btn);
    });

    // Timer
    clearInterval(State.timerInterval);
    startTimer(30, 'guess-timer', (t) => {
      timeLeft = t;
      if (t <= 8) document.getElementById('guess-timer').style.color = 'var(--red)';
    }, () => {
      if (!answered) { setFeedback('guess-feedback', '⏰ TIME UP!', 'err'); showAnswer(); }
    });
  }

  function selectOption(opt, btn) {
    if (answered) return;
    answered = true;
    clearInterval(State.timerInterval);
    State.total; // already incremented

    if (opt === currentQ.answer) {
      btn.classList.add('correct');
      State.score    += 150 * State.combo;
      State.combo     = Math.min(State.combo + 1, 8);
      State.correct++;
      State.maxCombo  = Math.max(State.maxCombo, State.combo);
      setFeedback('guess-feedback', '✓ CORRECT! +' + (150*(State.combo-1)), 'ok');
      spawnExplosion(window.innerWidth/2, window.innerHeight*0.6, '#00ff88');
    } else {
      btn.classList.add('wrong');
      State.combo = 1;
      setFeedback('guess-feedback', '✗ WRONG! Correct: ' + currentQ.answer, 'err');
      screenShake();
      showAnswer();
    }

    updateHUD_guess();
    setTimeout(() => { qIndex++; loadQuestion(); }, 1400);
  }

  function showAnswer() {
    document.querySelectorAll('.guess-option').forEach(btn => {
      if (btn.textContent === currentQ.answer) btn.classList.add('correct');
    });
  }

  function updateHUD_guess() {
    document.getElementById('guess-score').textContent = State.score;
    document.getElementById('guess-combo').textContent = 'x' + State.combo;
  }

  function endGame() {
    clearInterval(State.timerInterval);
    showResults({
      score: State.score, correct: State.correct,
      total: State.total, maxCombo: State.maxCombo,
      timeLeft, mode: 'guesser', world: State.world
    });
  }

  return { init };
})();

/* ============================================================
   14. DASHBOARD
   ============================================================ */
function loadDashboard() {
  const d = Save.get();
  const modeNames = { shooter: '🏹 Shooter', bugHunter: '🐞 Bug Hunter', guesser: '🌍 Guesser' };
  const worldNames = { html: '🟥 HTML', css: '🟦 CSS', js: '🟨 JS' };

  // High Scores
  const hs = document.getElementById('dash-highscores');
  hs.innerHTML = Object.entries(d.highScores).map(([k,v]) =>
    `<div class="dash-item"><span>${modeNames[k]}</span><span>${v}</span></div>`
  ).join('');

  // Worlds
  const wl = document.getElementById('dash-worlds');
  wl.innerHTML = Object.entries(d.worlds).map(([k,v]) =>
    `<div class="dash-item"><span>${worldNames[k]}</span><span>${v ? '✅ UNLOCKED' : '🔒 LOCKED'}</span></div>`
  ).join('');

  // Rank
  const total = d.totalScore;
  let rank = 'RECRUIT';
  if (total >= 10000) rank = 'CODE MASTER 🏆';
  else if (total >= 5000) rank = 'DEVELOPER ⭐';
  else if (total >= 2000) rank = 'CODER 💻';
  else if (total >= 500)  rank = 'STUDENT 📚';
  document.getElementById('dash-rank').innerHTML =
    `<div class="dash-item"><span>Zeke's Title</span><span>${rank}</span></div>
     <div class="dash-item"><span>Total Score</span><span>${total}</span></div>`;

  // Games played
  document.getElementById('dash-played').innerHTML =
    `<div class="dash-item"><span>Games Played</span><span>${d.gamesPlayed}</span></div>`;
}

/* ============================================================
   15. WORLD LOCK UPDATE
   ============================================================ */
function updateWorldLocks() {
  const d = Save.get();
  ['css','js'].forEach(w => {
    const lock = document.getElementById('lock-' + w);
    if (lock) {
      if (d.worlds[w]) lock.classList.add('hidden');
      else lock.classList.remove('hidden');
    }
  });
}

/* ============================================================
   16. SYNTAX HIGHLIGHT (Simple CSS-based)
   ============================================================ */
function syntaxHighlight(code) {
  // escape HTML
  let s = code
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  // JS keywords
  s = s.replace(/\b(let|const|var|function|return|if|else|for|while|new|class|import|export|true|false|null|undefined)\b/g,
    '<span class="kw">$1</span>');
  // strings
  s = s.replace(/(["'`])([^"'`]*)\1/g, '<span class="str">$1$2$1</span>');
  // numbers
  s = s.replace(/\b(\d+)\b/g, '<span class="num">$1</span>');
  // HTML tags
  s = s.replace(/(&lt;\/?[a-zA-Z][a-zA-Z0-9]*)/g, '<span class="tag">$1</span>');
  s = s.replace(/(&gt;)/g, '<span class="tag">$1</span>');
  // CSS property
  s = s.replace(/([\w-]+)(\s*:)(?!\s*\/\/)/g, '<span class="attr">$1</span>$2');
  // comments
  s = s.replace(/(\/\/.*)/g, '<span class="cm">$1</span>');
  return s;
}

/* ============================================================
   17. UTILITY FUNCTIONS
   ============================================================ */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function setFeedback(id, msg, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className   = 'feedback-text ' + type;
  setTimeout(() => { el.textContent = ''; el.className = 'feedback-text'; }, 2500);
}

/* ============================================================
   18. EVENT LISTENERS (Navigation + Game Controls)
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {

  // ---- START SCREEN ----
  document.getElementById('btn-start').addEventListener('click', () => {
    resetIntroCarousel();
    Router.go('intro');
  });
  document.getElementById('btn-dashboard').addEventListener('click', () => { loadDashboard(); Router.go('dashboard'); });
  document.getElementById('btn-story').addEventListener('click', () => Router.go('story'));

  // ---- INTRO CAROUSEL ----
  // Intro carousel navigation
  let currentIntroSlide = 0;
  function resetIntroCarousel() {
    currentIntroSlide = 0;
    updateIntroSlide(0);
  }
  
  function updateIntroSlide(slideIndex) {
    const slides = document.querySelectorAll('#screen-intro .story-slide');
    const dots = document.querySelectorAll('#screen-intro .story-dots .dot');
    const nextBtn = document.getElementById('btn-intro-next');
    
    slides.forEach((slide, index) => {
      slide.classList.toggle('active', index === slideIndex);
    });
    dots.forEach((dot, index) => {
      dot.classList.toggle('active', index === slideIndex);
    });
    
    // Show "LET'S GO!" on final slide
    if (slideIndex === 2) {
      nextBtn.textContent = "LET'S GO! ▶";
    } else {
      nextBtn.textContent = "NEXT ▶";
    }
  }
  
  document.getElementById('btn-intro-next').addEventListener('click', () => {
    if (currentIntroSlide < 2) {
      currentIntroSlide++;
      updateIntroSlide(currentIntroSlide);
    } else {
      Router.go('mode');
    }
  });
  
  document.querySelectorAll('#screen-intro .story-dots .dot').forEach(dot => {
    dot.addEventListener('click', (e) => {
      currentIntroSlide = parseInt(e.target.getAttribute('data-dot'));
      updateIntroSlide(currentIntroSlide);
    });
  });

  // ---- STORY ----
  const storyContinueBtn = document.getElementById('btn-story-continue');
  if (storyContinueBtn) {
    storyContinueBtn.addEventListener('click', () => Router.go('start'));
  }

  // ---- MODE SELECT ----
  document.querySelectorAll('.mode-card').forEach(card => {
    card.addEventListener('click', () => {
      State.mode = card.dataset.mode;
      document.getElementById('world-mode-label').textContent = 'Mode: ' + card.querySelector('h3').textContent.replace(/\n/g,' ');
      updateWorldLocks();
      Router.go('world');
    });
  });
  document.getElementById('btn-mode-back').addEventListener('click', () => Router.go('start'));

  // ---- WORLD SELECT ----
  document.querySelectorAll('.world-card').forEach(card => {
    card.addEventListener('click', () => {
      const w  = card.dataset.world;
      const d  = Save.get();
      if (!d.worlds[w]) { showNotif('🔒 LOCKED! Complete previous world first.'); return; }
      State.world = w;
      loadGame(State.mode, w);
    });
  });
  document.getElementById('btn-world-back').addEventListener('click', () => Router.go('mode'));

  // ---- SHOOTER ----
  const shooterInput = document.getElementById('shooter-input');
  shooterInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') Shooter_fire();
  });
  document.getElementById('shooter-fire-btn').addEventListener('click', Shooter_fire);
  document.getElementById('btn-shooter-hint').addEventListener('click', () => {
    if (window._shooterUseHint) window._shooterUseHint();
  });
  document.getElementById('btn-shooter-quit').addEventListener('click', quitGame);
  document.getElementById('btn-shooter-back').addEventListener('click', quitGame);

  // ---- BUG HUNTER ----
  document.getElementById('bug-submit-btn').addEventListener('click', () => BugHunter.submitFix());
  document.getElementById('bug-fix-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') BugHunter.submitFix();
  });
  document.getElementById('bug-cancel-btn').addEventListener('click', () => {
    document.getElementById('bug-fix-panel').classList.add('hidden');
    document.querySelectorAll('.code-line.selected').forEach(el => el.classList.remove('selected'));
  });
  document.getElementById('btn-bug-quit').addEventListener('click', quitGame);
  document.getElementById('btn-bug-back').addEventListener('click', quitGame);

  // ---- CODE GUESSER ----
  document.getElementById('btn-guess-quit').addEventListener('click', quitGame);
  document.getElementById('btn-guess-back').addEventListener('click', quitGame);

  // ---- RESULTS ----
  document.getElementById('btn-retry').addEventListener('click', () => {
    if (State._lastMode && State._lastWorld) loadGame(State._lastMode, State._lastWorld);
  });
  document.getElementById('btn-modes').addEventListener('click', () => Router.go('mode'));
  document.getElementById('btn-home-from-results').addEventListener('click', () => Router.go('start'));

  // ---- DASHBOARD ----
  document.getElementById('btn-dash-back').addEventListener('click', () => Router.go('start'));

  // ---- LEARNING ----
  document.getElementById('btn-learning-continue').addEventListener('click', () => {
    if (State.resultsOpts) showResults(State.resultsOpts);
  });
  document.getElementById('btn-learning-back').addEventListener('click', () => Router.go('mode'));

  // ---- INIT ----
  updateWorldLocks();
  showLoadingScreen(2000);
});

/* ============================================================
   19. MODE LAUNCHER
   ============================================================ */
function startMode(mode, world) {
  if (mode === 'shooter')   Shooter.init(world);
  else if (mode === 'bugHunter') BugHunter.init(world);
  else if (mode === 'guesser')   Guesser.init(world);
}

/* ---------- Shooter fire wrapper (needs to be global for event) ---------- */
function Shooter_fire() {
  const val = document.getElementById('shooter-input').value;
  if (!val.trim()) return;
  if (window._shooterFire) window._shooterFire(val);
}

// Patch: expose fire from Shooter module
// Re-define Shooter with fire exposed
(function patchShooter() {
  // Overwrite the fire handler
  const input = document.getElementById('shooter-input');
  if (!input) return;
  // The actual fire is internal — we proxy by dispatching a custom event
  // Instead, we modify the IIFE slightly: store fire ref on window
})();

// Alternative: Use a global shooterFire ref
window._shooterFire = null;

// Patch Shooter to expose fire
const ShooterModule = (() => {
  let canvas, ctx, enemies = [], currentQ = null;
  let qIndex = 0, qs = [], timeLeft = 60, animId = null, hintsLeft = 3;
  const COLORS = ['#ff3c5a','#bf00ff','#ff7c00','#00e5ff'];

  function init(world) {
    resetState();
    qs = shuffle([...SHOOTER_QS[world]]);
    qIndex = 0; enemies = []; timeLeft = 60; hintsLeft = 3;
    document.getElementById('shooter-score').textContent = '0';
    document.getElementById('shooter-combo').textContent = 'x1';
    document.getElementById('shooter-lives').textContent = '❤️❤️❤️';
    document.getElementById('shooter-input').value = '';
    document.getElementById('shooter-feedback').textContent = '';
    document.getElementById('shooter-hint-text').textContent = '';
    document.getElementById('shooter-timer').style.color = '';
    updateHintUI();
    canvas = document.getElementById('shooter-canvas');
    ctx    = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    Router.go('shooter');
    nextQ();
    spawnE();
    startTimer(60, 'shooter-timer', (t) => {
      timeLeft = t;
      if (t <= 10) document.getElementById('shooter-timer').style.color = 'var(--red)';
    }, endGame);
    cancelAnimationFrame(animId);
    loop();
    window._shooterFire = fire;
    window._shooterUseHint = useHint;
  }

  function resize() {
    const a = document.getElementById('shooter-arena');
    canvas.width  = a.clientWidth  || 800;
    canvas.height = a.clientHeight || 280;
  }

  function nextQ() {
    if (qIndex >= qs.length) qIndex = 0;
    currentQ = qs[qIndex++];
    document.getElementById('shooter-question-text').textContent = currentQ.q;
    document.getElementById('shooter-hint-text').textContent = '';
    State.total++;
  }

  function updateHintUI() {
    const hintCount = document.getElementById('shooter-hint-count');
    const hintButton = document.getElementById('btn-shooter-hint');
    if (hintCount) hintCount.textContent = 'HINTS LEFT: ' + hintsLeft;
    if (hintButton) hintButton.disabled = hintsLeft <= 0;
  }

  function useHint() {
    if (hintsLeft <= 0) {
      setFeedback('shooter-feedback', 'NO HINTS LEFT', 'err');
      return;
    }
    hintsLeft -= 1;
    updateHintUI();
    if (currentQ) {
      document.getElementById('shooter-hint-text').textContent = 'HINT: ' + currentQ.hint;
      setFeedback('shooter-feedback', 'FREE HINT USED', 'ok');
    }
  }

  function spawnE() {
    if (Router.current !== 'shooter') return;
    const speed = 0.45 + (State.score / 1000);
    enemies.push({
      x: (canvas.width || 800) + 40,
      y: 50 + Math.random() * ((canvas.height || 280) - 120),
      vx: -(speed + Math.random() * 0.6),
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      size: 26, alive: true
    });
    const delay = Math.max(1600, 3200 - State.score * 2);
    setTimeout(() => { if (Router.current === 'shooter') spawnE(); }, delay);
  }

  function loop() {
    if (Router.current !== 'shooter') { cancelAnimationFrame(animId); return; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGrid();
    enemies.forEach(e => {
      if (!e.alive) return;
      e.x += e.vx;
      if (e.x < -e.size) { e.alive = false; hitZeke(); return; }
      drawBug(e);
    });
    enemies = enemies.filter(e => e.x > -200);
    animId = requestAnimationFrame(loop);
  }

  function drawGrid() {
    ctx.strokeStyle = 'rgba(42,42,69,0.35)';
    ctx.lineWidth   = 1;
    for (let x = 0; x < canvas.width;  x += 40) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,canvas.height); ctx.stroke(); }
    for (let y = 0; y < canvas.height; y += 40) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvas.width,y); ctx.stroke(); }
  }

  function drawBug(e) {
    ctx.save();
    ctx.shadowColor = e.color; ctx.shadowBlur = 12;
    ctx.fillStyle   = e.color;
    const s = e.size;
    ctx.fillRect(e.x-s/2, e.y-s/2, s, s);
    ctx.fillStyle = '#050510';
    ctx.fillRect(e.x-s/4,   e.y-s/5, s/5, s/5);
    ctx.fillRect(e.x+s/10,  e.y-s/5, s/5, s/5);
    ctx.strokeStyle = e.color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(e.x-s/4, e.y-s/2); ctx.lineTo(e.x-s/2, e.y-s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(e.x+s/4, e.y-s/2); ctx.lineTo(e.x+s/2, e.y-s); ctx.stroke();
    ctx.restore();
  }

  function fire(answer) {
    const ans  = (answer || '').trim().toLowerCase();
    const corr = (currentQ.a || '').trim().toLowerCase();
    if (ans === corr) {
      const target = enemies.filter(e=>e.alive).sort((a,b)=>b.x-a.x)[0];
      if (target) { spawnExplosion(target.x, target.y + 64, target.color); target.alive = false; }
      State.score += 100 * State.combo;
      State.combo  = Math.min(State.combo + 1, 8);
      State.correct++;
      State.maxCombo = Math.max(State.maxCombo, State.combo);
      setFeedback('shooter-feedback', '✓ CORRECT! +' + (100 * State.combo), 'ok');
      showNotif('⚡ HIT! x' + State.combo + ' COMBO');
    } else {
      State.combo = 1;
      setFeedback('shooter-feedback', '✗ WRONG! Hint: ' + currentQ.hint, 'err');
      screenShake();
    }
    updateHUD();
    document.getElementById('shooter-input').value = '';
    nextQ();
  }

  function hitZeke() {
    State.lives = Math.max(0, State.lives - 1);
    State.combo = 1;
    screenShake();
    const h = ['💀','❤️','❤️❤️','❤️❤️❤️'];
    document.getElementById('shooter-lives').textContent = h[State.lives] || '💀';
    setFeedback('shooter-feedback', '💀 BUG REACHED ZEKE!', 'err');
    if (State.lives <= 0) endGame();
    updateHUD();
  }

  function updateHUD() {
    document.getElementById('shooter-score').textContent = State.score;
    document.getElementById('shooter-combo').textContent = 'x' + State.combo;
  }

  function endGame() {
    cancelAnimationFrame(animId);
    clearInterval(State.timerInterval);
    window.removeEventListener('resize', resize);
    window._shooterFire = null;
    showResults({
      score: State.score, correct: State.correct,
      total: State.total, maxCombo: State.maxCombo,
      timeLeft, mode: 'shooter', world: State.world
    });
  }

  return { init };
})();

/* ============================================================
   20. OVERRIDE startMode to use ShooterModule
   ============================================================ */
function startMode(mode, world) {
  State.world = world;
  if (mode === 'shooter')    ShooterModule.init(world);
  else if (mode === 'bugHunter') BugHunter.init(world);
  else if (mode === 'guesser')   Guesser.init(world);
}

/* ============================================================
   21. WIRE SHOOTER INPUT TO _shooterFire
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  const inp = document.getElementById('shooter-input');
  const fireBtn = document.getElementById('shooter-fire-btn');

  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && window._shooterFire) {
      window._shooterFire(inp.value);
    }
  });
  fireBtn.addEventListener('click', () => {
    if (window._shooterFire) window._shooterFire(inp.value);
  });
});

/* ============================================================
   CWZ PIXEL CURSOR
   Integrated from the provided cursor system
============================================================ */

const CFG = {
  scale:        3,
  trailLength:  22,
  trailSpawn:   2,
  clickSparks:  14,
  bobAmplitude: 1.5,
  bobSpeed:     0.003,
};

const COLORS = {
  green:  '#00ff88',
  cyan:   '#00e5ff',
  purple: '#bf5fff',
  yellow: '#ffe234',
  red:    '#ff4455',
};
const COLOR_CYCLE = [COLORS.green, COLORS.cyan, COLORS.purple, COLORS.yellow];

function buildSpriteGrid(mainColor, hlColor, outlineColor) {
  const _ = null;
  const A = mainColor;
  const B = outlineColor;
  const H = hlColor;
  return [
    [B, _,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _],
    [B, B,  _,  _,  _,  _,  _,  _,  _,  _,  _,  _],
    [B, A,  B,  _,  _,  _,  _,  _,  _,  _,  _,  _],
    [B, A,  A,  B,  _,  _,  _,  _,  _,  _,  _,  _],
    [B, A,  H,  A,  B,  _,  _,  _,  _,  _,  _,  _],
    [B, A,  H,  A,  A,  B,  _,  _,  _,  _,  _,  _],
    [B, A,  A,  A,  A,  A,  B,  _,  _,  _,  _,  _],
    [B, A,  A,  A,  A,  A,  A,  B,  _,  _,  _,  _],
    [B, A,  A,  B,  B,  A,  A,  A,  B,  _,  _,  _],
    [B, A,  B,  _,  B,  A,  A,  A,  A,  B,  _,  _],
    [B, B,  _,  _,  _,  B,  A,  A,  A,  A,  B,  _],
    [B, _,  _,  _,  _,  _,  B,  A,  A,  A,  A,  B],
    [_,  _, _,  _,  _,  _,  _,  B,  A,  A,  B,  _],
    [_,  _, _,  _,  _,  _,  _,  _,  B,  B,  _,  _],
  ];
}

const state = {
  mx: -200, my: -200,
  rx: -200, ry: -200,
  clicking: false,
  hovering: false,
  colorIdx: 0,
  colorT:   0,
  trail:    [],
  sparks:   [],
};

const trailCanvas  = document.getElementById('cursor-trail');
const trailCtx     = trailCanvas.getContext('2d');
const spriteCanvas = document.getElementById('cursor-sprite');
const spriteCtx    = spriteCanvas.getContext('2d');
const cursorRoot   = document.getElementById('cursor-root');
const glowEl       = document.getElementById('cursor-glow');

function resizeCursor() {
  trailCanvas.width  = window.innerWidth;
  trailCanvas.height = window.innerHeight;
}
resizeCursor();
window.addEventListener('resize', resizeCursor);

const SPRITE_COLS = 12;
const SPRITE_ROWS = 14;

function initSpriteCanvas() {
  const s = CFG.scale;
  spriteCanvas.width  = SPRITE_COLS * s;
  spriteCanvas.height = SPRITE_ROWS * s;
  spriteCtx.imageSmoothingEnabled = false;
}

function drawSprite(mainColor, hlColor, outlineColor, scaleBonus = 1) {
  const s = CFG.scale * scaleBonus;
  spriteCanvas.width  = Math.ceil(SPRITE_COLS * s);
  spriteCanvas.height = Math.ceil(SPRITE_ROWS * s);
  spriteCtx.imageSmoothingEnabled = false;
  spriteCtx.clearRect(0, 0, spriteCanvas.width, spriteCanvas.height);

  const grid = buildSpriteGrid(mainColor, hlColor, outlineColor);
  grid.forEach((row, y) => {
    row.forEach((color, x) => {
      if (!color) return;
      spriteCtx.fillStyle = color;
      spriteCtx.fillRect(
        Math.round(x * s),
        Math.round(y * s),
        Math.ceil(s),
        Math.ceil(s)
      );
    });
  });
}

function currentColor() {
  return COLOR_CYCLE[state.colorIdx % COLOR_CYCLE.length];
}

function nextColor() {
  return COLOR_CYCLE[(state.colorIdx + 1) % COLOR_CYCLE.length];
}

function colorSet(main) {
  return {
    main,
    highlight: '#ffffff',
    outline:   '#000000',
  };
}

function spawnTrailSpark(x, y) {
  const col = currentColor();
  state.trail.push({
    x, y,
    r:     Math.random() * 2.5 + 1,
    color: col,
    alpha: 0.8 + Math.random() * 0.2,
    vx:   (Math.random() - 0.5) * 1.2,
    vy:   (Math.random() - 0.5) * 1.2,
    decay: 0.03 + Math.random() * 0.04,
  });
  if (state.trail.length > CFG.trailLength * CFG.trailSpawn) {
    state.trail.shift();
  }
}

function spawnClickBurst(x, y) {
  const col = currentColor();
  for (let i = 0; i < CFG.clickSparks; i++) {
    const angle = (i / CFG.clickSparks) * Math.PI * 2 + Math.random() * 0.4;
    const speed = Math.random() * 4 + 1.5;
    state.sparks.push({
      x, y,
      vx:    Math.cos(angle) * speed,
      vy:    Math.sin(angle) * speed,
      r:     Math.random() * 3 + 1,
      color: Math.random() > 0.5 ? col : COLORS.cyan,
      alpha: 1,
      decay: 0.025 + Math.random() * 0.03,
      square: Math.random() > 0.5,
    });
  }
}

function spawnRipple(x, y, color) {
  const el = document.createElement('div');
  el.className = 'cursor-ripple';
  el.style.setProperty('--ripple-color', color);
  el.style.left = x + 'px';
  el.style.top  = y + 'px';
  document.body.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

function drawTrailAndSparks() {
  trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);

  state.trail.forEach((p) => {
    p.alpha -= p.decay;
    p.x += p.vx * 0.4;
    p.y += p.vy * 0.4;
    if (p.alpha <= 0) return;

    trailCtx.fillStyle = p.color + Math.round(p.alpha * 255).toString(16).padStart(2, '0');
    const sz = Math.max(1, Math.round(p.r));
    trailCtx.fillRect(Math.round(p.x) - sz, Math.round(p.y) - sz, sz * 2, sz * 2);
  });
  state.trail = state.trail.filter(p => p.alpha > 0);

  state.sparks.forEach((p) => {
    p.alpha -= p.decay;
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.08;
    if (p.alpha <= 0) return;

    const hexA = Math.round(p.alpha * 255).toString(16).padStart(2, '0');
    trailCtx.fillStyle = p.color + hexA;

    if (p.square) {
      const sz = Math.max(1, Math.round(p.r));
      trailCtx.fillRect(Math.round(p.x) - sz, Math.round(p.y) - sz, sz * 2, sz * 2);
    } else {
      trailCtx.beginPath();
      trailCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      trailCtx.fill();
    }

    const g = trailCtx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 3);
    g.addColorStop(0, p.color + Math.round(p.alpha * 100).toString(16).padStart(2, '0'));
    g.addColorStop(1, p.color + '00');
    trailCtx.beginPath();
    trailCtx.arc(p.x, p.y, p.r * 3, 0, Math.PI * 2);
    trailCtx.fillStyle = g;
    trailCtx.fill();
  });
  state.sparks = state.sparks.filter(p => p.alpha > 0);
}

function updateGlow(color, pulse) {
  const alpha1 = (0.3 + pulse * 0.2).toFixed(2);
  const alpha2 = (0.1 + pulse * 0.08).toFixed(2);
  glowEl.style.background =
    `radial-gradient(circle, ${color}${Math.round(alpha1 * 255).toString(16).padStart(2, '0')} 0%, ${color}${Math.round(alpha2 * 255).toString(16).padStart(2, '0')} 50%, transparent 75%)`;
}

let lastTime = 0;

function loopCursor(timestamp) {
  const dt = Math.min(timestamp - lastTime, 50);
  lastTime = timestamp;

  state.colorT += dt;
  if (state.colorT >= 2500) {
    state.colorT = 0;
    state.colorIdx = (state.colorIdx + 1) % COLOR_CYCLE.length;
  }

  const lerpSpeed = 0.18;
  state.rx += (state.mx - state.rx) * lerpSpeed;
  state.ry += (state.my - state.ry) * lerpSpeed;

  const bob = Math.sin(timestamp * CFG.bobSpeed) * CFG.bobAmplitude;

  const mainColor = state.hovering ? COLORS.cyan : currentColor();
  const scaleBonus = state.hovering ? 1.25 : (state.clicking ? 0.85 : 1);
  const cs = colorSet(mainColor);

  drawSprite(cs.main, cs.highlight, cs.outline, scaleBonus);

  cursorRoot.style.transform =
    `translate(${Math.round(state.rx)}px, ${Math.round(state.ry + bob)}px)`;

  const pulse = 0.5 + 0.5 * Math.sin(timestamp * 0.004);
  updateGlow(mainColor, pulse);

  drawTrailAndSparks();
  requestAnimationFrame(loopCursor);
}

document.addEventListener('mousemove', e => {
  state.mx = e.clientX;
  state.my = e.clientY;

  for (let i = 0; i < CFG.trailSpawn; i++) {
    spawnTrailSpark(
      e.clientX + (Math.random() - 0.5) * 6,
      e.clientY + (Math.random() - 0.5) * 6
    );
  }

  const target = document.elementFromPoint(e.clientX, e.clientY);
  state.hovering = !!(target && (
    target.tagName === 'BUTTON' ||
    target.tagName === 'A' ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.closest('button') ||
    target.closest('a') ||
    getComputedStyle(target).cursor === 'pointer'
  ));
});

document.addEventListener('mousedown', e => {
  state.clicking = true;
  spawnClickBurst(e.clientX, e.clientY);
  spawnRipple(e.clientX, e.clientY, currentColor());
});

document.addEventListener('mouseup', () => {
  state.clicking = false;
});

document.addEventListener('mouseleave', () => {
  state.mx = -500;
  state.my = -500;
});
document.addEventListener('mouseenter', e => {
  state.mx = e.clientX;
  state.my = e.clientY;
});

initSpriteCanvas();
requestAnimationFrame(loopCursor);

console.log('%c🖱 CWZ Pixel Cursor Loaded', 'color:#00ff88;font-family:monospace;font-size:13px');

