import type { BotFrame } from '../bot/engine.js'
import { DEMI_VIEWBOX } from '../bot/repere.js'

/**
 * Matiere `felt-gl` : la feutrine dessinee par un shader WebGL2, un essai comme
 * `felt.tsx`. Le moteur ne change pas : on rasterise l'image qu'il rend (corps,
 * yeux, encoche) dans un masque 2D, puis deux passes GPU en font un coussin :
 *
 * 1. `dome` : le masque floute en basse resolution sert de carte de hauteur ;
 * 2. `feutre` : normales tirees du dome et des fibres, lumiere enveloppante,
 *    occlusion au bord, poils qui depassent le long de la normale, yeux brodes en
 *    relief, ombre portee.
 *
 * Un seul contexte WebGL pour toute la page (les navigateurs en limitent le
 * nombre) : chaque bot y dessine puis recopie le resultat dans son propre canvas.
 */

const VUE = DEMI_VIEWBOX * 2
/** Cote de la texture du dome. Le dome est tres floute : la basse resolution suffit. */
const DOME = 128
/** Ecart type du dome, en unites du viewBox (le rayon du corps vaut 100). */
const DOME_SIGMA = 34
/** Cote de la tuile de detail attendue par `useDetail`, en texels. */
const TUILE = 192

const VS = `#version 300 es
in vec2 a;
void main() { gl_Position = vec4(a, 0.0, 1.0); }`

/*
 * Flou gaussien separable, une passe par axe. La premiere lit l'alpha du masque a
 * un niveau de mipmap proche de la resolution du dome, la seconde le rouge de la
 * premiere. Un seul passage en spirale laissait des cernes et des bandes : trop
 * peu d'echantillons pour un bord net.
 */
const FS_DOME = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uPas;
uniform float uLod;
uniform bool uMasque;
out vec4 o;
void main() {
  vec2 uv = gl_FragCoord.xy / ${DOME.toFixed(1)};
  float acc = 0.0;
  float poids = 0.0;
  for (int i = -24; i <= 24; i++) {
    float t = float(i) / 8.0;
    float w = exp(-0.5 * t * t);
    vec2 q = uv + uPas * t;
    acc += (uMasque ? textureLod(uSrc, q, uLod).a : texture(uSrc, q).r) * w;
    poids += w;
  }
  o = vec4(acc / poids, 0.0, 0.0, 1.0);
}`

const FS_FEUTRE = `#version 300 es
precision highp float;
uniform sampler2D uMask;
uniform sampler2D uDome;
uniform vec2 uSize;
uniform float uUnit;
uniform vec3 uInk;
uniform vec3 uPaper;
uniform float uAlpha;
uniform mat3 uEyeInv[2];
uniform int uEyes;
uniform sampler2D uDetail;
uniform bool uDetailOn;
out vec4 o;

const float VUE = ${VUE.toFixed(1)};

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

mat2 rot(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c);
}

// fibres frisees : les cretes fines d'un bruit (la ou il croise 0.5) sur un domaine
// tordu dessinent des boucles d'un pixel, comme la laine ; quatre couches tournees
float fibres(vec2 p, float largeur) {
  float f = 0.0;
  float total = 0.0;
  float amp = 1.0;
  for (int i = 0; i < 4; i++) {
    vec2 q = rot(float(i) * 2.39996 + 0.4) * p / (largeur * (2.4 + 0.7 * float(i)));
    q += (vec2(noise(q * 0.3 + float(i) * 5.1), noise(q * 0.3 + float(i) * 5.1 + 11.7)) - 0.5) * 3.0;
    float crete = 1.0 - smoothstep(0.0, 0.16, abs(noise(q + float(i) * 31.7) - 0.5));
    f += crete * amp;
    total += amp;
    amp *= 0.8;
  }
  return f / total;
}

// detail photographique : une tuile de vraie feutrine, lue deux fois a des angles et
// des echelles differents pour casser la repetition. Un texel vaut texel unites
float detail(vec2 p, float texel) {
  float cote = texel * ${TUILE.toFixed(1)};
  float a = texture(uDetail, p / cote).r;
  float b = texture(uDetail, rot(1.13) * p / (cote * 1.37) + 0.31).r;
  return (a + b - 1.0) * 2.2;
}

