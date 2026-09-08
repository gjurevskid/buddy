// Each character is a hand-built SVG (viewBox 0 0 120 120) with mood-driven
// mouth shapes. Parts meant to animate carry a class (.tail, .antenna,
// .whisker, .wisp...) that style.css keys off of per-character.
//
// Visual language: naturalistic rather than cartoon-sticker. No hard black
// outlines around silhouettes — edges are defined by the gradient's own
// falloff, the way real light on fur/skin/metal actually looks. Eyes are
// smaller and have a real iris color with a single soft catchlight instead
// of the oversized double-glint "cute" cartoon eye. Colors are muted, natural
// tones rather than bright saturated toy colors. A few short texture strokes
// suggest fur/feather direction on the organic characters.

const MOUTHS = {
  elf: {
    delighted: 'M 44 84 Q 60 94 76 84 Q 60 89 44 84 Z',
    content: 'M 46 84 Q 60 90 74 84',
    bored: 'M 47 86 L 73 86',
    lonely: 'M 47 88 Q 60 83 73 88',
    neglected: 'M 45 90 Q 60 82 75 90'
  },
  robot: {
    delighted: 'M 40 82 Q 60 94 80 82',
    content: 'M 42 82 Q 60 89 78 82',
    bored: 'M 44 84 L 76 84',
    lonely: 'M 44 86 Q 60 82 76 86',
    neglected: 'M 42 88 Q 60 80 78 88'
  },
  ghost: {
    delighted: 'M 51 74 Q 60 82 69 74',
    content: 'M 52 73 Q 60 79 68 73',
    bored: 'M 52 75 L 68 75',
    lonely: 'M 52 77 Q 60 73 68 77',
    neglected: 'M 51 79 Q 60 72 69 79'
  },
  dog: {
    delighted: 'M 44 86 Q 60 98 76 86 Q 60 93 44 86 Z',
    content: 'M 46 86 Q 60 93 74 86',
    bored: 'M 48 88 L 72 88',
    lonely: 'M 48 90 Q 60 86 72 90',
    neglected: 'M 46 92 Q 60 84 74 92'
  },
  cat: {
    delighted: 'M 50 77 Q 55 82 60 77 Q 65 82 70 77',
    content: 'M 50 76 Q 55 80 60 76 Q 65 80 70 76',
    bored: 'M 48 78 L 72 78',
    lonely: 'M 50 80 Q 60 76 70 80',
    neglected: 'M 49 82 Q 60 75 71 82'
  },
  owl: {
    delighted: 'M 52 74 Q 60 79 68 74',
    content: 'M 53 74 Q 60 77 67 74',
    bored: 'M 54 75 L 66 75',
    lonely: 'M 54 76 Q 60 73 66 76',
    neglected: 'M 53 78 Q 60 72 67 78'
  }
};

// Small droop applied near "neglected"/"lonely" moods — subtler than a full
// eyebrow shape, just enough to read as tired without looking cartoonish.
const LID_DROOP = {
  delighted: 0,
  content: 0,
  bored: 1,
  lonely: 2.4,
  neglected: 4
};

// Naturally-proportioned eyes: an almond eye-white, a colored iris, a dark
// pupil, and ONE small catchlight — closer to how a real eye catches light
// than the oversized double-glint cartoon convention.
function eyes(cx1, cx2, cy, rx, ry, irisColor, mood) {
  const droop = LID_DROOP[mood] || 0;
  const one = (cx) => `
    <g class="eyes blink" style="transform-origin: ${cx}px ${cy}px">
      <ellipse class="eyeWhite" cx="${cx}" cy="${cy + droop * 0.3}" rx="${rx}" ry="${Math.max(ry - droop * 0.4, ry * 0.55)}" />
      <circle class="iris" cx="${cx}" cy="${cy + droop * 0.3}" r="${ry * 0.66}" fill="${irisColor}" />
      <circle class="pupil" cx="${cx}" cy="${cy + droop * 0.3}" r="${ry * 0.3}" />
      <circle class="glint" cx="${cx - ry * 0.28}" cy="${cy + droop * 0.3 - ry * 0.28}" r="${ry * 0.16}" fill="#fff" opacity="0.8" />
    </g>`;
  return one(cx1) + one(cx2);
}

