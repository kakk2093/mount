import * as THREE from 'three';
import { part, type GeometryBatch } from './GeometryBatch.js';
import type { Rng } from '../../utils/random.js';
import type { Colliders } from '../../physics/Colliders.js';

/**
 * Голая ветка: тонкий конус от точки на стволе (высота h) под углом tilt от вертикали, повёрнутый на yaw.
 * Собирается один раз, как и остальные детали.
 */
function branch(h: number, len: number, tilt: number, yaw: number, radius = 0.06): THREE.BufferGeometry {
	const geo = new THREE.CylinderGeometry(radius * 0.4, radius, len, 4).translate(0, len / 2, 0).rotateZ(tilt).rotateY(yaw);
	return part(geo, 0, h);
}

/**
 * Снежная «шапка» яруса хвои: такой же конус, как ярус, только короче и чуть шире — лежит на его верхушке.
 * @param radius радиус основания яруса, height — его высота, top — высота верхушки, capHeight — высота шапки
 */
function snowCap(radius: number, height: number, top: number, capHeight: number): THREE.BufferGeometry {
	const r = ((radius * capHeight) / height) * 1.06;
	return part(new THREE.ConeGeometry(r, capHeight, 7), 0, top + 0.04 - capHeight / 2);
}

/** Детали пропсов: создаются один раз, общие для всех чанков. Основание каждой детали — на y = 0. */
const G = {
	stalk: part(new THREE.ConeGeometry(0.05, 0.6, 3, 1, true), 0, 0.3),

	spruceTrunk: part(new THREE.CylinderGeometry(0.18, 0.28, 1.6, 6), 0, 0.8),
	spruceLower: part(new THREE.ConeGeometry(1.5, 2.4, 7), 0, 2.6),
	spruceUpper: part(new THREE.ConeGeometry(1.0, 2.0, 7), 0, 4.0),
	spruceLowerSnow: snowCap(1.5, 2.4, 3.8, 1.3),
	spruceUpperSnow: snowCap(1.0, 2.0, 5.0, 1.0),

	pineTrunk: part(new THREE.CylinderGeometry(0.14, 0.22, 3.6, 6), 0, 1.8),
	pineCrown1: part(new THREE.ConeGeometry(1.2, 1.8, 6), 0, 3.9),
	pineCrown2: part(new THREE.ConeGeometry(0.9, 1.5, 6), 0, 4.9),
	pineCrown3: part(new THREE.ConeGeometry(0.55, 1.2, 6), 0, 5.8),
	pineSnow1: snowCap(1.2, 1.8, 4.8, 0.8),
	pineSnow2: snowCap(0.9, 1.5, 5.65, 0.7),
	pineSnow3: snowCap(0.55, 1.2, 6.4, 0.6),

	// Голое дерево (вместо летнего дуба): толстый ствол и раскидистые ветки.
	bareTrunk: part(new THREE.CylinderGeometry(0.16, 0.32, 3.2, 6), 0, 1.6),
	bareBranches: [
		branch(2.0, 1.8, 0.8, 0.3, 0.1),
		branch(2.3, 1.6, 0.7, 2.4, 0.09),
		branch(2.7, 1.5, 0.6, 4.3, 0.08),
		branch(3.0, 1.3, 0.35, 1.3, 0.07),
		branch(3.1, 1.2, 0.45, 3.5, 0.06),
		branch(3.1, 1.0, 0.1, 5.5, 0.06),
	],

	birchTrunk: part(new THREE.CylinderGeometry(0.11, 0.15, 3.4, 6), 0, 1.7),
	birchBand: part(new THREE.CylinderGeometry(0.155, 0.155, 0.1, 6), 0, 0.05),
	// Берёза зимой — тонкие ветки кверху.
	birchBranches: [
		branch(2.2, 1.2, 0.5, 0.5, 0.05),
		branch(2.6, 1.1, 0.45, 2.6, 0.05),
		branch(2.9, 1.0, 0.4, 4.6, 0.04),
		branch(3.2, 0.9, 0.2, 1.6, 0.04),
	],

	bush: part(new THREE.IcosahedronGeometry(0.7, 0).scale(1, 0.75, 1), 0, 0.4),
	bushSide: part(new THREE.IcosahedronGeometry(0.5, 0).scale(1, 0.8, 1), 0.55, 0.3, 0.2),
	bushSnow: part(new THREE.IcosahedronGeometry(0.66, 0).scale(1, 0.4, 1), 0, 0.62),
	berry: part(new THREE.OctahedronGeometry(0.07, 0)),

	rock: part(new THREE.DodecahedronGeometry(0.5, 0)),
	stump: part(new THREE.CylinderGeometry(0.3, 0.4, 0.45, 7), 0, 0.2),
	stumpSnow: part(new THREE.CylinderGeometry(0.32, 0.32, 0.1, 7), 0, 0.46),
	log: part(new THREE.CylinderGeometry(0.24, 0.26, 3, 7).rotateZ(Math.PI / 2), 0, 0.2),
	logSnow: part(new THREE.BoxGeometry(2.9, 0.1, 0.32), 0, 0.46),
	// Сугроб: приплюснутый многогранник, наполовину в земле.
	drift: part(new THREE.IcosahedronGeometry(1, 1).scale(2.2, 0.55, 1.4)),

	pole: part(new THREE.CylinderGeometry(0.09, 0.12, 6, 5), 0, 3),
	poleBar: part(new THREE.BoxGeometry(1.3, 0.08, 0.08), 0, 5.6),
	poleBarSnow: part(new THREE.BoxGeometry(1.3, 0.05, 0.1), 0, 5.665),
	poleSnow: part(new THREE.CylinderGeometry(0.1, 0.1, 0.08, 5), 0, 6.02),
	fencePost: part(new THREE.BoxGeometry(0.1, 1.0, 0.1), 0, 0.45),
	fencePostSnow: part(new THREE.BoxGeometry(0.13, 0.06, 0.13), 0, 0.98),
	fenceRail: part(new THREE.BoxGeometry(1, 0.07, 0.04)),
	fenceRailSnow: part(new THREE.BoxGeometry(1, 0.04, 0.07), 0, 0.055),
};