float dome(vec2 uv) { return texture(uDome, uv).r; }
float m0(vec2 uv) { return texture(uMask, uv).a; }
// le masque lu dans ses mipmaps : un flou de boite gratuit, pour le bourrelet du bord
float flouMasque(vec2 uv, float unites, float px) { return textureLod(uMask, uv, log2(max(1.0, unites / px))).a; }

void main() {
  // uv d'image, y vers le bas comme le SVG ; p en unites du viewBox
  vec2 uv = vec2(gl_FragCoord.x / uSize.x, 1.0 - gl_FragCoord.y / uSize.y);
  vec2 p = (uv - 0.5) * VUE;
  float px = uUnit;
  // une fibre ne descend jamais sous le pixel : sinon elle scintille
  float largeur = max(1.5, 1.15 * px);

  float d = dome(uv);
  float e = VUE / ${DOME.toFixed(1)};
  vec2 du = vec2(e / VUE, 0.0);
  vec2 dv = vec2(0.0, e / VUE);
  vec2 grad = vec2(dome(uv + du) - dome(uv - du), dome(uv + dv) - dome(uv - dv)) / (2.0 * e);
  vec2 dehors = length(grad) > 1e-5 ? -normalize(grad) : vec2(0.0, -1.0);
  vec2 tangente = vec2(-dehors.y, dehors.x);

  // poils : la couverture est lue un peu vers l'interieur, d'une longueur qui varie
  // en stries le long de la normale, donc des meches qui depassent du contour
  // le long du contour : l'angle de la normale (varie sur un arc) plus la projection
  // sur la tangente (varie sur un cote droit). Sur un cercle la seconde est nulle
  float leLong = atan(dehors.y, dehors.x) * 100.0 + dot(p, tangente);
  float meche = noise(vec2(leLong / (0.6 * largeur), dot(p, dehors) / (5.0 * largeur)));
  // un halo de poils fins et translucides plutot que des pointes : longs, adoucis
  float longueur = max(4.5, 2.4 * px);
  float couverture = texture(uMask, uv - dehors * longueur * pow(meche, 1.2) / VUE).a;
  couverture = smoothstep(0.05, 0.95, couverture) * mix(0.8, 1.0, m0(uv));

  vec4 m = texture(uMask, uv);
  // grain centre sur 0 : la tuile si on en a une, sinon les fibres procedurales
  float fib = uDetailOn ? detail(p, max(0.35, 0.55 * px)) : fibres(p, largeur) - 0.33;
  // la tuile photo est deja tres contrastee : la fourrure de reference est douce
  float relief = uDetailOn ? 0.12 : 0.3;

  // normale : le coussin, plus le relief des fibres
  // et un bourrelet : sur une dizaine d'unites le bord s'enroule, ce qui eclaire le
  // haut du pourtour et assombrit le bas. Le dome seul, trop large, laissait plat
  float r = 10.0;
  vec2 du2 = vec2(r * 0.5 / VUE, 0.0);
  vec2 dv2 = vec2(0.0, r * 0.5 / VUE);
  float bord = flouMasque(uv, r, px);
  vec2 gradBord = vec2(
    flouMasque(uv + du2, r, px) - flouMasque(uv - du2, r, px),
    flouMasque(uv + dv2, r, px) - flouMasque(uv - dv2, r, px)
  ) / r;
  vec3 n = normalize(vec3(-grad * 230.0 - gradBord * 24.0, 1.0));
  vec2 fg = vec2(dFdx(fib), -dFdy(fib)) / px;
  n = normalize(n + vec3(-fg * largeur * relief * 1.6, 0.0));

  // lumiere haute, un peu a gauche : le dessus eclaire, le bas dans l'ombre
  vec3 l = normalize(vec3(-0.3, -0.75, 0.6));
  float diffus = clamp((dot(n, l) + 0.25) / 1.25, 0.0, 1.0);
  // l'ombre se tient au pourtour, la ou le coussin s'enroule : le milieu reste plein
  float occlusion = mix(0.7, 1.0, smoothstep(0.1, 0.55, d)) * mix(0.8, 1.0, smoothstep(0.35, 0.95, bord));
  float rasant = pow(1.0 - clamp(n.z, 0.0, 1.0), 3.0)
    * clamp(dot(normalize(n.xy + 1e-5), normalize(l.xy)), 0.0, 1.0);

  // les boucles claires sur un fond plus sombre, et une marbrure lente
  float marbre = noise(p * 0.05) - 0.5;
  vec3 albedo = uInk * (1.0 + relief * fib + 0.08 * marbre);
  // releve sur les avatars de l'app : le haut sort a la couleur de l'encre, le bas
  // vers 0.7 a 0.9 fois, sans virer de teinte (un carre de l'albedo virait l'orange
  // au rouge)
  vec3 col = albedo * mix(0.78, 1.08, diffus) * occlusion;
  // le lustre garde la teinte : du blanc pur desaturait l'orange vers le rose
  col += rasant * 0.3 * mix(albedo, vec3(1.0), 0.2);
  // les poils hors du corps prennent la lumiere par transparence
  col = mix(col, albedo * 1.1, (1.0 - m.a) * 0.6);

  // yeux brodes : fils dans le repere propre de l'oeil, relief tire de leur masque
  vec2 local = vec2(1e4);
  for (int i = 0; i < 2; i++) {
    if (i >= uEyes) break;
    vec2 q = (uEyeInv[i] * vec3(p, 1.0)).xy;
    if (length(q) < length(local)) local = q;
  }
  float fil = 0.5 + 0.5 * sin(local.x * 6.2832 / max(1.4, px * 1.2) + noise(local * 0.6) * 2.0);
  // deux anneaux d'echantillons : le petit pour le bord du fil, le grand pour le bombe
  float bordOeil = 0.0;
  float flouOeil = 0.0;
  for (int i = 0; i < 8; i++) {
    float t = float(i) * 0.785398;
    vec2 dir = vec2(cos(t), sin(t));
    vec4 s1 = texture(uMask, uv + dir * max(1.2, px) / VUE);
    vec4 s2 = texture(uMask, uv + dir * 4.0 / VUE);
    bordOeil += s1.g * s1.a;
    flouOeil += 0.5 * (s1.g * s1.a + s2.g * s2.a);
  }
  bordOeil /= 8.0;
  flouOeil /= 8.0;
  float oeil = m.g * m.a;
  vec2 eg = vec2(dFdx(flouOeil), -dFdy(flouOeil)) / px;
  vec3 nOeil = normalize(vec3(-eg * 9.0, 1.0));
  float diffusOeil = clamp((dot(nOeil, l) + 0.4) / 1.4, 0.0, 1.0);
  // des yeux lisses et cremeux : le fil se devine a peine
  vec3 colOeil = uPaper * (0.8 + 0.25 * diffusOeil) * (0.97 + 0.04 * fil);
  colOeil *= 1.0 - 0.1 * clamp((1.0 - bordOeil) * 2.0, 0.0, 1.0);
  // le corps se creuse autour de l'oeil, et l'oeil fait une ombre en dessous
  col *= 1.0 - 0.3 * clamp(flouOeil * 1.6 - oeil, 0.0, 1.0);
  vec4 dessus = texture(uMask, uv - vec2(0.0, 2.5 * max(1.0, px * 0.6)) / VUE);
  col *= 1.0 - 0.35 * clamp(dessus.g * dessus.a - oeil, 0.0, 1.0);
  col = mix(col, colOeil, m.g);

  // ombre portee : le dome decale vers le haut, donc la tache tombe sous le corps
  float dessous = dome(uv - vec2(0.0, 9.0 / VUE));
  float ombre = smoothstep(0.15, 0.7, dessous) * 0.35;

  // un voile de duvet autour des meches, comme le flou des poils sur les captures
  float voile = flouMasque(uv, 5.0, px) * 0.35;
  float a = max(couverture, voile) * uAlpha;
  o = vec4(col * a, a + ombre * (1.0 - a) * uAlpha);
}`

function compile(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const program = gl.createProgram()!
  for (const [type, source] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]] as const) {
    const shader = gl.createShader(type)!
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'shader')
    gl.attachShader(program, shader)
  }
  gl.bindAttribLocation(program, 0, 'a')
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'link')
  return program
}

function texture(gl: WebGL2RenderingContext): WebGLTexture {
  const tex = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  return tex
}

const rgb = (hex: string) => {
  const v = parseInt(hex.slice(1), 16)
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255] as const
}

/** `matrix(a,b,c,d,e,f)` tel que l'ecrit le moteur. */
const coefficients = (matrix: string) => matrix.slice(7, -1).split(',').map(Number) as [number, number, number, number, number, number]

class FeltGl {
  private readonly gl: WebGL2RenderingContext
  private readonly scene: HTMLCanvasElement
  private readonly masque = document.createElement('canvas')
  private readonly mctx: CanvasRenderingContext2D
  private readonly texMasque: WebGLTexture
  private readonly texDome: WebGLTexture
  private readonly texDemi: WebGLTexture
  private readonly fbo: WebGLFramebuffer
  private readonly fboDemi: WebGLFramebuffer
  private readonly progDome: WebGLProgram
  private readonly progFeutre: WebGLProgram
  private readonly u: Record<string, WebGLUniformLocation | null>
  private texDetail: WebGLTexture | null = null

  constructor(scene: HTMLCanvasElement, gl: WebGL2RenderingContext) {
    this.scene = scene
    this.gl = gl
    this.mctx = this.masque.getContext('2d', { willReadFrequently: false })!
    this.progDome = compile(gl, VS, FS_DOME)
    this.progFeutre = compile(gl, VS, FS_FEUTRE)

    // un triangle qui couvre tout le viewport
    const vbo = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

    this.texMasque = texture(gl)
    // le dome en demi-flottants : sur 8 bits ses pentes sortaient en paliers, des
    // bandes visibles dans la lumiere. Sans l'extension on retombe sur 8 bits.
    const flottant = gl.getExtension('EXT_color_buffer_float') !== null
    const cible = () => {
      const tex = texture(gl)
      if (flottant) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, DOME, DOME, 0, gl.RGBA, gl.HALF_FLOAT, null)
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, DOME, DOME, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
      const fbo = gl.createFramebuffer()!
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      return [tex, fbo] as const
    }
    ;[this.texDemi, this.fboDemi] = cible()
    ;[this.texDome, this.fbo] = cible()
    gl.bindTexture(gl.TEXTURE_2D, this.texMasque)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)

    const names = ['uMask', 'uDome', 'uSize', 'uUnit', 'uInk', 'uPaper', 'uAlpha', 'uEyeInv', 'uEyes', 'uDetail', 'uDetailOn']
    this.u = Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(this.progFeutre, n)]))
  }

  /**
   * Remplace les fibres procedurales par une tuile de feutrine photographiee : du gris
   * centre sur 128, raccordable, de `TUILE` texels de cote. `null` revient au bruit.
   * Les bots fixes ne se redessinent pas d'eux-memes : a poser avant de les monter.
   */
  useDetail(image: TexImageSource | null) {
    const { gl } = this
    if (!image) {
      this.texDetail = null
      return
    }
    const tex = this.texDetail ?? gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.generateMipmap(gl.TEXTURE_2D)
    this.texDetail = tex
  }

  draw(cible: HTMLCanvasElement, frame: BotFrame, ink: string, paper: string) {
    const { gl, mctx, masque } = this
    const w = cible.width
    const h = cible.height
    if (this.scene.width < w) this.scene.width = w
    if (this.scene.height < h) this.scene.height = h
    if (masque.width !== w || masque.height !== h) {
      masque.width = w
      masque.height = h
    }

    // --- masque : alpha = corps, vert = part d'oeil -----------------------
    const s = w / VUE
    mctx.setTransform(1, 0, 0, 1, 0, 0)
    mctx.globalCompositeOperation = 'source-over'
    mctx.clearRect(0, 0, w, h)
    mctx.setTransform(s, 0, 0, s, w / 2, h / 2)
    mctx.fillStyle = '#f00'
    mctx.fill(new Path2D(frame.bodyPath))
    if (frame.notch) {
      mctx.globalCompositeOperation = 'destination-out'
      mctx.beginPath()
      mctx.arc(frame.notch.x, frame.notch.y, frame.notch.r, 0, Math.PI * 2)
      mctx.fill()
    }
    mctx.globalCompositeOperation = 'source-atop'
    const inverses = new Float32Array(18)
    frame.eyes.forEach((eye, i) => {
      const [a, b, c, d, e, f] = coefficients(eye.matrix)
      mctx.save()
      mctx.transform(a, b, c, d, e, f)
      mctx.fillStyle = `rgba(255,255,0,${eye.alpha})`
      mctx.fill(new Path2D(eye.d))
      mctx.restore()
      // inverse de l'affine, en colonnes pour un mat3 GLSL
      const det = a * d - b * c || 1e-6
      const ia = d / det
      const ib = -b / det
      const ic = -c / det
      const id = a / det
      inverses.set([ia, ib, 0, ic, id, 0, -(ia * e + ic * f), -(ib * e + id * f), 1], i * 9)
    })

    gl.bindTexture(gl.TEXTURE_2D, this.texMasque)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, masque)

    gl.generateMipmap(gl.TEXTURE_2D)

    // --- passe 1 : dome, en deux flous separables ---------------------------
    // le shader avance en huitiemes d'ecart type : `uPas` est donc un ecart type en uv
    const pas = DOME_SIGMA / VUE
    gl.useProgram(this.progDome)
    gl.activeTexture(gl.TEXTURE0)
    gl.uniform1i(gl.getUniformLocation(this.progDome, 'uSrc'), 0)
    gl.viewport(0, 0, DOME, DOME)

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboDemi)
    gl.bindTexture(gl.TEXTURE_2D, this.texMasque)
    gl.uniform2f(gl.getUniformLocation(this.progDome, 'uPas'), pas, 0)
    gl.uniform1f(gl.getUniformLocation(this.progDome, 'uLod'), Math.max(0, Math.log2(w / DOME)))
    gl.uniform1i(gl.getUniformLocation(this.progDome, 'uMasque'), 1)
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo)
    gl.bindTexture(gl.TEXTURE_2D, this.texDemi)
    gl.uniform2f(gl.getUniformLocation(this.progDome, 'uPas'), 0, pas)
    gl.uniform1i(gl.getUniformLocation(this.progDome, 'uMasque'), 0)
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    // --- passe 2 : feutre, dans le coin bas-gauche de la scene --------------
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, w, h)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(this.progFeutre)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.texMasque)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.texDome)
    const u = this.u
    gl.uniform1i(u.uMask!, 0)
    gl.uniform1i(u.uDome!, 1)
    gl.uniform2f(u.uSize!, w, h)
    gl.uniform1f(u.uUnit!, VUE / w)
    gl.uniform3fv(u.uInk!, rgb(ink))
    gl.uniform3fv(u.uPaper!, rgb(paper))
    gl.uniform1f(u.uAlpha!, frame.bodyAlpha)
    gl.uniformMatrix3fv(u.uEyeInv!, false, inverses)
    gl.uniform1i(u.uEyes!, frame.eyes.length)
    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, this.texDetail)
    gl.uniform1i(u.uDetail!, 2)
    gl.uniform1i(u.uDetailOn!, this.texDetail ? 1 : 0)
    gl.activeTexture(gl.TEXTURE0)
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    // le coin bas-gauche du tampon GL est en haut a gauche une fois affiche, decale
    const ctx = cible.getContext('2d')!
    ctx.clearRect(0, 0, w, h)
    ctx.drawImage(this.scene, 0, this.scene.height - h, w, h, 0, 0, w, h)
  }
}

let partage: FeltGl | null | undefined

/** Le moteur de rendu partage, ou `null` sans WebGL2 (ou hors navigateur). */
export function feltGl(): FeltGl | null {
  if (partage !== undefined) return partage
  if (typeof document === 'undefined') return (partage = null)
  try {
    const scene = document.createElement('canvas')
    const gl = scene.getContext('webgl2', { premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false })
    partage = gl ? new FeltGl(scene, gl) : null
  } catch (error) {
    console.warn('felt-gl indisponible', error)
    partage = null
  }
  return partage
}
