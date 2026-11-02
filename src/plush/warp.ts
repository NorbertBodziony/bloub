/*
 * La deformation du feutre : la photo du corps suit le contour du moteur pendant un
 * changement de forme. Un quad plein, un fragment shader en polaire : pour un pixel a
 * (rho, theta), l'image A est lue a rho * rA(theta) / r(theta), l'image B a
 * rho * rB(theta) / r(theta), puis les deux sont melangees. Le duvet et l'ombre hors du
 * contour suivent la meme echelle radiale.
 *
 * Les rayons sont ceux du moteur (64 echantillons, `PROFILE_SAMPLES`), interpoles en
 * angle comme `radiusAtAngle`. Rien n'est dessine hors d'un morph : au repos, la peluche
 * remet l'`<image>` simple. Le canvas, et donc le contexte WebGL, n'existe que le temps
 * d'une transition : un navigateur n'en garde qu'une quinzaine en vie, une liste de
 * peluches qui en tiendrait chacune un perdrait les plus anciens.
 */
import { PROFILE_SAMPLES } from '../bot/profiles.js'
import { DEMI_VIEWBOX } from '../bot/repere.js'

const VERT = `#version 300 es
in vec2 p;
out vec2 v;
void main() {
  v = p;
  gl_Position = vec4(p, 0.0, 1.0);
}`

const FRAG = `#version 300 es
precision highp float;
#define N ${PROFILE_SAMPLES}
in vec2 v;
out vec4 couleur;
uniform sampler2D ta;
uniform sampler2D tb;
uniform float ra[N];
uniform float rb[N];
uniform float rc[N];
uniform float melange;
const float TAU = 6.283185307179586;

// comme radiusAtAngle : interpolation lineaire entre deux echantillons voisins
float rayon(float r[N], float t) {
  int i = int(floor(t));
  float f = t - floor(t);
  return mix(r[i % N], r[(i + 1) % N], f);
}

void main() {
  // repere du viewBox : y vers le bas, comme le moteur
  vec2 q = vec2(v.x, -v.y);
  float ang = atan(q.y, q.x);
  float t = fract(ang / TAU) * float(N);
  float r = rayon(rc, t);
  vec2 qa = q * rayon(ra, t) / r;
  vec2 qb = q * rayon(rb, t) / r;
  // l'image couvre le viewBox ; sa premiere ligne est le haut
  vec4 a = texture(ta, (qa + 1.0) * 0.5);
  vec4 b = texture(tb, (qb + 1.0) * 0.5);
  couleur = mix(a, b, melange);
}`

function charge(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`warp: image introuvable ${url}`))
    img.src = url
  })
}

export interface Warp {
  /** charge les deux corps ; la promesse se resout quand ils sont prets */
  corps(avant: string, apres: string): Promise<void>
  dessine(ra: readonly number[], rb: readonly number[], rc: readonly number[], melange: number): void
  detruit(): void
}

/** `null` sans WebGL 2 : la peluche retombe alors sur `cut`. */
export function creeWarp(canvas: HTMLCanvasElement): Warp | null {
  const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true })
  if (!gl) return null

  const shader = (type: number, src: string) => {
    const s = gl.createShader(type)!
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader')
    return s
  }
  const prog = gl.createProgram()!
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT))
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG))
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'programme')
  gl.useProgram(prog)

  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  const loc = gl.getAttribLocation(prog, 'p')
  gl.enableVertexAttribArray(loc)
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

  const texture = (unite: number, nom: string) => {
    const t = gl.createTexture()!
    gl.activeTexture(gl.TEXTURE0 + unite)
    gl.bindTexture(gl.TEXTURE_2D, t)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    // hors de l'image : transparent, pas la derniere ligne etiree
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.uniform1i(gl.getUniformLocation(prog, nom), unite)
    return t
  }
  const ta = texture(0, 'ta')
  const tb = texture(1, 'tb')
  const u = {
    ra: gl.getUniformLocation(prog, 'ra'),
    rb: gl.getUniformLocation(prog, 'rb'),
    rc: gl.getUniformLocation(prog, 'rc'),
    melange: gl.getUniformLocation(prog, 'melange')
  }

  const pose = (unite: number, tex: WebGLTexture, img: HTMLImageElement) => {
    gl.activeTexture(gl.TEXTURE0 + unite)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
  }

  let jeton = 0
  return {
    async corps(avant, apres) {
      const n = ++jeton
      const [a, b] = await Promise.all([charge(avant), charge(apres)])
      if (n !== jeton) return
      pose(0, ta, a)
      pose(1, tb, b)
    },
    dessine(ra, rb, rc, melange) {
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.uniform1fv(u.ra, ra as number[])
      gl.uniform1fv(u.rb, rb as number[])
      gl.uniform1fv(u.rc, rc as number[])
      gl.uniform1f(u.melange, melange)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    },
    detruit() {
      jeton++
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  }
}

/** le canvas couvre le viewBox du bot : `DEMI_VIEWBOX` de chaque cote du centre */
export const COTE_VIEWBOX = DEMI_VIEWBOX * 2