const hsl = (h: number, s: number, l: number) => new THREE.Color().setHSL(h, s, l);
/** Снег — не чисто белый: на полном солнце иначе сливается в пятно. */
const SNOW = new THREE.Color(0xe4ebf2);
const BIRCH_WHITE = new THREE.Color(0xd8d4c8);
const BIRCH_DARK = new THREE.Color(0x2e2a26);
const WOOD = new THREE.Color(0x5e4430);
const WOOD_GREY = new THREE.Color(0x645a52);
const BARE_WOOD = new THREE.Color(0x4a3e36);

const _m = new THREE.Matrix4();
const _local = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);

/** Куда складывать детали: крупное (отбрасывает тень) и мелочь (только принимает). */
export interface PropTarget {
	solid: GeometryBatch;
	small: GeometryBatch;
	colliders: Colliders;
	rng: Rng;
}

/** Матрица «стоит в точке, повернут по Y, масштаб s × sy». */
function place(x: number, y: number, z: number, yaw: number, s: number, sy = s): THREE.Matrix4 {
	_q.setFromAxisAngle(UP, yaw);
	return _m.compose(_p.set(x, y, z), _q, _s.set(s, sy, s));
}

export type TreeKind = 'spruce' | 'pine' | 'bare' | 'birch';

/** Дерево; ствол регистрируется в коллайдерах. Хвойные — со снежными шапками на ярусах, лиственные — голые. */
export function addTree(t: PropTarget, kind: TreeKind, x: number, y: number, z: number): void {
	const { rng, solid } = t;
	const s = 0.75 + rng() * 0.7;
	const m = place(x, y - 0.25, z, rng() * Math.PI * 2, s, s * (0.9 + rng() * 0.35));
	switch (kind) {
		case 'spruce': {
			const green = hsl(0.36 + rng() * 0.05, 0.35, 0.16 + rng() * 0.06);
			solid.add(G.spruceTrunk, m, WOOD);
			solid.add(G.spruceLower, m, green);
			solid.add(G.spruceUpper, m, green.offsetHSL(0, 0, 0.04));
			solid.add(G.spruceLowerSnow, m, SNOW, 0.08);
			solid.add(G.spruceUpperSnow, m, SNOW, 0.08);
			t.colliders.add(x, z, 0.35 * s);
			break;
		}
		case 'pine': {
			const green = hsl(0.32 + rng() * 0.05, 0.3, 0.18 + rng() * 0.05);
			solid.add(G.pineTrunk, m, _c.set(0x7a5038));
			solid.add(G.pineCrown1, m, green);
			solid.add(G.pineCrown2, m, green.offsetHSL(0, 0, 0.03));
			solid.add(G.pineCrown3, m, green.offsetHSL(0, 0, 0.03));
			solid.add(G.pineSnow1, m, SNOW, 0.08);
			solid.add(G.pineSnow2, m, SNOW, 0.08);
			solid.add(G.pineSnow3, m, SNOW, 0.08);
			t.colliders.add(x, z, 0.3 * s);
			break;
		}
		case 'bare': {
			const wood = _c.copy(BARE_WOOD).multiplyScalar(0.85 + rng() * 0.3);
			solid.add(G.bareTrunk, m, wood);
			for (const b of G.bareBranches) if (rng() < 0.85) solid.add(b, m, wood, 0.1);
			t.colliders.add(x, z, 0.35 * s);
			break;
		}
		case 'birch': {
			solid.add(G.birchTrunk, m, BIRCH_WHITE, 0.05);
			// Тёмные «пятна» коры — тонкие кольца на случайной высоте.
			for (let i = 0; i < 4; i++) {
				_local.makeTranslation(0, 0.4 + rng() * 2.6, 0);
				solid.add(G.birchBand, _local.premultiply(m), BIRCH_DARK, 0);
			}
			for (const b of G.birchBranches) solid.add(b, m, BARE_WOOD, 0.1);
			t.colliders.add(x, z, 0.25 * s);
			break;
		}
	}
}

