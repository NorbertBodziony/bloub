import { arcRender, type ArcRender, type DotRender } from './decor.js'
import { blendExpression, type BotExpression } from './expressions.js'
import { decalageDesYeux } from './eyefit.js'
import { blinkScale, eyePoses, liveliness } from './face.js'
import { clamp, easings, lerp, r2 } from './math.js'
import {
  blend,
  capsulePath,
  closedPath,
  radiusAtAngle,
  toPoints,
  type Point,
  type Silhouette
} from './shape.js'
import { STATE_BY_ID, type Pose, type StateDef, type StateId } from './states.js'

export interface RenderedEye {
  d: string
  matrix: string
  alpha: number
  /** taille de la gelule dans son repere (avant `matrix`), en px : ce que `d` dessine */
  w: number
  h: number
  /**
   * l'ecrasement vertical du clignement deja compose dans `matrix` (`blinkScale`), 1 oeil
   * ouvert : un rendu qui dessine l'oeil autrement qu'un trou peut le retirer de la matrice
   */
  open: number
  /**
   * le meme ecrasement hors clignement : celui de l'expression au repos (`EyeCfg.open`,
   * `somnolent`). `open` lui est egal sauf pendant un clignement, ou il descend en dessous
   */
  rest: number
  /**
   * l'inclinaison propre de l'oeil (`EyeCfg.tilt`, degres), deja composee dans `matrix` : un rendu
   * dont le dessin porte deja sa pente (les yeux-sprites de la peluche) la retire
   */
  tilt: number
}

export interface BotFrame {
  bodyPath: string
  bodyAlpha: number
  eyes: RenderedEye[]
  dots: DotRender[]
  /** true = les points passent derriere le corps (particules de l'eclatement) */
  dotsBehind: boolean
  arcs: ArcRender[]
  notif: { x: number; y: number; r: number } | null
  notch: { x: number; y: number; r: number } | null
}

/**
 * Ou le bot porte son regard quand quelque chose d'exterieur le pilote — le
 * pointeur de la souris, aujourd'hui.
 *
 * `yaw` et `pitch` sont des directions ABSOLUES, qui remplacent celles de la pose
 * a mesure que `mix` monte. Deux raisons, chacune un piege deja tombe :
 *
 * - c'est le MOTEUR qui doit faire ce melange, pas l'appelant, parce que lui seul
 *   connait la pose A CET INSTANT. Un appelant qui compenserait l'orientation de
 *   l'expression lirait sa valeur d'arrivee pendant que le morph est encore en
 *   cours, et les yeux sautaient a chaque changement d'humeur ;
 * - et il faut que ce soit absolu sur les DEUX axes. En relatif, la hauteur des
 *   yeux suivait celle de chaque expression — « neutre » regarde a +28,6deg quand
 *   les autres sont entre -9 et +9 — donc les yeux tombaient d'un coup au premier
 *   changement d'humeur. Ce qui fait le caractere d'une expression pendant le
 *   suivi, c'est la FORME de ses yeux (plisses, ronds, dissymetriques), pas
 *   l'endroit ou elle regarde : celui-la, c'est le curseur qui le decide.
 *
 * `mix` dit a quel point l'exterieur commande la DIRECTION (0 = pas du tout).
 *
 * `wander` dit, separement, ce qui reste de derive automatique. Les deux ne se
 * confondent pas : quand le pointeur bouge, la derive doit s'eteindre — cumulees,
 * le bot aurait l'air de chercher le curseur sans jamais le tenir. Mais quand il
 * n'y a PAS de pointeur (arrivee au clavier, au tactile, ou souris sortie de la
 * fenetre), la tete doit rester tournee ET continuer de vivre. Les confondre
 * figeait le regard des que la vue s'ouvrait.
 *
 * `spin` est un tour a parcourir EN CHEMIN, en degres, qu'on fait fondre vers 0
 * avec l'arrivee. Comme les yeux vivent sur une sphere, un tour les fait passer
 * derriere la boule et revenir de l'autre cote — et `-360deg` etant le meme
 * angle que `0`, il ne change rien a l'endroit ou ils se posent.
 *
 * `blink` dit ce qui reste des clignements (1 par defaut, 0 = aucun). Comme `wander`,
 * c'est de la vie automatique qu'on module : un oeil deja ferme en tiret (la peluche
 * endormie) qui clignerait encore s'amincirait d'un coup, a chaque clignement.
 */