function svgWrap(id, inner) {
  return `<svg viewBox="0 0 120 120" width="128" height="128">${GRADIENTS[id] || ''}${inner}</svg>`;
}

function shadow(rx = 30, opacity = 0.15, cy = 114, ry = 6) {
  return `<ellipse cx="60" cy="${cy}" rx="${rx}" ry="${ry}" fill="rgba(40,30,20,${opacity})" />`;
}

// A very soft light-catch, tucked well inside the silhouette — subtle enough
// to suggest a light source without reading as a plastic/glossy sheen.
function sheen(cx, cy, rx, ry, opacity = 0.14) {
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#ffffff" opacity="${opacity}" />`;
}

function ao(cx, cy, rx, ry, opacity = 0.13) {
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#000000" opacity="${opacity}" />`;
}

// A handful of short, thin strokes suggesting fur/feather direction rather
// than a flat, textureless fill.
function texture(strokes, color, opacity = 0.22) {
  return `<g opacity="${opacity}" stroke="${color}" stroke-width="1" fill="none" stroke-linecap="round">${strokes
    .map(([x1, y1, x2, y2]) => `<path d="M ${x1} ${y1} Q ${(x1 + x2) / 2} ${(y1 + y2) / 2 - 2} ${x2} ${y2}" />`)
    .join('')}</g>`;
}

function feet(color, y = 108, rx = 9, ry = 5, spread = 32) {
  const cx1 = 60 - spread / 2;
  const cx2 = 60 + spread / 2;
  return `
    <g class="feet">
      <ellipse class="foot footL" cx="${cx1}" cy="${y}" rx="${rx}" ry="${ry}" fill="${color}" />
      <ellipse class="foot footR" cx="${cx2}" cy="${y}" rx="${rx}" ry="${ry}" fill="${color}" />
    </g>`;
}

// A slowly-rotating ring of tiny sparkles — the visual signature of the
// "elder" evolution stage, shared across every species.
function auraStars() {
  const degrees = [0, 60, 120, 180, 240, 300];
  const r = 52;
  const stars = degrees
    .map((deg) => {
      const rad = (deg * Math.PI) / 180;
      const x = 60 + r * Math.cos(rad);
      const y = 60 + r * Math.sin(rad);
      return `<path d="M ${x} ${y - 3} L ${x + 2.4} ${y} L ${x} ${y + 3} L ${x - 2.4} ${y} Z" fill="#e8c876" opacity="0.8" />`;
    })
    .join('');
  return `<g class="aura">${stars}</g>`;
}

function grad(id, cx, cy, r, stops) {
  const stopEls = stops.map(([offset, color]) => `<stop offset="${offset}" stop-color="${color}" />`).join('');
  return `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${stopEls}</radialGradient>`;
}

// Muted, naturalistic 3-stop gradients — earth tones and real material
// colors rather than bright saturated toy colors.
const GRADIENTS = {
  elf: `<defs>
    ${grad('g-elf-hat', '35%', '22%', '85%', [['0%', '#6b9c78'], ['55%', '#456e50'], ['100%', '#2c4a34']])}
    ${grad('g-elf-head', '38%', '28%', '75%', [['0%', '#f0d0ac'], ['55%', '#dcae82'], ['100%', '#b9855c']])}
  </defs>`,
  robot: `<defs>
    ${grad('g-robot-head', '32%', '22%', '85%', [['0%', '#e4e8ec'], ['55%', '#c3cad2'], ['100%', '#9aa4b0']])}
    ${grad('g-robot-screen', '40%', '28%', '82%', [['0%', '#2e3540'], ['55%', '#1c212a'], ['100%', '#12151b']])}
  </defs>`,
  ghost: `<defs>
    ${grad('g-ghost-body', '40%', '18%', '90%', [['0%', '#fdfdfd'], ['55%', '#e6e6ef'], ['100%', '#c7c7d8']])}
  </defs>`,
  dog: `<defs>
    ${grad('g-dog-head', '36%', '26%', '78%', [['0%', '#d9ab6f'], ['55%', '#b9834a'], ['100%', '#8f6132']])}
    ${grad('g-dog-ear', '35%', '22%', '82%', [['0%', '#a8703e'], ['55%', '#845428'], ['100%', '#5e3a1c']])}
  </defs>`,
  cat: `<defs>
    ${grad('g-cat-head', '36%', '26%', '78%', [['0%', '#b8b0a4'], ['55%', '#8f8578'], ['100%', '#6a6155']])}
    ${grad('g-cat-tail', '35%', '22%', '82%', [['0%', '#a89e90'], ['55%', '#83786a'], ['100%', '#5e564a']])}
  </defs>`,
  owl: `<defs>
    ${grad('g-owl-head', '36%', '24%', '78%', [['0%', '#c9b18c'], ['55%', '#a3835c'], ['100%', '#785f42']])}
    ${grad('g-owl-body', '36%', '18%', '86%', [['0%', '#b39a72'], ['55%', '#8c7350'], ['100%', '#5f4c34']])}
  </defs>`
};

