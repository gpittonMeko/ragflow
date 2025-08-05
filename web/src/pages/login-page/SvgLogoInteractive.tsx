import React, { useRef, useState, useEffect } from 'react';

const VIEWBOX_W = 13500;
const VIEWBOX_H = 10500;

export const SvgLogoInteractive: React.FC<{ flipped?: boolean }> = ({ flipped }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const gradientRef = useRef<SVGLinearGradientElement>(null);
  const [gradientTheme, setGradientTheme] = useState<'soft' | 'vivid' | 'ultra'>('soft');
  const [transition, setTransition] = useState(0); // 0 = soft, 1 = vivid, 2 = ultra

  const SOFT_GRADIENT = [
    "#8EC5FC", "#B0D2FA", "#D8B4F8", "#FFD6E8", "#C8FCEA", "#8EC5FC"
  ];
  const VIVID_GRADIENT = [
    "#7BB6F9", "#A0C8F5", "#CFA1F3", "#FFC8E0", "#B2F7DF", "#7BB6F9"
  ];
  const ULTRA_GRADIENT = [
    "#5CA0F5", "#8CB8F0", "#B07AEF", "#FF9FD0", "#90F5D3", "#5CA0F5"
  ];

  const gradientStops = (palette: string[]) =>
    palette.map((color, i) => ({
      offset: `${(i / (palette.length - 1)) * 100}%`,
      color
    }));

  const SOFT_GRADIENT_STOPS = gradientStops(SOFT_GRADIENT);
  const VIVID_GRADIENT_STOPS = gradientStops(VIVID_GRADIENT);
  const ULTRA_GRADIENT_STOPS = gradientStops(ULTRA_GRADIENT);

  const [gradient, setGradient] = useState({ x1: 50, y1: 30, x2: 60, y2: 90 });

  useEffect(() => {
    let start = Date.now();
    const interval = setInterval(() => {
      const now = Date.now();
      const t = (now - start) / 1000;
      setGradient({
        x1: (50 + 25 * Math.sin(t * 0.25)) % 100,
        y1: (30 + 20 * Math.cos(t * 0.27)) % 100,
        x2: (80 + 18 * Math.sin(t * 0.16)) % 100,
        y2: (60 + 22 * Math.cos(t * 0.22)) % 100
      });
    }, 40);
    return () => clearInterval(interval);
  }, []);

  // transizione fluida tra 3 livelli
  useEffect(() => {
    let anim: any;
    function animate() {
      const target =
        gradientTheme === 'soft' ? 0 :
        gradientTheme === 'vivid' ? 1 : 2;

      setTransition(tran =>
        Math.abs(tran - target) < 0.02
          ? target
          : tran + (target - tran) * 0.12
      );
      anim = requestAnimationFrame(animate);
    }
    animate();
    return () => cancelAnimationFrame(anim);
  }, [gradientTheme]);

  function lerpColor(a: string, b: string, t: number) {
    let A = parseInt(a.substring(1), 16);
    let B = parseInt(b.substring(1), 16);
    let r = ((A >> 16) + ((B >> 16) - (A >> 16)) * t) | 0;
    let g = ((A >> 8 & 0xff) + ((B >> 8 & 0xff) - (A >> 8 & 0xff)) * t) | 0;
    let b2 = ((A & 0xff) + ((B & 0xff) - (A & 0xff)) * t) | 0;
    return `#${(1 << 24 | (r << 16) | (g << 8) | b2).toString(16).slice(1)}`;
  }

  // mix tra soft → vivid → ultra
  const vividMix = Math.min(transition, 1);
  const ultraMix = Math.max(0, transition - 1);

  const currentStops = SOFT_GRADIENT_STOPS.map((s, i) => {
    const vividColor = lerpColor(s.color, VIVID_GRADIENT_STOPS[i].color, vividMix);
    return {
      offset: s.offset,
      color: lerpColor(vividColor, ULTRA_GRADIENT_STOPS[i].color, ultraMix)
    };
  });

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
      width="90%"
      role="img"
      aria-label="Logo SGAI"
      shapeRendering="geometricPrecision"
      style={{
        maxWidth: "min(95vw, 520px)",
        height: 'auto',
        display: 'block',
        margin: "0 auto",
        cursor: 'pointer',
        userSelect: 'none',
        transition: 'box-shadow 0.6s'
      }}
      onMouseEnter={() => setGradientTheme('vivid')}
      onMouseLeave={() => setGradientTheme('soft')}
      onMouseDown={() => setGradientTheme('ultra')}
      onMouseUp={() => setGradientTheme('vivid')}
      onTouchStart={() => setGradientTheme('ultra')}
      onTouchEnd={() => setGradientTheme('soft')}
    >
      <defs>
        <linearGradient
          id="gradient-hover"
          ref={gradientRef}
          gradientUnits="userSpaceOnUse"
          x1={gradient.x1 * VIEWBOX_W / 100}
          y1={gradient.y1 * VIEWBOX_H / 100}
          x2={gradient.x2 * VIEWBOX_W / 100}
          y2={gradient.y2 * VIEWBOX_H / 100}
        >
          {currentStops.map(s => (
            <stop key={s.offset} offset={s.offset} stopColor={s.color} />
          ))}
        </linearGradient>
      </defs>
      <filter id="logo-glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation={transition >= 2 ? 140 : transition >= 1 ? 90 : 50} result="glow" />
        <feMerge>
          <feMergeNode in="glow" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <g
        fill="url(#gradient-hover)"
        filter="url(#logo-glow)"
        transform={`scale(1.15,-1.15) translate(-1700,-${VIEWBOX_H}) translate(0,-600)`}
        vectorEffect="non-scaling-stroke"
      >
    <path d="M2900 8409 c-117 -8 -234 -25 -260 -39 -10 -5 -28 -10 -39 -10 -11 0
        -37 -7 -58 -16 -37 -16 -55 -24 -138 -60 -164 -72 -346 -246 -419 -399 -10
        -22 -24 -49 -29 -60 -6 -11 -14 -36 -18 -55 -4 -19 -12 -53 -18 -75 -14 -52
        -14 -298 0 -350 6 -22 14 -56 18 -75 29 -130 164 -301 306 -387 77 -46 244
        -119 320 -140 11 -3 34 -11 52 -19 17 -8 41 -14 52 -14 12 0 29 -4 39 -9 21
        -12 114 -41 162 -51 19 -5 49 -13 65 -18 17 -6 53 -17 80 -25 202 -59 180 -51
        285 -101 89 -42 142 -83 178 -140 25 -38 27 -49 27 -146 0 -90 -3 -112 -23
        -153 -55 -110 -170 -179 -356 -212 -100 -18 -138 -17 -296 6 -162 23 -320 80
        -445 160 -16 10 -37 22 -45 26 -8 3 -31 19 -51 35 -20 15 -40 28 -44 28 -4 0
        -24 14 -45 30 -21 17 -44 30 -52 30 -15 0 -40 -25 -148 -150 -36 -42 -82 -93
        -102 -115 -56 -61 -78 -92 -78 -108 0 -17 105 -104 206 -170 77 -50 233 -134
        274 -147 14 -5 50 -18 80 -30 55 -22 79 -29 175 -50 28 -6 64 -16 82 -21 95
        -29 492 -35 608 -9 22 5 62 14 89 20 257 54 501 217 623 415 26 41 76 151 85
        185 5 19 14 53 20 75 18 69 14 342 -6 410 -44 148 -83 214 -185 313 -57 55
        -175 135 -251 169 -59 27 -119 50 -175 67 -33 11 -74 25 -92 33 -17 7 -37 13
        -44 13 -7 0 -31 6 -54 14 -22 8 -67 22 -100 31 -33 10 -78 24 -100 30 -22 7
        -67 21 -100 30 -33 10 -69 22 -80 26 -11 5 -42 16 -70 25 -86 27 -196 87 -240
        130 -61 59 -85 119 -85 215 0 43 4 80 9 84 5 3 12 18 16 34 7 34 89 119 137
        142 142 70 283 87 488 60 191 -24 332 -88 534 -240 l59 -44 46 49 c26 27 90
        99 143 159 52 61 109 126 127 145 17 19 31 40 31 47 0 6 -21 29 -47 50 -27 21
        -50 40 -53 43 -34 38 -327 200 -360 200 -9 0 -20 4 -26 9 -5 4 -43 18 -84 31
        -41 12 -85 26 -97 31 -12 4 -46 11 -75 14 -29 3 -71 10 -93 15 -53 12 -217 16
        -335 9z"/>
        <path d="M5720 8400 c-14 -5 -54 -13 -90 -19 -73 -10 -145 -27 -175 -40 -11
        -5 -42 -17 -70 -26 -71 -25 -188 -81 -264 -128 -59 -36 -92 -59 -186 -130
        -115 -87 -284 -295 -363 -447 -65 -127 -126 -296 -143 -398 -6 -32 -14 -79
        -19 -107 -11 -65 -11 -445 0 -510 5 -27 14 -79 20 -115 6 -35 15 -69 20 -74 6
        -6 10 -21 10 -35 0 -15 7 -39 15 -55 8 -15 15 -33 15 -38 0 -5 14 -39 30 -75
        17 -35 30 -66 30 -68 0 -12 96 -164 137 -217 62 -82 199 -217 259 -259 27 -18
        51 -36 54 -39 8 -10 170 -104 212 -123 21 -10 55 -25 75 -34 21 -9 46 -20 55
        -24 19 -9 65 -22 143 -39 28 -6 64 -16 80 -21 90 -29 479 -35 605 -8 25 5 72
        14 105 20 33 6 64 15 70 20 5 5 20 9 35 9 14 0 37 6 52 14 15 8 40 17 57 21
        17 4 33 11 36 16 4 5 13 9 21 9 18 0 125 50 239 113 96 52 305 205 330 240 13
        18 15 101 15 593 0 315 -3 579 -6 588 -6 14 -67 16 -594 16 -426 0 -591 -3
        -596 -11 -10 -16 -12 -432 -2 -458 8 -22 9 -22 313 -20 169 0 309 -2 313 -6
        11 -10 11 -427 0 -448 -18 -35 -185 -125 -318 -170 -136 -46 -162 -50 -340
        -51 -174 0 -176 0 -270 33 -142 51 -229 107 -340 221 -132 134 -225 309 -272
        515 -6 28 -13 124 -15 215 -4 169 4 239 43 365 109 347 385 594 724 645 153
        23 353 2 465 -50 11 -5 42 -18 68 -30 68 -30 138 -73 232 -144 44 -33 82 -62
        85 -65 3 -3 15 -14 26 -24 22 -18 22 -18 90 70 38 48 74 94 81 101 7 7 13 17
        13 20 0 4 10 18 23 32 41 45 147 189 147 199 0 16 -25 39 -116 107 -121 92
        -354 224 -394 224 -9 0 -20 4 -26 8 -8 7 -96 36 -194 63 -108 30 -489 50 -550
        29z"/>
        <path d="M8624 8339 c-8 -8 -14 -25 -14 -36 0 -11 -7 -26 -15 -33 -8 -7 -15
        -19 -15 -27 0 -8 -6 -27 -13 -41 -14 -26 -36 -77 -62 -137 -7 -16 -24 -55 -38
        -85 -13 -30 -44 -100 -67 -154 -23 -54 -45 -106 -49 -115 -5 -9 -15 -33 -24
        -54 -9 -20 -23 -52 -31 -70 -8 -17 -21 -48 -30 -67 -18 -43 -60 -138 -92 -207
        -13 -28 -24 -55 -24 -58 0 -3 -11 -30 -24 -58 -13 -29 -34 -74 -46 -102 -11
        -27 -25 -59 -30 -70 -34 -77 -64 -144 -105 -240 -26 -60 -55 -128 -65 -150
        -22 -49 -42 -95 -70 -160 -26 -61 -30 -70 -74 -168 -20 -42 -36 -79 -36 -82 0
        -2 -14 -34 -31 -72 -40 -90 -44 -100 -69 -158 -12 -27 -25 -59 -30 -70 -5 -11
        -18 -42 -30 -70 -12 -27 -27 -63 -35 -80 -7 -16 -21 -48 -30 -70 -9 -22 -23
        -53 -30 -70 -8 -16 -26 -57 -40 -90 -15 -33 -33 -73 -41 -90 -25 -50 -4 -57
        161 -51 77 3 172 5 210 5 l70 1 112 83 c62 45 155 109 208 142 53 33 126 79
        163 103 37 24 182 113 324 198 298 179 299 179 405 116 66 -39 290 -177 329
        -202 12 -8 67 -42 121 -74 94 -58 217 -137 238 -153 6 -5 28 -20 50 -33 22
        -13 49 -32 59 -42 11 -10 38 -30 60 -45 23 -16 52 -38 66 -51 42 -38 83 -43
        305 -40 l210 3 -2 26 c-1 14 -16 57 -34 95 -34 73 -48 105 -74 169 -9 22 -24
        56 -32 75 -9 19 -22 49 -29 65 -6 17 -20 48 -30 70 -18 42 -31 73 -59 140 -9
        22 -24 56 -32 75 -9 19 -22 49 -29 65 -6 17 -20 48 -30 70 -22 51 -44 102 -60
        140 -17 43 -38 91 -72 165 -16 36 -37 83 -47 105 -23 56 -46 105 -62 137 -7
        14 -13 33 -13 41 0 8 -7 20 -15 27 -8 7 -15 21 -15 30 0 10 -6 31 -14 47 -8
        15 -21 44 -29 63 -19 45 -39 89 -76 173 -17 37 -31 71 -31 76 0 5 -6 22 -14
        38 -42 82 -76 160 -76 174 0 9 -7 22 -15 29 -8 7 -15 23 -15 35 0 12 -7 28
        -15 35 -8 7 -15 18 -15 25 0 8 -7 27 -15 44 -8 17 -22 45 -30 62 -8 17 -15 39
        -15 49 0 9 -7 23 -15 30 -8 7 -15 18 -15 25 0 8 -7 27 -15 44 -8 17 -22 45
        -30 62 -8 17 -15 39 -15 49 0 9 -7 23 -15 30 -8 7 -15 19 -15 27 0 8 -7 28
        -15 44 -8 16 -22 42 -30 58 -8 16 -15 36 -15 44 0 8 -7 20 -15 27 -8 7 -15 23
        -15 36 0 12 -4 26 -10 29 -5 3 -14 24 -20 45 -6 22 -16 40 -23 40 -7 0 -135 1
        -285 3 -239 2 -275 0 -288 -14z m316 -788 c0 -9 4 -21 8 -26 4 -6 18 -37 31
        -70 12 -33 27 -69 31 -80 5 -11 19 -45 31 -75 11 -30 27 -68 34 -85 37 -83 45
        -104 45 -113 0 -6 6 -23 14 -39 8 -15 19 -39 25 -53 5 -14 19 -46 30 -72 12
        -26 21 -51 21 -57 0 -5 6 -22 14 -38 23 -45 46 -100 46 -111 0 -6 6 -23 14
        -39 8 -15 19 -39 25 -53 5 -14 19 -46 30 -72 12 -26 21 -51 21 -57 0 -5 6 -22
        14 -38 8 -15 22 -46 31 -68 9 -22 23 -53 32 -68 13 -26 14 -31 1 -44 -13 -13
        -17 -13 -31 1 -8 9 -19 16 -22 16 -4 0 -44 22 -89 49 -44 27 -106 62 -136 79
        -30 16 -84 46 -120 66 -36 20 -77 41 -92 47 -16 6 -28 15 -28 20 0 12 -43 12
        -56 0 -5 -5 -34 -22 -64 -39 -109 -58 -237 -130 -301 -170 -36 -22 -81 -48
        -99 -57 l-33 -17 7 29 c4 15 14 42 21 58 8 17 23 55 35 85 11 30 25 64 30 75
        5 11 18 43 30 70 12 28 25 59 30 70 5 11 18 43 30 70 11 28 25 58 30 67 6 10
        10 23 10 29 0 10 14 45 45 114 12 27 32 73 67 155 5 14 16 39 23 55 7 17 29
        71 49 120 21 50 42 101 48 115 5 14 16 39 22 55 20 48 49 109 59 123 12 16 37
        -3 37 -27z"/>
        <path d="M10922 6883 l3 -1468 287 -2 288 -3 6 27 c4 15 4 333 1 707 -4 375
        -7 1024 -7 1444 l0 762 -290 0 -290 0 2 -1467z"/>

        </g>
    </svg>
  );
};