export interface Look {
  yaw: number
  pitch: number
  mix: number
  spin: number
  wander: number
  blink?: number
}

/** le clignement que declenche un changement d'etat (`blinkIn`) */
const FORCED_BLINK = 0.2

const NO_LOOK: Look = { yaw: 0, pitch: 0, mix: 0, spin: 0, wander: 1 }

const lerpLook = (a: Look, b: Look, t: number): Look => ({
  yaw: lerp(a.yaw, b.yaw, t),
  pitch: lerp(a.pitch, b.pitch, t),
  mix: lerp(a.mix, b.mix, t),
  spin: lerp(a.spin, b.spin, t),
  wander: lerp(a.wander, b.wander, t),
  // absent = 1 : un regard sans `blink` reste celui d'avant, a l'octet pres
  ...(a.blink === undefined && b.blink === undefined ? {} : { blink: lerp(a.blink ?? 1, b.blink ?? 1, t) })
})

const lerpEye = (a: Pose['eyes'][number], b: Pose['eyes'][number], t: number) => ({
  w: lerp(a.w, b.w, t),
  h: lerp(a.h, b.h, t),
  open: lerp(a.open, b.open, t),
  tilt: lerp(a.tilt ?? 0, b.tilt ?? 0, t)
})

/** Interpolation de deux poses. Le decor se croise en opacite, pas en geometrie. */
function blendPose(a: Pose, b: Pose, t: number): Pose {
  const out = 1 - t
  return {
    sil: blend(a.sil, b.sil, t),
    offX: lerp(a.offX, b.offX, t),
    offY: lerp(a.offY, b.offY, t),
    gaze: {
      yaw: lerp(a.gaze.yaw, b.gaze.yaw, t),
      pitch: lerp(a.gaze.pitch, b.gaze.pitch, t),
      roll: lerp(a.gaze.roll, b.gaze.roll, t)
    },
    split: lerp(a.split, b.split, t),
    eyes: [lerpEye(a.eyes[0], b.eyes[0], t), lerpEye(a.eyes[1], b.eyes[1], t)],
    eyeAlpha: lerp(a.eyeAlpha, b.eyeAlpha, t),
    bodyAlpha: lerp(a.bodyAlpha, b.bodyAlpha, t),
    dots: [
      ...a.dots.map((d) => ({ ...d, opacity: d.opacity * out })),
      ...b.dots.map((d) => ({ ...d, opacity: d.opacity * t }))
    ],
    arcs: [
      ...a.arcs.map((r) => ({ ...r, id: `a${r.id}`, opacity: r.opacity * out })),
      ...b.arcs.map((r) => ({ ...r, id: `b${r.id}`, opacity: r.opacity * t }))
    ],
    // la pastille appartient a un seul des deux etats, elle ne se melange pas
    notif: t < 0.5 ? a.notif : b.notif,
    dotsBehind: t < 0.5 ? a.dotsBehind : b.dotsBehind
  }
}

/**
 * Moteur sans horloge : `sample(t)` est une fonction pure du temps.
 *
 * Consequence pratique : pause, reprise, ralenti et saut a une date arbitraire
 * donnent exactement la meme image, et le rendu est testable sans DOM.
 */
export class BotEngine {
  /** rayon de la boule au repos, en unites de viewBox */
  readonly scale: number