const ACCESSORIES = {
  elf: `<g class="accessory">
    <path d="M 56 6 L 61 0 L 65 8 L 60 13 Z" fill="#d9b46a" opacity="0.9" />
    <ellipse cx="20" cy="58" rx="2.6" ry="3.4" fill="#d9b46a" opacity="0.9" />
    <ellipse cx="100" cy="58" rx="2.6" ry="3.4" fill="#d9b46a" opacity="0.9" />
  </g>`,
  robot: `<g class="accessory">
    <path d="M 14 50 Q 0 60 9 76 Q 16 66 24 62 Z" fill="#c9a24a" opacity="0.9" />
    <path d="M 106 50 Q 120 60 111 76 Q 104 66 96 62 Z" fill="#c9a24a" opacity="0.9" />
  </g>`,
  ghost: `<g class="accessory">
    <ellipse cx="60" cy="8" rx="13" ry="4.5" fill="none" stroke="#e8c876" stroke-width="2" opacity="0.75" />
  </g>`,
  dog: `<g class="accessory">
    <path d="M 40 92 Q 60 101 80 92 L 78 99 Q 60 106 42 99 Z" fill="#a8462f" opacity="0.9" />
    <path d="M 55 99 L 60 108 L 65 99 Z" fill="#d9b46a" opacity="0.9" />
  </g>`,
  cat: `<g class="accessory">
    <path d="M 48 27 L 51 14 L 60 23 L 69 14 L 72 27 Z" fill="#d9b46a" opacity="0.9" />
  </g>`,
  owl: `<g class="accessory">
    <path d="M 60 6 L 63 13 L 70 13 L 64 18 L 66 25 L 60 20 L 54 25 L 56 18 L 50 13 L 57 13 Z" fill="#d9b46a" opacity="0.9" />
  </g>`
};

function accessoryFor(id, stage) {
  return stage === 'elder' ? ACCESSORIES[id] || '' : '';
}