/** Куст под снегом, иногда с ягодами рябины. Сквозь кусты можно пройти — без коллайдера. */
export function addBush(t: PropTarget, x: number, y: number, z: number): void {
	const { rng } = t;
	const s = 0.6 + rng() * 0.8;
	const yaw = rng() * Math.PI * 2;
	const m = place(x, y - 0.1, z, yaw, s, s * (0.8 + rng() * 0.4));
	const twigs = hsl(0.08 + rng() * 0.05, 0.2, 0.2 + rng() * 0.06);
	t.solid.add(G.bush, m, twigs, 0.2);
	if (rng() < 0.6) t.solid.add(G.bushSide, m, twigs.offsetHSL(0, 0, 0.03), 0.2);
	t.solid.add(G.bushSnow, m, SNOW, 0.08);

	if (rng() < 0.3) {
		const count = 4 + Math.floor(rng() * 6);
		for (let i = 0; i < count; i++) {
			// Точка на боку купола куста (сверху — снег).
			const a = rng() * Math.PI * 2;
			const h = 0.1 + rng() * 0.4;
			const r = 0.62 * Math.sqrt(1 - h * h);
			_local.makeTranslation(Math.cos(a) * r, 0.4 + h * 0.5, Math.sin(a) * r);
			t.small.add(G.berry, _local.premultiply(place(x, y - 0.1, z, yaw, s)), _c.set(0xd02a24), 0);
		}
	}
}

/** Сухие травинки, торчащие из снега. */
export function addStalks(t: PropTarget, x: number, y: number, z: number): void {
	const { rng } = t;
	const count = 2 + Math.floor(rng() * 3);
	for (let i = 0; i < count; i++) {
		const s = 0.6 + rng() * 0.8;
		_q.setFromEuler(_e.set((rng() - 0.5) * 0.5, rng() * Math.PI * 2, (rng() - 0.5) * 0.5));
		_m.compose(_p.set(x + (rng() - 0.5) * 0.3, y - 0.05, z + (rng() - 0.5) * 0.3), _q, _s.set(s, s * (0.7 + rng() * 0.6), s));
		t.small.add(G.stalk, _m, hsl(0.1 + rng() * 0.04, 0.35, 0.45 + rng() * 0.12), 0);
	}
}

/** Камень со снегом сверху. */
export function addRock(t: PropTarget, x: number, y: number, z: number): void {
	const { rng } = t;
	const s = 0.3 + rng() * rng() * 1.6;
	const sy = s * (0.5 + rng() * 0.4);
	_q.setFromEuler(_e.set(rng() * 3, rng() * 3, rng() * 3));
	_m.compose(_p.set(x, y + s * 0.1, z), _q, _s.set(s * (0.8 + rng() * 0.6), sy, s * (0.8 + rng() * 0.6)));
	t.solid.add(G.rock, _m, hsl(0.6, 0.04, 0.36 + rng() * 0.1), 0.2);
	// Шапка — приплюснутый такой же многогранник, без наклона: снег лежит горизонтально.
	t.solid.add(G.rock, place(x, y + s * 0.1 + sy * 0.3, z, rng() * 6, s * 0.8, sy * 0.35), SNOW, 0.08);
	if (s > 0.6) t.colliders.add(x, z, s * 0.5);
}