  private cur: StateId
  private prev: StateId | null = null
  /**
   * Pose de depart FIGEE, posee seulement quand un changement d'etat arrive alors qu'un
   * fondu est deja en cours. Cf. `setState`.
   */
  private departFige: Pose | null = null
  /**
   * Meme chose pour le decalage des yeux (`eyefit.ts`), qui se fond a cote de la pose et
   * avait le meme defaut : en plein fondu, il repartait du decalage PLEIN de l'etat quitte.
   * Mesure sur capsule, `notify -> idle -> notify` a 50 ms : 7,3 px de saut sur les deux
   * yeux, contre 5,3 px pour le plus raide des changements espaces.
   */
  private decalageFige: { x: number; y: number } | null = null
  private tCur = 0
  private tPrev = 0
  /**
   * Avance de la POSE de l'etat courant (et de l'etat quitte) sur son horloge : la pose se
   * lit a `now - tCur + posePhase`, le fondu reste date sur `tCur`. Cf. `setState`.
   */
  private posePhase = 0
  private previousPosePhase = 0
  private blinkAt = -10
  private pts: Point[] = []
  private shape: number[] | null = null
  private shapePrev: number[] | null = null
  private shapeAt = -10
  private expr: BotExpression | null = null
  private exprPrev: BotExpression | null = null
  private exprAt = -10
  /**
   * Depart du decalage des yeux quand une expression arrive en plein morph : les ids lus
   * dans la table et leur poids a l'instant du changement. `null` hors de ce cas, et le
   * depart est alors simplement `exprPrev`. Cf. `setExpression`.
   */
  private exprDepart: { id: string | null; poids: number }[] | null = null
  private look: Look = NO_LOOK
  private lookPrev: Look = NO_LOOK
  private lookAt = -10
  /** duree de rattrapage en cours ; voir `LOOK_MORPH`, sa valeur par defaut */
  private lookMorph = 0.24

  /** duree du morph quand on change la forme du corps */
  static readonly SHAPE_MORPH = 0.45

  /**
   * Duree de rattrapage du regard vers la cible. Plus court que `SHAPE_MORPH` :
   * un regard qui suit doit paraitre attentif, pas visqueux. Comme la cible est
   * reposee a chaque mouvement de souris, c'est cette duree qui donne au suivi
   * son inertie — le regard n'atteint jamais tout a fait un curseur qui bouge.
   */
  static readonly LOOK_MORPH = 0.24

  constructor(
    scale = 100,
    initial: StateId = 'idle',
    shape: number[] | null = null,
    expression: BotExpression | null = null
  ) {
    this.scale = scale
    this.cur = initial
    this.shape = shape
    this.expr = expression
  }

  /**
   * Expression de repos choisie dans le personnalisateur. Comme la forme, elle
   * glisse vers la nouvelle valeur au lieu de sauter.
   */
  setExpression(expression: BotExpression | null, now = 0) {
    if (expression === this.expr) return
    /*
     * Meme defaut, meme remede que `setState` : avec une seule case d'historique, une
     * expression qui arrivait en plein morph repartait de la CIBLE precedente au lieu du
     * visage a l'ecran. Mesure sur `neutre -> heureux -> triste` a 80 ms : 18 a 20 px de
     * saut des yeux, contre 0,1 px d'une image normale.
     *
     * On fige donc le visage melange, et le decalage des yeux le suit sans jamais lire la
     * table sur une valeur interpolee : on garde les ids des BORNES et leur poids a cet
     * instant (`exprDepart`). Hors morph rien n'est fige, et le rendu est celui d'avant, au
     * bit pres.
     */
    const k = (now - this.exprAt) / BotEngine.SHAPE_MORPH
    if (this.expr && this.exprPrev && k >= 0 && k < 1) {
      const t = easings.easeOutQuint(clamp(k))
      const depart = this.exprDepart ?? [{ id: this.exprPrev.id, poids: 1 }]
      this.exprDepart = [
        ...depart.map(({ id, poids }) => ({ id, poids: poids * (1 - t) })).filter(({ poids }) => poids > 1e-9),
        { id: this.expr.id, poids: t }
      ]
      this.exprPrev = blendExpression(this.exprPrev, this.expr, t)
    } else {
      this.exprDepart = null
      this.exprPrev = this.expr
    }
    this.expr = expression
    this.exprAt = now
  }