const BUILDERS = {
  elf(mood, stage) {
    const mouth = MOUTHS.elf[mood];
    return svgWrap('elf', `
      ${shadow()}
      ${stage === 'elder' ? auraStars() : ''}
      <path d="M 30 48 Q 60 -6 90 48 Z" fill="url(#g-elf-hat)" />
      <ellipse cx="60" cy="46" rx="32" ry="7" fill="#3a5f44" />
      <path d="M 20 66 L 8 56 L 16 76 Z" fill="url(#g-elf-head)" />
      <path d="M 100 66 L 112 56 L 104 76 Z" fill="url(#g-elf-head)" />
      <circle class="head" cx="60" cy="58" r="33" fill="url(#g-elf-head)" />
      ${sheen(48, 45, 12, 8)}
      ${ao(60, 82, 22, 8)}
      ${texture([[38, 70, 46, 76], [74, 70, 82, 76]], '#9c6f48', 0.25)}
      ${eyes(47, 73, 56, 5.6, 5, '#4a7a52', mood)}
      <path d="M 56 63 L 64 63 L 60 68 Z" fill="#c99a72" opacity="0.8" />
      <path id="mouth" d="${mouth}" fill="none" stroke="#7a5230" stroke-width="2.2" stroke-linecap="round" />
      <g class="cloak grownOnly">
        <path d="M 30 88 Q 60 104 90 88 L 90 100 Q 60 114 30 100 Z" fill="#3a5f44" />
      </g>
      ${feet('#3a2e22', 112, 8, 4, 30)}
      ${accessoryFor('elf', stage)}
    `);
  },

  robot(mood, stage) {
    const mouth = MOUTHS.robot[mood];
    return svgWrap('robot', `
      ${shadow()}
      ${stage === 'elder' ? auraStars() : ''}
      <g class="antenna">
        <rect x="58" y="10" width="4" height="16" fill="#8f97a2" />
        <circle cx="60" cy="8" r="5.5" fill="#e8a94a" />
      </g>
      <rect x="14" y="30" width="10" height="18" rx="3" fill="#a8b0ba" />
      <rect x="96" y="30" width="10" height="18" rx="3" fill="#a8b0ba" />
      <rect class="head" x="22" y="26" width="76" height="72" rx="14" fill="url(#g-robot-head)" />
      <line x1="22" y1="52" x2="98" y2="52" stroke="#8f97a2" stroke-width="1" opacity="0.5" />
      <circle cx="30" cy="32" r="1.4" fill="#8f97a2" />
      <circle cx="90" cy="32" r="1.4" fill="#8f97a2" />
      ${sheen(40, 38, 13, 8, 0.16)}
      ${ao(60, 90, 26, 7, 0.12)}
      <circle cx="30" cy="76" r="2.2" fill="#e8a94a" opacity="0.55" />
      <circle cx="90" cy="76" r="2.2" fill="#e8a94a" opacity="0.55" />
      <rect x="34" y="40" width="52" height="46" rx="8" fill="url(#g-robot-screen)" />
      <g class="eyes blink" style="transform-origin: 50px 60px">
        <circle class="pupil led" cx="50" cy="60" r="5.5" fill="#e8a94a" />
        <circle cx="48" cy="58" r="1.6" fill="#fbe4bd" />
      </g>
      <g class="eyes blink" style="transform-origin: 70px 60px">
        <circle class="pupil led" cx="70" cy="60" r="5.5" fill="#e8a94a" />
        <circle cx="68" cy="58" r="1.6" fill="#fbe4bd" />
      </g>
      <path id="mouth" d="${mouth}" fill="none" stroke="#e8a94a" stroke-width="2.4" stroke-linecap="round" />
      <circle cx="26" cy="94" r="2.6" fill="#a8b0ba" />
      <circle cx="94" cy="94" r="2.6" fill="#a8b0ba" />
      <g class="feet">
        <rect class="foot footL" x="30" y="100" width="16" height="9" rx="3" fill="#a8b0ba" />
        <rect class="foot footR" x="74" y="100" width="16" height="9" rx="3" fill="#a8b0ba" />
      </g>
      ${accessoryFor('robot', stage)}
    `);
  },

  ghost(mood, stage) {
    const mouth = MOUTHS.ghost[mood];
    return svgWrap('ghost', `
      ${shadow(20, 0.08, 112, 4)}
      ${stage === 'elder' ? auraStars() : ''}
      <g class="wisp grownOnly">
        <path d="M 78 96 Q 90 100 86 110 Q 96 106 92 116" stroke="#d5d5e5" stroke-width="3.5" fill="none" stroke-linecap="round" opacity="0.7" />
      </g>
      <ellipse cx="19" cy="70" rx="6" ry="9" fill="url(#g-ghost-body)" opacity="0.9" />
      <ellipse cx="101" cy="70" rx="6" ry="9" fill="url(#g-ghost-body)" opacity="0.9" />
      <path class="head" d="M 22 58 A 38 38 0 0 1 98 58 L 98 90 Q 90 101 82 90 Q 74 101 66 90 Q 58 101 50 90 Q 42 101 34 90 Q 26 101 22 90 Z" fill="url(#g-ghost-body)" opacity="0.94" />
      ${sheen(44, 40, 14, 10, 0.22)}
      ${ao(60, 76, 22, 7, 0.06)}
      <g style="transform-origin: 45px 58px" class="eyes blink">
        <ellipse cx="45" cy="58" rx="3.4" ry="4.6" fill="#5a5a70" />
      </g>
      <g style="transform-origin: 75px 58px" class="eyes blink">
        <ellipse cx="75" cy="58" rx="3.4" ry="4.6" fill="#5a5a70" />
      </g>
      <path id="mouth" d="${mouth}" fill="none" stroke="#7a7a94" stroke-width="1.8" stroke-linecap="round" />
      ${accessoryFor('ghost', stage)}
    `);
  },

  dog(mood, stage) {
    const mouth = MOUTHS.dog[mood];
    const tongue = mood === 'delighted' ? '<ellipse cx="60" cy="90" rx="5.5" ry="7" fill="#d97a8a" />' : '';
    return svgWrap('dog', `
      ${shadow()}
      ${stage === 'elder' ? auraStars() : ''}
      <g class="tail">
        <path d="M 84 74 Q 114 62 110 90 Q 106 104 90 96 Q 100 88 94 76 Q 90 70 84 74 Z" fill="url(#g-dog-head)" />
      </g>
      <path class="ear" d="M 26 38 Q 6 52 14 82 Q 28 84 36 62 Q 32 46 26 38 Z" fill="url(#g-dog-ear)" />
      <path class="ear" d="M 94 38 Q 114 52 106 82 Q 92 84 84 62 Q 88 46 94 38 Z" fill="url(#g-dog-ear)" />
      <circle class="head" cx="60" cy="56" r="37" fill="url(#g-dog-head)" />
      ${sheen(45, 40, 13, 9, 0.16)}
      ${ao(60, 84, 24, 8)}
      ${texture([[36, 44, 44, 50], [80, 46, 88, 52], [40, 90, 34, 96], [80, 90, 86, 96]], '#6e4a26', 0.28)}
      <ellipse cx="60" cy="76" rx="22" ry="16" fill="#e9d3ac" />
      ${eyes(45, 75, 52, 5.4, 5, '#4a3018', mood)}
      <ellipse cx="60" cy="70" rx="5.4" ry="4" fill="#3a2e22" />
      <path id="mouth" d="${mouth}" fill="none" stroke="#6e4a26" stroke-width="2.2" stroke-linecap="round" />
      ${tongue}
      ${feet('#8f6132', 106, 9, 5, 34)}
      ${accessoryFor('dog', stage)}
    `);
  },

  cat(mood, stage) {
    const mouth = MOUTHS.cat[mood];
    return svgWrap('cat', `
      ${shadow()}
      ${stage === 'elder' ? auraStars() : ''}
      <g class="tail">
        <path d="M 82 78 Q 112 76 108 108 Q 104 118 92 110 Q 100 104 96 88 Q 92 80 82 78 Z" fill="url(#g-cat-tail)" />
      </g>
      <path d="M 26 38 L 14 10 L 44 28 Z" fill="url(#g-cat-head)" />
      <path d="M 94 38 L 106 10 L 76 28 Z" fill="url(#g-cat-head)" />
      <path d="M 28 34 L 23 20 L 39 29 Z" fill="#d9c2ac" opacity="0.85" />
      <path d="M 92 34 L 97 20 L 81 29 Z" fill="#d9c2ac" opacity="0.85" />
      <circle class="head" cx="60" cy="58" r="38" fill="url(#g-cat-head)" />
      ${sheen(45, 40, 14, 9, 0.15)}
      ${ao(60, 86, 25, 8)}
      <path d="M 60 40 Q 40 34 30 44" stroke="#5e564a" stroke-width="1.4" fill="none" stroke-linecap="round" opacity="0.5" />
      <path d="M 60 40 Q 80 34 90 44" stroke="#5e564a" stroke-width="1.4" fill="none" stroke-linecap="round" opacity="0.5" />
      ${texture([[38, 46, 46, 52], [74, 46, 82, 52]], '#4a4238', 0.3)}
      <path d="M 60 52 Q 34 56 36 82 Q 60 94 84 82 Q 86 56 60 52 Z" fill="#d9cbb8" opacity="0.85" />
      <g class="whisker">
        <path d="M 16 62 L 40 60" stroke="#c7bba8" stroke-width="1.2" stroke-linecap="round" opacity="0.8" />
        <path d="M 16 70 L 40 68" stroke="#c7bba8" stroke-width="1.2" stroke-linecap="round" opacity="0.8" />
        <path d="M 104 62 L 80 60" stroke="#c7bba8" stroke-width="1.2" stroke-linecap="round" opacity="0.8" />
        <path d="M 104 70 L 80 68" stroke="#c7bba8" stroke-width="1.2" stroke-linecap="round" opacity="0.8" />
      </g>
      ${eyes(45, 75, 55, 6, 5.4, '#7a9450', mood)}
      <path d="M 57 65 L 63 65 L 60 70 Z" fill="#b9836a" opacity="0.85" />
      <path id="mouth" d="${mouth}" fill="none" stroke="#5e4a30" stroke-width="1.8" stroke-linecap="round" />
      ${feet('#6a6155', 106, 9, 5, 32)}
      ${accessoryFor('cat', stage)}
    `);
  },

  owl(mood, stage) {
    const mouth = MOUTHS.owl[mood];
    return svgWrap('owl', `
      ${shadow()}
      ${stage === 'elder' ? auraStars() : ''}
      <g class="wing wingL">
        <ellipse cx="24" cy="72" rx="14" ry="26" fill="url(#g-owl-body)" />
      </g>
      <g class="wing wingR">
        <ellipse cx="96" cy="72" rx="14" ry="26" fill="url(#g-owl-body)" />
      </g>
      <ellipse cx="60" cy="80" rx="34" ry="30" fill="url(#g-owl-body)" />
      ${texture([[38, 78, 34, 90], [50, 84, 47, 96], [70, 84, 73, 96], [82, 78, 86, 90]], '#5f4c34', 0.35)}
      <path class="earTuft" d="M 40 30 L 34 12 L 50 26 Z" fill="url(#g-owl-body)" />
      <path class="earTuft" d="M 80 30 L 86 12 L 70 26 Z" fill="url(#g-owl-body)" />
      <circle class="head" cx="60" cy="52" r="36" fill="url(#g-owl-head)" />
      ${sheen(46, 34, 13, 8, 0.16)}
      ${ao(60, 74, 26, 7)}
      <g class="eyes blink" style="transform-origin: 42px 50px">
        <ellipse class="eyeWhite" cx="42" cy="50" rx="15" ry="15" />
        <circle cx="42" cy="50" r="9" fill="#5a3d20" />
        <circle cx="42" cy="50" r="4.4" fill="#211508" />
        <circle cx="39.4" cy="47.4" r="2" fill="#fff" opacity="0.75" />
      </g>
      <g class="eyes blink" style="transform-origin: 78px 50px">
        <ellipse class="eyeWhite" cx="78" cy="50" rx="15" ry="15" />
        <circle cx="78" cy="50" r="9" fill="#5a3d20" />
        <circle cx="78" cy="50" r="4.4" fill="#211508" />
        <circle cx="75.4" cy="47.4" r="2" fill="#fff" opacity="0.75" />
      </g>
      <path d="M 55 58 L 65 58 L 60 67 Z" fill="#c9944a" />
      <path id="mouth" d="${mouth}" fill="none" stroke="#4a3722" stroke-width="1.8" stroke-linecap="round" />
      ${feet('#c9944a', 108, 8, 4, 28)}
      ${accessoryFor('owl', stage)}
    `);
  }
};

const META = {
  elf: { emoji: '🧝', label: 'Elf' },
  robot: { emoji: '🤖', label: 'Robot' },
  ghost: { emoji: '👻', label: 'Ghost' },
  dog: { emoji: '🐶', label: 'Dog' },
  cat: { emoji: '🐱', label: 'Cat' },
  owl: { emoji: '🦉', label: 'Owl' }
};

window.Characters = {
  list: Object.keys(BUILDERS).map((id) => ({ id, ...META[id] })),
  render(id, moodLabel, stage = 'adult') {
    const builder = BUILDERS[id] || BUILDERS.robot;
    const mood = MOUTHS.robot[moodLabel] ? moodLabel : 'content';
    return builder(mood, stage);
  }
};