/** Скала-останец: груда крупных камней (несколько метров), снег — шапками сверху. Заметный ориентир на склоне. */
export function addCrag(t: PropTarget, x: number, y: number, z: number, size = 1): void {
	const { rng } = t;
	const count = 3 + Math.floor(rng() * 4);
	for (let i = 0; i < count; i++) {
		const s = (1.5 + rng() * 2.5) * size * (i === 0 ? 1.4 : 1);
		const a = rng() * Math.PI * 2;
		const d = i === 0 ? 0 : (1 + rng() * 2.2) * size;
		const px = x + Math.cos(a) * d;
		const pz = z + Math.sin(a) * d;
		const sy = s * (0.8 + rng() * 0.9);
		_q.setFromEuler(_e.set(rng() * 0.6, rng() * 6, rng() * 0.6));
		_m.compose(_p.set(px, y + sy * 0.25, pz), _q, _s.set(s * (0.7 + rng() * 0.5), sy, s * (0.7 + rng() * 0.5)));
		t.solid.add(G.rock, _m, hsl(0.6, 0.05, 0.28 + rng() * 0.1), 0.25);
		t.solid.add(G.rock, place(px, y + sy * 0.25 + sy * 0.32, pz, rng() * 6, s * 0.55, sy * 0.25), SNOW, 0.08);
		t.colliders.add(px, pz, s * 0.45);
	}
}

export function addStump(t: PropTarget, x: number, y: number, z: number): void {
	const s = 0.8 + t.rng() * 0.6;
	const m = place(x, y - 0.05, z, t.rng() * 6, s);
	t.solid.add(G.stump, m, WOOD);
	t.solid.add(G.stumpSnow, m, SNOW, 0.05);
	t.colliders.add(x, z, 0.4 * s);
}

/** Поваленное бревно под снегом: коллайдер — три круга вдоль ствола. */
export function addLog(t: PropTarget, x: number, y: number, z: number): void {
	const yaw = t.rng() * Math.PI;
	const m = place(x, y - 0.05, z, yaw, 1);
	t.solid.add(G.log, m, WOOD_GREY);
	t.solid.add(G.logSnow, m, SNOW, 0.05);
	for (const k of [-1.1, 0, 1.1]) t.colliders.add(x + Math.cos(yaw) * k, z - Math.sin(yaw) * k, 0.3);
}

/** Сугроб. Мягкий — без коллайдера: машина и пешеход проходят сквозь. */
export function addDrift(t: PropTarget, x: number, y: number, z: number): void {
	const { rng } = t;
	const s = 0.6 + rng() * 0.8;
	t.small.add(G.drift, place(x, y - 0.15, z, rng() * Math.PI, s, s * (0.7 + rng() * 0.6)), SNOW, 0.06);
}

/** Деревянный столб вдоль дороги; yaw — перекладина поперёк дороги. */
export function addPole(t: PropTarget, x: number, y: number, z: number, yaw: number): void {
	const m = place(x, y - 0.2, z, yaw, 1);
	t.solid.add(G.pole, m, WOOD_GREY);
	t.solid.add(G.poleBar, m, WOOD_GREY);
	t.solid.add(G.poleBarSnow, m, SNOW, 0);
	t.solid.add(G.poleSnow, m, SNOW, 0);
	t.colliders.add(x, z, 0.2);
}

/** Пролёт забора между двумя точками (столб в начале, две жерди); снег — на столбе и верхней жерди. */
export function addFenceSpan(t: PropTarget, ax: number, ay: number, az: number, bx: number, by: number, bz: number): void {
	const len = Math.hypot(bx - ax, bz - az);
	const yaw = Math.atan2(-(bz - az), bx - ax);
	const tilt = Math.atan2(by - ay, len);
	const post = place(ax, ay - 0.1, az, 0, 1);
	t.solid.add(G.fencePost, post, WOOD);
	t.solid.add(G.fencePostSnow, post, SNOW, 0);
	t.colliders.add(ax, az, 0.15);
	for (const h of [0.35, 0.75]) {
		_q.setFromEuler(_e.set(0, yaw, tilt, 'YXZ'));
		_m.compose(_p.set((ax + bx) / 2, (ay + by) / 2 + h - 0.1, (az + bz) / 2), _q, _s.set(len, 1, 1));
		t.solid.add(G.fenceRail, _m, WOOD);
		if (h > 0.5) t.solid.add(G.fenceRailSnow, _m, SNOW, 0);
	}
}