  /** Expression effective a l'instant `now`, morph en cours compris. */
  private exprAtTime(now: number): BotExpression | null {
    const to = this.expr
    const from = this.exprPrev
    if (!to || !from) return to
    const k = (now - this.exprAt) / BotEngine.SHAPE_MORPH
    if (k >= 1) return to
    return blendExpression(from, to, easings.easeOutQuint(clamp(k)))
  }

  /**
   * Forme choisie dans le personnalisateur. Elle ne remplace le corps que sur
   * les etats au repos (`baseBody`) : sur les autres, la silhouette EST
   * l'animation et ne doit pas etre ecrasee.
   *
   * Le changement se fait en morph, pas d'un coup : comme toutes les formes sont
   * echantillonnees aux memes angles, il suffit d'interpoler les rayons.
   */
  setShape(radii: number[] | null, now = 0) {
    if (radii === this.shape) return
    this.shapePrev = this.shape
    this.shape = radii
    this.shapeAt = now
  }

  /**
   * Forme effective a l'instant `now`, morph en cours compris.
   *
   * Ne remet PAS `shapePrev` a null en fin de morph : `sample` doit rester une
   * fonction pure du temps, donc relire une date passee doit redonner l'image
   * intermediaire. On garde juste une reference de plus.
   */
  private shapeAtTime(now: number): number[] | null {
    const to = this.shape
    const from = this.shapePrev
    if (!to || !from) return to
    const k = (now - this.shapeAt) / BotEngine.SHAPE_MORPH
    if (k >= 1) return to
    const t = easings.easeOutQuint(clamp(k))
    // alloue seulement pendant le morph ; hors morph on rend le tableau tel quel
    return to.map((r, i) => lerp(from[i] ?? r, r, t))
  }

  /**
   * Nouvelle cible de regard, `null` pour revenir a celui de l'etat.
   *
   * Elle repart de la valeur COURANTE, et non de la cible precedente comme
   * `setShape` : cette methode est appelee a chaque mouvement de pointeur, et
   * repartir de l'ancienne cible ferait reculer le regard d'un cran avant
   * chaque rattrapage — le suivi tremblerait au lieu de glisser.
   *
   * Meme contrat que `setShape` par ailleurs : l'etat externe entre par un
   * setter horodate, jamais par une variable lue pendant `sample`, sinon le
   * moteur cesse d'etre une fonction pure du temps.
   */
  setLook(look: Look | null, now: number, morph = BotEngine.LOOK_MORPH) {
    /*
     * Une cible non finie est refusee. Le moteur GARDE la derniere : un `NaN`
     * pose une seule fois se propagerait a chaque image et le bot ne se
     * reposerait plus jamais. C'est arrive pour de vrai — un
     * `getBoundingClientRect` sur une boite de taille nulle donne `0 / 0` chez
     * l'appelant. Celui-la est corrige, mais le moteur n'a pas a dependre de la
     * prudence de ses appelants pour rester rejouable.
     */
    if (look && !Number.isFinite(look.yaw + look.pitch + look.mix + look.spin + look.wander + (look.blink ?? 1))) {
      return
    }
    this.lookPrev = this.lookAtTime(now)
    this.look = look ?? NO_LOOK
    this.lookAt = now
    this.lookMorph = morph
  }

  /** Regard effectif a l'instant `now`, rattrapage en cours compris. */
  private lookAtTime(now: number): Look {
    const k = (now - this.lookAt) / this.lookMorph
    if (k >= 1) return this.look
    return lerpLook(this.lookPrev, this.look, easings.easeOutQuint(clamp(k)))
  }

  private posed(
    def: StateDef,
    t: number,
    shape: number[] | null,
    expr: BotExpression | null
  ): Pose {
    let pose = def.pose(t)
    if (def.baseBody && shape) {
      // on garde la pose (rotation, decalage, squash) et on n'echange que le profil
      pose = { ...pose, sil: { ...pose.sil, radii: shape } }
    }
    if (def.baseFace && expr) {
      pose = { ...pose, gaze: expr.gaze, split: expr.split, eyes: expr.eyes }
    }
    return pose
  }

  /**
   * Decalage des yeux a l'instant `now` pour un etat donne, en unites de rayon de boule.
   *
   * Il est LU dans une table et interpole, jamais recalcule : `eyefit.ts` explique
   * pourquoi cette distinction est tout le correctif. Ici il ne reste qu'a l'interpoler
   * sur l'axe de la forme, avec exactement la courbe et la duree du morph de silhouette
   * — c'est la meme cause, donc ce doit etre le meme mouvement.
   *
   * On interroge la table sur les BORNES du morph (`shapePrev` et `shape`) et non sur le
   * profil que rend `shapeAtTime` : celui-la est un tableau neuf alloue a chaque image,
   * donc sans identite, et il n'existe dans aucune table.
   */
  private decalageAtTime(now: number, state: StateId): { x: number; y: number } {
    /**
     * Un axe de morph : on lit la table sur ses deux BORNES et on interpole avec sa
     * courbe. Jamais sur la valeur interpolee — celle-la n'a pas d'identite et n'existe
     * dans aucune table, et c'est en la lui donnant a manger que les versions
     * precedentes tremblaient.
     */
    const surAxe = (
      debut: number,
      duree: number,
      a: { x: number; y: number },
      b: { x: number; y: number }
    ) => {
      if (a === b) return b
      const k = (now - debut) / duree
      if (k >= 1) return b
      const t = easings.easeOutQuint(clamp(k))
      return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) }
    }

    // le depart de l'axe de l'expression : la borne quittee, ou les bornes figees en plein morph
    const depart = (radii: number[] | null) => {
      if (!this.exprDepart) return decalageDesYeux(radii, state, this.exprPrev?.id ?? null)
      let x = 0
      let y = 0
      for (const { id, poids } of this.exprDepart) {
        const d = decalageDesYeux(radii, state, id)
        x += d.x * poids
        y += d.y * poids
      }
      return { x, y }
    }

    // axe de l'expression, pour chacune des deux formes en presence
    const parForme = (radii: number[] | null) => {
      const arrivee = decalageDesYeux(radii, state, this.expr?.id ?? null)
      // morph fini : l'arrivee, sans calculer un depart qui ne compte plus
      if (now - this.exprAt >= BotEngine.SHAPE_MORPH) return arrivee
      return surAxe(this.exprAt, BotEngine.SHAPE_MORPH, depart(radii), arrivee)
    }

    // puis axe de la forme
    return surAxe(
      this.shapeAt,
      BotEngine.SHAPE_MORPH,
      parForme(this.shapePrev),
      parForme(this.shape)
    )
  }

  get state(): StateId {
    return this.cur
  }

  /**
   * Rien n'est en cours a `now` hors de la vie au repos : ni fondu d'etat, ni morph de forme
   * ou de visage, ni clignement. C'est l'instant ou un bot en pause (`paused` du composant)
   * peut s'arreter sans figer un oeil a moitie ferme ni une pose a mi-chemin. Le regard n'y
   * est pas : c'est le composant qui le pose, et il sait quand il a fini. Lecture pure,
   * comme `sample`.
   */
  quiet(now: number): boolean {
    const morph = STATE_BY_ID.get(this.cur)!.morph
    if (now - this.tCur < morph) return false
    if (now - this.shapeAt < BotEngine.SHAPE_MORPH || now - this.exprAt < BotEngine.SHAPE_MORPH) return false
    if (now - this.blinkAt < FORCED_BLINK) return false
    return this.lookAtTime(now).blink === 0 || liveliness(now).lid >= 1
  }

  /**
   * Repart sur `id` SANS etat precedent, comme un moteur neuf pose sur cet etat.
   *
   * C'est ce que veut dire « rembobiner » pour ce moteur. `setState` seul ne peut pas le
   * faire : il garde l'etat quitte pour le fondre, ce qui est exactement son role en
   * lecture, et exactement ce qu'il ne faut pas quand on revient au debut d'une sequence.
   * Rejouer l'image 0 apres une passe complete melangeait le premier etat avec le DERNIER,
   * et l'export GIF s'ouvrait sur une boule sans yeux — la comete a un `eyeAlpha` nul.
   *
   * `sample` reste une fonction pure du temps : comme `setState`, ceci est un setter DATE,
   * appele par le pilote de la sequence, jamais pendant un echantillonnage.
   */
  reset(id: StateId, now: number) {
    this.cur = id
    this.prev = null
    this.departFige = null
    this.decalageFige = null
    this.tCur = now
    this.tPrev = now
    this.posePhase = 0
    this.previousPosePhase = 0
    this.blinkAt = -10
  }

  /**
   * Origine du fondu en cours : la pose figee s'il y en a une, sinon l'etat quitte evalue
   * a son propre temps ecoule — donc encore en train de s'animer, ce qui est voulu.
   */
  private origine(
    now: number,
    shape: number[] | null,
    expr: BotExpression | null
  ): Pose | null {
    if (this.departFige) return this.departFige
    if (!this.prev) return null
    const prevDef = STATE_BY_ID.get(this.prev)!
    return this.posed(prevDef, Math.max(0, now - this.tPrev + this.previousPosePhase), shape, expr)
  }

  /**
   * Pose composite a l'instant `now`, fondu en cours compris : exactement ce que `sample`
   * melange, avant la couche de vie au repos et de regard. Extraite pour que `setState`
   * puisse la figer.
   */
  private poseComposee(now: number): Pose {
    const def = STATE_BY_ID.get(this.cur)!
    const shape = this.shapeAtTime(now)
    const expr = this.exprAtTime(now)
    const pose = this.posed(def, Math.max(0, now - this.tCur + this.posePhase), shape, expr)
    const since = now - this.tCur
    if (since >= def.morph) return pose
    const origine = this.origine(now, shape, expr)
    if (!origine) return pose
    return blendPose(origine, pose, easings.easeOutQuint(clamp(since / def.morph)))
  }

  /**
   * Decalage des yeux a l'instant `now`, fondu d'etat compris : il suit la MEME courbe que
   * la silhouette qui le motive, depuis le decalage fige s'il y en a un, sinon depuis celui
   * de l'etat quitte.
   */
  private decalageCompose(now: number): { x: number; y: number } {
    const def = STATE_BY_ID.get(this.cur)!
    const decalage = this.decalageAtTime(now, this.cur)
    const since = now - this.tCur
    // `prev` est toujours renseigne avec l'origine du fondu : le test est la pour le typage
    if (since >= def.morph || !this.prev) return decalage
    const avant = this.decalageFige ?? this.decalageAtTime(now, this.prev)
    const ratio = easings.easeOutQuint(clamp(since / def.morph))
    return { x: lerp(avant.x, decalage.x, ratio), y: lerp(avant.y, decalage.y, ratio) }
  }

  /**
   * Changement d'etat, date.
   *
   * Le moteur ne garde qu'UNE case d'historique, donc un changement qui arrive pendant un
   * fondu remplacait l'origine du melange par la pose PLEINE de l'etat qu'on quittait, au
   * lieu de l'image partiellement melangee qui etait a l'ecran. Mesure sur
   * `idle -> wide -> idle` a 100 ms : 35,9 px de saut contre 8,0 px de mouvement normal.
   *
   * On fige donc la pose composite courante et on melange depuis elle. Continu par
   * construction, quel que soit le nombre de changements enchaines.
   *
   * Et SEULEMENT dans ce cas. Figer a chaque changement arreterait net l'animation de
   * l'etat qu'on quitte pendant tout le fondu — le « ! » d'`alert` se figerait en pleine
   * course — alors qu'il n'y a rien a corriger hors morph : l'etat quitte y est deja
   * exactement l'image affichee. La lecture d'un montage, dont les blocs durent au moins
   * le plus long fondu (`MIN_BLOCK`), ne fige donc jamais rien et rend au bit ce qu'elle
   * rendait.
   *
   * `posePhase` avance la pose du nouvel etat sans toucher au fondu : un bot qui entre dans
   * un etat au milieu de son animation (cf. `initialPhase` du composant) morphe depuis
   * l'image a l'ecran, sur la duree normale, vers une pose deja en cours. A 0 — la valeur
   * par defaut — le rendu est celui d'avant, au bit pres.
   */
  setState(id: StateId, now: number, posePhase = 0) {
    if (id === this.cur) return
    const morph = STATE_BY_ID.get(this.cur)!.morph
    const enPleinFondu = this.prev !== null && now - this.tCur < morph
    this.departFige = enPleinFondu ? this.poseComposee(now) : null
    this.decalageFige = enPleinFondu ? this.decalageCompose(now) : null
    this.prev = this.cur
    this.tPrev = this.tCur
    this.previousPosePhase = this.posePhase
    this.posePhase = posePhase
    this.cur = id
    this.tCur = now
    // Dans la video, chaque changement de forme est masque par un clignement.
    if (STATE_BY_ID.get(id)?.blinkIn) this.blinkAt = now
  }

  sample(now: number): BotFrame {
    const R = this.scale
    const def = STATE_BY_ID.get(this.cur)!
    const shape = this.shapeAtTime(now)
    const expr = this.exprAtTime(now)
    let pose = this.posed(def, Math.max(0, now - this.tCur + this.posePhase), shape, expr)
    const decalage = this.decalageCompose(now)

    // --- transition -------------------------------------------------------
    const since = now - this.tCur
    // L'etat precedent n'est jamais purge : `since < def.morph` suffit a
    // l'ignorer une fois le fondu passe, et l'oublier rendrait le moteur non
    // rejouable — relire une date d'avant la fin du fondu ne le retrouverait
    // plus. C'est l'optimisation qui parait innocente et qui casse tout.
    const origine = since < def.morph ? this.origine(now, shape, expr) : null
    if (origine) {
      // Ease-out exponentiel : c'est la courbe mesuree sur la video. Le corps
      // n'a pas d'overshoot (seuls la pastille et l'ouverture des yeux en ont).
      // Le ratio est borne : relire une date ANTERIEURE au changement d'etat
      // donnerait un ratio negatif, que l'ease-out extrapole — la silhouette
      // part alors trente fois trop loin.
      const ratio = easings.easeOutQuint(clamp(since / def.morph))
      pose = blendPose(origine, pose, ratio)
    }

    // --- vie au repos -----------------------------------------------------
    const alive = pose.eyeAlpha > 0.01
    const look = this.lookAtTime(now)
    const life = liveliness(now, { wander: alive ? look.wander : 0, blink: alive })

    const gaze = {
      // Les deux visees REMPLACENT celles de la pose au lieu de s'y ajouter (voir
      // `Look`), et le tour se retranche en chemin. La derive s'ajoute APRES le
      // melange, sinon la cible l'annulerait en meme temps que la pose — or elle
      // doit survivre a une tete tournee sans pointeur.
      yaw: lerp(pose.gaze.yaw, look.yaw, look.mix) + life.dYaw - look.spin,
      pitch: lerp(pose.gaze.pitch, look.pitch, look.mix) + life.dPitch,
      // le roulis, lui, ne suit rien : la tete du bot est penchee de -13deg dans
      // la video, et la faire rouler avec le curseur casse cette signature
      roll: pose.gaze.roll + life.dRoll
    }

    // clignement declenche par le changement d'etat, en plus du calendrier
    const forced = clamp((now - this.blinkAt) / FORCED_BLINK)
    const forcedLid = forced < 1 ? Math.abs(forced * 2 - 1) : 1
    const ferme = Math.min(life.lid, forcedLid)
    // sans `blink`, le calcul d'avant tel quel : `1 - (1 - x)` n'est pas toujours `x` en flottant
    const lid = look.blink === undefined || look.blink === 1 ? ferme : 1 - (1 - ferme) * clamp(look.blink)

    const offX = pose.offX + life.driftX
    const offY = pose.offY + life.driftY

    // --- corps ------------------------------------------------------------
    const sil: Silhouette = {
      ...pose.sil,
      cx: pose.sil.cx + offX,
      cy: pose.sil.cy + offY,
      sy: pose.sil.sy * life.breath
    }
    const bodyPath = closedPath(toPoints(sil, R, this.pts))

    // --- yeux -------------------------------------------------------------
    // Les yeux vivent sur une sphere de rayon 1 ; des que la silhouette n'est
    // plus un cercle, on les ramene au prorata du rayon reel dans leur
    // direction, sinon ils debordent et le masque les coupe.
    const bodyRadius = (x: number, y: number) =>
      radiusAtAngle(pose.sil.radii, Math.atan2(y, x) - pose.sil.rot)

    const eyes: RenderedEye[] = []
    if (pose.eyeAlpha > 0.01) {
      const poses = eyePoses(gaze, R, pose.split)
      for (let i = 0; i < 2; i++) {
        const e = poses[i]!
        if (e.depth <= 0.02) continue
        const cfg = pose.eyes[i]!
        const fit = bodyRadius(e.x, e.y)
        // Inclinaison propre de l'oeil : on compose le repere tangent avec une
        // rotation dans le plan de l'oeil (Basis x Rot). C'est ce qui permet des
        // inclinaisons en miroir entre les deux yeux.
        const phi = ((cfg.tilt ?? 0) * Math.PI) / 180
        const cp = Math.cos(phi)
        const sp = Math.sin(phi)
        const ax = e.a * cp + e.c * sp
        const ay = e.b * cp + e.d * sp
        const cx2 = -e.a * sp + e.c * cp
        const cy2 = -e.b * sp + e.d * cp
        // Le clignement s'applique APRES tout ca : c'est un ecrasement vertical
        // a l'ecran, pas le long de l'axe de la gelule.
        const k = blinkScale(Math.min(lid, cfg.open))
        eyes.push({
          d: capsulePath(cfg.w * R, cfg.h * R),
          w: cfg.w * R,
          h: cfg.h * R,
          matrix: `matrix(${r2(ax)},${r2(ay * k)},${r2(cx2)},${r2(cy2 * k)},${r2(e.x * fit + (offX + decalage.x) * R)},${r2(e.y * fit + (offY + decalage.y) * R)})`,
          open: k,
          rest: blinkScale(cfg.open),
          tilt: cfg.tilt ?? 0,
          alpha: pose.eyeAlpha * clamp(e.depth / 0.12)
        })
      }
    }

    // --- decor ------------------------------------------------------------
    const dots = pose.dots
      .filter((p) => p.opacity > 0.01 && p.r > 0.0005)
      .map((p) => ({ ...p, x: (p.x + offX) * R, y: (p.y + offY) * R, r: p.r * R }))

    // la pastille est posee sur le contour : elle suit donc la forme aussi
    const nFit = pose.notif ? bodyRadius(pose.notif.x, pose.notif.y) : 1
    const nx = pose.notif ? (pose.notif.x * nFit + offX) * R : 0
    const ny = pose.notif ? (pose.notif.y * nFit + offY) * R : 0
    const notif = pose.notif ? { x: nx, y: ny, r: pose.notif.r * R } : null
    const notch = pose.notif ? { x: nx, y: ny, r: pose.notif.notch * R } : null

    return {
      bodyPath,
      bodyAlpha: pose.bodyAlpha,
      eyes,
      dots,
      dotsBehind: pose.dotsBehind,
      // Les etats declarent des arcs en unites de rayon de boule ; le moteur
      // est le seul a connaitre l'echelle du viewBox, donc c'est lui qui trace.
      arcs: pose.arcs
        .filter((a) => a.opacity > 0.01)
        .map((a) => arcRender(a.seed, a.t, R, a.id, a.opacity)),
      notif,
      notch
    }
  }
}
